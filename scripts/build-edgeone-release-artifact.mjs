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
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INLINE_HASH_SOURCE_FILES,
  REPORT_ONLY_HEADER,
  buildEdgeoneJson,
  deriveExpectedHashSources,
  isEnforcedCspHeaderName,
  isReportOnlyCspHeaderName,
  validateCspConfig,
  walkFiles,
} from './lib/edgeone-csp-policy.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_ARTIFACT_DIR = resolve(REPO_ROOT, '_site');
export const DEFAULT_CONFIG_PATH = resolve(REPO_ROOT, 'config', 'edgeone', 'csp-report-only.json');
/** Pages whose inline blocks supply the hashes. Owned by the shared policy module. */
export const HASH_SOURCE_PAGES = INLINE_HASH_SOURCE_FILES;
const PROTECTED_DIRECTORIES = ['config', 'scripts', 'tests', '.git', '.github', 'data', 'assets'];

export function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Resolves an existing ancestor chain so a symlinked or junctioned alias cannot be used to reach a
 * protected location: `link/to/repo/scripts` must be refused just like the real path.
 */
export function resolveThroughExistingAncestors(target) {
  let current = resolve(target);
  const missing = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(current.slice(parent.length).replace(/^[\\/]+/u, ''));
    current = parent;
  }
  let real;
  try {
    real = realpathSync(current);
  } catch {
    real = current;
  }
  return missing.length ? resolve(real, ...missing) : real;
}

export function assertSafeOutDir(outDir, { artifactDir }) {
  const fail = (message) => { throw new Error(`refusing --out-dir: ${message}`); };
  if (typeof outDir !== 'string' || !outDir.trim()) fail('a value is required');
  const requested = resolve(outDir);
  const target = resolveThroughExistingAncestors(requested);
  if (target === resolve(target, sep)) fail('the filesystem root is not a valid target');
  if (target === REPO_ROOT) fail('the repository root is not a valid target');
  if (isInside(requested, REPO_ROOT)) fail('the repository must not live inside the target directory');
  for (const directory of PROTECTED_DIRECTORIES) {
    const protectedPath = resolve(REPO_ROOT, directory);
    for (const candidate of new Set([requested, target])) {
      if (candidate === protectedPath || isInside(protectedPath, candidate)) {
        fail(`"${directory}" is a protected repository directory`);
      }
    }
  }
  const artifact = resolve(artifactDir);
  for (const candidate of new Set([requested, target])) {
    if (isInside(candidate, artifact) || isInside(artifact, candidate)) {
      fail('the target must not overlap the input artifact directory in either direction');
    }
  }
  return requested;
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

/** Recursively rejects symlinks (and junctions) anywhere in a tree. */
export function assertNoSymlinks(directory, label) {
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) {
        throw new Error(`${label} contains a symbolic link: ${path}`);
      }
      if (entry.isDirectory()) walk(path);
    }
  };
  walk(resolve(directory));
}

/** root-relative path -> byte size, for every regular file in the tree. */
export function fileInventory(directory) {
  const root = resolve(directory);
  const inventory = new Map();
  for (const file of walkFiles(root)) inventory.set(file, statSync(resolve(root, file)).size);
  return inventory;
}

/**
 * Validates the final staging tree against the artifact it was copied from:
 *   - no symlinks anywhere, in the input OR the final tree;
 *   - the final tree is exactly the artifact's inventory plus `edgeone.json`;
 *   - every copied file is byte-identical (same size and same content hash).
 */
export function validateStagingTree(stagingDir, { artifactDir }) {
  const target = resolve(stagingDir);
  const source = resolve(artifactDir);
  assertNoSymlinks(source, 'input artifact');
  assertNoSymlinks(target, 'staging tree');

  const input = fileInventory(source);
  const staged = new Set(walkFiles(target).map((file) => file.replace(/^edgeone\.json$/u, 'edgeone.json')));
  const problems = [];

  for (const [file, size] of input) {
    if (!staged.has(file)) { problems.push(`missing from staging: ${file}`); continue; }
    const path = resolve(target, file);
    const stagedSize = statSync(path).size;
    if (stagedSize !== size) { problems.push(`size mismatch for ${file} (${stagedSize} != ${size})`); continue; }
    const a = createHash('sha256').update(readFileSync(resolve(source, file))).digest('hex');
    const b = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (a !== b) problems.push(`content mismatch for ${file}`);
  }
  for (const file of staged) {
    if (file === 'edgeone.json') continue;
    if (!input.has(file)) problems.push(`unexpected file in staging: ${file}`);
  }
  if (!staged.has('edgeone.json')) problems.push('missing edgeone.json in staging');
  if (problems.length) throw new Error(`staging tree validation failed: ${problems.join('; ')}`);
  return { fileCount: input.size, files: [...input.keys()] };
}

