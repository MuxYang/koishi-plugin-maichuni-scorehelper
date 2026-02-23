# Fish Login Page

用户通过此页面输入 DivingFish 账号密码，生成加密登录令牌供 Koishi Bot 使用。

## 工作原理

1. 用户输入水鱼账号和密码
2. 前端向 `/api/generate-token` 发送 POST 请求
3. 后端使用独立的 AUTH_TOKEN（32字节随机字符串）对用户名和密码进行 AES-256-GCM 加密
4. 返回加密后的令牌
5. 用户复制令牌后在 Bot 中执行 `fish.login <令牌>`

**重要说明**：本项目使用的是独立的 AUTH_TOKEN，而非 DivingFish 的登录凭证。AUTH_TOKEN 必须在部署时正确配置，并与 Koishi 插件配置的值完全一致。

## 快速选择

| 方案 | 特点 | 难度 | 推荐人群 |
|------|------|------|--------|
| GitHub Pages | 完全免费，无需配置 | 最简 | 初级用户 |
| Cloudflare Pages | 全球加速，自动HTTPS | 简 | 一般用户 |
| 阿里云 ESA | 国内最快，高度可定制 | 中 | 国内用户 |
| 腾讯 EdgeOne | 腾讯云生态，国内优化 | 中 | 腾讯云用户 |

---

## 部署指南

### GitHub Pages（最简单）

**特殊说明**：GitHub Pages 不支持环境变量，AUTH_TOKEN 需硬编码在代码中。

#### 1. Fork 仓库
进入本项目 GitHub 页面，点击 Fork

#### 2. 配置 AUTH_TOKEN（必须步骤）
编辑 `fish-login-page/edge-functions/index.js`，找到第 12 行，修改为硬编码的 32 字节字符串：

```javascript
// 修改前
const AUTH_TOKEN = process.env.AUTHTOKEN || ''

// 修改后（使用你生成的字符串）
const AUTH_TOKEN = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
```

生成随机字符串的方法：
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

#### 3. 启用 GitHub Pages
1. 进入仓库 Settings → Pages
2. Build and deployment → Source → 选择 GitHub Actions
3. 保存

#### 4. 部署工作流
项目已配置 GitHub Actions 工作流 `.github/workflows/deploy-github-pages.yml`，当推送到 main 分支时自动触发。

#### 5. 提交代码
将修改提交到 main 分支，GitHub Actions 自动部署到：`https://你的用户名.github.io/fish-login-page/`

#### 6. 测试
访问生成的 URL，输入任意用户名密码，验证令牌生成功能

---

### Cloudflare Pages

#### 1. 连接 GitHub
1. 登录 Cloudflare Dashboard
2. Pages → Create a project → Connect to Git
3. 授权并选择 fish-login-page 仓库

#### 2. 配置构建
- Framework preset: None
- Build command: 留空
- Build output directory: `public`
- Root directory: `fish-login-page`（如需要）

#### 3. 环境变量
在 Pages 项目 → Settings → Environment variables 中添加：
```
AUTHTOKEN = 你的32字节字符串
```

#### 4. 部署
点击 Deploy，稍等片刻后将生成部署 URL

#### 5. 自定义域名（可选）
Pages 项目 → Settings → Domains → Add custom domain

#### 6. 自动部署（可选）
需要配置 GitHub Secrets 实现自动部署：
```
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```
项目会自动使用工作流 `.github/workflows/deploy-cloudflare.yml` 部署

---

### 阿里云 ESA（国内最快）

