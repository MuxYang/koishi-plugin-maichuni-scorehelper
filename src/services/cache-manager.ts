import { Context, Service } from 'koishi'
import * as fs from 'fs/promises'
import * as path from 'path'

export const name = 'imagecache'

declare module 'koishi' {
    interface Context {
        imagecache: ImageCacheManager
    }
}

/**
 * 图片缓存管理器
 * 管理曲绘和头像等图片的本地缓存
 * 文件命名格式：{源-ID}.png，例如：maimai-1923、qq-12345
 */
export class ImageCacheManager extends Service {
    private cacheDir: string

    constructor(ctx: Context) {
        super(ctx, 'imagecache')
        this.cacheDir = path.join(ctx.baseDir, 'data', 'maichuni-scorehelper', 'imgcache')
    }

    protected async start() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true })
            if (this.ctx.config.debug) {
                this.ctx.logger('imagecache').info(`图片缓存目录已初始化: ${this.cacheDir}`)
            }
        } catch (error) {
            this.ctx.logger('imagecache').error(`初始化缓存目录失败:`, error)
        }
    }

    /** 获取缓存文件路径 */
    public getCachePath(source: string, id: string | number): string {
        return path.join(this.cacheDir, `${source}-${id}.png`)
    }

    /** 获取缓存的 file:// URL */
    public getCacheUrl(source: string, id: string | number): string {
        const cachePath = this.getCachePath(source, id)
        return `file://${cachePath.replace(/\\/g, '/')}`
    }

    /** 检查缓存是否存在 */
    public async exists(source: string, id: string | number): Promise<boolean> {
        try {
            await fs.access(this.getCachePath(source, id))
            return true
        } catch {
            return false
        }
    }

    /**
     * 尝试从单个 URL 下载并保存
     * @returns 是否成功
     */
    private async fetchAndSave(url: string, cachePath: string, timeout: number = 10000): Promise<boolean> {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        try {
            const response = await fetch(url, { signal: controller.signal })
            clearTimeout(timeoutId)
            if (!response.ok) return false
            const buffer = await response.arrayBuffer()
            if (buffer.byteLength < 100) return false // 太小的可能是占位图
            await fs.writeFile(cachePath, Buffer.from(buffer))
            return true
        } catch {
            clearTimeout(timeoutId)
            return false
        }
    }

    /**
     * 下载图片到缓存，支持多个 URL 按优先级依次尝试
     * 水鱼优先 → LXNS fallback → 全部失败返回 null
     * @param urls 单个 URL 或按优先级排列的 URL 列表
     * @param source 缓存来源标识 (如 'maimai', 'chunithm', 'qq')
     * @param id 缓存资源 ID
     * @param timeout 每个请求的超时时间（毫秒）
     */
    public async downloadImage(
        urls: string | string[],
        source: string,
        id: string | number,
        timeout: number = 10000
    ): Promise<string | null> {
        // 已缓存直接返回
        if (await this.exists(source, id)) {
            return this.getCacheUrl(source, id)
        }

        const urlList = Array.isArray(urls) ? urls : [urls]
        const cachePath = this.getCachePath(source, id)
        const logger = this.ctx.logger('imagecache')

        for (const url of urlList) {
            if (!url) continue
            const success = await this.fetchAndSave(url, cachePath, timeout)
            if (success) {
                logger.debug(`图片已缓存: ${source}-${id} <- ${url}`)
                return this.getCacheUrl(source, id)
            }
            logger.debug(`下载失败 [${source}-${id}]: ${url}`)
        }

        // 所有 URL 都失败
        logger.warn(`图片缓存失败 [${source}-${id}]: 所有源均不可用`)
        return null
    }

    /**
     * 批量下载图片（并发控制）
     * 每个图片独立 try-catch，单个失败绝不中断其余下载
     */
    public async downloadImagesParallel(
        images: Array<{ urls: string | string[]; source: string; id: string | number }>,
        concurrency: number = 5
    ): Promise<Map<string, string>> {
        const results = new Map<string, string>()
        const queue = [...images]

        const processNext = async () => {
            while (queue.length > 0) {
                const item = queue.shift()
                if (!item) break
                const key = `${item.source}-${item.id}`
                try {
                    const url = await this.downloadImage(item.urls, item.source, item.id)
                    if (url) results.set(key, url)
                } catch (error) {
                    this.ctx.logger('imagecache').debug(`并发下载异常 [${key}]: ${error instanceof Error ? error.message : String(error)}`)
                }
            }
        }

        const workers: Promise<void>[] = []
        for (let i = 0; i < Math.min(concurrency, images.length); i++) {
            workers.push(processNext())
        }
        await Promise.all(workers)

        const total = images.length
        const cached = results.size
        if (cached < total) {
            this.ctx.logger('imagecache').info(`批量下载: ${cached}/${total} 成功, ${total - cached} 失败`)
        }
        return results
    }

    /** 清理过期缓存 */
    public async cleanupOldCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
        try {
            const files = await fs.readdir(this.cacheDir)
            let cleaned = 0
            const now = Date.now()
            for (const file of files) {
                const filePath = path.join(this.cacheDir, file)
                const stat = await fs.stat(filePath)
                if (now - stat.mtimeMs > maxAgeMs) {
                    await fs.unlink(filePath)
                    cleaned++
                }
            }
            if (cleaned > 0) {
                this.ctx.logger('imagecache').info(`清理过期缓存: ${cleaned} 个文件`)
            }
            return cleaned
        } catch (error) {
            this.ctx.logger('imagecache').error(`清理缓存时出错:`, error)
            return 0
        }
    }
}

export default ImageCacheManager
