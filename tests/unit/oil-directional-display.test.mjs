import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderOilDirectional } from '../../scripts/modules/renderOilDirectional.js';
import { ODP_PHYSICAL_KEYS } from '../../scripts/modules/oilEvidenceQuality.js';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../../scripts/modules/renderOilDirectional.js', import.meta.url), 'utf8');
const readData = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));
const RETIRED_IDS = ['odp-ladder-core', 'odp-ladder-market', 'odp-ladder-global', 'odp-ladder-watch',
  'odp-evidence-timing-summary', 'odp-evidence-readiness-matrix', 'odp-brent-basis-status',
  'odp-pulse-factor-status', 'odp-global-overlay-supply', 'odp-thermal-status',
  'odp-cross-confirmation-status', 'odp-qc-ledger-status', 'odp-energy-spare-value',
  'odp-energy-transport-status', 'odp-attribution-caps', 'odp-attribution-triggers'];
const FORBIDDEN = /假性下跌|假性上涨|确认假跌|多源部分确认|多源同向|3\/3 确认|裂解价差 4 周收窄/;

class Element {
  constructor(hidden = false) { this.hiddenByAncestor = hidden; this.children = []; this.ownText = ''; this.className = ''; }
  get textContent() { return [this.ownText, ...this.children.map((e) => e.textContent)].join(' ').trim(); }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.ownText = ''; this.children = children; }
}

// Only model the renderer's DOM operations. Hidden ancestry is read from the actual
// static HTML, so a removed hidden wrapper or accidentally reactivated leaf fails.
function staticElements() {
  const elements = new Map();
  const stack = [];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    const token = match[0]; const tag = match[1].toLowerCase();
    if (token.startsWith('</')) {
      const index = stack.findLastIndex((entry) => entry.tag === tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    const hidden = Boolean(stack.at(-1)?.hidden || /\shidden(?:\s|=|>)/.test(token));
    const id = token.match(/\bid="([^"]+)"/)?.[1];
    if (id) elements.set(id, new Element(hidden));
    if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push({ tag, hidden });
  }
  return elements;
}
function harness(t, now = NOW) {
  const elements = staticElements();
  const previous = globalThis.document;
  globalThis.document = { getElementById: (id) => elements.get(id) || null, createElement: () => new Element() };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('ODP display must not fetch'); });
  const text = (id) => elements.get(id)?.textContent || '';
  const visible = () => [...elements].filter(([id, el]) => id.startsWith('odp-') && !el.hiddenByAncestor).map(([, el]) => el.textContent).join('\n');
  return { elements, text, visible, render: (oilData, radarData = radarFixture(), extra = {}) => renderOilDirectional({ oilData, radarData, ...extra }) };
}
function radarFixture() {
  return { brentPricingLayer: {
    selectedBrent: { value: 107.03, source: 'fred:DCOILBRENTEU', observedAt: '2026-11-06T10:00:00Z' },
    publicSpotProxy: { value: 107.03, source: 'fred-anchor', observedAt: '2026-11-03', status: 'ok' },
    crackSpread: 80.71, crackSpread4wChange: -1.39,
    futuresPriceCurve: { frontMinusBack: 8, frontPrice: 108, backPrice: 100, slopeRegime: 'backwardation', curveStatus: 'live_public_monthly', updatedAt: '2026-11-06T08:00:00Z' },
  }, macroDrivers: {
    energyInventoryBalance: { sourceStatus: { inventoryBalance: 'live' }, latestPeriod: '2026-11', latestIsForecast: true, oecdCommercialInventoryMbbl: 2700, globalInventoryDrawMbpd: 4, worldConsumptionMbpd: 102, worldConsumptionYoYMbpd: -1 },
    energySpareCapacity: { sourceStatus: { spareCapacity: 'live' }, latestPeriod: '2026-11', latestIsForecast: true, spareCapacityMbpd: 0.02 },
  } };
}
function oilFixture() {
  return { builtAt: '2026-11-06T10:00:00Z', finalBias: 'false_down_physical_stress',
    evidence: { ...Object.fromEntries(ODP_PHYSICAL_KEYS.map((key) => [key, { value: 1, sourceStatus: 'live', asOfDate: '2026-10-30', directionalRole: 'core_physical_anchor', unit: 'thousand barrels' }])),
      wtiPrice: { value: 777, sourceStatus: 'live', asOfDate: '2020-01-01', directionalRole: 'market_confirmation' },
      crackSpread: { value: 80.71, change4w: -1.39, directionalRole: 'market_confirmation' },
      curve: { directionalRole: 'market_confirmation', asOfDate: '2026-11-06T08:00:00Z', frontMinusBack: 8, frontPrice: 108, backPrice: 100, slopeRegime: 'backwardation', sourceStatus: 'live' }, brentPrice: { directionalRole: 'market_confirmation', value: 107.03, asOfDate: '2026-11-03', source: 'fred:DCOILBRENTEU' } },
    signals: { inventoryDrawPressure: { tight: true, loose: false }, refineryConfirmation: { high: true, low: false, utilAvg4w: 93.55 },
      sprBufferEffectiveness: { sprChange4w: -799 }, demandDestructionRisk: { demandFalling: false, suppliedAvg4w: 12, suppliedAvg13w: 12 },
      priceContext: { brentChangePct4w: -14.38, curveSlopeRegime: 'backwardation', priceDirectionSource: 'dated_same_source_brent_observations', brentSource: 'fred:DCOILBRENTEU', brentObservedAt: '2026-11-03', brentStartObservedAt: '2026-10-06' } },
    interpretation: { physicalBias: 'moderate_bullish', divergence: 'false_down_physical_stress', confidence: 'high', dataSufficiency: 'full',
      globalOverlay: { status: 'active', confirmationCount: 3, confidenceAdjustment: 'up' },
      attribution: { primaryThesis: '假性下跌，3/3 确认', counterEvidence: [{ label: '裂差', text: '裂解价差 4 周收窄' }], supportEvidence: [{ text: '卫星确认方向' }] } } };
}

