// build-bubble-watch.mjs — AI 泡沫监测(The Bubble Watch)周度数据管线
//
// 27 项展示指标 × 6 分类:固定 Core-23 计分 + Shadow-4 观察。12 项自动实时接入(FRED / Yahoo Chart / SEC EDGAR /
// StockAnalysis metrics / multpl / slickcharts / SEC EDGAR Form 4),15 项编辑/研究类指标
// 读 config/bubble-watch-curated.json 人工口径。所有自动指标 fail-closed:
// 抓取失败沿用 curated 快照并按 maxAgeDays 标 STALE,绝不造数。
//
// 打分逻辑(Bubble Watch v2 校准):
//   primary score = red_pct = Core-23 红灯数 / 23;weighted = Core-23 (红×1.0 + 黄×0.5) / 23
//   Shadow-4 全部展示,但不进入主分、两轴、分类共振、动量或历史相似度
//   分档只使用 red_pct:<25% 观察期 / 25-40% 中度警戒 / 40-60% 高风险预警 / ≥60% 系统性顶部
//   分类强制升级:≥2 个分类红灯占比 ≥50% → 判读至少上调到「高风险预警」
//
// 输出:data/bubble-watch.json(latest)+ data/bubble-watch-history.json(周度滚动)
// 边界:display-only 独立专题页数据,不进 GFRR scoring/decision/execution/position。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gdeltCacheAgeHours } from './gdelt/cache-age.mjs';
import { fetchGdeltDocJson, sanitizeGdeltDiagnostics } from './gdelt/fetch-gdelt.mjs';
import { sanitizeDiagnosticUrl } from './sanitize-diagnostic-url.mjs';
import { isCoreAiAccountingEnforcementEvent } from './bubble-watch/accounting-event-classifier.mjs';
import { requireFreshUnderlyingObservation } from './bubble-watch/observation-freshness.mjs';
import { extractAnthropicArrB } from './bubble-watch/arr-milestone-parser.mjs';
import { evaluateInsiderLiveCoverage } from './bubble-watch/insider-source-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'bubble-watch-curated.json');
const SOURCE_CANDIDATES_PATH = path.join(ROOT, 'config', 'bubble-watch-source-candidates.json');
const OUT_PATH = path.join(ROOT, 'data', 'bubble-watch.json');
const HISTORY_PATH = path.join(ROOT, 'data', 'bubble-watch-history.json');
const GDELT_BUBBLE_CACHE_PATH = path.join(ROOT, 'data', 'gdelt-bubble-watch-cache.json');
const FED_BASE_URL = 'https://www.federalreserve.gov';
const FED_CALENDAR_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';

const UA = 'gfrr-bubble-watch/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';
// SEC EDGAR 要求 UA 携带联系方式(无邮箱式 UA 会 403)
const EDGAR_UA = 'gfrr-auto-update-site bubble-watch ctmaomao@users.noreply.github.com';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
const FRED_API_KEY = (process.env.FRED_API_KEY || '').trim();
const TAVILY_API_KEYS = readSecretList(['TAVILY_API_KEYS', 'TAVILY_API_KEY']);
const BRAVE_API_KEYS = readSecretList(['BRAVE_API_KEYS', 'BRAVE_API_KEY']);
const WIND_API_KEY = readWindApiKey();
const WIND_MCP_TIMEOUT_MS = 60000;
const WIND_MCP_ENDPOINTS = {
  analytics_data: 'https://mcp.wind.com.cn/vserver_analytics_data/mcp/',
  economic_data: 'https://mcp.wind.com.cn/vserver_economic_data/mcp/',
  financial_docs: 'https://mcp.wind.com.cn/vserver_financial_docs/mcp/'
};
const windMcpInitialized = new Set();
const UPSTREAM_SYNC_LOCAL_AUTHORITY_BLOCKLIST = new Set([
  'mag4_fcf_yoy'
]);

const STATUS_RANK = { green: 0, yellow: 1, red: 2 };
const STATUS_ZH = { green: '绿', yellow: '黄', red: '红' };
const TIER_LABEL_ZH = { observation: '观察期', caution: '中度警戒', alert: '高风险预警', top: '系统性顶部' };
const TIER_LABEL_EN = { observation: 'Observation', caution: 'Moderate Caution', alert: 'High Risk Alert', top: 'Systemic Top' };
const AXIS_SCORE = { green: 0, yellow: 50, red: 100 };
const BUBBLE_WATCH_CONTRACT_VERSION = 'bubble-watch-v2';
const BUBBLE_WATCH_HISTORY_CONTRACT_VERSION = 'bubble-watch-history-v2';
const SCORING_MODEL_VERSION = 'bubble-watch-v2-core23-shadow4';
const NARRATIVE_ENGINE_VERSION = 'bubble-watch-narrative-v2';
const CORE_INDICATOR_IDS = [
  'cape', 'top5_weight', 'nvda_fpe',
  'hyperscaler_capex_yoy', 'mag4_fcf_yoy', 'vc_ai_share', 'nvda_invest_revenue',
  'breadth_50d', 'spy_vs_rsp_6m', 'insider_sell_buy', 'ai_ipo_pipeline',
  'hy_oas', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'arr_2nd_deriv', 'enterprise_deploy', 'cloud_rpo_growth',
  'accounting_events', 'fed_policy', 'capex_reaction', 'ceo_hedging'
];
const SHADOW_INDICATOR_IDS = [
  'private_secondary_marks', 'token_revenue_ratio', 'gpu_rental_price', 'frontier_progress'
];
const CORE_INDICATOR_ID_SET = new Set(CORE_INDICATOR_IDS);
const SHADOW_INDICATOR_ID_SET = new Set(SHADOW_INDICATOR_IDS);
const SHADOW_PROMOTION_POLICY = {
  automatic_promotion: false,
  separate_review_required: true,
  minimum_observation_weeks: 52,
  minimum_fresh_availability_pct: 90,
  required_reviews: [
    'historical_proxy_or_backfill',
    'non_redundancy_ablation',
    'out_of_sample_target_improvement',
    'separate_contract_migration'
  ],
  forecast_targets: {
    stage: '12-24 month valuation or relative-return unwind',
    trigger: '13/26-week NDX or fixed AI-basket max drawdown >=20%'
  }
};
const GDELT_BUBBLE_CACHE_SCHEMA_VERSION = 'gdelt-bubble-watch-cache-p38';
const GDELT_BUBBLE_CACHE_MODULE = 'gdelt-bubble-watch-cache';
const GDELT_BUBBLE_CACHE_TTL_HOURS = 132;
const GDELT_BUBBLE_STALE_MAX_DAYS = 21;
const XOOMAR_INSIDER_MAX_AGE_HOURS = 48;
const GDELT_BUBBLE_CACHE_BOUNDARY = 'production read-only GDELT compact news cache for Bubble Watch ceo_hedging; display-only/audit-only cache; NOT in GFRR values, scoring, decision, execution, position, ODP finalBias, Brent promotion, Global Risk Heatmap, or cross-validation';
const PROXY_CONFIDENCE_CALIBRATION_IDS = new Set([
  'insider_sell_buy',
  'ai_ipo_pipeline',
  'capex_reaction',
  'ceo_hedging',
  'token_revenue_ratio',
  'enterprise_deploy'
]);

const CATEGORY_ORDER = [
  { key: 'valuation', zh: '估值', en: 'VALUATION' },
  { key: 'capital', zh: '资金面', en: 'CAPITAL' },
  { key: 'market_structure', zh: '市场结构', en: 'MARKET STRUCTURE' },
  { key: 'credit', zh: '信用', en: 'CREDIT' },
  { key: 'fundamentals', zh: '基本面', en: 'FUNDAMENTALS' },
  { key: 'macro', zh: '宏观', en: 'MACRO' }
];

// 27 项指标静态定义。axis 用于 Stage × Trigger 第二层聚合。
const INDICATOR_DEFS = [
  { id: 'cape', axis: 'stage', category: 'valuation', name_en: 'Shiller CAPE', name_zh: 'CAPE 周期调整 PE', threshold_text: '>35 红 / 25-35 黄 / <25 绿', source_name: 'multpl.com / GuruFocus', mode: 'auto' },
  { id: 'top5_weight', axis: 'stage', category: 'valuation', name_en: 'S&P 500 Top-5 Weight', name_zh: '前 5 大权重占比', threshold_text: '>25% 红 / 18-25% 黄 / <18% 绿', source_name: 'SPY holdings (stockanalysis / slickcharts)', mode: 'auto' },
  { id: 'nvda_fpe', axis: 'stage', category: 'valuation', name_en: 'NVDA Forward P/E', name_zh: 'NVDA 远期 PE', threshold_text: '>40 红 / 30-40 黄 / <30 绿', source_name: 'GuruFocus / StockAnalysis', mode: 'auto' },
  { id: 'private_secondary_marks', axis: 'trigger', category: 'valuation', name_en: 'AI Private Secondary Marks', name_zh: 'AI 私募二级市场标价', threshold_text: '折价/下跌=红 / 溢价收窄+卖压=黄 / 溢价稳定或扩大=绿', source_name: 'Forge Global / Caplight / Hiive', mode: 'curated' },
  { id: 'hyperscaler_capex_yoy', axis: 'stage', category: 'capital', name_en: 'Hyperscaler Capex YoY', name_zh: 'Hyperscaler 资本开支增速', threshold_text: '指引下调=红 / 加速=黄 / 稳健=绿', source_name: 'SEC EDGAR / stockanalysis 季报镜像', mode: 'auto' },
  { id: 'mag4_fcf_yoy', axis: 'trigger', category: 'capital', name_en: 'Big5 Capex / OCF', name_zh: 'Big5 资本开支/经营现金流', threshold_text: '≥75%或2家>100%=红 / 60-75%或1家>100%=黄 / <60%=绿', source_name: 'SEC EDGAR / stockanalysis 季报镜像', mode: 'auto' },
  { id: 'vc_ai_share', axis: 'stage', category: 'capital', name_en: 'AI / Total VC Funding', name_zh: 'AI 占 VC 投资比重', threshold_text: '>50% 红 / 30-50% 黄 / <30% 绿', source_name: 'Crunchbase / PitchBook(季度研究口径)', mode: 'curated' },
  { id: 'nvda_invest_revenue', axis: 'stage', category: 'capital', name_en: 'NVDA Customer Invest / Rev', name_zh: 'NVDA 客户投资/收入比', threshold_text: '>30% 红 / 15-30% 黄 / <15% 绿 (Lucent 99 峰值 24%)', source_name: '公开披露承诺 ÷ EDGAR/stockanalysis LTM 收入', mode: 'auto' },
  { id: 'breadth_50d', axis: 'trigger', category: 'market_structure', name_en: '% Above 50-Day MA', name_zh: 'S&P 50 日均线上方比例', threshold_text: '<40% 红 / 40-60% 黄 / >60% 绿', source_name: 'Barchart $S5FI / Yahoo Chart × Wikipedia fallback', mode: 'auto' },
  { id: 'spy_vs_rsp_6m', axis: 'trigger', category: 'market_structure', name_en: 'SPY vs RSP 6M Spread', name_zh: '市值加权 vs 等权重', threshold_text: '>10% 红 / 5-10% 黄 / <5% 绿', source_name: 'Yahoo Chart(SPY/RSP 6 个月)', mode: 'auto' },
  { id: 'insider_sell_buy', axis: 'trigger', category: 'market_structure', name_en: 'AI Insider Sell/Buy Ratio', name_zh: 'AI 龙头内部人卖买比', threshold_text: '>20x=红 / 5-20x=黄 / <5x=绿 (2000 峰值 23x)', source_name: 'SEC EDGAR Form 4', mode: 'auto' },
  { id: 'ai_ipo_pipeline', axis: 'stage', category: 'market_structure', name_en: 'AI IPO/SPAC Pipeline', name_zh: 'AI 一级市场发行', threshold_text: '洪流=红 / 升温=黄 / 平静=绿', source_name: '一级市场公开报道(编辑口径)', mode: 'curated' },
  { id: 'hy_oas', axis: 'trigger', category: 'credit', name_en: 'HY OAS Spread', name_zh: '高收益债利差', threshold_text: '>500 红 / 350-500 黄 / <350 绿', source_name: 'ICE BofA HY Index (FRED)', mode: 'auto' },
  { id: 'dc_abs_spread', axis: 'trigger', category: 'credit', name_en: 'Data Center ABS Spread', name_zh: '数据中心 ABS 利差', threshold_text: '走阔 50bps+ = 红 / 稳定 = 黄 / 收窄 = 绿', source_name: 'Green Street News / 公开发行定价(编辑口径)', mode: 'curated' },
  { id: 'debt_capex_ratio', axis: 'stage', category: 'credit', name_en: 'Debt / Capex Flow Ratio', name_zh: '全口径外部融资/Capex 比', threshold_text: '>60% 红 / 30-60% 黄 / <30% 绿', source_name: 'Morgan Stanley public research / Wind paid cross-check', mode: 'curated' },
  { id: 'neocloud_credit', axis: 'trigger', category: 'credit', name_en: 'Neocloud Credit Events', name_zh: 'Neocloud 信用事件', threshold_text: '任何违约/降级=红', source_name: 'S&P Global Ratings / Morningstar(编辑口径)', mode: 'curated' },
  { id: 'token_volume_mom', axis: 'trigger', category: 'fundamentals', name_en: 'Industry Token Volume MoM', name_zh: 'AI 行业 Token 月度环比', threshold_text: '收缩=红 / 减速=黄 / 加速=绿', source_name: 'OpenRouter 公开披露(研究口径)', mode: 'curated' },
  { id: 'token_revenue_ratio', axis: 'trigger', category: 'fundamentals', name_en: 'Token Growth / Revenue Growth', name_zh: 'Token 增速 / 收入增速 比值', threshold_text: '>2x 红 / 1-2x 黄 / <1x 绿', source_name: '厂商公开披露 / OpenRouter(研究口径)', mode: 'curated' },
  { id: 'gpu_rental_price', axis: 'trigger', category: 'fundamentals', name_en: 'GPU Rental Spot Price', name_zh: 'GPU 租赁现货价', threshold_text: '环比跌>15%/供过于求=红 / 阴跌=黄 / 稳定或上涨=绿', source_name: 'Thunder Compute / getdeploying', mode: 'curated' },
  { id: 'arr_2nd_deriv', axis: 'trigger', category: 'fundamentals', name_en: 'AI ARR 2nd Derivative', name_zh: 'AI 收入增速的二阶导', threshold_text: '减速=红 / 平稳=黄 / 加速=绿', source_name: 'Sacra / 公开报道(研究口径)', mode: 'curated' },
  { id: 'enterprise_deploy', axis: 'stage', category: 'fundamentals', name_en: 'Enterprise Production Deploy', name_zh: '企业生产环境部署率', threshold_text: '<50%=红 / 50-65%=黄 / >65%=绿', source_name: 'McKinsey / Deloitte(季度调查口径)', mode: 'curated' },
  { id: 'cloud_rpo_growth', axis: 'trigger', category: 'fundamentals', name_en: 'Cloud RPO Growth', name_zh: '云厂商递延收入增速', threshold_text: '负增长=红 / 减速=黄 / 加速=绿', source_name: 'SEC EDGAR / StockAnalysis RPO metrics', mode: 'auto' },
  { id: 'frontier_progress', axis: 'trigger', category: 'fundamentals', name_en: 'Frontier Model Progress', name_zh: '前沿模型能力进展', threshold_text: '停滞=红 / 放缓=黄 / 正常或加速=绿', source_name: 'METR / Epoch AI / ARC Prize', mode: 'curated' },
  { id: 'accounting_events', axis: 'trigger', category: 'macro', name_en: 'Round-Tripping / Accounting', name_zh: '会计造假/round-tripping 事件', threshold_text: '任何=红 / 调查=黄 / 无=绿', source_name: 'SEC / 公开执法报道(编辑口径)', mode: 'curated' },
  { id: 'fed_policy', axis: 'trigger', category: 'macro', name_en: 'Fed Policy Direction', name_zh: 'Fed 政策方向', threshold_text: '加息=红 / 通胀压力=黄 / 降息=绿', source_name: 'Fed SEP / Fed funds futures / FRED', mode: 'auto' },
  { id: 'capex_reaction', axis: 'trigger', category: 'macro', name_en: 'Capex Guidance Reaction', name_zh: '资本开支指引市场反应', threshold_text: '系统性惩罚=红 / 偶发=黄 / 奖励=绿', source_name: '财报市场反应(编辑口径)', mode: 'curated' },
  { id: 'ceo_hedging', axis: 'stage', category: 'macro', name_en: 'CEO Hedging Language', name_zh: 'CEO 表态对冲程度', threshold_text: '普遍承认过热=红 / 部分=黄 / 无=绿', source_name: '公开表态汇编(编辑口径)', mode: 'curated' }
];

const EDGAR_CIK = {
  AMZN: '0001018724',
  MSFT: '0000789019',
  GOOGL: '0001652044',
  META: '0001326801',
  NVDA: '0001045810',
  ORCL: '0001341439',
  PLTR: '0001321655',
  AVGO: '0001730168'
};

const AI_IPO_WATCHLIST = ['OpenAI', 'Anthropic', 'Databricks', 'Cerebras', 'SpaceX', 'CoreWeave', 'Scale AI'];
const SEC_AI_IPO_FORMS = new Set(['S-1', 'S-1/A', 'F-1', 'F-1/A', '424B4']);

// ---------- 基础工具 ----------

function readWindApiKey() {
  if (process.env.BUBBLE_WATCH_DISABLE_WIND === '1') return '';
  const fromEnv = (process.env.WIND_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const configPath = path.join(os.homedir(), '.wind-aifinmarket', 'config');
    if (!fs.existsSync(configPath)) return '';
    const m = fs.readFileSync(configPath, 'utf8').match(/^WIND_API_KEY=(.+)$/mu);
    return (m?.[1] || '').trim();
  } catch {
    return '';
  }
}

function readSecretList(names) {
  const values = [];
  for (const name of names) {
    const raw = String(process.env[name] || '').trim();
    if (!raw) continue;
    values.push(...raw.split(/[\s,;]+/u).map((key) => key.trim()).filter(Boolean));
  }
  return [...new Set(values)];
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: { 'User-Agent': UA, ...(options.headers || {}) },
      body: options.body,
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!res.ok) {
      const error = new Error(`HTTP ${res.status} for ${sanitizeDiagnosticUrl(url)}`);
      error.status = res.status;
      error.retryAfter = res.headers.get('Retry-After') || '';
      throw error;
    }
    return options.asJson ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(taskFn, label, attempts = 2) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await taskFn();
    } catch (error) {
      lastError = error;
      console.warn(`[bubble-watch] ${label} attempt ${i + 1}/${attempts} failed: ${error.message}`);
      if (i < attempts - 1) await delay(800);
    }
  }
  throw lastError;
}

function parseWindSse(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  let lastDataLine = null;
  for (const line of String(text || '').split(/\r?\n/u)) {
    if (line.startsWith('data: ')) lastDataLine = line.slice(6);
  }
  if (!lastDataLine) throw new Error(`Wind MCP 响应格式无法识别:${trimmed.slice(0, 120)}`);
  return JSON.parse(lastDataLine);
}

async function windMcpRequest(serverType, method, params, timeoutMs = WIND_MCP_TIMEOUT_MS) {
  if (!WIND_API_KEY) throw new Error('WIND_API_KEY 未配置');
  const endpoint = WIND_MCP_ENDPOINTS[serverType];
  if (!endpoint) throw new Error(`未知 Wind MCP serverType:${serverType}`);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WIND_API_KEY}`,
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Wind ${serverType} HTTP ${res.status}: ${text.slice(0, 180)}`);
  const payload = parseWindSse(text);
  if (payload.error) throw new Error(`Wind ${serverType} error: ${JSON.stringify(payload.error).slice(0, 240)}`);
  if (payload.result?.isError) {
    const msg = payload.result.content?.[0]?.text || JSON.stringify(payload.result);
    throw new Error(`Wind ${serverType} tool error: ${String(msg).slice(0, 240)}`);
  }
  return payload.result;
}

