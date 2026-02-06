import { Context, h } from 'koishi'
import { MaichuniConfig } from '../../config'
import { ScoreItem } from '../../services/htmlframe'

/**
 * Register all chunithm commands
 */
export function registerChunithmCommands(ctx: Context, config: MaichuniConfig) {
    const chu = ctx.command('chu', '中二节奏查分指令')
        .usage('使用 chu.b50 查询 Best 50\n使用 chu.calc 计算容错\n使用 chu.alias 管理别名')

    // B50 command group
    registerB50Commands(ctx, config)

    // AJ50/FC50 commands
    registerAjFcCommands(ctx, config)

    // Calc command
    registerCalcCommand(ctx, config)

    // Alias management
    registerAliasCommands(ctx, config)


}

/**
 * Helper function to render B50 data as image with proper error handling
 */
async function renderB50Image(
    ctx: Context,
    b50Data: import('../../services/htmlframe').B50Data,
    type: 'maimai' | 'chunithm' = 'chunithm'
): Promise<string | ReturnType<typeof h.image>> {
    if (!ctx.puppeteer) {
        return '图片渲染服务不可用，请先安装 puppeteer 插件'
    }

    const html = await ctx.htmlframe.generateHtml(b50Data, type)
    const page = await ctx.puppeteer.page()
    try {
        await page.setViewport({ width: 1600, height: 1000 })
        await page.setContent(html)
        const buffer = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true })
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

            const b50Data = convertToB50Data(data)

            try {
                return await renderB50Image(ctx, b50Data, 'chunithm')
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

            const b50Data = convertToB50Data(data)
            b50Data.n20 = []

            try {
                return await renderB50Image(ctx, b50Data, 'chunithm')
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

            const b50Data = convertToB50Data(data)
            b50Data.b30 = []

            try {
                return await renderB50Image(ctx, b50Data, 'chunithm')
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

            const b50Data = convertToB50Data(result.data)

            try {
                return await renderB50Image(ctx, b50Data, 'chunithm')
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

            const b50Data = convertToB50Data(result.data)

            try {
                return await renderB50Image(ctx, b50Data, 'chunithm')
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

function registerAliasCommands(ctx: Context, config: MaichuniConfig) {
    ctx.command('chu.alias', '别名管理')
        .usage('使用 chu.alias.add/delete/list 管理别名')

    ctx.command('chu.alias.add <songId:number> <alias:string>', '添加本地别名')
        .action(async ({ session }, songId, alias) => {
            if (!songId || !alias) {
                return '请提供曲目 ID 和别名\n例: chu.alias.add 834 "测试"'
            }

            const success = await ctx.aliasManager?.addAlias('chunithm', songId, alias)
            if (success) {
                return `已添加别名: ${alias} → ${songId}`
            } else {
                return `添加失败，该别名可能已存在`
            }
        })

    ctx.command('chu.alias.delete <alias:string>', '删除本地别名')
        .action(async ({ session }, alias) => {
            if (!alias) {
                return '请提供要删除的别名'
            }

            const success = await ctx.aliasManager?.deleteAlias('chunithm', alias)
            if (success) {
                return `已删除别名: ${alias}`
            } else {
                return `删除失败，该别名不存在或不是本地别名`
            }
        })

    ctx.command('chu.alias.list [songId:number]', '查看别名列表')
        .action(async ({ session }, songId) => {
            if (!songId) {
                return '请提供曲目 ID\n例: chu.alias.list 834'
            }

            const aliases = await ctx.aliasManager?.getAliases('chunithm', songId)
            if (!aliases) {
                return '查询失败'
            }

            const lines: string[] = [`曲目 ${songId} 的别名:`]
            if (aliases.local.length > 0) {
                lines.push(`本地: ${aliases.local.join(', ')}`)
            }
            if (aliases.lxns.length > 0) {
                lines.push(`lxns: ${aliases.lxns.join(', ')}`)
            }
            if (aliases.local.length === 0 && aliases.lxns.length === 0) {
                lines.push('暂无别名')
            }

            return lines.join('\n')
        })
}

/**
 * Convert API response to HtmlFrame B50Data format for Chunithm
 */

/**
 * Convert API response to HtmlFrame B50Data format for Chunithm
 */
function convertToB50Data(data: any): import('../../services/htmlframe').B50Data {
    const records = data.records || { b30: [], n20: [] }

    const convertScore = (score: any, rank: number): ScoreItem => ({
        id: score.mid || score.cid || score.id,
        title: score.title || 'Unknown',
        level: score.level || score.ds?.toString() || '?',
        levelIndex: score.level_index ?? 3,
        rating: Math.floor((score.ra || 0) * 100) / 100,
        score: score.score || 0,
        rank: rank,
        image: `https://www.diving-fish.com/covers/chunithm/${String(score.mid || score.cid || score.id).padStart(4, '0')}.png`,
        type: 'STD',  // Chunithm doesn't have DX/STD distinction like maimai
        rate: (score.rate || 'sss').toUpperCase(),
        fc: formatChunitmFc(score.fc)
    })

    return {
        playerName: data.nickname || data.username || 'Player',
        playerRating: data.rating || 0,
        avatarUrl: data.avatar_url,
        b30: (records.b30 || []).map((s: any, i: number) => convertScore(s, i + 1)),
        n20: (records.n20 || []).map((s: any, i: number) => convertScore(s, i + 1))
    }
}

function formatChunitmFc(fc?: string): '' | 'FC' | 'FC+' | 'AP' | 'AP+' | 'AJ' {
    if (!fc) return ''
    switch (fc.toLowerCase()) {
        case 'fullcombo': return 'FC'
        case 'alljustice': return 'AJ'
        case 'alljusticecritical': return 'AJ'
        default: return ''
    }
}

export default registerChunithmCommands
