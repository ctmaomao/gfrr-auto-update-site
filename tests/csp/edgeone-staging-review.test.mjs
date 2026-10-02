// Regression for the Phase 1 review fixes: real-HTTP duplicate headers, duplicate verdicts,
// empty hash sets, recursive tree validation and full-configuration `--check`.
//
// Manual entry point, not wired into CI:
//   node --test tests/csp/edgeone-staging-review.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  REPO_ROOT,
  buildStagingDirectory,
  checkStagingDirectory,
  fileInventory,
  manifestFromArtifact,
  validateStagingTree,
  writeManifest,
} from '../../scripts/build-edgeone-release-artifact.mjs';
import { evaluateHeaders, fetchHeaderPairs, pairsFromRawHeaders } from '../../tools/readback-edgeone-headers.mjs';
import { bashGuard, resolveBash, shellUsable } from './shell-guard.mjs';

const CONFIG_PATH = resolve(import.meta.dirname, '..', '..', 'config', 'edgeone', 'csp-report-only.json');
const CLI_PATH = resolve(import.meta.dirname, '..', '..', 'scripts', 'build-edgeone-release-artifact.mjs');
const readConfig = () => JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const rmSyncQuiet = (path) => rmSync(path, { force: true, recursive: true });

function writeConfig(tag, config) {
  const path = resolve(mkdtempSync(resolve(tmpdir(), `eo-cfg-${tag}-`)), 'config.json');
  writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}

/**
 * Creates a link for the symlink-rejection cases. Directory symlinks need elevation or Developer
 * Mode on Windows, so this falls back to a junction (`mklink /J`), which does not. Returns the link
 * path, or null when the environment cannot create either — an unexecuted assertion is reported as
 * skipped, never as passing.
 */
function tryCreateLink({ targetDir, linkDir, linkName, linkTarget, kind }) {
  const link = resolve(linkDir, linkName);
  if (kind === 'file') {
    try {
      symlinkSync(linkTarget, link);
      return link;
    } catch {
      return null;
    }
  }
  try {
    symlinkSync(linkTarget, link, 'junction');
    return link;
  } catch {
    /* fall through to mklink */
  }
  try {
    execFileSync('cmd', ['/c', 'mklink', '/J', link, linkTarget], { stdio: 'ignore' });
    return link;
  } catch {
    return null;
  }
}

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

test('validateStagingTree detects a symlink or junction anywhere in the input tree', (t) => {
  const dir = makeTree('input-link');
  const link = tryCreateLink({
    targetDir: dir,
    linkDir: dir,
    linkName: 'alias.html',
    linkTarget: resolve(dir, 'bubble-watch.html'),
    kind: 'file',
  });
  if (!link) {
    t.skip('this environment cannot create file symlinks (EPERM) and a file junction does not exist');
    return;
  }
  assert.throws(() => validateStagingTree(dir, { artifactDir: dir }), /contains a symbolic link/u);
});

test('validateStagingTree detects a nested directory junction in the final tree', (t) => {
  const source = makeTree('final-src');
  const target = makeTree('final-link');
  writeFileSync(resolve(target, 'bubble-watch.html'), PAGE);
  const link = tryCreateLink({
    targetDir: target,
    linkDir: target,
    linkName: 'nested',
    linkTarget: source,
    kind: 'dir',
  });
  if (!link) {
    t.skip('this environment cannot create directory symlinks or junctions');
    return;
  }
  assert.throws(() => validateStagingTree(target, { artifactDir: source }), /contains a symbolic link/u);
});

