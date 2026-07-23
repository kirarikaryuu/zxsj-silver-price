/**
 * 7881 银价监控 - 一体化服务（8区按区分组）
 * 一个命令搞定: 抓数据 + 存历史 + Web图表 + 定时采集
 *
 * 用法: node app.js
 * 打开: http://localhost:8090
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ======================== 配置 ========================
// 8 个区映射（中文区名 => serverId）
const SERVERS = {
  '风华绝代': 'G5722P001001',
  '浮生若梦': 'G5722P001002',
  '一剑诛仙': 'G5722P001007',
  '明月天涯': 'G5722P001009',
  '唯我独尊': 'G5722P001012',
  '世外桃源': 'G5722P001014',
  '星河入梦': 'G5722P001017',
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
const HISTORY_FILE = path.join(__dirname, 'history.json');
const DAY_FILE = () => path.join(DATA_DIR, `silver-price-${new Date().toISOString().slice(0, 10)}.json`);

// ======================== 工具 ========================
function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }
function now() { return new Date(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
async function crawlOne(serverName, serverId) {
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

          // 校验 serverName（首次）
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
          resolve({ ts: Date.now(), avg, high, low, open: valid[0], close: valid[valid.length - 1], sampleCount: valid.length });
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

// ======================== 采集一轮（8区串行） ========================
async function crawl() {
  const t = now();
  console.log(`[${t.toLocaleString('zh-CN')}] 采集开始 (${Object.keys(SERVERS).length}区)`);

  const entries = Object.entries(SERVERS);
  for (let i = 0; i < entries.length; i++) {
    const [serverName, serverId] = entries[i];
    const rec = await crawlOne(serverName, serverId);
    if (rec) saveRecord(serverName, serverId, rec);
    if (i < entries.length - 1) await sleep(CFG.SERVER_GAP);
  }

  // 首轮校验通过后关闭，避免日志刷屏
  CFG.verifyServerName = false;

  console.log(`[${now().toLocaleString('zh-CN')}] 采集结束\n`);

  // NAS 模式：采集后自动 push 数据
  if (process.env.AUTO_PUSH === '1') await gitPush();
}

// ======================== GitHub API 推送 ========================
// 早期版本用 git push，但容器内访问 github.com 极不稳定（git 子进程会卡死堆积）。
// 改用 GitHub Contents REST API 直接上传文件：每个文件一次 HTTPS 请求，
// 要么成功要么快速失败，不会产生卡死的子进程。
const GH_OWNER = 'kirarikaryuu';
const GH_REPO = 'zxsj-silver-price';
const GH_BRANCH = 'main';

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
      timeout: 20000,  // 20 秒超时
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

// 上传单个文件到 GitHub（自动获取已有文件的 sha 用于更新，新文件则创建）
async function uploadFile(repoPath, localPath, commitMsg) {
  if (!fs.existsSync(localPath)) return { status: 'skip', path: repoPath };
  const content = fileB64(localPath);

  // 1. 查询文件是否已存在（拿 sha 用于更新；404 表示新文件）
  const exist = await ghRequest('GET', `${repoPath}?ref=${GH_BRANCH}`, null);
  let sha = null;
  if (exist.status === 200 && exist.json && exist.json.sha) sha = exist.json.sha;

  // 2. 上传/更新
  const resp = await ghRequest('PUT', repoPath, {
    message: commitMsg,
    content,
    branch: GH_BRANCH,
    ...(sha ? { sha } : {}),
  });
  return { status: resp.status, path: repoPath, sha: !!sha };
}

// 收集 data/ 下所有按天 json 文件
function listDataFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
}

// 推送所有数据文件（history.json + data.js + data/*.json）
async function gitPush() {
  if (!process.env.GIT_TOKEN) {
    console.warn('[gitPush] 未设置 GIT_TOKEN，跳过推送');
    return;
  }
  const commitMsg = `data: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`;
  const tasks = [
    ['history.json', HISTORY_FILE],
    ['data.js', path.join(__dirname, 'data.js')],
    ...listDataFiles().map(f => [`data/${f}`, path.join(DATA_DIR, f)]),
  ];

  let ok = 0, fail = 0;
  for (const [repoPath, localPath] of tasks) {
    const r = await uploadFile(repoPath, localPath, commitMsg);
    if (r.status === 200 || r.status === 201) ok++;
    else if (r.status === 'skip') { /* 本地不存在，跳过 */ }
    else {
      fail++;
      console.warn(`  [push] ${repoPath} 失败 status=${r.status} ${r.json?.message || r.error || ''}`);
    }
  }
  if (fail === 0) {
    console.log(`[${new Date().toLocaleString('zh-CN')}] 数据已推送到 GitHub (${ok} 文件)\n`);
  } else {
    console.warn(`[${new Date().toLocaleString('zh-CN')}] 推送完成: 成功 ${ok} / 失败 ${fail}\n`);
  }
}

function saveRecord(serverName, serverId, rec) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // 按天存（按区分组）
  const dayPath = DAY_FILE();
  let day = { date: new Date().toISOString().slice(0, 10), servers: {} };
  if (fs.existsSync(dayPath)) day = JSON.parse(fs.readFileSync(dayPath, 'utf-8'));
  if (!day.servers) day.servers = {};
  if (!day.servers[serverName]) day.servers[serverName] = { serverId, samples: [] };
  day.servers[serverName].samples.push({
    ...rec, timestamp: new Date(rec.ts).toISOString(),
  });
  fs.writeFileSync(dayPath, JSON.stringify(day, null, 2));

  // 合并到 history.json
  mergeHistory();
}

function mergeHistory() {
  const files = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort() : [];
  const servers = {};
  let total = 0;

  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
    for (const [sname, sobj] of Object.entries(raw.servers || {})) {
      if (!servers[sname]) servers[sname] = { serverId: sobj.serverId, totalSamples: 0, data: [] };
      for (const s of (sobj.samples || [])) {
        servers[sname].data.push({
          ts: s.ts,
          time: new Date(s.ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
          date: new Date(s.ts).toISOString().slice(0, 10),
          avg: s.avg, open: s.open, close: s.close, high: s.high, low: s.low,
          sampleCount: s.sampleCount,
        });
        servers[sname].totalSamples++;
        total++;
      }
    }
  }
  // 每区按时间排序
  for (const s of Object.values(servers)) s.data.sort((a, b) => a.ts - b.ts);

  const history = {
    lastUpdate: new Date().toISOString(), totalSamples: total, servers,
  };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  // 生成 data.js，供 file:// 协议直接加载
  fs.writeFileSync(path.join(__dirname, 'data.js'), 'window.__HISTORY__ = ' + JSON.stringify(history) + ';');
}

// ======================== Web 服务器 ========================
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'application/javascript', '.json': 'application/json;charset=utf-8', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const fp = path.join(__dirname, p);
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

// ======================== 启动 ========================
async function start() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('=== 7881 银价监控服务（8区）===');

  await crawl();

  if (process.env.CI_MODE === '1') {
    console.log('CI 模式，采集完成，退出。');
    return;
  }

  setInterval(() => crawl(), CFG.INTERVAL * 60 * 1000);
  console.log(`定时采集: 每 ${CFG.INTERVAL} 分钟一次`);

  let port = CFG.PORT;
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      port++;
      console.log(`端口 ${port - 1} 被占用，尝试 ${port}...`);
      server.listen(port);
    }
  });
  server.listen(port, () => {
    console.log(`\n图表页面: http://localhost:${port}/`);
    console.log(`按 Ctrl+C 停止\n`);
  });
}

start();
