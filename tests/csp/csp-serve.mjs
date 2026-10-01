// Static server for the isolated CSP verification.
//
// Serves the real `_site` artifact plus a few control pages under `/__fixtures/`, and
// injects the candidate policy as either `Content-Security-Policy-Report-Only` or
// `Content-Security-Policy`. Never used by `npm run test:e2e`.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createStaticHandler, resolveServeOptions } from '../e2e/serve.mjs';

const fixturesRoot = resolve(import.meta.dirname, 'fixtures');
const { root, headers } = resolveServeOptions();
const port = Number(process.env.GF_CSP_PORT || 4319);

const artifactHandler = createStaticHandler({ root, headers });
const fixtureHandler = createStaticHandler({ root: fixturesRoot, headers });

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (pathname === '/__fixtures' || pathname.startsWith('/__fixtures/')) {
    request.url = pathname.replace(/^\/__fixtures/, '') || '/';
    fixtureHandler(request, response);
    return;
  }
  artifactHandler(request, response);
});

await new Promise((resolvePromise, rejectPromise) => {
  server.once('error', rejectPromise);
  server.listen(port, '127.0.0.1', () => {
    const mode = process.env.GF_CSP_POLICY
      ? (process.env.GF_CSP_MODE === 'enforce' ? 'enforce' : 'report-only')
      : 'no CSP header';
    console.log(`CSP verification server on http://127.0.0.1:${port} (artifact: ${root}; mode: ${mode})`);
    resolvePromise();
  });
});
