#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const REVIEW_SCRIPT = 'scripts/review-transport-shock-path-boundaries.mjs';
const PACKAGE_PATH = 'package.json';
const CHECK_SUITE_PATH = 'scripts/check-suite.mjs';
const AUTHORITY_DOCS = [
  'docs/DATA_CONTRACT.md',
  'docs/DATA_SOURCES.md',
  'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md',
  'docs/OPERATIONS.md'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertScriptSafety() {
  const source = readFileSync(REVIEW_SCRIPT, 'utf8');
  for (const required of [
    'monitor-transport-shock-confirmation-factor-production-refresh.mjs',
    'monitor-transport-shock-confirmation-factor-runtime-score-policy.mjs',
    'monitor-transport-shock-confirmation-factor-score-readiness.mjs',
    'two_distinct_approval_layers_no_contradiction',
    'candidateEligibleForMainScore',
    'runPathBoundarySelfTests',
    'isTransportShockManualArtifactPath',
    'for (const protectedPath of [manualArtifactsPath, rootPath])',
    '--dry-run',
    '--no-output'
  ]) {
    assert(source.includes(required), `Path-boundary review must retain marker: ${required}`);
  }
  for (const forbidden of ['fetch(', 'https://', 'http://', 'writeFileSync(resolve(\'data', 'process.env.']) {
    assert(!source.includes(forbidden), `Path-boundary review contains forbidden runtime marker: ${forbidden}`);
  }
}

function runReview() {
  const result = spawnSync(
    process.execPath,
    [REVIEW_SCRIPT, '--dry-run', '--no-output', '--json'],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  assert(!result.error, `Path-boundary review failed to start: ${result.error?.message}`);
  assert(result.status === 0, `Path-boundary review failed: ${result.stderr || result.stdout}`);
  return JSON.parse(String(result.stdout || ''));
}

function assertReview(review) {
  assert(
    review.schemaVersion === 'transport-shock-path-boundary-review-v1',
    'Unexpected Transport Shock path-boundary schema'
  );
  assert(review.reviewOnly === true, 'Path-boundary output must remain review-only');
  assert(
    review.interpretation === 'two_distinct_approval_layers_no_contradiction',
    'Current paths must be identified as distinct approval layers'
  );
  assert(review.consistency?.noContradiction === true, 'Current path synthesis must be internally consistent');
  assert(review.consistency?.childMonitorsHealthy === true, 'All three source monitors must be healthy');
  assert(
    review.consistency?.cappedPathEligibilitySource === 'runtime_score_policy_snapshot',
    'Capped path eligibility must use the same runtime score-policy snapshot as its contribution'
  );

  const capped = review.paths?.cappedFreeProxyRuntime;
  assert(capped?.approvalLayer === 'approved_capped_runtime_policy', 'Capped path approval layer drifted');
  assert(['active', 'inactive'].includes(capped?.state), 'Capped runtime path must remain valid');
  assert(capped?.policyReviewPassed === true, 'Runtime policy review must pass');
  assert(Number.isFinite(capped?.contributionPct), 'Capped path contribution must be finite');
  assert(Number.isFinite(capped?.maxContributionPct), 'Capped path cap must be finite');
  assert(capped.maxContributionPct <= 3, 'Capped runtime path must not exceed +3');
  assert(capped.contributionPct >= 0 && capped.contributionPct <= capped.maxContributionPct, 'Contribution must stay within cap');
  if (capped.state === 'active') {
    assert(capped.eligibleForMainScore === true, 'An active capped path requires runtime eligibility');
    assert(capped.contributionPct > 0, 'An active capped path requires a nonzero contribution');
  }

  const confirmed = review.paths?.routeMarketConfirmedReadiness;
  assert(
    confirmed?.approvalLayer === 'route_market_confirmed_score_readiness',
    'Confirmed path approval layer drifted'
  );
  assert(
    ['blocked', 'ready_requires_separate_review'].includes(confirmed?.state),
    'Confirmed path state is unsupported'
  );
  if (confirmed.state === 'blocked') {
    assert(
      confirmed.routeFreightConfirmation === 'not_connected'
      || confirmed.marketConfirmation === 'not_connected'
      || confirmed.scoreReady === false,
      'Blocked confirmed path must expose its blocker'
    );
  }
  assert(confirmed.productionWriteApproved === false, 'Review must not approve production write');
  assert(confirmed.scoreWriteApproved === false, 'Review must not approve score write');
  assert(review.productionImpact?.writesProductionData === false, 'Review must not write production data');
  assert(review.productionImpact?.modifiesRuntimeScoring === false, 'Review must not modify runtime scoring');
  assert(review.productionImpact?.expandsScoreCap === false, 'Review must not expand score cap');
  assert(review.productionImpact?.connectsRouteFreightConfirmation === false, 'Review must not connect route confirmation');
  assert(review.productionImpact?.connectsMarketConfirmation === false, 'Review must not connect market confirmation');
}

function assertRegistrationAndDocs() {
  const packageText = readFileSync(PACKAGE_PATH, 'utf8');
  const suiteText = readFileSync(CHECK_SUITE_PATH, 'utf8');
  assert(
    packageText.includes('"review:transport-shock-path-boundaries"'),
    'package.json must register the path-boundary review'
  );
  assert(
    packageText.includes('"check:transport-shock-path-boundaries"'),
    'package.json must register the path-boundary check'
  );
  assert(
    suiteText.includes("'check:transport-shock-path-boundaries'"),
    'oil-directional check suite must include the path-boundary check'
  );
  for (const filePath of AUTHORITY_DOCS) {
    const text = readFileSync(filePath, 'utf8');
    assert(text.includes('transport-shock-path-boundary-review-v1'), `${filePath} must document the path-boundary review`);
  }
}

try {
  assertScriptSafety();
  assertRegistrationAndDocs();
  const review = runReview();
  assertReview(review);
  console.log('Transport Shock path-boundary review check: PASS');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
