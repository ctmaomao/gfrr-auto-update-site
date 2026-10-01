#!/usr/bin/env node
// Builds the EdgeOne release staging directory: a copy of the validated Pages artifact plus the
// generated `edgeone.json`.
//
// Why a separate directory: the shared Pages artifact must stay exactly the shared Pages artifact.
// Adding the EdgeOne config there would change what GitHub Pages also publishes, so the config is
// injected into a staging tree that is synced as a whole instead.
//
// Local use requires an explicit `--out-dir` (or `--from-env` with `EDGEONE_STAGING_DIR`), because
// the generator clears its target directory. The path rules below refuse the filesystem root, the
// repository root, protected repository directories, any overlap with the input artifact in either
// direction, and an existing non-empty target that was not explicitly confirmed with `--force`.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPORT_ONLY_HEADER,
  buildEdgeoneJson,
  derivePageHashes,
  parsePolicy,
  validateCspConfig,
  validatePolicyHashesAgainstPages,
} from './lib/edgeone-csp-policy.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_ARTIFACT_DIR = resolve(REPO_ROOT, '_site');
export const DEFAULT_CONFIG_PATH = resolve(REPO_ROOT, 'config', 'edgeone', 'csp-report-only.json');
/** Pages whose inline blocks supply the hashes. Keep in sync with the published entry points. */
export const HASH_SOURCE_PAGES = ['bubble-watch.html'];
const PROTECTED_DIRECTORIES = ['config', 'scripts', 'tests', '.git', '.github', 'data', 'assets'];

export function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function assertSafeOutDir(outDir, { artifactDir }) {
  const fail = (message) => { throw new Error(`refusing --out-dir: ${message}`); };
  if (typeof outDir !== 'string' || !outDir.trim()) fail('a value is required');
  const target = resolve(outDir);
  if (target === resolve(target, sep)) fail('the filesystem root is not a valid target');
  if (target === REPO_ROOT) fail('the repository root is not a valid target');
  for (const directory of PROTECTED_DIRECTORIES) {
    const protectedPath = resolve(REPO_ROOT, directory);
    if (target === protectedPath || isInside(protectedPath, target)) {
      fail(`"${directory}" is a protected repository directory`);
    }
  }
  const artifact = resolve(artifactDir);
  if (isInside(target, artifact) || isInside(artifact, target)) {
    fail('the target must not overlap the input artifact directory in either direction');
  }
  return target;
}

function assertTargetIsReplaceable(target, { force }) {
  if (!existsSync(target)) return;
  if (!lstatSync(target).isDirectory()) throw new Error(`refusing to replace a non-directory target: ${target}`);
  const existing = readdirSync(target);
  if (existing.length && !force) {
    throw new Error(
      `refusing to clear existing non-empty directory ${target}; pass --force to confirm, `
      + `or choose a different --out-dir`,
    );
  }
}

function validateStagingTree(stagingDir, { artifactDir }) {
  for (const entry of readdirSync(stagingDir, { withFileTypes: true })) {
    const path = resolve(stagingDir, entry.name);
    if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) {
      throw new Error(`staging tree contains a symbolic link: ${path}`);
    }
  }
  const expected = ['edgeone.json', ...readdirSync(artifactDir)];
  const actual = readdirSync(stagingDir).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  if (missing.length) throw new Error(`staging tree is missing: ${missing.join(', ')}`);
  if (extra.length) throw new Error(`staging tree has unexpected top-level entries: ${extra.join(', ')}`);

  // Re-validate against the pages in the FINAL tree, not the source artifact: the object that gets
  // published has to be the object that was verified.
  const pages = HASH_SOURCE_PAGES.map((file) => derivePageHashes(stagingDir, file));
  return pages;
}

export function fingerprintDirectory(directory) {
  const hash = createHash('sha256');
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        hash.update(`path:${relative(directory, path).split(sep).join('/')}\u0000`);
        hash.update(readFileSync(path));
        hash.update('\u0000');
      }
    }
  };
  walk(resolve(directory));
  return hash.digest('hex');
}

export function buildStagingDirectory({ outDir, artifactDir = DEFAULT_ARTIFACT_DIR, configPath = DEFAULT_CONFIG_PATH, force = false }) {
  const target = assertSafeOutDir(outDir, { artifactDir });
  if (!existsSync(artifactDir)) throw new Error(`artifact directory does not exist: ${artifactDir}`);
  assertTargetIsReplaceable(target, { force });

  const config = validateCspConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  const { json, state, policy } = buildEdgeoneJson({ config, pages: [] });

  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(resolve(artifactDir), target, { recursive: true });

  // Enabled: derive hashes from the staged pages and rebuild so the published object is the
  // verified object. Disabled: emit the valid document with no CSP header rule.
  let finalJson = json;
  let finalPolicy = policy;
  if (config.enabled) {
    const stagedPages = HASH_SOURCE_PAGES.map((file) => derivePageHashes(target, file));
    const built = buildEdgeoneJson({ config, pages: stagedPages });
    finalJson = built.json;
    finalPolicy = built.policy;
    const check = validatePolicyHashesAgainstPages(finalPolicy, stagedPages);
    if (!check.ok) throw new Error(`generated policy failed verification: ${check.problems.join('; ')}`);
  }
  writeFileSync(resolve(target, 'edgeone.json'), `${JSON.stringify(finalJson, null, 2)}\n`);

  const pages = validateStagingTree(target, { artifactDir });
  return { stagingDir: target, state, policy: finalPolicy, pages, fingerprint: fingerprintDirectory(target) };
}

