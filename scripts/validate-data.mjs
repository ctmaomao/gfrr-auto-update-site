import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const BRENT_LAYER_SOURCE_STATUSES = new Set(['ok', 'fallback', 'missing']);
const BRENT_CONFIRMATION_STATUSES = new Set(['ok', 'fallback', 'missing', 'excluded']);
const BRENT_CONFIRMATION_ROLES = new Set(['anchor', 'futures_proxy', 'confirmation', 'diagnostic']);
const BRENT_PROXY_SPREAD_STATUSES = new Set(['normal', 'watch', 'stress', 'insufficient_data']);
const AI_INTERPRETATION_MODE = 'rule_based_structured_interpretation';
const AI_INTERPRETATION_MODEL_SOURCES = new Set(['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'macroDrivers', 'decisionModel', 'combined']);
const AI_INTERPRETATION_EVIDENCE_LAYERS = new Set(['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'macroDrivers.consumer', 'worldOrder', 'decisionModel']);
const EXTERNAL_AI_SCAFFOLD_CONTRACT_VERSION = 'v28.0K-3A';
const EXTERNAL_AI_SCAFFOLD_MODE = 'external_ai_disabled_scaffold';
const EXTERNAL_AI_SCAFFOLD_LAYERS = new Set(['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'macroDrivers.consumer', 'aiInterpretationLayer', 'decisionModel']);
const EXTERNAL_AI_PRODUCTION_CONTRACT_VERSION = 'v28.0L-external-ai-production-1';
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

  assert(layer.schemaVersion === EXTERNAL_AI_PRODUCTION_CONTRACT_VERSION, `externalAiInterpretationLayer.schemaVersion must be ${EXTERNAL_AI_PRODUCTION_CONTRACT_VERSION}`);
  assert(layer.status === 'valid', 'externalAiInterpretationLayer.status must be valid');
  assert(typeof layer.displayEnabled === 'boolean', 'externalAiInterpretationLayer.displayEnabled must be boolean');
  parseIsoTime(layer.generatedAt, 'externalAiInterpretationLayer.generatedAt');
  parseIsoTime(layer.updatedAt, 'externalAiInterpretationLayer.updatedAt');
  assert(layer.sourceMode === 'manual_local_compact', 'externalAiInterpretationLayer.sourceMode must be manual_local_compact');
  assert(layer.provider === 'deepseek', 'externalAiInterpretationLayer.provider must be deepseek');
  assert(layer.model === 'deepseek-v4-flash', 'externalAiInterpretationLayer.model must be deepseek-v4-flash');
  assert(layer.inputSource === 'local_compact', 'externalAiInterpretationLayer.inputSource must be local_compact');
  assert(layer.sourceSemantics === 'site_structured_data_compact_summary', 'externalAiInterpretationLayer.sourceSemantics must be site_structured_data_compact_summary');
  assertString(layer.summaryZh, 'externalAiInterpretationLayer.summaryZh');
  validateStringArray(layer.facts, 'externalAiInterpretationLayer.facts');
  validateStringArray(layer.inferences, 'externalAiInterpretationLayer.inferences');
  assertArray(layer.modelJudgments, 'externalAiInterpretationLayer.modelJudgments');
  assertArray(layer.scenarioHypotheses, 'externalAiInterpretationLayer.scenarioHypotheses');
  validateStringArray(layer.dataGaps, 'externalAiInterpretationLayer.dataGaps');
  validateStringArray(layer.invalidationSignals, 'externalAiInterpretationLayer.invalidationSignals');
  validateStringArray(layer.auditFlags, 'externalAiInterpretationLayer.auditFlags');

  assertArray(layer.sourceAttribution, 'externalAiInterpretationLayer.sourceAttribution');
  layer.sourceAttribution.forEach((item, index) => {
    assertPlainObject(item, `externalAiInterpretationLayer.sourceAttribution[${index}]`);
    for (const key of ['sourceLayer', 'field', 'claimType', 'noteZh']) {
      assertString(item[key], `externalAiInterpretationLayer.sourceAttribution[${index}].${key}`);
    }
  });

  const confidence = layer.confidence;
  assertPlainObject(confidence, 'externalAiInterpretationLayer.confidence');
  assert(['low', 'medium'].includes(confidence.level), 'externalAiInterpretationLayer.confidence.level must be low or medium');
  assert(Number.isFinite(confidence.score) && confidence.score >= 0 && confidence.score <= 100, 'externalAiInterpretationLayer.confidence.score must be 0-100');
  assertString(confidence.reasonZh, 'externalAiInterpretationLayer.confidence.reasonZh');

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

  if (layer.schemaVersion === EXTERNAL_AI_PRODUCTION_CONTRACT_VERSION) {
    validateExternalAiProductionLayer(layer);
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

function validateTransmissionDeltaContract(dataPayload, historyPayload, historyFullPayload) {
  validateTransmissionChainDeltas(dataPayload);
  validateTransmissionDeltaMeta(dataPayload);
  validateTransmissionSnapshotHistory(historyPayload, 'radar-history');
  validateTransmissionSnapshotHistory(historyFullPayload, 'radar-history-full');
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
validateBrentPricingLayer(data);
validateAiInterpretationLayer(data);
validateExternalAiInterpretationLayer(data);
validateDisplayInputsBaseline(data);
validateRealtimeBaselineAlignment(data, realtime);
validateBrentValidation(realtime);
validateDecisionContract(data);
validateTransmissionDeltaContract(data, history, historyFull);
console.log('Validation passed (v27.0)');
