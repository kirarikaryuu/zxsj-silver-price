/**
 * 7881 银价监控 - 一体化服务（5 区）
 * 一个命令搞定: 抓数据 + 按天归档 + 轻量汇总 data.js + Web图表 + 定时采集
 *
 * 用法: node app.js
 * 打开: http://localhost:8090
 *
 * 架构要点（2026-10 重构）：
 * 1. 只采集当前存续的 5 个区（2026-09 合区：明月天涯/唯我独尊/星河入梦 已并入其它区，
 *    历史数据仍保留在 data/ 归档里，但不再采集、不再展示）。
 * 2. 采集结果按天归档到 data/silver-price-YYYY-MM-DD.json（紧凑 JSON，5 区满日约 200KB）。
 * 3. 每轮只生成一个轻量汇总 data.js（约 50~170KB：5 区每日 OHLC/均价 + 当天分时），
 *    供 GitHub Pages / 本地预览直接加载；历史单日视图由前端按需拉取当天归档文件。
 * 4. 每轮只向 GitHub 推送 2 个小文件（data.js + 当天归档），不再推送几十 MB 的全量历史。
 *    旧方案每轮把 30~42MB 的 data.js / history.json 整包 PUT 到 Contents API，超过家庭
 *    上行与请求超时承受能力后上传几乎全部失败，只有 0.4MB 的当天文件能成功 —— 这就是
 *    2026-10-07 起 Pages 停更（前端 fetch 的 history.json 永远停在旧版本）的根因。
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ======================== .env 加载（仅本地开发用） ========================
// 零依赖手写：读取同目录 .env 注入 process.env（已有同名变量不覆盖）。
// 设计为对 Docker 完全无影响：容器内没有 .env 文件 → 跳过；
// 即便有，环境里已注入的变量（如 docker run -e GIT_TOKEN）优先级更高。
// 本地用法：在项目根建 .env 写 CRAWL=0，即可关闭自动采集、纯 Web 预览。
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if (process.env[k] === undefined) {                 // 不覆盖已存在的环境变量
        process.env[k] = v.replace(/^["']|["']$/g, '');   // 去掉首尾引号
      }
    }
  }
} catch (e) { /* .env 读取失败不影响启动，按现有环境变量继续 */ }

// ======================== 配置 ========================
// 5 个区映射（中文区名 => serverId）
// 2026-09 合区后只保留这 5 个；已下线的 3 个区（明月天涯 G5722P001009 / 唯我独尊
// G5722P001012 / 星河入梦 G5722P001017）2026-09-09 之后接口已无数据，不再请求。
const SERVERS = {
  '风华绝代': 'G5722P001001',
  '浮生若梦': 'G5722P001002',
  '一剑诛仙': 'G5722P001007',
  '世外桃源': 'G5722P001014',
  '瑶光沁雪': 'G5722P001018',
};

const CFG = {
  PORT: 8090,
  INTERVAL: 5,            // 采集间隔(分钟) —— NAS 部署：5分钟一次
  SERVER_GAP: 800,        // 区间请求间隔(毫秒)
  apiUrl: 'https://gw.7881.com/goods-service-api/api/goods/list',
  signKey: 'lb88ebb30d3ecb40d2bd6c7393a835c2c5',
  baseBody: {
    marketRequestSource: 'search', sellerType: 'C',
    gameId: 'G5722', gtid: '100001',
    groupId: 'G5722P001',
    goodsSortType: 'price', pageNum: 1, pageSize: 20,
  },
  sampleSize: 5,
  // 银价合理物理范围（元/万银），超出视为异常挂单/解析错误直接剔除
  priceMin: 0.1,
  priceMax: 10.0,
  // 前5条加权权重（前三条权重大），权重与 sampleSize 对齐
  weights: [3, 2.5, 2, 1.5, 1],
  verifyServerName: true, // 首次校验响应 serverName 是否匹配
};

