import { Context, Service, Session } from 'koishi'
import type { UserToken } from '../database'
import { decryptStored } from '../utils/crypto-utils'

export const name = 'chunithm-query'

// DivingFish API endpoints
const DF_BASE = 'https://www.diving-fish.com/api/chunithmprober'
const DF_QUERY_PLAYER = `${DF_BASE}/query/player`
const DF_TEST_DATA = `${DF_BASE}/player/test_data`
const DF_PLAYER_RECORDS = `${DF_BASE}/player/records`
const DF_LOGIN = 'https://www.diving-fish.com/api/maimaidxprober/login' // Using same login endpoint as Maimai

// lxns API endpoints
const LXNS_BASE = 'https://maimai.lxns.net/api/v0/chunithm'
const LXNS_PLAYER_BESTS = (friendCode: number) => `${LXNS_BASE}/player/${friendCode}/bests`
const LXNS_USER_RECORDS = 'https://maimai.lxns.net/api/v0/user/chunithm/player/records'

export interface ChunithmScore {
    id?: number
    cid?: number
    mid?: number
    title: string
    level: string
    level_index: number
    score: number
    fc?: string  // 'fullcombo', 'alljustice', 'alljusticecritical'
    clear?: string
    ds: number  // chart constant
    ra: number  // rating value
    rate?: string
}

export interface ChunithmB50Data {
    nickname: string
    rating: number
    username?: string
    records?: {
        b30: ChunithmScore[]
        n20: ChunithmScore[]
        r10?: ChunithmScore[]  // Empty in newer versions
        best?: ChunithmScore[]
    }
    // lxns structure
    bests?: ChunithmScore[]
    new_bests?: ChunithmScore[]
    selections?: ChunithmScore[]
}

interface ChunithmQueryConfig {
    divingfishDevToken?: string
    lxnsDevToken?: string
    authToken?: string
    debug?: boolean
}

/**
 * Chunithm Rating calculation
 * Rating = constant + bonus based on score
 */
function calculateRating(constant: number, score: number): number {
    let bonus: number

    if (score >= 1009000) {
        // AJC: +2.15
        bonus = 2.15
    } else if (score >= 1007500) {
        // AJ: +2.0 to +2.15
        bonus = 2.0 + (score - 1007500) / 1500 * 0.15
    } else if (score >= 1005000) {
        // FC: +1.5 to +2.0  
        bonus = 1.5 + (score - 1005000) / 2500 * 0.5
    } else if (score >= 1000000) {
        // SSS+: +1.0 to +1.5
        bonus = 1.0 + (score - 1000000) / 5000 * 0.5
    } else if (score >= 975000) {
        // SSS: +0 to +1.0
        bonus = (score - 975000) / 25000 * 1.0
    } else if (score >= 950000) {
        // SS+~SS: -1.5 to 0
        bonus = -1.5 + (score - 950000) / 25000 * 1.5
    } else if (score >= 925000) {
        // S+~S: -3.0 to -1.5
        bonus = -3.0 + (score - 925000) / 25000 * 1.5
    } else if (score >= 900000) {
        // AAA: -5.0 to -3.0
        bonus = -5.0 + (score - 900000) / 25000 * 2.0
    } else {
        // Below AAA
        bonus = -(100 - score / 10000) * 0.5
    }

    const rating = constant + bonus
    return Math.max(0, Math.floor(rating * 100) / 100)  // Round to 2 decimal places
}

/**
 * Get rate label from score
 */
function getRate(score: number): string {
    if (score >= 1009000) return 'sssp'  // Actually AJC tier
    if (score >= 1000000) return 'sssp'
    if (score >= 975000) return 'sss'
    if (score >= 950000) return 'ssp'
    if (score >= 925000) return 'ss'
    if (score >= 900000) return 'sp'
    if (score >= 800000) return 's'
    if (score >= 700000) return 'aaa'
    if (score >= 600000) return 'aa'
    if (score >= 500000) return 'a'
    return 'd'
}

declare module 'koishi' {
    interface Context {
        chunithmQuery: ChunithmQuery
    }
}



