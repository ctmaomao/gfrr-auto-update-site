import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeAgeMinutes, classifyFreshnessLevel, canUseRealtimePayloadValues } from './modules/freshness.js';
import { formatOnRrpYiUsd } from './modules/format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === __filename;
const rulesPath = path.join(root, 'config', 'rules.json');
const RULES = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const R = RULES;
const dataDir = path.join(root, 'data');
const dataPath = path.join(dataDir, 'radar-data.json');
const histPath = path.join(dataDir, 'radar-history.json');
const histFullPath = path.join(dataDir, 'radar-history-full.json');
const rtPath = path.join(root, 'realtime', 'market.json');

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const clampRange = (n, min, max) => Math.max(min, Math.min(max, n));
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const isoNow = new Date().toISOString();

const MODULE_LABELS_CN = {
  geopolitical: '地缘政治',
  energy: '能源',
  inflation: '通胀',
  liquidity: '流动性',
  debt: '债务',
  banking: '银行'
};

const SOURCE_MODE_CN = {
  'live': '实时',
  'live-with-fallback': '实时带回退',
  'cache-only': '缓存模式',
  'mock': '模拟'
};

const FRED_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const MACRO_FETCH_TIMEOUT_MS = 10000;
const MACRO_FETCH_RETRIES = 2;
const MACRO_FETCH_RETRY_DELAY_MS = 800;
const MACRO_USER_AGENT = 'gfr-v27.0-macro/1.0';
const ISM_PMI_LANDING_URL = 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/';
const ISM_PMI_USER_AGENT = 'GFRRBot/1.0';
const ISM_PMI_FETCH_TIMEOUT_MS = 8000;
const ISM_PMI_RETRY_DELAY_MS = 1000;
const ISM_REPORT_PATH_PATTERN = /href=["'](?<href>\/supply-management-news-and-reports\/reports\/ism-pmi-reports\/pmi\/(?<month>january|february|march|april|may|june|july|august|september|october|november|december)\/)["']/giu;

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const DAILY_REALTIME_AUDIT_SOURCE = 'origin/realtime-data:realtime/market.json';

function extractDailyRealtimeAuditTimestamp(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : null;
  const candidates = [payload.updatedAt, meta?.updatedAt, payload.generatedAt, payload.timestamp];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function formatDailyAuditScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return String(value);
}

function runDailyRealtimeInputAudit(realtimePayload) {
  const hasRealtime = !!(realtimePayload && typeof realtimePayload === 'object');
  const updatedAtRaw = extractDailyRealtimeAuditTimestamp(realtimePayload);
  const ageMinutes = updatedAtRaw ? computeAgeMinutes(updatedAtRaw) : null;
  const freshness = classifyFreshnessLevel(ageMinutes, hasRealtime);
  const sourceMode = hasRealtime ? (realtimePayload.sourceMode ?? null) : null;
  const healthScore = hasRealtime && Number.isFinite(realtimePayload.healthScore)
    ? realtimePayload.healthScore
    : null;
  const brent = hasRealtime && realtimePayload.values && typeof realtimePayload.values === 'object'
    && Number.isFinite(Number(realtimePayload.values.brent))
    ? Number(realtimePayload.values.brent)
    : null;
  const consensus = hasRealtime && realtimePayload.brentValidation && typeof realtimePayload.brentValidation === 'object'
    ? realtimePayload.brentValidation.consensus
    : null;
  const brentConsensusRecommendedValue = consensus && Object.prototype.hasOwnProperty.call(consensus, 'recommendedValue')
    ? consensus.recommendedValue
    : null;
  const brentCanPromoteToPrimary = consensus && Object.prototype.hasOwnProperty.call(consensus, 'canPromoteToPrimary')
    ? consensus.canPromoteToPrimary
    : null;
  const brentConsensusConfidence = consensus?.confidence ?? null;

  const isWarning = freshness === 'stale' || freshness === 'unavailable';
  const result = isWarning ? 'WARNING' : 'OK';
  let suggestedAction = 'Check realtime-data branch availability, realtime/market.json structure, workflow permissions, or upstream failures.';
  if (freshness === 'fresh') suggestedAction = 'No action needed.';
  else if (freshness === 'aging') suggestedAction = 'Monitor. Daily is using an aging realtime snapshot.';
  else if (freshness === 'stale') {
    suggestedAction = 'Check Build Realtime Market schedule, realtime-data branch updatedAt, and upstream market source freshness.';
  }

  const lines = [
    `[Daily Realtime Audit] source: ${DAILY_REALTIME_AUDIT_SOURCE}`,
    `[Daily Realtime Audit] updatedAt: ${updatedAtRaw ?? 'null'}`,
    `[Daily Realtime Audit] ageMinutes: ${ageMinutes === null ? 'null' : String(ageMinutes)}`,
    `[Daily Realtime Audit] freshness: ${freshness}`,
    `[Daily Realtime Audit] sourceMode: ${formatDailyAuditScalar(sourceMode)}`,
    `[Daily Realtime Audit] healthScore: ${formatDailyAuditScalar(healthScore)}`,
    `[Daily Realtime Audit] brent: ${formatDailyAuditScalar(brent)}`,
    `[Daily Realtime Audit] brentConsensusRecommendedValue: ${formatDailyAuditScalar(brentConsensusRecommendedValue)}`,
    `[Daily Realtime Audit] brentCanPromoteToPrimary: ${formatDailyAuditScalar(brentCanPromoteToPrimary)}`,
    `[Daily Realtime Audit] brentConsensusConfidence: ${formatDailyAuditScalar(brentConsensusConfidence)}`,
    `[Daily Realtime Audit] result: ${result}`,
    `[Daily Realtime Audit] suggestedAction: ${suggestedAction}`
  ];

  const logLine = isWarning ? console.warn : console.log;
  for (const line of lines) logLine(line);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath && typeof summaryPath === 'string') {
    try {
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      };
      const md = [
        '',
        '### Daily Realtime Input Audit',
        '',
        '| Item | Value |',
        '|---|---|',
        `| source | ${esc(DAILY_REALTIME_AUDIT_SOURCE)} |`,
        `| updatedAt | ${esc(updatedAtRaw)} |`,
        `| ageMinutes | ${esc(ageMinutes === null ? 'null' : ageMinutes)} |`,
        `| freshness | ${esc(freshness)} |`,
        `| sourceMode | ${esc(sourceMode)} |`,
        `| healthScore | ${esc(healthScore)} |`,
        `| Brent | ${esc(brent)} |`,
        `| Brent consensus | ${esc(brentConsensusRecommendedValue)} |`,
        `| confidence | ${esc(brentConsensusConfidence)} |`,
        `| canPromoteToPrimary | ${esc(brentCanPromoteToPrimary)} |`,
        `| result | ${esc(result)} |`,
        ''
      ].join('\n');
      fs.appendFileSync(summaryPath, md, 'utf8');
    } catch (err) {
      console.warn('[Daily Realtime Audit] Failed to write GitHub Step Summary:', err instanceof Error ? err.message : err);
    }
  }
}

const prevData = readJson(dataPath, {});
const prevHistory = readJson(histPath, []);
const prevHistoryFull = readJson(histFullPath, []);
const realtime = readJson(rtPath, null);
if (IS_MAIN) runDailyRealtimeInputAudit(realtime);

function buildDailyRealtimeInput(realtimePayload) {
  return {
    branch: 'realtime-data',
    commitSha: process.env.GFRR_REALTIME_COMMIT_SHA || null,
    updatedAt: realtimePayload?.updatedAt || realtimePayload?.asOf || null,
    sourceMode: realtimePayload?.sourceMode || null,
    healthScore: Number.isFinite(realtimePayload?.healthScore) ? realtimePayload.healthScore : null,
    capturedAt: isoNow
  };
}

function briefEvidence(source, key, labelZh, value, summaryZh) {
  return { source, key, labelZh, value, summaryZh };
}

function divergenceStatusFromScore(score) {
  if (!Number.isFinite(score)) return 'insufficient_data';
  if (score >= 71) return 'high_stress';
  if (score >= 51) return 'stress';
  if (score >= 31) return 'watch';
  return 'normal';
}

function divergenceCheckStatusFromScore(score) {
  const status = divergenceStatusFromScore(score);
  return status === 'high_stress' ? 'stress' : status;
}

function divergenceStateZh(state) {
  return {
    normal: '未见明显背离',
    watch: '背离观察',
    stress: '背离压力',
    high_stress: '高背离压力',
    insufficient_data: '数据不足'
  }[state] || '状态待确认';
}

function buildDivergenceCheck({ key, labelZh, category, score, summaryZh, evidence, dataUsed, limitations }) {
  const normalizedScore = Number.isFinite(score) ? clamp(score) : 0;
  const status = Number.isFinite(score) ? divergenceCheckStatusFromScore(normalizedScore) : 'insufficient_data';
  return {
    key,
    labelZh,
    category,
    status,
    score: normalizedScore,
    summaryZh,
    evidence: Array.isArray(evidence) ? evidence : [],
    dataUsed: Array.isArray(dataUsed) ? dataUsed : [],
    limitations: Array.isArray(limitations) ? limitations : []
  };
}

function buildEnergyPricingGapCheck(risk, realtimePayload, displayInputsBaseline) {
  const brent = Number(displayInputsBaseline.brent);
  const validation = realtimePayload?.brentValidation || {};
  const promotion = validation.promotion || {};
  const sourceDetails = realtimePayload?.sourceDetails?.brent || {};
  const hasValidationContext = !!(promotion.reason || promotion.moveStatus || sourceDetails.source || validation.consensus);
  if (!Number.isFinite(brent)) {
    return buildDivergenceCheck({
      key: 'energy_pricing_gap_watch',
      labelZh: '能源定价背离观察',
      category: 'energy_pricing',
      score: null,
      summaryZh: '数据不足，暂不足以判断能源定价背离。',
      evidence: [],
      dataUsed: ['displayInputsBaseline.brent', 'brentValidation'],
      limitations: ['Brent 主值不可用。', 'Platts Dated Brent / 真实 Dated Brent 数据未接入。']
    });
  }
  const score = brent >= 110 ? 72 : brent >= 95 ? 52 : brent >= 85 ? 34 : 18;
  return buildDivergenceCheck({
    key: 'energy_pricing_gap_watch',
    labelZh: '能源定价背离观察',
    category: 'energy_pricing',
    score: hasValidationContext ? score : Math.max(20, score - 10),
    summaryZh: hasValidationContext
      ? '当前只是公开 Brent 价格验证层观察，不等同于 Platts Dated Brent，不能证明真实实物现货溢价；它只提示能源价格来源之间是否存在验证压力或确认压力。'
      : '当前只有 Brent 主值可用，验证层信息不足，暂按低置信观察处理。',
    evidence: [
      briefEvidence('displayInputsBaseline', 'brent', '布伦特', brent, `布伦特主显示值为 ${brent.toFixed(1)}。`),
      briefEvidence('brentValidation', 'promotion.moveStatus', 'Brent promotion 状态', promotion.moveStatus || null, `moveStatus=${promotion.moveStatus || '暂不足以判断'}。`),
      briefEvidence('sourceDetails', 'brent.source', 'Brent 来源说明', sourceDetails.source || null, sourceDetails.source ? `来源：${sourceDetails.source}。` : 'Brent sourceDetails 不足。')
    ],
    dataUsed: ['displayInputsBaseline.brent', 'brentValidation.promotion', 'sourceDetails.brent'],
    limitations: ['不等同于 Platts Dated Brent。', '不能证明真实实物现货溢价。', '不改变 values.brent 或 Brent promotion。']
  });
}

function buildRatesAssetsCheck(risk, displayInputsBaseline) {
  const us10y = Number(displayInputsBaseline.us10y);
  const real10y = Number(displayInputsBaseline.real10y);
  const spx = Number(displayInputsBaseline.spx);
  const vix = Number(displayInputsBaseline.vix);
  if (![us10y, real10y, spx, vix].some(Number.isFinite)) {
    return buildDivergenceCheck({
      key: 'rates_vs_risk_assets',
      labelZh: '长端利率与风险资产背离',
      category: 'rates_assets',
      score: null,
      summaryZh: '数据不足，暂不足以判断长端利率与风险资产背离。',
      evidence: [],
      dataUsed: ['displayInputsBaseline.us10y', 'displayInputsBaseline.real10y', 'displayInputsBaseline.spx', 'displayInputsBaseline.vix'],
      limitations: ['利率或风险资产输入不足。']
    });
  }
  const rateStress = (Number.isFinite(us10y) && us10y >= 4.8) || (Number.isFinite(real10y) && real10y >= 2.3);
  const rateWatch = rateStress || (Number.isFinite(us10y) && us10y >= 4.5) || (Number.isFinite(real10y) && real10y >= 2.0);
  const assetOptimism = Number.isFinite(spx) && spx >= 5000 && Number.isFinite(vix) && vix <= 18;
  const score = rateStress && assetOptimism ? 72 : rateWatch && assetOptimism ? 58 : rateWatch ? 44 : assetOptimism ? 34 : 18;
  return buildDivergenceCheck({
    key: 'rates_vs_risk_assets',
    labelZh: '长端利率与风险资产背离',
    category: 'rates_assets',
    score,
    summaryZh: rateWatch && assetOptimism
      ? '长端利率压力与风险资产定价之间存在观察性背离，但这不是崩盘预测。'
      : '暂未形成明确的长端利率与风险资产背离。',
    evidence: [
      briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', us10y, Number.isFinite(us10y) ? `美国10年期收益率 ${us10y.toFixed(2)}%。` : '美国10年期收益率数据不足。'),
      briefEvidence('displayInputsBaseline', 'real10y', '美国10年期实际利率', real10y, Number.isFinite(real10y) ? `美国10年期实际利率 ${real10y.toFixed(2)}%。` : '实际利率数据不足。'),
      briefEvidence('displayInputsBaseline', 'spx', '标普500', spx, Number.isFinite(spx) ? `标普500 ${spx.toFixed(0)}。` : '标普500数据不足。'),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', vix, Number.isFinite(vix) ? `VIX ${vix.toFixed(2)}。` : 'VIX 数据不足。')
    ],
    dataUsed: ['displayInputsBaseline.us10y', 'displayInputsBaseline.real10y', 'displayInputsBaseline.spx', 'displayInputsBaseline.vix'],
    limitations: ['只用于解释层观察。', '不改变 executionLock 或 positionGuidance。']
  });
}

function buildLiquidityCreditCheck(risk, displayInputsBaseline) {
  const dxy = Number(displayInputsBaseline.dxy);
  const us10y = Number(displayInputsBaseline.us10y);
  const hyOas = Number(displayInputsBaseline.hyOas);
  const vix = Number(displayInputsBaseline.vix);
  if (![dxy, us10y, hyOas, vix].some(Number.isFinite)) {
    return buildDivergenceCheck({
      key: 'liquidity_vs_credit_transmission',
      labelZh: '流动性与信用传导背离',
      category: 'liquidity_credit',
      score: null,
      summaryZh: '数据不足，暂不足以判断流动性与信用传导背离。',
      evidence: [],
      dataUsed: ['displayInputsBaseline.dxy', 'displayInputsBaseline.us10y', 'displayInputsBaseline.hyOas', 'displayInputsBaseline.vix'],
      limitations: ['流动性或信用输入不足。']
    });
  }
  const liquidityPressure = (Number.isFinite(dxy) && dxy >= 105) || (Number.isFinite(us10y) && us10y >= 4.5);
  const creditStress = (Number.isFinite(hyOas) && hyOas >= 4.5) || (Number.isFinite(vix) && vix >= 25);
  const score = liquidityPressure && creditStress ? 72 : liquidityPressure ? 54 : creditStress ? 50 : 22;
  return buildDivergenceCheck({
    key: 'liquidity_vs_credit_transmission',
    labelZh: '流动性与信用传导背离',
    category: 'liquidity_credit',
    score,
    summaryZh: liquidityPressure && !creditStress
      ? '美元或长端利率压力偏高，但信用利差和波动率尚未明显扩张，说明压力尚未明显扩散到信用/波动率。'
      : liquidityPressure && creditStress
        ? '流动性、信用和波动率压力正在被交叉验证。'
        : '暂未形成明确的流动性与信用传导背离。',
    evidence: [
      briefEvidence('displayInputsBaseline', 'dxy', '广义美元指数', dxy, Number.isFinite(dxy) ? `广义美元指数 ${dxy.toFixed(2)}。` : '广义美元指数数据不足。'),
      briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', us10y, Number.isFinite(us10y) ? `美国10年期收益率 ${us10y.toFixed(2)}%。` : '美国10年期收益率数据不足。'),
      briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', hyOas, Number.isFinite(hyOas) ? `高收益债信用利差 ${hyOas.toFixed(2)}%。` : '高收益债信用利差数据不足。'),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', vix, Number.isFinite(vix) ? `VIX ${vix.toFixed(2)}。` : 'VIX 数据不足。')
    ],
    dataUsed: ['displayInputsBaseline.dxy', 'displayInputsBaseline.us10y', 'displayInputsBaseline.hyOas', 'displayInputsBaseline.vix'],
    limitations: ['只说明压力是否扩散，不生成交易建议。']
  });
}

function buildRiskComplacencyCheck(risk, displayInputsBaseline) {
  const vix = Number(displayInputsBaseline.vix);
  const hyOas = Number(displayInputsBaseline.hyOas);
  const elevatedModules = Object.values(risk.modules || {}).filter((value) => value >= 70).length;
  if (!Number.isFinite(risk.score) || !Number.isFinite(vix) || !Number.isFinite(hyOas)) {
    return buildDivergenceCheck({
      key: 'risk_complacency_watch',
      labelZh: '风险定价低波动观察',
      category: 'risk_complacency',
      score: null,
      summaryZh: '数据不足，暂不足以判断风险定价是否偏平静。',
      evidence: [],
      dataUsed: ['score', 'modules', 'displayInputsBaseline.vix', 'displayInputsBaseline.hyOas'],
      limitations: ['综合风险或市场定价输入不足。']
    });
  }
  const highRiskBackdrop = risk.score >= 60 || elevatedModules >= 2;
  const calmPricing = vix < 20 && hyOas < 4;
  const score = highRiskBackdrop && calmPricing ? 62 : highRiskBackdrop ? 44 : calmPricing ? 30 : 18;
  return buildDivergenceCheck({
    key: 'risk_complacency_watch',
    labelZh: '风险定价低波动观察',
    category: 'risk_complacency',
    score,
    summaryZh: highRiskBackdrop && calmPricing
      ? '综合风险或多个模块偏高，但波动率和信用利差仍相对平静，存在观察性错配。'
      : '暂不足以判断市场风险定价存在明显错配。',
    evidence: [
      briefEvidence('score', 'score', '综合风险分数', risk.score, `综合风险分数 ${risk.score}。`),
      briefEvidence('modules', 'modules', '底层模块', elevatedModules, `根据现有 modules 字段，高于 70 的底层模块数量为 ${elevatedModules}。`),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', vix, `VIX ${vix.toFixed(2)}。`),
      briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', hyOas, `高收益债信用利差 ${hyOas.toFixed(2)}%。`)
    ],
    dataUsed: ['score', 'modules', 'displayInputsBaseline.vix', 'displayInputsBaseline.hyOas'],
    limitations: ['不表示市场一定错误。', '只作为 audit-only / display-only 观察。']
  });
}