test('assertNoSymlinks rejects a junction used as a tree entry', (t) => {
  const source = makeTree('junction-src');
  const target = makeTree('junction-dst');
  mkdirSync(resolve(target, 'assets'), { recursive: true });
  writeFileSync(resolve(target, 'assets', 'a.css'), 'body{}');
  const link = tryCreateLink({
    targetDir: target,
    linkDir: target,
    linkName: 'linked-assets',
    linkTarget: resolve(target, 'assets'),
    kind: 'dir',
  });
  if (!link) {
    t.skip('this environment cannot create directory symlinks or junctions');
    return;
  }
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
  // Give the artifact a second file so nested-path handling is exercised too.
  mkdirSync(resolve(artifact, 'assets'), { recursive: true });
  writeFileSync(resolve(artifact, 'assets', 'site.css'), 'body{}');
  writeFileSync(resolve(artifact, 'index.html'), '<html>entry</html>');
  const configPath = resolve(mkdtempSync(resolve(tmpdir(), `eo-${tag}-cfg-`)), 'config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), `eo-${tag}-out-`)), 'staging');
  buildStagingDirectory({ outDir, artifactDir: artifact, configPath, force: true });
  return { outDir, configPath, artifact };
}

const checkWithAnchor = (stagingDir, configPath, artifactDir) => checkStagingDirectory({ stagingDir, configPath, artifactDir });

test('check rejects a document whose non-hash directive was rewritten', () => {
  const { outDir, configPath, artifact } = buildStaging('rewrite');
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.headers[0].headers[0].value = document.headers[0].headers[0].value.replace("connect-src 'self'", "connect-src 'self' https://example.com");
  writeFileSync(resolve(outDir, 'edgeone.json'), `${JSON.stringify(document, null, 2)}\n`);
  const result = checkWithAnchor(outDir, configPath, artifact);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /differs from the document regenerated/u.test(problem)));
});

test('check rejects a lower-case enforced CSP header', () => {
  const { outDir, configPath, artifact } = buildStaging('lowercase');
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.headers[0].headers.push({ key: 'content-security-policy', value: "default-src 'none'" });
  writeFileSync(resolve(outDir, 'edgeone.json'), `${JSON.stringify(document, null, 2)}\n`);
  const result = checkWithAnchor(outDir, configPath, artifact);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /enforced/u.test(problem)));
});

test('check refuses a directory holding two Report-Only entries', () => {
  const { outDir, configPath, artifact } = buildStaging('two-entries');
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.headers[0].headers.push(document.headers[0].headers[0]);
  writeFileSync(resolve(outDir, 'edgeone.json'), `${JSON.stringify(document, null, 2)}\n`);
  const result = checkWithAnchor(outDir, configPath, artifact);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /Report-Only header entries/u.test(problem)));
});

test('check fails when the staged page loses its inline blocks', () => {
  const { outDir, configPath, artifact } = buildStaging('lost-inline');
  writeFileSync(resolve(outDir, 'bubble-watch.html'), '<html><body>stripped</body></html>');
  const result = checkWithAnchor(outDir, configPath, artifact);
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

// ---------------------------------------------------------------------------
// Review round 2 — structure must be anchored, and the disabled state must be
// compared in full rather than short-circuited
// ---------------------------------------------------------------------------

test('check requires a trusted expectation and says so when none was supplied', () => {
  const { outDir, configPath } = buildStaging('anchor-required');
  const withoutAnchor = checkStagingDirectory({ stagingDir: outDir, configPath });
  assert.equal(withoutAnchor.ok, false);
  assert.equal(withoutAnchor.checkedStructure, false);
  assert.ok(withoutAnchor.problems.some((problem) => /no trusted expectation was supplied/u.test(problem)));

  const withAnchor = checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: resolve(outDir, '..', 'artifact-missing') });
  assert.equal(withAnchor.ok, false, 'a non-existent artifact directory cannot serve as the anchor');
});

test('check rejects an extra file and a missing file against the artifact directory', () => {
  const { outDir, configPath, artifact } = buildStaging('extra-file');
  assert.equal(checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact }).ok, true);

  writeFileSync(resolve(outDir, 'unexpected.js'), 'console.log(1)');
  const extra = checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact });
  assert.equal(extra.ok, false);
  assert.ok(extra.problems.some((problem) => /unexpected file in staging/u.test(problem)));
});

