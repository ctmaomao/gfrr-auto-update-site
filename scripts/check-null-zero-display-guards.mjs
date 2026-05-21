import fs from 'node:fs';
import path from 'node:path';

import { buildCrossValidationMatrix } from './modules/buildCrossValidationMatrix.js';

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function fail(message) {
  console.error(`Null-zero display guard failed: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function flattenEvidence(matrix) {
  const rows = [];
  for (const narrative of matrix.narratives || []) {
    for (const bucket of ['supportingEvidence', 'contradictingEvidence', 'missingEvidence']) {
      for (const item of narrative[bucket] || []) {
        rows.push({
          narrative: narrative.key,
          bucket,
          source: item.source,
          value: item.value,
          detail: item.detail,
        });
      }
    }
  }
  return rows;
}

function assertRepoMissingStaysMissing() {
  const radarData = readJson('data/radar-data.json');
  const worldOrderStress = readJson('data/world-order-stress.json');
  const marketPricingMetrics = readJson('data/market-pricing-metrics.json');
  const fedLiquidity = radarData?.macroDrivers?.fedLiquidity || {};
  const sourceStatus = fedLiquidity.sourceStatus || {};

  assert(sourceStatus.bgcr === 'missing', 'fixture expectation changed: bgcr sourceStatus should be missing.');
  assert(sourceStatus.tgcr === 'missing', 'fixture expectation changed: tgcr sourceStatus should be missing.');
  assert(fedLiquidity.bgcrSofrSpread === null, 'fixture expectation changed: bgcrSofrSpread should be null.');

  const matrix = buildCrossValidationMatrix(radarData, worldOrderStress, marketPricingMetrics);
  const rows = flattenEvidence(matrix);
  const renderedEvidence = rows
    .map((row) => `${row.narrative} ${row.bucket} ${row.source} ${row.value ?? ''} ${row.detail ?? ''}`)
    .join('\n');

  assert(
    !renderedEvidence.includes('BGCR-SOFR +0.0bp'),
    'missing BGCR-SOFR spread must not render as BGCR-SOFR +0.0bp.'
  );
  assert(
    !rows.some((row) => row.source === 'repo_zero_stress'),
    'missing BGCR-SOFR spread must not create repo_zero_stress evidence.'
  );
  assert(
    !rows.some((row) => row.source === 'repo_stress' && row.value === '+0.0bp'),
    'missing BGCR-SOFR spread must not create repo_stress +0.0bp evidence.'
  );
  assert(
    rows.some((row) => row.source === 'repo_stress' && row.bucket === 'missingEvidence' && row.value === null),
    'missing BGCR/TGCR spread should remain missingEvidence with null value.'
  );
}

function assertBrentMissingValueStaysMissing() {
  const radarData = readJson('data/radar-data.json');
  const iceSource = (radarData?.brentPricingLayer?.confirmationSources || [])
    .find((source) => source?.source === 'ice');

  assert(iceSource, 'fixture expectation changed: ICE Brent diagnostic source is missing from committed data.');
  assert(iceSource.status === 'missing', 'fixture expectation changed: ICE Brent diagnostic should be missing.');
  assert(iceSource.value === null, 'fixture expectation changed: ICE Brent diagnostic value should be null.');

  const renderSource = readText('scripts/modules/render.js');
  const brentFormatterMatch = renderSource.match(/function formatBrentValue\(value, digits = 2\) \{[\s\S]*?\n\}/u);

  assert(brentFormatterMatch, 'formatBrentValue function not found.');
  assert(
    brentFormatterMatch[0].includes('value === null') && brentFormatterMatch[0].includes('value === void 0'),
    'formatBrentValue must explicitly guard missing values before Number(value).'
  );
  assert(
    brentFormatterMatch[0].includes("typeof value === 'string'") && brentFormatterMatch[0].includes("value.trim() === ''"),
    'formatBrentValue must explicitly guard empty strings before Number(value).'
  );
}

function main() {
  assertRepoMissingStaysMissing();
  assertBrentMissingValueStaysMissing();
  console.log('Null-zero display guard: PASS');
}

main();
