import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-news-operator-review.mjs';
const FIXTURE_LEDGER = 'docs/fixtures/transport-shock-confirmation-factor/news-operator-review-claim-ledger-axis-split.json';

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

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-news-operator-review-v1',
  'review-transport-shock-confirmation-factor-news-operator-review',
  'operator_review_clear_for_cross_confirmation_no_score_write'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'News operator review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of [
    'manual/local delegated operator review',
    'operator_review_clear_for_cross_confirmation_no_score_write',
    'axis_split_reviewed_not_direct_contradiction',
    'downgraded_to_non_confirming_context',
    'noHeadlineTextOutput',
    'noScoreWrite',
    'codex_operator_delegate'
  ]) {
    assert(source.includes(marker), `News operator review script missing required marker: ${marker}`);
  }
  for (const forbidden of [
    'process.env',
    'fetch(',
    'https.request',
    'http.request',
    'axios',
    'node:https',
    'node:http',
    'data/radar-data.json',
    'market.worker-preview.json'
  ]) {
    assert(!source.includes(forbidden), `News operator review script contains forbidden marker: ${forbidden}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE_LEDGER)), 'Operator review ledger fixture missing.');
  const ledger = JSON.parse(readText(FIXTURE_LEDGER));
  assert(ledger.reviewVersion === 'oil-news-claim-ledger-p52', 'Fixture claim-ledger schema mismatch.');
  assert(ledger.contradiction.state === 'mixed_claims', 'Fixture must exercise mixed claims.');
  assert(ledger.summary.lowConfidenceHighClaimCount > 0, 'Fixture must exercise low-confidence high claims.');
}

function assertOperatorReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--claim-ledger',
    FIXTURE_LEDGER,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-news-operator-review-v1', 'Unexpected schemaVersion.');
  assert(review.status === 'operator_review_clear_for_cross_confirmation_no_score_write', 'Expected delegated clear status.');
  assert(review.reviewerType === 'codex_operator_delegate', 'Unexpected reviewerType.');
  assert(review.reviewFindings.approvedForCrossConfirmation === true, 'Expected cross-confirmation approval.');
  assert(review.reviewFindings.mixedClaimsDisposition === 'axis_split_reviewed_not_direct_contradiction', 'Expected axis-split disposition.');
  assert(review.reviewFindings.lowConfidenceHighClaimsDisposition === 'downgraded_to_non_confirming_context', 'Expected low-confidence disposition.');
  assert(review.reviewFindings.doesNotConfirm.includes('hormuz_closure'), 'Review must not confirm closure.');
  assert(review.reviewFindings.doesNotConfirm.includes('oil_price_direction'), 'Review must not confirm oil-price direction.');
  assert(review.approvals.scoreWriteApproved === false, 'Review must not approve score write.');
  assert(review.approvals.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.approvals.eligibleForMainScore === false, 'Review must not approve main-score eligibility.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.boundaries.noHeadlineTextOutput === true, 'Review must lock headline output.');
  assert(!JSON.stringify(review).includes('Hormuz Tanker Traffic'), 'Review must not serialize raw headline text.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains operator review marker and may have been wired too early: ${marker}`);
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
    'review:transport-shock-confirmation-factor-news-operator-review',
    'transport-shock-confirmation-factor-news-operator-review-v1',
    'operator_review_clear_for_cross_confirmation_no_score_write',
    'codex_operator_delegate'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-news-operator-review-v1',
    'approvedForCrossConfirmation',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-news-operator-review-v1'), 'SIGNAL_INTAKE missing operator review marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor news operator review'), 'PROJECT_BACKLOG missing operator review marker.');
  assert(agents.includes('Transport Shock Confirmation Factor news operator review'), 'AGENTS.md missing operator review boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-news-operator-review'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-news-operator-review'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-news-operator-review'), 'check-suite missing operator review check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertOperatorReviewOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor news operator review: PASS');
}

main();
