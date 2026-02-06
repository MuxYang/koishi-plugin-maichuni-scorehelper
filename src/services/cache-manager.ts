import { Context, Service } from 'koishi'
import * as fs from 'fs/promises'
import * as path from 'path'

export const name = 'imagecache'

/**
 * 图片缓存管理器
 * 管理曲绘和头像等图片的本地缓存
 * 文件命名格式：{源-ID}.png，例如：lxns-1923、onebot-12345
 */
export class ImageCacheManager extends Service {
    private cacheDir: string

    constructor(ctx: Context) {
        super(ctx, 'imagecache')
        // 使用 Koishi 的数据目录
        this.cacheDir = path.join(ctx.baseDir, 'data', 'maichuni-scorehelper', 'imgcache')
    }

    protected async start() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true })
            this.ctx.logger('imagecache').info(`图片缓存目录已初始化: ${this.cacheDir}`)
        } catch (error) {
            this.ctx.logger('imagecache').error(`初始化缓存目录失败:`, error)
        }
    }

    /**
     * 获取缓存文件路径
     * @param source 来源（如 'lxns'、'onebot'、'qq'）
     * @param id 资源ID
     */
    public getCachePath(source: string, id: string | number): string {
        return path.join(this.cacheDir, `${source}-${id}.png`)
    }

    /**
     * 获取缓存的 file:// URL
     */
    public getCacheUrl(source: string, id: string | number): string {
        const cachePath = this.getCachePath(source, id)
        // 转换为 file:// URL 格式
        return `file://${cachePath.replace(/\\/g, '/')}`
    }

    /**
     * 检查缓存是否存在
     */
    public async exists(source: string, id: string | number): Promise<boolean> {
        try {
            await fs.access(this.getCachePath(source, id))
            return true
        } catch {
            return false
        }
    }

    /**
     * 下载图片到缓存（带重试和超时）
     * @param url 图片 URL
     * @param source 来源标识
     * @param id 资源ID
     * @param timeout 超时时间（毫秒）
     */
    public async downloadImage(
        url: string,
        source: string,
        id: string | number,
        timeout: number = 10000
    ): Promise<string | null> {
        const cachePath = this.getCachePath(source, id)

        // 检查是否已缓存
        if (await this.exists(source, id)) {
            return this.getCacheUrl(source, id)
        }

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), timeout)

            const response = await fetch(url, {
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                this.ctx.logger('imagecache').warn(`下载失败 [${source}-${id}]: HTTP ${response.status} - ${url}`)
                return null
            }

            const buffer = await response.arrayBuffer()
            await fs.writeFile(cachePath, Buffer.from(buffer))

            this.ctx.logger('imagecache').debug(`图片已缓存: ${source}-${id} (${buffer.byteLength} bytes)`)
            return this.getCacheUrl(source, id)
        } catch (error) {
            this.ctx.logger('imagecache').warn(`缓存图片失败 [${source}-${id}]: ${error instanceof Error ? error.message : String(error)}`)
            return null
        }
    }

    /**
     * 批量下载图片（并发控制）
     */
    public async downloadImagesParallel(
        images: Array<{ url: string; source: string; id: string | number }>,
        concurrency: number = 3
    ): Promise<Map<string, string>> {
        const results = new Map<string, string>()
        const queue = [...images]
        const activePromises: Promise<void>[] = []

        const processNext = async () => {
            while (queue.length > 0) {
                const item = queue.shift()
                if (!item) break

                const key = `${item.source}-${item.id}`
                try {
                    const url = await this.downloadImage(item.url, item.source, item.id)
                    if (url) {
                        results.set(key, url)
                    }
                } catch (error) {
                    // 单个下载失败不影响其他下载
                    this.ctx.logger('imagecache').debug(`并发下载异常 [${key}]: ${error instanceof Error ? error.message : String(error)}`)
                }
            }
        }

        for (let i = 0; i < concurrency; i++) {
            activePromises.push(processNext())
        }

        await Promise.all(activePromises)
        return results
    }

    /**
     * 清理过期缓存（可选）
     * @param maxAgeMs 最大存活时间（毫秒）
     */
    public async cleanupOldCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
        try {
            const files = await fs.readdir(this.cacheDir)
            let cleaned = 0
            const now = Date.now()

            for (const file of files) {
                const filePath = path.join(this.cacheDir, file)
                const stat = await fs.stat(filePath)
                const age = now - stat.mtimeMs

                if (age > maxAgeMs) {
                    await fs.unlink(filePath)
                    cleaned++
                    this.ctx.logger('imagecache').debug(`清理过期缓存: ${file}`)
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
