import { Context, Service, Session } from 'koishi'
import type { UserToken } from '../database'
import { decryptStored } from '../utils/crypto-utils'

export const name = 'maimai-query'

// DivingFish API endpoints
const DF_BASE = 'https://www.diving-fish.com/api/maimaidxprober'
const DF_QUERY_PLAYER = `${DF_BASE}/query/player`
const DF_TEST_DATA = `${DF_BASE}/player/test_data`
const DF_PLAYER_RECORDS = `${DF_BASE}/player/records`
const DF_DEV_PLAYER_RECORDS = `${DF_BASE}/dev/player/records`
const DF_LOGIN = `${DF_BASE}/login`

// lxns API endpoints
const LXNS_BASE = 'https://maimai.lxns.net/api/v0/maimai'
const LXNS_PLAYER_BESTS = (friendCode: number) => `${LXNS_BASE}/player/${friendCode}/bests`
const LXNS_USER_SCORES = 'https://maimai.lxns.net/api/v0/user/maimai/player/scores'


export interface MaimaiScore {
    id?: number
    song_id?: number
    title: string
    type: 'DX' | 'SD'
    level: string
    level_index: number
    achievements: number
    fc: string
    fs: string
    ds: number
    dx_score?: number
    ra: number
    rate: string
}

export interface MaimaiB50Data {
    nickname: string
    rating: number
    additional_rating?: number
    plate?: string
    charts?: {
        dx: MaimaiScore[]
        sd: MaimaiScore[]
    }
    records?: MaimaiScore[]
    standard?: MaimaiScore[]
    dx?: MaimaiScore[]
}

declare module 'koishi' {
    interface Context {
        maimaiQuery: MaimaiQuery
    }
}



interface MaimaiQueryConfig {
    divingfishDevToken?: string
    lxnsDevToken?: string
    authToken?: string
    debug?: boolean
}

function calculateRating(constant: number, achievement: number): number {
    let multiplier: number

    if (achievement >= 100.5) {
        multiplier = 22.4
    } else if (achievement >= 100.4999) {
        multiplier = 22.2
    } else if (achievement >= 100.0) {
        multiplier = 21.6
    } else if (achievement >= 99.5) {
        multiplier = 21.1
    } else if (achievement >= 99.0) {
        multiplier = 20.8
    } else if (achievement >= 98.0) {
        multiplier = 20.3
    } else if (achievement >= 97.0) {
        multiplier = 20.0
    } else if (achievement >= 94.0) {
        multiplier = 16.8
    } else if (achievement >= 90.0) {
        multiplier = 13.6
    } else if (achievement >= 80.0) {
        multiplier = 12.0 + (achievement - 80.0) * 0.16
    } else if (achievement >= 75.0) {
        multiplier = 10.0 + (achievement - 75.0) * 0.4
    } else if (achievement >= 70.0) {
        multiplier = 8.0 + (achievement - 70.0) * 0.4
    } else if (achievement >= 60.0) {
        multiplier = 5.0 + (achievement - 60.0) * 0.3
    } else if (achievement >= 50.0) {
        multiplier = 4.0 + (achievement - 50.0) * 0.1
    } else {
        multiplier = 0
    }

    return Math.floor(constant * achievement * multiplier / 100)
}

function getRate(achievement: number): string {
    if (achievement >= 100.5) return 'sssp'
    if (achievement >= 100.0) return 'sss'
    if (achievement >= 99.5) return 'ssp'
    if (achievement >= 99.0) return 'ss'
    if (achievement >= 98.0) return 'sp'
    if (achievement >= 97.0) return 's'
    if (achievement >= 94.0) return 'aaa'
    if (achievement >= 90.0) return 'aa'
    if (achievement >= 80.0) return 'a'
    if (achievement >= 75.0) return 'bbb'
    if (achievement >= 70.0) return 'bb'
    if (achievement >= 60.0) return 'b'
    if (achievement >= 50.0) return 'c'
    return 'd'
}

export class MaimaiQuery extends Service {
    static inject = ['http', 'database']

    private queryConfig: MaimaiQueryConfig = {}
    private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

