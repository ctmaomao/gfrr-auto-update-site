import { assertIncludes, runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-runtime-score-policy.mjs';
const SCHEMA_VERSION = 'transport-shock-confirmation-factor-runtime-score-policy-review-v1';
const REVIEW_COMMAND = 'review:transport-shock-confirmation-factor-runtime-score-policy';
const CHECK_COMMAND = 'check:transport-shock-confirmation-factor-runtime-score-policy';

const OUT_OF_SCOPE_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/modules/decision.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js',
  'workers/gfrr-realtime-worker/src/index.js',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/radar-data.json',
  'data/oil-directional-pressure.json'
];

const OUT_OF_SCOPE_MARKERS = [
  SCHEMA_VERSION,
  REVIEW_COMMAND,
  'runtime_score_policy_review_passed_zero_contribution_observed',
  'runtime_score_policy_review_passed_positive_contribution_observed',
  'runtime_score_policy_review_blocked_policy_mismatch'
];

const SCRIPT_FORBIDDEN_MARKERS = [
  'process.env',
  'fetch(',
  'https.request',
  'http.request',
  'axios',
  'node:https',
  'node:http',
  'FIRMS_MAP_KEY',
  'TAVILY_API_KEY',
  'BRAVE_API_KEY'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Runtime score policy review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Runtime score policy review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    SCHEMA_VERSION,
    'post_migration_runtime_score_policy_replay',
    'transport-shock-scoring-impact-v1',
    'macroDrivers.energyTransport.transportShockCandidate',
    'runtimeScoringAuthorized',
    'candidate_not_eligible_zero_contribution',
    'score_ceiling_zero_contribution',
    'owner_approved_free_proxy_transport_pressure_low_weight_applied',
    "import { buildTransportShockScoringImpact } from './run-daily-pipeline.mjs'",
    'scoreExpansionApproved: false',
    'runtimeChangeApproved: false',
    'affectsBubbleWatch: false'
  ]) {
    assert(source.includes(marker), `Runtime score policy review script missing marker: ${marker}`);
  }
}

function assertReviewOutput() {
  const review = JSON.parse(runNode([REVIEW_SCRIPT, '--no-output', '--json']));
  assert(review.schemaVersion === SCHEMA_VERSION, 'Unexpected runtime score policy review schema.');
  assert(
    review.status === 'runtime_score_policy_review_passed_zero_contribution_observed' ||
      review.status === 'runtime_score_policy_review_passed_positive_contribution_observed',
    `Unexpected runtime score policy review status: ${review.status}`
  );
  assert(review.reviewType === 'post_migration_runtime_score_policy_replay', 'Unexpected review type.');
  assert(review.scorePolicyReviewPassed === true, 'Runtime score policy review should pass on production payload.');
  assert(review.blockerCount === 0, 'Runtime score policy review should have no blockers.');
  assert(review.policy.maxContributionPct === 3, 'Policy hard cap must be 3.');
  assert(review.policy.staleAfterDays === 7, 'Policy stale window must be 7 days.');
  assert(review.policy.direction === 'transport_shock_pressure_only', 'Policy direction must be pressure-only.');
  assert(review.policy.thresholds.length === 4, 'Policy thresholds must include 3/2/1/0 buckets.');
  assert(review.policy.thresholds[0].minCandidateScore === 75 && review.policy.thresholds[0].contributionPct === 3, '75+ threshold must map to +3.');
  assert(review.policy.thresholds[1].minCandidateScore === 60 && review.policy.thresholds[1].contributionPct === 2, '60+ threshold must map to +2.');
  assert(review.policy.thresholds[2].minCandidateScore === 50 && review.policy.thresholds[2].contributionPct === 1, '50+ threshold must map to +1.');
  assert(review.currentObservation.reason === review.currentObservation.expectedReason, 'Current reason must match policy replay.');
  assert(review.currentObservation.runtimeScoringAuthorized === true, 'Runtime scoring authorization must be explicit.');
  assert(
    review.currentObservation.scoreAfterTransport === review.currentObservation.expectedScoreAfterTransport,
    'Current scoreAfterTransport must match policy replay.'
  );
  assert(review.currentObservation.contributionPct >= 0 && review.currentObservation.contributionPct <= 3, 'Current contribution must stay 0..3.');
  assert(review.currentObservation.guards.routeFreightConfirmationConnected === false, 'Route freight confirmation must remain disconnected.');
  assert(review.currentObservation.guards.marketConfirmationConnected === false, 'Market confirmation must remain disconnected.');
  assert(review.approvals.scoreExpansionApproved === false, 'Review must not approve score expansion.');
  assert(review.approvals.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.approvals.runtimeChangeApproved === false, 'Review must not approve runtime change.');
  assert(review.productionImpact.modifiesRuntimeScoring === false, 'Review must not modify runtime scoring.');
  assert(review.productionImpact.affectsBubbleWatch === false, 'Review must not affect Bubble Watch.');
}

function assertRuntimeUntouched() {
  for (const relativePath of OUT_OF_SCOPE_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of OUT_OF_SCOPE_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P-score-55 review marker: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const packageJson = JSON.parse(readText('package.json'));
  assert(packageJson.scripts[REVIEW_COMMAND], `package.json missing ${REVIEW_COMMAND}.`);
  assert(packageJson.scripts[CHECK_COMMAND], `package.json missing ${CHECK_COMMAND}.`);
  assert(readText('scripts/check-suite.mjs').includes(CHECK_COMMAND), 'check-suite missing runtime score policy checker.');
  for (const file of ['docs/AGENT_DOMAIN_BOUNDARIES.md', 'docs/DATA_CONTRACT.md', 'docs/DATA_SOURCES.md', 'docs/SIGNAL_INTAKE.md', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md']) {
    assertIncludes(readText(file), SCHEMA_VERSION, file);
    assertIncludes(readText(file), 'P-score-55', file);
  }
}

function main() {
  assertScriptSafety();
  assertReviewOutput();
  assertRuntimeUntouched();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor runtime score policy review: PASS');
}

main();
