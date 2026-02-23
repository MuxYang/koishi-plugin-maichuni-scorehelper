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
        loginPageUrl: Schema.string()
            .description('水鱼登录页面 URL（见本项目仓库中fish-login-page文件夹，可在阿里云ESA或Cloudflare Pages部署）'),
    }).description('登录认证'),
    Schema.object({
        divingfishDevToken: Schema.string()
            .role('secret')
            .description('水鱼开发者令牌（舞萌DX 默认数据源）'),
        lxnsDevToken: Schema.string()
            .role('secret')
            .description('落雪开发者令牌（中二节奏默认数据源，配置后可通过 QQ 号自动查询未绑定用户）'),
        authToken: Schema.string()
            .role('secret')
            .pattern(/^[A-Za-z0-9]{32}$/)
            .description('加密验证令牌'),
    }).description('API 配置'),
    Schema.object({
        statusMonitor: MaimaiStatusConfig.description(''),
    }).description('服务器状态'),
    Schema.object({
        debug: Schema.boolean()
            .default(false)
            .description('调试模式'),
    }).description('调试'),
])
