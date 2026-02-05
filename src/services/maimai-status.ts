import { Context, Schema, Logger, Service } from 'koishi'
import fs from 'fs/promises'
import path from 'path'

export const name = 'maimai-status-monitor'

const AWMC_STATUS_PAGE_URL = 'https://status.awmc.cc/status/maimai'
const AWMC_HEARTBEAT_API_URL = 'https://status.awmc.cc/api/status-page/heartbeat/maimai'

const UPTIME_PRESETS: Record<string, { webUrl: string; apiUrl: string; parser: string }> = {
  'uptime-kuma': {
    webUrl: 'https://your-uptime-kuma.com/status/page',
    apiUrl: 'https://your-uptime-kuma.com/api/status-page/heartbeat/page',
    parser: 'uptime-kuma'
  },
  'uptimerobot': {
    webUrl: 'https://stats.uptimerobot.com/your-page',
    apiUrl: 'https://api.uptimerobot.com/v2/getMonitors',
    parser: 'uptimerobot'
  },
  'hetrixtools': {
    webUrl: 'https://hetrixtools.com/r/your-page',
    apiUrl: 'https://api.hetrixtools.com/v1/uptime/report',
    parser: 'hetrixtools'
  }
}

// 内置翻译 (中文默认)
const I18N: Record<string, Record<string, string>> = {
  'zh-CN': {
    'no-data': '暂无服务器监控数据，请稍后再试。',
    'header': '舞萌 DX 服务器状态:',
    'online': '在线',
    'offline': '中断',
    'maintenance': '监测点维护',
    'partial': '部分异常',
    'unknown': '未知',
    'data-source': '数据源',
    'push-enabled-no-targets': '推送已启用但未配置推送目标',
    'invalid-target-format': '无效的推送目标格式',
    'api-failed-fallback-web': 'API 请求失败，尝试从 Web 页面同步...',
    'invalid-heartbeat-format': '心跳数据格式无效',
    'new-service-detected': '发现新服务 ID，需要同步名称',
    'synced-names': '同步了服务名称',
    'other-source-no-api': '未配置其他数据源的 API 地址',
    'fetch-other-failed': '获取其他数据源失败',
    'parse-failed': '解析数据源响应失败',
    'custom-needs-format': '自定义数据源需要提供 API 格式模板',
    'save-cache-failed': '保存缓存失败',
    'loaded-from-cache': '从缓存加载了监控项',
    'detected-new-service': '检测到新服务',
    'puppeteer-failed': 'Puppeteer 获取失败',
    'html-parse-failed': '从 HTML 解析监控配置失败',
    'heartbeat-parse-failed': '心跳 JSON 解析失败',
    'http-heartbeat-failed': 'HTTP 心跳获取失败',
    'window-not-ready': '窗口未就绪',
    'no-bot-available': '没有可用的 Bot 发送通知',
    'push-to-target': '推送成功',
    'push-failed': '推送失败',
    'monitor-started': '舞萌状态监控已启动',
    'monitor-stopped': '舞萌状态监控已停止',
    'check-task-error': '检查任务出错'
  },
  'en-US': {
    'no-data': 'No server monitoring data available, please try again later.',
    'header': 'MaiMai DX Server Status:',
    'online': 'Online',
    'offline': 'Offline',
    'maintenance': 'Maintenance',
    'partial': 'Partial Issues',
    'unknown': 'Unknown',
    'data-source': 'Data Source',
    'push-enabled-no-targets': 'Push enabled but no targets configured',
    'invalid-target-format': 'Invalid push target format',
    'api-failed-fallback-web': 'API request failed, trying to sync from web page...',
    'invalid-heartbeat-format': 'Invalid heartbeat data format',
    'new-service-detected': 'New service ID detected, syncing names',
    'synced-names': 'Synced service names',
    'other-source-no-api': 'Other data source API URL not configured',
    'fetch-other-failed': 'Failed to fetch other data source',
    'parse-failed': 'Failed to parse data source response',
    'custom-needs-format': 'Custom data source requires API format template',
    'save-cache-failed': 'Failed to save cache',
    'loaded-from-cache': 'Loaded monitor items from cache',
    'detected-new-service': 'Detected new service',
    'puppeteer-failed': 'Puppeteer fetch failed',
    'html-parse-failed': 'Failed to parse monitor config from HTML',
    'heartbeat-parse-failed': 'Heartbeat JSON parse failed',
    'http-heartbeat-failed': 'HTTP heartbeat fetch failed',
    'window-not-ready': 'Window not ready',
    'no-bot-available': 'No bot available to send notification',
    'push-to-target': 'Push successful',
    'push-failed': 'Push failed',
    'monitor-started': 'Maimai status monitor started',
    'monitor-stopped': 'Maimai status monitor stopped',
    'check-task-error': 'Error in check task'
  }
}

