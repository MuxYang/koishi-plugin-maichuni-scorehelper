import { Context } from 'koishi'
import { MaichuniConfig } from '../../config'

/**
 * Register lxns (落雪查分器) authentication commands
 */
export function registerLxCommands(ctx: Context, config: MaichuniConfig) {
    const lx = ctx.command('lx', 'lxns 账号管理')
        .usage('使用 lx.bind 绑定 Token')

    // lx.bind - bind lxns token
    ctx.command('lx.bind <token:string>', '绑定 lxns Token')
        .usage('登录落雪查分器后获取 Token')
        .action(async ({ session }, token) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            if (!token) {
                return '请提供 lxns Token\n获取方式: 登录落雪查分器获取'
            }

            try {
                // Verify token
                const testResult = await testLxnsToken(ctx, token)
                if (!testResult.success) {
                    return `Token 验证失败: ${testResult.error || '无效的 Token'}`
                }

                // Save to database
                await ctx.database.upsert('user_token', [{
                    platform: session.platform,
                    user_id: session.userId,
                    lxns_token: token,
                    updated_at: new Date()
                }], ['platform', 'user_id'])

                return '✅ lxns Token 绑定成功！'
            } catch (e) {
                ctx.logger('lx.bind').error(e)
                return '绑定失败: 内部错误'
            }
        })

    // lx.status - show current binding status
    ctx.command('lx.status', '查看当前绑定状态')
        .action(async ({ session }) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            const tokens = await ctx.database.get('user_token', {
                platform: session.platform,
                user_id: session.userId
            })

            if (tokens.length === 0) {
                return '❌ 未绑定任何信息'
            }

            const record = tokens[0]
            const lines: string[] = ['📋 lxns 绑定状态:']
            lines.push(record.lxns_token ? '✅ Token 已绑定' : '❌ Token 未绑定')
            lines.push(record.lxns_friend_code ? `✅ 好友码: ${record.lxns_friend_code}` : '❌ 好友码未绑定')
            if (record.preferred_mode) {
                lines.push(`📡 当前数据源: ${record.preferred_mode}`)
            }

            return lines.join('\n')
        })

    // lx.unbind - remove binding
    ctx.command('lx.unbind', '解除 lxns 绑定')
        .action(async ({ session }) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            await ctx.database.set('user_token', {
                platform: session.platform,
                user_id: session.userId
            }, {
                lxns_token: null
            })

            return '✅ 已解除 lxns 绑定'
        })

    // lx.bindfc - bind lxns friend code
    ctx.command('lx.bindfc <friendCode:number>', '绑定落雪好友码')
        .usage('好友码可在落雪查分器个人页面查看')
        .action(async ({ session }, friendCode) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            if (!friendCode || friendCode <= 0) {
                return '请提供有效的好友码\n例: lx.bindfc 123456789'
            }

            try {
                // Verify friend code by querying lxns API
                const playerData = await ctx.http.get(`https://maimai.lxns.net/api/v0/maimai/player/${friendCode}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 15000
                }).catch(() => null)

                if (!playerData) {
                    return '好友码验证失败: 无法找到该好友码对应的玩家'
                }

                const playerName = playerData?.data?.name || playerData?.name || '未知'

                // Save to database
                await ctx.database.upsert('user_token', [{
                    platform: session.platform,
                    user_id: session.userId,
                    lxns_friend_code: friendCode,
                    updated_at: new Date()
                }], ['platform', 'user_id'])

                return `✅ 好友码绑定成功！\n玩家: ${playerName}\n好友码: ${friendCode}`
            } catch (e) {
                ctx.logger('lx.bindfc').error(e)
                return '绑定失败: 内部错误'
            }
        })

    // lx.enable - switch preferred source
    ctx.command('lx.enable', '切换数据源为 lxns')
        .action(async ({ session }) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            await ctx.database.upsert('user_token', [{
                platform: session.platform,
                user_id: session.userId,
                preferred_mode: 'lxns',
                updated_at: new Date()
            }], ['platform', 'user_id'])

            return '✅ 已切换数据源为 lxns'
        })
}

/**
 * Test lxns Token validity
 */
async function testLxnsToken(ctx: Context, token: string): Promise<{
    success: boolean
    error?: string
}> {
    try {
        // lxns API endpoint for profile/records
        const data = await ctx.http.get('https://maimai.lxns.net/api/v0/user/maimai/player', {
            headers: {
                'Authorization': token,
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 15000
        })
        return { success: true }
    } catch (e: any) {
        if (e?.response?.status) {
            return { success: false, error: `HTTP ${e.response.status}` }
        }
        return { success: false, error: '网络错误' }
    }
}

export default registerLxCommands
