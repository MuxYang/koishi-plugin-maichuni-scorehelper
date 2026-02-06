import { Context, h } from 'koishi'
import { MaichuniConfig } from '../../config'
import { ScoreItem } from '../../services/htmlframe'

/**
 * Register all maimai commands
 */
export function registerMaimaiCommands(ctx: Context, config: MaichuniConfig) {
    const mai = ctx.command('mai', '舞萌 DX 查分指令')
        .usage('使用 mai.b50 查询 Best 50\n使用 mai.calc 计算容错\n使用 mai.alias 管理别名')

    // B50 command group
    registerB50Commands(ctx, config)

    // AP50/FC50 commands
    registerApFcCommands(ctx, config)

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
    type: 'maimai' | 'chunithm' = 'maimai'
): Promise<string | ReturnType<typeof h.image>> {
    if (!ctx.puppeteer) {
        return '图片渲染服务不可用，请先安装 puppeteer 插件'
    }

    const html = await ctx.htmlframe.generateHtml(b50Data, type)
    const page = await ctx.puppeteer.page()
    try {
        await page.setViewport({ width: 1600, height: 1000 })
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })
        const buffer = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true })
        return h.image(buffer, 'image/jpeg')
    } finally {
        await page.close()
    }
}

function registerB50Commands(ctx: Context, config: MaichuniConfig) {
    ctx.command('mai.b50 [username:string]', '查询 Best 50 (B35+B15)')
        .option('test', '-t 使用测试数据')
        .action(async ({ session, options }, username) => {
            const maimaiQuery = ctx.maimaiQuery
            const htmlframe = ctx.htmlframe
            
            if (!maimaiQuery) {
                return '查分服务未初始化'
            }

            let data
            if (options?.test) {
                data = await maimaiQuery.getTestData()
                if (!data) return '获取测试数据失败'
            } else {
                const result = await maimaiQuery.getB50(session!, username)
                if (result.error) return result.error
                data = result.data
            }

            if (!data) return '查询失败'

            // Convert to HtmlFrame format - pass QQ for avatar
            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToB50Data(data, qq)

            try {
                return await renderB50Image(ctx, b50Data, 'maimai')
            } catch (e) {
                ctx.logger('mai.b50').error(e)
                return '生成图片失败：' + (e instanceof Error ? e.message : String(e))
            }
        })

    ctx.command('mai.b35 [username:string]', '查询 Best 35 (旧曲)')
        .option('test', '-t 使用测试数据')
        .action(async ({ session, options }, username) => {
            const maimaiQuery = ctx.maimaiQuery
            const htmlframe = ctx.htmlframe
            if (!maimaiQuery) return '查分服务未初始化'

            let data
            if (options?.test) {
                data = await ctx.maimaiQuery.getTestData()
            } else {
                const result = await ctx.maimaiQuery.getB50(session!, username)
                if (result.error) return result.error
                data = result.data
            }

            if (!data) return '查询失败'

            // Only show B35
            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToB50Data(data, qq)
            b50Data.b15 = []

            try {
                return await renderB50Image(ctx, b50Data, 'maimai')
            } catch (e) {
                return '生成图片失败'
            }
        })

    ctx.command('mai.b15 [username:string]', '查询 Best 15 (新曲)')
        .option('test', '-t 使用测试数据')
        .action(async ({ session, options }, username) => {
            const maimaiQuery = ctx.maimaiQuery
            const htmlframe = ctx.htmlframe
            if (!maimaiQuery) return '查分服务未初始化'

            let data
            if (options?.test) {
                data = await maimaiQuery.getTestData()
            } else {
                const result = await maimaiQuery.getB50(session!, username)
                if (result.error) return result.error
                data = result.data
            }

            if (!data) return '查询失败'

            // Only show B15
            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToB50Data(data, qq)
            b50Data.b35 = []

            try {
                return await renderB50Image(ctx, b50Data, 'maimai')
            } catch (e) {
                return '生成图片失败'
            }
        })
}

