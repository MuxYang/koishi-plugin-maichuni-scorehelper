/**
 * Song Data Manager Service
 * Handles caching of song data with etag validation for freshness
 */

import { Context, Service } from 'koishi'

export const name = 'song-data-manager'

// API endpoints
const DF_MAIMAI_MUSIC = 'https://www.diving-fish.com/api/maimaidxprober/music_data'
const DF_CHUNITHM_MUSIC = 'https://www.diving-fish.com/api/chunithmprober/music_data'

// Song data structure from DivingFish API
export interface SongData {
    id: string | number
    title: string
    type: 'SD' | 'DX'
    ds: number[]  // chart constants per difficulty
    level: string[]
    charts: {
        notes: number[]  // [tap, hold, slide, (touch?), break]
        charter?: string
    }[]
    basic_info?: {
        title: string
        artist: string
        genre: string
        bpm: number
        is_new: boolean
    }
}

export interface NoteCount {
    tap: number
    hold: number
    slide: number
    touch: number
    break: number
    total: number
}

declare module 'koishi' {
    interface Context {
        songDataManager: SongDataManager
    }
}


export class SongDataManager extends Service {
    static inject = ['http', 'database']

    private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

    constructor(ctx: Context) {
        super(ctx, 'songDataManager')
    }

    /**
     * Get song data from cache or API
     * Always validates cache freshness using etag
     */
    async getSong(game: 'maimai' | 'chunithm', songId: string): Promise<SongData | null> {
        // First ensure cache is up-to-date
        await this.ensureCacheValid(game)

        // Get from cache
        const cached = await this.ctx.database.get('song_cache', {
            game,
            song_id: songId
        })

        if (cached.length > 0) {
            try {
                return JSON.parse(cached[0].data) as SongData
            } catch {
                this.logger.warn(`Failed to parse cached song data for ${game}:${songId}`)
            }
        }

        return null
    }

    /**
     * Get note counts for a specific chart
     * @param game Game type
     * @param songId Song ID
     * @param difficulty 0=Basic, 1=Advanced, 2=Expert, 3=Master, 4=Re:Master
     */
    async getNoteCount(game: 'maimai' | 'chunithm', songId: string, difficulty: number): Promise<NoteCount | null> {
        const song = await this.getSong(game, songId)
        if (!song || !song.charts || !song.charts[difficulty]) {
            return null
        }

        const notes = song.charts[difficulty].notes
        if (!notes || notes.length < 4) {
            return null
        }

        // Maimai DX has 5 elements: [tap, hold, slide, touch, break]
        // Maimai SD has 4 elements: [tap, hold, slide, break]
        const isDX = song.type === 'DX' || notes.length === 5

        const tap = notes[0] || 0
        const hold = notes[1] || 0
        const slide = notes[2] || 0
        const touch = isDX ? (notes[3] || 0) : 0
        const breakNote = isDX ? (notes[4] || 0) : (notes[3] || 0)

        return {
            tap,
            hold,
            slide,
            touch,
            break: breakNote,
            total: tap + hold + slide + touch + breakNote
        }
    }

    /**
     * Find song by title or alias
     */
    async findSong(game: 'maimai' | 'chunithm', query: string): Promise<SongData | null> {
        await this.ensureCacheValid(game)

        // First try exact match on song_id
        const byId = await this.ctx.database.get('song_cache', {
            game,
            song_id: query
        })

        if (byId.length > 0) {
            try {
                return JSON.parse(byId[0].data) as SongData
            } catch { }
        }

        // Search all cached songs for title match
        const allSongs = await this.ctx.database.get('song_cache', { game })
        const queryLower = query.toLowerCase()

        for (const cached of allSongs) {
            try {
                const song = JSON.parse(cached.data) as SongData
                if (song.title.toLowerCase() === queryLower) {
                    return song
                }
            } catch { }
        }

        // Partial match
        for (const cached of allSongs) {
            try {
                const song = JSON.parse(cached.data) as SongData
                if (song.title.toLowerCase().includes(queryLower)) {
                    return song
                }
            } catch { }
        }

        return null
    }