test('qualified current display describes observed divergence, not a reversal forecast', (t) => {
  const dom = harness(t); const oil = oilFixture(); const radar = radarFixture(); const before = JSON.stringify({ oil, radar });
  dom.render(oil, radar);
  assert.equal(dom.text('odp-verdict'), '价格下跌 · 美国周度供需仍紧');
  assert.match(dom.text('odp-headline'), /价格回落.*美国周度供需仍偏紧.*不据此认定下跌会逆转/);
  assert.match(dom.text('odp-brent-basis-alert'), /107\.03.*2026-11-03/);
  assert.doesNotMatch(dom.text('odp-brent-basis-alert'), /观察日 2026-11-06/);
  assert.match(dom.text('odp-reason-curve'), /backwardation\(近月高于远月\)/);
  assert.doesNotMatch(dom.text('odp-reason-curve'), /现货偏紧|现货紧张/);
  assert.doesNotMatch(dom.visible(), FORBIDDEN);
  assert.equal(JSON.stringify({ oil, radar }), before);
});
test('legacy artifact cannot supply price direction, crack counterevidence or old global claims', (t) => {
  const dom = harness(t); const oil = oilFixture(); oil.signals.priceContext.priceDirectionSource = 'radar-history-full:brent~4w';
  dom.render(oil);
  assert.equal(dom.text('odp-verdict'), '油价方向暂不足判断');
  assert.equal(dom.text('odp-physical-bias'), '偏紧');
  assert.match(dom.text('odp-headline'), /缺少同源、带真实观察日的可比价格历史/);
  assert.match(dom.text('odp-reason-refinery'), /裂解价差未知.*ULSD 观察日，不判断收窄/);
  assert.doesNotMatch(dom.visible(), FORBIDDEN);
  assert.doesNotMatch(dom.text('odp-evidence-list'), /WTI|777/);
});
test('STEO retains real months as correlated forecast background without raising confidence', (t) => {
  const dom = harness(t); dom.render(oilFixture());
  assert.match(dom.text('odp-global-forecast-window'), /库存\/需求月期 2026-11；闲置产能月期 2026-11/);
  assert.match(dom.text('odp-global-forecast-note'), /预测\/估算背景，同一 EIA 体系，不独立确认、不提高置信/);
  assert.match(dom.text('odp-confidence'), /不是油价预测置信度/);
  const radar = radarFixture(); delete radar.macroDrivers.energyInventoryBalance.latestPeriod;
  dom.render(oilFixture(), radar);
  assert.match(dom.text('odp-global-forecast-global-stocks'), /未知/);
  assert.doesNotMatch(dom.text('odp-global-forecast-global-stocks'), /2700/);
});
test('missing data clears a previous successful rendering', (t) => {
  const dom = harness(t); dom.render(oilFixture()); dom.render(null);
  assert.equal(dom.text('odp-verdict'), '数据不可用');
  assert.equal(dom.text('odp-physical-bias'), '—');
  assert.equal(dom.text('odp-attribution-support'), '');
  assert.equal(dom.text('odp-attribution-counter'), '');
  assert.equal(dom.text('odp-evidence-list'), '');
  assert.doesNotMatch(dom.visible(), /-14\.38/);
});
test('future, mixed-week, missing and stale weekly evidence cannot present a current pressure call', (t) => {
  const dom = harness(t);
  for (const mutate of [
    (o) => { o.builtAt = '2026-11-07T10:00:00Z'; },
    (o) => { o.evidence.crudeStocksExSpr.asOfDate = '2026-11-07'; },
    (o) => { o.evidence.crudeStocksExSpr.asOfDate = '2026-10-01'; },
    (o) => { o.evidence.crudeStocksExSpr.value = null; },
    (o) => { o.evidence.sprStocks.asOfDate = '2026-10-29'; },
  ]) {
    const oil = oilFixture(); mutate(oil); dom.render(oil);
    assert.equal(dom.text('odp-verdict'), '数据不足 · 暂不判断');
    assert.match(dom.text('odp-headline'), /数据不足或已超龄/);
    assert.equal(dom.text('odp-reason-inventory'), '暂不判断');
    assert.match(dom.text('odp-attribution-counter'), /反证亦暂不判断/);
    assert.doesNotMatch(dom.visible(), FORBIDDEN);
  }
});
test('missing, future and stale quote clocks do not become a current price direction', (t) => {
  const dom = harness(t);
  for (const date of [null, '2026-11-07', '2026-10-01']) {
    const radar = radarFixture(); radar.brentPricingLayer.publicSpotProxy.observedAt = date;
    dom.render(oilFixture(), radar);
    assert.equal(dom.text('odp-verdict'), '油价方向暂不足判断');
    assert.match(dom.text('odp-divergence'), /未知/);
  }
});
test('retired display leaves stay hidden and inactive even when old artifacts contain conclusions', (t) => {
  const dom = harness(t); const oil = oilFixture();
  const forbiddenRead = new Proxy({}, { get() { throw new Error('retired layer was read'); } });
  oil.interpretation.globalOverlay = forbiddenRead; oil.interpretation.attribution = forbiddenRead;
  dom.render(oil, radarFixture(), { oilThermalWatchData: forbiddenRead });
  for (const id of RETIRED_IDS) {
    assert.equal(dom.elements.get(id)?.hiddenByAncestor, true, `${id} must remain hidden in the actual HTML`);
    assert.ok(['', '—'].includes(dom.text(id)), `${id} must not receive a current conclusion`);
  }
  assert.equal(dom.elements.get('odp-attribution-counter').hiddenByAncestor, false);
  assert.doesNotMatch(renderer, /deriveDisplayGlobalOverlay/);
  const entry = renderer.slice(renderer.indexOf('export function renderOilDirectional('));
  const addendum = renderer.slice(renderer.indexOf('function renderEnergyAddendum('), renderer.indexOf('function reasonInventory('));
  for (const name of ['renderSatelliteThermalWatch', 'renderCrossConfirmation', 'renderEvidenceReadinessMatrix', 'renderEvidenceTimingSummary', 'renderGlobalOverlay', 'renderPulseFactorCheck', 'renderBrentBasisCheck']) {
    assert.ok(!`${entry}\n${addendum}`.includes(`${name}(`), `${name} must not be active`);
    assert.ok(!renderer.includes(`function ${name}(`), `${name} must not remain as dead implementation`);
  }
});
test('existing qualified demand, refinery and inventory flags remain readable as counterevidence', (t) => {
  const dom = harness(t); const oil = oilFixture(); oil.signals.demandDestructionRisk.demandFalling = true;
  oil.signals.refineryConfirmation.low = true; oil.signals.refineryConfirmation.high = false; oil.signals.refineryConfirmation.utilAvg4w = 65;
  oil.signals.inventoryDrawPressure.loose = true;
  dom.render(oil);
  assert.match(dom.text('odp-attribution-counter'), /需求反向依据/);
  assert.match(dom.text('odp-attribution-counter'), /加工端反向依据.*65\.0%/);
  assert.match(dom.text('odp-attribution-counter'), /库存反向依据/);
  assert.doesNotMatch(dom.text('odp-attribution-counter'), /裂差|卫星|STEO/);
});
test('new opposite curve revokes old divergence but remains qualified counterevidence until stale', (t) => {
  const dom = harness(t); const oil = oilFixture(); const radar = radarFixture();
  dom.render(oil, radar); assert.equal(dom.text('odp-verdict'), '价格下跌 · 美国周度供需仍紧');
  radar.brentPricingLayer.futuresPriceCurve.slopeRegime = 'contango'; radar.brentPricingLayer.futuresPriceCurve.frontMinusBack = -8;
  radar.brentPricingLayer.futuresPriceCurve.frontPrice = 92;
  dom.render(oil, radar);
  assert.equal(dom.text('odp-verdict'), '油价方向暂不足判断');
  assert.match(dom.text('odp-divergence'), /未知/);
  assert.doesNotMatch(dom.text('odp-headline'), /价格回落/);
  assert.match(dom.text('odp-attribution-counter'), /期限结构反向依据.*-8\.00/);
  assert.match(dom.text('odp-attribution-counter'), /contango\(近月低于远月\)/);
  assert.doesNotMatch(dom.text('odp-reason-curve'), /现货偏紧|现货紧张/);
  radar.brentPricingLayer.futuresPriceCurve.updatedAt = '2026-10-01';
  dom.render(oil, radar); assert.doesNotMatch(dom.text('odp-attribution-counter'), /期限结构反向依据/);
  assert.match(dom.text('odp-reason-curve'), /期限结构未知/);
});
test('a newly dated or changed same-regime curve cannot requalify an old divergence', (t) => {
  const dom = harness(t);
  for (const mutate of [
    (curve) => { curve.updatedAt = '2026-11-06T09:00:00Z'; },
    (curve) => { curve.frontPrice = 109; curve.frontMinusBack = 9; },
    (curve) => { curve.backPrice = 99; curve.frontMinusBack = 9; },
  ]) {
    const oil = oilFixture(); const radar = radarFixture();
    dom.render(oil, radar); assert.equal(dom.text('odp-verdict'), '价格下跌 · 美国周度供需仍紧');
    mutate(radar.brentPricingLayer.futuresPriceCurve);
    dom.render(oil, radar);
    assert.equal(dom.text('odp-verdict'), '油价方向暂不足判断');
    assert.match(dom.text('odp-divergence'), /未知/);
    assert.doesNotMatch(dom.text('odp-headline'), /价格回落/);
    assert.equal(dom.text('odp-physical-bias'), '偏紧');
    assert.match(dom.text('odp-reason-curve'), /backwardation\(近月高于远月\)/);
  }
});
test('committed JSON replay is read-only and cannot restore retired conclusions', (t) => {
  const oil = readData('oil-directional-pressure.json'); const radar = readData('radar-data.json');
  const now = Math.max(Date.parse(oil.builtAt), Date.parse(radar.updatedAt)) + 60000;
  assert.ok(Number.isFinite(now)); const dom = harness(t, now); const before = JSON.stringify({ oil, radar });
  dom.render(oil, radar, { worldOrderStressData: readData('world-order-stress.json'), oilNewsEventWatchData: readData('oil-news-event-watch.json') });
  assert.doesNotMatch(dom.visible(), FORBIDDEN);
  assert.match(dom.text('odp-reason-refinery'), /裂解价差未知|暂不判断/);
  assert.equal(dom.text('odp-global-overlay-supply'), '—');
  assert.equal(dom.text('odp-cross-confirmation-status'), '—');
  assert.equal(JSON.stringify({ oil, radar }), before);
});
