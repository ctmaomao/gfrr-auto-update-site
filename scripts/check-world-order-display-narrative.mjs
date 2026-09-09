import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { worldOrderStateLabel } from './modules/macroOverviewDisplayHelpers.js';

const renderer = readFileSync('scripts/modules/renderMacroOverview.js', 'utf8');
const start = renderer.indexOf('function renderWorldOrderStress(');
const end = renderer.indexOf('\nfunction textValue(', start);
assert(start >= 0 && end > start, 'runtime renderer must be present');
const leaves = {};
const tones = {};
const context = vm.createContext({
  document: { getElementById: (id) => ({ classList: { remove: () => { tones[id] = null; } } }) },
  worldOrderStateLabel,
  setLeafText: (id, value) => { leaves[id] = String(value); },
  updateToneClass: (id, allowed, tone) => { if (tone) tones[id] = tone; },
  dimensionTone: (value) => value >= 70 ? 'high' : 'low',
  confidenceLabel: (value) => value == null ? null : String(value),
  textValue: (value) => typeof value === 'string' && value.trim() || null,
  console: { error: (...args) => { throw new Error(args.join(' ')); } },
});
vm.runInContext(`${renderer.slice(start, end)}\nthis.render = renderWorldOrderStress;`, context);
const render = (value) => context.render({ worldOrderStressData: value });
const fixture = JSON.parse(readFileSync('data/world-order-stress.json', 'utf8'));
const original = JSON.stringify(fixture);
render(fixture);
assert.equal(JSON.stringify(fixture), original, 'display must not mutate production input');
assert.match(leaves['wo-dim-peace-trend'], /SIPRI.*ACLED/);
assert.doesNotMatch(leaves['wo-dim-conflict-trend'], /ACLED/);

for (const [state, expected] of Object.entries({ not_confirmed: '未确认', weak: '弱确认', partial_confirmed: '部分确认', high_confirmed: '较强确认', unknown: '待确认' })) {
  render({ dimensions: { marketConfirmation: { state } }, marketConfirmationInput: { healthScore: 100 } });
  assert.equal(leaves['wo-detail-market-confirmation'], expected, state);
  assert.match(leaves['wo-detail-market-narrative'], new RegExp(`当前市场确认：${expected}`));
  assert.doesNotMatch(leaves['wo-detail-market-narrative'], /从未确认升档到已确认|已经开始定价/);
}
for (const [state, expected] of [['normal', '常态观察'], ['war_economy_stress', '战时经济压力期'], ['unknown', '状态待确认']]) {
  render({ state, score: 0 });
  assert.equal(leaves['wo-detail-state'], expected);
  assert.equal(leaves['wo-detail-score'], '0');
}
render({ externalSources: { acled: { summary: { latestWeek: '2026-08-21', monthlyAsOfDate: '2026-07-31', sourceFreshness: 'aging', monthlySourceFreshness: 'stale', eventsLast4Weeks: 0 } } } });
assert.equal(leaves['wo-detail-acled-latest-week'], '2026-08-21');
assert.equal(leaves['wo-detail-acled-events-4w'], '0');
assert.equal(leaves['wo-detail-source-freshness'], 'ACLED 周表时效：偏旧；月表时效：过期。');
for (const date of ['2026-02-30', '2026-13-01', '<script>', null]) {
  render({ externalSources: { acled: { summary: { latestWeek: date } } } });
  assert.equal(leaves['wo-detail-acled-latest-week'], '—');
}
render(fixture);
render(null);
for (const id of ['wo-detail-score', 'wo-detail-acled-events-4w', 'wo-driver-1', 'wo-driver-2', 'wo-driver-3', 'wo-dim-market-score']) assert.equal(leaves[id], '—', `clear ${id}`);
assert.equal(leaves['wo-detail-market-confirmation'], '待确认');
assert.equal(tones['wo-dim-market'], null);
assert.doesNotMatch(leaves['wo-dim-market-trend'], /上行/);
render({ score: '70', dimensions: { peaceDividendRetreat: { score: null, trend: 'unknown_enum', evidence: [{ source: 'new_source' }] } }, dominantDrivers: [{ dimensionKey: 'raw_field', score: 90 }] });
assert.equal(leaves['wo-detail-score'], '—');
assert.equal(leaves['wo-driver-1'], '—');
assert.equal(leaves['wo-dim-peace-trend'], '来源待确认 · 趋势待确认');

const html = readFileSync('index.html', 'utf8');
const section = html.slice(html.indexOf('<details class="editorial-folded-content" id="world-order-stress-section"'), html.indexOf('<details class="editorial-folded-content" id="method-evidence"'));
assert(section.length > 0);
for (const forbidden of ['本期叠加升至', '触发橙色升档', '从中性升至承压', '从未确认升档到已确认', '这三项都来自高频数据源', '近 30 天的实际事件', '上行 2 周', 'CFETS / 资本流向', '分应用于今日判读']) assert(!section.includes(forbidden), `unsupported static narrative: ${forbidden}`);
for (const id of ['wo-detail-intro-score', 'wo-detail-score', 'wo-driver-1', 'wo-driver-2', 'wo-driver-3']) assert(section.includes(`id="${id}">—</`), `neutral initial ${id}`);
assert(section.includes('工作流成功不代表底层表格已经更新'));
assert(section.includes('不自行设定触发阈值'));
assert(section.includes('id="wo-detail-source-freshness"'));
assert(section.includes('id="wo-detail-market-narrative"'));
console.log('World Order display narrative: PASS (states, freshness, source attribution, missing/zero, rerender and static fallbacks)');
