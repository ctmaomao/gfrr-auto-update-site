import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { signedSpreadNote, enterpriseSurveyNote, evidenceAwareNote } from '../../scripts/bubble-watch/evidence-wording.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { buildNewsDiscovery } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
const source = fs.readFileSync(new URL('../../scripts/build-bubble-watch.mjs', import.meta.url), 'utf8');
const read = file => JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url)));

test('signed SPY/RSP description preserves existing absolute score at negative, positive, zero and boundaries', async () => {
  const method = source.slice(source.indexOf('  async spy_vs_rsp_6m() {'), source.indexOf('  async insider_sell_buy(ctx) {'));
  for (const spread of [-11, -10, -6.5, -5, -4.9, 0, 4.9, 5, 6.5, 10, 11]) {
    const context = vm.createContext({ signedSpreadNote, retry: fn => fn(), yahooCloses: async symbol => symbol === 'SPY' ? [100, 100 + spread] : [100, 100], fmtPct: n => `${n.toFixed(1)}%` });
    vm.runInContext(`globalThis.builder = ({${method}}).spy_vs_rsp_6m`, context);
    const result = await context.builder();
    const magnitude = Math.abs(result.detail.spread);
    assert.equal(result.status, magnitude > 10 ? 'red' : magnitude >= 5 ? 'yellow' : 'green');
    assert.ok(Math.abs(result.detail.spread - spread) < 1e-10);
    assert.match(result.note, spread < 0 ? /等权重 RSP 领先市值加权 SPY/ : spread > 0 ? /市值加权 SPY 领先等权重 RSP/ : /回报持平/);
    assert.match(result.note, /绝对值/);
    assert.doesNotMatch(result.note, /头部独涨、广度未跟上/);
  }
});

test('survey calibration and distinct population limitations survive missing or failed corroboration', () => {
  for (const support of [null, '', 'Deloitte support fetch failed: unavailable']) {
    const note = enterpriseSurveyNote({ productionDeployPct: 52, deloitteSupport: support, proxyConfidenceCalibration: { applied: true, displayAnchor: { asOfDate: '2026-11-08' } } }, '44%（QoQ +21pp）');
    assert.match(note, /44%（QoQ \+21pp）.*登记校准/);
    assert.match(note, /不是本轮调查新观测/);
    assert.match(note, /52% 受访高管/);
    assert.match(note, /未取得 Deloitte 可核验支持/);
    assert.match(note, /不可混为同一观测/);
  }
  assert.match(enterpriseSurveyNote({ productionDeployPct: 52, deloitteSupport: 'Worker access to AI rose by 50% …' }), /不构成该部署比例的同口径确认/);
});

test('current published facts disclose missing ARR anchor dates and stale rejected candidate even when stale is false', () => {
  const bubble = structuredClone(read('docs/fixtures/bubble-watch/legacy-contract-bundle.json').files['data/bubble-watch.json']);
  Object.assign(bubble.indicators.find(row => row.id === 'arr_2nd_deriv'), { note: '历史披露序列减速 −116.67pp。', stale: false, as_of: '2026-11-08', provenance: { mode: 'auto_fallback', asOfDate: '2026-11-08', reason: 'hybrid_live source failed: arr_underlying_observation_stale: latest milestone 2026-05-28 is 165d old (max 45d)' } });
  Object.assign(bubble.indicators.find(row => row.id === 'enterprise_deploy'), { value_display: '44%（QoQ +21pp）', provenance: { detail: { productionDeployPct: 52, deloitteSupport: null, proxyConfidenceCalibration: { applied: true, displayAnchor: { asOfDate: '2026-11-08' } } } } });
  Object.assign(bubble.indicators.find(row => row.id === 'spy_vs_rsp_6m'), { provenance: { detail: { spyRet: 1.8111747423, rspRet: 8.3141286330 } } });
  const before = structuredClone(bubble);
  const discovery = buildNewsDiscovery({ rawStories: [], sourceStatus: {}, generatedAt: `${bubble.as_of || '2026-11-09'}T23:30:00Z`, windowStart: '2026-11-02', windowEnd: '2026-11-09' });
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery });
  const arr = input.structuredFacts.find(row => row.indicatorId === 'arr_2nd_deriv');
  assert.match(arr.factZh, /2026-11-08 是复核日期，不是新增 ARR 观测/);
  assert.match(arr.factZh, /未附.*原始里程碑日期/);
  assert.match(arr.factZh, /不能认定.*最近三个月实际增长/);
  assert.match(arr.factZh, /2026-05-28.*165.*45.*拒用/);
  assert.equal(arr.stale, false);
  const enterprise = input.structuredFacts.find(row => row.indicatorId === 'enterprise_deploy');
  assert.match(enterprise.factZh, /不是本轮调查新观测/);
  assert.match(enterprise.factZh, /未取得 Deloitte/);
  assert.match(enterprise.factZh, /不可混为同一观测/);
  assert.match(input.structuredFacts.find(row => row.indicatorId === 'spy_vs_rsp_6m').factZh, /等权重 RSP 领先市值加权 SPY/);
  assert.deepEqual(bubble, before);
  const indicator = bubble.indicators.find(row => row.id === 'arr_2nd_deriv');
  const note = evidenceAwareNote(indicator);
  assert.equal(evidenceAwareNote({ ...indicator, note }), note);
});
