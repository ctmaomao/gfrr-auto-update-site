import { runNode } from './lib/check-script-helpers.mjs';
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
  assert(ledger.axisSplit?.state === 'security_risk_vs_supply_flow_split', 'Fixture must exercise reviewed axis split.');
  assert(ledger.axisSplit?.supportsOperatorReview === true, 'Fixture axis split must support operator review.');
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
  assert(review.reviewFindings.eventInterpretation === 'transport_security_risk_elevated_while_supply_flow_deescalates', 'Expected claim-axis interpretation.');
  assert(review.evidence.axisSplit.state === 'security_risk_vs_supply_flow_split', 'Expected axisSplit evidence.');
  assert(review.evidence.axisCounts.transport_security.escalation > 0, 'Expected transport security escalation evidence.');
  assert(review.evidence.claimAxisCounts.supply_flow > 0, 'Expected supply-flow claim-axis evidence.');
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
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
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
  assert(backlog.includes('Transport Shock Confirmation Factor news operator review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing operator review marker.');
  assert(agents.includes('Transport Shock Confirmation Factor news operator review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing operator review boundary.');
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