function buildConsumerAssetsCheck(risk, displayInputsBaseline, macroDrivers) {
  const consumer = macroDrivers?.consumer || {};
  const sourceStatus = consumer?.sourceStatus?.umichSentiment || 'missing';
  const sentiment = Number(consumer.umichSentiment);
  const threeMonthChange = Number(consumer.threeMonthChange);
  const spx = Number(displayInputsBaseline.spx);
  const vix = Number(displayInputsBaseline.vix);
  const hyOas = Number(displayInputsBaseline.hyOas);
  if (sourceStatus === 'missing' || !Number.isFinite(sentiment) || !Number.isFinite(threeMonthChange)) {
    return buildDivergenceCheck({
      key: 'consumer_vs_asset_pricing',
      labelZh: '消费者体感与风险资产背离',
      category: 'consumer_assets',
      score: null,
      summaryZh: '数据不足，暂不足以判断消费者体感与风险资产定价背离。',
      evidence: [],
      dataUsed: ['macroDrivers.consumer', 'displayInputsBaseline.spx', 'displayInputsBaseline.vix', 'displayInputsBaseline.hyOas'],
      limitations: ['UMCSENT 为月频慢变量。', '该信号为非实时观察，不应作为实时交易信号。']
    });
  }

  const assetStillStrong = Number.isFinite(spx) && spx >= 5000;
  const pricingCalm = Number.isFinite(vix) && vix <= 18 && Number.isFinite(hyOas) && hyOas < 4;
  const pricingConfirmed = (Number.isFinite(vix) && vix >= 25) || (Number.isFinite(hyOas) && hyOas >= 4.5);
  const strongDeterioration = threeMonthChange <= -8;
  const mildDeterioration = threeMonthChange <= -4;
  const improvingOrStable = threeMonthChange >= -4;
  const score = strongDeterioration && assetStillStrong && pricingCalm
    ? 76
    : strongDeterioration && assetStillStrong
      ? 66
      : mildDeterioration && assetStillStrong
        ? 54
        : mildDeterioration
          ? 40
          : improvingOrStable ? 18 : 24;

  return buildDivergenceCheck({
    key: 'consumer_vs_asset_pricing',
    labelZh: '消费者体感与风险资产背离',
    category: 'consumer_assets',
    score,
    summaryZh: mildDeterioration && assetStillStrong && pricingCalm
      ? '消费者体感与风险资产定价之间存在观察性背离；该信号为月频慢变量，不应作为实时交易信号。'
      : mildDeterioration && pricingConfirmed
        ? '消费者压力已部分被信用或波动率确认，背离程度需要结合信用与波动率继续观察。'
        : improvingOrStable
          ? '消费者信心暂未显示明显走弱，暂未形成消费者体感与风险资产定价背离。'
          : '消费者信心变化与风险资产定价暂不足以形成明确背离。',
    evidence: [
      briefEvidence('macroDrivers.consumer', 'umichSentiment', '密歇根消费者信心', sentiment, `UMCSENT 当前值 ${sentiment.toFixed(1)}。`),
      briefEvidence('macroDrivers.consumer', 'threeMonthChange', '三个月变化', threeMonthChange, `UMCSENT 三个月变化 ${threeMonthChange.toFixed(1)}。`),
      briefEvidence('displayInputsBaseline', 'spx', '标普500', spx, Number.isFinite(spx) ? `标普500 ${spx.toFixed(0)}。` : '标普500数据不足。'),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', vix, Number.isFinite(vix) ? `VIX ${vix.toFixed(2)}。` : 'VIX 数据不足。'),
      briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', hyOas, Number.isFinite(hyOas) ? `高收益债信用利差 ${hyOas.toFixed(2)}%。` : '高收益债信用利差数据不足。')
    ],
    dataUsed: ['macroDrivers.consumer.umichSentiment', 'macroDrivers.consumer.threeMonthChange', 'displayInputsBaseline.spx', 'displayInputsBaseline.vix', 'displayInputsBaseline.hyOas'],
    limitations: ['UMCSENT 为月频慢变量，发布时间存在延迟。', '该信号为非实时解释层观察，不进入 scoring / decision。']
  });
}

function buildDivergenceLayer({ risk, realtimePayload, displayInputsBaseline, macroDrivers, confidenceScore }) {
  const checks = [
    buildEnergyPricingGapCheck(risk, realtimePayload, displayInputsBaseline),
    buildRatesAssetsCheck(risk, displayInputsBaseline),
    buildLiquidityCreditCheck(risk, displayInputsBaseline),
    buildRiskComplacencyCheck(risk, displayInputsBaseline),
    buildConsumerAssetsCheck(risk, displayInputsBaseline, macroDrivers)
  ];
  const validChecks = checks.filter((check) => check.status !== 'insufficient_data');
  const score = validChecks.length ? clamp(avg(validChecks.map((check) => check.score))) : 0;
  const state = validChecks.length ? divergenceStatusFromScore(score) : 'insufficient_data';
  const primary = validChecks.length
    ? [...validChecks].sort((a, b) => b.score - a.score)[0]
    : null;
  const insufficientCount = checks.length - validChecks.length;
  const confidenceLevel = insufficientCount >= 2 ? 'low' : confidenceScore >= 75 && validChecks.length >= 3 ? 'medium' : 'low';
  return {
    contractVersion: 'v28.0I-3A',
    generatedAt: isoNow,
    score,
    state,
    stateZh: divergenceStateZh(state),
    summaryZh: validChecks.length
      ? `当前背离层综合状态为${divergenceStateZh(state)}，仅用于实体压力与金融定价的 audit-only 观察。`
      : '当前数据不足以识别明确的实体压力与金融定价背离。',
    primaryDivergence: primary
      ? {
        key: primary.key,
        labelZh: primary.labelZh,
        status: primary.status,
        statusZh: divergenceStateZh(primary.status),
        summaryZh: primary.summaryZh,
        evidence: primary.evidence
      }
      : {
        key: 'no_clear_divergence',
        labelZh: '暂无明确主背离',
        status: 'insufficient_data',
        statusZh: '数据不足',
        summaryZh: '当前数据不足以识别明确的实体压力与金融定价背离。',
        evidence: []
      },
    checks,
    dataGaps: [
      'Platts Dated Brent / 真实 Dated Brent 数据未接入。',
      'Brent term structure 尚未正式接入。',
      'UMCSENT 为月频慢变量，存在发布延迟。'
    ],
    confidence: {
      level: confidenceLevel,
      score: confidenceLevel === 'medium' ? Math.min(70, confidenceScore) : Math.min(45, confidenceScore),
      reasonZh: `第一版背离层只使用现有数据，${insufficientCount} 个 check 数据不足，因此一般不设为高置信。`
    },
    boundaries: {
      displayOnly: true,
      auditOnly: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeBrentSourceName(source) {
  return String(source || '').trim().toLowerCase();
}

function brentCandidateSource(candidate = {}) {
  return firstString(candidate.source, candidate.sourceId, candidate.id, candidate.key, candidate.name, candidate.label, candidate.symbol);
}

function brentCandidateValue(candidate = {}) {
  return firstFinite(candidate.value, candidate.price, candidate.last, candidate.close, candidate.recommendedValue, candidate.selectedValue);
}

function brentCandidateObservedAt(candidate = {}) {
  return firstString(candidate.observedAt, candidate.asOf, candidate.updatedAt, candidate.date, candidate.timestamp);
}

function findBrentCandidate(candidates, matcher) {
  return (Array.isArray(candidates) ? candidates : []).find((candidate) => matcher(normalizeBrentSourceName(brentCandidateSource(candidate))));
}

function brentConfirmationRole(source) {
  const normalized = normalizeBrentSourceName(source);
  if (/fred|dcoilbrenteu/u.test(normalized)) return 'anchor';
  if (/yahoo|bz=f|bz%3df/u.test(normalized)) return 'futures_proxy';
  if (/tradingeconomics|brent-crude-oil/u.test(normalized)) return 'confirmation';
  return 'diagnostic';
}

function brentConfirmationLabel(source) {
  const normalized = normalizeBrentSourceName(source);
  if (/fred|dcoilbrenteu/u.test(normalized)) return 'FRED DCOILBRENTEU';
  if (/yahoo|bz=f|bz%3df/u.test(normalized)) return 'Yahoo BZ=F';
  if (/tradingeconomics|brent-crude-oil/u.test(normalized)) return 'Trading Economics Brent';
  if (/stooq/u.test(normalized)) return 'Stooq Brent diagnostic';
  if (/google/u.test(normalized)) return 'Google Finance diagnostic';
  return source || 'Brent source';
}

function normalizeBrentStatus(status, value) {
  const normalized = String(status || '').toLowerCase();
  if (['ok', 'fallback', 'missing', 'excluded'].includes(normalized)) return normalized;
  if (Number.isFinite(value)) return 'ok';
  return 'missing';
}

function buildBrentConfirmationSources(realtimePayload, selectedBrent) {
  const validation = realtimePayload?.brentValidation || {};
  const candidates = Array.isArray(validation.candidates) ? validation.candidates : [];
  const sources = candidates.map((candidate) => {
    const source = brentCandidateSource(candidate) || 'unknown';
    const value = brentCandidateValue(candidate);
    const role = brentConfirmationRole(source);
    const status = normalizeBrentStatus(candidate.status, value);
    return {
      source,
      labelZh: brentConfirmationLabel(source),
      value,
      observedAt: brentCandidateObservedAt(candidate),
      status: role === 'diagnostic' && status === 'ok' ? 'excluded' : status,
      role,
      participatesInPromotion: candidate.participatesInPromotion === true || (role !== 'diagnostic' && status === 'ok'),
      noteZh: role === 'diagnostic'
        ? '该来源仅作为诊断观察，不参与 Brent promotion。'
        : '该来源来自现有 Brent validation / confirmation 字段，仅用于公开代理价格层审计。'
    };
  });

  if (!sources.some((item) => /fred|dcoilbrenteu/iu.test(item.source)) && Number.isFinite(selectedBrent.value)) {
    sources.push({
      source: selectedBrent.source || 'fred:DCOILBRENTEU',
      labelZh: 'FRED DCOILBRENTEU',
      value: selectedBrent.value,
      observedAt: selectedBrent.observedAt,
      status: selectedBrent.status === 'missing' ? 'missing' : 'fallback',
      role: 'anchor',
      participatesInPromotion: false,
      noteZh: '未在 candidates 中找到 FRED anchor，按当前 selectedBrent / sourceDetails 作为公开现货代理 fallback 记录。'
    });
  }
  return sources;
}

function computeMaxProxyDivergencePct(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length < 2) return null;
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const baseline = Math.max(1, avg(finiteValues));
  return +(((max - min) / baseline) * 100).toFixed(3);
}

function classifyProxySpreadStatus(spotMinusFutures, divergencePct) {
  if (!Number.isFinite(spotMinusFutures) || !Number.isFinite(divergencePct)) return 'insufficient_data';
  const absSpread = Math.abs(spotMinusFutures);
  if (absSpread >= 5 || divergencePct >= 5) return 'stress';
  if (absSpread >= 2 || divergencePct >= 2) return 'watch';
  return 'normal';
}

function brentSpreadStatusZh(status) {
  return {
    normal: '公开代理价差正常',
    watch: '公开代理价差观察',
    stress: '公开代理价差压力',
    insufficient_data: '数据不足'
  }[status] || '状态待确认';
}

function buildBrentPricingLayer({ realtimePayload, displayInputsBaseline, dailyRealtimeInput, ulsdData = null }) {
  const validation = realtimePayload?.brentValidation || {};
  const promotion = validation.promotion || {};
  const consensus = validation.consensus || {};
  const candidates = Array.isArray(validation.candidates) ? validation.candidates : [];
  const sourceDetails = realtimePayload?.sourceDetails?.brent || {};
  const selectedValue = firstFinite(displayInputsBaseline?.brent, realtimePayload?.values?.brent);
  const selectedSource = firstString(sourceDetails.source, realtimePayload?.sourceStatus?.brent, promotion.selectedSource, consensus.recommendedSource);
  const selectedObservedAt = firstString(sourceDetails.observedAt, sourceDetails.updatedAt, realtimePayload?.updatedAt, dailyRealtimeInput?.updatedAt);
  const selectedBrent = {
    value: selectedValue,
    source: selectedSource,
    observedAt: selectedObservedAt,
    status: Number.isFinite(selectedValue) ? (String(selectedSource || '').includes('fallback') ? 'fallback' : 'ok') : 'missing',
    noteZh: '当前主 Brent 显示值来自现有 Daily / realtime 输入；该层只做公开代理审计，不改变 values.brent。'
  };

  const fredCandidate = findBrentCandidate(candidates, (source) => /fred|dcoilbrenteu/u.test(source));
  const yahooCandidate = findBrentCandidate(candidates, (source) => /yahoo|bz=f|bz%3df/u.test(source));
  const teCandidate = findBrentCandidate(candidates, (source) => /tradingeconomics|brent-crude-oil/u.test(source));
  const fredValue = brentCandidateValue(fredCandidate || {});
  const yahooValue = brentCandidateValue(yahooCandidate || {});
  const teValue = brentCandidateValue(teCandidate || {});
  const selectedIsFred = /fred|dcoilbrenteu/u.test(normalizeBrentSourceName(selectedSource));

  const publicSpotProxy = {
    labelZh: 'Brent 公开现货代理',
    source: brentCandidateSource(fredCandidate || {}) || (selectedIsFred ? selectedSource : null),
    value: Number.isFinite(fredValue) ? fredValue : selectedIsFred ? selectedValue : null,
    observedAt: brentCandidateObservedAt(fredCandidate || {}) || (selectedIsFred ? selectedObservedAt : null),
    status: Number.isFinite(fredValue) ? 'ok' : selectedIsFred && Number.isFinite(selectedValue) ? 'fallback' : 'missing',
    limitationZh: '该字段为公开 Brent 现货代理观察，不等同于 Platts Dated Brent 或正式实物现货成交价。'
  };

  const futuresProxyValue = Number.isFinite(yahooValue) ? yahooValue : Number.isFinite(teValue) ? teValue : null;
  const futuresProxy = {
    labelZh: 'Brent 期货代理',
    source: brentCandidateSource(yahooCandidate || {}) || (Number.isFinite(teValue) ? brentCandidateSource(teCandidate || {}) : null),
    value: futuresProxyValue,
    observedAt: brentCandidateObservedAt(yahooCandidate || {}) || (Number.isFinite(teValue) ? brentCandidateObservedAt(teCandidate || {}) : null),
    status: Number.isFinite(yahooValue) ? 'ok' : Number.isFinite(teValue) ? 'fallback' : 'missing',
    limitationZh: '该字段为公开期货/市场报价代理，仅用于验证层观察。'
  };

  const confirmationSources = buildBrentConfirmationSources(realtimePayload, selectedBrent);
  const spotMinusFutures = Number.isFinite(publicSpotProxy.value) && Number.isFinite(futuresProxy.value)
    ? +(publicSpotProxy.value - futuresProxy.value).toFixed(3)
    : null;
  const selectedMinusFutures = Number.isFinite(selectedBrent.value) && Number.isFinite(futuresProxy.value)
    ? +(selectedBrent.value - futuresProxy.value).toFixed(3)
    : null;
  const maxProxyDivergencePct = firstFinite(
    validation.maxConfirmationDivergencePct,
    validation.maxProxyDivergencePct,
    consensus.maxConfirmationDivergencePct,
    computeMaxProxyDivergencePct([publicSpotProxy.value, futuresProxy.value, selectedBrent.value])
  );
  const spreadStatus = classifyProxySpreadStatus(spotMinusFutures, maxProxyDivergencePct);
  const confidenceLevel = spreadStatus === 'insufficient_data' ? 'low' : futuresProxy.status === 'ok' && publicSpotProxy.status === 'ok' ? 'medium' : 'low';
  /* M-39: derive anchorAgeHours only from existing in-memory Brent timing data. */
  const ageSecondsFallback = Number.isFinite(sourceDetails.ageSeconds)
    ? sourceDetails.ageSeconds / 3600
    : null;
  const fredAnchorCandidate = findBrentCandidate(candidates, (source) => /fred|dcoilbrenteu|fred-anchor/u.test(source)) || {};
  const fredAnchorObservedAt = brentCandidateObservedAt(fredAnchorCandidate);
  let ageFromObservedAt = null;
  if (fredAnchorObservedAt) {
    const normalizedAt = /^\d{4}-\d{2}-\d{2}$/.test(fredAnchorObservedAt)
      ? `${fredAnchorObservedAt}T00:00:00Z`
      : fredAnchorObservedAt;
    const parsedMs = Date.parse(normalizedAt);
    const nowMs = Date.parse(isoNow);
    if (Number.isFinite(parsedMs) && Number.isFinite(nowMs)) {
      ageFromObservedAt = (nowMs - parsedMs) / 3600000;
      if (ageFromObservedAt < 0) ageFromObservedAt = null;
    }
  }

  let crackSpread = null;
  let crackSpread4wChange = null;
  const ulsdPrice = Number.isFinite(ulsdData?.ulsdPrice) ? ulsdData.ulsdPrice : null;
  const ulsd4wChange = Number.isFinite(ulsdData?.ulsd4wChange) ? ulsdData.ulsd4wChange : null;

  if (ulsdPrice !== null && Number.isFinite(selectedBrent?.value)) {
    const computed = +(ulsdPrice * 42 - selectedBrent.value).toFixed(2);
    if (computed >= -30 && computed <= 120) {
      crackSpread = computed;
    }
  }

  // Approximation: ULSD 4-week change converted to barrel terms; Brent 4-week change is not available here.
  if (ulsd4wChange !== null && Number.isFinite(ulsd4wChange)) {
    crackSpread4wChange = +(ulsd4wChange * 42).toFixed(2);
  }

  const crackSpreadRegime = classifyCrackSpreadRegime(crackSpread);
  const ulsdSourceStatus = ulsdData?.sourceStatus ?? 'missing';

  return {
    contractVersion: 'v28.0I-5A',
    generatedAt: isoNow,
    mode: 'public_proxy_observation',
    summaryZh: spreadStatus === 'insufficient_data'
      ? '当前公开数据不足以判断 Brent 现货代理与期货代理之间是否存在明显背离。'
      : spreadStatus === 'normal'
        ? 'Brent 公开代理价格层显示，当前主值与公开期货/确认源之间未形成明显异常背离。'
        : 'Brent 公开代理价格层显示，部分来源之间存在观察性价差，需要继续交叉验证。',
    selectedBrent,
    publicSpotProxy,
    futuresProxy,
    confirmationSources,
    ulsdPrice,
    ulsd4wChange,
    crackSpread,
    crackSpread4wChange,
    crackSpreadRegime,
    ulsdSourceStatus,
    proxySpread: {
      spotMinusFutures,
      selectedMinusFutures,
      maxProxyDivergencePct,
      status: spreadStatus,
      statusZh: brentSpreadStatusZh(spreadStatus),
      interpretationZh: spreadStatus === 'insufficient_data'
        ? '公开现货代理或期货代理数据不足，暂不足以判断。'
        : '该价差只用于公开代理价格层审计，不改变 Brent 主值或 promotion。'
    },
    promotionAudit: {
      promotionApplied: typeof promotion.applied === 'boolean' ? promotion.applied : null,
      moveStatus: firstString(promotion.moveStatus, validation.moveStatus),
      /* M-39: keep Worker promotion.reason priority, then fall back to realtime consensus.reason. */
      promotionReason: firstString(promotion.reason, validation.reason, consensus.reason),
      selectedSource,
      anchorSource: publicSpotProxy.source,
      anchorAgeHours: firstFinite(
        sourceDetails.ageHours,
        sourceDetails.observedAgeHours,
        validation.anchorAgeHours,
        ageSecondsFallback,
        Number.isFinite(ageFromObservedAt) ? Number(ageFromObservedAt.toFixed(2)) : null
      )
    },
    dataGaps: [
      'Platts Dated Brent / 正式 Dated Brent 未接入。',
      'Brent 期限结构尚未正式接入。',
      '油轮运费 / 航运压力尚未正式接入。'
    ],
    limitations: [
      '当前仅为公开代理价格观察，不等同于付费 Dated Brent 或实物成交数据。',
      '该层不改变 Brent 主值、评分、仓位或执行灯。'
    ],
    confidence: {
      level: confidenceLevel,
      score: confidenceLevel === 'medium' ? 60 : 35,
      reasonZh: confidenceLevel === 'medium'
        ? '公开现货代理与期货代理均可用，但该层仍只作为审计观察。'
        : '公开代理来源不足或只能 fallback，因此维持低置信。'
    },
    boundaries: {
      displayOnly: true,
      auditOnly: true,
      affectsValuesBrent: false,
      affectsBrentPromotion: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}

function classifyDailyBriefConfidence(score, realtimePayload, allMacroMissing) {
  if (allMacroMissing || realtimePayload.cacheOnly || (realtimePayload.criticalMissing ?? 0) > 1 || score < 55) return 'low';
  if (realtimePayload.degradedMode || (realtimePayload.fallbackCount ?? 0) > 0 || score < 80) return 'medium';
  return 'high';
}

function selectDominantRiskChain(risk, displayInputsBaseline) {
  const highModules = Object.entries(risk.modules).filter(([, value]) => value >= 70);
  if (highModules.length >= 3) {
    return {
      key: 'broad_risk_resonance',
      labelZh: '多模块共振风险',
      stageZh: '多模块共振观察',
      summaryZh: `当前有 ${highModules.length} 个底层模块处于高风险区，主判断应优先观察风险是否继续扩散。`,
      evidence: highModules.slice(0, 4).map(([key, value]) => briefEvidence(
        'modules',
        key,
        MODULE_LABELS_CN[key] || key,
        value,
        `${MODULE_LABELS_CN[key] || key} 模块分数为 ${value}。`
      ))
    };
  }
  if (risk.modules.energy >= 65 || risk.modules.inflation >= 65 || risk.brent >= 95 || risk.breakeven >= 2.6 || risk.us10y >= 4.5) {
    return {
      key: 'energy_inflation_rates',
      labelZh: '能源 → 通胀 → 利率压力',
      stageZh: '能源与通胀向利率端传导',
      summaryZh: '能源、通胀或长端利率仍是今日最需要压缩观察的主链条。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'brent', '布伦特', displayInputsBaseline.brent, `布伦特 ${risk.brent.toFixed(1)}，用于观察能源压力。`),
        briefEvidence('displayInputsBaseline', 'breakeven10y', '10年盈亏平衡通胀', displayInputsBaseline.breakeven10y, `10年盈亏平衡通胀 ${risk.breakeven.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', displayInputsBaseline.us10y, `美国10年期收益率 ${risk.us10y.toFixed(2)}%。`)
      ]
    };
  }
  if (risk.modules.liquidity >= 65 || risk.modules.banking >= 65 || risk.modules.debt >= 65 || risk.dxy >= 105 || risk.hy >= 4 || risk.vix >= 25) {
    return {
      key: 'liquidity_credit_stress',
      labelZh: '流动性 → 信用 → 风险资产压力',
      stageZh: '融资条件与信用压力观察',
      summaryZh: '美元、信用利差或波动率构成主要观察链条，重点看压力是否向信用与银行风险扩散。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'dxy', '广义美元指数', displayInputsBaseline.dxy, `广义美元指数 ${risk.dxy.toFixed(2)}。`),
        briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', displayInputsBaseline.hyOas, `高收益债信用利差 ${risk.hy.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'vix', 'VIX', displayInputsBaseline.vix, `VIX ${risk.vix.toFixed(2)}。`)
      ]
    };
  }
  if ((risk.us10y >= 4.4 || risk.real10y >= 2) && risk.spx >= 5000) {
    return {
      key: 'rates_asset_repricing',
      labelZh: '长端利率 → 估值压力 → 资产重新定价',
      stageZh: '利率压力与风险资产定价观察',
      summaryZh: '长端利率压力仍高，但风险资产定价尚未充分同步反映，需要观察是否重新定价。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', displayInputsBaseline.us10y, `美国10年期收益率 ${risk.us10y.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'real10y', '美国10年期实际利率', displayInputsBaseline.real10y, `美国10年期实际利率 ${risk.real10y.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'spx', '标普500', displayInputsBaseline.spx, `标普500 ${risk.spx.toFixed(0)}。`)
      ]
    };
  }
  return {
    key: 'baseline_observation',
    labelZh: '基线观察状态',
    stageZh: '等待更清晰主链条',
    summaryZh: '当前没有足够清晰的单一主导链条，暂按基线观察处理。',
    evidence: [
      briefEvidence('score', 'score', '综合风险分数', risk.score, `综合风险分数 ${risk.score}。`),
      briefEvidence('modules', 'topModules', '底层模块', null, '数据不足以确认单一主链条。')
    ]
  };
}

function selectLargestDivergence(risk, realtimePayload, displayInputsBaseline) {
  const brentValidation = realtimePayload.brentValidation || {};
  const brentAuditText = [
    brentValidation?.promotion?.reason,
    brentValidation?.promotion?.moveStatus,
    realtimePayload?.sourceDetails?.brent?.source
  ].filter(Boolean).join(' ');
  if (risk.brent >= 95 && /promotion|confirmed|yahoo|tradingeconomics|fred/iu.test(brentAuditText)) {
    return {
      key: 'energy_pricing_gap_watch',
      labelZh: '能源定价背离观察',
      statusZh: '验证层继续观察',
      summaryZh: '布伦特处于偏高区间，且现有 Brent audit / promotion 字段显示能源价格验证层仍需继续观察；本字段不等同于 Platts Dated Brent。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'brent', '布伦特', displayInputsBaseline.brent, `布伦特 ${risk.brent.toFixed(1)}。`),
        briefEvidence('brentValidation', 'promotion', 'Brent 验证层', brentValidation?.promotion?.applied ?? null, 'Brent promotion / confirmation 信息来自现有 realtime payload。')
      ]
    };
  }
  if ((risk.us10y >= 4.4 || risk.real10y >= 2) && risk.spx >= 5000) {
    return {
      key: 'rates_vs_risk_assets',
      labelZh: '长端利率与风险资产背离',
      statusZh: '观察性背离',
      summaryZh: '长端利率压力与风险资产定价之间存在观察性背离，需要观察风险资产是否补跌或利率压力是否缓和。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', displayInputsBaseline.us10y, `美国10年期收益率 ${risk.us10y.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'spx', '标普500', displayInputsBaseline.spx, `标普500 ${risk.spx.toFixed(0)}。`)
      ]
    };
  }
  if ((risk.dxy >= 105 || risk.us10y >= 4.4) && risk.hy < 4 && risk.vix < 25) {
    return {
      key: 'liquidity_vs_credit',
      labelZh: '流动性与信用压力背离',
      statusZh: '压力尚未全面扩散',
      summaryZh: '美元或长端利率压力偏高，但信用利差和波动率尚未同步恶化，说明压力暂未完全扩散。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'dxy', '广义美元指数', displayInputsBaseline.dxy, `广义美元指数 ${risk.dxy.toFixed(2)}。`),
        briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', displayInputsBaseline.hyOas, `高收益债信用利差 ${risk.hy.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'vix', 'VIX', displayInputsBaseline.vix, `VIX ${risk.vix.toFixed(2)}。`)
      ]
    };
  }
  return {
    key: 'no_clear_divergence',
    labelZh: '暂无明确主背离',
    statusZh: '暂不足以判断',
    summaryZh: '现有数据暂不足以确认单一最大背离，继续观察利率、能源、信用和波动率的同步性。',
    evidence: [
      briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', displayInputsBaseline.us10y, `美国10年期收益率 ${risk.us10y.toFixed(2)}%。`),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', displayInputsBaseline.vix, `VIX ${risk.vix.toFixed(2)}。`)
    ]
  };
}

