import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertValid, validateWeeklyEditorialOutput, validateWeeklyEditorialReview } from './bubble-watch/weekly-editorial-contract.mjs';
import { buildWeeklyEditorialInput } from './bubble-watch/weekly-editorial-input.mjs';
import { buildNewsDiscovery, rawStoriesFromFixture } from './bubble-watch/weekly-editorial-news.mjs';
import {
  WEEKLY_EDITORIAL_PROVIDER_CONFIG,
  classifyProviderFailure,
  parseWeeklyEditorialProviderContent,
  requestWeeklyEditorial
} from './bubble-watch/weekly-editorial-provider.mjs';
import {
  applyWeeklyEditorialProjection,
  projectWeeklyEditorial,
  reviewWeeklyEditorial,
  validateWeeklyEditorialProduction
} from './bubble-watch/weekly-editorial-production.mjs';
import { validateWeeklyEditorialPrompt } from './bubble-watch/weekly-editorial-prompt.mjs';
import {
  assertWeeklyEditorialSafeTarget,
  buildWeeklyEditorialWriteResult
} from './write-bubble-watch-weekly-editorial.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceExactStrings(value, replacements) {
  if (typeof value === 'string') return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map((item) => replaceExactStrings(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceExactStrings(item, replacements)]));
  }
  return value;
}

function withoutWeeklyEditorial(bubbleWatch) {
  const copy = structuredClone(bubbleWatch);
  delete copy.summary.weekly_editorial;
  return copy;
}

const providerFixture = readJson('docs/fixtures/bubble-watch-weekly-editorial/sample-news-provider-responses-v1.json');
const discovery = buildNewsDiscovery({
  rawStories: rawStoriesFromFixture(providerFixture),
  sourceStatus: {
    tavily: { status: 'ok', successCount: 6, failureCount: 0, queryRuns: [] },
    brave: { status: 'ok', successCount: 6, failureCount: 0, queryRuns: [] }
  },
  generatedAt: '2026-08-11T00:00:00.000Z',
  windowStart: '2026-08-02',
  windowEnd: '2026-08-11'
});
const bubbleWatch = readJson('data/bubble-watch.json');
const input = buildWeeklyEditorialInput({
  bubbleWatch,
  radarData: readJson('data/radar-data.json'),
  oilNewsWatch: readJson('data/oil-news-event-watch.json'),
  discovery,
  generatedAt: '2026-08-11T00:01:00.000Z'
});
const sampleOutput = readJson('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');
const credibleStories = discovery.stories.filter((story) => ['official', 'cross_checked'].includes(story.evidenceStatus)).slice(0, 3);
assert(credibleStories.length === 3, 'provider-path fixture requires three credible news stories');
const replacements = new Map([
  ['news:macro-sample', credibleStories[0].id],
  ['news:earnings-sample', credibleStories[1].id],
  ['news:financing-sample', credibleStories[2].id]
]);
let providerOutput = replaceExactStrings(sampleOutput, replacements);
providerOutput.asOfDate = input.asOfDate;
providerOutput.sourceAttribution = providerOutput.sourceAttribution.map((item) => {
  const story = discovery.stories.find((candidate) => candidate.id === item.sourceRefId);
  if (!story) return item;
  return {
    ...item,
    claimType: story.evidenceStatus === 'official' ? 'official_news_context' : 'cross_checked_news_context'
  };
});
assertValid(validateWeeklyEditorialOutput(providerOutput, input), 'provider-path adapted output');
assert(validateWeeklyEditorialPrompt(input).ok, 'weekly editorial prompt contract must pass');
assert(JSON.stringify(parseWeeklyEditorialProviderContent(JSON.stringify(providerOutput))) === JSON.stringify(providerOutput), 'direct provider JSON parser replay failed');
assert(JSON.stringify(parseWeeklyEditorialProviderContent(`\`\`\`json\n${JSON.stringify(providerOutput)}\n\`\`\``)) === JSON.stringify(providerOutput), 'single fenced provider JSON parser replay failed');

