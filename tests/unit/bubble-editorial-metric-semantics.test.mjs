import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { explicitSpreadUnitError } from '../../scripts/bubble-watch/weekly-editorial-metric-semantics.mjs';
import { validateWeeklyEditorialOutput } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
const claim = detailZh => ({ detailZh, sourceRefIds: ['indicator:spy_vs_rsp_6m'], sourceIndicatorIds: ['spy_vs_rsp_6m'] });

test('only explicit SPY/RSP difference-percent confusion is newly rejected', () => {
  for (const text of ['SPY−RSP -6.5%', 'SPY-RSP 为 -6.5%', 'SPY vs RSP收益差 -6.5%', '市值加权相对等权重落后6.5%']) assert.equal(explicitSpreadUnitError(claim(text)), true, text);
  for (const text of ['SPY−RSP -6.5 个百分点', 'SPY +1.8% vs RSP +8.3%', 'SPY与RSP回报为1.8%与8.3%', '市场广度35%，收益差需分别核对。']) assert.equal(explicitSpreadUnitError(claim(text)), false, text);
  assert.equal(explicitSpreadUnitError({ detailZh: '其它指标差值5%' }), false);
});

test('full output gate catches explicit wrong spread unit even in indicator-only prose', () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../../docs/fixtures/bubble-watch-weekly-editorial/${name}.json`, import.meta.url)));
  const input = read('sample-input-v1'); const output = read('sample-output-v1');
  Object.assign(output.categoryAnalysis[0], claim('SPY−RSP -6.5%'));
  const result = validateWeeklyEditorialOutput(output, input);
  assert.ok(result.errors.some(error => error.includes('percentage points, not percent')));
  Object.assign(output.categoryAnalysis[0], claim('SPY−RSP -6.5 个百分点'));
  assert.ok(!validateWeeklyEditorialOutput(output, input).errors.some(error => error.includes('percentage points, not percent')));
});


test('malformed source containers return validation errors rather than throwing', () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../../docs/fixtures/bubble-watch-weekly-editorial/${name}.json`, import.meta.url)));
  for (const key of ['sourceRefIds', 'sourceIndicatorIds']) {
    const input = read('sample-input-v1'); const output = read('sample-output-v1');
    output.categoryAnalysis[0][key] = {};
    assert.doesNotThrow(() => validateWeeklyEditorialOutput(output, input));
    assert.equal(explicitSpreadUnitError({ [key]: {}, detailZh: 'SPY−RSP -6.5%' }), false);
  }
});
