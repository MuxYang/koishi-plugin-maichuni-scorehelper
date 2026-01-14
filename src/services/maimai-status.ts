import { Context, Schema, Logger, Service } from 'koishi'

export const name = 'maimai-status-monitor'

export interface Config {
  interval: number
  targetChannelId?: string
  showRecovery: boolean
}

export const Config: Schema<Config> = Schema.object({
  interval: Schema.number().default(60000).description('轮询间隔 (毫秒)，建议不低于 30000'),
  targetChannelId: Schema.string().description('推送通知的目标群组/频道 ID (可选，留空则仅在控制台输出)'),
  showRecovery: Schema.boolean().default(true).description('是否在服务恢复时也发送通知')
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
}

// 扩展 Context 接口 (如果需要做成服务)
declare module 'koishi' {
  interface Context {
    maimaiStatus: MaimaiStatus
  }
}

export class MaimaiStatus extends Service {
  private clientLogger: Logger
  private timer: NodeJS.Timeout | null = null
  // 内存中保存的分组状态映射： GroupName -> GroupData
  private groups: Map<string, ServiceGroup> = new Map()

  // API 地址常量
  private readonly PAGE_URL = 'https://status.awmc.cc/status/maimai'
  private readonly API_URL = 'https://status.awmc.cc/api/status-page/heartbeat/maimai'

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'maimaiStatus')
    this.clientLogger = ctx.logger('maimai-status')
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
      // 1. 同步配置 (从 HTML 获取 ID 映射)
      const monitorItems = await this.fetchMonitorConfig()
      if (!monitorItems || monitorItems.length === 0) {
        this.clientLogger.warn('Failed to sync monitor config or config is empty.')
        return
      }
      this.syncGroups(monitorItems)

      // 2. 获取实时心跳数据
      const heartbeatData = await this.fetchHeartbeats()
      if (!heartbeatData) {
        this.clientLogger.warn('Failed to fetch heartbeat data.')
        return
      }

      // 3. 分析状态并处理通知
      await this.analyzeAndNotify(heartbeatData)

    } catch (e) {
      this.clientLogger.error('Error in check task:', e)
    }
  }

  /**
   * 步骤1: 访问 HTML 页面提取 window.preloadData
   */
  private async fetchMonitorConfig(): Promise<MonitorItem[]> {
    try {
      const html = await this.ctx.http.get(this.PAGE_URL, { responseType: 'text' })
      // 使用正则提取 window.preloadData = { ... };
      const regex = /window\.preloadData\s*=\s*(\{.*?\});/s
      const match = html.match(regex)
      
      if (match && match[1]) {
        const data = JSON.parse(match[1])
        const monitorList: MonitorItem[] = []
        
        // 遍历 publicGroupList 提取所有 monitorList
        if (data.config && Array.isArray(data.publicGroupList)) {
            for (const group of data.publicGroupList) {
                if (Array.isArray(group.monitorList)) {
                    monitorList.push(...group.monitorList)
                }
            }
        }
        return monitorList
      }
    } catch (e) {
      this.clientLogger.error('Failed to parse monitor config from HTML', e)
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
      // 核心逻辑：去除结尾的 [xxx代理] 或 [xxx Proxy]
      // 此时 ID 74 "[1.53] 舞萌DX... [上海移动代理]" 会变成 "[1.53] 舞萌DX..."
      const cleanName = item.name.replace(/\s*\[.*?\]$/, '').trim()
      
      if (!currentStructure.has(cleanName)) {
        currentStructure.set(cleanName, [])
      }
      currentStructure.get(cleanName)?.push(item.id)
    }

    // 更新类成员 this.groups，保留之前的状态
    for (const [name, ids] of currentStructure) {
      if (!this.groups.has(name)) {
        // 新发现的服务，初始化状态为 UNKNOWN，避免刚启动就报警
        this.groups.set(name, { groupName: name, ids, lastStatus: 'UNKNOWN' })
      } else {
        // 更新 ID 列表（以防 ID 变更）
        const existing = this.groups.get(name)!
        existing.ids = ids
      }
    }
  }

  /**
   * 步骤3: 获取 API JSON 数据
   */
  private async fetchHeartbeats(): Promise<any> {
    try {
      const data = await this.ctx.http.get(this.API_URL)
      // data.heartbeatList 是一个对象，key 为 ID，value 为心跳数组
      return data.heartbeatList || {}
    } catch (e) {
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
    for (const [name, group] of this.groups) {
      const { ids, lastStatus } = group
      
      let upCount = 0
      let totalCount = 0

      for (const id of ids) {
        const history = heartbeatData[id]
        // 检查该 ID 是否有数据
        if (Array.isArray(history) && history.length > 0) {
          totalCount++
          // 取最新的一条数据
          const latest = history[history.length - 1]
          // status === 1 且 ping 不为 null 视为在线
          if (latest.status === 1) {
            upCount++
          }
        }
      }

      // 如果没有获取到该组任何 ID 的数据，跳过
      if (totalCount === 0) continue

      let currentStatus: ServiceStatus = 'UNKNOWN'

      if (upCount === totalCount) {
        currentStatus = 'ONLINE'
      } else if (upCount === 0) {
        currentStatus = 'OFFLINE'
      } else {
        currentStatus = 'PARTIAL_OFFLINE'
      }

      // 状态转移判定
      if (lastStatus !== 'UNKNOWN' && currentStatus !== lastStatus) {
        await this.handleStatusChange(name, lastStatus, currentStatus)
      }

      // 更新状态
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
                await bot.sendMessage(this.config.targetChannelId, message)
            } else {
                this.clientLogger.warn('No bot available to send notification.')
            }
        } catch (e) {
            this.clientLogger.error('Failed to send notification:', e)
        }
    }

    // 示例：您也可以在这里添加 HTTP webhook 推送
    // await this.ctx.http.post('YOUR_WEBHOOK_URL', { content: message })
  }
}

export default MaimaiStatus