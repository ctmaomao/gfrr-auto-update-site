// Regression for the Phase 1 review fixes: real-HTTP duplicate headers, duplicate verdicts,
// empty hash sets, recursive tree validation and full-configuration `--check`.
//
// Manual entry point, not wired into CI:
//   node --test tests/csp/edgeone-staging-review.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  REPORT_ONLY_HEADER,
  buildEdgeoneJson,
  deriveExpectedHashSources,
  derivePageHashes,
  validatePolicyHashesAgainstPages,
  withAdditionalHashes,
} from '../../scripts/lib/edgeone-csp-policy.mjs';
import {
  buildStagingDirectory,
  checkStagingDirectory,
  fileInventory,
  validateStagingTree,
} from '../../scripts/build-edgeone-release-artifact.mjs';
import { evaluateHeaders, fetchHeaderPairs, pairsFromRawHeaders } from '../../tools/readback-edgeone-headers.mjs';

const CONFIG_PATH = resolve(import.meta.dirname, '..', '..', 'config', 'edgeone', 'csp-report-only.json');
const readConfig = () => JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const PAGE = '<html><head><style>\n  #a { display: none; }\n</style></head><body><script>\n  window.x = 1;\n</script></body></html>';

function makeTree(tag, files = { 'bubble-watch.html': PAGE }) {
  const dir = mkdtempSync(resolve(tmpdir(), `eo-review-${tag}-`));
  for (const [name, content] of Object.entries(files)) {
    const path = resolve(dir, name);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

function policyFor(dir) {
  const config = readConfig();
  const { pages } = deriveExpectedHashSources(dir);
  return buildEdgeoneJson({ config, pages });
}

// ---------------------------------------------------------------------------
// Fix 1 — real HTTP read-back must not lose duplicate headers
// ---------------------------------------------------------------------------

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('fetchHeaderPairs preserves two same-named headers from a real HTTP response', async () => {
  const first = 'default-src \'none\'; script-src \'self\'';
  const second = 'default-src \'self\'';
  await withServer((request_, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.setHeader(REPORT_ONLY_HEADER, [first, second]);
    response.end('ok');
  }, async (url) => {
    const { status, pairs } = await fetchHeaderPairs(url);
    assert.equal(status, 200);
    const values = pairs.filter(([name]) => name.toLowerCase() === REPORT_ONLY_HEADER.toLowerCase()).map(([, value]) => value);
    assert.deepEqual(values, [first, second], 'both raw values must survive the read-back');

    const result = evaluateHeaders(pairs, {});
    assert.equal(result.reportOnly.length, 2);
    assert.equal(result.ok, false, 'two same-named headers must fail the verdict');
  });
});

test('pairsFromRawHeaders keeps every occurrence in order', () => {
  const pairs = pairsFromRawHeaders(['Set-Cookie', 'a=1', 'set-cookie', 'b=2', 'Content-Type', 'text/html']);
  assert.deepEqual(pairs, [['Set-Cookie', 'a=1'], ['set-cookie', 'b=2'], ['Content-Type', 'text/html']]);
});

// ---------------------------------------------------------------------------
// Fix 2 — identical duplicate values still fail
// ---------------------------------------------------------------------------

test('two identical Report-Only values are a failure, not a note', () => {
  const dir = makeTree('dup-identical');
  const { policy } = policyFor(dir);
  const result = evaluateHeaders([[REPORT_ONLY_HEADER, policy], [REPORT_ONLY_HEADER, policy]], { expectedPolicy: policy });
  assert.equal(result.reportOnly.length, 2);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => /duplicate Content-Security-Policy-Report-Only/u.test(finding)));
});

test('a single matching header still passes', () => {
  const dir = makeTree('single');
  const { policy } = policyFor(dir);
  assert.equal(evaluateHeaders([[REPORT_ONLY_HEADER, policy]], { expectedPolicy: policy }).ok, true);
});

// ---------------------------------------------------------------------------
// Fix 3 — empty hash sets must fail
// ---------------------------------------------------------------------------

test('an empty expectation is not satisfied by an empty policy', () => {
  const result = validatePolicyHashesAgainstPages("default-src 'none'; script-src 'self'; style-src-elem 'self'", [
    { file: 'page.html', scriptHashes: [], styleHashes: [] },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /no expected script hashes/u.test(problem)));
  assert.ok(result.problems.some((problem) => /no expected style hashes/u.test(problem)));
});

test('a policy with no hashes fails against a page that has them, and vice versa', () => {
  const dir = makeTree('empty-sides');
  const page = derivePageHashes(dir, 'bubble-watch.html');
  const empty = "default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'";
  assert.equal(validatePolicyHashesAgainstPages(empty, [page]).ok, false);

  const full = policyFor(dir).policy;
  assert.equal(validatePolicyHashesAgainstPages(full, [{ file: 'x', scriptHashes: [], styleHashes: [] }]).ok, false);
});

test('a page with no inline blocks is rejected instead of contributing an empty set', () => {
  const dir = makeTree('no-inline', { 'bubble-watch.html': '<html><body>no inline content</body></html>' });
  assert.throws(() => deriveExpectedHashSources(dir), /no inline <script> block/u);

  const styleOnly = makeTree('style-only', { 'bubble-watch.html': '<html><head><style>#a{display:none}</style></head><body></body></html>' });
  assert.throws(() => deriveExpectedHashSources(styleOnly), /no inline <script> block/u);
});

