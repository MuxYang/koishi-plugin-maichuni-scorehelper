import { Context, Schema } from 'koishi'
import { MaimaiStatus, Config as MaimaiStatusConfig } from './services/maimai-status'
import { HtmlFrame } from './services/htmlframe'

export const name = 'maichuni-scorehelper'
export const inject = {
  required: ['http', 'database'],
  optional: ['puppeteer']
}

export interface MaimaiMonitorName {
  id: number
  source: string
  monitor_id: number
  name: string
  updated_at: Date
}

export interface Config {
  statusMonitor: MaimaiStatusConfig
}

export const Config: Schema<Config> = Schema.object({
  statusMonitor: MaimaiStatusConfig.description('舞萌 DX 服务器状态监控'),
})

declare module 'koishi' {
  interface Context {
    puppeteer: any
  }
  interface Tables {
    maimai_monitor_name: MaimaiMonitorName
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh-CN', require('./locales/zh-CN').default)
  ctx.i18n.define('en-US', require('./locales/en-US').default)

  ctx.model.extend('maimai_monitor_name', {
    id: 'unsigned',
    source: 'string',
    monitor_id: 'integer',
    name: 'string',
    updated_at: 'timestamp'
  }, {
    autoInc: true,
    unique: [['source', 'monitor_id']]
  })

  ctx.plugin(MaimaiStatus, config.statusMonitor)
  ctx.plugin(HtmlFrame)
}