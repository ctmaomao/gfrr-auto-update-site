import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ofrEditorialFixture } from '../fixtures/macro-editorial-ofr.mjs';
import { projectEditorial, reviewEditorial } from '../../scripts/macro-risk/editorial-production.mjs';
import assert from 'node:assert/strict';
import { OFR_COLUMNS, parseOfrCsv, buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent, retireLegacyAdvice } from '../../scripts/daily/ofr-publication-contract.mjs';
import { buildOfrEditorialSnapshot } from '../../scripts/macro-risk/editorial-ofr-snapshot.mjs';
import { projectOfrEditorialSnapshot } from '../../scripts/modules/macroRiskEditorialOfrContract.js';
import { isMacroRiskEditorialVisible, isMacroRiskEditorialPreviousIssueVisible, renderMacroRiskEditorial } from '../../scripts/modules/renderMacroRiskEditorial.js';

// Synthetic, offline-only publication fixtures. Never production observations.
const now = '2026-11-01T12:00:00Z';
const refs = ['site:ofr', 'news:official'];
const bounds = { ...Object.fromEntries(['displayOnly', 'commentaryOnly', 'externalAiGenerated', 'usesExternalAiApi', 'notInvestmentAdvice'].map(k => [k, true])), ...Object.fromEntries(['GfrrScoring', 'RiskModules', 'TailRiskOverlay', 'DecisionModel', 'ExecutionLock', 'PositionGuidance', 'WorldOrder', 'Odp', 'BubbleWatch'].map(k => ['affects' + k, false])) };
function component(value) {
  const rows = parseOfrCsv(OFR_COLUMNS.join(',') + '\n' + [['2026-10-21', -0.5], ['2026-10-28', value]].map(([d,v]) => [d,v,0,0,0,0,0,0,0,0].join(',')).join('\n'));
  return buildPublishedOfrComponent({ rows, readout: buildOfrReadout(rows, { asOf: now, retrievedAt: now, snapshotSha256: 'a'.repeat(64) }), now });
}
function fixture(value = -1, pressure = component(value)) {
  const data = retireLegacyAdvice({ updatedAt: pressure.asOf, score: 68 }, pressure);
  const output = {
    schemaVersion: 'macro-risk-editorial-ofr-output-v2', provider: 'deepseek', mode: 'external_ai_macro_risk_editorial', model: 'fixture',
    generatedAt: pressure.asOf, sourceDataUpdatedAt: pressure.asOf, headlineZh: '金融压力与独立背景观察', leadZh: '当前官方金融压力读数需要与独立宏观证据并列解读。', sourceRefIds: refs,
    pressureSynthesis: { assessmentZh: '金融压力偏离历史平均，不能替代对结构脆弱性的独立观察。', sourceRefIds: refs },
    weeklyTimeline: [], keyTensions: [], contextAnalysis: [], crossMarketAnalysis: [], historicalComparison: null,
    watchNext: [{ conditionZh: '观察后续官方发布', whyItMattersZh: '核对压力是否持续', invalidationZh: '来源陈旧时停止本期解释', sourceRefIds: refs }],
    dataGaps: ['历史覆盖不足'], sourceAttribution: refs.map(sourceRefId => ({ sourceRefId })),
    confidence: { level: 'low', score: 30, reasonZh: '资料覆盖有限' }, auditFlags: [], boundaries: { ...bounds }
  };
  data.macroRiskEditorialLayer = {
    schemaVersion: 'macro-risk-editorial-ofr-production-v2', status: 'valid', displayEnabled: true, provider: 'deepseek', mode: output.mode, model: output.model,
    sourceDataUpdatedAt: pressure.asOf, generatedAt: pressure.asOf, output, pressureSnapshot: projectOfrEditorialSnapshot(pressure),
    sourceLedger: [{ id: refs[0], kind: 'site' }, { id: refs[1], kind: 'news', url: 'https://example.org/official' }],
    validation: { status: 'pass', artifactDigest: 'b'.repeat(64) }, qualityReview: { status: 'warn', promotionEligible: false },
    provenance: { humanApproved: false, generatedBy: 'github_actions_workflow', runId: '123', sourceCommit: 'c'.repeat(40), inputDigest: 'd'.repeat(64), artifactDigest: 'b'.repeat(64) },
    freshness: { maxAgeHours: 30, isStale: false, artifactGeneratedAt: pressure.asOf, sourceDataUpdatedAt: pressure.asOf }, boundaries: { ...bounds, frontendDisplayApproved: true }
  };
  return data;
}
const visible = (data, time = data.updatedAt) => isMacroRiskEditorialVisible(data.macroRiskEditorialLayer, data, new Date(time));

