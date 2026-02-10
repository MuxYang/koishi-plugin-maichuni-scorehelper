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
            .description('水鱼开发者令牌'),
        lxnsDevToken: Schema.string()
            .description('落雪开发者令牌'),
    }).description('API 配置'),
    Schema.object({
        authToken: Schema.string()
            .pattern(/^[A-Za-z0-9]{32}$/)
            .description('加密验证令牌'),
        loginPageUrl: Schema.string()
            .description('登录页面 URL'),
    }).description('登录认证'),
    Schema.object({
        statusMonitor: MaimaiStatusConfig.description(''),
    }).description('服务器状态'),
    Schema.object({
        debug: Schema.boolean()
            .default(false)
            .description('调试模式'),
    }).description('调试'),
])
