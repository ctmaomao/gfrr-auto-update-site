import { createHash } from 'node:crypto';
import { reviewAcledMonthlyCandidate } from './acled-monthly-candidate.mjs';

// artifact_sanitizer_layer only. This one-off acceptance does not schedule or
// authorize another collection. An approval marker is evidence, not permission.
export const ACLED_HAPI_ATTEMPT = 'pv-20260916-three-requests';
export const ACLED_HAPI_BUDGET = Object.freeze({ requests: 3, rows: 102, bytes: 1024 * 1024,
  timeoutMs: 15000, intervalMs: 1100, retries: 0 });
const RESOURCE = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const ORIGIN = 'https://hapi.humdata.org';
const METADATA = '/api/v2/metadata/resource';
const SAMPLE = '/api/v2/coordination-context/conflict-events';
const sha = text => createHash('sha256').update(text).digest('hex');
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
class Stop extends Error {}
const stop = code => { throw new Stop(code); };

export function acledHapiPlan() {
  return { mode: 'dry_run', attempt: ACLED_HAPI_ATTEMPT, budget: ACLED_HAPI_BUDGET,
    scope: 'one_country_one_complete_month_political_violence_admin0',
    sequence: ['metadata_before', 'sample', 'metadata_after'], networkRequests: 0,
    productionWriteApproved: false, sourceCutoverApproved: false };
}

export function validateAcledHapiInput(input, now = new Date().toISOString()) {
  if (!exact(input, ['approval', 'application', 'email', 'baseline']) || input.approval !== ACLED_HAPI_ATTEMPT
    || typeof input.application !== 'string' || !/^[A-Za-z0-9 ._-]{1,100}$/u.test(input.application)
    || typeof input.email !== 'string' || input.email.length > 254
    || !/^[^\s:@]+@[^\s:@]+\.[^\s:@]+$/u.test(input.email)) return false;
  if (input.baseline !== null) {
    const report = reviewAcledMonthlyCandidate({ current: input.baseline, baseline: null }, { now });
    if (report.status !== 'review_only' || report.current.status !== 'declared_scope_complete'
      || JSON.stringify(input.baseline.pin.countries) !== '["NZL"]'
      || JSON.stringify(input.baseline.pin.months) !== '["2026-07"]') return false;
  }
  return true;
}

function makeCandidate(sampleJson, metadataJson, fetchedAt) {
  let resource;
  try { resource = JSON.parse(metadataJson).data[0]; } catch { stop('metadata_invalid'); }
  const match = /^political-violence-events-and-fatalities_as-of-(\d{4}-\d{2}-\d{2})\.xlsx$/u.exec(resource?.name);
  if (!match) stop('metadata_invalid');
  return { sampleJson, metadataJson, pin: { schemaVersion: 'acled-hapi-pv-pin-v1',
    sampleSha256: sha(sampleJson), metadataSha256: sha(metadataJson), resourceId: RESOURCE,
    resourceName: resource.name, resourceUpdatedAt: resource.update_date, hapiUpdatedAt: resource.hapi_updated_date,
    asOfDate: match[1], fetchedAt, countries: ['NZL'], months: ['2026-07'], requestLimit: 100 } };
}

function verify(candidate, now) {
  const result = reviewAcledMonthlyCandidate({ current: candidate, baseline: null }, { now });
  if (result.status !== 'review_only') stop('candidate_invalid');
  return result.current;
}

