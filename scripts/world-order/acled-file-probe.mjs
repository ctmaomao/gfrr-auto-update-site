import { createHash } from 'node:crypto';
import { inspectZip } from './xlsx-input-guard.mjs';

// Owner-supplied static file only. No discovery, authentication or production path.
export const FILE_PROBE = Object.freeze({
  url: 'https://acleddata.com/system/files/2026-09/Europe-Central-Asia_aggregated_data_up_to_week_of-2026-09-05.xlsx',
  maxBytes: 8 * 1024 * 1024, timeoutMs: 15000, requests: 1,
});
const zipLimits = Object.freeze({ maxEntries: 256, maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxUncompressedBytes: 128 * 1024 * 1024, maxCompressionRatio: 500 });

export function inspectProbeWorkbook(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > FILE_PROBE.maxBytes) throw new Error('file_size');
  const zip = inspectZip(bytes, zipLimits, 'probe');
  // Walk the already bounds-validated central directory, never search arbitrary
  // compressed bytes for filenames. This is a container check, not row validation.
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  let offset = bytes.readUInt32LE(end + 16);
  const names = new Set();
  for (let i = 0; i < zip.entryCount; i++) {
    const length = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString('utf8');
    if (names.has(name) || /(?:vbaProject\.bin|externalLinks\/)/iu.test(name)) throw new Error('unsafe_package');
    names.add(name);
    offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  if (!['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels'].every(n => names.has(n))
    || ![...names].some(n => /^xl\/worksheets\/sheet\d+\.xml$/u.test(n))) throw new Error('not_workbook');
  return { ...zip, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function probeAcledFile({ fetchImpl = fetch, timeoutMs = FILE_PROBE.timeoutMs } = {}) {
  const controller = new AbortController(); let timer, activeReader = null, httpStatus = null, receivedBytes = 0;
  const base = { schemaVersion: 'acled-file-probe-v1', requestCount: 1, authenticated: false,
    productionWritten: false, rawFileSaved: false, rowValidation: 'not_performed' };
  const stopped = reason => ({ ...base, status: 'stopped', reason, httpStatus, receivedBytes });
  const operation = async () => {
    const response = await fetchImpl(FILE_PROBE.url, { redirect: 'manual', signal: controller.signal,
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'User-Agent': 'GFRR-single-file-diagnostic/1.0' } });
    if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return stopped('timeout'); }
    httpStatus = response.status;
    if (httpStatus !== 200) { void response.body?.cancel().catch(() => {}); return stopped(httpStatus >= 300 && httpStatus < 400 ? 'redirect_not_followed' : 'http_not_ok'); }
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'application/zip'].includes(type)) {
      void response.body?.cancel().catch(() => {}); return stopped('unexpected_content_type');
    }
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > FILE_PROBE.maxBytes)) {
      void response.body?.cancel().catch(() => {}); return stopped('byte_limit');
    }
    if (!response.body) return stopped('empty_body');
    const reader = response.body.getReader(), chunks = [];
    activeReader = reader;
    try {
      while (true) {
        if (controller.signal.aborted) return stopped('timeout');
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return stopped('timeout');
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > FILE_PROBE.maxBytes) { controller.abort(); void reader.cancel().catch(() => {}); return stopped('byte_limit'); }
        chunks.push(Buffer.from(value));
      }
    } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); activeReader = null; }
    if (declared !== null && Number(declared) !== receivedBytes) return stopped('length_mismatch');
    try {
      const envelope = inspectProbeWorkbook(Buffer.concat(chunks));
      return { ...base, status: 'workbook_container_verified', httpStatus, receivedBytes, ...envelope };
    } catch { return stopped('invalid_workbook_container'); }
  };
  try {
    return await Promise.race([operation(), new Promise(resolve => { timer = setTimeout(() => {
      controller.abort(); void activeReader?.cancel().catch(() => {}); resolve(stopped('timeout'));
    }, timeoutMs); })]);
  } catch { return stopped('network_or_body_error'); }
  finally { clearTimeout(timer); controller.abort(); void activeReader?.cancel().catch(() => {}); }
}
