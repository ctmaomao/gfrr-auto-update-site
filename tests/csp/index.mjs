// Manual entry point for the isolated CSP verification.
//
//   node tests/csp/index.mjs                 — baseline, report-only, then enforce (fresh)
//   node tests/csp/index.mjs enforce         — re-check one mode against earlier recordings
//   node tests/csp/index.mjs --verify-only   — rebuild, then judge the recorded digests
//
// `--verify-only` IS NOT A READ-ONLY COMMAND. It still rebuilds `_site` through
// `build:pages-artifact` (an ignored artifact write) so the fingerprint it judges against comes
// from the same build procedure; what it skips is the browser run and the ledger reset. What it
// judges is DIGEST SUMMARY ONLY — completeness and cross-mode consistency of the recorded body
// digests. It does NOT re-confirm that the violation, page-error or layout assertions passed, so it
// can never stand in for browser acceptance. Its verdict is printed next to an explicit `caveat`
// field precisely so "summary complete and consistent" is not read as "browser run passed".
//
// Primary evidence for review is a complete fresh browser run against the final file versions.
// Its "same artifact and policy" states only that those two fingerprints match: fixtures and the
// verification code are outside both, so records can be reused across verification-code
// generations when a non-policy-contributing fixture or an assertion changed.
//
// Negative controls: the completeness check is exercised with `completeness-probe.cjs`, loaded
// only via `NODE_OPTIONS=--require` (setting the variables alone does nothing) — see the
// "negative controls" section in docs/PROJECT_BACKLOG.md for the exact commands, including the
// ledger backup/restore steps.
//
// Scope of the artifact fingerprint: the served `_site` tree only. The fixtures under
// `tests/csp/fixtures/` and the verification code itself are served by the CSP server but are not
// part of the fingerprint; editing a fixture changes the policy (its hash) but not the artifact
// fingerprint.
//
// `--fresh` (the default for a full run) clears previous evidence. A single-mode rerun keeps the
// ledger and is compared against the modes recorded earlier, guarded by the artifact-content and
// candidate-policy fingerprints so a changed artifact can never be compared across.
//
// Cross-platform on purpose: the repository has no cross-env-style dependency and no npm script
// can export several environment variables portably. Every child-process argument is an absolute
// path and every path is anchored to this file, so the run does not depend on the invoking
// working directory and always verifies a freshly built artifact.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeArtifactFingerprint } from './artifact.mjs';
import { buildCandidate } from './policy.mjs';

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
export const ARTIFACT_ROOT = resolve(REPO_ROOT, '_site');
export const FIXTURE_ROOT = resolve(import.meta.dirname, 'fixtures');
export const FINDINGS_DIR = resolve(REPO_ROOT, 'test-results', 'csp-findings');
const PLAYWRIGHT_CLI = resolve(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const CSP_CONFIG = resolve(import.meta.dirname, 'playwright.csp.config.mjs');

export const MODES = ['baseline', 'report-only', 'enforce'];

/** Derives the single candidate policy from the current artifact and the fixtures. */
export function loadCandidate() {
  return buildCandidate({ artifactRoot: ARTIFACT_ROOT, fixtureRoot: FIXTURE_ROOT });
}

/** Rebuilds `_site` and hard-fails when the artifact is missing or incomplete. */
export function buildArtifact() {
  const build = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts', 'build-pages-artifact.mjs')], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (build.status !== 0) throw new Error(`build:pages-artifact failed with exit code ${build.status}`);
  for (const required of ['index.html', 'bubble-watch.html', 'scripts/app.js', 'scripts/modules/config.js']) {
    if (!existsSync(resolve(ARTIFACT_ROOT, required))) {
      throw new Error(`artifact is missing ${required}; the verification would not test the shipped pages`);
    }
  }
  return ARTIFACT_ROOT;
}

function runMode(mode, { port, policy, fresh, artifactFingerprint, policyFingerprint }) {
  // One policy, two header names: only `GF_CSP_MODE` differs between report-only and enforce.
  console.log(`\n[csp] ===== mode: ${mode} (policy length: ${policy.length}) =====`);
  const completed = spawnSync(process.execPath, [PLAYWRIGHT_CLI, 'test', '--config', CSP_CONFIG], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      GF_CSP_MODE: mode === 'baseline' ? '' : mode,
      GF_CSP_POLICY: policy,
      GF_CSP_PORT: String(port),
      GF_ARTIFACT_ROOT: ARTIFACT_ROOT,
      GF_FIXTURE_ROOT: FIXTURE_ROOT,
      GF_REPO_ROOT: REPO_ROOT,
      GF_FINDINGS_DIR: FINDINGS_DIR,
      GF_FRESH: fresh ? '1' : '',
      GF_ARTIFACT_FINGERPRINT: artifactFingerprint,
      GF_POLICY_FINGERPRINT: policyFingerprint,
    },
  });
  return { mode, exitCode: completed.status, failedToStart: completed.error ? String(completed.error) : null };
}

