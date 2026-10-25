import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const RENDER_PATH = `${ROOT}/scripts/modules/renderMacroOverview.js`;
const MATRIX_PATH = `${ROOT}/scripts/modules/buildCrossValidationMatrix.js`;

function pageQueryImport() {
  const renderSource = fs.readFileSync(RENDER_PATH, 'utf8');
  const renderImport = renderSource.match(/from\s+['"](\.\/buildCrossValidationMatrix\.js\?[^'"]+)['"]/u);
  assert.ok(renderImport, 'render must import the matrix with its actual page query');
  const matrixSource = fs.readFileSync(MATRIX_PATH, 'utf8');
  const narrativeImport = matrixSource.match(/from\s+['"](\.\/macroOverviewNarrative\.js\?[^'"]+)['"]/u);
  assert.ok(narrativeImport, 'matrix must import the helper with its actual page query');
  const matrixUrl = new URL(renderImport[1], pathToFileURL(RENDER_PATH));
  const narrativeUrl = new URL(narrativeImport[1], pathToFileURL(MATRIX_PATH));
  assert.equal(matrixUrl.search, narrativeUrl.search, 'matrix/helper queries must match');
  return matrixUrl.href;
}

const { buildCrossValidationMatrix } = await import(pageQueryImport());

function matrixFor({
  spread = null,
  regime = '正常',
  sameDay = true,
  vix = 15,
  tgcrSameDay = true,
  omitBgcr = false,
  omitRegime = false,
  omitDateStatus = false,
  fedOverrides = {},
} = {}) {
  const fedLiquidity = { ...fedOverrides };
  if (!omitBgcr) fedLiquidity.bgcrSofrSpread = spread;
  if (!omitRegime) fedLiquidity.repoSpreadRegime = regime;
  if (!omitDateStatus) {
    fedLiquidity.repoSpreadDateStatus = {
      bgcrSofr: sameDay ? 'same_day' : 'mismatch',
      tgcrSofr: tgcrSameDay ? 'same_day' : 'mismatch',
    };
  }
  return buildCrossValidationMatrix({
    displayInputsBaseline: { vix },
    macroDrivers: {
      fedLiquidity,
      credit: {},
      curve: {},
      consumer: {},
      employment: {},
    },
  }, {}, null);
}

const TARGETS = {
  risk: ['risk_asset_mismatch', 'repo_vix_mismatch'],
  overheat: ['overheat_confirmation', 'repo_zero_stress'],
  liquidity: ['liquidity_tightening', 'repo_stress'],
};

function rowsFor(matrix, key) {
  const [narrativeId, source] = TARGETS[key];
  const narrative = matrix.narratives.find((item) => item.id === narrativeId);
  assert.ok(narrative, `missing narrative ${narrativeId}`);
  const rows = [];
  for (const bucket of ['supportingEvidence', 'contradictingEvidence', 'missingEvidence']) {
    for (const item of narrative[bucket]) {
      if (item.source === source) rows.push({ bucket, value: item.value, detail: item.detail });
    }
  }
  return rows;
}

function assertAllPending(matrix, label) {
  for (const key of Object.keys(TARGETS)) {
    const rows = rowsFor(matrix, key);
    assert.equal(rows.length, 1, `${label}: ${key} should have exactly one row`);
    assert.equal(rows[0].bucket, 'missingEvidence', `${label}: ${key} must be missing`);
    assert.equal(rows[0].value, null, `${label}: ${key} value must be null`);
  }
}

test('three consumers keep current sample text limited to the spread', () => {
  const matrix = matrixFor({ spread: -0.02, regime: '正常', vix: 15 });
  assert.equal(rowsFor(matrix, 'risk').length, 0);
  const overheat = rowsFor(matrix, 'overheat');
  assert.equal(overheat.length, 1);
  assert.equal(overheat[0].bucket, 'supportingEvidence');
  assert.match(overheat[0].detail, /该回购利差处于既有正常档（BGCR-SOFR -2\.0bp），为过热观察提供有限支持/);
  const liquidity = rowsFor(matrix, 'liquidity');
  assert.equal(liquidity.length, 1);
  assert.equal(liquidity[0].bucket, 'contradictingEvidence');
  assert.match(liquidity[0].detail, /该回购利差处于既有正常档，不支持由该利差推断流动性收紧/);
  for (const rows of [overheat, liquidity]) {
    assert.doesNotMatch(rows[0].detail, /整个回购市场|流动性充裕|回购市场正常运行|回购市场压力显著确认/);
  }
});

