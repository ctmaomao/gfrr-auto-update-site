// Parsing, normalisation and input gating for the CSP report receiver.
//
// Order matters and is asserted by the tests: the byte gate runs BEFORE parsing; the array-length
// gate runs AFTER parsing; and normalisation runs BEFORE distinct-key counting, so a flood of raw
// values that all collapse to `other` cannot exhaust the key budget.
import { BLOCKED, DIRECTIVES, DOCS, LIMITS, MECHANISMS, POLICY_TAGS } from './constants.js';

/**
 * Streaming byte gate. Reads the body in chunks and stops as soon as the cumulative size exceeds
 * the limit, so an oversized or chunked body without `Content-Length` is never read to completion.
 * Returns either the collected text or an abort marker.
 */
export async function readBodyWithinLimit(body, maxBytes = LIMITS.MAX_BODY_BYTES) {
  if (!body) return { ok: true, text: '' };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        return { ok: false, reason: 'body-too-large', readBytes: total };
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    // Releases the stream without draining the remainder.
    await reader.cancel().catch(() => {});
  }
  return { ok: true, text: text + decoder.decode() };
}

/** Maps an effective directive onto the fixed enum. */
export function mapDirective(value) {
  const normalised = String(value ?? '').toLowerCase();
  return DIRECTIVES.includes(normalised) ? normalised : 'other';
}