function readDigestLedger() {
  try {
    return JSON.parse(readFileSync(resolve(FINDINGS_DIR, 'body-digests.json'), 'utf8'));
  } catch {
    return {};
  }
}

export const MODE_NAMES = ['baseline', 'report-only', 'enforce'];

/** The four page/viewport combinations the evidence must cover, in recorded-key form. */
export function expectedLedgerKeys() {
  return [
    'index/desktop',
    'index/mobile',
    'bubble-watch/desktop',
    'bubble-watch/mobile',
  ];
}

/**
 * Checks the ledger for complete, same-generation evidence.
 *
 * Returns which keys/modes are missing so an empty ledger, a missing page or a missing mode can
 * never be read as "no difference". `complete` requires all four keys, all three modes and
 * non-empty digests under the same artifact and policy fingerprints.
 */
export function checkLedgerCompleteness(ledger, expected) {
  const expectedKeys = expectedLedgerKeys();
  const problems = [];
  const keys = Object.keys(ledger);
  for (const key of expectedKeys) {
    const entry = ledger[key];
    if (!entry) {
      problems.push(`${key}: missing entirely`);
      continue;
    }
    if (entry.__artifactFingerprint !== expected.artifactFingerprint) {
      problems.push(`${key}: recorded for artifact ${entry.__artifactFingerprint ?? 'none'}, expected ${expected.artifactFingerprint}`);
      continue;
    }
    if (entry.__policyFingerprint !== expected.policyFingerprint) {
      problems.push(`${key}: recorded for policy ${entry.__policyFingerprint ?? 'none'}, expected ${expected.policyFingerprint}`);
      continue;
    }
    for (const mode of MODE_NAMES) {
      const digest = entry[mode];
      if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/u.test(digest)) problems.push(`${key}: missing/invalid ${mode} digest`);
    }
  }
  for (const key of keys) {
    if (!expectedKeys.includes(key)) problems.push(`${key}: unexpected key`);
  }
  return { complete: problems.length === 0, problems, keys, expectedKeys };
}

/** Distinct fingerprints recorded in a ledger, used to detect an older generation. */
export function recordedGenerations(ledger) {
  const artifacts = new Set();
  const policies = new Set();
  for (const entry of Object.values(ledger)) {
    if (entry.__artifactFingerprint) artifacts.add(entry.__artifactFingerprint);
    if (entry.__policyFingerprint) policies.add(entry.__policyFingerprint);
  }
  return { artifacts, policies };
}

/**
 * True when every recorded entry belongs to the current generation, i.e. was produced from these
 * exact artifact bytes AND this exact candidate policy.
 *
 * Both fingerprints must be checked. Checking only the artifact one let a policy change pass: the
 * runner reported "accumulating onto same-artifact ledger" while the writer's per-key reset
 * silently dropped the other modes' digests, so `--no-fresh` destroyed evidence and still exited 0.
 */
export function sameGenerationLedger(ledger, expected) {
  const { artifacts, policies } = recordedGenerations(ledger);
  if (artifacts.size === 0 && policies.size === 0) return true;
  return artifacts.size === 1 && artifacts.has(expected.artifactFingerprint)
    && policies.size === 1 && policies.has(expected.policyFingerprint);
}

/** Human-readable reason an existing ledger belongs to a different generation. */
export function generationRefusal(ledger, expected) {
  const { artifacts, policies } = recordedGenerations(ledger);
  const parts = [];
  if (!(artifacts.size === 1 && artifacts.has(expected.artifactFingerprint))) {
    parts.push(`artifact=[${[...artifacts].join(', ') || 'none'}] expected=${expected.artifactFingerprint}`);
  }
  if (!(policies.size === 1 && policies.has(expected.policyFingerprint))) {
    parts.push(`policy=[${[...policies].join(', ') || 'none'}] expected=${expected.policyFingerprint}`);
  }
  return parts.join('; ');
}

