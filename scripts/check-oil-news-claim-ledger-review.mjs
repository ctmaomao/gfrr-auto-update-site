import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/oil-directional/review-oil-news-claim-ledger.mjs';
const FIXTURE_A = 'docs/fixtures/oil-news/oil-news-event-watch-sample-a.json';
const FIXTURE_B = 'docs/fixtures/oil-news/oil-news-event-watch-sample-b.json';

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
  'security_risk_vs_supply_flow_split',
  'transport_security_risk_elevated_while_supply_flow_deescalates'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Oil News claim-ledger review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of [
    'CLAIM_AXES',
    'claimAxis',
    'axisCounts',
    'axisSplit',
    'security_risk_vs_supply_flow_split',
    'no headline display approval'
  ]) {
    assert(source.includes(marker), `Claim-ledger review script missing marker: ${marker}`);
  }
  for (const forbidden of [
    'process.env',
    'fetch(',
    'https.request',
    'http.request',
    'axios',
    'node:https',
    'node:http',
    'market.worker-preview.json'
  ]) {
    assert(!source.includes(forbidden), `Claim-ledger review script contains forbidden marker: ${forbidden}`);
  }
}

function assertReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    FIXTURE_A,
    '--input',
    FIXTURE_B,
    '--min-samples',
    '2',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.reviewVersion === 'oil-news-claim-ledger-p52', 'Unexpected claim-ledger reviewVersion.');
  assert(review.promotionEligible === false, 'Claim-ledger must not be promotion eligible.');
  assert(review.productionDisplayApproved === false, 'Claim-ledger must not approve production display.');
  assert(review.claimAxisCounts && typeof review.claimAxisCounts === 'object', 'Missing claimAxisCounts.');
  assert(review.axisCounts && typeof review.axisCounts === 'object', 'Missing axisCounts.');
  assert(review.axisSplit && typeof review.axisSplit === 'object', 'Missing axisSplit.');
  assert(review.axisSplit.state === 'not_needed', 'Basic fixture should not require axis split.');
  assert(review.axisSplit.supportsOperatorReview === false, 'Basic fixture should not support operator review.');
  assert(Array.isArray(review.axisSplit.doesNotConfirm), 'axisSplit must carry doesNotConfirm boundaries.');
  assert(review.axisSplit.doesNotConfirm.includes('oil_price_direction'), 'axisSplit must not confirm oil price direction.');
  assert(review.claimAxisCounts.transport_security === 2, 'Expected fixture claims to map to transport_security axis.');
  assert(review.axisCounts.transport_security.total === 2, 'Expected transport_security total count.');
  assert(review.representativeClaims.every((claim) => claim.claimAxis === 'transport_security'), 'Representative claims must include claimAxis.');
  assert(review.sampleOutcomes.every((sample) => sample.claimAxisCounts?.transport_security === 1), 'Sample outcomes must include claimAxisCounts.');
  assert(!JSON.stringify(review).includes('Hormuz Tanker Traffic'), 'Review must not serialize raw headline text.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains claim-axis marker and may have been wired too early: ${marker}`);
    }
  }
}

function main() {
  assertScriptSafety();
  assertReviewOutput();
  assertRuntimeRemainsUnwired();
  console.log('Oil News claim-ledger review axis split: PASS');
}

main();
