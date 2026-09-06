import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-historical-replay-sample.mjs';
const SAMPLE_INPUT = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-headline-only.json';

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
  'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1',
  'review-transport-shock-confirmation-factor-free-proxy-historical-replay-sample',
  'transportShockFreeProxyHistoricalReplaySample'
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

function assertReviewScriptSafety() {
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Historical replay sample review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Historical replay sample script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy historical replay sample scaffold only',
    'sample_review_ready_keep_no_score_write',
    'historicalBacktestPerformed',
    'acceptedForFutureReplayDataset',
    'rawCitationStored',
    'noNetworkCall',
    'noProductionWrite',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Historical replay sample script missing required boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(SAMPLE_INPUT)), 'Historical replay sample fixture is missing.');
  const sample = JSON.parse(readText(SAMPLE_INPUT));
  assert(sample.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-input-v1', 'Sample fixture schemaVersion mismatch.');
  assert(sample.familyKey === 'headline_only_false_positive', 'Sample fixture must exercise headline-only false positive control.');
  assert(sample.expectedContributionPct === 0, 'Headline-only fixture expected contribution must be 0.');
  assert(sample.observedCandidateContributionPct === 0, 'Headline-only fixture observed contribution must be 0.');
  assert(sample.evidence.every((row) => row.rawCitationStored === false), 'Sample fixture must not claim raw citation storage.');
}

function assertReviewOutput() {
  const stdout = runNode([REVIEW_SCRIPT, '--input', SAMPLE_INPUT, '--no-output', '--json']);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1', 'Unexpected review schemaVersion.');
  assert(review.contractVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-scaffold-v1', 'Unexpected contractVersion.');
  assert(review.status === 'sample_review_ready_keep_no_score_write', 'Expected ready no-score-write sample review.');
  assert(review.sampleId === 'fixture-headline-only-false-positive-2026-06', 'Unexpected sampleId.');
  assert(review.familyKey === 'headline_only_false_positive', 'Unexpected familyKey.');
  assert(review.expectedContributionPct === 0, 'Expected contribution must stay 0.');
  assert(review.observedCandidateContributionPct === 0, 'Observed contribution must stay 0.');
  assert(review.acceptedForFutureReplayDataset === true, 'Fixture should be accepted for future replay dataset.');
  assert(review.historicalReplayRunnerImplemented === false, 'Review must not claim replay runner implementation.');
  assert(review.historicalBacktestPerformed === false, 'Review must not claim historical backtest.');
  assert(review.scoreIntegrationApproved === false, 'Review must not approve score integration.');
  assert(review.scoreWriteApproved === false, 'Review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(review.review.evidenceCount === 1, 'Expected one compact evidence row.');
  assert(review.review.compactEvidence[0].rawCitationStored === false, 'Compact evidence must not store raw citation.');
  assert(review.review.compactEvidence[0].sourceCitationHash, 'Compact evidence should store citation hash.');
  assert(!JSON.stringify(review).includes('transport-shock-headline-only-fixture'), 'Review output must not include raw citation text.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Review must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Review must lock noScoreWrite.');
  assert(review.boundaries.noReplayExecution === true, 'Review must lock noReplayExecution.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains historical replay sample marker and may have been wired too early: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1',
    'sample_review_ready_keep_no_score_write',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay sample scaffold'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing historical replay sample scaffold marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay sample scaffold'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing historical replay sample scaffold boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-free-proxy-historical-replay-sample'], 'package.json missing sample review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-sample-scaffold'], 'package.json missing sample scaffold checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-sample-scaffold'), 'check-suite missing sample scaffold check.');
}

function main() {
  assertReviewScriptSafety();
  assertFixture();
  assertReviewOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay sample scaffold: PASS');
}

main();
