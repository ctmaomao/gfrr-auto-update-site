import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const defaultRoot = resolve(import.meta.dirname, '..', '..', '_site');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

// Optional read-only verification hook. Both variables are unset by default, so the
// `npm run test:e2e` path keeps serving exactly `_site` with no CSP header at all.
//   GF_ARTIFACT_ROOT  — directory to serve (defaults to `_site`)
//   GF_CSP_POLICY     — policy string sent as a CSP response header
//   GF_CSP_MODE       — `report-only` (default when a policy is present) or `enforce`
export function resolveServeOptions(env = process.env) {
  const headers = {};
  const policy = env.GF_CSP_POLICY;
  if (policy) {
    headers[env.GF_CSP_MODE === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'] = policy;
  }
  return { root: env.GF_ARTIFACT_ROOT ? resolve(env.GF_ARTIFACT_ROOT) : defaultRoot, headers };
}

export function createStaticHandler({ root, headers = {} } = {}) {
  const configuredRoot = resolve(root ?? defaultRoot);
  return (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = resolve(configuredRoot, relativePath);
      if (file !== configuredRoot && !file.startsWith(`${configuredRoot}${sep}`)) throw new Error('path outside repository');
      if (!statSync(file).isFile()) throw new Error('not a file');
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes.get(extname(file)) || 'application/octet-stream',
        ...headers,
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  };
}

export function createStaticServer(options = {}) {
  const handler = createStaticHandler(options);
  return createServer((request, response) => handler(request, response));
}

export function startStaticServer(port, options = {}) {
  const server = createStaticServer(options);
  return new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, '127.0.0.1', () => {
      console.log(`Smoke server listening on http://127.0.0.1:${port}`);
      resolvePromise(server);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { root, headers } = resolveServeOptions();
  await startStaticServer(Number(process.env.PORT || 4173), { root, headers });
}
