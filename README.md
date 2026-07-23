<div align="center">

# 诛仙世界 · 银两行情监控

**8 区银两价格实时采集 · 走势可视化 · GitHub Actions 自动驱动**

[![Actions](https://img.shields.io/badge/Actions-每30分钟采集-2dd4bf?style=flat-square\&logo=githubactions\&logoColor=white)](https://github.com/kirarikaryuu/zxsj-silver-price/actions)
[![License](https://img.shields.io/badge/License-MIT-79c0ff?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-68a063?style=flat-square\&logo=node.js\&logoColor=white)](https://nodejs.org)
[![Zero Deps](https://img.shields.io/badge/依赖-零原生依赖-ffa657?style=flat-square)]()

</div>

***

> 一个自动化的游戏虚拟货币价格监控工具，从 7881 交易平台的公开接口采集 8 个服务器的银两挂单数据，计算去异常加权均价，并通过 GitHub Pages 提供 4 种交互式可视化视图。

## ✨ 特性

- **8 区并行采集** — 串行请求 + 区间间隔，温和不触发风控
- **去异常挂单** — 硬范围过滤（0.1\~10 元/万银）剔除解析错误与恶意挂单
- **加权均价** — 前 5 条按权重 `[3, 2.5, 2, 1.5, 1]` 计算，前三条占比 75%，贴近真实成交价
- **4 种视图** — 汇总历史 / 汇总单日 / 区历史 K 线 / 区单日分时
- **全自动化** — GitHub Actions 每 30 分钟采集 + 自动 commit + Pages 部署
- **零成本** — 纯静态站点，免费托管，无服务器、无数据库

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
| **汇总单日**  | 8 区折线   | 选定日的分时走势，8 区叠加   |
| **区历史 K** | 单区日 K 线 | 每日 1 根蜡烛，红涨青跌    |
| **区单日**   | 单区分时    | 选定日的分时折线 + 面积图   |

## 🚀 快速开始

### 本地运行

```bash
git clone https://github.com/kirarikaryuu/zxsj-silver-price.git
cd zxsj-silver-price
node app.js
```

打开 <http://localhost:8090>

### 在线访问

```
https://kirarikaryuu.github.io/zxsj-silver-price/
```

## ⚙️ 配置

核心参数位于 `app.js` 顶部的 `CFG`：

```javascript
INTERVAL: 5,            // 本地采集间隔（分钟）
sampleSize: 5,          // 取前 N 条计算
weights: [3, 2.5, 2, 1.5, 1],  // 加权权重
priceMin: 0.1,          // 价格下限
priceMax: 10.0,         // 价格上限
```

GitHub Actions 频率在 `.github/workflows/silver-crawler.yml`：

```yaml
schedule:
  - cron: '*/30 * * * *'   # 每 30 分钟
```

## 🔧 工作原理

```
GitHub Actions (cron)
        │
        ▼
   node app.js
   ├── 构造请求体 (serverId)
   ├── 双重 MD5 签名
   ├── POST gw.7881.com/api/goods/list × 8
   ├── 去异常 + 加权均价
   └── 写入 data/ + history.json + data.js
        │
        ▼
   git commit & push
        │
        ▼
   Pages 自动部署
   └── index.html 读取 data.js 渲染 ECharts
```

### 签名算法

接口防护基于时间戳 + 请求体的双重 MD5：

```
lb-sign = MD5( MD5(signKey + timestamp) + requestBody )
```

详情见项目内的逆向分析笔记。

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
├── app.js                    # 一体化服务（采集 + 存储 + Web）
├── index.html                # ECharts 4 视图前端
├── echarts.min.js            # 本地图表库（离线可用）
├── data.js                   # 内嵌数据（file:// 可直接打开）
├── history.json              # 合并后的完整历史
├── data/                     # 按天存储的原始数据
│   └── silver-price-YYYY-MM-DD.json
└── .github/workflows/
    └── silver-crawler.yml    # 定时采集 + 自动提交
```

## 📈 数据说明

- **单位**：元 / 万银
- **采集频率**：GitHub 端每 30 分钟，本地默认每 5 分钟
- **存储**：按区分组，每个采样点含 `avg / high / low / open / close`
- **体积**：约 45 KB/天，16 MB/年

## 🛡 免责声明

本项目仅采集公开商品列表数据，不涉及任何登录、交易或个人信息。所有数据归 7881.com 及对应权利人所有，仅供个人学习研究使用。

<div align="center">

***

**Made with Node.js · ECharts · GitHub Actions**

</div>
