import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeStructuralSignals } from '../../scripts/run-daily-pipeline.mjs';
import { formatOnRrpYiUsd } from '../../scripts/modules/format.js';

const rules = JSON.parse(fs.readFileSync(new URL('../../config/rules.json', import.meta.url), 'utf8'));
const threshold = rules.macroDrivers.fedLiquidity.onRrpCriticalThreshold;
const other = { key: 'curveDeepInversion', label: '曲线深度倒挂', detail: '10年-2年利差 -2.00', reliability: 'live' };
function fixture(value, status) {
  return {
    curve: { t10y2y: -2, sourceStatus: { t10y2y: 'live' } },
    fedLiquidity: { onRrp: value, sourceStatus: { onRrp: status } },
  };
}

test('ON RRP generator retains key, count, detail, source qualification and strict threshold', () => {
  for (const status of ['live', 'fallback']) {
    for (const value of [0, threshold / 2, threshold - 0.01]) {
      assert.deepEqual(activeStructuralSignals(fixture(value, status)), [other, {
        key: 'onRrpCritical', label: '隔夜逆回购余额偏低',
        detail: `ON RRP ${formatOnRrpYiUsd(value)}`, reliability: status,
      }]);
    }
  }
  for (const value of [threshold, threshold + 1, null, undefined, '', NaN]) {
    assert.deepEqual(activeStructuralSignals(fixture(value, 'live')), [other]);
  }
  for (const status of ['missing', 'stale', 'historical', undefined]) {
    assert.deepEqual(activeStructuralSignals(fixture(0, status)), [other]);
  }
});