#### 1. 创建 ESA 项目
1. 进入 [阿里云 ESA 控制台](https://esa.console.aliyun.com)
2. 项目管理 → 创建项目
3. 项目名：fish-login-page，项目类型：Serverless 应用

#### 2. 关联 GitHub
1. 选择"使用 GitHub 创建"
2. 授权阿里云访问 GitHub
3. 选择仓库和 main 分支

#### 3. 构建配置
- 输出目录: `public`
- 根目录: `fish-login-page`（如需要）

#### 4. 环境变量
在项目设置 → 环境变量中添加：
```
AUTHTOKEN = 你的32字节字符串
```

#### 5. 边缘函数
启用边缘函数，配置路由使用 `/edge-functions/index.js` 处理 `/api/generate-token` 请求。

#### 6. 部署
点击部署，获得测试 URL（通常 1-3 分钟）

**配置文件**：可编辑 `esa.json` 自定义路由、缓存等

---

### 腾讯 EdgeOne Pages

#### 1. 创建应用
1. 进入 [腾讯 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
2. Pages → 创建应用
3. 应用类型：静态网站

#### 2. 关联 GitHub
1. 选择"通过 GitHub 授权创建"
2. 授权腾讯云访问 GitHub
3. 选择仓库和 main 分支

#### 3. 构建设置
- 项目根目录: `fish-login-page`（如需要）
- 输出目录: `public`
- Node 版本: 20.x

#### 4. 环境变量
在项目配置 → 环境变量中添加：
```
AUTHTOKEN = 你的32字节字符串
```

#### 5. 部署
点击立即部署，等待完成（2-5 分钟）

**配置文件**：可编辑 `tcb.json` 和 `edgeone-config.json` 自定义配置

#### 6. 自动部署（可选）
需要配置 GitHub Secrets 实现自动部署：
```
TENCENTCLOUD_SECRET_ID
TENCENTCLOUD_SECRET_KEY
TENCENTCLOUD_PROJECT_ID
```
项目会自动使用工作流 `.github/workflows/deploy-edgeone.yml` 部署

---

## 环境变量

本项目支持从环境变量读取 AUTHTOKEN（推荐方式），避免硬编码敏感信息。

### 统一的环境变量名称

所有平台使用相同的变量名：`AUTHTOKEN = "你的32字节随机字符串"`

### 生成 AUTHTOKEN

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

示例：`a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### 各平台环境变量读取方式与配置

| 平台 | 读取方式 | 代码位置 | 配置位置 |
|------|---------|---------|---------|
| Cloudflare Pages | `env.AUTHTOKEN` | `functions/api/generate-token.ts` | Pages 项目 → Settings → Environment variables |
| 阿里云 ESA | `process.env.AUTHTOKEN` | `edge-functions/index.js` | 项目设置 → 环境变量 |
| 腾讯 EdgeOne | `process.env.AUTHTOKEN` | `edge-functions/index.js` | 项目配置 → 环境变量 |
| GitHub Pages | 硬编码（无环境变量支持） | `edge-functions/index.js` | 编辑代码第 12 行 |

### 详细配置步骤

**Cloudflare Pages**
1. Pages 项目 → Settings → Environment variables
2. 新增变量：`AUTHTOKEN = "你的32字节字符串"`
3. 重新部署

**阿里云 ESA**
1. ESA 控制台 → 项目设置 → 环境变量
2. 新增变量：`AUTHTOKEN = "你的32字节字符串"`
3. 重新部署

**腾讯 EdgeOne**
1. EdgeOne 控制台 → 项目配置 → 环境变量
2. 新增变量：`AUTHTOKEN = "你的32字节字符串"`
3. 重新部署

**GitHub Pages**（无环境变量支持，需硬编码）
1. 编辑 `fish-login-page/edge-functions/index.js` 第 12 行
2. 修改为：`const AUTH_TOKEN = 'your-32-char-token'`
3. 提交代码

---

## 与 Koishi 插件集成

在 Koishi 插件配置中设置相同的 AUTH_TOKEN：

```yaml
plugins:
  maichuni-scorehelper:
    authToken: "你的32字节随机字符串"  # 必须与此页面配置相同
```

部署后需要同步更新插件配置，令牌生成才能正常使用。

---

## 使用流程

1. 打开部署的登录页面 URL
2. 输入水鱼账号和密码
3. 点击"生成加密令牌"
4. 复制生成的令牌字符串
5. 在 Bot 中执行 `fish.login <令牌>`
6. 之后可以正常使用其他查分命令

---

## 安全建议

1. AUTH_TOKEN 应定期更换（建议每月一次）
2. 不要在代码中硬编码敏感信息，使用环境变量（优先 Cloudflare/ESA/EdgeOne）
3. 所有平台都默认启用 HTTPS
4. 定期检查部署日志，警惕异常访问
5. GitHub Pages 用户必须硬编码 TOKEN，建议使用 Private 仓库保护


---

## 文件结构

```
fish-login-page/
├── public/              # 前端静态文件
│   └── index.html       # 登录页面（AES-GCM 加密）
├── functions/           # Cloudflare Workers 函数
│   └── api/
│       └── generate-token.ts
├── edge-functions/      # 阿里云/腾讯 边缘函数
│   └── index.js
├── .github/workflows/   # GitHub Actions 工作流
│   ├── deploy-github-pages.yml
│   ├── deploy-cloudflare.yml
│   ├── deploy-esa.yml
│   └── deploy-edgeone.yml
├── package.json
├── README.md            # 项目说明（当前文件）
├── wrangler.toml        # Cloudflare 配置
├── tcb.json             # 腾讯 EdgeOne 配置
└── esa.json             # 阿里云 ESA 配置
```

---

## 本地开发

```bash
npm install
npm run dev
# 访问 http://localhost:3000
```

---

## 故障排查

**登录页面无法访问**
- 检查部署平台是否已启用
- 清除浏览器缓存后重新加载
- 检查 GitHub Actions 部署日志

**生成令牌失败**
- 确认输入的账号密码不为空
- 检查浏览器开发者工具（F12 → Console）的错误信息
- 验证后端 AUTH_TOKEN 配置是否正确（长度必须 32 字节）

**令牌验证失败**
- 确认 Koishi 插件的 AUTH_TOKEN 与页面配置相同
- 检查令牌是否被正确复制（避免空格）
- 重启 Bot 或重新加载插件配置

**访问缓慢**
- GitHub Pages 在国内速度一般，推荐使用 ESA
- 如使用 Cloudflare，可启用缓存优化
- 检查网络连接状态

---