const DATA_DIR = path.join(__dirname, 'data');
const DATA_JS_FILE = path.join(__dirname, 'data.js');   // 站点主数据文件（轻量汇总）
const dayFilePath = date => path.join(DATA_DIR, `silver-price-${date}.json`);

// ======================== 心跳看门狗 ========================
// crawl() 成功完成一次（含推送）就刷新 lastCrawlOkTime。
// 若超过 WATCHDOG_THRESHOLD 仍无成功采集，判定卡死，主动退出 ——
// 配合 docker restart:always 实现自愈重启，无需人工干预。
let lastCrawlOkTime = Date.now();
const WATCHDOG_THRESHOLD = 20 * 60 * 1000;   // 20 分钟（5 分钟一轮，容忍约 4 轮连续失败）

// ======================== 工具 ========================
function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }
function now() { return new Date(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
// 保留 6 位小数（元/万银，展示到 4 位足够，6 位足够精度且体积更小）
function r6(v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v * 1e6) / 1e6 : null; }

// 北京时间(Asia/Shanghai)的 YYYY-MM-DD。
// 注意：不能用 toISOString()（它是 UTC），否则凌晨0~8点的数据会被算到前一天，
// 导致 24号数据存进 23号文件、网页没有24号图像。
function bjDate(d) {
  const s = (d instanceof Date ? d : new Date(d))
    .toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10); // sv-SE 格式 = YYYY-MM-DD HH:mm:ss
  return s;
}

function buildHeaders(bodyObj) {
  const ts = Date.now();
  return {
    'Content-Type': 'application/json',
    'lb-timestamp': String(ts),
    'lb-sign': md5(md5(CFG.signKey + ts) + JSON.stringify(bodyObj)),
  };
}

function parseSilver(title) {
  if (!title) return null;
  let m = title.match(/([\d.]+)\s*万/);
  if (m) return parseFloat(m[1]) * 10000;
  m = title.match(/([\d.]+)\s*亿/);
  if (m) return parseFloat(m[1]) * 1e8;
  m = title.match(/([\d.]+)\s*银/);
  if (m) return parseFloat(m[1]);
  m = title.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function removeOutliers(prices) {
  // 按合理物理范围过滤，超出 priceMin~priceMax 视为异常挂单/解析错误
  return prices.filter(p => p >= CFG.priceMin && p <= CFG.priceMax);
}

// ======================== 采集单个区 ========================
// roundTs: 本轮统一时间戳（由 crawl 传入），保证同一轮 5 个区共享一个 ts，
// 避免串行采集跨分钟边界时被切到不同分钟桶。
async function crawlOne(serverName, serverId, roundTs) {
  const bodyObj = { ...CFG.baseBody, serverId };
  const bodyStr = JSON.stringify(bodyObj);
  const url = new URL(CFG.apiUrl);
  const headers = buildHeaders(bodyObj);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://search.7881.com', 'Referer': 'https://search.7881.com/',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code !== 0 || !result.body?.results) {
            console.error(`  [${serverName}] 接口异常: code=${result.code} msg=${result.msg || '?'}`);
            return resolve(null);
          }

          // 校验 serverName（首轮）
          if (CFG.verifyServerName) {
            const sn = result.body.serverName || result.serverName || '';
            if (sn && sn !== serverName) {
              console.error(`  [${serverName}] serverName 校验失败: 响应="${sn}" != 期望="${serverName}"`);
              return resolve(null);
            } else if (sn) {
              console.log(`  [${serverName}] serverName 校验通过`);
            }
          }

          // 解析价格
          const items = [];
          for (const g of result.body.results) {
            const silver = parseSilver(g.goodsTitle || g.title);
            const price = g.salePrice ?? g.price;
            if (!silver || !price) continue;
            items.push({ unitPrice: price / (silver / 10000), title: g.goodsTitle || '' });
          }
          if (!items.length) { console.error(`  [${serverName}] 无有效商品`); return resolve(null); }

          // 去异常挂单 + 取前N
          const all = items.map(i => i.unitPrice);
          const inRange = removeOutliers(all);
          const outliers = all.length - inRange.length;
          const valid = inRange.slice(0, CFG.sampleSize);
          // 加权平均：前三条权重大
          const wSum = CFG.weights.reduce((a, b) => a + b, 0);
          let wAcc = 0;
          for (let k = 0; k < valid.length; k++) {
            wAcc += valid[k] * CFG.weights[k];
          }
          const avg = wAcc / wSum;
          const high = Math.max(...valid);
          const low = Math.min(...valid);

          console.log(`  [${serverName}] 均价 ${avg.toFixed(4)} | ${low.toFixed(4)}~${high.toFixed(4)} | 共${all.length} 挂单 / 范围内${inRange.length} / 异常${outliers} / 取前${valid.length}`);
          resolve({ ts: roundTs, avg, high, low, open: valid[0], close: valid[valid.length - 1], sampleCount: valid.length });
        } catch (e) {
          console.error(`  [${serverName}] 解析失败: ${e.message}`);
          resolve(null);
        }
      });
    });
    req.on('error', (e) => { console.error(`  [${serverName}] 请求失败: ${e.message}`); resolve(null); });
    req.write(bodyStr);
    req.end();
  });
}

