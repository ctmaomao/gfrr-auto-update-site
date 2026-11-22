import fs from 'node:fs';
import { buildNewsDiscovery, LIMITED_SEARCH_DISCLOSURE } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';

const read = file => JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url)));
const snippet = 'Morningstar analysts believe AI infrastructure financing could improve credit access while leaving demand and repayment risks unresolved. This is an institutional opinion rather than independent confirmation.';

export function buildLimitedBubbleEditorialPack() {
  const healthy = { status: 'ok', successCount: 6, failureCount: 0 };
  const failed = { status: 'error', successCount: 0, failureCount: 6 };
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
