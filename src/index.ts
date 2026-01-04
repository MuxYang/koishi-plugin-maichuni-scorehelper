import { Context, Schema } from 'koishi';

export const name = 'maichuni-scorehelper';

export interface Config {}

export const Config: Schema<Config> = Schema.object({
  // 未来可在此添加配置项
});

export function apply(ctx: Context, config: Config) {
  // 未来插件功能实现入口
}
