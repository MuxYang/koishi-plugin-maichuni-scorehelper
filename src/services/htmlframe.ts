import { Context, Service, Logger } from 'koishi'
import fs from 'fs/promises'
import path from 'path'

export const name = 'htmlframe'

export interface ScoreItem {
  id?: number // song id
  title: string
  level: string
  levelIndex: number // 0-4 for background color? 
  rating: number
  score: number
  rank: number
  image: string
  type: 'DX' | 'STD'
  rate: string // 'SSS+', 'SSS', etc.
  fc: '' | 'FC' | 'FC+' | 'AP' | 'AP+' | 'AJ'
}

export interface B50Data {
  playerName: string
  playerRating: number
  avatarUrl?: string
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
<div class="grid rows-[1.75rem_1fr] rd-2xl of-hidden min-w-220px hover:scale-102 transition-transform-200 transition-ease will-change-transform x_-c_x">
    <div class="text-ellipsis of-hidden ws-nowrap flex items-center" style="background:var(--level-{levelIndex})">
        <div class="text-ellipsis of-hidden ws-nowrap grow-1 w-0 font-500 c-#ffffffde">
            <span class="ml-3">{title}</span>
        </div>
    </div>
    <div class="flex items-center h-20">
        <img src="{image}" alt="Jacket" class="h-20 shrink-0">
        <div class="flex grow-1 flex-col px-2 lh-1.4em">
            <div class="flex font-600 items-center">
                <div class="x_qc_x x_rc_x x_sc_x text-1.2em flex items-baseline grow-1">
                    <div class="false">{scoreInt}</div>.<span class="text-.875em">{scoreDec}</span><span class="text-.7em x_uc_x">%</span>
                </div>
                <div class="{typeClass} text-.9em">{typeText}</div>
            </div>
            <div class="flex font-600 items-center">
                <div class="x_vc_x {rateClass} grow-1">
                    {rateHtml}
                </div>
                {fcHtml}
            </div>
            <div class="flex items-end">
                <div class="text-.9em grow-1">{level}<span style="margin:0px 0.3em">→</span><span style="font-weight:700">{rating}</span></div>
                <div class="text-sm">#{rank}</div>
            </div>
        </div>
    </div>
</div>
`

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
  }

  public async generateHtml(data: B50Data, type: 'maimai' | 'chunithm' = 'maimai'): Promise<string> {
    if (!this.templates[type]) {
      await this.start() // Try loading again
      if (!this.templates[type]) throw new Error(`Template ${type} not loaded`)
    }

    let html = this.templates[type]

    // Replace Player Name and Rating and Avatar
    html = html.replace('{playerName}', data.playerName)
               .replace('{playerRating}', data.playerRating.toString())
               .replace(/{avatarUrl}/g, data.avatarUrl || 'https://shama.koishi.chat/avatar.png')

    if (type === 'maimai' && data.b35 && data.b15) {
        // Generate B35 List
        const b35Html = data.b35.map(item => this.renderScoreItem(item)).join('')
        html = html.replace('<!--B35_SLOT-->', b35Html)

        // Generate B15 List
        const b15Html = data.b15.map(item => this.renderScoreItem(item)).join('')
        html = html.replace('<!--B15_SLOT-->', b15Html)
    } else if (type === 'chunithm' && data.b30 && data.n20) {
        // Generate B30 List
        const b30Html = data.b30.map(item => this.renderScoreItem(item)).join('')
        html = html.replace('<!--B30_SLOT-->', b30Html)

        // Generate N20 List
        const n20Html = data.n20.map(item => this.renderScoreItem(item)).join('')
        html = html.replace('<!--N20_SLOT-->', n20Html)
    }

    return html
  }

  private renderScoreItem(item: ScoreItem): string {
    const scoreStr = item.score.toFixed(4)
    const [scoreInt, scoreDec] = scoreStr.split('.')

    const typeClass = item.type === 'DX' ? 'c-#F16449' : 'c-#6EA7E1'
    
    // Rate Class Mapping
    let rateClass = ''
    switch (item.rate) {
        case 'SSS+': rateClass = 'x_wc_x'; break;
        case 'SSS': rateClass = 'x_xc_x'; break;
        case 'SS+': rateClass = 'x_yc_x'; break;
        case 'SS': rateClass = 'x_zc_x'; break;
        case 'S+': rateClass = 'x_Ac_x'; break;
        case 'S': rateClass = 'x_Bc_x'; break;
        case 'AAA': rateClass = 'x_Cc_x'; break;
        case 'AA': rateClass = 'x_Dc_x'; break;
        default: rateClass = ''; // Fallback
    }

    // Rate HTML generator (splitting characters for styling)
    const rateHtml = item.rate.split('').map(char => `<span>${char}</span>`).join('')

    // FC HTML
    let fcHtml = ''
    if (item.fc) {
        const fcClass = (item.fc.includes('AP') || item.fc.includes('AJ')) ? 'x_hc_x' : 'x_ic_x' // Simplified logic
        fcHtml = `<span class="${fcClass}">${item.fc}</span>`
    } else {
        fcHtml = '<span></span>'
    }

    // Level index (0-4) default 2
    const levelIndex = item.levelIndex !== undefined ? item.levelIndex : 2

    return SCORE_TEMPLATE
        .replace('{title}', item.title)
        .replace('{image}', item.image)
        .replace('{level}', item.level)
        .replace('{levelIndex}', levelIndex.toString())
        .replace('{rating}', item.rating.toString())
        .replace('{rank}', item.rank.toString())
        .replace('{scoreInt}', scoreInt)
        .replace('{scoreDec}', scoreDec)
        .replace('{typeClass}', typeClass)
        .replace('{typeText}', item.type)
        .replace('{rateClass}', rateClass)
        .replace('{rateHtml}', rateHtml)
        .replace('{fcHtml}', fcHtml)
  }
}

export default HtmlFrame