test('check rejects a missing file and a content difference', () => {
  const { outDir, configPath, artifact } = buildStaging('missing-file');
  writeFileSync(resolve(outDir, 'index.html'), '<html>entry</html>');
  writeFileSync(resolve(artifact, 'index.html'), '<html>entry</html>');
  assert.equal(checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact }).ok, true);

  writeFileSync(resolve(outDir, 'extra-only-in-source.txt'), 'x');
  writeFileSync(resolve(artifact, 'extra-only-in-source.txt'), 'x');
  assert.equal(checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact }).ok, true);

  rmSyncQuiet(resolve(outDir, 'extra-only-in-source.txt'));
  const missing = checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact });
  assert.equal(missing.ok, false);
  assert.ok(missing.problems.some((problem) => /missing from staging/u.test(problem)));

  writeFileSync(resolve(outDir, 'index.html'), '<html>tampered</html>');
  const changed = checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact });
  assert.equal(changed.ok, false);
  assert.ok(changed.problems.some((problem) => /size mismatch|content mismatch/u.test(problem)));
});

test('check works from a written manifest as the trusted expectation', () => {
  const { outDir, configPath, artifact } = buildStaging('manifest');
  const manifestPath = resolve(mkdtempSync(resolve(tmpdir(), 'eo-manifest-')), 'manifest.json');
  const manifest = writeManifest(artifact, manifestPath);
  assert.equal(manifest.format, 'edgeone-staging-manifest-v1');
  assert.equal(checkStagingDirectory({ stagingDir: outDir, configPath, manifestPath }).ok, true);

  writeFileSync(resolve(outDir, 'unexpected.js'), 'x');
  const extra = checkStagingDirectory({ stagingDir: outDir, configPath, manifestPath });
  assert.equal(extra.ok, false);
  assert.ok(extra.problems.some((problem) => /unexpected file in staging/u.test(problem)));
});

test('the CLI --check enforces the trusted expectation end to end', () => {
  const { outDir, configPath, artifact } = buildStaging('cli-check');
  const run = (args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' }) };
    } catch (error) {
      return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
  };
  const base = ['--check', '--out-dir', outDir, '--config', configPath, '--artifact-dir', artifact];
  assert.equal(run(base).code, 0);

  writeFileSync(resolve(outDir, 'unexpected.js'), 'console.log(1)');
  const extra = run(base);
  assert.equal(extra.code, 1);
  assert.match(extra.out, /unexpected file in staging/u);

  const withoutAnchor = run(['--check', '--out-dir', outDir, '--config', configPath]);
  assert.equal(withoutAnchor.code, 1);
  assert.match(withoutAnchor.out, /no trusted expectation was supplied/u);
});

test('the disabled state is compared in full and rejects an undeclared rule', () => {
  const configPath = writeConfig('disabled-full', { ...readConfig(), enabled: false });
  const artifact = makeTree('disabled-full-artifact');
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), 'eo-disabled-full-')), 'staging');
  buildStagingDirectory({ outDir, artifactDir: artifact, configPath, force: true });
  assert.equal(checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact }).ok, true);

  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.redirects = [{ source: '/*', destination: '/index.html', statusCode: 302 }];
  writeFileSync(resolve(outDir, 'edgeone.json'), `${JSON.stringify(document, null, 2)}\n`);
  const result = checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'disabled');
  assert.ok(result.problems.some((problem) => /differs from the document regenerated/u.test(problem)));
  assert.ok(result.problems.some((problem) => /declares "redirects"/u.test(problem)));
});