test('generating a policy from an empty page set is refused', () => {
  assert.throws(() => buildEdgeoneJson({ config: readConfig(), pages: [] }), /no pages were supplied/u);
  assert.throws(
    () => buildEdgeoneJson({ config: readConfig(), pages: [{ file: 'x', scriptHashes: [], styleHashes: [] }] }),
    /derived hash sources are empty/u,
  );
});

// ---------------------------------------------------------------------------
// Fix 4 — recursive tree validation and copy integrity
// ---------------------------------------------------------------------------

test('validateStagingTree detects a symlink anywhere in the input tree', () => {
  const dir = makeTree('input-link');
  symlinkSync(resolve(dir, 'bubble-watch.html'), resolve(dir, 'alias.html'));
  assert.throws(() => validateStagingTree(dir, { artifactDir: dir }), /contains a symbolic link/u);
});

test('validateStagingTree detects a nested symlink in the final tree', () => {
  const source = makeTree('final-src');
  const target = makeTree('final-link');
  mkdirSync(resolve(target, 'nested'), { recursive: true });
  writeFileSync(resolve(target, 'bubble-watch.html'), PAGE);
  symlinkSync(resolve(target, 'bubble-watch.html'), resolve(target, 'nested', 'alias.html'));
  assert.throws(() => validateStagingTree(target, { artifactDir: source }), /contains a symbolic link/u);
});

test('validateStagingTree rejects a content mismatch and an extra nested file', () => {
  const source = makeTree('integrity-src');
  const target = makeTree('integrity-dst');

  writeFileSync(resolve(target, 'bubble-watch.html'), `${PAGE}<!-- tampered -->`);
  writeFileSync(resolve(target, 'edgeone.json'), '{}');
  assert.throws(() => validateStagingTree(target, { artifactDir: source }), /size mismatch|content mismatch/u);

  writeFileSync(resolve(target, 'bubble-watch.html'), PAGE);
  mkdirSync(resolve(target, 'assets'), { recursive: true });
  writeFileSync(resolve(target, 'assets', 'extra.css'), 'body{}');
  assert.throws(() => validateStagingTree(target, { artifactDir: source }), /unexpected file in staging/u);
});

test('fileInventory covers nested paths', () => {
  const dir = makeTree('inventory', { 'bubble-watch.html': PAGE, 'assets/a/b.css': 'body{}' });
  const inventory = fileInventory(dir);
  assert.deepEqual([...inventory.keys()].sort(), ['assets/a/b.css', 'bubble-watch.html']);
});

// ---------------------------------------------------------------------------
// Fix 5 — --check compares the whole document
// ---------------------------------------------------------------------------

function buildStaging(tag, config = readConfig()) {
  const artifact = makeTree(`${tag}-artifact`);
  const configPath = resolve(mkdtempSync(resolve(tmpdir(), `eo-${tag}-cfg-`)), 'config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), `eo-${tag}-out-`)), 'staging');
  buildStagingDirectory({ outDir, artifactDir: artifact, configPath, force: true });
  return { outDir, configPath, artifact };
}

test('check rejects a document whose non-hash directive was rewritten', () => {
  const { outDir, configPath } = buildStaging('rewrite');
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.headers[0].headers[0].value = document.headers[0].headers[0].value.replace("connect-src 'self'", "connect-src 'self' https://example.com");
  writeFileSync(resolve(outDir, 'edgeone.json'), `${JSON.stringify(document, null, 2)}\n`);
  const result = checkStagingDirectory({ stagingDir: outDir, configPath });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /differs from the document regenerated/u.test(problem)));
});

test('check rejects a lower-case enforced CSP header', () => {
  const { outDir, configPath } = buildStaging('lowercase');
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.headers[0].headers.push({ key: 'content-security-policy', value: "default-src 'none'" });
  writeFileSync(resolve(outDir, 'edgeone.json'), `${JSON.stringify(document, null, 2)}\n`);
  const result = checkStagingDirectory({ stagingDir: outDir, configPath });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /enforced/u.test(problem)));
});

test('check refuses a directory holding two Report-Only entries', () => {
  const { outDir, configPath } = buildStaging('two-entries');
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.headers[0].headers.push(document.headers[0].headers[0]);
  writeFileSync(resolve(outDir, 'edgeone.json'), `${JSON.stringify(document, null, 2)}\n`);
  const result = checkStagingDirectory({ stagingDir: outDir, configPath });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /Report-Only header entries/u.test(problem)));
});

test('check fails when the staged page loses its inline blocks', () => {
  const { outDir, configPath } = buildStaging('lost-inline');
  writeFileSync(resolve(outDir, 'bubble-watch.html'), '<html><body>stripped</body></html>');
  const result = checkStagingDirectory({ stagingDir: outDir, configPath });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /cannot derive the expected document|no inline/u.test(problem)));
});

test('withAdditionalHashes keeps the shared template and appends only what is asked', () => {
  const config = readConfig();
  const base = withAdditionalHashes(config, { scriptHashes: ["'sha256-AAA='"], styleHashes: ["'sha256-BBB='"] });
  const extended = withAdditionalHashes(config, {
    scriptHashes: ["'sha256-AAA='"],
    styleHashes: ["'sha256-BBB='"],
    extraScriptHashes: ["'sha256-CCC='"],
  });
  assert.ok(base.includes("'sha256-AAA='"));
  assert.equal(base.includes("'sha256-CCC='"), false);
  assert.ok(extended.includes("'sha256-CCC='"));
  assert.equal(extended.split(';').length, base.split(';').length, 'no directive may be added or dropped');
});
