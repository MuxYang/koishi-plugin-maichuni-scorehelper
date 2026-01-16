import { Context, Schema, Logger, Service } from 'koishi'
import fs from 'fs/promises'
import path from 'path'

const DEFAULT_STATUS_PAGE_URL = 'https://maistatusproxy.muxyang.com/status/maimai'
const DEFAULT_HEARTBEAT_API_URL = 'https://maistatusproxy.muxyang.com/api/status-page/heartbeat/maimai'

export const name = 'maimai-status-monitor'

export interface Config {
  interval: number
  targetChannelId?: string
  statusPageUrl: string
  heartbeatApiUrl: string
  debug?: boolean
}

export const Config: Schema<Config> = Schema.object({
  interval: Schema.number().default(60000).description('轮询间隔 (毫秒)，建议不低于 30000'),
  targetChannelId: Schema.string().description('推送通知的目标群组/频道 ID (可选，留空则仅在控制台输出)'),
  statusPageUrl: Schema.string().default(DEFAULT_STATUS_PAGE_URL).description('状态页 URL，默认使用内置反代，可自定义'),
  heartbeatApiUrl: Schema.string().default(DEFAULT_HEARTBEAT_API_URL).description('心跳 API URL，默认使用内置反代，可自定义'),
  debug: Schema.boolean().default(false).description('开启后输出详细调试日志')
})

interface MonitorItem {
  id: number
  name: string
  type: string
  tags: any[]
}

interface ServiceGroup {
  groupName: string
  ids: number[]
  lastNotifiedStatus: 'ONLINE' | 'OFFLINE' | null
  statusHistory: { timestamp: number, allUp: boolean, allDown: boolean }[]
  queryInterrupted: boolean
}

declare module 'koishi' {
  interface Context {
    maimaiStatus: MaimaiStatus
    puppeteer: any
  }
}

// 常量配置
const STATUS_WINDOW_MS = 10 * 60 * 1000  // 10分钟窗口

