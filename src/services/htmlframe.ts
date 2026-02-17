import { Context, Service, Logger, h } from 'koishi'
import fs from 'fs/promises'
import path from 'path'

export const name = 'htmlframe'

export interface ScoreItem {
    id?: number // song id
    title: string
    level: string  // decimal level like "14.5"
    levelIndex: number // 0-4 for background color
    rating: number
    score: number  // maimai: achievement %, chunithm: raw score
    rank: number
    image: string  // primary cover image URL (水鱼)
    fallbackImage?: string // fallback cover image URL (LXNS)
    type: 'DX' | 'STD'
    rate: string // 'sssp', 'sss', 'ssp', etc. (lowercase from API)
    fc: string   // '', 'FC', 'FC+', 'AP', 'AP+', 'AJ' etc.
}

export interface B50Data {
    playerName: string
    playerRating: number
    avatarUrl?: string
    qq?: string  // QQ号，用于获取QQ头像
    b35?: ScoreItem[]
    b15?: ScoreItem[]
    b30?: ScoreItem[]
    n20?: ScoreItem[]
}

declare module 'koishi' {
    interface Context {
        htmlframe: HtmlFrame
    }
}


const SCORE_TEMPLATE = `
<div class="grid rows-[1.75rem_1fr] rd-2xl of-hidden min-w-220px hover:scale-102 transition-transform-200 transition-ease will-change-transform" style="background:#f0f0f5;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
    <div class="text-ellipsis of-hidden ws-nowrap flex items-center" style="background:var(--level-{levelIndex})">
        <div class="text-ellipsis of-hidden ws-nowrap grow-1 w-0 font-500 c-#ffffffde">
            <span class="ml-3">{title}</span>
        </div>
    </div>
    <div class="flex items-center h-20">
        <img src="{image}" alt="Jacket" class="h-20 w-20 shrink-0" style="object-fit:cover;background:#f5f5f5">
        <div class="flex grow-1 flex-col px-2 lh-1.4em">
            <div class="flex font-600 items-center">
                <div class="text-1.2em flex items-baseline grow-1" style="color:#1a1a2e">
                    {scoreDisplay}
                </div>
                <div class="{typeClass} text-.9em">{typeText}</div>
            </div>
            <div class="flex font-600 items-center">
                <div class="grow-1">
                    {rateHtml}
                </div>
                {fcHtml}
            </div>
            <div class="flex items-end">
                <div class="text-.9em grow-1" style="color:#555">{level}<span style="margin:0px 0.3em">→</span><span style="font-weight:700;color:#1a1a2e">{rating}</span></div>
                <div class="text-sm" style="color:#888">#{rank}</div>
            </div>
        </div>
    </div>
</div>
`

/**
 * Rate display mapping with colors
 * API returns lowercase: 'd','c','b','bb','bbb','a','aa','aaa','s','sp','ss','ssp','sss','sssp'
 */
const RATE_DISPLAY_MAP: Record<string, { label: string; color: string }> = {
    'sssp': { label: 'SSS+', color: '#b8860b' },  // Dark gold (rainbow handled separately)
    'sss': { label: 'SSS', color: '#b8860b' },   // Dark gold
    'ssp': { label: 'SS+', color: '#c49000' },   // Gold
    'ss': { label: 'SS', color: '#a07800' },    // Deep gold
    'sp': { label: 'S+', color: '#1976d2' },    // Blue
    's': { label: 'S', color: '#1565c0' },     // Deep blue
    'aaa': { label: 'AAA', color: '#c62828' },    // Deep red
    'aa': { label: 'AA', color: '#d84315' },    // Deep orange
    'a': { label: 'A', color: '#7b1fa2' },     // Deep purple
    'bbb': { label: 'BBB', color: '#546e7a' },   // Blue-gray
    'bb': { label: 'BB', color: '#546e7a' },
    'b': { label: 'B', color: '#546e7a' },
    'c': { label: 'C', color: '#78909c' },
    'd': { label: 'D', color: '#78909c' },
}

/**
 * SSS+ / SSS rainbow color for individual characters
 */
const SSS_CHAR_COLORS = ['#b8860b', '#1565c0', '#ad1457', '#c49000']

export class HtmlFrame extends Service {
    static inject = ['imagecache']

    private templates: Record<string, string> = {}
    private readonly templatePaths = {
        maimai: path.join(__dirname, '../../web_pic/maimai_b50_template.html'),
        chunithm: path.join(__dirname, '../../web_pic/chunithm_b50_template.html')
    }