let apiCallCount = 0;
let capturedRequest = null;
const fakeFetch = async (url, request) => {
  apiCallCount += 1;
  capturedRequest = { url, request };
  return {
    ok: true,
    status: 200,
    async json() {
      return { id: 'fixture-response', model: 'deepseek-v4-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(providerOutput) } }], usage: { prompt_tokens: 100, completion_tokens: 200 } };
    }
  };
};
const providerResult = await requestWeeklyEditorial({
  input,
  apiKey: 'fixture-secret-never-serialized',
  fetchImpl: fakeFetch,
  now: () => new Date('2026-08-11T00:05:00.000Z')
});
assert(apiCallCount === 1, `DeepSeek path must call provider exactly once, got ${apiCallCount}`);
const requestBody = JSON.parse(capturedRequest.request.body);
assert(capturedRequest.url === 'https://api.deepseek.com/chat/completions', 'DeepSeek endpoint drifted');
assert(requestBody.model === 'deepseek-v4-flash', 'DeepSeek model drifted');
assert(requestBody.max_tokens === 8000, 'DeepSeek max_tokens must remain 8000');
assert(requestBody.response_format?.type === 'json_object', 'DeepSeek response_format must remain json_object');
assert(requestBody.thinking?.type === 'disabled', 'DeepSeek thinking must remain disabled for bounded editorial call');
assert(requestBody.messages[0].content.includes('Target 2,600-3,400 visible Chinese characters'), 'DeepSeek prompt must retain the calibrated visible-length target');
assert(requestBody.messages[0].content.includes('Hard output caps:') && requestBody.messages[0].content.includes('exactly 6 categoryAnalysis'), 'DeepSeek prompt must retain explicit completion caps');
assert(!requestBody.messages[1].content.includes('\n  "schemaVersion"'), 'DeepSeek user prompt must serialize compact JSON without pretty-print expansion');
assert(!JSON.stringify(providerResult).includes('fixture-secret-never-serialized'), 'provider result must not serialize API key');
assert(providerResult.diagnostics.apiCallCount === 1 && providerResult.diagnostics.retryCount === 0, 'provider diagnostics must prove one call/no retry');
assert(providerResult.diagnostics.response.finishReason === 'stop' && providerResult.diagnostics.response.contentLength > 0, 'provider diagnostics must retain sanitized finish/content evidence');

const review = reviewWeeklyEditorial({ input, output: providerResult.output, generatedAt: '2026-08-11T00:06:00.000Z' });
assertValid(validateWeeklyEditorialReview(review), 'provider-path quality review');
assert(review.status === 'pass', `fixture quality review must pass, got ${review.status}: ${review.warnings.join('; ')}`);
const layer = projectWeeklyEditorial({
  input,
  output: providerResult.output,
  review,
  generatedAt: '2026-08-11T00:07:00.000Z',
  sourceCommit: '0123456789012345678901234567890123456789',
  runId: '123456789'
});
assertValid(validateWeeklyEditorialProduction(layer, bubbleWatch), 'provider-path production layer');
assert(layer.sourceLedger.every((source) => !Object.hasOwn(source, 'snippet')), 'production source ledger must remove snippets');
assert(layer.qualityReview.promotionEligible === false && layer.provenance.humanApproved === false, 'production promotion/human approval boundaries drifted');

const projection = {
  schemaVersion: 'bubble-watch-weekly-editorial-production-projection-v1',
  target: 'data/bubble-watch.json.summary.weekly_editorial',
  weeklyEditorial: layer
};
const nextBubble = buildWeeklyEditorialWriteResult(bubbleWatch, projection);
assert(JSON.stringify(withoutWeeklyEditorial(nextBubble)) === JSON.stringify(withoutWeeklyEditorial(bubbleWatch)), 'writer changed data outside summary.weekly_editorial');
assert(nextBubble.summary.primary_score_pct === bubbleWatch.summary.primary_score_pct, 'writer changed primary score');
assert(nextBubble.summary.stage_score === bubbleWatch.summary.stage_score && nextBubble.summary.trigger_score === bubbleWatch.summary.trigger_score, 'writer changed Stage/Trigger');
assert(JSON.stringify(applyWeeklyEditorialProjection(bubbleWatch, layer)) === JSON.stringify(nextBubble), 'pure writer paths disagree');

const asOfMismatch = structuredClone(bubbleWatch);
asOfMismatch.as_of_date = '2026-08-09';
const mismatchResult = validateWeeklyEditorialProduction(layer, asOfMismatch);
assert(!mismatchResult.ok && mismatchResult.errors.some((error) => error.includes('asOfDate')), 'as-of mismatch negative test must fail');

let rejectedFixture = false;
try {
  projectWeeklyEditorial({ input: { ...input, fixtureOnly: true }, output: providerResult.output, review });
} catch (error) {
  rejectedFixture = error.message.includes('fixture input');
}
assert(rejectedFixture, 'fixture production projection negative test must fail');

let rejectedTarget = false;
try {
  assertWeeklyEditorialSafeTarget('data/radar-data.json');
} catch (error) {
  rejectedTarget = error.message.includes('unsafe target');
}
assert(rejectedTarget, 'unsafe writer target negative test must fail');

let invalidJsonCalls = 0;
let invalidJsonFailure = null;
let invalidJsonError = null;
try {
  await requestWeeklyEditorial({
    input,
    apiKey: 'fixture-key',
    fetchImpl: async () => {
      invalidJsonCalls += 1;
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'not-json' } }] }; } };
    }
  });
} catch (error) {
  invalidJsonError = error;
  invalidJsonFailure = classifyProviderFailure(error);
}
assert(invalidJsonCalls === 1, 'invalid JSON path must not retry');
assert(invalidJsonFailure?.category === 'invalid_provider_json' && invalidJsonFailure.retryAllowedInSameRun === false, 'invalid JSON classification failed');
assert(invalidJsonError?.responseDiagnostics?.contentLength === 8, 'invalid JSON diagnostics must preserve sanitized content length');

const truncatedError = new Error('truncated');
truncatedError.category = 'invalid_provider_json';
truncatedError.responseDiagnostics = { finishReason: 'length' };
assert(classifyProviderFailure(truncatedError).category === 'provider_output_truncated', 'finish_reason=length classification failed');

let timeoutCalls = 0;
let timeoutFailure = null;
try {
  await requestWeeklyEditorial({
    input,
    apiKey: 'fixture-key',
    fetchImpl: async () => {
      timeoutCalls += 1;
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    },
    config: { ...WEEKLY_EDITORIAL_PROVIDER_CONFIG, timeoutMs: 5 }
  });
} catch (error) {
  timeoutFailure = classifyProviderFailure(error);
}
assert(timeoutCalls === 1, 'timeout path must not retry');
assert(timeoutFailure?.category === 'provider_timeout' && timeoutFailure.retryAllowedInSameRun === false, 'timeout classification failed');

console.log(`Bubble Watch weekly editorial provider/quality/writer PASS (api calls=${apiCallCount}, review=${review.status}, sources=${layer.sourceLedger.length}, negative tests=5)`);
