import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MONITOR_SCRIPT = 'scripts/monitor-transport-shock-confirmation-factor-score-readiness.mjs';
const FIXTURE_RADAR = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-radar.json';
const FIXTURE_RADAR_FRESH = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-radar-fresh.json';
const FIXTURE_NEWS = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-news.json';
const FIXTURE_THERMAL = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-thermal.json';
const FIXTURE_ODP = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-directional.json';
const FIXTURE_HISTORY = 'docs/fixtures/transport-shock-confirmation-factor/history-samples-review-pass.json';
const FIXTURE_PREFLIGHT_PASSED = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-preflight-passed.json';
const FIXTURE_PREFLIGHT_MISSING = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-preflight-missing.json';
const WORKFLOW = '.github/workflows/transport-shock-score-readiness-monitor.yml';

const FORBIDDEN_SCRIPT_MARKERS = [
  'fetch(',
  'https.request',
  'http.request',
  'axios',
  'node:https',
  'node:http'
];

const RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'scripts/run-daily-pipeline.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/radar-data.json',
  'data/oil-directional-pressure.json'
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

function assertMonitorScript() {
  assert(fs.existsSync(absolute(MONITOR_SCRIPT)), 'Score-readiness monitor script is missing.');
  const source = readText(MONITOR_SCRIPT);
  for (const marker of FORBIDDEN_SCRIPT_MARKERS) {
    assert(!source.includes(marker), `Score-readiness monitor contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-score-readiness-monitor-p14',
    'blockers_still_present',
    'score_ready_requires_separate_review',
    'scoreIntegrationPreflightStatus',
    'keep_display_only_and_monitor_hard_blockers_after_refreshes',
    'artifact-only Transport Shock Confirmation Factor score-readiness monitor',
    'scoreWriteApproved: false',
    'productionDataWriteApproved: false'
  ]) {
    assert(source.includes(marker), `Score-readiness monitor missing marker: ${marker}`);
  }
}

function assertMonitorOutput() {
  const stdout = runNode([
    MONITOR_SCRIPT,
    '--radar',
    FIXTURE_RADAR,
    '--oil-news',
    FIXTURE_NEWS,
    '--oil-thermal',
    FIXTURE_THERMAL,
    '--oil-directional',
    FIXTURE_ODP,
    '--history-review',
    FIXTURE_HISTORY,
    '--score-integration-preflight',
    FIXTURE_PREFLIGHT_MISSING,
    '--dry-run',
    '--no-output',
    '--json'
  ]);
  const result = JSON.parse(stdout);
  assert(result.monitorVersion === 'transport-shock-score-readiness-monitor-p14', 'Unexpected monitor version.');
  assert(result.status === 'blockers_still_present', 'Fixture should keep blockers_still_present.');
  assert(result.readiness.status === 'not_ready_for_score', 'Readiness should remain not_ready_for_score.');
  assert(result.readiness.scoreReady === false, 'Fixture must not become score-ready.');
  assert(result.readiness.hardBlockerCount >= 5, 'Expected hard blockers.');
  assert(result.readiness.hardBlockerIds.includes('route_level_tanker_freight_confirmation'), 'Missing route freight blocker.');
  assert(result.readiness.hardBlockerIds.includes('market_confirmation'), 'Missing market confirmation blocker.');
  assert(result.readiness.hardBlockerIds.includes('route_freight_source_rights'), 'Missing source-rights blocker.');
  assert(result.scoreWriteApproved === false, 'Monitor must not approve score write.');
  assert(result.productionDataWriteApproved === false, 'Monitor must not approve production write.');
  assert(result.manualAction.requiredNow === false, 'Fixture blockers should not require immediate manual score action.');
  assert(result.productionImpact.affectsScoring === false, 'Monitor must not affect scoring.');
  assert(result.productionImpact.affectsMainJudgment === false, 'Monitor must not affect main judgment.');
  assert(result.boundary.includes('does not fetch network'), 'Boundary must keep no-network discipline.');
}

function assertMonitorPreflightReadyOutput() {
  const stdout = runNode([
    MONITOR_SCRIPT,
    '--radar',
    FIXTURE_RADAR_FRESH,
    '--oil-news',
    FIXTURE_NEWS,
    '--oil-thermal',
    FIXTURE_THERMAL,
    '--oil-directional',
    FIXTURE_ODP,
    '--history-review',
    FIXTURE_HISTORY,
    '--score-integration-preflight',
    FIXTURE_PREFLIGHT_PASSED,
    '--dry-run',
    '--no-output',
    '--json'
  ]);
  const result = JSON.parse(stdout);
  assert(result.monitorVersion === 'transport-shock-score-readiness-monitor-p14', 'Unexpected monitor version.');
  assert(result.status === 'score_ready_requires_separate_review', 'Preflight path should require separate score review.');
  assert(result.readiness.status === 'ready_for_score_design_review_no_score_write', 'Readiness should be preflight-ready.');
  assert(result.readiness.scoreReady === true, 'Preflight monitor should set scoreReady for separate review.');
  assert(result.readiness.scoreReadyReason === 'score_integration_preflight_passed_for_design_review_no_score_write', 'Unexpected scoreReadyReason.');
  assert(result.readiness.reclassifiedCount === 5, 'Expected five reclassified rows.');
  assert(result.readiness.hardBlockerCount === 0, 'Expected no hard blockers.');
  assert(result.scoreWriteApproved === false, 'Monitor must not approve score write.');
  assert(result.productionDataWriteApproved === false, 'Monitor must not approve production write.');
  assert(result.manualAction.requiredNow === true, 'Preflight-ready state should require manual score-design review.');
  assert(result.manualAction.recommendation === 'open_separate_reviewed_score_design_pr_do_not_auto_wire', 'Unexpected ready recommendation.');
}

function assertRuntimeUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    const source = readText(relativePath);
    for (const marker of [
      'transport-shock-score-readiness-monitor-p14',
      'score_ready_requires_separate_review',
      'monitor:transport-shock-confirmation-factor-score-readiness'
    ]) {
      assert(!source.includes(marker), `${relativePath} appears to wire score-readiness monitor into runtime.`);
    }
  }
}

function assertWorkflow() {
  assert(fs.existsSync(absolute(WORKFLOW)), 'Score-readiness monitor workflow is missing.');
  const workflow = readText(WORKFLOW);
  for (const marker of [
    'Transport Shock Score-Readiness Monitor',
    'workflow_dispatch',
    "cron: '29 23 * * *'",
    'permissions:',
    'contents: read',
    'npm run monitor:transport-shock-confirmation-factor-score-readiness -- --github-summary',
    'manual-artifacts/transport-shock-confirmation-factor/score-readiness-monitor-latest.json'
  ]) {
    assert(workflow.includes(marker), `Workflow missing marker: ${marker}`);
  }
  for (const forbidden of ['secrets.', 'git push', 'git commit', 'npm run build:daily']) {
    assert(!workflow.includes(forbidden), `Workflow contains forbidden marker: ${forbidden}`);
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
    'transport-shock-score-readiness-monitor-p14',
    'score-readiness monitor',
    'blockers_still_present'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-score-readiness-monitor-p14'), 'SIGNAL_INTAKE missing monitor marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor score-readiness monitor'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing monitor marker.');
  assert(agents.includes('Transport Shock Confirmation Factor score-readiness monitor'), 'AGENTS missing monitor marker.');
  assert(packageJson.scripts['monitor:transport-shock-confirmation-factor-score-readiness'], 'package.json missing monitor script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-score-readiness-monitor'], 'package.json missing monitor check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-score-readiness-monitor'), 'check-suite missing monitor check.');
}

function main() {
  assertMonitorScript();
  assertMonitorOutput();
  assertMonitorPreflightReadyOutput();
  assertRuntimeUnwired();
  assertWorkflow();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor score-readiness monitor: PASS');
}

main();