export class ChunithmQuery extends Service {
    private queryConfig: ChunithmQueryConfig = {}
    private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

    constructor(ctx: Context, config?: ChunithmQueryConfig) {
        super(ctx, 'chunithmQuery')
        if (config) {
            this.queryConfig = config
            if (config.debug) {
                this.ctx.logger('chunithm-query').info('[DEBUG] chunithm-query 调试模式启用')
            }
        }
    }

    private logDebug(...args: any[]) {
        if (this.queryConfig.debug) {
            this.ctx.logger('chunithm-query').info('[DEBUG]', ...args)
        }
    }

    /**
     * Get test data from DivingFish
     */
    async getTestData(): Promise<ChunithmB50Data | null> {
        try {
            const data = await this.ctx.http.get<ChunithmB50Data>(DF_TEST_DATA, {
                headers: { 'User-Agent': this.UA },
                timeout: 15000
            })
            return this.normalizeData(data)
        } catch (e) {
            this.logger.error('Failed to fetch test data:', e)
            return null
        }
    }

    /**
     * Query B50 with auth priority
     */
    async getB50(session: Session, username?: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        const platform = session.platform
        const userId = session.userId

        let qq: string | undefined
        if (platform === 'onebot' || platform === 'qq') {
            qq = userId
        }

        // Retrieve User Token and Preference
        let userToken: UserToken | null = null
        if (userId) {
            userToken = await this.getUserToken(platform, userId)
        }

        const preferredMode = userToken?.preferred_mode

        // --- DivingFish Logic ---
        const tryDivingFish = async () => {
            // 1. Dev Token
            if (this.queryConfig.divingfishDevToken) {
                const res = await this.queryWithDevToken(username, qq)
                if (res.data) return res
            }

            // 2. User Import Token
            if (userToken?.chunithm_token) {
                const res = await this.queryWithImportToken(userToken.chunithm_token)
                if (res.data) return res
            }

            // 3. User Credentials
            if (userToken?.fish_encrypted_creds && this.queryConfig.authToken) {
                const res = await this.queryWithFishCredentials(userToken.fish_encrypted_creds)
                if (res.data) return res
            }

            // 4. Public Query
            if (qq || username) {
                return this.queryPublic(username, qq)
            }

            return { data: null, error: 'DivingFish: 无法确定查询目标' }
        }

        // --- LXNS Logic ---
        const tryLxns = async () => {
            // 1. Dev Token - lookup by friend_code or QQ
            if (this.queryConfig.lxnsDevToken) {
                const friendCode = userToken?.lxns_friend_code
                if (friendCode) {
                    const res = await this.queryWithLxnsDevToken(friendCode)
                    if (res.data) return res
                } else if (qq) {
                    // Try to resolve QQ → friend_code via lxns API
                    const res = await this.queryWithLxnsDevTokenByQQ(qq)
                    if (res.data) return res
                }
            }

            // 2. User Token
            if (userToken?.lxns_token) {
                const res = await this.queryWithLxnsToken(userToken.lxns_token)
                if (res.data) return res
                if (res.error) return res
            }

            // 3. Public LXNS API (fallback) - if user explicitly chose LXNS and has QQ
            if (qq) {
                const res = await this.queryPublicLxnsByQQ(qq)
                if (res.data) return res
            }

            return { data: null, error: 'LXNS: 无法确定查询目标' }
        }

        // --- Selection Logic ---

        if (preferredMode === 'fish') {
            return await tryDivingFish()
        }

        if (preferredMode === 'lxns') {
            return await tryLxns()
        }

        // Auto Mode (Default)

        // 1. Fish Dev
        if (this.queryConfig.divingfishDevToken) {
            const res = await this.queryWithDevToken(username, qq)
            if (res.data) return res
        }

        // 2. Fish Token
        if (userToken?.chunithm_token) {
            const res = await this.queryWithImportToken(userToken.chunithm_token)
            if (res.data) return res
        }

        // 3. Fish Creds
        if (userToken?.fish_encrypted_creds && this.queryConfig.authToken) {
            const res = await this.queryWithFishCredentials(userToken.fish_encrypted_creds)
            if (res.data) return res
        }

        // 4. LXNS Token
        if (userToken?.lxns_token) {
            const res = await this.queryWithLxnsToken(userToken.lxns_token)
            if (res.data) return res
        }

        // 5. Public (DivingFish + LXNS QQ fallback)
        if (qq || username) {
            const res = await this.queryPublic(username, qq)
            if (res.data) return res
            // If DivingFish public failed and we have QQ, try LXNS public
            if (qq && !username) {
                return this.queryPublicLxnsByQQ(qq)
            }
            return res
        }

        return { data: null, error: '无法确定查询目标，请提供用户名或绑定QQ' }
    }

