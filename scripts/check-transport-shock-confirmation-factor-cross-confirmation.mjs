import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-cross-confirmation.mjs';
const FIXTURE_RADAR = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-radar.json';
const FIXTURE_NEWS_GATE = 'docs/fixtures/transport-shock-confirmation-factor/cross-confirmation-news-manual-gate-blocked.json';
const FIXTURE_HIGH_FREQUENCY = 'docs/fixtures/transport-shock-confirmation-factor/cross-confirmation-high-frequency-blocked.json';
const FIXTURE_MARKET_PROJECTION = 'docs/fixtures/transport-shock-confirmation-factor/cross-confirmation-market-projection-ready.json';
const FIXTURE_PORTWATCH_BLOCKED = 'docs/fixtures/transport-shock-confirmation-factor/cross-confirmation-portwatch-freshness-blocked.json';
const FIXTURE_PORTWATCH_READY = 'docs/fixtures/transport-shock-confirmation-factor/cross-confirmation-portwatch-freshness-ready.json';
const FIXTURE_ODP = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-directional.json';

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
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-cross-confirmation-v1',
  'review-transport-shock-confirmation-factor-cross-confirmation',
  'cross_confirmation_candidate_ready_no_score_write'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Cross-confirmation review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Cross-confirmation script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'artifact-only Transport Shock cross-confirmation review',
    'cross_confirmation_blocked_keep_display_only',
    'keep_transport_shock_candidate_display_only_until_blockers_clear',
    'news_manual_gate',
    'high_frequency_physical_confirmation',
    'route_freight_confirmation',
    'market_confirmation',
    'portwatch_physical_proxy_freshness',
    'portwatch_freshness_probe',
    'odp_physical_anchor',
    'eligibleForMainScore',
    'noScoreWrite',
    'crossConfirmationReviewOnly'
  ]) {
    assert(source.includes(marker), `Cross-confirmation script missing required marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixture of [
    FIXTURE_RADAR,
    FIXTURE_NEWS_GATE,
    FIXTURE_HIGH_FREQUENCY,
    FIXTURE_MARKET_PROJECTION,
    FIXTURE_PORTWATCH_BLOCKED,
    FIXTURE_PORTWATCH_READY,
    FIXTURE_ODP
  ]) {
    assert(fs.existsSync(absolute(fixture)), `Fixture missing: ${fixture}`);
  }
  const newsGate = JSON.parse(readText(FIXTURE_NEWS_GATE));
  const highFrequency = JSON.parse(readText(FIXTURE_HIGH_FREQUENCY));
  const marketProjection = JSON.parse(readText(FIXTURE_MARKET_PROJECTION));
  const portwatchReady = JSON.parse(readText(FIXTURE_PORTWATCH_READY));
  assert(newsGate.schemaVersion === 'transport-shock-confirmation-factor-news-manual-gate-v1', 'News gate fixture schema mismatch.');
  assert(newsGate.gateClear === false, 'News gate fixture must exercise blocked gate.');
  assert(highFrequency.schemaVersion === 'transport-shock-confirmation-factor-high-frequency-confirmation-v1', 'High-frequency fixture schema mismatch.');
  assert(highFrequency.summary.thermalElevatedRepeatedObservation === false, 'High-frequency fixture must exercise missing elevated thermal observation.');
  assert(marketProjection.schemaVersion === 'transport-shock-market-confirmation-display-projection-v1', 'Market projection fixture schema mismatch.');
  assert(marketProjection.projectionState === 'manual_market_confirmation_review_ready_non_production', 'Market projection fixture must exercise ready display-only projection.');
  assert(portwatchReady.schemaVersion === 'transport-shock-confirmation-factor-portwatch-freshness-v1', 'PortWatch readiness fixture schema mismatch.');
  assert(portwatchReady.supportsPortWatchFreshnessPass === true, 'PortWatch readiness fixture must exercise freshness pass.');
}

function assertCrossConfirmationOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--radar',
    FIXTURE_RADAR,
    '--news-gate',
    FIXTURE_NEWS_GATE,
    '--high-frequency',
    FIXTURE_HIGH_FREQUENCY,
    '--market-projection',
    FIXTURE_MARKET_PROJECTION,
    '--portwatch-freshness',
    FIXTURE_PORTWATCH_BLOCKED,
    '--oil-directional',
    FIXTURE_ODP,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-cross-confirmation-v1', 'Unexpected schemaVersion.');
  assert(review.status === 'cross_confirmation_blocked_keep_display_only', 'Fixture must remain blocked/display-only.');
  assert(review.recommendation === 'keep_transport_shock_candidate_display_only_until_blockers_clear', 'Unexpected recommendation.');
  assert(review.crossConfirmationReady === false, 'Cross-confirmation must not be ready.');
  assert(review.manualReviewRequired === true, 'Manual review must be required.');
  assert(review.summary.hardBlockerCount >= 4, 'Expected hard blockers from stale PortWatch, route, news, and high-frequency.');
  for (const blocker of [
    'portwatch_physical_proxy_freshness',
    'route_freight_confirmation',
    'news_manual_gate',
    'high_frequency_physical_confirmation'
  ]) {
    assert(review.summary.hardBlockerIds.includes(blocker), `Expected hard blocker: ${blocker}`);
  }
  assert(!review.summary.hardBlockerIds.includes('market_confirmation'), 'Market confirmation should pass with ready display-only projection fixture.');
  assert(review.rows.find((item) => item.id === 'production_transport_candidate')?.status === 'pass', 'Production candidate row should pass boundary checks.');
  assert(review.rows.find((item) => item.id === 'market_confirmation')?.status === 'pass', 'Market confirmation row should pass with display-only projection fixture.');
  assert(review.rows.find((item) => item.id === 'odp_physical_anchor')?.status === 'pass', 'ODP anchor row should pass as supporting context.');
  assert(review.scoreReadinessApproved === false, 'Review must not approve score readiness.');
  assert(review.scoreWriteApproved === false, 'Review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.frontendDisplayApproved === false, 'Review must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'Review must not create main-score eligibility.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Review must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Review must lock noScoreWrite.');
  assert(review.boundaries.crossConfirmationReviewOnly === true, 'Review must lock crossConfirmationReviewOnly.');
}

function assertPortWatchProbeClearsOnlyFreshness() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--radar',
    FIXTURE_RADAR,
    '--news-gate',
    FIXTURE_NEWS_GATE,
    '--high-frequency',
    FIXTURE_HIGH_FREQUENCY,
    '--market-projection',
    FIXTURE_MARKET_PROJECTION,
    '--portwatch-freshness',
    FIXTURE_PORTWATCH_READY,
    '--oil-directional',
    FIXTURE_ODP,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.status === 'cross_confirmation_blocked_keep_display_only', 'Fresh PortWatch alone must not make cross-confirmation ready.');
  assert(review.crossConfirmationReady === false, 'Cross-confirmation must remain blocked when route/news/high-frequency blockers remain.');
  assert(!review.summary.hardBlockerIds.includes('portwatch_physical_proxy_freshness'), 'Fresh PortWatch probe should clear only PortWatch freshness blocker.');
  for (const blocker of [
    'route_freight_confirmation',
    'news_manual_gate',
    'high_frequency_physical_confirmation'
  ]) {
    assert(review.summary.hardBlockerIds.includes(blocker), `Expected remaining hard blocker: ${blocker}`);
  }
  const row = review.rows.find((item) => item.id === 'portwatch_physical_proxy_freshness');
  assert(row?.status === 'pass', 'PortWatch freshness row should pass with fresh probe.');
  assert(row?.evidence?.productionFresh === false, 'Fixture production snapshot should remain stale.');
  assert(row?.evidence?.manualProbeReady === true, 'Fresh probe evidence should be visible.');
  assert(row?.evidence?.manualProbe?.canClearHardBlockerId === 'portwatch_physical_proxy_freshness', 'Fresh probe must only clear PortWatch freshness.');
  assert(review.scoreWriteApproved === false, 'Fresh probe must not approve score write.');
  assert(review.eligibleForMainScore === false, 'Fresh probe must not create main-score eligibility.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains cross-confirmation marker and may have been wired too early: ${marker}`);
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
    'review:transport-shock-confirmation-factor-cross-confirmation',
    'transport-shock-confirmation-factor-cross-confirmation-v1',
    'cross_confirmation_blocked_keep_display_only',
    'no score write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-cross-confirmation-v1',
    'keep_transport_shock_candidate_display_only_until_blockers_clear',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-cross-confirmation-v1'), 'SIGNAL_INTAKE missing cross-confirmation marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor cross-confirmation review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing cross-confirmation marker.');
  assert(agents.includes('Transport Shock Confirmation Factor cross-confirmation review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing cross-confirmation boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-cross-confirmation'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-cross-confirmation'], 'package.json missing checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-cross-confirmation'), 'check-suite missing cross-confirmation check.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertCrossConfirmationOutput();
  assertPortWatchProbeClearsOnlyFreshness();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor cross-confirmation review: PASS');
}

main();
