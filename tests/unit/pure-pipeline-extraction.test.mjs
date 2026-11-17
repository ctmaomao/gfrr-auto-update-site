import { buildDivergenceLayer } from '../../scripts/daily/divergence-layer.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAiInterpretationLayer } from '../../scripts/daily/rule-based-interpretation.mjs';
import { stripTags, decodeHtmlEntities, htmlToText, parseFedSepMedians } from '../../scripts/bubble-watch/public-html-parsers.mjs';
import { parseFredCsv, parseFredApiObservations } from '../../scripts/lib/fred-observations.mjs';

const generatedAt = '2026-09-09T00:00:00.000Z';
const complete = {
  dailyBrief: { invalidationSignals: ['能源价格回落', '信用利差未扩张'] },
  divergenceLayer: { primaryDivergence: { labelZh: '消费与资产分歧' }, checks: [{ key: 'consumer_vs_asset_pricing' }] },
  brentPricingLayer: { proxySpread: { status: 'stress' } },
  macroDrivers: { consumer: { threeMonthChange: -3 } },
  decisionModel: { strategyState: 'watch' },
};
// Recorded from the original function at ed7d05d8 before extraction, with a fixed clock.
// These snapshots assert byte-level behavior equivalence, not financial model validity.
const cases = [
  [{}, '1cbb5406f633a9f44a8a501a853066a9e781b16c2dc3049babddc8f6aa400dc3'],
  [{ ...complete, confidenceScore: 0 }, '34a8a01665b109e8ec1f56a07178ff69beae21313953f2b166b2ebb60b67a6ee'],
  [{ ...complete, confidenceScore: 44 }, 'd686f6f2960e193ae0506526fda244ac26db81a06657d0a075262e02b98b7d0d'],
  [{ ...complete, confidenceScore: 45 }, '5f8e8e2ce95ada19e18afc81ad28185709429dfa3cacde0b1243b54130c45d3f'],
  [{ ...complete, confidenceScore: 74 }, 'da57c777427ec715620b5807d2d4b1c31c43c527fcd3455b94a7db55ac79fdc9'],
  [{ ...complete, confidenceScore: 75 }, '0ff2b1a29d2d7422f9ffd2f7245e8837695f2b82aac8490dc3959de08f72679f'],
  [{ ...complete, confidenceScore: 100 }, 'a34cea22c52472b4380aa8e2f0f4817ad0a1f98c70349f0a698ef4351f04683c'],
  [{ ...complete, confidenceScore: 80, dailyBrief: null }, '127993c89cb52a3a3782f040ee5601bfe218b13e98006065bf8797f486bc66ea'],
  [{ ...complete, confidenceScore: 80, macroDrivers: { consumer: { threeMonthChange: 4 } }, brentPricingLayer: { proxySpread: { status: 'normal' } } }, '004aa6a8595f91b9fd263ee9bc0001713b7a446d937bb8c448e9652e7089b2c2'],
];

test('Daily interpretation preserves the original empty, threshold, degraded and divergence outputs', () => {
  for (const [input, expectedDigest] of cases) {
    const before = structuredClone(input);
    const result = buildAiInterpretationLayer(input, generatedAt);
    assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'), expectedDigest);
    assert.deepEqual(input, before);
    assert.equal(result.generatedAt, generatedAt);
    assert.equal(result.boundaries.usesExternalAiApi, false);
    assert.equal(result.boundaries.affectsScoring, false);
    assert.equal(result.boundaries.affectsDecisionModel, false);
    assert.equal(result.boundaries.affectsExecutionLock, false);
    assert.equal(result.boundaries.affectsPositionGuidance, false);
  }
});

