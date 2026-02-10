import { Context } from 'koishi'
import { Config, MaichuniConfig } from './config'
import { registerTables } from './database'
import { MaimaiStatus } from './services/maimai-status'
import { HtmlFrame } from './services/htmlframe'
import { AliasManager } from './services/alias-manager'
import { MaimaiQuery } from './services/maimai-query'
import { ChunithmQuery } from './services/chunithm-query'
import { SongDataManager } from './services/song-data'
import { ImageCacheManager } from './services/cache-manager'
import { registerMaimaiCommands } from './commands/maimai'
import { registerChunithmCommands } from './commands/chunithm'
import { registerFishCommands } from './commands/fish'
import { registerLxCommands } from './commands/lx'

export const name = 'maichuni-scorehelper'
export const inject = {
  required: ['http', 'database'],
  optional: ['puppeteer']
}

export { Config, MaichuniConfig }

declare module 'koishi' {
  interface Context {
    puppeteer: any
  }
}

export function apply(ctx: Context, config: MaichuniConfig) {
  const logger = ctx.logger('maichuni-scorehelper')
  
  // Load i18n
  ctx.i18n.define('zh-CN', require('./locales/zh-CN').default)
  ctx.i18n.define('en-US', require('./locales/en-US').default)

  // Register database tables
  registerTables(ctx)

  // Register internal services
  ctx.plugin(ImageCacheManager)
  ctx.plugin(HtmlFrame, { debug: config.debug })
  ctx.plugin(AliasManager, { debug: config.debug })
  ctx.plugin(SongDataManager)
  ctx.plugin(MaimaiStatus, {
    ...config.statusMonitor,
    debug: config.debug
  })
  
  if (config.debug) {
    logger.info('[DEBUG] 调试模式已启用，将输出详细日志')
  }
  
  ctx.plugin(MaimaiQuery, {
    divingfishDevToken: config.divingfishDevToken,
    lxnsDevToken: config.lxnsDevToken,
    authToken: config.authToken,
    debug: config.debug
  })
  ctx.plugin(ChunithmQuery, {
    divingfishDevToken: config.divingfishDevToken,
    lxnsDevToken: config.lxnsDevToken,
    authToken: config.authToken,
    debug: config.debug
  })

  // Register commands
  registerMaimaiCommands(ctx, config)
  registerChunithmCommands(ctx, config)
  registerFishCommands(ctx, config)
  registerLxCommands(ctx, config)
  
  if (config.debug) {
    logger.info('maimai 和 CHUNITHM 查分插件已启动')
  }
}