/** Validates an existing staging directory without regenerating it. */
export function checkStagingDirectory({ stagingDir, configPath = DEFAULT_CONFIG_PATH }) {
  const target = resolve(stagingDir);
  if (!existsSync(target)) throw new Error(`staging directory does not exist: ${target}`);
  const config = validateCspConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  const document = JSON.parse(readFileSync(resolve(target, 'edgeone.json'), 'utf8'));
  const rules = Array.isArray(document.headers) ? document.headers : [];
  const problems = [];

  const cspRules = rules.filter((rule) => (rule.headers ?? []).some((header) => header.key === REPORT_ONLY_HEADER));
  if (!config.enabled) {
    if (cspRules.length) problems.push('configuration is disabled but the document carries a CSP header rule');
    if (rules.some((rule) => (rule.headers ?? []).some((header) => header.key === 'Content-Security-Policy'))) {
      problems.push('document carries an enforced Content-Security-Policy header');
    }
    return { ok: problems.length === 0, state: 'disabled', problems, fingerprint: fingerprintDirectory(target) };
  }

  if (cspRules.length !== 1) problems.push(`expected exactly one Report-Only rule, found ${cspRules.length}`);
  const entries = cspRules.flatMap((rule) => (rule.headers ?? []).filter((header) => header.key === REPORT_ONLY_HEADER));
  if (entries.length !== 1) problems.push(`expected exactly one Report-Only header entry, found ${entries.length}`);
  for (const rule of rules) {
    for (const header of rule.headers ?? []) {
      if (header.key === 'Content-Security-Policy') problems.push('document carries an enforced Content-Security-Policy header');
      if (header.key === REPORT_ONLY_HEADER && rule.source !== config.source) {
        problems.push(`Report-Only rule source is "${rule.source}", expected "${config.source}"`);
      }
    }
  }
  const policy = entries[0]?.value ?? '';
  if (!problems.length) {
    try {
      parsePolicy(policy);
    } catch (error) {
      problems.push(`policy is not parseable: ${error.message}`);
    }
    if (policy.length > 1000) problems.push(`policy is ${policy.length} characters, over the 1000 limit`);
    const pages = HASH_SOURCE_PAGES.map((file) => derivePageHashes(target, file));
    const check = validatePolicyHashesAgainstPages(policy, pages);
    problems.push(...check.problems);
  }
  return {
    ok: problems.length === 0,
    state: 'enabled',
    problems,
    policy,
    fingerprint: fingerprintDirectory(target),
  };
}

function parseArgs(argv) {
  const options = { addConfig: false, check: false, fingerprint: false, force: false, fromEnv: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--add-config') options.addConfig = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--fingerprint') options.fingerprint = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--from-env') options.fromEnv = true;
    else if (arg === '--out-dir') options.outDir = argv[++index];
    else if (arg === '--artifact-dir') options.artifactDir = argv[++index];
    else if (arg === '--config') options.configPath = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.addConfig && !options.check) {
    console.error('Nothing to do. Pass --add-config to generate a staging directory, or --check to validate one.');
    process.exit(2);
  }
  let outDir = options.outDir;
  if (!outDir && options.fromEnv) outDir = process.env.EDGEONE_STAGING_DIR;
  if (!outDir) {
    console.error('An explicit target is required: pass --out-dir <path> or --from-env with EDGEONE_STAGING_DIR set.');
    process.exit(2);
  }

  try {
    if (options.check) {
      const result = checkStagingDirectory({ stagingDir: outDir, configPath: options.configPath ?? DEFAULT_CONFIG_PATH });
      console.log(`edgeone staging check: ${result.ok ? 'PASS' : 'FAIL'} (state=${result.state})`);
      console.log(`  fingerprint: ${result.fingerprint}`);
      for (const problem of result.problems) console.error(`  - ${problem}`);
      process.exit(result.ok ? 0 : 1);
    }
    const result = buildStagingDirectory({
      outDir,
      artifactDir: options.artifactDir ? resolve(options.artifactDir) : DEFAULT_ARTIFACT_DIR,
      configPath: options.configPath ? resolve(options.configPath) : DEFAULT_CONFIG_PATH,
      force: options.force,
    });
    console.log(`edgeone staging directory: ${result.stagingDir}`);
    console.log(`  state: ${result.state}`);
    console.log(`  fingerprint: ${result.fingerprint}`);
    if (result.state === 'enabled') {
      console.log(`  header: ${REPORT_ONLY_HEADER}`);
      console.log(`  policy (${result.policy.length} chars): ${result.policy}`);
      console.log(`  hashes derived from: ${HASH_SOURCE_PAGES.join(', ')}`
        + ` (${result.pages.reduce((total, page) => total + page.scriptHashes.length + page.styleHashes.length, 0)} hash sources)`);
    } else {
      console.log('  header: omitted (configuration disabled); wrote a valid edgeone.json with no CSP rule');
    }
    process.exit(0);
  } catch (error) {
    console.error(`edgeone staging build failed: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