// ======================== 内存态（轻量汇总） ========================
// 启动时把 data/ 下所有按天归档聚合成 STATE，之后每轮只做增量追加、每轮结束落盘一次。
// 旧实现每轮把 40MB+ 的 history.json 全量重读+重写 8 次，NAS 磁盘/CPU 被拖满，
// 还导致大文件推送永远轮不到 —— 已彻底移除 history.json。
const STATE = {
  lastUpdate: '',      // 最近一条采样的 ISO UTC 时间
  totalSamples: 0,
  dates: [],           // 所有区出现过的日期并集（升序，北京时间 YYYY-MM-DD）
  servers: {},         // 区名 => { serverId, dayMap, days, daily, latest, today }
};

function emptyServerState(serverId) {
  return {
    serverId,
    dayMap: new Map(),   // 'YYYY-MM-DD' => { n, sumAvg, o, c, h, l }
    days: [],            // 有数据的日期（升序），与 daily 对齐
    daily: [],           // [{ avg, o, c, h, l, n }]
    latest: null,        // { ts, avg, date } 最近一条采样
    today: { date: '', samples: [] },  // 最近一天的分时（前端默认视图直接用）
  };
}

function accDay(st, date, s) {
  let a = st.dayMap.get(date);
  if (!a) {
    a = { n: 0, sumAvg: 0, o: s.avg, c: s.avg, h: s.high ?? s.avg, l: s.low ?? s.avg };
    st.dayMap.set(date, a);
  }
  a.n += 1;
  a.sumAvg += s.avg;
  a.c = s.avg;
  if (s.high != null && s.high > a.h) a.h = s.high;
  if (s.low != null && s.low < a.l) a.l = s.low;
}

function dayEntry(a) {
  return { avg: r6(a.sumAvg / a.n), o: r6(a.o), c: r6(a.c), h: r6(a.h), l: r6(a.l), n: a.n };
}

function refreshDaily(st) {
  st.days = [...st.dayMap.keys()].sort();
  st.daily = st.days.map(d => dayEntry(st.dayMap.get(d)));
}

// 最近一天的分时回填（只保留一天，内存与体积都可控）
function fillTodaySamples(date) {
  const p = dayFilePath(date);
  if (!fs.existsSync(p)) return;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return; }
  for (const [sname, sobj] of Object.entries(raw.servers || {})) {
    const st = STATE.servers[sname];
    if (!st) continue;
    const samples = (sobj.samples || [])
      .filter(s => typeof s.avg === 'number' && s.ts)
      .sort((a, b) => a.ts - b.ts)
      .map(s => ({ ts: s.ts, avg: r6(s.avg), high: r6(s.high), low: r6(s.low), open: r6(s.open), close: r6(s.close) }));
    if (samples.length) st.today = { date, samples };
  }
}

