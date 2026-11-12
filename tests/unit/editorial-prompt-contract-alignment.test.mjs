import test from 'node:test';
import assert from 'node:assert/strict';
import { ofrEditorialFixture } from '../fixtures/macro-editorial-ofr.mjs';
import { fixtureDeepSeekBudget } from '../helpers/deepseek-budget-fixture.mjs';
import { buildEditorialSystemPrompt, buildEditorialUserPrompt, requestEditorial } from '../../scripts/macro-risk/editorial-provider.mjs';
import { validateEditorialOutput } from '../../scripts/macro-risk/editorial-contract.mjs';
import { buildWeeklyEditorialSystemPrompt, buildWeeklyEditorialUserPrompt } from '../../scripts/bubble-watch/weekly-editorial-prompt.mjs';

test('OFR user prompt distinguishes actual credible citations, discovery and ungrounded metadata', () => {
  const { input } = ofrEditorialFixture();
  input.newsContext.stories.push({ id: 'news:discovery-example', evidenceStatus: 'discovery_only' });
  const prompt = buildEditorialUserPrompt(input);
  const credible = prompt.split('\n').find(line => line.startsWith('本期可引用的'));
  const discovery = prompt.split('\n').find(line => line.startsWith('仅供发现的'));
  assert.ok(credible.includes(input.newsContext.stories[0].id));
  assert.ok(!credible.includes('news:discovery-example'));
  assert.ok(discovery.includes('news:discovery-example'));
  for (const marker of ['只在 sourceAttribution 列出不算实际引用', '与正文无关的 ID',
    'structuredFacts.factZh和合格新闻摘要', 'pressureSnapshot、pressureFreshness、historicalContext',
    '采集元数据', '不要照抄', '不含数字、日期、期限、百分位值或编号列表', '也不用中文数字规避']) {
    assert.ok(prompt.includes(marker), marker);
  }
  assert.ok(prompt.includes(JSON.stringify(input)), 'evidence pack must remain unchanged, not rewritten to fit a claim');
});

test('OFR prompt declares optional object shapes accepted by the unchanged validator', () => {
  const { input, output } = ofrEditorialFixture();
  const system = buildEditorialSystemPrompt(input);
  const refs = output.sourceRefIds;
  for (const section of ['keyTensions', 'crossMarketAnalysis', 'historicalComparison']) {
    const line = system.split('\n').find(row => row.startsWith(`${section}: `));
    const json = line.slice(section.length + 2).replace(/，无依据时为null。$/u, '');
    const examples = JSON.parse(json);
    for (const row of Array.isArray(examples) ? examples : [examples]) row.sourceRefIds = [...refs];
    output[section] = examples;
  }
  const result = validateEditorialOutput(output, input);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.match(system, /confidence\.score是唯一编辑信心字段/);
});

test('OFR prompt exposes the existing local bounds without introducing minimum optional quotas', () => {
  const { input } = ofrEditorialFixture();
  const system = buildEditorialSystemPrompt(input);
  for (const marker of ['headlineZh为1–90字', 'leadZh为1–900字', '1–1000字', '1–800字',
    'weeklyTimeline最多5条', 'keyTensions最多4条', 'contextAnalysis最多6条',
    'crossMarketAnalysis最多5条', 'watchNext为1–5条', 'dataGaps为1–12条',
    '空栏目用[]', '无历史比较用null', '不为满足栏目/来源数量凑字']) assert.ok(system.includes(marker), marker);
});

test('mocked request carries revised prompts and still accepts a supported brief with one call', async () => {
  const { input, output, at } = ofrEditorialFixture();
  let calls = 0;
  const result = await requestEditorial({ input, apiKey: 'offline-fixture', budget: fixtureDeepSeekBudget,
    now: () => new Date(at), fetchImpl: async (_url, options) => {
      calls += 1;
      const payload = JSON.parse(options.body);
      assert.equal(payload.messages[0].content, buildEditorialSystemPrompt(input));
      assert.equal(payload.messages[1].content, buildEditorialUserPrompt(input));
      assert.equal(payload.max_tokens, 8000);
      return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }) };
    } });
  assert.equal(calls, 1);
  assert.equal(result.diagnostics.retryCount, 0);
  assert.equal(result.output.leadZh, output.leadZh);
});

test('revised prompt does not repair, accept or retry unsupported text and malformed optional sections', async () => {
  const mutations = [
    output => { output.dataGaps = ['近7天只有1条新闻。']; },
    output => { output.pressureSynthesis.assessmentZh = '未来7天观察压力变化。'; },
    output => { output.pressureSynthesis.assessmentZh = 'OFR原值为七。'; },
    output => { output.sourceRefIds = ['site:ofr:pressure']; output.weeklyTimeline = []; output.watchNext[0].sourceRefIds = ['site:ofr:pressure']; },
    output => { output.keyTensions = [{ titleZh: '张力', assessmentZh: '错误字段', sourceRefIds: output.sourceRefIds }]; },
    output => { output.leadZh = '长'.repeat(901); },
    output => { output.watchNext = Array.from({ length: 6 }, () => structuredClone(output.watchNext[0])); }
  ];
  for (const mutate of mutations) {
    const { input, output, at } = ofrEditorialFixture();
    mutate(output);
    assert.equal(validateEditorialOutput(output, input).ok, false);
    let calls = 0;
    await assert.rejects(requestEditorial({ input, apiKey: 'offline-fixture', budget: fixtureDeepSeekBudget,
      now: () => new Date(at), fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }) };
      } }), error => error.category === 'provider_output_contract_invalid');
    assert.equal(calls, 1);
  }
});

test('Bubble sparse-evidence prompt requires dated support without filling slots and exempts fixed disclosure', () => {
  const input = { newsContext: { stories: [] } };
  const user = buildWeeklyEditorialUserPrompt(input);
  const system = buildWeeklyEditorialSystemPrompt(input);
  assert.match(user, /There is no timeline item quota/);
  assert.match(user, /only when those inputs establish a dated observation or change/);
  assert.match(user, /never create a company event or event date from a static indicator or publication date/);
  assert.match(user, /Copy the required v3 scorecardDisclosureZh verbatim into scorecardSynthesisZh/);
  assert.match(user, /Outside that fixed disclosure/);
  assert.match(system, /for v3, copy input\.scoringSnapshot\.scorecardDisclosureZh EXACTLY/);
});