export class MaimaiStatus extends Service {
  private clientLogger: Logger
  private timer: NodeJS.Timeout | null = null
  private groups: Map<string, ServiceGroup> = new Map()
  private readonly CACHE_FILE = path.join(__dirname, '../../monitor_cache.json')
  private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'maimaiStatus')
    this.clientLogger = ctx.logger('maimai-status')
  }

  private logDebug(...args: any[]) {
    if (!this.config.debug) return
    this.clientLogger.info.apply(this.clientLogger, ['[debug]', ...args] as any)
  }

  protected async start() {
    this.clientLogger.info('Maimai status monitor started.')
    this.checkTask()
    this.timer = setInterval(() => this.checkTask(), this.config.interval)
  }

  protected async stop() {
    if (this.timer) clearInterval(this.timer)
    this.clientLogger.info('Maimai status monitor stopped.')
  }

  /**
   * [Public API] 获取当前状态汇总
   * 手动查询会中断当前的通知计时
   */
  public async getStatusSummary(): Promise<string> {
    await this.checkTask()

    if (this.groups.size === 0) {
      return '暂无服务器监控数据，请稍后再试。'
    }

    // 标记所有服务组为"被查询中断"
    for (const group of this.groups.values()) {
      group.queryInterrupted = true
    }

    const lines: string[] = ['📡 舞萌 DX 服务器状态：']
    
    for (const [name, group] of this.groups) {
      const latest = group.statusHistory[group.statusHistory.length - 1]
      let icon = '❓'
      let statusText = '未知'

      if (latest) {
        if (latest.allUp) {
          icon = '🟢'
          statusText = '正常'
        } else if (latest.allDown) {
          icon = '🔴'
          statusText = '全线中断'
        } else {
          icon = '🟡'
          statusText = '部分异常'
        }
      }

      lines.push(`${icon} ${name}: ${statusText}`)
    }

    lines.push(`\n🕒 更新时间：${new Date().toLocaleString()}`)
    return lines.join('\n')
  }

  private async checkTask() {
    try {
      const monitorItems = await this.fetchMonitorConfig()
      if (monitorItems && monitorItems.length > 0) {
        this.saveCache(monitorItems)
        this.syncGroups(monitorItems)
      } else {
        this.clientLogger.warn('Failed to fetch monitor config, trying cache...')
        const cachedItems = await this.loadCache()
        if (cachedItems.length > 0) {
          this.syncGroups(cachedItems)
          this.clientLogger.info(`Loaded ${cachedItems.length} monitor items from cache.`)
        }
      }

      const heartbeatData = await this.fetchHeartbeats()
      if (!heartbeatData) {
        this.clientLogger.warn('Failed to fetch heartbeat data.')
        return
      }
      
      const list = heartbeatData.heartbeatList
      if (!list) {
        if (heartbeatData && typeof heartbeatData === 'object' && !Array.isArray(heartbeatData)) {
          this.clientLogger.warn('Heartbeat data missing heartbeatList, using raw object keys fallback.')
          return await this.analyzeAndNotify(heartbeatData)
        }
        this.clientLogger.warn('Heartbeat data format invalid: list missing', Object.keys(heartbeatData))
        return
      }

      this.syncUnknownGroups(list)
      await this.analyzeAndNotify(list)

    } catch (e) {
      this.clientLogger.error('Error in check task:', e)
    }
  }

  private async saveCache(items: MonitorItem[]) {
    try {
      await fs.writeFile(this.CACHE_FILE, JSON.stringify(items, null, 2), 'utf-8')
    } catch (e) {
      this.clientLogger.warn('Failed to save monitor config cache:', e)
    }
  }

  private async loadCache(): Promise<MonitorItem[]> {
    try {
      const content = await fs.readFile(this.CACHE_FILE, 'utf-8')
      return JSON.parse(content)
    } catch (e) {
      return []
    }
  }

  private syncUnknownGroups(heartbeatData: any) {
    const knownIds = new Set<number>()
    for (const group of this.groups.values()) {
      group.ids.forEach(id => knownIds.add(id))
    }

    for (const idStr of Object.keys(heartbeatData)) {
      const id = Number(idStr)
      if (!knownIds.has(id)) {
        const name = `Service-${id}`
        if (!this.groups.has(name)) {
          this.clientLogger.info(`Detected new unknown service ID: ${id}`)
          this.groups.set(name, {
            groupName: name,
            ids: [id],
            lastNotifiedStatus: null,
            statusHistory: [],
            queryInterrupted: false
          })
        }
      }
    }
  }

  private async fetchMonitorConfig(): Promise<MonitorItem[]> {
    let data: any = null

    if (this.ctx.puppeteer) {
      try {
        const page = await this.ctx.puppeteer.page()
        try {
          await page.goto(this.config.statusPageUrl || DEFAULT_STATUS_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 })
          } catch (_) { /* ignore timeout */ }
          
          data = await page.evaluate(() => (window as any).preloadData)
          const bodySnippet = await page.evaluate(() => (document?.body?.innerText || '').slice(0, 50))
          this.logDebug(`[monitor] puppeteer body head: ${bodySnippet}`)
        } finally {
          await page.close()
        }
      } catch (e) {
        this.clientLogger.warn(`Puppeteer fetch failed: ${(e as any).message}, falling back to HTTP`)
      }
    }

    if (!data) {
      try {
        const html = await this.ctx.http.get(this.config.statusPageUrl || DEFAULT_STATUS_PAGE_URL, { 
          responseType: 'text',
          headers: { 'User-Agent': this.UA }
        })
        this.logDebug(`[monitor] http body head: ${String(html).slice(0, 50)}`)
        const regex = /window\.preloadData\s*=\s*(\{.*?\});/s
        const match = html.match(regex)
        
        if (match && match[1]) {
          const parseJsObject = new Function(`return ${match[1]}`)
          data = parseJsObject()
        }
      } catch (e) {
        this.clientLogger.error('Failed to parse monitor config from HTML', e)
      }
    }

    if (data) {
      const monitorList: MonitorItem[] = []
      this.logDebug('[monitor] parsed preloadData keys:', Object.keys(data || {}))
      if (data.config && Array.isArray(data.publicGroupList)) {
        for (const group of data.publicGroupList) {
          if (Array.isArray(group.monitorList)) {
            monitorList.push(...group.monitorList)
          }
        }
      }
      this.logDebug(`[monitor] monitorList length=${monitorList.length}`)
      return monitorList
    }
    
    return []
  }

  private syncGroups(items: MonitorItem[]) {
    const currentStructure = new Map<string, number[]>()

    for (const item of items) {
      let cleanName = item.name
        .replace(/^\[.*?\]\s*/, '')
        .replace(/\s*\[[^\]]+\]\s*$/, '')
        .trim()
      
      if (!cleanName) {
        cleanName = item.name
      }
      
      if (!currentStructure.has(cleanName)) {
        currentStructure.set(cleanName, [])
      }
      currentStructure.get(cleanName)?.push(item.id)
    }

    for (const [name, ids] of currentStructure) {
      if (!this.groups.has(name)) {
        this.groups.set(name, { 
          groupName: name, 
          ids, 
          lastNotifiedStatus: null,
          statusHistory: [],
          queryInterrupted: false
        })
      } else {
        const existing = this.groups.get(name)!
        existing.ids = ids
        existing.groupName = name
      }
    }
  }

  private async fetchHeartbeats(): Promise<any> {
    const url = this.config.heartbeatApiUrl || DEFAULT_HEARTBEAT_API_URL

    const fetchViaPuppeteer = async (): Promise<any | null> => {
      if (!this.ctx.puppeteer) return null
      let page: any = null
      try {
        page = await this.ctx.puppeteer.page()
        if (page.setUserAgent) {
          await page.setUserAgent(this.UA)
        }
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 })
        const body = await page.evaluate(() => document.body?.innerText || document.body?.textContent || '')
        this.logDebug(`[heartbeat] puppeteer body head: ${body.slice(0, 50)}`)
        if (!body) return null
        try {
          return JSON.parse(body)
        } catch (err2) {
          this.clientLogger.warn(`Puppeteer heartbeat parse failed: ${(err2 as any).message}; body=${body.slice(0, 200)}`)
          return null
        }
      } catch (pe) {
        this.clientLogger.warn(`Puppeteer heartbeat fetch failed: ${(pe as any).message}`)
        return null
      } finally {
        if (page) {
          try { await page.close() } catch { /* ignore */ }
        }
      }
    }

    try {
      let data = await this.ctx.http.get(url, {
        headers: { 'User-Agent': this.UA },
        timeout: 15000
      })
      this.logDebug(`[heartbeat] http body head: ${typeof data === 'string' ? data.slice(0, 50) : '[object]'}`)
      
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (err) {
          const snippet = data.slice(0, 200)
          this.clientLogger.warn(`Heartbeat JSON parse failed: ${(err as any).message}; snippet=${snippet}`)
          if (snippet.includes('<!DOCTYPE')) {
            const viaPuppeteer = await fetchViaPuppeteer()
            if (viaPuppeteer) return viaPuppeteer
          }
          return null
        }
      }
      
      this.logDebug('[heartbeat] parsed keys:', Array.isArray(data) ? `array length ${data.length}` : Object.keys(data || {}))
      return data || {}
    } catch (e) {
      this.clientLogger.warn(`HTTP heartbeat fetch failed, trying Puppeteer. reason=${(e as any)?.message || e}`)
      const viaPuppeteer = await fetchViaPuppeteer()
      if (viaPuppeteer) return viaPuppeteer

      this.clientLogger.error('Failed to fetch heartbeat JSON', e)
      return null
    }
  }

  /**
   * 核心逻辑 - 状态判定与通知
   * - 上线：连续10分钟全为状态1（正常）
   * - 下线：连续10分钟所有代理全部下线
   * - 用户手动查询会中断计时
   */
  private async analyzeAndNotify(heartbeatData: any) {
    const now = Date.now()

    for (const [name, group] of this.groups) {
      const { ids } = group
      
      let upCount = 0
      let downCount = 0
      let totalCount = 0

      for (const id of ids) {
        const history = heartbeatData[id]
        if (Array.isArray(history) && history.length > 0) {
          totalCount++
          const latest = history[history.length - 1]
          const rawStatus = typeof latest === 'object' && latest !== null ? (latest as any).status : latest
          const isUp = rawStatus === 1 || rawStatus === true || rawStatus === '1'
          const isDown = rawStatus === 0 || rawStatus === false || rawStatus === '0'
          if (isUp) upCount++
          else if (isDown) downCount++
        }
      }

      const allUp = totalCount > 0 && upCount === totalCount
      const allDown = totalCount > 0 && downCount === totalCount

      this.logDebug(`[status] ${name} up=${upCount} down=${downCount} total=${totalCount} allUp=${allUp} allDown=${allDown}`)

      group.statusHistory.push({ timestamp: now, allUp, allDown })
      group.statusHistory = group.statusHistory.filter(h => now - h.timestamp < STATUS_WINDOW_MS)

      await this.checkAndNotify(group, now)
    }
  }

  /**
   * 检查10分钟窗口内的状态并决定是否通知
   */
  private async checkAndNotify(group: ServiceGroup, now: number) {
    const { groupName, statusHistory, lastNotifiedStatus, queryInterrupted } = group
    
    if (statusHistory.length === 0) return

    const oldest = statusHistory[0]
    const windowDuration = now - oldest.timestamp
    
    if (windowDuration < STATUS_WINDOW_MS) {
      this.logDebug(`[notify] ${groupName} window not ready: ${Math.round(windowDuration / 1000)}s < ${STATUS_WINDOW_MS / 1000}s`)
      return
    }

    const allUpInWindow = statusHistory.every(h => h.allUp)
    const allDownInWindow = statusHistory.every(h => h.allDown)

    this.logDebug(`[notify] ${groupName} window check: allUp=${allUpInWindow} allDown=${allDownInWindow} lastNotified=${lastNotifiedStatus} interrupted=${queryInterrupted}`)

    let targetStatus: 'ONLINE' | 'OFFLINE' | null = null
    if (allUpInWindow) {
      targetStatus = 'ONLINE'
    } else if (allDownInWindow) {
      targetStatus = 'OFFLINE'
    }

    if (!targetStatus) return

    if (queryInterrupted) {
      if (targetStatus !== lastNotifiedStatus) {
        group.queryInterrupted = false
        this.logDebug(`[notify] ${groupName} query interrupt cleared due to status change`)
      } else {
        this.logDebug(`[notify] ${groupName} skipped: query interrupted, status unchanged`)
        return
      }
    }

    if (targetStatus === lastNotifiedStatus) {
      return
    }

    const message = targetStatus === 'ONLINE' 
      ? `${groupName} 上线`
      : `${groupName} 下线`
    
    this.clientLogger.info(`[${groupName}] ${message}`)
    await this.pushNotification(message)
    
    group.lastNotifiedStatus = targetStatus
    group.statusHistory = []
  }

  private async pushNotification(message: string) {
    if (this.config.targetChannelId) {
      try {
        const bot = this.ctx.bots[0]
        if (bot) {
          this.logDebug(`[push] send to ${this.config.targetChannelId}: ${message}`)
          await bot.sendMessage(this.config.targetChannelId, message)
        } else {
          this.clientLogger.warn('No bot available to send notification.')
        }
      } catch (e) {
        this.clientLogger.error('Failed to send notification:', e)
      }
    } else {
      this.clientLogger.debug('Notification skipped: targetChannelId not configured.')
    }
  }
}

export default MaimaiStatus
