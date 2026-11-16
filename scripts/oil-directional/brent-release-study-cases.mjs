// Pure offline, frozen-protocol case construction. No source access, fitting, or publication.
import { createHash } from 'node:crypto';
import protocolJson from '../../config/brent-spot-release-direction-protocol.json' with { type: 'json' };

const CANONICAL_PROTOCOL_HASH = '6a1cf8735184e43fb0084856695b82c3cd130d7f2acb9f017ffccf1ec6e9f76c';
export const BRENT_PROTOCOL_SHA256 = '2bc3f54ccda10efe2c72ea734d6dbbd6d130fcd5a606491e136fccf6236757e3';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function freeze(value) { for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); return Object.freeze(value); }
if (digest(protocolJson) !== CANONICAL_PROTOCOL_HASH) throw new Error('Frozen Brent protocol mismatch');
const PROTOCOL = freeze(protocolJson);
const DAY = 86400000;
const horizons = [PROTOCOL.issuance.horizons.primary, ...PROTOCOL.issuance.horizons.secondary];
const fail = message => { throw new Error(message); };
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Invalid study date');
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) fail('Invalid study calendar date');
  return ms;
}
function cutoff(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail('Explicit UTC retrieval cutoff required');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail('Invalid retrieval cutoff');
  return ms;
}
const plusTwo = date => new Date(day(date) + 2 * DAY).toISOString();
export function getFrozenBrentProtocol() { return JSON.parse(JSON.stringify(PROTOCOL)); }

export function normalizeInitialReleaseRecords(input, retrievalCutoff) {
  const retrieved = cutoff(retrievalCutoff);
  if (!Array.isArray(input) || input.length === 0 || input.length > PROTOCOL.data.maxRows) fail('Invalid initial-release row count');
  const byQuote = new Map(); let duplicateCount = 0;
  for (const row of input) {
    if (!row || Object.getPrototypeOf(row) !== Object.prototype
        || Object.keys(row).sort().join('|') !== 'initialAvailableDate|quoteDate|value'
        || Object.values(Object.getOwnPropertyDescriptors(row)).some(d => !Object.hasOwn(d, 'value'))) fail('Invalid normalized initial-release schema');
    const quoteMs = day(row.quoteDate), availableMs = day(row.initialAvailableDate);
    if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value <= 0) fail('Positive finite initial-release value required');
    if (availableMs < quoteMs || row.initialAvailableDate < PROTOCOL.issuance.earliestArchiveDate || availableMs > retrieved) fail('Invalid initial availability chronology');
    const previous = byQuote.get(row.quoteDate);
    if (previous) {
      if (previous.initialAvailableDate !== row.initialAvailableDate || previous.value !== row.value) fail('Conflicting initial-release quote');
      duplicateCount++; continue;
    }
    byQuote.set(row.quoteDate, { quoteDate: row.quoteDate, initialAvailableDate: row.initialAvailableDate, value: row.value });
  }
  return { records: [...byQuote.values()].sort((a, b) => a.quoteDate.localeCompare(b.quoteDate)), duplicateCount };
}
function phaseFor(issueDate) {
  const s = PROTOCOL.splits;
  for (const [phase, range, next] of [
    ['train', s.train, s.calibration[0]], ['calibration', s.calibration, s.untouchedTest[0]],
    ['test', s.untouchedTest, s.secondaryFinalChronologicalHoldout[0]]
  ]) if (issueDate >= range[0] && issueDate <= range[1]) return { phase, nextPhaseStart: next };
  return issueDate >= s.secondaryFinalChronologicalHoldout[0]
    ? { phase: 'secondaryFinalChronologicalHoldout', nextPhaseStart: null }
    : { phase: null, nextPhaseStart: null };
}
function featuresFor(known, issueAt) {
  const window = known.slice(-21), reasons = [];
  if (window.length < 21) reasons.push('insufficient_21_known_quotes');
  const latest = window.at(-1);
  const spanDays = window.length ? (day(latest.quoteDate) - day(window[0].quoteDate)) / DAY : null;
  const latestQuoteAgeDays = latest ? (Date.parse(issueAt) - day(latest.quoteDate)) / DAY : null;
  const maximumGapDays = window.length > 1 ? Math.max(...window.slice(1).map((r, i) => (day(r.quoteDate) - day(window[i].quoteDate)) / DAY)) : null;
  if (spanDays > PROTOCOL.issuance.maxLookbackSpanDays) reasons.push('lookback_span_exceeded');
  if (maximumGapDays > PROTOCOL.issuance.maxConsecutiveLookbackGapDays) reasons.push('lookback_gap_exceeded');
  if (latestQuoteAgeDays > PROTOCOL.issuance.maxLatestQuoteAgeAtIssueDays) reasons.push('latest_quote_stale_at_issue');
  let values = null;
  if (!reasons.length) {
    const logs = window.map(r => Math.log(r.value));
    const returns = logs.slice(1).map((v, i) => v - logs[i]);
    const mean = returns.reduce((a, b) => a + b, 0) / 20;
    values = [logs[20] - logs[19], logs[20] - logs[15], logs[20] - logs[0],
      Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / 20)];
    if (!values.every(Number.isFinite)) { values = null; reasons.push('nonfinite_features'); }
  }
  return { eligible: reasons.length === 0, reasons, values, quoteDates: window.map(r => r.quoteDate),
    windowCount: window.length, spanDays, maximumGapDays, latestQuoteAgeDays };
}
function labelFor(records, anchorIndex, horizon, issueDate, phase, retrieved, featureEligible, issued) {
  const reasons = [];
  const anchor = anchorIndex < 0 ? null : records[anchorIndex];
  const endpoint = anchor ? records[anchorIndex + horizon] ?? null : null;
  if (!anchor) reasons.push('no_strict_future_anchor');
  else if (!endpoint) reasons.push('insufficient_future_quote_intervals');
  const spanDays = endpoint ? (day(endpoint.quoteDate) - day(issueDate)) / DAY : null;
  if (spanDays > PROTOCOL.issuance.maxFutureIntervalSpanDays[String(horizon)]) reasons.push('future_interval_span_exceeded');
  const anchorAvailableAt = anchor ? plusTwo(anchor.initialAvailableDate) : null;
  const endpointAvailableAt = endpoint ? plusTwo(endpoint.initialAvailableDate) : null;
  const matureAt = endpoint ? [anchorAvailableAt, endpointAvailableAt].sort().at(-1) : null;
  if (matureAt && Date.parse(matureAt) > retrieved) reasons.push('label_not_mature_at_retrieval');
  if (endpoint && phase.nextPhaseStart && (endpoint.quoteDate >= phase.nextPhaseStart
      || Date.parse(anchorAvailableAt) >= day(phase.nextPhaseStart)
      || Date.parse(endpointAvailableAt) >= day(phase.nextPhaseStart))) reasons.push('purged_at_phase_boundary');
  if (!phase.phase) reasons.push('outside_declared_phases');
  if (!featureEligible) reasons.push('feature_ineligible');
  if (!issued) reasons.push('issue_after_retrieval_cutoff');
  return { horizon, eligible: reasons.length === 0, reasons, anchorQuoteDate: anchor?.quoteDate ?? null,
    endpointQuoteDate: endpoint?.quoteDate ?? null, spanDays, anchorAvailableAt, endpointAvailableAt, matureAt,
    target: reasons.length === 0 ? Number(endpoint.value > anchor.value) : null,
    targetMeaning: 'up_vs_non_up_including_ties', priceVersion: 'initial_release_only' };
}

