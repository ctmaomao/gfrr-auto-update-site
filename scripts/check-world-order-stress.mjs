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
    assertConfidence(item.confidence, `${fieldName}[${index}].confidence`);
  }
}

if (!fs.existsSync(dataPath)) fail('data/world-order-stress.json missing');
const text = fs.readFileSync(dataPath, 'utf8');
for (const phrase of forbiddenPhrases) {
  if (text.includes(phrase)) fail(`forbidden phrase present: ${phrase}`);
}

const payload = JSON.parse(text);
for (const key of ['version', 'updatedAt', 'sourceMode', 'score', 'state', 'labelZh', 'confidence', 'freshness', 'externalSources', 'dimensions', 'dominantDrivers', 'systemInterpretationZh', 'decisionModifier', 'warnings']) {
  if (!(key in payload)) fail(`${key} missing`);
}
assertScore(payload.score, 'score');
assertConfidence(payload.confidence, 'confidence');
if (!allowedStates.has(payload.state)) fail(`invalid state: ${payload.state}`);
if (!allowedFreshness.has(payload.freshness)) fail(`invalid freshness: ${payload.freshness}`);
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

console.log('World order stress check passed');
