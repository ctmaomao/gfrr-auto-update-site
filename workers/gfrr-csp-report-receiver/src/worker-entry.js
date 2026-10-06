// Worker entry for the CSP report receiver — the module bound in wrangler.toml (`main`).
//
// Deployment state is recorded in docs/PROJECT_BACKLOG.md. This new default-closed admission
// gate is local until separately reviewed and deployed; it does not enable production reports.
//
// This is the ONLY module that imports `cloudflare:workers`, because that specifier cannot be
// resolved outside the Workers runtime. Keeping it here leaves index.js and receiver-object.js
// importable from Node, so the whole receiver stays covered by the local D1-C tests.
//
// The Durable Object RPC requirement lives here too: public methods are only exposed over RPC when
// the class extends the built-in `DurableObject`, so a plain class would fail at `stub.ingest()`.
import { DurableObject } from 'cloudflare:workers';
import { handleReceiverRequest } from './index.js';
import { createCspReceiverObject } from './receiver-object.js';

export const CspReceiverObject = createCspReceiverObject(DurableObject);

export default {
  fetch: handleReceiverRequest,
};
