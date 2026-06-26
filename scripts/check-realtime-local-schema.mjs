// check-realtime-local-schema.mjs — local fallback/Daily-baseline realtime payload schema guard.
// This intentionally does not enforce freshness; local realtime may lag Worker runtime.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REALTIME_PATH = 'realtime/market.json';
const ALLOWED_SOURCE_MODES = new Set(['live', 'degraded', 'live-with-fallback', 'cache-only', 'fallback', 'mock']);
const REQUIRED_VALUE_KEYS = ['brent', 'dxy', 'hyOas', 'vix', 'spx', 'us10y', 'us2y', 'real10y', 'breakeven10y', 'gold'];
const BRENT_CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low', 'none']);

const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertEqual(actual, expected, message) {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoStringOrNull(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length === 0) return false;
  return Number.isFinite(Date.parse(value));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function assertOptionalIso(value, label) {
  if (value !== undefined) {
    assert(isIsoStringOrNull(value), `${label} must be a parseable time string or null`);
  }
}

function assertNonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer`);
}

function assertFiniteRange(value, min, max, label) {
  assert(Number.isFinite(value) && value >= min && value <= max, `${label} must be finite in [${min}, ${max}]`);
}

function validateValues(payload) {
  assert(isRecord(payload.values), 'values must be an object');
  if (!isRecord(payload.values)) return;

  for (const key of REQUIRED_VALUE_KEYS) {
    assert(Number.isFinite(payload.values[key]), `values.${key} must be finite`);
  }
  assert(payload.values.brent > 0, 'values.brent must be positive');
  assert(payload.values.spx > 0, 'values.spx must be positive');
  assert(payload.values.gold > 0, 'values.gold must be positive');
}

function validateSourceStatus(payload) {
  assert(isRecord(payload.sourceStatus), 'sourceStatus must be an object');
  if (!isRecord(payload.sourceStatus)) return;

  for (const key of REQUIRED_VALUE_KEYS) {
    assert(typeof payload.sourceStatus[key] === 'string' && payload.sourceStatus[key].length > 0, `sourceStatus.${key} must be a non-empty string`);
  }
}

function validateSourceDetails(payload) {
  if (payload.sourceDetails === undefined) return;
  assert(isRecord(payload.sourceDetails), 'sourceDetails must be an object when present');
  if (!isRecord(payload.sourceDetails)) return;

  for (const key of REQUIRED_VALUE_KEYS) {
    const detail = payload.sourceDetails[key];
    if (detail === undefined) continue;
    assert(isRecord(detail), `sourceDetails.${key} must be an object`);
    if (!isRecord(detail)) continue;
    assert(typeof detail.ok === 'boolean', `sourceDetails.${key}.ok must be boolean`);
    if (detail.value !== null && detail.value !== undefined) {
      assert(Number.isFinite(detail.value), `sourceDetails.${key}.value must be finite or null`);
    }
    if (detail.source !== undefined) {
      assert(typeof detail.source === 'string' && detail.source.length > 0, `sourceDetails.${key}.source must be non-empty when present`);
    }
    assertOptionalIso(detail.timestamp, `sourceDetails.${key}.timestamp`);
    if (detail.error !== null && detail.error !== undefined) {
      assert(typeof detail.error === 'string', `sourceDetails.${key}.error must be string or null`);
    }
  }
}

function validateFieldFreshness(payload) {
  if (payload.fieldFreshness === undefined) return;
  assert(isRecord(payload.fieldFreshness), 'fieldFreshness must be an object when present');
  if (!isRecord(payload.fieldFreshness)) return;

  for (const [key, entry] of Object.entries(payload.fieldFreshness)) {
    assert(REQUIRED_VALUE_KEYS.includes(key), `fieldFreshness unsupported key: ${key}`);
    assert(isRecord(entry), `fieldFreshness.${key} must be an object`);
    if (!isRecord(entry)) continue;
    assertOptionalIso(entry.observedAt, `fieldFreshness.${key}.observedAt`);
    if (entry.ageMinutes !== null && entry.ageMinutes !== undefined) {
      assert(Number.isFinite(entry.ageMinutes) && entry.ageMinutes >= 0, `fieldFreshness.${key}.ageMinutes must be non-negative finite or null`);
    }
    if (entry.freshnessLevel !== undefined) {
      assert(typeof entry.freshnessLevel === 'string' && entry.freshnessLevel.length > 0, `fieldFreshness.${key}.freshnessLevel must be non-empty`);
    }
    if (entry.isStale !== undefined) {
      assert(typeof entry.isStale === 'boolean', `fieldFreshness.${key}.isStale must be boolean`);
    }
  }
}

function validateBrentValidation(payload) {
  assert(isRecord(payload.brentValidation), 'brentValidation must be an object');
  if (!isRecord(payload.brentValidation)) return;

  const { candidates, consensus } = payload.brentValidation;
  assert(Array.isArray(candidates), 'brentValidation.candidates must be an array');
  assert(isRecord(consensus), 'brentValidation.consensus must be an object');

  if (Array.isArray(candidates)) {
    assert(candidates.length > 0, 'brentValidation.candidates must not be empty');
    for (const [index, candidate] of candidates.entries()) {
      assert(isRecord(candidate), `brentValidation.candidates[${index}] must be an object`);
      if (!isRecord(candidate)) continue;
      assert(typeof candidate.source === 'string' && candidate.source.length > 0, `brentValidation.candidates[${index}].source must be non-empty`);
      assert(typeof candidate.available === 'boolean', `brentValidation.candidates[${index}].available must be boolean`);
      if (candidate.value !== null && candidate.value !== undefined) {
        assert(Number.isFinite(candidate.value), `brentValidation.candidates[${index}].value must be finite or null`);
      }
      assertOptionalIso(candidate.observedAt, `brentValidation.candidates[${index}].observedAt`);
      assertOptionalIso(candidate.fetchedAt, `brentValidation.candidates[${index}].fetchedAt`);
      if (candidate.participatesInConsensus !== undefined) {
        assert(typeof candidate.participatesInConsensus === 'boolean', `brentValidation.candidates[${index}].participatesInConsensus must be boolean`);
      }
      if (candidate.staleForConsensus !== undefined) {
        assert(typeof candidate.staleForConsensus === 'boolean', `brentValidation.candidates[${index}].staleForConsensus must be boolean`);
      }
    }
  }

  if (isRecord(consensus)) {
    for (const key of ['recommendedValue', 'recommendedSource', 'confidence', 'canPromoteToPrimary']) {
      assert(Object.hasOwn(consensus, key), `brentValidation.consensus.${key} is missing`);
    }
    assert(BRENT_CONFIDENCE_LEVELS.has(consensus.confidence), 'brentValidation.consensus.confidence must be high/medium/low/none');
    assert(typeof consensus.canPromoteToPrimary === 'boolean', 'brentValidation.consensus.canPromoteToPrimary must be boolean');
    if (consensus.recommendedValue !== null) {
      assert(Number.isFinite(consensus.recommendedValue), 'brentValidation.consensus.recommendedValue must be finite or null');
    }
    if (consensus.recommendedSource !== null) {
      assert(typeof consensus.recommendedSource === 'string' && consensus.recommendedSource.length > 0, 'brentValidation.consensus.recommendedSource must be non-empty or null');
    }
    if (consensus.confidence === 'none') {
      assertEqual(consensus.recommendedValue, null, 'confidence=none recommendedValue');
      assertEqual(consensus.recommendedSource, null, 'confidence=none recommendedSource');
      assertEqual(consensus.canPromoteToPrimary, false, 'confidence=none canPromoteToPrimary');
    }
  }
}

let payload;
try {
  payload = readJson(REALTIME_PATH);
} catch (error) {
  console.error('Realtime local schema: FAIL');
  console.error(`- Unable to read ${REALTIME_PATH}: ${error.message}`);
  process.exit(1);
}

assert(isRecord(payload), 'root must be an object');
assertOptionalIso(payload.updatedAt, 'updatedAt');
assertOptionalIso(payload.asOf, 'asOf');
assertOptionalIso(payload.lastSuccessAt, 'lastSuccessAt');
assert(ALLOWED_SOURCE_MODES.has(payload.sourceMode), `sourceMode unsupported: ${payload.sourceMode}`);
assert(typeof payload.degradedMode === 'boolean', 'degradedMode must be boolean');
assert(typeof payload.cacheOnly === 'boolean', 'cacheOnly must be boolean');
assertFiniteRange(payload.healthScore, 0, 100, 'healthScore');
assertNonNegativeInteger(payload.criticalMissing, 'criticalMissing');
assertNonNegativeInteger(payload.fallbackCount, 'fallbackCount');
if (payload.secondarySourceCount !== undefined) {
  assertNonNegativeInteger(payload.secondarySourceCount, 'secondarySourceCount');
}
if (payload.ageMinutes !== null && payload.ageMinutes !== undefined) {
  assert(Number.isFinite(payload.ageMinutes) && payload.ageMinutes >= 0, 'ageMinutes must be non-negative finite or null');
}
if (payload.unavailable !== undefined) {
  assert(typeof payload.unavailable === 'boolean', 'unavailable must be boolean when present');
}

validateValues(payload);
validateSourceStatus(payload);
validateSourceDetails(payload);
validateFieldFreshness(payload);
validateBrentValidation(payload);

if (errors.length) {
  console.error('Realtime local schema: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Realtime local schema: PASS (${REQUIRED_VALUE_KEYS.length} value fields, sourceMode=${payload.sourceMode})`);
