// Regression for the `--no-fresh` generation gate.
//
// Manual entry point: `node --test tests/csp/generation-gate.test.mjs`.
// Deliberately NOT wired into `check:all` and NOT placed in `tests/unit/`, whose
// `tests/unit/*.test.mjs` glob is executed by `check-all-pr.yml`. Either would be an
// integration into the production check chain, which this working range does not authorize.
//
// The defect this pins down: the accumulation decision used to consult only the ARTIFACT
// fingerprint. When the candidate policy changed but the served artifact did not, the runner kept
// reporting "accumulating onto same-artifact ledger" while the writer's per-key reset dropped the
// other modes' digests — `--no-fresh` then destroyed recorded evidence and still exited 0, with no
// warning at all. The gate must therefore require BOTH fingerprints to match, and an explicit
// refusal (never a silent reset) when either one differs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES,
  checkLedgerCompleteness,
  compareRecordedModes,
  generationRefusal,
  recordedGenerations,
  sameGenerationLedger,
} from './index.mjs';

const ARTIFACT = '04c99d650d2814c6';
const POLICY = 'e61142d2777df172';
const DIGESTS = {
  baseline: 'a'.repeat(64),
  'report-only': 'a'.repeat(64),
  enforce: 'a'.repeat(64),
};

const completeLedger = (overrides = {}) => Object.fromEntries(
  ['index/desktop', 'index/mobile', 'bubble-watch/desktop', 'bubble-watch/mobile'].map((key) => [
    key,
    { __artifactFingerprint: ARTIFACT, __policyFingerprint: POLICY, ...DIGESTS, ...overrides },
  ]),
);

test('a record from the same artifact and the same policy may be accumulated onto', () => {
  assert.equal(sameGenerationLedger(completeLedger(), { artifactFingerprint: ARTIFACT, policyFingerprint: POLICY }), true);
});

test('an empty ledger is not an older generation', () => {
  assert.equal(sameGenerationLedger({}, { artifactFingerprint: ARTIFACT, policyFingerprint: POLICY }), true);
});

test('the policy alone changing is refused (the defect this pins down)', () => {
  // Artifact bytes identical, only the candidate policy moved — the exact case that used to slip
  // through and silently reset the other modes' records.
  const drifted = completeLedger({ __policyFingerprint: 'beefbeefbeefbeef' });
  const expected = { artifactFingerprint: ARTIFACT, policyFingerprint: POLICY };
  assert.equal(sameGenerationLedger(drifted, expected), false);
  const reason = generationRefusal(drifted, expected);
  assert.match(reason, /policy=\[beefbeefbeefbeef\] expected=e61142d2777df172/u);
  assert.doesNotMatch(reason, /artifact=/u);
});

test('the artifact content alone changing is refused', () => {
  const drifted = completeLedger({ __artifactFingerprint: '0000deadbeef0000' });
  const expected = { artifactFingerprint: ARTIFACT, policyFingerprint: POLICY };
  assert.equal(sameGenerationLedger(drifted, expected), false);
  const reason = generationRefusal(drifted, expected);
  assert.match(reason, /artifact=\[0000deadbeef0000\] expected=04c99d650d2814c6/u);
  assert.doesNotMatch(reason, /policy=/u);
});

test('a ledger mixing two artifact generations is refused', () => {
  const ledger = completeLedger();
  ledger['bubble-watch/mobile'] = { ...ledger['bubble-watch/mobile'], __artifactFingerprint: '0000deadbeef0000' };
  assert.equal(sameGenerationLedger(ledger, { artifactFingerprint: ARTIFACT, policyFingerprint: POLICY }), false);
});

test('a ledger mixing two policy generations is refused', () => {
  const ledger = completeLedger();
  ledger['index/mobile'] = { ...ledger['index/mobile'], __policyFingerprint: 'beefbeefbeefbeef' };
  assert.equal(sameGenerationLedger(ledger, { artifactFingerprint: ARTIFACT, policyFingerprint: POLICY }), false);
});

test('recorded generations are collected per fingerprint kind', () => {
  const ledger = completeLedger();
  ledger['index/desktop'].__policyFingerprint = 'beefbeefbeefbeef';
  const { artifacts, policies } = recordedGenerations(ledger);
  assert.deepEqual([...artifacts], [ARTIFACT]);
  assert.deepEqual([...policies].sort(), ['beefbeefbeefbeef', POLICY].sort());
});

test('every mode is represented in the accumulation model', () => {
  // Guards the fixture above from silently drifting away from the runner's own mode list.
  assert.deepEqual(MODES, ['baseline', 'report-only', 'enforce']);
  for (const mode of MODES) assert.equal(typeof completeLedger()[`index/desktop`][mode], 'string');
});

test('cross-mode comparison ignores entries of another generation instead of comparing them', () => {
  const expected = { artifactFingerprint: ARTIFACT, policyFingerprint: POLICY };
  const current = completeLedger();
  assert.deepEqual(compareRecordedModes(current, expected), []);

  // A policy-drifted entry with a divergent digest must NOT be reported as a cross-mode mismatch:
  // it is excluded by generation, and completeness (not this function) is what flags it.
  const drifted = completeLedger();
  drifted['index/desktop'] = {
    ...drifted['index/desktop'],
    __policyFingerprint: 'beefbeefbeefbeef',
    enforce: 'b'.repeat(64),
  };
  assert.deepEqual(compareRecordedModes(drifted, expected), []);

  // Within one generation a divergent digest is still caught.
  const divergent = completeLedger();
  divergent['index/desktop'] = { ...divergent['index/desktop'], enforce: 'b'.repeat(64) };
  const mismatches = compareRecordedModes(divergent, expected);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].key, 'index/desktop');
});

test('completeness still reports the policy-drifted record as incomplete', () => {
  const drifted = completeLedger({ __policyFingerprint: 'beefbeefbeefbeef' });
  const expected = { artifactFingerprint: ARTIFACT, policyFingerprint: POLICY };
  const result = checkLedgerCompleteness(drifted, expected);
  assert.equal(result.complete, false);
  assert.equal(result.problems.length, 4);
  for (const problem of result.problems) assert.match(problem, /recorded for policy beefbeefbeefbeef/u);
});
