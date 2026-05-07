import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data', 'world-order-stress.json');

const allowedStates = new Set([
  'normal_globalization',
  'friction_rising',
  'bloc_fragmentation',
  'multi_theater_stress',
  'war_economy_stress'
]);
const allowedFreshness = new Set(['fresh', 'stale', 'partial', 'error']);
const allowedMarketStates = new Set(['not_confirmed', 'weak', 'partial_confirmed', 'high_confirmed']);
const allowedMarketInputSources = new Set(['worker-generated-preview', 'local-realtime', 'daily-baseline', 'unavailable']);
const allowedGdeltQueryStatuses = new Set(['ok', 'partial', 'error', 'rate_limited', 'skipped']);
const allowedSipriStatuses = new Set(['ok', 'stale', 'error', 'manual_required']);
const marketInputNumberFields = ['brent', 'gold', 'vix', 'dxy', 'hyOas', 'us10y', 'real10y', 'spx'];
const sourceKeys = ['gdelt', 'ofac', 'sipri', 'acled'];
const dimensionKeys = [
  'peaceDividendRetreat',
  'blocFormation',
  'multiTheaterConflict',
  'economicWeaponization',
  'capitalControlRisk',
  'marketConfirmation'
];
const forbiddenPhrases = [
  'WW3 已确认',
  '世界大战即将爆发',
  '世界大战概率',
  '第三次世界大战已确认',
  '13 步已走',
  '世界大战第几步'
];

function fail(message) {
  throw new Error(`World order stress check failed: ${message}`);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function assertScore(value, fieldName) {
  if (!Number.isFinite(value) || value < 0 || value > 100) fail(`${fieldName} must be 0-100`);
}

function assertConfidence(value, fieldName) {
  if (!Number.isFinite(value) || value < 0 || value > 1) fail(`${fieldName} must be 0-1`);
}

function assertEvidenceArray(value, fieldName) {
  if (!Array.isArray(value)) fail(`${fieldName} must be an array`);
  for (const [index, item] of value.entries()) {
    if (!isObject(item)) fail(`${fieldName}[${index}] must be an object`);
    for (const key of ['labelZh', 'source', 'direction', 'confidence']) {
      if (!(key in item)) fail(`${fieldName}[${index}].${key} missing`);
    }
    if (!('summary' in item) && !('value' in item)) fail(`${fieldName}[${index}] must include summary or value`);
    const serialized = JSON.stringify(item);
    if (serialized.includes('undefined') || serialized.includes('NaN')) {
      fail(`${fieldName}[${index}] must not contain undefined or NaN`);
    }
    assertConfidence(item.confidence, `${fieldName}[${index}].confidence`);
  }
}

function assertFiniteOrNull(value, fieldName) {
  if (value !== null && !Number.isFinite(value)) fail(`${fieldName} must be finite number or null`);
}

function assertParseableIsoOrNull(value, fieldName) {
  if (value === null) return;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(`${fieldName} must be parseable ISO string or null`);
}

function fmtPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'null';
}

if (!fs.existsSync(dataPath)) fail('data/world-order-stress.json missing');
const text = fs.readFileSync(dataPath, 'utf8');
if (text.includes('undefined') || text.includes('NaN')) fail('payload must not contain undefined or NaN');
for (const phrase of forbiddenPhrases) {
  if (text.includes(phrase)) fail(`forbidden phrase present: ${phrase}`);
}