function registerApFcCommands(ctx: Context, config: MaichuniConfig) {
    ctx.command('mai.ap50 [username:string]', '查询 AP50 成绩 (All Perfect)')
        .action(async ({ session }, username) => {
            if (!ctx.maimaiQuery) return '查分服务未初始化'

            const result = await ctx.maimaiQuery.getAP50(session!, username)
            if (result.error) return result.error
            if (!result.data) return '查询失败'

            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToB50Data(result.data, qq)

            try {
                return await renderB50Image(ctx, b50Data, 'maimai')
            } catch (e) {
                return '生成图片失败'
            }
        })

    ctx.command('mai.fc50 [username:string]', '查询 FC50 成绩 (Full Combo)')
        .action(async ({ session }, username) => {
            if (!ctx.maimaiQuery) return '查分服务未初始化'

            const result = await ctx.maimaiQuery.getFC50(session!, username)
            if (result.error) return result.error
            if (!result.data) return '查询失败'

            const qq = (session!.platform === 'onebot' || session!.platform === 'qq') ? session!.userId : undefined
            const b50Data = convertToB50Data(result.data, qq)

            try {
                return await renderB50Image(ctx, b50Data, 'maimai')
            } catch (e) {
                return '生成图片失败'
            }
        })
}

function registerCalcCommand(ctx: Context, config: MaichuniConfig) {
    ctx.command('mai.calc <song:string> <difficulty:number> <target:number>', '计算达成目标分数的容错')
        .usage('例: mai.calc "曲名" 3 100.5  (难度: 0=绿,1=黄,2=红,3=紫,4=白)')
        .action(async ({ session }, song, difficulty, target) => {
            if (!song || difficulty === undefined || target === undefined) {
                return '请提供曲名、难度和目标分数\n例: mai.calc "曲名" 3 100.5\n难度: 0=绿,1=黄,2=红,3=紫,4=白'
            }

            if (difficulty < 0 || difficulty > 4) {
                return '难度范围: 0-4 (0=绿,1=黄,2=红,3=紫,4=白)'
            }

            // First try to find song by name directly via SongDataManager
            let songData = await ctx.songDataManager?.findSong('maimai', song)

            // If not found, try alias resolution
            if (!songData) {
                const songId = await ctx.aliasManager?.resolveSong('maimai', song)
                if (songId) {
                    songData = await ctx.songDataManager?.getSong('maimai', String(songId))
                }
            }

            if (!songData) {
                return `找不到曲目: ${song}`
            }

            // Get note counts for the specified difficulty
            const noteCount = await ctx.songDataManager?.getNoteCount('maimai', String(songData.id), difficulty)
            if (!noteCount) {
                return `无法获取该难度的谱面数据`
            }

            const diffNames = ['Basic', 'Advanced', 'Expert', 'Master', "Re:Master"]
            const ds = songData.ds?.[difficulty] || 0

            // Calculate score tolerance using MaimaiQuery
            const breakdown = ctx.maimaiQuery?.calculateScoreBreakdown(
                {
                    tap: noteCount.tap,
                    hold: noteCount.hold,
                    slide: noteCount.slide,
                    touch: noteCount.touch,
                    break: noteCount.break
                },
                target
            )

            if (!breakdown) {
                return '容错计算失败'
            }

            const result = [
                `📊 ${songData.title}`,
                `难度: ${diffNames[difficulty]} (${ds})`,
                `目标达成率: ${target}%`,
                ``,
                `📝 谱面信息:`,
                `  Tap: ${noteCount.tap} | Hold: ${noteCount.hold}`,
                `  Slide: ${noteCount.slide} | Touch: ${noteCount.touch}`,
                `  Break: ${noteCount.break} | 总计: ${noteCount.total}`,
                ``,
                `🎯 容错余量 (约):`,
                `  可损失: ${breakdown.maxBreakCount * 50} 分`,
                `  Break (小小P/50): 约 ${breakdown.maxBreakCount} 个`,
                `  Great (-100): 约 ${breakdown.maxGreats} 个`,
                `  Good (-250): 约 ${breakdown.maxGoods} 个`,
                `  Miss (-500): 约 ${breakdown.maxMisses} 个`
            ]

            return result.join('\n')
        })
}

