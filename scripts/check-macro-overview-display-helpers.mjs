import assert from 'node:assert/strict';

import {
  brentModeZh,
  moduleTone,
  riskBiasZh,
  sourceModeZh,
  trendArrow,
  worldOrderStateLabel,
} from './modules/macroOverviewDisplayHelpers.js';

function assertCases(name, fn, cases) {
  for (const [input, expected] of cases) {
    assert.equal(fn(...input), expected, `${name}(${input.map((value) => String(value)).join(', ')})`);
  }
}

assertCases('moduleTone', moduleTone, [
  [[70], 'red'],
  [[50], 'yellow'],
  [[49.99], 'green'],
  [[null], null],
  [[undefined], null],
  [[Number.NaN], null],
  [['70'], null],
]);

assertCases('trendArrow', trendArrow, [
  [[3], '↑'],
  [[-3], '↓'],
  [[2], '→'],
  [[-2], '→'],
  [[0], '→'],
  [[null], '→'],
  [[undefined], '→'],
  [[Number.NaN], '→'],
]);

assertCases('sourceModeZh', sourceModeZh, [
  [['live'], '实时'],
  [['cache-only'], '缓存'],
  [['worker-generated-preview'], 'Worker 主预览'],
  [[' custom-mode '], 'custom-mode'],
  [[null], '—'],
  [[undefined], '—'],
  [['   '], '—'],
]);

assertCases('brentModeZh', brentModeZh, [
  [['public_proxy_observation'], '公开代理观察'],
  [[' custom-brent-mode '], 'custom-brent-mode'],
  [[null], '—'],
  [[undefined], '—'],
  [[''], '—'],
]);

assertCases('worldOrderStateLabel', worldOrderStateLabel, [
  [['multi_theater_stress', null], '多战区压力期'],
  [['war_economy_stress', null], '战时经济压力期'],
  [['unknown_state', null], '状态待确认'],
  [[null, null], '状态待确认'],
  [[undefined, undefined], '状态待确认'],
  [['normal', ' 自定义状态 '], '自定义状态'],
]);

assertCases('riskBiasZh', riskBiasZh, [
  [['upward'], '上修偏置'],
  [['neutral'], '中性'],
  [['downward'], '下修偏置'],
  [[' custom-bias '], 'custom-bias'],
  [[null], '—'],
  [[undefined], '—'],
  [[''], '—'],
]);

console.log('Macro Overview display helpers characterization: PASS (6 helpers)');
