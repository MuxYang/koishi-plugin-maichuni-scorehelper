import { Context, Service, Logger, h } from 'koishi'
import fs from 'fs/promises'
import path from 'path'

export const name = 'htmlframe'

declare module 'koishi' {
  interface Context {
    imagecache: any
  }
}

export interface ScoreItem {
    id?: number // song id
    title: string
    level: string  // decimal level like "14.5"
    levelIndex: number // 0-4 for background color
    rating: number
    score: number  // maimai: achievement %, chunithm: raw score
    rank: number
    image: string  // cover image URL
    type: 'DX' | 'STD'
    rate: string // 'sssp', 'sss', 'ssp', etc. (lowercase from API)
    fc: '' | 'FC' | 'FC+' | 'AP' | 'AP+' | 'AJ'
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
        <img src="{image}" alt="Jacket" class="h-20 w-20 shrink-0" style="object-fit:cover;background:#f5f5f5" onerror="if(this.src.includes('www.diving-fish.com')){const lxnsUrl=this.getAttribute('data-lxns-url');if(lxnsUrl)this.src=lxnsUrl;else this.style.background='#ddd';}else{this.style.background='#ddd';}" data-lxns-url="{lxnsUrl}">
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
    'sss':  { label: 'SSS',  color: '#b8860b' },   // Dark gold
    'ssp':  { label: 'SS+',  color: '#c49000' },   // Gold
    'ss':   { label: 'SS',   color: '#a07800' },    // Deep gold
    'sp':   { label: 'S+',   color: '#1976d2' },    // Blue
    's':    { label: 'S',    color: '#1565c0' },     // Deep blue
    'aaa':  { label: 'AAA',  color: '#c62828' },    // Deep red
    'aa':   { label: 'AA',   color: '#d84315' },    // Deep orange
    'a':    { label: 'A',    color: '#7b1fa2' },     // Deep purple
    'bbb':  { label: 'BBB',  color: '#546e7a' },   // Blue-gray
    'bb':   { label: 'BB',   color: '#546e7a' },
    'b':    { label: 'B',    color: '#546e7a' },
    'c':    { label: 'C',    color: '#78909c' },
    'd':    { label: 'D',    color: '#78909c' },
}

/**
 * SSS+ / SSS rainbow color for individual characters
 */
const SSS_CHAR_COLORS = ['#b8860b', '#1565c0', '#ad1457', '#c49000']

export class HtmlFrame extends Service {
    private templates: Record<string, string> = {}
    private readonly templatePaths = {
        maimai: path.join(__dirname, '../../web_pic/maimai_b50_template.html'),
        chunithm: path.join(__dirname, '../../web_pic/chunithm_b50_template.html')
    }

    constructor(ctx: Context) {
        super(ctx, 'htmlframe')
    }

