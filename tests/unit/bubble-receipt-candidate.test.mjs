import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNewsDiscovery, LIMITED_SEARCH_DISCLOSURE } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
import { buildWeeklyEditorialWriteResult } from '../../scripts/write-bubble-watch-weekly-editorial.mjs';
import { buildBubbleReceiptCandidate, serializeBubbleReceiptCandidate } from '../../scripts/prepare-bubble-receipt-candidate.mjs';
import { RECEIPT_GRANT } from '../../scripts/lib/deepseek-receipt-grant.mjs';
const read = file => JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url)));
const healthy = { status: 'ok', successCount: 6, failureCount: 0 };
const failed = { status: 'error', successCount: 0, failureCount: 6 };
const snippet = 'Morningstar analysts believe AI infrastructure financing could improve credit access while leaving demand and repayment risks unresolved. This is an institutional opinion rather than independent confirmation.';
function pack() {
  const bubble = read('data/bubble-watch.json');
  const date = bubble.as_of_date;
  const discovery = buildNewsDiscovery({ rawStories: [{ provider: 'brave', topic: 'ai_financing_credit',
    title: 'AI financing credit assessment', url: 'https://morningstar.com/bonds/ai-credit', snippet, publishedAt: date }],
    sourceStatus: { tavily: failed, brave: healthy }, generatedAt: `${date}T00:00:00.000Z`, windowStart: date, windowEnd: date });
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery, generatedAt: `${date}T00:01:00.000Z` });
  const sample = read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');
  const story = input.newsContext.stories[0];
  const replace = value => typeof value === 'string' && value.startsWith('news:') ? story.id : Array.isArray(value) ? value.map(replace)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)])) : value;
  const output = replace(sample);
  output.asOfDate = date;
  output.generatedAt = `${date}T00:02:00.000Z`;
  if (input.scoringSnapshot.contractVersion === 'bubble-watch-v3') output.scorecardSynthesisZh = input.scoringSnapshot.scorecardDisclosureZh;
  output.confidence = { level: 'medium', score: 60, reasonZh: '新闻证据有限，综合站内指标并保留覆盖限制。' };
  output.dataGaps = ['仅有一条专业媒体摘要，机构观点尚未独立核实。', LIMITED_SEARCH_DISCLOSURE];
  for (const claim of [...output.weeklyTimeline, ...output.keyTensions, ...output.categoryAnalysis, output.historicalComparison]) {
    if (claim.sourceRefIds.includes(story.id)) {
      claim.titleZh = '融资条件与风险';
      claim.detailZh = '据Morningstar分析，人工智能基础设施融资可能改善信用获取，但需求与偿还风险仍存在。这属于机构观点，尚未独立核实。';
    }
  }
  for (const event of output.weeklyTimeline) {
    event.date = story.publishedAt.slice(0, 10);
    event.titleZh = `报道：${event.titleZh}`;
    event.detailZh = `${event.date} 据媒体报道，${event.detailZh}`;
  }
  output.sourceAttribution = output.sourceAttribution.filter((row, i, all) => all.findIndex(other => other.sourceRefId === row.sourceRefId) === i);
  const review = reviewWeeklyEditorial({ input, output, generatedAt: `${date}T00:03:00.000Z` });
  const layer = projectWeeklyEditorial({ input, output, review, generatedAt: `${date}T00:04:00.000Z`, sourceCommit: 'a'.repeat(40), runId: '123' });
  const projection = { schemaVersion: 'bubble-watch-weekly-editorial-production-projection-v1', target: 'data/bubble-watch.json.summary.weekly_editorial', generatedAt: layer.generatedAt, weeklyEditorial: layer, writeEvidence: { input, review } };
  return { bubble, discovery, input, output, review, layer, projection, now: `${date}T00:05:00.000Z` };
}


const env = { DEEPSEEK_BUDGET_SELECTION: RECEIPT_GRANT.id, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
  EDITORIAL_PROVIDER_OUTCOME: 'success', EDITORIAL_REVIEW_OUTCOME: 'success', GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site', GITHUB_WORKFLOW: 'Bubble Watch Weekly Editorial Refresh',
  GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '123', DEEPSEEK_API_KEY: 'test-secret-never-retained-12345' };