const payload = JSON.parse(text);
for (const key of ['version', 'updatedAt', 'sourceMode', 'score', 'state', 'labelZh', 'confidence', 'freshness', 'marketConfirmationInput', 'externalSources', 'dimensions', 'dominantDrivers', 'systemInterpretationZh', 'decisionModifier', 'warnings']) {
  if (!(key in payload)) fail(`${key} missing`);
}
assertScore(payload.score, 'score');
assertConfidence(payload.confidence, 'confidence');
if (!allowedStates.has(payload.state)) fail(`invalid state: ${payload.state}`);
if (!allowedFreshness.has(payload.freshness)) fail(`invalid freshness: ${payload.freshness}`);
if (!isObject(payload.marketConfirmationInput)) fail('marketConfirmationInput must be object');
if (!allowedMarketInputSources.has(payload.marketConfirmationInput.source)) {
  fail(`invalid marketConfirmationInput.source: ${payload.marketConfirmationInput.source}`);
}
assertParseableIsoOrNull(payload.marketConfirmationInput.updatedAt, 'marketConfirmationInput.updatedAt');
assertFiniteOrNull(payload.marketConfirmationInput.ageMinutes, 'marketConfirmationInput.ageMinutes');
assertFiniteOrNull(payload.marketConfirmationInput.healthScore, 'marketConfirmationInput.healthScore');
assertFiniteOrNull(payload.marketConfirmationInput.criticalMissing, 'marketConfirmationInput.criticalMissing');
for (const key of marketInputNumberFields) {
  if (!(key in payload.marketConfirmationInput)) fail(`marketConfirmationInput.${key} missing`);
  assertFiniteOrNull(payload.marketConfirmationInput[key], `marketConfirmationInput.${key}`);
}
for (const key of ['brentSource', 'brentPromotionApplied', 'brentPromotionReason', 'fallbackReason']) {
  if (!(key in payload.marketConfirmationInput)) fail(`marketConfirmationInput.${key} missing`);
}
if (typeof payload.marketConfirmationInput.brentPromotionApplied !== 'boolean') {
  fail('marketConfirmationInput.brentPromotionApplied must be boolean');
}
if (payload.marketConfirmationInput.source === 'worker-generated-preview') {
  if (payload.marketConfirmationInput.updatedAt === null) fail('worker market input updatedAt required');
  if (!Number.isFinite(payload.marketConfirmationInput.healthScore)) fail('worker market input healthScore required');
  if (!Number.isFinite(payload.marketConfirmationInput.criticalMissing)) fail('worker market input criticalMissing required');
  if (!Number.isFinite(payload.marketConfirmationInput.brent) || payload.marketConfirmationInput.brent <= 0) {
    fail('worker market input brent must be positive finite');
  }
}
if (!isObject(payload.externalSources)) fail('externalSources must be object');

for (const sourceKey of sourceKeys) {
  const source = payload.externalSources[sourceKey];
  if (!isObject(source)) fail(`externalSources.${sourceKey} missing`);
  for (const key of ['enabled', 'status', 'lastFetchedAt', 'summary']) {
    if (!(key in source)) fail(`externalSources.${sourceKey}.${key} missing`);
  }
  if (typeof source.enabled !== 'boolean') fail(`externalSources.${sourceKey}.enabled must be boolean`);
  if (typeof source.status !== 'string' || source.status.length === 0) fail(`externalSources.${sourceKey}.status invalid`);
  if (!isObject(source.summary)) fail(`externalSources.${sourceKey}.summary must be object`);
}

const gdelt = payload.externalSources.gdelt;
const gdeltSummary = gdelt.summary;
for (const key of ['successCount', 'failureCount', 'rateLimitedCount']) {
  if (!Number.isFinite(gdeltSummary[key])) fail(`externalSources.gdelt.summary.${key} must be finite number`);
}
if (typeof gdeltSummary.usedCachedSummary !== 'boolean') {
  fail('externalSources.gdelt.summary.usedCachedSummary must be boolean');
}
if (!('cacheReason' in gdeltSummary)) fail('externalSources.gdelt.summary.cacheReason missing');
if (gdeltSummary.cacheReason !== null && typeof gdeltSummary.cacheReason !== 'string') {
  fail('externalSources.gdelt.summary.cacheReason must be string or null');
}
if (!Array.isArray(gdeltSummary.queriesRun)) fail('externalSources.gdelt.summary.queriesRun must be array');
for (const [index, queryRun] of gdeltSummary.queriesRun.entries()) {
  if (!isObject(queryRun)) fail(`externalSources.gdelt.summary.queriesRun[${index}] must be object`);
  for (const key of ['label', 'status', 'articleCount', 'error']) {
    if (!(key in queryRun)) fail(`externalSources.gdelt.summary.queriesRun[${index}].${key} missing`);
  }
  if (!allowedGdeltQueryStatuses.has(queryRun.status)) {
    fail(`externalSources.gdelt.summary.queriesRun[${index}].status invalid`);
  }
  if (!Number.isFinite(queryRun.articleCount)) {
    fail(`externalSources.gdelt.summary.queriesRun[${index}].articleCount must be finite number`);
  }
}
if (gdelt.status === 'partial' && gdeltSummary.successCount < 1) {
  fail('externalSources.gdelt partial status requires successCount >= 1');
}
if (gdelt.status === 'stale') {
  if (gdeltSummary.usedCachedSummary !== true) fail('externalSources.gdelt stale status requires usedCachedSummary=true');
  if (typeof gdeltSummary.cacheReason !== 'string' || gdeltSummary.cacheReason.length === 0) {
    fail('externalSources.gdelt stale status requires cacheReason');
  }
}
if (gdelt.status === 'error' && gdeltSummary.successCount !== 0) {
  fail('externalSources.gdelt error status requires successCount=0');
}