test('browser snapshot matches the program projection, preserves negative/zero and ignores object key order', () => {
  for (const value of [-1, 0, '']) {
    const data = fixture(value), { macroRiskEditorialLayer, ...source } = data;
    assert.deepEqual(projectOfrEditorialSnapshot(source.mainPressureReadout), buildOfrEditorialSnapshot(source));
    assert.equal(visible(data), true);
    data.macroRiskEditorialLayer.pressureSnapshot = Object.fromEntries(Object.entries(macroRiskEditorialLayer.pressureSnapshot).reverse());
    assert.equal(visible(data), true);
  }
});

test('current v2 age is capped at 30 hours and rejects future, invalid or mixed source clocks', () => {
  const data = fixture();
  assert.equal(visible(data, new Date(Date.parse(now) + 30 * 3600000)), true);
  assert.equal(visible(data, new Date(Date.parse(now) + 30 * 3600000 + 1)), false);
  for (const mutate of [l => l.generatedAt = '2099-01-01T00:00:00Z', l => l.output.generatedAt = 'bad', l => l.sourceDataUpdatedAt = 'old', l => l.freshness.maxAgeHours = 31, l => l.freshness.isStale = true]) {
    const copy = fixture(); mutate(copy.macroRiskEditorialLayer); assert.equal(visible(copy), false);
  }
});

test('schema, snapshot, source and all nonimpact boundaries fail closed independently', () => {
  const changes = [
    l => l.schemaVersion = 'macro-risk-editorial-production-v1', l => l.output.schemaVersion = 'macro-risk-editorial-output-v1',
    l => l.pressureSnapshot.index.value = 999, l => l.pressureSnapshot.source.snapshotSha256 = 'e'.repeat(64),
    l => l.pressureSnapshot.extra = 'untrusted', l => l.output.scoreSynthesis = { score: 999 }, l => l.output.moduleAnalysis = [],
    l => l.output.contextAnalysis = [{ topic: 'credit', labelZh: '信用', assessmentZh: '背景', score: 999, sourceRefIds: refs }],
    l => l.output.pressureSynthesis.assessmentZh = '官方值为999', l => l.output.leadZh = '', l => l.output.watchNext = [], l => l.output.dataGaps = [],
    l => l.sourceLedger.push(l.sourceLedger[0]), l => l.sourceLedger[0].snippet = 'raw', l => l.sourceLedger[1].url = 'http://example.org',
    l => l.output.watchNext[0].sourceRefIds = ['unknown'], l => l.output.sourceRefIds = ['unknown'], l => l.output.sourceAttribution = [],
    l => l.validation.status = 'fail', l => l.qualityReview.status = 'fail', l => l.provenance.humanApproved = true,
    l => l.output.leadZh = '建议加仓', l => l.output.leadZh = '综合分为99'
  ];
  for (const key of Object.keys(bounds).filter(k => k.startsWith('affects'))) {
    changes.push(l => l.boundaries[key] = true, l => l.output.boundaries[key] = true);
  }
  for (const mutate of changes) { const data = fixture(); mutate(data.macroRiskEditorialLayer); assert.equal(visible(data), false, String(mutate)); }
});

