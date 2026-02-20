const { Schema } = require('koishi')

const schema = Schema.union([
    Schema.object({
        preset: Schema.union([
            Schema.const('uptime-kuma').description('Uptime Kuma'),
            Schema.const('uptimerobot').description('UptimeRobot'),
            Schema.const('hetrixtools').description('HetrixTools'),
        ]).default('uptime-kuma').description('服务类型'),
        apiUrl: Schema.string().required().description('API 地址'),
    }),
    Schema.object({
        preset: Schema.const('custom').description('自定义'),
        apiUrl: Schema.string().required().description('API 地址'),
        webUrl: Schema.string().description('Web 页面 URL（可选，用于获取服务名称）'),
        apiFormat: Schema.string().required().default('{"x": 1}'),
    }),
])

console.log(JSON.stringify(schema, null, 2))
