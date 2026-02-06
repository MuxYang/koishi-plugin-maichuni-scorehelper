# Fish Login Page

DivingFish 加密登录令牌生成页面。

## 部署

### 阿里云 ESA (推荐)
1. 将代码上传到 GitHub
2. ESA 控制台创建站点，选择 **静态网站**
3. 配置：
   - 输出目录: `public`
   - 边缘函数: `/api/generate-token` → `edge-functions/index.js`
4. **修改 Token**: 编辑 `edge-functions/index.js` 文件顶部的 `AUTH_TOKEN` 变量。

### Cloudflare Pages
```bash
npm install
npx wrangler pages deploy public
```

## 使用
1. 输入水鱼账密 → 生成令牌
2. 复制令牌 → 在 Bot 中使用 `fish.login <令牌>`
