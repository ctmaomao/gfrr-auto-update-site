import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-portwatch-freshness.mjs';
const FRESH_FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/portwatch-freshness-payload-fresh.json';

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
  'transport-shock-confirmation-factor-portwatch-freshness-v1',
  'review-transport-shock-confirmation-factor-portwatch-freshness',
  'portwatch_freshness_probe_fresh_no_production_write'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'PortWatch freshness script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of [
    'artifact-only Transport Shock PortWatch freshness probe',
    'IMFPortWatch:Daily_Chokepoints_Data',
    'portwatch_freshness_probe_fresh_no_production_write',
    'portwatch_freshness_probe_stale_or_partial_no_production_write',
    'route_freight_confirmation',
    'news_manual_gate',
    'high_frequency_physical_confirmation',
    'scoreWriteApproved: false',
    'eligibleForMainScore: false',
    'outputOnlyToManualArtifacts'
  ]) {
    assert(source.includes(marker), `PortWatch freshness script missing required marker: ${marker}`);
  }
  for (const forbidden of [
    'data/radar-data.json',
    'data/oil-directional-pressure.json',
    'market.worker-preview.json',
    'process.env'
  ]) {
    assert(!source.includes(forbidden), `PortWatch freshness script contains forbidden marker: ${forbidden}`);
  }
}

function assertFreshFixtureOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    FRESH_FIXTURE,
    '--as-of',
    '2026-07-02',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-portwatch-freshness-v1', 'Unexpected schemaVersion.');
  assert(review.status === 'portwatch_freshness_probe_fresh_no_production_write', 'Fresh fixture should be fresh.');
  assert(review.sourceMode === 'fixture_or_manual_payload', 'Fixture output should not claim live mode.');
  assert(review.latestDate === '2026-07-01', 'Unexpected latestDate.');
  assert(review.latestAgeDays === 1, 'Unexpected latestAgeDays.');
  assert(review.supportsPortWatchFreshnessPass === true, 'Fresh fixture should support PortWatch freshness pass.');
  assert(review.missingCoreKeys.length === 0, 'Fresh fixture should have all core chokepoints.');
  assert(review.staleCoreKeys.length === 0, 'Fresh fixture should have no stale core chokepoints.');
  assert(review.preflightImpact.canClearHardBlockerId === 'portwatch_physical_proxy_freshness', 'Freshness probe should only clear PortWatch blocker.');
  assert(review.preflightImpact.cannotClearHardBlockerIds.includes('route_freight_confirmation'), 'Route freight blocker must remain.');
  assert(review.preflightImpact.cannotClearHardBlockerIds.includes('news_manual_gate'), 'News manual gate blocker must remain.');
  assert(review.preflightImpact.cannotClearHardBlockerIds.includes('high_frequency_physical_confirmation'), 'Physical confirmation blocker must remain.');
  assert(review.preflightImpact.scoreWriteApproved === false, 'Probe must not approve score write.');
  assert(review.preflightImpact.eligibleForMainScore === false, 'Probe must not approve main-score eligibility.');
  assert(review.productionImpact.affectsScoring === false, 'Probe must not affect scoring.');
  assert(review.boundaries.productionDataWriteApproved === false, 'Probe must not approve production write.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains PortWatch probe marker and may have been wired too early: ${marker}`);
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
    'review:transport-shock-confirmation-factor-portwatch-freshness',
    'transport-shock-confirmation-factor-portwatch-freshness-v1',
    'portwatch_freshness_probe_fresh_no_production_write',
    'portwatch_physical_proxy_freshness'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-portwatch-freshness-v1',
    'supportsPortWatchFreshnessPass',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-portwatch-freshness-v1'), 'SIGNAL_INTAKE missing PortWatch freshness marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor PortWatch freshness probe'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing PortWatch freshness marker.');
  assert(agents.includes('Transport Shock Confirmation Factor PortWatch freshness probe'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing PortWatch freshness boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-portwatch-freshness'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-portwatch-freshness'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-portwatch-freshness'), 'check-suite missing PortWatch freshness check.');
}

function main() {
  assertScriptSafety();
  assertFreshFixtureOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor PortWatch freshness probe: PASS');
}

main();
