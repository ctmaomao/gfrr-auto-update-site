import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS,
  EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT,
  EXTERNAL_AI_PRODUCTION_MODEL,
  resolveExternalAiProductionContract,
} from './external-ai/production-contract.mjs';
import { validateAnalystPr4StructuredFields } from './external-ai/pr4-schema-canary.mjs';
import { isAllowedExternalAiProductionSourceLayer } from './external-ai/source-layers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const dataPath = path.join(root, 'data', 'radar-data.json');
const historyPath = path.join(root, 'data', 'radar-history.json');
const realtimePath = path.join(root, 'realtime', 'market.json');
const historyFullPath = path.join(root, 'data', 'radar-history-full.json');
const args = new Set(process.argv.slice(2));
const supportedArgs = new Set(['--verbose', '--strict-live-alignment']);

for (const arg of args) {
  if (!supportedArgs.has(arg)) {
    throw new Error(`Validation failed: unsupported argument ${arg}`);
  }
}

const validateDataVerbose = args.has('--verbose') || process.env.VALIDATE_DATA_VERBOSE === '1';
const strictLiveAlignment = args.has('--strict-live-alignment') || process.env.VALIDATE_DATA_STRICT_LIVE_ALIGNMENT === '1';

if (!fs.existsSync(dataPath)) throw new Error('Validation failed: missing data/radar-data.json');
if (!fs.existsSync(historyPath)) throw new Error('Validation failed: missing data/radar-history.json');
if (!fs.existsSync(realtimePath)) throw new Error('Validation failed: missing realtime/market.json');
const historyFull = fs.existsSync(historyFullPath)
  ? JSON.parse(fs.readFileSync(historyFullPath, 'utf8'))
  : null;
