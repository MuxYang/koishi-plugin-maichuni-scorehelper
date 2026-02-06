export default {
    commands: {
        maisms: {
            description: '查看舞萌 DX 服务器状态'
        },
        'maimai-status': {
            description: '查看舞萌 DX 服务器状态'
        },
        mai: {
            description: '舞萌 DX 查分指令'
        },
        'mai.b50': {
            description: '查询 Best 50 (B35+B15)'
        },
        'mai.b35': {
            description: '查询 Best 35 (旧曲)'
        },
        'mai.b15': {
            description: '查询 Best 15 (新曲)'
        },
        'mai.ap50': {
            description: '查询 AP50 成绩 (All Perfect)'
        },
        'mai.fc50': {
            description: '查询 FC50 成绩 (Full Combo)'
        },
        'mai.calc': {
            description: '计算达成目标分数的容错'
        },
        'mai.alias': {
            description: '别名管理'
        },
        'mai.alias.add': {
            description: '添加本地别名'
        },
        'mai.alias.delete': {
            description: '删除本地别名'
        },
        'mai.alias.list': {
            description: '查看别名列表'
        },
        'mai.bind': {
            description: '绑定 Import Token'
        },
        chu: {
            description: '中二节奏查分指令'
        },
        'chu.b50': {
            description: '查询 Best 50 (B30+N20)'
        },
        'chu.b30': {
            description: '查询 Best 30 (旧曲)'
        },
        'chu.n20': {
            description: '查询 New 20 (新曲)'
        },
        'chu.aj50': {
            description: '查询 AJ50 成绩 (All Justice)'
        },
        'chu.fc50': {
            description: '查询 FC50 成绩 (Full Combo)'
        },
        'chu.calc': {
            description: '计算达成目标分数的容错'
        },
        'chu.alias': {
            description: '别名管理'
        },
        'chu.alias.add': {
            description: '添加本地别名'
        },
        'chu.alias.delete': {
            description: '删除本地别名'
        },
        'chu.alias.list': {
            description: '查看别名列表'
        },
        'chu.bind': {
            description: '绑定 Import Token'
        }
    },
    'status-monitor': {
        'no-data': '暂无服务器监控数据，请稍后再试。',
        header: '舞萌 DX 服务器状态:',
        online: '在线',
        offline: '中断',
        maintenance: '监测点维护',
        partial: '部分异常',
        unknown: '未知',
        'data-source': '数据源',
        'push-enabled-no-targets': '推送已启用但未配置推送目标',
        'invalid-target-format': '无效的推送目标格式: {0}',
        'api-failed-fallback-web': 'API 请求失败，尝试从 Web 页面同步...',
        'invalid-heartbeat-format': '心跳数据格式无效',
        'new-service-detected': '发现新服务 ID: {0}，需要同步名称',
        'synced-names': '同步了 {0} 个服务名称',
        'other-source-no-api': '未配置其他数据源的 API 地址',
        'fetch-other-failed': '获取其他数据源失败',
        'parse-failed': '解析数据源响应失败',
        'custom-needs-format': '自定义数据源需要提供 API 格式模板',
        'save-cache-failed': '保存缓存失败',
        'loaded-from-cache': '从缓存加载了 {0} 个监控项',
        'detected-new-service': '检测到新服务: {0} (ID: {1})',
        'puppeteer-failed': 'Puppeteer 获取失败: {0}',
        'html-parse-failed': '从 HTML 解析监控配置失败',
        'heartbeat-parse-failed': '心跳 JSON 解析失败: {0}',
        'http-heartbeat-failed': 'HTTP 心跳获取失败: {0}',
        'window-not-ready': '[通知] {0} 窗口未就绪: {1}s < {2}s',
        'no-bot-available': '没有可用的 Bot 发送通知',
        'push-to-target': '推送到 {0}: {1}',
        'push-failed': '推送到 {0} 失败',
        'monitor-started': '舞萌状态监控已启动',
        'monitor-stopped': '舞萌状态监控已停止',
        'check-task-error': '检查任务出错'
    }
}
