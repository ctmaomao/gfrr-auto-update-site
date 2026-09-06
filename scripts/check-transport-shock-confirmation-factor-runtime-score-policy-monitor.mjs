import { assertIncludes, runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MONITOR_SCRIPT = 'scripts/monitor-transport-shock-confirmation-factor-runtime-score-policy.mjs';
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-runtime-score-policy.mjs';
const MONITOR_VERSION = 'transport-shock-runtime-score-policy-monitor-p56';
const REVIEW_SCHEMA_VERSION = 'transport-shock-confirmation-factor-runtime-score-policy-review-v1';
const MONITOR_COMMAND = 'monitor:transport-shock-confirmation-factor-runtime-score-policy';
const CHECK_COMMAND = 'check:transport-shock-confirmation-factor-runtime-score-policy-monitor';

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
  MONITOR_VERSION,
  MONITOR_COMMAND,
  'zero_contribution_observed',
  'nonzero_contribution_observed',
  'policy_drift_detected'
];

const MONITOR_FORBIDDEN_MARKERS = [
  'fetch(',
  'https.request',
  'http.request',
  'axios',
  'node:https',
  'node:http'
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

function assertMonitorSafety() {
  assert(fs.existsSync(absolute(MONITOR_SCRIPT)), 'Runtime score policy monitor script is missing.');
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Runtime score policy review script is missing.');
  const source = readText(MONITOR_SCRIPT);
  for (const marker of MONITOR_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Runtime score policy monitor contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    MONITOR_VERSION,
    REVIEW_SCRIPT,
    REVIEW_SCHEMA_VERSION,
    'policy_drift_detected',
    'zero_contribution_observed',
    'nonzero_contribution_observed',
    'wraps P-score-55 policy review',
    'affectsBubbleWatch: false',
    'connectsRouteFreightConfirmation: false',
    'connectsMarketConfirmation: false'
  ]) {
    assert(source.includes(marker), `Runtime score policy monitor missing marker: ${marker}`);
  }
}

function assertMonitorOutput() {
  const result = JSON.parse(runNode([MONITOR_SCRIPT, '--dry-run', '--no-output', '--json']));
  assert(result.monitorVersion === MONITOR_VERSION, 'Unexpected runtime score policy monitor version.');
  assert(
    result.status === 'zero_contribution_observed' || result.status === 'nonzero_contribution_observed',
    `Unexpected runtime score policy monitor status: ${result.status}`
  );
  assert(result.review.schemaVersion === REVIEW_SCHEMA_VERSION, 'Unexpected review schema in monitor.');
  assert(result.review.scorePolicyReviewPassed === true, 'P-score-55 review should pass inside monitor.');
  assert(result.review.blockerCount === 0, 'P-score-55 review should have no blockers inside monitor.');
  assert(result.currentObservation.reason === result.currentObservation.expectedReason, 'Monitor reason must match expected reason.');
  assert(result.currentObservation.contributionPct >= 0 && result.currentObservation.contributionPct <= 3, 'Contribution must stay 0..3.');
  assert(result.policySummary.maxContributionPct === 3, 'Policy summary hard cap must be 3.');
  assert(result.policySummary.staleAfterDays === 7, 'Policy summary stale window must be 7.');
  assert(result.productionImpact.modifiesRuntimeScoring === false, 'Monitor must not modify runtime scoring.');
  assert(result.productionImpact.expandsScorePolicy === false, 'Monitor must not expand score policy.');
  assert(result.productionImpact.connectsRouteFreightConfirmation === false, 'Monitor must not connect route freight confirmation.');
  assert(result.productionImpact.connectsMarketConfirmation === false, 'Monitor must not connect market confirmation.');
  assert(result.productionImpact.affectsBubbleWatch === false, 'Monitor must not affect Bubble Watch.');
}

function assertRuntimeUntouched() {
  for (const relativePath of OUT_OF_SCOPE_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of OUT_OF_SCOPE_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P-score-56 monitor marker: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const packageJson = JSON.parse(readText('package.json'));
  assert(packageJson.scripts[MONITOR_COMMAND], `package.json missing ${MONITOR_COMMAND}.`);
  assert(packageJson.scripts[CHECK_COMMAND], `package.json missing ${CHECK_COMMAND}.`);
  assert(readText('scripts/check-suite.mjs').includes(CHECK_COMMAND), 'check-suite missing runtime score policy monitor checker.');
  for (const file of ['docs/AGENT_DOMAIN_BOUNDARIES.md', 'docs/DATA_CONTRACT.md', 'docs/DATA_SOURCES.md', 'docs/SIGNAL_INTAKE.md', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md']) {
    assertIncludes(readText(file), MONITOR_VERSION, file);
    assertIncludes(readText(file), 'P-score-56', file);
  }
}

function main() {
  assertMonitorSafety();
  assertMonitorOutput();
  assertRuntimeUntouched();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor runtime score policy monitor: PASS');
}

main();
