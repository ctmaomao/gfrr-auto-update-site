import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ofrEditorialFixture } from '../fixtures/macro-editorial-ofr.mjs';
import { validateEditorialOutput } from '../../scripts/macro-risk/editorial-contract.mjs';
import { applyEditorialProjection, projectEditorial, reviewEditorial, validateEditorialProduction } from '../../scripts/macro-risk/editorial-production.mjs';
import { inspectOfrSemanticField, ofrBaselineMeaning, ofrPercentileMeaning } from '../../scripts/macro-risk/editorial-ofr-semantics.mjs';
import { safeProviderDiagnostics } from '../../scripts/lib/editorial-safe-diagnostics.mjs';
import { buildEditorialSystemPrompt, buildEditorialUserPrompt } from '../../scripts/macro-risk/editorial-provider.mjs';
const refs = ['site:ofr:pressure', 'site:ofr:percentile', 'site:ofr:coverage'];
const snapshot = (value = -1.079, percentile = 74.18850215095816) => ({ index: { value }, percentile: { value: percentile } });
const inspect = (text, p = snapshot(), sourceRefIds = refs, defaultPressure = false) => inspectOfrSemanticField(text, { snapshot: p, sourceRefIds, defaultPressure });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('known generated OFR inference and publisher-scope errors fail without numeric blacklisting', () => {
  for (const text of [
    'OFR压力原值仍处负值区间，周内回升但未改变宽松底色',
    'OFR官方金融压力指数最新可用观察显示，压力原值仍为负值，处于历史相对偏低的压力区间',
    'OFR压力原值仍为负值，表明按该官方口径衡量的金融压力整体处于低位',
    '压力低位与边际回升并存', 'OFR原值仍为负值，指向整体压力偏低',
    'OFR指数未公布贡献分解，无法据此判断周内变化由哪些成分驱动。',
    '且OFR未公布贡献分解，故编辑信心为中等。'
  ]) assert.ok(inspect(text).length, text);
  assert.ok(inspect('宽松底色', snapshot(), refs, true).length);
});

test('baseline direction is bound to negative, zero, positive and missing raw values, not percentile', () => {
  for (const [value, verb] of [[-1.079, '低于'], [0, '等于'], [3.4, '高于']]) {
    for (const percentile of [0, 20, 50, 74.18850215095816, 100, null]) {
      assert.deepEqual(inspect(`OFR原值${verb}OFR校准历史均值。`, snapshot(value, percentile)), []);
      for (const wrong of ['低于', '等于', '高于'].filter(x => x !== verb)) assert.ok(inspect(`OFR原值${wrong}OFR校准历史均值。`, snapshot(value, percentile)).includes('ofr_baseline_direction_mismatch'));
    }
  }
  assert.ok(inspect('OFR原值低于OFR校准历史均值。', snapshot(null)).includes('ofr_baseline_direction_mismatch'));
  assert.ok(inspect('OFR原值低于OFR校准历史均值。', snapshot(), ['site:ofr:percentile']).includes('ofr_comparison_source_required'));
});

test('strict prior-window ranking uses the sample midpoint and never raw sign as a proxy', () => {
  for (const value of [-100, 0, 100, null]) {
    for (const [percentile, word] of [[0, '低于'], [20, '低于'], [50, '位于'], [74.18850215095816, '高于'], [100, '高于']]) {
      assert.deepEqual(inspect(`OFR在严格过去十年样本中的排序${word}中位位置。`, snapshot(value, percentile)), []);
      assert.ok(inspect(`OFR在严格过去十年样本中的排序${percentile < 50 ? '高于' : '低于'}中位位置。`, snapshot(value, percentile)).length);
    }
  }
  assert.deepEqual(inspect('OFR处于严格过去十年样本的较低位置。', snapshot(-1, 20)), []);
  assert.ok(inspect('OFR处于严格过去十年样本的较低位置。', snapshot(-1, 74)).length);
  assert.ok(inspect('OFR在严格过去十年样本中的排序高于中位位置。', snapshot(-1, null)).length);
  assert.ok(inspect('OFR在严格过去十年样本中的排序高于中位位置。', snapshot(), ['site:ofr:pressure']).includes('ofr_comparison_source_required'));
  assert.ok(inspect('OFR在严格过去十年样本中高于危机水平。').includes('ofr_rank_comparison_requires_midpoint'));
});

test('qualifiers cannot be borrowed from another clause and do not justify absolute regimes', () => {
  for (const text of ['OFR低于OFR校准历史均值，但压力处于历史低位。', 'OFR处于宽松的校准历史均值区间。', 'OFR高于严格过去十年样本中位数，压力依然低位。', 'OFR低于校准历史均值及严格过去十年样本中位数。']) assert.ok(inspect(text).length, text);
  assert.deepEqual(inspect('OFR低于OFR校准历史均值，但其在严格过去十年样本中的排序高于中位位置。'), []);
});

