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

if (!fs.existsSync(dataPath)) throw new Error('Validation failed: missing data/radar-data.json');
if (!fs.existsSync(historyPath)) throw new Error('Validation failed: missing data/radar-history.json');
if (!fs.existsSync(realtimePath)) throw new Error('Validation failed: missing realtime/market.json');
if (fs.existsSync(historyFullPath)) {
  const histFull = JSON.parse(fs.readFileSync(historyFullPath, 'utf8'));
  if (!Array.isArray(histFull) || histFull.length === 0) throw new Error('Validation failed: radar-history-full.json is empty or malformed.');
  const latest = histFull[histFull.length - 1];
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

function assert(condition, message) {
  if (!condition) throw new Error(`Validation failed: ${message}`);
}

function isFiniteNumberOrNull(value) {
  return value === null || Number.isFinite(value);
}

function isCloseEnough(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function parseIsoTime(value, fieldName) {
  assert(typeof value === 'string' && value.trim().length > 0, `dailyRealtimeInput.${fieldName} must be a non-empty ISO string`);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `dailyRealtimeInput.${fieldName} is not parseable`);
  return timestamp;
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

function validateRealtimeBaselineAlignment(dataPayload, realtimePayload) {
  if (!shouldValidateRealtimeBaselineAlignment(realtimePayload)) return;
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

if (!data.updatedAt) throw new Error('Validation failed: missing updatedAt.');
if (!Array.isArray(history) || history.length < 30) throw new Error('Validation failed: insufficient history.');
if (!data.timeDimension || !data.warningSystem || !data.assetReturnMap) throw new Error('Validation failed: core modules missing.');
if (!data.tradingSystem || !data.tradingSystem.executionLock || !data.tradingSystem.actionLayer || !data.tradingSystem.positioning) {
  throw new Error('Validation failed: trading engine modules missing.');
}
if (!realtime.values || !realtime.sourceStatus) throw new Error('Validation failed: realtime payload incomplete.');
validateDailyRealtimeInput(data);
validateDisplayInputsBaseline(data);
validateRealtimeBaselineAlignment(data, realtime);
validateBrentValidation(realtime);
console.log('Validation passed (v27.0)');
