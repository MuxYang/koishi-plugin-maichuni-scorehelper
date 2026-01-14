import { Context, Schema, h } from 'koishi'
import { MaimaiStatus, Config as MaimaiStatusConfig } from './services/maimai-status'
import { HtmlFrame } from './services/htmlframe'

export const name = 'maichuni-scorehelper'
export const inject = {
  required: ['http', 'puppeteer'],
  optional: ['maimaiStatus', 'htmlframe']
}

export interface Config {
  maimaiMonitor: MaimaiStatusConfig
}

export const Config: Schema<Config> = Schema.object({
  maimaiMonitor: MaimaiStatusConfig.description('舞萌 DX 服务器状态监控配置'),
})

declare module 'koishi' {
  interface Context {
    puppeteer: any
  }
}

export function apply(ctx: Context, config: Config) {
  // Load Services
  ctx.plugin(MaimaiStatus, config.maimaiMonitor)
  ctx.plugin(HtmlFrame)

  ctx.command('maisms', '查看舞萌 DX 服务器状态')
    .alias('maimai-status')
    .action(async () => {
      return await ctx.maimaiStatus.getStatusSummary()
    })

  ctx.command('maib50test', '测试生成 MaiMai B50 成绩单图片')
    .action(async ({ session }) => {
      const mockData = {
        playerName: 'MuxYang',
        playerRating: 15432,
        avatarUrl: 'https://shama.koishi.chat/avatar.png',
        b35: Array(35).fill(null).map((_, i) => ({
          title: `Testing Song B35-${i + 1}`,
          level: '14.5',
          levelIndex: 3,
          rating: 280,
          score: 100.5,
          rank: i + 1,
          image: 'https://shama.koishi.chat/avatar.png', // Placeholder
          type: 'DX' as const,
          rate: 'SSS+',
          fc: 'FC+' as const
        })),
        b15: Array(15).fill(null).map((_, i) => ({
          title: `New Song B15-${i + 1}`,
          level: '13.2',
          levelIndex: 1,
          rating: 250,
          score: 100.1,
          rank: i + 1,
          image: 'https://shama.koishi.chat/avatar.png', // Placeholder
          type: 'STD' as const,
          rate: 'SSS',
          fc: 'AP' as const
        }))
      }

      try {
        const html = await ctx.htmlframe.generateHtml(mockData, 'maimai')
        // Render using puppeteer
        const page = await ctx.puppeteer.page()
        await page.setViewport({ width: 1600, height: 1000 })
        await page.setContent(html)
        // Wait for images to load if needed
        const element = await page.$('.x___x')
        // Using fullPage: true to capture everything
        const buffer = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true })
        await page.close()
        return h.image(buffer, 'image/jpeg')
      } catch (e) {
        ctx.logger('maib50test').error(e)
        return '生成图片失败：' + (e instanceof Error ? e.message : String(e))
      }
    })

  ctx.command('chub50test', '测试生成 Chunithm B50 成绩单图片')
    .action(async ({ session }) => {
      const mockData = {
        playerName: 'MuxYang',
        playerRating: 16120, // Example rating
        avatarUrl: 'https://shama.koishi.chat/avatar.png',
        b30: Array(30).fill(null).map((_, i) => ({
          title: `Chuni Song B30-${i + 1}`,
          level: '14.9',
          levelIndex: 2,
          rating: 285,
          score: 1008000,
          rank: i + 1,
          image: 'https://shama.koishi.chat/avatar.png', 
          type: 'STD' as const,
          rate: 'SSS',
          fc: 'AJ' as const
        })),
        n20: Array(20).fill(null).map((_, i) => ({
          title: `Chuni New N20-${i + 1}`,
          level: '13.8',
          levelIndex: 0,
          rating: 270,
          score: 100.1,
          rank: i + 1,
          image: 'https://shama.koishi.chat/avatar.png',
          type: 'DX' as const, // Might need 'NEW' or similar for Chuni, using existing types for now
          rate: 'SSS+',
          fc: 'FC' as const
        }))
      }

      try {
        const html = await ctx.htmlframe.generateHtml(mockData, 'chunithm')
        // Render using puppeteer
        const page = await ctx.puppeteer.page()
        await page.setViewport({ width: 1600, height: 1000 })
        await page.setContent(html)
        const element = await page.$('.x___x')
        const buffer = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true })
        await page.close()
        return h.image(buffer, 'image/jpeg')
      } catch (e) {
        ctx.logger('chub50test').error(e)
        return '生成图片失败：' + (e instanceof Error ? e.message : String(e))
      }
    })
}