// 启动时全量加载：读 data/ 下所有按天归档，聚合为轻量 STATE（只在进程启动时调用一次）。
function loadHistoryFromDisk() {
  STATE.lastUpdate = '';
  STATE.totalSamples = 0;
  STATE.dates = [];
  STATE.servers = {};
  for (const [name, id] of Object.entries(SERVERS)) STATE.servers[name] = emptyServerState(id);

  const files = fs.existsSync(DATA_DIR)
    ? fs.readdirSync(DATA_DIR).filter(f => /^silver-price-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    : [];

  let total = 0, latestTs = 0, latestIso = '', lastDate = '';
  for (const f of files) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); }
    catch (e) { console.warn(`[history] 跳过损坏归档 ${f}: ${e.message}`); continue; }
    const fileDate = raw.date || f.slice('silver-price-'.length, 'silver-price-'.length + 10);
    let hasData = false;
    for (const [sname, sobj] of Object.entries(raw.servers || {})) {
      const st = STATE.servers[sname];
      if (!st) continue;                                  // 已合区/未知区：忽略
      for (const s of (sobj.samples || [])) {
        if (typeof s.avg !== 'number' || !isFinite(s.avg) || !s.ts) continue;
        // 按采样自身时间戳归档（旧版本跨零点轮次可能按写入时钟落进相邻文件）
        const date = bjDate(s.ts);
        accDay(st, date, s);
        total++;
        hasData = true;
        if (s.ts > latestTs) { latestTs = s.ts; latestIso = s.timestamp || new Date(s.ts).toISOString(); }
        if (!st.latest || s.ts >= st.latest.ts) st.latest = { ts: s.ts, avg: r6(s.avg), date };
        if (date > lastDate) lastDate = date;
      }
    }
  }

  for (const st of Object.values(STATE.servers)) refreshDaily(st);
  const dateSet = new Set();
  for (const st of Object.values(STATE.servers)) for (const d of st.days) dateSet.add(d);
  STATE.dates = [...dateSet].sort();
  STATE.totalSamples = total;
  STATE.lastUpdate = latestIso;
  if (lastDate) fillTodaySamples(lastDate);

  console.log(`[history] 已加载 ${total} 条采样 / ${Object.keys(STATE.servers).length} 区 / ${STATE.dates.length} 天`
    + `（${STATE.dates[0] || '-'} ~ ${STATE.dates[STATE.dates.length - 1] || '-'}）`);
}

// 增量追加一条采样到内存态（同时维护当日聚合 + 最近一天分时）
function appendSample(serverName, rec) {
  const st = STATE.servers[serverName];
  if (!st) return;
  const date = bjDate(rec.ts);
  accDay(st, date, rec);

  const idx = st.days.indexOf(date);
  if (idx === -1) {
    st.days.push(date);
    st.daily.push(dayEntry(st.dayMap.get(date)));
    if (st.days.length > 1 && st.days[st.days.length - 2] > date) refreshDaily(st); // 理论不会发生，兜底排序
  } else {
    st.daily[idx] = dayEntry(st.dayMap.get(date));
  }

  st.latest = { ts: rec.ts, avg: r6(rec.avg), date };
  if (st.today.date !== date) st.today = { date, samples: [] };
  st.today.samples.push({
    ts: rec.ts, avg: r6(rec.avg), high: r6(rec.high), low: r6(rec.low), open: r6(rec.open), close: r6(rec.close),
  });

  if (!STATE.dates.length || STATE.dates[STATE.dates.length - 1] < date) STATE.dates.push(date);
  STATE.totalSamples++;
  STATE.lastUpdate = new Date(rec.ts).toISOString();
}

// 生成轻量汇总对象（data.js 内容）
function buildSummary() {
  const servers = {};
  for (const [name, st] of Object.entries(STATE.servers)) {
    servers[name] = {
      serverId: st.serverId,
      days: st.days,
      daily: st.daily,
      latest: st.latest,
      today: st.today && st.today.date ? { date: st.today.date, samples: st.today.samples } : { date: '', samples: [] },
    };
  }
  return {
    version: 2,
    lastUpdate: STATE.lastUpdate,
    totalSamples: STATE.totalSamples,
    dates: STATE.dates,
    servers,
  };
}

