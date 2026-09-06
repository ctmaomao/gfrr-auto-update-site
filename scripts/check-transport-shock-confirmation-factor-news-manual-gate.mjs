import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-news-manual-gate.mjs';
const FIXTURE_LEDGER = 'docs/fixtures/transport-shock-confirmation-factor/high-frequency-oil-news-claim-ledger.json';
const FIXTURE_OPERATOR_REVIEW = 'docs/fixtures/transport-shock-confirmation-factor/news-operator-review-ready.json';

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
    'operatorReviewApplied',
    'rawRuleBlockers',
    'noHeadlineTextOutput',
    'noScoreWrite',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `News manual gate script missing required marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE_LEDGER)), 'News claim-ledger fixture is missing.');
  assert(fs.existsSync(absolute(FIXTURE_OPERATOR_REVIEW)), 'News operator-review fixture is missing.');
  const ledger = JSON.parse(readText(FIXTURE_LEDGER));
  const operatorReview = JSON.parse(readText(FIXTURE_OPERATOR_REVIEW));
  assert(ledger.reviewVersion === 'oil-news-claim-ledger-p52', 'Fixture claim-ledger schema mismatch.');
  assert(ledger.contradiction.state === 'mixed_claims', 'Fixture must exercise mixed-claims blocker.');
  assert(ledger.summary.lowConfidenceHighClaimCount > 0, 'Fixture must exercise low-confidence high-claim blocker.');
  assert(ledger.displayReadiness.directHeadlineDisplayAllowed === false, 'Fixture must keep headline display disabled.');
  assert(operatorReview.schemaVersion === 'transport-shock-confirmation-factor-news-operator-review-v1', 'Operator review fixture schema mismatch.');
  assert(operatorReview.reviewFindings.approvedForCrossConfirmation === true, 'Operator review fixture must approve cross-confirmation review.');
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

function assertOperatorReviewClearsOnlyManualReviewBlockers() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--claim-ledger',
    FIXTURE_LEDGER,
    '--operator-review',
    FIXTURE_OPERATOR_REVIEW,
    '--min-samples',
    '2',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-news-manual-gate-v1', 'Unexpected schemaVersion.');
  assert(review.status === 'news_manual_gate_clear_for_cross_confirmation_review_no_score_write', 'Operator review should clear fixture gate.');
  assert(review.gateClear === true, 'Operator review should clear gate.');
  assert(review.operatorReviewApplied === true, 'Operator review should be applied.');
  assert(review.manualReviewBlockers.length === 0, 'Operator review should clear manual-review blockers.');
  assert(review.rawRuleBlockers.includes('mixed_claims_require_manual_review'), 'Raw mixed-claims blocker should remain visible.');
  assert(review.rawRuleBlockers.includes('low_confidence_high_claims_require_primary_source_review'), 'Raw source-tier blocker should remain visible.');
  assert(review.gateDecision.claimDirectionStability === 'operator_review_pass', 'Expected operator-reviewed direction stability.');
  assert(review.gateDecision.sourceTierRisk === 'operator_review_pass', 'Expected operator-reviewed source-tier risk.');
  assert(review.operatorReview.approvedForCrossConfirmation === true, 'Expected operator review approval evidence.');
  assert(review.scoreWriteApproved === false, 'Operator review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Operator review must not approve production write.');
  assert(review.frontendDisplayApproved === false, 'Operator review must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'Operator review must not approve main-score eligibility.');
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
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
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
  assert(backlog.includes('Transport Shock Confirmation Factor news manual gate'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing news manual gate marker.');
  assert(agents.includes('Transport Shock Confirmation Factor news manual gate'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing news manual gate boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-news-manual-gate'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-news-manual-gate'], 'package.json missing checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-news-manual-gate'), 'check-suite missing news manual gate check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertGateOutput();
  assertOperatorReviewClearsOnlyManualReviewBlockers();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor news manual gate: PASS');
}

main();