async function windMcpCall(serverType, toolName, args) {
  if (!windMcpInitialized.has(serverType)) {
    await windMcpRequest(serverType, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'gfrr-bubble-watch', version: '1.0' }
    }, 30000);
    windMcpInitialized.add(serverType);
  }
  const result = await windMcpRequest(serverType, 'tools/call', {
    name: toolName,
    arguments: args,
    _meta: { clientVersion: 'gfrr-bubble-watch' }
  });
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) throw new Error(`Wind ${serverType}.${toolName} 返回空文本`);
  return JSON.parse(text);
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#8217;|&rsquo;/gu, "'")
    .replace(/&#8216;|&lsquo;/gu, "'")
    .replace(/&#8220;|&ldquo;/gu, '"')
    .replace(/&#8221;|&rdquo;/gu, '"')
    .replace(/&nbsp;/gu, ' ');
}

function htmlToText(html) {
  return decodeHtmlEntities(stripTags(String(html || ''))).replace(/\s+/gu, ' ').trim();
}

function extractHtmlRows(html) {
  return [...String(html || '').matchAll(/<tr[\s\S]*?<\/tr>/giu)].map((match) => match[0]);
}

function extractHtmlCells(rowHtml) {
  return [...String(rowHtml || '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu)]
    .map((match) => htmlToText(match[1]));
}

function parseLooseNumber(value) {
  const match = String(value ?? '').replace(/,/gu, '').match(/[-+]?\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

function resolveFedUrl(pathOrUrl) {
  if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) return null;
  if (/^https?:\/\//iu.test(pathOrUrl)) return pathOrUrl;
  return `${FED_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function latestDatedFedLink(html, pattern) {
  const todayKey = isoDate().replace(/-/gu, '');
  const links = [...String(html || '').matchAll(pattern)]
    .map((match) => ({ href: match.groups?.href || null, date: match.groups?.date || null }))
    .filter((item) => item.href && /^\d{8}$/u.test(item.date) && item.date <= todayKey);
  if (!links.length) return null;
  links.sort((a, b) => a.date.localeCompare(b.date));
  return links[links.length - 1];
}

function parseFedSepMedians(html, sepUrl, sepDate) {
  const fedFundsRow = extractHtmlRows(html)
    .map(extractHtmlCells)
    .find((cells) => /Federal funds rate/iu.test(cells[0] || ''));
  if (!fedFundsRow) throw new Error('Fed SEP federal funds row missing');
  const dotPlotMedianCurrentYear = parseLooseNumber(fedFundsRow[1]);
  const dotPlotMedianNextYear = parseLooseNumber(fedFundsRow[2]);
  if (!Number.isFinite(dotPlotMedianCurrentYear) && !Number.isFinite(dotPlotMedianNextYear)) {
    throw new Error('Fed SEP federal funds medians unavailable');
  }
  return {
    sepProjectionDate: sepDate?.replace(/^(\d{4})(\d{2})(\d{2})$/u, '$1-$2-$3') || null,
    sepUrl,
    dotPlotMedianCurrentYear: Number.isFinite(dotPlotMedianCurrentYear) ? dotPlotMedianCurrentYear : null,
    dotPlotMedianNextYear: Number.isFinite(dotPlotMedianNextYear) ? dotPlotMedianNextYear : null
  };
}

function compactSnippet(text, maxLen = 120) {
  const s = String(text || '').replace(/\s+/gu, ' ').trim();
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
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
  if (FRED_API_KEY) {
    try {
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
      if (!rows.length) throw new Error(`FRED ${seriesId} API 无有效观测`);
      return rows; // 倒序:rows[0] 最新
    } catch (error) {
      console.warn(`[bubble-watch] FRED ${seriesId} API failed, try keyless CSV fallback: ${error.message}`);
    }
  }
  return fredGraphCsvObservations(seriesId, limit);
}

async function fredGraphCsvObservations(seriesId, limit) {
  const now = new Date();
  const daysBack = seriesId === 'CPIAUCSL'
    ? Math.max(700, limit * 45)
    : Math.max(120, limit * 4);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - daysBack);
  const params = new URLSearchParams({
    id: seriesId,
    cosd: start.toISOString().slice(0, 10)
  });
  const csv = await fetchWithTimeout(`https://fred.stlouisfed.org/graph/fredgraph.csv?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'text/csv,*/*' },
    timeoutMs: 20000
  });
  const rows = csv.trim().split(/\r?\n/u)
    .slice(1)
    .map((line) => {
      const [date, value] = line.split(',');
      return { date: String(date || '').trim(), value: Number(value) };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/u.test(row.date) && Number.isFinite(row.value))
    .slice(-limit)
    .reverse();
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

async function yahooLatestDailyQuote(symbol, range = '5d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const json = await fetchWithTimeout(url, { asJson: true, headers: { 'User-Agent': BROWSER_UA } });
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  for (let i = closes.length - 1; i >= 0; i--) {
    if (Number.isFinite(closes[i]) && closes[i] > 0) {
      return {
        symbol,
        price: closes[i],
        updatedAt: Number.isFinite(timestamps[i]) ? new Date(timestamps[i] * 1000).toISOString() : null
      };
    }
  }
  throw new Error(`Yahoo ${symbol} latest close 不足`);
}

async function yahooDailyCloses(symbol, range = '1y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const json = await fetchWithTimeout(url, { asJson: true, headers: { 'User-Agent': BROWSER_UA } });
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const rows = timestamps
    .map((ts, i) => ({
      date: new Date(Number(ts) * 1000).toISOString().slice(0, 10),
      close: Number(closes[i])
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/u.test(row.date) && Number.isFinite(row.close) && row.close > 0);
  if (rows.length < 80) throw new Error(`Yahoo ${symbol} daily closes 不足 (${rows.length})`);
  return rows;
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

async function edgarSubmissions(cik) {
  const padded = String(cik || '').replace(/\D/gu, '').padStart(10, '0');
  if (!/^\d{10}$/u.test(padded)) throw new Error(`SEC CIK 无效:${cik}`);
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  return fetchWithTimeout(url, { asJson: true, headers: { 'User-Agent': EDGAR_UA, Accept: 'application/json' } });
}

function parseSecNumber(value) {
  const n = Number(String(value || '').replace(/,/gu, '').trim());
  return Number.isFinite(n) ? n : null;
}

function secXmlValue(block, tag) {
  const direct = String(block || '').match(new RegExp(`<${tag}[^>]*>\\s*<value>([\\s\\S]*?)<\\/value>`, 'iu'));
  if (direct) return direct[1].replace(/<[^>]*>/gu, '').trim();
  const wrapped = String(block || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'iu'));
  return wrapped ? wrapped[1].replace(/<[^>]*>/gu, '').trim() : '';
}

function recentSecFilings(submissions, forms, maxAgeDays = 365, limit = 80) {
  const recent = submissions?.filings?.recent || {};
  const formRows = recent.form || [];
  const filingDates = recent.filingDate || [];
  const accessionNumbers = recent.accessionNumber || [];
  const primaryDocuments = recent.primaryDocument || [];
  const reportDates = recent.reportDate || [];
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const allowed = forms instanceof Set ? forms : new Set(forms);
  const rows = [];
  for (let i = 0; i < formRows.length; i += 1) {
    const form = String(formRows[i] || '').trim().toUpperCase();
    const filingDate = String(filingDates[i] || '');
    const filedMs = Date.parse(`${filingDate}T00:00:00Z`);
    if (!allowed.has(form) || !Number.isFinite(filedMs) || filedMs < cutoff) continue;
    rows.push({
      form,
      filingDate,
      reportDate: reportDates[i] || null,
      accessionNumber: accessionNumbers[i],
      primaryDocument: primaryDocuments[i]
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

async function fetchSecForm4InsiderTotals(symbol, cik) {
  const submissions = await edgarSubmissions(cik);
  const filings = recentSecFilings(submissions, new Set(['4']), 365, 80);
  let buy = 0;
  let sell = 0;
  let transactionCount = 0;
  const issuerCik = String(cik).replace(/^0+/u, '');
  for (const filing of filings) {
    if (!filing.accessionNumber || !filing.primaryDocument) continue;
    const accessionPath = String(filing.accessionNumber).replace(/-/gu, '');
    const primaryDocument = String(filing.primaryDocument).replace(/^\/+/u, '');
    const url = `https://www.sec.gov/Archives/edgar/data/${issuerCik}/${accessionPath}/${primaryDocument}`;
    let xml;
    try {
      xml = await fetchWithTimeout(url, { headers: { 'User-Agent': EDGAR_UA, Accept: 'application/xml,text/xml,text/html' }, timeoutMs: 15000 });
    } catch (error) {
      console.warn(`[bubble-watch] SEC Form 4 ${symbol} filing ${filing.accessionNumber} fetch failed: ${error.message}`);
      continue;
    }
    const txRe = /<nonDerivativeTransaction\b[^>]*>([\s\S]*?)<\/nonDerivativeTransaction>/giu;
    let m;
    while ((m = txRe.exec(xml)) !== null) {
      const block = m[1];
      const code = secXmlValue(block, 'transactionCode').toUpperCase();
      if (code !== 'P' && code !== 'S') continue;
      const shares = parseSecNumber(secXmlValue(block, 'transactionShares'));
      const price = parseSecNumber(secXmlValue(block, 'transactionPricePerShare'));
      if (!(shares > 0) || !(price > 0)) continue;
      const amount = shares * price;
      if (code === 'P') buy += amount;
      else sell += amount;
      transactionCount += 1;
    }
    await delay(120);
  }
  if (buy === 0 && sell === 0) throw new Error(`SEC Form 4 ${symbol} 近 12 个月未解析到 P/S 交易`);
  return { buy, sell, filingCount: filings.length, transactionCount };
}

async function fetchXoomarForm4InsiderTotals(symbol) {
  const json = await fetchWithTimeout(`https://xoomar.com/api/markets/insiders/${encodeURIComponent(symbol)}`, {
    asJson: true,
    headers: { 'User-Agent': UA, Accept: 'application/json' }
  });
  const payload = json?.data;
  const rows = payload?.transactions;
  if (String(payload?.ticker || '').toUpperCase() !== symbol || !Array.isArray(rows)) {
    throw new Error(`Xoomar Form 4 ${symbol} schema changed`);
  }
  const updatedAtMs = Date.parse(json?.updatedAt || '');
  const ageHours = (Date.now() - updatedAtMs) / 3600000;
  if (!Number.isFinite(updatedAtMs) || ageHours < -1 || ageHours > XOOMAR_INSIDER_MAX_AGE_HOURS) {
    throw new Error(`Xoomar Form 4 ${symbol} updatedAt stale/invalid`);
  }
  const cutoff = Date.now() - 365 * 86400000;
  let buy = 0;
  let sell = 0;
  let transactionCount = 0;
  let coverageStart = null;
  for (const row of rows) {
    const txDate = String(row?.txDate || '');
    const txDateMs = Date.parse(`${txDate}T00:00:00Z`);
    const code = String(row?.txCode || '').toUpperCase();
    const amount = Number(row?.valueUsd);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(txDate) || !Number.isFinite(txDateMs) || txDateMs < cutoff || row?.isOpenMarket !== true) continue;
    if (code !== 'P' && code !== 'S') continue;
    if (!(amount > 0)) continue;
    if (code === 'P') buy += amount;
    else sell += amount;
    transactionCount += 1;
    if (!coverageStart || txDate < coverageStart) coverageStart = txDate;
  }
  if (buy === 0 && sell === 0) throw new Error(`Xoomar Form 4 ${symbol} 近 12 个月未解析到 P/S 交易`);
  return {
    buy,
    sell,
    filingCount: null,
    transactionCount,
    updatedAt: json.updatedAt,
    coverageStart,
    recordCount: rows.length,
    recordLimitReached: rows.length >= 200
  };
}

let insiderSecBlockedReason = null;

async function fetchInsiderTotals(symbol) {
  const cik = EDGAR_CIK[symbol];
  if (!cik) throw new Error(`SEC Form 4 CIK missing for ${symbol}`);
  if (!insiderSecBlockedReason) {
    try {
      const totals = await fetchSecForm4InsiderTotals(symbol, cik);
      return {
        ...totals,
        source: 'SEC EDGAR Form 4 ownership XML',
        sourceMode: 'sec_form4_primary'
      };
    } catch (error) {
      if (/HTTP 403/iu.test(error.message)) insiderSecBlockedReason = error.message;
      console.warn(`[bubble-watch] SEC Form 4 ${symbol} 失败,改走 Xoomar HTTPS fallback: ${error.message}`);
      const totals = await fetchXoomarForm4InsiderTotals(symbol);
      return {
        ...totals,
        source: 'Xoomar public Form 4 HTTPS mirror',
        sourceMode: 'xoomar_form4_fallback',
        primaryFailure: error.message
      };
    }
  }
  const totals = await fetchXoomarForm4InsiderTotals(symbol);
  return {
    ...totals,
    source: 'Xoomar public Form 4 HTTPS mirror',
    sourceMode: 'xoomar_form4_fallback',
    primaryFailure: 'SEC Form 4 skipped after prior HTTP 403 from shared runner egress'
  };
}

async function fetchSecCompanyTickersExchange() {
  const json = await fetchWithTimeout('https://www.sec.gov/files/company_tickers_exchange.json', {
    asJson: true,
    headers: { 'User-Agent': EDGAR_UA, Accept: 'application/json' }
  });
  const fields = Array.isArray(json?.fields) ? json.fields : [];
  const rows = Array.isArray(json?.data) ? json.data : [];
  const cikIdx = fields.indexOf('cik');
  const nameIdx = fields.indexOf('name');
  const tickerIdx = fields.indexOf('ticker');
  const exchangeIdx = fields.indexOf('exchange');
  if (cikIdx < 0 || nameIdx < 0) throw new Error('SEC company_tickers_exchange schema changed');
  return rows
    .map((row) => ({
      cik: String(row[cikIdx] || '').padStart(10, '0'),
      name: String(row[nameIdx] || ''),
      ticker: tickerIdx >= 0 ? String(row[tickerIdx] || '') : '',
      exchange: exchangeIdx >= 0 ? String(row[exchangeIdx] || '') : ''
    }))
    .filter((row) => /^\d{10}$/u.test(row.cik) && row.name);
}

async function fetchSecAiIpoFilingConfirmations(ctx = {}) {
  const rows = await fetchSecCompanyTickersExchange();
  const extraWatchlist = Array.isArray(ctx.config?.params?.aiIpoSecWatchlist)
    ? ctx.config.params.aiIpoSecWatchlist.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  const watchlist = [...new Set([...AI_IPO_WATCHLIST, ...extraWatchlist])];
  const candidates = [];
  for (const company of rows) {
    const matchedName = watchlist.find((name) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+'), 'iu').test(company.name));
    if (matchedName) candidates.push({ ...company, matchedName });
  }
  const filings = [];
  for (const company of candidates.slice(0, 16)) {
    try {
      const submissions = await edgarSubmissions(company.cik);
      const recent = recentSecFilings(submissions, SEC_AI_IPO_FORMS, 365, 12);
      for (const filing of recent) {
        filings.push({
          company: company.name,
          matchedName: company.matchedName,
          cik: company.cik,
          ticker: company.ticker || null,
          exchange: company.exchange || null,
          form: filing.form,
          filingDate: filing.filingDate,
          accessionNumber: filing.accessionNumber || null
        });
      }
      await delay(120);
    } catch (error) {
      console.warn(`[bubble-watch] SEC IPO filing check ${company.name} failed: ${error.message}`);
    }
  }
  return {
    checkedCompanies: candidates.map((company) => ({
      name: company.name,
      matchedName: company.matchedName,
      ticker: company.ticker || null,
      exchange: company.exchange || null
    })),
    filings,
    filingCount: filings.length,
    companyCount: new Set(filings.map((filing) => filing.matchedName || filing.company)).size
  };
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

async function fetchBarchartS5fiBreadth() {
  const html = await fetchWithTimeout('https://www.barchart.com/stocks/quotes/$S5FI', { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' } });
  const normalized = html.replace(/&quot;/gu, '"').replace(/&amp;/gu, '&');
  const valueMatch = normalized.match(/"symbolName":"S&P 500 Stocks Above 50-Day Average"[^{}]{0,900}?"lastPrice":"?([0-9.]+)/u)
    || normalized.match(/"symbol":"\$S5FI"[^{}]{0,900}?"lastPrice":"?([0-9.]+)/u)
    || normalized.match(/lastPrice":"?([0-9]{1,2}\.[0-9]+)/u);
  const pct = Number(valueMatch?.[1]);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Barchart $S5FI 未解析到 0-100 区间 lastPrice');
  const tradeTime = normalized.match(/"tradeTime":"([^"]+)"/u)?.[1] || null;
  const sessionDate = normalized.match(/"sessionDateDisplayLong":"([^"]+)"/u)?.[1] || null;
  return { pct, tradeTime, sessionDate };
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

const SA_METRICS_CACHE = new Map();
async function fetchSaMetricsPage(ticker, pathSuffix = 'metrics/') {
  const key = `${ticker}|${pathSuffix}`;
  if (SA_METRICS_CACHE.has(key)) return SA_METRICS_CACHE.get(key);
  const url = `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/${pathSuffix}`;
  const html = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } });
  SA_METRICS_CACHE.set(key, html);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return html;
}

function parseSaCompactNumber(text, kind) {
  const raw = String(text || '').replace(/\s+/gu, '').replace(/,/gu, '');
  if (!raw || raw === '-' || /upgrade/iu.test(raw)) return null;
  const m = raw.match(/^(-?[0-9]+(?:\.[0-9]+)?)([KMBT])?(%)?$/iu);
  if (!m) return null;
  if (kind === 'percent' && m[3] !== '%') return null;
  if (kind === 'money' && m[3] === '%') return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  if (kind === 'percent') return value;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || '').toUpperCase()] || 1;
  return value * multiplier;
}

function parseSaMetricRow(html, label, kind, minCount = 1) {
  const values = [];
  let from = 0;
  while (from < html.length) {
    const idx = html.indexOf(label, from);
    if (idx < 0) break;
    from = idx + label.length;
    const trStart = html.lastIndexOf('<tr', idx);
    const trEnd = html.indexOf('</tr>', idx);
    if (trStart < 0 || trEnd < idx) continue;
    const row = html.slice(trStart, trEnd + 5).replace(/<!--[\s\S]*?-->/gu, '');
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map((m) => m[1]);
    if (cells.length < 2) continue;
    const rowValues = cells.slice(1)
      .map((cell) => parseSaCompactNumber(htmlToText(cell), kind))
      .filter((value) => Number.isFinite(value));
    if (rowValues.length >= minCount) return rowValues;
    values.push(...rowValues);
  }
  if (values.length >= minCount) return values;
  throw new Error(`stockanalysis metrics 行「${label}」未解析到 ≥${minCount} 个${kind === 'percent' ? '百分比' : '数值'}`);
}

const SA_RPO_METRICS = {
  MSFT: {
    pathSuffix: 'metrics/',
    valueLabel: 'Commercial Remaining Performance Obligations',
    growthLabel: 'Commercial Remaining Performance Obligations Growth',
    cadence: 'quarterly'
  },
  AMZN: {
    pathSuffix: 'metrics/',
    valueLabel: 'AWS Remaining Performance Obligations',
    growthLabel: 'AWS Remaining Performance Obligations Growth',
    cadence: 'quarterly'
  },
  GOOGL: {
    pathSuffix: 'metrics/',
    valueLabel: 'Remaining Performance Obligations',
    growthLabel: 'Remaining Performance Obligations Growth',
    cadence: 'quarterly'
  },
  ORCL: {
    pathSuffix: 'financials/metrics/',
    valueLabel: 'Remaining Performance Obligations (RPO)',
    growthLabel: 'Remaining Performance Obligations (RPO) Growth',
    cadence: 'annual'
  }
};

async function fetchStockAnalysisRpoMetric(ticker) {
  const cfg = SA_RPO_METRICS[ticker];
  if (!cfg) throw new Error(`未配置 StockAnalysis RPO ticker:${ticker}`);
  const html = await fetchSaMetricsPage(ticker, cfg.pathSuffix);
  const minValues = cfg.cadence === 'quarterly' ? 5 : 2;
  const values = parseSaMetricRow(html, cfg.valueLabel, 'money', minValues);
  const growths = parseSaMetricRow(html, cfg.growthLabel, 'percent', 1);
  const currentValueUsd = values[0];
  const priorYearValueUsd = cfg.cadence === 'quarterly' ? values[4] : values[1];
  if (!(currentValueUsd > 0 && priorYearValueUsd > 0)) throw new Error(`${ticker} StockAnalysis RPO 当前/同比基数无效`);
  const computedYoyPct = ((currentValueUsd - priorYearValueUsd) / priorYearValueUsd) * 100;
  const yoyPct = Number.isFinite(growths[0]) ? growths[0] : computedYoyPct;
  let prevPeriodValueUsd = null;
  let prevPeriodComparableUsd = null;
  if (cfg.cadence === 'quarterly' && values[1] > 0 && values[5] > 0) {
    prevPeriodValueUsd = values[1];
    prevPeriodComparableUsd = values[5];
  } else if (cfg.cadence === 'annual' && values[1] > 0 && Number.isFinite(growths[1])) {
    prevPeriodValueUsd = values[1];
    prevPeriodComparableUsd = values[1] / (1 + growths[1] / 100);
  }
  const prevYoyPct = prevPeriodValueUsd > 0 && prevPeriodComparableUsd > 0
    ? ((prevPeriodValueUsd - prevPeriodComparableUsd) / prevPeriodComparableUsd) * 100
    : null;
  return {
    ticker,
    source: `StockAnalysis ${cfg.pathSuffix}`,
    cadence: cfg.cadence,
    currentValueUsd,
    priorYearValueUsd,
    yoyPct,
    prevPeriodValueUsd,
    prevPeriodComparableUsd,
    prevYoyPct,
    parsedValues: values.length,
    parsedGrowths: growths.length
  };
}

function saT4qYoy(numsNewestFirst) {
  const now = numsNewestFirst.slice(0, 4).reduce((a, b) => a + b, 0);
  const prev = numsNewestFirst.slice(4, 8).reduce((a, b) => a + b, 0);
  if (prev === 0) return null;
  return { now, prev, yoyPct: ((now - prev) / Math.abs(prev)) * 100 };
}

function trailing4qCapexOcfCoverage(rowsOldestFirst) {
  if (rowsOldestFirst.length < 8) return null;
  const rows = rowsOldestFirst.slice(-8);
  const prevRows = rows.slice(0, 4);
  const nowRows = rows.slice(4);
  const sum = (items, key) => items.reduce((acc, row) => acc + row[key], 0);
  const nowOcf = sum(nowRows, 'ocf');
  const prevOcf = sum(prevRows, 'ocf');
  const nowCapex = sum(nowRows, 'capex');
  const prevCapex = sum(prevRows, 'capex');
  if (!(nowOcf > 0 && prevOcf > 0)) return null;
  return {
    nowOcf,
    prevOcf,
    nowCapex,
    prevCapex,
    capexOcfPct: (nowCapex / nowOcf) * 100,
    prevCapexOcfPct: (prevCapex / prevOcf) * 100,
    fcfNow: nowOcf - nowCapex,
    fcfPrev: prevOcf - prevCapex,
    latestEnd: rows[rows.length - 1].end
  };
}

function saT4qCapexOcfCoverage(ocfNewestFirst, capexNewestFirst) {
  const n = Math.min(ocfNewestFirst.length, capexNewestFirst.length);
  if (n < 8) return null;
  const rowsOldestFirst = Array.from({ length: n }, (_, i) => ({
    end: `stockanalysis-index-${i}`,
    ocf: ocfNewestFirst[i],
    capex: Math.abs(capexNewestFirst[i])
  })).reverse();
  return trailing4qCapexOcfCoverage(rowsOldestFirst);
}

function classifyHyperscalerCashFlowCoverage(ratioPct, over100Count) {
  if (ratioPct >= 75 || over100Count >= 2) return 'red';
  if (ratioPct >= 60 || over100Count >= 1) return 'yellow';
  return 'green';
}

function buildHyperscalerCashFlowCoverageSelfContractAudit({ companies, sourceTag, ratioPct, status, perCompany, nowOcf, nowCapex, prevOcf, prevCapex }) {
  const replayNowOcf = perCompany.reduce((acc, c) => acc + c.nowOcf, 0);
  const replayNowCapex = perCompany.reduce((acc, c) => acc + c.nowCapex, 0);
  const replayPrevOcf = perCompany.reduce((acc, c) => acc + c.prevOcf, 0);
  const replayPrevCapex = perCompany.reduce((acc, c) => acc + c.prevCapex, 0);
  const replayRatioPct = (replayNowCapex / replayNowOcf) * 100;
  const over100Count = perCompany.filter((c) => c.capexOcfPct >= 100).length;
  const replayStatus = classifyHyperscalerCashFlowCoverage(replayRatioPct, over100Count);
  return {
    status: 'passed',
    formula: 'big5_realized_ttm_cash_capex_to_operating_cash_flow',
    formulaText: 'sum(last four quarters cash capital expenditures) / sum(last four quarters operating cash flow)',
    legacyIndicatorId: 'mag4_fcf_yoy',
    refitReason: 'same_score_slot_refit_from_fcf_yoy_to_epoch_apollo_style_cash_flow_coverage',
    source: sourceTag,
    sourcePriority: ['SEC EDGAR companyconcept', 'StockAnalysis quarterly cash-flow mirror'],
    sourceIndependence: 'does_not_require_external_reference_site',
    upstreamReferencePolicy: 'optional_non_authoritative_drift_signal_only',
    fallbackPolicy: 'use_local_big5_capex_ocf_snapshot_only; upstream_or_reference_editorial_snapshots_are_not_eligible_fallback',
    requiredCompanies: companies,
    usedCompanies: perCompany.map((c) => c.ticker),
    minCompanyCount: companies.length,
    aggregateOcfB: Number((nowOcf / 1e9).toFixed(1)),
    aggregateCapexB: Number((nowCapex / 1e9).toFixed(1)),
    aggregateFcfB: Number(((nowOcf - nowCapex) / 1e9).toFixed(1)),
    priorAggregateOcfB: Number((prevOcf / 1e9).toFixed(1)),
    priorAggregateCapexB: Number((prevCapex / 1e9).toFixed(1)),
    capexOcfPct: Number(ratioPct.toFixed(1)),
    priorCapexOcfPct: Number(((prevCapex / prevOcf) * 100).toFixed(1)),
    replayAggregateOcfB: Number((replayNowOcf / 1e9).toFixed(1)),
    replayAggregateCapexB: Number((replayNowCapex / 1e9).toFixed(1)),
    replayCapexOcfPct: Number(replayRatioPct.toFixed(1)),
    companiesOver100Pct: over100Count,
    thresholdRule: '>=75% or >=2 companies above 100% red / >=60% or >=1 company above 100% yellow / <60% green',
    thresholdReplayStatus: replayStatus,
    publishedStatus: status,
    perCompany: perCompany.map((c) => ({
      ticker: c.ticker,
      ocfTtmB: Number((c.nowOcf / 1e9).toFixed(1)),
      capexTtmB: Number((c.nowCapex / 1e9).toFixed(1)),
      fcfTtmB: Number((c.fcfNow / 1e9).toFixed(1)),
      capexOcfPct: Number(c.capexOcfPct.toFixed(1))
    }))
  };
}

function buildHyperscalerCashFlowCoverageReferenceAudit() {
  return {
    status: 'not_required_for_publication',
    role: 'optional_non_authoritative_drift_signal',
    requiredForPublication: false,
    adoptedSourceLogic: 'Epoch AI / Apollo style Big5 hyperscaler cash capex divided by operating cash flow',
    reviewedSourceLogic: [
      { source: 'Epoch AI', logic: 'Big5 hyperscaler capex vs operating cash flow', decision: 'adopted_hard_and_sensitive' },
      { source: 'Apollo', logic: 'hyperscaler capex as percent of operating cash flow', decision: 'adopted_as_confirmation' },
      { source: 'Saxo', logic: 'Mag4 earnings and AI capex payback narrative', decision: 'sample_confirmation_not_formula' },
      { source: 'Goldman Sachs', logic: 'AI capex payback and macro bubble debate', decision: 'framework_only' },
      { source: 'Footnotes Analyst', logic: 'FCF quality and lease-adjusted hyperscaler cash-flow analysis', decision: 'methodology_warning' },
      { source: 'AI bubble monitor reference site', logic: 'estimated/editorial FCF pressure snapshot', decision: 'drift_signal_not_hard_formula' }
    ],
    arbitration: 'publish_local_big5_capex_ocf_coverage; do_not_override_with_forward_or_single-company_pressure_without_contract_change',
    disappearancePolicy: 'continue_local_big5_capex_ocf_formula_when_reference_site_is_unreachable_or_removed'
  };
}

function monthsBetweenIso(a, b) {
  return (new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / (30.4375 * 86400000);
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

async function crunchbaseWpSearch(query, perPage = 8) {
  const params = new URLSearchParams({ search: query, per_page: String(perPage) });
  const rows = await fetchWithTimeout(`https://news.crunchbase.com/wp-json/wp/v2/search?${params}`, {
    asJson: true,
    headers: { 'User-Agent': BROWSER_UA }
  });
  if (!Array.isArray(rows)) throw new Error('Crunchbase search 返回结构异常');
  return rows
    .filter((row) => row?.id)
    .map((row) => ({
      id: row.id,
      title: htmlToText(typeof row.title === 'object' ? row.title?.rendered : row.title),
      url: row.url || row.link || null
    }));
}

async function crunchbaseWpPost(id) {
  const params = new URLSearchParams({
    _fields: 'id,date,link,title,excerpt,content'
  });
  const post = await fetchWithTimeout(`https://news.crunchbase.com/wp-json/wp/v2/posts/${id}?${params}`, {
    asJson: true,
    headers: { 'User-Agent': BROWSER_UA }
  });
  const title = htmlToText(post?.title?.rendered || post?.title || '');
  const text = htmlToText(`${post?.title?.rendered || ''} ${post?.excerpt?.rendered || ''} ${post?.content?.rendered || ''}`);
  if (!title || !text) throw new Error(`Crunchbase post ${id} 正文解析失败`);
  return { id: post.id || id, date: post.date || null, link: post.link || null, title, text };
}

async function crunchbaseWpPosts(query, perPage = 10) {
  const params = new URLSearchParams({
    search: query,
    per_page: String(perPage),
    _fields: 'id,date,link,title,excerpt,content'
  });
  const rows = await fetchWithTimeout(`https://news.crunchbase.com/wp-json/wp/v2/posts?${params}`, {
    asJson: true,
    headers: { 'User-Agent': BROWSER_UA }
  });
  if (!Array.isArray(rows)) throw new Error('Crunchbase posts 返回结构异常');
  return rows.map((post) => ({
    id: post.id,
    date: post.date || null,
    link: post.link || null,
    title: htmlToText(post.title?.rendered || post.title || ''),
    text: htmlToText(`${post.title?.rendered || ''} ${post.excerpt?.rendered || ''} ${post.content?.rendered || ''}`)
  })).filter((post) => post.id && post.title);
}

function extractPublicSearchLinks(html, source) {
  const links = [];
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(m[1]);
    const title = htmlToText(m[2]);
    if (!title || title.length < 8) continue;
    if (source === 'SEC' && !/\/newsroom\/press-releases\//u.test(href)) continue;
    if (source === 'DOJ' && !/(\/opa\/pr\/|\/news\/press-releases\/|\/usao-|\/justice-news\?)/u.test(href)) continue;
    const start = Math.max(0, m.index - 240);
    const context = htmlToText(html.slice(start, Math.min(html.length, m.index + 520)));
    links.push({ source, href, title, context });
  }
  return links;
}

function extractTagText(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'iu');
  const m = String(xml || '').match(re);
  return m ? htmlToText(m[1]) : '';
}

function extractSecRssItems(xml) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/giu;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const item = m[1];
    const title = extractTagText(item, 'title');
    const href = extractTagText(item, 'link');
    const context = `${extractTagText(item, 'description')} ${extractTagText(item, 'dc:creator')}`.trim();
    const date = extractTagText(item, 'pubDate');
    if (title && href) items.push({ source: 'SEC RSS', href, title, context, date });
  }
  return items;
}

async function fetchSecPressReleaseRss() {
  const xml = await fetchWithTimeout('https://www.sec.gov/news/pressreleases.rss', {
    headers: { 'User-Agent': EDGAR_UA, Accept: 'application/rss+xml,text/xml,text/html' },
    timeoutMs: 15000
  });
  const items = extractSecRssItems(xml);
  if (!items.length) throw new Error('SEC press releases RSS 返回空列表');
  return items;
}

function unixDateToIso(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

async function fetchDojPressReleaseApi() {
  const params = new URLSearchParams({
    sort: 'created',
    direction: 'DESC',
    pagesize: '50',
    fields: 'date,title,url,body'
  });
  const json = await fetchWithTimeout(`https://www.justice.gov/api/v1/press_releases.json?${params}`, {
    asJson: true,
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    timeoutMs: 15000
  });
  const rows = Array.isArray(json?.results) ? json.results : [];
  if (!rows.length) throw new Error('DOJ News API press_releases 返回空列表');
  return rows.map((row) => ({
    source: 'DOJ News API',
    href: row.url || null,
    title: htmlToText(row.title || ''),
    context: htmlToText(row.body || ''),
    date: unixDateToIso(row.date) || String(row.date || '')
  })).filter((row) => row.title || row.context);
}

async function fetchPublicSearchPage(url, source) {
  const html = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } });
  return extractPublicSearchLinks(html, source);
}

function sumFiniteObjectValues(obj) {
  return Object.values(obj || {}).reduce((sum, value) => {
    const n = Number(value);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
}

function sumRows(rows, key) {
  return rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

function dropLikelyPartialLatestRow(rows, valueKey) {
  if (rows.length < 2) return { rows, droppedPartial: null };
  const latest = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  if ((Number(latest[valueKey]) || 0) > 0 && (Number(latest[valueKey]) || 0) < (Number(prev[valueKey]) || 0) * 0.5) {
    return { rows: rows.slice(0, -1), droppedPartial: latest };
  }
  return { rows, droppedPartial: null };
}

// ---------- 各指标构建(auto) ----------

function classifyNumeric(value, redAbove, yellowAbove) {
  // 越高越红型:value > redAbove → red;> yellowAbove → yellow;否则 green
  if (value > redAbove) return 'red';
  if (value > yellowAbove) return 'yellow';
  return 'green';
}

function summarizeRpoGrowthPanel(rows, sourceTag, sourceNote) {
  if (rows.length < 2) throw new Error(`RPO 可用公司不足 (${rows.length})`);
  const latestYoySum = rows.reduce((sum, row) => ({
    now: sum.now + row.currentValueUsd,
    prev: sum.prev + row.priorYearValueUsd
  }), { now: 0, prev: 0 });
  const priorRows = rows.filter((row) => row.prevPeriodValueUsd > 0 && row.prevPeriodComparableUsd > 0);
  const priorYoySum = priorRows.reduce((sum, row) => ({
    now: sum.now + row.prevPeriodValueUsd,
    prev: sum.prev + row.prevPeriodComparableUsd
  }), { now: 0, prev: 0 });
  const yoy = ((latestYoySum.now - latestYoySum.prev) / latestYoySum.prev) * 100;
  const prevYoy = priorRows.length >= 2 && priorYoySum.prev > 0
    ? ((priorYoySum.now - priorYoySum.prev) / priorYoySum.prev) * 100
    : null;
  if (!Number.isFinite(yoy)) throw new Error('RPO YoY 计算失败');
  const decel = prevYoy !== null && yoy < prevYoy - 2;
  const status = yoy < 0 ? 'red' : decel ? 'yellow' : 'green';
  const companySummary = rows.map((row) => `${row.ticker} ${fmtPct(row.yoyPct, 0, true)}`).join(' / ');
  return {
    status,
    value_display: fmtPct(yoy, 0, true),
    note: `${sourceTag}实拉 ${rows.map((c) => c.ticker).join('/')} RPO / 云 backlog 合计 $${(latestYoySum.now / 1e12).toFixed(2)}T,同比 ${fmtPct(yoy, 1, true)}${prevYoy !== null ? `(上一披露期同比 ${fmtPct(prevYoy, 1, true)},${decel ? '边际减速' : '未见减速'})` : ''};分公司:${companySummary}。${sourceNote}判级:负增长=红 / 减速=黄 / 加速=绿`,
    detail: {
      yoyPct: yoy,
      prevYoyPct: prevYoy,
      companies: rows.map((c) => c.ticker),
      sourceTag,
      rows: rows.map((row) => ({
        ticker: row.ticker,
        cadence: row.cadence || 'quarterly',
        currentValueB: Number((row.currentValueUsd / 1e9).toFixed(1)),
        priorYearValueB: Number((row.priorYearValueUsd / 1e9).toFixed(1)),
        yoyPct: Number(row.yoyPct.toFixed(1)),
        prevYoyPct: row.prevYoyPct === null ? null : Number(row.prevYoyPct.toFixed(1)),
        source: row.source || sourceTag
      }))
    }
  };
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
    const companies = ['AMZN', 'MSFT', 'GOOGL', 'META', 'ORCL'];
    let perCompany = [];
    let sourceTag = 'SEC EDGAR';
    try {
      for (const ticker of companies) {
        const ocfUnits = await edgarConcept(EDGAR_CIK[ticker], ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']);
        const capexUnits = await edgarConcept(EDGAR_CIK[ticker], ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
        const capexQ = new Map(deriveQuarterlySeries(capexUnits).map((q) => [q.end, Math.abs(q.val)]));
        const rows = deriveQuarterlySeries(ocfUnits)
          .filter((q) => capexQ.has(q.end))
          .map((q) => ({ end: q.end, ocf: q.val, capex: capexQ.get(q.end) }));
        const coverage = trailing4qCapexOcfCoverage(rows);
        if (coverage) perCompany.push({ ticker, ...coverage });
      }
    } catch (error) {
      console.warn(`[bubble-watch] EDGAR Big5 cash-flow coverage 链失败,改走 stockanalysis 镜像: ${error.message}`);
      perCompany = [];
    }
    if (perCompany.length !== companies.length) {
      sourceTag = 'stockanalysis 季报镜像';
      perCompany = [];
      for (const ticker of companies) {
        const html = await retry(() => fetchSaFinancialPage(ticker, 'cash-flow-statement/'), `SA cash-flow ${ticker}`);
        const ocf = parseSaQuarterlyRow(html, 'Operating Cash Flow');
        const capex = parseSaQuarterlyRow(html, 'Capital Expenditures'); // 负值
        const coverage = saT4qCapexOcfCoverage(ocf, capex);
        if (coverage) perCompany.push({ ticker, ...coverage });
      }
    }
    if (perCompany.length !== companies.length) throw new Error(`Big5 cash-flow coverage 可用公司不足 (${perCompany.length}/${companies.length})`);
    const nowOcf = perCompany.reduce((a, c) => a + c.nowOcf, 0);
    const prevOcf = perCompany.reduce((a, c) => a + c.prevOcf, 0);
    const nowCapex = perCompany.reduce((a, c) => a + c.nowCapex, 0);
    const prevCapex = perCompany.reduce((a, c) => a + c.prevCapex, 0);
    const ratioPct = (nowCapex / nowOcf) * 100;
    const prevRatioPct = (prevCapex / prevOcf) * 100;
    const ratioChangePct = ratioPct - prevRatioPct;
    const over100Count = perCompany.filter((c) => c.capexOcfPct >= 100).length;
    const status = classifyHyperscalerCashFlowCoverage(ratioPct, over100Count);
    return {
      status,
      value_display: `≈${ratioPct.toFixed(0)}%`,
      note: `${sourceTag}实拉 ${perCompany.map((c) => c.ticker).join('/')} 滚动 4 季经营现金流 $${(nowOcf / 1e9).toFixed(0)}B、cash capex $${(nowCapex / 1e9).toFixed(0)}B,capex/OCF ≈${ratioPct.toFixed(1)}%(上年同期 ${prevRatioPct.toFixed(1)}%,变化 ${fmtPct(ratioChangePct, 1, true)});${over100Count}/5 家 capex 已超过 OCF。该口径采用 Epoch/Apollo 式 hyperscaler 现金流覆盖率,比单纯 FCF YoY 更敏感。阈值:≥75%或2家>100%=红 / 60-75%或1家>100%=黄 / <60%=绿`,
      detail: {
        ratioPct,
        prevRatioPct,
        ratioChangePct,
        over100Count,
        source: sourceTag,
        formula: 'big5_realized_ttm_cash_capex_to_operating_cash_flow',
        legacyFormula: 'realized_ttm_aggregate_operating_cash_flow_plus_capex',
        adoptedModel: 'epoch_apollo_big5_cash_capex_to_ocf_coverage',
        perCompany: perCompany.map((c) => ({
          ticker: c.ticker,
          ocfTtmB: Number((c.nowOcf / 1e9).toFixed(1)),
          capexTtmB: Number((c.nowCapex / 1e9).toFixed(1)),
          fcfTtmB: Number((c.fcfNow / 1e9).toFixed(1)),
          capexOcfPct: Number(c.capexOcfPct.toFixed(1))
        })),
        selfContractAudit: buildHyperscalerCashFlowCoverageSelfContractAudit({ companies, sourceTag, ratioPct, status, perCompany, nowOcf, nowCapex, prevOcf, prevCapex }),
        externalReferenceAudit: buildHyperscalerCashFlowCoverageReferenceAudit(),
        windCrossCheck: { status: WIND_API_KEY ? 'not_run_in_builder_public_primary_succeeded' : 'skipped_no_wind_key' }
      }
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
    try {
      const direct = await retry(fetchBarchartS5fiBreadth, 'Barchart $S5FI');
      const status = direct.pct < 40 ? 'red' : direct.pct <= 60 ? 'yellow' : 'green';
      return {
        status,
        value_display: `≈${direct.pct.toFixed(0)}%`,
        source_name: 'Barchart $S5FI direct breadth index',
        note: `Barchart $S5FI 直接广度指数显示 S&P 500 收于 50 日均线上方比例 ${direct.pct.toFixed(1)}%${direct.sessionDate ? `(${direct.sessionDate})` : ''};该源为 S&P 500 50 日均线广度直接指数。阈值:<40% 红 / 40-60% 黄 / >60% 绿`,
        detail: {
          source: 'Barchart:$S5FI',
          pct: direct.pct,
          tradeTime: direct.tradeTime,
          sessionDate: direct.sessionDate,
          fallbackCalculator: 'Yahoo Chart × Wikipedia constituents not used'
        }
      };
    } catch (error) {
      console.warn(`[bubble-watch] Barchart $S5FI 直接广度源失败,回退 Yahoo/Wikipedia 实算: ${error.message}`);
    }
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
      note: `Barchart $S5FI 直接源暂不可用,回退 Yahoo Chart 全市场实算:S&P 500 成份股 ${counted} 只(Wikipedia 实时名单)中 ${above} 只收于 50 日均线上方,占比 ≈${pct.toFixed(1)}%。阈值:<40% 红 / 40-60% 黄 / >60% 绿`,
      detail: { source: 'Yahoo Chart × Wikipedia constituents fallback', above, counted, pct }
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
    const sources = [];
    const fallbackSymbols = [];
    const primaryFailures = [];
    const sourceFailures = [];
    for (const symbol of basket) {
      try {
        const totals = await retry(() => fetchInsiderTotals(symbol), `SEC/Xoomar Form 4 ${symbol}`);
        sources.push({
          symbol,
          source: totals.source,
          sourceMode: totals.sourceMode,
          buyUsd: totals.buy,
          sellUsd: totals.sell,
          filingCount: totals.filingCount || null,
          transactionCount: totals.transactionCount || null,
          updatedAt: totals.updatedAt || null,
          coverageStart: totals.coverageStart || null,
          recordCount: totals.recordCount || null,
          recordLimitReached: totals.recordLimitReached === true
        });
        if (totals.sourceMode === 'xoomar_form4_fallback') fallbackSymbols.push(symbol);
        if (totals.primaryFailure) primaryFailures.push({ symbol, reason: totals.primaryFailure });
      } catch (error) {
        sourceFailures.push({ symbol, reason: error.message });
        console.warn(`[bubble-watch] SEC/Xoomar Form 4 ${symbol} unavailable after retries: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const coverage = evaluateInsiderLiveCoverage({ requestedSymbols: basket, liveRows: sources });
    if (!coverage.usable) {
      throw new Error(`${coverage.reasonCode}: successful=${coverage.successfulSymbols.join('/') || 'none'}; missing=${coverage.missingSymbols.join('/') || 'none'}`);
    }
    const { buyUsd: buy, sellUsd: sell, ratio } = coverage;
    const status = coverage.publishedStatusOverride || (ratio > 20 ? 'red' : ratio >= 5 ? 'yellow' : 'green');
    const display = coverage.publishedValueOverride || (ratio > 99 ? '≫20x' : `~${ratio.toFixed(0)}x`);
    const sourceName = coverage.coverageStatus === 'partial'
      ? 'SEC EDGAR Form 4 + Xoomar HTTPS partial live coverage'
      : fallbackSymbols.length
      ? 'SEC EDGAR Form 4 + Xoomar HTTPS fallback'
      : 'SEC EDGAR Form 4 ownership XML';
    const sourceNote = coverage.coverageStatus === 'partial'
      ? `SEC/Xoomar 实时链本轮覆盖 ${coverage.successfulSymbols.join('/')},${coverage.missingSymbols.join('/')} 连续失败;仅在已覆盖标的卖买比达到 ≥5x 时按黄灯方向发布`
      : fallbackSymbols.length
      ? `SEC EDGAR 不可达标的 ${fallbackSymbols.join('/')} 已改用 Xoomar public Form 4 HTTPS mirror`
      : 'SEC EDGAR Form 4 官方披露';
    const coverageLabel = coverage.coverageStatus === 'partial'
      ? `${coverage.successfulSymbols.join(' / ')} 两个新鲜实时标的(原篮子 ${basket.join(' / ')})`
      : `${basket.join(' / ')} 近 12 个月范围内最新可得 Form 4`;
    return {
      status,
      value_display: display,
      source_name: sourceName,
      note: `${sourceNote}。${coverageLabel}:累计卖出 $${(sell / 1e9).toFixed(1)}B、买入 $${(buy / 1e6).toFixed(0)}M,卖买比 ≈${ratio > 99 ? '>99' : ratio.toFixed(1)}x(买入不足 $1M 时按 $1M 下限折算);2000 年顶部极值约 23x。阈值:>20x 红 / 5-20x 黄 / <5x 绿`,
      detail: {
        buyUsd: buy,
        sellUsd: sell,
        ratio,
        sources,
        fallbackSymbols,
        primaryFailures,
        sourceFailures,
        coverageStatus: coverage.coverageStatus,
        coverageReasonCode: coverage.reasonCode,
        requestedSymbols: coverage.requestedSymbols,
        successfulSymbols: coverage.successfulSymbols,
        missingSymbols: coverage.missingSymbols,
        minimumSuccessfulSymbols: coverage.minimumSuccessfulSymbols,
        minimumPartialRatio: coverage.minimumPartialRatio,
        partialCoveragePolicy: coverage.policy
      }
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
    const rows = [];
    for (const ticker of companies) {
      try {
        const units = await retry(() => edgarConcept(EDGAR_CIK[ticker], ['RevenueRemainingPerformanceObligation']), `EDGAR RPO ${ticker}`, 1);
        const s = deriveInstantSeries(units);
        const n = s.length;
        if (n >= 6 && s[n - 1]?.val > 0 && s[n - 5]?.val > 0) {
          rows.push({
            ticker,
            source: 'SEC EDGAR companyconcept',
            cadence: 'quarterly',
            currentValueUsd: s[n - 1].val,
            priorYearValueUsd: s[n - 5].val,
            yoyPct: ((s[n - 1].val - s[n - 5].val) / s[n - 5].val) * 100,
            prevPeriodValueUsd: s[n - 2]?.val,
            prevPeriodComparableUsd: s[n - 6]?.val,
            prevYoyPct: s[n - 2]?.val > 0 && s[n - 6]?.val > 0 ? ((s[n - 2].val - s[n - 6].val) / s[n - 6].val) * 100 : null
          });
        }
      } catch (error) {
        console.warn(`[bubble-watch] RPO ${ticker} 不可用: ${error.message}`);
      }
    }
    if (rows.length >= 2) {
      return summarizeRpoGrowthPanel(rows, 'SEC EDGAR companyconcept', '美国公司 XBRL instant RPO 字段可达。');
    }
    console.warn(`[bubble-watch] EDGAR RPO 样本不足(${rows.length}),改走 StockAnalysis/Fiscal.ai metrics 镜像`);
    const publicRows = [];
    for (const ticker of companies) {
      try {
        publicRows.push(await retry(() => fetchStockAnalysisRpoMetric(ticker), `StockAnalysis RPO ${ticker}`, 1));
      } catch (error) {
        console.warn(`[bubble-watch] StockAnalysis RPO ${ticker} 不可用: ${error.message}`);
      }
    }
    return summarizeRpoGrowthPanel(publicRows, 'StockAnalysis/Fiscal.ai metrics 镜像', 'EDGAR 对当前运行环境不可达时采用免费公开二级源;Oracle 用年度 metrics,其余三家用季度 operating metrics。');
  },
  async fed_policy() {
    const [dff, cpi, lowerResult, upperResult, sepResult, yearEndFutureResult] = await Promise.all([
      retry(() => fredObservations('DFF', 90), 'FRED DFF'),
      retry(() => fredObservations('CPIAUCSL', 14), 'FRED CPI'),
      retry(() => fredObservations('DFEDTARL', 10), 'FRED DFEDTARL').then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error: error.message })),
      retry(() => fredObservations('DFEDTARU', 10), 'FRED DFEDTARU').then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error: error.message })),
      fetchLatestFedSepMedians().then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error: error.message })),
      fetchYearEndFedFundsFuture().then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error: error.message }))
    ]);
    const latest = dff[0].value;
    const past = dff[Math.min(60, dff.length - 1)].value;
    const drift = latest - past;
    const cpiYoy = ((cpi[0].value - cpi[12].value) / cpi[12].value) * 100;
    const targetLower = lowerResult.ok ? lowerResult.value[0]?.value : null;
    const targetUpper = upperResult.ok ? upperResult.value[0]?.value : null;
    const targetMid = Number.isFinite(targetLower) && Number.isFinite(targetUpper)
      ? +(((targetLower + targetUpper) / 2)).toFixed(3)
      : latest;
    const sep = sepResult.ok ? sepResult.value : null;
    const yearEndFuture = yearEndFutureResult.ok ? yearEndFutureResult.value : null;
    const classified = classifyFedPolicyPath({
      drift,
      cpiYoy,
      targetMid,
      sepCurrentYear: sep?.dotPlotMedianCurrentYear,
      yearEndImplied: yearEndFuture?.impliedRate
    });
    const { status, stance } = classified;
    const targetText = Number.isFinite(targetLower) && Number.isFinite(targetUpper)
      ? `目标区间 ${targetLower.toFixed(2)}-${targetUpper.toFixed(2)}%(mid ${targetMid.toFixed(3)}%)`
      : `有效联邦基金利率 ${latest.toFixed(2)}%`;
    const sepText = Number.isFinite(sep?.dotPlotMedianCurrentYear)
      ? `SEP 点阵图当前年 median ${sep.dotPlotMedianCurrentYear.toFixed(1)}%${sep.sepProjectionDate ? `(${sep.sepProjectionDate})` : ''}`
      : `SEP 点阵图暂缺${sepResult.ok ? '' : `(${compactSnippet(sepResult.error, 70)})`}`;
    const futureText = Number.isFinite(yearEndFuture?.impliedRate)
      ? `${yearEndFuture.symbol} 年末 Fed funds futures 隐含 ${yearEndFuture.impliedRate.toFixed(2)}%`
      : `年末 Fed funds futures 暂缺${yearEndFutureResult.ok ? '' : `(${compactSnippet(yearEndFutureResult.error, 70)})`}`;
    const pressureText = status === 'red'
      ? '政策路径高于当前目标区间,对极度拉伸估值构成更直接压制'
      : status === 'yellow'
        ? '通胀仍高于 2% 目标、higher-for-longer 对极度拉伸估值构成持续压制'
        : '政策路径未显示再加息压力';
    return {
      status,
      value_display: status === 'yellow' ? '偏鹰' : stance,
      source_name: 'Fed SEP / Fed funds futures / FRED',
      note: `Fed 政策路径显示:${targetText};${sepText};${futureText};有效联邦基金利率 ${latest.toFixed(2)}%(60 日漂移 ${drift >= 0 ? '+' : ''}${(drift * 100).toFixed(0)}bp)、CPI 同比 ${cpiYoy.toFixed(1)}%(${cpi[0].date} 口径)→ 判定「${stance}」,${pressureText}。判级:加息=红 / 通胀压力=黄 / 降息=绿`,
      detail: {
        policyPathEvidenceVersion: 'fed_policy_path_v2',
        dff: latest,
        drift60dBp: drift * 100,
        cpiYoy,
        cpiDate: cpi[0].date,
        targetLower,
        targetUpper,
        targetMid,
        sepDotPlot: sep,
        yearEndFedFundsFuture: yearEndFuture,
        sepGap: classified.sepGap,
        yearEndGap: classified.yearEndGap,
        classificationReason: classified.reason,
        sourceStatus: {
          targetRange: Number.isFinite(targetLower) && Number.isFinite(targetUpper) ? 'live' : 'missing',
          sepDotPlot: sepResult.ok ? 'live' : 'missing',
          yearEndFedFundsFuture: yearEndFutureResult.ok ? 'live' : 'missing',
          dff: 'live',
          cpi: 'live'
        },
        sourceFailures: [
          lowerResult.ok && upperResult.ok ? null : { source: 'FRED:targetRange', reason: [lowerResult.error, upperResult.error].filter(Boolean).join('; ') },
          sepResult.ok ? null : { source: 'FederalReserve:SEP', reason: sepResult.error },
          yearEndFutureResult.ok ? null : { source: 'Yahoo:ZQ-year-end', reason: yearEndFutureResult.error }
        ].filter(Boolean)
      }
    };
  }
};

// ---------- 研究口径 hybrid builders ----------

async function fetchVcAiShareFromCrunchbase() {
  const rows = await retry(() => crunchbaseWpSearch('AI venture funding 2026', 8), 'Crunchbase AI VC search', 1);
  const picked = rows.find((row) => /venture funding records|AI boom|AI startups|funding/i.test(row.title)) || rows[0];
  if (!picked?.id) throw new Error('Crunchbase AI VC 候选文章为空');
  const post = await retry(() => crunchbaseWpPost(picked.id), 'Crunchbase AI VC post', 1);
  const parsed = extractVcAiFundingShare(post.text);
  if (!parsed) throw new Error('Crunchbase AI funding share 未解析到 AI sector 总额+占比');
  const { aiFundingB, sharePct, totalFundingB, evidenceText } = parsed;
  if (!(aiFundingB > 1 && sharePct > 0 && sharePct <= 100)) throw new Error(`Crunchbase AI VC 数值越界 ${aiFundingB}/${sharePct}`);
  const status = classifyNumeric(sharePct, 50, 30);
  const articleDate = post.date ? post.date.slice(0, 10) : 'date n/a';
  return {
    status,
    value_display: `~${sharePct.toFixed(0)}%`,
    source_name: 'Crunchbase News public article parser',
    note: `Crunchbase News 公开文章(${articleDate})解析:AI startup funding 约 $${aiFundingB.toFixed(0)}B,占全球 VC ${sharePct.toFixed(0)}%${Number.isFinite(totalFundingB) ? `,隐含/披露总额约 $${totalFundingB.toFixed(0)}B` : ''};>50% 仍属资金面红区。阈值:>50% 红 / 30-50% 黄 / <30% 绿`,
    detail: {
      source: 'Crunchbase News WordPress API',
      url: post.link || picked.url,
      articleDate,
      aiFundingB,
      totalFundingB,
      sharePct,
      parser: 'ai_sector_total_global_vc_sentence_v2',
      evidenceText
    }
  };
}

function extractVcAiFundingShare(text) {
  const normalized = String(text || '').replace(/\s+/gu, ' ').trim();
  const sentences = normalized
    .split(/(?<=[.!?。])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const preferred = sentences.find((sentence) => (
    /\bAI\b/iu.test(sentence)
    && /total global venture funding|global venture funding/iu.test(sentence)
    && /sector|companies in the sector|going to companies/iu.test(sentence)
  ));
  const preferredMatch = preferred?.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*billion[^.]{0,140}?([0-9]{1,3})%\s+of\s+total\s+global\s+venture\s+funding/iu);
  if (preferredMatch) {
    const sharePct = Number(preferredMatch[2]);
    const aiFundingB = Number(preferredMatch[1]);
    const totalFundingB = inferTotalVcFundingB(normalized, aiFundingB, sharePct);
    return { aiFundingB, sharePct, totalFundingB, evidenceText: preferred };
  }

  const explicit = normalized.match(/\bAI\b[^.]{0,160}?\$?([0-9]+(?:\.[0-9]+)?)\s*billion[^.]{0,160}?([0-9]{1,3})%\s+of\s+total\s+global\s+venture\s+funding/iu);
  if (explicit) {
    const sharePct = Number(explicit[2]);
    const aiFundingB = Number(explicit[1]);
    const totalFundingB = inferTotalVcFundingB(normalized, aiFundingB, sharePct);
    return { aiFundingB, sharePct, totalFundingB, evidenceText: explicit[0] };
  }

  const fallback = normalized.match(/AI startups received\s+\$?([0-9]+(?:\.[0-9]+)?)\s*billion[^.]{0,120}?([0-9]{1,3})%/iu);
  if (fallback) {
    const sharePct = Number(fallback[2]);
    const aiFundingB = Number(fallback[1]);
    const totalFundingB = inferTotalVcFundingB(normalized, aiFundingB, sharePct);
    return { aiFundingB, sharePct, totalFundingB, evidenceText: fallback[0] };
  }
  return null;
}

function inferTotalVcFundingB(text, aiFundingB, sharePct) {
  const totalMatch = String(text || '').match(/poured\s+\$?([0-9]+(?:\.[0-9]+)?)\s*billion/iu)
    || String(text || '').match(/global venture (?:investment|funding)[^.]{0,100}?\$?([0-9]+(?:\.[0-9]+)?)\s*billion/iu);
  if (totalMatch) return Number(totalMatch[1]);
  return aiFundingB / (sharePct / 100);
}

async function fetchAiIpoPipelineFromCrunchbase(ctx = {}) {
  let posts = [];
  let crunchbaseError = null;
  try {
    posts = await retry(
      () => crunchbaseWpPosts('IPO OpenAI Anthropic Cerebras Databricks SpaceX AI', 10),
      'Crunchbase AI IPO posts',
      1
    );
  } catch (error) {
    crunchbaseError = error;
    console.warn(`[bubble-watch] Crunchbase AI IPO posts failed, try SEC EDGAR filing confirmation: ${error.message}`);
  }
  const names = AI_IPO_WATCHLIST;
  const evidence = posts.filter((post) => /\b(IPO|IPOs|public|listing|exit|exits|S-1|Nasdaq|NYSE)\b/iu.test(`${post.title} ${post.text}`));
  const nameHits = new Set();
  for (const post of evidence) {
    const haystack = `${post.title} ${post.text}`;
    for (const name of names) {
      if (new RegExp(name.replace(/\s+/gu, '\\s+'), 'iu').test(haystack)) nameHits.add(name);
    }
  }
  let secResult = { checkedCompanies: [], filings: [], filingCount: 0, companyCount: 0 };
  let secError = null;
  try {
    secResult = await retry(() => fetchSecAiIpoFilingConfirmations(ctx), 'SEC EDGAR AI IPO filing confirmation', 1);
  } catch (error) {
    secError = error;
    console.warn(`[bubble-watch] SEC EDGAR AI IPO filing confirmation failed: ${error.message}`);
  }
  for (const filing of secResult.filings || []) {
    if (filing.matchedName) nameHits.add(filing.matchedName);
  }
  if (!posts.length && !(secResult.filingCount > 0)) {
    const reason = crunchbaseError
      ? `Crunchbase AI IPO posts failed and SEC EDGAR filing confirmation had no usable hit: ${crunchbaseError.message}${secError ? `; SEC=${secError.message}` : ''}`
      : 'AI IPO pipeline public sources returned no usable hit';
    throw new Error(reason);
  }
  let status = 'green';
  let display = '平静';
  if (evidence.length >= 4 || nameHits.size >= 4 || secResult.companyCount >= 3) {
    status = 'red';
    display = '洪流';
  } else if (evidence.length >= 1 || nameHits.size >= 2 || secResult.filingCount >= 1) {
    status = 'yellow';
    display = '升温';
  }
  const secTop = secResult.filings?.[0]
    ? {
        title: `${secResult.filings[0].matchedName || secResult.filings[0].company} ${secResult.filings[0].form} filing`,
        date: secResult.filings[0].filingDate,
        link: `https://www.sec.gov/Archives/edgar/data/${String(secResult.filings[0].cik || '').replace(/^0+/u, '')}/${String(secResult.filings[0].accessionNumber || '').replace(/-/gu, '')}/`
      }
    : null;
  const top = evidence[0] || posts[0] || secTop;
  if (!top) throw new Error('Crunchbase AI IPO 文章为空');
  const secNames = [...new Set((secResult.filings || []).map((filing) => filing.matchedName || filing.company).filter(Boolean))];
  const secNote = secResult.filingCount > 0
    ? `；SEC EDGAR 官方申报确认 ${secResult.filingCount} 份 S-1/F-1/424B4,涉及 ${secNames.join('/')}`
    : secError
      ? `；SEC EDGAR 申报确认不可用(${secError.message})`
      : `；SEC EDGAR 已检查 ${secResult.checkedCompanies.length} 个 watchlist 公司,未见近 12 个月 S-1/F-1/424B4`;
  const sourceName = secResult.filingCount > 0 && posts.length
    ? 'Crunchbase News + SEC EDGAR S-1/F-1 confirmation'
    : secResult.filingCount > 0
      ? 'SEC EDGAR S-1/F-1 official filing monitor'
      : 'Crunchbase News public article search';
  return {
    status,
    value_display: display,
    source_name: sourceName,
    note: `Crunchbase News 公开检索命中 ${evidence.length} 条 AI IPO/exit 相关报道,涉及 ${nameHits.size ? [...nameHits].join('/') : '核心名单未集中出现'}${secNote};最新要点「${compactSnippet(top.title, 56)}」(${top.date ? top.date.slice(0, 10) : 'date n/a'})。判级:洪流=红 / 升温=黄 / 平静=绿`,
    detail: {
      source: sourceName,
      crunchbaseSource: 'Crunchbase News WordPress API',
      crunchbaseStatus: crunchbaseError ? 'unavailable' : 'available',
      crunchbaseError: crunchbaseError?.message || null,
      evidenceCount: evidence.length,
      nameHits: [...nameHits],
      topTitle: top.title,
      topUrl: top.link || null,
      secEdgarConfirmation: {
        status: secError ? 'unavailable' : 'available',
        error: secError?.message || null,
        checkedCompanies: secResult.checkedCompanies,
        filingCount: secResult.filingCount,
        companyCount: secResult.companyCount,
        filings: secResult.filings
      }
    }
  };
}

async function fetchAccountingEventsFromPublicSearch() {
  const sources = [
    { source: 'SEC RSS', fetcher: fetchSecPressReleaseRss },
    { source: 'DOJ News API', fetcher: fetchDojPressReleaseApi },
    { source: 'SEC search:AI accounting', fetcher: () => fetchPublicSearchPage('https://www.sec.gov/newsroom/press-releases?combine=artificial%20intelligence%20accounting%20fraud', 'SEC') },
    { source: 'SEC search:Super Micro accounting', fetcher: () => fetchPublicSearchPage('https://www.sec.gov/newsroom/press-releases?combine=Super%20Micro%20accounting', 'SEC') }
  ];
  const currentYear = new Date().getUTCFullYear();
  const recentYearRe = new RegExp(`\\b(${currentYear}|${currentYear - 1})\\b`, 'u');
  const events = [];
  const sourceFailures = [];
  let checkedSources = 0;
  for (const source of sources) {
    let links = [];
    try {
      links = await retry(source.fetcher, `${source.source} accounting search`, 1);
      checkedSources += 1;
    } catch (error) {
      sourceFailures.push({ source: source.source, reason: error.message });
      console.warn(`[bubble-watch] ${source.source} accounting search failed: ${error.message}`);
      continue;
    }
    for (const link of links) {
      const haystack = `${link.title} ${link.context} ${link.date || ''}`;
      if (!recentYearRe.test(haystack)) continue;
      if (isCoreAiAccountingEnforcementEvent(link)) events.push(link);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!checkedSources) throw new Error(`SEC/DOJ official sources 全部失败: ${sourceFailures.map((f) => `${f.source}:${f.reason}`).join('; ')}`);
  const unique = [];
  const seen = new Set();
  for (const event of events) {
    const key = `${event.source}|${event.href}|${event.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  const status = unique.length ? 'red' : 'green';
  return {
    status,
    value_display: unique.length ? `${unique.length} 件` : '0 件',
    source_name: 'SEC RSS / DOJ News API official monitor',
    note: unique.length
      ? `SEC RSS/DOJ News API 官方新闻稿近两年监测到 ${unique.length} 条核心 AI 名单会计/欺诈/round-tripping 正式事件线索,首条「${compactSnippet(unique[0].title, 64)}」;按口径任何正式事件即红。`
      : 'SEC RSS 与 DOJ News API 官方新闻稿近两年未命中核心 AI 名单的会计造假、round-tripping 或欺诈正式事件;该项仍只能说明公开执法监测未见新红灯,不能替代完整法律尽调。判级:任何=红 / 调查=黄 / 无=绿',
    detail: { source: 'SEC RSS + DOJ News API official monitor', checkedSources, sourceFailures, eventCount: unique.length, events: unique.slice(0, 5) }
  };
}

async function fetchDebtCapexRatioFromPublicResearch() {
  const url = 'https://www.morganstanley.com/insights/articles/ai-market-trends-institute-2026';
  const html = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA }, timeoutMs: 15000 });
  const text = htmlToText(html);
  const totalMatch = text.match(/Est\.\s*\$?([0-9]+(?:\.[0-9]+)?)\s*tr\s+Global Capex/iu)
    || text.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*trillion[^.]{0,120}?data center construction/iu);
  const cashMatch = text.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*tr\s+Covered by Hyperscaler Cash Flows/iu);
  const corporateDebtMatch = text.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*bn\s+Corporate Debt Issuance/iu);
  const securitizedMatch = text.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*bn\s+Securitized Credit Inss?uance/iu);
  const privateCreditMatch = text.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*bn\s+Opportunity for Private Credit/iu);
  const otherCapitalMatch = text.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*bn\s+Other Capital/iu);
  const totalCapexT = totalMatch ? Number(totalMatch[1]) : null;
  const hyperscalerCashFlowT = cashMatch ? Number(cashMatch[1]) : null;
  const corporateDebtT = corporateDebtMatch ? Number(corporateDebtMatch[1]) / 1000 : null;
  const securitizedCreditT = securitizedMatch ? Number(securitizedMatch[1]) / 1000 : null;
  const privateCreditT = privateCreditMatch ? Number(privateCreditMatch[1]) / 1000 : null;
  const otherCapitalT = otherCapitalMatch ? Number(otherCapitalMatch[1]) / 1000 : null;
  if (![totalCapexT, hyperscalerCashFlowT, corporateDebtT, securitizedCreditT, privateCreditT, otherCapitalT].every(Number.isFinite)) {
    throw new Error('Morgan Stanley AI capex financing split 解析失败');
  }
  const externalFundingGapT = totalCapexT - hyperscalerCashFlowT;
  const externalFundingRatio = (externalFundingGapT / totalCapexT) * 100;
  const debtLikeFundingT = corporateDebtT + securitizedCreditT + privateCreditT;
  const debtLikeRatio = (debtLikeFundingT / totalCapexT) * 100;
  const status = externalFundingRatio > 60 ? 'red' : externalFundingRatio >= 30 ? 'yellow' : 'green';
  const display = `≈${Math.round(externalFundingRatio)}%`;
  let windNews = { status: WIND_API_KEY ? 'not_checked' : 'skipped_no_wind_key' };
  if (WIND_API_KEY) {
    try {
      const items = await fetchWindNewsEvidence('AI数据中心融资缺口债务资本开支Morgan Stanley', 'debt/capex cross-check', 3);
      windNews = {
        status: 'checked',
        itemCount: items.length,
        topTitles: items.slice(0, 3).map((item) => ({ title: item.title || null, date: item.date || null, relevance: item.relevance ?? null }))
      };
    } catch (error) {
      windNews = { status: 'error', reason: error.message };
    }
  }
  return {
    status,
    value_display: display,
    source_name: 'Morgan Stanley public research + Wind paid cross-check',
    note: `Morgan Stanley 公开研究页解析:2025-2028 数据中心总 capex 约 $${totalCapexT.toFixed(1)}T,其中 hyperscaler cash flows 覆盖约 $${hyperscalerCashFlowT.toFixed(1)}T,隐含外部融资缺口约 $${externalFundingGapT.toFixed(1)}T,占 capex ${display};债务/类债子项(公司债、ABS/CMBS、private credit/JV debt)约 $${debtLikeFundingT.toFixed(2)}T,占 capex ≈${Math.round(debtLikeRatio)}%。本项以外部融资缺口/Capex 为主口径,不是单一债券发行额。阈值:>60% 红 / 30-60% 黄 / <30% 绿`,
    detail: {
      source: 'Morgan Stanley public AI capex financing split',
      url,
      totalCapexT,
      hyperscalerCashFlowT,
      externalFundingGapT,
      externalFundingRatio,
      debtLikeFundingT,
      debtLikeRatio,
      componentsT: { corporateDebtT, securitizedCreditT, privateCreditT, otherCapitalT },
      windNews
    }
  };
}

function windNewsHaystack(item) {
  return `${item.title || ''} ${item.content || ''}`;
}

async function fetchAiIpoPipelineFromWindNews(primaryError) {
  const items = await fetchWindNewsEvidence('AI IPO OpenAI Anthropic Databricks Cerebras SpaceX上市退出', 'AI IPO pipeline fallback', 8);
  const names = ['OpenAI', 'Anthropic', 'Databricks', 'Cerebras', 'SpaceX', 'CoreWeave', 'Scale AI'];
  const evidence = items.filter((item) => /\b(IPO|IPOs|public|listing|exit|exits|S-1|Nasdaq|NYSE)\b|上市|挂牌|退出/iu.test(windNewsHaystack(item)));
  const nameHits = new Set();
  for (const item of evidence) {
    const haystack = windNewsHaystack(item);
    for (const name of names) {
      if (new RegExp(name.replace(/\s+/gu, '\\s+'), 'iu').test(haystack)) nameHits.add(name);
    }
  }
  let status = 'green';
  let display = '平静';
  if (evidence.length >= 4 || nameHits.size >= 4) {
    status = 'red';
    display = '洪流';
  } else if (evidence.length >= 1 || nameHits.size >= 2) {
    status = 'yellow';
    display = '升温';
  }
  return {
    status,
    value_display: display,
    source_name: 'Wind MCP paid final news fallback',
    note: `Crunchbase 免费源失败(${compactSnippet(primaryError?.message || primaryError, 90)})后启用 Wind 付费新闻兜底:检索到 AI IPO/exit 相关报道 ${evidence.length} 条,涉及 ${nameHits.size ? [...nameHits].join('/') : '核心名单未集中出现'};按同一阈值判为「${display}」。判级:洪流=红 / 升温=黄 / 平静=绿`,
    detail: {
      source: 'Wind MCP financial_docs.get_financial_news',
      primarySourceFailure: primaryError?.message || String(primaryError || ''),
      evidenceCount: evidence.length,
      nameHits: [...nameHits],
      topArticles: evidence.slice(0, 5).map((item) => ({ title: item.title || null, date: item.date || null, relevance: item.relevance ?? null }))
    }
  };
}

async function fetchAccountingEventsFromWindNews(primaryError) {
  const items = await fetchWindNewsEvidence('AI会计造假 round-tripping SEC DOJ NVIDIA Super Micro OpenAI CoreWeave', 'accounting-events fallback', 8);
  const coreNameRe = /\b(NVIDIA|NVDA|Super Micro|SMCI|CoreWeave|Oracle|Broadcom|OpenAI|Anthropic|Databricks|Cerebras|Microsoft|Meta|Alphabet|Google|Amazon|AWS)\b/iu;
  const formalEventRe = /\b(accounting|fraud|round[-\s]?tripping|misstatement|charged|charges|settled|settlement|enforcement|indictment)\b|会计|造假|欺诈|执法|起诉|调查|和解/iu;
  const events = items.filter((item) => {
    const haystack = windNewsHaystack(item);
    return coreNameRe.test(haystack) && formalEventRe.test(haystack);
  });
  const status = events.length ? 'red' : 'green';
  return {
    status,
    value_display: events.length ? `${events.length} 件` : '0 件',
    source_name: 'Wind MCP paid final news fallback',
    note: `SEC RSS/DOJ API 官方源失败(${compactSnippet(primaryError?.message || primaryError, 90)})后启用 Wind 付费新闻兜底:核心 AI 名单会计/欺诈/round-tripping 正式事件线索 ${events.length} 条。该项仍是新闻/公告语义监测,不能替代法律尽调。判级:任何=红 / 调查=黄 / 无=绿`,
    detail: {
      source: 'Wind MCP financial_docs.get_financial_news',
      primarySourceFailure: primaryError?.message || String(primaryError || ''),
      eventCount: events.length,
      events: events.slice(0, 5).map((item) => ({ title: item.title || null, date: item.date || null, relevance: item.relevance ?? null }))
    }
  };
}

async function fetchTokenRevenueRatioFromWindNews(primaryError) {
  const items = await fetchWindNewsEvidence('OpenRouter token volume revenue growth Anthropic ARR AI token spend', 'token/revenue fallback', 8);
  const text = items.map(windNewsHaystack).join('\n');
  const ratioMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*x[^.\n]{0,80}?(?:token|revenue|spend|收入|增速)/iu)
    || text.match(/(?:token|收入|spend|revenue)[^.\n]{0,80}?([0-9]+(?:\.[0-9]+)?)\s*x/iu);
  if (!ratioMatch) throw new Error('Wind token/revenue news 未解析到可判级 ratio');
  const ratio = Number(ratioMatch[1]);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 10) throw new Error(`Wind token/revenue ratio 越界:${ratioMatch[1]}`);
  const status = ratio > 2 ? 'red' : ratio >= 1 ? 'yellow' : 'green';
  return {
    status,
    value_display: `~${ratio.toFixed(1)}x`,
    source_name: 'Wind MCP paid final news fallback',
    note: `OpenRouter 免费 token/spend proxy 失败(${compactSnippet(primaryError?.message || primaryError, 90)})后启用 Wind 付费新闻兜底,从公开报道语义解析 token/revenue 增速比约 ${ratio.toFixed(1)}x。该项是 paid news proxy,不是厂商确认收入。阈值:>2x 红 / 1-2x 黄 / <1x 绿`,
    detail: {
      source: 'Wind MCP financial_docs.get_financial_news',
      primarySourceFailure: primaryError?.message || String(primaryError || ''),
      ratio,
      topArticles: items.slice(0, 5).map((item) => ({ title: item.title || null, date: item.date || null, relevance: item.relevance ?? null }))
    }
  };
}

async function fetchEnterpriseDeployFromWindNews(primaryError) {
  const items = await fetchWindNewsEvidence('企业AI生产部署率 Google Cloud Deloitte McKinsey production deployment', 'enterprise deployment fallback', 8);
  const text = items.map(windNewsHaystack).join('\n');
  const pctMatches = [...text.matchAll(/([0-9]{1,2})\s*%[^.\n。；;]{0,100}(?:production|deploy|deployment|生产|部署|落地)/giu)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 10 && n <= 95);
  if (!pctMatches.length) throw new Error('Wind enterprise deployment news 未解析到生产部署百分比');
  const pct = Math.max(...pctMatches);
  const status = pct < 50 ? 'red' : pct <= 65 ? 'yellow' : 'green';
  return {
    status,
    value_display: `~${pct}%`,
    source_name: 'Wind MCP paid final news fallback',
    note: `Google/Deloitte 免费源失败(${compactSnippet(primaryError?.message || primaryError, 90)})后启用 Wind 付费新闻兜底,从企业 AI 生产部署报道中解析可用百分比约 ${pct}%。该项是 survey/news proxy,不等同所有企业 AI use case。阈值:<50%=红 / 50-65%=黄 / >65%=绿`,
    detail: {
      source: 'Wind MCP financial_docs.get_financial_news',
      primarySourceFailure: primaryError?.message || String(primaryError || ''),
      parsedPcts: pctMatches.slice(0, 8),
      topArticles: items.slice(0, 5).map((item) => ({ title: item.title || null, date: item.date || null, relevance: item.relevance ?? null }))
    }
  };
}

async function fetchCapexReactionFromWindNews(primaryError) {
  const items = await fetchWindNewsEvidence('AI资本开支 市场反应 hyperscaler capex stock selloff Microsoft Meta Amazon Google Oracle', 'capex reaction fallback', 8);
  const penaltyRe = /selloff|sold off|shares fell|shares down|punish|pressure|concern|担忧|下跌|暴跌|承压|惩罚|质疑/iu;
  const capexRe = /\b(capex|capital expenditure|AI spending|data center)\b|资本开支|数据中心|AI支出/iu;
  const penaltyItems = items.filter((item) => penaltyRe.test(windNewsHaystack(item)) && capexRe.test(windNewsHaystack(item)));
  let status = 'green';
  let display = '奖励';
  if (penaltyItems.length >= 3) {
    status = 'red';
    display = '系统性惩罚';
  } else if (penaltyItems.length >= 1) {
    status = 'yellow';
    display = '选择性惩罚';
  }
  return {
    status,
    value_display: display,
    source_name: 'Wind MCP paid final news fallback',
    note: `StockAnalysis/Yahoo capex reaction proxy 失败(${compactSnippet(primaryError?.message || primaryError, 90)})后启用 Wind 付费新闻兜底:AI capex 与股价承压/质疑相关报道 ${penaltyItems.length} 条,按新闻事件代理判为「${display}」。该项低于价格窗口实算优先级。判级:系统性惩罚=红 / 偶发=黄 / 奖励=绿`,
    detail: {
      source: 'Wind MCP financial_docs.get_financial_news',
      primarySourceFailure: primaryError?.message || String(primaryError || ''),
      penaltyCount: penaltyItems.length,
      topArticles: penaltyItems.slice(0, 5).map((item) => ({ title: item.title || null, date: item.date || null, relevance: item.relevance ?? null }))
    }
  };
}

async function fetchTokenVolumeMomFromOpenRouter() {
  const json = await fetchWithTimeout('https://openrouter.ai/api/frontend/v1/rankings/market-share', {
    asJson: true,
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' }
  });
  const rawRows = (json?.data || [])
    .filter((row) => /^\d{4}-\d{2}-\d{2}/u.test(row?.x || '') && row?.ys && typeof row.ys === 'object')
    .map((row) => ({ date: row.x.slice(0, 10), totalTokens: sumFiniteObjectValues(row.ys) }))
    .filter((row) => row.totalTokens > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const { rows, droppedPartial } = dropLikelyPartialLatestRow(rawRows, 'totalTokens');
  if (rows.length < 8) throw new Error(`OpenRouter weekly token rows 不足 (${rows.length})`);
  const latest4 = rows.slice(-4);
  const prev4 = rows.slice(-8, -4);
  const prior4 = rows.slice(-12, -8);
  const sumLatest = sumRows(latest4, 'totalTokens');
  const sumPrev = sumRows(prev4, 'totalTokens');
  const sumPrior = prior4.length === 4 ? sumRows(prior4, 'totalTokens') : null;
  const momPct = ((sumLatest - sumPrev) / sumPrev) * 100;
  const prevMomPct = sumPrior ? ((sumPrev - sumPrior) / sumPrior) * 100 : null;
  let status = 'green';
  let regime = '加速';
  if (momPct < -2) {
    status = 'red';
    regime = '收缩';
  } else if (momPct < 5 || (prevMomPct !== null && momPct < prevMomPct - 10)) {
    status = 'yellow';
    regime = '减速';
  }
  const latestWeek = latest4[latest4.length - 1].date;
  return {
    status,
    value_display: `${regime}(${fmtPct(momPct, 1, true)})`,
    source_name: 'OpenRouter public rankings API',
    note: `OpenRouter public rankings API 汇总供应商周度 token volume:最近 4 周合计 ${(sumLatest / 1e12).toFixed(2)}T tokens,较前 4 周 ${fmtPct(momPct, 1, true)}${prevMomPct !== null ? `;上一窗口为 ${fmtPct(prevMomPct, 1, true)}` : ''}。该项是 OpenRouter 平台公开代理,不是全行业 token tape。判级:收缩=红 / 减速=黄 / 加速=绿`,
    detail: {
      source: 'OpenRouter /api/frontend/v1/rankings/market-share',
      latestWeek,
      rows: latest4.map((row) => ({ date: row.date, totalTokens: row.totalTokens })),
      latest4wTokens: sumLatest,
      prev4wTokens: sumPrev,
      droppedPartialWeek: droppedPartial,
      momPct,
      prevMomPct
    }
  };
}

function buildOpenRouterPricingMap(catalogRows) {
  const map = new Map();
  for (const model of catalogRows || []) {
    const endpoint = model.endpoint || {};
    const pricing = endpoint.pricing || {};
    const prompt = Number(pricing.prompt);
    const completion = Number(pricing.completion);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion)) continue;
    for (const key of [endpoint.model_variant_permaslug, model.permaslug, model.slug, endpoint.model?.permaslug, endpoint.model?.slug]) {
      if (key && !map.has(key)) map.set(key, { prompt, completion, isFree: endpoint.is_free === true });
    }
  }
  return map;
}

async function fetchTokenRevenueRatioFromOpenRouter() {
  const [chartJson, catalogJson] = await Promise.all([
    fetchWithTimeout('https://openrouter.ai/api/frontend/v1/rankings/model-rankings-chart', {
      asJson: true,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' }
    }),
    fetchWithTimeout('https://openrouter.ai/api/frontend/v1/catalog/models', {
      asJson: true,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' }
    })
  ]);
  const pricingMap = buildOpenRouterPricingMap(catalogJson?.data || []);
  const rawRows = (chartJson?.data?.data || [])
    .filter((row) => /^\d{4}-\d{2}-\d{2}/u.test(row?.x || '') && row?.ys && typeof row.ys === 'object')
    .map((row) => {
      let totalTokens = 0;
      let pricedTokens = 0;
      let spendProxyUsd = 0;
      let othersTokens = 0;
      const missingModels = [];
      for (const [modelId, rawTokens] of Object.entries(row.ys || {})) {
        const tokens = Number(rawTokens) || 0;
        totalTokens += tokens;
        if (modelId === 'Others') {
          othersTokens += tokens;
          continue;
        }
        const pricing = pricingMap.get(modelId) || (modelId.endsWith(':free') ? pricingMap.get(modelId.replace(/:free$/u, '')) : null);
        if (!pricing) {
          missingModels.push(modelId);
          continue;
        }
        pricedTokens += tokens;
        // OpenRouter chart is total tokens; use an explicit 80/20 input-output blend as a spend proxy.
        spendProxyUsd += tokens * (pricing.prompt * 0.8 + pricing.completion * 0.2);
      }
      return {
        date: row.x.slice(0, 10),
        totalTokens,
        pricedTokens,
        spendProxyUsd,
        othersTokens,
        missingModels: missingModels.slice(0, 5)
      };
    })
    .filter((row) => row.totalTokens > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const { rows, droppedPartial } = dropLikelyPartialLatestRow(rawRows, 'totalTokens');
  if (rows.length < 8) throw new Error(`OpenRouter model-ranking weekly rows 不足 (${rows.length})`);
  const latest4 = rows.slice(-4);
  const prev4 = rows.slice(-8, -4);
  const latestTokens = sumRows(latest4, 'totalTokens');
  const prevTokens = sumRows(prev4, 'totalTokens');
  const latestSpend = sumRows(latest4, 'spendProxyUsd');
  const prevSpend = sumRows(prev4, 'spendProxyUsd');
  const latestPricedTokens = sumRows(latest4, 'pricedTokens');
  const coveragePct = (latestPricedTokens / latestTokens) * 100;
  if (!(coveragePct >= 45)) throw new Error(`OpenRouter spend proxy priced coverage 过低: ${coveragePct.toFixed(1)}%`);
  if (!(latestSpend > 0 && prevSpend > 0)) throw new Error('OpenRouter spend proxy 金额不足,无法计算 token/spend 增速比');
  const tokenGrowthPct = ((latestTokens - prevTokens) / prevTokens) * 100;
  const spendGrowthPct = ((latestSpend - prevSpend) / prevSpend) * 100;
  let ratio = null;
  let status = 'green';
  if (tokenGrowthPct > 0 && spendGrowthPct <= 0) {
    status = 'red';
  } else if (tokenGrowthPct > 0 && spendGrowthPct > 0) {
    ratio = tokenGrowthPct / spendGrowthPct;
    status = ratio > 2 ? 'red' : ratio >= 1 ? 'yellow' : 'green';
  }
  const display = ratio === null
    ? (tokenGrowthPct > 0 ? '≫2x' : '<1x')
    : `~${ratio.toFixed(1)}x`;
  return {
    status,
    value_display: display,
    source_name: 'OpenRouter rankings + catalog spend proxy',
    note: `OpenRouter 周度模型排名 + 公开 catalog pricing 估算平台内 spend proxy:最近 4 周 token volume ${fmtPct(tokenGrowthPct, 1, true)},估算 spend ${fmtPct(spendGrowthPct, 1, true)},token/spend 增速比 ${display};定价覆盖 ${coveragePct.toFixed(1)}%。该项不是厂商真实收入,仅作 OpenRouter 平台代理。阈值:>2x 红 / 1-2x 黄 / <1x 绿`,
    detail: {
      source: 'OpenRouter v1 model-rankings-chart + frontend catalog models',
      latestWeek: latest4[latest4.length - 1].date,
      latest4wTokens: latestTokens,
      prev4wTokens: prevTokens,
      latest4wSpendProxyUsd: latestSpend,
      prev4wSpendProxyUsd: prevSpend,
      tokenGrowthPct,
      spendGrowthPct,
      ratio,
      pricedCoveragePct: coveragePct,
      droppedPartialWeek: droppedPartial,
      rows: latest4.map((row) => ({
        date: row.date,
        totalTokens: row.totalTokens,
        pricedTokens: row.pricedTokens,
        spendProxyUsd: row.spendProxyUsd,
        othersTokens: row.othersTokens
      }))
    }
  };
}

async function fetchSaastrPost(id) {
  const json = await fetchWithTimeout(`https://www.saastr.com/wp-json/wp/v2/posts/${id}`, {
    asJson: true,
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    timeoutMs: 15000
  });
  const title = htmlToText(json?.title?.rendered || '');
  const content = htmlToText(json?.content?.rendered || '');
  if (!json?.date || !title || !content) throw new Error(`SaaStr post ${id} 返回结构异常`);
  return { id, date: json.date.slice(0, 10), title, text: `${title}. ${content}` };
}


async function fetchArrSecondDerivativeFromSaastr(_ctx, entry) {
  const postIds = [315823, 322211, 323715, 325206];
  const posts = [];
  for (const id of postIds) posts.push(await fetchSaastrPost(id));
  const milestones = posts
    .map((post) => ({ date: post.date, arrB: extractAnthropicArrB(post), sourceId: post.id, title: post.title }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (milestones.length < 4) throw new Error(`ARR milestones 不足 (${milestones.length}/4)`);
  const segments = [];
  for (let i = 1; i < milestones.length; i++) {
    const prev = milestones[i - 1];
    const cur = milestones[i];
    const months = monthsBetweenIso(prev.date, cur.date);
    if (!(months > 0.5) || cur.arrB <= prev.arrB) throw new Error(`ARR milestone 序列异常: ${prev.date}→${cur.date}`);
    segments.push({
      from: prev.date,
      to: cur.date,
      deltaB: cur.arrB - prev.arrB,
      months,
      monthlyDeltaB: (cur.arrB - prev.arrB) / months
    });
  }
  const latest = segments[segments.length - 1];
  const prev = segments[segments.length - 2];
  const slopeRatio = latest.monthlyDeltaB / prev.monthlyDeltaB;
  const status = slopeRatio < 0.5 ? 'red' : slopeRatio < 0.85 ? 'yellow' : 'green';
  const latestMilestone = milestones[milestones.length - 1];
  const underlyingObservationFreshness = requireFreshUnderlyingObservation({
    observationDate: latestMilestone.date,
    asOfDate: isoDate(),
    maxAgeDays: Number(entry?.maxAgeDays)
  });
  const display = status === 'red' ? '减速' : status === 'yellow' ? '高位放缓' : '加速中';
  return {
    status,
    value_display: display,
    source_name: 'SaaStr public ARR milestone monitor',
    note: `SaaStr 公开 Anthropic ARR/run-rate 里程碑解析:${milestones.map((m) => `${m.date} $${m.arrB.toFixed(0)}B`).join(' → ')};最新区间月增量约 $${latest.monthlyDeltaB.toFixed(1)}B,为前一区间的 ${slopeRatio.toFixed(2)}x。该项是公开估算里程碑 proxy,不是审计收入。阈值:明显减速=红 / 高位放缓=黄 / 维持加速=绿`,
    detail: {
      source: 'SaaStr WordPress public API',
      milestones,
      segments: segments.map((s) => ({ ...s, monthlyDeltaB: Number(s.monthlyDeltaB.toFixed(2)), months: Number(s.months.toFixed(1)) })),
      latestArrB: latestMilestone.arrB,
      slopeRatio,
      underlyingObservationFreshness
    }
  };
}

async function fetchEnterpriseDeployFromPublicReports() {
  const googleHtml = await fetchWithTimeout('https://cloud.google.com/transform/roi-of-ai-how-agents-help-business', {
    headers: { 'User-Agent': BROWSER_UA }
  });
  const googleText = htmlToText(googleHtml);
  const productionMatch = googleText.match(/for the\s+([0-9]{1,2})%\s+of executives[^.]{0,180}?deploying AI agents in production/iu)
    || googleText.match(/([0-9]{1,2})%\s+of executives[^.]{0,180}?deploying AI agents in production/iu);
  if (!productionMatch) throw new Error('Google Cloud AI production deployment percentage 未解析到');
  const pct = Number(productionMatch[1]);
  if (!(pct >= 0 && pct <= 100)) throw new Error(`Google Cloud production deployment percentage 越界: ${pct}`);
  let deloitteSupport = null;
  try {
    const deloitteHtml = await fetchWithTimeout('https://www.deloitte.com/us/en/what-we-do/capabilities/applied-artificial-intelligence/content/state-of-ai-in-the-enterprise.html', {
      headers: { 'User-Agent': BROWSER_UA },
      timeoutMs: 12000
    });
    const deloitteText = htmlToText(deloitteHtml);
    const supportMatch = deloitteText.match(/Worker access to AI rose by 50%[^.]{0,180}?≥40% projects in production[^.]{0,120}?double in six months/iu);
    deloitteSupport = supportMatch ? compactSnippet(supportMatch[0], 180) : null;
  } catch (error) {
    deloitteSupport = `Deloitte support fetch failed: ${error.message}`;
  }
  const status = pct < 50 ? 'red' : pct <= 65 ? 'yellow' : 'green';
  return {
    status,
    value_display: `~${pct}%`,
    source_name: 'Google Cloud ROI of AI public report',
    note: `Google Cloud ROI of AI 公开报告解析:约 ${pct}% 受访高管称组织已在生产中部署 AI agents;Deloitte 同期公开页提示 ≥40% 项目进入 production 的公司数预计继续上升。该项是 enterprise production proxy,不等同所有企业 AI use case。阈值:<50%=红 / 50-65%=黄 / >65%=绿`,
    detail: {
      source: 'Google Cloud ROI of AI public report',
      url: 'https://cloud.google.com/transform/roi-of-ai-how-agents-help-business',
      productionDeployPct: pct,
      deloitteSupport
    }
  };
}

function sentenceMatches(text, companyRe, termRe) {
  return String(text || '')
    .split(/[.!?。；;\n]/u)
    .map((s) => s.replace(/\s+/gu, ' ').trim())
    .filter((s) => s.length >= 28 && s.length <= 360 && companyRe.test(s) && termRe.test(s))
    .slice(0, 12);
}

async function fetchNeocloudCreditFromPublicMonitor() {
  const pages = [
    { source: 'PRNewswire:CoreWeave', url: 'https://www.prnewswire.com/news/coreweave/' },
    { source: 'Lambda official blog', url: 'https://lambda.ai/blog/lambda-closes-1-billion-senior-secured-credit-facility' },
    { source: 'Crusoe official newsroom', url: 'https://www.crusoe.ai/resources/newsroom/crusoe-secures-usd750-million-credit-facility-from-brookfield-to-accelerate' },
    { source: 'Nebius newsroom financing update', url: 'https://nebius.com/newsroom/nebius-provides-financing-update' },
    { source: 'Nebius newsroom offering close', url: 'https://nebius.com/newsroom/nebius-group-announces-closings-of-its-public-offering-of-class-a-ordinary-shares-and-concurrent-private-offering-of-convertible-senior-notes-with-aggregate-gross-proceeds-to-date-of-approximately-4-2-billion' }
  ];
  const companyRe = /\b(CoreWeave|Nebius|Lambda|Crusoe)\b/iu;
  const negativeRe = /\b(default|payment default|downgrade|downgraded|distressed|distress|bankruptcy|insolvency|covenant breach|negative outlook|rating watch negative)\b|违约|降级|债务重组|破产|资不抵债/iu;
  const financingRe = /\b(credit facility|senior secured credit facility|senior notes|convertible senior notes|financing|offering|debt secured|gross proceeds|funding)\b|融资|信贷|优先票据|可转换票据/iu;
  const negativeEvents = [];
  const financingEvents = [];
  const failures = [];
  let checkedPages = 0;
  for (const page of pages) {
    try {
      const html = await fetchWithTimeout(page.url, { headers: { 'User-Agent': BROWSER_UA }, timeoutMs: 15000 });
      checkedPages += 1;
      const text = htmlToText(html);
      for (const snippet of sentenceMatches(text, companyRe, negativeRe)) negativeEvents.push({ ...page, snippet: compactSnippet(snippet, 180) });
      for (const snippet of sentenceMatches(text, companyRe, financingRe)) financingEvents.push({ ...page, snippet: compactSnippet(snippet, 180) });
    } catch (error) {
      failures.push({ source: page.source, reason: error.message });
    }
  }
  if (!checkedPages || !financingEvents.length) {
    throw new Error(`neocloud public credit monitor evidence 不足: checked=${checkedPages}, financing=${financingEvents.length}, failures=${failures.length}`);
  }
  const status = negativeEvents.length ? 'red' : 'green';
  return {
    status,
    value_display: negativeEvents.length ? `${negativeEvents.length} 件` : '0 件',
    source_name: 'CoreWeave / Lambda / Crusoe / Nebius public credit-event monitor',
    note: negativeEvents.length
      ? `公开 neocloud 信用事件监测命中 ${negativeEvents.length} 条违约/降级/困境融资线索,首条「${negativeEvents[0].snippet}」;按口径任何正式信用事件即红。`
      : `公开 neocloud 信用事件监测覆盖 CoreWeave/Lambda/Crusoe/Nebius 共 ${checkedPages} 个页面,未命中违约、降级或困境重组词;同时记录 ${financingEvents.length} 条融资/票据/credit facility 正常事件。该项不是完整评级数据库。判级:任何违约/降级=红 / 无正式事件=绿`,
    detail: {
      source: 'public neocloud credit-event monitor',
      checkedPages,
      failures,
      negativeEvents: negativeEvents.slice(0, 5),
      financingEvents: financingEvents.slice(0, 8)
    }
  };
}

function returnPctOverDays(closes, days) {
  if (closes.length <= days) throw new Error(`Yahoo closes 不足 ${days} 日`);
  const start = closes[closes.length - 1 - days];
  const end = closes[closes.length - 1];
  if (!(start > 0 && end > 0)) throw new Error('Yahoo closes 含无效值');
  return ((end - start) / start) * 100;
}

async function fetchLatestFedSepMedians() {
  const calendarHtml = await fetchWithTimeout(FED_CALENDAR_URL, {
    headers: { 'User-Agent': 'GFRRBot/1.0' },
    timeoutMs: 20000
  });
  const sep = latestDatedFedLink(
    calendarHtml,
    /href=["'](?<href>[^"']*monetarypolicy\/fomcprojtabl(?<date>\d{8})\.htm)["']/giu
  );
  if (!sep?.href) throw new Error('Fed SEP latest link missing');
  const sepUrl = resolveFedUrl(sep.href);
  const sepHtml = await fetchWithTimeout(sepUrl, {
    headers: { 'User-Agent': 'GFRRBot/1.0' },
    timeoutMs: 20000
  });
  return parseFedSepMedians(sepHtml, sepUrl, sep.date);
}

function yearEndFedFundsFutureSymbol(date = new Date()) {
  const year = date.getUTCFullYear();
  return `ZQZ${String(year).slice(-2)}.CBT`;
}

async function fetchYearEndFedFundsFuture() {
  const symbol = yearEndFedFundsFutureSymbol();
  const quote = await yahooLatestDailyQuote(symbol, '10d');
  return {
    symbol,
    price: quote.price,
    impliedRate: +(100 - quote.price).toFixed(3),
    updatedAt: quote.updatedAt
  };
}

function classifyFedPolicyPath({ drift, cpiYoy, targetMid, sepCurrentYear, yearEndImplied }) {
  const sepGap = Number.isFinite(sepCurrentYear) && Number.isFinite(targetMid)
    ? +(sepCurrentYear - targetMid).toFixed(3)
    : null;
  const yearEndGap = Number.isFinite(yearEndImplied) && Number.isFinite(targetMid)
    ? +(yearEndImplied - targetMid).toFixed(3)
    : null;
  if ((Number.isFinite(sepGap) && sepGap >= 0.1) || (Number.isFinite(yearEndGap) && yearEndGap >= 0.15)) {
    return { status: 'red', stance: '年末路径隐含加息', sepGap, yearEndGap, reason: 'policy_path_above_current_target' };
  }
  if (drift > 0.1) {
    return { status: 'red', stance: '重启加息', sepGap, yearEndGap, reason: 'effective_rate_rising' };
  }
  if (drift < -0.1 && (!Number.isFinite(cpiYoy) || cpiYoy <= 2.5)) {
    return { status: 'green', stance: '降息中', sepGap, yearEndGap, reason: 'effective_rate_falling_and_inflation_cooling' };
  }
  if (Number.isFinite(cpiYoy) && cpiYoy > 2.5) {
    return { status: 'yellow', stance: '偏鹰(维持高位)', sepGap, yearEndGap, reason: 'inflation_above_target_without_clear_hike_path' };
  }
  return { status: 'green', stance: '中性偏松', sepGap, yearEndGap, reason: 'no_hike_path_and_inflation_near_target' };
}

async function fetchCapexReactionFromPublicProxy() {
  const companies = ['MSFT', 'META', 'AMZN', 'GOOGL'];
  const capexRows = [];
  for (const ticker of companies) {
    const html = await retry(() => fetchSaFinancialPage(ticker, 'cash-flow-statement/'), `SA cash-flow ${ticker}`);
    const capex = parseSaQuarterlyRow(html, 'Capital Expenditures').map((v) => Math.abs(v));
    if (capex.length < 8) throw new Error(`${ticker} capex quarterly rows 不足`);
    capexRows.push({
      ticker,
      latestCapexB: capex[0] / 1e9,
      latestYoyPct: ((capex[0] - capex[4]) / capex[4]) * 100,
      t4qYoyPct: saT4qYoy(capex)?.yoyPct
    });
  }
  const windows = [21, 63, 126];
  const [qqqCloses, spyCloses] = await Promise.all([yahooCloses('QQQ', '1y'), yahooCloses('SPY', '1y')]);
  const benchmarkWindows = Object.fromEntries(windows.map((days) => [
    `${days}d`,
    {
      qqq: returnPctOverDays(qqqCloses, days),
      spy: returnPctOverDays(spyCloses, days)
    }
  ]));
  const reactionRows = [];
  for (const ticker of companies) {
    const closes = await yahooCloses(ticker, '1y');
    const windowReturns = Object.fromEntries(windows.map((days) => {
      const ret = returnPctOverDays(closes, days);
      const benchmark = benchmarkWindows[`${days}d`];
      return [
        `${days}d`,
        {
          ret,
          excessVsQqq: ret - benchmark.qqq,
          excessVsSpy: ret - benchmark.spy
        }
      ];
    }));
    reactionRows.push({
      ticker,
      windowReturns
    });
  }
  const avgCapexYoy = capexRows.reduce((sum, row) => sum + row.t4qYoyPct, 0) / capexRows.length;
  const windowEvidence = windows.map((days) => {
    const key = `${days}d`;
    const avgExcessQqq = reactionRows.reduce((sum, row) => sum + row.windowReturns[key].excessVsQqq, 0) / reactionRows.length;
    const avgExcessSpy = reactionRows.reduce((sum, row) => sum + row.windowReturns[key].excessVsSpy, 0) / reactionRows.length;
    const punishedCount = reactionRows.filter((row) => row.windowReturns[key].excessVsQqq <= -5).length;
    const severePunishedCount = reactionRows.filter((row) => row.windowReturns[key].excessVsQqq <= -8).length;
    const marketPenalty = avgExcessQqq <= -5 || punishedCount >= 2;
    const systemicPenalty = avgExcessQqq <= -8 && punishedCount >= 3;
    return {
      days,
      avgExcessQqq,
      avgExcessSpy,
      punishedCount,
      severePunishedCount,
      marketPenalty,
      systemicPenalty
    };
  });
  const shortWindow = windowEvidence.find((row) => row.days === 21);
  const mediumWindow = windowEvidence.find((row) => row.days === 63);
  const longWindow = windowEvidence.find((row) => row.days === 126);
  const penaltyWindowCount = windowEvidence.filter((row) => row.marketPenalty).length;
  const systemicWindowCount = windowEvidence.filter((row) => row.systemicPenalty).length;
  const multiWindowPenalty = penaltyWindowCount >= 2;
  const capexStillAccelerating = avgCapexYoy >= 15;
  let status = 'green';
  let display = '奖励';
  if (capexStillAccelerating && systemicWindowCount >= 2) {
    status = 'red';
    display = '系统性惩罚';
  } else if (
    capexStillAccelerating
    && (
      multiWindowPenalty
      || (mediumWindow.avgExcessQqq <= -5 && mediumWindow.punishedCount >= 2)
      || (longWindow.avgExcessQqq <= -5 && longWindow.punishedCount >= 2)
    )
  ) {
    status = 'yellow';
    display = '选择性惩罚';
  }
  return {
    status,
    value_display: display,
    source_name: 'StockAnalysis capex + Yahoo relative-return proxy',
    note: `StockAnalysis 季度现金流解析 MSFT/META/AMZN/GOOGL 滚动 4 季 capex 同比均值 ${fmtPct(avgCapexYoy, 1, true)};Yahoo 多窗口相对 QQQ:21日 ${fmtPct(shortWindow.avgExcessQqq, 1, true)}(${shortWindow.punishedCount}/4 跑输>5pct)、63日 ${fmtPct(mediumWindow.avgExcessQqq, 1, true)}(${mediumWindow.punishedCount}/4)、126日 ${fmtPct(longWindow.avgExcessQqq, 1, true)}(${longWindow.punishedCount}/4)。该项观察市场是否跨窗口系统性惩罚高 capex 公司,不是单一短期相对收益噪音或逐字财报指引文本。判级:多窗口系统性惩罚=红 / 中长窗口选择性惩罚=黄 / 奖励=绿`,
    detail: {
      source: 'StockAnalysis quarterly cash-flow + Yahoo Chart',
      benchmarkWindows: Object.fromEntries(Object.entries(benchmarkWindows).map(([key, value]) => [
        key,
        {
          qqq: Number(value.qqq.toFixed(1)),
          spy: Number(value.spy.toFixed(1))
        }
      ])),
      avgCapexYoy,
      avgExcessQqq: mediumWindow.avgExcessQqq,
      avgExcessSpy: mediumWindow.avgExcessSpy,
      punishedCount: mediumWindow.punishedCount,
      penaltyWindowCount,
      systemicWindowCount,
      capexStillAccelerating,
      windowEvidence: windowEvidence.map((row) => ({
        days: row.days,
        avgExcessQqq: Number(row.avgExcessQqq.toFixed(1)),
        avgExcessSpy: Number(row.avgExcessSpy.toFixed(1)),
        punishedCount: row.punishedCount,
        severePunishedCount: row.severePunishedCount,
        marketPenalty: row.marketPenalty,
        systemicPenalty: row.systemicPenalty
      })),
      formulaVersion: 'capex_reaction_multi_window_v1',
      capexRows: capexRows.map((row) => ({ ...row, latestCapexB: Number(row.latestCapexB.toFixed(1)), latestYoyPct: Number(row.latestYoyPct.toFixed(1)), t4qYoyPct: Number(row.t4qYoyPct.toFixed(1)) })),
      reactionRows: reactionRows.map((row) => ({
        ticker: row.ticker,
        windowReturns: Object.fromEntries(Object.entries(row.windowReturns).map(([key, value]) => [
          key,
          {
            ret: Number(value.ret.toFixed(1)),
            excessVsQqq: Number(value.excessVsQqq.toFixed(1)),
            excessVsSpy: Number(value.excessVsSpy.toFixed(1))
          }
        ]))
      }))
    }
  };
}

// ---------- 公开市场技术热度审计面板(display-only,不进 Bubble Watch v2 计分) ----------

function mean(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, v) => sum + v, 0) / nums.length : null;
}

function standardDeviation(values) {
  const m = mean(values);
  if (!Number.isFinite(m) || values.length < 2) return null;
  const variance = values.reduce((sum, v) => sum + ((v - m) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function pctReturn(start, end) {
  if (!(start > 0 && end > 0)) return null;
  return ((end - start) / start) * 100;
}

function closesByDate(rows) {
  return new Map(rows.map((row) => [row.date, row.close]));
}

function commonDatesForSeries(seriesRows) {
  if (!seriesRows.length) return [];
  let dates = new Set(seriesRows[0].map((row) => row.date));
  for (const rows of seriesRows.slice(1)) {
    const rowDates = new Set(rows.map((row) => row.date));
    dates = new Set([...dates].filter((date) => rowDates.has(date)));
  }
  return [...dates].sort();
}

function sliceCommonCloses(rows, dates) {
  const byDate = closesByDate(rows);
  return dates.map((date) => byDate.get(date)).filter((v) => Number.isFinite(v) && v > 0);
}

function dailyReturnsFromCloses(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

function covariance(a, b) {
  if (a.length !== b.length || a.length < 5) return null;
  const ma = mean(a);
  const mb = mean(b);
  if (!Number.isFinite(ma) || !Number.isFinite(mb)) return null;
  return a.reduce((sum, v, i) => sum + ((v - ma) * (b[i] - mb)), 0) / a.length;
}

function correlation(a, b) {
  const cov = covariance(a, b);
  const sa = standardDeviation(a);
  const sb = standardDeviation(b);
  if (!Number.isFinite(cov) || !(sa > 0) || !(sb > 0)) return null;
  return cov / (sa * sb);
}

function betaToBenchmark(assetReturns, benchmarkReturns) {
  const cov = covariance(assetReturns, benchmarkReturns);
  const benchmarkStdDev = standardDeviation(benchmarkReturns);
  const variance = Number.isFinite(benchmarkStdDev) ? benchmarkStdDev ** 2 : null;
  if (!Number.isFinite(cov) || !(variance > 0)) return null;
  return cov / variance;
}

function rsi14(closes) {
  const window = closes.slice(-15);
  if (window.length < 15) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < window.length; i++) {
    const diff = window[i] - window[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function bollingerPctB(closes) {
  const window = closes.slice(-20);
  if (window.length < 20) return null;
  const ma = mean(window);
  const sd = standardDeviation(window);
  if (!Number.isFinite(ma) || !(sd > 0)) return null;
  const upper = ma + (2 * sd);
  const lower = ma - (2 * sd);
  return (closes[closes.length - 1] - lower) / (upper - lower);
}

function marketStatus(status, valueDisplay, note, detail) {
  return { status, value_display: valueDisplay, note, source_name: 'Yahoo Chart 公开价格序列', detail };
}

function buildEqualWeightComposite(series, dates) {
  const maps = series.map((entry) => ({ symbol: entry.symbol, byDate: closesByDate(entry.rows) }));
  const firstBySymbol = new Map(maps.map((entry) => [entry.symbol, entry.byDate.get(dates[0])]));
  return dates.map((date) => {
    const normalized = maps.map((entry) => {
      const first = firstBySymbol.get(entry.symbol);
      const close = entry.byDate.get(date);
      return close > 0 && first > 0 ? (close / first) * 100 : null;
    }).filter(Number.isFinite);
    return mean(normalized);
  }).filter(Number.isFinite);
}

function classifyTechnicalHeatItem(id, raw) {
  switch (id) {
    case 'relative_momentum_21d':
      return raw >= 8 ? 'red' : raw >= 3 ? 'yellow' : 'green';
    case 'rsi_14d':
      return raw >= 75 ? 'red' : raw >= 65 ? 'yellow' : 'green';
    case 'bollinger_pct_b':
      return raw >= 1.05 ? 'red' : raw >= 0.85 ? 'yellow' : 'green';
    case 'sma_200_deviation':
      return raw >= 25 ? 'red' : raw >= 10 ? 'yellow' : 'green';
    case 'correlation_beta_60d':
      return raw.correlation >= 0.75 && raw.beta >= 1.35 ? 'red'
        : raw.correlation >= 0.55 || raw.beta >= 1.15 ? 'yellow'
          : 'green';
    default:
      return 'green';
  }
}

async function buildMarketTechnicalHeatPanel() {
  const basketSymbols = ['NVDA', 'AMD', 'MSFT', 'GOOGL', 'META', 'TSLA', 'AVGO', 'ORCL'];
  const benchmarkSymbols = ['QQQ', 'SPY'];
  const failures = [];
  const fetched = [];
  for (const symbol of [...basketSymbols, ...benchmarkSymbols]) {
    try {
      fetched.push({ symbol, rows: await yahooDailyCloses(symbol, '1y') });
    } catch (error) {
      failures.push({ symbol, reason: error.message });
    }
  }

  const basketSeries = fetched.filter((entry) => basketSymbols.includes(entry.symbol));
  const qqq = fetched.find((entry) => entry.symbol === 'QQQ');
  const spy = fetched.find((entry) => entry.symbol === 'SPY');
  if (basketSeries.length < 6 || !qqq || !spy) {
    throw new Error(`market technical heat evidence 不足:basket=${basketSeries.length}, QQQ=${Boolean(qqq)}, SPY=${Boolean(spy)}`);
  }

  const compositeDates = commonDatesForSeries(basketSeries.map((entry) => entry.rows));
  if (compositeDates.length < 220) throw new Error(`AI basket common dates 不足:${compositeDates.length}`);
  const compositeCloses = buildEqualWeightComposite(basketSeries, compositeDates);
  if (compositeCloses.length < 220) throw new Error(`AI basket composite closes 不足:${compositeCloses.length}`);

  const commonForQqq = commonDatesForSeries([...basketSeries.map((entry) => entry.rows), qqq.rows]);
  const compositeForQqq = buildEqualWeightComposite(basketSeries, commonForQqq);
  const qqqForComposite = sliceCommonCloses(qqq.rows, commonForQqq);
  if (compositeForQqq.length < 63 || qqqForComposite.length < 63) {
    throw new Error('AI basket vs QQQ common history 不足');
  }

  const basket21 = pctReturn(compositeForQqq[compositeForQqq.length - 22], compositeForQqq[compositeForQqq.length - 1]);
  const qqq21 = pctReturn(qqqForComposite[qqqForComposite.length - 22], qqqForComposite[qqqForComposite.length - 1]);
  const excess21 = basket21 - qqq21;
  const rsi = rsi14(compositeCloses);
  const pctB = bollingerPctB(compositeCloses);
  const sma200 = mean(compositeCloses.slice(-200));
  const sma200Deviation = ((compositeCloses[compositeCloses.length - 1] - sma200) / sma200) * 100;

  const commonForRisk = commonDatesForSeries([...basketSeries.map((entry) => entry.rows), spy.rows]).slice(-61);
  const compositeForRisk = buildEqualWeightComposite(basketSeries, commonForRisk);
  const spyCloses = sliceCommonCloses(spy.rows, commonForRisk);
  const compositeReturns = dailyReturnsFromCloses(compositeForRisk);
  const spyReturns = dailyReturnsFromCloses(spyCloses);
  const beta = betaToBenchmark(compositeReturns, spyReturns);
  const pairwise = [];
  const alignedCloses = basketSeries.map((entry) => ({ symbol: entry.symbol, closes: sliceCommonCloses(entry.rows, commonForRisk) }));
  for (let i = 0; i < alignedCloses.length; i++) {
    for (let j = i + 1; j < alignedCloses.length; j++) {
      const corr = correlation(dailyReturnsFromCloses(alignedCloses[i].closes), dailyReturnsFromCloses(alignedCloses[j].closes));
      if (Number.isFinite(corr)) pairwise.push(corr);
    }
  }
  const avgCorrelation = mean(pairwise);
  if (![excess21, rsi, pctB, sma200Deviation, beta, avgCorrelation].every(Number.isFinite)) {
    throw new Error('market technical heat 指标计算出现非有限值');
  }

  const items = [
    {
      id: 'relative_momentum_21d',
      name_zh: 'AI 篮子 21 日相对动量',
      name_en: 'AI Basket 21D vs QQQ',
      threshold_text: '>+8pct 红 / +3~+8 黄 / <+3 绿',
      ...marketStatus(
        classifyTechnicalHeatItem('relative_momentum_21d', excess21),
        `${excess21 >= 0 ? '+' : ''}${excess21.toFixed(1)}pct`,
        `等权 AI 篮子近 21 个交易日回报 ${fmtPct(basket21, 1, true)},QQQ ${fmtPct(qqq21, 1, true)},相对超额 ${excess21 >= 0 ? '+' : ''}${excess21.toFixed(1)}pct。该项只衡量公开市场短线追价热度,不进入红灯主分。`,
        { basket21, qqq21, excess21 }
      )
    },
    {
      id: 'rsi_14d',
      name_zh: '等权 AI 篮子 RSI',
      name_en: 'Equal-Weight Basket RSI',
      threshold_text: '≥75 红 / 65-75 黄 / <65 绿',
      ...marketStatus(
        classifyTechnicalHeatItem('rsi_14d', rsi),
        rsi.toFixed(0),
        `按等权 AI 篮子日线合成价计算 14 日 RSI=${rsi.toFixed(1)}。RSI 反映短线超买温度,不能替代估值或基本面判断。`,
        { rsi, period: 14 }
      )
    },
    {
      id: 'bollinger_pct_b',
      name_zh: 'Bollinger %B 位置',
      name_en: 'Bollinger %B',
      threshold_text: '≥1.05 红 / 0.85-1.05 黄 / <0.85 绿',
      ...marketStatus(
        classifyTechnicalHeatItem('bollinger_pct_b', pctB),
        pctB.toFixed(2),
        `20 日 Bollinger %B=${pctB.toFixed(2)};%B 接近或高于 1 表示价格贴近/突破上轨,属于短线过热信号。`,
        { pctB, window: 20, bandStdDev: 2 }
      )
    },
    {
      id: 'sma_200_deviation',
      name_zh: '200 日均线偏离',
      name_en: 'Distance from 200D SMA',
      threshold_text: '>25% 红 / 10-25% 黄 / <10% 绿',
      ...marketStatus(
        classifyTechnicalHeatItem('sma_200_deviation', sma200Deviation),
        `${fmtPct(sma200Deviation, 1, true)}`,
        `等权 AI 篮子较 200 日均线偏离 ${fmtPct(sma200Deviation, 1, true)}。该项捕捉趋势拥挤,不判断企业现金流兑现。`,
        { sma200Deviation, window: 200 }
      )
    },
    {
      id: 'correlation_beta_60d',
      name_zh: '60 日相关性 / Beta',
      name_en: '60D Correlation / Beta',
      threshold_text: 'ρ≥0.75且β≥1.35 红 / ρ≥0.55或β≥1.15 黄 / 其余绿',
      ...marketStatus(
        classifyTechnicalHeatItem('correlation_beta_60d', { correlation: avgCorrelation, beta }),
        `ρ ${avgCorrelation.toFixed(2)} / β ${beta.toFixed(2)}`,
        `最近 60 个交易日 AI 篮子平均两两相关性 ρ=${avgCorrelation.toFixed(2)},相对 SPY beta=${beta.toFixed(2)}。相关性和 beta 同升时,代表主题交易更容易同涨同跌。`,
        { avgCorrelation, beta, window: 60, pairCount: pairwise.length }
      )
    }
  ];

  const red = items.filter((item) => item.status === 'red').length;
  const yellow = items.filter((item) => item.status === 'yellow').length;
  const heatScore = Number((((red + yellow * 0.5) / items.length) * 100).toFixed(1));
  const status = red >= 2 || (red >= 1 && yellow >= 2) ? 'red' : red >= 1 || yellow >= 2 ? 'yellow' : 'green';
  const label = status === 'red' ? '技术过热' : status === 'yellow' ? '升温观察' : '温度可控';
  const latestDate = compositeDates[compositeDates.length - 1];

  return {
    contractVersion: 'bubble-watch-market-technical-heat-v1',
    boundary: 'display-only audit panel; excluded from Bubble Watch core/shadow indicator scoring, verdict, decision, execution, and position logic',
    as_of_date: latestDate,
    generated_at: new Date().toISOString(),
    status,
    label,
    heat_score: heatScore,
    counts: { red, yellow, green: items.length - red - yellow, total: items.length },
    summary: `公开市场技术热度为「${label}」:${red} 红 / ${yellow} 黄 / ${items.length - red - yellow} 绿;该面板只看上市 AI 篮子的价格与拥挤度,不能替代估值、现金流或信用条件判断。`,
    basket: {
      construction: 'equal_weight_normalized_to_base_100',
      symbols: basketSeries.map((entry) => entry.symbol),
      requestedSymbols: basketSymbols,
      benchmark: 'QQQ',
      betaBenchmark: 'SPY',
      observationCount: compositeCloses.length,
      latestDate,
      failedSymbols: failures
    },
    source_priority: [
      {
        rank: 1,
        name: 'Yahoo Chart v8 public endpoint',
        role: 'primary_free_public_daily_prices',
        url: 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
      },
      {
        rank: 2,
        name: 'public-apis/public-apis Finance candidates',
        role: 'source-review fallback candidates only; most reliable equity APIs require apiKey',
        url: 'https://github.com/public-apis/public-apis#finance',
        candidatesReviewed: ['Alpha Vantage', 'Marketstack', 'Finnhub', 'FRED']
      },
      {
        rank: 3,
        name: 'Wind API',
        role: 'paid final fallback only; not used for this panel unless free public prices fail in a future reviewed PR'
      }
    ],
    items
  };
}

function buildUnavailableMarketTechnicalHeatPanel(error) {
  return {
    contractVersion: 'bubble-watch-market-technical-heat-v1',
    boundary: 'display-only audit panel; excluded from Bubble Watch core/shadow indicator scoring, verdict, decision, execution, and position logic',
    as_of_date: isoDate(),
    generated_at: new Date().toISOString(),
    status: 'unavailable',
    label: '数据暂缺',
    heat_score: null,
    counts: { red: 0, yellow: 0, green: 0, total: 0 },
    summary: '公开市场技术热度暂缺。该面板仅作市场温度观察,不能替代估值、现金流或信用条件判断。',
    basket: {
      construction: 'equal_weight_normalized_to_base_100',
      symbols: [],
      requestedSymbols: ['NVDA', 'AMD', 'MSFT', 'GOOGL', 'META', 'TSLA', 'AVGO', 'ORCL'],
      benchmark: 'QQQ',
      betaBenchmark: 'SPY',
      observationCount: 0,
      latestDate: null,
      failedSymbols: []
    },
    source_priority: [
      {
        rank: 1,
        name: 'Yahoo Chart v8 public endpoint',
        role: 'primary_free_public_daily_prices',
        url: 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
      },
      {
        rank: 2,
        name: 'public-apis/public-apis Finance candidates',
        role: 'source-review fallback candidates only; most reliable equity APIs require apiKey',
        url: 'https://github.com/public-apis/public-apis#finance',
        candidatesReviewed: ['Alpha Vantage', 'Marketstack', 'Finnhub', 'FRED']
      },
      {
        rank: 3,
        name: 'Wind API',
        role: 'paid final fallback only; not used for this panel unless free public prices fail in a future reviewed PR'
      }
    ],
    items: [],
    error: error?.message || String(error || '')
  };
}

function windColumnIndex(columns, candidates) {
  const names = (columns || []).map((c) => String(c?.name || '').trim());
  for (const candidate of candidates) {
    const exact = names.indexOf(candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of candidates) {
    const partial = names.findIndex((name) => name.includes(candidate));
    if (partial >= 0) return partial;
  }
  return -1;
}

function windNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[,，]/gu, ''));
  return Number.isFinite(n) ? n : null;
}

function yyyymmdd(d) {
  return d.toISOString().slice(0, 10).replace(/-/gu, '');
}

function windNearestOnOrBefore(pairs, targetDate) {
  let best = null;
  for (const pair of pairs) {
    if (pair.date <= targetDate) best = pair;
  }
  return best || pairs[0] || null;
}

function extractWindDataBlocks(json) {
  const blocks = json?.data?.data;
  return Array.isArray(blocks) ? blocks : [];
}

function extractWindNewsItems(json) {
  const items = json?.data?.items;
  return Array.isArray(items) ? items : [];
}

function normalizeWindNewsItem(item) {
  return {
    title: htmlToText(item?.title || ''),
    content: htmlToText(item?.content || item?.summary || ''),
    date: item?.date || item?.datetime || item?.publish_time || null,
    url: item?.url || null,
    relevance: item?.relevance ?? null,
    doc_type: item?.doc_type || null
  };
}

async function fetchWindNewsEvidence(query, label, topK = 5) {
  const json = await windMcpCall('financial_docs', 'get_financial_news', {
    query,
    top_k: topK
  });
  const items = extractWindNewsItems(json).map(normalizeWindNewsItem);
  if (!items.length) throw new Error(`Wind ${label} news 返回空列表`);
  return items;
}

function extractDataCenterAbsRows(json) {
  const rows = [];
  for (const block of extractWindDataBlocks(json)) {
    const columns = block.columns || [];
    const idx = {
      code: windColumnIndex(columns, ['Wind代码']),
      name: windColumnIndex(columns, ['证券简称']),
      issueDate: windColumnIndex(columns, ['发行起始日期']),
      issueAmount: windColumnIndex(columns, ['发行总额']),
      coupon: windColumnIndex(columns, ['票面利率_发行时', '票面利率']),
      valuationYield: windColumnIndex(columns, ['估值收益率_中债']),
      latestYield: windColumnIndex(columns, ['最新估值收益率']),
      assetClass: windColumnIndex(columns, ['ABS基础资产分类明细'])
    };
    for (const row of block.rows || []) {
      const assetClass = idx.assetClass >= 0 ? String(row[idx.assetClass] || '') : '';
      const shortName = idx.name >= 0 ? String(row[idx.name] || '') : '';
      if (!/数据中心|万国|万数|互联|润泽|世纪/iu.test(`${assetClass} ${shortName}`)) continue;
      rows.push({
        windCode: idx.code >= 0 ? String(row[idx.code] || '') : null,
        shortName: shortName || null,
        issueDate: idx.issueDate >= 0 ? String(row[idx.issueDate] || '') : null,
        issueAmountB: windNumber(idx.issueAmount >= 0 ? row[idx.issueAmount] : null),
        couponRate: windNumber(idx.coupon >= 0 ? row[idx.coupon] : null),
        valuationYield: windNumber(idx.valuationYield >= 0 ? row[idx.valuationYield] : null),
        latestYield: windNumber(idx.latestYield >= 0 ? row[idx.latestYield] : null),
        assetClass: assetClass || null
      });
    }
  }
  const byCode = new Map();
  for (const row of rows) {
    const key = row.windCode || `${row.shortName || ''}|${row.issueDate || ''}`;
    const prev = byCode.get(key) || {};
    byCode.set(key, { ...prev, ...row });
  }
  return [...byCode.values()].sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')));
}

function extractWindAbsBenchmark(json) {
  const dates = json?.data?.date || [];
  const info = json?.data?.indicatorInfo?.[0];
  const values = info?.data || [];
  const pairs = dates.map((date, i) => ({ date: String(date), value: windNumber(values[i]) }))
    .filter((pair) => /^\d{8}$/u.test(pair.date) && Number.isFinite(pair.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pairs.length < 40) throw new Error(`Wind ABS benchmark 有效观测不足:${pairs.length}`);
  const latest = pairs[pairs.length - 1];
  const latestDate = new Date(`${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}T00:00:00Z`);
  const d4w = new Date(latestDate);
  d4w.setUTCDate(d4w.getUTCDate() - 28);
  const d12w = new Date(latestDate);
  d12w.setUTCDate(d12w.getUTCDate() - 84);
  const p4w = windNearestOnOrBefore(pairs, yyyymmdd(d4w));
  const p12w = windNearestOnOrBefore(pairs, yyyymmdd(d12w));
  if (!p4w || !p12w) throw new Error('Wind ABS benchmark 缺 4w/12w 对照点');
  return {
    name: info?.name || '中国:资产支持证券到期收益率(AAA):6个月',
    code: info?.code || null,
    latest,
    p4w,
    p12w,
    change4wBp: (latest.value - p4w.value) * 100,
    change12wBp: (latest.value - p12w.value) * 100,
    observationCount: pairs.length
  };
}

function extractWindDcAbsNewsEvidence(newsJson) {
  const items = extractWindNewsItems(newsJson)
    .filter((item) => /数据中心/iu.test(`${item.title || ''} ${item.content || ''}`))
    .slice(0, 5);
  const text = items.map((item) => `${item.title || ''} ${item.content || ''}`).join('\n');
  const supportCount = (text.match(/超额认购|历史新低|量增价优|发行潮|热度|需求|认可|收益较高|成长/gu) || []).length;
  const pressureCount = (text.match(/违约|降级|发行失败|认购不足|利差走阔|流动性压力|融资压力|风险上升/gu) || []).length;
  const rangeMatch = text.match(/([0-9]+(?:\.[0-9]+)?)%\s*(?:至|到|-|—|~)\s*([0-9]+(?:\.[0-9]+)?)%/u);
  const issueTotalMatch = text.match(/发行总额达到\s*([0-9]+(?:\.[0-9]+)?)\s*亿元/u);
  const recentIssueMatch = text.match(/合计发行了约\s*([0-9]+(?:\.[0-9]+)?)\s*亿元/u);
  return {
    itemCount: items.length,
    supportCount,
    pressureCount,
    yieldRangePct: rangeMatch ? [Number(rangeMatch[1]), Number(rangeMatch[2])] : null,
    issueTotalB: issueTotalMatch ? Number(issueTotalMatch[1]) : null,
    recentDataCenterIssueB: recentIssueMatch ? Number(recentIssueMatch[1]) : null,
    topTitles: items.map((item) => ({ title: item.title || null, date: item.date || null, relevance: item.relevance ?? null }))
  };
}

async function fetchDcAbsSpreadFromWind() {
  const [sampleJson, benchmarkJson, newsJson] = await Promise.all([
    windMcpCall('analytics_data', 'get_financial_data', {
      question: '数据中心ABS发行利差或估值利差最新数据',
      lang: 'CNS'
    }),
    windMcpCall('economic_data', 'get_economic_data', {
      metricIdsStr: '中国资产支持证券ABS收益率AAA',
      beginDate: '20250101',
      endDate: yyyymmdd(new Date(Date.now() + 370 * 86400000))
    }),
    windMcpCall('financial_docs', 'get_financial_news', {
      query: '数据中心ABS',
      top_k: 3
    })
  ]);
  const rows = extractDataCenterAbsRows(sampleJson);
  if (rows.length < 2) throw new Error(`Wind 数据中心 ABS 样本不足:${rows.length}`);
  const benchmark = extractWindAbsBenchmark(benchmarkJson);
  const news = extractWindDcAbsNewsEvidence(newsJson);
  const hasDirectYield = rows.some((row) => Number.isFinite(row.valuationYield) || Number.isFinite(row.latestYield) || Number.isFinite(row.couponRate));

  let status = 'yellow';
  let display = '稳定';
  if (benchmark.change4wBp >= 50 || (benchmark.change4wBp >= 15 && news.pressureCount >= 2)) {
    status = 'red';
    display = '走阔';
  } else if (benchmark.change4wBp >= 15 || news.pressureCount >= 2) {
    status = 'yellow';
    display = '压力观察';
  } else if (benchmark.change12wBp <= -10 && news.supportCount >= 2) {
    status = 'green';
    display = '收窄';
  }

  const latestRow = rows[0];
  const amountText = Number.isFinite(latestRow.issueAmountB) ? `、规模 ${latestRow.issueAmountB.toFixed(1)} 亿元` : '';
  const directYieldText = hasDirectYield ? '部分样本含收益率/票息字段' : '样本券最新估值利差/收益率字段多为空';
  const rangeText = news.yieldRangePct ? `;新闻样本提到年分配率 ${news.yieldRangePct[0]}%-${news.yieldRangePct[1]}%` : '';
  return {
    status,
    value_display: display,
    source_name: 'Wind MCP paid optional proxy',
    note: `Wind 付费可选源识别数据中心 ABS/类 REITs 样本 ${rows.length} 只,最新样本 ${latestRow.shortName || latestRow.windCode || 'n/a'}(${latestRow.issueDate || 'n/a'}${amountText});${benchmark.name} 最新 ${benchmark.latest.value.toFixed(2)}%,4 周 ${benchmark.change4wBp >= 0 ? '+' : ''}${benchmark.change4wBp.toFixed(1)}bp、12 周 ${benchmark.change12wBp >= 0 ? '+' : ''}${benchmark.change12wBp.toFixed(1)}bp;新闻证据 ${news.itemCount} 条,支持词 ${news.supportCount}/压力词 ${news.pressureCount}${rangeText}。${directYieldText},因此本项明确为 paid proxy,不伪装为正式数据中心专属连续利差。判级:4 周走阔 ≥50bp=红 / ≥15bp 或压力词升温=黄 / 12 周收窄且需求证据充足=绿`,
    detail: {
      source: 'Wind MCP paid optional',
      directDataCenterYieldAvailable: hasDirectYield,
      sampleRows: rows.slice(0, 8),
      benchmark,
      news
    }
  };
}

function classifyCeoHedgingEvidence(relevantCount, executiveHitCount) {
  if (relevantCount >= 12 && executiveHitCount >= 3) return { status: 'red', display: '普遍' };
  if (relevantCount >= 3 || executiveHitCount >= 1) return { status: 'yellow', display: '部分' };
  return { status: 'green', display: '无' };
}

const CEO_HEDGING_STATUS_RANK = { green: 0, yellow: 1, red: 2 };
const CEO_HEDGING_STATUS_DISPLAY = { green: '无', yellow: '部分', red: '普遍' };
const GDELT_CEO_HEDGING_QUERY = '("AI bubble" OR "artificial intelligence bubble" OR "AI overbuild" OR "AI capex bubble")';
const GDELT_CEO_HEDGING_QUERY_SPEC = { label: 'weekly_30d_hybrid_cache', maxrecords: '20', timespan: '30d', sort: 'HybridRel' };

function rankCeoHedgingStatus(status) {
  return CEO_HEDGING_STATUS_RANK[status] ?? 0;
}

function ceoHedgingStatusFromRank(rank) {
  if (rank >= 2) return 'red';
  if (rank >= 1) return 'yellow';
  return 'green';
}

function ceoHedgingDisplayForStatus(status) {
  return CEO_HEDGING_STATUS_DISPLAY[status] || CEO_HEDGING_STATUS_DISPLAY.green;
}

function getCeoHedgingResultCounts(result) {
  return {
    articleCount: Number.isFinite(result?.detail?.articleCount) ? result.detail.articleCount : null,
    executiveHitCount: Number.isFinite(result?.detail?.executiveHitCount) ? result.detail.executiveHitCount : null,
    resultCount: Number.isFinite(result?.detail?.resultCount) ? result.detail.resultCount : null
  };
}

function capSingleSourceCeoHedgingRed(result, reason) {
  if (result?.status !== 'red') return result;
  return {
    ...result,
    status: 'yellow',
    value_display: ceoHedgingDisplayForStatus('yellow'),
    note: `${result.note} 当前只有单一路径达到红色强度,尚未形成独立来源共振,按保守口径先维持黄灯。`,
    detail: {
      ...(result.detail || {}),
      singleSourceCapApplied: true,
      singleSourceCapReason: reason,
      uncappedStatus: 'red'
    }
  };
}

function unavailableCeoHedgingConfirmation(source, errorOrReason) {
  return {
    source,
    result: null,
    status: 'unavailable',
    reason: compactSnippet(errorOrReason?.message || errorOrReason || 'not configured', 120)
  };
}

function availableCeoHedgingConfirmation(source, result) {
  return {
    source,
    result,
    status: result.status
  };
}

function formatCeoHedgingSourceSummary(entry) {
  if (!entry?.result) return `${entry.source}:不可用(${entry.reason || 'unknown'})`;
  const counts = getCeoHedgingResultCounts(entry.result);
  return `${entry.source}:${entry.result.value_display}(新闻${counts.articleCount ?? 'n/a'},高管${counts.executiveHitCount ?? 'n/a'})`;
}

function collectCeoHedgingEvidenceText(entries) {
  return entries
    .filter((entry) => entry?.result)
    .flatMap((entry) => [
      ...(entry.result.detail?.topArticles || []),
      ...(entry.result.detail?.crossConfirmations || []).flatMap((confirmation) => confirmation.topArticles || [])
    ])
    .map((article) => `${article.title || ''} ${article.snippet || ''} ${article.source || ''}`)
    .join(' ');
}

function ageHours(isoValue) {
  return gdeltCacheAgeHours(isoValue);
}

function gdeltBubbleCacheAgeStatus(cache) {
  const hours = ageHours(cache?.generatedAt);
  if (!Number.isFinite(hours)) return 'invalid';
  if (hours <= GDELT_BUBBLE_CACHE_TTL_HOURS) return 'fresh';
  if (hours <= GDELT_BUBBLE_STALE_MAX_DAYS * 24) return 'stale';
  return 'expired';
}

function readGdeltBubbleWatchCache() {
  try {
    if (!fs.existsSync(GDELT_BUBBLE_CACHE_PATH)) return { cache: null, reason: 'missing' };
    const cache = JSON.parse(fs.readFileSync(GDELT_BUBBLE_CACHE_PATH, 'utf8'));
    if (cache?.schemaVersion !== GDELT_BUBBLE_CACHE_SCHEMA_VERSION || cache?.module !== GDELT_BUBBLE_CACHE_MODULE) {
      return { cache: null, reason: 'schema_mismatch' };
    }
    if (cache.cacheScope !== 'bubble_watch_ceo_hedging') return { cache: null, reason: 'scope_mismatch' };
    if (!Array.isArray(cache.articles)) return { cache: null, reason: 'articles_not_array' };
    return { cache, reason: 'ok' };
  } catch (error) {
    return { cache: null, reason: `read_error:${compactSnippet(error.message, 80)}` };
  }
}

function compactGdeltBubbleArticle(article) {
  return {
    title: compactSnippet(article?.title || '', 220) || null,
    url: article?.url || null,
    domain: article?.domain || null,
    seendate: article?.seendate || article?.seenDate || null
  };
}

function articlesFromGdeltBubbleCache(cache) {
  return (Array.isArray(cache?.articles) ? cache.articles : []).map((article) => ({
    title: article.title || '',
    url: article.url || '',
    domain: article.domain || null,
    seendate: article.seendate || null
  }));
}

function writeGdeltBubbleWatchCache({
  status,
  sourceStatus,
  requestMode,
  articles = [],
  request = GDELT_CEO_HEDGING_QUERY_SPEC,
  requestDiagnostics = null,
  error = null
}) {
  const compactArticles = articles.map(compactGdeltBubbleArticle);
  const cache = {
    schemaVersion: GDELT_BUBBLE_CACHE_SCHEMA_VERSION,
    module: GDELT_BUBBLE_CACHE_MODULE,
    generatedAt: new Date().toISOString(),
    sourceKey: 'gdelt_bubble_watch_ceo_hedging',
    cacheScope: 'bubble_watch_ceo_hedging',
    status,
    sourceStatus,
    requestMode,
    source: 'GDELT DOC public search',
    cachePolicy: {
      ttlHours: GDELT_BUBBLE_CACHE_TTL_HOURS,
      staleMaxDays: GDELT_BUBBLE_STALE_MAX_DAYS,
      lowFrequencyCache: true,
      broadQueryLocalClassification: true
    },
    query: {
      id: 'gdelt_bubble_ceo_hedging',
      label: 'GDELT Bubble Watch CEO hedging cache query',
      query: GDELT_CEO_HEDGING_QUERY,
      mode: 'ArtList',
      maxrecords: request.maxrecords || null,
      timespan: request.timespan || null,
      sort: request.sort || null
    },
    requestDiagnostics: requestDiagnostics ? sanitizeGdeltDiagnostics(requestDiagnostics) : null,
    aggregate: {
      articleCount: compactArticles.length
    },
    articles: compactArticles,
    error: error ? compactSnippet(error.message || error, 180) : null,
    promotionEligible: false,
    productionDisplayApproved: false,
    productionImpact: {
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    },
    limitationsZh: [
      'GDELT 是低频缓存型新闻代理源,不是高频实时新闻或事件确认源。',
      '本 cache 只保存 compact 标题、URL、domain 与时间戳,不保存正文、snippet 或 raw response。',
      '本 cache 不确认 AI 泡沫、CEO 集体承认过热、市场顶部或交易信号。'
    ],
    boundary: GDELT_BUBBLE_CACHE_BOUNDARY
  };
  fs.writeFileSync(GDELT_BUBBLE_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
  return cache;
}

function buildCeoHedgingPublicNarrative(entries, status) {
  const evidenceText = collectCeoHedgingEvidenceText(entries);
  const hasAltman = /\bAltman\b|OpenAI/iu.test(evidenceText);
  const hasPichai = /\bPichai\b|Google|Alphabet/iu.test(evidenceText);
  const hasDimon = /\bDimon\b|JPMorgan|JPM/iu.test(evidenceText);
  const hasSemi = /\bNvidia|Broadcom|AMD|semiconductor|chip\b/iu.test(evidenceText);
  const hasCapex = /\bcapex|data center|overbuild|spending|cost|budget|huge issue\b/iu.test(evidenceText);
  const hasValuation = /\bbubble|valuation|irrational|mania|burst|dot-com|stock market\b/iu.test(evidenceText);

  const lead = status === 'red'
    ? '对冲表态明显扩散'
    : status === 'yellow'
      ? '对冲表态继续升温'
      : '对冲表态暂未扩散';
  const signals = [];
  if (hasAltman) signals.push('Altman 关于 AI 成本压力的表态被多篇引用');
  if (hasPichai) signals.push('Google/Alphabet 相关高管线索进入泡沫讨论');
  if (hasDimon) signals.push('Dimon 等金融高管的泡沫风险表述被市场关注');
  if (hasSemi) signals.push('AI 股与半导体波动带出估值疑虑');
  if (hasCapex) signals.push('数据中心投入、capex 回报和过建风险被反复讨论');
  if (hasValuation) signals.push('多篇新闻围绕 AI bubble、估值和回撤风险展开');
  const evidenceSentence = signals.length
    ? signals.slice(0, 3).join('；')
    : '近期新闻集中讨论 AI bubble、估值压力和资本开支可持续性';
  if (status === 'red') {
    return `${lead}:${evidenceSentence}。高管/市场领袖承认过热的频率与强度已明显偏高,升至红灯。`;
  }
  if (status === 'yellow') {
    return `${lead}:${evidenceSentence}。频率与强度偏高,但尚未看到 CEO 集体承认过热或暂停投入,维持黄灯。`;
  }
  return `${lead}:${evidenceSentence}。当前公开表态仍以市场讨论和分析师质疑为主,缺少直接高管共振,维持绿灯。`;
}

function serializeCeoHedgingConfirmation(entry) {
  if (!entry?.result) {
    return {
      source: entry.source,
      status: 'unavailable',
      reason: entry.reason || null
    };
  }
  const counts = getCeoHedgingResultCounts(entry.result);
  return {
    source: entry.source,
    status: entry.result.status,
    value_display: entry.result.value_display,
    ...counts,
    usage: entry.result.detail?.usage || null,
    requestId: entry.result.detail?.requestId || null,
    topArticles: entry.result.detail?.topArticles || []
  };
}

function mergeCeoHedgingNewsConfirmations(primaryEntry, confirmationEntries, options = {}) {
  const entries = [primaryEntry, ...confirmationEntries];
  const availableEntries = entries.filter((entry) => entry?.result);
  const strongestRank = availableEntries.reduce((maxRank, entry) => Math.max(maxRank, rankCeoHedgingStatus(entry.result.status)), 0);
  const confirmingSourceCount = availableEntries.filter((entry) => rankCeoHedgingStatus(entry.result.status) >= 1).length;
  const multiSourceConfirmed = confirmingSourceCount >= 2;
  const mergedRank = strongestRank >= 2 && !multiSourceConfirmed ? 1 : strongestRank;
  const status = ceoHedgingStatusFromRank(mergedRank);
  const display = ceoHedgingDisplayForStatus(status);
  const primaryResult = primaryEntry.result;
  const summary = entries.map(formatCeoHedgingSourceSummary).join(' / ');
  const publicNarrative = buildCeoHedgingPublicNarrative(entries, status);
  return {
    ...primaryResult,
    status,
    value_display: display,
    source_name: `${availableEntries.map((entry) => entry.source).join(' + ')}${options.primaryFailure ? ' fallback' : ' cross-check'}`,
    note: publicNarrative,
    detail: {
      ...(primaryResult.detail || {}),
      source: `${availableEntries.map((entry) => entry.source).join(' + ')}${options.primaryFailure ? ' fallback' : ''}`,
      freePrimaryFailure: options.primaryFailure?.message || primaryResult.detail?.freePrimaryFailure || null,
      sourceSummary: summary,
      crossConfirmations: confirmationEntries.map(serializeCeoHedgingConfirmation),
      crossConfirmation: confirmationEntries.length === 1 ? serializeCeoHedgingConfirmation(confirmationEntries[0]) : undefined,
      crossConfirmationRule: {
        redRequiresTwoIndependentNewsSources: true,
        independentSources: ['GDELT DOC 2.0', 'Tavily Search API', 'Brave News Search API'],
        availableSourceCount: availableEntries.length,
        confirmingSourceCount,
        strongestStatusBeforeCap: ceoHedgingStatusFromRank(strongestRank),
        mergedStatus: status
      }
    }
  };
}

async function fetchGdeltDocCeoHedgingArticles() {
  const cached = readGdeltBubbleWatchCache();
  const cacheStatus = gdeltBubbleCacheAgeStatus(cached.cache);
  const cacheUsable = cached.cache?.status === 'ok' && Array.isArray(cached.cache?.articles);
  if (cacheUsable && cacheStatus === 'fresh') {
    return {
      articles: articlesFromGdeltBubbleCache(cached.cache),
      request: {
        ...GDELT_CEO_HEDGING_QUERY_SPEC,
        label: 'fresh_cache',
        cacheStatus
      },
      attempts: [],
      cacheStatus,
      cacheGeneratedAt: cached.cache.generatedAt,
      requestDiagnostics: cached.cache.requestDiagnostics || null
    };
  }

  const params = new URLSearchParams({
    query: GDELT_CEO_HEDGING_QUERY,
    mode: 'ArtList',
    format: 'json',
    maxrecords: GDELT_CEO_HEDGING_QUERY_SPEC.maxrecords,
    timespan: GDELT_CEO_HEDGING_QUERY_SPEC.timespan,
    sort: GDELT_CEO_HEDGING_QUERY_SPEC.sort
  });

  try {
    const { json, diagnostics } = await fetchGdeltDocJson({
      queryParams: params,
      userAgent: BROWSER_UA,
      timeoutMs: 15000,
      maxRetries: 1,
      label: 'Bubble Watch CEO hedging GDELT DOC'
    });
    const articles = Array.isArray(json?.articles) ? json.articles : [];
    writeGdeltBubbleWatchCache({
      status: 'ok',
      sourceStatus: 'live',
      requestMode: 'live_weekly_query',
      articles,
      request: GDELT_CEO_HEDGING_QUERY_SPEC,
      requestDiagnostics: diagnostics
    });
    return {
      articles,
      request: {
        ...GDELT_CEO_HEDGING_QUERY_SPEC,
        cacheStatus: 'refreshed_live'
      },
      attempts: [{ ...GDELT_CEO_HEDGING_QUERY_SPEC, status: 'ok' }],
      cacheStatus: 'refreshed_live',
      requestDiagnostics: diagnostics
    };
  } catch (error) {
    console.warn(`[bubble-watch] GDELT CEO hedging live query failed: ${error.message}`);
    if (cacheUsable && cacheStatus === 'stale') {
      return {
        articles: articlesFromGdeltBubbleCache(cached.cache),
        request: {
          ...GDELT_CEO_HEDGING_QUERY_SPEC,
          label: 'stale_cache_live_failed',
          cacheStatus
        },
        attempts: [{ ...GDELT_CEO_HEDGING_QUERY_SPEC, status: 'failed', error: compactSnippet(error.message, 140) }],
        cacheStatus,
        cacheGeneratedAt: cached.cache.generatedAt,
        liveFailure: error.message,
        requestDiagnostics: error.gdeltDiagnostics ? sanitizeGdeltDiagnostics(error.gdeltDiagnostics) : null
      };
    }
    writeGdeltBubbleWatchCache({
      status: 'error',
      sourceStatus: 'error',
      requestMode: 'live_weekly_query_failed_no_usable_cache',
      articles: cached.cache?.articles || [],
      request: GDELT_CEO_HEDGING_QUERY_SPEC,
      requestDiagnostics: error.gdeltDiagnostics ? sanitizeGdeltDiagnostics(error.gdeltDiagnostics) : null,
      error
    });
    const wrapped = new Error(`GDELT DOC search failed and no usable Bubble Watch cache was available: ${error.message}`);
    wrapped.gdeltAttempts = [{ ...GDELT_CEO_HEDGING_QUERY_SPEC, status: 'failed', error: compactSnippet(error.message, 140), cacheRead: cached.reason, cacheStatus }];
    wrapped.gdeltDiagnostics = error.gdeltDiagnostics ? sanitizeGdeltDiagnostics(error.gdeltDiagnostics) : null;
    throw wrapped;
  }
}

async function fetchCeoHedgingFromGdeltPublic() {
  const { articles, request, attempts, cacheStatus, cacheGeneratedAt, liveFailure, requestDiagnostics } = await fetchGdeltDocCeoHedgingArticles();
  const executiveRe = /\b(CEO|chief executive|Altman|Nadella|Huang|Musk|Zuckerberg|Pichai|Ellison|Hock Tan|Lisa Su)\b/iu;
  const overheatRe = /\b(bubble|overbuild|overbuilt|overheated|irrational|mania|capex)\b/iu;
  const relevant = articles.filter((a) => overheatRe.test(`${a.title || ''} ${a.url || ''}`));
  const executiveHits = relevant.filter((a) => executiveRe.test(`${a.title || ''} ${a.url || ''}`));
  const { status, display } = classifyCeoHedgingEvidence(relevant.length, executiveHits.length);
  const windowText = request.timespan === '14d' ? '近 14 天' : '近 30 天';
  const cacheText = cacheStatus === 'fresh'
    ? `本次读取 ${GDELT_BUBBLE_CACHE_TTL_HOURS} 小时内 fresh cache`
    : cacheStatus === 'stale'
      ? `live 查询失败后读取 ${GDELT_BUBBLE_STALE_MAX_DAYS} 天内 stale cache`
      : '本次 live 查询并刷新 compact cache';
  return {
    status,
    value_display: display,
    source_name: 'GDELT DOC 2.0 public news search cache',
    note: `GDELT DOC 2.0 ${windowText}公开新闻检索(${request.label}):AI bubble/overbuild/capex 相关报道 ${relevant.length} 条,其中带 CEO/核心高管姓名线索 ${executiveHits.length} 条;${cacheText};该项按媒体中高管对冲语言频率保守判为「${display}」。判级:普遍承认过热=红 / 部分=黄 / 无=绿`,
    detail: {
      source: 'GDELT DOC 2.0',
      query: GDELT_CEO_HEDGING_QUERY,
      gdeltRequest: request,
      gdeltAttempts: attempts,
      gdeltCache: {
        schemaVersion: GDELT_BUBBLE_CACHE_SCHEMA_VERSION,
        cacheStatus: cacheStatus || 'unknown',
        cacheGeneratedAt: cacheGeneratedAt || null,
        liveFailure: liveFailure || null
      },
      requestDiagnostics: requestDiagnostics ? sanitizeGdeltDiagnostics(requestDiagnostics) : null,
      articleCount: relevant.length,
      executiveHitCount: executiveHits.length,
      topArticles: relevant.slice(0, 5).map((a) => ({ title: a.title || null, url: a.url || null, domain: a.domain || null, seendate: a.seendate || null }))
    }
  };
}

async function tavilySearch(payload) {
  if (!TAVILY_API_KEYS.length) throw new Error('TAVILY_API_KEYS 未配置');
  let lastError = null;
  for (let i = 0; i < TAVILY_API_KEYS.length; i++) {
    const key = TAVILY_API_KEYS[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'User-Agent': UA
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
      try {
        return JSON.parse(text);
      } catch (parseError) {
        throw new Error(`Tavily JSON parse failed: ${parseError.message}`);
      }
    } catch (error) {
      lastError = error;
      console.warn(`[bubble-watch] Tavily CEO hedging search key ${i + 1}/${TAVILY_API_KEYS.length} failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Tavily Search API failed');
}

async function braveNewsSearch(params) {
  if (!BRAVE_API_KEYS.length) throw new Error('BRAVE_API_KEYS 未配置');
  let lastError = null;
  for (let i = 0; i < BRAVE_API_KEYS.length; i++) {
    const key = BRAVE_API_KEYS[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const url = `https://api.search.brave.com/res/v1/news/search?${params}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'User-Agent': UA,
          'X-Subscription-Token': key
        },
        signal: controller.signal
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Brave News HTTP ${res.status}`);
      try {
        return JSON.parse(text);
      } catch (parseError) {
        throw new Error(`Brave News JSON parse failed: ${parseError.message}`);
      }
    } catch (error) {
      lastError = error;
      console.warn(`[bubble-watch] Brave CEO hedging news key ${i + 1}/${BRAVE_API_KEYS.length} failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Brave News Search API failed');
}

async function fetchCeoHedgingFromWindNews(gdeltError) {
  const json = await windMcpCall('financial_docs', 'get_financial_news', {
    query: 'AI泡沫CEO',
    top_k: 5
  });
  const items = extractWindNewsItems(json);
  if (!items.length) throw new Error('Wind CEO hedging news 返回空列表');
  const aiRe = /\bAI\b|人工智能/iu;
  const overheatRe = /泡沫|过热|非理性|担忧|质疑|风险|破裂|bubble|overbuild|overheated|irrational|mania|capex/iu;
  const executiveRe = /CEO|首席执行官|高管|黄仁勋|Altman|奥特曼|Nadella|纳德拉|Pichai|皮查伊|Zuckerberg|扎克伯格|Ellison|埃里森|Dalio|达利欧/iu;
  const cautionRe = /担忧|质疑|警告|风险|破裂|放缓|非理性|泡沫|bubble|overheated|irrational/iu;
  const relevant = items.filter((item) => {
    const text = `${item.title || ''} ${item.content || ''}`;
    return aiRe.test(text) && overheatRe.test(text);
  });
  const executiveHits = relevant.filter((item) => executiveRe.test(`${item.title || ''} ${item.content || ''}`));
  const cautionHits = relevant.filter((item) => cautionRe.test(`${item.title || ''} ${item.content || ''}`));
  const { status, display } = classifyCeoHedgingEvidence(relevant.length, executiveHits.length);
  const narrative = status === 'red'
    ? '对冲表态明显扩散:近期新闻持续围绕 AI 泡沫、估值压力和资本开支可持续性展开,并出现较多 CEO/高管谨慎表述。承认过热的频率与强度已明显偏高,升至红灯。'
    : status === 'yellow'
      ? '对冲表态继续升温:近期新闻继续围绕 AI 泡沫、估值压力和资本开支可持续性展开,并出现部分 CEO/高管谨慎表述。频率与强度偏高,但尚未看到 CEO 集体承认过热或暂停投入,维持黄灯。'
      : '对冲表态暂未扩散:近期公开新闻仍以市场讨论和分析师质疑为主,缺少直接高管共振,维持绿灯。';
  return {
    status,
    value_display: display,
    source_name: 'Wind MCP paid optional news fallback',
    note: narrative,
    detail: {
      source: 'Wind MCP financial_docs.get_financial_news',
      freePrimaryFailure: gdeltError?.message || String(gdeltError || ''),
      articleCount: relevant.length,
      executiveHitCount: executiveHits.length,
      cautionHitCount: cautionHits.length,
      topArticles: relevant.slice(0, 5).map((item) => ({
        title: item.title || null,
        date: item.date || null,
        relevance: item.relevance ?? null,
        doc_type: item.doc_type || null
      }))
    }
  };
}

async function fetchCeoHedgingFromTavilyPublic(gdeltError, mode = 'fallback') {
  const query = '"AI bubble" OR "artificial intelligence bubble" OR "AI overbuild" OR "AI capex bubble" CEO executive';
  const json = await tavilySearch({
    query,
    topic: 'news',
    search_depth: 'basic',
    max_results: 10,
    time_range: 'month',
    include_answer: false,
    include_raw_content: false,
    include_usage: true
  });
  const results = Array.isArray(json?.results) ? json.results : [];
  if (!results.length) throw new Error('Tavily CEO hedging news 返回空列表');
  const aiRe = /\bAI\b|artificial intelligence|Nvidia|OpenAI|Microsoft|Meta|Google|Alphabet|Oracle|Broadcom|AMD|Tesla/iu;
  const executiveRe = /\b(CEO|chief executive|executive|Altman|Nadella|Huang|Musk|Zuckerberg|Pichai|Ellison|Hock Tan|Lisa Su)\b/iu;
  const overheatRe = /\b(bubble|overbuild|overbuilt|overheated|irrational|mania|capex|spending boom|data center glut)\b/iu;
  const relevant = results.filter((item) => {
    const text = `${item.title || ''} ${item.content || ''} ${item.url || ''}`;
    return aiRe.test(text) && overheatRe.test(text);
  });
  const executiveHits = relevant.filter((item) => executiveRe.test(`${item.title || ''} ${item.content || ''}`));
  const { status, display } = classifyCeoHedgingEvidence(relevant.length, executiveHits.length);
  const isCrossCheck = mode === 'cross_check';
  return {
    status,
    value_display: display,
    source_name: isCrossCheck ? 'Tavily Search API news cross-check' : 'Tavily Search API news fallback',
    note: isCrossCheck
      ? `Tavily 免费额度新闻搜索交叉确认:近 30 天 AI bubble/overbuild/capex 相关新闻 ${relevant.length} 条,其中 CEO/核心高管线索 ${executiveHits.length} 条;该项仅作为 GDELT 结果的第二来源确认,单一路径命中不得直接升红。`
      : `GDELT 免费新闻源失败(${compactSnippet(gdeltError?.message || gdeltError, 90)})后,启用 Tavily 免费额度新闻搜索兜底:近 30 天 AI bubble/overbuild/capex 相关新闻 ${relevant.length} 条,其中 CEO/核心高管线索 ${executiveHits.length} 条;该项仍按公开新闻语义保守判为「${display}」。判级:普遍承认过热=红 / 部分=黄 / 无=绿`,
    detail: {
      source: 'Tavily Search API',
      sourceMode: mode,
      freePrimaryFailure: isCrossCheck ? null : gdeltError?.message || String(gdeltError || ''),
      query,
      topic: 'news',
      timeRange: 'month',
      resultCount: results.length,
      articleCount: relevant.length,
      executiveHitCount: executiveHits.length,
      usage: json?.usage || null,
      requestId: json?.request_id || null,
      topArticles: relevant.slice(0, 5).map((item) => ({
        title: item.title || null,
        url: item.url || null,
        score: Number.isFinite(item.score) ? item.score : null,
        published_date: item.published_date || item.publishedDate || null,
        snippet: compactSnippet(item.content || '', 180)
      }))
    }
  };
}

async function fetchCeoHedgingFromBraveNews(gdeltError, mode = 'fallback') {
  const query = '"AI bubble" OR "artificial intelligence bubble" OR "AI overbuild" OR "AI capex bubble" CEO executive';
  const params = new URLSearchParams({
    q: query,
    freshness: 'pm',
    count: '10',
    country: 'US',
    search_lang: 'en',
    ui_lang: 'en-US',
    extra_snippets: 'true'
  });
  const json = await braveNewsSearch(params);
  const results = Array.isArray(json?.results) ? json.results : [];
  if (!results.length) throw new Error('Brave CEO hedging news 返回空列表');
  const aiRe = /\bAI\b|artificial intelligence|Nvidia|OpenAI|Microsoft|Meta|Google|Alphabet|Oracle|Broadcom|AMD|Tesla/iu;
  const executiveRe = /\b(CEO|chief executive|executive|Altman|Nadella|Huang|Musk|Zuckerberg|Pichai|Ellison|Hock Tan|Lisa Su)\b/iu;
  const overheatRe = /\b(bubble|overbuild|overbuilt|overheated|irrational|mania|capex|spending boom|data center glut)\b/iu;
  const relevant = results.filter((item) => {
    const extra = Array.isArray(item.extra_snippets) ? item.extra_snippets.join(' ') : '';
    const text = `${item.title || ''} ${item.description || ''} ${extra} ${item.url || ''}`;
    return aiRe.test(text) && overheatRe.test(text);
  });
  const executiveHits = relevant.filter((item) => {
    const extra = Array.isArray(item.extra_snippets) ? item.extra_snippets.join(' ') : '';
    return executiveRe.test(`${item.title || ''} ${item.description || ''} ${extra}`);
  });
  const { status, display } = classifyCeoHedgingEvidence(relevant.length, executiveHits.length);
  const isCrossCheck = mode === 'cross_check';
  return {
    status,
    value_display: display,
    source_name: isCrossCheck ? 'Brave News Search API cross-check' : 'Brave News Search API fallback',
    note: isCrossCheck
      ? `Brave News Search 交叉确认:近 31 天 AI bubble/overbuild/capex 相关新闻 ${relevant.length} 条,其中 CEO/核心高管线索 ${executiveHits.length} 条;该项仅作为 GDELT/Tavily 的独立新闻索引确认,单一路径命中不得直接升红。`
      : `GDELT 免费新闻源失败(${compactSnippet(gdeltError?.message || gdeltError, 90)})后,启用 Brave News Search 免费额度兜底:近 31 天 AI bubble/overbuild/capex 相关新闻 ${relevant.length} 条,其中 CEO/核心高管线索 ${executiveHits.length} 条;该项仍按公开新闻语义保守判为「${display}」。判级:普遍承认过热=红 / 部分=黄 / 无=绿`,
    detail: {
      source: 'Brave News Search API',
      sourceMode: mode,
      freePrimaryFailure: isCrossCheck ? null : gdeltError?.message || String(gdeltError || ''),
      query,
      endpoint: 'news/search',
      freshness: 'pm',
      resultCount: results.length,
      articleCount: relevant.length,
      executiveHitCount: executiveHits.length,
      topArticles: relevant.slice(0, 5).map((item) => ({
        title: item.title || null,
        url: item.url || null,
        age: item.age || null,
        page_age: item.page_age || null,
        source: item.meta_url?.hostname || item.profile?.name || null,
        snippet: compactSnippet(item.description || '', 180)
      }))
    }
  };
}

async function tryCeoHedgingConfirmation(source, taskFn) {
  try {
    return availableCeoHedgingConfirmation(source, await taskFn());
  } catch (error) {
    console.warn(`[bubble-watch] ${source} CEO hedging confirmation failed: ${error.message}`);
    return unavailableCeoHedgingConfirmation(source, error);
  }
}

function hasAnyCeoHedgingSearchKey() {
  return TAVILY_API_KEYS.length > 0 || BRAVE_API_KEYS.length > 0;
}

async function collectCeoHedgingFreeSearchConfirmations(gdeltError, mode) {
  const tasks = [];
  if (TAVILY_API_KEYS.length) {
    tasks.push(tryCeoHedgingConfirmation('Tavily Search API', () => fetchCeoHedgingFromTavilyPublic(gdeltError, mode)));
  } else {
    tasks.push(Promise.resolve(unavailableCeoHedgingConfirmation('Tavily Search API', 'TAVILY_API_KEYS 未配置')));
  }
  if (BRAVE_API_KEYS.length) {
    tasks.push(tryCeoHedgingConfirmation('Brave News Search API', () => fetchCeoHedgingFromBraveNews(gdeltError, mode)));
  } else {
    tasks.push(Promise.resolve(unavailableCeoHedgingConfirmation('Brave News Search API', 'BRAVE_API_KEYS 未配置')));
  }
  return Promise.all(tasks);
}

async function fetchCeoHedgingWithTieredSources() {
  try {
    const gdeltResult = await fetchCeoHedgingFromGdeltPublic();
    const confirmations = await collectCeoHedgingFreeSearchConfirmations(null, 'cross_check');
    return mergeCeoHedgingNewsConfirmations(
      availableCeoHedgingConfirmation('GDELT DOC 2.0', gdeltResult),
      confirmations
    );
  } catch (error) {
    console.warn(`[bubble-watch] GDELT CEO hedging failed, try Tavily/Brave free fallbacks: ${error.message}`);
    if (hasAnyCeoHedgingSearchKey()) {
      const confirmations = await collectCeoHedgingFreeSearchConfirmations(error, 'fallback');
      const available = confirmations.filter((entry) => entry.result);
      if (available.length) {
        return mergeCeoHedgingNewsConfirmations(
          available[0],
          confirmations.filter((entry) => entry !== available[0]),
          { primaryFailure: error }
        );
      }
    }
    console.warn('[bubble-watch] Tavily/Brave CEO hedging fallbacks unavailable, try Wind paid fallback');
    const windErrorContext = new Error(`GDELT failed: ${error.message}; Tavily/Brave free search unavailable`);
    return capSingleSourceCeoHedgingRed(
      await fetchCeoHedgingFromWindNews(windErrorContext),
      'GDELT/Tavily/Brave 免费新闻路径均不可用,Wind 为唯一付费兜底路径'
    );
  }
}

const hybridCuratedBuilders = {
  vc_ai_share: fetchVcAiShareFromCrunchbase,
  ai_ipo_pipeline: fetchAiIpoPipelineFromCrunchbase,
  dc_abs_spread: fetchDcAbsSpreadFromWind,
  debt_capex_ratio: fetchDebtCapexRatioFromPublicResearch,
  neocloud_credit: fetchNeocloudCreditFromPublicMonitor,
  token_volume_mom: fetchTokenVolumeMomFromOpenRouter,
  token_revenue_ratio: fetchTokenRevenueRatioFromOpenRouter,
  arr_2nd_deriv: fetchArrSecondDerivativeFromSaastr,
  enterprise_deploy: fetchEnterpriseDeployFromPublicReports,
  accounting_events: fetchAccountingEventsFromPublicSearch,
  capex_reaction: fetchCapexReactionFromPublicProxy,
  ceo_hedging: fetchCeoHedgingWithTieredSources
};

const windFinalFallbackBuilders = {
  ai_ipo_pipeline: fetchAiIpoPipelineFromWindNews,
  accounting_events: fetchAccountingEventsFromWindNews,
  token_revenue_ratio: fetchTokenRevenueRatioFromWindNews,
  enterprise_deploy: fetchEnterpriseDeployFromWindNews,
  capex_reaction: fetchCapexReactionFromWindNews
};

// ---------- 上游周报同步(aibubble-cn.github.io)----------
// 编辑/研究类指标(及自动指标的 fallback 快照)无公开 API,每次周一 build 先检查
// 上游 AI 泡沫监测周报(aibubble-cn.github.io 的实际数据源 = ai-bubble-monitor
// latest.json):上游 as_of_date 比本地 curated 口径新 → 自动采纳其
// status/value_display/note 并回写 config(workflow 随数据一起提交,实现
// 「每周一检查,拿不到下周一再查」的滚动自动同步)。上游不可达/未更新 → 保持现状,
// 超期由 STALE 角标显式暴露。
const UPSTREAM_LATEST_URLS = [
  // aibubble-cn.github.io 页面 fetch 的真实数据端点
  'https://raw.githubusercontent.com/crystal-xiaoxiao/ai-bubble-monitor/main/docs/data/latest.json',
  // 上游 README 中登记的 GitHub Pages dashboard 同源数据路径
  'https://crystal-xiaoxiao.github.io/ai-bubble-monitor/data/latest.json',
  // 若 aibubble-cn 日后改为站内托管的兜底路径(当前可能 404)
  'https://aibubble-cn.github.io/data/latest.json'
];

const UPSTREAM_SNAPSHOT_INDEX_URLS = [
  // latest.json 不可用时,从 GitHub contents API 枚举历史 snapshots,取日期最新文件
  'https://api.github.com/repos/crystal-xiaoxiao/ai-bubble-monitor/contents/docs/data/snapshots?ref=main'
];

function cacheBust(url) {
  return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
}

function isValidUpstreamPayload(json) {
  return Boolean(
    json &&
    /^\d{4}-\d{2}-\d{2}$/u.test(json.as_of_date || '') &&
    Array.isArray(json.indicators)
  );
}

async function fetchUpstreamFromLatestUrls() {
  for (const url of UPSTREAM_LATEST_URLS) {
    try {
      const json = await fetchWithTimeout(cacheBust(url), { asJson: true });
      if (isValidUpstreamPayload(json)) {
        return { upstream: json, sourceUrl: url, sourceKind: 'latest' };
      }
      console.warn(`[bubble-watch] upstream ${url} 返回结构异常,跳过`);
    } catch (error) {
      console.warn(`[bubble-watch] upstream ${url} 不可达: ${error.message}`);
    }
  }
  return null;
}

async function fetchUpstreamFromSnapshots() {
  for (const indexUrl of UPSTREAM_SNAPSHOT_INDEX_URLS) {
    try {
      const rows = await fetchWithTimeout(cacheBust(indexUrl), {
        asJson: true,
        headers: { Accept: 'application/vnd.github+json' }
      });
      const snapshots = Array.isArray(rows)
        ? rows
          .filter((row) => row?.type === 'file' && /^\d{4}-\d{2}-\d{2}\.json$/u.test(row.name || '') && row.download_url)
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        : [];
      if (!snapshots.length) {
        console.warn(`[bubble-watch] upstream snapshots ${indexUrl} 未列出有效快照`);
        continue;
      }
      const latest = snapshots[snapshots.length - 1];
      const json = await fetchWithTimeout(cacheBust(latest.download_url), { asJson: true });
      if (isValidUpstreamPayload(json)) {
        return {
          upstream: json,
          sourceUrl: latest.download_url,
          sourceKind: 'snapshot',
          snapshotName: latest.name,
          snapshotIndexUrl: indexUrl
        };
      }
      console.warn(`[bubble-watch] upstream snapshot ${latest.download_url} 返回结构异常,跳过`);
    } catch (error) {
      console.warn(`[bubble-watch] upstream snapshots ${indexUrl} 不可达: ${error.message}`);
    }
  }
  return null;
}

async function fetchUpstreamReport() {
  return await fetchUpstreamFromLatestUrls() || await fetchUpstreamFromSnapshots();
}

async function syncCuratedFromUpstream(config) {
  const upstreamReport = await fetchUpstreamReport();
  if (!upstreamReport) {
    console.warn('[bubble-watch] upstream sync: 本轮未拿到上游周报,沿用现有口径,下个周期再查');
    return {
      checked: true,
      reachable: false,
      adopted: 0,
      summaryAvailable: false,
      summaryAdopted: false,
      summaryUsage: 'not_used_for_production_narrative'
    };
  }
  const { upstream, sourceUrl, sourceKind, snapshotName, snapshotIndexUrl } = upstreamReport;
  const byId = new Map(upstream.indicators.map((i) => [i.id, i]));
  let adopted = 0;
  for (const bucket of ['curated', 'autoFallback']) {
    for (const [id, entry] of Object.entries(config[bucket] || {})) {
      if (UPSTREAM_SYNC_LOCAL_AUTHORITY_BLOCKLIST.has(id)) continue;
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
  const result = {
    checked: true,
    reachable: true,
    upstreamAsOf: upstream.as_of_date,
    upstreamIssue: upstream.issue_number ?? null,
    adopted,
    sourceUrl,
    sourceKind,
    snapshotName: snapshotName || null,
    snapshotIndexUrl: snapshotIndexUrl || null,
    summaryAvailable: typeof upstream.summary?.verdict_desc === 'string' && upstream.summary.verdict_desc.length > 100,
    summaryAdopted: false,
    summaryUsage: 'not_used_for_production_narrative'
  };
  if (adopted) {
    config.upstreamSync = { sourceUrl, sourceKind, snapshotName: snapshotName || null, upstreamAsOf: upstream.as_of_date, adoptedCount: adopted, syncedAt: new Date().toISOString() };
    fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`[bubble-watch] upstream sync: 采纳上游 ${upstream.as_of_date}(Issue ${upstream.issue_number}, ${sourceKind})共 ${adopted} 项,已回写 config`);
  } else {
    console.log(`[bubble-watch] upstream sync: 上游 ${upstream.as_of_date}(${sourceKind}) 不比本地口径新,无采纳`);
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
    as_of: entry.asOfDate,
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
    as_of: entry.asOfDate,
    stale,
    provenance: { mode: 'auto_fallback', asOfDate: entry.asOfDate, ageDays, maxAgeDays: entry.maxAgeDays, reason }
  };
}

function baseIndicator(def) {
  if (!CORE_INDICATOR_ID_SET.has(def.id) && !SHADOW_INDICATOR_ID_SET.has(def.id)) {
    throw new Error(`指标 ${def.id} 未登记 Bubble Watch v2 score_role`);
  }
  return {
    id: def.id,
    score_role: CORE_INDICATOR_ID_SET.has(def.id) ? 'core' : 'shadow',
    axis: def.axis,
    category: def.category,
    name_en: def.name_en,
    name_zh: def.name_zh,
    threshold_text: def.threshold_text,
    source_name: def.source_name
  };
}

function hasStrongProxyConfirmation(id, result, entry) {
  const detail = result?.detail || {};
  switch (id) {
    case 'insider_sell_buy':
      // Form 4 ratio can explode when buy volume is near zero; keep the conservative cap.
      return detail.secondaryConfirmation === true || detail.secAggregateRatioConfirmed === true;
    case 'ai_ipo_pipeline':
      return Number(detail.confirmedIssueCount) >= 10
        || (Number(detail.evidenceCount) >= 8 && Array.isArray(detail.nameHits) && detail.nameHits.length >= 8);
    case 'capex_reaction':
      return (
        Number(detail.directGuidancePenaltyCount) >= 2
        && Number(detail.systemicWindowCount) >= 2
      ) || (
        Boolean(capexResearchConfirmationAnchor(entry))
        && Number(detail.systemicWindowCount) >= 2
      );
    case 'ceo_hedging':
      return Number(detail.executiveHitCount) >= 6 && Number(detail.uniqueExecutiveCount) >= 4;
    case 'token_revenue_ratio':
      return Number(detail.ratio) > 2 && Number(detail.pricedCoveragePct) >= 70;
    case 'enterprise_deploy':
      return Number(detail.productionDeployPct) < 50 && Number(detail.confirmingSurveyCount) >= 2;
    default:
      return false;
  }
}

function proxyConfidenceRuleText(id) {
  return {
    insider_sell_buy: '内部人卖买比使用 SEC Form 4 官方披露;买入近零导致的极端 ratio 最多按黄灯发布。',
    ai_ipo_pipeline: 'AI IPO 洪流需要接近模板口径的具体发行/待发公司数确认;单一 Crunchbase 新闻检索命中不足以升红。',
    capex_reaction: '系统性 capex 惩罚需要多窗口价格代理叠加直接 earnings-call/指引惩罚证据,或新鲜上游研究周报确认的系统性重定价证据;缺少研究/直接确认时短期相对收益噪音不得升红。',
    ceo_hedging: 'CEO 普遍承认过热需要更多唯一高管与多篇直接表态确认;单一新闻搜索频率不足以升红。',
    token_revenue_ratio: 'OpenRouter token×catalog spend 只是平台代理;覆盖率和 ratio 未显著越线时不得把近 1x 噪声自动升黄。',
    enterprise_deploy: 'Google AI-agent production survey 是窄口径代理;未有第二调查源确认低部署率时不得把单一窄口径样本自动降档。'
  }[id] || '自动代理源未达到本地二次确认门槛。';
}

function proxyConfidenceTarget(def, result, entry) {
  const detail = result?.detail || {};
  switch (def.id) {
    case 'insider_sell_buy':
      return result.status === 'red' && !hasStrongProxyConfirmation(def.id, result)
        ? { status: 'yellow', value_display: '高卖压·覆盖受限' }
        : null;
    case 'ai_ipo_pipeline':
      return result.status === 'red' && !hasStrongProxyConfirmation(def.id, result)
        ? { status: 'yellow', value_display: '升温' }
        : null;
    case 'capex_reaction':
      return result.status === 'red' && !hasStrongProxyConfirmation(def.id, result, entry)
        ? { status: 'yellow', value_display: '选择性惩罚' }
        : null;
    case 'ceo_hedging':
      return result.status === 'red' && !hasStrongProxyConfirmation(def.id, result)
        ? { status: 'yellow', value_display: '增加' }
        : null;
    case 'token_revenue_ratio': {
      const ratio = Number(detail.ratio);
      const coverage = Number(detail.pricedCoveragePct);
      if (result.status === 'red' && !hasStrongProxyConfirmation(def.id, result)) {
        return { status: 'yellow', value_display: result.value_display };
      }
      if (result.status === 'yellow' && !(ratio >= 1.2 && coverage >= 60)) {
        return { status: 'green', value_display: result.value_display };
      }
      return null;
    }
    case 'enterprise_deploy': {
      const productionDeployPct = Number(detail.productionDeployPct);
      const confirmingSurveyCount = Number(detail.confirmingSurveyCount || 0);
      if (result.status === 'red' && !hasStrongProxyConfirmation(def.id, result)) {
        return { status: 'yellow', value_display: result.value_display };
      }
      if (result.status === 'yellow' && !(productionDeployPct <= 65 && confirmingSurveyCount >= 2)) {
        return { status: 'green', value_display: result.value_display };
      }
      return null;
    }
    default:
      return null;
  }
}

function freshCalibrationAnchor(entry, publishedStatus) {
  if (!entry || entry.status !== publishedStatus || !entry.asOfDate || !entry.maxAgeDays) return null;
  const ageDays = daysBetween(entry.asOfDate, isoDate());
  if (ageDays > entry.maxAgeDays) return null;
  return {
    status: entry.status,
    value_display: entry.value_display || null,
    asOfDate: entry.asOfDate,
    ageDays,
    maxAgeDays: entry.maxAgeDays,
    syncedFromUpstream: entry.syncedFromUpstream === true
  };
}

function capexResearchConfirmationAnchor(entry) {
  if (!entry || entry.status !== 'red' || !entry.asOfDate || !entry.maxAgeDays) return null;
  const ageDays = daysBetween(entry.asOfDate, isoDate());
  if (ageDays > entry.maxAgeDays) return null;
  const evidenceText = `${entry.value_display || ''} ${entry.note || ''}`;
  const hasSystemicRepricingEvidence = /系统性惩罚|系统性重定价|市场反应|华尔街|要求拿出回报|B200|租赁价|半导体|纳指|selloff|repricing|return evidence|capex/iu.test(evidenceText);
  if (!hasSystemicRepricingEvidence) return null;
  return {
    source: entry.syncedFromUpstream ? 'upstream_research_weekly' : 'local_curated_research_snapshot',
    status: entry.status,
    value_display: entry.value_display || null,
    asOfDate: entry.asOfDate,
    ageDays,
    maxAgeDays: entry.maxAgeDays,
    syncedFromUpstream: entry.syncedFromUpstream === true,
    confirmationPolicy: 'capex_market_repricing_research_confirmation_v1'
  };
}

function attachCapexResearchConfirmation(def, result, entry) {
  if (def.id !== 'capex_reaction') return result;
  const anchor = capexResearchConfirmationAnchor(entry);
  if (!anchor) return result;
  return {
    ...result,
    source_name: result.source_name === 'StockAnalysis capex + Yahoo relative-return proxy'
      ? 'StockAnalysis/Yahoo proxy + upstream research calibration'
      : result.source_name,
    note: result.status === 'red'
      ? `${result.note} 上游研究周报(${anchor.asOfDate})同步给出「${anchor.value_display || '系统性惩罚'}」,并记录 AI 板块系统性回调、半导体市值蒸发、B200 租赁价格下跌和市场要求 capex 回报证据等重定价线索;因此本轮价格代理红灯可按系统性惩罚发布。`
      : result.note,
    detail: {
      ...(result.detail || {}),
      upstreamResearchConfirmation: anchor
    }
  };
}

function calibrateProxyConfidenceResult(def, result, entry) {
  result = attachCapexResearchConfirmation(def, result, entry);
  if (!PROXY_CONFIDENCE_CALIBRATION_IDS.has(def.id) || !STATUS_RANK.hasOwnProperty(result?.status)) {
    return result;
  }
  const target = proxyConfidenceTarget(def, result, entry);
  if (!target || !STATUS_RANK.hasOwnProperty(target.status) || STATUS_RANK[result.status] <= STATUS_RANK[target.status]) {
    return {
      ...result,
      detail: {
        ...(result.detail || {}),
        proxyConfidenceCalibration: {
          applied: false,
          reason: target ? 'not_more_severe_than_policy_target' : 'strong_confirmation_or_no_calibration_needed',
          policy: 'local_proxy_confidence_v1'
        }
      }
    };
  }
  const rule = proxyConfidenceRuleText(def.id);
  const rawStatus = result.status;
  const rawValueDisplay = result.value_display;
  const anchor = freshCalibrationAnchor(entry, target.status);
  const publishedValueDisplay = anchor?.value_display || target.value_display || result.value_display;
  const calibration = {
    applied: true,
    policy: 'local_proxy_confidence_v1',
    rule,
    rawStatus,
    rawValueDisplay,
    publishedStatus: target.status,
    publishedValueDisplay,
    displayAnchor: anchor
      ? {
        source: 'local_curated_snapshot',
        asOfDate: anchor.asOfDate,
        ageDays: anchor.ageDays,
        maxAgeDays: anchor.maxAgeDays,
        syncedFromUpstream: anchor.syncedFromUpstream
      }
      : null
  };
  return {
    ...result,
    status: target.status,
    value_display: publishedValueDisplay,
    note: `${result.note} 代理源置信度校准:${rule}本轮发布状态按本地多源/样本阈值校准为${STATUS_ZH[target.status]}灯;该规则不依赖上游模板是否可达。自动原始判级 ${STATUS_ZH[rawStatus]}灯、原始值「${rawValueDisplay}」保留在 provenance.detail。`,
    detail: {
      ...(result.detail || {}),
      proxyConfidenceCalibration: calibration,
      // Backward-compatible alias for older local inspection scripts.
      templateCompatibilityCalibration: calibration
    }
  };
}

const PUBLIC_SOURCE_LABELS = {
  cape: 'CAPE 历史估值序列',
  top5_weight: 'SPY 持仓集中度',
  nvda_fpe: 'NVDA 远期估值',
  private_secondary_marks: 'Forge / Caplight 私募二级标价',
  hyperscaler_capex_yoy: '公开季度现金流',
  mag4_fcf_yoy: '公开季度现金流',
  vc_ai_share: 'VC 市场季度研究',
  nvda_invest_revenue: '公开投资承诺与收入',
  breadth_50d: 'Barchart $S5FI 市场广度',
  spy_vs_rsp_6m: '市值加权与等权重 ETF',
  insider_sell_buy: '内部人交易披露',
  ai_ipo_pipeline: '一级市场公开报道',
  hy_oas: 'ICE BofA 高收益债利差',
  dc_abs_spread: '数据中心证券样本与 ABS 基准',
  debt_capex_ratio: '数据中心融资缺口研究',
  neocloud_credit: 'Neocloud 公开融资与信用事件',
  token_volume_mom: '公开模型平台用量',
  token_revenue_ratio: '公开模型平台用量与价格口径',
  gpu_rental_price: 'Thunder Compute / getdeploying',
  arr_2nd_deriv: '公开 ARR 里程碑',
  enterprise_deploy: '企业 AI 部署调查',
  cloud_rpo_growth: '云厂商订单与 backlog 披露',
  frontier_progress: 'METR / Epoch AI / ARC Prize',
  accounting_events: 'SEC / DOJ 执法公告',
  fed_policy: 'Fed 点阵图/期货/FRED',
  capex_reaction: '公开财报与相对收益窗口',
  ceo_hedging: '公开新闻与高管表态'
};

const PUBLIC_CALIBRATION_SUMMARIES = {
  insider_sell_buy: '备用样本存在记录上限且买入金额接近零，卖压方向偏高，但极端倍数不能与完整周期聚合直接比较，因此保守维持黄灯。',
  ai_ipo_pipeline: '发行热度正在升温，但已挂牌和明确待发公司数仍不足以构成 IPO 洪流，因此维持黄灯。',
  capex_reaction: '价格惩罚已比较明显，但尚缺直接管理层下调或财报指引惩罚共振，因此按选择性惩罚而非系统性惩罚发布。',
  ceo_hedging: '高管和市场领袖的谨慎措辞增加，但尚未形成集体承认过热或暂停投入的共振。',
  token_revenue_ratio: 'Token 用量与估算支出增速接近，尚未显示收入兑现显著落后于算力消耗。',
  enterprise_deploy: '单一 AI-agent 口径偏窄，但跨调查仍显示生产部署处于高位，暂不下调灯色。'
};

function publicCalibrationSummary(ind) {
  return PUBLIC_CALIBRATION_SUMMARIES[ind.id] || '';
}

function normalizePublicBubbleCopy(text) {
  return String(text || '')
    .replace(/\(实时抓取失败,沿用 \d{4}-\d{2}-\d{2} 快照\)/gu, '（沿用最近一期可用样本）')
    .replace(/实时抓取/gu, '最新可得数据')
    .replace(/实拉/gu, '显示')
    .replace(/StockAnalysis\/Fiscal\.ai metrics 镜像/gu, '公开订单披露')
    .replace(/stockanalysis 季报镜像/giu, '公开季报现金流')
    .replace(/StockAnalysis 季度现金流解析/gu, '公开季度现金流显示')
    .replace(/StockAnalysis\/Yahoo capex reaction proxy 失败\([^)]+\)后启用 Wind 付费新闻兜底:/gu, '公开财报与价格窗口不可用，本轮改用公开新闻观察:')
    .replace(/Wind 付费可选源识别数据中心 ABS\/类 REITs 样本/gu, '数据中心 ABS/类 REITs 样本')
    .replace(/Wind 付费新闻兜底/gu, '公开新闻观察')
    .replace(/Yahoo Chart 全市场实算/gu, '公开市场价格显示')
    .replace(/Yahoo Chart 实算/gu, '公开市场价格显示')
    .replace(/OpenRouter public rankings API 汇总供应商周度 token volume/gu, '公开模型平台用量显示')
    .replace(/OpenRouter 周度模型排名 \+ 公开 catalog pricing 估算平台内 spend proxy/gu, '公开模型平台用量与价格口径显示')
    .replace(/SaaStr 公开 Anthropic ARR\/run-rate 里程碑解析/gu, '公开 Anthropic ARR/run-rate 里程碑显示')
    .replace(/Google Cloud ROI of AI 公开报告解析/gu, '企业 AI 部署调查显示')
    .replace(/SEC RSS 与 DOJ News API 官方新闻稿/gu, 'SEC 与 DOJ 官方执法公告')
    .replace(/；SEC EDGAR 申报确认不可用\([^)]+\)/gu, '；公开申报确认样本暂缺')
    .replace(/SEC EDGAR [^。；;]*不可用\([^)]+\)/gu, '公开申报确认样本暂缺')
    .replace(/GDELT DOC 2\.0 [^:：]{0,80}公开新闻检索\([^)]*\):/gu, '公开新闻检索显示:')
    .replace(/Tavily 免费额度新闻搜索交叉确认:/gu, '第二组公开新闻检索显示:')
    .replace(/Brave News Search 交叉确认:/gu, '独立新闻索引显示:')
    .replace(/GDELT 免费新闻源失败\([^)]+\)后,启用 Tavily 免费额度新闻搜索兜底:/gu, '公开新闻检索显示:')
    .replace(/GDELT 免费新闻源失败\([^)]+\)后,启用 Brave News Search 免费额度兜底:/gu, '公开新闻检索显示:')
    .replace(/该项是 OpenRouter 平台公开代理,不是全行业 token tape。/gu, '该口径反映公开模型平台活动，不能等同全行业总量。')
    .replace(/该项不是厂商真实收入,仅作 OpenRouter 平台代理。/gu, '该口径用于观察平台内用量与价格变化，不能等同厂商确认收入。')
    .replace(/该项是公开估算里程碑 proxy,不是审计收入。/gu, '该口径来自公开估算里程碑，不能等同审计收入。')
    .replace(/该项是 enterprise production proxy,不等同所有企业 AI use case。/gu, '该口径反映企业调查中的生产部署比例，不等同所有企业 AI 使用场景。')
    .replace(/该项是 capex-heavy equity reaction proxy,不是逐字财报指引文本。/gu, '该口径观察高资本开支公司在财报期后的相对收益，不等同逐字财报指引文本。')
    .replace(/该项是 survey\/news proxy,不等同所有企业 AI use case。/gu, '该口径来自调查和公开报道，不等同所有企业 AI 使用场景。')
    .replace(/该项低于价格窗口实算优先级。/gu, '')
    .replace(/按新闻事件代理判为/gu, '按公开新闻事件判为')
    .replace(/该项仍按公开新闻语义保守判为/gu, '按公开新闻语义保守判为')
    .replace(/该项仅作为[^。]*。/gu, '')
    .replace(/单一路径命中不得直接升红。/gu, '')
    .replace(/,?因此本项明确为 paid proxy,不伪装为正式数据中心专属连续利差/gu, '，因此只判断融资条件方向，不当作正式数据中心专属连续利差')
    .replace(/paid proxy/giu, '方向性观察')
    .replace(/\bproxy\b/giu, '观察口径')
    .replace(/\bAPI\b/gu, '公开源')
    .replace(/\bfallback\b/giu, '补充口径')
    .replace(/\bcross-check\b/giu, '交叉验证')
    .replace(/代理源置信度校准:[^。]*provenance\.detail。/gu, '')
    .replace(/该规则不依赖上游模板是否可达。/gu, '')
    .replace(/自动原始判级[^。]*。/gu, '')
    .replace(/上游模板/gu, '历史对照口径')
    .replace(/provenance\.detail/gu, '审计明细')
    .replace(/模板口径/gu, '历史对照口径')
    .replace(/实时抓取失败/gu, '最新数据暂缺')
    .replace(/沿用 \d{4}-\d{2}-\d{2} 快照/gu, '沿用最近一期可用样本')
    .replace(/\s+/gu, ' ')
    .replace(/\s*([,，;；:：。])\s*/gu, '$1')
    .replace(/。{2,}/gu, '。')
    .trim();
}

function publicIndicatorNote(ind) {
  let note = normalizePublicBubbleCopy(ind.note);
  const calibration = ind.provenance?.detail?.proxyConfidenceCalibration;
  if (calibration?.applied) {
    note = note
      .replace(/代理源置信度校准:.*$/u, '')
      .replace(/[。；;，,\s]+$/u, '')
      .trim();
    const summary = publicCalibrationSummary(ind);
    if (summary && !note.includes(summary)) note = `${note} ${summary}`;
  }
  return note.replace(/\s+/gu, ' ').trim();
}

function publicIndicatorSourceName(ind) {
  return PUBLIC_SOURCE_LABELS[ind.id] || normalizePublicBubbleCopy(ind.source_name);
}

function applyPublicIndicatorCopy(indicators) {
  return indicators.map((ind) => ({
    ...ind,
    note: publicIndicatorNote(ind),
    source_name: publicIndicatorSourceName(ind)
  }));
}

// ---------- 打分 / 判读 ----------

function tierFromPct(p) {
  if (p >= 60) return 'top';
  if (p >= 40) return 'alert';
  if (p >= 25) return 'caution';
  return 'observation';
}

const HISTORICAL_PERIODS = [
  { period: '1999-06', label_zh: '互联网泡沫顶前 9 个月', label_en: '9 months before dot-com top' },
  { period: '2000-02', label_zh: '互联网泡沫顶前 1 个月', label_en: '1 month before dot-com top' },
  { period: '2007-10', label_zh: '金融危机股市顶', label_en: 'GFC equity top' },
  { period: '2021-11', label_zh: '成长股/SPAC 顶', label_en: 'Growth/SPAC top' }
];

// ponytail: Similarity uses only Core-23 rows with a reviewed historical analogue.
// spy_vs_rsp_6m remains core-scored but stays outside similarity until reviewed;
// Shadow-4 rows are naturally absent from the current-status map passed here.
const HISTORICAL_CALIBRATION_ROWS = {
  cape: ['red', 'red', 'yellow', 'red'],
  top5_weight: ['yellow', 'red', 'green', 'yellow'],
  nvda_fpe: ['red', 'red', 'green', 'red'],
  private_secondary_marks: ['green', 'green', 'yellow', 'green'],
  hyperscaler_capex_yoy: ['yellow', 'yellow', 'green', 'yellow'],
  mag4_fcf_yoy: ['yellow', 'red', 'green', 'green'],
  vc_ai_share: ['red', 'red', 'green', 'red'],
  nvda_invest_revenue: ['yellow', 'red', 'green', 'green'],
  breadth_50d: ['yellow', 'red', 'red', 'red'],
  insider_sell_buy: ['yellow', 'red', 'yellow', 'red'],
  ai_ipo_pipeline: ['red', 'red', 'yellow', 'red'],
  hy_oas: ['yellow', 'yellow', 'yellow', 'green'],
  dc_abs_spread: ['yellow', 'yellow', 'red', 'green'],
  neocloud_credit: ['green', 'yellow', 'red', 'green'],
  debt_capex_ratio: ['yellow', 'red', null, 'green'],
  token_volume_mom: ['green', 'green', null, 'green'],
  gpu_rental_price: ['green', 'yellow', null, 'green'],
  arr_2nd_deriv: ['green', 'yellow', null, 'green'],
  enterprise_deploy: ['green', 'yellow', null, 'green'],
  cloud_rpo_growth: ['green', 'green', null, 'green'],
  frontier_progress: ['green', 'green', null, 'green'],
  accounting_events: ['green', 'yellow', 'yellow', 'yellow'],
  fed_policy: ['red', 'red', 'green', 'red'],
  capex_reaction: ['green', 'yellow', null, 'green'],
  ceo_hedging: ['green', 'yellow', 'yellow', 'yellow']
};

function meanStatusScore(items) {
  return Number((items.reduce((sum, item) => sum + AXIS_SCORE[item.status], 0) / items.length).toFixed(1));
}

function axisLabel(axis, score) {
  if (axis === 'stage') {
    if (score < 30) return { zh: '早期 Displacement', en: 'Displacement' };
    if (score < 50) return { zh: '扩张 Boom', en: 'Boom' };
    if (score < 70) return { zh: '亢奋 Euphoria', en: 'Euphoria' };
    return { zh: '极端 Mania', en: 'Mania' };
  }
  if (score < 25) return { zh: '引线未燃', en: 'Fuse Unlit' };
  if (score < 45) return { zh: '零星火花', en: 'Sparks' };
  if (score < 65) return { zh: '引线点燃', en: 'Fuse Lit' };
  return { zh: '破裂进行中', en: 'Unwinding' };
}

function computeMomentum(indicators, prevEntry) {
  let deteriorated = 0;
  let improved = 0;
  for (const ind of indicators) {
    const previous = prevEntry?.statuses?.[ind.id];
    if (!previous || previous === ind.status) continue;
    const delta = STATUS_RANK[ind.status] - STATUS_RANK[previous];
    if (delta > 0) deteriorated += delta;
    else improved -= delta;
  }
  return { deteriorated, improved, net: deteriorated - improved };
}

function computeSimilarity(indicators) {
  const current = new Map(indicators.map((item) => [item.id, item.status]));
  return HISTORICAL_PERIODS.map((period, periodIndex) => {
    let matched = 0;
    let denominator = 0;
    for (const [id, row] of Object.entries(HISTORICAL_CALIBRATION_ROWS)) {
      const historical = row[periodIndex];
      const status = current.get(id);
      if (!historical || !status) continue;
      denominator += 1;
      const distance = Math.abs(STATUS_RANK[status] - STATUS_RANK[historical]);
      matched += distance === 0 ? 1 : distance === 1 ? 0.5 : 0;
    }
    return {
      ...period,
      match_pct: Math.round((matched / denominator) * 100),
      denominator,
      basis: 'core_calibrated_indicators_only'
    };
  }).sort((a, b) => b.match_pct - a.match_pct);
}

function replayCoreHistoryEntry(entry) {
  if (!entry?.statuses || !CORE_INDICATOR_IDS.every((id) => ['red', 'yellow', 'green'].includes(entry.statuses[id]))) return null;
  const items = INDICATOR_DEFS
    .filter((def) => CORE_INDICATOR_ID_SET.has(def.id))
    .map((def) => ({ ...def, status: entry.statuses[def.id] }));
  const red = items.filter((item) => item.status === 'red').length;
  const yellow = items.filter((item) => item.status === 'yellow').length;
  return {
    core_red_pct: Number(((red / items.length) * 100).toFixed(1)),
    core_risk_score: Number((((red + 0.5 * yellow) / items.length) * 100).toFixed(1)),
    core_stage_score: meanStatusScore(items.filter((item) => item.axis === 'stage')),
    core_trigger_score: meanStatusScore(items.filter((item) => item.axis === 'trigger'))
  };
}

function shortenText(text, maxChars) {
  const raw = String(text || '').trim();
  const chars = Array.from(raw);
  if (chars.length <= maxChars) return raw;
  const candidate = chars.slice(0, maxChars).join('');
  const sentenceCut = Math.max(candidate.lastIndexOf('。'), candidate.lastIndexOf('；'), candidate.lastIndexOf(';'));
  if (sentenceCut >= Math.floor(maxChars * 0.45)) return candidate.slice(0, sentenceCut + 1);
  const softCut = Math.max(candidate.lastIndexOf('，'), candidate.lastIndexOf(','), candidate.lastIndexOf('、'));
  if (softCut >= Math.floor(maxChars * 0.55)) return `${candidate.slice(0, softCut)}…`;
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join('')}…`;
}

function cleanIndicatorNote(note) {
  return String(note || '')
    .replace(/\(实时抓取失败,沿用 \d{4}-\d{2}-\d{2} 快照\)/gu, '')
    .replace(/\(沿用 \d{4}-\d{2}-\d{2} 口径\)/gu, '')
    .replace(/。?阈值[:：][\s\S]*$/u, '')
    .replace(/。?判级[:：][\s\S]*$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function indicatorClause(ind, maxChars = 150) {
  if (!ind) return '';
  const note = shortenText(cleanIndicatorNote(ind.note), maxChars).replace(/[。；;，,]+$/u, '');
  const head = `${ind.name_zh} ${ind.value_display}（${STATUS_ZH[ind.status]}）`;
  return note ? `${head}: ${note}` : head;
}

function compactIndicatorClause(ind, maxChars = 80) {
  if (!ind) return '';
  const note = shortenText(cleanIndicatorNote(ind.note), maxChars).replace(/[。；;，,]+$/u, '');
  return `${ind.name_zh} ${ind.value_display}（${STATUS_ZH[ind.status]}）${note ? `: ${note}` : ''}`;
}

function indicatorValueBrief(ind) {
  if (!ind) return '';
  return `${ind.name_zh} ${ind.value_display}（${STATUS_ZH[ind.status]}）`;
}

function joinClauses(clauses) {
  return clauses.filter(Boolean).join('；');
}

function statusMoveText(flip) {
  return `「${flip.name_zh}」${STATUS_ZH[flip.from]}转${STATUS_ZH[flip.to]}`;
}

function compareMetricText(label, current, previous, suffix = '') {
  if (!Number.isFinite(current)) return '';
  if (!Number.isFinite(previous)) return `${label}${current.toFixed(1)}${suffix}`;
  if (Math.abs(current - previous) < 0.05) return `${label}维持 ${current.toFixed(1)}${suffix}`;
  return `${label}由 ${previous.toFixed(1)}${suffix} ${current > previous ? '升至' : '降至'} ${current.toFixed(1)}${suffix}`;
}

function buildCategorySnapshots(indicators) {
  return CATEGORY_ORDER.map((cat) => {
    const items = indicators.filter((i) => i.category === cat.key);
    const red = items.filter((i) => i.status === 'red').length;
    const yellow = items.filter((i) => i.status === 'yellow').length;
    const green = items.filter((i) => i.status === 'green').length;
    return {
      ...cat,
      total: items.length,
      red,
      yellow,
      green,
      redItems: items.filter((i) => i.status === 'red').map((i) => i.id),
      yellowItems: items.filter((i) => i.status === 'yellow').map((i) => i.id),
      greenItems: items.filter((i) => i.status === 'green').map((i) => i.id)
    };
  });
}

function pickIndicators(byId, ids) {
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function buildEvidenceHighlights(byId, flips) {
  const orderedIds = [
    ...flips.map((f) => f.id),
    'breadth_50d',
    'spy_vs_rsp_6m',
    'ai_ipo_pipeline',
    'cloud_rpo_growth',
    'hyperscaler_capex_yoy',
    'mag4_fcf_yoy',
    'nvda_invest_revenue',
    'hy_oas',
    'dc_abs_spread',
    'neocloud_credit',
    'fed_policy',
    'capex_reaction',
    'ceo_hedging'
  ];
  const seen = new Set();
  return orderedIds
    .filter((id) => {
      if (seen.has(id) || !byId.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 12)
    .map((id) => {
      const ind = byId.get(id);
      return {
        indicator_id: id,
        category: ind.category,
        status: ind.status,
        value_display: ind.value_display,
        note_summary: shortenText(cleanIndicatorNote(ind.note), 220)
      };
    });
}

function buildBubbleNarrativePlan({
  indicators,
  displayIndicators,
  displayCounts,
  red,
  yellow,
  green,
  redPct,
  weighted,
  stageScore,
  stageLabel,
  triggerScore,
  triggerLabel,
  baseTier,
  effTier,
  overrideActive,
  resonant,
  twoAxisUpgrade,
  flips,
  prevEntry,
  meta
}) {
  const byId = new Map(indicators.map((i) => [i.id, i]));
  const categorySnapshots = buildCategorySnapshots(indicators);
  const scoreParts = [
    compareMetricText('红灯比例', redPct, prevEntry?.red_pct, '%')
  ].filter(Boolean);
  const flipText = flips.length
    ? `本期翻灯 ${flips.length} 项: ${flips.map(statusMoveText).join('、')}`
    : prevEntry?.statuses
      ? '状态层面无指标翻灯'
      : '本期为本地历史序列首个可比点';

  const sections = [];
  sections.push({
    key: 'scorecard',
    role: 'lead',
    sourceIndicators: [],
    summaryZh: `固定核心 23 项本周计数 ${red} 红 / ${yellow} 黄 / ${green} 绿，${scoreParts.join('，')}。27 张展示卡合计 ${displayCounts.red} 红 / ${displayCounts.yellow} 黄 / ${displayCounts.green} 绿，其中 4 项为影子观察、不进入判读。${flipText}；两轴判读为泡沫成熟度 ${stageScore.toFixed(1)}（${stageLabel.zh}）、破裂临近度 ${triggerScore.toFixed(1)}（${triggerLabel.zh}）；基础判读落在「${TIER_LABEL_ZH[baseTier]}」，有效判读为「${TIER_LABEL_ZH[effTier]}」。`
  });

  const breadth = byId.get('breadth_50d');
  const rspSpread = byId.get('spy_vs_rsp_6m');
  const insider = byId.get('insider_sell_buy');
  const marketStructure = [breadth, rspSpread, insider].filter(Boolean);
  sections.push({
    key: 'market_structure',
    role: 'breadth_and_risk_appetite',
    sourceIndicators: marketStructure.map((i) => i.id),
    summaryZh: (() => {
      const greenCount = marketStructure.filter((i) => i.status === 'green').length;
      const structureLead = greenCount >= 2
        ? '市场结构边际改善'
        : greenCount === 1
          ? '市场结构仍在分化'
          : '市场结构压力仍高';
      return `${structureLead}: ${indicatorValueBrief(breadth)}、${indicatorValueBrief(rspSpread)} 显示广度和权重差距尚未同时转弱；但 ${indicatorValueBrief(insider)}，风险偏好并非完全健康。`;
    })()
  });

  const mag4Fcf = byId.get('mag4_fcf_yoy');
  const vcAi = byId.get('vc_ai_share');
  const nvdaFinancing = byId.get('nvda_invest_revenue');
  const cloudRpo = byId.get('cloud_rpo_growth');
  const capitalAndFundamentals = [mag4Fcf, vcAi, nvdaFinancing, cloudRpo].filter(Boolean);
  sections.push({
    key: 'capital_fundamentals',
    role: 'demand_vs_cash_burn',
    sourceIndicators: capitalAndFundamentals.map((i) => i.id),
    summaryZh: `资金面仍是核心压力: ${indicatorValueBrief(mag4Fcf)}、${indicatorValueBrief(vcAi)}、${indicatorValueBrief(nvdaFinancing)}；同时，${indicatorValueBrief(cloudRpo)} 说明需求仍在兑现。结论不是需求崩塌，而是需求兑现与烧钱、集中融资并存。`
  });

  const hyOas = byId.get('hy_oas');
  const dcAbs = byId.get('dc_abs_spread');
  const neocloud = byId.get('neocloud_credit');
  const fedPolicy = byId.get('fed_policy');
  const capexReaction = byId.get('capex_reaction');
  const creditAndMacro = [hyOas, dcAbs, neocloud, fedPolicy, capexReaction].filter(Boolean);
  sections.push({
    key: 'credit_macro',
    role: 'financing_conditions_and_policy',
    sourceIndicators: creditAndMacro.map((i) => i.id),
    summaryZh: `信用端仍托底: ${indicatorValueBrief(hyOas)}、${indicatorValueBrief(dcAbs)}、${indicatorValueBrief(neocloud)}；宏观端则是 ${indicatorValueBrief(fedPolicy)}，叠加 ${indicatorValueBrief(capexReaction)}。这让本期更像高风险观察，而不是信用断裂式顶部。`
  });

  const resonantText = resonant.length
    ? resonant.map((c) => {
      const redItems = categorySnapshots.find((cat) => cat.key === c.key)?.redItems
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((i) => `${i.name_zh} ${i.value_display}`)
        .join('、');
      return `${c.zh} ${c.red}/${c.total} 红${redItems ? `（${redItems}）` : ''}`;
    }).join('；')
    : '无分类红灯占比过半';
  const redNames = indicators
    .filter((i) => i.status === 'red')
    .map((i) => `${i.name_zh} ${i.value_display}`)
    .join('、');
  const overrideReasons = [];
  if (resonant.length >= 2) overrideReasons.push(`双类压力共振（${resonantText}）`);
  if (twoAxisUpgrade) overrideReasons.push(`两轴共振（stage ${stageScore.toFixed(1)} / trigger ${triggerScore.toFixed(1)}）`);
  sections.push({
    key: 'override_conclusion',
    role: 'final_judgment',
    sourceIndicators: indicators.filter((i) => i.status === 'red').map((i) => i.id),
    summaryZh: overrideActive
      ? `因此，尽管红灯比例仍在「${TIER_LABEL_ZH[baseTier]}」区间，${overrideReasons.join('、')}抬高综合判读。红灯集中在 ${redNames}；有效判读维持「${TIER_LABEL_ZH[effTier]}」。`
      : `因此，本期未出现双类红灯共振: ${resonantText}。红灯为 ${redNames || '无'}；有效判读保持「${TIER_LABEL_ZH[effTier]}」。`
  });

  const staleCount = displayIndicators.filter((i) => i.stale).length;
  const proxyCalibrationCount = displayIndicators.filter((i) => i.provenance?.detail?.proxyConfidenceCalibration?.applied).length;
  const limitations = [
    `${meta.autoCount} 项公开数据口径、${meta.curatedCount + meta.fallbackCount} 项研究口径。`,
    proxyCalibrationCount ? `${proxyCalibrationCount} 项新闻或调查口径采用多源确认,灯色按样本强度保守发布。` : '本期无需要额外置信度折扣的新闻或调查口径。',
    `黄灯压力读数 ${weighted.toFixed(1)}% 仅按固定核心 23 项计算并用于趋势观察,不改变红灯比例阈值。`,
    'AI 私募二级市场标价、Token 增速/收入增速、GPU 租赁现货价、前沿模型能力进展为影子观察,不进入主分或升级规则。',
    staleCount ? `${staleCount} 项数据时效偏弱,相关叙事按低确定性处理。` : '当前无过期指标。',
    '历史页面仅用于周度结构对照；本期正文由当前指标重新生成。'
  ];

  return {
    version: NARRATIVE_ENGINE_VERSION,
    sourceMode: 'local_indicator_evidence_pack',
    upstreamVerdictPolicy: 'calibration_only_never_copied',
    categorySnapshots,
    evidenceHighlights: buildEvidenceHighlights(byId, flips),
    sections,
    limitations
  };
}

function buildVerdictDescFromNarrativePlan(plan, fallbackDesc) {
  const paragraphs = Array.isArray(plan?.sections)
    ? plan.sections.map((section) => section.summaryZh).filter((text) => typeof text === 'string' && text.length > 40)
    : [];
  return paragraphs.length >= 4 ? paragraphs.join('') : fallbackDesc;
}

function computeSummary(indicators, today, prevEntry, meta) {
  const total = indicators.length;
  const displayRed = indicators.filter((i) => i.status === 'red').length;
  const displayYellow = indicators.filter((i) => i.status === 'yellow').length;
  const displayGreen = total - displayRed - displayYellow;
  const displayRedPct = Number(((displayRed / total) * 100).toFixed(1));
  const displayWeighted = Number((((displayRed + 0.5 * displayYellow) / total) * 100).toFixed(1));
  const coreIndicators = indicators.filter((item) => item.score_role === 'core');
  const shadowIndicators = indicators.filter((item) => item.score_role === 'shadow');
  if (coreIndicators.length !== CORE_INDICATOR_IDS.length || shadowIndicators.length !== SHADOW_INDICATOR_IDS.length) {
    throw new Error(`Bubble Watch v2 score-role contract drift: core=${coreIndicators.length}, shadow=${shadowIndicators.length}`);
  }
  const scoringTotal = coreIndicators.length;
  const red = coreIndicators.filter((i) => i.status === 'red').length;
  const yellow = coreIndicators.filter((i) => i.status === 'yellow').length;
  const green = scoringTotal - red - yellow;
  const redPct = Number(((red / scoringTotal) * 100).toFixed(1));
  const weighted = Number((((red + 0.5 * yellow) / scoringTotal) * 100).toFixed(1));
  const stageScore = meanStatusScore(coreIndicators.filter((item) => item.axis === 'stage'));
  const triggerScore = meanStatusScore(coreIndicators.filter((item) => item.axis === 'trigger'));
  const stageLabel = axisLabel('stage', stageScore);
  const triggerLabel = axisLabel('trigger', triggerScore);
  const categoryScores = Object.fromEntries(CATEGORY_ORDER.map((cat) => [
    cat.key,
    meanStatusScore(coreIndicators.filter((item) => item.category === cat.key))
  ]));
  const momentum = computeMomentum(coreIndicators, prevEntry);
  const similarity = computeSimilarity(coreIndicators);

  const baseTier = tierFromPct(redPct);
  // 分类强制升级:红灯占比 ≥50% 的分类 ≥2 个 → 至少「高风险预警」
  const resonant = [];
  for (const cat of CATEGORY_ORDER) {
    const items = coreIndicators.filter((i) => i.category === cat.key);
    if (!items.length) continue;
    const r = items.filter((i) => i.status === 'red').length;
    if (r / items.length >= 0.5) resonant.push({ key: cat.key, zh: cat.zh, red: r, total: items.length });
  }
  const tierRank = { observation: 0, caution: 1, alert: 2, top: 3 };
  let effTier = baseTier;
  if (resonant.length >= 2 && tierRank[effTier] < tierRank.alert) effTier = 'alert';
  const twoAxisTarget = stageScore >= 60 && triggerScore >= 65
    ? 'top'
    : stageScore >= 60 && triggerScore >= 50
      ? 'alert'
      : null;
  const twoAxisUpgrade = twoAxisTarget && tierRank[twoAxisTarget] > tierRank[effTier] ? twoAxisTarget : null;
  if (twoAxisUpgrade) effTier = twoAxisUpgrade;
  const overrideActive = effTier !== baseTier;

  // WoW 翻灯
  const flips = [];
  if (prevEntry?.statuses) {
    for (const ind of coreIndicators) {
      const prev = prevEntry.statuses[ind.id];
      if (prev && prev !== ind.status) {
        flips.push({ id: ind.id, name_zh: ind.name_zh, from: prev, to: ind.status, up: STATUS_RANK[ind.status] > STATUS_RANK[prev], ind });
      }
    }
  }

  const redNames = coreIndicators.filter((i) => i.status === 'red').map((i) => `${i.name_zh}(${i.value_display})`);
  const staleCount = indicators.filter((i) => i.stale).length;
  const autoCount = meta.autoCount;
  const curatedCount = meta.curatedCount + meta.fallbackCount;

  const parts = [];
  parts.push(`固定核心 23 项本周计数 ${red} 红 / ${yellow} 黄 / ${green} 绿${prevEntry?.statuses ? (flips.length ? '' : ',与上期持平') : ''},红灯比例 ${redPct.toFixed(1)}%;27 张展示卡合计 ${displayRed} 红 / ${displayYellow} 黄 / ${displayGreen} 绿,其中 4 项为影子观察。`);
  if (flips.length) {
    parts.push(`本期翻灯 ${flips.length} 项:${flips.map((f) => `「${f.name_zh}」${STATUS_ZH[f.from]}→${STATUS_ZH[f.to]}`).join('、')}。`);
  } else if (prevEntry?.statuses) {
    parts.push('状态层面无指标翻灯。');
  }
  parts.push(`基础判读为${TIER_LABEL_ZH[baseTier]}(红灯比例 ${redPct < 25 ? '<25%' : redPct < 40 ? '25-40%' : redPct < 60 ? '40-60%' : '≥60%'})。`);
  if (overrideActive) {
    parts.push(`双类压力共振:${resonant.map((c) => `${c.zh} ${c.red}/${c.total} 红`).join('、')}——红灯占比过半的分类达 ${resonant.length} 个,综合判读上调至「${TIER_LABEL_ZH[effTier]}」。`);
  } else if (resonant.length === 1) {
    parts.push(`${resonant[0].zh}分类红灯过半(${resonant[0].red}/${resonant[0].total}),未达双分类共振、不触发强制升级。`);
  } else {
    parts.push('无分类红灯占比过半,未触发强制升级。');
  }
  if (redNames.length) parts.push(`当前红灯:${redNames.join('、')}。`);
  parts.push(`数据覆盖截至 ${today}:${autoCount} 项公开数据口径、${curatedCount} 项研究口径${staleCount ? `(其中 ${staleCount} 项时效偏弱)` : ''};事件类叙事以最近一期可确认材料为准。`);
  const templateVerdictDesc = parts.join('');
  const narrativePlan = buildBubbleNarrativePlan({
    indicators: coreIndicators,
    displayIndicators: indicators,
    displayCounts: { red: displayRed, yellow: displayYellow, green: displayGreen },
    red,
    yellow,
    green,
    redPct,
    weighted,
    stageScore,
    stageLabel,
    triggerScore,
    triggerLabel,
    baseTier,
    effTier,
    overrideActive,
    resonant,
    twoAxisUpgrade,
    flips,
    prevEntry,
    meta
  });

  return {
    summary: {
      total_indicators: total,
      red_count: displayRed,
      yellow_count: displayYellow,
      green_count: displayGreen,
      display_red_pct: displayRedPct,
      display_weighted_risk_score: displayWeighted,
      scoring_total_indicators: scoringTotal,
      scoring_red_count: red,
      scoring_yellow_count: yellow,
      scoring_green_count: green,
      primary_score_pct: redPct,
      primary_score_basis: 'core_red_light_ratio',
      red_pct: redPct,
      weighted_risk_score: weighted,
      stage_score: stageScore,
      stage_label: stageLabel.zh,
      stage_label_en: stageLabel.en,
      trigger_score: triggerScore,
      trigger_label: triggerLabel.zh,
      trigger_label_en: triggerLabel.en,
      momentum,
      category_scores: categoryScores,
      similarity,
      verdict_label: TIER_LABEL_ZH[effTier],
      verdict_label_en: TIER_LABEL_EN[effTier],
      verdict_desc: buildVerdictDescFromNarrativePlan(narrativePlan, templateVerdictDesc),
      verdict_desc_source: NARRATIVE_ENGINE_VERSION,
      narrative_plan: narrativePlan
    },
    scoring: {
      model_version: SCORING_MODEL_VERSION,
      primary_universe: 'core',
      core_indicator_ids: CORE_INDICATOR_IDS,
      shadow_indicator_ids: SHADOW_INDICATOR_IDS,
      shadow_policy: 'display_only_no_score_impact',
      shadow_promotion_policy: SHADOW_PROMOTION_POLICY,
      base_tier: baseTier,
      effective_tier: effTier,
      override_active: overrideActive,
      override_rule: '固定核心 23 项的双类红灯共振或 Stage × Trigger 共振可升级判读;主分仍为核心红灯比例',
      override_rules: {
        category_resonance: '红灯占比 ≥50% 的分类 ≥2 个 → 至少「高风险预警」',
        two_axis_alert: 'stage ≥60 且 trigger ≥50 → 至少「高风险预警」',
        two_axis_top: 'stage ≥60 且 trigger ≥65 → 「系统性顶部」'
      },
      two_axis_upgrade: twoAxisUpgrade,
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
  const sourceCandidates = JSON.parse(fs.readFileSync(SOURCE_CANDIDATES_PATH, 'utf8'));
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  const today = isoDate();
  const upstreamSync = await syncCuratedFromUpstream(config);
  const ctx = { config, sourceCandidates };

  const indicators = [];
  const fetchFailures = [];
  let autoCount = 0;
  let curatedCount = 0;
  let fallbackCount = 0;
  let hybridCount = 0;
  let paidWindFallbackCount = 0;

  for (const def of INDICATOR_DEFS) {
    if (def.mode === 'curated') {
      const entry = config.curated[def.id];
      if (!entry) throw new Error(`config curated 缺指标 ${def.id}`);
      const candidate = sourceCandidates.indicators?.[def.id];
      const hybridBuilder = hybridCuratedBuilders[def.id];
      if (['hybrid_live', 'hybrid_paid_optional'].includes(candidate?.automationStatus) && hybridBuilder) {
        try {
          const rawResult = await hybridBuilder(ctx, entry);
          const result = calibrateProxyConfidenceResult(def, rawResult, entry);
          indicators.push({
            ...baseIndicator(def),
            source_name: result.source_name || def.source_name,
            status: result.status,
            value_display: result.value_display,
            note: result.note,
            as_of: result.as_of || today,
            stale: false,
            provenance: {
              mode: 'auto',
              fetchedAt: new Date().toISOString(),
              detail: {
                ...(result.detail || {}),
                sourceCandidateStatus: candidate.automationStatus,
                sourceCandidatePrimarySignal: candidate.primarySignal || null,
                curatedFallbackAsOfDate: entry.asOfDate || null
              }
            }
          });
          autoCount += 1;
          hybridCount += 1;
          console.log(`[bubble-watch] ${def.id}: ${candidate.automationStatus} OK (${result.status} ${result.value_display})`);
          continue;
        } catch (error) {
          const windFallbackBuilder = windFinalFallbackBuilders[def.id];
          if (WIND_API_KEY && windFallbackBuilder) {
            try {
              const rawResult = await windFallbackBuilder(error, ctx);
              const result = calibrateProxyConfidenceResult(def, rawResult, entry);
              indicators.push({
                ...baseIndicator(def),
                source_name: result.source_name || def.source_name,
                    status: result.status,
                    value_display: result.value_display,
                    note: result.note,
                    as_of: result.as_of || today,
                    stale: false,
                provenance: {
                  mode: 'auto',
                  fetchedAt: new Date().toISOString(),
                  detail: {
                    ...(result.detail || {}),
                    sourceCandidateStatus: candidate.automationStatus,
                    sourceCandidatePrimarySignal: candidate.primarySignal || null,
                    paidWindFinalFallback: true,
                    primarySourceFailure: error.message,
                    curatedFallbackAsOfDate: entry.asOfDate || null
                  }
                }
              });
              autoCount += 1;
              hybridCount += 1;
              paidWindFallbackCount += 1;
              console.log(`[bubble-watch] ${def.id}: paid Wind final fallback OK (${result.status} ${result.value_display}) after ${candidate.automationStatus} failure`);
              continue;
            } catch (windError) {
              fetchFailures.push({ id: def.id, reason: `${candidate.automationStatus}_wind_fallback_failed: primary=${error.message}; wind=${windError.message}` });
              console.warn(`[bubble-watch] ${def.id}: paid Wind final fallback FAILED (${windError.message})`);
            }
          } else if (windFallbackBuilder) {
            fetchFailures.push({ id: def.id, reason: `${candidate.automationStatus}_source_failed_paid_wind_final_fallback_skipped: primary=${error.message}; wind=WIND_API_KEY 未配置或已禁用` });
          } else {
            fetchFailures.push({ id: def.id, reason: `${candidate.automationStatus}_source_failed: ${error.message}` });
          }
          const fallbackReason = windFallbackBuilder && !WIND_API_KEY
            ? `${candidate.automationStatus} source failed: ${error.message}; paid Wind final fallback skipped: WIND_API_KEY 未配置或已禁用`
            : `${candidate.automationStatus} source failed: ${error.message}`;
          indicators.push(buildFallbackIndicator(def, entry, today, fallbackReason));
          fallbackCount += 1;
          console.warn(`[bubble-watch] ${def.id}: ${candidate.automationStatus} FAILED → curated fallback (${error.message})`);
          continue;
        }
      }
      indicators.push(buildCuratedIndicator(def, entry, today));
      curatedCount += 1;
      console.log(`[bubble-watch] ${def.id}: curated (${entry.status})`);
      continue;
    }
    const fallback = config.autoFallback[def.id];
    if (!fallback) throw new Error(`config autoFallback 缺指标 ${def.id}`);
    try {
      const rawResult = await autoBuilders[def.id](ctx);
      const result = calibrateProxyConfidenceResult(def, rawResult, fallback);
      indicators.push({
        ...baseIndicator(def),
        status: result.status,
        value_display: result.value_display,
        note: result.note,
        as_of: result.as_of || today,
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
  const publicIndicators = applyPublicIndicatorCopy(indicators);
  const entries = [...history.entries];
  const prevRaw = [...entries].reverse().find((entry) => (
    isoWeekKey(entry.date) !== isoWeekKey(today) && replayCoreHistoryEntry(entry)
  )) || null;
  const prevReplay = replayCoreHistoryEntry(prevRaw);
  const prevForWow = prevRaw ? { ...prevRaw, red_pct: prevReplay.core_red_pct, risk_score: prevReplay.core_risk_score } : null;
  const meta = { autoCount, curatedCount, fallbackCount, hybridCount };
  const { summary, scoring, flips } = computeSummary(publicIndicators, today, prevForWow, meta);
  let marketTechnicalHeat = null;
  try {
    marketTechnicalHeat = await buildMarketTechnicalHeatPanel();
  } catch (error) {
    console.warn(`[bubble-watch] market technical heat panel failed: ${error.message}`);
    marketTechnicalHeat = buildUnavailableMarketTechnicalHeatPanel(error);
  }

  const lastIssue = entries.reduce((a, e) => Math.max(a, e.issue_number || 0), 0);
  const sameWeekIdx = entries.findIndex((e) => isoWeekKey(e.date) === isoWeekKey(today));
  const issueNumber = sameWeekIdx >= 0 ? entries[sameWeekIdx].issue_number || lastIssue : lastIssue + 1;
  const newEntry = {
    date: today,
    week: today.slice(5),
    issue_number: issueNumber,
    red_pct: summary.red_pct,
    risk_score: summary.weighted_risk_score,
    scoring_model_version: SCORING_MODEL_VERSION,
    core_red_pct: summary.red_pct,
    core_risk_score: summary.weighted_risk_score,
    display_red_pct: summary.display_red_pct,
    display_risk_score: summary.display_weighted_risk_score,
    stage_score: summary.stage_score,
    trigger_score: summary.trigger_score,
    statuses: Object.fromEntries(publicIndicators.map((i) => [i.id, i.status]))
  };
  if (sameWeekIdx >= 0) entries[sameWeekIdx] = newEntry;
  else entries.push(newEntry);
  while (entries.length > 16) entries.shift();
  const normalizedEntries = entries.map((entry) => {
    const replay = replayCoreHistoryEntry(entry);
    return replay ? { ...entry, scoring_model_version: SCORING_MODEL_VERSION, ...replay } : entry;
  });
  const comparableHistory = normalizedEntries.filter((entry) => (
    entry.scoring_model_version === SCORING_MODEL_VERSION
    && Number.isFinite(entry.core_red_pct)
    && Number.isFinite(entry.core_risk_score)
  ));

  const proxyConfidenceCalibrations = publicIndicators
    .map((ind) => {
      const calibration = ind.provenance?.detail?.proxyConfidenceCalibration;
      return calibration?.applied
        ? {
          id: ind.id,
          rawStatus: calibration.rawStatus,
          publishedStatus: calibration.publishedStatus,
          policy: calibration.policy || null,
          displayAnchor: calibration.displayAnchor || null
        }
        : null;
    })
    .filter(Boolean);

  const output = {
    contractVersion: BUBBLE_WATCH_CONTRACT_VERSION,
    issue_number: issueNumber,
    as_of_date: today,
    generated_at: new Date().toISOString(),
    summary,
    scoring,
    indicators: publicIndicators.map(({ ...ind }) => ind),
    market_technical_heat: marketTechnicalHeat,
    history_seed: comparableHistory.slice(-10).map((entry) => ({
      week: entry.week,
      red_pct: entry.core_red_pct,
      risk_score: entry.core_risk_score,
      model_version: SCORING_MODEL_VERSION
    })),
    wow_changes: buildWowChanges(flips, publicIndicators),
    meta: {
      builder: 'scripts/build-bubble-watch.mjs',
      boundary: 'display-only:独立专题页数据,不进 GFRR 打分/决策/执行/仓位',
      auto_count: autoCount,
      curated_count: curatedCount,
      fallback_count: fallbackCount,
      hybrid_count: hybridCount,
      paid_wind_fallback_count: paidWindFallbackCount,
      proxy_confidence_calibration_count: proxyConfidenceCalibrations.length,
      proxy_confidence_calibrations: proxyConfidenceCalibrations,
      // Deprecated compatibility fields for older local readers.
      template_compatibility_calibration_count: proxyConfidenceCalibrations.length,
      template_compatibility_calibrations: proxyConfidenceCalibrations,
      source_candidates: {
        contractVersion: sourceCandidates.contractVersion || null,
        hybrid_live_ids: Object.entries(sourceCandidates.indicators || {})
          .filter(([, candidate]) => candidate?.automationStatus === 'hybrid_live')
          .map(([id]) => id),
        hybrid_paid_optional_ids: Object.entries(sourceCandidates.indicators || {})
          .filter(([, candidate]) => candidate?.automationStatus === 'hybrid_paid_optional')
          .map(([id]) => id),
        candidate_only_ids: Object.entries(sourceCandidates.indicators || {})
          .filter(([, candidate]) => candidate?.automationStatus === 'candidate_only')
          .map(([id]) => id)
      },
      fetch_failures: fetchFailures,
      fred_key_present: Boolean(FRED_API_KEY),
      wind_key_present: Boolean(WIND_API_KEY),
      upstream_sync: upstreamSync
    }
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify({
    ...history,
    contractVersion: BUBBLE_WATCH_HISTORY_CONTRACT_VERSION,
    note: 'AI 泡沫监测周度历史。2026-07-15 起采用 Bubble Watch v2 Core-23 + Shadow-4;旧 red_pct/risk_score 保留原发布口径,core_* 字段为固定 Core-23 可比回放。history_seed 只使用可完整回放 Core-23 的周次。本文件由 scripts/build-bubble-watch.mjs 维护,请勿手改。',
    entries: normalizedEntries
  }, null, 2)}\n`);
  console.log(`[bubble-watch] OK — issue ${issueNumber}, core ${summary.scoring_red_count}红/${summary.scoring_yellow_count}黄/${summary.scoring_green_count}绿, display ${summary.red_count}红/${summary.yellow_count}黄/${summary.green_count}绿, primary ${summary.red_pct}%, stage ${summary.stage_score}, trigger ${summary.trigger_score}, verdict ${summary.verdict_label}${scoring.override_active ? '(综合升级)' : ''}, auto/hybrid ${autoCount}, curated ${curatedCount}, fallback ${fallbackCount}`);
}

main().catch((error) => {
  console.error(`[bubble-watch] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