export interface OtherSourceConfig {
  preset: 'uptime-kuma' | 'uptimerobot' | 'hetrixtools' | 'custom'
  webUrl?: string
  apiUrl?: string
  apiFormat?: string
  checkInterval?: number
}

export interface Config {
  dataSource: 'awmc' | 'other'
  otherSource?: OtherSourceConfig
  enablePush: boolean
  pushTargets?: string[]
  debug?: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  // 数据源选择（最顶部）
  Schema.object({
    dataSource: Schema.union([
      Schema.const('awmc').description('status.awmc.cc (内置)'),
      Schema.const('other').description('其他数据源'),
    ]).default('awmc').description('数据源'),
  }).description('数据源设置'),

  // 其他数据源配置（仅当选择 other 时显示）
  Schema.union([
    Schema.object({
      dataSource: Schema.const('other'),
      otherSource: Schema.intersect([
        Schema.object({
          preset: Schema.union([
            Schema.const('uptime-kuma').description('Uptime Kuma'),
            Schema.const('uptimerobot').description('UptimeRobot'),
            Schema.const('hetrixtools').description('HetrixTools'),
            Schema.const('custom').description('自定义'),
          ]).default('uptime-kuma').description('服务类型'),
          checkInterval: Schema.number()
            .default(600)
            .min(0)
            .description('检查间隔（秒），0 = 仅手动查询'),
        }),
        Schema.union([
          Schema.object({
            preset: Schema.const('custom'),
            apiUrl: Schema.string().required().description('API 地址'),
            webUrl: Schema.string().description('Web 页面 URL（可选）'),
            apiFormat: Schema.string()
              .role('textarea')
              .description('API 响应格式模板（仅支持 JSON）'),
          }),
          Schema.object({
            preset: Schema.const('uptime-kuma'),
            apiUrl: Schema.string().required().description('API 地址'),
            webUrl: Schema.string().description('Web 页面 URL（可选）'),
          }),
          Schema.object({
            preset: Schema.const('uptimerobot'),
            apiUrl: Schema.string().required().description('API 地址'),
            webUrl: Schema.string().description('Web 页面 URL（可选）'),
          }),
          Schema.object({
            preset: Schema.const('hetrixtools'),
            apiUrl: Schema.string().required().description('API 地址'),
            webUrl: Schema.string().description('Web 页面 URL（可选）'),
          }),
          Schema.object({}),
        ]),
      ]).description('自定义数据源配置'),
    }),
    Schema.object({
      dataSource: Schema.const('awmc'),
    }),
  ]),

  // 推送设置
  Schema.object({
    enablePush: Schema.boolean().default(false).description('启用状态变化推送通知'),
  }).description('推送设置'),

  // 推送目标（仅当启用推送时显示）
  Schema.union([
    Schema.object({
      enablePush: Schema.const(true),
      pushTargets: Schema.array(Schema.string())
        .role('table')
        .description('推送目标列表，格式: user:ID 或 group:ID'),
    }),
    Schema.object({
      enablePush: Schema.const(false),
    }),
  ]),

  // 调试选项（最底部）
  Schema.object({
    debug: Schema.boolean().default(false).description('开启调试日志'),
  }).description('高级设置'),
])

interface MonitorItem {
  id: number
  name: string
  type: string
  tags: any[]
}

interface ServiceGroup {
  groupName: string
  ids: number[]
  lastNotifiedStatus: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | null
  statusHistory: { timestamp: number; allUp: boolean; allDown: boolean; allMaintenance: boolean }[]
  queryInterrupted: boolean
}

interface CachedServiceNames {
  [id: number]: string
}

declare module 'koishi' {
  interface Context {
    maimaiStatus: MaimaiStatus
    puppeteer: any
  }
}

const STATUS_WINDOW_MS = 10 * 60 * 1000
const API_INTERVAL_MS = 10 * 60 * 1000

