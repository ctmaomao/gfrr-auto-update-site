// build-bubble-watch.mjs — AI 泡沫监测(The Bubble Watch)周度数据管线
//
// 23 项指标 × 6 分类:12 项自动实时接入(FRED / Yahoo Chart / SEC EDGAR /
// multpl / slickcharts / stockanalysis / OpenInsider),11 项编辑/研究类指标
// 读 config/bubble-watch-curated.json 人工口径。所有自动指标 fail-closed:
// 抓取失败沿用 curated 快照并按 maxAgeDays 标 STALE,绝不造数。
//
// 打分逻辑(复刻原 The Bubble Watch 页):
//   red_pct = 红灯数 / 23;weighted = (红×1.0 + 黄×0.5) / 23
//   分档:<25% 观察期 / 25-40% 中度警戒 / 40-60% 高风险预警 / ≥60% 系统性顶部
//   分类强制升级:≥2 个分类红灯占比 ≥50% → 判读至少上调到「高风险预警」
//
// 输出:data/bubble-watch.json(latest)+ data/bubble-watch-history.json(周度滚动)
// 边界:display-only 独立专题页数据,不进 GFRR scoring/decision/execution/position。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'bubble-watch-curated.json');
const OUT_PATH = path.join(ROOT, 'data', 'bubble-watch.json');
const HISTORY_PATH = path.join(ROOT, 'data', 'bubble-watch-history.json');

const UA = 'gfrr-bubble-watch/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';
// SEC EDGAR 要求 UA 携带联系方式(无邮箱式 UA 会 403)
const EDGAR_UA = 'gfrr-auto-update-site bubble-watch ctmaomao@users.noreply.github.com';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
const FRED_API_KEY = (process.env.FRED_API_KEY || '').trim();

const STATUS_RANK = { green: 0, yellow: 1, red: 2 };
const STATUS_ZH = { green: '绿', yellow: '黄', red: '红' };
const TIER_LABEL_ZH = { observation: '观察期', caution: '中度警戒', alert: '高风险预警', top: '系统性顶部' };
const TIER_LABEL_EN = { observation: 'Observation', caution: 'Moderate Caution', alert: 'High Risk Alert', top: 'Systemic Top' };

const CATEGORY_ORDER = [
  { key: 'valuation', zh: '估值', en: 'VALUATION' },
  { key: 'capital', zh: '资金面', en: 'CAPITAL' },
  { key: 'market_structure', zh: '市场结构', en: 'MARKET STRUCTURE' },
  { key: 'credit', zh: '信用', en: 'CREDIT' },
  { key: 'fundamentals', zh: '基本面', en: 'FUNDAMENTALS' },
  { key: 'macro', zh: '宏观', en: 'MACRO' }
];

// 23 项指标静态定义(名称/分类/阈值文案/来源文案 1:1 复刻原页)
const INDICATOR_DEFS = [
  { id: 'cape', category: 'valuation', name_en: 'Shiller CAPE', name_zh: 'CAPE 周期调整 PE', threshold_text: '>35 红 / 25-35 黄 / <25 绿', source_name: 'multpl.com / GuruFocus', mode: 'auto' },
  { id: 'top5_weight', category: 'valuation', name_en: 'S&P 500 Top-5 Weight', name_zh: '前 5 大权重占比', threshold_text: '>25% 红 / 18-25% 黄 / <18% 绿', source_name: 'SPY holdings (stockanalysis / slickcharts)', mode: 'auto' },
  { id: 'nvda_fpe', category: 'valuation', name_en: 'NVDA Forward P/E', name_zh: 'NVDA 远期 PE', threshold_text: '>40 红 / 30-40 黄 / <30 绿', source_name: 'GuruFocus / StockAnalysis', mode: 'auto' },
  { id: 'hyperscaler_capex_yoy', category: 'capital', name_en: 'Hyperscaler Capex YoY', name_zh: 'Hyperscaler 资本开支增速', threshold_text: '指引下调=红 / 加速=黄 / 稳健=绿', source_name: 'SEC EDGAR / stockanalysis 季报镜像', mode: 'auto' },
  { id: 'mag4_fcf_yoy', category: 'capital', name_en: 'Mag4 FCF YoY', name_zh: 'Mag4 自由现金流变化', threshold_text: '<-20% 红 / -20%~0 黄 / >0 绿', source_name: 'SEC EDGAR / stockanalysis 季报镜像', mode: 'auto' },
  { id: 'vc_ai_share', category: 'capital', name_en: 'AI / Total VC Funding', name_zh: 'AI 占 VC 投资比重', threshold_text: '>50% 红 / 30-50% 黄 / <30% 绿', source_name: 'Crunchbase / PitchBook(季度研究口径)', mode: 'curated' },
  { id: 'nvda_invest_revenue', category: 'capital', name_en: 'NVDA Customer Invest / Rev', name_zh: 'NVDA 客户投资/收入比', threshold_text: '>30% 红 / 15-30% 黄 / <15% 绿 (Lucent 99 峰值 24%)', source_name: '公开披露承诺 ÷ EDGAR/stockanalysis LTM 收入', mode: 'auto' },
  { id: 'breadth_50d', category: 'market_structure', name_en: '% Above 50-Day MA', name_zh: 'S&P 50 日均线上方比例', threshold_text: '<40% 红 / 40-60% 黄 / >60% 绿', source_name: 'Yahoo Chart × Wikipedia 全成份股实算', mode: 'auto' },
  { id: 'spy_vs_rsp_6m', category: 'market_structure', name_en: 'SPY vs RSP 6M Spread', name_zh: '市值加权 vs 等权重', threshold_text: '>10% 红 / 5-10% 黄 / <5% 绿', source_name: 'Yahoo Chart(SPY/RSP 6 个月)', mode: 'auto' },
  { id: 'insider_sell_buy', category: 'market_structure', name_en: 'AI Insider Sell/Buy Ratio', name_zh: 'AI 龙头内部人卖买比', threshold_text: '>20x=红 / 5-20x=黄 / <5x=绿 (2000 峰值 23x)', source_name: 'OpenInsider / SEC Form 4', mode: 'auto' },
  { id: 'ai_ipo_pipeline', category: 'market_structure', name_en: 'AI IPO/SPAC Pipeline', name_zh: 'AI 一级市场发行', threshold_text: '洪流=红 / 升温=黄 / 平静=绿', source_name: '一级市场公开报道(编辑口径)', mode: 'curated' },
  { id: 'hy_oas', category: 'credit', name_en: 'HY OAS Spread', name_zh: '高收益债利差', threshold_text: '>500 红 / 350-500 黄 / <350 绿', source_name: 'ICE BofA HY Index (FRED)', mode: 'auto' },
  { id: 'dc_abs_spread', category: 'credit', name_en: 'Data Center ABS Spread', name_zh: '数据中心 ABS 利差', threshold_text: '走阔 50bps+ = 红 / 稳定 = 黄 / 收窄 = 绿', source_name: 'Green Street News / 公开发行定价(编辑口径)', mode: 'curated' },
  { id: 'neocloud_credit', category: 'credit', name_en: 'Neocloud Credit Events', name_zh: 'Neocloud 信用事件', threshold_text: '任何违约/降级=红', source_name: 'S&P Global Ratings / Morningstar(编辑口径)', mode: 'curated' },
  { id: 'token_volume_mom', category: 'fundamentals', name_en: 'Industry Token Volume MoM', name_zh: 'AI 行业 Token 月度环比', threshold_text: '收缩=红 / 减速=黄 / 加速=绿', source_name: 'OpenRouter 公开披露(研究口径)', mode: 'curated' },
  { id: 'token_revenue_ratio', category: 'fundamentals', name_en: 'Token Growth / Revenue Growth', name_zh: 'Token 增速 / 收入增速 比值', threshold_text: '>2x 红 / 1-2x 黄 / <1x 绿', source_name: '厂商公开披露 / OpenRouter(研究口径)', mode: 'curated' },
  { id: 'arr_2nd_deriv', category: 'fundamentals', name_en: 'AI ARR 2nd Derivative', name_zh: 'AI 收入增速的二阶导', threshold_text: '减速=红 / 平稳=黄 / 加速=绿', source_name: 'Sacra / 公开报道(研究口径)', mode: 'curated' },
  { id: 'enterprise_deploy', category: 'fundamentals', name_en: 'Enterprise Production Deploy', name_zh: '企业生产环境部署率', threshold_text: '<50%=红 / 50-65%=黄 / >65%=绿', source_name: 'McKinsey / Deloitte(季度调查口径)', mode: 'curated' },
  { id: 'cloud_rpo_growth', category: 'fundamentals', name_en: 'Cloud RPO Growth', name_zh: '云厂商递延收入增速', threshold_text: '负增长=红 / 减速=黄 / 加速=绿', source_name: 'SEC EDGAR RPO 披露', mode: 'auto' },
  { id: 'accounting_events', category: 'macro', name_en: 'Round-Tripping / Accounting', name_zh: '会计造假/round-tripping 事件', threshold_text: '任何=红 / 调查=黄 / 无=绿', source_name: 'SEC / 公开执法报道(编辑口径)', mode: 'curated' },
  { id: 'fed_policy', category: 'macro', name_en: 'Fed Policy Direction', name_zh: 'Fed 政策方向', threshold_text: '加息=红 / 通胀压力=黄 / 降息=绿', source_name: 'FRED DFF + CPI 推导', mode: 'auto' },
  { id: 'capex_reaction', category: 'macro', name_en: 'Capex Guidance Reaction', name_zh: '资本开支指引市场反应', threshold_text: '系统性惩罚=红 / 偶发=黄 / 奖励=绿', source_name: '财报市场反应(编辑口径)', mode: 'curated' },
  { id: 'ceo_hedging', category: 'macro', name_en: 'CEO Hedging Language', name_zh: 'CEO 表态对冲程度', threshold_text: '普遍承认过热=红 / 部分=黄 / 无=绿', source_name: '公开表态汇编(编辑口径)', mode: 'curated' }
];

