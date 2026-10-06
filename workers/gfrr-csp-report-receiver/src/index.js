// Entry module for the Worker (see wrangler.toml `main`).
//
// LOCAL PHASE: this file is written and reviewed but NOT deployed. Deployment is stage B and needs
// its own authorization, because it creates Cloudflare resources and can consume account quota.
//
// This module deliberately does NOT import `cloudflare:workers`: it holds the parts that must stay
// testable in Node. The Durable Object class, which has to extend the runtime's base class, lives in
// worker-entry.js — the file that is actually bound as the Worker entry.
//
// Responsibilities kept here, before any Durable Object is touched:
//   * method and content-type gating;
//   * the streaming byte gate (the platform allows 100 MB request bodies on a free plan, so the
//     application must impose its own limit and must not read an oversized body to completion);
//   * parsing and normalisation into a bounded plan;
//   * per-request diagnostics only. Reject and drop counts are reported for THIS call and are not
//     persisted, so no rejection is ever recorded by bypassing the ingest budget it just hit.
import { LIMITS } from './constants.js';
import { buildPlan, buildPolicyTable, readBodyWithinLimit } from './normalize.js';
import { trialIsOpen, trialClosedResponse } from './trial-window.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

/**
 * CORS policy for the report endpoint.
 *
 * The Reporting API fetches `report-to` endpoints in `cors` mode; cross-origin report POSTs require a
 * successful preflight. Legacy `report-uri` uses `no-cors` and needs none. Before this policy,
 * OPTIONS would hit the generic "not POST" branch and answer 405 with no CORS headers. That would
 * reject a cross-origin preflight; actual Reporting API browser delivery remains unverified.
 *
 * Deliberate choices:
 *   * an explicit ALLOWLIST (`CORS_ALLOWED_ORIGINS`, comma separated), matched exactly after
 *     normalisation — never `*`, and never an echo of whatever the request happened to send;
 *   * methods limited to POST and OPTIONS; headers limited to `content-type`;
 *   * **credentials are NOT enabled** (no `Access-Control-Allow-Credentials`), and the allowlist
 *     cannot be combined with wildcard semantics. The Reporting API fetches report endpoints with
 *     `credentials: same-origin`, so a CROSS-ORIGIN report carries no credentials; a SAME-ORIGIN
 *     report may. This receiver's allowlist only governs cross-origin reads, and leaving credentials
 *     disabled is what makes a non-wildcard allowlist strictly safe here;
 *   * `Access-Control-Max-Age` is short (600 s) so a policy change takes effect quickly;
 *   * `Access-Control-Allow-Origin` is the single matched origin, never a list.
 *
 * The default allowlist is EMPTY: no origin is allowed to read a cross-origin response until an
 * operator opts in per deployment. An empty allowlist rejects cross-origin Reporting API preflights,
 * so those reports cannot proceed to POST. Legacy `report-uri` has no preflight dependency; this
 * policy does not block its ingestion, but native browser delivery is not established by local tests.
 */
export const CORS_METHODS = 'POST, OPTIONS';
export const CORS_HEADERS = 'content-type';
export const CORS_MAX_AGE_SECONDS = 600;

/** Splits and normalises the configured allowlist. Exact match only; no wildcards, no patterns. */
export function parseAllowedOrigins(value) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * CORS headers for a response, or `{}` when the request carries no Origin or the Origin is not
 * allowed. Returning no headers is the rejection: the browser blocks the response, and the receiver
 * never reflects an unlisted origin.
 */
export function corsHeaders(request, allowedOrigins) {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-expose-headers': 'retry-after',
    vary: 'origin',
  };
}

/** JSON response carrying the shared no-store header plus the applicable CORS headers. */
function jsonResponse(body, status, request, allowedOrigins) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, allowedOrigins) },
  });
}

/**
 * Preflight handling. It performs NO Durable Object call, NO schema work, NO ledger write and NO
 * alarm scheduling: it only reports the policy back to the browser.
 *
 * An unlisted origin, an unsupported method, or a requested header outside `content-type` yields a
 * 204 WITHOUT the CORS headers, which the browser treats as a failed preflight.
 */
export function handlePreflight(request, { allowedOrigins = new Set() } = {}) {
  const origin = request.headers.get('origin');
  const requestedMethod = String(request.headers.get('access-control-request-method') ?? '').trim().toUpperCase();
  const requestedHeaders = String(request.headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  const originAllowed = Boolean(origin) && allowedOrigins.has(origin);
  const methodAllowed = requestedMethod === 'POST';
  const headersAllowed = requestedHeaders.every((entry) => entry === CORS_HEADERS);

  if (!originAllowed || !methodAllowed || !headersAllowed) {
    // No CORS headers: the browser fails the preflight. Nothing is written.
    return new Response(null, { status: 204, headers: { ...JSON_HEADERS } });
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...JSON_HEADERS,
      'access-control-allow-origin': origin,
      'access-control-allow-methods': CORS_METHODS,
      'access-control-allow-headers': CORS_HEADERS,
      'access-control-max-age': String(CORS_MAX_AGE_SECONDS),
      vary: 'origin',
    },
  });
}

