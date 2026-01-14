import { Context, Schema, Logger, Service } from 'koishi'
import fs from 'fs/promises'
import path from 'path'

const DEFAULT_STATUS_PAGE_URL = 'https://maimaistatusreverseproxy.muxyang.com/status/maimai'
const DEFAULT_HEARTBEAT_API_URL = 'https://maimaistatusreverseproxy.muxyang.com/api/status-page/heartbeat/maimai'

export const name = 'maimai-status-monitor'

export interface Config {
  interval: number
  targetChannelId?: string
  showRecovery: boolean
  mainServiceName: string
  statusPageUrl: string
  heartbeatApiUrl: string
  debug?: boolean
}

export const Config: Schema<Config> = Schema.object({
  interval: Schema.number().default(60000).description('轮询间隔 (毫秒)，建议不低于 30000'),
  targetChannelId: Schema.string().description('推送通知的目标群组/频道 ID (可选，留空则仅在控制台输出)'),
  showRecovery: Schema.boolean().default(true).description('是否在服务恢复时也发送通知'),
  mainServiceName: Schema.string().default('舞萌DX服务').description('主服务名称（去除了后缀的），当该服务下线时，屏蔽其他服务的通知'),
  statusPageUrl: Schema.string().default(DEFAULT_STATUS_PAGE_URL).description('状态页 URL，默认使用内置反代，可自定义'),
  heartbeatApiUrl: Schema.string().default(DEFAULT_HEARTBEAT_API_URL).description('心跳 API URL，默认使用内置反代，可自定义'),
  debug: Schema.boolean().default(false).description('开启后输出详细调试日志')
})

// 定义服务状态枚举
type ServiceStatus = 'ONLINE' | 'PARTIAL_OFFLINE' | 'OFFLINE' | 'UNKNOWN'

interface MonitorItem {
  id: number
  name: string
  type: string
  tags: any[]
}

interface ServiceGroup {
  groupName: string
  ids: number[]     // 该组包含的所有代理服务器ID
  lastStatus: ServiceStatus
  
  // 新增状态追踪字段
  consecutiveFailures: number // 连续异常计数
  isMuted: boolean            // 是否被静音
  muteUntil: number           // 静音结束时间戳
  statusChangeHistory: number[] // 最近状态变更的时间戳记录
}

// 扩展 Context 接口 (如果需要做成服务)
declare module 'koishi' {
  interface Context {
    maimaiStatus: MaimaiStatus
    puppeteer: any
  }
}

// 常量配置
const FLAP_WINDOW = 10 * 60 * 1000 // 10分钟
const FLAP_THRESHOLD = 5           // 10分钟内变更多于5次视为抖动
const MUTE_DURATION = 30 * 60 * 1000 // 静音30分钟
const FAILURE_THRESHOLD = 3        // 连续第3次异常才报警 (忽略前2次)

export class MaimaiStatus extends Service {
  private clientLogger: Logger
  private timer: NodeJS.Timeout | null = null
  // 内存中保存的分组状态映射： GroupName -> GroupData
  private groups: Map<string, ServiceGroup> = new Map()

