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

/**
 * Maps the blocked resource onto the fixed enum, without keeping the raw value.
 *
 * `cross-origin` requires comparing ORIGINS, not URL shapes: a same-origin resource can perfectly
 * well appear as an absolute URL. So the blocked value is resolved against the page, and only a
 * different origin maps to `cross-origin`. Anything that cannot be resolved reliably — or a report
 * with no usable page URL — falls back to `other` rather than being guessed at.
 */
export function mapBlocked(value, documentUrl) {
  const raw = String(value ?? '').trim();
  const text = raw.toLowerCase();
  if (text === 'inline') return 'inline';
  if (text === 'eval') return 'eval';
  if (text === 'data' || text.startsWith('data:')) return 'data';

  const pageOrigin = parseOrigin(documentUrl);
  const blockedOrigin = parseBlockedOrigin(raw, documentUrl);

  // `self` is its own category; the rest needs two origins to compare.
  if (text === 'self') return 'self';
  if (pageOrigin === null || !blockedOrigin.ok) return 'other';
  return (blockedOrigin.origin ?? pageOrigin) === pageOrigin ? 'self' : 'cross-origin';
}

/**
 * Resolves the blocked value to an origin, or `origin: null` for something that is page-relative.
 *
 * Order matters:
 *  1. an absolute URL (it has a scheme) is used as-is;
 *  2. otherwise the value must be an EXPLICIT path (`/`, `./`, `../`) — resolving a bare word like
 *     `nonsense` against the page would succeed and report a bogus same-origin match;
 *  3. a protocol-relative value (`//host`) is resolved against the page, which is what gives it the
 *     page's scheme; it is cross-origin when the host differs.
 */
