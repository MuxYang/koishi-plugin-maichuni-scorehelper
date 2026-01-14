import { Context, Schema } from 'koishi'
import { MaimaiStatus, Config as MaimaiStatusConfig } from './services/maimai-status'

export const name = 'maichuni-scorehelper'
export const inject = ['http']

export interface Config {
  maimaiMonitor: MaimaiStatusConfig
}

export const Config: Schema<Config> = Schema.object({
  maimaiMonitor: MaimaiStatusConfig.description('舞萌 DX 服务器状态监控配置'),
})

export function apply(ctx: Context, config: Config) {
  // Load Maimai Status Monitor Service
  ctx.plugin(MaimaiStatus, config.maimaiMonitor)

  ctx.command('maisms', '查看舞萌 DX 服务器状态')
    .alias('maimai-status')
    .action(async () => {
      return await ctx.maimaiStatus.getStatusSummary()
    })
}