// 写入 data.js（每轮只写一次；旧实现每条采样写一次 30MB，磁盘写入量放大 16 倍）
function flushDataJs() {
  const summary = buildSummary();
  fs.writeFileSync(DATA_JS_FILE, 'window.__HISTORY__ = ' + JSON.stringify(summary) + ';');
  dataJsDirty = true;
  return summary;
}

// ======================== 按天归档 ========================
// 当天归档在内存里维护（启动/换天时读一次），每轮结束一次性紧凑写盘；
// 旧实现每条采样都 读+解析+美化重写 整个 400KB 文件，8 条采样 = 8 次全量重写。
let dayCache = null;
const pendingDayFiles = new Set();   // 已写入本地、待推送的日期
let dataJsDirty = false;             // data.js 是否有变化待推送

function ensureDayCache(date) {
  if (dayCache && dayCache.date === date) return dayCache;
  if (dayCache) flushDayFile();       // 跨天：先把上一天写完
  const p = dayFilePath(date);
  let data = { date, servers: {} };
  if (fs.existsSync(p)) {
    try { data = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { console.warn(`[data] 当天归档解析失败，重建: ${e.message}`); }
  }
  if (!data.servers) data.servers = {};
  data.date = date;
  dayCache = { date, path: p, data };
  return dayCache;
}

function appendToDayFile(serverName, serverId, rec) {
  const date = bjDate(rec.ts);
  const dc = ensureDayCache(date);
  let sv = dc.data.servers[serverName];
  if (!sv) sv = dc.data.servers[serverName] = { serverId, samples: [] };
  sv.serverId = serverId;
  sv.samples.push({
    ts: rec.ts,
    avg: r6(rec.avg), high: r6(rec.high), low: r6(rec.low), open: r6(rec.open), close: r6(rec.close),
    sampleCount: rec.sampleCount,
    timestamp: new Date(rec.ts).toISOString(),
  });
}

function flushDayFile() {
  if (!dayCache) return;
  fs.writeFileSync(dayCache.path, JSON.stringify(dayCache.data));   // 紧凑 JSON，满日约 200KB
  pendingDayFiles.add(dayCache.date);
}

// ======================== 采集一轮（5 区串行） ========================
async function crawl() {
  const t = now();
  const entries = Object.entries(SERVERS);
  // 本轮统一时间戳：所有区都用这个 ts，保证同一轮数据落在同一个分钟桶
  const roundTs = Date.now();
  console.log(`[${t.toLocaleString('zh-CN')}] 采集开始 (${entries.length}区)`);

  let okCount = 0;
  const got = [];
  for (let i = 0; i < entries.length; i++) {
    const [serverName, serverId] = entries[i];
    let rec = await crawlOne(serverName, serverId, roundTs);
    // 首次失败则重试 1 次（7881 偶发抽风，补一次能显著降低空洞率）
    if (!rec) {
      await sleep(1000);
      console.log(`  [${serverName}] 重试中...`);
      rec = await crawlOne(serverName, serverId, roundTs);
    }
    if (rec) got.push([serverName, serverId, rec]);
    else console.error(`  [${serverName}] 本轮采集失败`);
    if (i < entries.length - 1) await sleep(CFG.SERVER_GAP);
  }

  // 首轮校验通过后关闭，避免日志刷屏
  CFG.verifyServerName = false;

  // 落盘：当天归档 + data.js 各写一次（无成功数据则不写）
  if (got.length) {
    for (const [serverName, serverId, rec] of got) {
      appendToDayFile(serverName, serverId, rec);
      appendSample(serverName, rec);
    }
    flushDayFile();
    const summary = flushDataJs();
    const jsKB = (fs.statSync(DATA_JS_FILE).size / 1024).toFixed(0);
    const dayKB = (fs.statSync(dayFilePath(dayCache.date)).size / 1024).toFixed(0);
    console.log(`[data] 已更新 data.js (${jsKB} KB) + 当天归档 (${dayKB} KB) · 累计 ${summary.totalSamples} 条采样`);
  }

  const rate = ((got.length / entries.length) * 100).toFixed(0);
  console.log(`[${now().toLocaleString('zh-CN')}] 采集结束 成功${got.length}/${entries.length} (${rate}%)\n`);

  // NAS 模式：采集后自动 push 数据
  if (process.env.AUTO_PUSH === '1') await gitPush();

  // 一轮采集+推送完整跑完，刷新看门狗心跳（即使本轮部分区失败也算存活）
  lastCrawlOkTime = Date.now();
}

// ======================== GitHub API 推送 ========================
// 早期版本用 git push，但容器内访问 github.com 极不稳定（git 子进程会卡死堆积）。
// 改用 GitHub Contents REST API 直接上传文件：每个文件一次 HTTPS 请求，
// 要么成功要么快速失败，不会产生卡死的子进程。
//
// 2026-10 重构：每轮只推 2 个小文件（data.js ~170KB + data/当天.json 最满 ~200KB），
// 不再推几十 MB 的历史全量。旧方案的大文件 PUT 在家庭上行 + 超时约束下几乎必然失败，
// 只推小文件后上传量与耗时都降了两个数量级。
const GH_OWNER = 'kirarikaryuu';
const GH_REPO = 'zxsj-silver-price';
const GH_BRANCH = 'main';

// sha 内存缓存：{ repoPath: sha }。上传成功后存入，下次更新直接用，省掉 GET 查询。
const shaCache = new Map();

// 读取本地文件 → base64
function fileB64(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}

// 单次 HTTPS 请求（带超时，避免卡死）
function ghRequest(method, apiPath, bodyObj) {
  return new Promise((resolve) => {
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GH_OWNER}/${GH_REPO}/contents/${apiPath}`,
      method,
      headers: {
        'Authorization': `Bearer ${process.env.GIT_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'nas-silver-crawler',
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 带重试的 GET：429(限流)/5xx(服务端) 时退避重试，最多 2 次
async function ghGetWithRetry(apiPath) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await ghRequest('GET', apiPath, null);
    if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
      if (attempt < 2) {
        const wait = 2000 * (attempt + 1);  // 2s, 4s
        console.warn(`  [gh] GET ${apiPath} ${r.status}，${wait}ms 后重试 (${attempt + 1}/2)`);
        await sleep(wait);
        continue;
      }
    }
    return r;
  }
}

// 上传单个文件到 GitHub
// 优先用内存里的 sha；没有则 GET 查一次（并缓存）；新文件不传 sha
async function uploadFile(repoPath, localPath, commitMsg) {
  if (!fs.existsSync(localPath)) return { status: 'skip', path: repoPath };
  const content = fileB64(localPath);

  // 1. 拿 sha（优先内存缓存）
  let sha = shaCache.get(repoPath) || null;
  if (!sha) {
    const exist = await ghGetWithRetry(`${repoPath}?ref=${GH_BRANCH}`);
    if (exist && exist.status === 200 && exist.json && exist.json.sha) {
      sha = exist.json.sha;
      shaCache.set(repoPath, sha);
    }
  }

  // 2. 上传/更新（带重试：429/5xx 退避）
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await ghRequest('PUT', repoPath, {
      message: commitMsg,
      content,
      branch: GH_BRANCH,
      ...(sha ? { sha } : {}),
    });
    // 成功：缓存新 sha
    if (resp.status === 200 || resp.status === 201) {
      if (resp.json && resp.json.content && resp.json.content.sha) {
        shaCache.set(repoPath, resp.json.content.sha);
      }
      return { status: resp.status, path: repoPath };
    }
    // 限流/服务端错误：退避重试
    if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
      if (attempt < 2) {
        const wait = 2000 * (attempt + 1);
        console.warn(`  [gh] PUT ${repoPath} ${resp.status}，${wait}ms 后重试 (${attempt + 1}/2)`);
        await sleep(wait);
        continue;
      }
    }
    // sha 过期(409/422)：清缓存，下次重新查
    if (resp.status === 409 || resp.status === 422) {
      shaCache.delete(repoPath);
    }
    return { status: resp.status, path: repoPath, msg: resp.json?.message || resp.error || '' };
  }
  return { status: 'retry-exhausted', path: repoPath };
}

