/**
 * Cloudflare Pages Function - Generate encrypted login token
 * Uses Web Crypto API for AES-256-GCM encryption
 */

interface Env {
    AUTHTOKEN: string
}

interface RequestBody {
    username: string
    password: string
}

const IV_LENGTH = 12
const TAG_LENGTH = 16

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
    const { request, env } = context

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }

    if (!env.AUTHTOKEN || env.AUTHTOKEN.length !== 32) {
        return new Response(JSON.stringify({
            success: false,
            error: '服务器配置错误：AUTHTOKEN 未正确配置'
        }), { headers: corsHeaders, status: 500 })
    }

    try {
        const body: RequestBody = await request.json()

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

        const token = await encrypt(JSON.stringify(payload), env.AUTHTOKEN)

        return new Response(JSON.stringify({
            success: true,
            token
        }), { headers: corsHeaders })

    } catch (error) {
        console.error('Error generating token:', error)
        return new Response(JSON.stringify({
            success: false,
            error: '生成令牌时发生错误'
        }), { headers: corsHeaders, status: 500 })
    }
}

export function onRequestOptions(): Response {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    })
}

async function encrypt(data: string, authToken: string): Promise<string> {
    const encoder = new TextEncoder()

    // AES-GCM IV (12 bytes)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Import authToken directly as AES-256 key (raw, 32 bytes)
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

    // Web Crypto returns [ciphertext + tag] (tag is 16 bytes at the end)
    const encryptedBytes = new Uint8Array(encryptedResult)
    const tagLength = 16

    // Split tag and ciphertext
    const tag = encryptedBytes.slice(-tagLength)
    const rawCiphertext = encryptedBytes.slice(0, -tagLength)

    // Construct final buffer: iv + tag + ciphertext
    // NO SALT (as we use direct key)
    const combined = new Uint8Array(iv.length + tag.length + rawCiphertext.length)
    combined.set(iv, 0)
    combined.set(tag, iv.length)
    combined.set(rawCiphertext, iv.length + tag.length)

    return btoa(String.fromCharCode(...combined))
}
