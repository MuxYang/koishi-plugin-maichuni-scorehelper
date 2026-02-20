import { Context } from 'koishi'
import { AliasManager } from '../services/alias-manager'

export function registerSharedAliasCommands(
    ctx: Context,
    commandPrefix: 'mai' | 'chu',
    gameType: 'maimai' | 'chunithm'
) {
    ctx.command(`${commandPrefix}.alias`, '别名管理')
        .usage(`使用 ${commandPrefix}.alias.add/delete/list 管理别名`)

    ctx.command(`${commandPrefix}.alias.add <songId:number> <alias:string>`, '添加本地别名')
        .action(async ({ session }, songId, alias) => {
            if (!songId || !alias) {
                return `请提供曲目 ID 和别名\n例: ${commandPrefix}.alias.add 834 "测试"`
            }

            const success = await ctx.aliasManager?.addAlias(gameType, songId, alias)
            if (success) {
                return `已添加别名: ${alias} → ${songId}`
            } else {
                return `添加失败，该别名可能已存在`
            }
        })

    ctx.command(`${commandPrefix}.alias.delete <alias:string>`, '删除本地别名')
        .action(async ({ session }, alias) => {
            if (!alias) {
                return '请提供要删除的别名'
            }

            const success = await ctx.aliasManager?.deleteAlias(gameType, alias)
            if (success) {
                return `已删除别名: ${alias}`
            } else {
                return `删除失败，该别名不存在或不是本地别名`
            }
        })

    ctx.command(`${commandPrefix}.alias.list [songId:number]`, '查看别名列表')
        .action(async ({ session }, songId) => {
            if (!songId) {
                return `请提供曲目 ID\n例: ${commandPrefix}.alias.list 834`
            }

            const aliases = await ctx.aliasManager?.getAliases(gameType, songId)
            if (!aliases) {
                return '查询失败'
            }

            const lines: string[] = [`曲目 ${songId} 的别名:`]
            if (aliases.local.length > 0) {
                lines.push(`本地: ${aliases.local.join(', ')}`)
            }
            if (aliases.lxns.length > 0) {
                lines.push(`lxns: ${aliases.lxns.join(', ')}`)
            }
            if (aliases.local.length === 0 && aliases.lxns.length === 0) {
                lines.push('暂无别名')
            }

            return lines.join('\n')
        })
}
