import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildDivergenceLayer } from '../../scripts/daily/divergence-layer.mjs';

const GENERATED_AT = '2026-07-13T00:00:00.000Z';

function fixture({ risk = {}, realtimePayload = {}, displayInputsBaseline = {}, consumer = {}, confidenceScore = 80 } = {}) {
  return {
    risk: { score: 40, modules: {}, ...risk },
    realtimePayload,
    displayInputsBaseline: {
      brent: 80,
      us10y: 4,
      real10y: 1.5,
      spx: 4800,
      vix: 22,
      dxy: 100,
      hyOas: 4.2,
      ...displayInputsBaseline,
    },
    macroDrivers: {
      consumer: {
        sourceStatus: { umichSentiment: 'ok' },
        umichSentiment: 70,
        threeMonthChange: 0,
        ...consumer,
      },
    },
    confidenceScore,
    generatedAt: GENERATED_AT,
  };
}

function check(layer, key) {
  return layer.checks.find((entry) => entry.key === key);
}

test('fixed fixtures preserve valid outputs and the reviewed missing-data contract', () => {
  const fixtures = [
    fixture({ risk: { score: 40, modules: { a: 20 } } }),
    fixture({
      risk: { score: 75, modules: { a: 80, b: 72 } },
      realtimePayload: {
        brentValidation: { promotion: { reason: 'fixed', moveStatus: 'confirmed' }, consensus: {} },
        sourceDetails: { brent: { source: 'fred' } },
      },
      displayInputsBaseline: { brent: 112, us10y: 5, real10y: 2.5, spx: 5200, vix: 16, dxy: 106, hyOas: 3.5 },
      consumer: { umichSentiment: 55, threeMonthChange: -10 },
      confidenceScore: 90,
    }),
    fixture({
      risk: { score: null, modules: {} },
      displayInputsBaseline: { brent: null, us10y: null, real10y: null, spx: null, vix: null, dxy: null, hyOas: null },
      consumer: { sourceStatus: { umichSentiment: 'missing' }, umichSentiment: undefined, threeMonthChange: undefined },
      confidenceScore: 20,
    }),
    fixture({
      risk: { score: 65, modules: { a: 71 } },
      displayInputsBaseline: { brent: 96, us10y: 4.6, real10y: 2.1, spx: 5100, vix: 26, dxy: 104, hyOas: 4.8 },
      consumer: { umichSentiment: 60, threeMonthChange: -6 },
      confidenceScore: 70,
    }),
  ];
  // ADR-0118: keep every fixture; only missing-data output intentionally changes.
  const expected = [
    [6493, 'f7206c85fc061e8b9342f9eb0d07b5208ecdaef96ca4805ab08dbc1b10a5f80c'],
    [6985, '683a52c0771324bbc32c3d437925d7822186ce2f35242908828aca55c12ef3cc'],
    [3090, '377b92dca52d8273600569ff963266ecc430ddf7d2bd92c6d1db98c90ebf7f22'],
    [6501, '786aa98be00b4865ccb90d4651a5f7cd40a7fc4aa0f0a52c1ea5de0acebb68e1'],
  ];
  const outputs = fixtures.map(input => buildDivergenceLayer(input));
  outputs.forEach((output, index) => {
    const json = JSON.stringify(output);
    assert.equal(Buffer.byteLength(json), expected[index][0]);
    assert.equal(createHash('sha256').update(json).digest('hex'), expected[index][1]);
  });
  assert.equal(outputs[2].state, 'insufficient_data');
  assert.equal(outputs[2].primaryDivergence.key, 'no_clear_divergence');
  for (const row of outputs[2].checks) {
    assert.equal(row.status, 'insufficient_data');
    assert.equal(row.score, 0);
    assert.deepEqual(row.evidence, []);
  }
});

test('every divergence check fails closed when its required data is unavailable', () => {
  const layer = buildDivergenceLayer(fixture({
    risk: { score: undefined, modules: {} },
    displayInputsBaseline: {
      brent: undefined,
      us10y: undefined,
      real10y: undefined,
      spx: undefined,
      vix: undefined,
      dxy: undefined,
      hyOas: undefined,
    },
    consumer: { sourceStatus: { umichSentiment: 'missing' }, umichSentiment: undefined, threeMonthChange: undefined },
    confidenceScore: 20,
  }));
  assert.equal(layer.state, 'insufficient_data');
  assert.equal(layer.score, 0);
  assert.equal(layer.primaryDivergence.key, 'no_clear_divergence');
  assert.equal(layer.checks.every((entry) => entry.status === 'insufficient_data'), true);
  assert.deepEqual(layer.boundaries, {
    displayOnly: true,
    auditOnly: true,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
  });
});

