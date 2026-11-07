import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MAX_ACTIVE_ASSET_AGE_DAYS, MAX_AUXILIARY_LAG_DAYS } from '../../scripts/review-market-pricing-freshness.mjs';

const sourceUrl = new URL('../../scripts/modules/renderMacroOverview.js', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const bindings = {};
for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g)) {
  const module = await import(new URL(match[2], sourceUrl).href);
  for (const name of match[1].split(',').map(v => v.trim()).filter(Boolean)) {
    assert.ok(name in module, `real export ${name}`);
    bindings[name] = module[name];
  }
}
class Element {
  constructor() {
    this.textContent = ''; this.children = []; this.hidden = false; this.className = '';
    this.dataset = {}; this.style = {}; this.attributes = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = value; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const nodes = new Map();
const el = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
const documentStub = {
  getElementById: el, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => new Element(), createElementNS: () => new Element(),
  createTextNode: text => Object.assign(new Element(), { textContent: text }),
  createDocumentFragment: () => new Element(),
};
const originalDocument = globalThis.document;
globalThis.document = documentStub;
after(() => { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; });
const NOW = Date.parse('2026-11-07T12:00:00Z');
class FixedDate extends Date { static now() { return NOW; } }
const errors = [];
const context = vm.createContext({ ...bindings, document: documentStub, Date: FixedDate,
  console: { log() {}, warn() {}, error: (...args) => errors.push(args.map(String).join(' ')) },
  window: {}, setTimeout: () => {}, clearTimeout: () => {},
});
vm.runInContext(source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '').replace(/^export[ \t]+/gm, ''), context);
const api = vm.runInContext('({ renderMacroOverview, renderMarketTemperature, renderC7MarketSentiment, renderC4UsEconomyTemperature, renderRiskEngines, renderTransportShockConfirmation, renderC8Geopolitical, marketObservation, observationDate, asNumber, strictFiniteDisplay, MARKET_MAX_AGE_DAYS, MARKET_MAX_AUXILIARY_LAG_DAYS })', context);
beforeEach(() => { nodes.clear(); errors.length = 0; });
const text = id => el(id).textContent;
const market = (z = 0.5887, date = '2026-10-30') => ({ zScoreRange: { min: -2, max: 3 }, assets: Object.fromEntries(['qqq','ndx','ixic'].map(key => [key, { latestMetricDate: date, records: [{ date, zScore: z, close: 690.49, ma60: 657.19, stdDev60: 56.56 }] }])) });
const retail = () => ({ updatedAt: '2026-10-31T00:00:00Z', cartsNominalYoY: 0.0849, cartsRealYoY: 0.0322,
  segmentUpdatedAt: '2026-08-01T00:00:00Z', segmentDiffusionPct: 76.9, segmentPositiveCount: 10, segmentSeriesCount: 13,
  strongestSegment: { labelZh: '加油站', yoy: 0.2035 }, weakestSegment: { labelZh: '家具家居', yoy: -0.0165 },
  bofaCardSpendingExGasYoY: 0.02, bofaReportDate: '2026-10-01T00:00:00.000Z', bofaStatus: 'live',
  redbookRetailSalesYoY: 0.104, redbookRetailSalesDate: '2026-10-31T00:00:00Z', redbookStatus: 'live',
  sourceStatus: { carts: 'live', cartsr: 'live', retailSegments: 'live', bofaConsumerCheckpoint: 'live', redbookPublicHtml: 'live' },
});
const radar = () => ({ macroDrivers: { consumerRetail: retail(), consumer: { umichSentiment: 48.1, threeMonthChange: -1.4, regime: '稳定', updatedAt: '2026-09-01T00:00:00Z', sourceStatus: { umichSentiment: 'live' } } } });
const renderRetail = r => api.renderC4UsEconomyTemperature({ radarData: r });

test('market dates and age limits reuse the existing contract without touching shared numeric coercion', () => {
  assert.equal(api.MARKET_MAX_AGE_DAYS, MAX_ACTIVE_ASSET_AGE_DAYS);
  assert.equal(api.MARKET_MAX_AUXILIARY_LAG_DAYS, MAX_AUXILIARY_LAG_DAYS);
  assert.equal(api.asNumber(null), 0); // legacy helper unchanged, targeted callers opt in
  assert.equal(api.strictFiniteDisplay(null), null);
  for (const value of [null, undefined, '', '0', false, true, [], {}, NaN, Infinity]) assert.equal(api.strictFiniteDisplay(value), null);
  assert.equal(api.strictFiniteDisplay(0), 0);
  assert.equal(api.marketObservation(market(0, '2026-10-28'), 'qqq', Date.parse('2026-11-07T00:00:00Z')).stale, false);
  assert.equal(api.marketObservation(market(0, '2026-10-28'), 'qqq', Date.parse('2026-11-08T00:00:00Z')).stale, true);
});

test('market positive, negative and zero describe direction, never fixed heat or ranking', () => {
  for (const [z, phrase, number] of [[0.5887,'高于','+0.59'],[-0.5,'低于','-0.50'],[0,'等于','0.00']]) {
    const data = market(z), before = JSON.stringify(data);
    api.renderMarketTemperature({ marketPricingMetricsData: data });
    assert.equal(text('mt-zscore-value'), number); assert.match(text('mt-narrative'), new RegExp(phrase));
    assert.match(text('mt-narrative'), /2026-10-30/);
    assert.doesNotMatch(text('mt-narrative'), /第二极端|同步极端|极度过热/);
    assert.equal(JSON.stringify(data), before);
  }
  assert.deepEqual(errors, []);
});

test('mixed dates, historical values and auxiliary lag remain explicit in both temperature consumers', () => {
  const data = market();
  for (const key of ['ndx','ixic']) { data.assets[key].records[0].date = '2026-09-04'; data.assets[key].latestMetricDate = '2026-09-04'; }
  api.renderMarketTemperature({ marketPricingMetricsData: data });
  api.renderC7MarketSentiment({ radarData: null, marketPricingMetricsData: data });
  assert.match(text('mt-narrative'), /2026-09-04.*历史观测，已超龄/);
  assert.match(text('mt-narrative'), /日期不同，不作同期比较/);
  assert.match(text('mt-narrative'), /滞后超过7天/);
  assert.match(text('c7-ndx-note'), /2026-09-04/); assert.match(text('c7-ndx-note'), /2026-10-30/);
  assert.equal(text('c7-ndx-badge'), '历史观测');
  api.renderMarketTemperature({ marketPricingMetricsData: market(1, '2026-09-04') });
  assert.match(text('mt-narrative'), /同日历史观测已超龄，不代表当前市场/);
});

test('market invalid values/dates and repeated missing renders clear every previously rendered numeric leaf', () => {
  for (const value of [null, undefined, '', false, '0', NaN, Infinity]) {
    api.renderMarketTemperature({ marketPricingMetricsData: market() });
    const data = market(); for (const asset of Object.values(data.assets)) asset.records[0].zScore = value;
    api.renderMarketTemperature({ marketPricingMetricsData: data });
    assert.equal(text('mt-zscore-value'), '—'); assert.match(text('mt-narrative'), /待核验/);
  }
  for (const date of [undefined, '', '2026-02-30', '2026-11-08', 'not-a-date']) {
    const data = market(1); data.assets.qqq.records[0].date = date;
    api.renderMarketTemperature({ marketPricingMetricsData: data });
    for (const id of ['mt-zscore-value','mt-close','mt-ma60','mt-stddev','mt-zscore-range']) assert.equal(text(id), '—', id);
  }
  const mismatch = market(); mismatch.assets.qqq.latestMetricDate = '2026-10-29';
  api.renderMarketTemperature({ marketPricingMetricsData: mismatch }); assert.equal(text('mt-zscore-value'), '—');
  for (let i = 0; i < 2; i++) {
    api.renderMarketTemperature({ marketPricingMetricsData: null });
    api.renderC7MarketSentiment({ radarData: null, marketPricingMetricsData: null });
    assert.equal(text('mt-zscore-value'), '—'); assert.equal(text('c7-ndx-number'), '—'); assert.equal(text('c7-ndx-badge'), '待核验');
  }
  assert.deepEqual(errors, []);
});

test('consumer positive, negative, true zero and valid-to-missing agree with their descriptions', () => {
  for (const [value, phrase, result] of [[0.0322,'同比增长','+3.2%'],[-0.012,'同比下降','-1.2%'],[0,'同比持平','+0.0%']]) {
    const data = radar(); data.macroDrivers.consumerRetail.cartsRealYoY = value;
    const before = JSON.stringify(data); renderRetail(data);
    assert.equal(text('c4-consumer-real'), result); assert.match(text('c4-consumer-note'), new RegExp(phrase));
    assert.doesNotMatch(text('c4-consumer-note'), /扣通胀转负|被通胀吃掉/); assert.equal(JSON.stringify(data), before);
  }
  for (const value of [null, undefined, false, '', '0', {}, NaN, Infinity]) {
    renderRetail(radar()); const data = radar();
    data.macroDrivers.consumerRetail.cartsNominalYoY = value; data.macroDrivers.consumerRetail.cartsRealYoY = value;
    renderRetail(data); assert.equal(text('c4-consumer-number'), '—'); assert.equal(text('c4-consumer-real'), '—');
    assert.doesNotMatch(text('c4-consumer-note'), /同比增长|同比下降|同比持平/);
  }
  for (const data of [null, {}, { macroDrivers: {} }, null]) {
    renderRetail(data);
    for (const key of ['number','real','diffusion','strongest','weakest','umich','redbook']) assert.equal(text(`c4-consumer-${key}`), '—', key);
    assert.equal(el('c4-consumer-status').className, 'status-bar pending');
    assert.match(text('c4-consumer-bofa'), /缺少可用/);
  }
  assert.deepEqual(errors, []);
});

test('consumer dates and source flags never mislabel aggregate dates or stale/failed evidence as current', () => {
  const data = radar(); renderRetail(data);
  assert.match(text('c4-consumer-aux'), /组合记录 2026-10-31/);
  assert.match(text('c4-consumer-note'), /CARTS各自日期未提供/);
  assert.match(text('c4-consumer-diffusion'), /2026-08-01/); assert.match(text('c4-consumer-umich'), /2026-09-01/);
  data.macroDrivers.consumerRetail.sourceStatus.cartsr = 'stale'; renderRetail(data);
  assert.match(text('c4-consumer-note'), /来源过期/); assert.equal(text('c4-consumer-badge'), '待核验');
  data.macroDrivers.consumerRetail.sourceStatus.carts = 'fallback'; renderRetail(data);
  assert.match(text('c4-consumer-note'), /沿用旧值/);
  for (const date of ['2026-02-30T00:00:00Z','2099-01-01T00:00:00Z',null]) {
    data.macroDrivers.consumerRetail.updatedAt = date; data.macroDrivers.consumerRetail.segmentUpdatedAt = date;
    data.macroDrivers.consumer.updatedAt = date; data.macroDrivers.consumerRetail.redbookRetailSalesDate = date;
    renderRetail(data); assert.match(text('c4-consumer-aux'), /日期待核验/);
    for (const key of ['diffusion','strongest','weakest','umich','redbook']) assert.equal(text(`c4-consumer-${key}`), '—');
  }
  data.macroDrivers.consumerRetail.sourceStatus = {}; renderRetail(data);
  assert.equal(text('c4-consumer-number'), '—'); assert.equal(text('c4-consumer-real'), '—');
});

test('BoA keeps true zero but rejects null, wrong-month dates, future dates and unusable sources', () => {
  for (const [value, result] of [[0,'+0.0%'],[0.01,'+1.0%'],[-0.01,'-1.0%']]) {
    const data = radar(); data.macroDrivers.consumerRetail.bofaCardSpendingExGasYoY = value; renderRetail(data);
    assert.match(text('c4-consumer-bofa'), new RegExp(result.replace(/[+.%]/g,'\\$&')));
    assert.match(text('c4-consumer-bofa'), /2026-10报告 · 已更新/);
  }
  for (const value of [null, undefined, false, '', '0', NaN, Infinity]) {
    const data = radar(); data.macroDrivers.consumerRetail.bofaCardSpendingExGasYoY = value; renderRetail(data);
    assert.match(text('c4-consumer-bofa'), /^—/); assert.doesNotMatch(text('c4-consumer-bofa'), /0\.0|已更新/);
  }
  for (const date of [null,'bad','2026-02-30T00:00:00Z','2026-10-02T00:00:00Z','2099-01-01T00:00:00Z','2026-10-01']) {
    const data = radar(); data.macroDrivers.consumerRetail.bofaReportDate = date; renderRetail(data); assert.match(text('c4-consumer-bofa'), /^—/);
  }
  const data = radar(); data.macroDrivers.consumerRetail.bofaReportDate = '2026-08-01T00:00:00Z'; renderRetail(data);
  assert.match(text('c4-consumer-bofa'), /报告较旧/);
  data.macroDrivers.consumerRetail.bofaStatus = 'fallback'; renderRetail(data); assert.match(text('c4-consumer-bofa'), /沿用旧值/);
  data.macroDrivers.consumerRetail.bofaStatus = 'missing'; renderRetail(data); assert.match(text('c4-consumer-bofa'), /^—/);
});

test('legacy transport and geo are auditable but cannot be mistaken for OFR inputs, including repeated missing payloads', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../../docs/fixtures/transport-shock-confirmation-factor/score-attribution-applied-v1.json', import.meta.url)));
  const data = { ...radar(), modules: { geopolitical: 78 }, transportShockScoringImpact: fixture.transportShockScoringImpact };
  const before = JSON.stringify(data);
  api.renderRiskEngines({ radarData: data }); api.renderTransportShockConfirmation({ radarData: data }); api.renderC8Geopolitical({ radarData: data });
  assert.match(text('transport-shock-score-attribution-note'), /旧模型主分 57 -> 60/);
  assert.match(text('transport-shock-score-attribution-note'), /不计入OFR/);
  assert.match(text('c1-transport-shock-score-impact'), /旧模型审计 \+3 \/ \+3/);
  assert.match(text('c1-transport-shock-note'), /不计入OFR/); assert.match(text('c8-geo-note'), /仅保留审计，不计入OFR/);
  assert.equal(JSON.stringify(data), before);
  data.transportShockScoringImpact = { ...fixture.transportShockScoringImpact, contributionPct: null, scoreBeforeTransport: null, scoreAfterTransport: null };
  api.renderRiskEngines({ radarData: data }); assert.doesNotMatch(text('transport-shock-score-attribution-note'), /0 -> 0/);
  assert.match(text('transport-shock-score-attribution-impact'), /贡献待核验/);
  api.renderTransportShockConfirmation({ radarData: { ...data, macroDrivers: { energyTransport: { latestAgeDays: null, transportShockCandidate: { score: null, evidence: { hormuzTankerVs30dPct: null } } } } } });
  assert.equal(text('c1-transport-shock-number'), '—'); assert.equal(text('c1-transport-shock-hormuz'), '—');
  assert.match(text('c1-transport-shock-freshness'), /数据龄待确认/);
  assert.match(text('c1-transport-shock-sample-quality'), /贡献待核验/);
  assert.match(text('c1-transport-shock-note'), /贡献待核验/);
  assert.doesNotMatch(text('c1-transport-shock-note'), /0贡献/);
  for (let i=0;i<2;i++) {
    api.renderRiskEngines({ radarData: null }); api.renderTransportShockConfirmation({ radarData: null }); api.renderC8Geopolitical({ radarData: null });
    assert.doesNotMatch(text('transport-shock-score-attribution-impact'), /\+3 \/ \+3/);
    assert.match(text('transport-shock-score-attribution-note'), /旧模型运输审计记录缺失/);
    assert.equal(text('c8-geo-number'), '—'); assert.equal(el('c8-geo-status').className, 'status-bar pending');
    assert.equal(text('c8-geo-badge'), '待核验'); assert.match(text('c8-geo-aux'), /审计趋势 待核验/);
  }
  assert.deepEqual(errors, []);
});