/** Compares the modes recorded under the current generation; empty when only one mode ran. */
export function compareRecordedModes(ledger, expected) {
  const mismatches = [];
  for (const [key, entry] of Object.entries(ledger)) {
    if (entry.__artifactFingerprint !== expected.artifactFingerprint) continue;
    if (entry.__policyFingerprint !== expected.policyFingerprint) continue;
    const entries = MODE_NAMES.filter((mode) => typeof entry[mode] === 'string').map((mode) => [mode, entry[mode]]);
    const digests = new Set(entries.map(([, digest]) => digest));
    if (digests.size <= 1) continue;
    mismatches.push({ key, recorded: Object.fromEntries(entries) });
  }
  return mismatches;
}

async function main() {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const verifyOnly = process.argv.includes('--verify-only');
  const fresh = !process.argv.includes('--no-fresh') && !verifyOnly;
  const requested = positional[0];
  if (requested && !MODES.includes(requested)) {
    console.error(`Unknown mode "${requested}". Expected one of: ${MODES.join(', ')}`);
    process.exit(2);
  }
  if (!fresh && !requested && !verifyOnly) {
    console.error('Refusing to run every mode with --no-fresh; pass a single mode or --verify-only.');
    process.exit(2);
  }
  const port = process.env.GF_CSP_PORT || '4319';

  // `--verify-only` still rebuilds the artifact — a real (ignored) `_site` write — so the
  // fingerprint it judges against is produced by the same build procedure as the run it checks.
  // The rebuild happens BEFORE the ledger is read: if the artifact bytes no longer match the
  // recorded generation, the judgement below reports the mismatch instead of hiding it.
  buildArtifact();
  if (fresh && !verifyOnly) rmSync(FINDINGS_DIR, { recursive: true, force: true });
  mkdirSync(FINDINGS_DIR, { recursive: true });

  const candidate = loadCandidate();
  const policyFingerprint = createHash('sha256').update(candidate.policy).digest('hex').slice(0, 16);
  // Content fingerprint of the served artifact. The policy hash alone would not change when an
  // external script, stylesheet, entry HTML or JSON changes, so a `--no-fresh` rerun needs this
  // to refuse comparing across artifact versions.
  const artifact = computeArtifactFingerprint(ARTIFACT_ROOT);
  const expected = { artifactFingerprint: artifact.fingerprint, policyFingerprint };
  // A mode is only an acceptable baseline for accumulation when it was recorded against the very
  // same artifact bytes AND the same candidate policy; otherwise a stale run's ledger must not be
  // reused at all. Both are required — see `sameGenerationLedger`.
  const ledgerBefore = readDigestLedger();
  const before = checkLedgerCompleteness(ledgerBefore, expected);
  const sameGeneration = sameGenerationLedger(ledgerBefore, expected);
  const accumulate = !fresh && requested && sameGeneration;

  console.log('[csp] artifact:', ARTIFACT_ROOT);
  console.log(`[csp] artifact fingerprint: ${artifact.fingerprint} (${artifact.fileCount} served files)`);
  console.log(`[csp] policy fingerprint: ${policyFingerprint}`);
  if (!fresh && !sameGeneration && !verifyOnly) {
    console.warn(`[csp] existing ledger belongs to a different generation (${generationRefusal(ledgerBefore, expected)}); `
      + 'refusing to accumulate — run a complete fresh verification instead.');
  }
  if (verifyOnly) {
    console.log('[csp] run kind: verify-only (rebuilt _site; no browser, ledger kept)');
  } else {
    console.log(`[csp] run kind: ${requested ? `partial (${requested})` : 'complete (baseline + report-only + enforce)'}`
      + `${accumulate ? ', accumulating onto same-generation ledger' : ', fresh evidence set'}`);
  }
  console.log('[csp] derived hashes');
  console.log(JSON.stringify({ scriptHashes: candidate.scriptHashes, styleHashes: candidate.styleHashes }, null, 2));
  console.log(`[csp] candidate policy (${candidate.policy.length} chars)`);
  console.log(candidate.policy);
  // In `--verify-only` the recorded manifest is left untouched, so judging evidence never
  // rewrites the fingerprints it is judging against.
  if (!verifyOnly) {
    writeFileSync(resolve(FINDINGS_DIR, 'candidate-policy.json'), `${JSON.stringify({
      artifactRoot: ARTIFACT_ROOT,
      artifactFingerprint: artifact.fingerprint,
      artifactFileCount: artifact.fileCount,
      policyFingerprint,
      policy: candidate.policy,
      policyWithoutFonts: candidate.policyWithoutFonts,
      scriptHashes: candidate.scriptHashes,
      styleHashes: candidate.styleHashes,
    }, null, 2)}\n`);
  }

  const artifactChanged = !sameGeneration && !fresh;

  // `--verify-only` judges the evidence already on disk — no browser, no ledger reset. This is
  // also the only way the completeness requirement can be exercised: a full run clears the
  // ledger first by design, so its own judgement can never see a partial set.
  if (verifyOnly) {
    const partial = Boolean(requested);
    const completenessOnly = checkLedgerCompleteness(ledgerBefore, expected);
    const mismatchOnly = compareRecordedModes(ledgerBefore, expected);
    if (mismatchOnly.length > 0) console.error(`[csp] cross-mode body mismatch: ${JSON.stringify(mismatchOnly, null, 2)}`);
    if (!completenessOnly.complete) console.error(`[csp] evidence incomplete: ${JSON.stringify(completenessOnly.problems, null, 2)}`);
    console.log('[csp] verification of recorded evidence');
    console.log(JSON.stringify({
      kind: partial
        ? (completenessOnly.complete ? `partial (${requested}) — all modes present from earlier runs` : `partial (${requested}) — not a complete verification`)
        : (completenessOnly.complete ? 'complete — 4 keys × 3 modes, same artifact and policy' : 'incomplete'),
      caveat: 'This verdict covers DIGEST SUMMARY ONLY: the recorded per-mode body digests are '
        + 'complete and mutually consistent, bound to the stated artifact and policy fingerprints. '
        + 'It is NOT browser acceptance and does not re-confirm that the violation, page-error or '
        + 'layout assertions passed, nor that these digests came from the same verification-code or '
        + 'fixture versions (both are outside the fingerprints). Primary evidence for review is a '
        + 'complete fresh browser run.',
      artifactFingerprint: artifact.fingerprint,
      policyFingerprint,
      recordedKeys: completenessOnly.keys,
      crossModeMismatches: mismatchOnly.length,
      completenessProblems: completenessOnly.problems,
    }, null, 2));
    process.exit(completenessOnly.complete && mismatchOnly.length === 0 ? 0 : 1);
  }

  const results = [];
  for (const mode of (requested ? [requested] : MODES)) {
    results.push(runMode(mode, {
      port,
      policy: mode === 'baseline' ? '' : candidate.policy,
      fresh: accumulate ? false : true,
      artifactFingerprint: artifact.fingerprint,
      policyFingerprint,
    }));
  }

  // Two independent runner-side checks, so neither cross-mode divergence nor missing evidence can
  // be read as success when a spec assertion were skipped:
  //   1. every recorded mode under this generation must agree on the rendered body;
  //   2. a complete run must have all four page/viewport keys with all three valid digests.
  const ledgerAfter = readDigestLedger();
  const mismatches = compareRecordedModes(ledgerAfter, expected);
  if (mismatches.length > 0) console.error(`[csp] cross-mode body mismatch: ${JSON.stringify(mismatches, null, 2)}`);

  const completeness = checkLedgerCompleteness(ledgerAfter, expected);
  const partialRun = Boolean(requested);
  if (!completeness.complete && !partialRun) {
    console.error(`[csp] evidence incomplete: ${JSON.stringify(completeness.problems, null, 2)}`);
  } else if (partialRun && !completeness.complete) {
    console.warn(`[csp] partial verification: ${requested} only; outstanding evidence: ${JSON.stringify(completeness.problems)}`);
  }

  // A partial run can only be a re-check of the SAME generation. Requesting `--no-fresh <mode>`
  // against an older generation must fail rather than quietly rewriting the ledger, so the
  // refusal cannot be mistaken for a successful accumulation.
  const generationRefused = Boolean(requested) && !fresh && !sameGeneration;
  if (generationRefused) {
    console.error('[csp] --no-fresh refused: the recorded evidence belongs to a different generation '
      + `(${generationRefusal(ledgerBefore, expected)}). Run a complete fresh verification.`);
  }

  const failed = results.some((entry) => entry.exitCode !== 0) || mismatches.length > 0
    || (!partialRun && !completeness.complete) || artifactChanged || generationRefused;
  console.log('\n[csp] run summary');
  console.log(JSON.stringify({
    verification: generationRefused
      ? `refused (${requested}) — recorded evidence is from a different generation`
      : (partialRun
        ? (completeness.complete ? `partial (${requested}) — all modes present from earlier runs` : `partial (${requested}) — not a complete verification`)
        : (completeness.complete ? 'complete — 4 keys × 3 modes, same artifact and policy' : 'incomplete')),
    artifactFingerprint: artifact.fingerprint,
    policyFingerprint,
    staleGenerationRejected: !fresh && !sameGeneration,
    crossModeMismatches: mismatches.length,
    completenessProblems: completeness.problems,
    modes: results,
  }, null, 2));
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
