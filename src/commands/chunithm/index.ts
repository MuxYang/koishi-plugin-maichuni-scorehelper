import { Context, h } from 'koishi'
import { MaichuniConfig } from '../../config'
import { ScoreItem as ChunithmScoreItem, B50Data as ChunithmB50HtmlData } from '../../services/htmlframe'
import { registerSharedAliasCommands } from '../../utils/alias-command'

/**
 * Register all chunithm commands
 */
export function registerChunithmCommands(ctx: Context, config: MaichuniConfig) {
    return ctx.inject(['chunithmQuery', 'htmlframe', 'songDataManager', 'aliasManager', 'puppeteer'], (ctx) => {
        const chu = ctx.command('chu', '中二节奏查分指令')
            .usage('使用 chu.b50 查询 Best 50\n使用 chu.calc 计算容错\n使用 chu.alias 管理别名')
        // B50 command group
        registerB50Commands(ctx, config)

        // AJ50/FC50 commands
        registerAjFcCommands(ctx, config)

        // Calc command
        registerCalcCommand(ctx, config)

        // Alias management
        registerSharedAliasCommands(ctx, 'chu', 'chunithm')
    })
}

/**
 * Helper function to render B50 data as image with proper error handling
 */
async function renderB50Image(
    ctx: Context,
    b50Data: ChunithmB50HtmlData
): Promise<string | ReturnType<typeof h.image>> {
    if (!ctx.puppeteer) {
        return '图片渲染服务不可用，请先安装 puppeteer 插件'
    }

    const html = await ctx.htmlframe.generateChunithmHtml(b50Data)
    const page = await ctx.puppeteer.page()
    try {
        await page.setViewport({ width: 1600, height: 1000 })
        // 使用 'load' 等待页面完全渲染，但不等待外部网络请求
        await page.setContent(html, { waitUntil: 'load', timeout: 30000 })
        // 小延迟确保所有样式应用完成
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)))
        const buffer = await page.screenshot({ type: 'jpeg', quality: 85, fullPage: true })
        return h.image(buffer, 'image/jpeg')
    } finally {
        await page.close()
    }
}

function registerB50Commands(ctx: Context, config: MaichuniConfig) {
    ctx.command('chu.b50 [username:string]', '查询 Best 50 (B30+N20)')
        .option('test', '-t 使用测试数据')
        .action(async ({ session, options }, username) => {
            if (!ctx.chunithmQuery) {
                return '查分服务未初始化'
            }

            let data
            if (options?.test) {
                data = await ctx.chunithmQuery.getTestData()
                if (!data) return '获取测试数据失败'
            } else {
                const result = await ctx.chunithmQuery.getB50(session!, username)
                if (result.error) return result.error
                data = result.data
            }

            if (!data) return '查询失败'

            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToChunithmB50Data(data, qq, 'lxns')

            try {
                return await renderB50Image(ctx, b50Data)
            } catch (e) {
                ctx.logger('chu.b50').error(e)
                return '生成图片失败：' + (e instanceof Error ? e.message : String(e))
            }
        })

    ctx.command('chu.b30 [username:string]', '查询 Best 30 (旧曲)')
        .option('test', '-t 使用测试数据')
        .action(async ({ session, options }, username) => {
            if (!ctx.chunithmQuery) return '查分服务未初始化'

            let data
            if (options?.test) {
                data = await ctx.chunithmQuery.getTestData()
            } else {
                const result = await ctx.chunithmQuery.getB50(session!, username)
                if (result.error) return result.error
                data = result.data
            }

            if (!data) return '查询失败'

            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToChunithmB50Data(data, qq, 'lxns')
            b50Data.n20 = []

            try {
                return await renderB50Image(ctx, b50Data)
            } catch (e) {
                return '生成图片失败'
            }
        })

    ctx.command('chu.n20 [username:string]', '查询 New 20 (新曲)')
        .option('test', '-t 使用测试数据')
        .action(async ({ session, options }, username) => {
            if (!ctx.chunithmQuery) return '查分服务未初始化'

            let data
            if (options?.test) {
                data = await ctx.chunithmQuery.getTestData()
            } else {
                const result = await ctx.chunithmQuery.getB50(session!, username)
                if (result.error) return result.error
                data = result.data
            }

            if (!data) return '查询失败'

            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToChunithmB50Data(data, qq, 'lxns')
            b50Data.b30 = []

            try {
                return await renderB50Image(ctx, b50Data)
            } catch (e) {
                return '生成图片失败'
            }
        })
}

function registerAjFcCommands(ctx: Context, config: MaichuniConfig) {
    ctx.command('chu.aj50 [username:string]', '查询 AJ50 成绩 (All Justice)')
        .alias('chu.ap50')
        .action(async ({ session }, username) => {
            if (!ctx.chunithmQuery) return '查分服务未初始化'

            const result = await ctx.chunithmQuery.getAJ50(session!, username)
            if (result.error) return result.error
            if (!result.data) return '查询失败'

            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToChunithmB50Data(result.data, qq, 'lxns')

            try {
                return await renderB50Image(ctx, b50Data)
            } catch (e) {
                return '生成图片失败'
            }
        })

    ctx.command('chu.fc50 [username:string]', '查询 FC50 成绩 (Full Combo)')
        .action(async ({ session }, username) => {
            if (!ctx.chunithmQuery) return '查分服务未初始化'

            const result = await ctx.chunithmQuery.getFC50(session!, username)
            if (result.error) return result.error
            if (!result.data) return '查询失败'

            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToChunithmB50Data(result.data, qq, 'lxns')

            try {
                return await renderB50Image(ctx, b50Data)
            } catch (e) {
                return '生成图片失败'
            }
        })
}