    private debugEnabled = false

    constructor(ctx: Context, config?: { debug?: boolean }) {
        super(ctx, 'htmlframe')
        this.debugEnabled = config?.debug ?? false
    }

    protected async start() {
        for (const [key, p] of Object.entries(this.templatePaths)) {
            try {
                this.templates[key] = await fs.readFile(p, 'utf-8')
                if (this.debugEnabled) {
                    this.ctx.logger('htmlframe').info(`[debug] ${key} B50 template loaded successfully.`)
                }
            } catch (e) {
                this.ctx.logger('htmlframe').error(`Failed to load ${key} B50 template from ${p}:`, e)
            }
        }
    }

    /**
     * 生成舞萌 B50 HTML
     */
    public async generateMaimaiHtml(data: B50Data): Promise<string> {
        if (!this.templates['maimai']) {
            await this.start()
            if (!this.templates['maimai']) throw new Error('Maimai template not loaded')
        }

        let html = this.templates['maimai']
        const cache = this.ctx.imagecache

        // 批量下载舞萌曲绘和头像（在处理前完成所有下载）
        if (cache && data.b35 && data.b15) {
            const imagesToDownload: Array<{ urls: string | string[]; source: string; id: string | number }> = []

            const allItems = [...data.b35, ...data.b15]
            for (const item of allItems) {
                if (!item.id || !item.image) continue
                const urls = [item.image, item.fallbackImage].filter(Boolean) as string[]
                imagesToDownload.push({
                    urls,
                    source: 'maimai',
                    id: item.id
                })
            }

            // 添加头像下载
            if (data.qq) {
                const qqAvatarRemote = `http://q.qlogo.cn/headimg_dl?dst_uin=${data.qq}&spec=640&img_type=jpg`
                imagesToDownload.push({
                    urls: qqAvatarRemote,
                    source: 'qq',
                    id: data.qq
                })
            } else if (data.avatarUrl && data.avatarUrl.includes('lxns')) {
                const lxnsMatch = data.avatarUrl.match(/icon\/(\d+)\.png/)
                if (lxnsMatch) {
                    imagesToDownload.push({
                        urls: data.avatarUrl,
                        source: 'lxns-icon',
                        id: lxnsMatch[1]
                    })
                }
            }

            if (imagesToDownload.length > 0) {
                await cache.downloadImagesParallel(imagesToDownload, 5)
            }
        }

        // 处理头像（此时已缓存）
        let avatarUrl = await this.processAvatarUrl(data, cache)

        // 替换占位符
        html = html.replace('{playerName}', data.playerName)
            .replace('{playerRating}', data.playerRating.toString())
            .replace(/{avatarUrl}/g, avatarUrl)

        // 生成 B35 和 B15 列表
        if (data.b35 && data.b15) {
            const b35Html = (await Promise.all(data.b35.map(item => this.renderMaimaiScoreItem(item)))).join('')
            html = html.replace('<!--B35_SLOT-->', b35Html)

            const b15Html = (await Promise.all(data.b15.map(item => this.renderMaimaiScoreItem(item)))).join('')
            html = html.replace('<!--B15_SLOT-->', b15Html)
        }

        return html
    }

    /**
     * 生成中二节奏 B50 HTML
     */
    public async generateChunithmHtml(data: B50Data): Promise<string> {
        if (!this.templates['chunithm']) {
            await this.start()
            if (!this.templates['chunithm']) throw new Error('Chunithm template not loaded')
        }

        let html = this.templates['chunithm']
        const cache = this.ctx.imagecache

        // 批量下载中二节奏曲绘和头像（在处理前完成所有下载）
        if (cache && data.b30 && data.n20) {
            const imagesToDownload: Array<{ urls: string | string[]; source: string; id: string | number }> = []

            const allItems = [...data.b30, ...data.n20]
            for (const item of allItems) {
                if (!item.id || !item.image) continue
                const urls = [item.image, item.fallbackImage].filter(Boolean) as string[]
                imagesToDownload.push({
                    urls,
                    source: 'chunithm',
                    id: item.id
                })
            }

            // 添加头像下载
            if (data.qq) {
                const qqAvatarRemote = `http://q.qlogo.cn/headimg_dl?dst_uin=${data.qq}&spec=640&img_type=jpg`
                imagesToDownload.push({
                    urls: qqAvatarRemote,
                    source: 'qq',
                    id: data.qq
                })
            } else if (data.avatarUrl && data.avatarUrl.includes('lxns')) {
                const lxnsMatch = data.avatarUrl.match(/icon\/(\d+)\.png/)
                if (lxnsMatch) {
                    imagesToDownload.push({
                        urls: data.avatarUrl,
                        source: 'lxns-icon',
                        id: lxnsMatch[1]
                    })
                }
            }

            if (imagesToDownload.length > 0) {
                await cache.downloadImagesParallel(imagesToDownload, 5)
            }
        }

        // 处理头像（此时已缓存）
        let avatarUrl = await this.processAvatarUrl(data, cache)

        // 替换占位符
        html = html.replace('{playerName}', data.playerName)
            .replace('{playerRating}', data.playerRating.toString())
            .replace(/{avatarUrl}/g, avatarUrl)

        // 生成 B30 和 N20 列表
        if (data.b30 && data.n20) {
            const b30Html = (await Promise.all(data.b30.map(item => this.renderChunithmScoreItem(item)))).join('')
            html = html.replace('<!--B30_SLOT-->', b30Html)

            const n20Html = (await Promise.all(data.n20.map(item => this.renderChunithmScoreItem(item)))).join('')
            html = html.replace('<!--N20_SLOT-->', n20Html)
        }

        return html
    }