const EDGAR_CIK = {
  AMZN: '0001018724',
  MSFT: '0000789019',
  GOOGL: '0001652044',
  META: '0001326801',
  NVDA: '0001045810',
  ORCL: '0001341439'
};

// ---------- 基础工具 ----------

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, ...(options.headers || {}) },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return options.asJson ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function retry(taskFn, label, attempts = 2) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await taskFn();
    } catch (error) {
      lastError = error;
      console.warn(`[bubble-watch] ${label} attempt ${i + 1}/${attempts} failed: ${error.message}`);
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  throw lastError;
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

function isoWeekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ftDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDay + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function fmtPct(n, digits = 1, signed = false) {
  const v = n.toFixed(digits);
  return `${signed && n > 0 ? '+' : ''}${v}%`;
}

// ---------- 数据源 fetchers ----------

async function fredObservations(seriesId, limit) {
  if (!FRED_API_KEY) throw new Error('FRED_API_KEY 未配置');
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: FRED_API_KEY,
    file_type: 'json',
    sort_order: 'desc',
    limit: String(limit)
  });
  const json = await fetchWithTimeout(`https://api.stlouisfed.org/fred/series/observations?${params}`, { asJson: true });
  const rows = (json.observations || [])
    .filter((o) => o.value !== '.' && Number.isFinite(Number(o.value)))
    .map((o) => ({ date: o.date, value: Number(o.value) }));
  if (!rows.length) throw new Error(`FRED ${seriesId} 无有效观测`);
  return rows; // 倒序:rows[0] 最新
}

async function yahooCloses(symbol, range = '6mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const json = await fetchWithTimeout(url, { asJson: true, headers: { 'User-Agent': BROWSER_UA } });
  const result = json?.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter((v) => Number.isFinite(v));
  if (closes.length < 10) throw new Error(`Yahoo ${symbol} closes 不足 (${closes.length})`);
  return closes;
}