export function buildBrentReleaseStudyCases({ records: input, retrievalCutoff, protocol = PROTOCOL }) {
  if (digest(protocol) !== CANONICAL_PROTOCOL_HASH) fail('Only the frozen Brent protocol is accepted');
  const retrieved = cutoff(retrievalCutoff);
  const { records, duplicateCount } = normalizeInitialReleaseRecords(input, retrievalCutoff);
  const batches = new Map();
  for (const row of records) {
    if (!batches.has(row.initialAvailableDate)) batches.set(row.initialAvailableDate, []);
    batches.get(row.initialAvailableDate).push(row);
  }
  const known = [], issues = [], skippedBatches = []; let latestQuoteDate = null;
  for (const batchDate of [...batches.keys()].sort()) {
    known.push(...batches.get(batchDate)); known.sort((a, b) => a.quoteDate.localeCompare(b.quoteDate));
    const latest = known.at(-1).quoteDate;
    if (latest === latestQuoteDate) { skippedBatches.push({ batchDate, reason: 'latest_quote_not_advanced' }); continue; }
    latestQuoteDate = latest;
    const issueAt = plusTwo(batchDate), issueDate = issueAt.slice(0, 10), phase = phaseFor(issueDate);
    const issued = Date.parse(issueAt) <= retrieved;
    const features = featuresFor(known, issueAt);
    const anchorIndex = records.findIndex(r => r.quoteDate > issueDate);
    issues.push({ batchDate, issueAt, phase: phase.phase, latestKnownQuoteDate: latest,
      featureCutoff: batchDate, issuedByRetrievalCutoff: issued, features,
      labels: Object.fromEntries(horizons.map(h => [String(h), labelFor(records, anchorIndex, h, issueDate, phase, retrieved, features.eligible, issued)])) });
  }
  return { schemaVersion: 'brent-release-study-cases-v1', mode: 'research_only', protocolId: PROTOCOL.protocolId,
    protocolSha256: BRENT_PROTOCOL_SHA256, retrievalCutoff, inputAuthenticityVerified: false,
    historicalAsOfVerified: false, quoteCalendarCompletenessVerified: false,
    eligibleForPublicProbability: false, eligibleForMainScore: false, noCurrentPredictionFromThisStudy: true,
    observations: records.length, exactDuplicatesRemoved: duplicateCount, availabilityBatches: batches.size,
    featureNames: [...PROTOCOL.model.features], issues, skippedBatches,
    modelFitted: false, minimumSampleAndClassGatesEvaluated: false };
}