    /**
     * Get AJ50 (All Justice 50) - filtered from records
     */
    async getAJ50(session: Session, username?: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        const result = await this.getB50(session, username)
        if (!result.data?.records) return result

        const filterAJ = (scores: ChunithmScore[]) =>
            scores.filter(s => s.fc === 'alljustice' || s.fc === 'alljusticecritical')

        result.data.records.b30 = filterAJ(result.data.records.b30).slice(0, 30)
        result.data.records.n20 = filterAJ(result.data.records.n20).slice(0, 20)

        return result
    }

    /**
     * Get FC50 (Full Combo 50)
     */
    async getFC50(session: Session, username?: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        const result = await this.getB50(session, username)
        if (!result.data?.records) return result

        const filterFC = (scores: ChunithmScore[]) =>
            scores.filter(s => ['fullcombo', 'alljustice', 'alljusticecritical'].includes(s.fc || ''))

        result.data.records.b30 = filterFC(result.data.records.b30).slice(0, 30)
        result.data.records.n20 = filterFC(result.data.records.n20).slice(0, 20)

        return result
    }

    private async queryWithDevToken(username?: string, qq?: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        try {
            const params = new URLSearchParams()
            if (username) params.set('username', username)
            else if (qq) params.set('qq', qq)

            const url = `${DF_PLAYER_RECORDS}?${params}`
            const data = await this.ctx.http.get<ChunithmB50Data>(url, {
                headers: {
                    'User-Agent': this.UA,
                    'Developer-Token': this.queryConfig.divingfishDevToken!
                },
                timeout: 15000
            })
            return { data: this.normalizeData(data) }
        } catch (e: any) {
            return { data: null, error: e.response?.data?.message || '开发者令牌查询失败' }
        }
    }

    private async queryWithImportToken(token: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        try {
            const data = await this.ctx.http.get<ChunithmB50Data>(DF_PLAYER_RECORDS, {
                headers: {
                    'User-Agent': this.UA,
                    'Import-Token': token
                },
                timeout: 15000
            })
            return { data: this.normalizeData(data) }
        } catch (e: any) {
            return { data: null, error: e.response?.data?.message || 'Import Token 无效' }
        }
    }

    private async queryWithFishCredentials(encryptedCreds: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        if (!this.queryConfig.authToken) return { data: null, error: 'AuthToken not configured' }

        const creds = decryptStored(encryptedCreds, this.queryConfig.authToken)
        if (!creds) return { data: null, error: 'Credentials decryption failed' }

        try {
            const loginRes = await this.ctx.http.post(DF_LOGIN, {
                username: creds.username,
                password: creds.password
            }, {
                headers: {
                    'User-Agent': this.UA,
                    'Content-Type': 'application/json'
                }
            })

            if (loginRes && (loginRes as any).jwt_token) {
                return this.queryWithImportToken((loginRes as any).jwt_token)
            } else if (loginRes && (loginRes as any).token) {
                return this.queryWithImportToken((loginRes as any).token)
            }

            return { data: null, error: 'Login successful but no token received' }

        } catch (e) {
            return { data: null, error: 'Login failed' }
        }
    }