async function edgarConcept(cik, tags) {
  let lastError = null;
  for (const tag of tags) {
    try {
      const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`;
      const json = await fetchWithTimeout(url, { asJson: true, headers: { 'User-Agent': EDGAR_UA, Accept: 'application/json' } });
      const units = json?.units?.USD;
      if (Array.isArray(units) && units.length) return units;
      lastError = new Error(`${tag} 无 USD units`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('EDGAR concept 全部 tag 失败');
}

// 现金流类(duration)概念:10-Q 报 YTD 累计,需差分出单季值
function deriveQuarterlySeries(units) {
  const byKey = new Map();
  for (const e of units) {
    if (!e.start || !e.end || !Number.isFinite(e.val)) continue;
    const k = `${e.start}|${e.end}`;
    const prev = byKey.get(k);
    if (!prev || String(e.filed || '') > String(prev.filed || '')) byKey.set(k, e);
  }
  const uniq = [...byKey.values()];
  const durDays = (a, b) => (new Date(b) - new Date(a)) / 86400000;
  const quarters = new Map();
  for (const e of uniq) {
    const d = durDays(e.start, e.end);
    if (d >= 75 && d <= 105) quarters.set(e.end, e.val);
  }
  const byStart = new Map();
  for (const e of uniq) {
    if (!byStart.has(e.start)) byStart.set(e.start, []);
    byStart.get(e.start).push(e);
  }
  for (const list of byStart.values()) {
    list.sort((a, b) => (a.end < b.end ? -1 : 1));
    for (let i = 1; i < list.length; i++) {
      const d = durDays(list[i - 1].end, list[i].end);
      if (d >= 75 && d <= 105 && !quarters.has(list[i].end)) {
        quarters.set(list[i].end, list[i].val - list[i - 1].val);
      }
    }
  }
  return [...quarters.entries()].map(([end, val]) => ({ end, val })).sort((a, b) => (a.end < b.end ? -1 : 1));
}

// 时点类(instant)概念,如 RPO
function deriveInstantSeries(units) {
  const byEnd = new Map();
  for (const e of units) {
    if (!e.end || !Number.isFinite(e.val)) continue;
    const prev = byEnd.get(e.end);
    if (!prev || String(e.filed || '') > String(prev.filed || '')) byEnd.set(e.end, e);
  }
  return [...byEnd.values()].map((e) => ({ end: e.end, val: e.val })).sort((a, b) => (a.end < b.end ? -1 : 1));
}

function trailing4qYoy(quarters) {
  if (quarters.length < 8) return null;
  const vals = quarters.slice(-8).map((q) => q.val);
  const now = vals.slice(4).reduce((a, b) => a + b, 0);
  const prev = vals.slice(0, 4).reduce((a, b) => a + b, 0);
  if (prev === 0) return null;
  return { now, prev, yoyPct: ((now - prev) / Math.abs(prev)) * 100, latestEnd: quarters[quarters.length - 1].end };
}

async function fetchMultplCape() {
  const html = await fetchWithTimeout('https://www.multpl.com/shiller-pe', { headers: { 'User-Agent': BROWSER_UA } });
  const text = stripTags(html);
  const m = text.match(/Current Shiller PE Ratio[^0-9]{0,40}([0-9]{1,3}\.[0-9]{1,2})/iu);
  if (!m) throw new Error('multpl CAPE 解析失败');
  const v = Number(m[1]);
  if (!(v > 5 && v < 100)) throw new Error(`multpl CAPE 值越界: ${v}`);
  return v;
}

// S&P 500 权重表:主源 stockanalysis SPY holdings,备源 slickcharts
function parseHoldingsRows(html, symbolRe) {
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gu;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const sym = row.match(symbolRe);
    if (!sym) continue;
    const w = row.match(/>([0-9]{1,2}\.[0-9]{1,3})\s*%</u);
    if (!w) continue;
    rows.push({ symbol: sym[1].toUpperCase(), weight: Number(w[1]) });
    if (rows.length >= 120) break;
  }
  return rows;
}

async function fetchSp500Holdings() {
  let rows = [];
  try {
    const html = await fetchWithTimeout('https://stockanalysis.com/etf/spy/holdings/', { headers: { 'User-Agent': BROWSER_UA } });
    rows = parseHoldingsRows(html, /href="\/stocks\/([a-z][a-z0-9.\-]{0,9})\/"/u);
  } catch (error) {
    console.warn(`[bubble-watch] stockanalysis SPY holdings 失败: ${error.message}`);
  }
  if (rows.length < 20) {
    const html = await fetchWithTimeout('https://www.slickcharts.com/sp500', { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' } });
    rows = parseHoldingsRows(html, /\/symbol\/([A-Z][A-Z0-9.\-]{0,9})/u);
  }
  if (rows.length < 20) throw new Error(`S&P 权重表解析行数不足 (${rows.length})`);
  const top5 = rows.slice(0, 5).reduce((a, r) => a + r.weight, 0);
  if (!(top5 > 10 && top5 < 60)) throw new Error(`top5 权重越界: ${top5}`);
  return rows;
}

// 全市场成份股名单(Wikipedia List of S&P 500 companies,~503 只)
async function fetchSp500Constituents() {
  const html = await fetchWithTimeout('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', { headers: { 'User-Agent': BROWSER_UA } });
  const seen = new Set();
  const patterns = [
    /nyse\.com\/quote\/[A-Z]{3,4}[.:]([A-Z][A-Z0-9.\-]{0,9})"/gu,
    /nasdaq\.com\/market-activity\/stocks\/([a-zA-Z][a-zA-Z0-9.\-]{0,9})"/gu
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) seen.add(m[1].toUpperCase());
  }
  if (seen.size < 400) throw new Error(`Wikipedia 成份股解析不足 (${seen.size})`);
  return [...seen];
}

// stockanalysis 季度报表镜像(SEC EDGAR 对数据中心 IP 封 403 时的二级源;
// 服务端渲染表格,~20 个季度,单位 $M,列序 新→旧)
const SA_FIN_CACHE = new Map();
async function fetchSaFinancialPage(ticker, statementPath) {
  const key = `${ticker}|${statementPath}`;
  if (SA_FIN_CACHE.has(key)) return SA_FIN_CACHE.get(key);
  const url = `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/financials/${statementPath}?p=quarterly`;
  const html = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } });
  SA_FIN_CACHE.set(key, html);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return html;
}

function parseSaQuarterlyRow(html, label) {
  // 遍历所有 `>label<` 文本节点候选(避免「Revenue」误中「Cost of Revenue」等
  // 复合标签;nav/图例里的同名节点因所在 <tr> 段解析不出 ≥8 个数而被跳过)
  const re = new RegExp(`>${label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}<`, 'gu');
  let m;
  while ((m = re.exec(html)) !== null) {
    const seg = html.slice(m.index, m.index + 9000);
    const end = seg.indexOf('</tr>');
    const text = (end > 0 ? seg.slice(0, end) : seg)
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/<[^>]+>/gu, '|');
    const nums = [...text.matchAll(/\|\s*(-?[0-9][0-9,]*)\s*(?=\|)/gu)].map((x) => Number(x[1].replace(/,/gu, '')));
    if (nums.length >= 8) return nums.map((v) => v * 1e6); // 新→旧,换算为 USD
  }
  throw new Error(`stockanalysis 行「${label}」未解析到 ≥8 个季度值`);
}

function saT4qYoy(numsNewestFirst) {
  const now = numsNewestFirst.slice(0, 4).reduce((a, b) => a + b, 0);
  const prev = numsNewestFirst.slice(4, 8).reduce((a, b) => a + b, 0);
  if (prev === 0) return null;
  return { now, prev, yoyPct: ((now - prev) / Math.abs(prev)) * 100 };
}

async function mapPool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor;
        cursor += 1;
        results[i] = await worker(items[i], i);
      }
    })
  );
  return results;
}

async function fetchNvdaForwardPe() {
  const html = await fetchWithTimeout('https://stockanalysis.com/stocks/nvda/statistics/', { headers: { 'User-Agent': BROWSER_UA } });
  const patterns = [
    /Forward\s*P\/?E[^0-9]{0,120}?([0-9]{1,3}\.[0-9]{1,2})/iu,
    /"forwardPE"[^0-9]{0,10}([0-9]{1,3}\.?[0-9]{0,2})/iu
  ];
  for (const re of patterns) {
    const m = stripTags(html).match(re) || html.match(re);
    if (m) {
      const v = Number(m[1]);
      if (v > 3 && v < 200) return v;
    }
  }
  throw new Error('stockanalysis NVDA forward PE 解析失败');
}

async function fetchOpenInsiderTotals(symbol) {
  const url = `http://openinsider.com/screener?s=${symbol}&fd=365&td=0&xp=1&xs=1&cnt=500`;
  const html = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } });
  let buy = 0;
  let sell = 0;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gu;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const type = row.match(/>\s*(P|S)\s*-\s*(?:Purchase|Sale)/u);
    if (!type) continue;
    const value = row.match(/[+-]?\$([0-9,]+)/gu);
    if (!value || !value.length) continue;
    const amount = Math.abs(Number(value[value.length - 1].replace(/[^0-9]/gu, '')));
    if (!Number.isFinite(amount)) continue;
    if (type[1] === 'P') buy += amount;
    else sell += amount;
  }
  if (buy === 0 && sell === 0) throw new Error(`OpenInsider ${symbol} 无交易行`);
  return { buy, sell };
}

