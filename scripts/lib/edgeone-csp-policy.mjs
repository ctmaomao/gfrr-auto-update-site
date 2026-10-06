// Authoritative CSP policy derivation for the EdgeOne release channel.
//
// Single source of truth for the policy TEXT. The configuration file only declares whether the
// header is enabled, which request glob it applies to, and the directive template with hash
// placeholders; this module validates the configuration, derives the inline-block hashes from the
// pages that are actually about to be published, and serializes the policy.
//
// The local verification harness (`tests/csp/policy.mjs`) reuses this module and adds its fixture
// hashes explicitly, so the policy text is defined in exactly one place. Nothing here knows about
// fixtures, and the header name is a constant so a "report-only" configuration can never silently
// become an enforced one.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export const GOOGLE_FONTS_STYLESHEET = 'https://fonts.googleapis.com';
export const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

/** The only header this module can emit. Enforced CSP is deliberately not representable. */
export const REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';

export const SCRIPT_HASH_PLACEHOLDER = '{{scriptHashes}}';
export const STYLE_HASH_PLACEHOLDER = '{{styleHashes}}';

export const POLICY_DIRECTIVE_ORDER = [
  'default-src',
  'script-src',
  'script-src-attr',
  'style-src-elem',
  'style-src-attr',
  'font-src',
  'connect-src',
  'img-src',
  'base-uri',
  'form-action',
  'object-src',
];

// Optional reporting requires separate review (ADR-0061); it is not an activation default.
// Keep the required directive inventory above unchanged. Only this exact single endpoint is
// representable: byte equality deliberately rejects URL normalization, lists and header injection.
export const REPORT_URI_ENDPOINT = 'https://gfrr-csp-report-receiver.gfrrriskradar2026.workers.dev/csp-report';
const OPTIONAL_REPORT_DIRECTIVE = 'report-uri';

/** EdgeOne caps a header value at 1000 characters. */
export const MAX_POLICY_LENGTH = 1000;

export const CONFIG_SCHEMA_VERSION = 1;

export function normalizeInlineText(text) {
  return String(text).replace(/\r\n/gu, '\n');
}

export function sha256Source(text) {
  return `'sha256-${createHash('sha256').update(normalizeInlineText(text), 'utf8').digest('base64')}'`;
}

/** Returns every body of the given tag, unmodified apart from newline folding. */
export function extractInlineBodies(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'giu');
  return [...String(html).matchAll(pattern)].map((match) => match[1]);
}

/** Filenames whose inline blocks must supply hashes. */
export const INLINE_HASH_SOURCE_FILES = ['bubble-watch.html'];

/** Recursively lists regular files under `root`, as sorted root-relative POSIX paths. */
export function walkFiles(root) {
  const rootPath = resolve(root);
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(relative(rootPath, path).split(sep).join('/'));
    }
  };
  walk(rootPath);
  return files.sort();
}

/** Header names are compared case-insensitively: a lowercase enforced header must not slip past. */
export function isEnforcedCspHeaderName(name) {
  return String(name).toLowerCase() === 'content-security-policy';
}

export function isReportOnlyCspHeaderName(name) {
  return String(name).toLowerCase() === REPORT_ONLY_HEADER.toLowerCase();
}

/**
 * Derives the expected hash sources for one page from the path that will be published.
 *
 * `requireInlineBlocks` (default true) rejects a page that has no inline `<script>`/`<style>` at
 * all. Without it a page whose inline content disappeared would contribute an empty hash set and
 * the policy would silently lose both hashes.
 */
export function derivePageHashes(root, file, { requireInlineBlocks = true } = {}) {
  const html = readFileSync(resolve(root, file), 'utf8');
  const scriptHashes = extractInlineBodies(html, 'script').map(sha256Source);
  const styleHashes = extractInlineBodies(html, 'style').map(sha256Source);
  if (requireInlineBlocks) {
    if (!scriptHashes.length) throw new Error(`${file} has no inline <script> block to hash`);
    if (!styleHashes.length) throw new Error(`${file} has no inline <style> block to hash`);
  }
  return { file, scriptHashes, styleHashes };
}

/**
 * The hash-source inventory for the configured pages. Throws when a page or its inline blocks are
 * missing, and refuses to return an empty inventory: "no expected hashes" must never be satisfied
 * by "no hashes in the policy".
 */
export function deriveExpectedHashSources(root, files = INLINE_HASH_SOURCE_FILES) {
  const pages = files.map((file) => derivePageHashes(root, file));
  const script = pages.flatMap((page) => page.scriptHashes);
  const style = pages.flatMap((page) => page.styleHashes);
  if (!script.length || !style.length) {
    throw new Error('expected hash sources are empty; refusing to treat an empty hash set as valid');
  }
  return { pages, script, style };
}

