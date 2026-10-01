// Regression for the EdgeOne release staging generator and the manual read-back tool.
//
// Scope: this exercises the generator's safety rules, the bidirectional hash verification, the
// two configuration states, and the read-back verdicts (including duplicate same-named headers).
// It is a MANUAL entry point and is deliberately not wired into CI:
//
//   node --test tests/csp/edgeone-staging.test.mjs
//
// The generator is exercised against a synthetic artifact tree under the OS temp directory, so
// nothing outside the temp directory is written and no published artifact is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  MAX_POLICY_LENGTH,
  REPORT_ONLY_HEADER,
  buildEdgeoneJson,
  derivePageHashes,
  parsePolicy,
  serializePolicy,
  validateCspConfig,
  validatePolicyHashesAgainstPages,
} from '../../scripts/lib/edgeone-csp-policy.mjs';
import {
  REPO_ROOT,
  assertSafeOutDir,
  buildStagingDirectory,
  checkStagingDirectory,
} from '../../scripts/build-edgeone-release-artifact.mjs';
import { evaluateHeaders } from '../../tools/readback-edgeone-headers.mjs';

const CONFIG_PATH = resolve(REPO_ROOT, 'config', 'edgeone', 'csp-report-only.json');
const inlinePages = {
  'bubble-watch.html': '<html><head><style>\n  #a { display: none; }\n</style></head>'
    + '<body><script>\n  window.x = 1;\n</script></body></html>',
};

function makeArtifact(tag, pages = inlinePages) {
  const dir = mkdtempSync(resolve(tmpdir(), `eo-artifact-${tag}-`));
  for (const [name, html] of Object.entries(pages)) writeFileSync(resolve(dir, name), html);
  writeFileSync(resolve(dir, 'index.html'), '<html><body>entry</body></html>');
  return dir;
}

function makeConfig(overrides = {}) {
  const base = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return { ...base, ...overrides };
}

function writeConfig(tag, config) {
  const path = resolve(mkdtempSync(resolve(tmpdir(), `eo-config-${tag}-`)), 'config.json');
  writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}

// ---------------------------------------------------------------------------
// Configuration validation
// ---------------------------------------------------------------------------

test('the shipped configuration is valid and its placeholders sit in the right directives', () => {
  const config = validateCspConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')));
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.enabled, true);
  assert.equal(config.source, '/*');
});

test('configuration rejects a literal hash, a misplaced placeholder, and a missing directive', () => {
  const withHash = makeConfig();
  withHash.directives['script-src'] = "'self' 'sha256-abc='";
  assert.throws(() => validateCspConfig(withHash), /must not contain a literal hash/u);

  const misplaced = makeConfig();
  misplaced.directives['script-src'] = "'self'";
  misplaced.directives['style-src-elem'] = "'self' {{scriptHashes}} {{styleHashes}}";
  assert.throws(() => validateCspConfig(misplaced), /must be placed in script-src/u);

  const duplicated = makeConfig();
  duplicated.directives['script-src'] = "'self' {{scriptHashes}} {{scriptHashes}}";
  assert.throws(() => validateCspConfig(duplicated), /must appear exactly once/u);

  const missing = makeConfig();
  delete missing.directives['object-src'];
  assert.throws(() => validateCspConfig(missing), /missing directive/u);

  const badSchema = makeConfig({ schemaVersion: 2 });
  assert.throws(() => validateCspConfig(badSchema), /schemaVersion/u);

  const notBoolean = makeConfig({ enabled: 'true' });
  assert.throws(() => validateCspConfig(notBoolean), /enabled must be a boolean/u);
});

// ---------------------------------------------------------------------------
// Bidirectional hash verification
// ---------------------------------------------------------------------------

test('hash verification rejects a policy that omits every hash', () => {
  const config = makeConfig();
  const pages = [{ file: 'bubble-watch.html', ...derivePageHashes(makeArtifact('omit'), 'bubble-watch.html') }];
  const policy = serializePolicy(config, { scriptHashes: [], styleHashes: [] });
  const result = validatePolicyHashesAgainstPages(policy, pages);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /script-src hashes do not match/u.test(problem)));
  assert.ok(result.problems.some((problem) => /style-src-elem hashes do not match/u.test(problem)));
});

test('hash verification rejects an extra hash and a hash placed in the wrong directive', () => {
  const artifact = makeArtifact('extra');
  const page = { file: 'bubble-watch.html', ...derivePageHashes(artifact, 'bubble-watch.html') };
  const config = makeConfig();
  const extra = serializePolicy(config, {
    scriptHashes: [...page.scriptHashes, "'sha256-ZXh0cmE='"],
    styleHashes: page.styleHashes,
  });
  assert.equal(validatePolicyHashesAgainstPages(extra, [page]).ok, false);

  const wrongPlace = makeConfig();
  wrongPlace.directives['script-src'] = "'self'";
  wrongPlace.directives['style-src-elem'] = "'self' {{scriptHashes}} {{styleHashes}}";
  assert.throws(() => validateCspConfig(wrongPlace), /script-src/u);
});