// ---------- 各指标构建(auto) ----------

function classifyNumeric(value, redAbove, yellowAbove) {
  // 越高越红型:value > redAbove → red;> yellowAbove → yellow;否则 green
  if (value > redAbove) return 'red';
  if (value > yellowAbove) return 'yellow';
  return 'green';
}

const autoBuilders = {
  async cape() {
    const v = await retry(fetchMultplCape, 'multpl CAPE');
    const status = classifyNumeric(v, 35, 25);
    const distancePct = (((44.19 - v) / 44.19) * 100).toFixed(0);
    return {
      status,
      value_display: v.toFixed(1),
      note: `multpl.com 实时抓取 CAPE = ${v.toFixed(2)},距 2000 年互联网泡沫峰值 44.19 约 ${distancePct}%;earnings yield ≈ ${(100 / v).toFixed(1)}%。阈值:>35 红 / 25-35 黄 / <25 绿`,
      detail: { cape: v }
    };
  },
  async top5_weight(ctx) {
    const rows = await retry(fetchSp500Holdings, 'S&P 500 holdings');
    ctx.holdingsRows = rows;
    const top5 = rows.slice(0, 5);
    const sum = top5.reduce((a, r) => a + r.weight, 0);
    const status = classifyNumeric(sum, 25, 18);
    return {
      status,
      value_display: `≈${sum.toFixed(1)}%`,
      note: `SPY 持仓表实时抓取:前 5 大权重 ${top5.map((r) => r.symbol).join(' / ')} 合计 ≈${sum.toFixed(1)}%,贴近 2000 年集中度极值区;市值高度押注少数 AI 龙头。阈值:>25% 红 / 18-25% 黄 / <18% 绿`,
      detail: { top5: top5.map((r) => ({ symbol: r.symbol, weight: r.weight })), sum }
    };
  },
  async nvda_fpe() {
    const v = await retry(fetchNvdaForwardPe, 'stockanalysis NVDA fPE');
    const status = classifyNumeric(v, 40, 30);
    return {
      status,
      value_display: `≈${v.toFixed(0)}x`,
      note: `StockAnalysis 实时抓取 NVDA 远期 PE ≈ ${v.toFixed(1)}x;远期盈利持续上修使倍数处于历史区间低位,NVDA 自身估值并非当前泡沫的主要源头。阈值:>40 红 / 30-40 黄 / <30 绿`,
      detail: { forwardPe: v }
    };
  },
  async hyperscaler_capex_yoy() {
    const companies = ['AMZN', 'MSFT', 'GOOGL', 'META'];
    let perCompany = [];
    let sourceTag = 'SEC EDGAR';
    try {
      for (const ticker of companies) {
        const units = await edgarConcept(EDGAR_CIK[ticker], ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
        const yoy = trailing4qYoy(deriveQuarterlySeries(units));
        if (yoy) perCompany.push({ ticker, ...yoy });
      }
    } catch (error) {
      console.warn(`[bubble-watch] EDGAR capex 链失败,改走 stockanalysis 镜像: ${error.message}`);
      perCompany = [];
    }
    if (perCompany.length < 3) {
      sourceTag = 'stockanalysis 季报镜像';
      perCompany = [];
      for (const ticker of companies) {
        const html = await retry(() => fetchSaFinancialPage(ticker, 'cash-flow-statement/'), `SA cash-flow ${ticker}`);
        const capex = parseSaQuarterlyRow(html, 'Capital Expenditures').map((v) => Math.abs(v));
        const yoy = saT4qYoy(capex);
        if (yoy) perCompany.push({ ticker, ...yoy });
      }
    }
    if (perCompany.length < 3) throw new Error(`capex 可用公司不足 (${perCompany.length}/4)`);
    const now = perCompany.reduce((a, c) => a + c.now, 0);
    const prev = perCompany.reduce((a, c) => a + c.prev, 0);
    const yoyPct = ((now - prev) / Math.abs(prev)) * 100;
    const status = yoyPct < 0 ? 'red' : yoyPct >= 15 ? 'yellow' : 'green';
    return {
      status,
      value_display: fmtPct(yoyPct, 0, true),
      note: `${sourceTag}实拉 ${perCompany.map((c) => c.ticker).join('/')} 滚动 4 季 capex 合计 $${(now / 1e9).toFixed(0)}B,同比 ${fmtPct(yoyPct, 1, true)}(上年同期 $${(prev / 1e9).toFixed(0)}B);开支仍在${yoyPct >= 15 ? '加速扩张' : yoyPct >= 0 ? '稳健区间' : '收缩——指引下调风险落地'}。判级:实际收缩=红 / 同比 ≥15% 加速=黄 / 稳健=绿`,
      detail: { yoyPct, source: sourceTag, perCompany: perCompany.map((c) => ({ ticker: c.ticker, yoyPct: Number(c.yoyPct.toFixed(1)) })) }
    };
  },
  async mag4_fcf_yoy() {
    const companies = ['AMZN', 'MSFT', 'GOOGL', 'META'];
    let perCompany = [];
    let sourceTag = 'SEC EDGAR';
    try {
      for (const ticker of companies) {
        const ocfUnits = await edgarConcept(EDGAR_CIK[ticker], ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']);
        const capexUnits = await edgarConcept(EDGAR_CIK[ticker], ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
        const ocfQ = deriveQuarterlySeries(ocfUnits);
        const capexQ = new Map(deriveQuarterlySeries(capexUnits).map((q) => [q.end, q.val]));
        const fcfQ = ocfQ.filter((q) => capexQ.has(q.end)).map((q) => ({ end: q.end, val: q.val - capexQ.get(q.end) }));
        const yoy = trailing4qYoy(fcfQ);
        if (yoy) perCompany.push({ ticker, ...yoy });
      }
    } catch (error) {
      console.warn(`[bubble-watch] EDGAR FCF 链失败,改走 stockanalysis 镜像: ${error.message}`);
      perCompany = [];
    }
    if (perCompany.length < 3) {
      sourceTag = 'stockanalysis 季报镜像';
      perCompany = [];
      for (const ticker of companies) {
        const html = await retry(() => fetchSaFinancialPage(ticker, 'cash-flow-statement/'), `SA cash-flow ${ticker}`);
        const ocf = parseSaQuarterlyRow(html, 'Operating Cash Flow');
        const capex = parseSaQuarterlyRow(html, 'Capital Expenditures'); // 负值
        const n = Math.min(ocf.length, capex.length);
        const fcf = Array.from({ length: n }, (_, i) => ocf[i] + capex[i]);
        const yoy = saT4qYoy(fcf);
        if (yoy) perCompany.push({ ticker, ...yoy });
      }
    }
    if (perCompany.length < 3) throw new Error(`FCF 可用公司不足 (${perCompany.length}/4)`);
    const now = perCompany.reduce((a, c) => a + c.now, 0);
    const prev = perCompany.reduce((a, c) => a + c.prev, 0);
    if (prev === 0) throw new Error('FCF 基期为 0');
    const yoyPct = ((now - prev) / Math.abs(prev)) * 100;
    const status = yoyPct < -20 ? 'red' : yoyPct < 0 ? 'yellow' : 'green';
    return {
      status,
      value_display: fmtPct(yoyPct, 0, true),
      note: `${sourceTag}实拉 ${perCompany.map((c) => c.ticker).join('/')} 滚动 4 季自由现金流(经营现金流 − capex)合计 $${(now / 1e9).toFixed(0)}B,同比 ${fmtPct(yoyPct, 1, true)}(上年同期 $${(prev / 1e9).toFixed(0)}B)——巨额 capex ${yoyPct < 0 ? '正在吞噬现金流' : '尚未压垮现金流'}。阈值:<-20% 红 / -20%~0 黄 / >0 绿`,
      detail: { yoyPct, source: sourceTag, perCompany: perCompany.map((c) => ({ ticker: c.ticker, fcfNowB: Number((c.now / 1e9).toFixed(1)), yoyPct: Number(c.yoyPct.toFixed(1)) })) }
    };
  },
  async nvda_invest_revenue(ctx) {
    const commitments = ctx.config.params?.nvdaCommitments;
    if (!commitments?.usd) throw new Error('config 缺 nvdaCommitments');
    let ltm = null;
    let sourceTag = 'SEC EDGAR';
    try {
      const revUnits = await edgarConcept(EDGAR_CIK.NVDA, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues']);
      const quarters = deriveQuarterlySeries(revUnits);
      if (quarters.length >= 4) ltm = quarters.slice(-4).reduce((a, q) => a + q.val, 0);
    } catch (error) {
      console.warn(`[bubble-watch] EDGAR NVDA revenue 失败,改走 stockanalysis 镜像: ${error.message}`);
    }
    if (!ltm) {
      sourceTag = 'stockanalysis 季报镜像';
      const html = await retry(() => fetchSaFinancialPage('NVDA', ''), 'SA NVDA income');
      const rev = parseSaQuarterlyRow(html, 'Revenue');
      ltm = rev.slice(0, 4).reduce((a, b) => a + b, 0);
    }
    if (!(ltm > 1e10)) throw new Error(`NVDA LTM 收入异常: ${ltm}`);
    const ratio = (commitments.usd / ltm) * 100;
    const status = classifyNumeric(ratio, 30, 15);
    return {
      status,
      value_display: `≈${ratio.toFixed(0)}%`,
      note: `分子=公开披露投资承诺 ${commitments.desc}(${commitments.asOfDate} 口径,$${(commitments.usd / 1e9).toFixed(0)}B);分母=${sourceTag}实拉 NVDA LTM 收入 $${(ltm / 1e9).toFixed(1)}B;比率 ≈${ratio.toFixed(1)}%,仍远超 Lucent 1999 循环融资峰值 24%。阈值:>30% 红 / 15-30% 黄 / <15% 绿`,
      detail: { commitmentsUsd: commitments.usd, ltmRevenue: ltm, ratioPct: ratio, source: sourceTag }
    };
  },
  async breadth_50d() {
    const constituents = await retry(fetchSp500Constituents, 'Wikipedia S&P 500 名单');
    const symbols = constituents.map((s) => s.replace(/\./gu, '-'));
    const results = await mapPool(symbols, 5, async (symbol) => {
      try {
        const closes = await yahooCloses(symbol, '6mo');
        if (closes.length < 51) return null;
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
        await new Promise((resolve) => setTimeout(resolve, 60));
        return closes[closes.length - 1] > sma50 ? 1 : 0;
      } catch {
        return null; // 单票失败跳过,样本量在下方守卫
      }
    });
    const counted = results.filter((v) => v !== null).length;
    const above = results.filter((v) => v === 1).length;
    if (counted < Math.floor(symbols.length * 0.7)) throw new Error(`广度样本不足 (${counted}/${symbols.length})`);
    const pct = (above / counted) * 100;
    const status = pct < 40 ? 'red' : pct <= 60 ? 'yellow' : 'green';
    return {
      status,
      value_display: `≈${pct.toFixed(0)}%`,
      note: `Yahoo Chart 全市场实算:S&P 500 成份股 ${counted} 只(Wikipedia 实时名单)中 ${above} 只收于 50 日均线上方,占比 ≈${pct.toFixed(1)}%。阈值:<40% 红 / 40-60% 黄 / >60% 绿`,
      detail: { above, counted, pct }
    };
  },
  async spy_vs_rsp_6m() {
    const [spy, rsp] = [await retry(() => yahooCloses('SPY', '6mo'), 'Yahoo SPY'), await retry(() => yahooCloses('RSP', '6mo'), 'Yahoo RSP')];
    const ret = (closes) => ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
    const spread = ret(spy) - ret(rsp);
    const abs = Math.abs(spread);
    const status = abs > 10 ? 'red' : abs >= 5 ? 'yellow' : 'green';
    return {
      status,
      value_display: fmtPct(spread, 1, true),
      note: `Yahoo Chart 实算 6 个月回报:SPY ${fmtPct(ret(spy), 1, true)} vs 等权重 RSP ${fmtPct(ret(rsp), 1, true)},市值加权领先 ${fmtPct(spread, 1, true)}——${abs >= 5 ? '头部独涨、广度未跟上' : '头部与平均股差距可控'}。阈值:>10% 红 / 5-10% 黄 / <5% 绿`,
      detail: { spyRet: ret(spy), rspRet: ret(rsp), spread }
    };
  },
  async insider_sell_buy(ctx) {
    const basket = ctx.config.params?.insiderBasket || ['NVDA', 'PLTR', 'AVGO'];
    let buy = 0;
    let sell = 0;
    for (const symbol of basket) {
      const totals = await retry(() => fetchOpenInsiderTotals(symbol), `OpenInsider ${symbol}`);
      buy += totals.buy;
      sell += totals.sell;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const buyFloor = Math.max(buy, 1e6); // 买入不足 $1M 时按 $1M 下限计算,避免除零
    const ratio = sell / buyFloor;
    const status = ratio > 20 ? 'red' : ratio >= 5 ? 'yellow' : 'green';
    const display = ratio > 99 ? '≫20x' : `~${ratio.toFixed(0)}x`;
    return {
      status,
      value_display: display,
      note: `OpenInsider 实拉 ${basket.join(' / ')} 近 12 个月 Form 4:累计卖出 $${(sell / 1e9).toFixed(1)}B、买入 $${(buy / 1e6).toFixed(0)}M,卖买比 ≈${ratio > 99 ? '>99' : ratio.toFixed(1)}x(买入不足 $1M 时按 $1M 下限折算);2000 年顶部极值约 23x。阈值:>20x 红 / 5-20x 黄 / <5x 绿`,
      detail: { buyUsd: buy, sellUsd: sell, ratio }
    };
  },
  async hy_oas() {
    const rows = await retry(() => fredObservations('BAMLH0A0HYM2', 10), 'FRED HY OAS');
    const bps = Math.round(rows[0].value * 100);
    const status = bps > 500 ? 'red' : bps >= 350 ? 'yellow' : 'green';
    return {
      status,
      value_display: `${bps} bps`,
      note: `FRED 实拉 ICE BofA 高收益债 OAS = ${rows[0].value.toFixed(2)}%(${bps} bps,${rows[0].date});长期均值约 394 bps——信用市场对 AI capex 烧钱${bps < 350 ? '仍未定价压力,是当前最支撑多头的指标' : '开始定价压力'}。阈值:>500 红 / 350-500 黄 / <350 绿`,
      detail: { bps, date: rows[0].date }
    };
  },
  async cloud_rpo_growth() {
    const companies = ['MSFT', 'ORCL', 'AMZN', 'GOOGL'];
    const series = [];
    for (const ticker of companies) {
      try {
        const units = await retry(() => edgarConcept(EDGAR_CIK[ticker], ['RevenueRemainingPerformanceObligation']), `EDGAR RPO ${ticker}`, 1);
        const s = deriveInstantSeries(units);
        if (s.length >= 6) series.push({ ticker, s });
      } catch (error) {
        console.warn(`[bubble-watch] RPO ${ticker} 不可用: ${error.message}`);
      }
    }
    if (series.length < 2) throw new Error(`RPO 可用公司不足 (${series.length})`);
    let latestYoySum = { now: 0, prev: 0 };
    let priorYoySum = { now: 0, prev: 0 };
    for (const { s } of series) {
      const n = s.length;
      latestYoySum.now += s[n - 1].val;
      latestYoySum.prev += s[n - 5] ? s[n - 5].val : NaN;
      priorYoySum.now += s[n - 2] ? s[n - 2].val : NaN;
      priorYoySum.prev += s[n - 6] ? s[n - 6].val : NaN;
    }
    const yoy = ((latestYoySum.now - latestYoySum.prev) / latestYoySum.prev) * 100;
    const prevYoy = Number.isFinite(priorYoySum.now) && Number.isFinite(priorYoySum.prev)
      ? ((priorYoySum.now - priorYoySum.prev) / priorYoySum.prev) * 100
      : null;
    if (!Number.isFinite(yoy)) throw new Error('RPO YoY 计算失败');
    const decel = prevYoy !== null && yoy < prevYoy - 2;
    const status = yoy < 0 ? 'red' : decel ? 'yellow' : 'green';
    return {
      status,
      value_display: fmtPct(yoy, 0, true),
      note: `SEC EDGAR 实拉 ${series.map((c) => c.ticker).join('/')} 剩余履约义务(RPO)合计 $${(latestYoySum.now / 1e12).toFixed(2)}T,同比 ${fmtPct(yoy, 1, true)}${prevYoy !== null ? `(上季同比 ${fmtPct(prevYoy, 1, true)},${decel ? '边际减速' : '未见减速'})` : ''}——递延需求${yoy > 0 ? '仍在累积' : '开始萎缩'}。判级:负增长=红 / 减速=黄 / 加速=绿`,
      detail: { yoyPct: yoy, prevYoyPct: prevYoy, companies: series.map((c) => c.ticker) }
    };
  },
  async fed_policy() {
    const dff = await retry(() => fredObservations('DFF', 90), 'FRED DFF');
    const cpi = await retry(() => fredObservations('CPIAUCSL', 14), 'FRED CPI');
    const latest = dff[0].value;
    const past = dff[Math.min(60, dff.length - 1)].value;
    const drift = latest - past;
    const cpiYoy = ((cpi[0].value - cpi[12].value) / cpi[12].value) * 100;
    let status;
    let stance;
    if (drift > 0.1) {
      status = 'red';
      stance = '重启加息';
    } else if (drift < -0.1) {
      status = 'green';
      stance = '降息中';
    } else if (cpiYoy > 2.5) {
      status = 'yellow';
      stance = '偏鹰(维持高位)';
    } else {
      status = 'green';
      stance = '中性偏松';
    }
    return {
      status,
      value_display: status === 'yellow' ? '偏鹰' : stance,
      note: `FRED 实拉推导:有效联邦基金利率 ${latest.toFixed(2)}%(60 日漂移 ${drift >= 0 ? '+' : ''}${(drift * 100).toFixed(0)}bp)、CPI 同比 ${cpiYoy.toFixed(1)}%(${cpi[0].date} 口径)→ 判定「${stance}」${status === 'yellow' ? ',通胀仍高于 2% 目标、higher-for-longer 对极度拉伸的估值构成持续压制' : ''}。判级:加息=红 / 通胀压力=黄 / 降息=绿`,
      detail: { dff: latest, drift60dBp: drift * 100, cpiYoy }
    };
  }
};

// ---------- 上游周报同步(aibubble-cn.github.io)----------
// 编辑/研究类指标(及自动指标的 fallback 快照)无公开 API,每次周一 build 先检查
// 上游 AI 泡沫监测周报(aibubble-cn.github.io 的实际数据源 = ai-bubble-monitor
// latest.json):上游 as_of_date 比本地 curated 口径新 → 自动采纳其
// status/value_display/note 并回写 config(workflow 随数据一起提交,实现
// 「每周一检查,拿不到下周一再查」的滚动自动同步)。上游不可达/未更新 → 保持现状,
// 超期由 STALE 角标显式暴露。
const UPSTREAM_URLS = [
  // aibubble-cn.github.io 页面 fetch 的真实数据端点
  'https://raw.githubusercontent.com/crystal-xiaoxiao/ai-bubble-monitor/main/docs/data/latest.json',
  // 若上游日后改为站内托管的兜底路径
  'https://aibubble-cn.github.io/data/latest.json'
];

async function syncCuratedFromUpstream(config) {
  let upstream = null;
  let sourceUrl = null;
  for (const url of UPSTREAM_URLS) {
    try {
      const json = await fetchWithTimeout(`${url}?t=${Date.now()}`, { asJson: true });
      if (json && /^\d{4}-\d{2}-\d{2}$/u.test(json.as_of_date || '') && Array.isArray(json.indicators)) {
        upstream = json;
        sourceUrl = url;
        break;
      }
      console.warn(`[bubble-watch] upstream ${url} 返回结构异常,跳过`);
    } catch (error) {
      console.warn(`[bubble-watch] upstream ${url} 不可达: ${error.message}`);
    }
  }
  if (!upstream) {
    console.warn('[bubble-watch] upstream sync: 本轮未拿到上游周报,沿用现有口径,下个周期再查');
    return { checked: true, reachable: false, adopted: 0 };
  }
  const byId = new Map(upstream.indicators.map((i) => [i.id, i]));
  let adopted = 0;
  for (const bucket of ['curated', 'autoFallback']) {
    for (const [id, entry] of Object.entries(config[bucket] || {})) {
      const up = byId.get(id);
      if (!up || !STATUS_RANK.hasOwnProperty(up.status)) continue;
      if (upstream.as_of_date > entry.asOfDate) {
        entry.status = up.status;
        entry.value_display = String(up.value_display ?? up.value ?? entry.value_display).slice(0, 40);
        if (typeof up.note === 'string' && up.note.length > 20) entry.note = up.note.slice(0, 800);
        entry.asOfDate = upstream.as_of_date;
        entry.syncedFromUpstream = true;
        adopted += 1;
      }
    }
  }
  const result = { checked: true, reachable: true, upstreamAsOf: upstream.as_of_date, upstreamIssue: upstream.issue_number ?? null, adopted, sourceUrl };
  if (adopted) {
    config.upstreamSync = { sourceUrl, upstreamAsOf: upstream.as_of_date, adoptedCount: adopted, syncedAt: new Date().toISOString() };
    fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`[bubble-watch] upstream sync: 采纳上游 ${upstream.as_of_date}(Issue ${upstream.issue_number})共 ${adopted} 项,已回写 config`);
  } else {
    console.log(`[bubble-watch] upstream sync: 上游 ${upstream.as_of_date} 不比本地口径新,无采纳`);
  }
  return result;
}

// ---------- 指标组装 ----------

function buildCuratedIndicator(def, entry, today) {
  const ageDays = daysBetween(entry.asOfDate, today);
  const stale = ageDays > entry.maxAgeDays;
  return {
    ...baseIndicator(def),
    status: entry.status,
    value_display: entry.value_display,
    note: stale ? `${entry.note}(沿用 ${entry.asOfDate} 口径)` : entry.note,
    stale,
    provenance: { mode: 'curated', asOfDate: entry.asOfDate, ageDays, maxAgeDays: entry.maxAgeDays }
  };
}

function buildFallbackIndicator(def, entry, today, reason) {
  const ageDays = daysBetween(entry.asOfDate, today);
  const stale = ageDays > entry.maxAgeDays;
  return {
    ...baseIndicator(def),
    status: entry.status,
    value_display: entry.value_display,
    note: `${entry.note}(实时抓取失败,沿用 ${entry.asOfDate} 快照)`,
    stale,
    provenance: { mode: 'auto_fallback', asOfDate: entry.asOfDate, ageDays, maxAgeDays: entry.maxAgeDays, reason }
  };
}

function baseIndicator(def) {
  return {
    id: def.id,
    category: def.category,
    name_en: def.name_en,
    name_zh: def.name_zh,
    threshold_text: def.threshold_text,
    source_name: def.source_name
  };
}

// ---------- 打分 / 判读 ----------

function tierFromPct(p) {
  if (p >= 60) return 'top';
  if (p >= 40) return 'alert';
  if (p >= 25) return 'caution';
  return 'observation';
}

function computeSummary(indicators, today, prevEntry, meta) {
  const total = indicators.length;
  const red = indicators.filter((i) => i.status === 'red').length;
  const yellow = indicators.filter((i) => i.status === 'yellow').length;
  const green = total - red - yellow;
  const redPct = Number(((red / total) * 100).toFixed(1));
  const weighted = Number((((red + 0.5 * yellow) / total) * 100).toFixed(1));

  const baseTier = tierFromPct(redPct);
  // 分类强制升级:红灯占比 ≥50% 的分类 ≥2 个 → 至少「高风险预警」
  const resonant = [];
  for (const cat of CATEGORY_ORDER) {
    const items = indicators.filter((i) => i.category === cat.key);
    if (!items.length) continue;
    const r = items.filter((i) => i.status === 'red').length;
    if (r / items.length >= 0.5) resonant.push({ key: cat.key, zh: cat.zh, red: r, total: items.length });
  }
  const tierRank = { observation: 0, caution: 1, alert: 2, top: 3 };
  let effTier = baseTier;
  if (resonant.length >= 2 && tierRank[effTier] < tierRank.alert) effTier = 'alert';
  const overrideActive = effTier !== baseTier;

  // WoW 翻灯
  const flips = [];
  if (prevEntry?.statuses) {
    for (const ind of indicators) {
      const prev = prevEntry.statuses[ind.id];
      if (prev && prev !== ind.status) {
        flips.push({ id: ind.id, name_zh: ind.name_zh, from: prev, to: ind.status, up: STATUS_RANK[ind.status] > STATUS_RANK[prev], ind });
      }
    }
  }

  const redNames = indicators.filter((i) => i.status === 'red').map((i) => `${i.name_zh}(${i.value_display})`);
  const staleCount = indicators.filter((i) => i.stale).length;
  const autoCount = meta.autoCount;
  const curatedCount = meta.curatedCount + meta.fallbackCount;

  const parts = [];
  parts.push(`本周计数 ${red} 红 / ${yellow} 黄 / ${green} 绿${prevEntry?.statuses ? (flips.length ? '' : ',与上期持平') : ''},red_pct ${redPct.toFixed(1)}%、加权风险分 ${weighted.toFixed(1)}%。`);
  if (flips.length) {
    parts.push(`本期翻灯 ${flips.length} 项:${flips.map((f) => `「${f.name_zh}」${STATUS_ZH[f.from]}→${STATUS_ZH[f.to]}`).join('、')}。`);
  } else if (prevEntry?.statuses) {
    parts.push('状态层面无指标翻灯。');
  }
  parts.push(`基础判读为${TIER_LABEL_ZH[baseTier]}(red_pct ${redPct < 25 ? '<25%' : redPct < 40 ? '25-40%' : redPct < 60 ? '40-60%' : '≥60%'})。`);
  if (overrideActive) {
    parts.push(`分类强制升级生效:${resonant.map((c) => `${c.zh} ${c.red}/${c.total} 红`).join('、')}——红灯占比过半的分类达 ${resonant.length} 个,判读上调至「${TIER_LABEL_ZH[effTier]}」。`);
  } else if (resonant.length === 1) {
    parts.push(`${resonant[0].zh}分类红灯过半(${resonant[0].red}/${resonant[0].total}),未达双分类共振、不触发强制升级。`);
  } else {
    parts.push('无分类红灯占比过半,未触发强制升级。');
  }
  if (redNames.length) parts.push(`当前红灯:${redNames.join('、')}。`);
  parts.push(`数据由自动管线于 ${today} 采集:${autoCount} 项实时接入、${curatedCount} 项沿用人工研究口径${staleCount ? `(其中 ${staleCount} 项已标 STALE)` : ''};编辑性事件叙事以最近一期人工口径为准。`);

  return {
    summary: {
      total_indicators: total,
      red_count: red,
      yellow_count: yellow,
      green_count: green,
      red_pct: redPct,
      weighted_risk_score: weighted,
      verdict_label: TIER_LABEL_ZH[effTier],
      verdict_label_en: TIER_LABEL_EN[effTier],
      verdict_desc: parts.join('')
    },
    scoring: {
      base_tier: baseTier,
      effective_tier: effTier,
      override_active: overrideActive,
      override_rule: '红灯占比 ≥50% 的分类 ≥2 个 → 判读至少上调到「高风险预警」',
      resonant_categories: resonant.map(({ key, zh, red: r, total: t }) => ({ key, zh, red: r, total: t }))
    },
    flips
  };
}

function buildWowChanges(flips, indicators) {
  if (flips.length) {
    return flips.slice(0, 6).map((f) => ({
      type: f.up ? 'status_upgrade' : 'status_downgrade',
      note: `「${f.name_zh}」由${STATUS_ZH[f.from]}转${STATUS_ZH[f.to]}:当前 ${f.ind.value_display}。${f.ind.note}`
    }));
  }
  const highlightIds = ['capex_reaction', 'ai_ipo_pipeline', 'dc_abs_spread', 'nvda_fpe', 'breadth_50d'];
  return highlightIds
    .map((id) => indicators.find((i) => i.id === id))
    .filter(Boolean)
    .map((ind) => ({ type: 'flat', note: ind.note }));
}

// ---------- 主流程 ----------

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  const today = isoDate();
  const upstreamSync = await syncCuratedFromUpstream(config);
  const ctx = { config };

  const indicators = [];
  const fetchFailures = [];
  let autoCount = 0;
  let curatedCount = 0;
  let fallbackCount = 0;

  for (const def of INDICATOR_DEFS) {
    if (def.mode === 'curated') {
      const entry = config.curated[def.id];
      if (!entry) throw new Error(`config curated 缺指标 ${def.id}`);
      indicators.push(buildCuratedIndicator(def, entry, today));
      curatedCount += 1;
      console.log(`[bubble-watch] ${def.id}: curated (${entry.status})`);
      continue;
    }
    const fallback = config.autoFallback[def.id];
    if (!fallback) throw new Error(`config autoFallback 缺指标 ${def.id}`);
    try {
      const result = await autoBuilders[def.id](ctx);
      indicators.push({
        ...baseIndicator(def),
        status: result.status,
        value_display: result.value_display,
        note: result.note,
        stale: false,
        provenance: { mode: 'auto', fetchedAt: new Date().toISOString(), detail: result.detail || null }
      });
      autoCount += 1;
      console.log(`[bubble-watch] ${def.id}: auto OK (${result.status} ${result.value_display})`);
    } catch (error) {
      fetchFailures.push({ id: def.id, reason: error.message });
      indicators.push(buildFallbackIndicator(def, fallback, today, error.message));
      fallbackCount += 1;
      console.warn(`[bubble-watch] ${def.id}: auto FAILED → fallback (${error.message})`);
    }
  }

  // 历史:同 ISO 周覆盖,新周追加 + issue 自增
  const entries = [...history.entries];
  const prevForWow = [...entries].reverse().find((e) => e.statuses && isoWeekKey(e.date) !== isoWeekKey(today)) || null;
  const meta = { autoCount, curatedCount, fallbackCount };
  const { summary, scoring, flips } = computeSummary(indicators, today, prevForWow, meta);

  const lastIssue = entries.reduce((a, e) => Math.max(a, e.issue_number || 0), 0);
  const sameWeekIdx = entries.findIndex((e) => isoWeekKey(e.date) === isoWeekKey(today));
  const issueNumber = sameWeekIdx >= 0 ? entries[sameWeekIdx].issue_number || lastIssue : lastIssue + 1;
  const newEntry = {
    date: today,
    week: today.slice(5),
    issue_number: issueNumber,
    red_pct: summary.red_pct,
    risk_score: summary.weighted_risk_score,
    statuses: Object.fromEntries(indicators.map((i) => [i.id, i.status]))
  };
  if (sameWeekIdx >= 0) entries[sameWeekIdx] = newEntry;
  else entries.push(newEntry);
  while (entries.length > 16) entries.shift();

  const output = {
    contractVersion: 'bubble-watch-v1',
    issue_number: issueNumber,
    as_of_date: today,
    generated_at: new Date().toISOString(),
    summary,
    scoring,
    indicators: indicators.map(({ ...ind }) => ind),
    history_seed: entries.slice(-10).map((e) => ({ week: e.week, red_pct: e.red_pct, risk_score: e.risk_score })),
    wow_changes: buildWowChanges(flips, indicators),
    meta: {
      builder: 'scripts/build-bubble-watch.mjs',
      boundary: 'display-only:独立专题页数据,不进 GFRR 打分/决策/执行/仓位',
      auto_count: autoCount,
      curated_count: curatedCount,
      fallback_count: fallbackCount,
      fetch_failures: fetchFailures,
      fred_key_present: Boolean(FRED_API_KEY),
      upstream_sync: upstreamSync
    }
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify({ ...history, entries }, null, 2)}\n`);
  console.log(`[bubble-watch] OK — issue ${issueNumber}, ${summary.red_count}红/${summary.yellow_count}黄/${summary.green_count}绿, red_pct ${summary.red_pct}%, verdict ${summary.verdict_label}${scoring.override_active ? '(分类升级)' : ''}, auto ${autoCount}/12, fallback ${fallbackCount}`);
}

main().catch((error) => {
  console.error(`[bubble-watch] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
