import { Context } from 'koishi'
import { MaichuniConfig } from '../../config'
import { decryptAndValidate, reencryptForStorage, decryptStored } from '../../utils/crypto-utils'

/**
 * Register DivingFish (fish) authentication commands
 */
export function registerFishCommands(ctx: Context, config: MaichuniConfig) {
    const fish = ctx.command('fish', 'DivingFish 账号管理')
        .usage('使用 fish.login 绑定登录凭证\n使用 fish.bind 绑定导入 Token')

    // fish.login - bind encrypted login credentials
    ctx.command('fish.login <token:string>', '使用加密登录令牌绑定账号')
        .usage('从登录页面获取加密令牌后使用此命令绑定')
        .action(async ({ session }, token) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            if (!token) {
                const loginUrl = config.loginPageUrl || '(未配置登录页面)'
                return `请提供加密登录令牌\n获取方式: 访问 ${loginUrl} 生成令牌`
            }

            if (!config.authToken) {
                return '错误: 管理员未配置加密验证令牌 (authToken)'
            }

            // Decrypt and validate token (must be within 5 minutes)
            const validation = decryptAndValidate(token, config.authToken)

            if (!validation.success) {
                ctx.logger('fish.login').warn(`Token validation failed: ${validation.error}`)
                const loginUrl = config.loginPageUrl || '(未配置登录页面)'
                return `令牌无效或已过期\n请重新访问 ${loginUrl} 生成新令牌`
            }

            const creds = validation.data

            try {
                // Test login to DivingFish
                const loginResult = await testDivingFishLogin(ctx, creds.username, creds.password)
                if (!loginResult.success) {
                    return `登录验证失败: ${loginResult.error || '账号或密码错误'}`
                }

                // Re-encrypt for storage (new salt/iv)
                const encrypted = reencryptForStorage(creds, config.authToken)

                // Save to database
                await ctx.database.upsert('user_token', [{
                    platform: session.platform,
                    user_id: session.userId,
                    fish_encrypted_creds: encrypted,
                    updated_at: new Date()
                }], ['platform', 'user_id'])

                return `✅ DivingFish 账号绑定成功！\n用户名: ${creds.username}\n\n现在可以直接使用 mai.b50 / chu.b50 查询成绩`
            } catch (e) {
                ctx.logger('fish.login').error(e)
                return '绑定失败: 内部错误'
            }
        })

    // fish.bind - bind import token (simpler alternative)
    ctx.command('fish.bind <token:string>', '绑定 DivingFish 导入 Token')
        .usage('登录水鱼查分器后在设置页面获取 Import Token')
        .action(async ({ session }, token) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            if (!token) {
                return '请提供 Import Token\n获取方式: 登录水鱼查分器 → 设置 → 查看 Import Token'
            }

            try {
                // Verify token by making a test request
                const testResult = await testImportToken(ctx, token)
                if (!testResult.success) {
                    return `Token 验证失败: ${testResult.error || '无效的 Token'}`
                }

                // Save to database
                await ctx.database.upsert('user_token', [{
                    platform: session.platform,
                    user_id: session.userId,
                    maimai_token: token,
                    updated_at: new Date()
                }], ['platform', 'user_id'])

                return '✅ DivingFish Import Token 绑定成功！'
            } catch (e) {
                ctx.logger('fish.bind').error(e)
                return '绑定失败: 内部错误'
            }
        })

    // fish.status - show current binding status
    ctx.command('fish.status', '查看当前绑定状态')
        .action(async ({ session }) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            const tokens = await ctx.database.get('user_token', {
                platform: session.platform,
                user_id: session.userId
            })

            if (tokens.length === 0) {
                return '❌ 未绑定任何 DivingFish 账号'
            }

            const user = tokens[0]
            const lines: string[] = ['📊 DivingFish 绑定状态:']

            if (user.fish_encrypted_creds) {
                if (config.authToken) {
                    const creds = decryptStored(user.fish_encrypted_creds, config.authToken)
                    if (creds) {
                        lines.push(`  ✅ 账号登录: ${creds.username}`)
                    } else {
                        lines.push('  ⚠️ 账号登录: 解密失败 (需重新绑定)')
                    }
                } else {
                    lines.push('  ⚠️ 账号登录: 管理员未配置 authToken')
                }
            }

            if (user.maimai_token) {
                lines.push(`  ✅ Import Token: 已绑定`)
            }

            if (!user.fish_encrypted_creds && !user.maimai_token) {
                lines.push('  ❌ 未绑定')
            }

            return lines.join('\n')
        })

    // fish.unbind - remove bindings
    ctx.command('fish.unbind', '解除 DivingFish 绑定')
        .action(async ({ session }) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            await ctx.database.set('user_token', {
                platform: session.platform,
                user_id: session.userId
            }, {
                fish_encrypted_creds: null,
                maimai_token: null
            })

            return '✅ 已解除 DivingFish 绑定'
        })

    // fish.enable - switch preferred source
    ctx.command('fish.enable', '切换数据源为 DivingFish')
        .action(async ({ session }) => {
            if (!session?.userId || !session?.platform) {
                return '无法获取用户信息'
            }

            await ctx.database.upsert('user_token', [{
                platform: session.platform,
                user_id: session.userId,
                preferred_mode: 'fish',
                updated_at: new Date()
            }], ['platform', 'user_id'])

            return '✅ 已切换数据源为 DivingFish'
        })
}

/**
 * Test DivingFish login credentials
 */
async function testDivingFishLogin(ctx: Context, username: string, password: string): Promise<{
    success: boolean
    error?: string
}> {
    try {
        await ctx.http.post('https://www.diving-fish.com/api/maimaidxprober/login', {
            username, password
        }, {
            headers: {
                'Content-Type': 'application/json',
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

/**
 * Test Import Token validity
 */
async function testImportToken(ctx: Context, token: string): Promise<{
    success: boolean
    error?: string
}> {
    try {
        await ctx.http.get('https://www.diving-fish.com/api/maimaidxprober/player/records', {
            headers: {
                'Import-Token': token,
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

export default registerFishCommands
