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
import { buildWeeklyEditorialUserPrompt, validateWeeklyEditorialPrompt } from './bubble-watch/weekly-editorial-prompt.mjs';
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

const oneCredibleReplacements = new Map(credibleStories.slice(1).map((story) => [story.id, credibleStories[0].id]));
const oneCredibleOutput = replaceExactStrings(providerOutput, oneCredibleReplacements);
const seenOneCredibleAttributions = new Set();
oneCredibleOutput.sourceAttribution = oneCredibleOutput.sourceAttribution.filter((item) => {
  if (seenOneCredibleAttributions.has(item.sourceRefId)) return false;
  seenOneCredibleAttributions.add(item.sourceRefId);
  return true;
});
assertValid(validateWeeklyEditorialOutput(oneCredibleOutput, input), 'one-credible-story output');
const oneCredibleInput = structuredClone(input);
oneCredibleInput.newsContext.status = 'partial';
oneCredibleInput.newsContext.dataGaps.push('本周期仅形成 1 条 official/cross_checked 新闻证据。');
const sparsePromptInput = structuredClone(oneCredibleInput);
sparsePromptInput.newsContext.stories = [
  credibleStories[0],
  ...input.newsContext.stories.filter((story) => story.evidenceStatus === 'discovery_only')
];
const sparseUserPrompt = buildWeeklyEditorialUserPrompt(sparsePromptInput);
assert(sparseUserPrompt.includes('Only 1 official/cross_checked news story is available'), 'sparse-news prompt must state the credible-story budget');
assert(sparseUserPrompt.includes('Build the remaining timeline items from structuredFacts'), 'sparse-news prompt must route remaining timeline items to structured facts');
assert(sparseUserPrompt.includes('Never use discovery_only news as sole support'), 'sparse-news prompt must retain discovery-only guard');
const oneCredibleReview = reviewWeeklyEditorial({ input: oneCredibleInput, output: oneCredibleOutput, generatedAt: '2026-08-11T00:04:00.000Z' });
assert(oneCredibleReview.status === 'warn', `one credible news reference must remain display-eligible WARN, got ${oneCredibleReview.status}`);
assert(oneCredibleReview.dimensions.newsEvidenceQuality === 'warn', 'one credible news reference must warn on newsEvidenceQuality');
assert(oneCredibleReview.frontendDisplayEligible === true && oneCredibleReview.promotionEligible === false, 'one-credible-story review must stay display-only and non-promotable');

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

let transportCalls = 0;
let transportError = null;
try {
  await requestWeeklyEditorial({
    input,
    apiKey: 'fixture-key',
    fetchImpl: async () => {
      transportCalls += 1;
      throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    }
  });
} catch (error) {
  transportError = error;
}
const transportFailure = classifyProviderFailure(transportError);
assert(transportCalls === 1, 'transport failure path must not retry');
assert(transportFailure?.category === 'provider_transport_error' && transportFailure.retryAllowedInSameRun === false, 'transport failure classification failed');
assert(transportError?.responseDiagnostics?.transportErrorName === 'TypeError' && transportError?.responseDiagnostics?.transportErrorCode === 'ECONNRESET', 'transport diagnostics must retain only sanitized error identity/code');

let envelopeCalls = 0;
let envelopeError = null;
try {
  await requestWeeklyEditorial({
    input,
    apiKey: 'fixture-key',
    fetchImpl: async () => {
      envelopeCalls += 1;
      return { ok: false, status: 502, async json() { throw new SyntaxError('invalid envelope'); } };
    }
  });
} catch (error) {
  envelopeError = error;
}
const envelopeFailure = classifyProviderFailure(envelopeError);
assert(envelopeCalls === 1, 'invalid response envelope path must not retry');
assert(envelopeFailure?.category === 'provider_unavailable' && envelopeFailure.retryAllowedInSameRun === false, 'HTTP 502 envelope failure must classify as provider_unavailable');
assert(envelopeError?.responseDiagnostics?.httpStatus === 502, 'invalid response envelope diagnostics must retain sanitized HTTP status');

let contractCalls = 0;
let contractError = null;
try {
  const invalidContractOutput = { ...providerOutput, headlineZh: '短' };
  await requestWeeklyEditorial({
    input,
    apiKey: 'fixture-key',
    fetchImpl: async () => {
      contractCalls += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: 'fixture-contract-failure', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(invalidContractOutput) } }] };
        }
      };
    }
  });
} catch (error) {
  contractError = error;
}
const contractFailure = classifyProviderFailure(contractError);
assert(contractCalls === 1, 'contract failure path must not retry');
assert(contractFailure?.category === 'provider_output_contract_invalid' && contractFailure.retryAllowedInSameRun === false, 'provider output contract failure classification failed');
assert(contractError?.responseDiagnostics?.finishReason === 'stop', 'contract diagnostics must retain sanitized finish reason');
assert(contractError?.responseDiagnostics?.contract?.errorCount >= 1, 'contract diagnostics must retain validation error count');
assert(contractError?.responseDiagnostics?.contract?.errors?.some((item) => item.includes('headlineZh')), 'contract diagnostics must identify the rejected field without raw output');
assert(!JSON.stringify(contractError.responseDiagnostics).includes('fixture-contract-failure'), 'contract diagnostics must not retain provider response IDs or raw content');

console.log(`Bubble Watch weekly editorial provider/quality/writer PASS (api calls=${apiCallCount}, review=${review.status}, sources=${layer.sourceLedger.length}, negative tests=8)`);