test('explicit site limits and official contribution availability remain distinct', () => {
  for (const text of [
    '本站当前OFR快照未包含贡献分解。', '本站当前未包含OFR类别及地区贡献分解。',
    'OFR官方提供类别及地区贡献；本站当前快照未纳入这些贡献数据。',
    '本次输入缺少OFR贡献分解，不能判断当期成分驱动。',
    'OFR贡献分解在本站当前快照缺失。',
    '本站当前快照未包含贡献分解，不表示OFR官方未公布贡献分解。',
    '本站当前快照未包含贡献分解，但官方尚未公布就业数据。'
  ]) assert.deepEqual(inspect(text), [], text);
  for (const text of ['OFR没有提供贡献分解。', '官方未披露OFR贡献分解。', 'OFR贡献分解缺失。', '本站认为OFR未公布贡献分解。', '本站当前快照与OFR官方未公布贡献分解。']) assert.ok(inspect(text).includes('ofr_contribution_gap_requires_site_scope'), text);
});

test('independent individual values, explicit negation and conditional observations are not OFR assertions', () => {
  for (const text of ['NFCI处于低位，政策利率较低。', '美联储讨论宽松政策。', 'OFR原值为负，不能据此推断压力处于历史低位。', 'OFR负值不代表严格过去十年样本中的较低位置。', '若OFR以后低于其校准历史均值，需核对原观察日。']) assert.deepEqual(inspect(text), [], text);
});

test('input supplies distinct baseline, rank and site-coverage evidence without mutating the snapshot', () => {
  const { input, radar } = ofrEditorialFixture();
  assert.match(input.structuredFacts.find(f => f.id === 'fact:ofr:pressure').factZh, /等于 OFR 校准历史均值/);
  assert.match(input.structuredFacts.find(f => f.id === 'fact:ofr:percentile').factZh, /相对位置不可用/);
  const coverage = input.structuredFacts.find(f => f.id === 'fact:ofr:coverage');
  assert.match(coverage.factZh, /本站当前 OFR 快照未包含/);
  assert.match(coverage.factZh, /OFR 官方提供类别及地区贡献/);
  assert.equal(input.sourceRefs.find(r => r.id === 'site:ofr:coverage').sourcePath, 'radarData.mainPressureReadout.contributionsPublished');
  assert.equal(input.pressureSnapshot.contributionsPublished, false);
  assert.equal(radar.mainPressureReadout.contributionsPublished, false);
  assert.match(ofrBaselineMeaning(null), /缺失/);
  assert.match(ofrBaselineMeaning(-1), /低于/);
  assert.match(ofrBaselineMeaning(1), /高于/);
  for (const p of [0, 20, 50, 74, 100, null]) assert.ok(ofrPercentileMeaning(p));
  for (const prompt of [buildEditorialSystemPrompt(input), buildEditorialUserPrompt(input)]) {
    assert.match(prompt, /校准历史均值/);
    assert.match(prompt, /严格过去十年/);
    assert.match(prompt, /本站当前快照/);
  }
});

const mutations = [
  output => { output.headlineZh = '宽松底色'; },
  output => { output.leadZh = 'OFR原值仍为负值，处于历史相对偏低的压力区间。'; },
  output => { output.pressureSynthesis.assessmentZh = 'OFR金融压力整体处于低位。'; },
  output => { output.keyTensions = [{ titleZh: '压力低位与边际回升并存', detailZh: '当前读数与政策背景不能互相替代。', sourceRefIds: ['site:ofr:pressure'] }]; },
  output => { output.dataGaps = ['OFR指数未公布贡献分解。']; },
  output => { output.confidence.reasonZh = 'OFR未公布贡献分解，故编辑信心有限。'; }
];
test('all generated claim locations and final writer reject new semantic errors despite recalculated digest', () => {
  for (const mutate of mutations) {
    const x = ofrEditorialFixture();
    const review = reviewEditorial({ input: x.input, output: x.output, generatedAt: x.at });
    const layer = projectEditorial({ ...x, review, generatedAt: x.at, sourceCommit: 'b'.repeat(40), runId: '123' });
    mutate(layer.output);
    layer.provenance.artifactDigest = layer.validation.artifactDigest = hash(layer.output);
    // Stored/read-time compatibility is deliberately not retroactively changed.
    assert.equal(validateEditorialProduction(layer, x.radar, new Date(x.at)).ok, true);
    const checked = validateEditorialOutput(layer.output, x.input);
    assert.equal(checked.ok, false);
    assert.ok(checked.diagnostics.some(d => d.ruleCode.startsWith('ofr_')));
    assert.throws(() => applyEditorialProjection(x.radar, layer, new Date(x.at), x.input), /revalidation/);
  }
});