test('hash verification accepts the exact derived sets', () => {
  const artifact = makeArtifact('exact');
  const page = { file: 'bubble-watch.html', ...derivePageHashes(artifact, 'bubble-watch.html') };
  const config = makeConfig();
  const policy = serializePolicy(config, { scriptHashes: page.scriptHashes, styleHashes: page.styleHashes });
  assert.equal(validatePolicyHashesAgainstPages(policy, [page]).ok, true);
  assert.ok(policy.length <= MAX_POLICY_LENGTH);
});

// ---------------------------------------------------------------------------
// Enabled and disabled documents
// ---------------------------------------------------------------------------

test('enabled state produces exactly one Report-Only rule and never an enforced header', () => {
  const artifact = makeArtifact('enabled');
  const page = derivePageHashes(artifact, 'bubble-watch.html');
  const { json, state, policy } = buildEdgeoneJson({ config: makeConfig(), pages: [page] });
  assert.equal(state, 'enabled');
  assert.equal(json.headers.length, 1);
  assert.equal(json.headers[0].source, '/*');
  assert.equal(json.headers[0].headers.length, 1);
  assert.equal(json.headers[0].headers[0].key, REPORT_ONLY_HEADER);
  assert.equal(json.headers[0].headers[0].value, policy);
  // The document must not contain the enforced header name anywhere, including as a substring of
  // the report-only key: assert the keys themselves rather than a JSON substring search.
  const keys = json.headers.flatMap((rule) => rule.headers.map((header) => header.key));
  assert.deepEqual(keys, [REPORT_ONLY_HEADER]);
  assert.equal(keys.some((key) => key === 'Content-Security-Policy'), false);
  assert.equal(REPORT_ONLY_HEADER.endsWith('Content-Security-Policy'), false);
});

test('disabled state writes a valid document with the CSP rule omitted, not an empty value', () => {
  const artifact = makeArtifact('disabled');
  const page = derivePageHashes(artifact, 'bubble-watch.html');
  const { json, state, policy } = buildEdgeoneJson({ config: makeConfig({ enabled: false }), pages: [page] });
  assert.equal(state, 'disabled');
  assert.equal(policy, null);
  assert.deepEqual(json, { headers: [] });
  assert.equal(JSON.stringify(json).includes('Content-Security-Policy'), false);
});

// ---------------------------------------------------------------------------
// Staging directory generation
// ---------------------------------------------------------------------------

test('staging generation copies the artifact, injects the config, and passes its own check', () => {
  const artifact = makeArtifact('stage');
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), 'eo-stage-')), 'staging');
  const result = buildStagingDirectory({ outDir, artifactDir: artifact, configPath: CONFIG_PATH, force: true });
  assert.equal(result.state, 'enabled');
  assert.ok(result.policy.length > 0);
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  assert.equal(document.headers[0].headers[0].key, REPORT_ONLY_HEADER);
  const check = checkStagingDirectory({ stagingDir: outDir, configPath: CONFIG_PATH });
  assert.deepEqual(check.problems, []);
  assert.equal(check.ok, true);
});

test('staging generation for the disabled configuration omits the rule and still checks out', () => {
  const artifact = makeArtifact('stage-off');
  const configPath = writeConfig('off', makeConfig({ enabled: false }));
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), 'eo-stage-off-')), 'staging');
  buildStagingDirectory({ outDir, artifactDir: artifact, configPath, force: true });
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  assert.deepEqual(document.headers, []);
  const check = checkStagingDirectory({ stagingDir: outDir, configPath });
  assert.equal(check.ok, true);
  assert.equal(check.state, 'disabled');
});

test('a disabled configuration is rejected by the check when the document still carries the rule', () => {
  const artifact = makeArtifact('stage-mismatch');
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), 'eo-stage-mismatch-')), 'staging');
  buildStagingDirectory({ outDir, artifactDir: artifact, configPath: CONFIG_PATH, force: true });
  const check = checkStagingDirectory({ stagingDir: outDir, configPath: writeConfig('off2', makeConfig({ enabled: false })) });
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((problem) => /disabled but the document carries/u.test(problem)));
});

test('a tampered policy in the staged document fails the check', () => {
  const artifact = makeArtifact('stage-tamper');
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), 'eo-stage-tamper-')), 'staging');
  buildStagingDirectory({ outDir, artifactDir: artifact, configPath: CONFIG_PATH, force: true });
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.headers[0].headers[0].value = document.headers[0].headers[0].value.replace(/script-src [^;]+/u, "script-src 'self'");
  writeFileSync(resolve(outDir, 'edgeone.json'), JSON.stringify(document, null, 2));
  const check = checkStagingDirectory({ stagingDir: outDir, configPath: CONFIG_PATH });
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((problem) => /script-src hashes do not match/u.test(problem)));
});

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

