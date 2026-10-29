<div align="center">

# 诛仙世界 · 银两行情监控

**5 区银两价格实时采集 · 走势可视化 · NAS Docker 常驻驱动**

[![Deploy](https://img.shields.io/badge/部署-NAS%20Docker-2dd4bf?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Pages](https://img.shields.io/badge/展示-GitHub%20Pages-79c0ff?style=flat-square&logo=githubpages&logoColor=white)](https://kirarikaryuu.github.io/zxsj-silver-price/)
[![License](https://img.shields.io/badge/License-MIT-ffa657?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-68a063?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Zero Deps](https://img.shields.io/badge/依赖-零原生依赖-f85149?style=flat-square)]()

</div>

***

> 一个自动化的游戏虚拟货币价格监控工具，从 7881 交易平台公开接口采集 5 个服务器的银两挂单数据，计算去异常加权均价，并通过 GitHub Pages 提供 4 种交互式可视化视图。
>
> 采集端运行在极空间 NAS 的 Docker 容器里（每 5 分钟一轮），每轮只把 **2 个小文件**（`data.js` 轻量汇总 + 当天归档）通过 GitHub Contents API 推回仓库，Pages 自动部署更新网页。

> **2026-09 合区**：游戏已合区，采集的区服从 8 个减为 5 个（详见下文「监控服务器」）。
>
> **2026-10 数据链路重构**：修复了「页面从 2026-10-07 起不再更新」的停更事故 —— 旧方案每轮整包上传 30\~42 MB 的全量历史，在家用宽带 + 请求超时下几乎必然失败；新方案每轮只推 2 个小文件（单轮上传总量约 0.05\~0.4 MB）。事故复盘见「故障排查」。

## ✨ 特性

- **5 区采集** — 串行请求 + 区间间隔，温和不触发风控；单区失败自动重试 1 次
- **去异常挂单** — 硬范围过滤（0.1\~10 元/万银）剔除解析错误与恶意挂单
- **加权均价** — 前 5 条按权重 `[3, 2.5, 2, 1.5, 1]` 计算，前三条占比 75%，贴近真实成交价
- **4 种视图** — 汇总历史 / 汇总单日 / 区历史 K 线 / 区单日分时
- **轻量数据链路** — 每轮只推 2 个小文件：`data.js`（轻量汇总，约 50\~170 KB）+ 当天归档（0\~200 KB），单文件体积与历史天数关系很小；旧方案整包上传 30\~42 MB 的 `history.json` / `data.js`，家庭宽带上行传不完就会超时，这正是 2026-10 停更的根因
- **NAS 常驻** — Docker 容器每 5 分钟采集一次，开机自启，数据持久化
- **API 推送** — 通过 GitHub Contents REST API 上传数据，带超时/重试/sha 缓存，稳定不卡死
- **零成本** — 纯静态站点 + Pages 免费托管，无服务器、无数据库

## 📊 监控服务器

| #  | 服务器  | serverId       |
| -- | ---- | -------------- |
| 01 | 风华绝代 | `G5722P001001` |
| 02 | 浮生若梦 | `G5722P001002` |
| 03 | 一剑诛仙 | `G5722P001007` |
| 04 | 世外桃源 | `G5722P001014` |
| 05 | 瑶光沁雪 | `G5722P001018` |

> **2026-09-09 起游戏合区**，以下 3 个区已并入其它区、接口不再返回数据，采集端已移除：
>
> - 明月天涯（`G5722P001009`）
> - 唯我独尊（`G5722P001012`）
> - 星河入梦（`G5722P001017`）
>
> 它们 2026-09-09 之前的历史归档仍保留在 `data/` 目录里（仅作存档，页面不再展示）。

## 🖥 视图说明

| 视图        | 类型      | 说明               |
| --------- | ------- | ---------------- |
| **汇总历史**  | 5 区折线   | 全部历史日均价对比，趋势一目了然（数据来自 `data.js` 的每日汇总，不额外请求文件） |
| **汇总单日**  | 5 区折线   | 选定日的分时走势，按分钟分桶对齐 5 区，tooltip 汇总显示均价/最低/最高 |
| **区历史 K** | 单区日 K 线 | 每日 1 根蜡烛，红涨青跌（开盘/收盘/最低/最高来自 `data.js` 的 `daily`） |
| **区单日**   | 单区分时    | 选定日的分时折线 + 面积图   |

补充说明：

- 顶部副标题、统计卡片列表都按 `data.js` 里的实际区数动态生成（当前 5 区），统计卡片显示 5 个区的最新均价排名；在「区历史 K」「区单日」视图下点击卡片可切换服务器。
- 单日视图有两条取数路径：所选日期正好是 `data.js` 里内嵌的最近一天（`today`）时直接用内嵌分时，**不发请求**；选择更早的日期时，前端按需 `fetch('data/silver-price-YYYY-MM-DD.json')` 读取当天的归档文件。
- 视图与日期记录在 URL hash 中（如 `#summary-day/2026-10-29`、`#server-day/2026-10-29`），刷新或分享链接可保持视图状态。
- 用 `file://` 直接双击打开 `index.html` 时，浏览器不允许 fetch 本地归档：「汇总历史」「区历史 K 线」和最近一天的分时仍可用（都来自 `data.js`），但查看更早日期的分时需要 HTTP 访问（Pages 或本地 `node app.js`）。

## 🏗 架构

```
极空间 NAS (Docker 容器, 每 5 分钟一轮)
        │
        ▼
   node app.js
   ├── 构造请求体 (serverId)
   ├── 双重 MD5 签名
   ├── POST gw.7881.com/api/goods/list × 5 (串行+间隔, 失败重试 1 次)
   ├── 去异常 + 加权均价（保留 6 位小数）
   ├── 写入当天归档 data/silver-price-YYYY-MM-DD.json (紧凑 JSON, 约 200 KB)
   ├── 重建 data.js (v2 轻量汇总: 5 区每日 daily + latest + 当天 today, 约 50~170 KB)
   └── GitHub Contents API 上传 (2 个小文件, 带重试/sha 缓存)
        │
        ▼
   GitHub main 分支更新
        │
        ▼
   Pages 自动部署
   ├── index.html 加载 data.js → 汇总历史 / 区历史 K 线 / 统计卡片
   └── 单日视图按需 fetch data/silver-price-YYYY-MM-DD.json
```

> **为什么不用 GitHub Actions 采集？** 7881 接口封了 GitHub Actions 的出口 IP 段，采集会失败。改用 NAS Docker 走家庭宽带 IP 即可正常采集。原 Actions workflow 已禁用（`.github/workflows/silver-crawler.yml.disabled`）。

> **为什么用 API 而不是 git push？** 容器内访问 `github.com`（git 协议）极不稳定，git 子进程会卡死堆积阻塞采集循环。改用 `api.github.com` 的 Contents REST API（稳定），每个文件一次 HTTPS 请求，要么成功要么快速失败。

> **为什么废弃 `history.json`？** 旧方案每轮把全量历史分别打包成 `history.json`（41.6 MB）和 `data.js`（约 30 MB）整包 PUT。Contents API 要求把整个文件 base64 后塞进一次请求，家庭宽带上行 + 20 秒请求超时（旧版）下，几十 MB 的请求几乎必然超时失败，只有约 400 KB 的当天归档能成功；而旧前端偏偏 `fetch('history.json')`，于是页面数据永远停在 2026-10-07。新方案只推小文件，`history.json` 已从仓库删除、不再生成/推送（若远端仍残留旧的 41.6 MB 大文件，采集端首次推送时会替换成一个废弃说明小文件）。

## 🚀 部署到 NAS Docker（推荐）

### 1. 生成 GitHub Token

数据需要 push 回仓库触发 Pages 更新，需要一个写权限 token：

1. 打开 https://github.com/settings/tokens （classic，勾 `repo`）或 https://github.com/settings/personal-access-tokens （fine-grained，Contents 设为 Read and write）
2. 生成并复制 token（形如 `ghp_xxx` 或 `github_pat_xxx`）

### 2. 在 NAS 上拉取项目

```bash
git clone https://github.com/kirarikaryuu/zxsj-silver-price.git
cd zxsj-silver-price
```

### 3. 构建镜像并启动

```bash
docker build -t zxsj-silver .
docker run -d \
  --name zxsj-silver \
  --restart always \
  --network host \
  -v "$PWD/data":/app/data \
  -e AUTO_PUSH=1 \
  -e GIT_TOKEN=ghp_你的token \
  zxsj-silver
```

> **`--network host` 很关键**：极空间 Docker 默认 bridge 网络访问 `github.com` 不稳定，host 模式直接用宿主机网络栈，访问 `api.github.com` 稳定。
>
> **`-v data`**：数据持久化，容器重建不丢历史。

#### 方式 B：用 docker-compose（推荐长期管理）

项目根目录已带 `docker-compose.yml`，但默认是 bridge 网络，需要改成 host 模式。在项目根目录建 `.env` 文件：

```bash
echo "GIT_TOKEN=ghp_你的token" > .env
```

然后把 `docker-compose.yml` 改为：

```yaml
version: '3'
services:
  silver-crawler:
    build: .
    container_name: zxsj-silver
    restart: always
    network_mode: host          # 关键：替代 ports 映射
    volumes:
      - ./data:/app/data
    environment:
      - AUTO_PUSH=1
      - GIT_TOKEN=${GIT_TOKEN}
```

启动：

```bash
docker compose up -d --build      # 老版本用 docker-compose up -d --build
docker compose logs -f             # 看日志
```

### 4. 验证

```bash
docker logs -f zxsj-silver
```

正常日志依次包含：

```
[data] data.js 已生成（… KB，5 区 / N 天）
[data] 已更新 data.js (… KB) + 当天归档 (… KB) · 累计 N 条采样
采集结束 成功5/5 (100%)
数据已推送到 GitHub (2 文件)
```

> **首次运行新版本**时，如果远端仓库里还留着旧的 `history.json`（41.6 MB），日志里会多一条一次性清理：`[gh] 已把远端 history.json（… MB）替换为废弃提示`，之后不再处理；如果它已随本次改造从仓库删除（本仓库现状），则直接跳过。

### 5. 代码更新后如何升级（重要）

镜像用 `COPY . .` 把代码打进镜像，**改完代码只 `git pull` 不重新 `docker build`，容器里跑的仍是旧代码**（典型症状：页面/日志行为与本 README 对不上、还在整包上传大文件）。以本次 2026-10 改造为例，完整流程分两端：

#### a) Windows 开发机：提交改动

```bash
git add -A
git commit -m "feat: 5 区采集 + 轻量数据链路"
git pull --rebase      # 把本地提交 rebase 到 NAS 每 5 分钟推送的最新数据提交上（顺序：先提交再 pull，避免「有未暂存改动无法 rebase」）
git push
```

> `data/`、`data.js` 是 NAS 自动维护的运行时数据（本地 `.gitignore` 已忽略），本次改造同时删除了废弃的 `history.json`；`git add -A` 会把代码改动连同 `data.js` 一起提交，Pages 可立刻切到新的 v2 数据格式。

#### b) NAS：同步代码并重建镜像

```bash
cd /path/to/zxsj-silver-price

docker rm -f zxsj-silver              # 1. 先停旧容器，避免它继续改写挂载的 data/
git pull                              # 2. 同步最新代码（含远端推送的数据文件）
docker build -t zxsj-silver . --no-cache   # 3. 用新代码重建镜像
docker run -d \
  --name zxsj-silver \
  --restart always \
  --network host \
  -v "$PWD/data":/app/data \
  -e AUTO_PUSH=1 \
  -e GIT_TOKEN=ghp_你的token \
  zxsj-silver
```

> **`git pull` 报 `data/` 有本地改动 / 「未跟踪文件会被覆盖」怎么办**：`data/` 是挂载目录，容器会持续往里追加当天采样，而远端每 5 分钟也在更新这些文件，两边几乎必然不一致。最省事的做法是直接以远端为准（数据每轮都已推送，最多丢一轮未推送的采样）：
>
> ```bash
> git fetch origin
> git reset --hard origin/main   # 用远端版本覆盖 data/、data.js、history.json 等
> ```
>
> 担心本地归档比远端新，先 `cp -r data data.bak` 备份。若坚持用 `git pull`，先 `git checkout -- data/ && git clean -fdx data/` 再拉。
>
> 用 docker-compose 的，最后两步换成 `docker compose up -d --build` 即可。
>
> **clone 下来的仓库里已经包含历史归档 `data/`**：首次启动时 app.js 会扫描 `data/` 重建 `data.js`，历史视图立即可用，之后从当天继续采集。重启后确认日志出现 `[data] data.js 已生成` 与 `数据已推送到 GitHub (2 文件)` 即升级成功。

### 在线访问

```
https://<你的GitHub用户名>.github.io/zxsj-silver-price/
```

## 🌐 部署到 Netlify（公网兜底站）

GitHub Pages 已经能用，为啥还要 Netlify？—— **NAS 万一挂了，多一个公网兜底站**。GitHub Actions 定时把最新仓库（含数据）部署到 Netlify，数据最多滞后几小时，NAS 断了访客也不至于看到陈旧数据。

### 为什么不用 Netlify 自带的自动部署？

两条路都有坑：
- **让 Netlify 自动构建**：NAS 每 5 分钟 push 一次 → 一天 288 次 push → 触发 288 次 Netlify 构建，远超免费额度（300 构建分钟/月）。
- **关掉自动构建用 Deploy Hook**：Netlify 的 "Stop builds" 会把 Build Hook **一起废掉**，hook 不再触发构建。

**最终方案**：用 GitHub Actions 定时 checkout 最新代码 + `netlify deploy --prod` CLI 直推。Netlify 那边 0 构建消耗，完全绕开额度问题。

### 1. Netlify 建站

1. [netlify.com](https://app.netlify.com/) → Add new site → Import existing project → 选 GitHub 仓库 `zxsj-silver-price`
2. 构建配置：
   - **Build command**：留空（纯静态，无需构建）
   - **Publish directory**：`.`（根目录就是站点）
3. Deploy 一次确认能访问，拿到形如 `https://xxx.netlify.app` 的域名

### 2. 拿到 Site ID

Site settings → General → Site details → **Site ID**（Project ID，UUID 格式，形如 `a1b2c3d4-...`）

### 3. 生成 Netlify Token

https://app.netlify.com/user/applications#personal-access-tokens → New access token → 复制（`nfp_` 开头）

### 4. 配置 GitHub Secrets

仓库 Settings → Secrets and variables → Actions → New repository secret，加两个：
- **`NETLIFY_SITE_ID`**：第 2 步的 Site ID
- **`NETLIFY_AUTH_TOKEN`**：第 3 步的 token

### 5. 定时部署已就绪

`.github/workflows/netlify-deploy.yml` 已配置：北京时间每天 **8/12/16/20/24 点** 各部署一次（一天 5 次，数据最多滞后 4 小时）。
每次只做 checkout + `netlify deploy --prod`，不跑 Netlify 构建，免费额度只占极少量 Actions 分钟数。

> **改频率**：编辑 workflow 里的 `cron`。UTC 时间，北京 = UTC+8。例：
> - 一天 3 次（早中晚）：`cron: '0 0,6,12 * * *'`（北京 8/14/20）
> - 一天 2 次：`cron: '0 0,12 * * *'`（北京 8/20）
>
> **手动触发**：Actions 页面 → Netlify Deploy → Run workflow，随时来一发。

### 在线访问

```
https://<你的Netlify子域名>.netlify.app/
```

## 🔧 本地运行（开发/调试）

```bash
git clone https://github.com/kirarikaryuu/zxsj-silver-price.git
cd zxsj-silver-price
node app.js
```

打开 <http://localhost:8090>。本地模式默认启动 Web 服务、不自动推送（采集数据只写本地）。

> **只改前端、不想反复采集？** 在项目根建 `.env` 文件（已被 `.gitignore`，不会进仓库），写一行 `CRAWL=0`，再 `node app.js` 即可：不请求 7881 接口、不写归档，只从现有 `data/` 聚合重建 `data.js` 并起 Web 预览（启动日志会打印 `[data] data.js 已生成（… KB，5 区 / N 天）`）。改完前端删掉 `.env` 或改回 `CRAWL=1` 即恢复采集。
>
> app.js 会零依赖自动读取同目录 `.env`（容器内无此文件则跳过，**对 Docker/NAS 完全无影响**）。

## ⚙️ 配置

### 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `AUTO_PUSH=1` | 启用采集后自动推送数据到 GitHub（NAS 模式） | 关 |
| `GIT_TOKEN` | GitHub Personal Access Token（推送用） | - |
| `WEB_SERVER=1` | 强制启动容器内 Web 服务 | NAS模式关，本地开 |
| `CI_MODE=1` | 只采集一轮就退出（CI 测试用） | 关 |
| `CRAWL=0` | **关闭采集与定时器**：只从现有 `data/` 聚合重建 `data.js` 并起 Web 预览（不请求接口、不改归档） | 开（采集） |

**Web 服务开关逻辑**：
- `AUTO_PUSH=1`（NAS 模式）→ 默认**关闭** Web（纯采集器，省资源、避免端口冲突，通过 Pages 看数据）
- 显式 `WEB_SERVER=1` → 强制开启
- 本地开发（无 `AUTO_PUSH`）→ 默认开启

### 采集参数

核心参数位于 `app.js` 顶部的 `CFG`：

```javascript
INTERVAL: 5,            // 采集间隔（分钟）
SERVER_GAP: 800,        // 区间请求间隔（毫秒）
sampleSize: 5,          // 取前 N 条计算
weights: [3, 2.5, 2, 1.5, 1],  // 加权权重
priceMin: 0.1,          // 价格下限（元/万银）
priceMax: 10.0,         // 价格上限（元/万银）
```

## 🔧 工作原理

### 签名算法

接口防护基于时间戳 + 请求体的双重 MD5：

```
lb-sign = MD5( MD5(signKey + timestamp) + requestBody )
```

### 接口数据结构

**请求**

```
POST https://gw.7881.com/goods-service-api/api/goods/list
Content-Type: application/json
lb-timestamp: <13位毫秒时间戳>
lb-sign: <MD5签名>
```

请求体：

```json
{
  "marketRequestSource": "search",
  "sellerType": "C",
  "gameId": "G5722",
  "gtid": "100001",
  "groupId": "G5722P001",
  "serverId": "G5722P001007",
  "goodsSortType": "price",
  "pageNum": 1,
  "pageSize": 20
}
```

| 字段 | 说明 |
|---|---|
| `serverId` | 区服编码，切换区只改这个字段 |
| `goodsSortType` | 排序方式，`price` = 按价格升序 |
| `pageSize` | 每页条数，取 20 条够用 |

**响应**

```json
{
  "code": 0,
  "msg": "success",
  "body": {
    "serverName": "一剑诛仙",
    "results": [
      {
        "goodsTitle": "10000银两",
        "salePrice": 7.95,
        "price": 7.95
      }
    ],
    "records": 1523
  }
}
```

| 字段 | 说明 |
|---|---|
| `code` | `0` 成功，`400` 时间戳偏移需重校准 |
| `body.serverName` | 区服中文名（用于校验映射） |
| `body.results[]` | 商品列表，按价格升序 |
| `body.results[].goodsTitle` | 标题，含银两数（如 "10000银两"、"1.2万"） |
| `body.results[].salePrice` | 售价（人民币元） |
| `body.records` | 该区总挂单数 |

**价格计算**

```
单价(元/万银) = salePrice / (解析出的银两数 / 10000)
```

## 📁 项目结构

```
zxsj-silver-price/
├── app.js                    # 一体化服务（采集 + 按天归档 + 轻量汇总 + API推送 + 可选Web）
├── index.html                # ECharts 4 视图前端（加载 data.js v2 + 单日按需 fetch 归档）
├── echarts.min.js            # 本地图表库（离线可用）
├── Dockerfile                # NAS Docker 镜像（含时区 Asia/Shanghai）
├── entrypoint.sh             # 容器启动脚本（建数据目录、检查 token，data.js 启动时重建）
├── docker-compose.yml        # Compose 部署模板
├── data.js                   # 运行时生成（v2 轻量汇总，约 50~170 KB）⚠️ 不进本地 git
├── data/                     # 运行时生成（按天归档，紧凑 JSON，0~200 KB/天）⚠️ 不进本地 git
│   └── silver-price-YYYY-MM-DD.json
└── .github/workflows/
    ├── netlify-deploy.yml            # 定时把最新仓库部署到 Netlify
    └── silver-crawler.yml.disabled   # 已禁用（采集迁移到 NAS）
```

> `data/`、`data.js` 是采集服务运行时生成的数据文件，本地 `.gitignore` 已忽略，日常不要手动编辑/单独提交；数据由 NAS 通过 GitHub Contents API 自动提交到仓库远端（因此远端仓库 / Pages / `clone` 下来的目录里能看到这些文件）。只有升级代码时才会随代码一起提交一次 `data.js`（见「代码更新后如何升级」）。旧的 `history.json` 已在 2026-10 重构时从仓库删除并永久废弃。

## 📈 数据说明

- **单位**：元 / 万银
- **采集频率**：NAS 端每 5 分钟一轮（5 区串行，区间间隔 800 ms）
- **推送频率**：每轮采集后推送 2 个小文件 —— `data.js` + `data/silver-price-当天.json`（跨天的那一轮可能同时补推前一天归档）；历史日期的归档写过一次后不再重复推送。单轮上传总量约 0.05\~0.4 MB
- **体积**：`data.js` 约 50\~170 KB（刚跨天只有每日汇总时约 50 KB，当天分时采样满后约 170 KB；随历史天数缓慢增长，一年后约 300 KB 量级）；当天归档 0\~200 KB（一天结束约 200 KB）
- **废弃**：旧的 `history.json`（41.6 MB）已从仓库删除、不再生成/推送；如果远端某处仍残留这个旧文件，采集端首次推送时会把它替换成废弃说明小文件
- **不再有 40 MB 级文件**：仓库与 Pages 站点里最大的数据文件就是上面两个（均为百 KB 级）

### data.js（v2 轻量汇总）

站点前端读取的唯一入口，结构如下（示例字段省略部分数组元素）：

```json
{
  "version": 2,
  "lastUpdate": "2026-10-29T15:42:00.061Z",
  "totalSamples": 132449,
  "dates": ["2026-07-23", "2026-07-24", "..."],
  "servers": {
    "一剑诛仙": {
      "serverId": "G5722P001007",
      "days": ["2026-07-23", "2026-07-24", "..."],
      "daily": [
        { "avg": 0.656783, "o": 0.65, "c": 0.652, "h": 0.67, "l": 0.645, "n": 288 }
      ],
      "latest": { "ts": 1793288520061, "avg": 0.656783, "date": "2026-10-29" },
      "today": {
        "date": "2026-10-29",
        "samples": [
          { "ts": 1793288520061, "avg": 0.656783, "high": 0.66, "low": 0.65, "open": 0.65, "close": 0.66 }
        ]
      }
    }
  }
}
```

| 字段 | 说明 |
|---|---|
| `version` | 数据格式版本，当前为 `2`；前端会校验，旧格式会提示「数据格式更新中」 |
| `lastUpdate` | 最近一条采样的 ISO 时间（UTC），页面顶部「更新」显示的就是它 |
| `totalSamples` | 5 区累计采样条数 |
| `dates` | 所有区出现过的日期并集（北京时间，升序） |
| `servers.区名.days / daily` | 该区有数据的日期数组，与 `daily` 一一对齐；`daily[]` = 当日 `avg/o/c/h/l/n`（均价 / 开 / 收 / 高 / 低 / 采样条数） |
| `servers.区名.latest` | 最近一条采样（`ts/avg/date`），统计卡片用它排名 |
| `servers.区名.today` | 最近一天的分时，单日视图「当天」直接用它，免请求 |

### 按天归档（data/silver-price-YYYY-MM-DD.json）

每轮采集追加写当天文件，紧凑 JSON（无缩进），约 200 KB/天：

```json
{
  "date": "2026-10-30",
  "servers": {
    "一剑诛仙": {
      "serverId": "G5722P001007",
      "samples": [
        {
          "ts": 1793370000000,
          "avg": 0.656783,
          "high": 0.66,
          "low": 0.65,
          "open": 0.65,
          "close": 0.66,
          "sampleCount": 5,
          "timestamp": "2026-10-29T16:00:00.000Z"
        }
      ]
    }
  }
}
```

- `avg` 为去异常加权均价，`o/c/h/l` 为前 5 条有效挂单的首个 / 末个 / 最高 / 最低单价，`sampleCount` 为参与计算条数（通常 5）。
- 历史归档都是「带缩进」的旧格式：2026-07-23 ~ 2026-09-09（合区前，含 8 个区）约 6 KB ~ 680 KB/天（多数 400~700 KB，采集不完整的日子更小）；2026-09-10 ~ 2026-10-29（合区后 5 区）约 403~426 KB/天。2026-10-30 起的新归档改为紧凑 JSON，5 区满日约 200 KB。前端只读取 `samples[].ts/avg`，旧文件照常展示；已合区旧区的数据只保留在归档里。
- 单日视图按需读取该文件：当天用 `data.js` 的 `today`，历史日期才 `fetch` 对应归档。

## 🛡 健壮性设计

- **采集重试**：单区首次失败自动补采 1 次，降低偶发抽风的数据空洞
- **API 重试**：GitHub API 遇 429（限流）/ 5xx 自动退避重试 2 次（GET 与 PUT 都有）
- **sha 缓存**：上传成功的文件 sha 存内存，下次更新省掉 GET 查询；409/422 时自动清缓存重查
- **超时保护**：GitHub API 请求带 30 秒超时（旧版 20 秒），要么成功要么快速失败，不会无限卡死
- **只推小文件**：每轮只推 `data.js`（约 50\~170 KB）+ 当天归档（0\~200 KB），历史归档不再重复推；文件体积与历史天数基本无关，彻底避开大文件上传超时的问题
- **失败不阻塞**：本轮推送失败的文件会保留「待推送」标记，下一轮自动重试；推送失败不影响采集继续
- **启动聚合 + 内存增量**：启动时从 `data/` 全量聚合一次轻量 `STATE`，之后每轮只追加、每轮结束才落盘一次；不再每条采样都重写整个归档 / 几十 MB 的 `data.js`（旧实现的 CPU/磁盘放大问题已消除）
- **心跳看门狗自愈**：每轮采集完成后刷新心跳（推送失败也算存活），独立定时器每分钟检查一次；超过 20 分钟无成功采集即判定卡死、主动 `process.exit(1)`，配合 Docker `restart: always` 自动重启恢复，无需人工介入
- **一次性清理旧文件**：每轮推送前检测远端 `history.json`，若是旧的几十 MB 大文件则替换成废弃说明小文件，成功后不再处理
- **前端容错**：`data.js` 版本校验（旧格式提示刷新）、单日归档加载失败提示、单日请求竞态保护、`file://` 模式提示；均为纯静态实现，无额外依赖

## 🔍 故障排查（FAQ）

### 页面数据停在某个时间不再更新（2026-10 停更事故复盘）

**症状**：Pages 页面一直显示旧数据（本次事故停在 **2026-10-07**），但 NAS 容器日志显示采集一切正常。

**根因**：旧方案每轮把**全量历史**打包成 `history.json`（41.6 MB）和 `data.js`（约 30 MB）整包 PUT 到 GitHub Contents API。文件涨到几十 MB 后，家庭宽带上行 + 单个请求 20 秒超时，大文件上传几乎必然失败；只有约 0.4 MB 的 `data/` 当天归档能稳定成功。而旧前端 `fetch` 的偏偏是 `history.json` —— 它最后一次成功提交停在 **2026-10-07T14:50Z**，远端 `data.js` 也停在 **2026-10-29T01:38Z**，此后仓库提交里只有 `data/silver-price-<日期>.json`，所以页面数据停更。

**现在的方案**：每轮只推 2 个小文件 —— `data.js` v2 轻量汇总（约 50\~170 KB）+ 当天归档（0\~200 KB），单轮上传总量约 0.05\~0.4 MB；`history.json` 不再生成/推送。前端汇总视图直接读 `data.js`，单日视图按需 `fetch` 当天归档。单文件 base64 后也只有一两百 KB 的请求体，正常家庭上行 30 秒内轻松传完，不可能再触发旧方案那种超时。

**如何判断是不是同一类问题**：

1. 容器日志有没有 `数据已推送到 GitHub (2 文件)`；出现 `[push] ... 失败 status=0 timeout` 或 `推送完成: 成功 0 / 失败 2` 说明请求又超时/变大了
2. 看 GitHub 仓库的 Commits：如果最近提交**只有** `data/silver-price-<日期>.json`、长时间没有 `data.js` 的提交 —— 这正是旧事故的指纹
3. 直接打开远端 `data.js` 看 `lastUpdate` 字段，与页面顶部「更新」时间对比
4. Pages 部署状态：仓库 → Actions → `pages-build-deployment`

> 如果还是旧镜像（每轮整包推几十 MB），按「部署到 NAS Docker → 5. 代码更新后如何升级」重建镜像即可。

### 采集正常但数据没推到 GitHub

1. 看日志有没有 `数据已推送到 GitHub (2 文件)`：
   - 有 → 检查 GitHub 仓库 `data.js` / `data/` 是否真的更新（可能有几分钟延迟）
   - 没有，提示 `未设置 GIT_TOKEN` → 容器没传 `GIT_TOKEN` 环境变量
   - 提示 `[push] data.js 失败 status=401/403` → token 无效或权限不足
   - 提示 `status=404` → 仓库地址/分支名不对（检查 `app.js` 顶部 `GH_OWNER`/`GH_REPO`/`GH_BRANCH`）
   - 提示 `status=0 timeout` → 网络不通或请求超时（见「容器内访问不了 GitHub」）
2. **token 权限**：classic token 勾 `repo`；fine-grained token 要把 **Contents 设为 Read and write** 并选中该仓库。fine-grained 只读会 403。

### 页面提示「该日数据未归档/加载失败」

单日视图读取的是 `data/silver-price-YYYY-MM-DD.json`。出现这个提示通常是：

- 该日期的归档还没推上去（例如 NAS 刚上线、或该天推送失败）→ 看容器日志与仓库 `data/` 目录
- Pages 还没部署完最新提交 → 等 1~2 分钟刷新
- 用 `file://` 直接双击打开了 `index.html` → 浏览器禁止 fetch 本地文件，改用 HTTP 访问（Pages 或 `node app.js`）

### 页面提示「数据格式更新中，请刷新」/ 数据加载失败

前端要求 `data.js` 的 `version` 为 `2`。看到这个提示说明远端 `data.js` 还是旧版或已损坏：

- 容器还在跑旧镜像 → 按「部署到 NAS Docker → 5. 代码更新后如何升级」重建镜像
- 首轮推送还没完成 → 等下一轮采集（5 分钟）后刷新
- 页面缓存 → 强制刷新（Ctrl+F5）；前端加载 `data.js` 时本身已带时间戳防缓存

### 页面只有 5 个区，旧 3 个区没了

2026-09-09 起游戏合区，明月天涯 / 唯我独尊 / 星河入梦 已并入其它区，7881 接口不再返回这些区的挂单，采集端已移除。它们的 2026-09-09 前历史归档仍在 `data/` 里，但不参与采集与页面展示。

### 容器跑着但远端几小时不更新 / CPU 长期 100%

早期版本每轮对 `data/` 全量重读 + 重写 `history.json` / `data.js`（几十 MB），随天数累积 CPU 占满、推送轮不到执行。**当前版本已改为启动聚合一次 + 内存增量更新 + 每轮只推 2 个小文件**，不会再有这个问题；内置**心跳看门狗**也会在 20 分钟无成功采集时自动 `exit` 触发 Docker 重启自愈。如果仍出现：

```bash
docker restart zxsj-silver
docker logs --tail 20 zxsj-silver   # 确认看到 [history] 已加载 ... / [watchdog] 已启用
```

### 容器内访问不了 GitHub（push 全失败）

极空间 Docker 默认 bridge 网络到 `github.com`/`api.github.com` 不稳定。**务必用 `--network host`**（见部署章节）。验证：

```bash
docker exec zxsj-silver wget -q -O- https://api.github.com >/dev/null && echo OK || echo FAIL
```

FAIL 就说明网络模式没改对。

### 端口 8090 被占用

NAS 模式默认不启动 Web 服务（纯采集器），不会有端口冲突。只有显式 `WEB_SERVER=1` 才会监听端口，被占用时 app.js 会自动 +1（8090→8091）。

### 采集成功率不到 100%

偶发 `code=非0` 或 `请求失败` 是 7881 接口抽风，单区失败会自动重试 1 次。如果**长期大面积失败**，可能是：
- NAS 出口 IP 被 7881 风控（采集太频繁，可把 `CFG.INTERVAL` 调大到 10~15 分钟）
- 签名 key 失效（7881 改了接口，需重新逆向）

### 代码更新后容器行为没变 / 还在整包上传大文件

镜像构建时用 `COPY . .` 把代码打进镜像，**改代码后必须重新 `docker build`**，只 `git pull` 或重启容器都不会生效。按「部署到 NAS Docker → 5. 代码更新后如何升级」操作。

### 数据文件越来越大、推送变慢？

当前不会。每轮只推 2 个小文件（`data.js` 约 50\~170 KB + 当天归档 0\~200 KB），历史日期归档写过一次后不再推送；`data.js` 只保留每日汇总，每天仅增加 5 条很小的记录（一年约 +150 KB 量级）。如果发现推送耗时明显变长，先确认容器跑的是最新镜像（旧镜像仍会整包推 30\~42 MB），再看日志里打印的文件体积。

### 更换 GitHub Token

```bash
docker rm -f zxsj-silver
docker run -d ... -e GIT_TOKEN=新token ... zxsj-silver
```

---

## 🛡 免责声明

本项目仅采集公开商品列表数据，不涉及任何登录、交易或个人信息。所有数据归 7881.com 及对应权利人所有，仅供个人学习研究使用。

<div align="center">

***

**Made with Node.js · ECharts · Docker · GitHub Pages**

</div>