test('missing, malformed, wrong-day, unknown-regime and conflicting inputs stay missing', () => {
  const malformed = [null, undefined, '', false, true, [], {}, '0.02', Number.NaN];
  for (const spread of malformed) {
    assertAllPending(matrixFor({ spread }), `malformed ${String(spread)}`);
  }
  assertAllPending(matrixFor({ spread: -0.02, sameDay: false }), 'mismatched date');
  assertAllPending(matrixFor({ spread: -0.02, omitDateStatus: true }), 'missing dateStatus');
  assertAllPending(matrixFor({ spread: -0.02, omitBgcr: true }), 'missing bgcrSofr key');
  assertAllPending(matrixFor({ omitBgcr: true, fedOverrides: { bgcrSofrSpread: undefined } }), 'true undefined spread');
  assertAllPending(matrixFor({ spread: -0.02, omitRegime: true }), 'missing regime');
  assertAllPending(matrixFor({ spread: -0.02, regime: '未知' }), 'unknown regime');
  assertAllPending(matrixFor({ spread: 0.05, regime: '正常' }), 'raw 5bp with normal regime');
  assertAllPending(matrixFor({ spread: 0.049, regime: '轻微偏离' }), 'raw 4.9bp with mild regime');
  assertAllPending(matrixFor({ spread: 0.09999, regime: '压力' }), 'raw 9.999bp with pressure regime');
  assertAllPending(matrixFor({ spread: 0.24999, regime: '危机水平' }), 'raw 24.999bp with crisis regime');
  assertAllPending(matrixFor({ spread: 0.1, regime: '轻微偏离' }), 'raw 10bp with mild regime');
  assertAllPending(matrixFor({ spread: 0.25, regime: '压力' }), 'raw 25bp with pressure regime');
  assertAllPending(matrixFor({ spread: -0.02, regime: '正常', sameDay: false, tgcrSameDay: false }), 'both dates wrong');
});

test('TGCR mismatch does not gate a qualified BGCR spread', () => {
  const matrix = matrixFor({ spread: -0.02, regime: '正常', vix: 15, tgcrSameDay: false });
  assert.equal(rowsFor(matrix, 'risk').length, 0);
  assert.equal(rowsFor(matrix, 'overheat')[0].bucket, 'supportingEvidence');
  assert.equal(rowsFor(matrix, 'liquidity')[0].bucket, 'contradictingEvidence');
});