if (historyFull !== null) {
  if (!Array.isArray(historyFull) || historyFull.length === 0) throw new Error('Validation failed: radar-history-full.json is empty or malformed.');
  const latest = historyFull[historyFull.length - 1];
  if (!latest.date || !latest.score || !latest.modules) throw new Error('Validation failed: radar-history-full.json latest entry is missing required fields.');
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
const realtime = JSON.parse(fs.readFileSync(realtimePath, 'utf8'));

const DISPLAY_INPUT_KEYS = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y', 'breakeven10y', 'gold', 'spx'];
const HISTORY_WINDOW_STATUSES = new Set(['ready', 'partial', 'missing']);
const WIDE_TOLERANCE_KEYS = new Set(['gold', 'spx']);
const BRENT_CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low', 'none']);
const DAILY_REALTIME_SOURCE_MODES = new Set(['live', 'degraded', 'live-with-fallback', 'fallback', 'cache-only', 'mock']);
const DAILY_REALTIME_LIVE_MAX_AGE_MINUTES = 180;
const DAILY_REALTIME_CACHE_ONLY_MAX_AGE_MINUTES = 360;
const DAILY_BRIEF_CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);
const DIVERGENCE_LAYER_STATES = new Set(['normal', 'watch', 'stress', 'high_stress', 'insufficient_data']);
const DIVERGENCE_CHECK_STATUSES = new Set(['normal', 'watch', 'stress', 'insufficient_data']);
const DIVERGENCE_CHECK_CATEGORIES = new Set(['energy_pricing', 'rates_assets', 'liquidity_credit', 'risk_complacency', 'consumer_assets']);
const CONSUMER_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const LEGACY_M47_CONSUMER_SOURCE = ['FRED:UMCSENT; FRED:', 'N', 'APM'].join('');
const VALID_CONSUMER_SOURCES = new Set([
  'FRED:UMCSENT',                  // legacy single-source (pre-M-47); kept for fixture/old-data compatibility
  LEGACY_M47_CONSUMER_SOURCE,      // legacy M-47 source label; kept until all committed snapshots refresh
  'FRED:UMCSENT; ISM:ManufacturingPMI', // M-67+: UMCSENT + official ISM Manufacturing PMI report parser
]);
const EMPLOYMENT_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_EMPLOYMENT_SOURCES = new Set([
  'FRED:ICSA; FRED:CCSA; FRED:JTSJOL',
  'FRED:ICSA; FRED:CCSA; FRED:JTSJOL; FRED:CES0500000003; FRED:U6RATE; FRED:industry-payroll-basket',
]);
const VALID_CLAIMS_REGIMES = new Set(['明显走弱', '走弱', '稳定', '改善', '未知']);
const VALID_JOLTS_REGIMES = new Set(['紧张', '平衡', '宽松', '走弱', '未知']);
const VALID_LABOR_QUALITY_REGIMES = new Set(['工资韧性', '扩散改善', '降温', '平衡', '未知']);
const VALID_INDUSTRY_DIFFUSION_REGIMES = new Set(['广泛扩张', '温和扩张', '分化', '收缩扩散', '未知']);
const CONSUMER_RETAIL_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_CONSUMER_RETAIL_SOURCES = new Set([
  'FRED:CARTS; FRED:CARTSR',
  'FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments',
  'FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments; BofA:ConsumerCheckpoint-public-html',
  'FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments; BofA:ConsumerCheckpoint-public-html; TradingEconomics:Redbook-public-html',
]);
const VALID_RETAIL_REGIMES = new Set(['明显走弱', '走弱', '稳定', '改善', '强劲', '未知']);
const VALID_RETAIL_SEGMENT_REGIMES = new Set(['广泛改善', '温和改善', '分化', '广泛走弱', '未知']);
const CRE_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing', 'manual_required']);
const VALID_CRE_SOURCES = new Set([
  'FRED:DRCRELEXFACBS; FRED:CORCREXFACBS; FRED:SUBLPDRCSN; FRED:SUBLPDRCSC; FRED:SUBLPDRCSM',
  'FRED:DRCRELEXFACBS; FRED:CORCREXFACBS; FRED:SUBLPDRCSN; FRED:SUBLPDRCSC; FRED:SUBLPDRCSM; Yahoo:VNQ; Yahoo:REM',
  'FRED:DRCRELEXFACBS; FRED:CORCREXFACBS; FRED:SUBLPDRCSN; FRED:SUBLPDRCSC; FRED:SUBLPDRCSM; Yahoo:VNQ; Yahoo:REM; Yahoo:CMBS',
  'FRED:DRCRELEXFACBS; FRED:CORCREXFACBS; FRED:SUBLPDRCSN; FRED:SUBLPDRCSC; FRED:SUBLPDRCSM; FRED:CREACBW027SBOG; Yahoo:VNQ; Yahoo:REM; Yahoo:CMBS',
]);
const VALID_CRE_STRESS_REGIMES = new Set(['恶化', '紧绷', '稳定', '宽松', '改善', '未知']);
const VALID_CRE_PUBLIC_MARKET_PROXY_REGIMES = new Set(['市场压力上升', '观察', '平稳', '未知']);
const SHIPPING_FREIGHT_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_SHIPPING_FREIGHT_SOURCE = 'StockQ:BDTI; StockQ:BCTI; StockQ:BDI';
const VALID_FREIGHT_REGIMES = new Set(['高压', '观察', '快速回落', '正常', '未知']);
const ENERGY_SPARE_CAPACITY_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing', 'stale']);
const VALID_ENERGY_SPARE_CAPACITY_SOURCE = 'EIA:STEO:COPS_OPEC';
const VALID_ENERGY_SPARE_CAPACITY_UNIT = 'million barrels per day';
const VALID_ENERGY_SPARE_CAPACITY_FREQUENCY = 'monthly';
const VALID_ENERGY_SPARE_CAPACITY_REGIMES = new Set(['极低缓冲', '偏低', '正常', '宽松', '未知']);
const ENERGY_TRANSPORT_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing', 'stale']);
const ENERGY_TRANSPORT_CHOKEPOINT_STATUSES = new Set(['live', 'missing', 'insufficient_window']);
const VALID_ENERGY_TRANSPORT_SOURCE = 'IMFPortWatch:Daily_Chokepoints_Data';
const VALID_ENERGY_TRANSPORT_USAGE_TERMS = 'partial';
const VALID_ENERGY_TRANSPORT_REROUTING_REGIMES = new Set(['rerouting_watch', 'normal', 'unknown']);
const ENERGY_TRANSPORT_CHOKEPOINT_KEYS = ['suez', 'panama', 'bosporus', 'babElMandeb', 'malacca', 'hormuz', 'capeGoodHope', 'gibraltar'];
const ENERGY_TRANSPORT_CORE_KEYS = ['suez', 'babElMandeb', 'malacca', 'hormuz', 'capeGoodHope', 'gibraltar'];
const ENERGY_TRANSPORT_FORBIDDEN_KEYS = new Set([
  'warProbability',
  'blockadeProbability',
  'oilPricePrediction',
  'officialTradeStatistic'
]);
const POLICY_EXPECTATIONS_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing', 'manual_required']);
const VALID_POLICY_EXPECTATIONS_SOURCE = 'FRED:DFEDTARL/DFEDTARU/DFF; Yahoo:ZQ=F/ZQ-monthly-futures/SR3-monthly-SOFR-futures; CheckMySwap:USD-OIS-public-curve; FederalReserve:FOMC statement/SEP/minutes';
const VALID_POLICY_TONES = new Set(['偏鹰', '偏鸽', '平衡', '未知']);
const VALID_POLICY_EXPECTATION_REGIMES = new Set(['降息预期', '加息/更高更久', '区间震荡', '未知']);
const FED_FUNDS_FUTURES_CURVE_STATUSES = new Set(['live_proxy_curve', 'fallback_proxy_curve', 'missing']);
const SOFR_FUTURES_CURVE_STATUSES = new Set(['live_proxy_curve', 'fallback_proxy_curve', 'missing']);
const OIS_FORWARD_CURVE_STATUSES = new Set(['live_public_curve', 'fallback_public_curve', 'missing']);
const PRIVATE_CREDIT_PROXY_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing', 'manual_required']);
const VALID_PRIVATE_CREDIT_PROXY_SOURCE = 'Yahoo:BIZD; Yahoo:PBDC; Yahoo:SRLN; Yahoo:CCLFX; FRED:BAMLH0A0HYM2; FRED:BAMLC0A0CM; ICE:CDX-index-settlement-public';
const VALID_PRIVATE_CREDIT_PROXY_REGIMES = new Set(['压力上升', '观察', '平稳', '未知']);
const WORLD_ECONOMY_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_WORLD_ECONOMY_SOURCES = new Set([
  'Yahoo:^STOXX50E; Yahoo:^N225; Yahoo:^GDAXI; Yahoo:^FTSE; Yahoo:^FCHI; Yahoo:^STOXX; Yahoo:^KS11; Yahoo:^AXJO; Yahoo:^STI; Yahoo:^TWII',
  'Yahoo:^STOXX50E; Yahoo:^N225; Yahoo:^GDAXI; Yahoo:^FTSE; Yahoo:^FCHI; Yahoo:^STOXX; Yahoo:^KS11; Yahoo:^AXJO; Yahoo:^STI; Yahoo:^TWII; Yahoo:^NSEI; Yahoo:^BVSP'
]);
const WORLD_ECONOMY_KEYS = ['stoxx50', 'nikkei225', 'dax', 'ftse100', 'cac40', 'stoxx600', 'kospi', 'asx200', 'sti', 'taiex', 'nifty50', 'bovespa'];
const EURO_VOLATILITY_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_EURO_VOLATILITY_SOURCE = 'DeutscheBoerse:quote_box:V2TX; STOXX(fallback)';
const CHINA_EQUITY_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_CHINA_EQUITY_SOURCE = 'Yahoo:000001.SS; Yahoo:^HSI; Yahoo:000300.SS';
const CHINA_EQUITY_KEYS = ['sseComposite', 'hangSeng', 'csi300'];
const INFLATION_ENERGY_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_INFLATION_ENERGY_SOURCE = 'FRED:CPIAUCSL; FRED:CPILFESL; FRED:DCOILWTICO';
const VALID_INFLATION_CPI_SOURCE = 'FRED:CPIAUCSL; FRED:CPILFESL';
const VALID_INFLATION_WTI_SOURCE = 'FRED:DCOILWTICO';
const COPPER_GOLD_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
// copperGold parent source is gold-api spot (HG/XAU) with a 1d (day-over-day vs
// previous Daily run) window. Yahoo HG=F/GC=F is a per-leg fallback only — the
// parent source label stays gold-api regardless — so it is not listed here.
// (Pre-swap Yahoo/5d transition allowance contracted 2026-06-01 after the Daily
// run committed gold-api-sourced copperGold data.)
const VALID_COPPER_GOLD_SOURCES = new Set(['gold-api:HG; gold-api:XAU']);
const VALID_COPPER_GOLD_WINDOWS = new Set(['1d']);
const COPPER_GOLD_KEYS = ['copper', 'gold'];
const CHINA_BOND_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_CHINA_BOND_SOURCE = 'ChinaBond:MOF-yield-curve';
const VALID_CHINA_BOND_LEAF_SOURCE = 'ChinaBond:MOF';
const CFETS_RMB_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_CFETS_RMB_SOURCE = 'ChinaMoney:CFETS-RmbIdx';
const CHINA_MACRO_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing']);
const VALID_CHINA_INFLATION_SOURCE = 'NBS:stats-zxfb; TradingEconomics:China-CPI-PPI-public-html';
const VALID_CHINA_PMI_SOURCE = 'NBS:stats-zxfb; TradingEconomics:China-NBS-Manufacturing-PMI-public-html';
const VALID_CHINA_PROPERTY_PRICE_SOURCE = 'NBS:70city-price-index';
const VALID_CHINA_OMO_SOURCE = 'EastMoney:OMO-aggregated-news';
const VALID_CHINA_TSF_SOURCE = 'EastMoney:TSF-aggregated-report';
const VALID_CHINA_MLF_SOURCE = 'EastMoney:MLF-aggregated-news';
const CHINA_TSF_COMPONENT_STATUSES = new Set(['complete', 'partial', 'missing']);
const CHINA_TSF_COMPONENT_KEYS = new Set([
  'rmbLoans',
  'foreignLoans',
  'entrustedLoans',
  'trustLoans',
  'undiscountedBills',
  'corpBonds',
  'govBonds',
  'equity'
]);
const CHINA_OMO_OPERATION_TYPES = new Set(['逆回购', '正回购', '无操作']);
const BRENT_LAYER_SOURCE_STATUSES = new Set(['ok', 'fallback', 'missing']);
const BRENT_CONFIRMATION_STATUSES = new Set(['ok', 'fallback', 'missing', 'excluded']);
const BRENT_CONFIRMATION_ROLES = new Set(['anchor', 'futures_proxy', 'confirmation', 'diagnostic']);
const BRENT_PROXY_SPREAD_STATUSES = new Set(['normal', 'watch', 'stress', 'insufficient_data']);
const BRENT_FUTURES_CURVE_STATUSES = new Set(['live_structure_only', 'fallback_structure_only', 'missing']);
const BRENT_FUTURES_PRICE_CURVE_STATUSES = new Set(['live_proxy_priced', 'fallback_proxy_priced', 'missing']);
const ICE_BRENT_FUTURES_PRICE_CURVE_STATUSES = new Set(['live_delayed_priced', 'fallback_delayed_priced', 'missing']);
const EIA_BRENT_SPOT_PROXY_STATUSES = new Set(['live', 'fallback', 'missing']);
const AI_INTERPRETATION_MODE = 'rule_based_structured_interpretation';
const AI_INTERPRETATION_MODEL_SOURCES = new Set(['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'macroDrivers', 'decisionModel', 'combined']);
const AI_INTERPRETATION_EVIDENCE_LAYERS = new Set(['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'macroDrivers.consumer', 'worldOrder', 'decisionModel']);
const EXTERNAL_AI_SCAFFOLD_CONTRACT_VERSION = 'v28.0K-3A';
const EXTERNAL_AI_SCAFFOLD_MODE = 'external_ai_disabled_scaffold';
const EXTERNAL_AI_SCAFFOLD_LAYERS = new Set(['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'macroDrivers.consumer', 'aiInterpretationLayer', 'decisionModel']);
const DAILY_BRIEF_FORBIDDEN_PHRASES = [
  '战争概率',
  '世界大战',
  '必然崩盘',
  '危机已经爆发',
  '实时消费者恐慌',
  '消费崩盘已确认',
  '必然衰退',
  'guaranteed',
  'certainty',
  'Platts Dated Brent 已接入',
  '真实 Dated Brent 已接入',
  '实物油价已经确认',
  '石油危机已经爆发',
  '必然逼空',
  '已经进入第三次世界大战',
  '13步已走几步',
  'sure thing',
  'risk-free'
];
const EXTERNAL_AI_FORBIDDEN_PHRASES = [
  ...DAILY_BRIEF_FORBIDDEN_PHRASES,
  'DeepSeek 已验证市场事实',
  'OpenAI 已验证市场事实',
  '外部 AI 已确认危机',
  'DeepSeek 已接入',
  'OpenAI 已接入',
  '外部 AI 已启用'
];

function assert(condition, message) {
  if (!condition) throw new Error(`Validation failed: ${message}`);
}

function isFiniteNumberOrNull(value) {
  return value === null || Number.isFinite(value);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isCloseEnough(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function assertPlainObject(value, fieldName) {
  assert(isPlainObject(value), `${fieldName} must be an object`);
}

function assertArray(value, fieldName) {
  assert(Array.isArray(value), `${fieldName} must be an array`);
}

function assertString(value, fieldName) {
  assert(typeof value === 'string', `${fieldName} must be a string`);
}

function assertBoolean(value, fieldName) {
  assert(typeof value === 'boolean', `${fieldName} must be a boolean`);
}

function assertFiniteNumber(value, fieldName) {
  assert(Number.isFinite(value), `${fieldName} must be a finite number`);
}

function validateStringIfPresent(source, key, fieldName) {
  if (source[key] !== undefined) assertString(source[key], `${fieldName}.${key}`);
}

function validateBooleanIfPresent(source, key, fieldName) {
  if (source[key] !== undefined) assertBoolean(source[key], `${fieldName}.${key}`);
}

function validateFiniteNumberIfPresent(source, key, fieldName) {
  if (source[key] !== undefined) assertFiniteNumber(source[key], `${fieldName}.${key}`);
}

function validateDecimalRatioRangeIfPresent(value, fieldName, min = -2, max = 2) {
  if (value === null || value === undefined) return;
  assert(Number.isFinite(value), `${fieldName} must be finite number or null`);
  assert(value >= min && value <= max, `${fieldName} decimal-ratio out of plausible range [${min}, ${max}]: ${value}`);
}

function validateArrayIfPresent(source, key, fieldName) {
  if (source[key] !== undefined) assertArray(source[key], `${fieldName}.${key}`);
}

function validatePlainObjectIfPresent(source, key, fieldName) {
  if (source[key] !== undefined) assertPlainObject(source[key], `${fieldName}.${key}`);
}

function validateStringOrPlainObjectIfPresent(source, key, fieldName) {
  if (source[key] === undefined) return;
  const value = source[key];
  assert(
    typeof value === 'string' || isPlainObject(value),
    `${fieldName}.${key} must be a string or an object`
  );
}

function parseIsoTime(value, fieldName) {
  assert(typeof value === 'string' && value.trim().length > 0, `dailyRealtimeInput.${fieldName} must be a non-empty ISO string`);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `dailyRealtimeInput.${fieldName} is not parseable`);
  return timestamp;
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function validateDailyBriefEvidence(evidence, fieldName) {
  assertArray(evidence, fieldName);
  evidence.forEach((item, index) => {
    assertPlainObject(item, `${fieldName}[${index}]`);
    validateStringIfPresent(item, 'source', `${fieldName}[${index}]`);
    validateStringIfPresent(item, 'key', `${fieldName}[${index}]`);
    validateStringIfPresent(item, 'labelZh', `${fieldName}[${index}]`);
    validateStringIfPresent(item, 'summaryZh', `${fieldName}[${index}]`);
  });
}

function validateDailyBrief(dataPayload) {
  const brief = dataPayload.dailyBrief;
  if (brief === undefined) {
    console.warn('[validate-data] Warning: dailyBrief is missing; run npm run build:data with a valid realtime input to generate the v28.0I-1 display-only contract.');
    return;
  }
  assertPlainObject(brief, 'dailyBrief');
  for (const key of [
    'contractVersion',
    'generatedAt',
    'macroState',
    'oneLineConclusion',
    'dominantRiskChain',
    'largestDivergence',
    'keyTriggers',
    'invalidationSignals',
    'dataGaps',
    'confidence',
    'boundaries'
  ]) {
    assert(Object.hasOwn(brief, key), `dailyBrief.${key} is missing`);
  }

  assert(brief.contractVersion === 'v28.0I-1', 'dailyBrief.contractVersion must be v28.0I-1');
  parseIsoTime(brief.generatedAt, 'generatedAt');
  assertString(brief.macroState, 'dailyBrief.macroState');
  assertString(brief.oneLineConclusion, 'dailyBrief.oneLineConclusion');

  const chain = brief.dominantRiskChain;
  assertPlainObject(chain, 'dailyBrief.dominantRiskChain');
  for (const key of ['key', 'labelZh', 'stageZh', 'summaryZh', 'evidence']) {
    assert(Object.hasOwn(chain, key), `dailyBrief.dominantRiskChain.${key} is missing`);
  }
  for (const key of ['key', 'labelZh', 'stageZh', 'summaryZh']) {
    assertString(chain[key], `dailyBrief.dominantRiskChain.${key}`);
  }
  validateDailyBriefEvidence(chain.evidence, 'dailyBrief.dominantRiskChain.evidence');

  const divergence = brief.largestDivergence;
  assertPlainObject(divergence, 'dailyBrief.largestDivergence');
  for (const key of ['key', 'labelZh', 'statusZh', 'summaryZh', 'evidence']) {
    assert(Object.hasOwn(divergence, key), `dailyBrief.largestDivergence.${key} is missing`);
  }
  for (const key of ['key', 'labelZh', 'statusZh', 'summaryZh']) {
    assertString(divergence[key], `dailyBrief.largestDivergence.${key}`);
  }
  validateDailyBriefEvidence(divergence.evidence, 'dailyBrief.largestDivergence.evidence');

  assertArray(brief.keyTriggers, 'dailyBrief.keyTriggers');
  assertArray(brief.invalidationSignals, 'dailyBrief.invalidationSignals');
  assertArray(brief.dataGaps, 'dailyBrief.dataGaps');
  validateDailyBriefEvidence(brief.evidence || [], 'dailyBrief.evidence');

  const confidence = brief.confidence;
  assertPlainObject(confidence, 'dailyBrief.confidence');
  assert(DAILY_BRIEF_CONFIDENCE_LEVELS.has(confidence.level), 'dailyBrief.confidence.level must be low, medium, or high');
  assertFiniteNumber(confidence.score, 'dailyBrief.confidence.score');
  assert(confidence.score >= 0 && confidence.score <= 100, 'dailyBrief.confidence.score must be 0-100');
  assertString(confidence.reasonZh, 'dailyBrief.confidence.reasonZh');

  const boundaries = brief.boundaries;
  assertPlainObject(boundaries, 'dailyBrief.boundaries');
  assert(boundaries.displayOnly === true, 'dailyBrief.boundaries.displayOnly must be true');
  assert(boundaries.affectsScoring === false, 'dailyBrief.boundaries.affectsScoring must be false');
  assert(boundaries.affectsDecisionModel === false, 'dailyBrief.boundaries.affectsDecisionModel must be false');
  assert(boundaries.affectsExecutionLock === false, 'dailyBrief.boundaries.affectsExecutionLock must be false');
  assert(boundaries.affectsPositionGuidance === false, 'dailyBrief.boundaries.affectsPositionGuidance must be false');

  const serializedStrings = collectStrings(brief).join('\n');
  for (const phrase of DAILY_BRIEF_FORBIDDEN_PHRASES) {
    assert(!serializedStrings.includes(phrase), `dailyBrief must not contain forbidden phrase "${phrase}"`);
  }
}

function validateDivergenceEvidence(evidence, fieldName) {
  assertArray(evidence, fieldName);
  evidence.forEach((item, index) => {
    assertPlainObject(item, `${fieldName}[${index}]`);
    for (const key of ['source', 'key', 'labelZh', 'summaryZh']) {
      assert(Object.hasOwn(item, key), `${fieldName}[${index}].${key} is missing`);
      assertString(item[key], `${fieldName}[${index}].${key}`);
    }
    assert(Object.hasOwn(item, 'value'), `${fieldName}[${index}].value is missing`);
  });
}

function validateDivergenceLayer(dataPayload) {
  const layer = dataPayload.divergenceLayer;
  if (layer === undefined) {
    console.warn('[validate-data] Warning: divergenceLayer is missing; run npm run build:data with a valid realtime input to generate the v28.0I-3A audit-only contract.');
    return;
  }
  assertPlainObject(layer, 'divergenceLayer');
  for (const key of [
    'contractVersion',
    'generatedAt',
    'score',
    'state',
    'stateZh',
    'summaryZh',
    'primaryDivergence',
    'checks',
    'dataGaps',
    'confidence',
    'boundaries'
  ]) {
    assert(Object.hasOwn(layer, key), `divergenceLayer.${key} is missing`);
  }

  assert(layer.contractVersion === 'v28.0I-3A', 'divergenceLayer.contractVersion must be v28.0I-3A');
  parseIsoTime(layer.generatedAt, 'generatedAt');
  assertFiniteNumber(layer.score, 'divergenceLayer.score');
  assert(layer.score >= 0 && layer.score <= 100, 'divergenceLayer.score must be 0-100');
  assert(DIVERGENCE_LAYER_STATES.has(layer.state), 'divergenceLayer.state is not supported');
  assertString(layer.stateZh, 'divergenceLayer.stateZh');
  assertString(layer.summaryZh, 'divergenceLayer.summaryZh');

  const primary = layer.primaryDivergence;
  assertPlainObject(primary, 'divergenceLayer.primaryDivergence');
  for (const key of ['key', 'labelZh', 'status', 'statusZh', 'summaryZh', 'evidence']) {
    assert(Object.hasOwn(primary, key), `divergenceLayer.primaryDivergence.${key} is missing`);
  }
  assertString(primary.key, 'divergenceLayer.primaryDivergence.key');
  assertString(primary.labelZh, 'divergenceLayer.primaryDivergence.labelZh');
  assert(DIVERGENCE_CHECK_STATUSES.has(primary.status), 'divergenceLayer.primaryDivergence.status is not supported');
  assertString(primary.statusZh, 'divergenceLayer.primaryDivergence.statusZh');
  assertString(primary.summaryZh, 'divergenceLayer.primaryDivergence.summaryZh');
  validateDivergenceEvidence(primary.evidence, 'divergenceLayer.primaryDivergence.evidence');

  assertArray(layer.checks, 'divergenceLayer.checks');
  assert(layer.checks.length >= 1, 'divergenceLayer.checks must not be empty');
  layer.checks.forEach((check, index) => {
    const fieldName = `divergenceLayer.checks[${index}]`;
    assertPlainObject(check, fieldName);
    for (const key of ['key', 'labelZh', 'category', 'status', 'score', 'summaryZh', 'evidence', 'dataUsed', 'limitations']) {
      assert(Object.hasOwn(check, key), `${fieldName}.${key} is missing`);
    }
    assertString(check.key, `${fieldName}.key`);
    assertString(check.labelZh, `${fieldName}.labelZh`);
    assert(DIVERGENCE_CHECK_CATEGORIES.has(check.category), `${fieldName}.category is not supported`);
    assert(DIVERGENCE_CHECK_STATUSES.has(check.status), `${fieldName}.status is not supported`);
    assertFiniteNumber(check.score, `${fieldName}.score`);
    assert(check.score >= 0 && check.score <= 100, `${fieldName}.score must be 0-100`);
    assertString(check.summaryZh, `${fieldName}.summaryZh`);
    validateDivergenceEvidence(check.evidence, `${fieldName}.evidence`);
    assertArray(check.dataUsed, `${fieldName}.dataUsed`);
    assertArray(check.limitations, `${fieldName}.limitations`);
    check.dataUsed.forEach((item, itemIndex) => assertString(item, `${fieldName}.dataUsed[${itemIndex}]`));
    check.limitations.forEach((item, itemIndex) => assertString(item, `${fieldName}.limitations[${itemIndex}]`));
    if (check.key === 'consumer_vs_asset_pricing') {
      assert(check.category === 'consumer_assets', `${fieldName}.category must be consumer_assets`);
      const limitationsText = check.limitations.join('\n');
      assert(
        /月频|慢变量|非实时/u.test(limitationsText),
        `${fieldName}.limitations must describe monthly, slow-variable, or non-realtime limits`
      );
      assert(!/作为实时信号|实时交易信号$/u.test(limitationsText), `${fieldName}.limitations must not present consumer sentiment as a realtime signal`);
    }
  });

  assertArray(layer.dataGaps, 'divergenceLayer.dataGaps');
  layer.dataGaps.forEach((item, index) => assertString(item, `divergenceLayer.dataGaps[${index}]`));

  const confidence = layer.confidence;
  assertPlainObject(confidence, 'divergenceLayer.confidence');
  assert(DAILY_BRIEF_CONFIDENCE_LEVELS.has(confidence.level), 'divergenceLayer.confidence.level must be low, medium, or high');
  assertFiniteNumber(confidence.score, 'divergenceLayer.confidence.score');
  assert(confidence.score >= 0 && confidence.score <= 100, 'divergenceLayer.confidence.score must be 0-100');
  assertString(confidence.reasonZh, 'divergenceLayer.confidence.reasonZh');

  const boundaries = layer.boundaries;
  assertPlainObject(boundaries, 'divergenceLayer.boundaries');
  assert(boundaries.displayOnly === true, 'divergenceLayer.boundaries.displayOnly must be true');
  assert(boundaries.auditOnly === true, 'divergenceLayer.boundaries.auditOnly must be true');
  assert(boundaries.affectsScoring === false, 'divergenceLayer.boundaries.affectsScoring must be false');
  assert(boundaries.affectsDecisionModel === false, 'divergenceLayer.boundaries.affectsDecisionModel must be false');
  assert(boundaries.affectsExecutionLock === false, 'divergenceLayer.boundaries.affectsExecutionLock must be false');
  assert(boundaries.affectsPositionGuidance === false, 'divergenceLayer.boundaries.affectsPositionGuidance must be false');

  const serializedStrings = collectStrings(layer).join('\n');
  for (const phrase of DAILY_BRIEF_FORBIDDEN_PHRASES) {
    assert(!serializedStrings.includes(phrase), `divergenceLayer must not contain forbidden phrase "${phrase}"`);
  }
}

function validateMacroDriversConsumer(dataPayload) {
  const consumer = dataPayload?.macroDrivers?.consumer;
  if (consumer === undefined) return;
  assertPlainObject(consumer, 'macroDrivers.consumer');
  for (const key of ['umichSentiment', 'previousValue', 'threeMonthChange', 'sixMonthChange']) {
    assert(Object.hasOwn(consumer, key), `macroDrivers.consumer.${key} is missing`);
    assert(isFiniteNumberOrNull(consumer[key]), `macroDrivers.consumer.${key} must be finite number or null`);
  }
  assertString(consumer.regime, 'macroDrivers.consumer.regime');
  assertPlainObject(consumer.sourceStatus, 'macroDrivers.consumer.sourceStatus');
  assert(
    CONSUMER_SOURCE_STATUSES.has(consumer.sourceStatus.umichSentiment),
    'macroDrivers.consumer.sourceStatus.umichSentiment must be live, fallback, or missing'
  );
  assert(
    consumer.updatedAt === null || (typeof consumer.updatedAt === 'string' && Number.isFinite(Date.parse(consumer.updatedAt))),
    'macroDrivers.consumer.updatedAt must be null or parseable ISO string'
  );
  assert(
    VALID_CONSUMER_SOURCES.has(consumer.source),
    `macroDrivers.consumer.source must be one of: ${[...VALID_CONSUMER_SOURCES].join(' | ')}`
  );
  assertArray(consumer.notes, 'macroDrivers.consumer.notes');
  consumer.notes.forEach((item, index) => assertString(item, `macroDrivers.consumer.notes[${index}]`));
}

function validateMacroDriversEmployment(dataPayload) {
  const employment = dataPayload?.macroDrivers?.employment;
  if (employment === undefined) return;
  assertPlainObject(employment, 'macroDrivers.employment');

  for (const key of [
    'initialClaims',
    'initialClaims4wAverage',
    'initialClaims4wChange',
    'continuingClaims',
    'continuingClaims4wAverage',
    'joltsOpenings',
    'joltsOpeningsYoY',
    'averageHourlyEarnings',
    'averageHourlyEarningsYoY',
    'u6Rate',
    'u6Rate3mChange',
    'industryPayrollDiffusionPct',
    'industryPayrollPositiveCount',
    'industryPayrollSeriesCount'
  ]) {
    assert(Object.hasOwn(employment, key), `macroDrivers.employment.${key} is missing`);
    assert(isFiniteNumberOrNull(employment[key]), `macroDrivers.employment.${key} must be finite number or null`);
  }

  assertString(employment.claimsRegime, 'macroDrivers.employment.claimsRegime');
  assert(VALID_CLAIMS_REGIMES.has(employment.claimsRegime), 'macroDrivers.employment.claimsRegime is not supported');
  assertString(employment.joltsRegime, 'macroDrivers.employment.joltsRegime');
  assert(VALID_JOLTS_REGIMES.has(employment.joltsRegime), 'macroDrivers.employment.joltsRegime is not supported');
  assertString(employment.laborQualityRegime, 'macroDrivers.employment.laborQualityRegime');
  assert(VALID_LABOR_QUALITY_REGIMES.has(employment.laborQualityRegime), 'macroDrivers.employment.laborQualityRegime is not supported');
  assertString(employment.industryDiffusionRegime, 'macroDrivers.employment.industryDiffusionRegime');
  assert(VALID_INDUSTRY_DIFFUSION_REGIMES.has(employment.industryDiffusionRegime), 'macroDrivers.employment.industryDiffusionRegime is not supported');

  assertPlainObject(employment.sourceStatus, 'macroDrivers.employment.sourceStatus');
  for (const key of ['icsa', 'ccsa', 'jtsjol', 'ahe', 'u6', 'industryPayroll']) {
    assert(Object.hasOwn(employment.sourceStatus, key), `macroDrivers.employment.sourceStatus.${key} is missing`);
    assert(
      EMPLOYMENT_SOURCE_STATUSES.has(employment.sourceStatus[key]),
      `macroDrivers.employment.sourceStatus.${key} must be live, fallback, or missing`
    );
  }

  assert(
    employment.updatedAt === null || (typeof employment.updatedAt === 'string' && Number.isFinite(Date.parse(employment.updatedAt))),
    'macroDrivers.employment.updatedAt must be null or parseable ISO string'
  );
  assert(
    employment.joltsUpdatedAt === null || (typeof employment.joltsUpdatedAt === 'string' && Number.isFinite(Date.parse(employment.joltsUpdatedAt))),
    'macroDrivers.employment.joltsUpdatedAt must be null or parseable ISO string'
  );
  for (const key of ['averageHourlyEarningsUpdatedAt', 'u6UpdatedAt', 'industryPayrollUpdatedAt']) {
    assert(
      employment[key] === null || (typeof employment[key] === 'string' && Number.isFinite(Date.parse(employment[key]))),
      `macroDrivers.employment.${key} must be null or parseable ISO string`
    );
  }
  if (Number.isFinite(employment.averageHourlyEarningsYoY)) {
    assert(employment.averageHourlyEarningsYoY > -0.5 && employment.averageHourlyEarningsYoY < 0.5, 'macroDrivers.employment.averageHourlyEarningsYoY is out of expected range');
  }
  if (Number.isFinite(employment.u6Rate)) {
    assert(employment.u6Rate >= 0 && employment.u6Rate <= 30, 'macroDrivers.employment.u6Rate is out of expected range');
  }
  if (Number.isFinite(employment.industryPayrollDiffusionPct)) {
    assert(
      employment.industryPayrollDiffusionPct >= 0 && employment.industryPayrollDiffusionPct <= 100,
      'macroDrivers.employment.industryPayrollDiffusionPct must be 0-100'
    );
  }
  if (Number.isFinite(employment.industryPayrollPositiveCount) && Number.isFinite(employment.industryPayrollSeriesCount)) {
    assert(employment.industryPayrollPositiveCount <= employment.industryPayrollSeriesCount, 'macroDrivers.employment industry positive count cannot exceed series count');
  }
  assert(
    VALID_EMPLOYMENT_SOURCES.has(employment.source),
    `macroDrivers.employment.source must be one of: ${[...VALID_EMPLOYMENT_SOURCES].join(' | ')}`
  );
  assertArray(employment.notes, 'macroDrivers.employment.notes');
  employment.notes.forEach((item, index) => assertString(item, `macroDrivers.employment.notes[${index}]`));
}

function validateMacroDriversConsumerRetail(dataPayload) {
  const consumerRetail = dataPayload?.macroDrivers?.consumerRetail;
  if (consumerRetail === undefined) return;
  assertPlainObject(consumerRetail, 'macroDrivers.consumerRetail');

  for (const key of [
    'cartsNominal',
    'cartsNominal4wAverage',
    'cartsNominalYoY',
    'cartsReal',
    'cartsReal4wAverage',
    'cartsRealYoY',
    'segmentPositiveCount',
    'segmentSeriesCount',
    'segmentDiffusionPct',
    'bofaCardSpendingYoY',
    'bofaCardSpendingPriorYoY',
    'bofaCardSpendingExGasYoY',
    'redbookRetailSalesYoY',
    'redbookHistoricalAverageYoY'
  ]) {
    assert(Object.hasOwn(consumerRetail, key), `macroDrivers.consumerRetail.${key} is missing`);
    assert(isFiniteNumberOrNull(consumerRetail[key]), `macroDrivers.consumerRetail.${key} must be finite number or null`);
  }

  for (const key of ['bofaReportDate', 'redbookRetailSalesDate']) {
    assert(Object.hasOwn(consumerRetail, key), `macroDrivers.consumerRetail.${key} is missing`);
    validateNullableIsoString(consumerRetail[key], `macroDrivers.consumerRetail.${key}`);
  }
  for (const key of ['bofaReportUrl', 'bofaPdfUrl', 'bofaStatus', 'bofaSummary', 'redbookReportUrl', 'redbookStatus', 'redbookSummary']) {
    assert(Object.hasOwn(consumerRetail, key), `macroDrivers.consumerRetail.${key} is missing`);
    validateNullableString(consumerRetail[key], `macroDrivers.consumerRetail.${key}`);
  }
  if (consumerRetail.bofaStatus !== null) {
    assert(CONSUMER_RETAIL_SOURCE_STATUSES.has(consumerRetail.bofaStatus), 'macroDrivers.consumerRetail.bofaStatus must be live, fallback, or missing');
  }
  if (consumerRetail.redbookStatus !== null) {
    assert(CONSUMER_RETAIL_SOURCE_STATUSES.has(consumerRetail.redbookStatus), 'macroDrivers.consumerRetail.redbookStatus must be live, fallback, or missing');
  }

  assertString(consumerRetail.retailRegime, 'macroDrivers.consumerRetail.retailRegime');
  assert(VALID_RETAIL_REGIMES.has(consumerRetail.retailRegime), 'macroDrivers.consumerRetail.retailRegime is not supported');
  assertString(consumerRetail.segmentRegime, 'macroDrivers.consumerRetail.segmentRegime');
  assert(VALID_RETAIL_SEGMENT_REGIMES.has(consumerRetail.segmentRegime), 'macroDrivers.consumerRetail.segmentRegime is not supported');
  assertArray(consumerRetail.retailSegments, 'macroDrivers.consumerRetail.retailSegments');
  consumerRetail.retailSegments.forEach((segment, index) => {
    const fieldName = `macroDrivers.consumerRetail.retailSegments[${index}]`;
    assertPlainObject(segment, fieldName);
    for (const key of ['key', 'seriesId', 'labelZh', 'value', 'yoy', 'updatedAt', 'sourceStatus']) {
      assert(Object.hasOwn(segment, key), `${fieldName}.${key} is missing`);
    }
    assertString(segment.key, `${fieldName}.key`);
    assertString(segment.seriesId, `${fieldName}.seriesId`);
    assertString(segment.labelZh, `${fieldName}.labelZh`);
    assert(isFiniteNumberOrNull(segment.value), `${fieldName}.value must be finite number or null`);
    assert(isFiniteNumberOrNull(segment.yoy), `${fieldName}.yoy must be finite number or null`);
    validateNullableIsoString(segment.updatedAt, `${fieldName}.updatedAt`);
    assert(CONSUMER_RETAIL_SOURCE_STATUSES.has(segment.sourceStatus), `${fieldName}.sourceStatus must be live, fallback, or missing`);
  });
  if (consumerRetail.strongestSegment !== null) assertPlainObject(consumerRetail.strongestSegment, 'macroDrivers.consumerRetail.strongestSegment');
  if (consumerRetail.weakestSegment !== null) assertPlainObject(consumerRetail.weakestSegment, 'macroDrivers.consumerRetail.weakestSegment');
  validateNullableIsoString(consumerRetail.segmentUpdatedAt, 'macroDrivers.consumerRetail.segmentUpdatedAt');

  assertPlainObject(consumerRetail.sourceStatus, 'macroDrivers.consumerRetail.sourceStatus');
  for (const key of ['carts', 'cartsr', 'retailSegments', 'bofaConsumerCheckpoint', 'redbookPublicHtml']) {
    assert(Object.hasOwn(consumerRetail.sourceStatus, key), `macroDrivers.consumerRetail.sourceStatus.${key} is missing`);
    assert(
      CONSUMER_RETAIL_SOURCE_STATUSES.has(consumerRetail.sourceStatus[key]),
      `macroDrivers.consumerRetail.sourceStatus.${key} must be live, fallback, or missing`
    );
  }

  assert(
    consumerRetail.updatedAt === null || (typeof consumerRetail.updatedAt === 'string' && Number.isFinite(Date.parse(consumerRetail.updatedAt))),
    'macroDrivers.consumerRetail.updatedAt must be null or parseable ISO string'
  );
  assert(
    VALID_CONSUMER_RETAIL_SOURCES.has(consumerRetail.source),
    `macroDrivers.consumerRetail.source must be one of: ${[...VALID_CONSUMER_RETAIL_SOURCES].join(' | ')}`
  );
  assertArray(consumerRetail.notes, 'macroDrivers.consumerRetail.notes');
  consumerRetail.notes.forEach((item, index) => assertString(item, `macroDrivers.consumerRetail.notes[${index}]`));
}

function validateMacroDriversCommercialRealEstate(dataPayload) {
  const cre = dataPayload?.macroDrivers?.commercialRealEstate;
  if (cre === undefined) return;
  assertPlainObject(cre, 'macroDrivers.commercialRealEstate');

  for (const key of [
    'creDelinquencyRate',
    'creDelinquencyRateQoQChange',
    'creChargeOffRate',
    'creChargeOffRateQoQChange',
    'sloosCreNonfarmNonresidentialTightening',
    'sloosCreConstructionTightening',
    'sloosCreMultifamilyTightening',
    'sloosCreTighteningMax',
    'reitEtfPrice',
    'reitEtf4wChange',
    'mortgageReitEtfPrice',
    'mortgageReitEtf4wChange',
    'cmbsEtfPrice',
    'cmbsEtf4wChange',
    'creLoanBalance',
    'creLoanBalance4wChange',
    'creLoanBalanceYoY'
  ]) {
    assert(Object.hasOwn(cre, key), `macroDrivers.commercialRealEstate.${key} is missing`);
    assert(isFiniteNumberOrNull(cre[key]), `macroDrivers.commercialRealEstate.${key} must be finite number or null`);
  }
  for (const key of ['reitEtf4wChange', 'mortgageReitEtf4wChange', 'cmbsEtf4wChange', 'creLoanBalance4wChange']) {
    validateDecimalRatioRangeIfPresent(cre[key], `macroDrivers.commercialRealEstate.${key}`);
  }
  validateNullableIsoString(cre.reitEtfUpdatedAt, 'macroDrivers.commercialRealEstate.reitEtfUpdatedAt');
  validateNullableIsoString(cre.mortgageReitEtfUpdatedAt, 'macroDrivers.commercialRealEstate.mortgageReitEtfUpdatedAt');
  validateNullableIsoString(cre.cmbsEtfUpdatedAt, 'macroDrivers.commercialRealEstate.cmbsEtfUpdatedAt');
  validateNullableIsoString(cre.creLoanBalanceUpdatedAt, 'macroDrivers.commercialRealEstate.creLoanBalanceUpdatedAt');
  assertString(cre.creLoanBalanceStatus, 'macroDrivers.commercialRealEstate.creLoanBalanceStatus');
  assert(CRE_SOURCE_STATUSES.has(cre.creLoanBalanceStatus), 'macroDrivers.commercialRealEstate.creLoanBalanceStatus is not supported');
  assertString(cre.crePublicMarketProxyRegime, 'macroDrivers.commercialRealEstate.crePublicMarketProxyRegime');
  assert(VALID_CRE_PUBLIC_MARKET_PROXY_REGIMES.has(cre.crePublicMarketProxyRegime), 'macroDrivers.commercialRealEstate.crePublicMarketProxyRegime is not supported');
  assertString(cre.nonPublicCreStatus, 'macroDrivers.commercialRealEstate.nonPublicCreStatus');
  assert(CRE_SOURCE_STATUSES.has(cre.nonPublicCreStatus), 'macroDrivers.commercialRealEstate.nonPublicCreStatus is not supported');

  assertString(cre.creStressRegime, 'macroDrivers.commercialRealEstate.creStressRegime');
  assert(VALID_CRE_STRESS_REGIMES.has(cre.creStressRegime), 'macroDrivers.commercialRealEstate.creStressRegime is not supported');

  assertPlainObject(cre.sourceStatus, 'macroDrivers.commercialRealEstate.sourceStatus');
  for (const key of [
    'delinquency',
    'chargeOff',
    'sloosNonfarmNonresidential',
    'sloosConstruction',
    'sloosMultifamily',
    'reitEtf',
    'mortgageReitEtf',
    'cmbsEtf',
    'creLoanBalance',
    'nonPublicCre'
  ]) {
    assert(Object.hasOwn(cre.sourceStatus, key), `macroDrivers.commercialRealEstate.sourceStatus.${key} is missing`);
    assert(
      CRE_SOURCE_STATUSES.has(cre.sourceStatus[key]),
      `macroDrivers.commercialRealEstate.sourceStatus.${key} must be live, fallback, missing, or manual_required`
    );
  }

  assert(
    cre.updatedAt === null || (typeof cre.updatedAt === 'string' && Number.isFinite(Date.parse(cre.updatedAt))),
    'macroDrivers.commercialRealEstate.updatedAt must be null or parseable ISO string'
  );
  assert(
    VALID_CRE_SOURCES.has(cre.source),
    `macroDrivers.commercialRealEstate.source must be one of: ${[...VALID_CRE_SOURCES].join(' | ')}`
  );
  assertArray(cre.notes, 'macroDrivers.commercialRealEstate.notes');
  cre.notes.forEach((item, index) => assertString(item, `macroDrivers.commercialRealEstate.notes[${index}]`));
}

function validateMacroDriversShippingFreight(dataPayload) {
  const freight = dataPayload?.macroDrivers?.shippingFreight;
  if (freight === undefined) return;
  assertPlainObject(freight, 'macroDrivers.shippingFreight');
  for (const key of [
    'balticDirtyTankerIndex',
    'balticDirtyTankerDailyChangePct',
    'balticCleanTankerIndex',
    'balticCleanTankerDailyChangePct',
    'balticDryIndex',
    'balticDryDailyChangePct'
  ]) {
    assert(Object.hasOwn(freight, key), `macroDrivers.shippingFreight.${key} is missing`);
    assert(isFiniteNumberOrNull(freight[key]), `macroDrivers.shippingFreight.${key} must be finite number or null`);
  }
  for (const key of ['balticDirtyTankerDailyChangePct', 'balticCleanTankerDailyChangePct', 'balticDryDailyChangePct']) {
    validateDecimalRatioRangeIfPresent(freight[key], `macroDrivers.shippingFreight.${key}`);
  }
  for (const key of ['balticDirtyTankerUpdatedAt', 'balticCleanTankerUpdatedAt', 'balticDryUpdatedAt', 'updatedAt']) {
    assert(Object.hasOwn(freight, key), `macroDrivers.shippingFreight.${key} is missing`);
    validateNullableIsoString(freight[key], `macroDrivers.shippingFreight.${key}`);
  }
  for (const key of ['tankerFreightRegime', 'cleanTankerFreightRegime', 'dryBulkFreightRegime', 'freightStressRegime']) {
    assertString(freight[key], `macroDrivers.shippingFreight.${key}`);
    assert(VALID_FREIGHT_REGIMES.has(freight[key]), `macroDrivers.shippingFreight.${key} is not supported`);
  }
  assertPlainObject(freight.sourceStatus, 'macroDrivers.shippingFreight.sourceStatus');
  for (const key of ['dirtyTanker', 'cleanTanker', 'dryBulk']) {
    assert(Object.hasOwn(freight.sourceStatus, key), `macroDrivers.shippingFreight.sourceStatus.${key} is missing`);
    assert(SHIPPING_FREIGHT_SOURCE_STATUSES.has(freight.sourceStatus[key]), `macroDrivers.shippingFreight.sourceStatus.${key} must be live, fallback, or missing`);
  }
  assert(freight.source === VALID_SHIPPING_FREIGHT_SOURCE, `macroDrivers.shippingFreight.source must be ${VALID_SHIPPING_FREIGHT_SOURCE}`);
  assertArray(freight.notes, 'macroDrivers.shippingFreight.notes');
  freight.notes.forEach((item, index) => assertString(item, `macroDrivers.shippingFreight.notes[${index}]`));
}

function validateMacroDriversEnergySpareCapacity(dataPayload) {
  const layer = dataPayload?.macroDrivers?.energySpareCapacity;
  // expand-then-contract: current committed snapshots may not have this new display-only layer yet.
  if (layer === undefined) return;
  assertPlainObject(layer, 'macroDrivers.energySpareCapacity');
  for (const key of ['spareCapacityMbpd', 'forecast12mMbpd', 'forecast18mMbpd']) {
    assert(Object.hasOwn(layer, key), `macroDrivers.energySpareCapacity.${key} is missing`);
    assert(isFiniteNumberOrNull(layer[key]), `macroDrivers.energySpareCapacity.${key} must be finite number or null`);
  }
  for (const key of ['latestPeriod', 'forecast12mPeriod', 'forecast18mPeriod']) {
    assert(Object.hasOwn(layer, key), `macroDrivers.energySpareCapacity.${key} is missing`);
    assert(layer[key] === null || (typeof layer[key] === 'string' && /^\d{4}-\d{2}$/u.test(layer[key])),
      `macroDrivers.energySpareCapacity.${key} must be YYYY-MM or null`);
  }
  assert(Object.hasOwn(layer, 'latestIsForecast'), 'macroDrivers.energySpareCapacity.latestIsForecast is missing');
  assert(layer.latestIsForecast === null || typeof layer.latestIsForecast === 'boolean',
    'macroDrivers.energySpareCapacity.latestIsForecast must be boolean or null');
  assertString(layer.bufferRegime, 'macroDrivers.energySpareCapacity.bufferRegime');
  assert(VALID_ENERGY_SPARE_CAPACITY_REGIMES.has(layer.bufferRegime), 'macroDrivers.energySpareCapacity.bufferRegime is not supported');
  assertPlainObject(layer.sourceStatus, 'macroDrivers.energySpareCapacity.sourceStatus');
  assert(Object.hasOwn(layer.sourceStatus, 'spareCapacity'), 'macroDrivers.energySpareCapacity.sourceStatus.spareCapacity is missing');
  assert(ENERGY_SPARE_CAPACITY_SOURCE_STATUSES.has(layer.sourceStatus.spareCapacity),
    'macroDrivers.energySpareCapacity.sourceStatus.spareCapacity is not supported');
  assert(layer.source === VALID_ENERGY_SPARE_CAPACITY_SOURCE,
    `macroDrivers.energySpareCapacity.source must be ${VALID_ENERGY_SPARE_CAPACITY_SOURCE}`);
  assert(layer.unit === VALID_ENERGY_SPARE_CAPACITY_UNIT,
    `macroDrivers.energySpareCapacity.unit must be ${VALID_ENERGY_SPARE_CAPACITY_UNIT}`);
  assert(layer.frequency === VALID_ENERGY_SPARE_CAPACITY_FREQUENCY,
    `macroDrivers.energySpareCapacity.frequency must be ${VALID_ENERGY_SPARE_CAPACITY_FREQUENCY}`);
  validateNullableIsoString(layer.updatedAt, 'macroDrivers.energySpareCapacity.updatedAt');
  validateNullableIsoString(layer.fetchedAt, 'macroDrivers.energySpareCapacity.fetchedAt');
  validateNullableString(layer.fetchReason, 'macroDrivers.energySpareCapacity.fetchReason');
  assertString(layer.sourceUrl, 'macroDrivers.energySpareCapacity.sourceUrl');
  assertString(layer.limitationZh, 'macroDrivers.energySpareCapacity.limitationZh');
  assert(
    /estimate|forecast|估算|预测/u.test(layer.limitationZh) &&
    /不是实时|not real-time|not.*price|油价预测/u.test(layer.limitationZh),
    'macroDrivers.energySpareCapacity.limitationZh must disclose estimate/forecast and non-real-time/non-price boundary'
  );
  assertArray(layer.notes, 'macroDrivers.energySpareCapacity.notes');
  layer.notes.forEach((item, index) => assertString(item, `macroDrivers.energySpareCapacity.notes[${index}]`));

  const status = layer.sourceStatus.spareCapacity;
  if (status === 'live' || status === 'fallback') {
    assert(Number.isFinite(layer.spareCapacityMbpd) && layer.spareCapacityMbpd >= 0 && layer.spareCapacityMbpd <= 15,
      'macroDrivers.energySpareCapacity.spareCapacityMbpd must be finite in [0,15] when live/fallback');
    assert(layer.latestPeriod !== null, 'macroDrivers.energySpareCapacity.latestPeriod must be present when live/fallback');
  } else {
    assert(layer.spareCapacityMbpd === null,
      `macroDrivers.energySpareCapacity.spareCapacityMbpd must be null when sourceStatus is ${status}`);
  }
}

function assertNoForbiddenEnergyTransportKeys(value, pathName) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenEnergyTransportKeys(item, `${pathName}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert(!ENERGY_TRANSPORT_FORBIDDEN_KEYS.has(key), `${pathName}.${key} is forbidden for macroDrivers.energyTransport`);
    assertNoForbiddenEnergyTransportKeys(child, `${pathName}.${key}`);
  }
}

function validateEnergyTransportLatest(latest, fieldName) {
  assertPlainObject(latest, fieldName);
  assert(Object.hasOwn(latest, 'date'), `${fieldName}.date is missing`);
  assert(latest.date === null || (typeof latest.date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(latest.date)),
    `${fieldName}.date must be YYYY-MM-DD or null`);
  for (const key of ['nTanker', 'nTotal', 'capacityTanker', 'capacityTotal']) {
    assert(Object.hasOwn(latest, key), `${fieldName}.${key} is missing`);
    assert(isFiniteNumberOrNull(latest[key]), `${fieldName}.${key} must be finite number or null`);
    if (Number.isFinite(latest[key])) assert(latest[key] >= 0, `${fieldName}.${key} must be non-negative`);
  }
}

function validateEnergyTransportAverage(avg, fieldName) {
  assertPlainObject(avg, fieldName);
  for (const key of ['nTanker', 'capacityTanker']) {
    assert(Object.hasOwn(avg, key), `${fieldName}.${key} is missing`);
    assert(isFiniteNumberOrNull(avg[key]), `${fieldName}.${key} must be finite number or null`);
    if (Number.isFinite(avg[key])) assert(avg[key] >= 0, `${fieldName}.${key} must be non-negative`);
  }
}

function validateEnergyTransportChokepoint(node, fieldName) {
  assertPlainObject(node, fieldName);
  for (const key of ['portid', 'portname', 'latest', 'avg7d', 'avg30d', 'latestVs30dPct', 'capacityTankerVs30dPct', 'sourceStatus']) {
    assert(Object.hasOwn(node, key), `${fieldName}.${key} is missing`);
  }
  assertString(node.portid, `${fieldName}.portid`);
  assertString(node.portname, `${fieldName}.portname`);
  validateEnergyTransportLatest(node.latest, `${fieldName}.latest`);
  validateEnergyTransportAverage(node.avg7d, `${fieldName}.avg7d`);
  validateEnergyTransportAverage(node.avg30d, `${fieldName}.avg30d`);
  validateDecimalRatioRangeIfPresent(node.latestVs30dPct, `${fieldName}.latestVs30dPct`);
  validateDecimalRatioRangeIfPresent(node.capacityTankerVs30dPct, `${fieldName}.capacityTankerVs30dPct`);
  assertString(node.sourceStatus, `${fieldName}.sourceStatus`);
  assert(ENERGY_TRANSPORT_CHOKEPOINT_STATUSES.has(node.sourceStatus), `${fieldName}.sourceStatus is not supported`);
}

function validateMacroDriversEnergyTransport(dataPayload) {
  const layer = dataPayload?.macroDrivers?.energyTransport;
  // expand-then-contract: current committed snapshots may omit this new display-only layer until first Daily run.
  if (layer === undefined) return;
  assertPlainObject(layer, 'macroDrivers.energyTransport');
  assertNoForbiddenEnergyTransportKeys(layer, 'macroDrivers.energyTransport');

  for (const key of [
    'source',
    'sourceUrl',
    'queryUrl',
    'sourceStatus',
    'usageTermsPinned',
    'redistributionCaveat',
    'latestDate',
    'latestAgeDays',
    'windowDays',
    'fetchedAt',
    'lastEditDate',
    'fetchReason',
    'chokepoints',
    'reroutingProxy',
    'limitationZh',
    'notes'
  ]) {
    assert(Object.hasOwn(layer, key), `macroDrivers.energyTransport.${key} is missing`);
  }

  assert(layer.source === VALID_ENERGY_TRANSPORT_SOURCE,
    `macroDrivers.energyTransport.source must be ${VALID_ENERGY_TRANSPORT_SOURCE}`);
  assertString(layer.sourceUrl, 'macroDrivers.energyTransport.sourceUrl');
  assertString(layer.queryUrl, 'macroDrivers.energyTransport.queryUrl');
  assertPlainObject(layer.sourceStatus, 'macroDrivers.energyTransport.sourceStatus');
  assertString(layer.sourceStatus.chokepoints, 'macroDrivers.energyTransport.sourceStatus.chokepoints');
  assert(ENERGY_TRANSPORT_SOURCE_STATUSES.has(layer.sourceStatus.chokepoints),
    'macroDrivers.energyTransport.sourceStatus.chokepoints is not supported');
  assert(layer.usageTermsPinned === VALID_ENERGY_TRANSPORT_USAGE_TERMS,
    `macroDrivers.energyTransport.usageTermsPinned must be ${VALID_ENERGY_TRANSPORT_USAGE_TERMS}`);
  assert(layer.redistributionCaveat === true,
    'macroDrivers.energyTransport.redistributionCaveat must be true');
  assert(layer.latestDate === null || (typeof layer.latestDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(layer.latestDate)),
    'macroDrivers.energyTransport.latestDate must be YYYY-MM-DD or null');
  assert(isFiniteNumberOrNull(layer.latestAgeDays), 'macroDrivers.energyTransport.latestAgeDays must be finite number or null');
  if (Number.isFinite(layer.latestAgeDays)) assert(layer.latestAgeDays >= 0, 'macroDrivers.energyTransport.latestAgeDays must be non-negative');
  assert(Number.isInteger(layer.windowDays) && layer.windowDays > 0 && layer.windowDays <= 366,
    'macroDrivers.energyTransport.windowDays must be a positive integer <= 366');
  validateNullableIsoString(layer.fetchedAt, 'macroDrivers.energyTransport.fetchedAt');
  validateNullableIsoString(layer.lastEditDate, 'macroDrivers.energyTransport.lastEditDate');
  validateNullableString(layer.fetchReason, 'macroDrivers.energyTransport.fetchReason');

  assertPlainObject(layer.chokepoints, 'macroDrivers.energyTransport.chokepoints');
  const seenKeys = Object.keys(layer.chokepoints);
  for (const key of seenKeys) {
    assert(ENERGY_TRANSPORT_CHOKEPOINT_KEYS.includes(key), `macroDrivers.energyTransport.chokepoints.${key} is not approved`);
  }
  for (const key of ENERGY_TRANSPORT_CHOKEPOINT_KEYS) {
    assert(Object.hasOwn(layer.chokepoints, key), `macroDrivers.energyTransport.chokepoints.${key} is missing`);
    validateEnergyTransportChokepoint(layer.chokepoints[key], `macroDrivers.energyTransport.chokepoints.${key}`);
  }

  assertPlainObject(layer.reroutingProxy, 'macroDrivers.energyTransport.reroutingProxy');
  assertString(layer.reroutingProxy.redSeaToCapeRegime, 'macroDrivers.energyTransport.reroutingProxy.redSeaToCapeRegime');
  assert(VALID_ENERGY_TRANSPORT_REROUTING_REGIMES.has(layer.reroutingProxy.redSeaToCapeRegime),
    'macroDrivers.energyTransport.reroutingProxy.redSeaToCapeRegime is not supported');
  for (const key of ['suezBabTankerVs30dPct', 'capeTankerVs30dPct']) {
    assert(Object.hasOwn(layer.reroutingProxy, key), `macroDrivers.energyTransport.reroutingProxy.${key} is missing`);
    validateDecimalRatioRangeIfPresent(layer.reroutingProxy[key], `macroDrivers.energyTransport.reroutingProxy.${key}`);
  }
  assertArray(layer.reroutingProxy.notes, 'macroDrivers.energyTransport.reroutingProxy.notes');
  layer.reroutingProxy.notes.forEach((item, index) => assertString(item, `macroDrivers.energyTransport.reroutingProxy.notes[${index}]`));

  assertString(layer.limitationZh, 'macroDrivers.energyTransport.limitationZh');
  assert(
    /AIS-derived|AIS 派生|AIS/u.test(layer.limitationZh) &&
    /spoofing|jamming|going dark|data lag|扭曲/u.test(layer.limitationZh) &&
    /不是官方|非官方|not official/u.test(layer.limitationZh) &&
    /战争概率|war probability|油价预测|oil price/u.test(layer.limitationZh),
    'macroDrivers.energyTransport.limitationZh must disclose AIS proxy, spoofing/jamming limitations, non-official boundary, and no war/oil-price prediction'
  );
  assertArray(layer.notes, 'macroDrivers.energyTransport.notes');
  layer.notes.forEach((item, index) => assertString(item, `macroDrivers.energyTransport.notes[${index}]`));

  const status = layer.sourceStatus.chokepoints;
  if (status === 'live' || status === 'fallback') {
    assert(layer.latestDate !== null, 'macroDrivers.energyTransport.latestDate must be present when live/fallback');
    assert(Number.isFinite(layer.latestAgeDays), 'macroDrivers.energyTransport.latestAgeDays must be finite when live/fallback');
    for (const key of ENERGY_TRANSPORT_CORE_KEYS) {
      const node = layer.chokepoints[key];
      assert(node.latest.date === layer.latestDate, `macroDrivers.energyTransport.chokepoints.${key}.latest.date must match latestDate when live/fallback`);
      assert(Number.isFinite(node.latest.nTanker), `macroDrivers.energyTransport.chokepoints.${key}.latest.nTanker must be finite when live/fallback`);
      assert(Number.isFinite(node.latest.capacityTanker), `macroDrivers.energyTransport.chokepoints.${key}.latest.capacityTanker must be finite when live/fallback`);
    }
  } else {
    assert(layer.latestDate === null || status === 'stale',
      `macroDrivers.energyTransport.latestDate must be null unless sourceStatus is stale, live, or fallback (status=${status})`);
  }
}

function validateFedFundsFuturesCurve(curve) {
  assertPlainObject(curve, 'macroDrivers.policyExpectations.fedFundsFuturesCurve');
  for (const key of ['source', 'curveStatus', 'updatedAt', 'frontImpliedRate', 'backImpliedRate', 'frontMinusBack', 'contracts', 'limitationZh']) {
    assert(Object.hasOwn(curve, key), `macroDrivers.policyExpectations.fedFundsFuturesCurve.${key} is missing`);
  }
  assertString(curve.source, 'macroDrivers.policyExpectations.fedFundsFuturesCurve.source');
  assert(FED_FUNDS_FUTURES_CURVE_STATUSES.has(curve.curveStatus), 'macroDrivers.policyExpectations.fedFundsFuturesCurve.curveStatus is not supported');
  validateNullableIsoString(curve.updatedAt, 'macroDrivers.policyExpectations.fedFundsFuturesCurve.updatedAt');
  for (const key of ['frontImpliedRate', 'backImpliedRate', 'frontMinusBack']) {
    assert(isFiniteNumberOrNull(curve[key]), `macroDrivers.policyExpectations.fedFundsFuturesCurve.${key} must be finite number or null`);
  }
  assertArray(curve.contracts, 'macroDrivers.policyExpectations.fedFundsFuturesCurve.contracts');
  curve.contracts.forEach((contract, index) => {
    const fieldName = `macroDrivers.policyExpectations.fedFundsFuturesCurve.contracts[${index}]`;
    assertPlainObject(contract, fieldName);
    for (const key of ['symbol', 'contractMonth', 'price', 'impliedRate', 'impliedMinusTargetMid', 'updatedAt']) {
      assert(Object.hasOwn(contract, key), `${fieldName}.${key} is missing`);
    }
    assertString(contract.symbol, `${fieldName}.symbol`);
    assertString(contract.contractMonth, `${fieldName}.contractMonth`);
    for (const key of ['price', 'impliedRate', 'impliedMinusTargetMid']) {
      assert(isFiniteNumberOrNull(contract[key]), `${fieldName}.${key} must be finite number or null`);
    }
    validateNullableIsoString(contract.updatedAt, `${fieldName}.updatedAt`);
  });
  assertString(curve.limitationZh, 'macroDrivers.policyExpectations.fedFundsFuturesCurve.limitationZh');
}

function validateSofrFuturesCurve(curve) {
  assertPlainObject(curve, 'macroDrivers.policyExpectations.sofrFuturesCurve');
  for (const key of ['source', 'curveStatus', 'updatedAt', 'frontImpliedRate', 'backImpliedRate', 'frontMinusBack', 'contracts', 'limitationZh']) {
    assert(Object.hasOwn(curve, key), `macroDrivers.policyExpectations.sofrFuturesCurve.${key} is missing`);
  }
  assertString(curve.source, 'macroDrivers.policyExpectations.sofrFuturesCurve.source');
  assert(SOFR_FUTURES_CURVE_STATUSES.has(curve.curveStatus), 'macroDrivers.policyExpectations.sofrFuturesCurve.curveStatus is not supported');
  validateNullableIsoString(curve.updatedAt, 'macroDrivers.policyExpectations.sofrFuturesCurve.updatedAt');
  for (const key of ['frontImpliedRate', 'backImpliedRate', 'frontMinusBack']) {
    assert(isFiniteNumberOrNull(curve[key]), `macroDrivers.policyExpectations.sofrFuturesCurve.${key} must be finite number or null`);
  }
  assertArray(curve.contracts, 'macroDrivers.policyExpectations.sofrFuturesCurve.contracts');
  curve.contracts.forEach((contract, index) => {
    const fieldName = `macroDrivers.policyExpectations.sofrFuturesCurve.contracts[${index}]`;
    assertPlainObject(contract, fieldName);
    for (const key of ['symbol', 'contractMonth', 'price', 'impliedRate', 'impliedMinusTargetMid', 'updatedAt']) {
      assert(Object.hasOwn(contract, key), `${fieldName}.${key} is missing`);
    }
    assertString(contract.symbol, `${fieldName}.symbol`);
    assertString(contract.contractMonth, `${fieldName}.contractMonth`);
    for (const key of ['price', 'impliedRate', 'impliedMinusTargetMid']) {
      assert(isFiniteNumberOrNull(contract[key]), `${fieldName}.${key} must be finite number or null`);
    }
    validateNullableIsoString(contract.updatedAt, `${fieldName}.updatedAt`);
  });
  assertString(curve.limitationZh, 'macroDrivers.policyExpectations.sofrFuturesCurve.limitationZh');
}

function validateOisForwardCurve(curve) {
  assertPlainObject(curve, 'macroDrivers.policyExpectations.oisForwardCurve');
  for (const key of ['source', 'sourceUrl', 'curveStatus', 'date', 'updatedAt', 'oneYearRate', 'twoYearRate', 'fiveYearRate', 'tenYearRate', 'twoMinusTargetMid', 'tenMinusTwo', 'tenors', 'limitationZh']) {
    assert(Object.hasOwn(curve, key), `macroDrivers.policyExpectations.oisForwardCurve.${key} is missing`);
  }
  assertString(curve.source, 'macroDrivers.policyExpectations.oisForwardCurve.source');
  validateNullableString(curve.sourceUrl, 'macroDrivers.policyExpectations.oisForwardCurve.sourceUrl');
  assert(OIS_FORWARD_CURVE_STATUSES.has(curve.curveStatus), 'macroDrivers.policyExpectations.oisForwardCurve.curveStatus is not supported');
  validateNullableString(curve.date, 'macroDrivers.policyExpectations.oisForwardCurve.date');
  validateNullableIsoString(curve.updatedAt, 'macroDrivers.policyExpectations.oisForwardCurve.updatedAt');
  for (const key of ['oneYearRate', 'twoYearRate', 'fiveYearRate', 'tenYearRate', 'twoMinusTargetMid', 'tenMinusTwo']) {
    assert(isFiniteNumberOrNull(curve[key]), `macroDrivers.policyExpectations.oisForwardCurve.${key} must be finite number or null`);
  }
  assertArray(curve.tenors, 'macroDrivers.policyExpectations.oisForwardCurve.tenors');
  curve.tenors.forEach((item, index) => {
    const fieldName = `macroDrivers.policyExpectations.oisForwardCurve.tenors[${index}]`;
    assertPlainObject(item, fieldName);
    for (const key of ['tenor', 'days', 'rate', 'rateBps', 'trades', 'closeTrades', 'method', 'source', 'date']) {
      assert(Object.hasOwn(item, key), `${fieldName}.${key} is missing`);
    }
    assertString(item.tenor, `${fieldName}.tenor`);
    for (const key of ['days', 'rate', 'rateBps', 'trades', 'closeTrades']) {
      assert(isFiniteNumberOrNull(item[key]), `${fieldName}.${key} must be finite number or null`);
    }
    validateNullableString(item.method, `${fieldName}.method`);
    validateNullableString(item.source, `${fieldName}.source`);
    validateNullableString(item.date, `${fieldName}.date`);
  });
  assertString(curve.limitationZh, 'macroDrivers.policyExpectations.oisForwardCurve.limitationZh');
}

function validateMacroDriversPolicyExpectations(dataPayload) {
  const policy = dataPayload?.macroDrivers?.policyExpectations;
  if (policy === undefined) return;
  assertPlainObject(policy, 'macroDrivers.policyExpectations');
  for (const key of [
    'targetLower',
    'targetUpper',
    'targetMid',
    'effectiveFedFundsRate',
    'fedFundsFutureFrontPrice',
    'fedFundsFutureImpliedRate',
    'futureMinusTargetMid',
    'dotPlotMedianCurrentYear',
    'dotPlotMedianNextYear',
    'dotPlotMedianTwoYearsOut',
    'dotPlotMedianLongerRun',
    'hawkishTermCount',
    'dovishTermCount',
    'minutesHawkishTermCount',
    'minutesDovishTermCount',
    'oisForwardRate'
  ]) {
    assert(Object.hasOwn(policy, key), `macroDrivers.policyExpectations.${key} is missing`);
    assert(isFiniteNumberOrNull(policy[key]), `macroDrivers.policyExpectations.${key} must be finite number or null`);
  }
  for (const key of ['targetUpdatedAt', 'futureUpdatedAt', 'sepProjectionDate', 'statementDate', 'minutesDate', 'updatedAt']) {
    assert(Object.hasOwn(policy, key), `macroDrivers.policyExpectations.${key} is missing`);
    validateNullableIsoString(policy[key], `macroDrivers.policyExpectations.${key}`);
  }
  for (const key of ['sepUrl', 'statementUrl', 'statementTargetRangeText', 'minutesUrl', 'minutesSummaryZh']) {
    assert(Object.hasOwn(policy, key), `macroDrivers.policyExpectations.${key} is missing`);
    validateNullableString(policy[key], `macroDrivers.policyExpectations.${key}`);
  }
  validateFedFundsFuturesCurve(policy.fedFundsFuturesCurve);
  validateSofrFuturesCurve(policy.sofrFuturesCurve);
  validateOisForwardCurve(policy.oisForwardCurve);
  assertString(policy.policyTone, 'macroDrivers.policyExpectations.policyTone');
  assert(VALID_POLICY_TONES.has(policy.policyTone), 'macroDrivers.policyExpectations.policyTone is not supported');
  assertString(policy.minutesPolicyTone, 'macroDrivers.policyExpectations.minutesPolicyTone');
  assert(VALID_POLICY_TONES.has(policy.minutesPolicyTone), 'macroDrivers.policyExpectations.minutesPolicyTone is not supported');
  assert(Object.hasOwn(policy, 'minutesTopicCounts'), 'macroDrivers.policyExpectations.minutesTopicCounts is missing');
  if (policy.minutesTopicCounts !== null) {
    assertPlainObject(policy.minutesTopicCounts, 'macroDrivers.policyExpectations.minutesTopicCounts');
    for (const key of ['inflation', 'laborMarket', 'growth', 'financialConditions', 'balanceSheet', 'risks']) {
      assert(Object.hasOwn(policy.minutesTopicCounts, key), `macroDrivers.policyExpectations.minutesTopicCounts.${key} is missing`);
      assert(isFiniteNumberOrNull(policy.minutesTopicCounts[key]), `macroDrivers.policyExpectations.minutesTopicCounts.${key} must be finite number or null`);
    }
  }
  assertString(policy.policyExpectationRegime, 'macroDrivers.policyExpectations.policyExpectationRegime');
  assert(VALID_POLICY_EXPECTATION_REGIMES.has(policy.policyExpectationRegime), 'macroDrivers.policyExpectations.policyExpectationRegime is not supported');
  assertString(policy.oisForwardStatus, 'macroDrivers.policyExpectations.oisForwardStatus');
  assert(POLICY_EXPECTATIONS_SOURCE_STATUSES.has(policy.oisForwardStatus), 'macroDrivers.policyExpectations.oisForwardStatus is not supported');
  assertPlainObject(policy.sourceStatus, 'macroDrivers.policyExpectations.sourceStatus');
  for (const key of ['targetRange', 'fedFundsFuture', 'fedFundsFuturesCurve', 'sofrFuturesCurve', 'sepDotPlot', 'policyStatement', 'fomcMinutes', 'oisForward']) {
    assert(Object.hasOwn(policy.sourceStatus, key), `macroDrivers.policyExpectations.sourceStatus.${key} is missing`);
    assert(POLICY_EXPECTATIONS_SOURCE_STATUSES.has(policy.sourceStatus[key]), `macroDrivers.policyExpectations.sourceStatus.${key} is not supported`);
  }
  assert(policy.source === VALID_POLICY_EXPECTATIONS_SOURCE, `macroDrivers.policyExpectations.source must be ${VALID_POLICY_EXPECTATIONS_SOURCE}`);
  assertArray(policy.notes, 'macroDrivers.policyExpectations.notes');
  policy.notes.forEach((item, index) => assertString(item, `macroDrivers.policyExpectations.notes[${index}]`));
}

function validateMacroDriversPrivateCreditProxy(dataPayload) {
  const proxy = dataPayload?.macroDrivers?.privateCreditProxy;
  if (proxy === undefined) return;
  assertPlainObject(proxy, 'macroDrivers.privateCreditProxy');
  for (const key of ['bdcEtfPrice', 'bdcEtf4wChange', 'pbdcEtfPrice', 'pbdcEtf4wChange', 'seniorLoanEtfPrice', 'seniorLoanEtf4wChange', 'intervalFundNavPrice', 'intervalFundNav4wChange', 'hyOas', 'igOas', 'igMinusHyOas', 'cdxHyPrice', 'cdxIgPrice']) {
    assert(Object.hasOwn(proxy, key), `macroDrivers.privateCreditProxy.${key} is missing`);
    assert(isFiniteNumberOrNull(proxy[key]), `macroDrivers.privateCreditProxy.${key} must be finite number or null`);
  }
  for (const key of ['bdcEtf4wChange', 'pbdcEtf4wChange', 'seniorLoanEtf4wChange', 'intervalFundNav4wChange']) {
    validateDecimalRatioRangeIfPresent(proxy[key], `macroDrivers.privateCreditProxy.${key}`);
  }
  validateNullableIsoString(proxy.bdcEtfUpdatedAt, 'macroDrivers.privateCreditProxy.bdcEtfUpdatedAt');
  validateNullableIsoString(proxy.pbdcEtfUpdatedAt, 'macroDrivers.privateCreditProxy.pbdcEtfUpdatedAt');
  validateNullableIsoString(proxy.seniorLoanEtfUpdatedAt, 'macroDrivers.privateCreditProxy.seniorLoanEtfUpdatedAt');
  validateNullableIsoString(proxy.intervalFundNavUpdatedAt, 'macroDrivers.privateCreditProxy.intervalFundNavUpdatedAt');
  assertString(proxy.intervalFundNavSymbol, 'macroDrivers.privateCreditProxy.intervalFundNavSymbol');
  validateNullableIsoString(proxy.igOasUpdatedAt, 'macroDrivers.privateCreditProxy.igOasUpdatedAt');
  validateNullableString(proxy.cdxHyInstrument, 'macroDrivers.privateCreditProxy.cdxHyInstrument');
  validateNullableString(proxy.cdxIgInstrument, 'macroDrivers.privateCreditProxy.cdxIgInstrument');
  validateNullableIsoString(proxy.cdxHyUpdatedAt, 'macroDrivers.privateCreditProxy.cdxHyUpdatedAt');
  validateNullableIsoString(proxy.cdxIgUpdatedAt, 'macroDrivers.privateCreditProxy.cdxIgUpdatedAt');
  validateNullableIsoString(proxy.updatedAt, 'macroDrivers.privateCreditProxy.updatedAt');
  for (const key of ['intervalFundNavStatus', 'cdxHyStatus', 'cdxIgStatus', 'privateCreditMarksStatus']) {
    assertString(proxy[key], `macroDrivers.privateCreditProxy.${key}`);
    assert(PRIVATE_CREDIT_PROXY_SOURCE_STATUSES.has(proxy[key]), `macroDrivers.privateCreditProxy.${key} is not supported`);
  }
  assertString(proxy.privateCreditProxyRegime, 'macroDrivers.privateCreditProxy.privateCreditProxyRegime');
  assert(VALID_PRIVATE_CREDIT_PROXY_REGIMES.has(proxy.privateCreditProxyRegime), 'macroDrivers.privateCreditProxy.privateCreditProxyRegime is not supported');
  assertPlainObject(proxy.sourceStatus, 'macroDrivers.privateCreditProxy.sourceStatus');
  for (const key of ['bdcEtf', 'pbdcEtf', 'seniorLoanEtf', 'intervalFundNav', 'hyOas', 'igOas', 'cdxHy', 'cdxIg', 'privateCreditMarks']) {
    assert(Object.hasOwn(proxy.sourceStatus, key), `macroDrivers.privateCreditProxy.sourceStatus.${key} is missing`);
    assert(PRIVATE_CREDIT_PROXY_SOURCE_STATUSES.has(proxy.sourceStatus[key]), `macroDrivers.privateCreditProxy.sourceStatus.${key} is not supported`);
  }
  assert(proxy.source === VALID_PRIVATE_CREDIT_PROXY_SOURCE, `macroDrivers.privateCreditProxy.source must be ${VALID_PRIVATE_CREDIT_PROXY_SOURCE}`);
  assertArray(proxy.notes, 'macroDrivers.privateCreditProxy.notes');
  proxy.notes.forEach((item, index) => assertString(item, `macroDrivers.privateCreditProxy.notes[${index}]`));
}

function validateMacroDriversEuroVolatility(dataPayload) {
  const euroVolatility = dataPayload?.macroDrivers?.euroVolatility;
  if (euroVolatility === undefined) return;
  assertPlainObject(euroVolatility, 'macroDrivers.euroVolatility');
  validateNullableIsoString(euroVolatility.updatedAt, 'macroDrivers.euroVolatility.updatedAt');
  assert(euroVolatility.source === VALID_EURO_VOLATILITY_SOURCE, `macroDrivers.euroVolatility.source must be ${VALID_EURO_VOLATILITY_SOURCE}`);
  assertString(euroVolatility.notes, 'macroDrivers.euroVolatility.notes');
  assertString(euroVolatility.sourceStatus, 'macroDrivers.euroVolatility.sourceStatus');
  assert(EURO_VOLATILITY_SOURCE_STATUSES.has(euroVolatility.sourceStatus), 'macroDrivers.euroVolatility.sourceStatus is not supported');
  assert(isFiniteNumberOrNull(euroVolatility.value), 'macroDrivers.euroVolatility.value must be finite number or null');
  validateNullableIsoString(euroVolatility.refDate, 'macroDrivers.euroVolatility.refDate');
  assert(isFiniteNumberOrNull(euroVolatility.changePct), 'macroDrivers.euroVolatility.changePct must be finite number or null');
  validateDecimalRatioRangeIfPresent(euroVolatility.changePct, 'macroDrivers.euroVolatility.changePct');
  if (euroVolatility.value === null) {
    assert(euroVolatility.sourceStatus === 'missing', 'macroDrivers.euroVolatility.sourceStatus must be missing when value is null');
  }
}
function validateMacroDriversWorldEconomy(dataPayload) {
  const worldEconomy = dataPayload?.macroDrivers?.worldEconomy;
  if (worldEconomy === undefined) return;
  assertPlainObject(worldEconomy, 'macroDrivers.worldEconomy');
  validateNullableIsoString(worldEconomy.updatedAt, 'macroDrivers.worldEconomy.updatedAt');
  assert(VALID_WORLD_ECONOMY_SOURCES.has(worldEconomy.source), 'macroDrivers.worldEconomy.source is not a supported worldEconomy source');
  assertString(worldEconomy.notes, 'macroDrivers.worldEconomy.notes');
  assertPlainObject(worldEconomy.sourceStatus, 'macroDrivers.worldEconomy.sourceStatus');

  for (const key of WORLD_ECONOMY_KEYS) {
    if (!Object.hasOwn(worldEconomy, key)) continue;
    assert(Object.hasOwn(worldEconomy.sourceStatus, key), `macroDrivers.worldEconomy.sourceStatus.${key} is missing`);
    assert(WORLD_ECONOMY_SOURCE_STATUSES.has(worldEconomy.sourceStatus[key]), `macroDrivers.worldEconomy.sourceStatus.${key} is not supported`);
    assert(Object.hasOwn(worldEconomy, key), `macroDrivers.worldEconomy.${key} is missing`);
    const item = worldEconomy[key];
    assertPlainObject(item, `macroDrivers.worldEconomy.${key}`);
    assertString(item.symbol, `macroDrivers.worldEconomy.${key}.symbol`);
    assertString(item.labelZh, `macroDrivers.worldEconomy.${key}.labelZh`);
    assert(isFiniteNumberOrNull(item.price), `macroDrivers.worldEconomy.${key}.price must be finite number or null`);
    assert(isFiniteNumberOrNull(item.changePct), `macroDrivers.worldEconomy.${key}.changePct must be finite number or null`);
    validateDecimalRatioRangeIfPresent(item.changePct, `macroDrivers.worldEconomy.${key}.changePct`);
    assertString(item.changeWindow, `macroDrivers.worldEconomy.${key}.changeWindow`);
    validateNullableIsoString(item.updatedAt, `macroDrivers.worldEconomy.${key}.updatedAt`);
    assertString(item.source, `macroDrivers.worldEconomy.${key}.source`);
    assertString(item.sourceStatus, `macroDrivers.worldEconomy.${key}.sourceStatus`);
    assert(WORLD_ECONOMY_SOURCE_STATUSES.has(item.sourceStatus), `macroDrivers.worldEconomy.${key}.sourceStatus is not supported`);
  }
}

function validateMacroDriversChinaEquity(dataPayload) {
  const chinaEquity = dataPayload?.macroDrivers?.chinaEquity;
  if (chinaEquity === undefined) return;
  assertPlainObject(chinaEquity, 'macroDrivers.chinaEquity');
  validateNullableIsoString(chinaEquity.updatedAt, 'macroDrivers.chinaEquity.updatedAt');
  assert(chinaEquity.source === VALID_CHINA_EQUITY_SOURCE, `macroDrivers.chinaEquity.source must be ${VALID_CHINA_EQUITY_SOURCE}`);
  assertString(chinaEquity.notes, 'macroDrivers.chinaEquity.notes');
  assertPlainObject(chinaEquity.sourceStatus, 'macroDrivers.chinaEquity.sourceStatus');

  for (const key of CHINA_EQUITY_KEYS) {
    assert(Object.hasOwn(chinaEquity.sourceStatus, key), `macroDrivers.chinaEquity.sourceStatus.${key} is missing`);
    assert(CHINA_EQUITY_SOURCE_STATUSES.has(chinaEquity.sourceStatus[key]), `macroDrivers.chinaEquity.sourceStatus.${key} is not supported`);
    assert(Object.hasOwn(chinaEquity, key), `macroDrivers.chinaEquity.${key} is missing`);
    const item = chinaEquity[key];
    assertPlainObject(item, `macroDrivers.chinaEquity.${key}`);
    assertString(item.symbol, `macroDrivers.chinaEquity.${key}.symbol`);
    assertString(item.labelZh, `macroDrivers.chinaEquity.${key}.labelZh`);
    assert(isFiniteNumberOrNull(item.price), `macroDrivers.chinaEquity.${key}.price must be finite number or null`);
    assert(isFiniteNumberOrNull(item.changePct), `macroDrivers.chinaEquity.${key}.changePct must be finite number or null`);
    validateDecimalRatioRangeIfPresent(item.changePct, `macroDrivers.chinaEquity.${key}.changePct`);
    assertString(item.changeWindow, `macroDrivers.chinaEquity.${key}.changeWindow`);
    validateNullableIsoString(item.updatedAt, `macroDrivers.chinaEquity.${key}.updatedAt`);
    assertString(item.source, `macroDrivers.chinaEquity.${key}.source`);
    assertString(item.sourceStatus, `macroDrivers.chinaEquity.${key}.sourceStatus`);
    assert(CHINA_EQUITY_SOURCE_STATUSES.has(item.sourceStatus), `macroDrivers.chinaEquity.${key}.sourceStatus is not supported`);
  }
}

function validateMacroDriversInflationEnergy(dataPayload) {
  const inflationEnergy = dataPayload?.macroDrivers?.inflationEnergy;
  if (inflationEnergy === undefined) return;
  assertPlainObject(inflationEnergy, 'macroDrivers.inflationEnergy');
  validateNullableIsoString(inflationEnergy.updatedAt, 'macroDrivers.inflationEnergy.updatedAt');
  assert(inflationEnergy.source === VALID_INFLATION_ENERGY_SOURCE, `macroDrivers.inflationEnergy.source must be ${VALID_INFLATION_ENERGY_SOURCE}`);
  assertString(inflationEnergy.notes, 'macroDrivers.inflationEnergy.notes');
  assertPlainObject(inflationEnergy.sourceStatus, 'macroDrivers.inflationEnergy.sourceStatus');
  for (const key of ['cpi', 'wti']) {
    assert(Object.hasOwn(inflationEnergy.sourceStatus, key), `macroDrivers.inflationEnergy.sourceStatus.${key} is missing`);
    assert(INFLATION_ENERGY_SOURCE_STATUSES.has(inflationEnergy.sourceStatus[key]), `macroDrivers.inflationEnergy.sourceStatus.${key} is not supported`);
  }

  assertPlainObject(inflationEnergy.cpi, 'macroDrivers.inflationEnergy.cpi');
  const cpi = inflationEnergy.cpi;
  for (const field of ['headlineIndex', 'headlineYoY', 'headlineMoM', 'coreIndex', 'coreYoY', 'coreMoM']) {
    assert(isFiniteNumberOrNull(cpi[field]), `macroDrivers.inflationEnergy.cpi.${field} must be finite number or null`);
  }
  assertString(cpi.yoyWindow, 'macroDrivers.inflationEnergy.cpi.yoyWindow');
  assert(cpi.yoyWindow === 'YoY', 'macroDrivers.inflationEnergy.cpi.yoyWindow must be YoY');
  validateNullableIsoString(cpi.updatedAt, 'macroDrivers.inflationEnergy.cpi.updatedAt');
  assert(cpi.source === VALID_INFLATION_CPI_SOURCE, `macroDrivers.inflationEnergy.cpi.source must be ${VALID_INFLATION_CPI_SOURCE}`);
  assertPlainObject(cpi.seriesStatus, 'macroDrivers.inflationEnergy.cpi.seriesStatus');
  for (const key of ['headline', 'core']) {
    assert(Object.hasOwn(cpi.seriesStatus, key), `macroDrivers.inflationEnergy.cpi.seriesStatus.${key} is missing`);
    assert(INFLATION_ENERGY_SOURCE_STATUSES.has(cpi.seriesStatus[key]), `macroDrivers.inflationEnergy.cpi.seriesStatus.${key} is not supported`);
  }
  assertString(cpi.sourceStatus, 'macroDrivers.inflationEnergy.cpi.sourceStatus');
  assert(INFLATION_ENERGY_SOURCE_STATUSES.has(cpi.sourceStatus), 'macroDrivers.inflationEnergy.cpi.sourceStatus is not supported');
  assert(cpi.sourceStatus === inflationEnergy.sourceStatus.cpi, 'macroDrivers.inflationEnergy.cpi.sourceStatus must match parent sourceStatus.cpi');

  assertPlainObject(inflationEnergy.wti, 'macroDrivers.inflationEnergy.wti');
  const wti = inflationEnergy.wti;
  assert(isFiniteNumberOrNull(wti.price), 'macroDrivers.inflationEnergy.wti.price must be finite number or null');
  assert(isFiniteNumberOrNull(wti.changePct), 'macroDrivers.inflationEnergy.wti.changePct must be finite number or null');
  validateDecimalRatioRangeIfPresent(wti.changePct, 'macroDrivers.inflationEnergy.wti.changePct');
  assertString(wti.changeWindow, 'macroDrivers.inflationEnergy.wti.changeWindow');
  assert(wti.changeWindow === '5d', 'macroDrivers.inflationEnergy.wti.changeWindow must be 5d');
  validateNullableIsoString(wti.updatedAt, 'macroDrivers.inflationEnergy.wti.updatedAt');
  assert(wti.source === VALID_INFLATION_WTI_SOURCE, `macroDrivers.inflationEnergy.wti.source must be ${VALID_INFLATION_WTI_SOURCE}`);
  assertString(wti.sourceStatus, 'macroDrivers.inflationEnergy.wti.sourceStatus');
  assert(INFLATION_ENERGY_SOURCE_STATUSES.has(wti.sourceStatus), 'macroDrivers.inflationEnergy.wti.sourceStatus is not supported');
  assert(wti.sourceStatus === inflationEnergy.sourceStatus.wti, 'macroDrivers.inflationEnergy.wti.sourceStatus must match parent sourceStatus.wti');
}

function validateMacroDriversCopperGold(dataPayload) {
  const copperGold = dataPayload?.macroDrivers?.copperGold;
  if (copperGold === undefined) return;
  assertPlainObject(copperGold, 'macroDrivers.copperGold');
  validateNullableIsoString(copperGold.updatedAt, 'macroDrivers.copperGold.updatedAt');
  assert(VALID_COPPER_GOLD_SOURCES.has(copperGold.source), `macroDrivers.copperGold.source must be one of: ${[...VALID_COPPER_GOLD_SOURCES].join(' | ')}`);
  assertString(copperGold.notes, 'macroDrivers.copperGold.notes');
  assertPlainObject(copperGold.sourceStatus, 'macroDrivers.copperGold.sourceStatus');
  for (const key of [...COPPER_GOLD_KEYS, 'ratio']) {
    assert(Object.hasOwn(copperGold.sourceStatus, key), `macroDrivers.copperGold.sourceStatus.${key} is missing`);
    assert(COPPER_GOLD_SOURCE_STATUSES.has(copperGold.sourceStatus[key]), `macroDrivers.copperGold.sourceStatus.${key} is not supported`);
  }

  for (const key of COPPER_GOLD_KEYS) {
    assert(Object.hasOwn(copperGold, key), `macroDrivers.copperGold.${key} is missing`);
    const leg = copperGold[key];
    assertPlainObject(leg, `macroDrivers.copperGold.${key}`);
    assertString(leg.symbol, `macroDrivers.copperGold.${key}.symbol`);
    assertString(leg.labelZh, `macroDrivers.copperGold.${key}.labelZh`);
    assert(isFiniteNumberOrNull(leg.price), `macroDrivers.copperGold.${key}.price must be finite number or null`);
    assert(isFiniteNumberOrNull(leg.changePct), `macroDrivers.copperGold.${key}.changePct must be finite number or null`);
    validateDecimalRatioRangeIfPresent(leg.changePct, `macroDrivers.copperGold.${key}.changePct`);
    assertString(leg.changeWindow, `macroDrivers.copperGold.${key}.changeWindow`);
    assert(VALID_COPPER_GOLD_WINDOWS.has(leg.changeWindow), `macroDrivers.copperGold.${key}.changeWindow must be one of: ${[...VALID_COPPER_GOLD_WINDOWS].join(', ')}`);
    validateNullableIsoString(leg.updatedAt, `macroDrivers.copperGold.${key}.updatedAt`);
    assertString(leg.source, `macroDrivers.copperGold.${key}.source`);
    assertString(leg.sourceStatus, `macroDrivers.copperGold.${key}.sourceStatus`);
    assert(COPPER_GOLD_SOURCE_STATUSES.has(leg.sourceStatus), `macroDrivers.copperGold.${key}.sourceStatus is not supported`);
    assert(leg.sourceStatus === copperGold.sourceStatus[key], `macroDrivers.copperGold.${key}.sourceStatus must match parent sourceStatus.${key}`);
  }

  assert(isFiniteNumberOrNull(copperGold.ratio), 'macroDrivers.copperGold.ratio must be finite number or null');
  assert(isFiniteNumberOrNull(copperGold.ratioChangePct), 'macroDrivers.copperGold.ratioChangePct must be finite number or null');
  validateDecimalRatioRangeIfPresent(copperGold.ratioChangePct, 'macroDrivers.copperGold.ratioChangePct');
  assertString(copperGold.ratioWindow, 'macroDrivers.copperGold.ratioWindow');
  assert(VALID_COPPER_GOLD_WINDOWS.has(copperGold.ratioWindow), `macroDrivers.copperGold.ratioWindow must be one of: ${[...VALID_COPPER_GOLD_WINDOWS].join(', ')}`);
  if (copperGold.ratio === null) {
    assert(copperGold.sourceStatus.ratio === 'missing', 'macroDrivers.copperGold.sourceStatus.ratio must be missing when ratio is null');
  }
}
const VALID_RATE_VOL_SOURCE = 'Yahoo:^MOVE';
const RATE_VOL_SOURCE_STATUSES = new Set(['live', 'fallback', 'stale', 'missing']);

function validateMacroDriversRateVol(dataPayload) {
  const rateVol = dataPayload?.macroDrivers?.rateVol;
  // expand-then-contract: 旧 committed / 降级快照可能没有 rateVol，容忍缺失；Daily 正式写入后再收紧为必备。
  if (rateVol === undefined) return;
  assertPlainObject(rateVol, 'macroDrivers.rateVol');
  assert(isFiniteNumberOrNull(rateVol.move), 'macroDrivers.rateVol.move must be finite number or null');
  validateNullableIsoString(rateVol.moveUpdatedAt, 'macroDrivers.rateVol.moveUpdatedAt');
  assert(isFiniteNumberOrNull(rateVol.moveAgeDays), 'macroDrivers.rateVol.moveAgeDays must be finite number or null');
  assertString(rateVol.moveRegime, 'macroDrivers.rateVol.moveRegime');
  assertString(rateVol.freshnessStatus, 'macroDrivers.rateVol.freshnessStatus');
  assert(rateVol.source === VALID_RATE_VOL_SOURCE, `macroDrivers.rateVol.source must be ${VALID_RATE_VOL_SOURCE}`);
  assertPlainObject(rateVol.sourceStatus, 'macroDrivers.rateVol.sourceStatus');
  assert(RATE_VOL_SOURCE_STATUSES.has(rateVol.sourceStatus.move), 'macroDrivers.rateVol.sourceStatus.move is not supported');
  assertString(rateVol.notes, 'macroDrivers.rateVol.notes');
  // 状态↔数值↔fail-closed 联动硬约束（防坏数据：如 sourceStatus.move='stale' 但 move=200 仍能触发结构信号）。
  // [20,400] 镜像 rules.json macroDrivers.rateVol.plausibleMin/Max（稳定物理区间）；新鲜度阈值不在此断言，
  // 以免与 rules.json maxAgeDays 耦合（freshness 由 resolveRateVol 上游强制 fail-closed）。
  const moveStatus = rateVol.sourceStatus.move;
  if (moveStatus === 'live' || moveStatus === 'fallback') {
    assert(Number.isFinite(rateVol.move) && rateVol.move >= 20 && rateVol.move <= 400,
      'macroDrivers.rateVol.move must be a finite number in [20,400] when sourceStatus.move is live/fallback');
  } else {
    assert(rateVol.move === null,
      `macroDrivers.rateVol.move must be null when sourceStatus.move is "${moveStatus}" (fail-closed)`);
  }
}

function validateMacroDriversChinaBond(dataPayload) {
  const chinaBond = dataPayload?.macroDrivers?.chinaBond;
  if (chinaBond === undefined) return;
  assertPlainObject(chinaBond, 'macroDrivers.chinaBond');
  validateNullableIsoString(chinaBond.updatedAt, 'macroDrivers.chinaBond.updatedAt');
  assert(chinaBond.source === VALID_CHINA_BOND_SOURCE, `macroDrivers.chinaBond.source must be ${VALID_CHINA_BOND_SOURCE}`);
  assertString(chinaBond.notes, 'macroDrivers.chinaBond.notes');
  assertPlainObject(chinaBond.sourceStatus, 'macroDrivers.chinaBond.sourceStatus');
  assert(Object.hasOwn(chinaBond.sourceStatus, 'yield10y'), 'macroDrivers.chinaBond.sourceStatus.yield10y is missing');
  assert(CHINA_BOND_SOURCE_STATUSES.has(chinaBond.sourceStatus.yield10y), 'macroDrivers.chinaBond.sourceStatus.yield10y is not supported');
  assertPlainObject(chinaBond.yield10y, 'macroDrivers.chinaBond.yield10y');
  assert(isFiniteNumberOrNull(chinaBond.yield10y.value), 'macroDrivers.chinaBond.yield10y.value must be finite number or null');
  validateNullableIsoString(chinaBond.yield10y.latestObsDate, 'macroDrivers.chinaBond.yield10y.latestObsDate');
  validateNullableIsoString(chinaBond.yield10y.updatedAt, 'macroDrivers.chinaBond.yield10y.updatedAt');
  assert(chinaBond.yield10y.source === VALID_CHINA_BOND_LEAF_SOURCE, `macroDrivers.chinaBond.yield10y.source must be ${VALID_CHINA_BOND_LEAF_SOURCE}`);
  assertString(chinaBond.yield10y.sourceStatus, 'macroDrivers.chinaBond.yield10y.sourceStatus');
  assert(CHINA_BOND_SOURCE_STATUSES.has(chinaBond.yield10y.sourceStatus), 'macroDrivers.chinaBond.yield10y.sourceStatus is not supported');
  assert(chinaBond.yield10y.sourceStatus === chinaBond.sourceStatus.yield10y, 'macroDrivers.chinaBond.yield10y.sourceStatus must match parent sourceStatus.yield10y');
  if (chinaBond.yield10y.value === null) {
    assert(chinaBond.sourceStatus.yield10y === 'missing', 'macroDrivers.chinaBond.sourceStatus.yield10y must be missing when value is null');
  }
}

function validateMacroDriversCfetsRmb(dataPayload) {
  const cfetsRmb = dataPayload?.macroDrivers?.cfetsRmb;
  if (cfetsRmb === undefined) return;
  assertPlainObject(cfetsRmb, 'macroDrivers.cfetsRmb');
  validateNullableIsoString(cfetsRmb.updatedAt, 'macroDrivers.cfetsRmb.updatedAt');
  assert(cfetsRmb.source === VALID_CFETS_RMB_SOURCE, `macroDrivers.cfetsRmb.source must be ${VALID_CFETS_RMB_SOURCE}`);
  assertString(cfetsRmb.notes, 'macroDrivers.cfetsRmb.notes');
  assertPlainObject(cfetsRmb.sourceStatus, 'macroDrivers.cfetsRmb.sourceStatus');
  assert(Object.hasOwn(cfetsRmb.sourceStatus, 'cfets'), 'macroDrivers.cfetsRmb.sourceStatus.cfets is missing');
  assert(CFETS_RMB_SOURCE_STATUSES.has(cfetsRmb.sourceStatus.cfets), 'macroDrivers.cfetsRmb.sourceStatus.cfets is not supported');
  for (const key of ['cfets', 'bis', 'sdr']) {
    assert(isFiniteNumberOrNull(cfetsRmb[key]), `macroDrivers.cfetsRmb.${key} must be finite number or null`);
  }
  validateNullableIsoString(cfetsRmb.latestObsDate, 'macroDrivers.cfetsRmb.latestObsDate');
  if (cfetsRmb.cfets === null) {
    assert(cfetsRmb.sourceStatus.cfets === 'missing', 'macroDrivers.cfetsRmb.sourceStatus.cfets must be missing when cfets is null');
  }
}

function validateChinaMacroRefMonth(value, fieldName) {
  assert(value === null || /^\d{4}-\d{2}$/u.test(value), `${fieldName} must be YYYY-MM or null`);
}

function validateChinaMacroLeaf(leaf, fieldName, valueKey) {
  assertPlainObject(leaf, fieldName);
  assert(isFiniteNumberOrNull(leaf[valueKey]), `${fieldName}.${valueKey} must be finite number or null`);
  validateChinaMacroRefMonth(leaf.refMonth, `${fieldName}.refMonth`);
  validateNullableIsoString(leaf.publishedAt, `${fieldName}.publishedAt`);
  validateNullableIsoString(leaf.updatedAt, `${fieldName}.updatedAt`);
  assert(leaf.source === null || typeof leaf.source === 'string', `${fieldName}.source must be string or null`);
  assertString(leaf.sourceStatus, `${fieldName}.sourceStatus`);
  assert(CHINA_MACRO_SOURCE_STATUSES.has(leaf.sourceStatus), `${fieldName}.sourceStatus is not supported`);
  if (leaf[valueKey] === null) {
    assert(leaf.sourceStatus === 'missing', `${fieldName}.sourceStatus must be missing when ${valueKey} is null`);
  }
}

function validateMacroDriversChinaInflation(dataPayload) {
  const chinaInflation = dataPayload?.macroDrivers?.chinaInflation;
  if (chinaInflation === undefined) return;
  assertPlainObject(chinaInflation, 'macroDrivers.chinaInflation');
  validateNullableIsoString(chinaInflation.updatedAt, 'macroDrivers.chinaInflation.updatedAt');
  assert(chinaInflation.source === VALID_CHINA_INFLATION_SOURCE, `macroDrivers.chinaInflation.source must be ${VALID_CHINA_INFLATION_SOURCE}`);
  assertString(chinaInflation.notes, 'macroDrivers.chinaInflation.notes');
  assertPlainObject(chinaInflation.sourceStatus, 'macroDrivers.chinaInflation.sourceStatus');
  for (const key of ['cpi', 'ppi']) {
    assert(Object.hasOwn(chinaInflation.sourceStatus, key), `macroDrivers.chinaInflation.sourceStatus.${key} is missing`);
    assert(CHINA_MACRO_SOURCE_STATUSES.has(chinaInflation.sourceStatus[key]), `macroDrivers.chinaInflation.sourceStatus.${key} is not supported`);
    validateChinaMacroLeaf(chinaInflation[key], `macroDrivers.chinaInflation.${key}`, 'yoy');
    assert(chinaInflation[key].sourceStatus === chinaInflation.sourceStatus[key], `macroDrivers.chinaInflation.${key}.sourceStatus must match parent sourceStatus.${key}`);
  }
}

function validateMacroDriversChinaPmi(dataPayload) {
  const chinaPmi = dataPayload?.macroDrivers?.chinaPmi;
  if (chinaPmi === undefined) return;
  assertPlainObject(chinaPmi, 'macroDrivers.chinaPmi');
  validateNullableIsoString(chinaPmi.updatedAt, 'macroDrivers.chinaPmi.updatedAt');
  assert(chinaPmi.source === VALID_CHINA_PMI_SOURCE, `macroDrivers.chinaPmi.source must be ${VALID_CHINA_PMI_SOURCE}`);
  assertString(chinaPmi.notes, 'macroDrivers.chinaPmi.notes');
  assertPlainObject(chinaPmi.sourceStatus, 'macroDrivers.chinaPmi.sourceStatus');
  assert(Object.hasOwn(chinaPmi.sourceStatus, 'pmi'), 'macroDrivers.chinaPmi.sourceStatus.pmi is missing');
  assert(CHINA_MACRO_SOURCE_STATUSES.has(chinaPmi.sourceStatus.pmi), 'macroDrivers.chinaPmi.sourceStatus.pmi is not supported');
  validateChinaMacroLeaf(chinaPmi.pmi, 'macroDrivers.chinaPmi.pmi', 'value');
  assert(chinaPmi.pmi.sourceStatus === chinaPmi.sourceStatus.pmi, 'macroDrivers.chinaPmi.pmi.sourceStatus must match parent sourceStatus.pmi');
}
const CHINA_PROPERTY_PRICE_TIER_VALIDATION = {
  tier1: { label: '一线', cityCount: 4, cities: new Set(['北京', '上海', '广州', '深圳']) },
  tier2: {
    label: '二线',
    cityCount: 31,
    cities: new Set([
      '天津', '石家庄', '太原', '呼和浩特', '沈阳', '大连', '长春', '哈尔滨', '南京', '杭州',
      '宁波', '合肥', '福州', '厦门', '南昌', '济南', '青岛', '郑州', '武汉', '长沙',
      '南宁', '海口', '重庆', '成都', '贵阳', '昆明', '西安', '兰州', '西宁', '银川',
      '乌鲁木齐'
    ])
  },
  tier3: {
    label: '三线',
    cityCount: 35,
    cities: new Set([
      '唐山', '秦皇岛', '包头', '丹东', '锦州', '吉林', '牡丹江', '无锡', '徐州', '扬州',
      '温州', '金华', '蚌埠', '安庆', '泉州', '九江', '赣州', '烟台', '济宁', '洛阳',
      '平顶山', '宜昌', '襄阳', '岳阳', '常德', '韶关', '湛江', '惠州', '桂林', '北海',
      '三亚', '泸州', '南充', '遵义', '大理'
    ])
  }
};
const CHINA_PROPERTY_PRICE_TIER_KEYS = ['tier1', 'tier2', 'tier3'];

function validateChinaPropertyCount(value, fieldName) {
  assert(value === null || (Number.isInteger(value) && value >= 0 && value <= 70), `${fieldName} must be integer 0-70 or null`);
}

function validateChinaPropertyCountSet(node, keys, fieldName, sourceStatus) {
  for (const key of keys) validateChinaPropertyCount(node[key], `${fieldName}.${key}`);
  const values = keys.map((key) => node[key]);
  const allNull = values.every((value) => value === null);
  if (sourceStatus === 'missing') {
    assert(allNull, `${fieldName} counts must be null when sourceStatus is missing`);
    return;
  }
  assert(values.every((value) => Number.isInteger(value)), `${fieldName} counts must be complete when sourceStatus is ${sourceStatus}`);
  assert(values.reduce((sum, value) => sum + value, 0) === 70, `${fieldName} counts must sum to 70`);
}

function validateChinaPropertyCityArray(value, fieldName, tierSpec) {
  assert(Array.isArray(value), `${fieldName} must be an array`);
  const seen = new Set();
  for (const city of value) {
    assertString(city, `${fieldName}[]`);
    assert(tierSpec.cities.has(city), `${fieldName} contains city outside ${tierSpec.label}: ${city}`);
    assert(!seen.has(city), `${fieldName} contains duplicate city: ${city}`);
    seen.add(city);
  }
  return value.length;
}

function validateChinaPropertyTierDirectionSet(node, fieldName, tierSpec) {
  assertPlainObject(node, fieldName);
  const up = validateChinaPropertyCityArray(node.up, `${fieldName}.up`, tierSpec);
  const flat = validateChinaPropertyCityArray(node.flat, `${fieldName}.flat`, tierSpec);
  const down = validateChinaPropertyCityArray(node.down, `${fieldName}.down`, tierSpec);
  const allCities = [...node.up, ...node.flat, ...node.down];
  assert(new Set(allCities).size === allCities.length, `${fieldName} city arrays must not overlap`);
  assert(up + flat + down === tierSpec.cityCount, `${fieldName} up+flat+down must equal ${tierSpec.cityCount}`);
  return up + flat + down;
}

function validateChinaPropertyTierBreakdown(tierBreakdown, fieldName, sourceStatus) {
  if (tierBreakdown === undefined || tierBreakdown === null) return;
  assert(sourceStatus !== 'missing', `${fieldName} must be null or absent when sourceStatus is missing`);
  assertPlainObject(tierBreakdown, fieldName);
  const keys = Object.keys(tierBreakdown);
  assert(keys.length === CHINA_PROPERTY_PRICE_TIER_KEYS.length, `${fieldName} must contain exactly three tiers`);
  let cityCountTotal = 0;
  for (const key of CHINA_PROPERTY_PRICE_TIER_KEYS) {
    const tierSpec = CHINA_PROPERTY_PRICE_TIER_VALIDATION[key];
    const tier = tierBreakdown[key];
    assertPlainObject(tier, `${fieldName}.${key}`);
    assert(tier.label === tierSpec.label, `${fieldName}.${key}.label must be ${tierSpec.label}`);
    assert(tier.cityCount === tierSpec.cityCount, `${fieldName}.${key}.cityCount must be ${tierSpec.cityCount}`);
    validateChinaPropertyTierDirectionSet(tier.new, `${fieldName}.${key}.new`, tierSpec);
    validateChinaPropertyTierDirectionSet(tier.resale, `${fieldName}.${key}.resale`, tierSpec);
    cityCountTotal += tier.cityCount;
  }
  assert(cityCountTotal === 70, `${fieldName} tier cityCount total must be 70`);
}

function validateMacroDriversChinaTsf(dataPayload) {
  const tsf = dataPayload?.macroDrivers?.chinaTsf;
  if (tsf === undefined) return;
  assertPlainObject(tsf, 'macroDrivers.chinaTsf');
  validateNullableIsoString(tsf.updatedAt, 'macroDrivers.chinaTsf.updatedAt');
  assert(tsf.source === VALID_CHINA_TSF_SOURCE, `macroDrivers.chinaTsf.source must be ${VALID_CHINA_TSF_SOURCE}`);
  assertString(tsf.notes, 'macroDrivers.chinaTsf.notes');
  assertString(tsf.sourceStatus, 'macroDrivers.chinaTsf.sourceStatus');
  assert(CHINA_MACRO_SOURCE_STATUSES.has(tsf.sourceStatus), 'macroDrivers.chinaTsf.sourceStatus is not supported');
  validateChinaMacroRefMonth(tsf.refMonth, 'macroDrivers.chinaTsf.refMonth');
  validateNullableIsoString(tsf.publishedAt, 'macroDrivers.chinaTsf.publishedAt');
  assert(CHINA_TSF_COMPONENT_STATUSES.has(tsf.componentsStatus), 'macroDrivers.chinaTsf.componentsStatus is not supported');
  assertArray(tsf.components, 'macroDrivers.chinaTsf.components');

  if (tsf.sourceStatus === 'missing') {
    assert(tsf.stockYoY === null, 'macroDrivers.chinaTsf.stockYoY must be null when missing');
    assert(tsf.ytdIncrementYi === null, 'macroDrivers.chinaTsf.ytdIncrementYi must be null when missing');
    assert(tsf.incrementPeriodLabel === null, 'macroDrivers.chinaTsf.incrementPeriodLabel must be null when missing');
    assert(tsf.componentsStatus === 'missing', 'macroDrivers.chinaTsf.componentsStatus must be missing when sourceStatus missing');
    assert(tsf.components.length === 0, 'macroDrivers.chinaTsf.components must be empty when missing');
    return;
  }

  assert(
    Number.isFinite(tsf.stockYoY) && tsf.stockYoY >= -0.2 && tsf.stockYoY <= 0.5,
    'macroDrivers.chinaTsf.stockYoY must be plausible decimal YoY when live/fallback'
  );
  assert(isFiniteNumberOrNull(tsf.ytdIncrementYi), 'macroDrivers.chinaTsf.ytdIncrementYi must be finite number or null');
  assert(
    tsf.incrementPeriodLabel === null || typeof tsf.incrementPeriodLabel === 'string',
    'macroDrivers.chinaTsf.incrementPeriodLabel must be string or null'
  );

  const seen = new Set();
  for (const [index, component] of tsf.components.entries()) {
    assertPlainObject(component, `macroDrivers.chinaTsf.components[${index}]`);
    assertString(component.key, `macroDrivers.chinaTsf.components[${index}].key`);
    assert(CHINA_TSF_COMPONENT_KEYS.has(component.key), `macroDrivers.chinaTsf.components[${index}].key is not supported`);
    assert(!seen.has(component.key), `macroDrivers.chinaTsf.components[${index}].key must be unique`);
    seen.add(component.key);
    assertString(component.label, `macroDrivers.chinaTsf.components[${index}].label`);
    assert(
      Number.isFinite(component.incrementYi) || component.incrementYi === null,
      `macroDrivers.chinaTsf.components[${index}].incrementYi must be finite number or null`
    );
  }

  if (tsf.componentsStatus === 'complete') {
    assert(tsf.components.length === CHINA_TSF_COMPONENT_KEYS.size, 'macroDrivers.chinaTsf.components must contain 8 items when complete');
    assert(seen.size === CHINA_TSF_COMPONENT_KEYS.size, 'macroDrivers.chinaTsf.components must include all fixed keys when complete');
  } else if (tsf.componentsStatus === 'partial') {
    assert(tsf.components.length > 0 && tsf.components.length < CHINA_TSF_COMPONENT_KEYS.size, 'macroDrivers.chinaTsf.components partial count is invalid');
  } else {
    assert(tsf.components.length === 0, 'macroDrivers.chinaTsf.components must be empty when componentsStatus missing');
  }
}
function validateMacroDriversChinaMlf(dataPayload) {
  const mlf = dataPayload?.macroDrivers?.chinaMlf;
  if (mlf === undefined) return;
  assertPlainObject(mlf, 'macroDrivers.chinaMlf');
  validateNullableIsoString(mlf.updatedAt, 'macroDrivers.chinaMlf.updatedAt');
  assert(mlf.source === VALID_CHINA_MLF_SOURCE, `macroDrivers.chinaMlf.source must be ${VALID_CHINA_MLF_SOURCE}`);
  assertString(mlf.notes, 'macroDrivers.chinaMlf.notes');
  assertString(mlf.sourceStatus, 'macroDrivers.chinaMlf.sourceStatus');
  assert(CHINA_MACRO_SOURCE_STATUSES.has(mlf.sourceStatus), 'macroDrivers.chinaMlf.sourceStatus is not supported');
  assert(
    mlf.opDate === null || (typeof mlf.opDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(mlf.opDate)),
    'macroDrivers.chinaMlf.opDate must be YYYY-MM-DD or null'
  );
  validateNullableIsoString(mlf.publishedAt, 'macroDrivers.chinaMlf.publishedAt');

  if (mlf.sourceStatus === 'missing') {
    assert(mlf.opDate === null, 'macroDrivers.chinaMlf.opDate must be null when missing');
    assert(mlf.publishedAt === null, 'macroDrivers.chinaMlf.publishedAt must be null when missing');
    assert(mlf.operationAmountYi === null, 'macroDrivers.chinaMlf.operationAmountYi must be null when missing');
    assert(mlf.termMonths === null, 'macroDrivers.chinaMlf.termMonths must be null when missing');
    assert(mlf.mlfRate === null, 'macroDrivers.chinaMlf.mlfRate must be null when missing');
    return;
  }

  assert(
    Number.isFinite(mlf.operationAmountYi) && mlf.operationAmountYi >= 1 && mlf.operationAmountYi <= 100000,
    'macroDrivers.chinaMlf.operationAmountYi must be plausible amount in yi'
  );
  assert(Number.isInteger(mlf.termMonths) && mlf.termMonths > 0 && mlf.termMonths <= 120, 'macroDrivers.chinaMlf.termMonths must be 1-120');
  assert(
    mlf.mlfRate === null || (Number.isFinite(mlf.mlfRate) && mlf.mlfRate >= 0.005 && mlf.mlfRate <= 0.05),
    'macroDrivers.chinaMlf.mlfRate must be plausible decimal rate or null'
  );
}
function validateMacroDriversChinaOmo(dataPayload) {
  const omo = dataPayload?.macroDrivers?.chinaOmo;
  if (omo === undefined) return;
  assertPlainObject(omo, 'macroDrivers.chinaOmo');
  validateNullableIsoString(omo.updatedAt, 'macroDrivers.chinaOmo.updatedAt');
  assert(omo.source === VALID_CHINA_OMO_SOURCE, `macroDrivers.chinaOmo.source must be ${VALID_CHINA_OMO_SOURCE}`);
  assertString(omo.notes, 'macroDrivers.chinaOmo.notes');
  assertString(omo.sourceStatus, 'macroDrivers.chinaOmo.sourceStatus');
  assert(CHINA_MACRO_SOURCE_STATUSES.has(omo.sourceStatus), 'macroDrivers.chinaOmo.sourceStatus is not supported');
  assert(
    omo.opDate === null || (typeof omo.opDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(omo.opDate)),
    'macroDrivers.chinaOmo.opDate must be YYYY-MM-DD or null'
  );
  assert(
    omo.announcementNo === null || (Number.isInteger(omo.announcementNo) && omo.announcementNo > 0),
    'macroDrivers.chinaOmo.announcementNo must be a positive integer or null'
  );
  assert(
    omo.operationType === null || CHINA_OMO_OPERATION_TYPES.has(omo.operationType),
    'macroDrivers.chinaOmo.operationType is not supported'
  );
  if (omo.operationType === '无操作') {
    assert(omo.termDays === null, 'macroDrivers.chinaOmo.termDays must be null for no-op');
    assert(omo.operationRate === null, 'macroDrivers.chinaOmo.operationRate must be null for no-op');
    assert(omo.operationAmount === null, 'macroDrivers.chinaOmo.operationAmount must be null for no-op');
    return;
  }
  if (omo.sourceStatus === 'missing') {
    assert(omo.operationType === null, 'macroDrivers.chinaOmo.operationType must be null when missing');
    assert(omo.termDays === null, 'macroDrivers.chinaOmo.termDays must be null when missing');
    assert(omo.operationRate === null, 'macroDrivers.chinaOmo.operationRate must be null when missing');
    assert(omo.operationAmount === null, 'macroDrivers.chinaOmo.operationAmount must be null when missing');
    return;
  }
  assert(['逆回购', '正回购'].includes(omo.operationType), 'macroDrivers.chinaOmo.operationType must be operation type when live/fallback');
  assert(Number.isInteger(omo.termDays) && omo.termDays > 0 && omo.termDays <= 365, 'macroDrivers.chinaOmo.termDays must be 1-365');
  assert(
    Number.isFinite(omo.operationRate) && omo.operationRate >= 0.005 && omo.operationRate <= 0.05,
    'macroDrivers.chinaOmo.operationRate must be plausible decimal rate'
  );
  assert(
    Number.isFinite(omo.operationAmount) && omo.operationAmount >= 0,
    'macroDrivers.chinaOmo.operationAmount must be non-negative'
  );
}
function validateMacroDriversChinaPropertyPrice(dataPayload) {
  const property = dataPayload?.macroDrivers?.chinaPropertyPrice;
  if (property === undefined) return;
  assertPlainObject(property, 'macroDrivers.chinaPropertyPrice');
  validateNullableIsoString(property.updatedAt, 'macroDrivers.chinaPropertyPrice.updatedAt');
  assert(property.source === VALID_CHINA_PROPERTY_PRICE_SOURCE, `macroDrivers.chinaPropertyPrice.source must be ${VALID_CHINA_PROPERTY_PRICE_SOURCE}`);
  assertString(property.notes, 'macroDrivers.chinaPropertyPrice.notes');
  assertString(property.sourceStatus, 'macroDrivers.chinaPropertyPrice.sourceStatus');
  assert(CHINA_MACRO_SOURCE_STATUSES.has(property.sourceStatus), 'macroDrivers.chinaPropertyPrice.sourceStatus is not supported');
  validateChinaMacroRefMonth(property.refMonth, 'macroDrivers.chinaPropertyPrice.refMonth');
  validateNullableIsoString(property.publishedAt, 'macroDrivers.chinaPropertyPrice.publishedAt');
  validateChinaPropertyCountSet(
    property,
    ['newCitiesUp', 'newCitiesFlat', 'newCitiesDown'],
    'macroDrivers.chinaPropertyPrice.new',
    property.sourceStatus
  );
  validateChinaPropertyCountSet(
    property,
    ['resaleCitiesUp', 'resaleCitiesFlat', 'resaleCitiesDown'],
    'macroDrivers.chinaPropertyPrice.resale',
    property.sourceStatus
  );
  validateChinaPropertyTierBreakdown(
    property.tierBreakdown,
    'macroDrivers.chinaPropertyPrice.tierBreakdown',
    property.sourceStatus
  );
}
function validateHistoryWindowBase(node, fieldName, targetObservations, expectedWindowLabel) {
  assertPlainObject(node, fieldName);
  assertString(node.windowStatus, `${fieldName}.windowStatus`);
  assert(HISTORY_WINDOW_STATUSES.has(node.windowStatus), `${fieldName}.windowStatus is not supported`);
  assert(Number.isInteger(node.observations) && node.observations >= 0, `${fieldName}.observations must be non-negative integer`);
  assert(node.targetObservations === targetObservations, `${fieldName}.targetObservations must be ${targetObservations}`);
  assertString(node.windowLabel, `${fieldName}.windowLabel`);
  assert(node.windowLabel === expectedWindowLabel, `${fieldName}.windowLabel must be ${expectedWindowLabel}`);
}

function validateHistoryWindowDatedBase(node, fieldName, targetObservations, expectedWindowLabel) {
  validateHistoryWindowBase(node, fieldName, targetObservations, expectedWindowLabel);
  validateNullableIsoString(node.firstDate, `${fieldName}.firstDate`);
  validateNullableIsoString(node.lastDate, `${fieldName}.lastDate`);
}

function validateHistoryWindowFields(dataPayload) {
  const fields = dataPayload?.historyWindowFields;
  if (fields === undefined) return;
  assertPlainObject(fields, 'historyWindowFields');

  if (fields.hyOasWoW !== undefined) {
    const hy = fields.hyOasWoW;
    validateHistoryWindowBase(hy, 'historyWindowFields.hyOasWoW', 7, '周度变化');
    assert(isFiniteNumberOrNull(hy.changeBp), 'historyWindowFields.hyOasWoW.changeBp must be finite number or null');
    assert(isFiniteNumberOrNull(hy.changePct), 'historyWindowFields.hyOasWoW.changePct must be finite number or null');
    validateDecimalRatioRangeIfPresent(hy.changePct, 'historyWindowFields.hyOasWoW.changePct');
    validateNullableIsoString(hy.priorDate, 'historyWindowFields.hyOasWoW.priorDate');
    validateNullableIsoString(hy.lastDate, 'historyWindowFields.hyOasWoW.lastDate');
  }

  if (fields.dxy12wHigh !== undefined) {
    validateHistoryWindowDatedBase(fields.dxy12wHigh, 'historyWindowFields.dxy12wHigh', 84, '12周');
    assert(isFiniteNumberOrNull(fields.dxy12wHigh.value), 'historyWindowFields.dxy12wHigh.value must be finite number or null');
  }

  if (fields.privateCreditStressZScore !== undefined) {
    const privateCredit = fields.privateCreditStressZScore;
    validateHistoryWindowBase(privateCredit, 'historyWindowFields.privateCreditStressZScore', 84, '12周');
    assert(isFiniteNumberOrNull(privateCredit.headline), 'historyWindowFields.privateCreditStressZScore.headline must be finite number or null');
    assertArray(privateCredit.components, 'historyWindowFields.privateCreditStressZScore.components');
    privateCredit.components.forEach((component, index) => {
      const fieldName = `historyWindowFields.privateCreditStressZScore.components[${index}]`;
      assertPlainObject(component, fieldName);
      assertString(component.key, `${fieldName}.key`);
      assert(isFiniteNumberOrNull(component.z), `${fieldName}.z must be finite number or null`);
      assert(isFiniteNumberOrNull(component.stressZ), `${fieldName}.stressZ must be finite number or null`);
      assert(component.direction === '-z' || component.direction === '+z', `${fieldName}.direction must be -z or +z`);
      assert(Number.isInteger(component.observations) && component.observations >= 0, `${fieldName}.observations must be non-negative integer`);
    });
  }

  if (fields.spx52wHigh !== undefined) {
    validateHistoryWindowDatedBase(fields.spx52wHigh, 'historyWindowFields.spx52wHigh', 364, '52周');
    assert(isFiniteNumberOrNull(fields.spx52wHigh.value), 'historyWindowFields.spx52wHigh.value must be finite number or null');
  }
}

function validateNullableString(value, fieldName) {
  assert(value === null || typeof value === 'string', `${fieldName} must be string or null`);
}

function validateNullableIsoString(value, fieldName) {
  assert(
    value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value))),
    `${fieldName} must be null or parseable ISO string`
  );
}

function validateBrentLayerPriceNode(node, fieldName, expectedLabel = null) {
  assertPlainObject(node, fieldName);
  if (expectedLabel !== null) assert(node.labelZh === expectedLabel, `${fieldName}.labelZh must be ${expectedLabel}`);
  validateStringIfPresent(node, 'labelZh', fieldName);
  assert(Object.hasOwn(node, 'source'), `${fieldName}.source is missing`);
  assert(Object.hasOwn(node, 'value'), `${fieldName}.value is missing`);
  assert(Object.hasOwn(node, 'observedAt'), `${fieldName}.observedAt is missing`);
  assert(Object.hasOwn(node, 'status'), `${fieldName}.status is missing`);
  validateNullableString(node.source, `${fieldName}.source`);
  assert(isFiniteNumberOrNull(node.value), `${fieldName}.value must be finite number or null`);
  validateNullableIsoString(node.observedAt, `${fieldName}.observedAt`);
  assert(BRENT_LAYER_SOURCE_STATUSES.has(node.status), `${fieldName}.status is not supported`);
}

function validateBrentFuturesCurve(curve) {
  assertPlainObject(curve, 'brentPricingLayer.futuresCurve');
  for (const key of ['source', 'sourceUrl', 'curveStatus', 'fetchedAt', 'contracts', 'limitationZh']) {
    assert(Object.hasOwn(curve, key), `brentPricingLayer.futuresCurve.${key} is missing`);
  }
  assertString(curve.source, 'brentPricingLayer.futuresCurve.source');
  validateNullableString(curve.sourceUrl, 'brentPricingLayer.futuresCurve.sourceUrl');
  assert(BRENT_FUTURES_CURVE_STATUSES.has(curve.curveStatus), 'brentPricingLayer.futuresCurve.curveStatus is not supported');
  validateNullableIsoString(curve.fetchedAt, 'brentPricingLayer.futuresCurve.fetchedAt');
  assertArray(curve.contracts, 'brentPricingLayer.futuresCurve.contracts');
  curve.contracts.forEach((contract, index) => {
    const fieldName = `brentPricingLayer.futuresCurve.contracts[${index}]`;
    assertPlainObject(contract, fieldName);
    for (const key of ['contract', 'lastTrade', 'finalSettlement']) {
      assert(Object.hasOwn(contract, key), `${fieldName}.${key} is missing`);
    }
    assertString(contract.contract, `${fieldName}.contract`);
    validateNullableIsoString(contract.lastTrade, `${fieldName}.lastTrade`);
    validateNullableIsoString(contract.finalSettlement, `${fieldName}.finalSettlement`);
  });
  assertString(curve.limitationZh, 'brentPricingLayer.futuresCurve.limitationZh');
}

function validateBrentFuturesPriceCurve(curve) {
  assertPlainObject(curve, 'brentPricingLayer.futuresPriceCurve');
  for (const key of ['source', 'sourceUrl', 'curveStatus', 'updatedAt', 'frontPrice', 'backPrice', 'frontMinusBack', 'slopeRegime', 'contracts', 'limitationZh']) {
    assert(Object.hasOwn(curve, key), `brentPricingLayer.futuresPriceCurve.${key} is missing`);
  }
  assertString(curve.source, 'brentPricingLayer.futuresPriceCurve.source');
  validateNullableString(curve.sourceUrl, 'brentPricingLayer.futuresPriceCurve.sourceUrl');
  assert(BRENT_FUTURES_PRICE_CURVE_STATUSES.has(curve.curveStatus), 'brentPricingLayer.futuresPriceCurve.curveStatus is not supported');
  validateNullableIsoString(curve.updatedAt, 'brentPricingLayer.futuresPriceCurve.updatedAt');
  for (const key of ['frontPrice', 'backPrice', 'frontMinusBack']) {
    assert(isFiniteNumberOrNull(curve[key]), `brentPricingLayer.futuresPriceCurve.${key} must be finite number or null`);
  }
  assertString(curve.slopeRegime, 'brentPricingLayer.futuresPriceCurve.slopeRegime');
  assert(['backwardation', 'contango', 'flat', '未知'].includes(curve.slopeRegime), 'brentPricingLayer.futuresPriceCurve.slopeRegime is not supported');
  assertArray(curve.contracts, 'brentPricingLayer.futuresPriceCurve.contracts');
  curve.contracts.forEach((contract, index) => {
    const fieldName = `brentPricingLayer.futuresPriceCurve.contracts[${index}]`;
    assertPlainObject(contract, fieldName);
    for (const key of ['symbol', 'contractMonth', 'price', 'updatedAt']) {
      assert(Object.hasOwn(contract, key), `${fieldName}.${key} is missing`);
    }
    assertString(contract.symbol, `${fieldName}.symbol`);
    assertString(contract.contractMonth, `${fieldName}.contractMonth`);
    assert(isFiniteNumberOrNull(contract.price), `${fieldName}.price must be finite number or null`);
    validateNullableIsoString(contract.updatedAt, `${fieldName}.updatedAt`);
  });
  assertString(curve.limitationZh, 'brentPricingLayer.futuresPriceCurve.limitationZh');
}

function validateIceBrentFuturesPriceCurve(curve) {
  assertPlainObject(curve, 'brentPricingLayer.iceFuturesPriceCurve');
  for (const key of ['source', 'sourceUrl', 'curveStatus', 'updatedAt', 'frontPrice', 'backPrice', 'frontMinusBack', 'slopeRegime', 'contracts', 'limitationZh']) {
    assert(Object.hasOwn(curve, key), `brentPricingLayer.iceFuturesPriceCurve.${key} is missing`);
  }
  assertString(curve.source, 'brentPricingLayer.iceFuturesPriceCurve.source');
  validateNullableString(curve.sourceUrl, 'brentPricingLayer.iceFuturesPriceCurve.sourceUrl');
  assert(ICE_BRENT_FUTURES_PRICE_CURVE_STATUSES.has(curve.curveStatus), 'brentPricingLayer.iceFuturesPriceCurve.curveStatus is not supported');
  validateNullableIsoString(curve.updatedAt, 'brentPricingLayer.iceFuturesPriceCurve.updatedAt');
  for (const key of ['frontPrice', 'backPrice', 'frontMinusBack']) {
    assert(isFiniteNumberOrNull(curve[key]), `brentPricingLayer.iceFuturesPriceCurve.${key} must be finite number or null`);
  }
  assertString(curve.slopeRegime, 'brentPricingLayer.iceFuturesPriceCurve.slopeRegime');
  assert(['backwardation', 'contango', 'flat', '未知'].includes(curve.slopeRegime), 'brentPricingLayer.iceFuturesPriceCurve.slopeRegime is not supported');
  assertArray(curve.contracts, 'brentPricingLayer.iceFuturesPriceCurve.contracts');
  curve.contracts.forEach((contract, index) => {
    const fieldName = `brentPricingLayer.iceFuturesPriceCurve.contracts[${index}]`;
    assertPlainObject(contract, fieldName);
    for (const key of ['marketId', 'contract', 'price', 'volume', 'updatedAt', 'changePct']) {
      assert(Object.hasOwn(contract, key), `${fieldName}.${key} is missing`);
    }
    assert(Number.isInteger(contract.marketId) || contract.marketId === null, `${fieldName}.marketId must be integer or null`);
    assertString(contract.contract, `${fieldName}.contract`);
    assert(isFiniteNumberOrNull(contract.price), `${fieldName}.price must be finite number or null`);
    assert(Number.isInteger(contract.volume) || contract.volume === null, `${fieldName}.volume must be integer or null`);
    validateNullableIsoString(contract.updatedAt, `${fieldName}.updatedAt`);
    assert(isFiniteNumberOrNull(contract.changePct), `${fieldName}.changePct must be finite number or null`);
    validateDecimalRatioRangeIfPresent(contract.changePct, `${fieldName}.changePct`);
  });
  assertString(curve.limitationZh, 'brentPricingLayer.iceFuturesPriceCurve.limitationZh');
}

function validateEiaBrentSpotProxy(proxy) {
  assertPlainObject(proxy, 'brentPricingLayer.eiaBrentSpotProxy');
  for (const key of ['source', 'sourceUrl', 'price', 'dailyChange', 'updatedAt', 'sourceStatus', 'limitationZh']) {
    assert(Object.hasOwn(proxy, key), `brentPricingLayer.eiaBrentSpotProxy.${key} is missing`);
  }
  assert(proxy.source === 'EIA:RBRTE', 'brentPricingLayer.eiaBrentSpotProxy.source must be EIA:RBRTE');
  assertString(proxy.sourceUrl, 'brentPricingLayer.eiaBrentSpotProxy.sourceUrl');
  assert(isFiniteNumberOrNull(proxy.price), 'brentPricingLayer.eiaBrentSpotProxy.price must be finite number or null');
  assert(isFiniteNumberOrNull(proxy.dailyChange), 'brentPricingLayer.eiaBrentSpotProxy.dailyChange must be finite number or null');
  validateNullableIsoString(proxy.updatedAt, 'brentPricingLayer.eiaBrentSpotProxy.updatedAt');
  assert(EIA_BRENT_SPOT_PROXY_STATUSES.has(proxy.sourceStatus), 'brentPricingLayer.eiaBrentSpotProxy.sourceStatus is not supported');
  assertString(proxy.limitationZh, 'brentPricingLayer.eiaBrentSpotProxy.limitationZh');
  assert(
    proxy.price !== 0 || proxy.sourceStatus === 'missing',
    'brentPricingLayer.eiaBrentSpotProxy.price must not render missing data as 0.00'
  );
  assert(
    proxy.limitationZh.includes('不是 Platts Dated Brent') || proxy.limitationZh.includes('not Platts'),
    'brentPricingLayer.eiaBrentSpotProxy.limitationZh must disclose it is not Platts Dated Brent'
  );
}

function validateBrentPricingLayer(dataPayload) {
  const layer = dataPayload.brentPricingLayer;
  if (layer === undefined) {
    console.warn('[validate-data] Warning: brentPricingLayer is missing; run npm run build:data with a valid realtime input to generate the v28.0I-5A audit-only contract.');
    return;
  }
  assertPlainObject(layer, 'brentPricingLayer');
  for (const key of [
    'contractVersion',
    'generatedAt',
    'mode',
    'summaryZh',
    'selectedBrent',
    'publicSpotProxy',
    'futuresProxy',
    'eiaBrentSpotProxy',
    'futuresCurve',
    'futuresPriceCurve',
    'iceFuturesPriceCurve',
    'confirmationSources',
    'proxySpread',
    'promotionAudit',
    'dataGaps',
    'limitations',
    'confidence',
    'boundaries'
  ]) {
    assert(Object.hasOwn(layer, key), `brentPricingLayer.${key} is missing`);
  }

  assert(layer.contractVersion === 'v28.0I-5A', 'brentPricingLayer.contractVersion must be v28.0I-5A');
  parseIsoTime(layer.generatedAt, 'generatedAt');
  assert(layer.mode === 'public_proxy_observation', 'brentPricingLayer.mode must be public_proxy_observation');
  assertString(layer.summaryZh, 'brentPricingLayer.summaryZh');

  validateBrentLayerPriceNode(layer.selectedBrent, 'brentPricingLayer.selectedBrent');
  assertString(layer.selectedBrent.noteZh, 'brentPricingLayer.selectedBrent.noteZh');
  validateBrentLayerPriceNode(layer.publicSpotProxy, 'brentPricingLayer.publicSpotProxy', 'Brent 公开现货代理');
  assertString(layer.publicSpotProxy.limitationZh, 'brentPricingLayer.publicSpotProxy.limitationZh');
  validateBrentLayerPriceNode(layer.futuresProxy, 'brentPricingLayer.futuresProxy', 'Brent 期货代理');
  assertString(layer.futuresProxy.limitationZh, 'brentPricingLayer.futuresProxy.limitationZh');
  validateEiaBrentSpotProxy(layer.eiaBrentSpotProxy);
  validateBrentFuturesCurve(layer.futuresCurve);
  validateBrentFuturesPriceCurve(layer.futuresPriceCurve);
  validateIceBrentFuturesPriceCurve(layer.iceFuturesPriceCurve);

  assertArray(layer.confirmationSources, 'brentPricingLayer.confirmationSources');
  layer.confirmationSources.forEach((source, index) => {
    const fieldName = `brentPricingLayer.confirmationSources[${index}]`;
    assertPlainObject(source, fieldName);
    for (const key of ['source', 'labelZh', 'value', 'observedAt', 'status', 'role', 'participatesInPromotion', 'noteZh']) {
      assert(Object.hasOwn(source, key), `${fieldName}.${key} is missing`);
    }
    assertString(source.source, `${fieldName}.source`);
    assertString(source.labelZh, `${fieldName}.labelZh`);
    assert(isFiniteNumberOrNull(source.value), `${fieldName}.value must be finite number or null`);
    validateNullableIsoString(source.observedAt, `${fieldName}.observedAt`);
    assert(BRENT_CONFIRMATION_STATUSES.has(source.status), `${fieldName}.status is not supported`);
    assert(BRENT_CONFIRMATION_ROLES.has(source.role), `${fieldName}.role is not supported`);
    assertBoolean(source.participatesInPromotion, `${fieldName}.participatesInPromotion`);
    assertString(source.noteZh, `${fieldName}.noteZh`);
  });

  const spread = layer.proxySpread;
  assertPlainObject(spread, 'brentPricingLayer.proxySpread');
  for (const key of ['spotMinusFutures', 'selectedMinusFutures', 'maxProxyDivergencePct']) {
    assert(Object.hasOwn(spread, key), `brentPricingLayer.proxySpread.${key} is missing`);
    assert(isFiniteNumberOrNull(spread[key]), `brentPricingLayer.proxySpread.${key} must be finite number or null`);
  }
  assert(BRENT_PROXY_SPREAD_STATUSES.has(spread.status), 'brentPricingLayer.proxySpread.status is not supported');
  assertString(spread.statusZh, 'brentPricingLayer.proxySpread.statusZh');
  assertString(spread.interpretationZh, 'brentPricingLayer.proxySpread.interpretationZh');

  const promotionAudit = layer.promotionAudit;
  assertPlainObject(promotionAudit, 'brentPricingLayer.promotionAudit');
  assert(promotionAudit.promotionApplied === null || typeof promotionAudit.promotionApplied === 'boolean', 'brentPricingLayer.promotionAudit.promotionApplied must be boolean or null');
  for (const key of ['moveStatus', 'promotionReason', 'selectedSource', 'anchorSource']) {
    validateNullableString(promotionAudit[key], `brentPricingLayer.promotionAudit.${key}`);
  }
  assert(isFiniteNumberOrNull(promotionAudit.anchorAgeHours), 'brentPricingLayer.promotionAudit.anchorAgeHours must be finite number or null');

  assertArray(layer.dataGaps, 'brentPricingLayer.dataGaps');
  assertArray(layer.limitations, 'brentPricingLayer.limitations');
  layer.dataGaps.forEach((item, index) => assertString(item, `brentPricingLayer.dataGaps[${index}]`));
  layer.limitations.forEach((item, index) => assertString(item, `brentPricingLayer.limitations[${index}]`));

  const confidence = layer.confidence;
  assertPlainObject(confidence, 'brentPricingLayer.confidence');
  assert(DAILY_BRIEF_CONFIDENCE_LEVELS.has(confidence.level), 'brentPricingLayer.confidence.level must be low, medium, or high');
  assertFiniteNumber(confidence.score, 'brentPricingLayer.confidence.score');
  assert(confidence.score >= 0 && confidence.score <= 100, 'brentPricingLayer.confidence.score must be 0-100');
  assertString(confidence.reasonZh, 'brentPricingLayer.confidence.reasonZh');

  const boundaries = layer.boundaries;
  assertPlainObject(boundaries, 'brentPricingLayer.boundaries');
  assert(boundaries.displayOnly === true, 'brentPricingLayer.boundaries.displayOnly must be true');
  assert(boundaries.auditOnly === true, 'brentPricingLayer.boundaries.auditOnly must be true');
  assert(boundaries.affectsValuesBrent === false, 'brentPricingLayer.boundaries.affectsValuesBrent must be false');
  assert(boundaries.affectsBrentPromotion === false, 'brentPricingLayer.boundaries.affectsBrentPromotion must be false');
  assert(boundaries.affectsScoring === false, 'brentPricingLayer.boundaries.affectsScoring must be false');
  assert(boundaries.affectsDecisionModel === false, 'brentPricingLayer.boundaries.affectsDecisionModel must be false');
  assert(boundaries.affectsExecutionLock === false, 'brentPricingLayer.boundaries.affectsExecutionLock must be false');
  assert(boundaries.affectsPositionGuidance === false, 'brentPricingLayer.boundaries.affectsPositionGuidance must be false');

  const serializedStrings = collectStrings(layer).join('\n');
  for (const phrase of DAILY_BRIEF_FORBIDDEN_PHRASES) {
    assert(!serializedStrings.includes(phrase), `brentPricingLayer must not contain forbidden phrase "${phrase}"`);
  }
}

function validateAiConfidence(value, fieldName) {
  assert(DAILY_BRIEF_CONFIDENCE_LEVELS.has(value), `${fieldName} must be low, medium, or high`);
}

function validateStringArray(value, fieldName) {
  assertArray(value, fieldName);
  value.forEach((item, index) => assertString(item, `${fieldName}[${index}]`));
}

function validateExternalAiProductionLayer(layer) {
  for (const key of [
    'schemaVersion',
    'status',
    'displayEnabled',
    'generatedAt',
    'updatedAt',
    'sourceMode',
    'provider',
    'model',
    'inputSource',
    'sourceSemantics',
    'summaryZh',
    'facts',
    'inferences',
    'modelJudgments',
    'scenarioHypotheses',
    'dataGaps',
    'invalidationSignals',
    'sourceAttribution',
    'confidence',
    'qualityReview',
    'provenance',
    'freshness',
    'boundaries',
    'auditFlags'
  ]) {
    assert(Object.hasOwn(layer, key), `externalAiInterpretationLayer.${key} is missing`);
  }

  const productionContract = resolveExternalAiProductionContract(layer);
  assert(
    productionContract !== null,
    `externalAiInterpretationLayer source contract must be one of ${[...ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS].join(', ')} with matching sourceMode/inputSource/sourceSemantics`
  );
  assert(layer.status === 'valid', 'externalAiInterpretationLayer.status must be valid');
  assert(typeof layer.displayEnabled === 'boolean', 'externalAiInterpretationLayer.displayEnabled must be boolean');
  parseIsoTime(layer.generatedAt, 'externalAiInterpretationLayer.generatedAt');
  parseIsoTime(layer.updatedAt, 'externalAiInterpretationLayer.updatedAt');
  assert(layer.schemaVersion === productionContract.schemaVersion, `externalAiInterpretationLayer.schemaVersion must be ${productionContract.schemaVersion}`);
  assert(layer.sourceMode === productionContract.sourceMode, `externalAiInterpretationLayer.sourceMode must be ${productionContract.sourceMode}`);
  assert(layer.provider === 'deepseek', 'externalAiInterpretationLayer.provider must be deepseek');
  assert(layer.model === EXTERNAL_AI_PRODUCTION_MODEL, `externalAiInterpretationLayer.model must be ${EXTERNAL_AI_PRODUCTION_MODEL}`);
  assert(layer.inputSource === productionContract.inputSource, `externalAiInterpretationLayer.inputSource must be ${productionContract.inputSource}`);
  assert(layer.sourceSemantics === productionContract.sourceSemantics, `externalAiInterpretationLayer.sourceSemantics must be ${productionContract.sourceSemantics}`);
  assertString(layer.summaryZh, 'externalAiInterpretationLayer.summaryZh');
  validateStringArray(layer.facts, 'externalAiInterpretationLayer.facts');
  validateStringArray(layer.inferences, 'externalAiInterpretationLayer.inferences');
  assertArray(layer.modelJudgments, 'externalAiInterpretationLayer.modelJudgments');
  assertArray(layer.scenarioHypotheses, 'externalAiInterpretationLayer.scenarioHypotheses');
  validateStringArray(layer.dataGaps, 'externalAiInterpretationLayer.dataGaps');
  validateStringArray(layer.invalidationSignals, 'externalAiInterpretationLayer.invalidationSignals');
  validateStringArray(layer.auditFlags, 'externalAiInterpretationLayer.auditFlags');
  for (const flag of productionContract.requiredAuditFlags) {
    assert(layer.auditFlags.includes(flag), `externalAiInterpretationLayer.auditFlags must include ${flag}`);
  }

  assertArray(layer.sourceAttribution, 'externalAiInterpretationLayer.sourceAttribution');
  layer.sourceAttribution.forEach((item, index) => {
    assertPlainObject(item, `externalAiInterpretationLayer.sourceAttribution[${index}]`);
    for (const key of ['sourceLayer', 'field', 'claimType', 'noteZh']) {
      assertString(item[key], `externalAiInterpretationLayer.sourceAttribution[${index}].${key}`);
    }
    assert(
      isAllowedExternalAiProductionSourceLayer(item.sourceLayer, {
        analyst: productionContract.inputSource === EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.inputSource,
      }),
      `externalAiInterpretationLayer.sourceAttribution[${index}].sourceLayer is not allowed: ${item.sourceLayer}`
    );
  });

  const confidence = layer.confidence;
  assertPlainObject(confidence, 'externalAiInterpretationLayer.confidence');
  assert(['low', 'medium'].includes(confidence.level), 'externalAiInterpretationLayer.confidence.level must be low or medium');
  assert(Number.isFinite(confidence.score) && confidence.score >= 0 && confidence.score <= 100, 'externalAiInterpretationLayer.confidence.score must be 0-100');
  if (productionContract.inputSource === EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.inputSource) {
    assert(confidence.score <= EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.maxConfidenceScore, `externalAiInterpretationLayer.confidence.score must be <= ${EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.maxConfidenceScore} for analyst_compact_v1`);
  }
  assertString(confidence.reasonZh, 'externalAiInterpretationLayer.confidence.reasonZh');

  for (const error of validateAnalystPr4StructuredFields(layer, { requireAll: false })) {
    assert(false, `externalAiInterpretationLayer.${error}`);
  }

  const qualityReview = layer.qualityReview;
  assertPlainObject(qualityReview, 'externalAiInterpretationLayer.qualityReview');
  assert(['pass', 'warn'].includes(qualityReview.status), 'externalAiInterpretationLayer.qualityReview.status must be pass or warn');
  assert(qualityReview.recommendation === 'pass_for_manual_review', 'externalAiInterpretationLayer.qualityReview.recommendation must be pass_for_manual_review');
  assert(qualityReview.promotionEligible === false, 'externalAiInterpretationLayer.qualityReview.promotionEligible must be false');
  assertArray(qualityReview.failedDimensions, 'externalAiInterpretationLayer.qualityReview.failedDimensions');
  assertArray(qualityReview.warningDimensions, 'externalAiInterpretationLayer.qualityReview.warningDimensions');
  parseIsoTime(qualityReview.reviewedAt, 'externalAiInterpretationLayer.qualityReview.reviewedAt');

  const provenance = layer.provenance;
  assertPlainObject(provenance, 'externalAiInterpretationLayer.provenance');
  assert(provenance.generatedBy === 'manual_workflow', 'externalAiInterpretationLayer.provenance.generatedBy must be manual_workflow');
  assert(provenance.humanApproved === false, 'externalAiInterpretationLayer.provenance.humanApproved must be false');

  const freshness = layer.freshness;
  assertPlainObject(freshness, 'externalAiInterpretationLayer.freshness');
  parseIsoTime(freshness.artifactGeneratedAt, 'externalAiInterpretationLayer.freshness.artifactGeneratedAt');
  assert(Number.isFinite(freshness.maxAgeHours) && freshness.maxAgeHours <= 24, 'externalAiInterpretationLayer.freshness.maxAgeHours must be <= 24');
  assert(freshness.isStale === false, 'externalAiInterpretationLayer.freshness.isStale must be false');

  const boundaries = layer.boundaries;
  assertPlainObject(boundaries, 'externalAiInterpretationLayer.boundaries');
  assert(boundaries.displayOnly === true, 'externalAiInterpretationLayer.boundaries.displayOnly must be true');
  assert(boundaries.externalAiGenerated === true, 'externalAiInterpretationLayer.boundaries.externalAiGenerated must be true');
  assert(boundaries.usesExternalAiApi === true, 'externalAiInterpretationLayer.boundaries.usesExternalAiApi must be true');
  assert(boundaries.affectsScoring === false, 'externalAiInterpretationLayer.boundaries.affectsScoring must be false');
  assert(boundaries.affectsDecisionModel === false, 'externalAiInterpretationLayer.boundaries.affectsDecisionModel must be false');
  assert(boundaries.affectsExecutionLock === false, 'externalAiInterpretationLayer.boundaries.affectsExecutionLock must be false');
  assert(boundaries.affectsPositionGuidance === false, 'externalAiInterpretationLayer.boundaries.affectsPositionGuidance must be false');
  assert(boundaries.notInvestmentAdvice === true, 'externalAiInterpretationLayer.boundaries.notInvestmentAdvice must be true');
  assert(boundaries.productionWriteApproved === false, 'externalAiInterpretationLayer.boundaries.productionWriteApproved must be false');
  assert(typeof boundaries.frontendDisplayApproved === 'boolean', 'externalAiInterpretationLayer.boundaries.frontendDisplayApproved must be boolean');
  assert(
    layer.displayEnabled === boundaries.frontendDisplayApproved,
    'externalAiInterpretationLayer display flags must be both false or both true'
  );

  const serializedStrings = collectStrings(layer).join('\n');
  for (const phrase of EXTERNAL_AI_FORBIDDEN_PHRASES) {
    assert(!serializedStrings.includes(phrase), `externalAiInterpretationLayer must not contain forbidden phrase "${phrase}"`);
  }
}

function cloneForValidationSelfTest(value) {
  return JSON.parse(JSON.stringify(value));
}

function addExternalAiPr4ValidationSelfTestFields(layer) {
  layer.crossLayerSynthesis = [
    {
      theme: 'energy_pricing_divergence',
      summaryZh: '能源层与定价层存在可审计背离。',
      supportingLayers: ['brentPricingLayer'],
      conflictingLayers: ['marketPricing'],
      confidence: 'low',
    },
  ];
  layer.keyDivergences = [
    {
      titleZh: '能源与风险定价不一致',
      evidenceFor: ['brentPricingLayer.proxySpread'],
      evidenceAgainst: ['marketPricing.primaryAssetStatus'],
      whyItMattersZh: '该背离影响解释层置信。',
      invalidationConditions: ['相关层重新收敛'],
    },
  ];
  layer.scenarioLean = {
    leanZh: '维持观察情景',
    scenarioRefs: ['scenarioTree[0]'],
    triggerConditions: ['能源价差扩大'],
    invalidationConditions: ['价差收敛'],
    confidence: 'low',
  };
  layer.dataQualityLens = {
    summaryZh: 'fallback 层降低整体置信。',
    staleLayers: [],
    fallbackLayers: ['dataQuality'],
    missingLayers: [],
    confidenceImpactZh: '数据质量使结论保持低置信。',
  };
}

function assertValidationThrows(fn, message) {
  try {
    fn();
  } catch {
    return;
  }
  assert(false, message);
}

function runExternalAiPr4ValidationRegression(layer) {
  const withPr4 = cloneForValidationSelfTest(layer);
  addExternalAiPr4ValidationSelfTestFields(withPr4);
  validateExternalAiProductionLayer(withPr4);

  const invalidPr4 = cloneForValidationSelfTest(layer);
  addExternalAiPr4ValidationSelfTestFields(invalidPr4);
  invalidPr4.crossLayerSynthesis[0].supportingLayers = ['rateVol'];
  assertValidationThrows(
    () => validateExternalAiProductionLayer(invalidPr4),
    'externalAiInterpretationLayer PR4 optional fields must reject non-canonical layer refs'
  );
}

function validateAiInterpretationFacts(items, fieldName) {
  assertArray(items, fieldName);
  items.forEach((item, index) => {
    const itemField = `${fieldName}[${index}]`;
    assertPlainObject(item, itemField);
    for (const key of ['key', 'labelZh', 'statementZh', 'sourceFields', 'confidence']) {
      assert(Object.hasOwn(item, key), `${itemField}.${key} is missing`);
    }
    assertString(item.key, `${itemField}.key`);
    assertString(item.labelZh, `${itemField}.labelZh`);
    assertString(item.statementZh, `${itemField}.statementZh`);
    validateStringArray(item.sourceFields, `${itemField}.sourceFields`);
    validateAiConfidence(item.confidence, `${itemField}.confidence`);
  });
}

function validateAiInterpretationInferences(items, fieldName) {
  assertArray(items, fieldName);
  items.forEach((item, index) => {
    const itemField = `${fieldName}[${index}]`;
    assertPlainObject(item, itemField);
    for (const key of ['key', 'labelZh', 'statementZh', 'basedOn', 'confidence']) {
      assert(Object.hasOwn(item, key), `${itemField}.${key} is missing`);
    }
    assertString(item.key, `${itemField}.key`);
    assertString(item.labelZh, `${itemField}.labelZh`);
    assertString(item.statementZh, `${itemField}.statementZh`);
    validateStringArray(item.basedOn, `${itemField}.basedOn`);
    validateAiConfidence(item.confidence, `${itemField}.confidence`);
  });
}

function validateAiInterpretationJudgments(items, fieldName) {
  assertArray(items, fieldName);
  items.forEach((item, index) => {
    const itemField = `${fieldName}[${index}]`;
    assertPlainObject(item, itemField);
    for (const key of ['key', 'labelZh', 'statementZh', 'modelSource', 'confidence']) {
      assert(Object.hasOwn(item, key), `${itemField}.${key} is missing`);
    }
    assertString(item.key, `${itemField}.key`);
    assertString(item.labelZh, `${itemField}.labelZh`);
    assertString(item.statementZh, `${itemField}.statementZh`);
    assert(AI_INTERPRETATION_MODEL_SOURCES.has(item.modelSource), `${itemField}.modelSource is not supported`);
    validateAiConfidence(item.confidence, `${itemField}.confidence`);
  });
}

function validateAiInterpretationScenarios(items, fieldName) {
  assertArray(items, fieldName);
  items.forEach((item, index) => {
    const itemField = `${fieldName}[${index}]`;
    assertPlainObject(item, itemField);
    for (const key of ['key', 'labelZh', 'statementZh', 'triggerConditions', 'invalidationConditions', 'confidence']) {
      assert(Object.hasOwn(item, key), `${itemField}.${key} is missing`);
    }
    assertString(item.key, `${itemField}.key`);
    assertString(item.labelZh, `${itemField}.labelZh`);
    assertString(item.statementZh, `${itemField}.statementZh`);
    validateStringArray(item.triggerConditions, `${itemField}.triggerConditions`);
    validateStringArray(item.invalidationConditions, `${itemField}.invalidationConditions`);
    validateAiConfidence(item.confidence, `${itemField}.confidence`);
  });
}

function validateAiInterpretationEvidenceLinks(items, fieldName) {
  assertArray(items, fieldName);
  items.forEach((item, index) => {
    const itemField = `${fieldName}[${index}]`;
    assertPlainObject(item, itemField);
    for (const key of ['layer', 'field', 'noteZh']) {
      assert(Object.hasOwn(item, key), `${itemField}.${key} is missing`);
      assertString(item[key], `${itemField}.${key}`);
    }
    assert(AI_INTERPRETATION_EVIDENCE_LAYERS.has(item.layer), `${itemField}.layer is not supported`);
  });
}

function validateAiInterpretationLayer(dataPayload) {
  const layer = dataPayload.aiInterpretationLayer;
  if (layer === undefined) {
    console.warn('[validate-data] Warning: aiInterpretationLayer is missing; run npm run build:data with a valid realtime input to generate the v28.0J-0 interpretation-only contract.');
    return;
  }
  assertPlainObject(layer, 'aiInterpretationLayer');
  for (const key of [
    'contractVersion',
    'generatedAt',
    'mode',
    'summaryZh',
    'facts',
    'dataInferences',
    'modelJudgments',
    'scenarioHypotheses',
    'dataGaps',
    'invalidationSignals',
    'evidenceLinks',
    'confidence',
    'boundaries'
  ]) {
    assert(Object.hasOwn(layer, key), `aiInterpretationLayer.${key} is missing`);
  }

  assert(layer.contractVersion === 'v28.0J-0', 'aiInterpretationLayer.contractVersion must be v28.0J-0');
  parseIsoTime(layer.generatedAt, 'generatedAt');
  assert(layer.mode === AI_INTERPRETATION_MODE, `aiInterpretationLayer.mode must be ${AI_INTERPRETATION_MODE}`);
  assertString(layer.summaryZh, 'aiInterpretationLayer.summaryZh');
  validateAiInterpretationFacts(layer.facts, 'aiInterpretationLayer.facts');
  validateAiInterpretationInferences(layer.dataInferences, 'aiInterpretationLayer.dataInferences');
  validateAiInterpretationJudgments(layer.modelJudgments, 'aiInterpretationLayer.modelJudgments');
  validateAiInterpretationScenarios(layer.scenarioHypotheses, 'aiInterpretationLayer.scenarioHypotheses');
  validateStringArray(layer.dataGaps, 'aiInterpretationLayer.dataGaps');
  validateStringArray(layer.invalidationSignals, 'aiInterpretationLayer.invalidationSignals');
  validateAiInterpretationEvidenceLinks(layer.evidenceLinks, 'aiInterpretationLayer.evidenceLinks');

  const confidence = layer.confidence;
  assertPlainObject(confidence, 'aiInterpretationLayer.confidence');
  validateAiConfidence(confidence.level, 'aiInterpretationLayer.confidence.level');
  assertFiniteNumber(confidence.score, 'aiInterpretationLayer.confidence.score');
  assert(confidence.score >= 0 && confidence.score <= 100, 'aiInterpretationLayer.confidence.score must be 0-100');
  assertString(confidence.reasonZh, 'aiInterpretationLayer.confidence.reasonZh');

  const boundaries = layer.boundaries;
  assertPlainObject(boundaries, 'aiInterpretationLayer.boundaries');
  assert(boundaries.displayOnly === true, 'aiInterpretationLayer.boundaries.displayOnly must be true');
  assert(boundaries.interpretationOnly === true, 'aiInterpretationLayer.boundaries.interpretationOnly must be true');
  assert(boundaries.generatedByExternalAi === false, 'aiInterpretationLayer.boundaries.generatedByExternalAi must be false');
  assert(boundaries.usesExternalAiApi === false, 'aiInterpretationLayer.boundaries.usesExternalAiApi must be false');
  assert(boundaries.affectsScoring === false, 'aiInterpretationLayer.boundaries.affectsScoring must be false');
  assert(boundaries.affectsDecisionModel === false, 'aiInterpretationLayer.boundaries.affectsDecisionModel must be false');
  assert(boundaries.affectsExecutionLock === false, 'aiInterpretationLayer.boundaries.affectsExecutionLock must be false');
  assert(boundaries.affectsPositionGuidance === false, 'aiInterpretationLayer.boundaries.affectsPositionGuidance must be false');

  const serializedStrings = collectStrings(layer).join('\n');
  for (const phrase of DAILY_BRIEF_FORBIDDEN_PHRASES) {
    assert(!serializedStrings.includes(phrase), `aiInterpretationLayer must not contain forbidden phrase "${phrase}"`);
  }
}

function validateExternalAiInterpretationLayer(dataPayload) {
  const layer = dataPayload.externalAiInterpretationLayer;
  if (layer === undefined) {
    console.warn('[validate-data] Warning: externalAiInterpretationLayer is missing; run npm run build:data with a valid realtime input after v28.0K-3A to generate the disabled scaffold.');
    return;
  }

  assertPlainObject(layer, 'externalAiInterpretationLayer');

  if (ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS.has(layer.schemaVersion)) {
    validateExternalAiProductionLayer(layer);
    runExternalAiPr4ValidationRegression(layer);
    return;
  }

  for (const key of [
    'contractVersion',
    'generatedAt',
    'enabled',
    'status',
    'provider',
    'model',
    'mode',
    'summaryZh',
    'inputDigest',
    'output',
    'audit',
    'fallback',
    'confidence',
    'dataGaps',
    'limitations',
    'boundaries'
  ]) {
    assert(Object.hasOwn(layer, key), `externalAiInterpretationLayer.${key} is missing`);
  }

  assert(layer.contractVersion === EXTERNAL_AI_SCAFFOLD_CONTRACT_VERSION, `externalAiInterpretationLayer.contractVersion must be ${EXTERNAL_AI_SCAFFOLD_CONTRACT_VERSION}`);
  parseIsoTime(layer.generatedAt, 'generatedAt');
  assert(layer.enabled === false, 'externalAiInterpretationLayer.enabled must be false');
  assert(layer.status === 'disabled', 'externalAiInterpretationLayer.status must be disabled');
  assert(layer.provider === 'none', 'externalAiInterpretationLayer.provider must be none');
  assert(layer.model === null, 'externalAiInterpretationLayer.model must be null');
  assert(layer.mode === EXTERNAL_AI_SCAFFOLD_MODE, `externalAiInterpretationLayer.mode must be ${EXTERNAL_AI_SCAFFOLD_MODE}`);
  assertString(layer.summaryZh, 'externalAiInterpretationLayer.summaryZh');
  assert(layer.output === null, 'externalAiInterpretationLayer.output must be null');

  const inputDigest = layer.inputDigest;
  assertPlainObject(inputDigest, 'externalAiInterpretationLayer.inputDigest');
  assertString(inputDigest.inputVersion, 'externalAiInterpretationLayer.inputDigest.inputVersion');
  assert(inputDigest.siteStructuredDataOnly === true, 'externalAiInterpretationLayer.inputDigest.siteStructuredDataOnly must be true');
  assertArray(inputDigest.layersAvailable, 'externalAiInterpretationLayer.inputDigest.layersAvailable');
  inputDigest.layersAvailable.forEach((item, index) => {
    assertString(item, `externalAiInterpretationLayer.inputDigest.layersAvailable[${index}]`);
    assert(EXTERNAL_AI_SCAFFOLD_LAYERS.has(item), `externalAiInterpretationLayer.inputDigest.layersAvailable[${index}] is not supported`);
  });
  assert(inputDigest.usesPrivateUserData === false, 'externalAiInterpretationLayer.inputDigest.usesPrivateUserData must be false');
  assert(inputDigest.usesSecrets === false, 'externalAiInterpretationLayer.inputDigest.usesSecrets must be false');
  assert(inputDigest.usesExternalMarketData === false, 'externalAiInterpretationLayer.inputDigest.usesExternalMarketData must be false');
  assertString(inputDigest.noteZh, 'externalAiInterpretationLayer.inputDigest.noteZh');

  const audit = layer.audit;
  assertPlainObject(audit, 'externalAiInterpretationLayer.audit');
  assert(audit.outputValidated === false, 'externalAiInterpretationLayer.audit.outputValidated must be false');
  assert(audit.validator === 'check-external-ai-output', 'externalAiInterpretationLayer.audit.validator must be check-external-ai-output');
  assert(audit.auditStatus === 'not_applicable', 'externalAiInterpretationLayer.audit.auditStatus must be not_applicable');
  assertArray(audit.auditFlags, 'externalAiInterpretationLayer.audit.auditFlags');
  assert(audit.bannedCopyPassed === null, 'externalAiInterpretationLayer.audit.bannedCopyPassed must be null');
  assert(audit.sourceAttributionPresent === null, 'externalAiInterpretationLayer.audit.sourceAttributionPresent must be null');
  assert(audit.boundariesValid === true, 'externalAiInterpretationLayer.audit.boundariesValid must be true');

  const fallback = layer.fallback;
  assertPlainObject(fallback, 'externalAiInterpretationLayer.fallback');
  assert(fallback.used === true, 'externalAiInterpretationLayer.fallback.used must be true');
  assert(fallback.fallbackLayer === 'aiInterpretationLayer', 'externalAiInterpretationLayer.fallback.fallbackLayer must be aiInterpretationLayer');
  assertString(fallback.reasonZh, 'externalAiInterpretationLayer.fallback.reasonZh');

  const confidence = layer.confidence;
  assertPlainObject(confidence, 'externalAiInterpretationLayer.confidence');
  assert(confidence.level === 'low', 'externalAiInterpretationLayer.confidence.level must be low');
  assert(confidence.score === 0, 'externalAiInterpretationLayer.confidence.score must be 0');
  assertString(confidence.reasonZh, 'externalAiInterpretationLayer.confidence.reasonZh');

  validateStringArray(layer.dataGaps, 'externalAiInterpretationLayer.dataGaps');
  validateStringArray(layer.limitations, 'externalAiInterpretationLayer.limitations');

  const boundaries = layer.boundaries;
  assertPlainObject(boundaries, 'externalAiInterpretationLayer.boundaries');
  assert(boundaries.displayOnly === true, 'externalAiInterpretationLayer.boundaries.displayOnly must be true');
  assert(boundaries.diagnosticOnly === true, 'externalAiInterpretationLayer.boundaries.diagnosticOnly must be true');
  assert(boundaries.externalAiGenerated === false, 'externalAiInterpretationLayer.boundaries.externalAiGenerated must be false');
  assert(boundaries.usesExternalAiApi === false, 'externalAiInterpretationLayer.boundaries.usesExternalAiApi must be false');
  assert(boundaries.affectsScoring === false, 'externalAiInterpretationLayer.boundaries.affectsScoring must be false');
  assert(boundaries.affectsDecisionModel === false, 'externalAiInterpretationLayer.boundaries.affectsDecisionModel must be false');
  assert(boundaries.affectsExecutionLock === false, 'externalAiInterpretationLayer.boundaries.affectsExecutionLock must be false');
  assert(boundaries.affectsPositionGuidance === false, 'externalAiInterpretationLayer.boundaries.affectsPositionGuidance must be false');
  assert(boundaries.notInvestmentAdvice === true, 'externalAiInterpretationLayer.boundaries.notInvestmentAdvice must be true');

  const serializedStrings = collectStrings(layer).join('\n');
  for (const phrase of EXTERNAL_AI_FORBIDDEN_PHRASES) {
    assert(!serializedStrings.includes(phrase), `externalAiInterpretationLayer must not contain forbidden phrase "${phrase}"`);
  }
}

function validateDailyRealtimeInput(dataPayload) {
  const input = dataPayload.dailyRealtimeInput;
  assert(input && typeof input === 'object' && !Array.isArray(input), 'dailyRealtimeInput is missing');

  for (const key of ['branch', 'commitSha', 'updatedAt', 'sourceMode', 'healthScore', 'capturedAt']) {
    assert(Object.hasOwn(input, key), `dailyRealtimeInput.${key} is missing`);
  }

  assert(input.branch === 'realtime-data', 'dailyRealtimeInput.branch must be realtime-data');
  assert(
    input.commitSha === null || (typeof input.commitSha === 'string' && input.commitSha.length >= 7),
    'dailyRealtimeInput.commitSha must be null or a string with length >= 7'
  );
  assert(typeof input.sourceMode === 'string' && input.sourceMode.trim().length > 0, 'dailyRealtimeInput.sourceMode must be a non-empty string');
  assert(DAILY_REALTIME_SOURCE_MODES.has(input.sourceMode), `dailyRealtimeInput.sourceMode is not supported: ${input.sourceMode}`);
  assert(isFiniteNumberOrNull(input.healthScore), 'dailyRealtimeInput.healthScore must be finite number or null');

  const updatedAtMs = parseIsoTime(input.updatedAt, 'updatedAt');
  const capturedAtMs = parseIsoTime(input.capturedAt, 'capturedAt');
  assert(capturedAtMs >= updatedAtMs, 'dailyRealtimeInput.capturedAt is before updatedAt');

  const ageMinutes = Math.round((capturedAtMs - updatedAtMs) / 60000);
  if (input.sourceMode === 'cache-only') {
    assert(ageMinutes <= DAILY_REALTIME_CACHE_ONLY_MAX_AGE_MINUTES, `dailyRealtimeInput.cache-only payload is too old: ${ageMinutes} minutes`);
    assert(!(Number.isFinite(input.healthScore) && input.healthScore > 0), 'dailyRealtimeInput.cache-only healthScore must not be positive');
    return;
  }

  assert(ageMinutes <= DAILY_REALTIME_LIVE_MAX_AGE_MINUTES, `dailyRealtimeInput ${input.sourceMode} payload is stale: ${ageMinutes} minutes`);
}

function validateDisplayInputsBaseline(dataPayload) {
  const baseline = dataPayload.displayInputsBaseline;
  assert(baseline && typeof baseline === 'object' && !Array.isArray(baseline), 'missing displayInputsBaseline.');
  for (const key of DISPLAY_INPUT_KEYS) {
    assert(Object.hasOwn(baseline, key), `displayInputsBaseline.${key} is missing`);
    assert(isFiniteNumberOrNull(baseline[key]), `displayInputsBaseline.${key} must be finite number or null`);
  }
  if (Object.hasOwn(baseline, 'asOf')) {
    validateNullableIsoString(baseline.asOf, 'displayInputsBaseline.asOf');
  }
}

function shouldValidateRealtimeBaselineAlignment(realtimePayload) {
  return realtimePayload?.sourceMode === 'live' &&
    Number.isFinite(realtimePayload.healthScore) &&
    realtimePayload.healthScore > 0 &&
    realtimePayload.values &&
    typeof realtimePayload.values === 'object';
}

function isSameDailyRealtimeInput(dataPayload, realtimePayload) {
  const input = dataPayload?.dailyRealtimeInput;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  if (!realtimePayload || typeof realtimePayload !== 'object' || Array.isArray(realtimePayload)) return false;
  const inputUpdatedAt = Date.parse(input.updatedAt);
  const realtimeUpdatedAt = Date.parse(realtimePayload.updatedAt);
  return Number.isFinite(inputUpdatedAt) &&
    Number.isFinite(realtimeUpdatedAt) &&
    inputUpdatedAt === realtimeUpdatedAt;
}

function validateRealtimeBaselineAlignment(dataPayload, realtimePayload) {
  if (!shouldValidateRealtimeBaselineAlignment(realtimePayload)) return;
  if (!isSameDailyRealtimeInput(dataPayload, realtimePayload)) {
    if (strictLiveAlignment) {
      throw new Error('Validation failed: strict live alignment requested but local realtime.updatedAt does not match dailyRealtimeInput.updatedAt.');
    }
    if (validateDataVerbose) {
      console.info('[validate-data] Expected skip: local realtime.updatedAt does not match dailyRealtimeInput.updatedAt; live realtime/displayInputsBaseline alignment was not checked.');
    }
    return;
  }
  const baseline = dataPayload.displayInputsBaseline;
  for (const key of DISPLAY_INPUT_KEYS) {
    const realtimeValue = Number(realtimePayload.values[key]);
    if (!Number.isFinite(realtimeValue)) continue;
    const baselineValue = baseline[key];
    assert(Number.isFinite(baselineValue), `displayInputsBaseline.${key} must be finite when realtime.values.${key} is live`);
    const tolerance = WIDE_TOLERANCE_KEYS.has(key) ? 1e-3 : 1e-6;
    assert(
      isCloseEnough(baselineValue, realtimeValue, tolerance),
      `displayInputsBaseline.${key} (${baselineValue}) does not match live realtime.values.${key} (${realtimeValue})`
    );
  }
}

function validateBrentValidation(realtimePayload) {
  const brentValidation = realtimePayload.brentValidation;
  if (brentValidation === undefined) return;
  assert(brentValidation && typeof brentValidation === 'object' && !Array.isArray(brentValidation), 'brentValidation must be an object');
  const candidates = brentValidation.candidates;
  const consensus = brentValidation.consensus;
  assert(Array.isArray(candidates), 'brentValidation.candidates must be an array');
  assert(consensus && typeof consensus === 'object' && !Array.isArray(consensus), 'brentValidation.consensus must be an object');

  for (const key of ['recommendedValue', 'recommendedSource', 'confidence', 'canPromoteToPrimary']) {
    assert(Object.hasOwn(consensus, key), `brentValidation.consensus.${key} is missing`);
  }
  assert(BRENT_CONFIDENCE_LEVELS.has(consensus.confidence), `brentValidation.consensus.confidence must be one of high/medium/low/none`);

  if (consensus.confidence === 'none') {
    assert(consensus.recommendedValue === null, 'brentValidation confidence=none requires recommendedValue=null');
    assert(consensus.recommendedSource === null, 'brentValidation confidence=none requires recommendedSource=null');
    assert(consensus.canPromoteToPrimary === false, 'brentValidation confidence=none requires canPromoteToPrimary=false');
  }

  const weakCandidates = candidates.filter((candidate) => (
    candidate?.consensusRole === 'weak-confirmation' ||
    candidate?.weakConfirmation === true
  ));
  if (weakCandidates.length) {
    assert(consensus.canPromoteToPrimary === false, 'weak-confirmation cannot promote to primary');
    assert(consensus.confidence !== 'high', 'weak-confirmation cannot produce high confidence');
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (candidate.source === 'fred-anchor') {
      assert(candidate.participatesInConsensus !== true, 'fred-anchor must not participate in consensus');
      assert(candidate.consensusRole !== 'primary', 'fred-anchor must not be primary consensus source');
    }
    if (candidate.staleForConsensus === true) {
      assert(!!candidate.excludedFromConsensus, `${candidate.source || 'candidate'} staleForConsensus requires excludedFromConsensus`);
    }
  }

  if (consensus.canPromoteToPrimary === true) {
    const participating = candidates.filter((candidate) => candidate?.source !== 'fred-anchor' && candidate?.participatesInConsensus === true);
    assert(consensus.confidence === 'high', 'canPromoteToPrimary=true requires confidence=high');
    assert(participating.length >= 2, 'canPromoteToPrimary=true requires at least 2 non-FRED participating candidates');
    assert(!participating.some((candidate) => candidate.weakConfirmation === true), 'canPromoteToPrimary=true cannot include weakConfirmation candidates');
    assert(!participating.some((candidate) => candidate.staleForConsensus === true), 'canPromoteToPrimary=true cannot include stale candidates');
  }
}

function validatePositionGuidance(positionGuidance, fieldName) {
  assertPlainObject(positionGuidance, fieldName);

  for (const key of [
    'totalExposureBand',
    'riskAssetBias',
    'cashGuidance',
    'newExposurePolicy',
    'targetGrossExposure',
    'cashBufferTarget',
    'riskBudget',
    'range',
    'band'
  ]) {
    validateStringIfPresent(positionGuidance, key, fieldName);
  }

  for (const key of ['targetExposure', 'min', 'max', 'structuralBandShift']) {
    validateFiniteNumberIfPresent(positionGuidance, key, fieldName);
  }
}

function validateDecisionActionQueue(actionQueue, fieldName) {
  assertPlainObject(actionQueue, fieldName);
  for (const key of ['priorityActions', 'blockedActions', 'watchItems']) {
    assert(Object.hasOwn(actionQueue, key), `${fieldName}.${key} is missing`);
    assertArray(actionQueue[key], `${fieldName}.${key}`);
  }
}

function validateExecutionLock(executionLock) {
  assertPlainObject(executionLock, 'tradingSystem.executionLock');

  for (const key of ['tag', 'level', 'levelLabel', 'title', 'description']) {
    assert(Object.hasOwn(executionLock, key), `tradingSystem.executionLock.${key} is missing`);
    assertString(executionLock[key], `tradingSystem.executionLock.${key}`);
  }

  for (const key of ['allow', 'block', 'mandatory']) {
    assert(Object.hasOwn(executionLock, key), `tradingSystem.executionLock.${key} is missing`);
    assertArray(executionLock[key], `tradingSystem.executionLock.${key}`);
  }

  assert(Object.hasOwn(executionLock, 'structurallyTriggered'), 'tradingSystem.executionLock.structurallyTriggered is missing');
  assertBoolean(executionLock.structurallyTriggered, 'tradingSystem.executionLock.structurallyTriggered');

  for (const key of ['state', 'status', 'color']) {
    validateStringIfPresent(executionLock, key, 'tradingSystem.executionLock');
  }
  for (const key of ['canAddRisk', 'allowNewRisk']) {
    validateBooleanIfPresent(executionLock, key, 'tradingSystem.executionLock');
  }
  for (const key of ['reasons', 'notes', 'drivers']) {
    validateArrayIfPresent(executionLock, key, 'tradingSystem.executionLock');
  }
}

function validateSignalEngine(signalEngine) {
  assertPlainObject(signalEngine, 'tradingSystem.signalEngine');

  for (const key of ['direction', 'consistency', 'macroSignal', 'liquiditySignal', 'chainSignal']) {
    validateStringIfPresent(signalEngine, key, 'tradingSystem.signalEngine');
  }
  for (const key of ['state', 'status']) {
    validateStringIfPresent(signalEngine, key, 'tradingSystem.signalEngine');
  }
  validateFiniteNumberIfPresent(signalEngine, 'strength', 'tradingSystem.signalEngine');
  validateArrayIfPresent(signalEngine, 'notes', 'tradingSystem.signalEngine');
  validateArrayIfPresent(signalEngine, 'signals', 'tradingSystem.signalEngine');
}

function validateActionLayer(actionLayer) {
  assertPlainObject(actionLayer, 'tradingSystem.actionLayer');

  for (const key of ['tag', 'priorityLine', 'todayAction']) {
    validateStringIfPresent(actionLayer, key, 'tradingSystem.actionLayer');
  }
  for (const key of ['checklist', 'blocked', 'checkpoints', 'actions', 'controlActions']) {
    validateArrayIfPresent(actionLayer, key, 'tradingSystem.actionLayer');
  }
  for (const key of ['watch', 'watchlist']) {
    if (actionLayer[key] !== undefined) {
      assert(
        Array.isArray(actionLayer[key]) || isPlainObject(actionLayer[key]),
        `tradingSystem.actionLayer.${key} must be an array or an object`
      );
    }
  }
}

function validateRiskControl(riskControl, fieldName) {
  assertPlainObject(riskControl, fieldName);

  for (const key of ['status', 'maxDrawdown', 'singleAssetMax', 'systemState']) {
    validateStringIfPresent(riskControl, key, fieldName);
  }
  for (const key of ['hardThresholds', 'resetThresholds', 'rules']) {
    validateArrayIfPresent(riskControl, key, fieldName);
  }
}

function validateDecisionContract(dataPayload) {
  if (dataPayload.decisionModel !== undefined) {
    const decisionModel = dataPayload.decisionModel;
    assertPlainObject(decisionModel, 'decisionModel');

    for (const key of ['contractVersion', 'stateLabel', 'stateReason']) {
      assert(Object.hasOwn(decisionModel, key), `decisionModel.${key} is missing`);
      assertString(decisionModel[key], `decisionModel.${key}`);
    }
    validateStringOrPlainObjectIfPresent(decisionModel, 'strategyState', 'decisionModel');
    validateStringOrPlainObjectIfPresent(decisionModel, 'riskMode', 'decisionModel');
    validateFiniteNumberIfPresent(decisionModel, 'stateScore', 'decisionModel');
    validateFiniteNumberIfPresent(decisionModel, 'structuralScoreBump', 'decisionModel');
    validateBooleanIfPresent(decisionModel, 'allStructuralSourcesMissing', 'decisionModel');
    validateArrayIfPresent(decisionModel, 'structuralSignals', 'decisionModel');
    validateArrayIfPresent(decisionModel, 'dominantDrivers', 'decisionModel');

    if (decisionModel.positionGuidance !== undefined) {
      validatePositionGuidance(decisionModel.positionGuidance, 'decisionModel.positionGuidance');
    }
    if (decisionModel.actionQueue !== undefined) {
      validateDecisionActionQueue(decisionModel.actionQueue, 'decisionModel.actionQueue');
    }
    validatePlainObjectIfPresent(decisionModel, 'triggerMonitor', 'decisionModel');
    validatePlainObjectIfPresent(decisionModel, 'invalidationRules', 'decisionModel');
    validatePlainObjectIfPresent(decisionModel, 'decisionStatement', 'decisionModel');
  }

  if (dataPayload.tradingSystem !== undefined) {
    const tradingSystem = dataPayload.tradingSystem;
    assertPlainObject(tradingSystem, 'tradingSystem');

    if (tradingSystem.executionLock !== undefined) validateExecutionLock(tradingSystem.executionLock);
    if (tradingSystem.signalEngine !== undefined) validateSignalEngine(tradingSystem.signalEngine);
    if (tradingSystem.actionLayer !== undefined) validateActionLayer(tradingSystem.actionLayer);
    if (tradingSystem.riskControl !== undefined) validateRiskControl(tradingSystem.riskControl, 'tradingSystem.riskControl');
  }

  if (dataPayload.positionGuidance !== undefined) {
    validatePositionGuidance(dataPayload.positionGuidance, 'positionGuidance');
  }
  if (dataPayload.riskControl !== undefined) {
    validateRiskControl(dataPayload.riskControl, 'riskControl');
  }
}

function validateTransmissionDeltaMeta(dataPayload) {
  if (dataPayload.transmissionDeltaMeta === undefined) return;
  const meta = dataPayload.transmissionDeltaMeta;
  assertPlainObject(meta, 'transmissionDeltaMeta');
  validateStringIfPresent(meta, 'source', 'transmissionDeltaMeta');
  validateFiniteNumberIfPresent(meta, 'matchedNodes', 'transmissionDeltaMeta');
  validateFiniteNumberIfPresent(meta, 'totalNodes', 'transmissionDeltaMeta');
  if (Number.isFinite(meta.matchedNodes)) {
    assert(meta.matchedNodes >= 0, 'transmissionDeltaMeta.matchedNodes must be >= 0');
  }
  if (Number.isFinite(meta.totalNodes)) {
    assert(meta.totalNodes >= 0, 'transmissionDeltaMeta.totalNodes must be >= 0');
  }
  if (Number.isFinite(meta.matchedNodes) && Number.isFinite(meta.totalNodes)) {
    assert(meta.matchedNodes <= meta.totalNodes, 'transmissionDeltaMeta.matchedNodes cannot exceed totalNodes');
  }
}

function validateTransmissionChainDeltas(dataPayload) {
  if (dataPayload.transmissionChain === undefined) return;
  const chain = dataPayload.transmissionChain;
  assertPlainObject(chain, 'transmissionChain');
  if (chain.nodes === undefined) return;
  assertArray(chain.nodes, 'transmissionChain.nodes');
  chain.nodes.forEach((node, index) => {
    assertPlainObject(node, `transmissionChain.nodes[${index}]`);
    if (Object.hasOwn(node, 'delta')) {
      assert(
        isFiniteNumberOrNull(node.delta),
        `transmissionChain.nodes[${index}].delta must be finite number or null`
      );
    }
  });
}

function validateTransmissionSnapshotHistory(historyPayload, fieldName) {
  if (historyPayload === null || historyPayload === undefined) return;
  assertArray(historyPayload, fieldName);
  historyPayload.forEach((entry, entryIndex) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || entry.transmissionSnapshot === undefined) return;
    const snapshot = entry.transmissionSnapshot;
    assertPlainObject(snapshot, `${fieldName}[${entryIndex}].transmissionSnapshot`);
    if (snapshot.nodes === undefined) return;
    assertArray(snapshot.nodes, `${fieldName} transmissionSnapshot.nodes`);
    snapshot.nodes.forEach((node, nodeIndex) => {
      assertPlainObject(node, `${fieldName} transmissionSnapshot.nodes[${nodeIndex}]`);
      validateFiniteNumberIfPresent(node, 'score', `${fieldName} transmissionSnapshot.nodes[${nodeIndex}]`);
      validateStringIfPresent(node, 'label', `${fieldName} transmissionSnapshot.nodes[${nodeIndex}]`);
      validateStringIfPresent(node, 'key', `${fieldName} transmissionSnapshot.nodes[${nodeIndex}]`);
      validateStringIfPresent(node, 'id', `${fieldName} transmissionSnapshot.nodes[${nodeIndex}]`);
    });
  });
}

function validateWorldOrderStressHistory(historyPayload, fieldName) {
  if (historyPayload === null || historyPayload === undefined) return;
  assertArray(historyPayload, fieldName);
  historyPayload.forEach((entry, entryIndex) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || entry.worldOrderStress === undefined) return;
    const snapshot = entry.worldOrderStress;
    const snapshotField = `${fieldName}[${entryIndex}].worldOrderStress`;
    assertPlainObject(snapshot, snapshotField);
    assertFiniteNumber(snapshot.score, `${snapshotField}.score`);
    assert(snapshot.score >= 0 && snapshot.score <= 100, `${snapshotField}.score must be between 0 and 100`);
    assertString(snapshot.state, `${snapshotField}.state`);
    assertString(snapshot.labelZh, `${snapshotField}.labelZh`);
    assertString(snapshot.observedAt, `${snapshotField}.observedAt`);
    assert(!Number.isNaN(Date.parse(snapshot.observedAt)), `${snapshotField}.observedAt must be parseable ISO time`);
    assertFiniteNumber(snapshot.confidence, `${snapshotField}.confidence`);
    assert(snapshot.confidence >= 0 && snapshot.confidence <= 1, `${snapshotField}.confidence must be between 0 and 1`);
    assertString(snapshot.freshness, `${snapshotField}.freshness`);
  });
}

function validateTransmissionDeltaContract(dataPayload, historyPayload, historyFullPayload) {
  validateTransmissionChainDeltas(dataPayload);
  validateTransmissionDeltaMeta(dataPayload);
  validateTransmissionSnapshotHistory(historyPayload, 'radar-history');
  validateTransmissionSnapshotHistory(historyFullPayload, 'radar-history-full');
  validateWorldOrderStressHistory(historyPayload, 'radar-history');
  validateWorldOrderStressHistory(historyFullPayload, 'radar-history-full');
}

if (!data.updatedAt) throw new Error('Validation failed: missing updatedAt.');
if (!Array.isArray(history) || history.length < 30) throw new Error('Validation failed: insufficient history.');
if (!data.timeDimension || !data.warningSystem || !data.assetReturnMap) throw new Error('Validation failed: core modules missing.');
if (!data.tradingSystem || !data.tradingSystem.executionLock || !data.tradingSystem.actionLayer || !data.tradingSystem.positioning) {
  throw new Error('Validation failed: trading engine modules missing.');
}
if (!realtime.values || !realtime.sourceStatus) throw new Error('Validation failed: realtime payload incomplete.');
validateDailyRealtimeInput(data);
validateDailyBrief(data);
validateDivergenceLayer(data);
validateMacroDriversConsumer(data);
validateMacroDriversShippingFreight(data);
validateMacroDriversEnergySpareCapacity(data);
validateMacroDriversEnergyTransport(data);
validateMacroDriversPolicyExpectations(data);
validateMacroDriversEmployment(data);
validateMacroDriversConsumerRetail(data);
validateMacroDriversCommercialRealEstate(data);
validateMacroDriversPrivateCreditProxy(data);
validateMacroDriversEuroVolatility(data);
validateMacroDriversWorldEconomy(data);
validateMacroDriversChinaEquity(data);
validateMacroDriversInflationEnergy(data);
validateMacroDriversCopperGold(data);
validateMacroDriversChinaBond(data);
validateMacroDriversCfetsRmb(data);
validateMacroDriversChinaInflation(data);
validateMacroDriversChinaPmi(data);
validateMacroDriversChinaPropertyPrice(data);
validateMacroDriversChinaOmo(data);
validateMacroDriversChinaTsf(data);
validateMacroDriversChinaMlf(data);
validateMacroDriversRateVol(data);
validateHistoryWindowFields(data);
validateBrentPricingLayer(data);
validateAiInterpretationLayer(data);
validateExternalAiInterpretationLayer(data);
validateDisplayInputsBaseline(data);
validateRealtimeBaselineAlignment(data, realtime);
validateBrentValidation(realtime);
validateDecisionContract(data);
validateTransmissionDeltaContract(data, history, historyFull);
console.log('Validation passed (v27.0)');
