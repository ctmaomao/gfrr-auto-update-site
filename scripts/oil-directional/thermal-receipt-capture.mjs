// Disabled-by-default in-memory sidecar. No I/O, durable firstSeen, or event claims.
import { createHash } from 'node:crypto';
import { firmsAcquisitionIso, firmsFrpOrNull } from './firms-observation-fields.mjs';

const LIMITS = Object.freeze({ bytes: 262144, requests: 150, observations: 1000 });
const PRODUCTS = Object.freeze({ VIIRS_SNPP_NRT: ['VIIRS', 'N'], VIIRS_NOAA20_NRT: ['VIIRS', 'N20'], VIIRS_NOAA21_NRT: ['VIIRS', 'N21'], MODIS_NRT: ['MODIS', 'T', 'A'] });
const FAILURE_CATEGORIES = new Set(['source_retired', 'timeout', 'network_error', 'rate_limited', 'server_error', 'authentication_error', 'request_rejected', 'unexpected_http_status', 'empty_response', 'non_csv_response', 'invalid_csv_schema', 'response_parse_error', 'unknown_error']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
function demand(ok) { if (!ok) throw new Error('Invalid research receipt'); }
function clock(value) {
  demand(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value));
  demand(Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  return value;
}
function coordinate(value, limit) {
  demand(typeof value === 'string' && /^-?\d{1,3}(?:\.\d{1,10})?$/.test(value));
  const number = Number(value); demand(Math.abs(number) <= limit); return number === 0 ? 0 : number;
}
export function matchesThermalObservationProduct(source, instrument, satellite) {
  return Object.hasOwn(PRODUCTS, source) && instrument === PRODUCTS[source][0] && PRODUCTS[source].slice(1).includes(satellite);
}
export function isThermalProcessingVersion(value) {
  return value === null || typeof value === 'string' && /^\d{1,2}(?:\.\d{1,2}){0,2}(?:NRT|RT|URT)?$/.test(value);
}
function observation(row, source, receivedAt) {
  demand(matchesThermalObservationProduct(source, row.instrument, row.satellite));
  const latitude = coordinate(row.latitude, 90), longitude = coordinate(row.longitude, 180);
  const acquiredAt = firmsAcquisitionIso(row); demand(Date.parse(acquiredAt) <= Date.parse(receivedAt));
  demand(typeof row.frp === 'string' && row.frp.length <= 24);
  const frp = firmsFrpOrNull(row.frp);
  const confidence = row.confidence;
  demand(typeof confidence === 'string' && confidence.length <= 3);
  demand(source === 'MODIS_NRT' ? /^(?:100|\d{1,2})$/.test(confidence) : ['l', 'n', 'h'].includes(confidence));
  demand(['D', 'N'].includes(row.daynight));
  const processingVersion = row.version == null || row.version === '' ? null : row.version;
  demand(isThermalProcessingVersion(processingVersion));
  const identity = { source, instrument: row.instrument, satellite: row.satellite, acquiredAt, latitude, longitude };
  return { observationId: hash(identity), ...identity, content: { frp, confidence, daynight: row.daynight, processingVersion } };
}

export function createThermalReceiptCapture(manifest = null) {
  let safeManifest = null;
  if (manifest !== null) {
    demand(manifest && /^\d{1,20}$/.test(manifest.runId) && typeof manifest.runId === 'string');
    demand(Number.isInteger(manifest.runAttempt) && manifest.runAttempt > 0 && manifest.runAttempt <= 1000);
    demand(typeof manifest.checkoutSha === 'string' && /^[a-f0-9]{40}$/.test(manifest.checkoutSha));
    demand(typeof manifest.configDigest === 'string' && /^[a-f0-9]{64}$/.test(manifest.configDigest));
    demand(typeof manifest.geometryDigest === 'string' && /^[a-f0-9]{64}$/.test(manifest.geometryDigest));
    demand(Array.isArray(manifest.sourceSet) && manifest.sourceSet.length > 0 && manifest.sourceSet.length <= 4
      && manifest.sourceSet.every(source => Object.hasOwn(PRODUCTS, source)) && new Set(manifest.sourceSet).size === manifest.sourceSet.length);
    demand(Number.isInteger(manifest.expectedRequests) && manifest.expectedRequests > 0 && manifest.expectedRequests <= LIMITS.requests);
    safeManifest = { runId: manifest.runId, runAttempt: manifest.runAttempt, checkoutSha: manifest.checkoutSha,
      configDigest: manifest.configDigest, geometryDigest: manifest.geometryDigest,
      sourceSet: [...manifest.sourceSet].sort(), expectedRequests: manifest.expectedRequests };
  }
  let state = {
    schemaVersion: 'thermal-receipt-capture-v1', mode: 'in_memory_prospective_sidecar',
    provenance: 'unverified_runtime_assertion', eligibleForEvaluation: false, eligibleForMainScore: false,
    crossRunFirstSeen: null, coverage: 'unknown', spatialCoverage: 'unknown', overpassOpportunity: 'unknown', cloudQuality: 'unknown',
    manifest: safeManifest, finalized: false, completenessScope: 'captured_requests_not_source_coverage',
    complete: true, limitations: [], limits: LIMITS, receipts: [], observations: []
  };
  const incomplete = reason => {
    state.complete = false;
    if (!state.limitations.includes(reason)) state.limitations.push(reason);
  };
  return {
    record(input) {
      // Reject atomically, without retaining any exception/input text.
      try {
        if (!state.complete && state.limitations.includes('capacity_exceeded')) return;
        demand(!state.finalized);
        demand(input && Object.hasOwn(PRODUCTS, input.source));
        demand(!safeManifest || safeManifest.sourceSet.includes(input.source));
        const logicalRequestStartedAt = clock(input.logicalRequestStartedAt);
        const classifiedAt = clock(input.classifiedAt);
        demand(logicalRequestStartedAt <= classifiedAt);
        demand(typeof input.areaId === 'string' && input.areaId.length > 0 && input.areaId.length <= 128);
        demand(typeof input.bbox === 'string' && input.bbox.length <= 128);
        const box = input.bbox.split(','); demand(box.length === 4);
        const bounds = box.map((v, i) => coordinate(v, i % 2 ? 90 : 180));
        demand(bounds[0] < bounds[2] && bounds[1] < bounds[3]);
        demand(Number.isInteger(input.dayRange) && input.dayRange >= 1 && input.dayRange <= 10);
        demand(['parsed', 'parse_invalid', 'request_error'].includes(input.outcome));
        const d = input.diagnostics;
        demand(d && Number.isInteger(d.attempts) && d.attempts >= 0 && d.attempts <= 2);
        demand(Number.isInteger(d.retryCount) && d.retryCount === Math.max(0, d.attempts - 1));
        demand(d.httpStatus === null || Number.isInteger(d.httpStatus) && d.httpStatus >= 100 && d.httpStatus <= 599);
        const retired = input.outcome === 'request_error' && d.category === 'source_retired';
        demand(!retired || d.attempts === 0);
        const bodyReceivedAt = input.outcome === 'request_error' ? null : clock(input.bodyReceivedAt);
        if (bodyReceivedAt) demand(logicalRequestStartedAt <= bodyReceivedAt && bodyReceivedAt <= classifiedAt);
        if (bodyReceivedAt) demand(d.outcome === 'success' && d.httpStatus >= 200 && d.httpStatus < 300 && d.attempts > 0);
        const previous = state.receipts.findLast(r => r.bodyReceivedAt)?.bodyReceivedAt;
        demand(!bodyReceivedAt || !previous || bodyReceivedAt >= previous);
        const shapeValid = input.outcome !== 'parsed' || input.researchCsvShapeValid === true;
        const records = input.outcome === 'parsed' && shapeValid ? input.records : [];
        demand(Array.isArray(records));
        if (records.length > LIMITS.observations || state.receipts.length >= LIMITS.requests) { incomplete('capacity_exceeded'); return; }
        const areaIdHash = hash(input.areaId);
        if (state.receipts.some(r => r.source === input.source && r.areaIdHash === areaIdHash)) { incomplete('duplicate_logical_request'); return; }
        const next = clone(state);
        const receipt = {
          requestOrdinal: next.receipts.length + 1, source: input.source, areaIdHash,
          geometryHash: hash(bounds), dayRange: input.dayRange,
          outcome: retired ? 'retired' : input.outcome === 'parsed' ? (!shapeValid ? 'research_invalid' : records.length ? 'success_detections' : 'success_zero') : input.outcome,
          logicalRequestStartedAt, bodyReceivedAt, classifiedAt, validatedAt: null, researchCsvShapeValid: input.outcome === 'parsed' ? shapeValid : null,
          failureCategory: FAILURE_CATEGORIES.has(d.category) ? d.category : null,
          lastFailureCategory: FAILURE_CATEGORIES.has(d.lastFailureCategory) ? d.lastFailureCategory : null,
          httpStatus: d.httpStatus, attempts: d.attempts, retryCount: d.retryCount,
          parsedRowCount: input.outcome === 'parsed' && shapeValid ? records.length : null,
          invalidIdentityRowCount: 0, observationIds: []
        };
        for (const row of records) {
          let normalized;
          try {
            normalized = observation(row, input.source, bodyReceivedAt);
            demand(normalized.longitude >= bounds[0] && normalized.longitude <= bounds[2] && normalized.latitude >= bounds[1] && normalized.latitude <= bounds[3]);
          }
          catch { receipt.invalidIdentityRowCount++; continue; }
          const { observationId, content, source, instrument, satellite, acquiredAt } = normalized;
          const identity = { source, instrument, satellite, acquiredAt };
          if (!receipt.observationIds.includes(observationId)) receipt.observationIds.push(observationId);
          let existing = next.observations.find(o => o.observationId === observationId);
          if (!existing) {
            existing = { observationId, ...identity, firstReceivedInRun: bodyReceivedAt, crossRunFirstSeen: null, revisions: [] };
            next.observations.push(existing);
          }
          const contentHash = hash(content);
          if (!existing.revisions.some(r => r.contentHash === contentHash)) existing.revisions.push({ contentHash, firstReceivedInRun: bodyReceivedAt, ...content });
        }
        receipt.validatedAt = new Date().toISOString();
        demand(receipt.validatedAt >= classifiedAt);
        if (!shapeValid) { next.complete = false; if (!next.limitations.includes('invalid_research_csv')) next.limitations.push('invalid_research_csv'); }
        if (receipt.invalidIdentityRowCount) { next.complete = false; if (!next.limitations.includes('invalid_research_rows')) next.limitations.push('invalid_research_rows'); }
        next.receipts.push(receipt);
        // Reserve space for bounded incomplete reasons; this is NOT a network/body limit.
        if (next.observations.length > LIMITS.observations || Buffer.byteLength(JSON.stringify(next)) > LIMITS.bytes - 1024) { incomplete('capacity_exceeded'); return; }
        state = next;
      } catch { incomplete('invalid_research_receipt'); }
    },
    finalize() {
      state.finalized = true;
      if (!safeManifest || state.receipts.length !== safeManifest.expectedRequests) incomplete('incomplete_run');
      return clone(state);
    },
    snapshot() { return clone(state); }
  };
}

// Validate the same in-memory text without changing production's legacy parser.
// This conservative gate rejects quoted/multiline CSV rather than guessing cells.
export function isResearchCsvShapeValid(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > LIMITS.bytes) return false;
  const lines = text.replace(/^\uFEFF/u, '').split(/\r?\n/u).filter(line => line.trim() !== '');
  if (!lines.length || lines.some(line => line.includes('"'))) return false;
  const headers = lines[0].split(',').map(value => value.trim());
  const required = ['latitude', 'longitude', 'instrument', 'satellite', 'acq_date', 'acq_time', 'confidence', 'frp', 'daynight'];
  return new Set(headers).size === headers.length && headers.every(header => /^[a-z][a-z0-9_]*$/.test(header))
    && required.every(header => headers.includes(header))
    && lines.slice(1).every(line => line.split(',').length === headers.length);
}