function registerAliasCommands(ctx: Context, config: MaichuniConfig) {
    ctx.command('mai.alias', '别名管理')
        .usage('使用 mai.alias.add/delete/list 管理别名')

    ctx.command('mai.alias.add <songId:number> <alias:string>', '添加本地别名')
        .action(async ({ session }, songId, alias) => {
            if (!songId || !alias) {
                return '请提供曲目 ID 和别名\n例: mai.alias.add 834 "测试"'
            }

            const success = await ctx.aliasManager?.addAlias('maimai', songId, alias)
            if (success) {
                return `已添加别名: ${alias} → ${songId}`
            } else {
                return `添加失败，该别名可能已存在`
            }
        })

    ctx.command('mai.alias.delete <alias:string>', '删除本地别名')
        .action(async ({ session }, alias) => {
            if (!alias) {
                return '请提供要删除的别名'
            }

            const success = await ctx.aliasManager?.deleteAlias('maimai', alias)
            if (success) {
                return `已删除别名: ${alias}`
            } else {
                return `删除失败，该别名不存在或不是本地别名`
            }
        })

    ctx.command('mai.alias.list [songId:number]', '查看别名列表')
        .action(async ({ session }, songId) => {
            if (!songId) {
                return '请提供曲目 ID\n例: mai.alias.list 834'
            }

            const aliases = await ctx.aliasManager?.getAliases('maimai', songId)
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
 * Convert API response to HtmlFrame B50Data format
 */
function convertToB50Data(data: any, qq?: string): import('../../services/htmlframe').B50Data {
    const charts = data.charts || { dx: [], sd: [] }

    const convertScore = (score: any, rank: number): ScoreItem => {
        // Song ID: 规范化后的 ID（LXNS 已对 10000 取余，DivingFish 直接返回）
        const songId = score.song_id || score.id || 0
        let coverId = parseInt(songId) || 0

        // 水鱼 cover: ID 10001~11000 使用 ID-10000，补足5位
        if (coverId > 10000 && coverId <= 11000) coverId -= 10000
        const dfCoverUrl = `https://www.diving-fish.com/covers/${String(coverId).padStart(5, '0')}.png`
        // LXNS 曲绘（作为 fallback）
        const lxnsCoverUrl = `https://assets2.lxns.net/maimai/jacket/${songId}.png`

        const rawType = (score.type || '').toLowerCase()
        const isDX = rawType === 'dx'

        return {
            id: songId,
            title: score.title || score.song_name || 'Unknown',
            level: score.ds != null ? String(score.ds) : (score.level_value != null ? String(score.level_value) : score.level || '?'),
            levelIndex: score.level_index ?? 3,
            rating: score.ra || (score.dx_rating != null ? Math.floor(score.dx_rating) : 0),
            score: score.achievements || 0,
            rank: rank,
            image: dfCoverUrl,
            fallbackImage: lxnsCoverUrl,
            type: isDX ? 'DX' : 'STD',
            rate: score.rate || 'sss',
            fc: (score.fc || '').toUpperCase() as any
        }
    }

    return {
        playerName: data.nickname || data.name || data.username || 'Player',
        playerRating: data.rating || 0,
        avatarUrl: data.avatar_url,
        qq,
        b35: (charts.sd || []).map((s: any, i: number) => convertScore(s, i + 1)),
        b15: (charts.dx || []).map((s: any, i: number) => convertScore(s, i + 1))
    }
}

export default registerMaimaiCommands