test('existing HTML text parsing handles entities, scripts and table markup', () => {
  assert.equal(stripTags('<script>alert(1)</script><p> A <b>B</b> </p>'), ' A B ');
  assert.equal(decodeHtmlEntities('&lt;x&gt; &amp; &#65; &#x42; &nbsp;'), '<x> & A B  ');
  assert.equal(htmlToText('<p>A&nbsp; &amp; <b>B</b></p>'), 'A & B');
  assert.equal(htmlToText(null), '');
  const html = '<table><tr><th>Unrelated</th><td>99</td></tr><tr><th>Federal funds rate</th><td>4.25</td><td>3.5</td></tr></table>';
  assert.deepEqual(parseFedSepMedians(html, 'https://www.federalreserve.gov/example.htm', '20260909'), {
    sepProjectionDate: '2026-09-09', sepUrl: 'https://www.federalreserve.gov/example.htm', dotPlotMedianCurrentYear: 4.25, dotPlotMedianNextYear: 3.5,
  });
});

test('SEP parser preserves missing row and missing median failure boundaries', () => {
  assert.throws(() => parseFedSepMedians('<table></table>'), /row missing/);
  assert.throws(() => parseFedSepMedians('<tr><th>Federal funds rate</th><td>—</td><td>—</td></tr>'), /medians unavailable/);
  const result = parseFedSepMedians('<tr><th>Federal funds rate</th><td>—</td><td>3.0</td></tr>');
  assert.equal(result.dotPlotMedianCurrentYear, null);
  assert.equal(result.dotPlotMedianNextYear, 3);
});

test('shared FRED parsers preserve observation order, duplicates, zero and negative values', () => {
  const observations = [
    { date: '2026-11-03', value: '0' },
    { date: '2026-11-01', value: '-1.25' },
    { date: '2026-11-03', value: ' 2.5 ' },
    { date: '2026-11-04', value: '1e2' },
  ];
  const expected = observations.map(({ date, value }) => ({ date, value: Number(value) }));
  assert.deepEqual(parseFredApiObservations(JSON.stringify({ observations })), expected);
  for (const newline of ['\n', '\r\n']) {
    const csv = ['DATE,VALUE', ...observations.map(({ date, value }) => `${date},${value}`)].join(newline);
    assert.deepEqual(parseFredCsv(`${csv}${newline}`), expected);
  }
});

test('shared FRED parsers skip missing observations and nonfinite numbers without fabricating rows', () => {
  const observations = [
    null, {}, { date: '', value: '1' }, { date: '2026-11-01' },
    ...['.', '', ' ', 'NaN', 'Infinity', '-Infinity', 'not-a-number']
      .map(value => ({ date: '2026-11-01', value })),
  ];
  assert.deepEqual(parseFredApiObservations(JSON.stringify({ observations })), []);
  const csv = 'DATE,VALUE\n,1\n2026-11-01\n2026-11-01,.\n2026-11-01,\n2026-11-01, \n2026-11-01,NaN\n2026-11-01,Infinity\n2026-11-01,-Infinity\n2026-11-01,not-a-number';
  assert.deepEqual(parseFredCsv(csv), []);
  assert.deepEqual(parseFredCsv(''), []);
  assert.deepEqual(parseFredCsv('DATE,VALUE'), []);
  assert.deepEqual(parseFredApiObservations('{"observations":[]}'), []);
});

test('shared FRED API parser preserves malformed JSON and payload failures', () => {
  assert.throws(() => parseFredApiObservations('{'), SyntaxError);
  for (const payload of [null, {}, [], { observations: null }, { observations: {} }]) {
    assert.throws(() => parseFredApiObservations(JSON.stringify(payload)), {
      name: 'Error', message: 'FRED API returned invalid observations payload',
    });
  }
});

