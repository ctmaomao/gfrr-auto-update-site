import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertValid,
  validateNewsDiscovery,
  validateWeeklyEditorialInput
} from './bubble-watch/weekly-editorial-contract.mjs';
import { buildWeeklyEditorialInput } from './bubble-watch/weekly-editorial-input.mjs';
import {
  assessWeeklyEditorialNewsReadiness,
  buildNewsDiscovery,
  canonicalizeNewsUrl,
  rawStoriesFromFixture
} from './bubble-watch/weekly-editorial-news.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function allKeys(value, output = []) {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, output));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      output.push(key);
      allKeys(item, output);
    }
  }
  return output;
}

const providerFixture = readJson('docs/fixtures/bubble-watch-weekly-editorial/sample-news-provider-responses-v1.json');
const sourceStatus = {
  tavily: { status: 'ok', successCount: 6, failureCount: 0, queryRuns: [] },
  brave: { status: 'ok', successCount: 6, failureCount: 0, queryRuns: [] }
};
const discovery = buildNewsDiscovery({
  rawStories: rawStoriesFromFixture(providerFixture),
  sourceStatus,
  generatedAt: '2026-08-11T00:00:00.000Z',
  windowStart: '2026-08-02',
  windowEnd: '2026-08-11'
});
assertValid(validateNewsDiscovery(discovery), 'weekly editorial news discovery');
assert(discovery.status === 'ok', 'two live providers with usable stories must produce status=ok');
assert(discovery.stories.length === 6, `fixture must deduplicate to 6 stories, got ${discovery.stories.length}`);
assert(discovery.stories.some((story) => story.evidenceStatus === 'official'), 'fixture must exercise official evidence');
assert(discovery.stories.some((story) => story.evidenceStatus === 'cross_checked'), 'fixture must exercise cross_checked evidence');
assert(discovery.stories.some((story) => story.evidenceStatus === 'discovery_only'), 'fixture must exercise discovery_only evidence');
assert(!canonicalizeNewsUrl('https://example.com/story?utm_source=test&fbclid=abc').includes('utm_'), 'canonical URL must strip tracking parameters');
assert(!canonicalizeNewsUrl('https://example.com/story?utm_source=test&fbclid=abc').includes('fbclid'), 'canonical URL must strip fbclid');
const forbiddenNewsKeys = new Set(['raw', 'rawResponse', 'rawContent', 'headers', 'apiKey', 'authorization', 'fullArticleBody']);
assert(!allKeys(discovery).some((key) => forbiddenNewsKeys.has(key)), 'discovery artifact contains a forbidden raw/secret field');

const oneCredibleDiscovery = buildNewsDiscovery({
  rawStories: [
    { provider: 'tavily', topic: 'ai_financing_credit', title: 'AI infrastructure financing receives independent confirmation', url: 'https://news-one.example/ai-financing', publishedAt: '2026-08-10', snippet: 'bounded context' },
    { provider: 'brave', topic: 'ai_financing_credit', title: 'AI infrastructure financing receives independent confirmation', url: 'https://news-two.example/ai-financing', publishedAt: '2026-08-10', snippet: 'bounded context' },
    { provider: 'tavily', topic: 'macro_policy', title: 'Technology shares await the next inflation release', url: 'https://news-three.example/macro', publishedAt: '2026-08-10', snippet: 'bounded context' }
  ],
  sourceStatus,
  generatedAt: '2026-08-11T00:00:30.000Z',
  windowStart: '2026-08-02',
  windowEnd: '2026-08-11'
});
assertValid(validateNewsDiscovery(oneCredibleDiscovery), 'one-credible-story partial discovery');
assert(oneCredibleDiscovery.status === 'partial', 'one credible story must produce transparent status=partial');
assert(oneCredibleDiscovery.dataGaps.some((gap) => gap.includes('仅形成 1 条')), 'one credible story must disclose its coverage limitation');
const oneCredibleReadiness = assessWeeklyEditorialNewsReadiness(oneCredibleDiscovery);
assert(oneCredibleReadiness.editorialReady && !oneCredibleReadiness.expectedSkip, 'one credible story with two healthy providers must remain provider-ready');

const noCredibleDiscovery = buildNewsDiscovery({
  rawStories: [
    { provider: 'tavily', topic: 'macro_policy', title: 'Technology shares await the next inflation release', url: 'https://single-source.example/macro', publishedAt: '2026-08-10', snippet: 'bounded context' },
    { provider: 'brave', topic: 'ai_financing_credit', title: 'AI infrastructure financing remains under review', url: 'https://another-single-source.example/financing', publishedAt: '2026-08-10', snippet: 'bounded context' }
  ],
  sourceStatus,
  generatedAt: '2026-08-11T00:00:45.000Z',
  windowStart: '2026-08-02',
  windowEnd: '2026-08-11'
});
assertValid(validateNewsDiscovery(noCredibleDiscovery), 'healthy no-credible-news discovery');
const noCredibleReadiness = assessWeeklyEditorialNewsReadiness(noCredibleDiscovery);
assert(noCredibleDiscovery.status === 'insufficient' && noCredibleReadiness.expectedSkip && !noCredibleReadiness.editorialReady && noCredibleReadiness.reason === 'no_credible_news', 'two fully healthy indexes with zero credible stories must become an expected zero-call skip');
const unhealthyNoCredible = structuredClone(noCredibleDiscovery);
unhealthyNoCredible.sourceStatus.brave = { status: 'error', successCount: 0, failureCount: 6, queryRuns: [] };
unhealthyNoCredible.liveProviderCount = 1;
const unhealthyReadiness = assessWeeklyEditorialNewsReadiness(unhealthyNoCredible);
assert(!unhealthyReadiness.expectedSkip && !unhealthyReadiness.editorialReady && unhealthyReadiness.reason === 'search_provider_unhealthy', 'source-health failure must remain a hard failure, not an expected skip');