export class MaimaiStatus extends Service {
  private statusLogger: Logger
  private timer: NodeJS.Timeout | null = null
  private groups: Map<string, ServiceGroup> = new Map()
  private lastUptimeData: Record<string, number> = {}
  private cachedServiceNames: CachedServiceNames = {}
  private readonly CACHE_FILE: string
  private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  private locale: string = 'zh-CN'

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'maimaiStatus')
    this.statusLogger = ctx.logger('maimai-status')
    this.CACHE_FILE = path.join(__dirname, '../../monitor_cache.json')
  }

  private t(key: string): string {
    return I18N[this.locale]?.[key] || I18N['zh-CN'][key] || key
  }

  private logDebug(...args: any[]) {
    if (!this.config.debug) return
    this.statusLogger.info('[debug]', ...args)
  }

  protected async start() {
    this.statusLogger.info(this.t('monitor-started'))
    await this.loadCache()

    if (this.config.enablePush && this.validatePushTargets()) {
      // 确定检查间隔
      let intervalMs: number
      if (this.config.dataSource === 'awmc') {
        intervalMs = API_INTERVAL_MS // AWMC 固定 10 分钟
      } else {
        const checkInterval = this.config.otherSource?.checkInterval ?? 600
        intervalMs = checkInterval * 1000
      }

      this.checkTask()
      if (intervalMs > 0) {
        this.timer = setInterval(() => this.checkTask(), intervalMs)
        this.logDebug(`定时检查已启动，间隔: ${intervalMs / 1000}s`)
      }
    }
  }

  protected async stop() {
    if (this.timer) clearInterval(this.timer)
    this.statusLogger.info(this.t('monitor-stopped'))
  }

  private validatePushTargets(): boolean {
    const targets = this.config.pushTargets
    if (!targets || targets.length === 0) {
      this.statusLogger.warn(this.t('push-enabled-no-targets'))
      return false
    }

    const validPattern = /^(user|group):\w+$/
    for (const target of targets) {
      if (!validPattern.test(target)) {
        this.statusLogger.warn(`${this.t('invalid-target-format')}: ${target}`)
        return false
      }
    }
    return true
  }

  private getDataSourceName(): string {
    if (this.config.dataSource === 'awmc') {
      return 'status.awmc.cc'
    }

    const otherSource = this.config.otherSource
    if (!otherSource) return this.t('unknown')

    if (otherSource.preset === 'custom' && otherSource.webUrl) {
      try {
        const url = new URL(otherSource.webUrl)
        return url.hostname
      } catch {
        return otherSource.webUrl
      }
    }

    const presetNames: Record<string, string> = {
      'uptime-kuma': 'Uptime Kuma',
      'uptimerobot': 'UptimeRobot',
      'hetrixtools': 'HetrixTools'
    }
    return presetNames[otherSource.preset] || otherSource.preset
  }

  public async getStatusSummary(): Promise<string> {
    await this.checkTask()

    if (this.groups.size === 0) {
      return this.t('no-data')
    }

    for (const group of this.groups.values()) {
      group.queryInterrupted = true
    }

    const lines: string[] = [this.t('header')]

    for (const [name, group] of this.groups) {
      const latest = group.statusHistory[group.statusHistory.length - 1]
      let statusText = this.t('unknown')

      if (latest) {
        if (latest.allUp) {
          statusText = this.t('online')
        } else if (latest.allMaintenance) {
          statusText = this.t('maintenance')
        } else if (latest.allDown) {
          statusText = this.t('offline')
        } else {
          statusText = this.t('partial')
        }
      }

      let uptimeStr = ''
      if (this.lastUptimeData && group.ids.length > 0) {
        let totalUptime = 0
        let count = 0
        for (const id of group.ids) {
          const key = `${id}_24`
          if (typeof this.lastUptimeData[key] === 'number') {
            totalUptime += this.lastUptimeData[key]
            count++
          }
        }
        if (count > 0) {
          const avgUptime = (totalUptime / count) * 100
          uptimeStr = `[${avgUptime.toFixed(1)}%]`
        }
      }

      const cleanName = name.replace(/舞萌\s*DX\s*[-_]+\s*/i, '').trim() || name
      lines.push(`${cleanName}: ${statusText}${uptimeStr}`)
    }

    lines.push(`${this.t('data-source')}: ${this.getDataSourceName()}`)
    return lines.join('\n')
  }

  private async checkTask() {
    try {
      if (this.config.dataSource === 'awmc') {
        await this.checkAwmcSource()
      } else {
        await this.checkOtherSource()
      }
    } catch (e) {
      this.statusLogger.error(this.t('check-task-error'), e)
    }
  }

  private async checkAwmcSource() {
    const heartbeatData = await this.fetchHeartbeats(AWMC_HEARTBEAT_API_URL)

    if (!heartbeatData) {
      this.statusLogger.warn(this.t('api-failed-fallback-web'))
      await this.syncServiceNamesFromWeb()
      return
    }

    if (heartbeatData.uptimeList) {
      this.lastUptimeData = heartbeatData.uptimeList
    }

    const list = heartbeatData.heartbeatList
    if (!list) {
      this.statusLogger.warn(this.t('invalid-heartbeat-format'))
      return
    }

    const needWebSync = this.checkForNewServiceIds(list)
    if (needWebSync) {
      await this.syncServiceNamesFromWeb()
    }

    this.syncUnknownGroups(list)
    await this.analyzeAndNotify(list)
  }

  private checkForNewServiceIds(heartbeatData: any): boolean {
    for (const idStr of Object.keys(heartbeatData)) {
      const id = Number(idStr)
      if (!this.cachedServiceNames[id]) {
        this.logDebug(`${this.t('new-service-detected')}: ${id}`)
        return true
      }
    }
    return false
  }

  private async syncServiceNamesFromWeb() {
    const monitorItems = await this.fetchMonitorConfig()
    if (monitorItems && monitorItems.length > 0) {
      for (const item of monitorItems) {
        this.cachedServiceNames[item.id] = item.name
      }
      await this.saveCache(monitorItems)
      this.syncGroups(monitorItems)
      this.logDebug(`${this.t('synced-names')}: ${monitorItems.length}`)
    }
  }

  private async checkOtherSource() {
    const otherSource = this.config.otherSource
    if (!otherSource || !otherSource.apiUrl) {
      this.statusLogger.warn(this.t('other-source-no-api'))
      return
    }

    try {
      const data = await this.ctx.http.get(otherSource.apiUrl, {
        headers: { 'User-Agent': this.UA },
        timeout: 15000
      })

      const parsed = this.parseOtherSourceData(data, otherSource)
      if (parsed) {
        await this.processOtherSourceData(parsed)
      }
    } catch (e) {
      this.statusLogger.error(this.t('fetch-other-failed'), e)
    }
  }

  private parseOtherSourceData(data: any, config: OtherSourceConfig): any[] | null {
    try {
      switch (config.preset) {
        case 'uptime-kuma':
          return this.parseUptimeKumaData(data)
        case 'uptimerobot':
          return this.parseUptimeRobotData(data)
        case 'hetrixtools':
          return this.parseHetrixToolsData(data)
        case 'custom':
          return this.parseCustomData(data, config.apiFormat)
        default:
          return null
      }
    } catch (e) {
      this.statusLogger.error(this.t('parse-failed'), e)
      return null
    }
  }

  private parseUptimeKumaData(data: any): any[] {
    const result: any[] = []
    if (data.heartbeatList) {
      for (const [id, history] of Object.entries(data.heartbeatList)) {
        if (Array.isArray(history) && history.length > 0) {
          const latest = history[history.length - 1] as any
          result.push({
            id: Number(id),
            name: this.cachedServiceNames[Number(id)] || `Service-${id}`,
            status: latest.status,
            uptime: data.uptimeList?.[`${id}_24`] || 0
          })
        }
      }
    }
    return result
  }

  private parseUptimeRobotData(data: any): any[] {
    if (!data.monitors) return []
    return data.monitors.map((m: any) => ({
      id: m.id,
      name: m.friendly_name || m.url,
      status: m.status === 2 ? 1 : 0,
      uptime: m.custom_uptime_ratio ? parseFloat(m.custom_uptime_ratio) / 100 : 0
    }))
  }

  private parseHetrixToolsData(data: any): any[] {
    if (!Array.isArray(data)) return []
    return data.map((m: any) => ({
      id: m.id,
      name: m.name,
      status: m.status === 'up' ? 1 : 0,
      uptime: m.uptime_ratio || 0
    }))
  }

  private parseCustomData(data: any, formatTemplate?: string): any[] | null {
    if (!formatTemplate) {
      this.statusLogger.warn(this.t('custom-needs-format'))
      return null
    }

    try {
      const monitors = this.extractMonitorsFromData(data)
      if (!monitors) return null

      return monitors.map((m: any) => ({
        id: m.id ?? m.monitor_id ?? 0,
        name: m.name ?? m.friendly_name ?? m.title ?? 'Unknown',
        status: this.normalizeStatus(m.status ?? m.state ?? m.is_up),
        uptime: m.uptime ?? m.uptime_ratio ?? 0
      }))
    } catch (e) {
      this.statusLogger.error(this.t('parse-failed'), e)
      return null
    }
  }

  private extractMonitorsFromData(data: any): any[] | null {
    if (Array.isArray(data)) return data
    if (data.monitors && Array.isArray(data.monitors)) return data.monitors
    if (data.data && Array.isArray(data.data)) return data.data
    if (data.results && Array.isArray(data.results)) return data.results
    if (data.heartbeatList) {
      return Object.entries(data.heartbeatList).map(([id, history]) => ({
        id: Number(id),
        status: Array.isArray(history) && history.length > 0
          ? (history[history.length - 1] as any).status
          : 0
      }))
    }
    return null
  }

  private normalizeStatus(status: any): number {
    if (status === 1 || status === true || status === '1' || status === 'up' || status === 'online') {
      return 1
    }
    if (status === 3 || status === '3' || status === 'maintenance') {
      return 3
    }
    return 0
  }

  private async processOtherSourceData(monitors: any[]) {
    for (const monitor of monitors) {
      this.cachedServiceNames[monitor.id] = monitor.name

      if (!this.groups.has(monitor.name)) {
        this.groups.set(monitor.name, {
          groupName: monitor.name,
          ids: [monitor.id],
          lastNotifiedStatus: null,
          statusHistory: [],
          queryInterrupted: false
        })
      }

      const uptimeKey = `${monitor.id}_24`
      if (typeof monitor.uptime === 'number') {
        this.lastUptimeData[uptimeKey] = monitor.uptime
      }
    }

    const heartbeatData: Record<string, any[]> = {}
    for (const monitor of monitors) {
      heartbeatData[monitor.id] = [{ status: monitor.status }]
    }

    await this.analyzeAndNotify(heartbeatData)
  }

  private async saveCache(items: MonitorItem[]) {
    try {
      const cacheData = {
        items,
        serviceNames: this.cachedServiceNames
      }
      await fs.writeFile(this.CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8')
    } catch (e) {
      this.statusLogger.warn(this.t('save-cache-failed'), e)
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const content = await fs.readFile(this.CACHE_FILE, 'utf-8')
      const cacheData = JSON.parse(content)

      if (cacheData.serviceNames) {
        this.cachedServiceNames = cacheData.serviceNames
      }

      if (cacheData.items && Array.isArray(cacheData.items)) {
        this.syncGroups(cacheData.items)
        this.statusLogger.info(`${this.t('loaded-from-cache')}: ${cacheData.items.length}`)
      }
    } catch {
      this.cachedServiceNames = {}
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
        const name = this.cachedServiceNames[id] || `Service-${id}`
        if (!this.groups.has(name)) {
          this.logDebug(`${this.t('detected-new-service')}: ${name} (ID: ${id})`)
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
          await page.goto(AWMC_STATUS_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 })
          } catch { }

          data = await page.evaluate(() => (window as any).preloadData)
        } finally {
          await page.close()
        }
      } catch (e) {
        this.statusLogger.warn(`${this.t('puppeteer-failed')}: ${(e as any).message}`)
      }
    }

    if (!data) {
      try {
        const html = await this.ctx.http.get(AWMC_STATUS_PAGE_URL, {
          responseType: 'text',
          headers: { 'User-Agent': this.UA }
        })
        const regex = /window\.preloadData\s*=\s*(\{.*?\});/s
        const match = html.match(regex)

        if (match?.[1]) {
          const parseJsObject = new Function(`return ${match[1]}`)
          data = parseJsObject()
        }
      } catch (e) {
        this.statusLogger.error(this.t('html-parse-failed'), e)
      }
    }

    if (data) {
      const monitorList: MonitorItem[] = []
      if (data.publicGroupList && Array.isArray(data.publicGroupList)) {
        for (const group of data.publicGroupList) {
          if (Array.isArray(group.monitorList)) {
            monitorList.push(...group.monitorList)
          }
        }
      }
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

      if (!cleanName) cleanName = item.name

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

  private async fetchHeartbeats(url: string): Promise<any> {
    try {
      let data = await this.ctx.http.get(url, {
        headers: { 'User-Agent': this.UA },
        timeout: 15000
      })

      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (err) {
          this.statusLogger.warn(`${this.t('heartbeat-parse-failed')}: ${(err as any).message}`)
          return null
        }
      }

      return data || {}
    } catch (e) {
      this.statusLogger.warn(`${this.t('http-heartbeat-failed')}: ${(e as any)?.message || e}`)
      return null
    }
  }

  private async analyzeAndNotify(heartbeatData: any) {
    const now = Date.now()

    for (const [, group] of this.groups) {
      const { ids } = group

      let upCount = 0
      let downCount = 0
      let totalCount = 0
      let maintenanceCount = 0

      for (const id of ids) {
        const history = heartbeatData[id]
        if (Array.isArray(history) && history.length > 0) {
          totalCount++
          const latest = history[history.length - 1]
          const rawStatus = typeof latest === 'object' && latest !== null ? (latest as any).status : latest
          const status = this.normalizeStatus(rawStatus)

          if (status === 1) upCount++
          else if (status === 3) maintenanceCount++
          else downCount++
        }
      }

      const allUp = totalCount > 0 && upCount === totalCount
      const allDown = totalCount > 0 && downCount === totalCount
      const allMaintenance = totalCount > 0 && maintenanceCount === totalCount

      group.statusHistory.push({ timestamp: now, allUp, allDown, allMaintenance })
      group.statusHistory = group.statusHistory.filter(h => now - h.timestamp < STATUS_WINDOW_MS)

      await this.checkAndNotify(group, now)
    }
  }

  private async checkAndNotify(group: ServiceGroup, now: number) {
    const { groupName, statusHistory, lastNotifiedStatus, queryInterrupted } = group

    if (statusHistory.length === 0) return

    const oldest = statusHistory[0]
    const windowDuration = now - oldest.timestamp

    if (windowDuration < STATUS_WINDOW_MS) {
      this.logDebug(`${this.t('window-not-ready')}: ${groupName} ${Math.round(windowDuration / 1000)}s < ${STATUS_WINDOW_MS / 1000}s`)
      return
    }

    const allUpInWindow = statusHistory.every(h => h.allUp)
    const allDownInWindow = statusHistory.every(h => h.allDown)
    const allMaintenanceInWindow = statusHistory.every(h => h.allMaintenance)

    let targetStatus: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | null = null
    if (allUpInWindow) {
      targetStatus = 'ONLINE'
    } else if (allDownInWindow) {
      targetStatus = 'OFFLINE'
    } else if (allMaintenanceInWindow) {
      targetStatus = 'MAINTENANCE'
    }

    if (!targetStatus) return

    if (queryInterrupted) {
      if (targetStatus !== lastNotifiedStatus) {
        group.queryInterrupted = false
      } else {
        return
      }
    }

    if (targetStatus === lastNotifiedStatus) return

    const statusText = targetStatus === 'ONLINE' ? this.t('online')
      : targetStatus === 'OFFLINE' ? this.t('offline')
        : this.t('maintenance')

    const message = `${groupName} ${statusText}\n${this.t('data-source')}: ${this.getDataSourceName()}`

    this.statusLogger.info(`[${groupName}] ${statusText}`)
    await this.pushNotification(message)

    group.lastNotifiedStatus = targetStatus
    group.statusHistory = []
  }

  private async pushNotification(message: string) {
    if (!this.config.enablePush || !this.config.pushTargets) return

    const bot = this.ctx.bots[0]
    if (!bot) {
      this.statusLogger.warn(this.t('no-bot-available'))
      return
    }

    for (const target of this.config.pushTargets) {
      try {
        const [type, id] = target.split(':')
        if (type === 'group') {
          await bot.sendMessage(id, message)
        } else if (type === 'user') {
          await bot.sendPrivateMessage(id, message)
        }
        this.logDebug(`${this.t('push-to-target')}: ${target}`)
      } catch (e) {
        this.statusLogger.error(`${this.t('push-failed')}: ${target}`, e)
      }
    }
  }
}

export default MaimaiStatus