test('actual overview entry point never falls back from missing OFR to old score or advice', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../../data/radar-data.json', import.meta.url)));
  delete data.mainPressureReadout; data.score = 99;
  data.decisionModel = { ...data.decisionModel, state: 'Defensive', positionGuidance: '减仓' };
  const before = JSON.stringify(data);
  for (let i=0;i<2;i++) {
    api.renderMacroOverview({ radarData: data, marketPricingMetricsData: market() });
    assert.equal(text('hero-score-value'), '—'); assert.match(text('hero-verdict-body'), /不以旧综合分代替/);
    assert.doesNotMatch(text('hero-verdict-body'), /99|减仓|禁止新增|目标仓位/);
  }
  assert.equal(JSON.stringify(data), before); assert.deepEqual(errors, []);
  api.renderMacroOverview({ radarData: null, marketPricingMetricsData: null });
  assert.equal(text('hero-score-value'), '—'); assert.equal(text('c4-consumer-number'), '—');
  assert.equal(text('c7-ndx-number'), '—'); assert.match(text('transport-shock-score-attribution-note'), /记录缺失/);
  assert.deepEqual(errors, []);
});

test('static no-data HTML has no invented temperature, retail observations or active score claims', () => {
  const marketBlock = html.split('id="homepage-market-temperature"')[1].split('<details')[0];
  assert.doesNotMatch(marketBlock, /第二极端|extreme-hot|极度过热|60 日标准差/); assert.match(marketBlock, /60 周标准差/);
  const consumerCard = html.split('id="card-c4-consumer"')[1].split('</article>')[0];
  assert.doesNotMatch(consumerCard, /\+1\.9|-1\.2|\+3\.8|被通胀吃掉|扣通胀转负|badge yellow/);
  assert.match(consumerCard, /id="c4-consumer-note"/); assert.match(consumerCard, /各源独立观察/);
  assert.doesNotMatch(html, /直接计入主评分|底层地缘评分\(计入主评分\)/);
  assert.match(html, /Transport Shock 主分归因（旧模型审计）/);
});

