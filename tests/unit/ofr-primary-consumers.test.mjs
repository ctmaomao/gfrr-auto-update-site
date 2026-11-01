import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OFR_COLUMNS, parseOfrCsv, buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent } from '../../scripts/daily/ofr-publication-contract.mjs';
import { prepareOfrPublication } from '../../scripts/daily/publish-ofr-pressure.mjs';
import { planAdmission, admitRefresh, REPOSITORY } from '../../scripts/macro-risk/editorial-refresh-admission.mjs';

// Synthetic fixtures, never published as market observations.
const now = '2026-11-01T12:00:00Z', nowMs = Date.parse(now);
const renderSource = fs.readFileSync(new URL('../../scripts/modules/renderMacroOverview.js', import.meta.url), 'utf8');
const specifier = renderSource.match(/from '(\.\/renderOfrPrimary\.js[^']*)'/)[1];
const { buildOfrView, renderOfrPrimary } = await import(new URL('../../scripts/modules/' + specifier.slice(2), import.meta.url));
function receipt(value = -1) {
  const rows = parseOfrCsv(OFR_COLUMNS.join(',') + '\n' + [['2026-10-21', -0.5], ['2026-10-28', value]].map(([d,v]) => [d,v,0,0,0,0,0,0,0,0].join(',')).join('\n'));
  return { rows, readout: buildOfrReadout(rows, { asOf: now, retrievedAt: now, snapshotSha256: 'a'.repeat(64) }) };
}
const data = () => ({ score: 68, updatedAt: now, decisionModel: { structuralSignals: [] }, warningSystem: { criticalCount: 0, warningCount: 0 }, dailyRealtimeInput: { sourceMode: 'live', healthScore: 100 }, recovery: { safeOutput: true } });
const component = value => buildPublishedOfrComponent({ ...receipt(value), now });