test('Daily and realtime use the same FRED parsers without importing either executable', () => {
  for (const name of ['run-daily-pipeline.mjs', 'run-realtime.mjs']) {
    const source = readFileSync(new URL(`../../scripts/${name}`, import.meta.url), 'utf8');
    assert.match(source, /import \{ parseFredCsv, parseFredApiObservations \} from '\.\/lib\/fred-observations\.mjs';/);
    assert.doesNotMatch(source, /function parseFred(?:Csv|ApiObservations)\(/);
  }
});


test('FRED API rejects nonnumeric JSON types without losing numeric zero or ordering', () => {
  const values = [null, false, true, [], [4], ['5'], {}, { value: 6 }, 0, '0', -1, ' 2.5 ', '1e2'];
  const observations = values.map(value => ({ date: '2026-11-01', value }));
  assert.deepEqual(parseFredApiObservations(JSON.stringify({ observations })),
    [0, 0, -1, 2.5, 100].map(value => ({ date: '2026-11-01', value })));
});


const divergenceFields = ['brent', 'us10y', 'real10y', 'spx', 'vix', 'dxy', 'hyOas'];
function divergenceFixture(value) {
  return { risk: { score: 70, modules: { banking: 75, debt: 75 } }, realtimePayload: {},
    displayInputsBaseline: Object.fromEntries(divergenceFields.map(key => [key, value])),
    macroDrivers: { consumer: { sourceStatus: { umichSentiment: 'live' }, umichSentiment: value, threeMonthChange: value } },
    confidenceScore: 80, generatedAt: '2026-11-17T00:00:00Z' };
}
test('divergence missing/non-numeric inputs produce insufficient data, not zero evidence', () => {
  for (const value of [null, undefined, '', ' ', false, true, [], [1], {}, NaN, Infinity, 'bad']) {
    const result = buildDivergenceLayer(divergenceFixture(value));
    assert.equal(result.state, 'insufficient_data');
    assert.equal(result.score, 0); // existing finite-score schema, not a genuine zero observation
    assert.equal(result.primaryDivergence.key, 'no_clear_divergence');
    for (const check of result.checks) {
      assert.equal(check.status, 'insufficient_data');
      assert.deepEqual(check.evidence, []);
    }
    assert.equal(result.boundaries.affectsScoring, false);
    assert.equal(result.boundaries.affectsDecisionModel, false);
  }
});
test('divergence preserves valid numeric strings/zero and does not mutate input', () => {
  for (const values of [
    { brent: 100, us10y: 5, real10y: 2.4, spx: 6000, vix: 15, dxy: 106, hyOas: 3 },
    Object.fromEntries(divergenceFields.map(key => [key, 0]))
  ]) {
    const input = divergenceFixture(0); input.displayInputsBaseline = values;
    const before = structuredClone(input); const result = buildDivergenceLayer(input);
    const strings = structuredClone(input);
    strings.displayInputsBaseline = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, ` ${v} `]));
    strings.macroDrivers.consumer.umichSentiment = '0'; strings.macroDrivers.consumer.threeMonthChange = '0';
    assert.deepEqual(buildDivergenceLayer(strings), result);
    assert.deepEqual(input, before);
    assert.ok(result.checks.every(check => check.status !== 'insufficient_data'));
    assert.ok(result.checks.flatMap(check => check.evidence).some(row => row.value === 0));
  }
});
test('missing VIX/credit cannot confirm calm markets, partial evidence remains null', () => {
  const input = divergenceFixture(null);
  Object.assign(input.displayInputsBaseline, { brent: 90, us10y: 5, spx: 6000 });
  Object.assign(input.macroDrivers.consumer, { umichSentiment: 60, threeMonthChange: -10 });
  const result = buildDivergenceLayer(input);
  const find = key => result.checks.find(check => check.key === key);
  assert.equal(find('risk_complacency_watch').status, 'insufficient_data');
  assert.equal(find('rates_vs_risk_assets').score, 44); // not 72 from missing VIX -> 0
  assert.equal(find('consumer_vs_asset_pricing').score, 66); // not 76 from fake calm pricing
  const evidence = find('consumer_vs_asset_pricing').evidence;
  assert.equal(evidence.find(row => row.key === 'vix').value, null);
  assert.equal(evidence.find(row => row.key === 'hyOas').value, null);
});