test('legacy current and retained history remain hidden on any migrated current page', () => {
  const data = fixture(); data.macroRiskEditorialLayer.schemaVersion = 'macro-risk-editorial-production-v1';
  assert.equal(visible(data), false);
  assert.equal(isMacroRiskEditorialPreviousIssueVisible(data.macroRiskEditorialLayer, data, new Date(now)), false);
  assert.equal(isMacroRiskEditorialPreviousIssueVisible(fixture().macroRiskEditorialLayer, data, new Date(now)), false);
  for (const marker of [{ mainPressureReadout: {} }, { advicePolicy: {} }, { scoreRole: 'legacy_model_audit_only' }, { legacyModelAudit: {} }]) {
    const partial = { updatedAt: now, ...marker };
    assert.equal(isMacroRiskEditorialVisible(data.macroRiskEditorialLayer, partial, new Date(now)), false);
    assert.equal(isMacroRiskEditorialPreviousIssueVisible(data.macroRiskEditorialLayer, partial, new Date(now)), false);
  }
});

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.hidden = true; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
}
function dom() {
  const nodes = new Map(['macro-risk-editorial', 'macro-editorial-content'].map(id => [id, new Element('div')]));
  return { nodes, document: { getElementById: id => nodes.get(id), createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'), createTextNode: text => { const node = new Element('text'); node.textContent = text; return node; } } };
}

test('rendered v2 labels use trusted pressure only and optional sections create no empty filler', () => {
  const old = globalThis.document, { nodes, document } = dom(); globalThis.document = document;
  try {
    for (const [value, expected] of [[-1, '-1.000'], [0, '0.000'], ['', '缺失']]) {
      const data = fixture(value); assert.equal(renderMacroRiskEditorial({ radarData: data, now: new Date(now) }), true);
      const text = nodes.get('macro-editorial-content').textContent;
      assert.match(text, new RegExp('OFR FSI 原值 ' + expected));
      assert.match(text, /2026-10-28/); assert.match(text, /不是0–100风险分/); assert.match(text, /历史百分位缺失/);
      if (value !== '') assert.match(text, /2026-10-21 → 2026-10-28/);
      assert.doesNotMatch(text, /综合分|六大风险模块|30\/100|近 7 日关键脉络|相似点/);
      assert.equal(nodes.get('macro-risk-editorial').dataset.editorialMode, 'current');
    }
    const invalid = fixture(); invalid.macroRiskEditorialLayer.pressureSnapshot.index.value++;
    assert.equal(renderMacroRiskEditorial({ radarData: invalid, now: new Date(now) }), false);
    assert.equal(nodes.get('macro-risk-editorial').hidden, true); assert.equal(nodes.get('macro-editorial-content').textContent, '');
  } finally { globalThis.document = old; }
});

test('cached, stale and missing snapshots retain explicit state instead of a fabricated zero', () => {
  const old = globalThis.document, { nodes, document } = dom(); globalThis.document = document;
  try {
    for (const [pressure, expected] of [
      [buildPublishedOfrComponent({ previous: component(-1), now: '2026-11-02T12:00:00Z', retrievalError: 'timeout' }), '抓取失败'],
      [buildPublishedOfrComponent({ previous: component(-1), now: '2026-11-06T12:00:00Z' }), '陈旧'],
      [buildPublishedOfrComponent({ now }), '官方读数缺失']
    ]) {
      const data = fixture(-1, pressure);
      assert.equal(renderMacroRiskEditorial({ radarData: data, now: new Date(pressure.asOf) }), true);
      assert.match(nodes.get('macro-editorial-content').textContent, new RegExp(expected));
    }
  } finally { globalThis.document = old; }
});


test('actual v2 input/review/projection is displayable; snapshot alteration is rejected', () => {
  const { radar, input, output, at } = ofrEditorialFixture();
  const review = reviewEditorial({ input, output, generatedAt: at });
  const layer = projectEditorial({ input, output, review, generatedAt: at, sourceCommit: 'c'.repeat(40), runId: '123' });
  const data = { ...radar, macroRiskEditorialLayer: layer };
  assert.equal(visible(data), true);
  const old = globalThis.document, { nodes, document } = dom(); globalThis.document = document;
  try {
    assert.equal(renderMacroRiskEditorial({ radarData: data, now: new Date(at) }), true);
    const text = nodes.get('macro-editorial-content').textContent;
    assert.match(text, /OFR FSI 原值 0.000/); assert.match(text, /编辑信心说明/); assert.match(text, /政策声明更新/);
    assert.doesNotMatch(text, /40\/100|88|99/);
    layer.pressureSnapshot.index.value = 123;
    assert.equal(visible(data), false);
  } finally { globalThis.document = old; }
});


test('v2 short articles disclose Chinese coverage warnings and use one continuous prose column', () => {
  const { radar, input, output, at } = ofrEditorialFixture();
  const review = reviewEditorial({ input, output, generatedAt: at });
  const layer = projectEditorial({ input, output, review, generatedAt: at, sourceCommit: 'c'.repeat(40), runId: '123' });
  assert.ok(layer.qualityReview.warnings.length > 0);
  const old = globalThis.document, { nodes, document } = dom(); globalThis.document = document;
  const descend = node => [node, ...node.children.flatMap(descend)];
  try {
    assert.equal(renderMacroRiskEditorial({ radarData: { ...radar, macroRiskEditorialLayer: layer }, now: new Date(at) }), true);
    const content = nodes.get('macro-editorial-content'), text = content.textContent;
    assert.match(text, /编辑覆盖提示/); assert.match(text, /覆盖不完整/); assert.match(text, /简版/);
    assert.match(text, /官方来源/); assert.match(text, /站内结构化证据/);
    assert.doesNotMatch(text, /partial|official|cross_checked|discovery_only|site_structured/);
    const all = descend(content);
    const split = all.find(node => node.className?.includes('macro-editorial-single-column'));
    assert.equal(split.children.length, 1);
    const synthesis = all.find(node => node.className?.includes('macro-editorial-synthesis-prose'));
    assert.equal(synthesis.children.length, 4);
    assert.equal(synthesis.children[1].tag, 'p'); assert.equal(synthesis.children[2].tag, 'p');
  } finally { globalThis.document = old; }
  const styles = readFileSync(new URL('../../assets/styles.css', import.meta.url), 'utf8');
  const editorial = styles.slice(styles.indexOf('  .macro-editorial {'), styles.indexOf('  /* ADR-0023:'));
  assert.match(editorial, /\.macro-editorial-synthesis-prose\s*\{\s*display: block;/);
  assert.match(editorial, /\.macro-editorial-single-column\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(editorial, /box-shadow|linear-gradient|#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  assert.match(editorial, /\.macro-editorial-live-dot[^}]*border-radius: 0;/);
  assert.match(editorial, /\.macro-editorial-timeline-item::before[^}]*border-radius: 0;/);
});
