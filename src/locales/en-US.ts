export default {
    commands: {
        maisms: {
            description: 'View Maimai DX server status'
        },
        'maimai-status': {
            description: 'View Maimai DX server status'
        },
        maib50test: {
            description: 'Test generating MaiMai B50 score card image'
        },
        chub50test: {
            description: 'Test generating Chunithm B50 score card image'
        }
    },
    'status-monitor': {
        'no-data': 'No server monitoring data available, please try again later.',
        header: 'Maimai DX Server Status:',
        online: 'Online',
        offline: 'Offline',
        maintenance: 'Maintenance',
        partial: 'Partial',
        unknown: 'Unknown',
        'data-source': 'Data Source',
        'push-enabled-no-targets': 'Push enabled but no targets configured',
        'invalid-target-format': 'Invalid push target format: {0}',
        'api-failed-fallback-web': 'API request failed, trying to sync from web page...',
        'invalid-heartbeat-format': 'Invalid heartbeat data format',
        'new-service-detected': 'New service ID detected: {0}, need to sync name',
        'synced-names': 'Synced {0} service names',
        'other-source-no-api': 'No API URL configured for other data source',
        'fetch-other-failed': 'Failed to fetch other data source',
        'parse-failed': 'Failed to parse data source response',
        'custom-needs-format': 'Custom data source requires API format template',
        'save-cache-failed': 'Failed to save cache',
        'loaded-from-cache': 'Loaded {0} monitor items from cache',
        'detected-new-service': 'Detected new service: {0} (ID: {1})',
        'puppeteer-failed': 'Puppeteer fetch failed: {0}',
        'html-parse-failed': 'Failed to parse monitor config from HTML',
        'heartbeat-parse-failed': 'Heartbeat JSON parse failed: {0}',
        'http-heartbeat-failed': 'HTTP heartbeat fetch failed: {0}',
        'window-not-ready': '[Notify] {0} window not ready: {1}s < {2}s',
        'no-bot-available': 'No bot available to send notification',
        'push-to-target': 'Push to {0}: {1}',
        'push-failed': 'Push to {0} failed',
        'monitor-started': 'Maimai status monitor started',
        'monitor-stopped': 'Maimai status monitor stopped',
        'check-task-error': 'Check task error'
    }
}