test('energy, rates, liquidity and risk-pricing score ladders remain deterministic', () => {
  const energyScores = [
    [{ brent: 80 }, {}, 20],
    [{ brent: 90 }, { brentValidation: { promotion: { reason: 'reviewed' } } }, 34],
    [{ brent: 100 }, { brentValidation: { consensus: {} } }, 52],
    [{ brent: 120 }, { sourceDetails: { brent: { source: 'fred' } } }, 72],
  ];
  for (const [displayInputsBaseline, realtimePayload, expected] of energyScores) {
    assert.equal(check(buildDivergenceLayer(fixture({ displayInputsBaseline, realtimePayload })), 'energy_pricing_gap_watch').score, expected);
  }

  const ratesCases = [
    [{ us10y: 5, real10y: 2.5, spx: 5200, vix: 16 }, 72],
    [{ us10y: 4.6, real10y: 1.5, spx: 5200, vix: 16 }, 58],
    [{ us10y: 4.6, real10y: 1.5, spx: 4800, vix: 25 }, 44],
    [{ us10y: 4, real10y: 1.5, spx: 5200, vix: 16 }, 34],
    [{ us10y: 4, real10y: 1.5, spx: 4800, vix: 22 }, 18],
  ];
  for (const [displayInputsBaseline, expected] of ratesCases) {
    assert.equal(check(buildDivergenceLayer(fixture({ displayInputsBaseline })), 'rates_vs_risk_assets').score, expected);
  }

  const liquidityCases = [
    [{ dxy: 106, us10y: 4, hyOas: 5, vix: 26 }, 72],
    [{ dxy: 106, us10y: 4, hyOas: 3, vix: 16 }, 54],
    [{ dxy: 100, us10y: 4, hyOas: 5, vix: 26 }, 50],
    [{ dxy: 100, us10y: 4, hyOas: 3, vix: 16 }, 22],
  ];
  for (const [displayInputsBaseline, expected] of liquidityCases) {
    assert.equal(check(buildDivergenceLayer(fixture({ displayInputsBaseline })), 'liquidity_vs_credit_transmission').score, expected);
  }

  const riskCases = [
    [{ score: 70, modules: {} }, { vix: 16, hyOas: 3 }, 62],
    [{ score: 70, modules: {} }, { vix: 25, hyOas: 5 }, 44],
    [{ score: 40, modules: {} }, { vix: 16, hyOas: 3 }, 30],
    [{ score: 40, modules: {} }, { vix: 25, hyOas: 5 }, 18],
    [{ score: 40, modules: { a: 75, b: 80 } }, { vix: 25, hyOas: 5 }, 44],
  ];
  for (const [risk, displayInputsBaseline, expected] of riskCases) {
    assert.equal(check(buildDivergenceLayer(fixture({ risk, displayInputsBaseline })), 'risk_complacency_watch').score, expected);
  }
});

test('consumer divergence preserves slow-variable tiers and confidence caps', () => {
  const consumerCases = [
    [{ threeMonthChange: -10 }, { spx: 5200, vix: 16, hyOas: 3 }, 76],
    [{ threeMonthChange: -10 }, { spx: 5200, vix: 26, hyOas: 5 }, 66],
    [{ threeMonthChange: -6 }, { spx: 5200, vix: 22, hyOas: 4.2 }, 54],
    [{ threeMonthChange: -6 }, { spx: 4800, vix: 26, hyOas: 5 }, 40],
    [{ threeMonthChange: 0 }, { spx: 4800, vix: 22, hyOas: 4.2 }, 18],
  ];
  for (const [consumer, displayInputsBaseline, expected] of consumerCases) {
    const layer = buildDivergenceLayer(fixture({ consumer, displayInputsBaseline, confidenceScore: 90 }));
    assert.equal(check(layer, 'consumer_vs_asset_pricing').score, expected);
    assert.equal(layer.generatedAt, GENERATED_AT);
    assert.equal(layer.contractVersion, 'v28.0I-3A');
    assert.ok(layer.confidence.score <= 70);
  }
});