test('the disabled state also rejects an added header rule it never declared', () => {
  const configPath = writeConfig('disabled-extra-header', { ...readConfig(), enabled: false });
  const artifact = makeTree('disabled-extra-artifact');
  const outDir = resolve(mkdtempSync(resolve(tmpdir(), 'eo-disabled-extra-')), 'staging');
  buildStagingDirectory({ outDir, artifactDir: artifact, configPath, force: true });
  const document = JSON.parse(readFileSync(resolve(outDir, 'edgeone.json'), 'utf8'));
  document.headers = [{ source: '/*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }];
  writeFileSync(resolve(outDir, 'edgeone.json'), `${JSON.stringify(document, null, 2)}\n`);
  const result = checkStagingDirectory({ stagingDir: outDir, configPath, artifactDir: artifact });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /differs from the document regenerated/u.test(problem)));
});

test('manifestFromArtifact records size and hash for every file', () => {
  const artifact = makeTree('manifest-src', { 'bubble-watch.html': PAGE, 'assets/a/b.css': 'body{}' });
  const manifest = manifestFromArtifact(artifact);
  assert.equal(manifest.fileCount, 2);
  assert.deepEqual(manifest.files.map((entry) => entry.path).sort(), ['assets/a/b.css', 'bubble-watch.html']);
  for (const entry of manifest.files) assert.match(entry.sha256, /^[0-9a-f]{64}$/u);
});

// ---------------------------------------------------------------------------
// Stage 3 — the production publish workflow
//
// Asserting that `--check` returns non-zero is not enough: the point is that the publish step is
// never reached. So these cases run the workflow's OWN generation step (extracted from the
// workflow file, not re-written here) under bash with injected failures, and separately assert
// that the publication step carries no bypass condition.
// ---------------------------------------------------------------------------

const WORKFLOW_PATH = resolve(import.meta.dirname, '..', '..', '.github', 'workflows', 'publish-edgeone-release.yml');

function readWorkflowSteps() {
  const text = readFileSync(WORKFLOW_PATH, 'utf8');
  const lines = text.split('\n');
  const steps = [];
  let current = null;
  for (const line of lines) {
    const nameMatch = /^\s{6}- name:\s*(.+?)\s*$/u.exec(line);
    if (nameMatch) {
      current = { name: nameMatch[1], indent: 6, lines: [] };
      steps.push(current);
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const indent = line.length - line.trimStart().length;
    // A sibling key of the same step (`run:`, `if:`, `env:`, …) or the next step's block content.
    if (indent > current.indent && current.lines.length === 0 && /^(run|if|uses|with|env|id):/u.test(trimmed)) {
      current.lines.push(line);
    } else if (indent > current.indent) {
      current.lines.push(line);
    }
  }
  return { text, steps };
}

function stepRunScript(stepName) {
  const { steps } = readWorkflowSteps();
  const step = steps.find((entry) => entry.name === stepName);
  assert.ok(step, `workflow has no step named "${stepName}"`);
  const runIndex = step.lines.findIndex((line) => /^\s+run:\s*\|/u.test(line));
  assert.notEqual(runIndex, -1, `step "${stepName}" has no block run script`);
  const body = step.lines.slice(runIndex + 1);
  const indent = Math.min(...body.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length));
  return `${body.map((line) => line.slice(indent)).join('\n')}\n`;
}

