import test from 'node:test';
import assert from 'node:assert/strict';
import { OFR_COLUMNS, parseOfrCsv, buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent, retireLegacyAdvice } from '../../scripts/daily/ofr-publication-contract.mjs';
import { buildEditorialInput } from '../../scripts/macro-risk/editorial-input.mjs';
import { assessOfrEditorialPublication, buildOfrEditorialSnapshot } from '../../scripts/macro-risk/editorial-ofr-snapshot.mjs';

const now = '2026-11-01T12:00:00Z';
function component(value = -1) {
  const rows = parseOfrCsv(OFR_COLUMNS.join(',') + '\n' + [['2026-10-14', -0.2], ['2026-10-21', -0.5], ['2026-10-28', value]].map(([date, n]) => [date, n, 0, 0, 0, 0, 0, 0, 0, 0].join(',')).join('\n'));
  return buildPublishedOfrComponent({ rows, readout: buildOfrReadout(rows, { asOf: now, retrievedAt: '2026-11-01T11:59:00Z', snapshotSha256: 'a'.repeat(64) }), now });
}
function radar(p = component()) {
  return retireLegacyAdvice({ updatedAt: p.asOf, score: 88, modules: { energy: 99 }, displayInputsBaseline: { brent: 999, asOf: now }, macroDrivers: { credit: { igOas: 0.93, nfci: -0.5, sourceObservedAt: { igOas: '2026-10-28', nfci: '2026-10-23' }, sourceStatus: { igOas: 'live', nfci: 'cached' } } }, decisionModel: {}, tradingSystem: {} }, p);
}
const build = (data, generatedAt = data.updatedAt) => buildEditorialInput({ radarData: data, radarHistory: [{ date: '2026-10-01', score: 99 }], discovery: { stories: [], dataGaps: [] }, generatedAt, fixtureOnly: true });

test('OFR input preserves negative/zero and dated weekly endpoints without legacy scores', () => {
  for (const value of [-1, 0]) {
    const data = radar(component(value)); const before = structuredClone(data);
    const input = build(data);
    assert.equal(input.schemaVersion, 'macro-risk-editorial-ofr-input-v2');
    assert.equal(input.pressureSnapshot.index.value, value);
    assert.equal(input.pressureSnapshot.weeklyChange.value, value + 0.5);
    assert.equal(input.pressureSnapshot.weeklyChange.fromDate, '2026-10-21');
    assert.equal(input.pressureSnapshot.percentile.value, null);
    for (const key of ['riskSnapshot', 'moduleSnapshot']) assert.equal(Object.hasOwn(input,key),false);
    assert.equal(JSON.stringify(input).includes('"score"'),false);
    assert.equal(JSON.stringify(input).includes('999'),false);
    assert.equal(input.sourceRefs.find(r => r.id === 'site:ofr:pressure').url,'https://www.financialresearch.gov/financial-stress-index/');
    assert.deepEqual(data,before);
  }
});

test('OFR missing, cached, and stale are explicit and never substitute lastKnown or legacy score', () => {
  const cases = [component(null), buildPublishedOfrComponent({ now }), buildPublishedOfrComponent({ previous: component(), now: '2026-11-02T12:00:00Z' }), buildPublishedOfrComponent({ previous: component(), now: '2026-11-06T12:00:00Z' })];
  for (const p of cases) {
    const input = build(radar(p));
    assert.equal(input.pressureSnapshot.index.value,p.index.value);
    assert.equal(input.pressureSnapshot.status,p.status);
    assert.equal(input.pressureFreshness.currentEligibleAtCheck,false);
    assert.ok(input.dataGaps.length > 0);
  }
});

test('input freshness uses generation clock rather than publication eligibility', () => {
  const input = build(radar(), '2026-11-08T12:00:00Z');
  assert.equal(input.pressureSnapshot.currentEligible,true);
  assert.equal(input.pressureFreshness.currentEligibleAtCheck,false);
  assert.equal(input.pressureFreshness.ageHours,11*24);
});

test('partial migration, changed weekly arithmetic, future clock and revived advice fail closed', () => {
  for (const change of [d => { delete d.advicePolicy; },d => { delete d.mainPressureReadout; }, d => { d.mainPressureReadout.weeklyChange.value=999; }, d => { d.decisionModel.positionGuidance={equityPct:30}; },d => { d.macroRiskEditorialLayer={ schemaVersion:'macro-risk-editorial-production-v1' }; }]) {
    const data=radar(); change(data);
    assert.equal(assessOfrEditorialPublication(data,now).ready,false);
    assert.throws(() => build(data));
  }
  assert.throws(() => build(radar(),'2026-10-01T12:00:00Z'));
});

test('snapshot allowlist rejects unknown payload propagation and sanitizes retrieval errors', () => {
  const data=radar(); data.mainPressureReadout.injected='old allocation'; data.mainPressureReadout.index.score=99;
  const snapshot=buildOfrEditorialSnapshot(data);
  assert.equal(snapshot.injected,undefined); assert.equal(snapshot.index.score,undefined);
  const cached=radar(buildPublishedOfrComponent({ previous: component(),now:'2026-11-02T12:00:00Z',retrievalError:'unsafe raw error'}));
  assert.equal(buildOfrEditorialSnapshot(cached).retrieval.error,'source_retrieval_failed');
});

test('independent facts use actual observation dates and explicit units, never snapshot dates', () => {
  const input=build(radar());
  const ig=input.structuredFacts.find(f=>f.id==='fact:macro:credit:igOas');
  assert.equal(ig.asOfDate,'2026-10-28'); assert.match(ig.factZh,/0.93%/);
  assert.match(ig.factZh,/不是 OFR 分解/);
  assert.equal(input.sourceRefs.find(r=>r.id==='site:macro:credit:igOas').sourcePath,'radarData.macroDrivers.credit.igOas');
  const data=radar(); delete data.macroDrivers.credit.sourceObservedAt;
  assert.equal(build(data).structuredFacts.some(f=>f.id.startsWith('fact:macro:')),false);
});

// Synthetic public-source evidence, not a live discovery or provider call.
test('built OFR evidence pack passes the v2 input contract with credible dated news', async () => {
  const { validateEditorialInput } = await import('../../scripts/macro-risk/editorial-contract.mjs');
  const discovery = { schemaVersion:'macro-risk-editorial-news-discovery-v1', status:'ok', generatedAt:now, windowStart:'2026-10-25', windowEnd:'2026-11-01', topicsQueried:6, liveProviderCount:1,
    stories:[{ id:'news:fixture', topic:'central_bank_inflation', evidenceStatus:'official', title:'政策观察测试材料', url:'https://www.federalreserve.gov/newsevents.htm', domain:'federalreserve.gov', publishedAt:'2026-10-30T12:00:00Z', providers:['tavily'], snippet:'离线夹具，不是实时新闻。' }], dataGaps:[],
    boundaries:{transientArtifactOnly:true,containsRawProviderResponse:false,containsHeaders:false,containsApiKeys:false,containsFullArticleBody:false,affectsGfrrScoring:false} };
  const input=buildEditorialInput({radarData:radar(),discovery,generatedAt:now,fixtureOnly:true});
  const result=validateEditorialInput(input);
  assert.equal(result.ok,true,result.errors.join('\n'));
});

test('invalid or future independent observation dates are omitted rather than relabeled', () => {
  for(const date of ['2026-02-31','2026-11-05',null]) {
    const data=radar();data.macroDrivers.credit.sourceObservedAt.igOas=date;
    assert.equal(build(data).structuredFacts.some(f=>f.id==='fact:macro:credit:igOas'),false);
  }
});
