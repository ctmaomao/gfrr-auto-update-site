// Candidate CSP for the GFRR reader-facing pages, plus the hash helpers the isolated
// verification needs. Read-only research: this module is imported only by the manual CSP
// verification entry point and is never part of `check:all`.
//
// Hashes are computed from the artifact bytes at run time (never hard-coded), because any
// edit to an inline block invalidates its hash. Browsers digest the element's text content,
// so CRLF is folded to LF first. The enforce-mode pass is what confirms that folding is
// correct: a wrong digest would surface as a violation on `bubble-watch.html`.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const GOOGLE_FONTS_STYLESHEET = 'https://fonts.googleapis.com';
export const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

export function normalizeInlineText(text) {
  return String(text).replace(/\r\n/gu, '\n');
}

export function sha256Source(text) {
  return `'sha256-${createHash('sha256').update(normalizeInlineText(text), 'utf8').digest('base64')}'`;
}

// Returns every body of the given tag, unmodified apart from newline folding.
export function extractInlineBodies(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'giu');
  return [...String(html).matchAll(pattern)].map((match) => match[1]);
}

export function readInlineBodies(root, file, tagName) {
  return extractInlineBodies(readFileSync(resolve(root, file), 'utf8'), tagName);
}

export function hashInlineBodies(root, file, tagName) {
  return readInlineBodies(root, file, tagName).map(sha256Source);
}

/**
 * Builds the candidate policy.
 *
 * `script-src-attr 'none'` is deliberate: neither reader page has a known inline event
 * handler requirement, so no compatibility exception is carried. Inline event handlers are
 * not hash-coverable in any case (Chrome: "hashes do not apply to event handlers, style
 * attributes and javascript: navigations unless the 'unsafe-hashes' keyword is present"), so
 * the alternative would be `'unsafe-inline'` or `'unsafe-hashes'`, neither of which is needed
 * today.
 *
 * `includeGoogleFonts` mirrors production, where both reader pages load the Google Fonts
 * stylesheet. Without outbound network that request fails, so the verification also runs the
 * variant with fonts excluded: that variant separates "the policy blocks something" from
 * "this environment cannot reach the font host".
 */
export function buildCandidatePolicy({ scriptHashes, styleHashes, includeGoogleFonts = true }) {
  const styleSources = ["'self'", ...styleHashes, ...(includeGoogleFonts ? [GOOGLE_FONTS_STYLESHEET] : [])];
  const directives = [
    "default-src 'none'",
    ['script-src', "'self'", ...scriptHashes].join(' '),
    "script-src-attr 'none'",
    ['style-src-elem', ...styleSources].join(' '),
    "style-src-attr 'unsafe-inline'",
    ...(includeGoogleFonts ? [['font-src', GOOGLE_FONTS_FILES].join(' ')] : []),
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ];
  return directives.join('; ');
}

/**
 * The single policy under test, derived from the current `_site` artifact plus the fixtures.
 *
 * Exactly one policy string exists on purpose: the Report-Only and enforce runs differ only in
 * the response header name. Carrying different policies per mode would mean the enforce run
 * never validates the string the Report-Only run observed.
 *
 * Only `allowed-inline.html` contributes hashes. Every other fixture is deliberately unhashed
 * and must therefore be reported (Report-Only) or blocked (enforce), which is what makes the
 * violation collectable in both modes rather than only in one.
 */
export function buildCandidate({ artifactRoot, fixtureRoot }) {
  const scriptHashes = [
    ...hashInlineBodies(artifactRoot, 'bubble-watch.html', 'script'),
    ...hashInlineBodies(fixtureRoot, 'allowed-inline.html', 'script'),
  ];
  const styleHashes = [
    ...hashInlineBodies(artifactRoot, 'bubble-watch.html', 'style'),
    ...hashInlineBodies(fixtureRoot, 'allowed-inline.html', 'style'),
  ];
  return {
    policy: buildCandidatePolicy({ scriptHashes, styleHashes, includeGoogleFonts: true }),
    policyWithoutFonts: buildCandidatePolicy({ scriptHashes, styleHashes, includeGoogleFonts: false }),
    scriptHashes,
    styleHashes,
  };
}
