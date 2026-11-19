// Offline, aggregate-only analysis of already verified artifact downloads.
// Run/attempt/checkout pins check labels, not authenticity or scheduling.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isThermalProcessingVersion, matchesThermalObservationProduct } from './thermal-receipt-capture.mjs';
import { isCurrentThermalReceipt } from './thermal-receipt-run.mjs';

const MAX_BYTES = 262144; // The existing receipt writer's cap.
const MAX_RUNS = 32;
const MAX_OBSERVATIONS = 1000;
const OUTCOMES = ['success_detections', 'success_zero', 'parse_invalid', 'request_error', 'retired'];
const UNKNOWN = { coverage: 'unknown', spatialCoverage: 'unknown', overpassOpportunity: 'unknown', cloudQuality: 'unknown' };
const SCOPE = 'captured_requests_not_source_coverage';
const PROVENANCE = 'unverified_runtime_assertion';
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const count = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

function demand(ok, reason = 'Malformed or incomplete research receipt') {
  if (!ok) throw new Error(reason);
}
function utc(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function acquisition(value) {
  return typeof value === 'string' && /:00Z$/.test(value) && utc(value.replace('Z', '.000Z'));
}

function checkRequest(row, ordinal, sources) {
  const parsed = row?.outcome === 'success_detections' || row?.outcome === 'success_zero';
  const hasBody = parsed || row?.outcome === 'parse_invalid';
  const retired = row?.outcome === 'retired';
  demand(row?.requestOrdinal === ordinal && sources.includes(row.source)
    && sha256(row.areaIdHash) && sha256(row.geometryHash) && count(row.dayRange, 10) && row.dayRange > 0
    && OUTCOMES.includes(row.outcome) && count(row.attempts, 2)
    && row.retryCount === Math.max(0, row.attempts - 1)
    && (row.httpStatus === null || count(row.httpStatus, 599) && row.httpStatus >= 100)
    && row.invalidIdentityRowCount === 0 && Array.isArray(row.observationIds)
    && utc(row.logicalRequestStartedAt) && utc(row.classifiedAt) && utc(row.validatedAt)
    && row.logicalRequestStartedAt <= row.classifiedAt && row.classifiedAt <= row.validatedAt);
  demand((row.failureCategory === 'source_retired') === retired);
  const httpSuccess = row.httpStatus >= 200 && row.httpStatus < 300;
  if (hasBody) {
    demand(row.failureCategory === null && row.attempts > 0 && httpSuccess && utc(row.bodyReceivedAt)
      && row.logicalRequestStartedAt <= row.bodyReceivedAt && row.bodyReceivedAt <= row.classifiedAt);
  } else {
    demand(row.bodyReceivedAt === null && !httpSuccess
      && (retired ? row.attempts === 0 && row.httpStatus === null && row.lastFailureCategory === null
        : row.attempts > 0 && typeof row.failureCategory === 'string' && row.failureCategory === row.lastFailureCategory));
  }
  if (!parsed) {
    demand(row.researchCsvShapeValid === null && row.parsedRowCount === null && row.observationIds.length === 0);
  } else {
    demand(row.researchCsvShapeValid === true && count(row.parsedRowCount, MAX_OBSERVATIONS)
      && (row.parsedRowCount > 0) === (row.outcome === 'success_detections')
      && (row.observationIds.length > 0) === (row.parsedRowCount > 0)
      && row.observationIds.length <= row.parsedRowCount
      && row.observationIds.every(sha256) && new Set(row.observationIds).size === row.observationIds.length);
  }
}

function tallyRun(snapshot, bySource) {
  const { manifest, observations, receipts } = snapshot;
  demand(snapshot.mode === 'in_memory_prospective_sidecar' && snapshot.provenance === PROVENANCE
    && snapshot.completenessScope === SCOPE && snapshot.finalized === true && snapshot.complete === true
    && Object.entries(UNKNOWN).every(([key, value]) => snapshot[key] === value)
    && Array.isArray(snapshot.limitations) && snapshot.limitations.length === 0
    && Array.isArray(receipts) && receipts.length === manifest.expectedRequests
    && Array.isArray(observations) && observations.length <= MAX_OBSERVATIONS);

  const areas = new Map(), refs = new Map(), sourceRetirement = new Map(), revisionCapacity = new Map();
  for (const [index, row] of receipts.entries()) {
    checkRequest(row, index + 1, manifest.sourceSet);
    const retired = row.outcome === 'retired';
    if (!sourceRetirement.has(row.source)) sourceRetirement.set(row.source, retired);
    demand(sourceRetirement.get(row.source) === retired);

    const area = areas.get(row.areaIdHash) ?? { geometry: row.geometryHash, dayRange: row.dayRange, sources: new Set() };
    demand(area.geometry === row.geometryHash && area.dayRange === row.dayRange && !area.sources.has(row.source));
    area.sources.add(row.source);
    areas.set(row.areaIdHash, area);

    const tally = bySource[row.source];
    tally.logicalRequests++;
    tally.outcomes[row.outcome]++;
    tally.transportAttempts += row.attempts;
    tally.retries += row.retryCount;
    if (row.bodyReceivedAt !== null) tally.successfulHttpBodies++;
    tally.parsedRows += row.parsedRowCount ?? 0;
    tally.observationReferences += row.observationIds.length;
    if (row.parsedRowCount > 0) {
      const key = row.source + row.bodyReceivedAt;
      revisionCapacity.set(key, (revisionCapacity.get(key) ?? 0) + row.parsedRowCount);
    }
    for (const id of row.observationIds) {
      const ref = refs.get(id) ?? { source: row.source, bodyTimes: new Set(), earliest: row.bodyReceivedAt, maxRevisions: 0 };
      demand(ref.source === row.source);
      ref.bodyTimes.add(row.bodyReceivedAt);
      ref.maxRevisions += row.parsedRowCount - row.observationIds.length + 1;
      if (row.bodyReceivedAt < ref.earliest) ref.earliest = row.bodyReceivedAt;
      refs.set(id, ref);
    }
  }
  demand([...areas.values()].every(area => area.sources.size === manifest.sourceSet.length));

  for (const observation of observations) {
    const ref = refs.get(observation?.observationId);
    // Coordinates are deliberately absent, so an opaque observation ID is
    // checked for closed references, not recomputed or treated as authentication.
    demand(ref && observation.source === ref.source && observation.crossRunFirstSeen === null
      && matchesThermalObservationProduct(observation.source, observation.instrument, observation.satellite)
      && observation.firstReceivedInRun === ref.earliest && acquisition(observation.acquiredAt)
      && Date.parse(observation.acquiredAt) <= Date.parse(ref.earliest)
      && Array.isArray(observation.revisions) && observation.revisions.length > 0 && observation.revisions.length <= ref.maxRevisions);
    const revisions = new Set();
    let earliest = false;
    for (const revision of observation.revisions) {
      demand(revision && ref.bodyTimes.has(revision.firstReceivedInRun));
      earliest ||= revision.firstReceivedInRun === ref.earliest;
      const key = ref.source + revision.firstReceivedInRun;
      demand(revisionCapacity.get(key) > 0);
      revisionCapacity.set(key, revisionCapacity.get(key) - 1);
      const { frp, confidence, daynight, processingVersion } = revision;
      demand((frp === null || Number.isFinite(frp) && frp >= 0) && ['D', 'N'].includes(daynight)
        && isThermalProcessingVersion(processingVersion)
        && (observation.source === 'MODIS_NRT'
          ? typeof confidence === 'string' && /^(?:100|\d{1,2})$/.test(confidence) : ['l', 'n', 'h'].includes(confidence)));
      const contentHash = createHash('sha256').update(JSON.stringify({ frp, confidence, daynight, processingVersion })).digest('hex');
      demand(revision.contentHash === contentHash && !revisions.has(contentHash));
      revisions.add(contentHash);
    }
    demand(earliest);
    const tally = bySource[ref.source];
    tally.runScopedUniqueCaptures++;
    tally.runScopedUniqueRevisions += revisions.size;
    refs.delete(observation.observationId);
  }
  demand(refs.size === 0);

  // Compare actual slot matrices as well as the caller-asserted cohort digests.
  // These identifiers are never copied to the output.
  return JSON.stringify([manifest.configDigest, manifest.geometryDigest, [...manifest.sourceSet].sort(),
    [...areas.keys()].sort().map(id => [id, areas.get(id).geometry, areas.get(id).dayRange])]);
}

export function analyzeThermalReceipts(inputs) {
  demand(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= MAX_RUNS, 'Expected 1 to 32 receipt inputs');
  const seen = new Set(), bySource = {};
  const suppliedReceiptCaptureOverlapBySource = {};
  // At most MAX_RUNS * MAX_OBSERVATIONS entries, in memory for this call only.
  const suppliedCaptures = new Map();
  let cohort;
  for (const input of inputs) {
    const { text, runId, runAttempt, checkoutSha } = input ?? {};
    demand(typeof runId === 'string' && Number.isInteger(runAttempt)
      && isCurrentThermalReceipt(text, { runId, runAttempt, checkoutSha }), 'Receipt does not match the pinned run metadata');
    const key = `${runId}:${runAttempt}`;
    demand(!seen.has(key), 'Duplicate run attempt');
    seen.add(key);
    const snapshot = JSON.parse(text);
    for (const source of [...snapshot.manifest.sourceSet].sort()) {
      bySource[source] ??= { logicalRequests: 0, transportAttempts: 0, retries: 0, successfulHttpBodies: 0,
        outcomes: Object.fromEntries(OUTCOMES.map(outcome => [outcome, 0])), parsedRows: 0,
        observationReferences: 0, runScopedUniqueCaptures: 0, runScopedUniqueRevisions: 0 };
    }
    const current = tallyRun(snapshot, bySource);
    demand(cohort === undefined || current === cohort, 'Inputs do not share one receipt cohort');
    cohort = current;

    for (const source of Object.keys(bySource)) {
      suppliedReceiptCaptureOverlapBySource[source] ??= { unionUniqueCaptures: 0, capturesInMultipleReceipts: 0 };
    }
    // tallyRun has validated one closed, unique observation entry per ID per receipt.
    for (const { observationId, source, instrument, satellite, acquiredAt } of snapshot.observations) {
      const tally = suppliedReceiptCaptureOverlapBySource[source];
      const identity = JSON.stringify([source, instrument, satellite, acquiredAt]);
      const seenCapture = suppliedCaptures.get(observationId);
      if (!seenCapture) {
        suppliedCaptures.set(observationId, { identity, inMultipleReceipts: false });
        tally.unionUniqueCaptures++;
      } else {
        demand(seenCapture.identity === identity, 'Inconsistent capture identity across supplied receipts');
        if (!seenCapture.inMultipleReceipts) {
          seenCapture.inMultipleReceipts = true;
          tally.capturesInMultipleReceipts++;
        }
      }
    }
  }
  return {
    completenessScope: SCOPE, provenance: PROVENANCE, sample: 'supplied_complete_receipts_only',
    runAttempts: seen.size, ...UNKNOWN, crossRunFirstSeen: null,
    eligibleForEvaluation: false, eligibleForMainScore: false, bySource, suppliedReceiptCaptureOverlapBySource
  };
}

function readBoundedReceipt(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    demand(stat.isFile() && stat.size <= MAX_BYTES);
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const read = readSync(fd, buffer, used, buffer.length - used);
      if (!read) break;
      used += read;
    }
    demand(used <= MAX_BYTES);
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used));
  } finally { closeSync(fd); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  // Usage: node .../analyze-thermal-receipts.mjs RUN_ID:ATTEMPT:ACTUAL_CHECKOUT_SHA RECEIPT.json [...]
  try {
    const args = process.argv.slice(2);
    demand(args.length > 0 && args.length % 2 === 0 && args.length <= 2 * MAX_RUNS);
    const inputs = [];
    for (let index = 0; index < args.length; index += 2) {
      const pin = /^(\d{1,20}):([1-9]\d{0,3}):([a-f0-9]{40})$/.exec(args[index]);
      demand(pin);
      inputs.push({ text: readBoundedReceipt(args[index + 1]), runId: pin[1], runAttempt: Number(pin[2]), checkoutSha: pin[3] });
    }
    process.stdout.write(`${JSON.stringify(analyzeThermalReceipts(inputs), null, 2)}\n`);
  } catch {
    // Do not echo paths, pins, JSON fragments or exception text.
    process.stderr.write('Thermal receipt analysis refused: check pinned run metadata, file size and complete same-cohort receipts.\n');
    process.exitCode = 1;
  }
}