// 一次性清理：把远端历史遗留的 42MB history.json 替换成废弃提示小文件。
// 旧版本每轮整包上传它，早已不可能成功；保留它只会让 Pages 站点体积白占 40MB。
// 成功（或确认无需处理）后本进程不再重试；失败则下一轮再试。
let remoteHistoryDeprecated = false;
async function deprecateRemoteHistory() {
  if (remoteHistoryDeprecated || !process.env.GIT_TOKEN) return;
  const r = await ghGetWithRetry(`history.json?ref=${GH_BRANCH}`);
  if (r.status === 404) { remoteHistoryDeprecated = true; return; }   // 已经没了
  if (r.status !== 200 || !r.json) { return; }                        // 下一轮再试
  const size = r.json.size || 0;
  if (size < 1024) { remoteHistoryDeprecated = true; return; }        // 已经是废弃提示
  const stub = JSON.stringify({
    deprecated: true,
    message: 'history.json 已废弃：数据见 data.js（轻量汇总，v2）与 data/silver-price-YYYY-MM-DD.json（按天归档）',
    replacedAt: new Date().toISOString(),
  });
  const put = await ghRequest('PUT', 'history.json', {
    message: 'chore: 废弃 history.json（改为轻量 data.js + 按天归档）',
    content: Buffer.from(stub).toString('base64'),
    branch: GH_BRANCH,
    ...(r.json.sha ? { sha: r.json.sha } : {}),
  });
  if (put.status === 200 || put.status === 201) {
    remoteHistoryDeprecated = true;
    console.log(`  [gh] 已把远端 history.json（${(size / 1048576).toFixed(1)} MB）替换为废弃提示`);
  } else {
    console.warn(`  [gh] 替换远端 history.json 失败 status=${put.status}（下轮重试）`);
  }
}