const build = (p, override = {}) => buildBubbleReceiptCandidate({ bubbleWatch: p.bubble, projection: p.projection, now: p.now, env, ...override });
test('successful selected candidate preserves exact validated replay evidence without provider envelope', () => {
  const p = pack(), candidate = build(p);
  assert.equal(candidate.publicationReady, false);
  assert.equal(candidate.replayEvidenceRetained, true);
  assert.deepEqual(candidate.projection.writeEvidence.input, p.input);
  assert.deepEqual(candidate.projection.writeEvidence.review, p.review);
  assert.deepEqual(buildWeeklyEditorialWriteResult(p.bubble, candidate.projection, { now: p.now }), buildWeeklyEditorialWriteResult(p.bubble, p.projection, { now: p.now }));
  assert.equal(JSON.stringify(candidate).includes(env.DEEPSEEK_API_KEY), false);
  assert.equal(Object.hasOwn(candidate, 'headers'), false);
});
test('default, failed, cancelled, mismatched and stale candidates never package', () => {
  for (const change of [{ DEEPSEEK_BUDGET_SELECTION: 'monthly' }, { EDITORIAL_PROVIDER_OUTCOME: 'failure' },
    { EDITORIAL_REVIEW_OUTCOME: 'cancelled' }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ID: '456' }, { DEEPSEEK_API_KEY: '' }]) {
    assert.throws(() => build(pack(), { env: { ...env, ...change } }));
  }
  const p = pack(); p.bubble.as_of_date = '2020-01-01'; assert.throws(() => build(p));
});
test('unknown input, candidate and nested news fields are never retained', () => {
  for (const mutate of [p => { p.input.privateField = 'PRIVATE'; }, p => { p.output.providerEnvelope = 'PRIVATE'; },
    p => { p.input.newsContext.stories[0].headers = 'PRIVATE'; }, p => { p.layer.sourceLedger[0].secret = 'PRIVATE'; }]) {
    const p = pack(); mutate(p); assert.throws(() => build(p));
  }
});
test('actual credential anywhere in retained source data holds without changing the source', () => {
  const p = pack();
  const value = p.output.headlineZh;
  assert.throws(() => build(p, { env: { ...env, DEEPSEEK_API_KEY: value } }));
  assert.equal(p.output.headlineZh, value);
});
test('candidate grant never writes or pushes; exact successful artifact is short-retention', () => {
  const text = fs.readFileSync('.github/workflows/bubble-watch-weekly-editorial-refresh.yml', 'utf8');
  const steps = text.split('\n      - name:');
  for (const name of ['Write weekly editorial field', 'Protected path assertion', 'Commit refreshed weekly editorial']) {
    assert.ok(steps.find(s => s.startsWith(` ${name}\n`)).includes(`inputs.budget_selection != '${RECEIPT_GRANT.id}'`));
  }
  const candidate = steps.find(s => s.startsWith(' Upload receipt-grant review candidate\n'));
  assert.ok(candidate.includes(`inputs.budget_selection == '${RECEIPT_GRANT.id}' && steps.receipt_candidate.outcome == 'success'`));
  assert.ok(candidate.includes('path: manual-artifacts/bubble-watch-weekly-editorial/receipt-review-candidate.json\n'));
  assert.ok(candidate.includes('retention-days: 3'));
});

test('retention cap measures exact pretty-printed file bytes including trailing newline', () => {
  const overhead = Buffer.byteLength(serializeBubbleReceiptCandidate({ text: '' }));
  const value = { text: 'x'.repeat(128 * 1024 - overhead) };
  assert.equal(Buffer.byteLength(serializeBubbleReceiptCandidate(value)), 128 * 1024);
  assert.throws(() => serializeBubbleReceiptCandidate({ text: value.text + 'x' }), /bubble_receipt_candidate_hold/);
});
