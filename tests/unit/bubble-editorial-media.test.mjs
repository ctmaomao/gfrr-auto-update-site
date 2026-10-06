import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNewsDiscovery, assessWeeklyEditorialNewsReadiness } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { validateNewsDiscovery, validateWeeklyEditorialOutput, visibleEditorialText } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { buildWeeklyEditorialSystemPrompt } from '../../scripts/bubble-watch/weekly-editorial-prompt.mjs';
import { requestWeeklyEditorial } from '../../scripts/bubble-watch/weekly-editorial-provider.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial, applyWeeklyEditorialProjection } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
const read = (path) => JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url)));
const sourceStatus = Object.fromEntries(['tavily', 'brave'].map((name) => [name, { status: 'ok', successCount: 6, failureCount: 0 }]));
const snippet = 'Morningstar analysts believe AI infrastructure financing could improve credit access while leaving demand and repayment risks unresolved. This is an institutional opinion rather than independent confirmation.';
const row = (url = 'https://morningstar.com/bonds/ai-credit', extra = {}) => ({ provider: 'brave', topic: 'ai_financing_credit', title: 'AI financing credit assessment', url, snippet, publishedAt: '2026-10-02', ...extra });
const discoveryFor = (rows) => buildNewsDiscovery({ rawStories: rows, sourceStatus, generatedAt: '2026-10-05T12:31:15Z', windowStart: '2026-09-26', windowEnd: '2026-10-05' });
test('California DOJ is official; unrelated and lookalike domains stay untrusted', () => {
  const d = discoveryFor([row('https://oag.ca.gov/news/press-releases/openai')]);
  assert.equal(d.stories[0].evidenceStatus, 'official');
  assert.equal(assessWeeklyEditorialNewsReadiness(d).editorialReady, true);
  for (const url of ['https://oag.ca.gov.example.com/news', 'https://unreviewed.gov/news', 'https://morningstar.com.example.com/bonds/story']) {
    assert.equal(discoveryFor([row(url)]).stories[0].evidenceStatus, 'discovery_only');
  }
});
test('single reviewed media excerpt is usable without relabeling it as corroborated', () => {
  const d = discoveryFor([row()]);
  assert.equal(d.stories[0].evidenceStatus, 'attributed_media');
  assert.equal(d.stories[0].sourceName, 'Morningstar');
  assert.equal(d.status, 'partial');
  assert.equal(validateNewsDiscovery(d).ok, true);
  assert.equal(assessWeeklyEditorialNewsReadiness(d).editorialReady, true);
  const unhealthy = structuredClone(d); unhealthy.sourceStatus.brave.failureCount = 1;
  assert.equal(assessWeeklyEditorialNewsReadiness(unhealthy).editorialReady, false);
  assert.equal(assessWeeklyEditorialNewsReadiness(unhealthy).expectedSkip, false);
  const missing = structuredClone(d); delete missing.stories[0].snippet;
  assert.equal(validateNewsDiscovery(missing).ok, false);
});
test('paywall text, community pages, missing dates and tiny snippets cannot admit media', () => {
  for (const r of [row('https://ft.com/content/example', { snippet: 'Subscribe to unlock this article. Save 40% on Standard Digital. '.repeat(4) }), row('https://morningstar.com/community/thread'), row(undefined, { publishedAt: null }), row(undefined, { publishedAt: '2025-10-02' }), row(undefined, { publishedAt: '2027-10-02' }), row(undefined, { snippet: 'A headline' })]) {
    const d = discoveryFor([r]);
    assert.equal(d.stories[0].evidenceStatus, 'discovery_only');
    assert.equal(assessWeeklyEditorialNewsReadiness(d).expectedSkip, true);
  }
});
function scenario() {
  const bubble = read('data/bubble-watch.json');
  const discovery = discoveryFor([row()]);
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery });
  const output = read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');
  const story = input.newsContext.stories[0];
  const replace = (v) => typeof v === 'string' && v.startsWith('news:') ? story.id : Array.isArray(v) ? v.map(replace) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x]) => [k, replace(x)])) : v;
  const adapted = replace(output);
  adapted.asOfDate = input.asOfDate;
  adapted.confidence = { level: 'medium', score: 60, reasonZh: '新闻证据有限，综合站内指标并保留覆盖限制。' };
  adapted.dataGaps = ['仅有一条专业媒体摘要，新闻覆盖有限，机构观点尚未独立确认。'];
  const claims = [...adapted.weeklyTimeline, ...adapted.keyTensions, ...adapted.categoryAnalysis, adapted.historicalComparison];
  for (const claim of claims) if (claim.sourceRefIds.includes(story.id)) {
    claim.titleZh = '融资条件与风险';
    claim.detailZh = '据Morningstar分析，人工智能基础设施融资可能改善信用获取，但需求与偿还风险仍存在。这属于机构观点，尚未独立核实。';
  }
  adapted.sourceAttribution = adapted.sourceAttribution.filter((a,i,all) => all.findIndex((b) => b.sourceRefId === a.sourceRefId) === i);
  return { input, output: adapted, bubble, story };
}
test('attributed media output passes review and production metadata roundtrip without excerpts', () => {
  const { input, output, bubble } = scenario();
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  const review = reviewWeeklyEditorial({ input, output });
  assert.equal(review.status, 'warn');
  const layer = projectWeeklyEditorial({ input, output, review });
  assert.ok(layer.sourceLedger.every((s) => !Object.hasOwn(s, 'snippet')));
  const next = applyWeeklyEditorialProjection(bubble, layer);
  delete next.summary.weekly_editorial;
  const before = structuredClone(bubble); delete before.summary.weekly_editorial;
  assert.deepEqual(next, before);
});
test('media attribution, invented numbers, quotes, unknown refs and title-only detail fail', () => {
  const { input, output, story } = scenario();
  for (const text of ['融资已获得全面确认。', '据Morningstar分析，融资达到999999亿美元。', '据Morningstar分析，“融资风险已经消失”。']) {
    const bad = structuredClone(output); bad.weeklyTimeline[0].sourceRefIds = [story.id]; bad.weeklyTimeline[0].detailZh = text;
    assert.equal(validateWeeklyEditorialOutput(bad, input).ok, false);
  }
  const bad = structuredClone(output); bad.weeklyTimeline[0].sourceRefIds = ['news:unknown'];
  assert.equal(validateWeeklyEditorialOutput(bad, input).ok, false);
  const titleOnly = structuredClone(input); titleOnly.newsContext.stories[0].contentScope = 'title_only';
  assert.equal(validateWeeklyEditorialOutput(output, titleOnly).ok, false);
});
test('limited edition omits unsupported sections, retains disclosures and confidence cap', () => {
  const { input, output, bubble } = scenario();
  output.weeklyTimeline = [];
  output.leadZh = '本期融资条件与需求存在张力，新闻证据有限，结合站内指标观察信用与估值的变化，保留不确定性。';
  output.scorecardSynthesisZh = '本期分数沿用固定规则，信用和需求证据共同支撑观察，不由人工智能重新计算或修改。';
  output.keyTensions = output.keyTensions.slice(0,1);
  output.categoryAnalysis = output.categoryAnalysis.slice(0,2);
  assert.ok(visibleEditorialText(output).length < 1200, `limited fixture should exercise the shorter band, got ${visibleEditorialText(output).length}`);
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  assert.equal(reviewWeeklyEditorial({ input, output }).frontendDisplayEligible, true);
  const layer = projectWeeklyEditorial({ input, output, review: reviewWeeklyEditorial({ input, output }) });
  assert.equal(layer.provenance.editorialFormat, 'limited');
  assert.doesNotThrow(() => applyWeeklyEditorialProjection(bubble, layer));
  const high = structuredClone(output); high.confidence.score = 95;
  assert.equal(validateWeeklyEditorialOutput(high, input).ok, false);
  const hidden = structuredClone(output); hidden.dataGaps = ['其他限制'];
  assert.equal(validateWeeklyEditorialOutput(hidden, input).ok, false);
});

test('limited system prompt reaches the provider without the conflicting long-form minimum', async () => {
  const { input, output } = scenario();
  assert.ok(buildWeeklyEditorialSystemPrompt(input).includes('Target 600-1,800'));
  let calls = 0;
  await requestWeeklyEditorial({ input, apiKey: 'fixture-key', fetchImpl: async (_url, request) => {
    calls += 1;
    const body = JSON.parse(request.body);
    assert.ok(body.messages[0].content.includes('Target 600-1,800'));
    assert.ok(!body.messages[0].content.includes('Target 2,600-3,400'));
    return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }) };
  } });
  assert.equal(calls, 1);
});
