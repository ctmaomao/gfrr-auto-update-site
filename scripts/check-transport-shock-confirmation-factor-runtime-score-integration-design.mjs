import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-runtime-score-integration-design.mjs';
const READY_INPUT = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-write-design-review-ready.json';
const WRONG_SCHEMA_INPUT = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-replay-ready.json';

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
  'data/radar-data.json',
  'data/oil-directional-pressure.json',
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-runtime-score-integration-design-review-v1',
  'review-transport-shock-confirmation-factor-runtime-score-integration-design',
  'runtime_score_integration_design_ready_no_production_write',
  'transportShockRuntimeScoreIntegration'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Runtime score integration design review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Runtime score integration design script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock runtime score integration design review',
    'runtime_score_integration_design_ready_no_production_write',
    'feature_flag_default_off',
    'hard_cap_three_pct',
    'scoreWriteApproved',
    'runtimeIntegrationApproved',
    'eligibleForMainScore',
    'noRuntimeWiring',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Runtime score integration design script missing required marker: ${marker}`);
  }
}

function assertReadyFixture() {
  assert(fs.existsSync(absolute(READY_INPUT)), 'Ready score-write design review fixture is missing.');
  const fixture = JSON.parse(readText(READY_INPUT));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1', 'Ready input schema mismatch.');
  assert(fixture.status === 'score_write_design_review_ready_no_production_write', 'Ready input status mismatch.');
  assert(fixture.scoreWriteDesignReady === true, 'Ready input scoreWriteDesignReady must be true.');
  assert(fixture.candidateScoreContributionPct === 3, 'Ready input contribution must be 3%.');
  assert(fixture.maxFutureMainScoreContributionPct === 3, 'Ready input cap must be 3%.');
  assert(fixture.historicalBacktestPerformed === false, 'Ready input must not claim historical backtest.');
  assert(fixture.scoreWriteApproved === false, 'Ready input must not approve score write.');
  assert(fixture.scoreIntegrationApproved === false, 'Ready input must not approve score integration.');
  assert(fixture.eligibleForMainScore === false, 'Ready input must not be main-score eligible.');
  assert(fixture.productionImpact.affectsScoring === false, 'Ready input must not affect scoring.');
  assert(fixture.boundaries.noProductionWrite === true, 'Ready input must lock noProductionWrite.');
  assert(fixture.boundaries.noScoreWrite === true, 'Ready input must lock noScoreWrite.');
}

function assertReadyReviewOutput() {
  const review = JSON.parse(runNode([
    REVIEW_SCRIPT,
    '--input',
    READY_INPUT,
    '--no-output',
    '--json'
  ]));
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-runtime-score-integration-design-review-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'runtime_score_integration_design_ready_no_production_write', 'Expected ready runtime design status.');
  assert(review.recommendation === 'separate_review_required_before_any_main_score_write', 'Unexpected ready recommendation.');
  assert(review.runtimeScoreIntegrationDesignReady === true, 'Runtime design should be ready.');
  assert(review.futureRuntimeSourcePath === 'macroDrivers.energyTransport.transportShockCandidate', 'Unexpected future runtime source path.');
  assert(review.futureRuntimeMode === 'disabled_until_separate_reviewed_score_pr', 'Unexpected future runtime mode.');
  assert(review.candidateScoreContributionPct === 3, 'Runtime design candidate contribution must be 3%.');
  assert(review.proposedMaxMainScoreContributionPct === 3, 'Runtime design cap must be 3%.');
  assert(review.scoreWriteApproved === false, 'Runtime design must not approve score write.');
  assert(review.productionWriteApproved === false, 'Runtime design must not approve production write.');
  assert(review.scoreIntegrationApproved === false, 'Runtime design must not approve score integration.');
  assert(review.runtimeIntegrationApproved === false, 'Runtime design must not approve runtime integration.');
  assert(review.mainScoreApproved === false, 'Runtime design must not approve main score.');
  assert(review.eligibleForMainScore === false, 'Runtime design must not be main-score eligible.');
  for (const guard of [
    'feature_flag_default_off',
    'hard_cap_three_pct',
    'zero_contribution_when_candidate_missing_or_not_live',
    'no_effect_on_odp_final_bias_or_brent_promotion'
  ]) {
    assert(review.runtimeGuardsRequired.includes(guard), `Runtime guard missing: ${guard}`);
  }
  assert(review.candidateMappingReview.failClosedWhenMissing === true, 'Candidate mapping must fail closed.');
  assert(review.candidateMappingReview.productionMappingApprovedByThisReview === false, 'Candidate mapping must not be approved by this review.');
  assert(review.weightingPolicyDraft.maxContributionPct === 3, 'Weighting draft max contribution must be 3.');
  assert(review.weightingPolicyDraft.cannotOverrideCoreRiskModel === true, 'Weighting draft cannot override core risk model.');
  assert(review.productionImpact.affectsScoring === false, 'Runtime design artifact must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Runtime design artifact must not affect main judgment.');
  assert(review.boundaries.noRuntimeWiring === true, 'Runtime design must lock noRuntimeWiring.');
  assert(review.boundaries.noProductionWrite === true, 'Runtime design must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Runtime design must lock noScoreWrite.');
}

function assertBlockedReviewOutput() {
  const review = JSON.parse(runNode([
    REVIEW_SCRIPT,
    '--input',
    WRONG_SCHEMA_INPUT,
    '--no-output',
    '--json'
  ]));
  assert(review.status === 'runtime_score_integration_design_blocked_no_production_write', 'Wrong-schema input should block runtime design.');
  assert(review.runtimeScoreIntegrationDesignReady === false, 'Blocked review should not be design ready.');
  assert(review.candidateScoreContributionPct === 0, 'Blocked review contribution must be 0.');
  assert(review.blockerCount > 0, 'Blocked review must report blockers.');
  assert(review.blockers.some((item) => item.id === 'input_schema_invalid'), 'Blocked review should include input_schema_invalid.');
  assert(review.scoreWriteApproved === false, 'Blocked review must not approve score write.');
  assert(review.runtimeIntegrationApproved === false, 'Blocked review must not approve runtime integration.');
  assert(review.eligibleForMainScore === false, 'Blocked review must not be main-score eligible.');
  assert(review.boundaries.noScoreWrite === true, 'Blocked review must lock noScoreWrite.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains runtime integration design marker and may have been wired too early: ${marker}`);
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
    'review:transport-shock-confirmation-factor-runtime-score-integration-design',
    'transport-shock-confirmation-factor-runtime-score-integration-design-review-v1',
    'runtime_score_integration_design_ready_no_production_write',
    'feature_flag_default_off'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-runtime-score-integration-design-review-v1',
    'runtimeScoreIntegrationDesignReady',
    'runtimeIntegrationApproved=false',
    'scoreWriteApproved=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-runtime-score-integration-design-review-v1'), 'SIGNAL_INTAKE missing runtime design marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor runtime score integration design review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing runtime design marker.');
  assert(agents.includes('Transport Shock Confirmation Factor runtime score integration design review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing runtime design boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-runtime-score-integration-design'], 'package.json missing runtime design review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-runtime-score-integration-design'], 'package.json missing runtime design checker.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-runtime-score-integration-design'), 'check-suite missing runtime design checker.');
}

function main() {
  assertScriptSafety();
  assertReadyFixture();
  assertReadyReviewOutput();
  assertBlockedReviewOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor runtime score integration design review: PASS');
}

main();