/** Maps the blocked resource onto the fixed enum, without keeping the raw value. */
export function mapBlocked(value) {
  const text = String(value ?? '').toLowerCase().trim();
  if (text === 'inline') return 'inline';
  if (text === 'eval') return 'eval';
  if (text === 'data' || text.startsWith('data:')) return 'data';
  if (text === 'self' || text.startsWith('self')) return 'self';
  // `cross-origin` keeps its own category, as the design requires: a resource blocked on another
  // origin is diagnostically different from one that cannot be classified. The spec already
  // truncates such a blocked URI to scheme+host+port, so only the shape is inspected here.
  if (/^[a-z][a-z0-9+.-]*:\/\//u.test(text) || text.startsWith('//')) return 'cross-origin';
  return 'other';
}

/**
 * Maps a document URL onto a known page class. Only the path is inspected and only known pages are
 * named; everything else collapses to `other`. Query strings and fragments are never stored.
 */
export function mapDoc(value) {
  const raw = String(value ?? '');
  let path = raw;
  try {
    path = new URL(raw).pathname;
  } catch {
    const withoutQuery = raw.split('#')[0].split('?')[0];
    path = withoutQuery;
  }
  const file = path.split('/').filter(Boolean).pop() ?? '';
  if (file === '' || file === 'index.html') return 'index';
  if (file === 'bubble-watch.html') return 'bubble-watch';
  return 'other';
}

/**
 * Derives the internal policy tag. The report's own value is only ever hashed and looked up in the
 * finite known table; a value the table does not know becomes `unknown`. A browser-submitted
 * `policyTag` is never trusted, and a truncated value is never used for classification.
 */
export function mapPolicyTag(knownTags, policyText) {
  if (typeof policyText !== 'string' || policyText.length === 0) return 'unknown';
  const digest = digestHex(policyText).slice(0, 16);
  return knownTags.includes(digest) ? digest : 'unknown';
}

function digestHex(text) {
  // Kept dependency-free: FNV-1a over the policy text, used only as a table lookup key.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const KEY_FIELDS = ['effectiveDirective', 'disposition'];

/**
 * Pulls the report bodies out of either payload shape.
 * legacy    : `{ "csp-report": { ... } }` — no Reporting API wrapper, so no `type` field.
 * reporting : `[ { type, body, age, user_agent }, ... ]` — only `csp-violation` items count.
 */
export function extractItems(payload) {
  if (Array.isArray(payload)) {
    const items = [];
    let droppedNotCsp = 0;
    for (const entry of payload) {
      if (!entry || typeof entry !== 'object') { droppedNotCsp += 1; continue; }
      if (entry.type !== 'csp-violation') { droppedNotCsp += 1; continue; }
      items.push({ mechanism: 'reporting', body: entry.body ?? {} });
    }
    return { items, droppedNotCsp };
  }
  if (payload && typeof payload === 'object' && payload['csp-report'] && typeof payload['csp-report'] === 'object') {
    return { items: [{ mechanism: 'legacy', body: payload['csp-report'] }], droppedNotCsp: 0 };
  }
  return { items: [], droppedNotCsp: 0, malformed: true };
}

function pick(body, names) {
  for (const name of names) {
    if (body[name] !== undefined && body[name] !== null) return body[name];
  }
  return undefined;
}

/**
 * Normalises one report body into the internal shape.
 *
 * Field handling differs by kind:
 *  - a critical classification field that is too long REJECTS the item (truncating it would
 *    classify against a mangled value);
 *  - an optional field that is not stored (`sample`, `referrer`) is ignored outright;
 *  - a URL-shaped field that is too long is rejected, never truncated-then-classified.
 */
export function normaliseItem(item, { knownTags = [] } = {}) {
  const { mechanism, body } = item;
  for (const field of KEY_FIELDS) {
    const value = pick(body, field === 'effectiveDirective'
      ? ['effective-directive', 'effectiveDirective']
      : ['disposition']);
    if (value !== undefined && typeof value === 'string' && value.length > LIMITS.MAX_FIELD_LENGTH) {
      return { dropped: 'critical-field-too-long' };
    }
  }

  const directiveRaw = pick(body, ['effective-directive', 'effectiveDirective', 'violated-directive']);
  const blockedRaw = pick(body, ['blocked-uri', 'blockedURL']);
  const documentRaw = pick(body, ['document-uri', 'documentURL']);
  const dispositionRaw = pick(body, ['disposition']);
  const policyRaw = pick(body, ['original-policy', 'originalPolicy']);

  for (const raw of [blockedRaw, documentRaw]) {
    if (typeof raw === 'string' && raw.length > LIMITS.MAX_FIELD_LENGTH) {
      return { dropped: 'url-field-too-long' };
    }
  }
  if (typeof policyRaw === 'string' && policyRaw.length > LIMITS.MAX_FIELD_LENGTH) {
    return { dropped: 'policy-field-too-long' };
  }

  // `sample` / `script-sample` / `referrer` are deliberately never read or stored.

  const disposition = String(dispositionRaw ?? '').toLowerCase() === 'enforce' ? 'enforce' : 'report';
  const key = [
    mapDirective(directiveRaw),
    mapBlocked(blockedRaw),
    mapDoc(documentRaw),
    mapPolicyTag(knownTags, policyRaw),
    mechanism,
  ].join('|');

  if (!MECHANISMS.includes(mechanism)) return { dropped: 'bad-mechanism' };
  if (!DIRECTIVES.includes(key.split('|')[0])) return { dropped: 'bad-directive' };
  if (!BLOCKED.includes(key.split('|')[1])) return { dropped: 'bad-blocked' };
  if (!DOCS.includes(key.split('|')[2])) return { dropped: 'bad-doc' };
  if (!POLICY_TAGS.includes(key.split('|')[3])) return { dropped: 'bad-policy-tag' };

  return { key, disposition };
}

/**
 * Parses a payload and merges it into a plan of `Map<key, reports>`.
 *
 * Normalisation happens first; only then are distinct keys counted and bounded, so raw values that
 * all collapse to the same normalised key cannot consume the input budget.
 */
export function buildPlan(payload, { knownTags = [] } = {}) {
  const { items, droppedNotCsp, malformed } = extractItems(payload);
  const diagnostics = { droppedNotCsp, droppedCriticalField: 0, droppedUrlField: 0, droppedPolicyField: 0, droppedKeys: 0, truncatedKeys: 0 };
  if (malformed) return { plan: new Map(), diagnostics, malformed: true };

  const merged = new Map();
  for (const item of items) {
    const result = normaliseItem(item, { knownTags });
    if (result.dropped) {
      if (result.dropped === 'critical-field-too-long') diagnostics.droppedCriticalField += 1;
      else if (result.dropped === 'url-field-too-long') diagnostics.droppedUrlField += 1;
      else if (result.dropped === 'policy-field-too-long') diagnostics.droppedPolicyField += 1;
      continue;
    }
    const previous = merged.get(result.key) ?? 0;
    // Each item contributes exactly one report. The per-key bound applies to the merged total, so a
    // clamp here means the key's count is a lower bound and is reported as such.
    if (previous + 1 > LIMITS.MAX_REPORTS_PER_KEY_PER_BATCH) {
      diagnostics.truncatedKeys += 1;
      continue;
    }
    merged.set(result.key, previous + 1);
  }

  // Bound the distinct normalised keys; deterministic order keeps runs reproducible.
  const keys = [...merged.keys()].sort();
  const kept = keys.slice(0, LIMITS.MAX_INPUT_KEYS_PER_BATCH);
  diagnostics.droppedKeys = keys.length - kept.length;

  const plan = new Map();
  for (const key of kept) plan.set(key, merged.get(key));
  return { plan, diagnostics, malformed: false };
}