function parseBlockedOrigin(value, documentUrl) {
  if (value === '' || /[\s<>"'`]/u.test(value)) return { ok: false };
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    try {
      return { ok: true, origin: new URL(value).origin };
    } catch {
      return { ok: false };
    }
  }
  if (value.startsWith('//')) {
    if (documentUrl === undefined || documentUrl === null || String(documentUrl).trim() === '') {
      return { ok: false };
    }
    try {
      return { ok: true, origin: new URL(value, documentUrl).origin };
    } catch {
      return { ok: false };
    }
  }
  if (!value.startsWith('/') && !value.startsWith('./') && !value.startsWith('../')) return { ok: false };
  return { ok: true, origin: null };
}

/** Origin of a URL, resolved against `base` when the value is relative. `null` when unusable. */
function parseOrigin(value, base) {
  const raw = String(value ?? '').trim();
  if (raw === '') return null;
  try {
    return new URL(raw, base).origin;
  } catch {
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  }
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
 * Maps a report body onto the finite known policy-version table.
 *
 * The table is built from the configured policy texts: `buildPolicyTable` hashes each known version
 * once and assigns it a short tag (`p1`, `p2`, ...). A report's own policy text is hashed and looked
 * up, so the stored `policy_tag` is always one of the allowed tags or `unknown`. A raw digest is
 * never stored or accepted, and a browser-submitted `policyTag` is never trusted.
 */
export function buildPolicyTable(policyTexts = []) {
  const table = new Map();
  policyTexts.forEach((text, index) => {
    if (typeof text === 'string' && text.length > 0) {
      table.set(fnv1a32(text), `p${index + 1}`);
    }
  });
  return table;
}

/** Resolves a report's policy text to a tag from the finite table, or `unknown`. */
export function mapPolicyTag(policyTable, policyText) {
  if (typeof policyText !== 'string' || policyText.length === 0) return 'unknown';
  return policyTable.get(fnv1a32(policyText)) ?? 'unknown';
}

/** 32-bit FNV-1a, dependency-free: used only as a lookup key, never stored. */
export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Pulls the report bodies out of either payload shape.
 *
 * legacy    : `{ "csp-report": { ... } }` — no Reporting API wrapper, so no `type` field, and the
 *             inner value must be an object (a string or number there is malformed, not a report).
 * reporting : `[ { type, body, age, user_agent }, ... ]` — only `csp-violation` items count, the
 *             array is bounded by MAX_ARRAY_ITEMS, and a non-object `body` is rejected.
 */
export function extractItems(payload, { maxArrayItems = LIMITS.MAX_ARRAY_ITEMS } = {}) {
  if (Array.isArray(payload)) {
    const items = [];
    let droppedNotCsp = 0;
    let droppedBodyShape = 0;
    const considered = payload.slice(0, maxArrayItems);
    const droppedArrayOverflow = payload.length - considered.length;
    for (const entry of considered) {
      if (!isPlainObject(entry)) { droppedBodyShape += 1; continue; }
      if (entry.type !== 'csp-violation') { droppedNotCsp += 1; continue; }
      if (!isPlainObject(entry.body)) { droppedBodyShape += 1; continue; }
      items.push({ mechanism: 'reporting', body: entry.body });
    }
    return { items, droppedNotCsp, droppedArrayOverflow, droppedBodyShape };
  }
  if (isPlainObject(payload) && payload['csp-report'] !== undefined) {
    if (!isPlainObject(payload['csp-report'])) {
      return { items: [], droppedNotCsp: 0, droppedArrayOverflow: 0, droppedBodyShape: 1, malformed: true };
    }
    return { items: [{ mechanism: 'legacy', body: payload['csp-report'] }], droppedNotCsp: 0, droppedArrayOverflow: 0, droppedBodyShape: 0 };
  }
  return { items: [], droppedNotCsp: 0, droppedArrayOverflow: 0, droppedBodyShape: 0, malformed: true };
}

/**
 * Field aliases, tried in order. The RFC/legacy hyphenated name comes first, then the Reporting API
 * camelCase name, so a single resolution order covers both wire formats without mixing them.
 */
const FIELD_ALIASES = {
  directive: ['effective-directive', 'effectiveDirective', 'violated-directive', 'violatedDirective'],
  blocked: ['blocked-uri', 'blockedURL'],
  document: ['document-uri', 'documentURL'],
  disposition: ['disposition'],
  policy: ['original-policy', 'originalPolicy'],
};

/** Returns the first alias that is present and non-null. */
function pick(body, field) {
  for (const alias of FIELD_ALIASES[field]) {
    if (body[alias] !== undefined && body[alias] !== null) return body[alias];
  }
  return undefined;
}

/**
 * Normalises one report body into the internal shape.
 *
 * Field handling differs by kind:
 *  - a MISSING or non-string effective directive REJECTS the item: without it the report cannot be
 *    classified, and defaulting it to `other` would invent a category;
 *  - a critical classification field that is too long REJECTS the item (truncating it would
 *    classify against a mangled value);
 *  - an optional field that is not stored (`sample`, `referrer`) is ignored outright;
 *  - a URL-shaped field that is too long is rejected, never truncated-then-classified.
 */
export function normaliseItem(item, { policyTable = new Map() } = {}) {
  const { mechanism, body } = item;

  const directiveRaw = pick(body, 'directive');
  if (typeof directiveRaw !== 'string' || directiveRaw.trim() === '') {
    return { dropped: 'missing-directive' };
  }
  if (directiveRaw.length > LIMITS.MAX_FIELD_LENGTH) {
    return { dropped: 'critical-field-too-long' };
  }

  const dispositionRaw = pick(body, 'disposition');
  if (typeof dispositionRaw === 'string' && dispositionRaw.length > LIMITS.MAX_FIELD_LENGTH) {
    return { dropped: 'critical-field-too-long' };
  }

  const blockedRaw = pick(body, 'blocked');
  const documentRaw = pick(body, 'document');
  const policyRaw = pick(body, 'policy');

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
    mapBlocked(blockedRaw, documentRaw),
    mapDoc(documentRaw),
    mapPolicyTag(policyTable, policyRaw),
    mechanism,
  ].join('|');

  return { key, disposition };
}

/**
 * Parses a payload and merges it into a plan of `Map<key, {reports, incomplete}>`.
 *
 * Normalisation happens first; only then are distinct keys counted and bounded, so raw values that
 * all collapse to the same normalised key cannot consume the input budget.
 *
 * The per-key value carries an `incomplete` flag: a clamp during batch merging must survive into
 * storage, otherwise a saturated count looks exact when it is only a lower bound.
 */
export function buildPlan(payload, {
  policyTable = new Map(),
  maxArrayItems = LIMITS.MAX_ARRAY_ITEMS,
  maxReportsPerKey = LIMITS.MAX_REPORTS_PER_KEY_PER_BATCH,
} = {}) {
  const extracted = extractItems(payload, { maxArrayItems });
  const diagnostics = {
    droppedNotCsp: extracted.droppedNotCsp ?? 0,
    droppedArrayOverflow: extracted.droppedArrayOverflow ?? 0,
    droppedBodyShape: extracted.droppedBodyShape ?? 0,
    droppedMissingDirective: 0,
    droppedCriticalField: 0,
    droppedUrlField: 0,
    droppedPolicyField: 0,
    droppedKeys: 0,
    truncatedKeys: 0,
  };
  if (extracted.malformed) return { plan: new Map(), diagnostics, malformed: true };

  const merged = new Map();
  for (const item of extracted.items) {
    const result = normaliseItem(item, { policyTable });
    if (result.dropped) {
      if (result.dropped === 'missing-directive') diagnostics.droppedMissingDirective += 1;
      else if (result.dropped === 'critical-field-too-long') diagnostics.droppedCriticalField += 1;
      else if (result.dropped === 'url-field-too-long') diagnostics.droppedUrlField += 1;
      else if (result.dropped === 'policy-field-too-long') diagnostics.droppedPolicyField += 1;
      continue;
    }
    const previous = merged.get(result.key) ?? { reports: 0, incomplete: false };
    // Each item contributes exactly one report. The per-key bound applies to the merged total; a
    // clamp keeps the reports seen so far and marks the count as a lower bound.
    if (previous.reports + 1 > maxReportsPerKey) {
      diagnostics.truncatedKeys += 1;
      merged.set(result.key, { reports: previous.reports, incomplete: true });
      continue;
    }
    merged.set(result.key, { reports: previous.reports + 1, incomplete: previous.incomplete });
  }

  // Bound the distinct normalised keys; deterministic order keeps runs reproducible.
  const keys = [...merged.keys()].sort();
  const kept = keys.slice(0, LIMITS.MAX_INPUT_KEYS_PER_BATCH);
  diagnostics.droppedKeys = keys.length - kept.length;

  const plan = new Map();
  for (const key of kept) plan.set(key, merged.get(key));
  return { plan, diagnostics, malformed: false };
}