  // API 地址常量（已切换到反向代理域名以绕过 CC）
  private readonly CACHE_FILE = path.join(__dirname, '../../monitor_cache.json')
  private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'maimaiStatus')
    this.clientLogger = ctx.logger('maimai-status')
  }

  private logDebug(...args: any[]) {
    if (!this.config.debug) return
    // 当 debug 开启时，使用 info 级别输出，确保默认日志等级也能看到
    this.clientLogger.info.apply(this.clientLogger, ['[debug]', ...args] as any)
  }

  protected async start() {
    this.clientLogger.info('Maimai status monitor started.')
    // 立即执行一次
    this.checkTask()
    // 设置定时任务
    this.timer = setInterval(() => {
      this.checkTask()
    }, this.config.interval)
  }

  protected async stop() {
    if (this.timer) clearInterval(this.timer)
    this.clientLogger.info('Maimai status monitor stopped.')
  }

  /**
   * [Public API] 获取当前状态汇总
   */
  public async getStatusSummary(): Promise<string> {
    // 触发一次最新检测
    await this.checkTask()

    if (this.groups.size === 0) {
      return '暂无服务器监控数据，请稍后再试。'
    }

    const lines: string[] = ['📡 舞萌 DX 服务器状态：']
    
    for (const [name, group] of this.groups) {
      let icon = '❓'
      let statusText = '未知'

      // 显示静音状态
      if (group.isMuted && Date.now() < group.muteUntil) {
        icon = '🔇'
        const remaining = Math.ceil((group.muteUntil - Date.now()) / 60000)
        statusText = `监控暂停 (防抖动 ${remaining}m)`
      } else {
        switch (group.lastStatus) {
          case 'ONLINE':
            icon = '🟢'
            statusText = '正常'
            break
          case 'PARTIAL_OFFLINE':
            icon = '🟡'
            statusText = '部分异常'
            break
          case 'OFFLINE':
            icon = '🔴'
            statusText = '全线中断'
            break
          default:
            icon = '❓'
            statusText = '未知'
        }
      }

      lines.push(`${icon} ${name}: ${statusText}`)
    }

    lines.push(`\n🕒 更新时间：${new Date().toLocaleString()}`)
    return lines.join('\n')
  }

  /**
   * 核心任务：同步配置 -> 获取状态 -> 分析差异 -> 推送
   */
  private async checkTask() {
    try {
      // 1. 同步配置
      const monitorItems = await this.fetchMonitorConfig()
      if (monitorItems && monitorItems.length > 0) {
        this.saveCache(monitorItems) // 保存缓存
        this.syncGroups(monitorItems)
      } else {
        // 获取失败，尝试加载缓存
        this.clientLogger.warn('Failed to fetch monitor config, trying cache...')
        const cachedItems = await this.loadCache()
        if (cachedItems.length > 0) {
            this.syncGroups(cachedItems)
            this.clientLogger.info(`Loaded ${cachedItems.length} monitor items from cache.`)
        }
      }

      // 2. 获取实时心跳数据
      const heartbeatData = await this.fetchHeartbeats()
      if (!heartbeatData) {
        this.clientLogger.warn('Failed to fetch heartbeat data.')
        return
      }
      
      const list = heartbeatData.heartbeatList
      if (!list) {
          // 兼容直接返回 heartbeatList 的情况（某些部署可能直接返回对象）
          if (heartbeatData && typeof heartbeatData === 'object' && !Array.isArray(heartbeatData)) {
              this.clientLogger.warn('Heartbeat data missing heartbeatList, using raw object keys fallback.')
              return await this.analyzeAndNotify(heartbeatData)
          }
          this.clientLogger.warn('Heartbeat data format invalid: list missing', Object.keys(heartbeatData))
          return
      }

      // 3. 补充未知服务 ID
      this.syncUnknownGroups(list)

      // 4. 分析状态并处理通知
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

  /**
   * 补充未知分组
   */
  private syncUnknownGroups(heartbeatData: any) {
      const knownIds = new Set<number>()
      for (const group of this.groups.values()) {
          group.ids.forEach(id => knownIds.add(id))
      }

      for (const idStr of Object.keys(heartbeatData)) {
          const id = Number(idStr)
          if (!knownIds.has(id)) {
              // 新发现的未知 ID
              const name = `Service-${id}`
              if (!this.groups.has(name)) { // 避免重复创建
                  this.clientLogger.info(`Detected new unknown service ID: ${id}`)
                  this.groups.set(name, {
                      groupName: name,
                      ids: [id],
                      lastStatus: 'UNKNOWN',
                      consecutiveFailures: 0,
                      isMuted: false,
                      muteUntil: 0,
                      statusChangeHistory: []
                  })
              }
          }
      }
  }

  /**
   * 步骤1: 访问 HTML 页面提取 window.preloadData
   * 优先尝试 Puppeteer 以绕过 CC 防护
   */
  private async fetchMonitorConfig(): Promise<MonitorItem[]> {
    let data: any = null

    // 尝试使用 Puppeteer
    if (this.ctx.puppeteer) {
        try {
            const page = await this.ctx.puppeteer.page()
            try {
                // 设置超时，防止卡死
                await page.goto(this.config.statusPageUrl || DEFAULT_STATUS_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
                // 等待可能的 JS 跳转 (CC Protect)
                try {
                    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 })
                } catch (_) { /* ignore timeout */ }
                
                // 直接从页面上下文获取数据
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

    // 如果 Puppeteer 失败或未启用，回退到 HTTP (可能无法通过 CC 验证)
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

  /**
   * 步骤2: 整理分组逻辑
   * 将 "[上海移动代理]" 等后缀去除，聚合为同一个服务
   */
  private syncGroups(items: MonitorItem[]) {
    // 临时存储本次获取到的分组结构，用于更新
    const currentStructure = new Map<string, number[]>()

    for (const item of items) {
      // 核心逻辑：去除结尾的 [xxx代理] 或 [xxx Proxy] 等
      // 修复 Regex: 
      // 1. 去除开头的 [1.53] 这种版本号前缀
      // 2. 去除结尾的 [上海移动代理] 这种后缀
      let cleanName = item.name
          .replace(/^\[.*?\]\s*/, '') // Remove starting [1.53] etc
          .replace(/\s*\[[^\]]+\]\s*$/, '') // Remove ending [Proxy]
          .trim()
      
      // 如果清洗后名字为空（例如原始名字就是"[xxx]"），则回退使用原名
      if (!cleanName) {
        cleanName = item.name
      }
      
      if (!currentStructure.has(cleanName)) {
        currentStructure.set(cleanName, [])
      }
      currentStructure.get(cleanName)?.push(item.id)
    }

    // 更新类成员 this.groups，保留之前的状态
    for (const [name, ids] of currentStructure) {
      if (!this.groups.has(name)) {
        // 新发现的服务，初始化
        this.groups.set(name, { 
          groupName: name, 
          ids, 
          lastStatus: 'UNKNOWN',
          consecutiveFailures: 0,
          isMuted: false,
          muteUntil: 0,
          statusChangeHistory: []
        })
      } else {
        // 更新 ID 列表（以防 ID 变更）
        const existing = this.groups.get(name)!
        existing.ids = ids
        // 确保 groupName 也是最新的（虽然 map key 是一样的）
        existing.groupName = name
      }
    }
  }

  /**
   * 步骤3: 获取 API JSON 数据
   */
  private async fetchHeartbeats(): Promise<any> {
    const url = this.config.heartbeatApiUrl || DEFAULT_HEARTBEAT_API_URL

    // 使用 Puppeteer 绕过可能的 JS 质询 / CC 防护
    const fetchViaPuppeteer = async (): Promise<any | null> => {
      if (!this.ctx.puppeteer) return null
      let page: any = null
      try {
        page = await this.ctx.puppeteer.page()
        if (page.setUserAgent) {
          await page.setUserAgent(this.UA)
        }
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 })
        // 直接读取正文文本（可能被 JS 动态生成）
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
      
      // 如果不是对象，尝试解析 JSON (因为 Object.keys 打印出了索引，说明是字符串)
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (err) {
          const snippet = data.slice(0, 200)
          this.clientLogger.warn(`Heartbeat JSON parse failed: ${(err as any).message}; snippet=${snippet}`)
            // 如果返回的是 CC HTML，尝试使用 Puppeteer 绕过
            if (snippet.includes('<!DOCTYPE')) {
              const viaPuppeteer = await fetchViaPuppeteer()
              if (viaPuppeteer) return viaPuppeteer
            }
            return null
        }
      }
      
      // 返回原始对象，包含 heartbeatList 和 uptimeList
      this.logDebug('[heartbeat] parsed keys:', Array.isArray(data) ? `array length ${data.length}` : Object.keys(data || {}))
      return data || {}
    } catch (e) {
      // HTTP 失败也尝试 Puppeteer（例如超时/质询）
      this.clientLogger.warn(`HTTP heartbeat fetch failed, trying Puppeteer. reason=${(e as any)?.message || e}`)
      const viaPuppeteer = await fetchViaPuppeteer()
      if (viaPuppeteer) return viaPuppeteer

      this.clientLogger.error('Failed to fetch heartbeat JSON', e)
      return null
    }
  }

  /**
   * 步骤4: 核心逻辑 - 状态判定与通知
   * 逻辑：
   * - 1 (Available)
   * - 0, 2 (Unknown/Down/Issue) -> 视为异常
   * * 聚合逻辑：
   * - 所有 ID 都是 1 -> ONLINE
   * - 所有 ID 都不是 1 -> OFFLINE
   * - 只有部分 ID 是 1 -> PARTIAL_OFFLINE
   */
  private async analyzeAndNotify(heartbeatData: any) {
    const now = Date.now()
    const updates: { group: ServiceGroup, currentStatus: ServiceStatus }[] = []
    let mainServiceCurrentStatus: ServiceStatus = 'UNKNOWN'

    // 1. 第一轮：计算所有服务的当前状态
    for (const [name, group] of this.groups) {
      const { ids } = group
      
      let upCount = 0
      let downCount = 0
      let unknownCount = 0
      let totalCount = 0

      for (const id of ids) {
        const history = heartbeatData[id]
        if (Array.isArray(history) && history.length > 0) {
          totalCount++
          const latest = history[history.length - 1]
          // 部分部署返回 boolean/字符串，需要兼容；仅将“1/true/"1"”视作在线
          const rawStatus = typeof latest === 'object' && latest !== null ? (latest as any).status : latest
          const statusNum = Number(rawStatus)
          const isUp = statusNum === 1 || rawStatus === true || rawStatus === '1'
          const isDown = statusNum === 0 || rawStatus === false || rawStatus === '0'
          if (isUp) upCount++
          else if (isDown) downCount++
          else unknownCount++ // status 2 或其它视为未知，不算作全线下线
          this.logDebug(`[status] ${name} id=${id} raw=${String(rawStatus)} isUp=${isUp} isDown=${isDown}`)
        }
      }

      let currentStatus: ServiceStatus = 'UNKNOWN'
      if (totalCount > 0) {
        if (upCount === totalCount) {
          currentStatus = 'ONLINE'
        } else if (upCount === 0 && downCount === totalCount) {
          currentStatus = 'OFFLINE'
        } else if (upCount === 0 && downCount === 0) {
          currentStatus = 'UNKNOWN'
        } else {
          currentStatus = 'PARTIAL_OFFLINE'
        }
      }

      this.logDebug(`[status] ${name} summary up=${upCount} down=${downCount} unknown=${unknownCount} total=${totalCount} -> ${currentStatus}`)

      updates.push({ group, currentStatus })

      // 记录主服务状态
      if (group.groupName === this.config.mainServiceName) {
        mainServiceCurrentStatus = currentStatus
      }
    }

    // 2. 第二轮：处理状态变更与通知
    const isMainServiceOffline = mainServiceCurrentStatus === 'OFFLINE'

    for (const { group, currentStatus } of updates) {
      const { groupName, lastStatus, isMuted, muteUntil } = group
      this.logDebug(`[state] ${groupName}: last=${lastStatus} current=${currentStatus}`)

      // 检查静音过期
      if (isMuted && now > muteUntil) {
        group.isMuted = false
        this.clientLogger.info(`[${groupName}] 静音结束，恢复监控通知。`)
      }

      // 如果处于静音状态，只更新状态，不进行通知推送判定
      if (group.isMuted) {
        group.lastStatus = currentStatus
        continue
      }

      // --- 主服务屏蔽逻辑 ---
      const isMain = groupName === this.config.mainServiceName
      
      // 如果不是主服务，且主服务当前处于离线状态，则屏蔽报警
      if (!isMain && isMainServiceOffline) {
        // 静默更新状态，重置连续失败计数以防恢复瞬间误报
        group.consecutiveFailures = 0
        group.lastStatus = currentStatus
        this.clientLogger.debug(`[${groupName}] 跳过通知：主服务离线，当前状态 ${currentStatus}`)
        continue
      }

      // 正常的报警逻辑 (含 3 次确认)。
      // 注意：即便状态未变化，也需要累计 consecutiveFailures，以便长时间离线也能触发阈值。
      await this.processNotificationLogic(group, currentStatus)
      
      // 更新最后状态
      group.lastStatus = currentStatus
    }
  }

  private updateFlapHistory(group: ServiceGroup, now: number) {
    group.statusChangeHistory.push(now)
    // 清理超出窗口期的记录
    group.statusChangeHistory = group.statusChangeHistory.filter(t => now - t < FLAP_WINDOW)
  }

  private checkFlapping(group: ServiceGroup, now: number): boolean {
    return group.statusChangeHistory.length >= FLAP_THRESHOLD
  }

  private async processNotificationLogic(group: ServiceGroup, currentStatus: ServiceStatus) {
    const groupName = group.groupName || 'Unknown Service' // Fallback
    
    const isAbnormal = currentStatus === 'OFFLINE' || currentStatus === 'PARTIAL_OFFLINE'
    const wasAbnormal = group.lastStatus === 'OFFLINE' || group.lastStatus === 'PARTIAL_OFFLINE'
    const isInit = group.lastStatus === 'UNKNOWN'

    if (isAbnormal) {
      // 异常计数 +1（初次发现也要记一次）
      group.consecutiveFailures++
      
      // 只有达到阈值（第3次）时才报警，且之前没有报过（或者这是一个新的连续序列）
      // 注意：如果已经是第 4, 5 次，保持当前状态不变，不再重复报
      if (group.consecutiveFailures === FAILURE_THRESHOLD) {
        this.logDebug(`[notify] threshold reached for ${groupName}: last=${group.lastStatus} current=${currentStatus}`)
        await this.handleStatusChange(groupName, group.lastStatus, currentStatus)
      } else if (group.consecutiveFailures < FAILURE_THRESHOLD) {
        this.clientLogger.debug(`[${groupName}] 异常计数 ${group.consecutiveFailures}/${FAILURE_THRESHOLD}，暂不推送。`)
      }
    } else {
      // 当前是 ONLINE
      if (wasAbnormal && group.consecutiveFailures >= FAILURE_THRESHOLD) {
        // 之前是异常，且已经报警过了（超过阈值），现在恢复 -> 发送恢复通知
        this.logDebug(`[notify] recovery for ${groupName}: last=${group.lastStatus} -> ONLINE`)
        await this.handleStatusChange(groupName, group.lastStatus, currentStatus)
      }
      // 重置计数
      group.consecutiveFailures = 0
    }

    // 首次初始化状态也要记录，防止后续一直停留在 UNKNOWN 导致不推送
    if (isInit && group.lastStatus === 'UNKNOWN') {
      group.lastStatus = currentStatus
    }
  }

  /**
   * 状态变更处理接口
   */
  private async handleStatusChange(name: string, from: ServiceStatus, to: ServiceStatus) {
    let shouldNotify = false
    let level = 'info'
    let title = ''
    let detail = ''

    // 逻辑：从可用转为不可用或异常，进行通知。
    // 逻辑：服务下线后的状态一直没有变更为可用，不进行通知（已通过 if (to !== from) 排除）。

    if (to === 'OFFLINE') {
      shouldNotify = true
      level = 'error'
      title = '🔴 服务全线中断'
      detail = `${name} 的所有节点均已无法连接。`
    } else if (to === 'PARTIAL_OFFLINE') {
      // 如果是从 OFFLINE 变过来的，说明部分恢复了；如果是 ONLINE 变过来的，说明部分挂了
      shouldNotify = true
      level = 'warn'
      title = '🟡 服务部分异常'
      detail = `${name} 部分节点不可用，可能影响跨运营商连接。`
    } else if (to === 'ONLINE') {
      // 恢复通知（可选）
      if (this.config.showRecovery) {
        shouldNotify = true
        level = 'success'
        title = '🟢 服务已恢复'
        detail = `${name} 所有节点均已上线。`
      }
    }

    if (shouldNotify) {
      this.logDebug(`[notify] will push: ${name} ${from} -> ${to}`)
      // 防抖检测：仅在真正决定推送时记录
      const group = this.groups.get(name)
      if (group) {
        const now = Date.now()
        this.updateFlapHistory(group, now)
        
        if (this.checkFlapping(group, now)) {
            group.isMuted = true
            group.muteUntil = now + MUTE_DURATION
            const flapMsg = `⚠️ 监测到服务 [${name}] 状态频繁跳动（连续推送超过 ${FLAP_THRESHOLD} 次），暂停通知 30 分钟。`
            this.clientLogger.warn(flapMsg)
            await this.pushNotification(flapMsg, 'warn')
            return
        }
      }

      const msg = `${title}\n服务：${name}\n详情：${detail}\n时间：${new Date().toLocaleString()}`
      this.clientLogger.info(`Notification Triggered: ${msg}`)
      await this.pushNotification(msg, level)
    }
  }

  /**
   * [保留接口] 推送服务
   * 您可以在此处对接具体的 session.send 或 http.post
   */
  private async pushNotification(message: string, level: string) {
    // 示例：如果配置了 channelId，则发送消息
    if (this.config.targetChannelId) {
        try {
            // 获取 bot 实例发送 (需要确保 context 中有 bot)
            const bot = this.ctx.bots[0]
            if (bot) {
          this.logDebug(`[push] send to ${this.config.targetChannelId} level=${level} msgHead=${message.slice(0,50)}`)
                await bot.sendMessage(this.config.targetChannelId, message)
            } else {
                this.clientLogger.warn('No bot available to send notification.')
            }
        } catch (e) {
            this.clientLogger.error('Failed to send notification:', e)
        }
    } else {
      this.clientLogger.debug('Notification skipped: targetChannelId not configured.')
      this.logDebug(`[push] skipped push, no target. level=${level} msgHead=${message.slice(0,50)}`)
    }

    // 示例：您也可以在这里添加 HTTP webhook 推送
    // await this.ctx.http.post('YOUR_WEBHOOK_URL', { content: message })
  }
}

export default MaimaiStatus