    /**
     * 兼容旧接口
     */
    public async generateHtml(data: B50Data, type: 'maimai' | 'chunithm' = 'maimai'): Promise<string> {
        if (type === 'maimai') {
            return this.generateMaimaiHtml(data)
        } else {
            return this.generateChunithmHtml(data)
        }
    }

    /**
     * 处理头像 URL（通用逻辑）
     * 仅使用本地缓存，不使用网络 URL
     */
    private async processAvatarUrl(data: B50Data, cache: any): Promise<string> {
        if (data.qq && cache) {
            try {
                if (await cache.exists('qq', data.qq)) {
                    const cachePath = cache.getCachePath('qq', data.qq)
                    const buffer = await fs.readFile(cachePath)
                    return `data:image/jpeg;base64,${buffer.toString('base64')}`
                }
            } catch (e) {
                this.ctx.logger('htmlframe').warn(`QQ 头像缓存读取失败: ${e}`)
            }
        }

        if (data.avatarUrl && cache && data.avatarUrl.includes('lxns')) {
            const lxnsMatch = data.avatarUrl.match(/icon\/(\d+)\.png/)
            if (lxnsMatch) {
                try {
                    if (await cache.exists('lxns-icon', lxnsMatch[1])) {
                        const cachePath = cache.getCachePath('lxns-icon', lxnsMatch[1])
                        const buffer = await fs.readFile(cachePath)
                        return `data:image/png;base64,${buffer.toString('base64')}`
                    }
                } catch (e) {
                    this.ctx.logger('htmlframe').warn(`LXNS 头像缓存读取失败: ${e}`)
                }
            }
        }

        // 都无可用头像，返回空字符串而不是网络 URL
        return ''
    }

