import { pathToFileURL } from 'node:url';

const MAX_RESPONSE_BYTES = 1024 * 1024;

export function summarizeGdeltResponse(text, httpStatus, kind = 'events') {
  const code = /^\d{3}$/u.test(String(httpStatus)) ? Number(httpStatus) : null;
  const base = { httpStatus: code, kind, itemCount: 0 };
  if (!['events', 'summary'].includes(kind)) return { ...base, status: 'invalid_kind', ok: false };
  if (code !== 200) return { ...base, status: 'http_error', ok: false };
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_RESPONSE_BYTES) return { ...base, status: 'response_too_large', ok: false };
  let payload;
  try { payload = JSON.parse(text); }
  catch { return { ...base, status: 'invalid_json', ok: false }; }
  if (!Array.isArray(payload?.data) || (kind === 'events' && payload.success !== true)) return { ...base, status: 'invalid_response', ok: false };
  return { ...base, itemCount: payload.data.length, status: 'ok', ok: true };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--http-status' || args[2] !== '--kind') throw new Error('invalid_arguments');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_RESPONSE_BYTES) throw new Error('response_too_large');
    chunks.push(chunk);
  }
  const result = summarizeGdeltResponse(Buffer.concat(chunks).toString('utf8'), args[1], args[3]);
  console.log(JSON.stringify(result));
  // Keep the summary endpoint informational for non-200 responses, as before.
  if (!result.ok && !(args[3] === 'summary' && result.status === 'http_error')) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => { console.error('Diagnostic input rejected'); process.exitCode = 1; });
}
