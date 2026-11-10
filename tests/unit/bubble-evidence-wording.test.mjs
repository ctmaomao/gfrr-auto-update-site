import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { signedSpreadNote, enterpriseSurveyNote, evidenceAwareNote } from '../../scripts/bubble-watch/evidence-wording.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { summarizeEvidence } from '../../scripts/bubble-watch/evidence-publication.mjs';
import { buildEditorialScoringSnapshot } from '../../scripts/bubble-watch/editorial-score-snapshot.mjs';
import { modelRevision } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
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


test('historical r5 raw ARR fallback passes unchanged public-copy rules after public, narrative and compact projection', () => {
  const bubble = JSON.parse(gunzipSync(fs.readFileSync(new URL('../fixtures/bubble-r5-observation-migration.json.gz', import.meta.url)))).before;
  const entry = { status: 'red', value_display: '披露序列减速', note: '历史研究披露序列，不代表新观测。', asOfDate: '2026-11-08', maxAgeDays: 45 };
  const definition = bubble.indicators.find(row => row.id === 'arr_2nd_deriv');
  const context = vm.createContext({ evidenceAwareNote,
    CORE_INDICATOR_ID_SET: new Set(bubble.indicators.filter(row => row.score_role === 'core').map(row => row.id)),
    SHADOW_INDICATOR_ID_SET: new Set(bubble.indicators.filter(row => row.score_role === 'shadow').map(row => row.id)) });
  const functionText = (name, next) => source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
  vm.runInContext(functionText('daysBetween', 'isoWeekKey')
    + functionText('buildFallbackIndicator', 'hasStrongProxyConfirmation')
    + source.slice(source.indexOf('const PUBLIC_SOURCE_LABELS ='), source.indexOf('// ---------- 打分 / 判读'))
    + '\nglobalThis.fallback = buildFallbackIndicator; globalThis.project = applyPublicIndicatorCopy;', context);
  const raw = context.fallback(definition, entry, '2026-11-10', 'hybrid_live source failed: arr_underlying_observation_stale: latest milestone 2026-05-28 is 166d old (max 45d)');
  assert.match(raw.note, /实时抓取失败,沿用 2026-11-08 快照/);
  const projected = context.project([raw])[0];
  const before = structuredClone(bubble);
  before.indicators = before.indicators.map(row => row.id === raw.id ? structuredClone(raw) : row);
  bubble.indicators = bubble.indicators.map(row => row.id === raw.id ? structuredClone(projected) : row);
  const options = { revision: modelRevision(bubble.scoring.model_version), promotionPolicy: bubble.scoring.shadow_promotion_policy, similarity: bubble.summary.similarity };
  const result = summarizeEvidence(bubble.indicators, bubble.as_of_date, null, options);
  assert.deepEqual(result.replay, summarizeEvidence(before.indicators, before.as_of_date, null, options).replay);
  assert.deepEqual(buildEditorialScoringSnapshot(bubble), buildEditorialScoringSnapshot(before));
  bubble.summary.narrative_plan = result.summary.narrative_plan;
  const highlight = bubble.summary.narrative_plan.evidenceHighlights.find(row => row.id === raw.id);
  assert.ok(highlight, 'actual qualified narrative must include the ARR disclosure');
  const discovery = buildNewsDiscovery({ rawStories: [], sourceStatus: {}, generatedAt: '2026-11-10T12:00:00Z', windowStart: '2026-11-03', windowEnd: '2026-11-10' });
  const fact = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery }).structuredFacts.find(row => row.indicatorId === raw.id);
  const checkerSource = fs.readFileSync(new URL('../../scripts/check-bubble-watch.mjs', import.meta.url), 'utf8');
  const failures = [];
  const checker = vm.createContext({ check: (group, ok, message) => { if (!ok) failures.push({ group, message }); } });
  vm.runInContext(checkerSource.slice(checkerSource.indexOf('const VISIBLE_COPY_FORBIDDEN_PATTERNS ='), checkerSource.indexOf('const history ='))
    + checkerSource.slice(checkerSource.indexOf('function checkVisibleCopy('), checkerSource.indexOf('for (const ind of data.indicators || [])', checkerSource.indexOf('function checkVisibleCopy(')))
    + '\nglobalThis.validate = checkVisibleCopy;', checker);
  checker.validate('negative-control-raw-note', raw.note);
  assert.ok(failures.some(row => row.message.includes('fetch/build implementation wording')), 'existing validator must catch the original bug');
  failures.length = 0;
  for (const [field, text] of [['public', projected.note], ['narrative', highlight.note_summary], ['compact', fact.factZh]]) {
    checker.validate(field, text);
    assert.match(text, /2026-11-08.*复核日期/);
    assert.match(text, /不是新增 ARR 观测/);
    assert.match(text, /未附.*原始里程碑日期/);
    assert.match(text, /2026-05-28.*166.*45.*拒用/);
  }
  assert.deepEqual(failures, []);
  assert.equal(projected.provenance.reason, raw.provenance.reason);
  assert.equal(projected.status, raw.status);
  assert.equal(projected.stale, raw.stale);
});
