import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-news-manual-gate.mjs';
const FIXTURE_LEDGER = 'docs/fixtures/transport-shock-confirmation-factor/high-frequency-oil-news-claim-ledger.json';

const RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'scripts/run-daily-pipeline.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/radar-data.json',
  'data/oil-directional-pressure.json'
];

const SCRIPT_FORBIDDEN_MARKERS = [
  'process.env',
  'fetch(',
  'https.request',
  'http.request',
  'axios',
  'node:https',
  'node:http',
  'market.worker-preview.json',
  'data/radar-data.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-news-manual-gate-v1',
  'review-transport-shock-confirmation-factor-news-manual-gate',
  'news_manual_gate_clear_for_cross_confirmation_review_no_score_write'
];

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout || '');
}

function assertScriptSafety() {
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'News manual gate script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `News manual gate script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'artifact-only Transport Shock news manual gate',
    'news_manual_gate_blocked_keep_manual_review',
    'keep_news_in_manual_review_do_not_use_as_confirmation',
    'mixed_claims_require_manual_review',
    'low_confidence_high_claims_require_primary_source_review',
    'noHeadlineTextOutput',
    'noScoreWrite',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `News manual gate script missing required marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE_LEDGER)), 'News claim-ledger fixture is missing.');
  const ledger = JSON.parse(readText(FIXTURE_LEDGER));
  assert(ledger.reviewVersion === 'oil-news-claim-ledger-p52', 'Fixture claim-ledger schema mismatch.');
  assert(ledger.contradiction.state === 'mixed_claims', 'Fixture must exercise mixed-claims blocker.');
  assert(ledger.summary.lowConfidenceHighClaimCount > 0, 'Fixture must exercise low-confidence high-claim blocker.');
  assert(ledger.displayReadiness.directHeadlineDisplayAllowed === false, 'Fixture must keep headline display disabled.');
}

function assertGateOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--claim-ledger',
    FIXTURE_LEDGER,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-news-manual-gate-v1', 'Unexpected schemaVersion.');
  assert(review.status === 'news_manual_gate_blocked_keep_manual_review', 'Mixed fixture must stay blocked/manual-review.');
  assert(review.recommendation === 'keep_news_in_manual_review_do_not_use_as_confirmation', 'Unexpected recommendation.');
  assert(review.gateClear === false, 'Gate must not clear on mixed fixture.');
  assert(review.manualReviewRequired === true, 'Manual review must be required.');
  assert(review.manualReviewBlockers.includes('mixed_claims_require_manual_review'), 'Expected mixed-claims blocker.');
  assert(review.manualReviewBlockers.includes('low_confidence_high_claims_require_primary_source_review'), 'Expected source-tier blocker.');
  assert(review.gateDecision.sampleSufficiency === 'blocker', 'Default min-samples should block three-sample fixture.');
  assert(review.gateDecision.repeatedElevatedNewsSamples === 'pass', 'Repeated elevated news samples should pass.');
  assert(review.scoreReadinessApproved === false, 'Gate must not approve score readiness.');
  assert(review.scoreWriteApproved === false, 'Gate must not approve score write.');
  assert(review.productionWriteApproved === false, 'Gate must not approve production write.');
  assert(review.frontendDisplayApproved === false, 'Gate must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'Gate must not create main-score eligibility.');
  assert(review.boundaries.noNetworkCall === true, 'Gate must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Gate must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Gate must lock noScoreWrite.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains news manual gate marker and may have been wired too early: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/PROJECT_BACKLOG.md');
  const agents = readText('AGENTS.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'review:transport-shock-confirmation-factor-news-manual-gate',
    'transport-shock-confirmation-factor-news-manual-gate-v1',
    'news_manual_gate_blocked_keep_manual_review',
    'no score write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-news-manual-gate-v1',
    'manualReviewBlockers',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-news-manual-gate-v1'), 'SIGNAL_INTAKE missing news manual gate marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor news manual gate'), 'PROJECT_BACKLOG missing news manual gate marker.');
  assert(agents.includes('Transport Shock Confirmation Factor news manual gate'), 'AGENTS.md missing news manual gate boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-news-manual-gate'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-news-manual-gate'], 'package.json missing checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-news-manual-gate'), 'check-suite missing news manual gate check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertGateOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor news manual gate: PASS');
}

main();
