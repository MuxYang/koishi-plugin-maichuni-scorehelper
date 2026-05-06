/**
 * ESA Edge Function - Generate encrypted login token
 * ES Module format for Alibaba Cloud ESA
 */

const IV_LENGTH = 12
const TAG_LENGTH = 16

async function handleApiRequest(request) {
    // 从环境变量读取 AUTH_TOKEN
    // 支持：阿里云 ESA (process.env.AUTHTOKEN) 和腾讯 EdgeOne (process.env.AUTHTOKEN)
    const AUTH_TOKEN = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            success: false,
            error: 'Method not allowed'
        }), { headers: corsHeaders, status: 405 })
    }

    if (!AUTH_TOKEN || AUTH_TOKEN.length !== 32) {
        return new Response(JSON.stringify({
            success: false,
            error: '服务器配置错误：环境变量 AUTHTOKEN 未设置或长度不为 32'
        }), { headers: corsHeaders, status: 500 })
    }

    try {
        const body = await request.json()

        if (!body.username || !body.password) {
            return new Response(JSON.stringify({
                success: false,
                error: '请提供用户名和密码'
            }), { headers: corsHeaders, status: 400 })
        }

        const payload = {
            username: body.username,
            password: body.password,
            timestamp: Date.now()
        }

        const token = await encrypt(JSON.stringify(payload), AUTH_TOKEN)

        return new Response(JSON.stringify({
            success: true,
            token
        }), { headers: corsHeaders })

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: '生成令牌时发生错误: ' + (error.message || String(error))
        }), { headers: corsHeaders, status: 500 })
    }
}

async function encrypt(data, authToken) {
    const encoder = new TextEncoder()

    // AES-GCM IV (12 bytes)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Import authToken directly as AES-256 key (raw, 32 bytes)
    // Must match crypto-utils.ts: Buffer.from(authToken, 'utf8')
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(authToken),
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    )

    // Encrypt
    const encryptedResult = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(data)
    )

    // Web Crypto returns [ciphertext + tag] (tag is last 16 bytes)
    const encryptedBytes = new Uint8Array(encryptedResult)
    const tag = encryptedBytes.slice(-TAG_LENGTH)
    const rawCiphertext = encryptedBytes.slice(0, -TAG_LENGTH)

    // Construct final buffer: iv (12) + tag (16) + ciphertext
    // Must match crypto-utils.ts decrypt format exactly
    const combined = new Uint8Array(iv.length + tag.length + rawCiphertext.length)
    combined.set(iv, 0)
    combined.set(tag, iv.length)
    combined.set(rawCiphertext, iv.length + tag.length)

    return btoa(String.fromCharCode(...combined))
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url)

        if (url.pathname.startsWith('/api/generate-token')) {
            return handleApiRequest(request)
        }

        return undefined
    },

    async bypass(request, env, ctx) {
        const url = new URL(request.url)
        return !url.pathname.startsWith('/api/')
    }
}