function registerCalcCommand(ctx: Context, config: MaichuniConfig) {
    ctx.command('chu.calc <song:string> <difficulty:number> <target:number>', '计算达成目标分数的容错')
        .usage('例: chu.calc "曲名" 3 1009000  (难度: 0=绿,1=黄,2=红,3=紫,4=黑)')
        .action(async ({ session }, song, difficulty, target) => {
            if (!song || difficulty === undefined || target === undefined) {
                return '请提供曲名、难度和目标分数\n例: chu.calc "曲名" 3 1009000\n难度: 0=绿,1=黄,2=红,3=紫,4=黑'
            }

            if (difficulty < 0 || difficulty > 4) {
                return '难度范围: 0-4 (0=绿,1=黄,2=红,3=紫,4=黑)'
            }

            // First try to find song by name directly via SongDataManager
            let songData = await ctx.songDataManager?.findSong('chunithm', song)

            // If not found, try alias resolution
            if (!songData) {
                const songId = await ctx.aliasManager?.resolveSong('chunithm', song)
                if (songId) {
                    songData = await ctx.songDataManager?.getSong('chunithm', String(songId))
                }
            }

            if (!songData) {
                return `找不到曲目: ${song}`
            }

            // Get note counts for the specified difficulty
            const noteCount = await ctx.songDataManager?.getNoteCount('chunithm', String(songData.id), difficulty)
            if (!noteCount) {
                return `无法获取该难度的谱面数据`
            }

            const diffNames = ['Basic', 'Advanced', 'Expert', 'Master', "Ultima"]
            const ds = songData.ds?.[difficulty] || 0

            // Chunithm SCORING:
            // Max Score: 1,010,000 (All Justice Critical)
            // Base: 1,000,000 / TotalNotes (Justice)
            // Bonus: 10,000 / TotalNotes (Justice Critical Bonus)
            // 
            // Values:
            // J.Critical: 1,010,000 / N
            // Justice:    1,000,000 / N
            // Attack:       500,000 / N
            // Miss:               0

            const totalNotes = noteCount.total
            const maxScore = 1010000

            // Losses compared to Max Score (J.Critical)
            const lossJustice = 10000 / totalNotes
            const lossAttack = (1010000 - 500000) / totalNotes // 510,000 / N
            const lossMiss = 1010000 / totalNotes

            // Allowed loss
            const allowedLoss = maxScore - target

            // Output approximate counts
            // e.g. How many Justices allowed? allowedLoss / lossJustice

            const result = [
                `📊 ${songData.title}`,
                `难度: ${diffNames[difficulty]} (${ds})`,
                `目标分数: ${target}`,
                ``,
                `📝 谱面信息:`,
                `  Note 总数: ${totalNotes}`,
                ``,
                `🎯 容错余量 (约):`,
                `  可损失: ${allowedLoss} 分`,
                `  Justice: 约 ${Math.floor(allowedLoss / lossJustice)} 个`,
                `  Attack: 约 ${Math.floor(allowedLoss / lossAttack)} 个`,
                `  Miss: 约 ${Math.floor(allowedLoss / lossMiss)} 个`
            ]

            return result.join('\n')
        })
}



/**
 * Chunithm 曲绘 URL 生成
 * 水鱼: https://www.diving-fish.com/covers/chunithm/{id padded to 4}.png
 * 落雪: https://assets2.lxns.net/chunithm/jacket/{song_id}.png
 */
function getChunithmCoverUrls(songId: number, imageSource: 'fish' | 'lxns' = 'fish'): { primary: string; fallback: string } {
    const dfUrl = `https://www.diving-fish.com/covers/chunithm/${String(songId).padStart(4, '0')}.png`
    const lxnsUrl = `https://assets2.lxns.net/chunithm/jacket/${songId}.png`

    if (imageSource === 'lxns') {
        return { primary: lxnsUrl, fallback: dfUrl }
    }
    return { primary: dfUrl, fallback: lxnsUrl }
}

function convertToChunithmB50Data(data: any, qq?: string, imageSource: 'fish' | 'lxns' = 'fish'): ChunithmB50HtmlData {
    const records = data.records || { b30: [], n20: [] }

    const convertScore = (score: any, rank: number): ChunithmScoreItem => {
        const songId = score.mid || score.cid || score.id || 0
        let coverId = parseInt(songId)
        if (isNaN(coverId)) coverId = 0

        const { primary, fallback } = getChunithmCoverUrls(coverId, imageSource)

        return {
            id: songId,
            title: score.title || score.song_name || 'Unknown',
            level: score.ds?.toString() || (score.level_value != null ? String(score.level_value) : score.level || '?'),
            levelIndex: score.level_index ?? 3,
            rating: Math.floor(((score.ra ?? score.rating) || 0) * 100) / 100,
            score: score.score || 0,
            rank: rank,
            image: primary,
            fallbackImage: fallback,
            type: 'STD',
            rate: score.rate || score.rank || 'sss',
            fc: formatChunithmFc(score.fc || score.full_combo)
        }
    }

    return {
        playerName: data.nickname || data.name || data.username || 'Player',
        playerRating: data.rating || 0,
        avatarUrl: data.avatar_url,
        qq,
        b30: (records.b30 || []).map((s: any, i: number) => convertScore(s, i + 1)),
        n20: (records.n20 || []).map((s: any, i: number) => convertScore(s, i + 1))
    }
}

function formatChunithmFc(fc?: string): string {
    if (!fc) return ''
    switch (fc.toLowerCase()) {
        case 'fullcombo': return 'FC'
        case 'alljustice': return 'AJ'
        case 'alljusticecritical': return 'AJ'
        default: return ''
    }
}

export default registerChunithmCommands
