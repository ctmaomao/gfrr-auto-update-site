import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCboeVixHistory } from '../../workers/gfrr-realtime-worker/src/index.js';
import {
  buildFredApiUrl,
  latestTwoFredApiValues,
} from '../../workers/gfrr-realtime-worker/src/worker-market-preview.js';

test('FRED Worker request asks only for the newest two observations', () => {
  const url = new URL(buildFredApiUrl('DGS10', '2026-06-01', 'test-key'));
  assert.equal(url.searchParams.get('series_id'), 'DGS10');
  assert.equal(url.searchParams.get('observation_start'), '2026-06-01');
  assert.equal(url.searchParams.get('sort_order'), 'desc');
  assert.equal(url.searchParams.get('limit'), '2');
});

test('FRED parser preserves latest and previous semantics for descending responses', () => {
  const parsed = latestTwoFredApiValues(JSON.stringify({
    observations: [
      { date: '2026-08-01', value: '4.25' },
      { date: '2026-07-31', value: '4.20' },
    ],
  }));
  assert.deepEqual(parsed, {
    latest: { timestamp: '2026-08-01', value: 4.25 },
    previous: { timestamp: '2026-07-31', value: 4.2 },
  });
});

test('VIX parser reads the newest valid row without materializing full CSV history', () => {
  const parsed = parseCboeVixHistory([
    'DATE,OPEN,HIGH,LOW,CLOSE',
    '07/30/2026,15,16,14,15.4',
    '07/31/2026,16,17,15,16.25',
    '',
  ].join('\r\n'));
  assert.deepEqual(parsed, { value: 16.25, observedAt: '07/31/2026' });
});
