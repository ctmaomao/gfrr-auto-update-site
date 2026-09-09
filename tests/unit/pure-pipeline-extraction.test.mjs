import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildAiInterpretationLayer } from '../../scripts/daily/rule-based-interpretation.mjs';
import { stripTags, decodeHtmlEntities, htmlToText, parseFedSepMedians } from '../../scripts/bubble-watch/public-html-parsers.mjs';

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