test('output path rules refuse root, the repository root, protected directories and overlap', () => {
  const artifact = makeArtifact('paths');
  const expectRefusal = (outDir, pattern) => {
    assert.throws(() => assertSafeOutDir(outDir, { artifactDir: artifact }), pattern);
  };
  expectRefusal('', /a value is required/u);
  expectRefusal(resolve(REPO_ROOT), /repository root/u);
  expectRefusal(resolve(REPO_ROOT, 'scripts', 'tmp'), /protected repository directory/u);
  expectRefusal(resolve(REPO_ROOT, 'tests', 'x'), /protected repository directory/u);
  expectRefusal(artifact, /must not overlap/u);
  expectRefusal(resolve(artifact, 'nested'), /must not overlap/u);

  // An explicitly requested location outside the repository is allowed.
  const outside = resolve(tmpdir(), 'eo-allowed-outside');
  assert.equal(assertSafeOutDir(outside, { artifactDir: artifact }), outside);
});

test('an existing non-empty target is refused unless --force confirms it', () => {
  const artifact = makeArtifact('nonempty');
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), 'eo-nonempty-')), 'staging');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'keep.txt'), 'do not delete me');
  assert.throws(
    () => buildStagingDirectory({ outDir, artifactDir: artifact, configPath: CONFIG_PATH }),
    /refusing to clear existing non-empty directory/u,
  );
  assert.equal(readFileSync(resolve(outDir, 'keep.txt'), 'utf8'), 'do not delete me');
  buildStagingDirectory({ outDir, artifactDir: artifact, configPath: CONFIG_PATH, force: true });
  assert.equal(JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8')).headers.length, 1);
});

// ---------------------------------------------------------------------------
// Read-back verdicts
// ---------------------------------------------------------------------------

const POLICY = (() => {
  const artifact = makeArtifact('readback');
  const config = makeConfig();
  const page = { file: 'bubble-watch.html', ...derivePageHashes(artifact, 'bubble-watch.html') };
  return serializePolicy(config, { scriptHashes: page.scriptHashes, styleHashes: page.styleHashes });
})();

test('read-back passes for a single expected report-only header', () => {
  const result = evaluateHeaders([[REPORT_ONLY_HEADER, POLICY]], { expectedPolicy: POLICY });
  assert.equal(result.ok, true);
  assert.equal(result.sameNameCount, 1);
});

test('read-back keeps two same-named headers instead of merging or dropping them', () => {
  const other = POLICY.replace("script-src-attr 'none'", "script-src-attr 'unsafe-inline'");
  const result = evaluateHeaders([[REPORT_ONLY_HEADER, POLICY], [REPORT_ONLY_HEADER, other]], { expectedPolicy: POLICY });
  assert.equal(result.reportOnly.length, 2);
  assert.deepEqual(result.reportOnly, [POLICY, other]);
  assert.ok(result.notes.some((note) => /2 same-named/u.test(note)));
  // Both raw values were preserved, so the mismatch is reported rather than hidden by merging.
  assert.equal(result.ok, false);
});

test('read-back fails on a missing header, an enforced header, and a wrong value', () => {
  const missing = evaluateHeaders([['server', 'edgeone']], {});
  assert.equal(missing.ok, false);
  assert.ok(missing.findings.some((finding) => /missing Content-Security-Policy-Report-Only/u.test(finding)));

  const enforced = evaluateHeaders([[REPORT_ONLY_HEADER, POLICY], ['Content-Security-Policy', "default-src 'none'"]], { expectedPolicy: POLICY });
  assert.equal(enforced.ok, false);
  assert.ok(enforced.findings.some((finding) => /unexpected enforced/u.test(finding)));

  const wrong = evaluateHeaders([[REPORT_ONLY_HEADER, POLICY.replace('object-src', 'object-src ') + ' ']], { expectedPolicy: POLICY });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.findings.some((finding) => /differs from the generated policy/u.test(finding)));
});

test('read-back treats an absent header as correct when the configuration is disabled', () => {
  const absent = evaluateHeaders([['server', 'edgeone']], { expectedState: 'disabled' });
  assert.equal(absent.ok, true);
  assert.equal(absent.state, 'disabled');

  const stillPresent = evaluateHeaders([[REPORT_ONLY_HEADER, POLICY]], { expectedState: 'disabled' });
  assert.equal(stillPresent.ok, false);
  assert.ok(stillPresent.findings.some((finding) => /expected no Content-Security-Policy-Report-Only/u.test(finding)));
});

test('parsing a tampered policy still yields directives for inspection', () => {
  const directives = parsePolicy(POLICY);
  assert.ok(directives.has('default-src'));
  assert.throws(() => parsePolicy('default-src https://a.example; default-src https://b.example'), /duplicate directive/u);
});

test.after(() => {
  rmSync(resolve(tmpdir(), 'eo-allowed-outside'), { recursive: true, force: true });
});