/** Accepts both wire formats; anything else is a 415. */
function acceptsContentType(value) {
  const type = String(value ?? '').split(';')[0].trim().toLowerCase();
  return type === 'application/csp-report' || type === 'application/reports+json';
}

/**
 * @param policyTexts known policy versions; hashed once into the finite tag table. Empty in the
 *        local phase, which is why `policy_tag` is `unknown` there.
 * @param allowedOrigins CORS allowlist for the report endpoint.
 */
export async function handleReport(request, env, { now = Date.now, policyTexts = [], allowedOrigins = new Set(), admit = () => true } = {}) {
  if (request.method === 'OPTIONS') {
    // Preflight is answered from the policy alone; the Durable Object is never touched.
    return handlePreflight(request, { allowedOrigins });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method-not-allowed' }, 405, request, allowedOrigins);
  }
  if (!acceptsContentType(request.headers.get('content-type'))) {
    return jsonResponse({ ok: false, error: 'unsupported-media-type' }, 415, request, allowedOrigins);
  }

  // The declared length is only a pre-check; the streaming gate is what actually bounds the read.
  const declared = Number(request.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > LIMITS.MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: 'body-too-large' }, 413, request, allowedOrigins);
  }

  const body = await readBodyWithinLimit(request.body, LIMITS.MAX_BODY_BYTES);
  // A slow upload must not open a new RPC after the acceptance window has ended.
  if (!admit()) return trialClosedResponse();
  if (!body.ok) return jsonResponse({ ok: false, error: body.reason }, 413, request, allowedOrigins);

  let payload;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return jsonResponse({ ok: false, error: 'malformed-json' }, 400, request, allowedOrigins);
  }

  const { plan, diagnostics, malformed } = buildPlan(payload, {
    policyTable: buildPolicyTable(policyTexts),
  });
  if (malformed) return jsonResponse({ ok: false, error: 'unrecognised-payload' }, 400, request, allowedOrigins);

  // An empty plan is a noop: no ledger row and no observation write.
  if (plan.size === 0) {
    return jsonResponse({ ok: true, stored: 0, diagnostics }, 200, request, allowedOrigins);
  }

  if (!admit()) return trialClosedResponse();
  const stub = env.CSP_RECEIVER.get(env.CSP_RECEIVER.idFromName('singleton'));
  const result = await stub.ingest({
    // A Map cannot cross the RPC boundary; rebuild it inside the object.
    // Each entry carries `{reports, incomplete}` so a batch-merge clamp survives into storage.
    entries: [...plan.entries()],
    receivedAt: now(),
  });

  const status = result.action === 'reject' ? 429 : 200;
  return jsonResponse({ ok: result.action === 'commit', ...result, diagnostics }, status, request, allowedOrigins);
}

/**
 * Health is read-only and reports "cannot confirm" rather than assuming health.
 *
 * It carries NO CORS headers on purpose: it is an operational endpoint, and opening it to browser
 * origins would expose aggregate usage to any listed page for no benefit. A browser therefore cannot
 * read it cross-origin, which is the intended policy rather than an oversight.
 */
export async function handleHealth(env, { now = Date.now } = {}) {
  const stub = env.CSP_RECEIVER.get(env.CSP_RECEIVER.idFromName('singleton'));
  const health = await stub.health({ now: now() });
  return new Response(JSON.stringify(health), {
    status: health.status === 'unknown' ? 503 : 200,
    headers: JSON_HEADERS,
  });
}

/** Public runtime routing; leaf handlers above remain directly testable without platform access. */
export async function handleReceiverRequest(request, env, { now = Date.now } = {}) {
  const { pathname } = new URL(request.url);
  if (pathname !== '/csp-report' && pathname !== '/health') {
    return new Response(JSON.stringify({ ok: false, error: 'not-found' }), { status: 404, headers: JSON_HEADERS });
  }
  // Before reading any body or obtaining any Durable Object stub, including /health and OPTIONS.
  if (!trialIsOpen(env, now())) return trialClosedResponse();
  if (pathname === '/health') {
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ ok: false, error: 'method-not-allowed' }), { status: 405, headers: JSON_HEADERS });
    }
    return handleHealth(env, { now });
  }
  return handleReport(request, env, {
    now,
    allowedOrigins: parseAllowedOrigins(env?.CORS_ALLOWED_ORIGINS),
    admit: () => trialIsOpen(env, now()),
  });
}
