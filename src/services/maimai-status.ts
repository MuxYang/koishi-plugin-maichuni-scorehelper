import { Context, Schema, Logger, Service } from 'koishi'

export const name = 'maimai-status-monitor'

const AWMC_STATUS_PAGE_URLS: Record<string, { web: string; api: string }> = {
  'awmc': {
    web: 'https://status.awmc.cc/status/maimai',
    api: 'https://status.awmc.cc/api/status-page/heartbeat/maimai'
  },
  'awmc-lite': {
    web: 'https://status.awmc.cc/status/maimai-lite',
    api: 'https://status.awmc.cc/api/status-page/heartbeat/maimai-lite'
  }
}

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
    'pending': '不稳定',
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
    'check-task-error': '检查任务出错',
    'status-source-request-failed': '状态源请求失败。'
  },
  'en-US': {
    'no-data': 'No server monitoring data available, please try again later.',
    'header': 'MaiMai DX Server Status:',
    'online': 'Online',
    'offline': 'Offline',
    'pending': 'Unstable',
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
    'check-task-error': 'Error in check task',
    'status-source-request-failed': 'Status source request failed.'
  },
  'unknown-status-recheck': {
    'zh-CN': '检测到未知状态，正在重新检查...',
    'en-US': 'Unknown status detected, rechecking...'
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
  dataSource: 'awmc' | 'awmc-lite' | 'other'
  otherSource?: OtherSourceConfig
  enablePush: boolean
  pushTargets?: string[]
  debug?: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  // 数据源选择
  Schema.object({
    dataSource: Schema.union([
      Schema.const('awmc').description('status.awmc.cc'),
      Schema.const('awmc-lite').description('status.awmc.cc[lite]'),
      Schema.const('other').description('其他'),
    ]).default('awmc').description('数据源'),
  }).description('数据源设置'),

  // 其他数据源配置（条件显示）
  Schema.union([
    Schema.object({
      dataSource: Schema.const('awmc').required(),
    }),
    Schema.object({
      dataSource: Schema.const('awmc-lite').required(),
    }),
    Schema.object({
      dataSource: Schema.const('other').required(),
      otherSource: Schema.intersect([
        // 基础配置
        Schema.object({
          preset: Schema.union([
            Schema.const('uptime-kuma').description('Uptime Kuma'),
            Schema.const('uptimerobot').description('UptimeRobot'),
            Schema.const('hetrixtools').description('HetrixTools'),
            Schema.const('custom').description('自定义'),
          ]).default('uptime-kuma').description('服务类型'),
          apiUrl: Schema.string().required().description('API 地址'),
          checkInterval: Schema.number()
            .default(600)
            .min(0)
            .description('检查间隔（秒），0 = 仅手动查询'),
        }),
        // 自定义服务特有配置（仅 preset = custom 时显示）
        Schema.union([
          Schema.object({
            preset: Schema.const('custom').required(),
            webUrl: Schema.string().description('Web 页面 URL（可选，用于获取服务名称）'),
            apiFormat: Schema.string()
              .role('textarea')
              .default('{"monitors": [{"id": "$id$", "name": "$name$", "status": "$status$"}]}')
              .description('API 格式模板，变量: $id$, $name$, $status$, $uptime$'),
          }),
          Schema.object({}),
        ]),
      ]).description('其他数据源配置'),
    }),
    Schema.object({
      dataSource: Schema.const('awmc'),
    }),
  ]),

  // 推送设置
  Schema.object({
    enablePush: Schema.boolean().default(false).description('启用状态变化推送通知'),
  }).description('推送设置'),

  // 推送目标（条件显示）
  Schema.union([
    Schema.object({
      enablePush: Schema.const(true).required(),
      pushTargets: Schema.array(Schema.string())
        .role('table')
        .description('推送目标，格式: user:ID 或 group:ID'),
    }),
    Schema.object({
      enablePush: Schema.const(false),
    }),
  ]),
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
  lastNotifiedStatus: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'UNSTABLE' | null
  statusHistory: { timestamp: number; allUp: boolean; allDown: boolean; allMaintenance: boolean; allPending: boolean }[]
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
  static inject = ['http', 'database']

  private statusLogger: Logger
  private timer: NodeJS.Timeout | null = null
  private isFirstCheck = true
  private lastManualQueryTime = 0
  private groups: Map<string, ServiceGroup> = new Map()
  private lastUptimeData: Record<string, number> = {}
  private cachedServiceNames: CachedServiceNames = {}
  private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  private locale: string = 'zh-CN'
  private debugEnabled: boolean = false

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'maimaiStatus')
    this.statusLogger = ctx.logger('maimai-status')
    this.debugEnabled = config.debug ?? false
  }

  private t(key: string): string {
    return I18N[this.locale]?.[key] || I18N['zh-CN'][key] || key
  }

  private logDebug(...args: any[]) {
    if (!this.debugEnabled) return
    this.statusLogger.info('[debug]', ...args)
  }

  private truncateError(error: any, maxLength: number = 100): string {
    const errorStr = typeof error === 'string' ? error : (error?.message || String(error))
    return errorStr.length > maxLength ? errorStr.slice(0, maxLength) + '...' : errorStr
  }

  protected async start() {
    if (this.debugEnabled) {
      this.statusLogger.info(this.t('monitor-started'))
    }

    await this.loadCache()

    // 注册指令
    this.ctx.command('maisms', '查看舞萌 DX 服务器状态')
      .alias('maimai-status')
      .action(async () => {
        this.lastManualQueryTime = Date.now()
        // Perform the initial status check
        await this.checkTask()
        const summary = await this.getStatusSummary(false) // false = no repeated checkTask calls

        // If 'unknown' status exists, recheck and push status
        if (summary.includes(this.t('unknown'))) {
          this.statusLogger.info(this.t('unknown-status-recheck'))
          await this.checkTask()
          return await this.getStatusSummary(false)
        }

        return summary
      })

    // 确定检查间隔
    let intervalMs: number
    if (this.config.dataSource === 'awmc' || this.config.dataSource === 'awmc-lite') {
      intervalMs = API_INTERVAL_MS // AWMC 和 AWMC-Lite 固定 10 分钟
    } else {
      const checkInterval = this.config.otherSource?.checkInterval ?? 600
      intervalMs = checkInterval * 1000
    }

    // 即使推送关闭，也保持每小时至少请求一次 API 以同步数据
    const backgroundIntervalMs = this.config.enablePush && this.validatePushTargets()
      ? intervalMs
      : Math.max(intervalMs, 3600 * 1000) // 推送关闭时，至少每小时同步一次

    this.checkTask()
    if (backgroundIntervalMs > 0) {
      this.timer = setInterval(() => this.checkTask(), backgroundIntervalMs)
      this.logDebug(`定时检查已启动，间隔: ${backgroundIntervalMs / 1000}s`)
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
    if (this.config.dataSource === 'awmc-lite') {
      return 'status.awmc.cc[lite]'
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

  /**
   * 获取状态摘要
   * @param shouldFetch 是否需要先获取数据，默认为 true
   */
  public async getStatusSummary(shouldFetch: boolean = true): Promise<string> {
    if (shouldFetch) {
      await this.checkTask()
    }

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
        } else if (latest.allPending) {
          statusText = this.t('pending')
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
      if (this.config.dataSource === 'awmc' || this.config.dataSource === 'awmc-lite') {
        await this.checkAwmcSource()
      } else {
        await this.checkOtherSource()
      }
      this.isFirstCheck = false
    } catch (e) {
      const truncatedMsg = this.truncateError(e)
      this.logDebug(`Check task error: ${truncatedMsg}`)
    }
  }

  private async checkAwmcSource() {
    // 根据配置源获取对应的API URLs
    const sourceKey = this.config.dataSource as 'awmc' | 'awmc-lite'
    const urls = AWMC_STATUS_PAGE_URLS[sourceKey]
    if (!urls) {
      this.logDebug(`Unknown AWMC source: ${sourceKey}`)
      return
    }

    const { data: heartbeatData, error: fetchError } = await this.fetchHeartbeats(urls.api)

    if (!heartbeatData) {
      this.logDebug(`API request failed${fetchError ? `: ${fetchError}` : ''}，trying to sync from web page...`)
      await this.syncServiceNamesFromWeb(urls.web)
      return
    }

    if (heartbeatData.uptimeList) {
      this.lastUptimeData = heartbeatData.uptimeList
    }

    const list = heartbeatData.heartbeatList
    if (!list) {
      this.logDebug(`Invalid heartbeat data format`)
      return
    }

    const needWebSync = this.checkForNewServiceIds(list)
    if (needWebSync) {
      await this.syncServiceNamesFromWeb(urls.web)
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

  private async syncServiceNamesFromWeb(webUrl?: string) {
    const url = webUrl || AWMC_STATUS_PAGE_URLS['awmc'].web
    const monitorItems = await this.fetchMonitorConfig(url)
    if (monitorItems && monitorItems.length > 0) {
      for (const item of monitorItems) {
        this.cachedServiceNames[item.id] = item.name
      }
      await this.saveCache(monitorItems)
      this.syncGroups(monitorItems)
      this.logDebug(`Synced ${monitorItems.length} monitor names from data source`)
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

      if (this.debugEnabled) {
        const contentStr = typeof data === 'string' ? data : JSON.stringify(data)
        this.logDebug(`Other source response: ${contentStr.slice(0, 50)}`)
      }

      const parsed = this.parseOtherSourceData(data, otherSource)
      if (parsed) {
        await this.processOtherSourceData(parsed)
      }
    } catch (e) {
      if (this.debugEnabled) {
        const truncatedMsg = this.truncateError(e)
        this.logDebug(`Other source fetch error: ${truncatedMsg}`)
      } else {
        this.statusLogger.error(this.t('status-source-request-failed'))
      }
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
      if (this.debugEnabled) {
        const truncatedMsg = this.truncateError(e)
        this.logDebug(`Parse other source error: ${truncatedMsg}`)
      }
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
      if (this.debugEnabled) {
        const truncatedMsg = this.truncateError(e)
        this.logDebug(`Parse custom data error: ${truncatedMsg}`)
      }
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
    if (status === 2 || status === '2' || status === 'pending' || status === 'unstable') {
      return 2
    }
    return 0
  }

  private async processOtherSourceData(monitors: any[]) {
    // Save updated names to DB
    await this.saveCache(monitors)

    for (const monitor of monitors) {
      this.cachedServiceNames[monitor.id] = monitor.name
      const normalizedName = this.normalizeGroupName(monitor.name)

      let group = this.groups.get(normalizedName)
      if (!group) {
        group = {
          groupName: normalizedName,
          ids: [],
          lastNotifiedStatus: null,
          statusHistory: [],
          queryInterrupted: false
        }
        this.groups.set(normalizedName, group)
      }

      if (!group.ids.includes(monitor.id)) {
        group.ids.push(monitor.id)
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

  private getDataSourceKey(): string {
    if (this.config.dataSource === 'awmc') return 'awmc'
    if (this.config.dataSource === 'awmc-lite') return 'awmc-lite'
    const other = this.config.otherSource
    if (!other) return 'other_unknown'
    if (other.preset === 'custom') {
      return `custom_${other.apiUrl || 'unknown'}`
    }
    return `other_${other.preset}`
  }

  private async saveCache(items: MonitorItem[]) {
    try {
      const source = this.getDataSourceKey()
      const rows = items.map(item => ({
        source,
        monitor_id: item.id,
        name: item.name,
        updated_at: new Date()
      }))
      await this.ctx.database.upsert('maimai_monitor_name', rows, ['source', 'monitor_id'])
    } catch (e) {
      if (this.debugEnabled) {
        const truncatedMsg = this.truncateError(e)
        this.logDebug(`Save cache error: ${truncatedMsg}`)
      }
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const source = this.getDataSourceKey()
      const rows = await this.ctx.database.get('maimai_monitor_name', { source })

      this.cachedServiceNames = {}
      for (const row of rows) {
        this.cachedServiceNames[row.monitor_id] = row.name
      }

      this.logDebug(`Loaded from cache: ${rows.length} monitor names`)
    } catch (e) {
      if (this.debugEnabled) {
        const truncatedMsg = this.truncateError(e)
        this.logDebug(`Load cache error: ${truncatedMsg}`)
      }
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
        const normalizedName = this.normalizeGroupName(name)

        let group = this.groups.get(normalizedName)
        if (!group) {
          this.logDebug(`${this.t('detected-new-service')}: ${normalizedName} (Includes ID: ${id})`)
          group = {
            groupName: normalizedName,
            ids: [],
            lastNotifiedStatus: null,
            statusHistory: [],
            queryInterrupted: false
          }
          this.groups.set(normalizedName, group)
        }

        if (!group.ids.includes(id)) {
          group.ids.push(id)
        }
      }
    }
  }

  private normalizeGroupName(name: string): string {
    return name
      .replace(/^\[.*?\]\s*/, '')
      .replace(/\s*\[[^\]]+\]\s*$/, '')
      .trim() || name
  }

  private async fetchMonitorConfig(pageUrl?: string): Promise<MonitorItem[]> {
    const url = pageUrl || AWMC_STATUS_PAGE_URLS['awmc'].web
    let data: any = null

    if (this.ctx.puppeteer) {
      try {
        const page = await this.ctx.puppeteer.page()
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 })
          } catch { }

          data = await page.evaluate(() => (window as any).preloadData)
        } finally {
          await page.close()
        }
      } catch (e) {
        const truncatedMsg = this.truncateError(e)
        this.logDebug(`Puppeteer fetch error: ${truncatedMsg}`)
      }
    }

    if (!data) {
      try {
        const html = await this.ctx.http.get(url, {
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
        if (this.debugEnabled) {
          const truncatedMsg = this.truncateError(e)
          this.logDebug(`HTML parse error: ${truncatedMsg}`)
        }
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
      let cleanName = this.normalizeGroupName(item.name)

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

  private async fetchHeartbeats(url: string): Promise<{ data: any; error?: string }> {
    try {
      let data = await this.ctx.http.get(url, {
        headers: { 'User-Agent': this.UA },
        timeout: 15000
      })

      if (this.debugEnabled) {
        const contentStr = typeof data === 'string' ? data : JSON.stringify(data)
        this.logDebug(`Heartbeat response: ${contentStr.slice(0, 50)}`)
      }

      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (err) {
          const errMsg = this.truncateError(err)
          this.logDebug(`Heartbeat JSON parse failed: ${errMsg}`)
          return { data: null, error: errMsg }
        }
      }

      return { data: data || {} }
    } catch (e) {
      const errMsg = this.truncateError(e)
      if (this.debugEnabled) {
        this.logDebug(`Heartbeat fetch error: ${errMsg}`)
      } else {
        this.statusLogger.error(this.t('status-source-request-failed'))
      }
      return { data: null, error: errMsg }
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
      let pendingCount = 0

      for (const id of ids) {
        const history = heartbeatData[id]
        if (Array.isArray(history) && history.length > 0) {
          totalCount++
          const latest = history[history.length - 1]
          const rawStatus = typeof latest === 'object' && latest !== null ? (latest as any).status : latest
          const status = this.normalizeStatus(rawStatus)

          if (status === 1) upCount++
          else if (status === 3) maintenanceCount++
          else if (status === 2) pendingCount++
          else downCount++
        }
      }

      const allUp = totalCount > 0 && upCount === totalCount
      const allDown = totalCount > 0 && downCount === totalCount
      const allMaintenance = totalCount > 0 && maintenanceCount === totalCount
      const allPending = totalCount > 0 && pendingCount === totalCount

      group.statusHistory.push({ timestamp: now, allUp, allDown, allMaintenance, allPending })
      group.statusHistory = group.statusHistory.filter(h => now - h.timestamp < STATUS_WINDOW_MS)

      await this.checkAndNotify(group, now)
    }
  }

  private async checkAndNotify(group: ServiceGroup, now: number) {
    const { groupName, statusHistory, lastNotifiedStatus, queryInterrupted } = group

    if (statusHistory.length === 0) return

    const oldest = statusHistory[0]
    const windowDuration = now - oldest.timestamp

    const checkIntervalMs = (this.config.dataSource === 'awmc' || this.config.dataSource === 'awmc-lite')
      ? API_INTERVAL_MS
      : (this.config.otherSource?.checkInterval ?? 600) * 1000

    // 窗口就绪条件：时间跨度足够，或者检查间隔本身就大于等于窗口（单次检查代表足够时长）
    if (windowDuration >= STATUS_WINDOW_MS || checkIntervalMs >= STATUS_WINDOW_MS) {
      const allUpInWindow = statusHistory.every(h => h.allUp)
      const allDownInWindow = statusHistory.every(h => h.allDown)

      let targetStatus: 'ONLINE' | 'OFFLINE' | null = null
      if (allUpInWindow) {
        targetStatus = 'ONLINE'
      } else if (allDownInWindow) {
        targetStatus = 'OFFLINE'
      }

      // 如果不是 ONLINE 或 OFFLINE，或者是 MAINTENANCE/UNSTABLE/PARTIAL，则不推送通知
      if (!targetStatus) return

      if (queryInterrupted) {
        if (targetStatus !== lastNotifiedStatus) {
          group.queryInterrupted = false
        } else {
          return
        }
      }

      if (targetStatus === lastNotifiedStatus) return

      const statusText = targetStatus === 'ONLINE' ? this.t('online') : this.t('offline')

      const message = `${groupName} ${statusText}`

      this.logDebug(`[${groupName}] ${statusText}`)

      if (this.isFirstCheck) {
        this.logDebug(`${groupName} First check notification suppressed.`)
      } else if (Date.now() - this.lastManualQueryTime < 30 * 60 * 1000) {
        this.logDebug(`${groupName} Notification suppressed due to recent manual query.`)
      } else {
        await this.pushNotification(message)
      }

      group.lastNotifiedStatus = targetStatus
      group.statusHistory = []
    } else {
      if (this.debugEnabled) {
        this.logDebug(`Window not ready: ${groupName} ${Math.round(windowDuration / 1000)}s < ${STATUS_WINDOW_MS / 1000}s`)
      }
    }
  }

  private async pushNotification(message: string) {
    if (!this.config.enablePush || !this.config.pushTargets) return

    const bot = this.ctx.bots[0]
    if (!bot) {
      this.logDebug('No bot available to send notification')
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
        this.logDebug(`Push to target: ${target}`)
      } catch (e) {
        if (this.debugEnabled) {
          const truncatedMsg = this.truncateError(e)
          this.logDebug(`Push failed for ${target}: ${truncatedMsg}`)
        }
      }
    }
  }
}

export default MaimaiStatus