function buildDailyBrief({
  risk,
  realtimePayload,
  macroState,
  phase,
  displayInputsBaseline,
  topRisks,
  activeSignals,
  allMacroMissing,
  confidenceScore
}) {
  const dominantRiskChain = selectDominantRiskChain(risk, displayInputsBaseline);
  const largestDivergence = selectLargestDivergence(risk, realtimePayload, displayInputsBaseline);
  const highModules = Object.entries(risk.modules).filter(([, value]) => value >= 70);
  const dataGaps = [
    '消费者信心与资产价格背离仍缺少稳定月频输入。',
    'Brent physical proxy / term structure 尚未纳入本数据产物。',
    'shipping / freight stress 仍是候选观察项。'
  ];
  if (allMacroMissing) dataGaps.unshift('结构性宏观驱动源当前不可用，相关判断只能低置信观察。');

  return {
    contractVersion: 'v28.0I-1',
    generatedAt: isoNow,
    macroState: `${macroState} / ${phase}`,
    oneLineConclusion: `今日主线是${dominantRiskChain.labelZh}；最大背离为${largestDivergence.labelZh}，结论仍按 display-only 解释层处理。`,
    dominantRiskChain,
    largestDivergence,
    keyTriggers: [
      'Brent 继续上行并获得多源确认。',
      '美国10年期收益率继续上行。',
      'HY OAS 或 VIX 明显扩张。',
      highModules.length >= 2 ? '多个底层模块同时升至高风险区。' : '底层模块风险分数继续上行。',
      '数据健康状态下降。'
    ].slice(0, 5),
    invalidationSignals: [
      'Brent 回落且验证层不再提示压力。',
      '美国10年期收益率回落。',
      'VIX / HY OAS 未扩张且综合风险分数下降。',
      '多个模块趋势回落。',
      '数据健康恢复且风险判断不再获得交叉验证。'
    ],
    dataGaps: dataGaps.slice(0, 4),
    confidence: {
      level: classifyDailyBriefConfidence(confidenceScore, realtimePayload, allMacroMissing),
      score: confidenceScore,
      reasonZh: `基于现有 confidenceScore、数据健康和关键缺失项生成。当前关键缺失 ${realtimePayload.criticalMissing || 0}，fallback ${realtimePayload.fallbackCount || 0}。${activeSignals.length ? `结构信号：${activeSignals.map(s => s.label).join('、')}。` : '结构信号未形成额外交叉验证。'}`
    },
    boundaries: {
      displayOnly: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    evidence: topRisks.map((item, index) => briefEvidence('topRisks', `topRisk${index + 1}`, '顶部风险摘要', null, item)).slice(0, 4)
  };
}

function buildUnavailableDailyBrief() {
  return {
    contractVersion: 'v28.0I-1',
    generatedAt: isoNow,
    macroState: '数据不足',
    oneLineConclusion: '实时快变量暂不可用，今日总判断层只能保留低置信观察。',
    dominantRiskChain: {
      key: 'baseline_observation',
      labelZh: '基线观察状态',
      stageZh: '数据不足',
      summaryZh: '数据不足，暂不足以判断今日主导风险链。',
      evidence: []
    },
    largestDivergence: {
      key: 'no_clear_divergence',
      labelZh: '暂无明确主背离',
      statusZh: '数据不足',
      summaryZh: '数据不足，暂不足以判断最大背离。',
      evidence: []
    },
    keyTriggers: ['数据健康状态恢复后重新生成今日触发器。'],
    invalidationSignals: ['数据健康恢复且风险判断不再获得交叉验证。'],
    dataGaps: ['实时快变量暂不可用。', '消费者信心、Brent physical proxy、term structure、shipping / freight 等仍未纳入。'],
    confidence: {
      level: 'low',
      score: 0,
      reasonZh: '实时快变量暂不可用，dailyBrief 只能作为低置信 display-only 占位解释。'
    },
    boundaries: {
      displayOnly: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}

function confidenceLevelFromScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'low';
  if (value >= 75) return 'high';
  if (value >= 45) return 'medium';
  return 'low';
}

function aiConfidence(value) {
  return DAILY_AI_CONFIDENCE_LEVELS.has(value) ? value : 'low';
}

const DAILY_AI_CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);

function aiFact(key, labelZh, statementZh, sourceFields, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    sourceFields: Array.isArray(sourceFields) ? sourceFields : [],
    confidence: aiConfidence(confidence)
  };
}

function aiInference(key, labelZh, statementZh, basedOn, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    basedOn: Array.isArray(basedOn) ? basedOn : [],
    confidence: aiConfidence(confidence)
  };
}

function aiJudgment(key, labelZh, statementZh, modelSource, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    modelSource,
    confidence: aiConfidence(confidence)
  };
}

function aiScenario(key, labelZh, statementZh, triggerConditions, invalidationConditions, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    triggerConditions: Array.isArray(triggerConditions) ? triggerConditions : [],
    invalidationConditions: Array.isArray(invalidationConditions) ? invalidationConditions : [],
    confidence: aiConfidence(confidence)
  };
}

function aiEvidenceLink(layer, field, noteZh) {
  return { layer, field, noteZh };
}