// 推送数据文件：data.js + 当天（或跨天时多个）按天归档
async function gitPush() {
  if (!process.env.GIT_TOKEN) {
    console.warn('[gitPush] 未设置 GIT_TOKEN，跳过推送');
    return;
  }
  if (!dataJsDirty && pendingDayFiles.size === 0) {
    console.log('[push] 本轮无新数据，跳过推送');
    return;
  }
  const commitMsg = `data: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`;

  // 先做一次性清理（远端旧 history.json）
  await deprecateRemoteHistory();

  let ok = 0, fail = 0;
  if (dataJsDirty) {
    const r = await uploadFile('data.js', DATA_JS_FILE, commitMsg);
    if (r.status === 200 || r.status === 201) { ok++; dataJsDirty = false; }
    else { fail++; console.warn(`  [push] data.js 失败 status=${r.status} ${r.msg || ''}`); }
  }
  for (const date of [...pendingDayFiles]) {
    const repoPath = `data/silver-price-${date}.json`;
    const r = await uploadFile(repoPath, dayFilePath(date), commitMsg);
    if (r.status === 200 || r.status === 201) { ok++; pendingDayFiles.delete(date); }
    else { fail++; console.warn(`  [push] ${repoPath} 失败 status=${r.status} ${r.msg || ''}`); }
  }

  if (fail === 0) {
    console.log(`[${new Date().toLocaleString('zh-CN')}] 数据已推送到 GitHub (${ok} 文件)`);
  } else {
    console.warn(`[${new Date().toLocaleString('zh-CN')}] 推送完成: 成功 ${ok} / 失败 ${fail}（下轮重试）`);
  }
}

