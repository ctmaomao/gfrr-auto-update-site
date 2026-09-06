import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-high-frequency-confirmation.mjs';
const FIXTURE_NEWS_LEDGER = 'docs/fixtures/transport-shock-confirmation-factor/high-frequency-oil-news-claim-ledger.json';
const FIXTURE_NEWS_GATE_CLEAR = 'docs/fixtures/transport-shock-confirmation-factor/high-frequency-news-manual-gate-clear.json';
const FIXTURE_THERMAL_REPEATED = 'docs/fixtures/transport-shock-confirmation-factor/high-frequency-oil-thermal-repeated-watch.json';
const FIXTURE_THERMAL_PARTIAL_ELEVATED = 'docs/fixtures/transport-shock-confirmation-factor/high-frequency-oil-thermal-partial-elevated-watch.json';

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
  'transport-shock-confirmation-factor-high-frequency-confirmation-v1',
  'review-transport-shock-confirmation-factor-high-frequency-confirmation',
  'high_frequency_confirmation_ready_for_separate_review_no_score_write'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'High-frequency confirmation review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `High-frequency confirmation script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'artifact-only high-frequency confirmation review',
    'partial_progress_keep_display_only',
    'news_repeated_elevated_and_thermal_repeated_observed_but_keep_manual_review',
    'news_gate_clear_and_thermal_repeated_observed_wait_for_elevated_thermal_confirmation',
    'news_manual_gate_applied_for_cross_confirmation_only',
    'newsRepeatedElevatedObservation',
    'thermalElevatedRepeatedObservation',
    'noHeadlineTextOutput',
    'noScoreWrite',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `High-frequency confirmation script missing required marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixture of [
    FIXTURE_NEWS_LEDGER,
    FIXTURE_NEWS_GATE_CLEAR,
    FIXTURE_THERMAL_REPEATED,
    FIXTURE_THERMAL_PARTIAL_ELEVATED
  ]) {
    assert(fs.existsSync(absolute(fixture)), `Fixture missing: ${fixture}`);
  }
  const news = JSON.parse(readText(FIXTURE_NEWS_LEDGER));
  assert(news.reviewVersion === 'oil-news-claim-ledger-p52', 'News claim-ledger fixture schema mismatch.');
  assert(news.displayReadiness.directHeadlineDisplayAllowed === false, 'News fixture must not allow headline display.');
  const gate = JSON.parse(readText(FIXTURE_NEWS_GATE_CLEAR));
  assert(gate.schemaVersion === 'transport-shock-confirmation-factor-news-manual-gate-v1', 'News manual gate fixture schema mismatch.');
  assert(gate.gateClear === true, 'News manual gate fixture must clear gate.');
  const thermal = JSON.parse(readText(FIXTURE_THERMAL_REPEATED));
  assert(thermal.schemaVersion === 'oil-thermal-watch-1', 'Thermal fixture schema mismatch.');
  assert(thermal.aggregate.repeatedObservationCount > 0, 'Thermal fixture must include repeated observations.');
  assert(thermal.aggregate.elevatedRepeatedObservationCount === 0, 'Thermal fixture must remain non-elevated.');
  const partialElevated = JSON.parse(readText(FIXTURE_THERMAL_PARTIAL_ELEVATED));
  assert(partialElevated.baseline.status === 'partial', 'Partial elevated thermal fixture must use partial top-level baseline.');
  assert(partialElevated.aggregate.facilitiesWithEstablishedBaseline > 0, 'Partial elevated thermal fixture must preserve established facility count.');
  assert(partialElevated.aggregate.elevatedRepeatedObservationCount > 0, 'Partial elevated thermal fixture must include elevated repeated observations.');
}

function assertManualGateClearOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--news-ledger',
    FIXTURE_NEWS_LEDGER,
    '--news-manual-gate',
    FIXTURE_NEWS_GATE_CLEAR,
    '--oil-thermal',
    FIXTURE_THERMAL_REPEATED,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-high-frequency-confirmation-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'partial_progress_keep_display_only', 'Expected partial progress while thermal elevation is missing.');
  assert(review.recommendation === 'news_gate_clear_and_thermal_repeated_observed_wait_for_elevated_thermal_confirmation', 'Unexpected gate-clear recommendation.');
  assert(review.summary.newsRepeatedElevatedObservation === true, 'Expected news repeated elevated observation.');
  assert(review.summary.newsManualReviewRequired === false, 'News manual review should be cleared by gate fixture.');
  assert(review.news.manualGate.ready === true, 'Expected manual gate ready evidence.');
  assert(review.news.rawManualBlockers.includes('mixed_claims'), 'Raw news blockers must remain visible.');
  assert(!review.summary.readinessBlockers.includes('news_manual_review_required'), 'News manual blocker should be cleared.');
  assert(review.summary.readinessBlockers.includes('thermal_elevated_repeated_observation_missing'), 'Thermal elevated blocker must remain.');
  assert(review.scoreWriteApproved === false, 'Gate-clear review must not approve score write.');
  assert(review.eligibleForMainScore === false, 'Gate-clear review must not approve main-score eligibility.');
}

function assertPartialBaselineElevatedOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--news-ledger',
    FIXTURE_NEWS_LEDGER,
    '--news-manual-gate',
    FIXTURE_NEWS_GATE_CLEAR,
    '--oil-thermal',
    FIXTURE_THERMAL_PARTIAL_ELEVATED,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.status === 'high_frequency_confirmation_ready_for_separate_review_no_score_write', 'Partial baseline with facility-level elevated repeated observation should clear high-frequency review.');
  assert(review.recommendation === 'open_separate_review_for_confirmation_design_keep_no_score_write', 'Unexpected partial-baseline elevated recommendation.');
  assert(review.summary.thermalRepeatedObservation === true, 'Expected thermal repeated observation from facility-level established baseline.');
  assert(review.summary.thermalElevatedRepeatedObservation === true, 'Expected thermal elevated repeated observation from facility-level established baseline.');
  assert(!review.summary.readinessBlockers.includes('oil_thermal_baseline_not_established'), 'Partial top-level baseline must not block when established facility rows exist.');
  assert(review.thermal.evidence.baselineStatus === 'partial', 'Evidence should preserve top-level partial baseline.');
  assert(review.thermal.evidence.facilitiesWithEstablishedBaseline > 0, 'Evidence should expose established facility count.');
  assert(review.scoreWriteApproved === false, 'High-frequency ready review must not approve score write.');
  assert(review.eligibleForMainScore === false, 'High-frequency ready review must not approve main-score eligibility.');
}

function assertReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--news-ledger',
    FIXTURE_NEWS_LEDGER,
    '--news-manual-gate',
    'manual-artifacts/transport-shock-confirmation-factor/nonexistent-news-manual-gate-for-check.json',
    '--oil-thermal',
    FIXTURE_THERMAL_REPEATED,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-high-frequency-confirmation-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'partial_progress_keep_display_only', 'Expected partial progress, not score readiness.');
  assert(review.recommendation === 'news_repeated_elevated_and_thermal_repeated_observed_but_keep_manual_review', 'Unexpected recommendation.');
  assert(review.summary.newsRepeatedElevatedObservation === true, 'Expected news repeated elevated observation.');
  assert(review.summary.newsManualReviewRequired === true, 'Expected news manual review to remain required.');
  assert(review.summary.thermalRepeatedObservation === true, 'Expected thermal repeated observation.');
  assert(review.summary.thermalElevatedRepeatedObservation === false, 'Thermal observation must not be elevated.');
  assert(review.summary.readinessBlockers.includes('news_manual_review_required'), 'Expected news manual review blocker.');
  assert(review.summary.readinessBlockers.includes('thermal_elevated_repeated_observation_missing'), 'Expected thermal elevated blocker.');
  assert(review.scoreReadinessApproved === false, 'Review must not approve score readiness.');
  assert(review.scoreWriteApproved === false, 'Review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.frontendDisplayApproved === false, 'Review must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'Review must not make factor main-score eligible.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Review must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Review must lock noScoreWrite.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains high-frequency confirmation marker and may have been wired too early: ${marker}`);
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
    'review:transport-shock-confirmation-factor-high-frequency-confirmation',
    'transport-shock-confirmation-factor-high-frequency-confirmation-v1',
    'partial_progress_keep_display_only',
    'no score write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-high-frequency-confirmation-v1',
    'newsRepeatedElevatedObservation',
    'thermalElevatedRepeatedObservation',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-high-frequency-confirmation-v1'), 'SIGNAL_INTAKE missing high-frequency confirmation marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor high-frequency confirmation review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing high-frequency confirmation marker.');
  assert(agents.includes('Transport Shock Confirmation Factor high-frequency confirmation review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing high-frequency confirmation boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-high-frequency-confirmation'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-high-frequency-confirmation'], 'package.json missing checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-high-frequency-confirmation'), 'check-suite missing high-frequency confirmation check.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertReviewOutput();
  assertManualGateClearOutput();
  assertPartialBaselineElevatedOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor high-frequency confirmation review: PASS');
}

main();
