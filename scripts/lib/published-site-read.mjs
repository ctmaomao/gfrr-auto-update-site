export const PUBLISHED_SITE_BASES = Object.freeze({
  pages: 'https://ctmaomao.github.io/gfrr-auto-update-site/',
  custom: 'https://radar.gfrfinradar.uk/'
});

// Single request, no redirect/retry; deadline covers headers AND streamed body.
export async function readPublishedBytes(url, fetchImpl, timeoutMs, maxBytes) {
  const controller = new AbortController();
  let timer, reader;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
        if (controller.signal.aborted) {
          // A transport that ignored cancellation must not start a late read.
          if (response.body) void response.body.cancel().catch(() => {});
          return { httpStatus: null, error: 'request_timeout' };
        }
        if (!response.ok) return { httpStatus: response.status, error: 'http_error' };
        if (response.url && response.url !== String(url)) return { httpStatus: response.status, error: 'unexpected_url' };
        if (Number(response.headers.get('content-length')) > maxBytes) return { httpStatus: response.status, error: 'body_too_large' };
        if (!response.body) return { httpStatus: response.status, error: 'empty_body' };
        reader = response.body.getReader();
        const chunks = []; let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) return { httpStatus: response.status, error: 'body_too_large' };
          chunks.push(Buffer.from(value));
        }
        return { httpStatus: response.status, bytes: Buffer.concat(chunks) };
      })(),
      new Promise(resolve => { timer = setTimeout(() => resolve({ error: 'request_timeout', httpStatus: null }), timeoutMs); })
    ]);
  } catch { return { httpStatus: null, error: 'network_error' }; }
  finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