    constructor(ctx: Context, config?: MaimaiQueryConfig) {
        super(ctx, 'maimaiQuery')
        if (config) {
            this.queryConfig = config
            if (config.debug) {
                this.ctx.logger('maimai-query').info('[DEBUG] maimai-query 调试模式启用')
            }
        }
    }

    private logDebug(...args: any[]) {
        if (this.queryConfig.debug) {
            this.ctx.logger('maimai-query').info('[DEBUG]', ...args)
        }
    } async getTestData(): Promise<MaimaiB50Data | null> {
        try {
            const data = await this.ctx.http.get<MaimaiB50Data>(DF_TEST_DATA, {
                headers: { 'User-Agent': this.UA },
                timeout: 15000
            })
            return data
        } catch (e) {
            this.logger.error('Failed to fetch test data:', e)
            return null
        }
    }

    async getB50(session: Session, username?: string): Promise<{
        data: MaimaiB50Data | null
        error?: string
    }> {
        const platform = session.platform
        const userId = session.userId

        // Try to get user's QQ for query
        let qq: string | undefined
        if (platform === 'onebot' || platform === 'qq') {
            qq = userId
        }

        // Fallback: try to extract QQ from raw event data
        if (!qq) {
            const event = (session as any).event
            const rawUserId = event?.user?.id || event?.user_id || (session as any).user_id
            if (rawUserId && /^\d+$/.test(String(rawUserId))) {
                qq = String(rawUserId)
            }
        }

        this.logDebug(`getB50 调用: platform=${platform}, userId=${userId}, qq=${qq || '(未获取)'}, username=${username || '(未提供)'}`)

        // Retrieve User Token and Preference
        let userToken: UserToken | null = null
        if (userId) {
            userToken = await this.getUserToken(platform, userId)
        }

        const preferredMode = userToken?.preferred_mode
        this.logDebug(`用户数据: token存在=${!!userToken}, preferredMode=${preferredMode || 'auto'}, lxnsToken=${!!userToken?.lxns_token}, friendCode=${userToken?.lxns_friend_code || '无'}, lxnsDevToken配置=${!!this.queryConfig.lxnsDevToken}`)

        // --- DivingFish Logic ---
        const tryDivingFish = async () => {
            // 1. Dev Token
            if (this.queryConfig.divingfishDevToken) {
                const res = await this.queryWithDevToken(username, qq)
                if (res.data) return res
            }

            // 2. User Import Token
            if (userToken?.maimai_token) {
                const res = await this.queryWithImportToken(userToken.maimai_token)
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
            // 1. User Token (优先级最高，使用个人 API)
            if (userToken?.lxns_token) {
                const res = await this.queryWithLxnsToken(userToken.lxns_token)
                if (res.data) return res
                if (res.error) return res
                return res
            }

            // 2. Dev Token - 绑定了好友码时直接通过好友码查询
            if (this.queryConfig.lxnsDevToken && userToken?.lxns_friend_code) {
                const friendCode = userToken.lxns_friend_code
                const res = await this.queryWithLxnsDevToken(friendCode)
                if (res.data) return res
            }

            // 3. Dev Token - 未绑定 token/好友码，但有 QQ 号时，通过开发者 API 按 QQ 查询
            if (this.queryConfig.lxnsDevToken && qq) {
                const res = await this.queryWithLxnsDevTokenByQQ(qq)
                if (res.data) return res
                // 返回具体的 LXNS 错误而非通用消息
                return res
            }

            return { data: null, error: 'LXNS: 无可用的查询方式（未绑定 Token/好友码，且无法通过 QQ 查询）' }
        }

        // --- Selection Logic ---

        if (preferredMode === 'fish') {
            this.logDebug('数据源选择: 用户指定 DivingFish，失败后回退 LXNS')
            const fishResult = await tryDivingFish()
            if (fishResult.data) return fishResult
            this.logDebug('DivingFish 查询失败，尝试回退 LXNS')
            const lxnsResult = await tryLxns()
            if (lxnsResult.data) return lxnsResult
            return fishResult // 返回原始首选源的错误
        }

        if (preferredMode === 'lxns') {
            this.logDebug('数据源选择: 用户指定 LXNS，失败后回退 DivingFish')
            const lxnsResult = await tryLxns()
            if (lxnsResult.data) return lxnsResult
            this.logDebug(`LXNS 查询失败 (${lxnsResult.error})，尝试回退 DivingFish`)
            const fishResult = await tryDivingFish()
            if (fishResult.data) return fishResult
            return lxnsResult // 返回原始首选源的错误
        }

        this.logDebug('数据源选择: Auto 模式')

        // Auto Mode (Default) — 舞萌DX 默认水鱼源

        // 1. Fish Dev
        if (this.queryConfig.divingfishDevToken) {
            const res = await this.queryWithDevToken(username, qq)
            if (res.data) return res
        }

        // 2. Fish Token
        if (userToken?.maimai_token) {
            const res = await this.queryWithImportToken(userToken.maimai_token)
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

        // 5. LXNS Dev Token - 绑定了好友码时使用
        if (this.queryConfig.lxnsDevToken && userToken?.lxns_friend_code) {
            const res = await this.queryWithLxnsDevToken(userToken.lxns_friend_code)
            if (res.data) return res
        }

        // 6. LXNS Dev Token - 未绑定 token 的用户通过 QQ 号查询
        if (this.queryConfig.lxnsDevToken && qq) {
            const res = await this.queryWithLxnsDevTokenByQQ(qq)
            if (res.data) return res
        }

        // 7. Public (DivingFish only)
        if (qq || username) {
            return this.queryPublic(username, qq)
        }

        return { data: null, error: '无法确定查询目标，请提供用户名或绑定 QQ' }
    }

    async getAP50(session: Session, username?: string): Promise<{
        data: MaimaiB50Data | null
        error?: string
    }> {
        const result = await this.getB50(session, username)
        if (!result.data) return result

        const filterAP = (scores: MaimaiScore[]) =>
            scores.filter(s => s.fc === 'ap' || s.fc === 'app')

        if (result.data.charts) {
            result.data.charts.dx = filterAP(result.data.charts.dx).slice(0, 15)
            result.data.charts.sd = filterAP(result.data.charts.sd).slice(0, 35)
        }

        return result
    }

    async getFC50(session: Session, username?: string): Promise<{
        data: MaimaiB50Data | null
        error?: string
    }> {
        const result = await this.getB50(session, username)
        if (!result.data) return result

        const filterFC = (scores: MaimaiScore[]) =>
            scores.filter(s => ['fc', 'fcp', 'ap', 'app'].includes(s.fc))

        if (result.data.charts) {
            result.data.charts.dx = filterFC(result.data.charts.dx).slice(0, 15)
            result.data.charts.sd = filterFC(result.data.charts.sd).slice(0, 35)
        }

        return result
    }

    private async queryWithDevToken(username?: string, qq?: string): Promise<{
        data: MaimaiB50Data | null
        error?: string
    }> {
        try {
            const params = new URLSearchParams()
            if (username) params.set('username', username)
            else if (qq) params.set('qq', qq)

            const url = `${DF_DEV_PLAYER_RECORDS}?${params}`
            const data = await this.ctx.http.get<MaimaiB50Data>(url, {
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
        data: MaimaiB50Data | null
        error?: string
    }> {
        try {
            const data = await this.ctx.http.get<MaimaiB50Data>(DF_PLAYER_RECORDS, {
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
        data: MaimaiB50Data | null
        error?: string
    }> {
        if (!this.queryConfig.authToken) return { data: null, error: 'AuthToken not configured' }

        const creds = decryptStored(encryptedCreds, this.queryConfig.authToken)
        if (!creds) return { data: null, error: 'Credentials decryption failed' }

        // Login to get token/session
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

            // DivingFish Login returns { "jwt_token": "..." }
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
        data: MaimaiB50Data | null
        error?: string
    }> {
        try {
            // 个人 API 使用 X-User-Token 请求头（非 Authorization）
            const authHeaders = {
                'User-Agent': this.UA,
                'X-User-Token': token
            }

            // Fetch scores + player info in parallel
            const [scoresResp, playerResp] = await Promise.all([
                this.ctx.http.get<any>(LXNS_USER_SCORES, { headers: authHeaders, timeout: 15000 }),
                this.ctx.http.get<any>('https://maimai.lxns.net/api/v0/user/maimai/player', { headers: authHeaders, timeout: 10000 }).catch(() => null)
            ])

            const normalized = this.normalizeData(scoresResp)

            // Merge player info
            const playerInfo = playerResp?.data || playerResp
            if (playerInfo) {
                normalized.nickname = normalized.nickname || playerInfo.name
                normalized.rating = normalized.rating || playerInfo.rating
                if (playerInfo.icon?.id) {
                    ; (normalized as any).avatar_url = `https://assets2.lxns.net/maimai/icon/${playerInfo.icon.id}.png`
                }
            }

            return { data: normalized }
        } catch (e: any) {
            return { data: null, error: 'LXNS Token query failed' }
        }
    }

    private async queryWithLxnsDevToken(friendCode: number): Promise<{
        data: MaimaiB50Data | null
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

            // Merge player info (name, rating, icon for avatar)
            const playerInfo = playerResp?.data || playerResp
            if (playerInfo) {
                normalized.nickname = normalized.nickname || playerInfo.name
                normalized.rating = normalized.rating || playerInfo.rating
                if (playerInfo.icon?.id) {
                    ; (normalized as any).avatar_url = `https://assets2.lxns.net/maimai/icon/${playerInfo.icon.id}.png`
                }
            }

            return { data: normalized }
        } catch (e: any) {
            return { data: null, error: e.response?.data?.message || 'LXNS Dev Token 查询失败' }
        }
    }

    private async queryPublic(username?: string, qq?: string): Promise<{
        data: MaimaiB50Data | null
        error?: string
    }> {
        try {
            const body: Record<string, string> = { b50: '1' }
            if (username) body.username = username
            else if (qq) body.qq = qq

            const data = await this.ctx.http.post<MaimaiB50Data>(DF_QUERY_PLAYER, body, {
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

    private async queryWithLxnsDevTokenByQQ(qq: string): Promise<{
        data: MaimaiB50Data | null
        error?: string
    }> {
        try {
            const authHeaders = {
                'User-Agent': this.UA,
                'Authorization': this.queryConfig.lxnsDevToken!
            }

            this.logDebug(`LXNS QQ 查询: ${LXNS_BASE}/player/qq/${qq}`)

            // Resolve QQ → friend_code via lxns developer API
            const playerUrl = `${LXNS_BASE}/player/qq/${qq}`
            const playerDataResp = await this.ctx.http.get<any>(playerUrl, {
                headers: authHeaders,
                timeout: 15000
            })

            // Unwrap LXNS response: { success, code, data: {...} } or direct object
            const playerData = (playerDataResp?.success !== undefined || playerDataResp?.code !== undefined) && playerDataResp?.data
                ? playerDataResp.data
                : playerDataResp

            const friendCode = playerData?.friend_code
            this.logDebug(`LXNS QQ 查询结果: friend_code=${friendCode || '(未找到)'}, name=${playerData?.name || '(未知)'}`)
            if (!friendCode) {
                return { data: null, error: 'LXNS: 未找到该 QQ 对应的玩家' }
            }

            // Query bests + player info with dev token in parallel
            const [bestsResp, playerInfoResp] = await Promise.all([
                this.ctx.http.get<any>(LXNS_PLAYER_BESTS(friendCode), {
                    headers: authHeaders,
                    timeout: 15000
                }),
                this.ctx.http.get<any>(`${LXNS_BASE}/player/${friendCode}`, {
                    headers: authHeaders,
                    timeout: 10000
                }).catch(() => null)
            ])

            const normalized = this.normalizeData(bestsResp)

            // Merge player info
            const playerInfo = playerInfoResp?.data || playerInfoResp
            if (playerInfo) {
                normalized.nickname = normalized.nickname || playerInfo.name
                normalized.rating = normalized.rating || playerInfo.rating
                if (playerInfo.icon?.id) {
                    ; (normalized as any).avatar_url = `https://assets2.lxns.net/maimai/icon/${playerInfo.icon.id}.png`
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

    private normalizeData(raw: any): MaimaiB50Data {
        // Unwrap LXNS response envelope: { success, code, data: {...} }
        const data = (raw?.success !== undefined || raw?.code !== undefined) && raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
            ? raw.data
            : raw

        // DivingFish query/player format: { charts: { dx, sd } }
        if (data.charts?.dx && data.charts?.sd) {
            return data
        }

        // DivingFish player/records format: flat records array
        if (Array.isArray(data.records)) {
            const dx = data.records.filter((r: any) => r.is_new).slice(0, 15)
            const sd = data.records.filter((r: any) => !r.is_new).slice(0, 35)
            return { ...data, charts: { dx, sd } }
        }

        // LXNS bests format: { standard, dx, standard_total, dx_total }
        if (data.standard && data.dx) {
            // Normalize LXNS score fields to match DivingFish conventions
            const normalizeLxnsScore = (s: any) => {
                // LXNS: 同一首曲目的标准、DX 谱面的曲目 ID 一致，不存在大于 10000 的曲目 ID
                // 如有大于 10000 的 ID，需要对 10000 取余处理
                let songId = s.id
                if (songId > 10000) {
                    songId = songId % 10000
                }
                return {
                    ...s,
                    song_id: songId,
                    title: s.song_name || s.title,
                    ra: s.dx_rating != null ? Math.floor(s.dx_rating) : (s.ra || 0),
                    ds: s.level_value ?? s.ds,
                    type: s.type === 'standard' ? 'SD' : s.type === 'dx' ? 'DX' : (s.type || 'SD'),
                }
            }
            return {
                ...data,
                nickname: data.name || data.nickname,
                charts: {
                    dx: data.dx.map(normalizeLxnsScore),
                    sd: data.standard.map(normalizeLxnsScore)
                }
            }
        }

        return data
    }

    calculateScoreBreakdown(
        totalNotes: { tap: number, hold: number, slide: number, touch: number, break: number },
        targetAchievement: number
    ): {
        maxBreakCount: number
        maxGreats: number
        maxGoods: number
        maxMisses: number
    } {
        const baseTotal = 500 * (totalNotes.tap + totalNotes.hold + totalNotes.slide + totalNotes.touch)
            + 2500 * totalNotes.break
        const breakBonusTotal = 100 * totalNotes.break
        // Maimai Scoring:
        // Base Score (100.00%) = sum(notes * values)
        // Break Bonus (approx 1.00%) = BreakCount * 100 (Critical Perfect Bonus)
        // Max Achievement = ((Base + Bonus) / Base) * 100

        // Target Score (in points) based on target % of Base
        const targetScore = (targetAchievement / 100) * baseTotal

        // Max Possible Score (in points)
        const maxPossibleScore = baseTotal + breakBonusTotal

        // Allowed loss (points)
        const maxLoss = maxPossibleScore - targetScore

        return {
            // User requested uniform calculation as "Low Perfect" (小小P)
            // Perfect (Low): 2550 (2500+50) -> Loss 50

            maxBreakCount: Math.floor(maxLoss / 50), // Low Perfect (Loss 50)
            maxGreats: Math.floor(maxLoss / 100),    // Tap Great loss 100
            maxGoods: Math.floor(maxLoss / 250),     // Tap Good loss 250
            maxMisses: Math.floor(maxLoss / 500)     // Tap Miss loss 500
        }
    }

    async bindToken(platform: string, userId: string, token: string): Promise<boolean> {
        try {
            const result = await this.queryWithImportToken(token)
            if (!result.data) return false

            await this.ctx.database.upsert('user_token', [{
                platform,
                user_id: userId,
                maimai_token: token,
                updated_at: new Date()
            }], ['platform', 'user_id'])
            return true
        } catch (e) {
            return false
        }
    }
}

export { calculateRating, getRate }
export default MaimaiQuery