    protected async start() {
        for (const [key, p] of Object.entries(this.templatePaths)) {
            try {
                this.templates[key] = await fs.readFile(p, 'utf-8')
                this.logger.info(`${key} B50 template loaded successfully.`)
            } catch (e) {
                this.logger.error(`Failed to load ${key} B50 template from ${p}:`, e)
            }
        }

        // 注册测试指令
        this.ctx.command('maib50test', '测试生成 MaiMai B50 成绩单图片')
            .action(async () => {
                const mockData = {
                    playerName: 'MuxYang',
                    playerRating: 15432,
                    avatarUrl: 'https://shama.koishi.chat/avatar.png',
                    b35: Array(35).fill(null).map((_, i) => ({
                        title: `Testing Song B35-${i + 1}`,
                        level: '14.5',
                        levelIndex: 3,
                        rating: 280,
                        score: 100.5,
                        rank: i + 1,
                        image: 'https://shama.koishi.chat/avatar.png',
                        type: 'DX' as const,
                        rate: 'SSS+',
                        fc: 'FC+' as const
                    })),
                    b15: Array(15).fill(null).map((_, i) => ({
                        title: `New Song B15-${i + 1}`,
                        level: '13.2',
                        levelIndex: 1,
                        rating: 250,
                        score: 100.1,
                        rank: i + 1,
                        image: 'https://shama.koishi.chat/avatar.png',
                        type: 'STD' as const,
                        rate: 'SSS',
                        fc: 'AP' as const
                    }))
                }

                try {
                    const html = await this.generateHtml(mockData, 'maimai')
                    const page = await this.ctx.puppeteer.page()
                    await page.setViewport({ width: 1600, height: 1000 })
                    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })
                    const buffer = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true })
                    await page.close()
                    return h.image(buffer, 'image/jpeg')
                } catch (e) {
                    this.logger.error(e)
                    return '生成图片失败：' + (e instanceof Error ? e.message : String(e))
                }
            })

        this.ctx.command('chub50test', '测试生成 Chunithm B50 成绩单图片')
            .action(async () => {
                const mockData = {
                    playerName: 'MuxYang',
                    playerRating: 16120,
                    avatarUrl: 'https://shama.koishi.chat/avatar.png',
                    b30: Array(30).fill(null).map((_, i) => ({
                        title: `Chuni Song B30-${i + 1}`,
                        level: '14.9',
                        levelIndex: 2,
                        rating: 285,
                        score: 1008000,
                        rank: i + 1,
                        image: 'https://shama.koishi.chat/avatar.png',
                        type: 'STD' as const,
                        rate: 'SSS',
                        fc: 'AJ' as const
                    })),
                    n20: Array(20).fill(null).map((_, i) => ({
                        title: `Chuni New N20-${i + 1}`,
                        level: '13.8',
                        levelIndex: 0,
                        rating: 270,
                        score: 100.1,
                        rank: i + 1,
                        image: 'https://shama.koishi.chat/avatar.png',
                        type: 'DX' as const,
                        rate: 'SSS+',
                        fc: 'FC' as const
                    }))
                }

                try {
                    const html = await this.generateHtml(mockData, 'chunithm')
                    const page = await this.ctx.puppeteer.page()
                    await page.setViewport({ width: 1600, height: 1000 })
                    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 })
                    const buffer = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true })
                    await page.close()
                    return h.image(buffer, 'image/jpeg')
                } catch (e) {
                    this.logger.error(e)
                    return '生成图片失败：' + (e instanceof Error ? e.message : String(e))
                }
            })
    }

    public async generateHtml(data: B50Data, type: 'maimai' | 'chunithm' = 'maimai'): Promise<string> {
        if (!this.templates[type]) {
            await this.start() // Try loading again
            if (!this.templates[type]) throw new Error(`Template ${type} not loaded`)
        }

        let html = this.templates[type]
        const cache = this.ctx.imagecache

        // 处理头像 URL（支持缓存）
        let avatarUrl: string
        if (data.qq) {
            // 尝试缓存 QQ 头像
            const qqAvatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${data.qq}&s=640`
            if (cache) {
                const cached = await cache.downloadImage(qqAvatarUrl, 'qq', data.qq, 5000)
                avatarUrl = cached || qqAvatarUrl
            } else {
                avatarUrl = qqAvatarUrl
            }
        } else if (data.avatarUrl) {
            // LXNS 头像缓存
            if (cache && data.avatarUrl.includes('lxns')) {
                const lxnsMatch = data.avatarUrl.match(/icon\/(\d+)\.png/)
                if (lxnsMatch) {
                    const cached = await cache.downloadImage(data.avatarUrl, 'lxns-icon', lxnsMatch[1], 5000)
                    avatarUrl = cached || data.avatarUrl
                } else {
                    avatarUrl = data.avatarUrl
                }
            } else {
                avatarUrl = data.avatarUrl
            }
        } else {
            avatarUrl = 'https://q1.qlogo.cn/g?b=qq&nk=0&s=640'
        }

        // 批量预先下载曲绘，确保渲染时图片已就位
        if (cache) {
            const imagesToDownload: Array<{url: string; source: string; id: number}> = []
            
            if (type === 'maimai' && data.b35 && data.b15) {
                data.b35.forEach(item => {
                    if (item.id && item.image) {
                        imagesToDownload.push({url: item.image, source: 'maimai', id: item.id})
                    }
                })
                data.b15.forEach(item => {
                    if (item.id && item.image) {
                        imagesToDownload.push({url: item.image, source: 'maimai', id: item.id})
                    }
                })
            } else if (type === 'chunithm' && data.b30 && data.n20) {
                data.b30.forEach(item => {
                    if (item.id && item.image) {
                        imagesToDownload.push({url: item.image, source: 'chunithm', id: item.id})
                    }
                })
                data.n20.forEach(item => {
                    if (item.id && item.image) {
                        imagesToDownload.push({url: item.image, source: 'chunithm', id: item.id})
                    }
                })
            }
            
            // 并发下载，5秒超时
            if (imagesToDownload.length > 0) {
                await cache.downloadImagesParallel(imagesToDownload, 3).catch(() => {
                    // 下载失败不影响渲染
                })
            }
        }

        // Replace Player Name and Rating and Avatar
        html = html.replace('{playerName}', data.playerName)
            .replace('{playerRating}', data.playerRating.toString())
            .replace(/{avatarUrl}/g, avatarUrl)

        if (type === 'maimai' && data.b35 && data.b15) {
            // Generate B35 List
            const b35Html = data.b35.map(item => this.renderScoreItem(item, 'maimai')).join('')
            html = html.replace('<!--B35_SLOT-->', b35Html)

            // Generate B15 List
            const b15Html = data.b15.map(item => this.renderScoreItem(item, 'maimai')).join('')
            html = html.replace('<!--B15_SLOT-->', b15Html)
        } else if (type === 'chunithm' && data.b30 && data.n20) {
            // Generate B30 List
            const b30Html = data.b30.map(item => this.renderScoreItem(item, 'chunithm')).join('')
            html = html.replace('<!--B30_SLOT-->', b30Html)

            // Generate N20 List
            const n20Html = data.n20.map(item => this.renderScoreItem(item, 'chunithm')).join('')
            html = html.replace('<!--N20_SLOT-->', n20Html)
        }

        return html
    }

    private renderScoreItem(item: ScoreItem, gameType: 'maimai' | 'chunithm'): string {
        const typeClass = item.type === 'DX' ? 'c-#F16449' : 'c-#6EA7E1'
        const cache = this.ctx.imagecache

        // 必须先下载/检查本地缓存，再用本地URL渲染
        let displayUrl = item.image
        if (cache && item.id) {
            const source = gameType === 'maimai' ? 'maimai' : 'chunithm'
            const cacheUrl = cache.getCacheUrl(source, item.id)
            
            // 同步使用缓存URL（imagecache会在后台确保文件存在）
            // 若文件不存在会返回null，然后用原URL作为fallback
            displayUrl = cacheUrl || item.image
        }

        // Score display: maimai uses achievement% (100.5000%), chunithm uses raw score (1009000)
        let scoreDisplay: string
        if (gameType === 'maimai') {
            const scoreStr = item.score.toFixed(4)
            const [scoreInt, scoreDec] = scoreStr.split('.')
            scoreDisplay = `<span style="color:#c62828">${scoreInt}</span>.<span class="text-.875em" style="color:#e65100">${scoreDec}</span><span class="text-.7em" style="color:#6b7280">%</span>`
        } else {
            // Chunithm: display as integer score with comma separators
            const formatted = item.score.toLocaleString('en-US')
            scoreDisplay = `<span style="color:#c62828">${formatted}</span>`
        }

        // Rate display with colors
        const rateKey = item.rate.toLowerCase()
        const rateInfo = RATE_DISPLAY_MAP[rateKey] || { label: item.rate.toUpperCase(), color: '#888' }

        let rateHtml: string
        if (rateKey === 'sssp' || rateKey === 'sss') {
            // SSS/SSS+ get rainbow-colored characters
            rateHtml = rateInfo.label.split('').map((char, i) =>
                `<span style="color:${SSS_CHAR_COLORS[i % SSS_CHAR_COLORS.length]};font-weight:700">${char}</span>`
            ).join('')
        } else {
            rateHtml = `<span style="color:${rateInfo.color};font-weight:700">${rateInfo.label}</span>`
        }

        // FC HTML
        let fcHtml = ''
        if (item.fc) {
            const isAP = item.fc.includes('AP') || item.fc.includes('AJ')
            const fcColor = isAP ? '#1b8a4a' : '#2e7d32'
            fcHtml = `<span style="color:${fcColor};font-weight:600">${item.fc}</span>`
        } else {
            fcHtml = '<span></span>'
        }

        // Level index (0-4) default 2
        const levelIndex = item.levelIndex !== undefined ? item.levelIndex : 2
        
        // Generate LXNS fallback URL based on game type (inferred from image URL)
        // For maimai: use LXNS jacket URL with song_id
        // For chunithm: use LXNS music URL with song_id
        let lxnsUrl = ''
        if (item.image && item.id) {
            if (item.image.includes('/maimai/')) {
                lxnsUrl = `https://assets2.lxns.net/maimai/jacket/${item.id}.png`
            } else if (item.image.includes('/chunithm/')) {
                lxnsUrl = `https://assets2.lxns.net/chunithm/music/${item.id}.png`
            }
        }

        return SCORE_TEMPLATE
            .replace('{title}', item.title)
            .replace('{image}', item.image)
            .replace('{lxnsUrl}', lxnsUrl)
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
