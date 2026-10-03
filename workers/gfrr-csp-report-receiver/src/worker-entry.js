// Worker entry for the CSP report receiver — the module bound in wrangler.toml (`main`).
//
// LOCAL PHASE: written and reviewed, NOT deployed. Creating the Worker and the Durable Object
// namespace is stage B and needs its own authorization.
//
// This is the ONLY module that imports `cloudflare:workers`, because that specifier cannot be
// resolved outside the Workers runtime. Keeping it here leaves index.js and receiver-object.js
// importable from Node, so the whole receiver stays covered by the local D1-C tests.
//
// The Durable Object RPC requirement lives here too: public methods are only exposed over RPC when
// the class extends the built-in `DurableObject`, so a plain class would fail at `stub.ingest()`.
import { DurableObject } from 'cloudflare:workers';
import { handleHealth, handleReport } from './index.js';
import { createCspReceiverObject } from './receiver-object.js';

export const CspReceiverObject = createCspReceiverObject(DurableObject);

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/csp-report') return handleReport(request, env);
    if (pathname === '/health') return handleHealth(env);
    return new Response(JSON.stringify({ ok: false, error: 'not-found' }), { status: 404, headers: JSON_HEADERS });
  },
};
