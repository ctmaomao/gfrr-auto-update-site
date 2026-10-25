import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCrossValidationMatrix } from '../../scripts/modules/buildCrossValidationMatrix.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MATRIX_PATH = `${ROOT}scripts/modules/buildCrossValidationMatrix.js`;
const CHECKER_PATH = `${ROOT}scripts/check-fed-liquidity-repo-spread.mjs`;

const OLD_DETAIL = 'BGCR/TGCR 回购利差指标未接入';
const NEW_DETAIL = 'BGCR/TGCR 回购利差证据不足，待核验';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function matrixFor(bgcrSofrSpread, { regime = '正常', sameDay = true } = {}) {
  const fedLiquidity = bgcrSofrSpread === undefined ? {} : {
    bgcrSofrSpread,
    repoSpreadRegime: regime,
    repoSpreadDateStatus: { bgcrSofr: sameDay ? 'same_day' : 'mismatch' },
  };
  return buildCrossValidationMatrix({
    displayInputsBaseline: {},
    macroDrivers: {
      fedLiquidity,
      credit: {},
      curve: {},
      consumer: {},
      employment: {},
    },
  }, {}, null);
}

function liquidityNarrative(matrix) {
  const narrative = matrix.narratives.find((item) => item.id === 'liquidity_tightening');
  assert.ok(narrative, 'real matrix must return the liquidity_tightening narrative');
  return narrative;
}

// The bucket is the array position on the real narrative object; rows are not given
// invented properties beyond the real evidence() shape.
function repoRows(matrix) {
  const narrative = liquidityNarrative(matrix);
  const rows = [];
  for (const bucket of ['supportingEvidence', 'contradictingEvidence', 'missingEvidence']) {
    for (const item of narrative[bucket]) {
      if (item.source === 'repo_stress') rows.push({ bucket, value: item.value, detail: item.detail });
    }
  }
  return rows;
}

test('null, undefined, empty string and NaN keep repo_stress as missingEvidence/null without zero-stress wording', () => {
  for (const bgcrSofrSpread of [null, undefined, '', Number.NaN]) {
    const narrative = liquidityNarrative(matrixFor(bgcrSofrSpread));
    const rows = repoRows(matrixFor(bgcrSofrSpread));
    assert.equal(rows.length, 1, `one repo_stress row for ${String(bgcrSofrSpread)}`);
    assert.equal(rows[0].bucket, 'missingEvidence');
    assert.equal(rows[0].value, null);
    assert.equal(rows[0].detail, NEW_DETAIL);
    assert.match(rows[0].detail, /证据不足，待核验/);
    assert.doesNotMatch(rows[0].detail, /未接入/);

    const allRows = narrative.supportingEvidence
      .concat(narrative.contradictingEvidence, narrative.missingEvidence);
    assert.equal(allRows.some((row) => row.source === 'repo_zero_stress'), false);
    assert.equal(allRows.some((row) => row.source === 'repo_stress' && row.value === '+0.0bp'), false);
  }
});

test('a real zero spread stays the normal classification, not missing evidence', () => {
  const narrative = liquidityNarrative(matrixFor(0));
  const rows = repoRows(matrixFor(0));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bucket, 'contradictingEvidence');
  assert.equal(rows[0].value, '+0.0bp');
  assert.match(rows[0].detail, /该回购利差处于既有正常档/);
  assert.match(rows[0].detail, /不支持由该利差推断流动性收紧/);
  assert.equal(
    narrative.missingEvidence.some((row) => row.source === 'repo_stress'),
    false,
    'a real zero must not be reported as missing evidence',
  );
});

test('5/10/25bp thresholds, near sides and positive/negative symmetry are unchanged', () => {
  const tiers = [
    { spread: 0.049, regime: '正常', bucket: 'contradictingEvidence', text: '该回购利差处于既有正常档' },
    { spread: 0.05, regime: '轻微偏离', bucket: 'supportingEvidence', text: '该回购利差处于既有「轻微偏离」档' },
    { spread: 0.099, regime: '轻微偏离', bucket: 'supportingEvidence', text: '该回购利差处于既有「轻微偏离」档' },
    { spread: 0.1, regime: '压力', bucket: 'supportingEvidence', text: '该回购利差处于既有「压力」档' },
    { spread: 0.249, regime: '压力', bucket: 'supportingEvidence', text: '该回购利差处于既有「压力」档' },
    { spread: 0.25, regime: '危机水平', bucket: 'supportingEvidence', text: '该回购利差处于既有「危机水平」档' },
    { spread: 0.3, regime: '危机水平', bucket: 'supportingEvidence', text: '该回购利差处于既有「危机水平」档' },
    { spread: -0.049, regime: '正常', bucket: 'contradictingEvidence', text: '该回购利差处于既有正常档' },
    { spread: -0.05, regime: '轻微偏离', bucket: 'supportingEvidence', text: '该回购利差处于既有「轻微偏离」档' },
    { spread: -0.099, regime: '轻微偏离', bucket: 'supportingEvidence', text: '该回购利差处于既有「轻微偏离」档' },
    { spread: -0.1, regime: '压力', bucket: 'supportingEvidence', text: '该回购利差处于既有「压力」档' },
    { spread: -0.249, regime: '压力', bucket: 'supportingEvidence', text: '该回购利差处于既有「压力」档' },
    { spread: -0.25, regime: '危机水平', bucket: 'supportingEvidence', text: '该回购利差处于既有「危机水平」档' },
    { spread: -0.3, regime: '危机水平', bucket: 'supportingEvidence', text: '该回购利差处于既有「危机水平」档' },
  ];

  for (const { spread, regime, bucket, text } of tiers) {
    const rows = repoRows(matrixFor(spread, { regime }));
    assert.equal(rows.length, 1, `one repo_stress row for ${spread}`);
    assert.equal(rows[0].bucket, bucket, `bucket for ${spread}`);
    assert.match(rows[0].detail, new RegExp(text), `detail tier for ${spread}`);
    const expectedValue = `${spread >= 0 ? '+' : ''}${(spread * 100).toFixed(1)}bp`;
    assert.equal(rows[0].value, expectedValue, `bp display for ${spread}`);
  }
});

test('matrix sentence and checker marker agree while retained classification assertions stay', () => {
  const matrixText = read(MATRIX_PATH);
  const checkerText = read(CHECKER_PATH);

  assert.ok(matrixText.includes(NEW_DETAIL), 'matrix must use the evidence-insufficient wording');
  assert.equal(matrixText.includes(OLD_DETAIL), false, 'matrix must not keep the unconnected wording');
  assert.ok(checkerText.includes(NEW_DETAIL), 'checker marker must match the new matrix sentence');
  assert.equal(checkerText.includes(OLD_DETAIL), false, 'checker must not lock the old wording');

  for (const marker of [
    'const bgcrSofrSpread = Number.isFinite(fed.bgcrSofrSpread) ? fed.bgcrSofrSpread : null;',
    '该回购利差处于既有「危机水平」档，支持流动性收紧观察',
    '该回购利差处于既有正常档，不支持由该利差推断流动性收紧',
    'SLOOS 大型企业贷款标准净收紧',
  ]) {
    assert.ok(matrixText.includes(marker), `retained matrix marker missing: ${marker}`);
  }
});
