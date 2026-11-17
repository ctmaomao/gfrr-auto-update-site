import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchEiaSeries as fetchPressure, buildEiaEvidence } from '../../scripts/oil-directional/build-oil-directional-pressure.mjs';
import { fetchEiaSeries as fetchHistory } from '../../scripts/oil-directional/build-oil-directional-history.mjs';
const cfg = { id: 'WCESTUS1', unit: 'thousand barrels', signalGroup: 'inventoryDrawPressure' };
const rows = value => [{ period: '2026-11-13', value: 20 }, { period: '2026-11-06', value }, { period: '2026-10-30', value: 10 }];
async function mocked(body, run) {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; assert.ok(url.startsWith('https://api.eia.gov/v2/seriesid/PET.WCESTUS1.W?api_key='));
    assert.equal(options.headers['User-Agent'], 'GFRRBot/1.0'); assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => body };
  };
  try { await run(); assert.equal(calls, 2); } finally { globalThis.fetch = original; }
}
const payload = data => ({ response: { data, frequency: 'weekly' } });
test('both real EIA fetch paths reject coercible missing/boolean/array values without bridging the middle row', async () => {
  for (const value of [null, undefined, true, false, [], [7], {}, '', ' ', '\t\n', '.', 'NaN', 'Infinity', Infinity, NaN, '0x10', '1,234']) {
    await mocked(payload(rows(value)), async () => {
      const live = await fetchPressure(cfg.id), history = await fetchHistory(cfg.id);
      for (const fetched of [live, history]) {
        assert.equal(fetched.ok, false, `value type ${typeof value}`);
        assert.equal(fetched.reason, 'invalid_observation'); assert.equal(fetched.series, undefined);
      }
      const [evidence, season] = buildEiaEvidence(cfg, live, Date.parse('2026-11-17T00:00:00Z'));
      assert.equal(evidence.sourceStatus, 'missing'); assert.equal(evidence.value, null);
      for (const field of ['change1w', 'change4w', 'change13w']) assert.equal(evidence[field], null);
      assert.equal(evidence.historyWeeks, 0); assert.equal(season, null);
    });
  }
});
test('both paths preserve decimal numbers/strings, genuine zero and sorted valid history', async () => {
  for (const value of [0, '0', ' 0.0 ', '-2.5', '+3.25', '.5', '1e2', 17.25]) {
    const data = rows(value).map(row => ({ ...row, extraProviderMetadata: 'retained outside projection' }));
    await mocked(payload(data), async () => {
      const live = await fetchPressure(cfg.id), history = await fetchHistory(cfg.id);
      assert.equal(live.ok, true); assert.equal(history.ok, true); assert.equal(live.frequency, 'weekly');
      assert.deepEqual(live.series, history.series);
      assert.deepEqual(live.series.map(r => r.period), ['2026-10-30', '2026-11-06', '2026-11-13']);
      assert.equal(live.series[1].value, Number(value));
      const [evidence] = buildEiaEvidence(cfg, live, Date.parse('2026-11-17T00:00:00Z'));
      assert.equal(evidence.sourceStatus, 'live'); assert.equal(evidence.change1w, 20 - Number(value));
    });
  }
  await mocked(payload([{ period: '2026-11-13', value: '0' }]), async () => {
    const live = await fetchPressure(cfg.id); await fetchHistory(cfg.id);
    const [evidence] = buildEiaEvidence(cfg, live, Date.parse('2026-11-17T00:00:00Z'));
    assert.equal(evidence.value, 0); assert.equal(evidence.sourceStatus, 'live');
  });
});
test('malformed periods/rows reject the response rather than silently remove an observation', async () => {
  for (const row of [null, {}, { period: ['2026-11-06'], value: 2 }, { period: '2026-02-30', value: 2 }]) {
    await mocked(payload([rows(2)[0], row, rows(2)[2]]), async () => {
      assert.equal((await fetchPressure(cfg.id)).reason, 'invalid_observation');
      assert.equal((await fetchHistory(cfg.id)).reason, 'invalid_observation');
    });
  }
});
test('existing empty response and API error classifications are unchanged', async () => {
  for (const [body, reason] of [[payload([]), 'no_data'], [{ error: 'provider-error' }, 'api_error']]) {
    await mocked(body, async () => {
      assert.equal((await fetchPressure(cfg.id)).reason, reason);
      assert.equal((await fetchHistory(cfg.id)).reason, reason);
    });
  }
});