export function fingerprintDirectory(directory) {
  const hash = createHash('sha256');
  const root = resolve(directory);
  for (const file of walkFiles(root)) {
    hash.update(`path:${file}\u0000`);
    hash.update(readFileSync(resolve(root, file)));
    hash.update('\u0000');
  }
  return hash.digest('hex');
}

/** Builds the exact document the configuration requires for a given tree, or throws. */
export function expectedDocumentFor(stagingDir, config) {
  if (!config.enabled) return { json: { headers: [] }, state: 'disabled', policy: null };
  const { pages } = deriveExpectedHashSources(stagingDir);
  return buildEdgeoneJson({ config, pages });
}

export function buildStagingDirectory({ outDir, artifactDir = DEFAULT_ARTIFACT_DIR, configPath = DEFAULT_CONFIG_PATH, force = false }) {
  const target = assertSafeOutDir(outDir, { artifactDir });
  if (!existsSync(artifactDir)) throw new Error(`artifact directory does not exist: ${artifactDir}`);
  assertNoSymlinks(artifactDir, 'input artifact');
  assertTargetIsReplaceable(target, { force });

  const config = validateCspConfig(JSON.parse(readFileSync(configPath, 'utf8')));

  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(resolve(artifactDir), target, { recursive: true });

  // The published object has to be the verified object, so the document is generated from the
  // FINAL staged pages and then verified against them.
  const { json, state, policy } = expectedDocumentFor(target, config);
  writeFileSync(resolve(target, 'edgeone.json'), `${JSON.stringify(json, null, 2)}\n`);

  const tree = validateStagingTree(target, { artifactDir });
  return { stagingDir: target, state, policy, tree, fingerprint: fingerprintDirectory(target) };
}

/**
 * Validates an existing staging directory by REGENERATING the expected document from the
 * configuration and the pages in that directory, then comparing structure and policy in full.
 * Comparing hashes alone would accept a document whose other directives were rewritten.
 */
export function checkStagingDirectory({ stagingDir, configPath = DEFAULT_CONFIG_PATH }) {
  const target = resolve(stagingDir);
  if (!existsSync(target)) throw new Error(`staging directory does not exist: ${target}`);
  const config = validateCspConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  assertNoSymlinks(target, 'staging tree');
  const problems = [];

  const documentPath = resolve(target, 'edgeone.json');
  if (!existsSync(documentPath)) return { ok: false, state: config.enabled ? 'enabled' : 'disabled', problems: ['edgeone.json is missing'], fingerprint: null };
  const document = JSON.parse(readFileSync(documentPath, 'utf8'));

  let expected;
  try {
    expected = expectedDocumentFor(target, config);
  } catch (error) {
    return { ok: false, state: config.enabled ? 'enabled' : 'disabled', problems: [`cannot derive the expected document: ${error.message}`], fingerprint: fingerprintDirectory(target) };
  }

  const rules = Array.isArray(document.headers) ? document.headers : null;
  if (!rules) problems.push('edgeone.json has no headers array');
  const allHeaders = (rules ?? []).flatMap((rule) => rule.headers ?? []);
  for (const header of allHeaders) {
    if (isEnforcedCspHeaderName(header.key)) problems.push(`document carries an enforced ${header.key} header`);
  }
  const reportOnly = allHeaders.filter((header) => isReportOnlyCspHeaderName(header.key));
  if (reportOnly.length > 1) problems.push(`document carries ${reportOnly.length} Report-Only header entries`);

  if (!config.enabled) {
    if (reportOnly.length) problems.push('configuration is disabled but the document carries a CSP header rule');
    return { ok: problems.length === 0, state: 'disabled', problems, fingerprint: fingerprintDirectory(target) };
  }
  if (rules && JSON.stringify(document) !== JSON.stringify(expected.json)) {
    problems.push('document differs from the document regenerated from this configuration and these pages');
  }
  if (reportOnly.length !== 1) problems.push(`expected exactly one Report-Only header entry, found ${reportOnly.length}`);
  const policy = reportOnly[0]?.value ?? '';
  if (policy && JSON.stringify(policy) !== JSON.stringify(expected.policy)) {
    problems.push('policy text differs from the regenerated policy');
  }
  return {
    ok: problems.length === 0,
    state: 'enabled',
    problems,
    policy: expected.policy,
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
      console.log(`  hashes derived from: ${HASH_SOURCE_PAGES.join(', ')} (${result.tree.fileCount} artifact files copied)`);
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
