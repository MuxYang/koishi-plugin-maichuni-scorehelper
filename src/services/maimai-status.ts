import { Context, Schema, Logger, Service } from 'koishi'

export const name = 'maimai-status-monitor'

const _decode = (str: string) => Buffer.from(str, 'base64').toString('utf8')

const AWMC_STATUS_PAGE_URLS: Record<string, { web: string; api: string }> = {
  get 'awmc'() {
    return {
      web: _decode('aHR0cHM6Ly9zdGF0dXMuYXdtYy5jYy9zdGF0dXMvbWFpbWFp'),
      api: _decode('aHR0cHM6Ly9zdGF0dXMuYXdtYy5jYy9hcGkvc3RhdHVzLXBhZ2UvaGVhcnRiZWF0L21haW1haQ==')
    }
  },
  get 'awmc-lite'() {
    return {
      web: _decode('aHR0cHM6Ly9zdGF0dXMuYXdtYy5jYy9zdGF0dXMvbWFpbWFpLWxpdGU='),
      api: _decode('aHR0cHM6Ly9zdGF0dXMuYXdtYy5jYy9hcGkvc3RhdHVzLXBhZ2UvaGVhcnRiZWF0L21haW1haS1saXRl')
    }
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
    'status-source-request-failed': '状态源请求失败。',
    'unknown-status-recheck': '检测到未知状态，正在重新检查...',
    'rate-limit-paused': '通知频率过高，暂停推送',
    'rate-limit-resumed': '通知推送已恢复',
    'rate-limit-auto-corrected': '频率限制参数已自动校正',
    'quiet-hours': '当前处于维护时段（UTC+8 3:00-8:00），暂不提供状态查询',
    'quiet-hours-sync': '维护时段（UTC+8 3:00-8:00），跳过状态同步',
    'startup-suppress': '启动抑制期内，跳过推送'
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
    'status-source-request-failed': 'Status source request failed.',
    'unknown-status-recheck': 'Unknown status detected, rechecking...',
    'rate-limit-paused': 'Notification rate limit reached, pausing push',
    'rate-limit-resumed': 'Notification push resumed',
    'rate-limit-auto-corrected': 'Rate limit parameters auto-corrected',
    'quiet-hours': 'Maintenance period (UTC+8 3:00-8:00), status query unavailable',
    'quiet-hours-sync': 'Maintenance period (UTC+8 3:00-8:00), skipping sync',
    'startup-suppress': 'Startup suppression active, skipping push'
  }
}

export interface OtherSourceConfig {
  preset: 'uptime-kuma' | 'uptimerobot' | 'hetrixtools' | 'custom'
  webUrl?: string
  apiUrl?: string
  apiFormat?: string
}

export interface Config {
  dataSource: 'awmc' | 'other'
  otherSource?: OtherSourceConfig
  enablePush: boolean
  pushTargets?: string[]
  checkInterval?: number
  statusWindow?: number
  enableRateLimit?: boolean
  rateLimitWindow?: number
  rateLimitCount?: number
  rateLimitPause?: number
  debug?: boolean
}

