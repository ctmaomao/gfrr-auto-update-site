import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildCrossValidationMatrix } from '../../scripts/modules/buildCrossValidationMatrix.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function extractNfciClassifier() {
  const source = fs.readFileSync(`${ROOT}scripts/run-daily-pipeline.mjs`, 'utf8');
  const start = source.indexOf('function classifyNfciRegime');
  const end = source.indexOf('\nfunction ', start + 10);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`${source.slice(start, end)}\nclassifyNfciRegime`, {});
}

function evidenceText(matrix) {
  return matrix.narratives.flatMap((narrative) => [
    ...narrative.supportingEvidence,
    ...narrative.missingEvidence,
    ...narrative.contradictingEvidence,
  ]).map((row) => `${row.detail} ${row.value ?? ''}`).join('\n');
}

test('real classifyNfciRegime keeps higher NFCI as tighter across boundaries', () => {
  const classify = extractNfciClassifier();
  assert.equal(classify(0.5), '显著收紧');
  assert.equal(classify(0.499), '温和收紧');
  assert.equal(classify(0.1), '温和收紧');
  assert.equal(classify(0.099), '中性');
  assert.equal(classify(0), '中性');
  assert.equal(classify(-0.1), '中性');
  assert.equal(classify(-0.1001), '温和宽松');
  assert.equal(classify(-0.5), '温和宽松');
  assert.equal(classify(-0.5001), '显著宽松');
  assert.equal(classify(null), '未知');
  assert.equal(classify(Number.NaN), '未知');
  assert.equal(classify(Infinity), '未知');
  assert.equal(classify('0.5'), '未知');
});

test('real matrix reports tightening for positive NFCI and easing for negative', () => {
  const positive = buildCrossValidationMatrix({
    macroDrivers: { credit: { nfci: 1, nfciRegime: '显著收紧', hyOas: 3, igOas: 1 }, fedLiquidity: {}, curve: {}, consumer: {}, employment: {} },
  }, {}, null);
  assert.match(evidenceText(positive), /NFCI.*收紧/);
  assert.doesNotMatch(evidenceText(positive), /NFCI.*宽松/);

  const negative = buildCrossValidationMatrix({
    macroDrivers: { credit: { nfci: -1, nfciRegime: '显著宽松', hyOas: 3, igOas: 1 }, fedLiquidity: {}, curve: {}, consumer: {}, employment: {} },
  }, {}, null);
  assert.match(evidenceText(negative), /NFCI.*宽松/);
  assert.doesNotMatch(evidenceText(negative), /NFCI.*收紧/);
});

test('contract and source docs state the correct direction and not the old opposite claim', () => {
  const contract = fs.readFileSync(`${ROOT}docs/DATA_CONTRACT.md`, 'utf8');
  const sources = fs.readFileSync(`${ROOT}docs/DATA_SOURCES.md`, 'utf8');
  assert.match(contract, /NFCI 与 igOas\/hyOas 均为数值越高越紧/);
  assert.doesNotMatch(contract, /NFCI 0 轴方向与 igOas\/hyOas 相反/);
  assert.match(contract, /`偏紧`\/`偏松`/);
  assert.match(sources, /与 IG\/HY OAS 同向/);
  assert.doesNotMatch(sources, /方向与 IG\/HY OAS 相反/);
});
