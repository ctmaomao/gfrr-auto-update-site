import { createHash } from 'node:crypto';
import { validateAcledDownloadManifest } from './acled-download-manifest.mjs';
import { inspectZip } from './xlsx-input-guard.mjs';

const MiB = 1024 * 1024;
// Mirrors sanitizer ceilings; does not increase the old single-file probe budget.
export const BATCH_LIMITS = Object.freeze({
  weekly: Object.freeze({ fileBytes: 16 * MiB, batchBytes: 64 * MiB, batchExpanded: 640 * MiB,
    maxEntries: 64, maxEntryUncompressedBytes: 160 * MiB, maxUncompressedBytes: 192 * MiB, maxCompressionRatio: 32 }),
  monthly: Object.freeze({ fileBytes: MiB, batchBytes: 2 * MiB, batchExpanded: 16 * MiB,
    maxEntries: 64, maxEntryUncompressedBytes: 8 * MiB, maxUncompressedBytes: 12 * MiB, maxCompressionRatio: 32 }),
});

async function readOne(url, fetchImpl, maxBytes, timeoutMs) {
  const controller = new AbortController();
  let timer, reader, receivedBytes = 0, httpStatus = null;
  const stop = reason => ({ ok: false, reason, receivedBytes, httpStatus });
  const cancel = body => { void body?.cancel().catch(() => {}); };
  const operation = async () => {
    const response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal,
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    if (controller.signal.aborted) { cancel(response.body); return stop('timeout'); }
    httpStatus = response.status;
    if (httpStatus !== 200) { cancel(response.body); return stop('http_not_ok'); }
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!['application/octet-stream', 'application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(type)) {
      cancel(response.body); return stop('unexpected_content_type');
    }
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) {
      cancel(response.body); return stop('byte_limit');
    }
    if (!response.body) return stop('empty_body');
    reader = response.body.getReader();
    const chunks = [];
    try {
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return stop('timeout');
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > maxBytes) return stop('byte_limit');
        chunks.push(Buffer.from(value));
      }
      if (controller.signal.aborted) return stop('timeout');
      if (declared !== null && Number(declared) !== receivedBytes) return stop('length_mismatch');
      return { ok: true, bytes: Buffer.concat(chunks), receivedBytes, httpStatus };
    } finally { cancel(reader); reader.releaseLock(); reader = null; }
  };
  try {
    return await Promise.race([operation(), new Promise(resolve => {
      timer = setTimeout(() => { controller.abort(); cancel(reader); resolve(stop('timeout')); }, timeoutMs);
    })]);
  } catch { return stop('network_or_body_error'); }
  finally { clearTimeout(timer); controller.abort(); cancel(reader); }
}

/** Transport core only. No default network transport, credentials, CLI or writer.
 * A future reviewed session owner must inject transport and handle login/logout.
 * Buffers are intentionally separate from the JSON-safe report; never log them.
 */
export async function readAcledBatch({ urls, fetchImpl, timeoutMs = 15000 } = {}) {
  const report = { status: 'stopped', requestCount: 0, files: [], contentValidated: false,
    productionEligible: false, productionWritten: false, rawFileSaved: false };
  const stopped = reason => ({ report: { ...report, reason }, workbooks: null });
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) return stopped('invalid_context');
  let entries;
  try { entries = validateAcledDownloadManifest(urls).entries; } catch { return stopped('invalid_manifest'); }
  const totals = { weekly: { bytes: 0, expanded: 0 }, monthly: { bytes: 0, expanded: 0 } };
  const workbooks = [];
  for (const entry of entries) {
    const limits = BATCH_LIMITS[entry.kind], total = totals[entry.kind];
    const remaining = Math.min(limits.fileBytes, limits.batchBytes - total.bytes);
    if (remaining <= 0) return stopped('batch_byte_limit');
    report.requestCount++;
    const result = await readOne(entry.url, fetchImpl, remaining, timeoutMs);
    const receipt = { kind: entry.kind, identity: entry.identity, bytes: result.receivedBytes, httpStatus: result.httpStatus };
    report.files.push(receipt);
    if (!result.ok) return stopped(result.reason);
    let envelope;
    try { envelope = inspectZip(result.bytes, limits, 'batch'); } catch { return stopped('invalid_zip'); }
    total.bytes += result.receivedBytes;
    total.expanded += envelope.totalUncompressedBytes;
    if (total.expanded > limits.batchExpanded) return stopped('batch_expanded_limit');
    receipt.sha256 = createHash('sha256').update(result.bytes).digest('hex');
    workbooks.push({ ...entry, bytes: result.bytes });
  }
  report.status = 'zip_batch_read';
  return { report, workbooks };
}
