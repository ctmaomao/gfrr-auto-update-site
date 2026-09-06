import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MONITOR_SCRIPT = 'scripts/monitor-transport-shock-confirmation-factor-news-operator-review.mjs';
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
  'transport-shock-news-operator-review-monitor-p42',
  'news_operator_review_still_clear_for_cross_confirmation_no_score_write',
  'would_clear_news_manual_gate_for_cross_confirmation_review_no_score_write'
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

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout || '');
}

function assertScriptSafety() {
  assert(fs.existsSync(absolute(MONITOR_SCRIPT)), 'News operator-review monitor script is missing.');
  const source = readText(MONITOR_SCRIPT);
  for (const marker of [
    'artifact-only Transport Shock news operator review monitor',
    'news_operator_review_still_clear_for_cross_confirmation_no_score_write',
    'would_clear_news_manual_gate_for_cross_confirmation_review_no_score_write',
    'expired_over_48h',
    'noScoreWrite',
    'noNetworkCall',
    'noEnvironmentRead'
  ]) {
    assert(source.includes(marker), `Monitor script missing marker: ${marker}`);
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
    assert(!source.includes(forbidden), `Monitor script contains forbidden marker: ${forbidden}`);
  }
}

function assertMonitorOutput() {
  const stdout = runNode([
    MONITOR_SCRIPT,
    '--claim-ledger',
    FIXTURE_LEDGER,
    '--min-samples',
    '8',
    '--now',
    '2026-07-02T08:00:00.000Z',
    '--dry-run',
    '--json'
  ]);
  const result = JSON.parse(stdout);
  assert(result.monitorVersion === 'transport-shock-news-operator-review-monitor-p42', 'Unexpected monitorVersion.');
  assert(result.status === 'news_operator_review_still_clear_for_cross_confirmation_no_score_write', 'Expected clear monitor status.');
  assert(result.dryRun === true, 'Expected dryRun true.');
  assert(result.claimLedger.axisSplit.state === 'security_risk_vs_supply_flow_split', 'Expected claim axis split evidence.');
  assert(result.operatorReview.approvedForCrossConfirmation === true, 'Expected operator review cross-confirmation approval.');
  assert(result.operatorReview.scoreWriteApproved === false, 'Operator review must not approve score write.');
  assert(result.operatorReview.eligibleForMainScore === false, 'Operator review must not approve main-score eligibility.');
  assert(result.newsManualGateHint.gateClearCandidate === true, 'Expected news manual gate clear candidate.');
  assert(result.newsManualGateHint.freshness.status === 'current_0_12h', 'Expected fresh fixture window.');
  assert(result.newsManualGateHint.freshness.requiresReReview === false, 'Fresh fixture should not require re-review.');
  assert(result.newsManualGateHint.operatorReviewApplied === true, 'Expected operator review applied.');
  assert(result.newsManualGateHint.rawRuleBlockers.includes('mixed_claims_require_manual_review'), 'Raw mixed-claims blocker must remain visible.');
  assert(result.newsManualGateHint.rawRuleBlockers.includes('low_confidence_high_claims_require_primary_source_review'), 'Raw source-tier blocker must remain visible.');
  assert(result.newsManualGateHint.remainingBlockers.length === 0, 'Operator monitor fixture should clear remaining blockers.');
  assert(result.newsManualGateHint.doesNotConfirm.includes('route_freight_confirmation'), 'Monitor must not confirm route freight.');
  assert(result.scoreWriteApproved === false, 'Monitor must not approve score write.');
  assert(result.productionWriteApproved === false, 'Monitor must not approve production write.');
  assert(result.productionImpact.affectsScoring === false, 'Monitor must not affect scoring.');
  assert(result.boundaries.noNetworkCall === true, 'Monitor must lock no network.');
  assert(result.boundaries.noScoreWrite === true, 'Monitor must lock no score write.');
}

function assertExpiredMonitorOutput() {
  const stdout = runNode([
    MONITOR_SCRIPT,
    '--claim-ledger',
    FIXTURE_LEDGER,
    '--min-samples',
    '8',
    '--now',
    '2026-07-05T08:00:00.000Z',
    '--dry-run',
    '--json'
  ]);
  const result = JSON.parse(stdout);
  assert(result.status === 'news_operator_review_monitor_blocked_keep_manual_review', 'Expired monitor should be blocked.');
  assert(result.newsManualGateHint.gateClearCandidate === false, 'Expired monitor should not clear gate.');
  assert(result.newsManualGateHint.freshness.status === 'expired_over_48h', 'Expected expired freshness state.');
  assert(result.newsManualGateHint.remainingBlockers.includes('news_operator_review_expired_re_review_required'), 'Expected stale review blocker.');
  assert(result.scoreWriteApproved === false, 'Expired monitor must not approve score write.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains monitor marker and may have been wired too early: ${marker}`);
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
    'monitor:transport-shock-confirmation-factor-news-operator-review',
    'transport-shock-news-operator-review-monitor-p42',
    'news_operator_review_still_clear_for_cross_confirmation_no_score_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  assert(dataContract.includes('transport-shock-news-operator-review-monitor-p42'), 'DATA_CONTRACT missing monitor marker.');
  assert(signalIntake.includes('transport-shock-news-operator-review-monitor-p42'), 'SIGNAL_INTAKE missing monitor marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor news operator-review monitor'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing monitor marker.');
  assert(agents.includes('Transport Shock Confirmation Factor news operator-review monitor'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing monitor marker.');
  assert(packageJson.scripts['monitor:transport-shock-confirmation-factor-news-operator-review'], 'package.json missing monitor script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-news-operator-review-monitor'], 'package.json missing monitor check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-news-operator-review-monitor'), 'check-suite missing monitor check.');
}

function main() {
  assertScriptSafety();
  assertMonitorOutput();
  assertExpiredMonitorOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor news operator-review monitor: PASS');
}

main();