test('explicitly qualified site and zero-baseline prose survives complete original-input writer checks', () => {
  const x = ofrEditorialFixture();
  x.output.pressureSynthesis.assessmentZh = 'OFR原值等于OFR校准历史均值；这不代表严格过去十年样本中的较低位置。';
  x.output.dataGaps = ['本站当前快照未包含OFR贡献分解，不能据此判断当期成分驱动。'];
  x.output.sourceRefIds.push('site:ofr:coverage');
  x.output.sourceAttribution.push({ sourceRefId: 'site:ofr:coverage' });
  const review = reviewEditorial({ input: x.input, output: x.output, generatedAt: x.at });
  const layer = projectEditorial({ ...x, review, generatedAt: x.at, sourceCommit: 'b'.repeat(40), runId: '123' });
  const next = applyEditorialProjection(x.radar, layer, new Date(x.at), x.input);
  assert.deepEqual(next.macroRiskEditorialLayer.output, x.output);
  delete next.macroRiskEditorialLayer;
  assert.deepEqual(next, x.radar);
});

test('negation and site subjects cannot launder subsequent registered assertions', () => {
  for (const text of ['OFR不是风险评分但金融压力处于历史低位。', 'OFR并非宽松而是紧张。', 'OFR不代表危机概率且金融压力处于低位。', '本站未纳入OFR贡献分解且官方未公布贡献分解。', '本站未纳入OFR贡献分解官方未公布贡献分解。', 'OFR原值不低于OFR校准历史均值。', 'OFR并非低于OFR校准历史均值。', 'OFR不是高于严格过去十年样本中位位置。', 'OFR官方在本站未公布贡献分解。', 'OFR原值低于OFR校准历史均值因此处于历史相对低位。', 'OFR原值低于OFR校准历史均值表明压力处于低位。', 'OFR并非紧张而处于历史低位。', 'OFR不是风险评分仍处于历史低位。', '本站未纳入贡献分解且OFR官方也未公布。']) assert.ok(inspect(text).length, text);
  const x = ofrEditorialFixture();
  x.output.sourceRefIds.push('site:ofr:coverage');
  x.output.sourceAttribution.push({ sourceRefId: 'site:ofr:coverage' });
  for (const text of ['OFR不是风险评分但金融压力处于历史低位。', 'OFR并非宽松而是紧张。', '本站未纳入OFR贡献分解且官方未公布贡献分解。', 'OFR并非紧张而处于历史低位。', 'OFR不是风险评分仍处于历史低位。', '本站未纳入贡献分解且OFR官方也未公布。']) {
    const originalReview = reviewEditorial({ input: x.input, output: x.output, generatedAt: x.at });
    const originalLayer = projectEditorial({ ...x, review: originalReview, generatedAt: x.at, sourceCommit: 'b'.repeat(40), runId: '123' });
    originalLayer.output = structuredClone(originalLayer.output);
    const originalOutput = structuredClone(x.output);
    x.output.leadZh = text;
    x.output.sourceRefIds = [...refs, x.input.newsContext.stories[0].id];
    x.output.sourceAttribution = x.output.sourceRefIds.map(sourceRefId => ({ sourceRefId }));
    assert.equal(validateEditorialOutput(x.output, x.input).ok, false, text);
    originalLayer.output.leadZh = text;
    originalLayer.provenance.artifactDigest = originalLayer.validation.artifactDigest = hash(originalLayer.output);
    assert.throws(() => applyEditorialProjection(x.radar, originalLayer, new Date(x.at), x.input), /revalidation/, text);
    x.output = originalOutput;
  }
});

// Diagnostics classify the bounded failure without serializing claim text.
test('semantic diagnostics preserve fixed codes and source ids without revealing prose', () => {
  const { input, output } = ofrEditorialFixture();
  output.dataGaps = ['OFR未公布贡献分解。PRIVATE-PROSE'];
  output.sourceRefIds.push('site:ofr:coverage');
  const checked = validateEditorialOutput(output, input);
  const safe = safeProviderDiagnostics({ contract: { errors: checked.errors, claims: checked.diagnostics } }, input);
  assert.ok(safe.contract.errors.includes('ofr_semantic_boundary'));
  assert.ok(safe.contract.claims.some(x => x.ruleCode === 'ofr_semantic_boundary' && x.fieldPath === 'root.dataGaps[0]' && x.sourceRefIds.includes('site:ofr:coverage')));
  assert.equal(JSON.stringify(safe).includes('PRIVATE-PROSE'), false);
  assert.ok(inspect('OFR读数与NFCI低位表现不同。').length, 'mixed subjects remain conservatively ambiguous');
});