const bubbleWatch = readJson('data/bubble-watch.json');
const radarData = readJson('data/radar-data.json');
const oilNewsWatch = readJson('data/oil-news-event-watch.json');
const bubbleWithSentinel = structuredClone(bubbleWatch);
bubbleWithSentinel.summary.weekly_editorial = { sentinel: 'must_not_enter_compact_input' };
const input = buildWeeklyEditorialInput({
  bubbleWatch: bubbleWithSentinel,
  radarData,
  oilNewsWatch,
  discovery,
  generatedAt: '2026-08-11T00:01:00.000Z'
});
assertValid(validateWeeklyEditorialInput(input), 'live-site compact input fixture replay');
assert(input.structuredFacts.length === 27, 'compact input must include all 27 display facts with score roles');
assert(input.scoringSnapshot.coreIndicatorCount === 23, 'compact input must preserve Core-23 count');
assert(input.scoringSnapshot.shadowIndicatorCount === 4, 'compact input must preserve Shadow-4 count');
assert(!JSON.stringify(input).includes('must_not_enter_compact_input'), 'compact input must exclude existing weekly editorial output');
assert(Buffer.byteLength(JSON.stringify(input)) < 60 * 1024, 'compact input must stay below 60 KiB');
const forbiddenInputKeys = new Set(['positionGuidance', 'executionLock', 'actionQueue', 'triggerMonitor', 'invalidationRules', 'rawResponse', 'headers', 'apiKey']);
assert(!allKeys(input).some((key) => forbiddenInputKeys.has(key)), 'compact input contains forbidden decision/execution/secret fields');

const stressDiscovery = structuredClone(discovery);
stressDiscovery.stories = discovery.stories.flatMap((story) => Array.from({ length: 5 }, (_, index) => ({
  ...story,
  id: `${story.id}:stress-${index}`,
  title: `${story.title.slice(0, 205)} ${index + 1}`,
  url: `${story.url}${story.url.includes('?') ? '&' : '?'}stress=${index + 1}`,
  snippet: 'bounded live discovery context '.repeat(12).slice(0, 360)
})));
stressDiscovery.topics = stressDiscovery.topics.map((topic) => ({ ...topic, storyCount: 5 }));
assertValid(validateNewsDiscovery(stressDiscovery), '30-story weekly news discovery stress fixture');
const stressInput = buildWeeklyEditorialInput({
  bubbleWatch,
  radarData,
  oilNewsWatch,
  discovery: stressDiscovery,
  generatedAt: '2026-08-11T00:02:00.000Z'
});
assertValid(validateWeeklyEditorialInput(stressInput), '30-story compact input stress replay');
assert(stressInput.newsContext.stories.length === 12, `compact provider input must cap news at 12, got ${stressInput.newsContext.stories.length}`);
for (const topic of stressInput.newsContext.topics) {
  assert(topic.storyCount <= 2, `compact provider input topic ${topic.id} exceeds 2 stories`);
}
assert(stressInput.newsContext.stories.filter((story) => ['official', 'cross_checked'].includes(story.evidenceStatus)).length >= 2, 'compaction must preserve credible news evidence');
assert(Buffer.byteLength(JSON.stringify(stressInput)) < 60 * 1024, '30-story live discovery must compact below 60 KiB');

const invalidTopic = structuredClone(discovery);
invalidTopic.stories[0].topic = 'unregistered_topic';
const invalidTopicResult = validateNewsDiscovery(invalidTopic);
assert(!invalidTopicResult.ok && invalidTopicResult.errors.some((error) => error.includes('not registered')), 'unregistered topic negative test must fail');

const unsafeBoundary = structuredClone(discovery);
unsafeBoundary.boundaries.affectsBubbleWatchScoring = true;
const unsafeBoundaryResult = validateNewsDiscovery(unsafeBoundary);
assert(!unsafeBoundaryResult.ok && unsafeBoundaryResult.errors.some((error) => error.includes('affectsBubbleWatchScoring must be false')), 'news scoring boundary negative test must fail');

console.log(`Bubble Watch weekly editorial news/input PASS (stories=${discovery.stories.length}, stressInputStories=${stressInput.newsContext.stories.length}, facts=${input.structuredFacts.length}, sources=${input.sourceRefs.length}, bytes=${Buffer.byteLength(JSON.stringify(input))}, readiness tests=3, negative tests=2)`);