test('raw boundaries 0/2.999/4.999/5/9.999/10/14.999/24.999/25 preserve thresholds', () => {
  const normal = [
    [0, '正常'], [0.02, '正常'], [0.02999, '正常'], [0.049, '正常'], [0.04999, '正常'],
  ];
  for (const [spread, regime] of normal) {
    const matrix = matrixFor({ spread, regime, vix: 15 });
    assert.equal(rowsFor(matrix, 'overheat').length, Math.abs(spread) < 0.03 ? 1 : 0, `normal ${spread} overheat`);
    assert.equal(rowsFor(matrix, 'liquidity')[0].bucket, 'contradictingEvidence', `normal ${spread} liquidity`);
  }

  const twoPointNineNineNine = matrixFor({ spread: 0.02999, regime: '正常', vix: 15 });
  assert.equal(rowsFor(twoPointNineNineNine, 'overheat')[0].bucket, 'supportingEvidence');
  assert.match(rowsFor(twoPointNineNineNine, 'overheat')[0].value, /\+3\.0bp/);
  assert.equal(rowsFor(twoPointNineNineNine, 'liquidity')[0].bucket, 'contradictingEvidence');

  const fourPointNineNineNine = matrixFor({ spread: 0.04999, regime: '正常', vix: 15 });
  assert.equal(rowsFor(fourPointNineNineNine, 'risk').length, 0);
  assert.equal(rowsFor(fourPointNineNineNine, 'overheat').length, 0);
  assert.equal(rowsFor(fourPointNineNineNine, 'liquidity')[0].bucket, 'contradictingEvidence');

  for (const [spread, regime, overheatBucket] of [
    [0.05, '轻微偏离', null], [0.099, '轻微偏离', null], [0.09999, '轻微偏离', null],
    [0.1, '压力', 'contradictingEvidence'], [0.249, '压力', 'contradictingEvidence'],
    [0.24999, '压力', 'contradictingEvidence'],
    [0.25, '危机水平', 'contradictingEvidence'], [0.3, '危机水平', 'contradictingEvidence'],
  ]) {
    const matrix = matrixFor({ spread, regime, vix: 15 });
    const overheat = rowsFor(matrix, 'overheat');
    assert.equal(overheat.length, overheatBucket === null ? 0 : 1, `overheat ${spread}`);
    if (overheatBucket) assert.equal(overheat[0].bucket, overheatBucket, `overheat bucket ${spread}`);
    assert.equal(rowsFor(matrix, 'liquidity')[0].bucket, 'supportingEvidence', `liquidity ${spread}`);
    if (overheatBucket) assert.match(overheat[0].detail, /是过热叙事的反向证据/);
  }

  const nineNineNine = matrixFor({ spread: 0.09999, regime: '轻微偏离', vix: 15 });
  assert.equal(rowsFor(nineNineNine, 'overheat').length, 0);
  assert.match(rowsFor(nineNineNine, 'liquidity')[0].value, /\+10\.0bp/);
  assert.equal(rowsFor(nineNineNine, 'liquidity')[0].bucket, 'supportingEvidence');
  const twentyFourNine = matrixFor({ spread: 0.24999, regime: '压力', vix: 15 });
  assert.match(rowsFor(twentyFourNine, 'liquidity')[0].value, /\+25\.0bp/);
  assert.equal(rowsFor(twentyFourNine, 'liquidity')[0].bucket, 'supportingEvidence');
  assert.doesNotMatch(rowsFor(twentyFourNine, 'liquidity')[0].detail, /危机水平/);
});

test('14.999bp and risk VIX 16/20/25 boundaries keep the original thresholds', () => {
  const riskAt = (vix) => rowsFor(matrixFor({ spread: 0.14999, regime: '压力', vix }), 'risk');
  const at16 = riskAt(16);
  assert.equal(at16.length, 1);
  assert.equal(at16[0].bucket, 'supportingEvidence');
  assert.match(at16[0].detail, /该利差与波动率读数出现背离/);
  assert.equal(riskAt(20).length, 0);
  assert.equal(riskAt(25).length, 0);
  const at15 = rowsFor(matrixFor({ spread: 0.15, regime: '压力', vix: 15.999 }), 'risk');
  assert.equal(at15.length, 1);
  assert.equal(at15[0].bucket, 'supportingEvidence');
  assert.match(at15[0].detail, /该利差与波动率读数明显背离/);

  const lowAt25 = rowsFor(matrixFor({ spread: 0.02, regime: '正常', vix: 25.001 }), 'risk');
  assert.equal(lowAt25.length, 1);
  assert.equal(lowAt25[0].bucket, 'contradictingEvidence');
  assert.match(lowAt25[0].detail, /该回购利差处于既有正常档/);
  assert.equal(rowsFor(matrixFor({ spread: 0.02, regime: '正常', vix: 25 }), 'risk').length, 0);
});

test('positive/negative symmetry and no whole-market wording', () => {
  for (const sign of [-1, 1]) {
    const matrix = matrixFor({ spread: sign * 0.15, regime: '压力', vix: 15.5 });
    const risk = rowsFor(matrix, 'risk');
    assert.equal(risk.length, 1, `risk ${sign}`);
    assert.equal(risk[0].bucket, 'supportingEvidence');
    assert.doesNotMatch(risk[0].detail, /整个回购市场|回购市场显著压力/);
    const overheat = rowsFor(matrix, 'overheat');
    assert.equal(overheat.length, 1);
    assert.equal(overheat[0].bucket, 'contradictingEvidence');
    assert.match(overheat[0].detail, /该回购利差处于既有「压力」档（BGCR-SOFR [+-]15\.0bp），是过热叙事的反向证据/);
    const liquidity = rowsFor(matrix, 'liquidity');
    assert.equal(liquidity.length, 1);
    assert.equal(liquidity[0].bucket, 'supportingEvidence');
  }
});
