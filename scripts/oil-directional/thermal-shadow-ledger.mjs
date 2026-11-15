// Offline synthetic fixtures only. Receipt clocks are caller assertions, not
// authenticated collection evidence. No network, storage, system clock or scoring.
const MAX_RECEIPTS = 100;
const MAX_ROWS = 100;
const MAX_OBSERVATIONS = 1000;
const MAX_BYTES = 1_000_000;
const SCHEMA = 'thermal-shadow-fixture-ledger-1';
const OUTCOMES = new Set(['retired', 'error', 'invalid_response', 'success_zero', 'success_detections']);

function requireThat(ok, message) { if (!ok) throw new Error(message); }
function keys(object, names) {
  requireThat(object !== null && typeof object === 'object' && !Array.isArray(object), 'Expected record');
  requireThat(Object.keys(object).length === names.length && names.every(key => Object.hasOwn(object, key)), 'Unexpected or missing fields');
}
function bounded(value) {
  requireThat(new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_BYTES, 'Fixture byte limit exceeded');
}
function token(value) {
  requireThat(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value), 'Invalid identifier');
  return value;
}
function clock(value) {
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), 'Invalid UTC clock');
  const time = Date.parse(value);
  requireThat(Number.isFinite(time), 'Invalid UTC clock');
  const iso = new Date(time).toISOString();
  requireThat(iso === value || iso === value.replace('Z', '.000Z'), 'Invalid UTC calendar');
  return iso;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function manifestOf(value) {
  keys(value, ['pilotId', 'cohortId', 'sourceSet', 'geometryRevision', 'configRevision']);
  requireThat(Array.isArray(value.sourceSet) && value.sourceSet.length > 0 && value.sourceSet.length <= 4, 'Invalid source set');
  const sources = value.sourceSet.map(token).sort();
  requireThat(new Set(sources).size === sources.length, 'Duplicate source');
  return { pilotId: token(value.pilotId), cohortId: token(value.cohortId), sourceSet: sources,
    geometryRevision: token(value.geometryRevision), configRevision: token(value.configRevision) };
}
function emptyLedger(manifest) {
  return { schemaVersion: SCHEMA, dataAuthenticity: 'synthetic_fixture_only', eligibleForEvaluation: false,
    coverage: 'unknown', manifest, receipts: [], observations: [], labels: [] };
}
function receiptOf(value, manifest) {
  keys(value, ['requestId', 'cohortId', 'source', 'geometryRevision', 'configRevision', 'codeRevision', 'fetchStartedAt', 'receivedAt', 'windowStart', 'windowEnd', 'outcome', 'observations']);
  requireThat(value.cohortId === manifest.cohortId && value.geometryRevision === manifest.geometryRevision && value.configRevision === manifest.configRevision, 'Cohort or revision mismatch');
  requireThat(manifest.sourceSet.includes(value.source), 'Source outside cohort');
  requireThat(OUTCOMES.has(value.outcome), 'Unknown request outcome');
  const fetchStartedAt = clock(value.fetchStartedAt), receivedAt = clock(value.receivedAt);
  const windowStart = clock(value.windowStart), windowEnd = clock(value.windowEnd);
  requireThat(fetchStartedAt <= receivedAt && windowStart <= windowEnd && windowEnd <= receivedAt, 'Inconsistent receipt clocks');
  requireThat(Array.isArray(value.observations) && value.observations.length <= MAX_ROWS, 'Observation row limit exceeded');
  requireThat(value.outcome === 'success_detections' ? value.observations.length > 0 : value.observations.length === 0, 'Outcome and observations disagree');
  const seen = new Set();
  const observations = value.observations.map(row => {
    keys(row, ['identity', 'acquiredAt', 'frpMw', 'confidence', 'dayNight', 'processingRevision']);
    // Fixture digests are assertions: a future collector must bind source/time/position,
    // excluding FRP and processing revision. This module cannot authenticate that.
    requireThat(typeof row.identity === 'string' && /^sha256:[a-f0-9]{64}$/.test(row.identity), 'Invalid sanitized observation identity');
    requireThat(!seen.has(row.identity), 'Duplicate observation in receipt'); seen.add(row.identity);
    const acquiredAt = clock(row.acquiredAt);
    requireThat(acquiredAt >= windowStart && acquiredAt <= windowEnd && acquiredAt <= receivedAt, 'Observation outside receipt window');
    requireThat(row.frpMw === null || (typeof row.frpMw === 'number' && Number.isFinite(row.frpMw) && row.frpMw >= 0), 'Invalid FRP');
    requireThat(['h', 'n', 'l', 'unknown'].includes(row.confidence), 'Invalid confidence');
    requireThat(['D', 'N', 'unknown'].includes(row.dayNight), 'Invalid day/night');
    return { identity: row.identity, acquiredAt, frpMw: row.frpMw, confidence: row.confidence,
      dayNight: row.dayNight, processingRevision: row.processingRevision === null ? null : token(row.processingRevision) };
  });
  return { requestId: token(value.requestId), cohortId: value.cohortId, source: value.source,
    geometryRevision: value.geometryRevision, configRevision: value.configRevision,
    codeRevision: token(value.codeRevision), fetchStartedAt, receivedAt, windowStart, windowEnd, outcome: value.outcome, observations };
}
function appendValidated(state, input) {
  const receipt = receiptOf(input, state.manifest);
  const prior = state.receipts.find(row => row.requestId === receipt.requestId);
  if (prior) {
    requireThat(canonical(prior) === canonical(receipt), 'Conflicting request identity');
    return state;
  }
  requireThat(state.receipts.length < MAX_RECEIPTS, 'Receipt limit exceeded');
  requireThat(!state.receipts.length || receipt.receivedAt >= state.receipts.at(-1).receivedAt, 'Backdated receipt rejected');
  // Rebuilt state is local to this operation; any failure discards all changes.
  for (const row of receipt.observations) {
    let observation = state.observations.find(item => item.identity === row.identity);
    if (!observation) {
      requireThat(state.observations.length < MAX_OBSERVATIONS, 'Unique observation limit exceeded');
      observation = { identity: row.identity, source: receipt.source, acquiredAt: row.acquiredAt,
        firstSeenAt: receipt.receivedAt, revisions: [] };
      state.observations.push(observation);
    }
    requireThat(observation.source === receipt.source && observation.acquiredAt === row.acquiredAt, 'Observation identity conflicts with source or acquisition');
    const revision = { frpMw: row.frpMw, confidence: row.confidence, dayNight: row.dayNight, processingRevision: row.processingRevision };
    if (!observation.revisions.some(item => canonical(item.value) === canonical(revision))) {
      observation.revisions.push({ firstSeenAt: receipt.receivedAt, value: revision });
    }
  }
  state.receipts.push(receipt);
  bounded(state);
  return state;
}
function replay(ledger) {
  bounded(ledger);
  keys(ledger, ['schemaVersion', 'dataAuthenticity', 'eligibleForEvaluation', 'coverage', 'manifest', 'receipts', 'observations', 'labels']);
  requireThat(Array.isArray(ledger.receipts) && ledger.receipts.length <= MAX_RECEIPTS, 'Invalid receipt list');
  const state = emptyLedger(manifestOf(ledger.manifest));
  for (const receipt of ledger.receipts) appendValidated(state, receipt);
  requireThat(canonical(state) === canonical(ledger), 'Ledger differs from deterministic receipt replay');
  return state;
}

export function validateThermalLedger(ledger) {
  try { replay(ledger); return { valid: true, errors: [] }; }
  catch (error) { return { valid: false, errors: [error instanceof Error ? error.message : 'Invalid ledger'] }; }
}

// manifest is mandatory only for a new ledger; existing manifests cannot change.
export function appendThermalReceipt(ledger, receipt, manifest = undefined) {
  bounded(receipt);
  const state = ledger === null ? emptyLedger(manifestOf(manifest)) : replay(ledger);
  if (ledger !== null && manifest !== undefined) {
    requireThat(canonical(manifestOf(manifest)) === canonical(state.manifest), 'Cannot change existing cohort');
  }
  return appendValidated(state, receipt);
}
