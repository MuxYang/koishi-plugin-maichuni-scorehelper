export default {
    commands: {
        maisms: {
            description: '查看舞萌 DX 服务器状态'
        },
        'maimai-status': {
            description: '查看舞萌 DX 服务器状态'
        },
        maib50test: {
            description: '测试生成 MaiMai B50 成绩单图片'
        },
        chub50test: {
            description: '测试生成 Chunithm B50 成绩单图片'
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
