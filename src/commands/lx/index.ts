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
                const testResult = await testLxnsToken(token)
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

            if (tokens.length === 0 || !tokens[0].lxns_token) {
                return '❌ 未绑定 lxns Token'
            }

            return '✅ lxns Token 已绑定'
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
async function testLxnsToken(token: string): Promise<{
    success: boolean
    error?: string
}> {
    try {
        // lxns API endpoint for profile/records
        const response = await fetch('https://maimai.lxns.net/api/v0/user/maimai/player', {
            method: 'GET',
            headers: {
                'Authorization': token,
                'User-Agent': 'Mozilla/5.0'
            }
        })

        if (response.ok) {
            return { success: true }
        }

        const data = await response.json().catch(() => ({}))
        return { success: false, error: data.message || `HTTP ${response.status}` }
    } catch (e) {
        return { success: false, error: '网络错误' }
    }
}

export default registerLxCommands