function bashPath(winPath) {
  // Git Bash accepts /c/... drive paths for POSITIONAL arguments. On other platforms the path is
  // already usable as-is, so no conversion is applied.
  if (process.platform !== 'win32') return resolve(winPath);
  const normalized = resolve(winPath).replaceAll('\\', '/');
  const match = /^([A-Za-z]):\/(.*)$/u.exec(normalized);
  return match ? `/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

/**
 * Applies the resolved guard to a test context: returns the shell when it is usable, otherwise
 * fails in CI or skips locally. Returns null when the caller must stop before touching bash.
 */
function requireBash(t) {
  const guard = bashGuard();
  if (guard.ok) return guard.candidate;
  if (guard.mustFail) {
    assert.fail(`${guard.reason}; GF_REQUIRE_BASH=1 forbids skipping the bash-driven workflow cases`);
  }
  console.error(`[csp] skipping a bash-driven workflow case: ${guard.reason}`);
  t.skip(guard.reason);
  return null;
}

// Git Bash leaves Windows-style values of inherited ENVIRONMENT variables alone (verified with a
// probe), but rewrites drive-style paths it sees as arguments. The runner's own variables are
// Windows paths, so the tests set those natively and only use the POSIX form where the extracted
// script would pass a path as an argument on a real Ubuntu runner.
function runnerEnv(scratchDir, summaryPath) {
  return {
    RUNNER_TEMP: resolve(scratchDir),
    GITHUB_WORKSPACE: resolve(REPO_ROOT),
    GITHUB_STEP_SUMMARY: resolve(summaryPath),
  };
}

function runInBash(script, env, bash = resolveBash()) {  try {
    const out = execFileSync(bash, ['--noprofile', '--norc', '-c', script], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
      env: { ...process.env, MSYS_NO_PATHCONV: '1', ...env },
    });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('the workflow publishes from the staging tree and keeps the .git/ exclusion', () => {
  const { text } = readWorkflowSteps();
  assert.match(text, /rsync -a --delete --exclude='\.git\/' "\$RUNNER_TEMP\/edgeone-staging\/" "\$release_dir\/"/u);
  assert.doesNotMatch(text, /rsync[^\n]*"\$GITHUB_WORKSPACE\/_site\/"/u, 'the publish step must no longer sync _site directly');
  for (const path of ["'scripts/build-edgeone-release-artifact.mjs'", "'scripts/lib/edgeone-csp-policy.mjs'", "'config/edgeone/**'"]) {
    assert.ok(text.includes(path), `push.paths must include ${path}`);
  }
});

test('the generation step runs before the publication step and carries no bypass condition', () => {
  const { text, steps } = readWorkflowSteps();
  const generationIndex = steps.findIndex((step) => step.name === 'Build EdgeOne release staging tree');
  const publicationIndex = steps.findIndex((step) => step.name === 'Publish changed artifact with quota guard');
  assert.notEqual(generationIndex, -1);
  assert.notEqual(publicationIndex, -1);
  assert.ok(generationIndex < publicationIndex, 'generation must precede publication');

  for (const name of ['Build allowlisted static artifact', 'Build EdgeOne release staging tree', 'Publish changed artifact with quota guard']) {
    const step = steps.find((entry) => entry.name === name);
    const block = step.lines.join('\n');
    assert.doesNotMatch(block, /continue-on-error/u, `${name} must not use continue-on-error`);
    assert.doesNotMatch(block, /^\s+if:/mu, `${name} must not carry a step-level if condition`);
  }
  // The only `if: always()` in the job is the pre-existing deploy-key cleanup, which runs after the
  // publish step and cannot rescue it.
  const alwaysSteps = [...text.matchAll(/^\s{6}- name:\s*(.+?)\s*\n\s{8}if:\s*always\(\)/gmu)].map((match) => match[1]);
  assert.deepEqual(alwaysSteps, ['Remove release deploy key']);
});

test('the generation step tolerates a failing generator: pipefail keeps the step non-zero', (t) => {
  const bash = requireBash(t);
  if (!bash) return;
  const script = stepRunScript('Build EdgeOne release staging tree');
  assert.match(script, /set -eo pipefail|set -euo pipefail/u, 'the step must set pipefail');
  assert.match(script, /\| tee -a "\$GITHUB_STEP_SUMMARY"/u);

  const scratch = mkdtempSync(resolve(tmpdir(), 'eo-steptest-'));
  const summary = resolve(scratch, 'summary.md');
  writeFileSync(summary, '');

  // Generation failure: point GITHUB_WORKSPACE at a directory with no config/edgeone, so
  // `--add-config` exits non-zero and the pipeline must not swallow it.
  const emptyWorkspace = mkdtempSync(resolve(tmpdir(), 'eo-emptyws-'));
  const missingConfig = runInBash(script, {
    ...runnerEnv(scratch, summary),
    GITHUB_WORKSPACE: resolve(emptyWorkspace),
  }, bash);
  assert.notEqual(missingConfig.code, 0, 'a failing generation step must exit non-zero through tee');
  assert.match(missingConfig.out, /edgeone staging build failed/u);
  const summaryAfterFailure = readFileSync(summary, 'utf8');
  assert.match(summaryAfterFailure, /### EdgeOne staging tree/u, 'tee must still capture what the generator printed');
});

test('the generation step fails when the generated tree is tampered with before the check', (t) => {
  const bash = requireBash(t);
  if (!bash) return;
  const script = stepRunScript('Build EdgeOne release staging tree');
  assert.ok(script.includes('--check'), 'the extracted step must contain the --check invocation');
  const scratch = mkdtempSync(resolve(tmpdir(), 'eo-steptest2-'));
  const summary = resolve(scratch, 'summary.md');
  writeFileSync(summary, '');
  // The step regenerates the staging tree before checking it, so tampering has to be introduced
  // between those two commands. This runs the check half against a staging tree that carries an
  // extra file, which the check must reject.
  const staging = resolve(scratch, 'edgeone-staging');
  const artifactDir = resolve(REPO_ROOT, '_site');
  buildStagingDirectory({ outDir: staging, artifactDir, configPath: CONFIG_PATH, force: true });
  writeFileSync(resolve(staging, 'unexpected.js'), 'console.log(1)');

  const checkOnly = [
    'set -euo pipefail',
    'set -o pipefail',
    'staging="$RUNNER_TEMP/edgeone-staging"',
    'config="$GITHUB_WORKSPACE/config/edgeone/csp-report-only.json"',
    `{ node scripts/build-edgeone-release-artifact.mjs --check --artifact-dir "$GITHUB_WORKSPACE/_site" --config "$config" --out-dir "$staging"; echo 'end'; } | tee -a "$GITHUB_STEP_SUMMARY"`,
  ].join('\n');
  const result = runInBash(checkOnly, runnerEnv(scratch, summary), bash);
  assert.notEqual(result.code, 0, 'a failing check must exit non-zero through tee');
  assert.match(result.out, /unexpected file in staging/u);
});

test('the generation step succeeds on the real artifact and prints evidence into the summary', (t) => {
  const bash = requireBash(t);
  if (!bash) return;
  const script = stepRunScript('Build EdgeOne release staging tree');
  const scratch = mkdtempSync(resolve(tmpdir(), 'eo-steptest3-'));
  const summary = resolve(scratch, 'summary.md');
  writeFileSync(summary, '');
  const result = runInBash(script, runnerEnv(scratch, summary), bash);
  assert.equal(result.code, 0, `generation step should pass on the real artifact:\n${result.out}`);
  const summaryText = readFileSync(summary, 'utf8');
  assert.match(summaryText, /fingerprint: [0-9a-f]{64}/u, 'the summary must carry the staging fingerprint');
  assert.match(summaryText, /policy \(\d+ chars\): default-src/u, 'the summary must carry the policy text');
  // The generator does NOT print a policy sha256 or a total staged-file count; those are derived at
  // acceptance time from the published policy. Assert the absence so the receipt cannot claim them.
  assert.doesNotMatch(summaryText, /policy sha256/iu);
  assert.doesNotMatch(summaryText, /staged file count/iu);
});

test('the publish step records the release commit SHA only after a successful push', () => {
  const { steps } = readWorkflowSteps();
  const step = steps.find((entry) => entry.name === 'Publish changed artifact with quota guard');
  assert.ok(step);
  const block = step.lines.join('\n');
  const pushIndex = block.indexOf('git push origin main');
  assert.notEqual(pushIndex, -1, 'the publish step must push');
  // The full SHA (not the 12-char abbreviation used in the commit subject) goes to the summary, and
  // only after the push succeeded, so the record cannot describe a push that never happened.
  assert.match(block, /release_sha=\$\(git rev-parse HEAD\)/u);
  assert.match(block, /echo "Release commit: \$\{release_sha\}" >> "\$GITHUB_STEP_SUMMARY"/u);
  const recordIndex = block.indexOf('release_sha=$(git rev-parse HEAD)');
  assert.ok(recordIndex > pushIndex, 'the release SHA must be captured after the push succeeds');
  assert.doesNotMatch(block, /release_sha=.*\{\{12\}\}/u, 'the recorded SHA must not be abbreviated');
  // A successful push must not be presented as a completed deployment.
  assert.match(block, /EdgeOne build has not been confirmed/u);
});

// ---------------------------------------------------------------------------
// Shell-seam regressions. These exercise the decision function directly with injected runners, so
// they never re-invoke the test runner as a subprocess (no recursion) and never depend on whether
// this machine actually has bash.
// ---------------------------------------------------------------------------

test('resolveBash prefers GF_BASH, then Git Bash on Windows, then the system bash', () => {
  assert.equal(resolveBash({ GF_BASH: '/opt/custom/bash' }, 'linux'), '/opt/custom/bash');
  assert.equal(resolveBash({}, 'win32'), 'C:\\Program Files\\Git\\bin\\bash.exe');
  assert.equal(resolveBash({}, 'linux'), 'bash');
});

test('shellUsable requires a real bash version, not merely successful output', () => {
  assert.equal(shellUsable('/x/bash', () => '5.2.21(1)-release\n'), true);
  assert.equal(shellUsable('/x/bash', () => '   \n'), false, 'empty output is not bash');
  assert.equal(shellUsable('/x/bash', () => 'usage: something-else\n'), false, 'usage text is not a version');
  assert.equal(shellUsable('/x/bash', () => 'zsh 5.9\n'), false, 'another shell is not bash');
  assert.equal(shellUsable('/x/bash', () => { throw new Error('ENOENT'); }), false);
  assert.equal(shellUsable('/x/bash', () => { throw new Error('ETIMEDOUT'); }), false);
});

test('a missing shell fails when GF_REQUIRE_BASH is set, and skips with a reason otherwise', () => {
  const throwing = () => { throw new Error('ENOENT'); };

  const ci = bashGuard({ env: { GF_BASH: '/nope', GF_REQUIRE_BASH: '1' }, run: throwing });
  assert.equal(ci.ok, false);
  assert.equal(ci.mustFail, true, 'CI must not skip the bash-driven cases');
  assert.match(ci.reason, /no usable bash/u);
  assert.match(ci.reason, /\/nope/u, 'the reason must name the candidate that was tried');

  const local = bashGuard({ env: { GF_BASH: '/nope' }, run: throwing });
  assert.equal(local.ok, false);
  assert.equal(local.mustFail, false, 'a local environment without bash may skip explicitly');
  assert.match(local.reason, /no usable bash/u);
});

test('a shell that exists and exits 0 without BASH_VERSION is rejected', () => {
  // `run` succeeds and returns output, but the output is not a bash version string.
  const notBash = () => 'usage: something-else\n';
  assert.equal(shellUsable('/x/not-a-shell', notBash), false);
  const guard = bashGuard({ env: { GF_BASH: '/x/not-a-shell', GF_REQUIRE_BASH: '1' }, run: notBash });
  assert.equal(guard.ok, false);
  assert.equal(guard.mustFail, true);
  assert.match(guard.reason, /BASH_VERSION not reported/u);
});

test('a usable shell is accepted and reported with its candidate path', () => {
  const guard = bashGuard({ env: { GF_BASH: '/bin/bash' }, run: () => '5.2.21\n' });
  assert.deepEqual(guard, { ok: true, candidate: '/bin/bash' });
});