/**
 * Harness-only variant: the same configuration and serializer, with additional hash sources that
 * are NOT derived from any published page.
 *
 * This exists solely so the local verification harness can construct its control cases (a body
 * whose hash IS present must produce no violation, and a fixture page whose content is legitimately
 * allowed must be allowed). Production never uses it, and the extra hashes are appended through the
 * shared serializer rather than by editing policy text, so the directive template stays
 * single-sourced.
 */
export function withAdditionalHashes(config, { scriptHashes = [], styleHashes = [], extraScriptHashes = [], extraStyleHashes = [] } = {}) {
  return serializePolicy(config, {
    scriptHashes: [...scriptHashes, ...extraScriptHashes],
    styleHashes: [...styleHashes, ...extraStyleHashes],
  });
}

/** Validates the versioned configuration file. Throws on anything unusable. */
export function validateCspConfig(config) {
  const fail = (message) => { throw new Error(`edgeone CSP config: ${message}`); };
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('must be a JSON object');
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    fail(`schemaVersion must be ${CONFIG_SCHEMA_VERSION}, received ${JSON.stringify(config.schemaVersion)}`);
  }
  if (typeof config.enabled !== 'boolean') fail('enabled must be a boolean');
  if (typeof config.source !== 'string' || !config.source.startsWith('/')) fail('source must start with "/"');
  if (typeof config.notes !== 'string' || !config.notes.trim()) fail('notes must be a non-empty string');
  if (!config.directives || typeof config.directives !== 'object' || Array.isArray(config.directives)) {
    fail('directives must be an object');
  }

  const names = Object.keys(config.directives);
  const unknown = names.filter((name) => !POLICY_DIRECTIVE_ORDER.includes(name) && name !== OPTIONAL_REPORT_DIRECTIVE);
  if (unknown.length) fail(`unknown directive name(s): ${unknown.join(', ')}`);
  const missing = POLICY_DIRECTIVE_ORDER.filter((name) => !names.includes(name));
  if (missing.length) fail(`missing directive(s): ${missing.join(', ')}`);

  if (Object.hasOwn(config.directives, OPTIONAL_REPORT_DIRECTIVE)
      && config.directives[OPTIONAL_REPORT_DIRECTIVE] !== REPORT_URI_ENDPOINT) {
    fail('report-uri must be the exact approved single HTTPS endpoint');
  }

  const seen = { [SCRIPT_HASH_PLACEHOLDER]: [], [STYLE_HASH_PLACEHOLDER]: [] };
  for (const [name, value] of Object.entries(config.directives)) {
    if (typeof value !== 'string' || !value.trim()) fail(`directive "${name}" must be a non-empty string`);
    if (/['"]?sha256-/iu.test(value)) fail(`directive "${name}" must not contain a literal hash; use the placeholders`);
    for (const token of [SCRIPT_HASH_PLACEHOLDER, STYLE_HASH_PLACEHOLDER]) {
      const count = value.split(token).length - 1;
      if (count > 0) seen[token].push({ name, count });
    }
  }
  for (const [token, uses] of Object.entries(seen)) {
    if (uses.length !== 1) fail(`${token} must appear exactly once, found ${uses.length}`);
    if (uses[0].count !== 1) fail(`${token} must appear exactly once in "${uses[0].name}", found ${uses[0].count}`);
  }
  if (seen[SCRIPT_HASH_PLACEHOLDER][0].name !== 'script-src') {
    fail(`${SCRIPT_HASH_PLACEHOLDER} must be placed in script-src, found in "${seen[SCRIPT_HASH_PLACEHOLDER][0].name}"`);
  }
  if (seen[STYLE_HASH_PLACEHOLDER][0].name !== 'style-src-elem') {
    fail(`${STYLE_HASH_PLACEHOLDER} must be placed in style-src-elem, found in "${seen[STYLE_HASH_PLACEHOLDER][0].name}"`);
  }
  return config;
}

/**
 * Serializes the policy. `scriptHashes`/`styleHashes` are inserted for their placeholder; every
 * other directive must be hash-free, and the resulting order is fixed so the emitted text is
 * stable across runs.
 */
export function serializePolicy(config, { scriptHashes = [], styleHashes = [] } = {}) {
  validateCspConfig(config);
  const parts = POLICY_DIRECTIVE_ORDER.map((name) => {
    const value = config.directives[name]
      .replaceAll(SCRIPT_HASH_PLACEHOLDER, scriptHashes.join(' '))
      .replaceAll(STYLE_HASH_PLACEHOLDER, styleHashes.join(' '))
      .trim();
    if (!value) throw new Error(`edgeone CSP config: directive "${name}" serialized to an empty value`);
    return `${name} ${value}`;
  });
  if (Object.hasOwn(config.directives, OPTIONAL_REPORT_DIRECTIVE)) {
    parts.push(`${OPTIONAL_REPORT_DIRECTIVE} ${config.directives[OPTIONAL_REPORT_DIRECTIVE]}`);
  }
  return parts.join('; ');
}

/** Parses a policy string into directive name -> raw value (no validation of directive names). */
export function parsePolicy(policy) {
  const directives = new Map();
  for (const part of String(policy).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(' ');
    const name = space === -1 ? trimmed : trimmed.slice(0, space);
    const value = space === -1 ? '' : trimmed.slice(space + 1).trim();
    if (directives.has(name)) throw new Error(`policy contains duplicate directive "${name}"`);
    directives.set(name, value);
  }
  return directives;
}

/** Hash sources found in a directive value, in order of appearance. */
export function hashSourcesIn(value) {
  return [...String(value).matchAll(/'sha256-[A-Za-z0-9+/=]+'/gu)].map((match) => match[0]);
}

function sameSet(actual, expected) {
  if (actual.length !== expected.length) return false;
  const a = [...actual].sort();
  const b = [...expected].sort();
  return a.every((item, index) => item === b[index]);
}

/**
 * Bidirectional set equality between the hashes derived from the pages that will be published and
 * the hashes present in the generated policy. Checking only one direction would accept a policy
 * that simply omits every hash, so both omissions and extras are failures, as is a hash placed in
 * the wrong directive.
 */
export function validatePolicyHashesAgainstPages(policy, pages) {
  const problems = [];
  const directives = parsePolicy(policy);
  const expectedScript = pages.flatMap((page) => page.scriptHashes);
  const expectedStyle = pages.flatMap((page) => page.styleHashes);

  // An empty expectation cannot be satisfied by an empty policy: that is exactly the "every hash
  // silently dropped" case this verification exists to catch.
  if (!expectedScript.length) problems.push('no expected script hashes were derived from the published pages');
  if (!expectedStyle.length) problems.push('no expected style hashes were derived from the published pages');

  const scriptSources = hashSourcesIn(directives.get('script-src') ?? '');
  const styleSources = hashSourcesIn(directives.get('style-src-elem') ?? '');

  if (!sameSet(scriptSources, expectedScript)) {
    problems.push(`script-src hashes do not match the published pages (policy=${scriptSources.length}, pages=${expectedScript.length})`);
  }
  if (!sameSet(styleSources, expectedStyle)) {
    problems.push(`style-src-elem hashes do not match the published pages (policy=${styleSources.length}, pages=${expectedStyle.length})`);
  }
  for (const [name, value] of directives) {
    if (name === 'script-src' || name === 'style-src-elem') continue;
    if (hashSourcesIn(value).length) problems.push(`directive "${name}" must not carry hash sources`);
  }
  const missing = [...expectedScript, ...expectedStyle].filter((hash) => !policy.includes(hash));
  if (missing.length) problems.push(`${missing.length} derived hash(es) are absent from the policy text`);
  return { ok: problems.length === 0, problems, expectedScript, expectedStyle, scriptSources, styleSources };
}

/**
 * Builds the `edgeone.json` document for one of the two states.
 *
 * Disabled state: a valid document that simply omits the CSP header rule. It must not write an
 * empty header value and must not skip generating the file, so that "off" is an explicit,
 * reviewable artifact rather than an absent one.
 */
export function buildEdgeoneJson({ config, pages }) {
  validateCspConfig(config);
  if (!config.enabled) {
    return { json: { headers: [] }, state: 'disabled', policy: null };
  }
  if (!pages.length) throw new Error('edgeone CSP config: no pages were supplied to derive hashes from');
  const scriptHashes = pages.flatMap((page) => page.scriptHashes);
  const styleHashes = pages.flatMap((page) => page.styleHashes);
  if (!scriptHashes.length || !styleHashes.length) {
    throw new Error('edgeone CSP config: derived hash sources are empty; refusing to emit a policy without them');
  }
  const policy = serializePolicy(config, { scriptHashes, styleHashes });
  if (policy.length > MAX_POLICY_LENGTH) {
    throw new Error(`edgeone CSP config: policy is ${policy.length} characters, over the ${MAX_POLICY_LENGTH} limit`);
  }
  const check = validatePolicyHashesAgainstPages(policy, pages);
  if (!check.ok) throw new Error(`edgeone CSP config: ${check.problems.join('; ')}`);
  return {
    json: { headers: [{ source: config.source, headers: [{ key: REPORT_ONLY_HEADER, value: policy }] }] },
    state: 'enabled',
    policy,
  };
}
