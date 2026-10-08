// Dedicated public-file transport: fixed host/path, serial, no keys or Cloud URLs.
const BASE = 'https://data.gdeltproject.org/gdeltv2/';
export async function downloadEventsResource(timestamp, { fetchImpl = globalThis.fetch, onBytes = () => {} } = {}) {
  if (timestamp !== null && !/^\d{14}$/u.test(timestamp)) throw new Error('events_timestamp_invalid');
  const response = await fetchImpl(`${BASE}${timestamp === null ? 'lastupdate.txt' : `${timestamp}.export.CSV.zip`}`, {
    signal: AbortSignal.timeout(15000), redirect: 'error', headers: { 'User-Agent': 'gfrr-events-source-review/1.0' }
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`events_http_${response.status}`); }
  const limit = timestamp === null ? 8192 : 2 * 1024 * 1024;
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) { await response.body?.cancel(); throw new Error('events_response_too_large'); }
  const parts = []; let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length; onBytes(chunk.length);
      if (size > limit) throw new Error('events_response_too_large');
      parts.push(chunk);
    }
  } catch (error) { throw new Error(error.message.startsWith('events_') ? error.message : 'events_body_failed'); }
  return Buffer.concat(parts);
}
export function parseLatestEventsTimestamp(text) {
  const match = text.match(/^\d+ [a-f0-9]{32} https?:\/\/data\.gdeltproject\.org\/gdeltv2\/(\d{14})\.export\.CSV\.zip$/mu);
  if (!match) throw new Error('events_latest_invalid');
  return match[1];
}