function buildAiInterpretationLayer(data) {
  const dailyBrief = data?.dailyBrief && typeof data.dailyBrief === 'object' ? data.dailyBrief : null;
  const divergenceLayer = data?.divergenceLayer && typeof data.divergenceLayer === 'object' ? data.divergenceLayer : null;
  const brentPricingLayer = data?.brentPricingLayer && typeof data.brentPricingLayer === 'object' ? data.brentPricingLayer : null;
  const macroDrivers = data?.macroDrivers && typeof data.macroDrivers === 'object' ? data.macroDrivers : {};
  const consumer = macroDrivers.consumer && typeof macroDrivers.consumer === 'object' ? macroDrivers.consumer : null;
  const decisionModel = data?.decisionModel && typeof data.decisionModel === 'object' ? data.decisionModel : null;
  const confidenceScore = Number.isFinite(data?.confidenceScore) ? clamp(data.confidenceScore) : 0;
  const confidenceLevel = confidenceLevelFromScore(confidenceScore);
  const primaryDivergence = divergenceLayer?.primaryDivergence || null;
  const brentSpread = brentPricingLayer?.proxySpread || null;
  const consumerCheck = Array.isArray(divergenceLayer?.checks)
    ? divergenceLayer.checks.find((check) => check?.key === 'consumer_vs_asset_pricing')
    : null;

  const facts = [
    dailyBrief
      ? aiFact('daily_brief_generated', 'Daily Brief 已生成', '当前 Daily Brief 已生成今日主判断，并以解释层形式展示。', ['dailyBrief.contractVersion', 'dailyBrief.oneLineConclusion'], 'high')
      : null,
    divergenceLayer
      ? aiFact('divergence_layer_audit_only', '背离层为审计层', 'divergenceLayer 当前为审计层和展示层，不参与评分或决策。', ['divergenceLayer.boundaries'], 'high')
      : null,
    brentPricingLayer
      ? aiFact('brent_proxy_observation_mode', 'Brent 公开代理观察', 'Brent 公开代理价格层处于公开代理观察模式，不等同于正式实物成交价。', ['brentPricingLayer.mode', 'brentPricingLayer.limitations'], 'high')
      : null,
    consumer
      ? aiFact('consumer_monthly_source', '消费者信心慢变量', '消费者信心数据来自 FRED:UMCSENT，属于 Daily 月频慢变量。', ['macroDrivers.consumer.source', 'macroDrivers.consumer.notes'], 'high')
      : null,
    aiFact('interpretation_layer_rule_based', '规则化解释层', '本层为规则化结构解释，不调用外部 AI API。', ['aiInterpretationLayer.mode', 'aiInterpretationLayer.boundaries'], 'high')
  ].filter(Boolean);

  const consumerChange = Number(consumer?.threeMonthChange);
  const dataInferences = [
    primaryDivergence
      ? aiInference(
        'primary_divergence_observation',
        '主要背离观察',
        `当前主背离来自 divergenceLayer.primaryDivergence：${primaryDivergence.labelZh || '暂不足以判断'}。该结论仍是观察性解释。`,
        ['divergenceLayer.primaryDivergence'],
        'medium'
      )
      : null,
    brentSpread
      ? aiInference(
        'brent_proxy_spread_observation',
        'Brent 代理价差观察',
        ['watch', 'stress'].includes(brentSpread.status)
          ? '公开 Brent 代理价格之间显示观察性价差，需要结合验证源继续跟踪。'
          : '公开 Brent 代理价格之间暂未显示需要升级处理的价差压力。',
        ['brentPricingLayer.proxySpread'],
        brentSpread.status === 'stress' ? 'medium' : 'low'
      )
      : null,
    Number.isFinite(consumerChange)
      ? aiInference(
        'consumer_margin_observation',
        '消费者体感边际观察',
        consumerChange < 0
          ? 'UMCSENT 三个月变化为负，消费者体感可能边际走弱。'
          : 'UMCSENT 三个月变化未转负，消费者体感暂未显示明确边际走弱。',
        ['macroDrivers.consumer.threeMonthChange'],
        'medium'
      )
      : null,
    consumerCheck
      ? aiInference(
        'consumer_asset_divergence_check',
        '消费者与资产背离检查',
        'consumer_vs_asset_pricing 只说明消费者体感与风险资产定价之间是否存在观察性错配。',
        ['divergenceLayer.checks.consumer_vs_asset_pricing'],
        'medium'
      )
      : null
  ].filter(Boolean);

  const modelJudgments = [
    dailyBrief
      ? aiJudgment('daily_brief_model_context', '主判断上下文', 'Daily Brief 提供今日主判断压缩，但不生成交易建议。', 'dailyBrief', 'medium')
      : null,
    aiJudgment('interpretation_layers_do_not_execute', '解释层不进入执行系统', '当前新增解释层均未进入评分、仓位或执行灯系统。', 'combined', 'high'),
    decisionModel
      ? aiJudgment('decision_context_separated', '决策上下文隔离', 'decisionModel 可作为解释证据来源，但 AI 解释层不能改写策略状态或仓位建议。', 'decisionModel', 'high')
      : null,
    divergenceLayer && brentPricingLayer
      ? aiJudgment('cross_layer_observation_priority', '跨层观察优先级', '若数据健康正常且多个背离层同向提示，可提高人工观察优先级，但不能自动改变仓位。', 'combined', 'medium')
      : null
  ].filter(Boolean);

  const scenarioHypotheses = [
    aiScenario(
      'energy_rates_asset_repricing_watch',
      '能源—利率—资产重新定价观察',
      '如果 Brent 公开代理价差扩大，同时 US10Y 上行、VIX 或 HY OAS 扩张，则能源—利率—资产重新定价链条需要升级观察。',
      ['brentPricingLayer.proxySpread.status 进入 watch 或 stress', 'displayInputsBaseline.us10y 上行', 'displayInputsBaseline.vix 或 displayInputsBaseline.hyOas 扩张'],
      ['Brent 公开代理价差收敛', 'US10Y 回落', 'VIX 与 HY OAS 未扩张'],
      'medium'
    ),
    aiScenario(
      'consumer_asset_divergence_deescalation',
      '消费者体感与风险资产背离降级条件',
      '如果消费者信心修复、长端利率回落、信用利差未扩张，则消费者体感与风险资产背离可降级观察。',
      ['macroDrivers.consumer.threeMonthChange 改善', 'displayInputsBaseline.us10y 回落', 'displayInputsBaseline.hyOas 未扩张'],
      ['UMCSENT 继续走弱', 'HY OAS 或 VIX 扩张', '风险资产定价继续与体感数据背离'],
      'medium'
    ),
    aiScenario(
      'data_health_guardrail',
      '数据健康保护条件',
      '如果数据健康下降或关键字段缺失增加，AI 解释层应降低置信度，并以 Daily Brief、背离层和数据健康状态为主。',
      ['dailyRealtimeInput.healthScore 下降', 'realtime criticalMissing 增加', '数据源进入 fallback 或 cache-only'],
      ['Worker Health 正常', 'realtime-data 处于 fresh 或 aging', '关键缺失项回落'],
      'high'
    )
  ];

  const dataGaps = [
    'Platts Dated Brent / 正式 Dated Brent 未接入。',
    'Brent term structure 尚未接入。',
    'shipping / freight stress 尚未接入。',
    '世界秩序外部源质量需单独查看 World Order 模块。'
  ];

  const invalidationSignals = Array.isArray(dailyBrief?.invalidationSignals) && dailyBrief.invalidationSignals.length
    ? dailyBrief.invalidationSignals.slice(0, 5)
    : [
      'Brent 公开代理价差收敛且验证层不再提示压力。',
      '美国10年期收益率回落。',
      'VIX / HY OAS 未扩张且综合风险分数下降。',
      '消费者信心边际修复。',
      '数据健康恢复且背离层不再获得交叉验证。'
    ];

  const evidenceLinks = [
    dailyBrief ? aiEvidenceLink('dailyBrief', 'oneLineConclusion', '今日主判断来自 Daily Brief。') : null,
    divergenceLayer ? aiEvidenceLink('divergenceLayer', 'primaryDivergence', '主要背离来自 divergenceLayer。') : null,
    brentPricingLayer ? aiEvidenceLink('brentPricingLayer', 'proxySpread', 'Brent 代理价差来自 brentPricingLayer。') : null,
    consumer ? aiEvidenceLink('macroDrivers.consumer', 'threeMonthChange', '消费者体感观察来自 FRED UMCSENT 月频数据。') : null,
    decisionModel ? aiEvidenceLink('decisionModel', 'strategyState', '策略状态仅作为上下文证据，不被 AI 解释层改写。') : null
  ].filter(Boolean);

  const missingCoreLayers = [dailyBrief, divergenceLayer, brentPricingLayer].filter((item) => !item).length;
  const finalConfidenceScore = clamp(confidenceScore - missingCoreLayers * 15);
  const finalConfidenceLevel = missingCoreLayers > 0 ? 'low' : confidenceLevel;

  return {
    contractVersion: 'v28.0J-0',
    generatedAt: isoNow,
    mode: 'rule_based_structured_interpretation',
    summaryZh: missingCoreLayers > 0
      ? '当前数据不足以形成高置信解释，需以 Daily Brief、背离层和数据健康状态为主。本层不调用外部 AI。'
      : '当前 AI 解释层为规则化结构解释，不调用外部 AI。系统将事实、数据推断、模型判断和情景假设分离展示，避免把观察信号误写成确定性结论。',
    facts,
    dataInferences,
    modelJudgments,
    scenarioHypotheses,
    dataGaps,
    invalidationSignals,
    evidenceLinks,
    confidence: {
      level: finalConfidenceLevel,
      score: finalConfidenceScore,
      reasonZh: missingCoreLayers > 0
        ? '部分核心解释层缺失，因此 AI 解释层仅能低置信观察。'
        : '基于 Daily Brief、背离层、Brent 代理审计层、消费者慢变量和数据健康状态生成。'
    },
    boundaries: {
      displayOnly: true,
      interpretationOnly: true,
      generatedByExternalAi: false,
      usesExternalAiApi: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPreservableExternalAiLayer(layer) {
  const qualityReview = isRecord(layer?.qualityReview) ? layer.qualityReview : null;
  const boundaries = isRecord(layer?.boundaries) ? layer.boundaries : null;
  return isRecord(layer)
    && layer.schemaVersion === 'v28.0L-external-ai-production-1'
    && layer.status === 'valid'
    && typeof layer.displayEnabled === 'boolean'
    && isRecord(qualityReview)
    && qualityReview.promotionEligible === false
    && isRecord(boundaries)
    && boundaries.displayOnly === true
    && boundaries.externalAiGenerated === true
    && boundaries.usesExternalAiApi === true
    && boundaries.affectsScoring === false
    && boundaries.affectsDecisionModel === false
    && boundaries.affectsExecutionLock === false
    && boundaries.affectsPositionGuidance === false
    && boundaries.notInvestmentAdvice === true
    && boundaries.productionWriteApproved === false
    && typeof boundaries.frontendDisplayApproved === 'boolean';
}

function preserveExternalAiInterpretationLayer(next, previous = prevData) {
  const layer = previous?.externalAiInterpretationLayer;
  if (!isPreservableExternalAiLayer(layer)) {
    throw new Error('Refusing to build radar data because existing externalAiInterpretationLayer is missing or not production-contract compatible. Restore the last valid layer or run the approved External AI Production Refresh before normal radar refresh.');
  }
  next.externalAiInterpretationLayer = structuredClone(layer);
  return next;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringifyFetchError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.replace(/\s+/g, ' ').slice(0, 160);
}

async function fetchWithTimeout(url, timeoutMs = MACRO_FETCH_TIMEOUT_MS, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const userAgent = options.userAgent === undefined ? MACRO_USER_AGENT : options.userAgent;
    const headers = { ...(options.headers || {}) };
    if (userAgent) headers['User-Agent'] = userAgent;
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`timeout ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function retryFetch(url, label) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= MACRO_FETCH_RETRIES) {
    try {
      return await fetchWithTimeout(url);
    } catch (e) {
      lastErr = e;
      if (attempt === MACRO_FETCH_RETRIES) break;
      await sleep(MACRO_FETCH_RETRY_DELAY_MS * (attempt + 1));
      attempt += 1;
    }
  }
  throw new Error(`${label} failed: ${stringifyFetchError(lastErr)}`);
}

function parseFredCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!date || raw === undefined || raw === '.' || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

function cosdIso(daysBack) {
  return new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

async function fetchFredSeries(seriesId, daysBack = 90) {
  const url = `${FRED_BASE}?cosd=${cosdIso(daysBack)}&id=${seriesId}`;
  const text = await retryFetch(url, `fred:${seriesId}`);
  const rows = parseFredCsv(text);
  if (rows.length < 2) throw new Error(`fred:${seriesId} insufficient rows`);
  return rows;
}

function latestValue(rows) {
  return rows[rows.length - 1]?.value;
}

function findValueAgo(rows, days) {
  if (!rows.length) return null;
  const lastDate = rows[rows.length - 1]?.date;
  if (!lastDate) return null;
  const lastTime = Date.parse(`${lastDate}T00:00:00Z`);
  const targetTime = lastTime - days * 24 * 3600 * 1000;
  let best = null;
  let bestDiff = Infinity;
  for (const r of rows) {
    const t = Date.parse(`${r.date}T00:00:00Z`);
    const diff = Math.abs(t - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r.value;
    }
  }
  return best;
}

function trimDiagnosticString(value, maxLength = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function decodeBasicHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&mdash;/gu, '-')
    .replace(/&ndash;/gu, '-')
    .replace(/&ldquo;|&rdquo;/gu, '"')
    .replace(/&lsquo;|&rsquo;/gu, "'");
}

function htmlToPlainText(html) {
  return decodeBasicHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/giu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function capitalizeMonth(month) {
  return typeof month === 'string' && month
    ? `${month.slice(0, 1).toUpperCase()}${month.slice(1).toLowerCase()}`
    : null;
}

function parseIsmReportLink(html) {
  ISM_REPORT_PATH_PATTERN.lastIndex = 0;
  const match = ISM_REPORT_PATH_PATTERN.exec(html);
  if (!match?.groups?.href || !match?.groups?.month) return null;
  return {
    href: match.groups.href,
    reportMonthLabel: capitalizeMonth(match.groups.month)
  };
}

function parseIsmReportHtml(html, reportUrl, reportMonthLabel) {
  const plain = htmlToPlainText(html);
  if (/grecaptcha|captcha_form|SSO\/Login\.aspx|ecommerce\.ismworld\.org/iu.test(html)) {
    return {
      status: 'parse_error',
      diagnostics: {
        parseStep: 'non-public-content',
        reportUrl,
        snippetSample: trimDiagnosticString(plain)
      }
    };
  }

  const headlineMatch = plain.match(/Manufacturing\s+PMI\s+at\s+(\d+(?:\.\d+)?)%/iu);
  if (!headlineMatch) {
    return {
      status: 'parse_error',
      diagnostics: {
        parseStep: 'report-no-headline-pmi',
        reportUrl,
        snippetSample: trimDiagnosticString(plain)
      }
    };
  }

  const latestPmi = Number(headlineMatch[1]);
  if (!Number.isFinite(latestPmi) || latestPmi < 0 || latestPmi > 100) {
    return {
      status: 'parse_error',
      diagnostics: {
        parseStep: 'report-invalid-headline-pmi',
        reportUrl,
        snippetSample: trimDiagnosticString(headlineMatch[0])
      }
    };
  }

  const last12Segment = plain.match(/THE LAST 12 MONTHS(?<segment>[\s\S]+?)(?:Average for 12 months|Commodities|Buying Policy|WHAT RESPONDENTS ARE SAYING|$)/iu)?.groups?.segment || '';
  const rows = [...last12Segment.matchAll(/([A-Z][a-z]{2}\s+\d{4})\s+(\d+(?:\.\d+)?)/gu)]
    .map((match) => ({ label: match[1], value: Number(match[2]) }))
    .filter((row) => Number.isFinite(row.value) && row.value >= 0 && row.value <= 100)
    .slice(0, 12);

  if (rows.length < 4) {
    return {
      status: 'parse_error',
      diagnostics: {
        parseStep: 'report-last-12-months-table',
        reportUrl,
        snippetSample: trimDiagnosticString(last12Segment || plain)
      }
    };
  }

  const value3MonthsAgo = rows[3]?.value;
  return {
    status: 'live',
    latestPmi,
    pmi3mChange: Number.isFinite(value3MonthsAgo) ? +(latestPmi - value3MonthsAgo).toFixed(1) : null,
    reportUrl,
    reportMonthLabel,
    last12Months: rows
  };
}

async function fetchIsmText(url, { userAgent, timeoutMs, label }) {
  let lastFailure = null;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {};
      if (userAgent) headers['User-Agent'] = userAgent;
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      const text = await res.text();
      const latencyMs = Date.now() - startedAt;
      if (res.ok) {
        return {
          ok: true,
          text,
          httpStatus: res.status,
          finalUrl: res.url,
          latencyMs
        };
      }
      lastFailure = {
        httpStatus: res.status,
        latencyMs,
        errorReason: `${label}: HTTP ${res.status}`
      };
    } catch (err) {
      lastFailure = {
        httpStatus: null,
        latencyMs: Date.now() - startedAt,
        errorReason: `${label}: ${err?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : stringifyFetchError(err)}`
      };
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await sleep(ISM_PMI_RETRY_DELAY_MS);
  }
  return {
    ok: false,
    diagnostics: lastFailure || {
      httpStatus: null,
      latencyMs: null,
      errorReason: `${label}: unknown fetch failure`
    }
  };
}

export async function fetchIsmManufacturingPmiReport(options = {}) {
  const userAgent = Object.hasOwn(options, 'userAgent') ? options.userAgent : ISM_PMI_USER_AGENT;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : ISM_PMI_FETCH_TIMEOUT_MS;
  const parsedAt = new Date().toISOString();

  const landing = await fetchIsmText(ISM_PMI_LANDING_URL, {
    userAgent,
    timeoutMs,
    label: 'ism-pmi-landing'
  });
  if (!landing.ok) {
    return {
      status: 'source_unavailable',
      diagnostics: {
        ...landing.diagnostics,
        parseStep: 'landing-fetch',
        parsedAt,
        reportUrl: ISM_PMI_LANDING_URL
      }
    };
  }
  if (/grecaptcha|captcha_form|SSO\/Login\.aspx|ecommerce\.ismworld\.org/iu.test(landing.text) || /SSO\/Login\.aspx|ecommerce\.ismworld\.org/iu.test(landing.finalUrl || '')) {
    return {
      status: 'parse_error',
      diagnostics: {
        httpStatus: landing.httpStatus,
        latencyMs: landing.latencyMs,
        parseStep: 'landing-non-public-content',
        parsedAt,
        reportUrl: landing.finalUrl || ISM_PMI_LANDING_URL,
        snippetSample: trimDiagnosticString(htmlToPlainText(landing.text))
      }
    };
  }

  const link = parseIsmReportLink(landing.text);
  if (!link) {
    return {
      status: 'parse_error',
      diagnostics: {
        httpStatus: landing.httpStatus,
        latencyMs: landing.latencyMs,
        parseStep: 'landing-no-current-link',
        parsedAt,
        reportUrl: ISM_PMI_LANDING_URL,
        snippetSample: trimDiagnosticString(htmlToPlainText(landing.text))
      }
    };
  }

  const reportUrl = new URL(link.href, ISM_PMI_LANDING_URL).toString();
  const report = await fetchIsmText(reportUrl, {
    userAgent,
    timeoutMs,
    label: 'ism-pmi-report'
  });
  if (!report.ok) {
    return {
      status: 'source_unavailable',
      diagnostics: {
        ...report.diagnostics,
        landingHttpStatus: landing.httpStatus,
        parseStep: 'report-fetch',
        parsedAt,
        reportUrl
      }
    };
  }

  const parsed = parseIsmReportHtml(report.text, report.finalUrl || reportUrl, link.reportMonthLabel);
  if (parsed.status !== 'live') {
    return {
      status: parsed.status,
      diagnostics: {
        httpStatus: report.httpStatus,
        landingHttpStatus: landing.httpStatus,
        latencyMs: landing.latencyMs + report.latencyMs,
        parsedAt,
        ...parsed.diagnostics
      }
    };
  }

  return {
    status: 'live',
    latestPmi: parsed.latestPmi,
    pmi3mChange: parsed.pmi3mChange,
    reportUrl: parsed.reportUrl,
    reportMonthLabel: parsed.reportMonthLabel,
    last12Months: parsed.last12Months,
    diagnostics: {
      httpStatus: report.httpStatus,
      landingHttpStatus: landing.httpStatus,
      latencyMs: landing.latencyMs + report.latencyMs,
      parsedAt,
      reportUrl: parsed.reportUrl,
      reportMonthLabel: parsed.reportMonthLabel
    }
  };
}

function classifyFedAssetTrend(pct4w) {
  if (!Number.isFinite(pct4w)) return '未知';
  const md = R.macroDrivers.fedLiquidity;
  if (pct4w <= md.walcl4wRapidContractionAlert) return '快速缩表';
  if (pct4w <= md.walcl4wContractionAlert) return '收缩中';
  if (pct4w >= md.walcl4wExpansionSignal) return '扩张';
  return '平稳';
}

function classifyOnRrpLevel(onRrp, weekChangePct) {
  if (!Number.isFinite(onRrp)) return '未知';
  const md = R.macroDrivers.fedLiquidity;
  if (onRrp < md.onRrpCriticalThreshold) return '告急';
  if (onRrp < md.onRrpTightThreshold) return '收紧';
  if (Number.isFinite(weekChangePct) && weekChangePct <= md.onRrpWeekRapidDropPct) return '快速消耗';
  return '充裕';
}

function classifyRepoSpreadRegime(bgcrSofrSpread) {
  if (!Number.isFinite(bgcrSofrSpread)) return '未知';
  const absBp = Math.abs(bgcrSofrSpread) * 100;
  if (absBp < 5) return '正常';
  if (absBp < 10) return '轻微偏离';
  if (absBp < 25) return '压力';
  return '危机水平';
}

function classifyCurveRegime(t10y2y) {
  if (!Number.isFinite(t10y2y)) return '未知';
  const md = R.macroDrivers.curve;
  if (t10y2y <= md.severeInversionThreshold) return '深度倒挂';
  if (t10y2y <= md.deepInversionThreshold) return '深度倒挂';
  if (t10y2y <= md.mildInversionThreshold) return '轻度倒挂';
  if (t10y2y <= md.inversionThreshold) return '平坦';
  return '正常';
}

function classifyCreditRegime(igOas) {
  if (!Number.isFinite(igOas)) return '未知';
  const md = R.macroDrivers.credit;
  if (igOas >= md.igOasCriticalThreshold) return '扩张';
  if (igOas >= md.igOasStressThreshold) return '偏紧';
  if (igOas >= md.igOasWatchThreshold) return '正常';
  return '偏宽松';
}

function classifySloosRegime(largeFirmsTightening) {
  if (!Number.isFinite(largeFirmsTightening)) return '未知';
  if (largeFirmsTightening >= 40) return '显著收紧';
  if (largeFirmsTightening >= 15) return '温和收紧';
  if (largeFirmsTightening >= -15) return '中性';
  return '放松';
}

function classifyNfciRegime(nfci) {
  if (!Number.isFinite(nfci)) return '未知';
  if (nfci >= 0.5) return '显著收紧';
  if (nfci >= 0.1) return '温和收紧';
  if (nfci >= -0.1) return '中性';
  if (nfci >= -0.5) return '温和宽松';
  return '显著宽松';
}

function classifyCrackSpreadRegime(crackSpread) {
  if (!Number.isFinite(crackSpread)) return '未知';
  if (crackSpread >= 45) return '供应紧张';
  if (crackSpread >= 25) return '偏高';
  if (crackSpread >= 10) return '正常';
  return '需求疲软';
}

function classifyConsumerRegime(threeMonthChange) {
  if (!Number.isFinite(threeMonthChange)) return '未知';
  if (threeMonthChange <= -8) return '明显走弱';
  if (threeMonthChange <= -4) return '走弱';
  if (threeMonthChange >= 6) return '改善';
  return '稳定';
}

function classifyPmiRegime(pmi) {
  if (!Number.isFinite(pmi)) return '未知';
  if (pmi >= 55) return '扩张';
  if (pmi >= 50) return '中性偏扩张';
  if (pmi >= 45) return '收缩';
  return '深度收缩';
}

function computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange) {
  let pressure = 0;
  if (Number.isFinite(walcl4wChange)) {
    if (walcl4wChange <= -2) pressure += 40;
    else if (walcl4wChange <= -1) pressure += 25;
    else if (walcl4wChange <= -0.3) pressure += 10;
  }
  if (Number.isFinite(onRrp)) {
    const md = R.macroDrivers.fedLiquidity;
    if (onRrp < md.onRrpCriticalThreshold) pressure += 45;
    else if (onRrp < md.onRrpTightThreshold) pressure += 25;
  }
  if (Number.isFinite(onRrpWeekChange) && onRrpWeekChange <= -15) {
    pressure += 15;
  }
  return clamp(pressure);
}

async function resolveFedLiquidity(prevFed) {
  const status = {
    walcl: 'missing',
    onRrp: 'missing',
    effectiveFedFundsRate: 'missing',
    sofr: 'missing',
    reserveBalances: 'missing',
    bgcr: 'missing',
    tgcr: 'missing'
  };
  let walcl = null;
  let walcl4wChange = null;
  let onRrp = null;
  let onRrpWeekChange = null;
  let effectiveFedFundsRate = null;
  let sofr = null;
  let reserveBalances = null;
  let reserveBalances4wChange = null;
  let bgcr = null;
  let tgcr = null;

  try {
    const rows = await fetchFredSeries('WALCL', 90);
    walcl = latestValue(rows);
    const ago = findValueAgo(rows, 28);
    if (Number.isFinite(walcl) && Number.isFinite(ago) && ago !== 0) {
      walcl4wChange = +(((walcl - ago) / ago) * 100).toFixed(3);
    }
    status.walcl = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.walcl)) {
      walcl = prevFed.walcl;
      walcl4wChange = Number.isFinite(prevFed.walcl4wChange) ? prevFed.walcl4wChange : null;
      status.walcl = 'fallback';
    } else {
      status.walcl = 'missing';
    }
  }

  try {
    const rows = await fetchFredSeries('RRPONTSYD', 30);
    onRrp = latestValue(rows);
    const ago = findValueAgo(rows, 7);
    if (Number.isFinite(onRrp) && Number.isFinite(ago) && ago !== 0) {
      onRrpWeekChange = +(((onRrp - ago) / ago) * 100).toFixed(3);
    }
    status.onRrp = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.onRrp)) {
      onRrp = prevFed.onRrp;
      onRrpWeekChange = Number.isFinite(prevFed.onRrpWeekChange) ? prevFed.onRrpWeekChange : null;
      status.onRrp = 'fallback';
    } else {
      status.onRrp = 'missing';
    }
  }

  // M-41: DFF gives direct Effective Federal Funds Rate evidence for the policy driver.
  try {
    const rows = await fetchFredSeries('DFF', 30);
    effectiveFedFundsRate = latestValue(rows);
    status.effectiveFedFundsRate = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.effectiveFedFundsRate)) {
      effectiveFedFundsRate = prevFed.effectiveFedFundsRate;
      status.effectiveFedFundsRate = 'fallback';
    } else {
      status.effectiveFedFundsRate = 'missing';
    }
  }

  // M-41: SOFR gives direct overnight secured funding evidence for fragility review.
  try {
    const rows = await fetchFredSeries('SOFR', 30);
    sofr = latestValue(rows);
    status.sofr = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.sofr)) {
      sofr = prevFed.sofr;
      status.sofr = 'fallback';
    } else {
      status.sofr = 'missing';
    }
  }

  // M-42: WRESBAL gives bank reserve-buffer quantity evidence; same weekly H.4.1 cadence as WALCL.
  try {
    const rows = await fetchFredSeries('WRESBAL', 90);
    reserveBalances = latestValue(rows);
    const ago = findValueAgo(rows, 28);
    if (Number.isFinite(reserveBalances) && Number.isFinite(ago) && ago !== 0) {
      reserveBalances4wChange = +(((reserveBalances - ago) / ago) * 100).toFixed(3);
    }
    status.reserveBalances = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.reserveBalances)) {
      reserveBalances = prevFed.reserveBalances;
      reserveBalances4wChange = Number.isFinite(prevFed.reserveBalances4wChange)
        ? prevFed.reserveBalances4wChange
        : null;
      status.reserveBalances = 'fallback';
    } else {
      status.reserveBalances = 'missing';
    }
  }

  // M-50: BGCR (Broad General Collateral Rate, NY Fed, daily).
  try {
    const rows = await fetchFredSeries('BGCR', 30);
    bgcr = latestValue(rows);
    status.bgcr = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.bgcr)) {
      bgcr = prevFed.bgcr;
      status.bgcr = 'fallback';
    } else {
      status.bgcr = 'missing';
    }
  }

  // M-50: TGCR (Tri-Party General Collateral Rate, NY Fed, daily).
  try {
    const rows = await fetchFredSeries('TGCR', 30);
    tgcr = latestValue(rows);
    status.tgcr = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.tgcr)) {
      tgcr = prevFed.tgcr;
      status.tgcr = 'fallback';
    } else {
      status.tgcr = 'missing';
    }
  }

  const bgcrSofrSpread = Number.isFinite(bgcr) && Number.isFinite(sofr)
    ? +(bgcr - sofr).toFixed(4)
    : null;
  const tgcrSofrSpread = Number.isFinite(tgcr) && Number.isFinite(sofr)
    ? +(tgcr - sofr).toFixed(4)
    : null;

  const regime = classifyFedAssetTrend(walcl4wChange);
  const rrpLevel = classifyOnRrpLevel(onRrp, onRrpWeekChange);
  const pressure = computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange);

  return {
    walcl: Number.isFinite(walcl) ? walcl : null,
    walcl4wChange: Number.isFinite(walcl4wChange) ? walcl4wChange : null,
    onRrp: Number.isFinite(onRrp) ? onRrp : null,
    onRrpWeekChange: Number.isFinite(onRrpWeekChange) ? onRrpWeekChange : null,
    effectiveFedFundsRate: Number.isFinite(effectiveFedFundsRate) ? effectiveFedFundsRate : null,
    sofr: Number.isFinite(sofr) ? sofr : null,
    reserveBalances: Number.isFinite(reserveBalances) ? reserveBalances : null,
    reserveBalances4wChange: Number.isFinite(reserveBalances4wChange) ? reserveBalances4wChange : null,
    bgcr: Number.isFinite(bgcr) ? bgcr : null,
    tgcr: Number.isFinite(tgcr) ? tgcr : null,
    bgcrSofrSpread,
    tgcrSofrSpread,
    repoSpreadRegime: classifyRepoSpreadRegime(bgcrSofrSpread),
    regime,
    onRrpLevel: rrpLevel,
    pressure,
    sourceStatus: status
  };
}

async function resolveCurve(prevCurve) {
  const status = { t10y2y: 'missing' };
  let t10y2y = null;
  let weekChange = null;
  try {
    const rows = await fetchFredSeries('T10Y2Y', 30);
    t10y2y = latestValue(rows);
    const ago = findValueAgo(rows, 7);
    if (Number.isFinite(t10y2y) && Number.isFinite(ago)) {
      weekChange = +(t10y2y - ago).toFixed(3);
    }
    status.t10y2y = 'live';
  } catch (_err) {
    if (Number.isFinite(prevCurve?.t10y2y)) {
      t10y2y = prevCurve.t10y2y;
      weekChange = Number.isFinite(prevCurve.t10y2yWeekChange) ? prevCurve.t10y2yWeekChange : null;
      status.t10y2y = 'fallback';
    }
  }

  const regime = classifyCurveRegime(t10y2y);
  const md = R.macroDrivers.curve;
  const steepeningAlert = Number.isFinite(t10y2y) && Number.isFinite(weekChange)
    && t10y2y < md.inversionThreshold
    && weekChange >= md.steepeningWeekChangeThreshold;

  return {
    t10y2y: Number.isFinite(t10y2y) ? t10y2y : null,
    t10y2yWeekChange: Number.isFinite(weekChange) ? weekChange : null,
    regime,
    steepeningAlert,
    sourceStatus: status
  };
}

async function resolveCredit(prevCredit, hyOasLive) {
  const status = { igOas: 'missing', sloos: 'missing', nfci: 'missing' };
  let igOas = null;
  let igOas1dChange = null;
  let sloosTighteningLargeFirms = null;
  let sloosTighteningSmallFirms = null;
  let sloosTighteningLargeQoQ = null;
  let sloosTighteningSmallQoQ = null;
  let nfci = null;
  let nfci4wChange = null;
  try {
    const rows = await fetchFredSeries('BAMLC0A0CM', 30);
    igOas = latestValue(rows);
    if (rows.length >= 2) {
      const prev = rows[rows.length - 2].value;
      if (Number.isFinite(igOas) && Number.isFinite(prev)) {
        igOas1dChange = +(igOas - prev).toFixed(3);
      }
    }
    status.igOas = 'live';
  } catch (_err) {
    if (Number.isFinite(prevCredit?.igOas)) {
      igOas = prevCredit.igOas;
      igOas1dChange = Number.isFinite(prevCredit.igOas1dChange) ? prevCredit.igOas1dChange : null;
      status.igOas = 'fallback';
    }
  }

  // M-46: Series 2 — DRTSCILM (SLOOS Large/Medium C&I tightening, quarterly, net %)
  // Uses 180-day lookback because SLOOS is quarterly (need to capture latest + previous quarter).
  try {
    const rows = await fetchFredSeries('DRTSCILM', 180);
    sloosTighteningLargeFirms = latestValue(rows);
    const ago = findValueAgo(rows, 90);
    if (Number.isFinite(sloosTighteningLargeFirms) && Number.isFinite(ago)) {
      sloosTighteningLargeQoQ = +(sloosTighteningLargeFirms - ago).toFixed(1);
    }
    status.sloos = 'live';
  } catch (_err) {
    if (Number.isFinite(prevCredit?.sloosTighteningLargeFirms)) {
      sloosTighteningLargeFirms = prevCredit.sloosTighteningLargeFirms;
      sloosTighteningLargeQoQ = Number.isFinite(prevCredit.sloosTighteningLargeQoQ)
        ? prevCredit.sloosTighteningLargeQoQ
        : null;
      status.sloos = 'fallback';
    } else {
      status.sloos = 'missing';
    }
  }

  // M-46: Series 3 — DRTSCIS (SLOOS Small Firms C&I tightening, quarterly, net %)
  // Same SLOOS survey, separate series. If first fetch succeeded, this should too.
  try {
    const rows = await fetchFredSeries('DRTSCIS', 180);
    sloosTighteningSmallFirms = latestValue(rows);
    const ago = findValueAgo(rows, 90);
    if (Number.isFinite(sloosTighteningSmallFirms) && Number.isFinite(ago)) {
      sloosTighteningSmallQoQ = +(sloosTighteningSmallFirms - ago).toFixed(1);
    }
  } catch (_err) {
    if (Number.isFinite(prevCredit?.sloosTighteningSmallFirms)) {
      sloosTighteningSmallFirms = prevCredit.sloosTighteningSmallFirms;
      sloosTighteningSmallQoQ = Number.isFinite(prevCredit.sloosTighteningSmallQoQ)
        ? prevCredit.sloosTighteningSmallQoQ
        : null;
    }
  }

  // M-48: NFCI (Chicago Fed National Financial Conditions Index, weekly).
  // 60-day lookback covers ~8 weeks for 4-week change calculation.
  try {
    const rows = await fetchFredSeries('NFCI', 60);
    nfci = latestValue(rows);
    const ago = findValueAgo(rows, 28);
    if (Number.isFinite(nfci) && Number.isFinite(ago)) {
      nfci4wChange = +(nfci - ago).toFixed(3);
    }
    status.nfci = 'live';
  } catch (_err) {
    if (Number.isFinite(prevCredit?.nfci)) {
      nfci = prevCredit.nfci;
      nfci4wChange = Number.isFinite(prevCredit.nfci4wChange) ? prevCredit.nfci4wChange : null;
      status.nfci = 'fallback';
    } else {
      status.nfci = 'missing';
    }
  }

  const regime = classifyCreditRegime(igOas);
  const igHyRatio = Number.isFinite(igOas) && Number.isFinite(hyOasLive) && hyOasLive !== 0
    ? +(igOas / hyOasLive).toFixed(3)
    : null;

  return {
    igOas: Number.isFinite(igOas) ? igOas : null,
    igOas1dChange: Number.isFinite(igOas1dChange) ? igOas1dChange : null,
    igHyRatio,
    regime,
    sloosTighteningLargeFirms: Number.isFinite(sloosTighteningLargeFirms) ? sloosTighteningLargeFirms : null,
    sloosTighteningSmallFirms: Number.isFinite(sloosTighteningSmallFirms) ? sloosTighteningSmallFirms : null,
    sloosTighteningLargeQoQ: Number.isFinite(sloosTighteningLargeQoQ) ? sloosTighteningLargeQoQ : null,
    sloosTighteningSmallQoQ: Number.isFinite(sloosTighteningSmallQoQ) ? sloosTighteningSmallQoQ : null,
    sloosRegime: classifySloosRegime(sloosTighteningLargeFirms),
    nfci: Number.isFinite(nfci) ? nfci : null,
    nfci4wChange: Number.isFinite(nfci4wChange) ? nfci4wChange : null,
    nfciRegime: classifyNfciRegime(nfci),
    sourceStatus: status
  };
}

// M-49: NY Harbor ULSD Spot Price (FRED:DHOILNYH, daily, $/gallon)
// Used to compute diesel crack spread = DHOILNYH x 42 - Brent ($/barrel).
async function resolveUlsd(prevBrentPricingLayer) {
  let ulsdPrice = null;
  let ulsd4wChange = null;
  let status = 'missing';

  try {
    // 60-day lookback covers about 43 trading days for 4-week change calculation.
    const rows = await fetchFredSeries('DHOILNYH', 60);
    ulsdPrice = latestValue(rows);
    const ago = findValueAgo(rows, 28);
    if (Number.isFinite(ulsdPrice) && Number.isFinite(ago)) {
      ulsd4wChange = +(ulsdPrice - ago).toFixed(3);
    }
    status = 'live';
  } catch (_err) {
    if (Number.isFinite(prevBrentPricingLayer?.ulsdPrice)) {
      ulsdPrice = prevBrentPricingLayer.ulsdPrice;
      ulsd4wChange = Number.isFinite(prevBrentPricingLayer?.ulsd4wChange)
        ? prevBrentPricingLayer.ulsd4wChange
        : null;
      status = 'fallback';
    }
  }

  return {
    ulsdPrice: Number.isFinite(ulsdPrice) ? ulsdPrice : null,
    ulsd4wChange: Number.isFinite(ulsd4wChange) ? ulsd4wChange : null,
    sourceStatus: status
  };
}

function buildMissingConsumer() {
  return {
    umichSentiment: null,
    previousValue: null,
    threeMonthChange: null,
    sixMonthChange: null,
    regime: '未知',
    ismManufacturingPmi: null,
    ismManufacturingPmi3mChange: null,
    ismPmiRegime: '未知',
    sourceStatus: {
      umichSentiment: 'missing',
      pmi: 'source_unavailable'
    },
    diagnostics: {
      pmi: {
        errorReason: 'consumer-sentiment-fetch-failed-before-pmi',
        parsedAt: isoNow
      }
    },
    updatedAt: null,
    source: 'FRED:UMCSENT; ISM:ManufacturingPMI',
    notes: ['UMCSENT 为 FRED 月频；ISM Manufacturing PMI 直接解析 ismworld.org 公开报告页，audit-only。']
  };
}

function normalizePreviousConsumer(prevConsumer) {
  if (!prevConsumer || typeof prevConsumer !== 'object') return buildMissingConsumer();
  const threeMonthChange = Number.isFinite(prevConsumer.threeMonthChange) ? prevConsumer.threeMonthChange : null;
  const hasPreviousPmi = Number.isFinite(prevConsumer.ismManufacturingPmi);
  return {
    umichSentiment: Number.isFinite(prevConsumer.umichSentiment) ? prevConsumer.umichSentiment : null,
    previousValue: Number.isFinite(prevConsumer.previousValue) ? prevConsumer.previousValue : null,
    threeMonthChange,
    sixMonthChange: Number.isFinite(prevConsumer.sixMonthChange) ? prevConsumer.sixMonthChange : null,
    regime: typeof prevConsumer.regime === 'string' && prevConsumer.regime.trim() ? prevConsumer.regime : classifyConsumerRegime(threeMonthChange),
    ismManufacturingPmi: hasPreviousPmi ? prevConsumer.ismManufacturingPmi : null,
    ismManufacturingPmi3mChange: hasPreviousPmi && Number.isFinite(prevConsumer.ismManufacturingPmi3mChange) ? prevConsumer.ismManufacturingPmi3mChange : null,
    ismPmiRegime: typeof prevConsumer.ismPmiRegime === 'string' && prevConsumer.ismPmiRegime.trim() ? prevConsumer.ismPmiRegime : '未知',
    sourceStatus: {
      umichSentiment: 'fallback',
      pmi: hasPreviousPmi ? 'fallback' : 'source_unavailable'
    },
    diagnostics: {
      ...(prevConsumer.diagnostics && typeof prevConsumer.diagnostics === 'object' ? prevConsumer.diagnostics : {}),
      pmi: prevConsumer.diagnostics?.pmi && typeof prevConsumer.diagnostics.pmi === 'object'
        ? prevConsumer.diagnostics.pmi
        : {
            errorReason: hasPreviousPmi ? 'previous-pmi-value-carried-forward' : 'consumer-sentiment-fallback-without-previous-pmi',
            parsedAt: isoNow
          }
    },
    updatedAt: typeof prevConsumer.updatedAt === 'string' ? prevConsumer.updatedAt : null,
    source: 'FRED:UMCSENT; ISM:ManufacturingPMI',
    notes: ['UMCSENT 为 FRED 月频；ISM Manufacturing PMI 直接解析 ismworld.org 公开报告页，audit-only。']
  };
}

async function resolveConsumerSentiment(prevConsumer) {
  try {
    const rows = await fetchFredSeries('UMCSENT', 420);
    const latest = rows[rows.length - 1] || null;
    const previous = rows.length >= 2 ? rows[rows.length - 2].value : null;
    const current = latest?.value;
    const threeMonthAgo = findValueAgo(rows, 90);
    const sixMonthAgo = findValueAgo(rows, 180);
    const threeMonthChange = Number.isFinite(current) && Number.isFinite(threeMonthAgo)
      ? +(current - threeMonthAgo).toFixed(3)
      : null;
    const sixMonthChange = Number.isFinite(current) && Number.isFinite(sixMonthAgo)
      ? +(current - sixMonthAgo).toFixed(3)
      : null;
    let ismManufacturingPmi = null;
    let ismManufacturingPmi3mChange = null;
    let pmiStatus = 'source_unavailable';
    const pmiResult = await fetchIsmManufacturingPmiReport();

    // M-67: true ISM Manufacturing PMI, parsed from the public ISM report page.
    if (pmiResult.status === 'live') {
      ismManufacturingPmi = Number.isFinite(pmiResult.latestPmi) ? pmiResult.latestPmi : null;
      ismManufacturingPmi3mChange = Number.isFinite(pmiResult.pmi3mChange)
        ? pmiResult.pmi3mChange
        : null;
      pmiStatus = 'live';
    } else {
      if (Number.isFinite(prevConsumer?.ismManufacturingPmi)) {
        ismManufacturingPmi = prevConsumer.ismManufacturingPmi;
        ismManufacturingPmi3mChange = Number.isFinite(prevConsumer.ismManufacturingPmi3mChange)
          ? prevConsumer.ismManufacturingPmi3mChange
          : null;
        pmiStatus = 'fallback';
      } else {
        pmiStatus = pmiResult.status;
      }
    }

    return {
      umichSentiment: Number.isFinite(current) ? current : null,
      previousValue: Number.isFinite(previous) ? previous : null,
      threeMonthChange,
      sixMonthChange,
      regime: classifyConsumerRegime(threeMonthChange),
      ismManufacturingPmi,
      ismManufacturingPmi3mChange,
      ismPmiRegime: classifyPmiRegime(ismManufacturingPmi),
      sourceStatus: {
        umichSentiment: 'live',
        pmi: pmiStatus
      },
      diagnostics: {
        ...(prevConsumer?.diagnostics && typeof prevConsumer.diagnostics === 'object' ? prevConsumer.diagnostics : {}),
        pmi: pmiResult.diagnostics || {
          parsedAt: isoNow,
          errorReason: 'ism-pmi-diagnostics-unavailable'
        }
      },
      updatedAt: latest?.date ? `${latest.date}T00:00:00Z` : null,
      source: 'FRED:UMCSENT; ISM:ManufacturingPMI',
      notes: ['UMCSENT 为 FRED 月频；ISM Manufacturing PMI 直接解析 ismworld.org 公开报告页，audit-only。']
    };
  } catch (_err) {
    const fallback = normalizePreviousConsumer(prevConsumer);
    return Number.isFinite(fallback.umichSentiment) ? fallback : buildMissingConsumer();
  }
}

async function fetchMacroDrivers(prev, hyOasLive) {
  const prevMd = prev?.macroDrivers || {};
  const results = await Promise.allSettled([
    resolveFedLiquidity(prevMd.fedLiquidity),
    resolveCurve(prevMd.curve),
    resolveCredit(prevMd.credit, hyOasLive),
    resolveConsumerSentiment(prevMd.consumer)
  ]);

  const fedLiquidity = results[0].status === 'fulfilled' ? results[0].value : {
    walcl: null, walcl4wChange: null, onRrp: null, onRrpWeekChange: null,
    effectiveFedFundsRate: null, sofr: null, reserveBalances: null, reserveBalances4wChange: null,
    regime: '未知', onRrpLevel: '未知', pressure: 0,
    sourceStatus: { walcl: 'missing', onRrp: 'missing', effectiveFedFundsRate: 'missing', sofr: 'missing', reserveBalances: 'missing' }
  };
  const curve = results[1].status === 'fulfilled' ? results[1].value : {
    t10y2y: null, t10y2yWeekChange: null, regime: '未知', steepeningAlert: false,
    sourceStatus: { t10y2y: 'missing' }
  };
  const credit = results[2].status === 'fulfilled' ? results[2].value : {
    igOas: null, igOas1dChange: null, igHyRatio: null, regime: '未知',
    sloosTighteningLargeFirms: null,
    sloosTighteningSmallFirms: null,
    sloosTighteningLargeQoQ: null,
    sloosTighteningSmallQoQ: null,
    sloosRegime: '未知',
    nfci: null,
    nfci4wChange: null,
    nfciRegime: '未知',
    sourceStatus: { igOas: 'missing', sloos: 'missing', nfci: 'missing' }
  };
  const consumer = results[3].status === 'fulfilled' ? results[3].value : buildMissingConsumer();

  return { fedLiquidity, curve, credit, consumer };
}

// 判断结构信号数据源是否"全不可用"
function isAllStructuralSourcesMissing(macroDrivers) {
  const fed = macroDrivers?.fedLiquidity?.sourceStatus || {};
  const curve = macroDrivers?.curve?.sourceStatus || {};
  const credit = macroDrivers?.credit?.sourceStatus || {};
  return fed.walcl === 'missing'
    && fed.onRrp === 'missing'
    && curve.t10y2y === 'missing'
    && credit.igOas === 'missing';
}

function activeStructuralSignals(macroDrivers) {
  const active = [];
  const fed = macroDrivers?.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = macroDrivers?.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = macroDrivers?.credit || {};
  const creditStatus = credit.sourceStatus || {};
  const cfg = R.macroDrivers;

  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing'
      && curve.t10y2y <= cfg.curve.deepInversionThreshold) {
    active.push({
      key: 'curveDeepInversion',
      label: '曲线深度倒挂',
      detail: `10年-2年利差 ${curve.t10y2y.toFixed(2)}`,
      reliability: curveStatus.t10y2y
    });
  }
  if (Number.isFinite(curve.t10y2y) && curve.steepeningAlert && curveStatus.t10y2y !== 'missing') {
    active.push({
      key: 'curveRapidSteepening',
      label: '曲线快速陡峭化',
      detail: `周变化 ${curve.t10y2yWeekChange?.toFixed?.(2) ?? '--'}`,
      reliability: curveStatus.t10y2y
    });
  }
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing'
      && fed.onRrp < cfg.fedLiquidity.onRrpCriticalThreshold) {
    active.push({
      key: 'onRrpCritical',
      label: '逆回购准备金告急',
      detail: `ON RRP ${formatOnRrpYiUsd(fed.onRrp)}`,
      reliability: fedStatus.onRrp
    });
  }
  if (Number.isFinite(fed.walcl4wChange) && fedStatus.walcl !== 'missing'
      && fed.walcl4wChange <= cfg.fedLiquidity.walcl4wRapidContractionAlert) {
    active.push({
      key: 'fedRapidContraction',
      label: '美联储快速缩表',
      detail: `4周变化 ${fed.walcl4wChange.toFixed(2)}%`,
      reliability: fedStatus.walcl
    });
  }
  if (Number.isFinite(credit.igOas) && creditStatus.igOas !== 'missing'
      && credit.igOas >= cfg.credit.igOasStressThreshold) {
    active.push({
      key: 'igOasStress',
      label: '投资级信用利差扩张',
      detail: `IG OAS ${credit.igOas.toFixed(2)}%`,
      reliability: creditStatus.igOas
    });
  }
  return active;
}

function structuralScoreBump(activeSignals) {
  const gating = R.structuralGating || {};
  let bump = 0;
  for (const sig of activeSignals) {
    const add = gating[sig.key];
    if (Number.isFinite(add)) bump += add;
  }
  return bump;
}

function structuralBandShift(activeSignals) {
  const shifts = R.positionGuidanceShifts || {};
  let total = 0;
  for (const sig of activeSignals) {
    const v = shifts[sig.key];
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

function deriveRisk(rt, macroDrivers) {
  const v = rt.values || {};
  const brent = v.brent ?? R.defaults.brent;
  const dxy = v.dxy ?? R.defaults.dxy;
  const vix = v.vix ?? R.defaults.vix;
  const hy = v.hyOas ?? R.defaults.hyOas;
  const us10y = v.us10y ?? R.defaults.us10y;
  const real10y = v.real10y ?? R.defaults.real10y;
  const breakeven = v.breakeven10y ?? 2.3;
  const spx = v.spx ?? 5100;
  const gold = v.gold ?? 2350;

  const rb = R.riskBaselines;
  const oilRisk = clamp((brent - rb.brentBase) * rb.brentScale);
  const dollarRisk = clamp((dxy - rb.dxyBase) * rb.dxyScale);
  const hyRisk = clamp((hy - rb.hyBase) * rb.hyScale);
  const vixRisk = clamp((vix - rb.vixBase) * rb.vixScale);
  const rateRisk = clamp((us10y - rb.us10yBase) * rb.us10yScale);
  const realRisk = clamp((real10y - rb.real10yBase) * rb.real10yScale);
  const inflationRisk = clamp((breakeven - rb.breakevenBase) * rb.breakevenScale + oilRisk * rb.oilInflationWeight);
  const spxRisk = clamp((5300 - spx) / 6);

  const baseLiquidity = clamp((dollarRisk * 0.35) + (hyRisk * 0.35) + (vixRisk * 0.18) + (rateRisk * 0.12));
  const baseDebt = clamp((realRisk * 0.45) + (rateRisk * 0.3) + (hyRisk * 0.25));
  const baseBanking = clamp((hyRisk * 0.55) + (vixRisk * 0.2) + (dollarRisk * 0.25));

  const fed = macroDrivers?.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = macroDrivers?.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = macroDrivers?.credit || {};
  const creditStatus = credit.sourceStatus || {};

  let fedAssetRisk = null;
  if (Number.isFinite(fed.walcl4wChange) && fedStatus.walcl !== 'missing') {
    fedAssetRisk = clamp((-fed.walcl4wChange) * 18);
  }
  let onRrpRisk = null;
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing') {
    const cfg = R.macroDrivers.fedLiquidity;
    if (fed.onRrp < cfg.onRrpCriticalThreshold) onRrpRisk = 85;
    else if (fed.onRrp < cfg.onRrpTightThreshold) onRrpRisk = 55;
    else if (Number.isFinite(fed.onRrpWeekChange) && fed.onRrpWeekChange <= cfg.onRrpWeekRapidDropPct) onRrpRisk = 45;
    else onRrpRisk = 15;
  }

  let curveInversionRisk = null;
  let curveSteepeningRisk = null;
  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing') {
    if (curve.t10y2y < 0) curveInversionRisk = clamp(Math.abs(curve.t10y2y) * 80);
    else curveInversionRisk = 10;
    curveSteepeningRisk = curve.steepeningAlert ? 80 : clamp(Number.isFinite(curve.t10y2yWeekChange) ? curve.t10y2yWeekChange * 30 : 0);
  }

  let igOasRisk = null;
  let nimPressureRisk = null;
  let reservePressure = null;
  if (Number.isFinite(credit.igOas) && creditStatus.igOas !== 'missing') {
    const cfg = R.macroDrivers.credit;
    if (credit.igOas >= cfg.igOasCriticalThreshold) igOasRisk = 90;
    else if (credit.igOas >= cfg.igOasStressThreshold) igOasRisk = 70;
    else if (credit.igOas >= cfg.igOasWatchThreshold) igOasRisk = 45;
    else igOasRisk = 20;
  }
  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing') {
    nimPressureRisk = curve.t10y2y < -0.5 ? 75 : curve.t10y2y < 0 ? 50 : 20;
  }
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing') {
    const cfg = R.macroDrivers.fedLiquidity;
    reservePressure = fed.onRrp < cfg.onRrpCriticalThreshold ? 85
      : fed.onRrp < cfg.onRrpTightThreshold ? 50
      : 15;
  }

  const sw = R.moduleSubWeights;
  const weightedAvg = (entries) => {
    let wSum = 0;
    let vSum = 0;
    for (const [val, w] of entries) {
      if (Number.isFinite(val) && Number.isFinite(w)) {
        vSum += val * w;
        wSum += w;
      }
    }
    return wSum > 0 ? vSum / wSum : null;
  };

  const newLiquidity = clamp(
    weightedAvg([
      [baseLiquidity, sw.liquidity.baseWeight],
      [fedAssetRisk, sw.liquidity.fedAssetWeight],
      [onRrpRisk, sw.liquidity.onRrpWeight]
    ]) ?? baseLiquidity
  );
  const newDebt = clamp(
    weightedAvg([
      [baseDebt, sw.debt.baseWeight],
      [curveInversionRisk, sw.debt.curveInversionWeight],
      [curveSteepeningRisk, sw.debt.curveSteepeningWeight]
    ]) ?? baseDebt
  );
  const newBanking = clamp(
    weightedAvg([
      [baseBanking, sw.banking.baseWeight],
      [igOasRisk, sw.banking.igOasWeight],
      [nimPressureRisk, sw.banking.nimPressureWeight],
      [reservePressure, sw.banking.reservePressureWeight]
    ]) ?? baseBanking
  );

  const modules = {
    geopolitical: clamp((oilRisk * 0.72) + (vixRisk * 0.28)),
    energy: clamp((oilRisk * 0.82) + Math.max(0, rt.changes?.brent1d || 0) * 2),
    inflation: clamp((inflationRisk * 0.72) + (realRisk * 0.08)),
    liquidity: newLiquidity,
    debt: newDebt,
    banking: newBanking
  };
  const mw = R.moduleWeights;
  const score = clamp(
    modules.geopolitical * mw.geopolitical +
    modules.energy * mw.energy +
    modules.inflation * mw.inflation +
    modules.liquidity * mw.liquidity +
    modules.debt * mw.debt +
    modules.banking * mw.banking
  );
  return {
    modules, score,
    oilRisk, dollarRisk, hyRisk, vixRisk, rateRisk, realRisk, inflationRisk, spxRisk,
    brent, dxy, vix, hy, us10y, real10y, breakeven, spx, gold,
    fedAssetRisk, onRrpRisk, curveInversionRisk, curveSteepeningRisk,
    igOasRisk, nimPressureRisk, reservePressure
  };
}

function regimeProb(score, risk) {
  const raw = {
    disinflationaryGrowth: Math.max(1, 120 - risk.inflationRisk - risk.hyRisk),
    liquidityBull: Math.max(1, 115 - risk.dollarRisk - risk.vixRisk),
    stagflationShock: Math.max(1, risk.oilRisk + risk.inflationRisk),
    crisisLiquiditySqueeze: Math.max(1, risk.hyRisk + risk.dollarRisk + risk.vixRisk),
    monetaryDebasement: Math.max(1, risk.inflationRisk + (100 - risk.realRisk)),
    deflationaryBust: Math.max(1, risk.hyRisk + risk.vixRisk + risk.spxRisk)
  };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, clamp(v / sum * 100)]));
  probs.stagflationShock = clamp(100 - (probs.disinflationaryGrowth + probs.liquidityBull + probs.crisisLiquiditySqueeze + probs.monetaryDebasement + probs.deflationaryBust));
  return probs;
}

function regimeLabel(probs) {
  const labels = {
    disinflationaryGrowth: '通胀回落增长',
    liquidityBull: '流动性多头',
    stagflationShock: '滞胀冲击',
    crisisLiquiditySqueeze: '流动性偏紧',
    monetaryDebasement: '货币贬值',
    deflationaryBust: '通缩衰退'
  };
  return labels[Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0]];
}

// v27 结构性门控分层判定（严格分层：红灯需要更苛刻条件）
function evaluateStructuralGating(macroDrivers) {
  const cfg = R.macroDrivers;
  const fed = macroDrivers?.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = macroDrivers?.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = macroDrivers?.credit || {};
  const creditStatus = credit.sourceStatus || {};

  const t10y2y = (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing') ? curve.t10y2y : null;
  const onRrp = (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing') ? fed.onRrp : null;
  const walcl4w = (Number.isFinite(fed.walcl4wChange) && fedStatus.walcl !== 'missing') ? fed.walcl4wChange : null;
  const igOas = (Number.isFinite(credit.igOas) && creditStatus.igOas !== 'missing') ? credit.igOas : null;

  // === 红灯：严格阈值，需要严重双压或单项极端值 ===
  // 红灯触发条件1：曲线严重倒挂（< -0.8）且 IG 告警级以上（>= critical 2.0%）
  const redCurveCreditDouble = (t10y2y !== null && t10y2y <= cfg.curve.severeInversionThreshold)
    && (igOas !== null && igOas >= cfg.credit.igOasCriticalThreshold);
  // 红灯触发条件2：ON RRP 低于 onRrpCriticalThreshold / 2（单项极端，约 500 亿美元）
  const onRrpCatastrophic = onRrp !== null && onRrp < (cfg.fedLiquidity.onRrpCriticalThreshold / 2);
  const structuralRed = redCurveCreditDouble || onRrpCatastrophic;

  // === 黄灯：较宽阈值 ===
  // 黄灯触发条件1：曲线深度倒挂（<= -0.5）且美联储快速缩表（4周 <= -1%）
  const yellowCurveFedDouble = (t10y2y !== null && t10y2y <= cfg.curve.deepInversionThreshold)
    && (walcl4w !== null && walcl4w <= cfg.fedLiquidity.walcl4wContractionAlert);
  // 黄灯触发条件2：IG OAS 进入应力区（>= 1.5%）
  const yellowIgWatch = igOas !== null && igOas >= cfg.credit.igOasWatchThreshold;
  // 黄灯触发条件3：ON RRP 告急（< 1000 亿美元）单项
  const yellowOnRrpCritical = onRrp !== null && onRrp < cfg.fedLiquidity.onRrpCriticalThreshold;
  // 黄灯触发条件4：曲线深度倒挂单项（<= -0.5）
  const yellowCurveDeep = t10y2y !== null && t10y2y <= cfg.curve.deepInversionThreshold;
  const structuralYellow = yellowCurveFedDouble || yellowIgWatch || yellowOnRrpCritical || yellowCurveDeep;

  // 记录触发原因（用于文案）
  const redReasons = [];
  if (redCurveCreditDouble) redReasons.push('曲线严重倒挂且投资级信用告警');
  if (onRrpCatastrophic) redReasons.push('逆回购准备金临界告急');
  const yellowReasons = [];
  if (yellowCurveFedDouble) yellowReasons.push('曲线深度倒挂叠加美联储缩表');
  if (yellowIgWatch) yellowReasons.push('投资级信用利差进入应力区');
  if (yellowOnRrpCritical) yellowReasons.push('逆回购余额告急');
  if (yellowCurveDeep) yellowReasons.push('曲线深度倒挂');

  return {
    structuralRed,
    structuralYellow,
    redReasons,
    yellowReasons
  };
}

function lockEngine(score, risk, rt, gatingResult) {
  const el = R.executionLock;
  const criticalDown = (rt.criticalMissing ?? 0) >= el.red.criticalMissingThreshold || (rt.cacheOnly ?? false);

  const baseRed = criticalDown
    || score >= el.red.scoreThreshold
    || risk.brent >= el.red.brentThreshold
    || risk.hy >= el.red.hyThreshold
    || risk.vix >= el.red.vixThreshold;

  const baseYellow = score >= el.yellow.scoreThreshold
    || risk.brent >= el.yellow.brentThreshold
    || risk.hy >= el.yellow.hyThreshold
    || risk.vix >= el.yellow.vixThreshold;

  const structurallyTriggered = (!baseRed && gatingResult.structuralRed) || (!baseYellow && gatingResult.structuralYellow && !baseRed && !gatingResult.structuralRed);

  if (baseRed || gatingResult.structuralRed) {
    const structDesc = gatingResult.structuralRed && !baseRed
      ? `结构性双压触发红灯（${gatingResult.redReasons.join('、')}）。`
      : '';
    return {
      level: 'red',
      levelLabel: '红灯 / 禁止新增',
      title: '今天禁止主动加仓，只允许减仓与恢复防御层',
      description: `${structDesc}系统检测到高压风险组合，执行引擎已锁定为红灯。任何新增风险仓位均被禁止，只允许减仓、防守和补充现金。`.trim(),
      gross: '38%', cash: '35%', riskBudget: '30%',
      allow: ['允许减仓风险资产。', '允许补充美元/短票与现金。', '允许把黄金对冲恢复到上限。'],
      block: ['禁止新增股票与高波动仓位。', '禁止盘中追涨。', '禁止主观覆盖系统阈值。'],
      mandatory: ['若总仓位高于 42%，必须先减到 38% 附近。', '若高波动资产 > 2%，立即降回 2% 以下。', '若现金缓冲 < 30%，立即补回。'],
      actionText: '执行引擎锁定：禁止新增，只允许减仓与防守恢复。',
      structurallyTriggered: gatingResult.structuralRed && !baseRed
    };
  }
  if (baseYellow || gatingResult.structuralYellow) {
    const structDesc = gatingResult.structuralYellow && !baseYellow
      ? `结构性压力触发黄灯（${gatingResult.yellowReasons.join('、')}）。`
      : '';
    return {
      level: 'yellow',
      levelLabel: '黄灯 / 仅允许微调',
      title: '今天不能主动加风险，只允许对齐目标仓位与防守再平衡',
      description: `${structDesc}风险尚未解除，执行引擎只允许微调。允许围绕目标仓位做再平衡，但禁止新增进攻性仓位。`.trim(),
      gross: '48%', cash: '27%', riskBudget: '40%',
      allow: ['允许把总仓位向 48% 靠拢。', '允许维持能源、美元/短票、黄金对冲层。', '允许保留防御型股票观察仓。'],
      block: ['禁止新增高波动与久期进攻仓位。', '禁止因为单日反弹而加仓。', '禁止无视执行状态灯。'],
      mandatory: ['若总仓位高于 53%，先减仓。', '若高波动资产 > 3%，降回上限以内。', '若现金缓冲 < 25%，恢复到安全区间。'],
      actionText: '执行引擎锁定：只允许微调，不允许扩大风险暴露。',
      structurallyTriggered: gatingResult.structuralYellow && !baseYellow
    };
  }
  return {
    level: 'green',
    levelLabel: '绿灯 / 允许分批进攻',
    title: '今天允许小幅加仓，但必须按纪律分批执行',
    description: '风险组合回到可控区，执行引擎允许提高风险暴露，但必须分批、限额，并保留最低现金缓冲。',
    gross: '58%', cash: '20%', riskBudget: '50%',
    allow: ['允许分三笔内提高总仓位。', '允许增加质量权益和部分成长观察仓。', '允许降低部分美元/短票。'],
    block: ['禁止一次性打满仓位。', '禁止在单日大涨后追高。', '禁止取消防守底仓。'],
    mandatory: ['任何新增仓位都必须分批完成。', '若状态灯重新转黄，次日停止加仓。', '若周回撤超过 -3%，切回黄灯纪律。'],
    actionText: '执行引擎开放：允许分批进攻，但不得破坏现金缓冲与止损纪律。',
    structurallyTriggered: false
  };
}

function targetAllocations(lock) {
  if (lock.level === 'red') {
    return [
      { asset: '美元 / 短票', target: '核心1', weight: '24%', reason: '融资与信用压力阶段的首要防御层。' },
      { asset: '现金', target: '缓冲层', weight: '35%', reason: '执行引擎红灯，现金缓冲必须充足。' },
      { asset: '黄金', target: '对冲', weight: '12%', reason: '用于对冲尾部风险和政策不确定性。' },
      { asset: '原油 / 能源', target: '防守受益', weight: '12%', reason: '油价偏高时继续保留。' },
      { asset: '股票（防御）', target: '观察仓', weight: '5%', reason: '仅保留最低防御仓。' }
    ];
  }
  if (lock.level === 'yellow') {
    return [
      { asset: '原油 / 能源', target: '核心1', weight: '20%', reason: '主链条仍偏向能源与通胀输入。' },
      { asset: '美元 / 短票', target: '核心2', weight: '18%', reason: '流动性偏紧阶段的稳定防御层。' },
      { asset: '黄金', target: '对冲', weight: '10%', reason: '对冲政策与通胀不确定性。' },
      { asset: '股票（防御板块）', target: '观察仓', weight: '8%', reason: '只保留低波动、现金流型权益。' },
      { asset: '高波动资产', target: '限制仓', weight: '0%-3%', reason: '不允许成为进攻主仓。' }
    ];
  }
  return [
    { asset: '股票（质量+防御）', target: '核心1', weight: '24%', reason: '风险回到可控区后恢复权益暴露。' },
    { asset: '原油 / 能源', target: '核心2', weight: '16%', reason: '保留主链条防守属性。' },
    { asset: '黄金', target: '对冲', weight: '8%', reason: '保留尾部对冲。' },
    { asset: '美元 / 短票', target: '缓冲层', weight: '12%', reason: '保留机动空间。' }
  ];
}

function getTransmissionNodeKey(node) {
  return node?.id || node?.key || node?.label || null;
}

function buildTransmissionSnapshot(chain) {
  const nodes = Array.isArray(chain?.nodes) ? chain.nodes : [];
  return {
    nodes: nodes.map((node) => ({
      key: getTransmissionNodeKey(node),
      label: node?.label || getTransmissionNodeKey(node),
      score: Number.isFinite(node?.score) ? node.score : null
    })).filter((node) => node.key)
  };
}

function getTransmissionSnapshotNodes(entry) {
  if (Array.isArray(entry?.transmissionSnapshot?.nodes)) return entry.transmissionSnapshot.nodes;
  if (Array.isArray(entry?.transmissionChain?.nodes)) return entry.transmissionChain.nodes;
  return null;
}

function findLatestTransmissionSnapshotNodes(historyEntries) {
  if (!Array.isArray(historyEntries)) return null;
  for (let i = historyEntries.length - 1; i >= 0; i -= 1) {
    const nodes = getTransmissionSnapshotNodes(historyEntries[i]);
    if (nodes) return nodes;
  }
  return null;
}

function resolvePreviousTransmissionSource(previousData, previousHistoryFull, previousHistory) {
  if (Array.isArray(previousData?.transmissionChain?.nodes)) {
    return { source: 'previous-radar-data', nodes: previousData.transmissionChain.nodes };
  }
  const fullNodes = findLatestTransmissionSnapshotNodes(previousHistoryFull);
  if (fullNodes) return { source: 'radar-history-full', nodes: fullNodes };
  const historyNodes = findLatestTransmissionSnapshotNodes(previousHistory);
  if (historyNodes) return { source: 'radar-history', nodes: historyNodes };
  return { source: 'none', nodes: [] };
}

function indexTransmissionScores(nodes) {
  const scores = new Map();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const key = getTransmissionNodeKey(node);
    const score = Number(node?.score);
    if (key && Number.isFinite(score)) scores.set(key, score);
  }
  return scores;
}

function applyTransmissionDeltas(chain, previousSource) {
  const currentChain = chain && typeof chain === 'object' ? chain : {};
  const nodes = Array.isArray(currentChain.nodes) ? currentChain.nodes : [];
  const previousScores = indexTransmissionScores(previousSource.nodes);
  let matchedNodes = 0;
  const nextNodes = nodes.map((node) => {
    const key = getTransmissionNodeKey(node);
    const currentScore = Number(node?.score);
    const previousScore = key ? previousScores.get(key) : undefined;
    const hasDelta = Number.isFinite(currentScore) && Number.isFinite(previousScore);
    if (hasDelta) matchedNodes += 1;
    return {
      ...node,
      delta: hasDelta ? Math.round(currentScore - previousScore) : null
    };
  });
  return {
    chain: { ...currentChain, nodes: nextNodes },
    meta: {
      source: previousSource.source,
      matchedNodes,
      totalNodes: nodes.length
    }
  };
}

function appendHistory(prev, score, transmissionSnapshot = null) {
  const today = isoNow.slice(0, 10);
  const history = Array.isArray(prev) ? [...prev] : [];
  if (history.length && history[history.length - 1].date === today) {
    history[history.length - 1].score = score;
    if (transmissionSnapshot) history[history.length - 1].transmissionSnapshot = transmissionSnapshot;
  } else {
    history.push({
      date: today,
      score,
      ...(transmissionSnapshot ? { transmissionSnapshot } : {})
    });
  }
  return history.slice(-90);
}

function appendHistoryFull(prevFull, risk, lock, macro, macroDrivers, transmissionSnapshot = null) {
  const today = isoNow.slice(0, 10);
  const full = Array.isArray(prevFull) ? [...prevFull] : [];
  const entry = {
    date: today,
    score: risk.score,
    lock: lock.level,
    modules: { ...risk.modules },
    macro,
    brent: risk.brent,
    vix: risk.vix,
    dxy: risk.dxy,
    hyOas: risk.hy,
    us10y: risk.us10y,
    real10y: risk.real10y,
    t10y2y: macroDrivers?.curve?.t10y2y ?? null,
    igOas: macroDrivers?.credit?.igOas ?? null,
    walcl: macroDrivers?.fedLiquidity?.walcl ?? null,
    onRrp: macroDrivers?.fedLiquidity?.onRrp ?? null,
    ...(transmissionSnapshot ? { transmissionSnapshot } : {})
  };
  if (full.length && full[full.length - 1].date === today) {
    full[full.length - 1] = entry;
  } else {
    full.push(entry);
  }
  return full;
}

function buildFallback() {
  const next = structuredClone(prevData);
  next.version = 'v27.0';
  next.updatedAt = isoNow;
  next.decisionLine = '实时快变量暂不可用，系统沿用上次有效慢变量结构，但保留今日更新时间戳。';
  next.summary = 'v27.0 日构建已退回到上次有效慢变量结构。';
  const prevInputs = (prevData && typeof prevData.displayInputsBaseline === 'object' && prevData.displayInputsBaseline)
    ? prevData.displayInputsBaseline
    : null;
  const normFinite = (value) => (Number.isFinite(value) ? value : null);
  next.displayInputsBaseline = {
    brent: normFinite(prevInputs?.brent),
    dxy: normFinite(prevInputs?.dxy),
    vix: normFinite(prevInputs?.vix),
    hyOas: normFinite(prevInputs?.hyOas),
    us10y: normFinite(prevInputs?.us10y),
    real10y: normFinite(prevInputs?.real10y),
    breakeven10y: normFinite(prevInputs?.breakeven10y),
    gold: normFinite(prevInputs?.gold),
    spx: normFinite(prevInputs?.spx)
  };
  next.recovery = {
    degradedMode: true,
    safeOutput: true,
    lastRun: isoNow,
    notes: ['日构建未拿到可用实时快照，已回退到上次有效结果。']
  };
  next.dailyRealtimeInput = buildDailyRealtimeInput(realtime);
  next.dailyBrief = prevData.dailyBrief && typeof prevData.dailyBrief === 'object'
    ? { ...prevData.dailyBrief, generatedAt: isoNow }
    : buildUnavailableDailyBrief();
  next.aiInterpretationLayer = prevData.aiInterpretationLayer && typeof prevData.aiInterpretationLayer === 'object'
    ? { ...prevData.aiInterpretationLayer, generatedAt: isoNow }
    : buildAiInterpretationLayer(next);
  preserveExternalAiInterpretationLayer(next);
  return { data: next, history: prevHistory, historyFull: prevHistoryFull };
}

async function build() {
  if (!canUseRealtimePayloadValues(realtime)) return buildFallback();

  const sourceModeLabel = SOURCE_MODE_CN[realtime.sourceMode] || realtime.sourceMode || '--';

  const hyOasLive = Number(realtime.values?.hyOas);
  const macroDrivers = await fetchMacroDrivers(prevData, Number.isFinite(hyOasLive) ? hyOasLive : null);
  const allMacroMissing = isAllStructuralSourcesMissing(macroDrivers);
  const activeSignals = activeStructuralSignals(macroDrivers);
  const gatingResult = evaluateStructuralGating(macroDrivers);

  const risk = deriveRisk(realtime, macroDrivers);
  const previousTransmissionSource = resolvePreviousTransmissionSource(prevData, prevHistoryFull, prevHistory);
  const transmissionDeltaResult = applyTransmissionDeltas(prevData.transmissionChain || {}, previousTransmissionSource);
  const transmissionSnapshot = buildTransmissionSnapshot(transmissionDeltaResult.chain);
  const history = appendHistory(prevHistory, risk.score, transmissionSnapshot);
  const scoreChange1d = history.length >= 2 ? risk.score - history[history.length - 2].score : 0;
  const scoreChange7d = history.length >= 8 ? risk.score - history[history.length - 8].score : 0;
  const scoreChange30d = history.length >= 30 ? risk.score - history[Math.max(0, history.length - 30)].score : scoreChange7d;
  const avg30d = clamp(avg(history.slice(-30).map(x => x.score)));
  const peak30d = Math.max(...history.slice(-30).map(x => x.score));
  const trough30d = Math.min(...history.slice(-30).map(x => x.score));
  const probs = regimeProb(risk.score, risk);
  const macro = regimeLabel(probs);
  const phase = risk.modules.liquidity >= 70 ? '流动性偏紧' : risk.modules.energy >= 75 ? '通胀冲击' : '风险缓和';
  const lock = lockEngine(risk.score, risk, realtime, gatingResult);
  const allocs = targetAllocations(lock);

  const topRisks = [
    `布伦特 ${risk.brent.toFixed(1)} 美元，能源链条仍在传导。`,
    `广义美元指数 ${risk.dxy.toFixed(2)}，融资环境尚未明显放松。`,
    `高收益利差 ${risk.hy.toFixed(2)}%，信用风险${risk.hy >= 4 ? '偏紧' : '可控但需观察'}。`,
    `10年期美债 ${risk.us10y.toFixed(2)}%，实际利率 ${risk.real10y.toFixed(2)}%。`
  ];

  const sortedModules = Object.entries(risk.modules).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const signalDesc = allMacroMissing
    ? '结构信号数据源当前全部不可用，结构门控已降级。'
    : (activeSignals.length
      ? `结构信号激活：${activeSignals.map(s => `${s.label}（${s.detail}）`).join('；')}。`
      : '无结构信号激活。');

  const reliabilityNote = activeSignals.some(s => s.reliability === 'fallback')
    ? '（部分结构信号基于回退数据）'
    : '';

  const stateReasonCN = `${lock.levelLabel}，风险分数 ${risk.score}。${signalDesc}${reliabilityNote} 主导模块：${sortedModules.map(([k]) => MODULE_LABELS_CN[k]).join('、')}。`;

  const structuralShift = structuralBandShift(activeSignals);
  const guidanceSuffix = activeSignals.length
    ? ` 结构性约束：${activeSignals.map(s => s.label).join('、')}，仓位需额外保守。`
    : '';

  const cashGuidanceText = `目标现金缓冲：${lock.cash}。${guidanceSuffix}`.trim();
  const newExposurePolicyText = (lock.level === 'green'
    ? '允许分批提高风险暴露，单日净加仓不超过总资产 5%。'
    : lock.level === 'yellow'
      ? '仅允许微调，禁止新增进攻性仓位。'
      : '禁止新增，只允许减仓与防守。') + guidanceSuffix;

  const baseBandByLock = lock.level === 'red' ? { lo: 20, hi: 40 } : lock.level === 'yellow' ? { lo: 38, hi: 53 } : { lo: 55, hi: 70 };
  const shiftedLo = clampRange(Math.round(baseBandByLock.lo + structuralShift / 2), 0, 90);
  const shiftedHi = clampRange(Math.round(baseBandByLock.hi + structuralShift / 2), 10, 100);
  const totalExposureBandCN = `${shiftedLo}%-${shiftedHi}%`;

  // v27: recovery.notes 构建 —— 若结构信号数据源全不可用则追加中文降级说明
  const recoveryNotes = realtime.notes && realtime.notes.length
    ? [...realtime.notes]
    : ['v27.0 慢变量已由最新实时快照与结构性数据重算。'];
  if (allMacroMissing) {
    recoveryNotes.push('结构信号数据源当前全部不可用，v27 结构门控已降级。');
  }

  const toFiniteOrNull = (value) => (Number.isFinite(value) ? value : null);
  const displayInputsBaseline = {
    brent: toFiniteOrNull(risk.brent),
    dxy: toFiniteOrNull(risk.dxy),
    vix: toFiniteOrNull(risk.vix),
    hyOas: toFiniteOrNull(risk.hy),
    us10y: toFiniteOrNull(risk.us10y),
    real10y: toFiniteOrNull(risk.real10y),
    breakeven10y: toFiniteOrNull(risk.breakeven),
    gold: toFiniteOrNull(risk.gold),
    spx: toFiniteOrNull(risk.spx)
  };
  const confidenceScore = clamp(100 - (realtime.criticalMissing ?? 0) * R.confidenceScoring.criticalMissingPenalty - (realtime.fallbackCount ?? 0) * R.confidenceScoring.fallbackPenalty);
  const dailyBrief = buildDailyBrief({
    risk,
    realtimePayload: realtime,
    macroState: macro,
    phase,
    displayInputsBaseline,
    topRisks,
    activeSignals,
    allMacroMissing,
    confidenceScore
  });
  const divergenceLayer = buildDivergenceLayer({
    risk,
    realtimePayload: realtime,
    displayInputsBaseline,
    macroDrivers,
    confidenceScore
  });
  const ulsdData = await resolveUlsd(prevData?.brentPricingLayer);
  const brentPricingLayer = buildBrentPricingLayer({
    realtimePayload: realtime,
    displayInputsBaseline,
    dailyRealtimeInput: buildDailyRealtimeInput(realtime),
    ulsdData
  });

  const data = {
    version: 'v27.0',
    updatedAt: isoNow,
    dailyRealtimeInput: buildDailyRealtimeInput(realtime),
    dailyBrief,
    divergenceLayer,
    brentPricingLayer,
    score: risk.score,
    scoreChange1d,
    scoreChange7d,
    scoreChange30d,
    trendLabel: scoreChange7d > R.trendThresholds.risingThreshold ? '风险上升' : scoreChange7d < R.trendThresholds.fallingThreshold ? '风险回落' : '高位震荡偏紧',
    currentMacroRegime: macro,
    currentCrisisPhase: phase,
    nextCrisisPhase: phase === '流动性偏紧' ? '政策应对' : '风险缓和',
    transitionRisk: clamp(avg([risk.modules.liquidity, risk.hyRisk, risk.vixRisk])),
    confidenceScore,
    confidenceLevel: (realtime.cacheOnly ? '低' : realtime.degradedMode ? '中' : '高'),
    displayInputsBaseline,
    topRisks,
    decisionLine: `当前已进入 v27.0 交易引擎模式：实时快变量${sourceModeLabel}，执行状态灯为${lock.levelLabel}。${activeSignals.length ? '已激活结构信号：' + activeSignals.map(s => s.label).join('、') + '。' : allMacroMissing ? '结构信号数据源暂不可用。' : ''}先看状态灯，再决定能不能动。`,
    summary: `v27.0 正根据混合实时架构输出交易引擎结论。最新快变量：布伦特 ${risk.brent.toFixed(1)}、广义美元指数 ${risk.dxy.toFixed(2)}、波动率 ${risk.vix.toFixed(2)}、高收益利差 ${risk.hy.toFixed(2)}%。`,
    modules: risk.modules,
    moduleTrends: {
      geopolitical: clamp((realtime.changes?.brent1d ?? 0) * 2, -9, 9),
      energy: clamp((realtime.changes?.brent1d ?? 0) * 3, -9, 9),
      inflation: clamp((realtime.changes?.breakeven10y1d ?? 0) * 20, -9, 9),
      liquidity: clamp(((realtime.changes?.dxy1d ?? 0) * 8) + ((realtime.changes?.hyOas1d ?? 0) * 10), -9, 9),
      debt: clamp(((realtime.changes?.us10y1d ?? 0) + (realtime.changes?.real10y1d ?? 0)) * 20, -9, 9),
      banking: clamp((realtime.changes?.hyOas1d ?? 0) * 12, -9, 9)
    },
    regimeProbabilities: probs,
    phaseSignals: [
      `实时输入：布伦特 ${risk.brent.toFixed(1)} / 波动率 ${risk.vix.toFixed(2)} / 高收益利差 ${risk.hy.toFixed(2)}%。`,
      `利率输入：10年期 ${risk.us10y.toFixed(2)} / 实际利率 ${risk.real10y.toFixed(2)} / 盈亏平衡通胀 ${risk.breakeven.toFixed(2)}%。`,
      `快变量状态：${sourceModeLabel}，健康度 ${realtime.healthScore}。`
    ],
    macroDrivers: {
      fedLiquidity: macroDrivers.fedLiquidity,
      curve: macroDrivers.curve,
      credit: {
        ...macroDrivers.credit,
        hyOas: Number.isFinite(hyOasLive) ? hyOasLive : null
      },
      consumer: macroDrivers.consumer,
      activeSignals: activeSignals.map(s => ({ key: s.key, label: s.label, detail: s.detail, reliability: s.reliability })),
      gatingEvaluation: {
        structuralRed: gatingResult.structuralRed,
        structuralYellow: gatingResult.structuralYellow,
        redReasons: gatingResult.redReasons,
        yellowReasons: gatingResult.yellowReasons
      },
      allSourcesMissing: allMacroMissing
    },
    liquidityIndex: {
      score: risk.modules.liquidity,
      regime: risk.modules.liquidity >= 70 ? '限制性偏紧' : risk.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复',
      change1d: clamp(((realtime.changes?.dxy1d ?? 0) * 10) + ((realtime.changes?.hyOas1d ?? 0) * 8), -9, 9),
      directionLabel: realtime.cacheOnly ? '快变量缓存模式' : realtime.degradedMode ? '快变量带回退' : '快变量实时覆盖',
      notes: [
        `广义美元指数 ${risk.dxy.toFixed(2)} / 高收益利差 ${risk.hy.toFixed(2)} / 波动率 ${risk.vix.toFixed(2)} 为三大流动性输入。`,
        ...(realtime.notes || [])
      ],
      pillars: [
        { label: '美元融资', value: risk.dollarRisk, delta: clamp((realtime.changes?.dxy1d ?? 0) * 8, -9, 9) },
        { label: '跨资产波动', value: risk.vixRisk, delta: clamp((realtime.changes?.vix1d ?? 0) * 4, -9, 9) },
        { label: '信用 / 利差', value: risk.hyRisk, delta: clamp((realtime.changes?.hyOas1d ?? 0) * 10, -9, 9) },
        { label: '利率敏感压力', value: clamp(avg([risk.rateRisk, risk.realRisk])), delta: clamp(((realtime.changes?.us10y1d ?? 0) + (realtime.changes?.real10y1d ?? 0)) * 18, -9, 9) }
      ],
      structuralSignals: {
        fedAssetTrend: macroDrivers.fedLiquidity.regime,
        onRrpLevel: macroDrivers.fedLiquidity.onRrpLevel,
        structuralPressure: macroDrivers.fedLiquidity.pressure
      }
    },
    timeDimension: {
      trend30d: '滚动风险曲线（混合实时驱动）',
      scoreChange30d,
      avg30d,
      peak30d,
      trough30d,
      drawFromPeak: risk.score - peak30d,
      transmissionSpeed: clamp(avg([risk.modules.energy, risk.modules.inflation, risk.modules.liquidity])),
      transmissionAcceleration: scoreChange7d > R.trendThresholds.acceleratingThreshold ? '加快' : scoreChange7d < R.trendThresholds.deceleratingThreshold ? '放缓' : '平稳',
      dominantPath: risk.modules.energy >= risk.modules.liquidity ? '油价 → 通胀 → 利率 → 股票' : '美元 → 信用 → 流动性 → 股票',
      pathChanges: [
        { label: '油价→通胀', value: clamp(avg([risk.oilRisk, risk.inflationRisk])), delta: clamp((realtime.changes?.brent1d ?? 0) * 3, -9, 9) },
        { label: '通胀→利率', value: clamp(avg([risk.inflationRisk, risk.rateRisk])), delta: clamp((realtime.changes?.breakeven10y1d ?? 0) * 18, -9, 9) },
        { label: '美元→信用', value: clamp(avg([risk.dollarRisk, risk.hyRisk])), delta: clamp(((realtime.changes?.dxy1d ?? 0) * 8) + ((realtime.changes?.hyOas1d ?? 0) * 8), -9, 9) },
        { label: '利率→股票', value: clamp(avg([risk.rateRisk, risk.spxRisk])), delta: clamp(((realtime.changes?.us10y1d ?? 0) * 16) - ((realtime.changes?.spx1d ?? 0) / 20), -9, 9) },
        { label: '流动性→估值', value: clamp(avg([risk.modules.liquidity, risk.vixRisk])), delta: clamp(((realtime.changes?.vix1d ?? 0) * 3) + ((realtime.changes?.hyOas1d ?? 0) * 8), -9, 9) }
      ],
      notes: [
        `当前综合风险分数 ${risk.score}。`,
        `执行引擎状态：${lock.levelLabel}。`,
        `慢变量由实时快照与结构性数据共同驱动。`
      ]
    },
    heatmap: [
      { key: 'us', label: '美国', shortLabel: '美国', risk: clamp(avg([risk.modules.inflation, risk.modules.debt, risk.modules.liquidity])), note: `融资偏紧 + 实际利率 ${risk.real10y.toFixed(2)}%` },
      { key: 'europe', label: '欧洲', shortLabel: '欧洲', risk: clamp(avg([risk.modules.energy, risk.modules.banking])), note: '能源敏感 + 增长拖累' },
      { key: 'middleeast', label: '中东', shortLabel: '中东', risk: risk.modules.geopolitical, note: '原油与地缘仍是主风险源' },
      { key: 'china', label: '中国', shortLabel: '中国', risk: clamp(avg([risk.modules.debt * 0.4, risk.modules.liquidity * 0.6])), note: '外需与美元约束' },
      { key: 'japan', label: '日韩', shortLabel: '日韩', risk: clamp(avg([risk.modules.energy * 0.45, risk.modules.liquidity * 0.55])), note: '输入型压力+美元波动' },
      { key: 'emAsia', label: '新兴亚洲', shortLabel: '新兴亚洲', risk: clamp(avg([risk.modules.liquidity * 0.65, risk.modules.energy * 0.35])), note: '美元敏感度较高' },
      { key: 'latam', label: '拉美', shortLabel: '拉美', risk: clamp(avg([risk.modules.energy * 0.35, risk.modules.liquidity * 0.65])), note: '商品支撑但外部融资受限' }
    ],
    transmissionChain: transmissionDeltaResult.chain,
    transmissionDeltaMeta: transmissionDeltaResult.meta,
    assetMatrix: [
      { asset: '黄金', score: clamp(50 + (100 - risk.realRisk) * 0.35 + risk.inflationRisk * 0.25), bias: (risk.realRisk < 60 ? '中性偏多' : '谨慎偏多'), reason: `金价 ${risk.gold.toFixed(1)}，通胀对冲仍在，但真实利率继续约束。` },
      { asset: '原油', score: clamp(45 + risk.oilRisk * 0.55), bias: risk.brent >= 90 ? '强配' : '中性偏多', reason: `布伦特 ${risk.brent.toFixed(1)} 美元，仍是主导链条。` },
      { asset: '美元', score: clamp(40 + risk.dollarRisk * 0.55), bias: risk.dollarRisk >= 60 ? '强配' : '中性偏多', reason: `广义美元指数 ${risk.dxy.toFixed(2)}，融资偏紧阶段继续占优。` },
      { asset: '美债久期', score: clamp(60 - risk.realRisk * 0.45), bias: risk.realRisk >= 60 ? '低配' : '谨慎偏多', reason: `10年期 ${risk.us10y.toFixed(2)} / 实际利率 ${risk.real10y.toFixed(2)}%。` },
      { asset: '科技股', score: clamp(55 - avg([risk.rateRisk, risk.modules.liquidity]) * 0.5), bias: risk.score >= 70 ? '回避' : '低配', reason: '高估值资产仍受利率与流动性制约。' },
      { asset: '能源股', score: clamp(50 + risk.modules.energy * 0.45), bias: risk.modules.energy >= 70 ? '强配' : '中性偏多', reason: '能源现金流继续受益于高油价环境。' },
      { asset: '比特币', score: clamp(48 - risk.modules.liquidity * 0.35 - risk.vixRisk * 0.2), bias: risk.modules.liquidity >= 65 ? '回避' : '低配', reason: '高波动资产对流动性最敏感。' }
    ],
    assetReturnMap: prevData.assetReturnMap || { horizon: '未来1个月', rows: [] },
    scenarioTree: [
      {
        name: '基准情景',
        probability: clamp(avg([probs.stagflationShock, probs.crisisLiquiditySqueeze])),
        description: '快变量显示风险仍高位但未失控，市场以防守与分化为主。',
        triggers: `布伦特 ${risk.brent.toFixed(1)} / 广义美元指数 ${risk.dxy.toFixed(2)} / 高收益利差 ${risk.hy.toFixed(2)}`,
        assets: '能源领先 / 美元与黄金保留 / 成长受限'
      },
      {
        name: '风险情景',
        probability: clamp(avg([risk.hyRisk, risk.vixRisk])),
        description: '信用与波动率继续上行，执行引擎会切到红灯。',
        triggers: '布伦特 > 110 或高收益利差 > 4.5% 或波动率 > 28',
        assets: '只允许减仓 / 现金与美元提高 / 高波动回避'
      },
      {
        name: '极端情景',
        probability: clamp(avg([risk.modules.liquidity, risk.vixRisk])),
        description: '多源关键快变量连续失效时，系统进入缓存模式并强制防守。',
        triggers: '关键缺失 ≥ 4 或缓存模式启动',
        assets: '停止加仓 / 保留现金 / 仅做风险控制'
      },
      {
        name: '反转情景',
        probability: clamp(avg([probs.disinflationaryGrowth, probs.liquidityBull])),
        description: '美元走弱、波动率和利差收敛后，系统重新开放进攻窗口。',
        triggers: '波动率 < 18 / 高收益利差 < 3.7 / 布伦特 < 95',
        assets: '逐步恢复权益与质量成长配置'
      }
    ],
    warningSystem: {
      status: `${lock.levelLabel} / 数据模式${sourceModeLabel}`,
      criticalCount: realtime.criticalMissing || 0,
      warningCount: realtime.fallbackCount || 0,
      watchCount: Object.values(realtime.sourceStatus || {}).filter(v => String(v).startsWith('fred') || String(v).startsWith('stooq')).length,
      alerts: [
        {
          level: lock.level === 'red' ? '红色' : lock.level === 'yellow' ? '橙色' : '黄色',
          title: '执行状态灯',
          driver: '交易引擎',
          triggeredAgo: isoNow,
          condition: lock.description,
          action: lock.actionText
        },
        ...activeSignals.map((s) => ({
          level: ['curveDeepInversion', 'onRrpCritical', 'igOasStress'].includes(s.key) ? '橙色' : '黄色',
          title: s.label,
          driver: '结构信号',
          triggeredAgo: isoNow,
          condition: s.detail,
          action: '该结构信号已纳入决策层门控。'
        })),
        ...(realtime.notes || []).map((n) => ({
          level: '黄色',
          title: '数据源提示',
          driver: '快变量源',
          triggeredAgo: isoNow,
          condition: n,
          action: '继续使用回退值，不中断系统'
        }))
      ],
      rules: [
        '关键快变量失败 2 项以上 → 标记部分降级。',
        '关键快变量失败 4 项以上 → 进入缓存模式。',
        '缓存模式自动把执行状态灯至少提升到黄灯。',
        '结构性红灯门控：曲线严重倒挂（< -0.8）且投资级信用告警（>= 2.0%）；或逆回购余额临界告急。',
        '结构性黄灯门控：曲线深度倒挂叠加美联储缩表；或投资级信用利差进入应力区；或逆回购告急。'
      ]
    },
    triggerPanel: {
      critical: [`布伦特 ${risk.brent.toFixed(1)}`, `广义美元指数 ${risk.dxy.toFixed(2)}`, `高收益利差 ${risk.hy.toFixed(2)}%`],
      drivers: [`波动率 ${risk.vix.toFixed(2)}`, `10年期美债 ${risk.us10y.toFixed(2)}%`, `实际利率 ${risk.real10y.toFixed(2)}%`],
      watchlist: ['下一次通胀数据', '油价是否高于 100', '信用利差是否重新走阔']
    },
    confidenceNotes: [
      `数据模式：${sourceModeLabel}。`,
      `健康分数：${realtime.healthScore}。`,
      `关键缺失项：${realtime.criticalMissing || 0}。`,
      `结构信号：${activeSignals.length ? activeSignals.map(s => s.label).join('、') : (allMacroMissing ? '数据源全不可用' : '无激活')}。`
    ],
    recovery: {
      degradedMode: realtime.degradedMode || allMacroMissing,
      safeOutput: true,
      lastRun: isoNow,
      notes: recoveryNotes
    },
    tradingSystem: {
      signalEngine: {
        strength: risk.score,
        direction: lock.level === 'red' ? '只允许减仓/防守' : lock.level === 'yellow' ? '防御偏多能源 / 美元，限制久期与高波动' : '允许质量权益分批进攻',
        consistency: realtime.cacheOnly ? '低一致性（缓存）' : realtime.degradedMode ? '中一致性（回退）' : '高一致性',
        macroSignal: macro,
        liquiditySignal: `${risk.modules.liquidity >= 70 ? '限制性偏紧' : risk.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复'}（实时）`,
        chainSignal: risk.modules.energy >= risk.modules.liquidity ? '油价→通胀→利率→股票' : '美元→信用→流动性→股票',
        notes: [
          `执行引擎状态：${lock.levelLabel}。`,
          `关键快变量：布伦特 ${risk.brent.toFixed(1)} / 广义美元指数 ${risk.dxy.toFixed(2)} / 波动率 ${risk.vix.toFixed(2)} / 高收益利差 ${risk.hy.toFixed(2)}。`,
          `健康度 ${realtime.healthScore}，关键缺失 ${realtime.criticalMissing || 0}。`,
          activeSignals.length ? `结构信号：${activeSignals.map(s => s.label).join('、')}。` : (allMacroMissing ? '结构信号数据源全不可用，门控已降级。' : '结构信号：无激活。')
        ]
      },
      positioning: {
        regime: lock.level === 'red' ? '强防守执行框架' : lock.level === 'yellow' ? '防守型执行框架' : '可控进攻框架',
        riskBudget: lock.riskBudget,
        targetGrossExposure: lock.gross,
        cashBufferTarget: lock.cash,
        coreAllocations: allocs,
        executionRestrictions: lock.level === 'green'
          ? ['任何新增仓位必须分批执行。', '单日净加仓不超过总资产的 5%。', '若状态灯转黄，次日停止加仓。']
          : ['总仓位偏离目标值超过 ±5% 前，不得做方向性大调整。', '高波动资产合计不得超过 3%。', '任何新增进攻仓位都必须由减仓腾出空间。']
      },
      discipline: prevData.tradingSystem?.discipline || {
        tag: '系统优先于主观判断',
        entryConditions: ['宏观、流动性、传导链至少两项同向支持。'],
        prohibitedBehaviors: ['禁止在状态灯为红灯或黄灯时主观追高。'],
        mandatoryRules: ['先看状态灯，再执行动作。']
      },
      riskControl: {
        status: lock.level === 'red' ? '硬阈值全面生效' : lock.level === 'yellow' ? '硬阈值生效中' : '风险可控但仍受约束',
        maxDrawdown: lock.level === 'red' ? '-6%' : '-8%',
        singleAssetMax: lock.level === 'red' ? '20%' : '22%',
        systemState: lock.title,
        hardThresholds: [
          '流动性 ≥ 75：总仓位降至 42%。',
          '布伦特 ≥ 110：能源上调，股票下调。',
          '高收益利差 ≥ 4.5%：暂停新增风险仓位。',
          '波动率指数 ≥ 28：切入红灯。',
          '结构性红灯：曲线 < -0.8 且投资级信用利差 ≥ 2.0%；或逆回购余额临界告急。',
          '结构性黄灯：曲线 ≤ -0.5 叠加美联储缩表；或投资级信用利差 ≥ 1.5%；或逆回购余额 < 1000 亿美元。'
        ],
        resetThresholds: [
          '波动率指数 < 18 且高收益利差 < 3.7：才允许回到绿灯。',
          '布伦特 < 95 且美元走弱：才允许提高成长仓。',
          '关键缺失 < 2：解除数据回退约束。',
          '曲线回到 0 以上且投资级信用利差 < 1.2%：解除结构性约束。'
        ]
      },
      actionLayer: {
        tag: '今日执行清单（交易引擎版）',
        priorityLine: `先看执行状态灯 ${lock.levelLabel} → 再执行强制动作 → 再对齐目标仓位；不满足条件时禁止交易。`,
        todayAction: lock.actionText,
        checklist: lock.mandatory,
        blocked: lock.block,
        checkpoints: [
          `布伦特 当前 ${risk.brent.toFixed(1)}`,
          `广义美元指数 当前 ${risk.dxy.toFixed(2)}`,
          `波动率指数 当前 ${risk.vix.toFixed(2)}`,
          `高收益利差 当前 ${risk.hy.toFixed(2)}%`,
          ...(Number.isFinite(macroDrivers.curve.t10y2y) ? [`曲线 10年-2年 当前 ${macroDrivers.curve.t10y2y.toFixed(2)}`] : []),
          ...(Number.isFinite(macroDrivers.credit.igOas) ? [`投资级信用利差 当前 ${macroDrivers.credit.igOas.toFixed(2)}%`] : []),
          ...(Number.isFinite(macroDrivers.fedLiquidity.onRrp) ? [`逆回购余额 当前 ${formatOnRrpYiUsd(macroDrivers.fedLiquidity.onRrp)}`] : [])
        ]
      },
      executionLock: {
        tag: realtime.cacheOnly ? '缓存模式 · 主观不得覆盖' : realtime.degradedMode ? '带回退实时模式 · 主观不得覆盖' : '实时模式 · 主观不得覆盖',
        level: lock.level,
        levelLabel: lock.levelLabel,
        title: lock.title,
        description: lock.description,
        allow: lock.allow,
        block: lock.block,
        mandatory: lock.mandatory,
        structurallyTriggered: !!lock.structurallyTriggered
      }
    }
  };

  data.decisionModel = {
    contractVersion: 'v27.0',
    strategyState: lock.level === 'red' ? 'Defensive' : lock.level === 'yellow' ? 'Caution' : 'Balanced',
    stateLabel: lock.levelLabel,
    stateScore: risk.score,
    stateReason: stateReasonCN,
    structuralSignals: activeSignals.map(s => ({ key: s.key, label: s.label, detail: s.detail, reliability: s.reliability })),
    structuralScoreBump: structuralScoreBump(activeSignals),
    allStructuralSourcesMissing: allMacroMissing,
    dominantDrivers: sortedModules.map(([key, score]) => ({
      key,
      score,
      label: MODULE_LABELS_CN[key] || key,
      trend: 0
    })),
    positionGuidance: {
      totalExposureBand: totalExposureBandCN,
      riskAssetBias: lock.level === 'red' ? '低配风险资产' : lock.level === 'yellow' ? '选择性低配' : '中性至选择性配置',
      cashGuidance: cashGuidanceText,
      newExposurePolicy: newExposurePolicyText,
      targetGrossExposure: lock.gross,
      cashBufferTarget: lock.cash,
      riskBudget: lock.riskBudget,
      structuralBandShift: structuralShift
    },
    actionQueue: {
      priorityActions: [
        ...lock.mandatory,
        ...activeSignals.map(s => `关注结构信号：${s.label}（${s.detail}）。`)
      ],
      blockedActions: lock.block,
      watchItems: [
        '下一次通胀数据',
        '油价是否高于 100',
        '信用利差是否重新走阔',
        ...(Number.isFinite(macroDrivers.curve.t10y2y) ? ['10年-2年利差走向'] : []),
        ...(Number.isFinite(macroDrivers.credit.igOas) ? ['投资级信用利差变化'] : []),
        ...(Number.isFinite(macroDrivers.fedLiquidity.onRrp) ? ['逆回购余额变化'] : [])
      ]
    },
    triggerMonitor: {
      upgradeTriggers: [
        `布伦特 ${risk.brent.toFixed(1)}`,
        `广义美元指数 ${risk.dxy.toFixed(2)}`,
        `高收益利差 ${risk.hy.toFixed(2)}%`,
        ...(Number.isFinite(macroDrivers.curve.t10y2y) ? [`10年-2年利差 ${macroDrivers.curve.t10y2y.toFixed(2)}`] : []),
        ...(Number.isFinite(macroDrivers.credit.igOas) ? [`投资级信用利差 ${macroDrivers.credit.igOas.toFixed(2)}%`] : [])
      ],
      activeEscalationSignals: activeSignals.length
        ? activeSignals.map(s => `${s.label}（${s.detail}）`)
        : [`波动率 ${risk.vix.toFixed(2)}`, `10年期美债 ${risk.us10y.toFixed(2)}%`, `实际利率 ${risk.real10y.toFixed(2)}%`]
    },
    invalidationRules: {
      resetConditions: [
        '波动率指数 < 18 且高收益利差 < 3.7：才允许回到绿灯。',
        '布伦特 < 95 且美元走弱：才允许提高成长仓。',
        '关键缺失 < 2：解除数据回退约束。',
        '曲线回到 0 以上且投资级信用利差 < 1.2%：解除结构性约束。'
      ]
    }
  };

  data.aiInterpretationLayer = buildAiInterpretationLayer(data);
  preserveExternalAiInterpretationLayer(data);

  const historyFull = appendHistoryFull(prevHistoryFull, risk, lock, macro, macroDrivers, transmissionSnapshot);

  return { data, history, historyFull };
}

async function main() {
  const built = await build();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(built.data, null, 2));
  fs.writeFileSync(histPath, JSON.stringify(built.history, null, 2));
  fs.writeFileSync(histFullPath, JSON.stringify(built.historyFull, null, 2));
  console.log('v27.0 雷达数据构建成功。');
}

if (IS_MAIN) {
  await main();
}
