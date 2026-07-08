import { readJson } from './lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FINAL_BIAS_VALUES } from './oil-directional/odp-classifier.mjs';

const ROOT = process.cwd();
const RENDERER_PATH = 'scripts/modules/renderOilDirectional.js';
const ODP_DATA_PATH = 'data/oil-directional-pressure.json';
const NONZERO_FIXTURE_PATH =
  'docs/fixtures/transport-shock-confirmation-factor/qa-matrix-nonzero-runtime-score-v1.json';
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-runtime-score-policy.mjs';

const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function parseMapKeys(source, mapName) {
  const match = source.match(new RegExp(`const ${mapName} = \\{([\\s\\S]*?)\\};`));
  if (!match) {
    fail(`${mapName} map not found in ${RENDERER_PATH}`);
    return [];
  }
  return [...match[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map((item) => item[1]);
}

function parseSwitchCaseKeys(source, functionName) {
  const match = source.match(new RegExp(`function ${functionName}\\([\\s\\S]*?\\n\\}`));
  if (!match) {
    fail(`${functionName} not found in ${RENDERER_PATH}`);
    return [];
  }
  return [...match[0].matchAll(/case '([^']+)':/g)].map((item) => item[1]);
}

function assertExactEnumSet(label, observed, expected) {
  const observedSet = new Set(observed);
  const expectedSet = new Set(expected);
  for (const value of expectedSet) {
    if (!observedSet.has(value)) fail(`${label} missing finalBias enum: ${value}`);
  }
  for (const value of observedSet) {
    if (!expectedSet.has(value)) fail(`${label} has unknown finalBias enum: ${value}`);
  }
}

function runReviewOnFixture() {
  const result = spawnSync(process.execPath, [
    REVIEW_SCRIPT,
    '--input',
    NONZERO_FIXTURE_PATH,
    '--no-output',
    '--json'
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) {
    fail(`runtime score policy review failed to start: ${result.error.message}`);
    return null;
  }
  if (result.status !== 0) {
    fail(`runtime score policy review failed: ${result.stderr || result.stdout}`);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`runtime score policy review did not return JSON: ${error.message}`);
    return null;
  }
}

function validateFinalBiasMatrix() {
  const renderer = readText(RENDERER_PATH);
  const oilData = readJson(ODP_DATA_PATH);
  assertExactEnumSet('FINAL_BIAS_ZH', parseMapKeys(renderer, 'FINAL_BIAS_ZH'), FINAL_BIAS_VALUES);
  assertExactEnumSet('FINAL_BIAS_TONE', parseMapKeys(renderer, 'FINAL_BIAS_TONE'), FINAL_BIAS_VALUES);
  assertExactEnumSet('buildHeadline switch', parseSwitchCaseKeys(renderer, 'buildHeadline'), FINAL_BIAS_VALUES);
  if (!FINAL_BIAS_VALUES.includes(oilData.finalBias)) {
    fail(`production ODP finalBias is outside classifier enum: ${oilData.finalBias}`);
  }
  if (!FINAL_BIAS_VALUES.includes(oilData?.interpretation?.finalBias)) {
    fail(`production ODP interpretation.finalBias is outside classifier enum: ${oilData?.interpretation?.finalBias}`);
  }
  if (oilData.finalBias !== oilData?.interpretation?.finalBias) {
    fail(`production ODP finalBias mismatch: ${oilData.finalBias} vs ${oilData?.interpretation?.finalBias}`);
  }
}

function validateTransportShockNonzeroMatrix() {
  const fixture = readJson(NONZERO_FIXTURE_PATH);
  const review = runReviewOnFixture();
  const impact = fixture.transportShockScoringImpact;
  if (fixture.fixtureOnly !== true || fixture.productionWriteApproved !== false) {
    fail('Transport Shock nonzero QA fixture must stay fixture-only and not production-approved');
  }
  if (fixture.boundaries?.touchesBubbleWatch !== false) {
    fail('Transport Shock nonzero QA fixture must explicitly avoid Bubble Watch');
  }
  if (impact?.runtimeScoringAuthorized !== true) {
    fail('Transport Shock nonzero QA fixture must preserve runtimeScoringAuthorized=true');
  }
  if (impact?.applied !== true || impact?.contributionPct !== 3 || impact?.maxContributionPct !== 3) {
    fail('Transport Shock nonzero QA fixture must cover an applied +3/+3 contribution');
  }
  if (impact?.scoreAfterTransport - impact?.scoreBeforeTransport !== 3) {
    fail('Transport Shock nonzero QA fixture score delta must be exactly +3');
  }
  if (impact?.guards?.routeFreightConfirmationConnected !== false || impact?.guards?.marketConfirmationConnected !== false) {
    fail('Transport Shock nonzero QA fixture must keep route and market confirmation disconnected');
  }
  if (!review) return;
  if (review.status !== fixture.expectedReview.status) {
    fail(`Transport Shock nonzero review status mismatch: ${review.status}`);
  }
  if (review.scorePolicyReviewPassed !== true || review.blockerCount !== 0) {
    fail('Transport Shock nonzero review must pass with zero blockers');
  }
  const obs = review.currentObservation || {};
  if (obs.runtimeScoringAuthorized !== true) fail('Transport Shock review must observe runtimeScoringAuthorized=true');
  if (obs.contributionPct !== fixture.expectedReview.contributionPct) {
    fail(`Transport Shock review contribution mismatch: ${obs.contributionPct}`);
  }
  if (obs.maxContributionPct !== fixture.expectedReview.maxContributionPct) {
    fail(`Transport Shock review max contribution mismatch: ${obs.maxContributionPct}`);
  }
  if (obs.scoreAfterTransport - obs.scoreBeforeTransport !== fixture.expectedReview.scoreDelta) {
    fail('Transport Shock review score delta must remain capped at +3');
  }
  if (obs.guards?.routeFreightConfirmationConnected !== false || obs.guards?.marketConfirmationConnected !== false) {
    fail('Transport Shock review must keep route and market confirmation disconnected');
  }
  if (review.approvals?.scoreExpansionApproved !== false || review.approvals?.runtimeChangeApproved !== false) {
    fail('Transport Shock review must not approve score expansion or runtime change');
  }
  if (review.productionImpact?.affectsOdpFinalBias !== false || review.productionImpact?.affectsBubbleWatch !== false) {
    fail('Transport Shock review must not affect ODP finalBias or Bubble Watch');
  }
}

validateFinalBiasMatrix();
validateTransportShockNonzeroMatrix();

if (errors.length > 0) {
  console.error('Oil Directional Pressure QA matrix check FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Oil Directional Pressure QA matrix: PASS (${FINAL_BIAS_VALUES.length} finalBias enums; Transport Shock nonzero +3 fixture replayed)`);