    /**
     * 渲染舞萌单条成绩项
     */
    private async renderMaimaiScoreItem(item: ScoreItem): Promise<string> {
        const typeClass = item.type === 'DX' ? 'c-#F16449' : 'c-#6EA7E1'
        const cache = this.ctx.imagecache

        // 处理图片：优先使用本地缓存的 base64 数据
        let displayUrl = ''
        if (cache && item.id) {
            if (await cache.exists('maimai', item.id)) {
                try {
                    const cachePath = cache.getCachePath('maimai', item.id)
                    const buffer = await fs.readFile(cachePath)
                    displayUrl = `data:image/png;base64,${buffer.toString('base64')}`
                } catch (e) {
                    this.ctx.logger('htmlframe').warn(`舞萌曲绘 ${item.id} 读取失败，使用占位图`)
                }
            }
        }

        // 如果没有本地缓存，使用灰色占位图而不是网络 URL
        if (!displayUrl) {
            displayUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgZmlsbD0iI2VlZSIvPjwvc3ZnPg=='
        }

        // 舞萌成绩显示（百分比）
        const scoreStr = item.score.toFixed(4)
        const [scoreInt, scoreDec] = scoreStr.split('.')
        const scoreDisplay = `<span style="color:#c62828">${scoreInt}</span>.<span class="text-.875em" style="color:#e65100">${scoreDec}</span><span class="text-.7em" style="color:#6b7280">%</span>`

        // 评价率颜色显示
        const rateKey = item.rate.toLowerCase()
        const rateInfo = RATE_DISPLAY_MAP[rateKey] || { label: item.rate.toUpperCase(), color: '#888' }

        let rateHtml: string
        if (rateKey === 'sssp' || rateKey === 'sss') {
            rateHtml = rateInfo.label.split('').map((char, i) =>
                `<span style="color:${SSS_CHAR_COLORS[i % SSS_CHAR_COLORS.length]};font-weight:700">${char}</span>`
            ).join('')
        } else {
            rateHtml = `<span style="color:${rateInfo.color};font-weight:700">${rateInfo.label}</span>`
        }

        // FC 显示
        let fcHtml = ''
        if (item.fc) {
            const isAP = item.fc.includes('AP')
            const fcColor = isAP ? '#1b8a4a' : '#2e7d32'
            fcHtml = `<span style="color:${fcColor};font-weight:600">${item.fc}</span>`
        } else {
            fcHtml = '<span></span>'
        }

        const levelIndex = item.levelIndex !== undefined ? item.levelIndex : 2

        return SCORE_TEMPLATE
            .replace('{title}', item.title)
            .replace('{image}', displayUrl)
            .replace('{level}', item.level)
            .replace('{levelIndex}', levelIndex.toString())
            .replace('{rating}', item.rating.toString())
            .replace('{rank}', item.rank.toString())
            .replace('{scoreDisplay}', scoreDisplay)
            .replace('{typeClass}', typeClass)
            .replace('{typeText}', item.type)
            .replace('{rateHtml}', rateHtml)
            .replace('{fcHtml}', fcHtml)
    }

    /**
     * 渲染中二节奏单条成绩项
     */
    private async renderChunithmScoreItem(item: ScoreItem): Promise<string> {
        const typeClass = 'c-#6EA7E1'  // Chunithm is always STD type
        const cache = this.ctx.imagecache

        // 处理图片：优先使用本地缓存的 base64 数据
        let displayUrl = ''
        if (cache && item.id) {
            if (await cache.exists('chunithm', item.id)) {
                try {
                    const cachePath = cache.getCachePath('chunithm', item.id)
                    const buffer = await fs.readFile(cachePath)
                    displayUrl = `data:image/png;base64,${buffer.toString('base64')}`
                } catch (e) {
                    this.ctx.logger('htmlframe').warn(`中二节奏曲绘 ${item.id} 读取失败，使用占位图`)
                }
            }
        }

        // 如果没有本地缓存，使用灰色占位图而不是网络 URL
        if (!displayUrl) {
            displayUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgZmlsbD0iI2VlZSIvPjwvc3ZnPg=='
        }

        // 中二节奏成绩显示（原始分数）
        const formatted = item.score.toLocaleString('en-US')
        const scoreDisplay = `<span style="color:#c62828">${formatted}</span>`

        // 评价率颜色显示
        const rateKey = item.rate.toLowerCase()
        const rateInfo = RATE_DISPLAY_MAP[rateKey] || { label: item.rate.toUpperCase(), color: '#888' }

        let rateHtml: string
        if (rateKey === 'sssp' || rateKey === 'sss') {
            rateHtml = rateInfo.label.split('').map((char, i) =>
                `<span style="color:${SSS_CHAR_COLORS[i % SSS_CHAR_COLORS.length]};font-weight:700">${char}</span>`
            ).join('')
        } else {
            rateHtml = `<span style="color:${rateInfo.color};font-weight:700">${rateInfo.label}</span>`
        }

        // FC 显示（AJ/FC）
        let fcHtml = ''
        if (item.fc) {
            const isAJ = item.fc.includes('AJ')
            const fcColor = isAJ ? '#1b8a4a' : '#2e7d32'
            fcHtml = `<span style="color:${fcColor};font-weight:600">${item.fc}</span>`
        } else {
            fcHtml = '<span></span>'
        }

        const levelIndex = item.levelIndex !== undefined ? item.levelIndex : 3

        return SCORE_TEMPLATE
            .replace('{title}', item.title)
            .replace('{image}', displayUrl)
            .replace('{level}', item.level)
            .replace('{levelIndex}', levelIndex.toString())
            .replace('{rating}', item.rating.toString())
            .replace('{rank}', item.rank.toString())
            .replace('{scoreDisplay}', scoreDisplay)
            .replace('{typeClass}', typeClass)
            .replace('{typeText}', item.type)
            .replace('{rateHtml}', rateHtml)
            .replace('{fcHtml}', fcHtml)
    }
}

export default HtmlFrame
