<div align="center">

# 诛仙世界 · 银两行情监控

**8 区银两价格实时采集 · 走势可视化 · NAS Docker 常驻驱动**

[![Deploy](https://img.shields.io/badge/部署-NAS%20Docker-2dd4bf?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Pages](https://img.shields.io/badge/展示-GitHub%20Pages-79c0ff?style=flat-square&logo=githubpages&logoColor=white)](https://kirarikaryuu.github.io/zxsj-silver-price/)
[![License](https://img.shields.io/badge/License-MIT-ffa657?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-68a063?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Zero Deps](https://img.shields.io/badge/依赖-零原生依赖-f85149?style=flat-square)]()

</div>

***

> 一个自动化的游戏虚拟货币价格监控工具，从 7881 交易平台公开接口采集 8 个服务器的银两挂单数据，计算去异常加权均价，并通过 GitHub Pages 提供 4 种交互式可视化视图。
>
> 采集端运行在极空间 NAS 的 Docker 容器里（每 5 分钟一次），通过 GitHub Contents API 把数据推回仓库，Pages 自动部署更新网页。

## ✨ 特性

- **8 区并行采集** — 串行请求 + 区间间隔，温和不触发风控；单区失败自动重试 1 次
- **去异常挂单** — 硬范围过滤（0.1\~10 元/万银）剔除解析错误与恶意挂单
- **加权均价** — 前 5 条按权重 `[3, 2.5, 2, 1.5, 1]` 计算，前三条占比 75%，贴近真实成交价
- **4 种视图** — 汇总历史 / 汇总单日 / 区历史 K 线 / 区单日分时
- **NAS 常驻** — Docker 容器每 5 分钟采集一次，开机自启，数据持久化
- **API 推送** — 通过 GitHub Contents REST API 上传数据，带超时/重试/sha 缓存，稳定不卡死
- **零成本** — 纯静态站点 + Pages 免费托管，无服务器、无数据库

## 📊 监控服务器

| #  | 服务器  | serverId       |
| -- | ---- | -------------- |
| 01 | 风华绝代 | `G5722P001001` |
| 02 | 浮生若梦 | `G5722P001002` |
| 03 | 一剑诛仙 | `G5722P001007` |
| 04 | 明月天涯 | `G5722P001009` |
| 05 | 唯我独尊 | `G5722P001012` |
| 06 | 世外桃源 | `G5722P001014` |
| 07 | 星河入梦 | `G5722P001017` |
| 08 | 瑶光沁雪 | `G5722P001018` |

## 🖥 视图说明

| 视图        | 类型      | 说明               |
| --------- | ------- | ---------------- |
| **汇总历史**  | 8 区折线   | 全部历史日均价对比，趋势一目了然 |
| **汇总单日**  | 8 区折线   | 选定日的分时走势，按分钟分桶对齐 8 区，tooltip 汇总显示均价/最低/最高 |
| **区历史 K** | 单区日 K 线 | 每日 1 根蜡烛，红涨青跌    |
| **区单日**   | 单区分时    | 选定日的分时折线 + 面积图   |

## 🏗 架构

```
极空间 NAS (Docker 容器, 每5分钟)
        │
        ▼
   node app.js
   ├── 构造请求体 (serverId)
   ├── 双重 MD5 签名
   ├── POST gw.7881.com/api/goods/list × 8 (串行+间隔, 失败重试1次)
   ├── 去异常 + 加权均价
   ├── 写入 data/ + history.json + data.js
   └── GitHub Contents API 上传 (3文件, 带重试/sha缓存)
        │
        ▼
   GitHub main 分支更新
        │
        ▼
   Pages 自动部署
   └── index.html 读取 data.js 渲染 ECharts
```

> **为什么不用 GitHub Actions 采集？** 7881 接口封了 GitHub Actions 的出口 IP 段，采集会失败。改用 NAS Docker 走家庭宽带 IP 即可正常采集。原 Actions workflow 已禁用（`.github/workflows/silver-crawler.yml.disabled`）。

> **为什么用 API 而不是 git push？** 容器内访问 `github.com`（git 协议）极不稳定，git 子进程会卡死堆积阻塞采集循环。改用 `api.github.com` 的 Contents REST API（稳定），每个文件一次 HTTPS 请求，要么成功要么快速失败。

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

看到 `采集结束 成功8/8 (100%)` 和 `数据已推送到 GitHub (3 文件)` 即正常。

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

## ⚙️ 配置

### 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `AUTO_PUSH=1` | 启用采集后自动推送数据到 GitHub（NAS 模式） | 关 |
| `GIT_TOKEN` | GitHub Personal Access Token（推送用） | - |
| `WEB_SERVER=1` | 强制启动容器内 Web 服务 | NAS模式关，本地开 |
| `CI_MODE=1` | 只采集一轮就退出（CI 测试用） | 关 |
| `CRAWL=0` | **关闭采集与定时器**，纯 Web 预览（只读现有数据，不请求接口、不写数据文件） | 开（采集） |

**Web 服务开关逻辑**：
- `AUTO_PUSH=1`（NAS 模式）→ 默认**关闭** Web（纯采集器，省资源、避免端口冲突，通过 Pages 看数据）
- 显式 `WEB_SERVER=1` → 强制开启
- 本地开发（无 `AUTO_PUSH`）→ 默认开启

> **本地调试前端不想反复采集？** 在项目根建 `.env` 文件（已被 `.gitignore`，不会进仓库），写一行 `CRAWL=0`，再 `node app.js` 即可：只起 Web 预览现有 `history.json`，不打 7881 接口、不污染数据文件。app.js 会零依赖自动读取同目录 `.env`（容器内无此文件则跳过，**对 Docker/NAS 完全无影响**）。改完前端删掉 `.env` 或改回 `CRAWL=1` 即恢复采集。

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
├── app.js                    # 一体化服务（采集 + 存储 + API推送 + 可选Web）
├── index.html                # ECharts 4 视图前端
├── echarts.min.js            # 本地图表库（离线可用）
├── Dockerfile                # NAS Docker 镜像（含时区 Asia/Shanghai）
├── entrypoint.sh             # 容器启动脚本
├── docker-compose.yml        # Compose 部署模板
├── data.js                   # 运行时生成（内嵌数据，file:// 可直接打开）⚠️ 不进 git
├── history.json              # 运行时生成（合并后的完整历史）⚠️ 不进 git
├── data/                     # 运行时生成（按天存储的原始数据）⚠️ 不进 git
│   └── silver-price-YYYY-MM-DD.json
└── .github/workflows/
    └── silver-crawler.yml.disabled  # 已禁用（采集迁移到 NAS）
```

> `data/`、`history.json`、`data.js` 是采集服务运行时生成的，**不纳入 git 跟踪**（见 `.gitignore`）。它们靠 `app.js` 的 Contents API 推送到 GitHub，与 git 通道完全解耦，因此 `clone` 下来的仓库里默认没有这些文件 —— 首次部署后采集服务跑一轮即会生成。

## 📈 数据说明

- **单位**：元 / 万银
- **采集频率**：NAS 端每 5 分钟
- **推送频率**：每轮采集后推送（只推当天 data + history.json + data.js，共 3 文件），通过 GitHub Contents API 上传，**不依赖 git 跟踪**（这些文件已从 git 移除，仅靠 API 维护远端副本）
- **存储**：按区分组，每个采样点含 `avg / high / low / open / close`
- **体积**：约 45 KB/天，16 MB/年

## 🛡 健壮性设计

- **采集重试**：单区首次失败自动补采 1 次，降低偶发抽风的数据空洞
- **API 重试**：GitHub API 遇 429（限流）/ 5xx 自动退避重试 2 次
- **sha 缓存**：上传成功的文件 sha 存内存，下次更新省掉 GET 查询
- **超时保护**：所有网络请求带超时，不会无限卡死
- **只推当天**：历史 data 文件不变不推，避免随天数增长触发 GitHub 限流
- **内存增量维护 history**：启动时全量加载一次 `data/` 到内存，之后每次采集只往内存结构追加一条采样再序列化写盘，**不再每轮全量重读所有历史文件**。早期版本每轮重算导致 CPU 占满、`gitPush` 永远轮不到而远端停更，此改造根治该问题
- **心跳看门狗自愈**：每轮采集+推送成功后刷新心跳，独立定时器每分钟检查一次；超过 20 分钟无成功采集即判定卡死、主动 `process.exit(1)`，配合 Docker `restart: always` 自动重启恢复，无需人工介入
- **运行时数据不进 git**：`data/`、`history.json`、`data.js` 均为运行时生成，已从 git 跟踪移除（仅本地存在），数据上 GitHub 纯靠 Contents API 推送，与 git 跟踪解耦 —— 避免 `reset`/`checkout` 误覆盖采集中的数据

## 🔍 故障排查（FAQ）

### 采集正常但数据没推到 GitHub

1. 看日志有没有 `数据已推送到 GitHub (3 文件)`：
   - 有 → 检查 GitHub 仓库 `data/` 是否真的更新（可能有几分钟延迟）
   - 没有，提示 `未设置 GIT_TOKEN` → 容器没传 `GIT_TOKEN` 环境变量
   - 提示 `push 失败 status=401/403` → token 无效或权限不足
   - 提示 `status=404` → 仓库地址/分支名不对（检查 `app.js` 顶部 `GH_OWNER`/`GH_REPO`/`GH_BRANCH`）
2. **token 权限**：classic token 勾 `repo`；fine-grained token 要把 **Contents 设为 Read and write** 并选中该仓库。fine-grained 只读会 403。

### 日志卡在「同步远程最新数据」不动 / 容器采集一轮后就停了

这是早期 git push 版本的问题（容器内访问 `github.com` 卡死）。**当前版本已用 API 推送，不会再卡**。如果还遇到，确认容器跑的是最新镜像：

```bash
docker build -t zxsj-silver . --no-cache   # 强制重建
docker rm -f zxsj-silver && docker run ...  # 重新启动
```

### 容器跑着但远端几小时不更新 / CPU 长期 100%

早期版本 `mergeHistory()` 每轮采集会对 `data/` 下所有历史文件全量重读+重排+重写，随天数累积 CPU 占满，导致 `crawl()` 卡死、`gitPush()` 永远轮不到执行，表现就是远端停更、容器 CPU 飙满。

**当前版本已改内存增量维护**（启动加载一次，之后只追加），根治此问题。万一因其它原因再次卡死，内置**心跳看门狗**会在 20 分钟内自动 `exit` 触发 Docker 重启自愈，无需人工干预。也可手动恢复：

```bash
docker restart zxsj-silver
docker logs --tail 20 zxsj-silver   # 确认看到 [history] 已加载 + [watchdog] 已启用
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

### Pages 网页数据不更新

Pages 部署有 1~2 分钟延迟。确认链路：

```bash
# 1. 容器在推吗
docker logs --tail 5 zxsj-silver | grep "已推送"
# 2. GitHub 上 data.js 更新了吗（看最近 commit 时间）
# 3. Pages 部署状态：仓库 → Actions → pages-build-deployment
```

### 数据文件越来越大、推送变慢

不会。每轮只推 3 个文件（当天 data + history.json + data.js），与历史天数无关。`data/` 下历史 json 一旦过了当天就不再推送。

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
