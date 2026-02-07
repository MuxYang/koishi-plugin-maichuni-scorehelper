import { Context, Service } from 'koishi'
import type { SongAlias } from '../database'

export const name = 'alias-manager'

const LXNS_MAIMAI_ALIAS_API = 'https://maimai.lxns.net/api/v0/maimai/alias/list'
const LXNS_CHUNITHM_ALIAS_API = 'https://maimai.lxns.net/api/v0/chunithm/alias/list'

interface LxnsAliasResponse {
    aliases: Array<{
        song_id: number
        aliases: string[]
    }>
}

declare module 'koishi' {
    interface Context {
        aliasManager: AliasManager
    }
}



export class AliasManager extends Service {
    static inject = ['database']
    
    private lxnsAliasCache: {
        maimai: Map<number, string[]>
        chunithm: Map<number, string[]>
    } = {
            maimai: new Map(),
            chunithm: new Map()
        }

    private reverseCache: {
        maimai: Map<string, number>
        chunithm: Map<string, number>
    } = {
            maimai: new Map(),
            chunithm: new Map()
        }

    constructor(ctx: Context) {
        super(ctx, 'aliasManager')
    }

    protected async start() {
        // Fetch lxns aliases on startup
        await this.refreshLxnsCache('maimai')
        await this.refreshLxnsCache('chunithm')
        this.logger.info('Alias manager started, lxns cache loaded')
    }

    /**
     * Resolve a song by alias or song_id
     * Priority: local DB → lxns API cache
     * @returns song_id or null if not found
     */
    async resolveSong(game: 'maimai' | 'chunithm', query: string): Promise<number | null> {
        // Try parsing as number first (song ID)
        const asNumber = parseInt(query, 10)
        if (!isNaN(asNumber)) {
            return asNumber
        }

        // Try local database
        const localResult = await this.ctx.database.get('song_alias', {
            game,
            alias: query
        })
        if (localResult.length > 0) {
            return localResult[0].song_id
        }

        // Try lxns cache
        const lxnsResult = this.reverseCache[game].get(query.toLowerCase())
        if (lxnsResult !== undefined) {
            return lxnsResult
        }

        return null
    }

    /**
     * Get all aliases for a song
     */
    async getAliases(game: 'maimai' | 'chunithm', songId: number): Promise<{ local: string[], lxns: string[] }> {
        // Get local aliases
        const localResults = await this.ctx.database.get('song_alias', {
            game,
            song_id: songId,
            source: 'local'
        })
        const local = localResults.map(r => r.alias)

        // Get lxns aliases
        const lxns = this.lxnsAliasCache[game].get(songId) || []

        return { local, lxns }
    }

    /**
     * Add a local alias
     */
    async addAlias(game: 'maimai' | 'chunithm', songId: number, alias: string): Promise<boolean> {
        // Check if already exists
        const existing = await this.ctx.database.get('song_alias', {
            game,
            alias
        })
        if (existing.length > 0) {
            return false // Alias already exists
        }

        await this.ctx.database.create('song_alias', {
            game,
            song_id: songId,
            alias,
            source: 'local',
            created_at: new Date()
        })
        return true
    }

    /**
     * Delete a local alias
     */
    async deleteAlias(game: 'maimai' | 'chunithm', alias: string): Promise<boolean> {
        const result = await this.ctx.database.remove('song_alias', {
            game,
            alias,
            source: 'local'
        })
        return (result.matched ?? 0) > 0
    }

    /**
     * Refresh lxns alias cache
     */
    async refreshLxnsCache(game: 'maimai' | 'chunithm'): Promise<void> {
        try {
            const url = game === 'maimai' ? LXNS_MAIMAI_ALIAS_API : LXNS_CHUNITHM_ALIAS_API
            const response = await this.ctx.http.get<LxnsAliasResponse>(url, {
                timeout: 15000
            })

            this.lxnsAliasCache[game].clear()
            this.reverseCache[game].clear()

            for (const item of response.aliases) {
                this.lxnsAliasCache[game].set(item.song_id, item.aliases)
                for (const alias of item.aliases) {
                    this.reverseCache[game].set(alias.toLowerCase(), item.song_id)
                }
            }

            this.logger.info(`Refreshed ${game} lxns alias cache: ${response.aliases.length} songs`)
        } catch (e) {
            this.logger.warn(`Failed to fetch ${game} lxns alias cache:`, e)
        }
    }
}

export default AliasManager
