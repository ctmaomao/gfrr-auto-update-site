import { EPOCH_ARR_LIMITS } from './epoch-arr-candidate.mjs';
import { buildEpochArrSnapshot } from './epoch-arr-snapshot.mjs';

export const EPOCH_ARR_CSV_URL = 'https://epoch.ai/data/ai_companies_revenue_reports.csv';
const TIMEOUT_MS = 15000;
class ReaderFailure extends Error {
  constructor(code, httpStatus = null) { super(code); this.code = code; this.httpStatus = httpStatus; }
}

// A single pinned request, no retries, no cookies or caller-supplied URLs/headers.
// Injection is for deterministic tests; production callers use global fetch.
export async function readEpochArrCandidate({ allowNetwork = false, asOfDate, timeoutMs = TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  if (allowNetwork !== true) throw new ReaderFailure('network_not_authorized');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) throw new ReaderFailure('reader_options_invalid');
  // Validate the calendar before any request; do not spend a fetch on bad input.
  if (typeof asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(asOfDate)
    || !Number.isFinite(Date.parse(`${asOfDate}T00:00:00Z`))
    || new Date(`${asOfDate}T00:00:00Z`).toISOString().slice(0, 10) !== asOfDate) throw new ReaderFailure('as_of_date_invalid');
  const controller = new AbortController();
  let reader, timer, stage = 'request';
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new ReaderFailure('request_timeout')); }, timeoutMs);
  });
  const work = async () => {
    const response = await fetchImpl(EPOCH_ARR_CSV_URL, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { Accept: 'text/csv', 'User-Agent': 'GFRRBot/1.0 epoch-arr-candidate-review' }, signal: controller.signal });
    if (controller.signal.aborted) throw new ReaderFailure('request_timeout');
    if (response.redirected || response.url !== EPOCH_ARR_CSV_URL) throw new ReaderFailure('response_target_invalid');
    if (response.status !== 200) throw new ReaderFailure('http_status', Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null);
    const type = response.headers.get('content-type') || '';
    if (!/^text\/csv(?:\s*;\s*charset=(?:utf-8|"utf-8"))?\s*$/iu.test(type)) throw new ReaderFailure('content_type_invalid');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/u.test(length) || Number(length) > EPOCH_ARR_LIMITS.bytes)) throw new ReaderFailure('response_byte_limit');
    if (!response.body) throw new ReaderFailure('response_body_missing');
    stage = 'body'; reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (controller.signal.aborted) throw new ReaderFailure('request_timeout');
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new ReaderFailure('response_chunk_invalid');
      bytes += chunk.value.byteLength;
      if (bytes > EPOCH_ARR_LIMITS.bytes) throw new ReaderFailure('response_byte_limit');
      chunks.push(Buffer.from(chunk.value));
    }
    stage = 'sanitize';
    const result = buildEpochArrSnapshot(Buffer.concat(chunks), { asOfDate });
    return { status: 'candidate_snapshot_ready', fetchedAt: new Date().toISOString(), networkCalls: 1, ...result };
  };
  try { return await Promise.race([work(), deadline]); }
  catch (error) {
    if (error instanceof ReaderFailure) throw error;
    throw new ReaderFailure(controller.signal.aborted ? 'request_timeout' : stage === 'sanitize' ? 'csv_validation_failed' : stage === 'body' ? 'response_stream_failed' : 'request_failed');
  } finally {
    clearTimeout(timer); controller.abort();
    // Cleanup must not extend the deadline if an upstream stream ignores abort.
    if (reader) void reader.cancel().catch(() => {});
  }
}

export function epochReaderDiagnostic(error) {
  return error instanceof ReaderFailure ? { code: error.code, httpStatus: error.httpStatus }
    : { code: 'reader_failed', httpStatus: null };
}