    private async queryWithLxnsToken(token: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        try {
            const authHeaders = {
                'User-Agent': this.UA,
                'Authorization': token
            }

            // Fetch records + player info in parallel
            const [recordsResp, playerResp] = await Promise.all([
                this.ctx.http.get<any>(LXNS_USER_RECORDS, { headers: authHeaders, timeout: 15000 }),
                this.ctx.http.get<any>('https://maimai.lxns.net/api/v0/user/chunithm/player', { headers: authHeaders, timeout: 10000 }).catch(() => null)
            ])

            const normalized = this.normalizeData(recordsResp)

            // Merge player info
            const playerInfo = playerResp?.data || playerResp
            if (playerInfo) {
                normalized.nickname = normalized.nickname || playerInfo.name
                normalized.rating = normalized.rating || playerInfo.rating
                if (playerInfo.character?.id) {
                    ;(normalized as any).avatar_url = `https://assets2.lxns.net/chunithm/character/${playerInfo.character.id}.png`
                }
            }

            return { data: normalized }
        } catch (e: any) {
            return { data: null, error: 'LXNS Token query failed' }
        }
    }

    private async queryWithLxnsDevToken(friendCode: number): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        try {
            const authHeaders = {
                'User-Agent': this.UA,
                'Authorization': this.queryConfig.lxnsDevToken!
            }

            // Fetch bests + player info in parallel
            const [bestsResp, playerResp] = await Promise.all([
                this.ctx.http.get<any>(LXNS_PLAYER_BESTS(friendCode), { headers: authHeaders, timeout: 15000 }),
                this.ctx.http.get<any>(`${LXNS_BASE}/player/${friendCode}`, { headers: authHeaders, timeout: 10000 }).catch(() => null)
            ])

            const normalized = this.normalizeData(bestsResp)

            // Merge player info
            const playerInfo = playerResp?.data || playerResp
            if (playerInfo) {
                normalized.nickname = normalized.nickname || playerInfo.name
                normalized.rating = normalized.rating || playerInfo.rating
                if (playerInfo.character?.id) {
                    ;(normalized as any).avatar_url = `https://assets2.lxns.net/chunithm/character/${playerInfo.character.id}.png`
                }
            }

            return { data: normalized }
        } catch (e: any) {
            return { data: null, error: e.response?.data?.message || 'LXNS Dev Token 查询失败' }
        }
    }

    private async queryWithLxnsDevTokenByQQ(qq: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        try {
            // Step 1: Resolve QQ → friend_code via lxns player API
            const playerUrl = `${LXNS_BASE}/player/qq/${qq}`
            const playerData = await this.ctx.http.get<any>(playerUrl, {
                headers: {
                    'User-Agent': this.UA,
                    'Authorization': this.queryConfig.lxnsDevToken!
                },
                timeout: 15000
            })

            const friendCode = playerData?.data?.friend_code || playerData?.friend_code
            if (!friendCode) {
                return { data: null, error: 'LXNS: 未找到该 QQ 对应的玩家' }
            }

            // Step 2: Query bests with friend_code
            return this.queryWithLxnsDevToken(friendCode)
        } catch (e: any) {
            return { data: null, error: e.response?.data?.message || 'LXNS: QQ 查询失败' }
        }
    }

    private async queryPublic(username?: string, qq?: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        try {
            const body: Record<string, string> = {}
            if (username) body.username = username
            else if (qq) body.qq = qq

            const data = await this.ctx.http.post<ChunithmB50Data>(DF_QUERY_PLAYER, body, {
                headers: {
                    'User-Agent': this.UA,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            })
            return { data: this.normalizeData(data) }
        } catch (e: any) {
            const msg = e.response?.data?.message
            if (msg?.includes('隐私')) {
                return { data: null, error: '该用户已设置隐私或未同意用户协议' }
            }
            return { data: null, error: msg || '查询失败' }
        }
    }

    private async queryPublicLxnsByQQ(qq: string): Promise<{
        data: ChunithmB50Data | null
        error?: string
    }> {
        try {
            // Resolve QQ → friend_code via lxns public API (no auth needed)
            const playerUrl = `${LXNS_BASE}/player/qq/${qq}`
            const playerData = await this.ctx.http.get<any>(playerUrl, {
                headers: {
                    'User-Agent': this.UA
                },
                timeout: 15000
            })

            const friendCode = playerData?.data?.friend_code || playerData?.friend_code
            if (!friendCode) {
                return { data: null, error: 'LXNS: 未找到该 QQ 对应的玩家' }
            }

            // Query bests with friend_code via public API
            const bestsUrl = LXNS_PLAYER_BESTS(friendCode)
            const bestsResp = await this.ctx.http.get<any>(bestsUrl, {
                headers: {
                    'User-Agent': this.UA
                },
                timeout: 15000
            })

            // Get player info for name and rating
            const playerInfoUrl = `${LXNS_BASE}/player/${friendCode}`
            const playerInfoResp = await this.ctx.http.get<any>(playerInfoUrl, {
                headers: {
                    'User-Agent': this.UA
                },
                timeout: 10000
            }).catch(() => null)

            const normalized = this.normalizeData(bestsResp)

            // Merge player info
            const playerInfo = playerInfoResp?.data || playerInfoResp
            if (playerInfo) {
                normalized.nickname = normalized.nickname || playerInfo.name
                normalized.rating = normalized.rating || playerInfo.rating
                if (playerInfo.icon?.id) {
                    ;(normalized as any).avatar_url = `https://assets2.lxns.net/chunithm/icon/${playerInfo.icon.id}.png`
                }
            }

            return { data: normalized }
        } catch (e: any) {
            return { data: null, error: e.response?.data?.message || 'LXNS: QQ 查询失败' }
        }
    }

    private async getUserToken(platform: string, userId: string): Promise<UserToken | null> {
        const results = await this.ctx.database.get('user_token', {
            platform,
            user_id: userId
        })
        return results[0] || null
    }

    private normalizeData(raw: any): ChunithmB50Data {
        // Unwrap LXNS response envelope: { success, code, data: {...} }
        const data = (raw?.success !== undefined || raw?.code !== undefined) && raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
            ? raw.data
            : raw

        // Already has records (DivingFish format)
        if (data.records?.b30) {
            return data
        }

        // LXNS bests format: { bests, selections, new_bests }
        // Normalize LXNS score fields to match DivingFish conventions
        const normalizeLxnsScore = (s: any) => ({
            ...s,
            mid: s.id,
            title: s.song_name || s.title,
            ra: s.rating ?? s.ra ?? 0,
            ds: s.level_value ?? s.ds,
            fc: s.full_combo || s.fc,
            rate: s.rank || s.rate,
        })

        const b30 = (data.bests || []).map(normalizeLxnsScore)
        const n20 = (data.new_bests || []).map(normalizeLxnsScore)
        const r10 = (data.selections || []).map(normalizeLxnsScore)

        return {
            ...data,
            nickname: data.name || data.nickname,
            records: { b30, n20, r10 }
        }
    }

    /**
     * Calculate score breakdown for target score
     */
    calculateScoreBreakdown(
        totalNotes: number,
        targetScore: number
    ): {
        maxJustice: number
        maxAttack: number
        maxMiss: number
    } {
        // Chunithm scoring:
        // JC (Justice Critical) = 10100
        // J (Justice) = 10100 * 0.99 = 10000 (approximately)
        // A (Attack) = 10100 * 0.50 = 5050
        // M (Miss) = 0

        const perfectScore = 10100 * totalNotes
        const targetRatio = targetScore / 1010000  // Max score is 1010000
        const maxLoss = perfectScore - (perfectScore * targetRatio)

        // Justice costs ~100 points per note
        // Attack costs ~5050 points per note  
        // Miss costs 10100 points per note

        return {
            maxJustice: Math.floor(maxLoss / 100),
            maxAttack: Math.floor(maxLoss / 5050),
            maxMiss: Math.floor(maxLoss / 10100)
        }
    }

    /**
     * Bind user import token
     */
    async bindToken(platform: string, userId: string, token: string): Promise<boolean> {
        try {
            const result = await this.queryWithImportToken(token)
            if (!result.data) return false

            await this.ctx.database.upsert('user_token', [{
                platform,
                user_id: userId,
                chunithm_token: token,
                updated_at: new Date()
            }], ['platform', 'user_id'])
            return true
        } catch (e) {
            return false
        }
    }
}

export { calculateRating, getRate }
export default ChunithmQuery
