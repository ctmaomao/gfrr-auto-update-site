// Controlled acceptance only. This bounds admission to the receiver, not platform request costs.
// Missing/invalid settings close BOTH report ingestion and the public health RPC route.
export const MAX_TRIAL_WINDOW_MS = 30 * 60 * 1000;

function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

export function trialIsOpen(env, now = Date.now()) {
  if (env?.CSP_TRIAL_ENABLED !== 'true' || !Number.isFinite(now)) return false;
  const start = utcInstant(env.CSP_TRIAL_START_AT);
  const end = utcInstant(env.CSP_TRIAL_END_AT);
  return start !== null && end !== null && end > start
    && end - start <= MAX_TRIAL_WINDOW_MS && now >= start && now < end;
}

export function trialClosedResponse() {
  // Never claim healthy or echo settings, raw URLs, request metadata, or body content.
  return new Response(JSON.stringify({ ok: false, status: 'unknown', error: 'trial-closed' }), {
    status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