// ======================== Web 服务器 ========================
// 通过 WEB_SERVER 环境变量控制是否启动。
// 默认：AUTO_PUSH=1（NAS 模式）时不启动 Web（纯采集器，省资源、避免端口冲突）。
// 显式 WEB_SERVER=1 强制启动；本地开发(无 AUTO_PUSH)默认启动。
const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
};

function startWebServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(__dirname, p);
    if (!fp.startsWith(__dirname) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404); res.end('404'); return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',   // 本地预览不要缓存，改了立刻看到
    });
    fs.createReadStream(fp).pipe(res);
  });

  let port = CFG.PORT;
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      port++;
      console.log(`端口 ${port - 1} 被占用，尝试 ${port}...`);
      server.listen(port);
    }
  });
  server.listen(port, () => {
    console.log(`\n图表页面: http://localhost:${port}/\n按 Ctrl+C 停止\n`);
  });
}

// ======================== 启动 ========================
// 心跳看门狗：每分钟检查一次，若距上次成功采集超过阈值则判定卡死，主动退出。
// 配合 docker restart:always 实现自愈重启。仅常驻采集模式启用。
function startWatchdog() {
  setInterval(() => {
    const idle = Date.now() - lastCrawlOkTime;
    if (idle > WATCHDOG_THRESHOLD) {
      console.error(`[watchdog] 已 ${Math.round(idle / 60000)} 分钟无成功采集，判定卡死，退出以触发 docker 重启`);
      process.exit(1);
    }
  }, 60 * 1000).unref();   // unref：不阻止进程正常退出
  console.log(`[watchdog] 已启用：${WATCHDOG_THRESHOLD / 60000} 分钟无采集将自动重启`);
}

async function start() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('=== 7881 银价监控服务（5区）===');

  // 是否启动 Web 服务
  // - WEB_SERVER=1 → 强制启动
  // - AUTO_PUSH=1 且未显式设 WEB_SERVER → 不启动（NAS 纯采集模式）
  // - 其它（本地开发）→ 启动
  const autoPush = process.env.AUTO_PUSH === '1';
  const webExplicit = process.env.WEB_SERVER !== undefined;  // 显式设过
  const enableWeb = webExplicit ? (process.env.WEB_SERVER === '1') : !autoPush;

  // 是否采集。默认开启（保持现状，Docker/NAS 无需任何改动）。
  // CRAWL=0 → 关闭采集与定时器，只读现有 data/ 重建 data.js 并起 Web 预览。
  const enableCrawl = process.env.CRAWL !== '0';

  // 启动时聚合历史 + 生成 data.js（Pages 与本地预览共用；CRAWL=0 也会重建，便于改前端）
  loadHistoryFromDisk();
  flushDataJs();
  dataJsDirty = false;   // 启动重建不算“新采集数据”，避免本地预览模式误推
  console.log(`[data] data.js 已生成（${(fs.statSync(DATA_JS_FILE).size / 1024).toFixed(0)} KB，`
    + `${Object.keys(STATE.servers).length} 区 / ${STATE.dates.length} 天）`);

  if (enableCrawl) {
    await crawl();
    if (process.env.CI_MODE === '1') {
      console.log('CI 模式，采集完成，退出。');
      return;
    }
    setInterval(() => crawl(), CFG.INTERVAL * 60 * 1000);
    console.log(`定时采集: 每 ${CFG.INTERVAL} 分钟一次`);
    startWatchdog();
  } else {
    console.log('采集已关闭（CRAWL=0）：只读现有 data/ 生成 data.js 预览，不请求接口、不改归档');
  }

  if (enableWeb) {
    startWebServer();
  } else {
    console.log('Web 服务未启动（NAS 纯采集模式，通过 GitHub Pages 查看数据）');
    console.log('如需启用 Web，设置环境变量 WEB_SERVER=1\n');
  }
}

if (require.main === module) {
  start();
} else {
  module.exports = {
    SERVERS, CFG, STATE, pendingDayFiles,
    loadHistoryFromDisk, buildSummary, flushDataJs,
    uploadFile, deprecateRemoteHistory, gitPush,
    start,
  };
}