    /**
     * Ensure cache is valid using etag validation
     * If cache is stale or missing, refresh from API
     */
    async ensureCacheValid(game: 'maimai' | 'chunithm'): Promise<boolean> {
        const metaKey = `${game}_music_data`
        const apiUrl = game === 'maimai' ? DF_MAIMAI_MUSIC : DF_CHUNITHM_MUSIC

        // Get stored etag
        const metadata = await this.ctx.database.get('cache_metadata', { key: metaKey })
        const storedEtag = metadata.length > 0 ? metadata[0].etag : null

        try {
            const headers: Record<string, string> = {
                'User-Agent': this.UA
            }
            if (storedEtag) {
                headers['If-None-Match'] = storedEtag
            }

            const response = await this.ctx.http('GET', apiUrl, {
                headers,
                // Allow 304 to pass through without throwing
                validateStatus: (status) => status === 200 || status === 304,
            })

            if (response.status === 304) {
                this.logger.debug(`${game} song cache is up-to-date (etag: ${storedEtag})`)
                return true
            }

            const newEtag = response.headers?.get('etag') ?? ''
            const songs: SongData[] = response.data

            this.logger.info(`Updating ${game} song cache: ${songs.length} songs (etag: ${newEtag})`)
            await this.updateCache(game, songs, newEtag)
            return true
        } catch (error) {
            this.logger.error(`Error validating ${game} cache:`, error)
            const hasCache = await this.ctx.database.get('song_cache', { game }, ['id'])
            return hasCache.length > 0
        }
    }

    /**
     * Force refresh cache from API
     */
    async refreshCache(game: 'maimai' | 'chunithm'): Promise<boolean> {
        const apiUrl = game === 'maimai' ? DF_MAIMAI_MUSIC : DF_CHUNITHM_MUSIC

        try {
            const response = await this.ctx.http('GET', apiUrl, {
                headers: { 'User-Agent': this.UA },
            })

            const etag = response.headers?.get('etag') ?? ''
            const songs: SongData[] = response.data

            this.logger.info(`Force refreshing ${game} song cache: ${songs.length} songs`)
            await this.updateCache(game, songs, etag)
            return true
        } catch (error) {
            this.logger.error(`Error refreshing ${game} cache:`, error)
            return false
        }
    }

    /**
     * Update cache with new song data
     */
    private async updateCache(game: 'maimai' | 'chunithm', songs: SongData[], etag: string): Promise<void> {
        const now = new Date()
        const metaKey = `${game}_music_data`

        // Clear old cache for this game
        await this.ctx.database.remove('song_cache', { game })

        // Insert new data in batches
        const batchSize = 100
        for (let i = 0; i < songs.length; i += batchSize) {
            const batch = songs.slice(i, i + batchSize)
            await this.ctx.database.upsert('song_cache', batch.map(song => ({
                game,
                song_id: String(song.id),
                data: JSON.stringify(song),
                updated_at: now
            })), ['game', 'song_id'])
        }

        // Update etag metadata
        await this.ctx.database.upsert('cache_metadata', [{
            key: metaKey,
            etag,
            updated_at: now
        }], ['key'])

        this.logger.info(`${game} song cache updated: ${songs.length} songs`)
    }

    /**
     * Get cache statistics
     */
    async getCacheStats(game: 'maimai' | 'chunithm'): Promise<{
        songCount: number
        etag: string | null
        updatedAt: Date | null
    }> {
        const songs = await this.ctx.database.get('song_cache', { game }, ['id'])
        const metadata = await this.ctx.database.get('cache_metadata', { key: `${game}_music_data` })

        return {
            songCount: songs.length,
            etag: metadata.length > 0 ? metadata[0].etag : null,
            updatedAt: metadata.length > 0 ? metadata[0].updated_at : null
        }
    }
}

export default SongDataManager