test('geo true zero is valid, while invalid score/trend values remain pending', () => {
  api.renderC8Geopolitical({ radarData: { modules: { geopolitical: 0 }, moduleTrends: { geopolitical: 0 } } });
  assert.equal(text('c8-geo-number'), '0'); assert.equal(el('c8-geo-status').className, 'status-bar green');
  assert.doesNotMatch(text('c8-geo-aux'), /待核验/);
  for (const value of [null, undefined, false, '', '0', NaN, Infinity]) {
    api.renderC8Geopolitical({ radarData: { modules: { geopolitical: value }, moduleTrends: { geopolitical: value } } });
    assert.equal(text('c8-geo-number'), '—'); assert.equal(el('c8-geo-status').className, 'status-bar pending');
    assert.match(text('c8-geo-aux'), /待核验/);
  }
  for (const id of ['card-c7-ndx','card-c8-geo']) {
    const card = html.split(`id="${id}"`)[1].split('</article>')[0];
    assert.match(card, /status-bar pending/); assert.match(card, /badge pending/);
  }
  assert.doesNotMatch(html.split('<!-- C4:')[1].split('<!-- C7:')[0], /实际工资被通胀压制|消费偏弱/);
});


test('consumer auxiliary numeric fields keep true zero and clear invalid finite-type inputs', () => {
  for (const value of [0, null, undefined, false, '', '0', NaN, Infinity]) {
    const data = radar(), retail = data.macroDrivers.consumerRetail, consumer = data.macroDrivers.consumer;
    retail.segmentDiffusionPct = value; retail.segmentPositiveCount = value; retail.segmentSeriesCount = value;
    retail.strongestSegment.yoy = value; retail.weakestSegment.yoy = value;
    consumer.umichSentiment = value; consumer.threeMonthChange = value; retail.redbookRetailSalesYoY = value;
    renderRetail(data);
    for (const key of ['diffusion','strongest','weakest','umich','redbook']) {
      if (value === 0) assert.match(text(`c4-consumer-${key}`), /0/, key);
      else assert.equal(text(`c4-consumer-${key}`), '—', key);
    }
  }
});


test('BoA total card-spending growth cannot substitute for missing ex-gas evidence', () => {
  const data = radar();
  data.macroDrivers.consumerRetail.bofaCardSpendingYoY = 0.062;
  data.macroDrivers.consumerRetail.bofaCardSpendingExGasYoY = null;
  renderRetail(data);
  assert.match(text('c4-consumer-bofa'), /^—/);
  assert.doesNotMatch(text('c4-consumer-bofa'), /6\.2|0\.0|已更新/);
});