export const Config = Schema.intersect([
  // 数据源设置
  Schema.object({
    dataSource: Schema.union([
      Schema.const('awmc').description('内置源'),
      Schema.const('other').description('其他'),
    ]).default('awmc').description('数据源'),
  }).description('数据源设置'),

  // 其他数据源配置（仅 dataSource = other 时显示）
  Schema.union([
    Schema.object({
      dataSource: Schema.const('other').required(),
      otherSource: Schema.intersect([
        Schema.object({
          preset: Schema.union([
            Schema.const('uptime-kuma').description('Uptime Kuma'),
            Schema.const('uptimerobot').description('UptimeRobot'),
            Schema.const('hetrixtools').description('HetrixTools'),
            Schema.const('custom').description('自定义'),
          ]).default('uptime-kuma').description('服务类型'),
          apiUrl: Schema.string().required().description('API 地址'),
        }),
        Schema.union([
          Schema.object({
            preset: Schema.const('custom').required(),
            webUrl: Schema.string().description('Web 页面 URL（可选，用于获取服务名称）'),
            apiFormat: Schema.string()
              .role('textarea')
              .required()
              .default('{"monitors": [{"id": "$id$", "name": "$name$", "status": "$status$"}]}')
              .description('API 格式模板（必填），变量: $id$, $name$, $status$, $uptime$'),
          }),
          Schema.object({}),
        ]),
      ]).description('其他数据源配置'),
    }),
    Schema.object({}),
  ]),

  // 推送设置
  Schema.object({
    enablePush: Schema.boolean().default(false).description('启用状态变化推送通知'),
  }).description('推送设置'),
  Schema.union([
    Schema.object({
      enablePush: Schema.const(true).required(),
      pushTargets: Schema.array(Schema.string())
        .required()
        .min(1)
        .role('table')
        .description('推送目标，格式: user:ID 或 group:ID'),
      checkInterval: Schema.number()
        .default(10)
        .min(1)
        .description('请求间隔（分钟）：每隔多长时间请求一次状态源（使用内置源时最小为 10）'),
      statusWindow: Schema.number()
        .default(10)
        .min(0)
        .description('判定窗口（分钟）：窗口内状态全部一致才视为状态变更，为 0 时立即通报（使用内置源时最小为 10）'),
      enableRateLimit: Schema.boolean().default(false).description('启用通知频率限制（防止状态反复跳变时刷屏）'),
    }),
    Schema.object({}),
  ]),

  // 频率限制配置
  Schema.union([
    Schema.object({
      enableRateLimit: Schema.const(true).required(),
      rateLimitWindow: Schema.number()
        .default(60)
        .min(1)
        .description('统计时长（分钟）：在此时间内统计通知次数'),
      rateLimitCount: Schema.number()
        .default(3)
        .min(1)
        .description('最多通知次数：窗口内最多发送的通知次数'),
      rateLimitPause: Schema.number()
        .default(30)
        .min(1)
        .description('暂停时长（分钟）：超过次数后暂停推送的时长'),
    }),
    Schema.object({}),
  ]),
] as const)

interface MonitorItem {
  id: number
  name: string
  type: string
  tags: any[]
}

type AggregatedStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'UNSTABLE' | 'OTHER'

interface StatusSnapshot {
  timestamp: number
  status: AggregatedStatus
}

interface ServiceGroup {
  groupName: string
  ids: number[]
  /** 已确认的状态（经过判定区间验证） */
  confirmedStatus: AggregatedStatus | null
  /** 最近一次快照的状态（用于 getStatusSummary 显示） */
  latestSnapshotStatus: AggregatedStatus | null
  /** 当前判定区间内收集的快照 */
  currentIntervalSnapshots: StatusSnapshot[]
  /** 当前判定区间的起始时间 */
  intervalStartTime: number | null
  /** 初始状态是否已确认 */
  initialStatusConfirmed: boolean
  /** 抑制通报直到此时间戳 */
  suppressUntil: number
  /** 最后一次实际通报的状态（用于判断是否需要通报） */
  lastNotifiedStatus: AggregatedStatus | null
}

interface CachedServiceNames {
  [id: number]: string
}

declare module 'koishi' {
  interface Context {
    maimaiStatus: MaimaiStatus
  }
}

const BUILTIN_STATUS_WINDOW_MS = 10 * 60 * 1000   // 内置源判定窗口：10 分钟
const BUILTIN_CHECK_INTERVAL_MS = 10 * 60 * 1000   // 内置源请求间隔：10 分钟
const BACKGROUND_POLL_MS = 60 * 60 * 1000           // 推送关闭时后台轮询：60 分钟

export class MaimaiStatus extends Service {
  static inject = ['http', 'database']