// Raw payloads are returned ONLY in privateCandidate for the private artifact
// writer. Never serialize this whole return value to stdout or public artifacts.
export async function collectAcledHapiCandidate(input, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const tick = dependencies.tick ?? (() => performance.now());
  const wait = dependencies.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const report = { schemaVersion: 'acled-hapi-collection-v1', status: 'stopped', requestCount: 0,
    totalBytes: 0, totalRows: 0, calls: [], productionWriteApproved: false, sourceCutoverApproved: false,
    metadataFence: 'not_completed', atomicSnapshotProven: false, baselineUpdated: false };
  let lastStart = -Infinity;
  try {
    if (!validateAcledHapiInput(input, now())) stop('input_invalid');
    const identifier = Buffer.from(`${input.application}:${input.email}`).toString('base64');
    async function request(stage, apiPath, parameters, maxRows) {
      if (report.requestCount >= ACLED_HAPI_BUDGET.requests) stop('request_budget');
      await wait(Math.max(0, ACLED_HAPI_BUDGET.intervalMs - (tick() - lastStart)));
      lastStart = tick();
      report.requestCount++;
      const call = { stage }; report.calls.push(call);
      const controller = new AbortController();
      let reader, timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Stop('timeout')); }, ACLED_HAPI_BUDGET.timeoutMs);
      });
      try {
        return await Promise.race([timeout, (async () => {
          const response = await fetchImpl(new URL(`${apiPath}?${new URLSearchParams(parameters)}`, ORIGIN), {
            method: 'GET', redirect: 'manual', signal: controller.signal,
            headers: { Accept: 'application/json', 'User-Agent': 'GFRR/isolated-source-acceptance',
              'X-HDX-HAPI-APP-IDENTIFIER': identifier } });
          if (controller.signal.aborted) stop('timeout');
          call.status = response.status;
          if (response.status !== 200) stop('http_failure');
          if (!/^application\/json(?:;|$)/iu.test(response.headers.get('content-type') ?? '')) stop('content_type');
          const length = response.headers.get('content-length');
          if (length !== null && (!/^\d+$/u.test(length) || Number(length) > ACLED_HAPI_BUDGET.bytes - report.totalBytes)) stop('byte_budget');
          if (!response.body) stop('body_missing');
          reader = response.body.getReader();
          const chunks = [];
          let size = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (controller.signal.aborted) stop('timeout');
            if (done) break;
            report.totalBytes += value.byteLength; size += value.byteLength;
            if (report.totalBytes > ACLED_HAPI_BUDGET.bytes) stop('byte_budget');
            chunks.push(value);
          }
          let text, body;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); body = JSON.parse(text); }
          catch { stop('json_invalid'); }
          if (!exact(body, ['data']) || !Array.isArray(body.data)) stop('response_schema');
          report.totalRows += body.data.length;
          if (body.data.length > maxRows || report.totalRows > ACLED_HAPI_BUDGET.rows) stop('row_budget');
          call.bytes = size; call.rows = body.data.length;
          return text;
        })()]);
      } finally {
        clearTimeout(timer); controller.abort();
        // Cancellation must not extend the deadline if a stream ignores abort.
        if (reader) void reader.cancel().catch(() => {});
      }
    }
    const metaParams = { resource_hdx_id: RESOURCE, limit: '100', offset: '0', output_format: 'json' };
    const before = await request('metadata_before', METADATA, metaParams, 1);
    const beforeReport = verify(makeCandidate('{"data":[]}', before, now()), now());
    const sample = await request('sample', SAMPLE, { location_code: 'NZL', admin_level: '0',
      event_type: 'political_violence', start_date: '2026-07-01', end_date: '2026-07-31',
      limit: '100', offset: '0', output_format: 'json' }, 100);
    const sampleReport = verify(makeCandidate(sample, before, now()), now());
    if (sampleReport.status !== 'declared_scope_complete') stop('sample_incomplete');
    const after = await request('metadata_after', METADATA, metaParams, 1);
    const current = makeCandidate(sample, after, now());
    const afterReport = verify(current, now());
    for (const field of ['sourceAsOf', 'sourceUpdatedAt', 'hapiUpdatedAt']) {
      if (beforeReport[field] !== afterReport[field]) stop('metadata_changed');
    }
    const review = reviewAcledMonthlyCandidate({ current, baseline: input.baseline }, { now: now() });
    if (review.status !== 'review_only') stop('comparison_invalid');
    if (!['baseline_required', 'revision_difference', 'unchanged_saved_payload', 'serialization_or_metadata_change'].includes(review.comparison.status)) stop('comparison_hold');
    report.status = 'candidate_ready'; report.metadataFence = 'stable_visible_metadata'; report.review = review;
    return { report, privateCandidate: current, privateMetadataBefore: before };
  } catch (error) {
    report.reason = error instanceof Stop ? error.message : 'request_or_local_failure';
    return { report, privateCandidate: null, privateMetadataBefore: null };
  }
}