const sipri = payload.externalSources.sipri;
const sipriSummary = sipri.summary;
if (!allowedSipriStatuses.has(sipri.status)) fail(`externalSources.sipri.status invalid: ${sipri.status}`);
for (const key of [
  'updatedYear',
  'globalMilitarySpendTrend',
  'majorPowerMilitarySpendTrend',
  'militarySpendShareOfGDPTrend',
  'sourceFreshness',
  'noteZh'
]) {
  if (!(key in sipriSummary)) fail(`externalSources.sipri.summary.${key} missing`);
}
if (JSON.stringify(sipriSummary).includes('exampleOnly') || JSON.stringify(sipriSummary).includes('notForScoring')) {
  fail('externalSources.sipri summary must not expose exampleOnly or notForScoring as scoring data');
}
if (sipri.status === 'ok') {
  if (!Number.isFinite(sipriSummary.updatedYear)) fail('externalSources.sipri.summary.updatedYear required when ok');
  assertConfidence(sipriSummary.confidence, 'externalSources.sipri.summary.confidence');
  if (!Number.isFinite(sipriSummary.majorPowersTracked)) fail('externalSources.sipri.summary.majorPowersTracked required when ok');
  if (!Number.isFinite(sipriSummary.regionsTracked)) fail('externalSources.sipri.summary.regionsTracked required when ok');
}
if (sipri.status === 'manual_required') {
  const note = String(sipriSummary.noteZh || '');
  if (!note.includes('手动导入') && !note.includes('尚未导入')) {
    fail('externalSources.sipri manual_required noteZh must mention manual import');
  }
}

if (!isObject(payload.dimensions)) fail('dimensions must be object');
for (const key of dimensionKeys) {
  const dimension = payload.dimensions[key];
  if (!isObject(dimension)) fail(`dimensions.${key} missing`);
  assertScore(dimension.score, `dimensions.${key}.score`);
  if (typeof dimension.labelZh !== 'string' || dimension.labelZh.length === 0) fail(`dimensions.${key}.labelZh invalid`);
  if (key === 'marketConfirmation') {
    if (!allowedMarketStates.has(dimension.state)) fail(`invalid marketConfirmation state: ${dimension.state}`);
  } else if (typeof dimension.trend !== 'string' || dimension.trend.length === 0) {
    fail(`dimensions.${key}.trend invalid`);
  }
  assertEvidenceArray(dimension.evidence, `dimensions.${key}.evidence`);
}

if (!Array.isArray(payload.warnings)) fail('warnings must be array');
if (!payload.warnings.some((warning) => String(warning).includes('不构成战争预测或投资建议'))) {
  fail('required warning missing');
}
if (!isObject(payload.decisionModifier)) fail('decisionModifier must be object');
for (const key of ['enabled', 'riskBias', 'maxStateBoost', 'appliesWhen']) {
  if (!(key in payload.decisionModifier)) fail(`decisionModifier.${key} missing`);
}

console.log('World Order Stress Check');
console.log('Result: PASS');
console.log(`score: ${payload.score}`);
console.log(`state: ${payload.state}`);
console.log(`freshness: ${payload.freshness}`);
console.log(`confidence: ${fmtPercent(payload.confidence)}`);
console.log(`marketConfirmationSource: ${payload.marketConfirmationInput.source}`);
console.log(`gdeltStatus: ${payload.externalSources.gdelt.status}`);
console.log(`ofacStatus: ${payload.externalSources.ofac.status}`);
console.log(`sipriStatus: ${payload.externalSources.sipri.status}`);
console.log(`acledStatus: ${payload.externalSources.acled.status}`);
console.log(`warnings: ${payload.warnings.length}`);