  private statusLogger: Logger
  private timer: NodeJS.Timeout | null = null
  private startTime: number = 0
  private unknownRechecked: boolean = false
  private groups: Map<string, ServiceGroup> = new Map()
  private lastUptimeData: Record<string, number> = {}
  private cachedServiceNames: CachedServiceNames = {}
  private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  private locale: string = 'zh-CN'
  private debugEnabled: boolean = false
  // Rate limiting state
  private notificationTimestamps: number[] = []
  private rateLimitPausedUntil: number = 0

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'maimaiStatus')
    this.statusLogger = ctx.logger('maimai-status')
    this.debugEnabled = config.debug ?? false
  }

  // ─── 辅助判断方法 ──────────────────────────────────

  /** 是否为内置数据源 */
  private isBuiltinSource(): boolean {
    return this.config.dataSource === 'awmc'
  }

  /** 请求间隔（ms）：内置源 10 分钟，其他源由用户配置（默认 10 分钟） */
  private getCheckIntervalMs(): number {
    const userInterval = (this.config.checkInterval ?? 10) * 60 * 1000
    if (this.isBuiltinSource()) return Math.max(BUILTIN_CHECK_INTERVAL_MS, userInterval)
    return userInterval
  }

  /** 判定窗口（ms）：内置源固定 10 分钟，其他源可配置（0 = 立即通报） */
  private get statusWindowMs(): number {
    const minutes = this.config.statusWindow ?? 10
    const windowMs = minutes === 0 ? 0 : minutes * 60 * 1000
    if (this.isBuiltinSource()) return Math.max(BUILTIN_STATUS_WINDOW_MS, windowMs)
    return windowMs
  }

  /** 启动抑制期长度（ms）：2 个判定窗口（窗口为 0 时使用 2 个请求间隔） */
  private get suppressDuration(): number {
    const windowMs = this.statusWindowMs
    if (windowMs === 0) return 2 * this.getCheckIntervalMs()
    return 2 * windowMs
  }

  /** 是否处于启动抑制期 */
  private isInSuppressPeriod(): boolean {
    return Date.now() < this.startTime + this.suppressDuration
  }

  /** 是否处于 GMT+8 3:00-8:00 维护时段（仅内置源） */
  private isQuietHours(): boolean {
    if (!this.isBuiltinSource()) return false
    const now = new Date()
    const gmt8Minutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440
    const gmt8Hour = Math.floor(gmt8Minutes / 60)
    return gmt8Hour >= 3 && gmt8Hour < 8
  }

  /** 是否存在状态未知的服务组 */
  private hasUnknownGroups(): boolean {
    if (this.groups.size === 0) return true
    for (const group of this.groups.values()) {
      if (group.latestSnapshotStatus === null && group.currentIntervalSnapshots.length === 0) return true
    }
    return false
  }

  /** 自动校正频率限制参数：当最多通知次数过高时下调到允许的最大值 */
  private normalizeRateLimitConfig() {
    if (!this.config.enablePush || !this.config.enableRateLimit) return

    const rateLimitWindow = Math.max(1, this.config.rateLimitWindow ?? 60)
    this.config.rateLimitWindow = rateLimitWindow

    const effectiveWindowMin = this.statusWindowMs > 0
      ? this.statusWindowMs / 60000
      : this.getCheckIntervalMs() / 60000

    const maxAllowedCount = Math.max(0, Math.floor(rateLimitWindow / effectiveWindowMin))
    const configuredCount = Math.max(0, this.config.rateLimitCount ?? 3)

    if (configuredCount > maxAllowedCount) {
      this.config.rateLimitCount = maxAllowedCount
      this.statusLogger.warn(
        `${this.t('rate-limit-auto-corrected')}: rateLimitCount ${configuredCount} -> ${maxAllowedCount} (rateLimitWindow=${rateLimitWindow}min, effectiveWindow=${effectiveWindowMin}min)`
      )
    }
  }

  /** 内置源最小间隔校正：Schema 不支持跨字段条件 min，在运行时强制执行 */
  private normalizeIntervalConfig() {
    if (!this.isBuiltinSource() || !this.config.enablePush) return
    if ((this.config.checkInterval ?? 10) < 10) {
      this.statusLogger.warn(`内置源请求间隔至少为 10 分钟，已自动校正 (${this.config.checkInterval} -> 10)`)
      this.config.checkInterval = 10
    }
    if ((this.config.statusWindow ?? 10) < 10) {
      this.statusLogger.warn(`内置源判定窗口至少为 10 分钟，已自动校正 (${this.config.statusWindow} -> 10)`)
      this.config.statusWindow = 10
    }
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
    this.startTime = Date.now()

    if (this.debugEnabled) {
      this.statusLogger.info(this.t('monitor-started'))
    }

    this.normalizeIntervalConfig()
    this.normalizeRateLimitConfig()

    await this.loadCache()

    // 注册指令
    this.ctx.command('maisms', '查看舞萌 DX 服务器状态')
      .alias('maimai-status')
      .action(async () => {
        // GMT+8 3:00-8:00 静默时段，阻断手动查询
        if (this.isQuietHours()) {
          return this.t('quiet-hours')
        }

        await this.doCheck()
        const summary = await this.getStatusSummary(false)

        // 如果存在未知状态且未重试过，额外请求一次
        if (summary.includes(this.t('unknown')) && !this.unknownRechecked) {
          this.unknownRechecked = true
          this.logDebug(this.t('unknown-status-recheck'))
          await this.doCheck()
          return await this.getStatusSummary(false)
        }

        return summary
      })

    // 确定轮询间隔
    let pollIntervalMs: number
    if (this.config.enablePush && this.validatePushTargets()) {
      pollIntervalMs = this.getCheckIntervalMs()
    } else {
      // 推送关闭时，每 60 分钟后台同步一次
      pollIntervalMs = BACKGROUND_POLL_MS
    }

    // 首次检查
    this.doCheckWithUnknownRecheck()
    if (pollIntervalMs > 0) {
      this.timer = setInterval(() => this.doCheckWithUnknownRecheck(), pollIntervalMs)
      this.logDebug(`定时检查已启动，间隔: ${pollIntervalMs / 60000}min`)
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
      return 'awmc.cc'
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
      await this.doCheck()
    }

    if (this.groups.size === 0) {
      return this.t('no-data')
    }

    const lines: string[] = [this.t('header')]

    for (const [name, group] of this.groups) {
      const displayStatus = group.latestSnapshotStatus ?? group.confirmedStatus
      let statusText = this.t('unknown')

      if (displayStatus) {
        if (displayStatus === 'ONLINE') {
          statusText = this.t('online')
        } else if (displayStatus === 'MAINTENANCE') {
          statusText = this.t('maintenance')
        } else if (displayStatus === 'OFFLINE') {
          statusText = this.t('offline')
        } else if (displayStatus === 'UNSTABLE') {
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

  /** 带未知状态重检的检查入口（定时器回调） */
  private async doCheckWithUnknownRecheck() {
    if (this.isQuietHours()) {
      this.logDebug(this.t('quiet-hours-sync'))
      return
    }

    await this.doCheck(false)

    // 如果存在未知状态且未重试过，额外请求一次（仅触发一次）
    if (!this.unknownRechecked && this.hasUnknownGroups()) {
      this.unknownRechecked = true
      this.logDebug(this.t('unknown-status-recheck'))
      await this.doCheck(this.isBuiltinSource())
    }
  }

  /** 执行一次状态检查 */
  private async doCheck(useLite: boolean = false) {
    try {
      if (this.isBuiltinSource()) {
        const success = await this.checkAwmcSource(useLite)
        if (!success && !useLite) {
          this.logDebug('Main builtin source failed, falling back to lite source...')
          await this.checkAwmcSource(true)
        }
      } else {
        await this.checkOtherSource()
      }
    } catch (e) {
      const truncatedMsg = this.truncateError(e)
      this.logDebug(`Check task error: ${truncatedMsg}`)
    }
  }

  private async checkAwmcSource(useLite: boolean = false): Promise<boolean> {
    // 根据配置源获取对应的API URLs
    const sourceKey = useLite ? 'awmc-lite' : 'awmc'
    const urls = AWMC_STATUS_PAGE_URLS[sourceKey]
    if (!urls) {
      this.logDebug(`Unknown AWMC source: ${sourceKey}`)
      return false
    }

    const { data: heartbeatData, error: fetchError } = await this.fetchHeartbeats(urls.api)

    if (!heartbeatData || fetchError) {
      this.logDebug(`API request failed${fetchError ? `: ${fetchError}` : ''}，trying to sync from web page...`)
      await this.syncServiceNamesFromWeb(urls.web)
      return false
    }

    if (heartbeatData.uptimeList) {
      this.lastUptimeData = heartbeatData.uptimeList
    }

    const list = heartbeatData.heartbeatList
    if (!list) {
      this.logDebug(`Invalid heartbeat data format`)
      return false
    }

    const needWebSync = this.checkForNewServiceIds(list)
    if (needWebSync) {
      await this.syncServiceNamesFromWeb(urls.web)
    }

    this.syncUnknownGroups(list)
    await this.analyzeAndNotify(list)
    return true
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
        group = this.createServiceGroup(normalizedName)
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
          group = this.createServiceGroup(normalizedName)
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
        const group = this.createServiceGroup(name)
        group.ids = ids
        this.groups.set(name, group)
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
    const messages: string[] = []
    const notifiedStatuses = new Map<ServiceGroup, AggregatedStatus>()

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

      // 聚合为单一状态快照
      let snapshotStatus: AggregatedStatus = 'OTHER'
      if (totalCount > 0) {
        if (upCount === totalCount) snapshotStatus = 'ONLINE'
        else if (downCount === totalCount) snapshotStatus = 'OFFLINE'
        else if (maintenanceCount === totalCount) snapshotStatus = 'MAINTENANCE'
        else if (pendingCount === totalCount) snapshotStatus = 'UNSTABLE'
      }

      // 更新最近快照状态（用于手动查询显示）
      group.latestSnapshotStatus = snapshotStatus

      // 将快照加入当前判定区间
      if (group.intervalStartTime === null) {
        group.intervalStartTime = now
      }
      group.currentIntervalSnapshots.push({ timestamp: now, status: snapshotStatus })

      const result = this.checkAndNotify(group, now)
      if (result) {
        messages.push(result.message)
        // 记录此次通报的状态，以便后续更新 lastNotifiedStatus
        notifiedStatuses.set(group, result.status)
      }
    }

    // 合并所有消息，一次性发送
    if (messages.length > 0) {
      const combinedMessage = messages.join('\n')
      await this.pushNotification(combinedMessage)
      // 所有消息成功发送后，更新每个监测点的 lastNotifiedStatus
      for (const [group, status] of notifiedStatuses) {
        group.lastNotifiedStatus = status
      }
    }
  }

  /** 创建新的 ServiceGroup 实例 */
  private createServiceGroup(name: string): ServiceGroup {
    return {
      groupName: name,
      ids: [],
      confirmedStatus: null,
      latestSnapshotStatus: null,
      currentIntervalSnapshots: [],
      intervalStartTime: null,
      initialStatusConfirmed: false,
      suppressUntil: 0,
      lastNotifiedStatus: null
    }
  }

  /**
   * 判定区间完成后的状态变更检查（同步方法）
   *
   * 判定逻辑（顺序执行）：
   * 1. 当前判定区间内的所有状态是否一致？（是→下一步；否→丢弃）
   * 2. 前一个状态是否与当前判定区间内的不一致？（是→下一步；否→丢弃）
   * 3. 状态是否为 ONLINE 或 OFFLINE？（是→下一步；否→丢弃）
   * 4. 状态是否与最后一次通报的状态相同？（是→丢弃；否→通报）
   *
   * 初始状态规则：
   * - 首个判定区间完成后，以区间内较多数的状态作为初始状态
   * - 初始状态确认后的 2 个判定区间内的通报全部舍弃，不计入次数
   *
   * @returns 返回对象包含 status 和 message，如果都满足条件则返回 {status, message}，否则返回 null
   */
  private checkAndNotify(group: ServiceGroup, now: number): { status: AggregatedStatus; message: string } | null {
    const { groupName, currentIntervalSnapshots, confirmedStatus } = group
    const windowMs = this.statusWindowMs

    if (currentIntervalSnapshots.length === 0) return null

    // ── 判定区间是否已满 ──
    const intervalDuration = now - (group.intervalStartTime ?? now)
    const checkIntervalMs = this.getCheckIntervalMs()
    const intervalReady = windowMs === 0
      || intervalDuration >= windowMs
      || checkIntervalMs >= windowMs

    if (!intervalReady) {
      this.logDebug(`[${groupName}] 区间未就绪: ${Math.round(intervalDuration / 1000)}s < ${windowMs / 1000}s`)
      return null
    }

    // ── 初始状态确认（首个区间，多数投票） ──
    if (!group.initialStatusConfirmed) {
      const statusCounts: Partial<Record<AggregatedStatus, number>> = {}
      for (const snap of currentIntervalSnapshots) {
        statusCounts[snap.status] = (statusCounts[snap.status] || 0) + 1
      }

      let majorityStatus: AggregatedStatus = 'OTHER'
      let maxCount = 0
      for (const [status, count] of Object.entries(statusCounts)) {
        if (count > maxCount) {
          maxCount = count
          majorityStatus = status as AggregatedStatus
        }
      }

      group.confirmedStatus = majorityStatus
      group.lastNotifiedStatus = majorityStatus
      group.initialStatusConfirmed = true
      group.suppressUntil = now + 2 * (windowMs > 0 ? windowMs : checkIntervalMs)
      group.currentIntervalSnapshots = []
      group.intervalStartTime = null

      this.logDebug(
        `[${groupName}] 初始状态确认: ${majorityStatus}，` +
        `抑制至: ${new Date(group.suppressUntil).toLocaleTimeString()}`
      )
      return null
    }

    // ── 条件 1：当前判定区间内的所有状态是否一致？ ──
    const firstStatus = currentIntervalSnapshots[0].status
    const allConsistent = currentIntervalSnapshots.every(snap => snap.status === firstStatus)

    if (!allConsistent) {
      // 区间内状态不一致 → 丢弃区间，重新开始
      group.currentIntervalSnapshots = []
      group.intervalStartTime = null
      this.logDebug(`[${groupName}] 区间内状态不一致，丢弃`)
      return null
    }

    const intervalStatus = firstStatus

    // ── 条件 2：前一个状态是否与当前判定区间内的不一致？ ──
    if (intervalStatus === confirmedStatus) {
      // 相同 → 将前一次的状态复制到当前判定区间，移除前一个判定区间的数据
      group.currentIntervalSnapshots = []
      group.intervalStartTime = null
      this.logDebug(`[${groupName}] 状态与前一次相同 (${intervalStatus})，保持`)
      return null
    }

    // 状态不同 → 更新确认状态（但不更新通报状态）
    group.confirmedStatus = intervalStatus
    group.currentIntervalSnapshots = []
    group.intervalStartTime = null

    // ── 抑制期检查 ──
    if (now < group.suppressUntil) {
      this.logDebug(`[${groupName}] 抑制期内，跳过通报 (status: ${intervalStatus})`)
      return null
    }

    // ── 条件 3：状态是否为 ONLINE 或 OFFLINE？ ──
    if (intervalStatus !== 'ONLINE' && intervalStatus !== 'OFFLINE') {
      this.logDebug(`[${groupName}] 状态 ${intervalStatus} 非 ONLINE/OFFLINE，不通报`)
      return null
    }

    // ── 条件 4（新增）：状态是否与最后一次通报的状态相同？ ──
    if (intervalStatus === group.lastNotifiedStatus) {
      this.logDebug(`[${groupName}] 状态与最后一次通报相同 (${intervalStatus})，跳过通报`)
      return null
    }

    // 推送未开启时不通知
    if (!this.config.enablePush) return null

    const statusText = intervalStatus === 'ONLINE' ? this.t('online') : this.t('offline')
    this.logDebug(`[${groupName}] 状态变更通报: ${statusText}`)
    return { status: intervalStatus, message: `${groupName} ${statusText}` }
  }

  private async pushNotification(message: string) {
    if (!this.config.enablePush || !this.config.pushTargets) return

    // 频率限制检查
    if (this.config.enableRateLimit) {
      const now = Date.now()
      const maxCount = this.config.rateLimitCount ?? 3

      // rateLimitCount = 0 → 关闭频率限制功能
      if (maxCount > 0) {
        // 检查是否在暂停期
        if (now < this.rateLimitPausedUntil) {
          this.logDebug(`Rate limit active, paused until ${new Date(this.rateLimitPausedUntil).toLocaleTimeString()}`)
          return
        }

        // 暂停期结束
        if (this.rateLimitPausedUntil > 0) {
          this.logDebug(this.t('rate-limit-resumed'))
          this.rateLimitPausedUntil = 0
        }

        const windowMs = (this.config.rateLimitWindow ?? 60) * 60 * 1000
        const pauseMs = (this.config.rateLimitPause ?? 30) * 60 * 1000

        // 清理窗口外的旧时间戳
        this.notificationTimestamps = this.notificationTimestamps.filter(t => now - t < windowMs)

        // 检查是否超限
        if (this.notificationTimestamps.length >= maxCount) {
          this.rateLimitPausedUntil = now + pauseMs
          this.statusLogger.warn(`${this.t('rate-limit-paused')} (${maxCount} in ${this.config.rateLimitWindow ?? 60}min, pause ${this.config.rateLimitPause ?? 30}min)`)
          return
        }

        // 记录本次通知时间戳
        this.notificationTimestamps.push(now)
      }
    }

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