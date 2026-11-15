import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBrentProvenanceView, provenanceDate, provenanceTime } from '../../scripts/modules/dataProvenanceView.js';
import { snapshotDisplayHealth } from '../../scripts/modules/snapshotFreshness.js';
const NOW = Date.parse('2026-11-09T12:00:00Z');
const fixture = () => ({
  selectedBrent: { source: 'fred:DCOILBRENTEU', value: 107.03, observedAt: '2026-11-08T01:41:30Z' },
  publicSpotProxy: { source: 'fred-anchor', value: 107.03, observedAt: '2026-11-03' },
  eiaBrentSpotProxy: { price: 107.03, updatedAt: '2026-11-03T00:00:00Z' },
  futuresProxy: { source: 'yahoo', value: 98.32, observedAt: '2026-11-06T21:59:44Z' },
  iceFuturesPriceCurve: { frontPrice: 97.97, contracts: [{ price: 97.97, contract: 'Jan27', updatedAt: '2026-11-06T22:59:00Z' }] },
  proxySpread: { spotMinusFutures: 8.71, maxProxyDivergencePct: 8.365 },
});
test('mixed-date spot and futures retain values/dates, suppress spurious premium and divergence', () => {
  const input = fixture(), before = JSON.stringify(input), view = buildBrentProvenanceView(input, 107.03, NOW);
  assert.match(view.selected, /FRED 现货代理.*2026-11-03/);
  assert.doesNotMatch(view.selected, /2026-11-08/);
  assert.match(view.eia, /107\.03.*2026-11-03/);
  assert.match(view.futures, /98\.32.*合约月未核实.*2026-11-06/);
  assert.match(view.ice, /97\.97.*Jan27.*2026-11-06/);
  assert.match(view.spread, /日期或合约未对齐/);
  assert.doesNotMatch(view.divergence, /8\.365|%/);
  assert.equal(JSON.stringify(input), before);
});
test('matching prices never infer continuous futures month from a monthly curve', () => {
  const input = fixture(); input.futuresPriceCurve = { contracts: [{ price: 98.32, contractMonth: 'Jan27', updatedAt: input.futuresProxy.observedAt }] };
  input.publicSpotProxy.observedAt = '2026-11-06';
  assert.match(buildBrentProvenanceView(input, 107.03, NOW).futures, /合约月未核实/);
  assert.match(buildBrentProvenanceView(input, 107.03, NOW).spread, /未对齐/);
  input.futuresProxy.contractMonth = 'Jan27';
  assert.match(buildBrentProvenanceView(input, 107.03, NOW).spread, /\+\$8\.71.*非实物溢价/);
});
test('selected observations require matching source family and value', () => {
  const input = fixture();
  assert.match(buildBrentProvenanceView(input, 108, NOW).selected, /来源口径待核验.*未核实/);
  input.selectedBrent = { source: 'wind', value: 107.03, observedAt: '2026-11-08' };
  assert.match(buildBrentProvenanceView(input, 107.03, NOW).selected, /口径待核验.*未核实/);
  input.selectedBrent = { source: 'yahoo:BZ=F', value: 98.32 };
  assert.match(buildBrentProvenanceView(input, 98.32, NOW).selected, /Yahoo 期货代理.*2026-11-06/);
  input.futuresProxy.source = 'tradingeconomics';
  assert.match(buildBrentProvenanceView(input, 98.32, NOW).selected, /未核实/);
});
test('missing fields clear values; true zero remains valid; mismatched ICE row cannot lend month/date', () => {
  const input = fixture(); input.iceFuturesPriceCurve.contracts[0].price = 95;
  assert.match(buildBrentProvenanceView(input, 107.03, NOW).ice, /合约月未核实.*观察日未核实/);
  for (const value of [null, undefined, '', false, '0', NaN, Infinity]) {
    input.eiaBrentSpotProxy.price = value;
    assert.match(buildBrentProvenanceView(input, 107.03, NOW).eia, /^—/);
  }
  input.eiaBrentSpotProxy.price = 0;
  assert.match(buildBrentProvenanceView(input, 107.03, NOW).eia, /^\$0\.00/);
  assert.match(buildBrentProvenanceView({}, null, NOW).ice, /^—.*未核实/);
});
test('strict provenance timestamps do not normalize impossible/future dates or clock fields', () => {
  for (const value of [null, 0, '', '2026-02-30', '2026-11-10', '2026-11-09T13:00:00Z', '2026-11-08T24:00:00Z', '2026-11-08T01:00:00+15:00', '2026-11-08T12:00:00']) assert.equal(provenanceDate(value, NOW), null, String(value));
  assert.equal(provenanceDate('2026-11-04', NOW), '2026-11-04');
  assert.equal(provenanceTime('2026-11-04', NOW), '未记录或待核验');
  assert.equal(provenanceTime('2026-11-08T01:42:26.104Z', NOW), '2026-11-08 01:42 UTC');
});
test('100/100 collection health never renews an old snapshot or undated observation', () => {
  const view = snapshotDisplayHealth({ updatedAt: '2026-11-01T00:00:00Z', dailyRealtimeInput: { healthScore: 100 } }, NOW);
  assert.equal(view.status, 'stale'); assert.match(view.collectionLabel, /100\/100/);
  assert.match(view.heroLabel, /历史快照.*生成已过/);
  assert.match(buildBrentProvenanceView({ selectedBrent: { value: 107.03, source: 'fred' } }, 107.03, NOW).selected, /未核实/);
});
test('static labels distinguish broad dollar, source health and slower structural vulnerability', () => {
  const html = readFileSync('index.html', 'utf8');
  const card = html.split('id="card-c2-dxy"')[1].split('</article>')[0];
  assert.match(card, /BROAD USD INDEX/); assert.match(card, /DTWEXBGS.*不是ICE DXY/);
  assert.doesNotMatch(card, /name-en">DXY</);
  assert.doesNotMatch(html, /系统所有关键数据源处于实时状态|距离反映现货溢价压力|能源主线传导正在被实际定价压实/);
  assert.match(html, /输入快照生成.*detail-health-input-at/);
  assert.match(html, /Daily 计算起点.*detail-health-run-at/);
  assert.match(readFileSync('scripts/modules/renderOfrPrimary.js', 'utf8'), /慢变量须分项核验，OFR偏低不代表结构安全/);
});

test('fallback market proxy never claims Yahoo or a continuous contract', () => {
  for (const source of ['tradingeconomics', 'unknown', undefined]) {
    const input = fixture(); input.futuresProxy.source = source;
    const view = buildBrentProvenanceView(input, 107.03, NOW);
    assert.doesNotMatch(view.futures, /Yahoo|连续近月/);
    assert.match(view.futures, /口径与合约月未核实/);
    assert.match(view.futures, source === 'tradingeconomics' ? /Trading Economics/ : /来源待核验/);
  }
  const input = fixture(); input.publicSpotProxy.source = 'another-market';
  assert.match(buildBrentProvenanceView(input, 107.03, NOW).selected, /观察日未核实/);
});
