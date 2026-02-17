/**
 * Crypto utilities for secure credential encryption/decryption
 * Uses AES-256-GCM for authenticated encryption
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

// Encryption parameters
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96 bits for GCM
const TAG_LENGTH = 16  // 128 bits

// Token validity period (5 minutes)
const TOKEN_VALIDITY_MS = 5 * 60 * 1000

export interface EncryptedCredentials {
    username: string
    password: string
    timestamp: number
}

/**
 * Derive encryption key directly from auth token
 * The authToken is a 32-char string, which is exactly 32 bytes (256 bits) for AES-256
 */
function getKey(authToken: string): Buffer {
    return Buffer.from(authToken, 'utf8')
}

/**
 * Encrypt credentials with AES-256-GCM
 * Format: base64(iv + tag + ciphertext)
 */
export function encrypt(data: EncryptedCredentials, authToken: string): string {
    const iv = randomBytes(IV_LENGTH)
    const key = getKey(authToken)

    const cipher = createCipheriv(ALGORITHM, key, iv)
    const plaintext = JSON.stringify(data)

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ])

    const tag = cipher.getAuthTag()

    // Combine: iv (12) + tag (16) + ciphertext
    const combined = Buffer.concat([iv, tag, encrypted])
    return combined.toString('base64')
}

/** Decrypt result type */
export type DecryptResult =
    | { success: true; data: EncryptedCredentials }
    | { success: false; error: string }

/**
 * Decrypt token and validate timestamp
 * Returns success/failure with detailed error message
 */
export function decrypt(token: string, authToken: string): DecryptResult {
    try {
        const combined = Buffer.from(token, 'base64')

        // Minimum length check: iv + tag + at least 1 byte
        if (combined.length < IV_LENGTH + TAG_LENGTH + 1) {
            return { success: false, error: `Token length invalid (received ${combined.length} bytes)` }
        }

        // Extract components
        const iv = combined.subarray(0, IV_LENGTH)
        const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
        const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH)

        const key = getKey(authToken)
        const decipher = createDecipheriv(ALGORITHM, key, iv)
        decipher.setAuthTag(tag)

        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ])

        const data = JSON.parse(decrypted.toString('utf8')) as EncryptedCredentials
        return { success: true, data }
    } catch (e) {
        return { success: false, error: `Decryption failed: ${(e as Error).message}` }
    }
}

/**
 * Decrypt and validate token timestamp (for login tokens)
 * Token is valid only for 5 minutes after creation
 */
export function decryptAndValidate(token: string, authToken: string): DecryptResult {
    const result = decrypt(token, authToken)
    if (!result.success) return result

    const data = result.data
    const now = Date.now()
    if (!data.timestamp || now - data.timestamp > TOKEN_VALIDITY_MS) {
        return {
            success: false,
            error: `Token expired (Time diff: ${now - (data.timestamp || 0)}ms > ${TOKEN_VALIDITY_MS}ms)`
        }
    }

    return { success: true, data }
}

/**
 * Re-encrypt credentials for storage (without timestamp validation)
 * Uses new salt/iv for each encryption
 */
export function reencryptForStorage(creds: { username: string; password: string }, authToken: string): string {
    return encrypt({
        username: creds.username,
        password: creds.password,
        timestamp: 0  // Not used for storage
    }, authToken)
}

/**
 * Decrypt stored credentials
 */
export function decryptStored(encrypted: string, authToken: string): { username: string; password: string } | null {
    const result = decrypt(encrypted, authToken)
    if (!result.success) return null
    return { username: result.data.username, password: result.data.password }
}

/**
 * Generate a random 32-character auth token
 */
export function generateAuthToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const bytes = randomBytes(32)
    return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

/**
 * Hash authToken for safe comparison/logging
 */
export function hashToken(authToken: string): string {
    return createHash('sha256').update(authToken).digest('hex').substring(0, 16)
}
