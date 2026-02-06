/**
 * Database table definitions for the plugin
 */

export interface UserToken {
    id: number
    platform: string
    user_id: string
    maimai_token?: string
    chunithm_token?: string
    fish_encrypted_creds?: string  // AES-GCM encrypted {username, password}
    lxns_token?: string
    lxns_friend_code?: number
    preferred_mode?: 'fish' | 'lxns' | null // 'fish' | 'lxns'
    updated_at: Date
}

export interface SongAlias {
    id: number
    game: 'maimai' | 'chunithm'
    song_id: number
    alias: string
    source: 'local' | 'lxns'
    created_at: Date
}

export interface ServiceName {
    id: number
    service_id: string
    name: string
    source: string
    updated_at: Date
}

export interface MaimaiMonitorName {
    id: number
    source: string
    monitor_id: number
    name: string
    updated_at: Date
}

export interface SongCache {
    id: number
    game: 'maimai' | 'chunithm'
    song_id: string
    data: string  // JSON stringified song data
    updated_at: Date
}

export interface CacheMetadata {
    id: number
    key: string  // e.g., 'maimai_music_data', 'chunithm_music_data'
    etag: string
    updated_at: Date
}

declare module 'koishi' {
    interface Tables {
        user_token: UserToken
        song_alias: SongAlias
        service_name: ServiceName
        maimai_monitor_name: MaimaiMonitorName
        song_cache: SongCache
        cache_metadata: CacheMetadata
    }
}

/**
 * Register database tables
 */
export function registerTables(ctx: import('koishi').Context) {
    ctx.model.extend('user_token', {
        id: 'unsigned',
        platform: 'string',
        user_id: 'string',
        maimai_token: 'string',
        chunithm_token: 'string',
        fish_encrypted_creds: 'text',
        lxns_token: 'string',
        lxns_friend_code: 'unsigned',
        preferred_mode: 'string',
        updated_at: 'timestamp'
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['platform', 'user_id']]
    })

    ctx.model.extend('song_alias', {
        id: 'unsigned',
        game: 'string',
        song_id: 'unsigned',
        alias: 'string',
        source: 'string',
        created_at: 'timestamp'
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['game', 'alias']]
    })

    ctx.model.extend('service_name', {
        id: 'unsigned',
        service_id: 'string',
        name: 'string',
        source: 'string',
        updated_at: 'timestamp'
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['source', 'service_id']]
    })

    ctx.model.extend('maimai_monitor_name', {
        id: 'unsigned',
        source: 'string',
        monitor_id: 'integer',
        name: 'string',
        updated_at: 'timestamp'
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['source', 'monitor_id']]
    })

    ctx.model.extend('song_cache', {
        id: 'unsigned',
        game: 'string',
        song_id: 'string',
        data: 'text',
        updated_at: 'timestamp'
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['game', 'song_id']]
    })

    ctx.model.extend('cache_metadata', {
        id: 'unsigned',
        key: 'string',
        etag: 'string',
        updated_at: 'timestamp'
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['key']]
    })
}
