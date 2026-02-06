import { Schema } from 'koishi'
import { Config as MaimaiStatusConfig } from './services/maimai-status'

export interface MaichuniConfig {
    // Developer tokens for API access
    divingfishDevToken?: string
    lxnsDevToken?: string

    // Authentication config
    authToken?: string
    loginPageUrl?: string

    // Maimai status monitoring (nested config)
    statusMonitor: typeof MaimaiStatusConfig extends Schema<infer T> ? T : never

    // Debug mode
    debug: boolean
}

export const Config: Schema<MaichuniConfig> = Schema.intersect([
    Schema.object({
        divingfishDevToken: Schema.string()
            .description('DivingFish 开发者令牌（可选，用于查询其他用户成绩）'),
        lxnsDevToken: Schema.string()
            .description('落雪查分器开发者令牌（可选）'),
    }).description('API 配置'),
    Schema.object({
        authToken: Schema.string()
            .pattern(/^[A-Za-z0-9]{32}$/)
            .description('加密验证令牌（32位随机字母数字组合，用于登录凭证加密）'),
        loginPageUrl: Schema.string()
            .description('登录页面 URL（用户获取加密登录令牌的页面地址）'),
    }).description('登录认证'),
    Schema.object({
        statusMonitor: MaimaiStatusConfig.description('舞萌 DX 服务器状态监控'),
    }).description('服务器状态监控'),
    Schema.object({
        debug: Schema.boolean()
            .default(false)
            .description('调试模式（输出详细日志）'),
    }).description('调试'),
])