test('Daily publication performs one injected receipt and retires old advice on both success and failure', async () => {
  for (const failure of [false, true]) {
    let calls = 0; const input = data(), old = structuredClone(input);
    const output = await prepareOfrPublication(input, { fetchSnapshot: async () => { calls++; if (failure) throw Error('network'); return receipt(); }, clock: () => now });
    assert.equal(calls, 1); assert.deepEqual(input, old); assert.equal(output.advicePolicy.mode, 'retired');
    assert.equal(output.mainPressureReadout.status, failure ? 'unavailable' : 'available');
    assert.deepEqual(output.dailyRealtimeInput, input.dailyRealtimeInput); assert.deepEqual(output.recovery, input.recovery);
    assert.equal(output.score, 68); assert.equal(output.tradingSystem.positioning.riskBudget, undefined);
  }
});
test('invalid new source or previous cache fails closed without retry or resurrection of old instructions', async () => {
  const previous = { mainPressureReadout: component(-1), advicePolicy: { mode: 'retired', retiredAt: now } };
  const x = await prepareOfrPublication(data(), { previous, fetchSnapshot: async () => null, clock: () => '2026-11-02T12:00:00Z' });
  assert.equal(x.mainPressureReadout.status, 'cached'); assert.equal(x.advicePolicy.retiredAt, now);
  const invalid = receipt(); invalid.readout.lastKnown.value = 123;
  const y = await prepareOfrPublication(data(), { previous: { mainPressureReadout: {}, advicePolicy: { mode: 'retired', retiredAt: '2026-02-30T00:00:00Z' } }, fetchSnapshot: async () => invalid, clock: () => now });
  assert.equal(y.mainPressureReadout.status, 'unavailable'); assert.equal(y.advicePolicy.retiredAt, now);
});
test('view keeps negative/zero, rejects legacy fallback and rechecks age when a tab stays open', () => {
  for (const value of [-1, 0]) { const v = buildOfrView({ mainPressureReadout: component(value) }, nowMs); assert.equal(v.current, true); assert.equal(v.value, value); }
  const old = buildOfrView({ score: 68 }, nowMs); assert.equal(old.value, null); assert.equal(old.current, false);
  const stale = buildOfrView({ mainPressureReadout: component(-1) }, Date.parse('2026-11-06T12:00:00Z')); assert.equal(stale.status, 'stale'); assert.equal(stale.current, false);
  const cached = buildPublishedOfrComponent({ previous: component(-1), now: '2026-11-02T12:00:00Z' });
  assert.equal(buildOfrView({ mainPressureReadout: cached }, Date.parse(cached.asOf)).current, false);
  assert.equal(buildOfrView({ mainPressureReadout: component('') }, nowMs).value, null);
});
test('malformed/future source, history and auxiliary values cannot become current verified displays', () => {
  for (const mutate of [c => c.source.provider = 'other', c => c.asOf = '2099-01-01T00:00:00Z', c => c.source.snapshotSha256 = 'bad', c => c.index.observedDate = '2026-02-30', c => c.boundaries.tailFloorAdded = true]) {
    const c = component(-1); mutate(c); assert.equal(buildOfrView({ mainPressureReadout: c }, nowMs).current, false);
  }
  const c = component(-1); c.percentile.value = 150; c.weeklyChange.fromDate = '2026-10-28'; c.history.reverse();
  const v = buildOfrView({ mainPressureReadout: c }, nowMs); assert.equal(v.percentile, null); assert.equal(v.weekly, null); assert.deepEqual(v.history, []);
});

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.hidden = false; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.textContent = ''; }
  setAttribute(k,v) { this.attributes[k] = v; }
}
test('real primary renderer clears old displays, uses its own raw trend, and never prints /100 or allocation advice', () => {
  const ids = ['hero-score-value','hero-score-attribution','hero-verdict-kicker','hero-verdict-headline','hero-verdict-body','hero-dominant-chain','hero-weekly-change','hero-data-health','hero-breakdown-counts','hero-overlay-score','threshold-now-line','ofr-scale-note','hero-four-lanes','ofr-trend-svg'];
  const nodes = new Map(ids.map(id => [id, new Element('div')])); const original = globalThis.document;
  globalThis.document = { getElementById: id => nodes.get(id), createElement: t => new Element(t), createElementNS: (_,t) => new Element(t) };
  try {
    renderOfrPrimary({ radarData: { ...data(), mainPressureReadout: component(-1) }, worldOrderStressData: { score: 59 }, nowMs });
    assert.equal(nodes.get('hero-score-value').textContent, '-1.000'); assert.equal(nodes.get('hero-four-lanes').children.length, 4);
    assert.equal(nodes.get('ofr-trend-svg').children.some(n => n.tag === 'polyline'), true);
    assert.match(nodes.get('hero-overlay-score').textContent, /不升档OFR/);
    renderOfrPrimary({ radarData: { ...data(), score: 99 }, nowMs });
    assert.equal(nodes.get('hero-score-value').textContent, '—'); assert.equal(nodes.get('ofr-trend-svg').children.some(n => n.tag === 'polyline'), false);
    assert.doesNotMatch(nodes.get('hero-verdict-body').textContent, /99|禁止新增|减仓|目标仓位/);
    renderOfrPrimary({ radarData: null, nowMs }); assert.equal(nodes.get('hero-four-lanes').hidden, true);
  } finally { globalThis.document = original; }
});
test('old editorial admission stops before GitHub budget operations, search or provider work', async () => {
  const context = { repository: REPOSITORY, ref: 'refs/heads/main', runAttempt: 1, eventName: 'workflow_dispatch', event: { inputs: { allow_network: true, acknowledge_cost: true } }, now, radar: { ...data(), mainPressureReadout: component(-1) }, world: { updatedAt: now }, oil: { builtAt: now } };
  const plan = planAdmission(context); assert.deepEqual(plan, { ready: false, reason: 'model_contract_transition' });
  let calls = 0; const result = await admitRefresh({ plan, api: async () => { calls++; throw Error('must not call'); } });
  assert.equal(calls, 0); assert.equal(result.reason, 'model_contract_transition');
  assert.equal(planAdmission({ ...context, repository: 'other' }).reason, 'untrusted_context');
});
