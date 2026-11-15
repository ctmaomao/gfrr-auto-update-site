import { LIMITED_SEARCH_DISCLOSURE } from './weekly-editorial-news.mjs';
import { withDeepSeekBudget } from '../lib/deepseek-budget.mjs';
import {
  DEFAULT_DEEPSEEK_MODEL
} from '../external-ai/provider-adapters.mjs';
import { assertValid, validateWeeklyEditorialInput, validateWeeklyEditorialOutput } from './weekly-editorial-contract.mjs';
import { normalizeMediaClaimNames, diagnoseMediaClaims } from './weekly-editorial-claim-diagnostics.mjs';
import { completeClaimIndicatorReferences } from './weekly-editorial-reference-consistency.mjs';
import { shortHash } from '../lib/check-script-helpers.mjs';
import {
  buildWeeklyEditorialSystemPrompt,
  buildWeeklyEditorialUserPrompt,
  validateWeeklyEditorialPrompt
} from './weekly-editorial-prompt.mjs';

export const WEEKLY_EDITORIAL_PROVIDER_CONFIG = Object.freeze({
  provider: 'deepseek',
  model: DEFAULT_DEEPSEEK_MODEL,
  timeoutMs: 120_000,
  maxTokens: 8_000,
  temperature: 0.2,
  maxCallsPerRun: 1,
  retryCount: 0
});

export function buildWeeklyEditorialReplayCandidate(output, input, secret = '') {
  // Diagnostic candidate only: never retain HTTP envelopes, arbitrary root fields or credentials.
  const fields = ['schemaVersion', 'generatedAt', 'asOfDate', 'provider', 'model', 'mode', 'headlineZh', 'leadZh', 'weeklyTimeline', 'scorecardSynthesisZh', 'scorecardSourceIndicatorIds', 'keyTensions', 'categoryAnalysis', 'historicalComparison', 'watchNextWeek', 'dataGaps', 'sourceAttribution', 'confidence', 'auditFlags', 'boundaries'];
  let redactionsApplied = false;
  let omittedFields = 0;
  let bounded = false;
  let nodes = 0;
  function clean(value, depth = 0) {
    if (++nodes > 4000 || depth > 12) { bounded = true; return null; }
    if (typeof value === 'string') {
      const safe = secret ? value.replaceAll(secret, '[REDACTED]') : value;
      if (safe !== value) redactionsApplied = true;
      if (safe.length > 20_000) bounded = true;
      return safe.slice(0, 20_000);
    }
    if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => { if (/^(?:headers|authorization|apiKey|api_key|rawResponse|rawContent|reasoning_content)$/iu.test(key)) { omittedFields++; return false; } return true; })
      .map(([key, item]) => { if (secret && key.includes(secret)) { redactionsApplied = true; key = '[REDACTED_KEY]'; } return [key, clean(item, depth + 1)]; }));
    return value;
  }
  const selected = Object.fromEntries(fields.filter(key => Object.hasOwn(output, key)).map(key => [key, output[key]]));
  omittedFields += Object.keys(output).filter(key => !fields.includes(key)).length;
  const candidate = { schemaVersion: 'bubble-weekly-editorial-replay-only-v1', replayOnly: true, productionEligible: false,
    inputDigestShort: shortHash(input, 16), output: clean(selected), redactionsApplied, omittedFields, bounded };
  if (Buffer.byteLength(JSON.stringify(candidate)) > 128 * 1024) return null;
  return candidate;
}

function responseDiagnostics(responseJson, status = null) {
  const firstChoice = Array.isArray(responseJson?.choices) ? responseJson.choices[0] : null;
  const message = firstChoice?.message && typeof firstChoice.message === 'object' ? firstChoice.message : null;
  const content = message?.content;
  const reasoningContent = message?.reasoning_content;
  const usage = responseJson?.usage && typeof responseJson.usage === 'object' ? responseJson.usage : null;
  const trimmed = typeof content === 'string' ? content.trim() : '';
  return {
    httpStatus: status,
    errorType: typeof responseJson?.error?.type === 'string' ? responseJson.error.type.slice(0, 80) : null,
    errorCode: typeof responseJson?.error?.code === 'string' ? responseJson.error.code.slice(0, 80) : null,
    requestIdPresent: Boolean(responseJson?.id),
    responseModel: typeof responseJson?.model === 'string' ? responseJson.model.slice(0, 80) : null,
    choicesCount: Array.isArray(responseJson?.choices) ? responseJson.choices.length : 0,
    finishReason: typeof firstChoice?.finish_reason === 'string' ? firstChoice.finish_reason.slice(0, 80) : null,
    messageKeys: message ? Object.keys(message).sort() : [],
    hasContent: trimmed.length > 0,
    contentLength: typeof content === 'string' ? content.length : null,
    contentStartsWithObject: trimmed.startsWith('{'),
    contentEndsWithObject: trimmed.endsWith('}'),
    contentHasSingleJsonFence: /^```(?:json)?\s*[\s\S]*\s*```$/iu.test(trimmed),
    hasReasoningContent: typeof reasoningContent === 'string' && reasoningContent.length > 0,
    reasoningContentLength: typeof reasoningContent === 'string' ? reasoningContent.length : null,
    usage: usage ? Object.fromEntries(Object.entries(usage).filter(([, value]) => Number.isFinite(value))) : null
  };
}

function transportDiagnostics(error) {
  const errorName = typeof error?.name === 'string' ? error.name.slice(0, 80) : null;
  const errorCode = typeof error?.code === 'string'
    ? error.code.slice(0, 80)
    : typeof error?.cause?.code === 'string'
      ? error.cause.code.slice(0, 80)
      : null;
  return {
    ...responseDiagnostics(null, null),
    transportErrorName: errorName,
    transportErrorCode: errorCode
  };
}

function collectSourceRefIds(value, output = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectSourceRefIds(item, output));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'sourceRefIds' && Array.isArray(item)) {
        item.forEach((entry) => typeof entry === 'string' && output.add(entry));
      } else {
        collectSourceRefIds(item, output);
      }
    }
  }
  return output;
}

function deterministicAttribution(source) {
  const sourceClass = source?.sourceClass;
  const claimType = source?.kind === 'indicator' || sourceClass === 'site_structured'
    ? 'site_structured_data'
    : sourceClass === 'official'
      ? 'official_news_context'
      : sourceClass === 'cross_checked'
        ? 'cross_checked_news_context'
        : sourceClass === 'attributed_media' ? 'attributed_media_news_context' : 'discovery_only_news_context';
  const suffix = claimType === 'site_structured_data' ? '站内结构化数据' : '周度新闻上下文';
  return {
    sourceRefId: source.id,
    claimType,
    noteZh: `${source.sourceName || source.domain || source.id}（${suffix}）`.slice(0, 70)
  };
}

function normalizeSourceAttribution(output, input) {
  // Fill omissions only. Invalid, duplicate and unknown existing rows must reach
  // the strict validator unchanged, not disappear during a format repair.
  if (!Array.isArray(output?.sourceAttribution)) return output?.sourceAttribution;
  const rows = structuredClone(output.sourceAttribution);
  const sourceMap = new Map((input?.sourceRefs || []).map(source => [source.id, source]));
  const existingIds = new Set(rows.map(item => item?.sourceRefId));
  for (const id of collectSourceRefIds(output)) {
    if (!existingIds.has(id) && sourceMap.has(id)) rows.push(deterministicAttribution(sourceMap.get(id)));
  }
  return rows;
}

function normalizeConfidence(confidence) {
  if (!confidence || typeof confidence !== 'object' || Array.isArray(confidence)) return confidence;
  const score = confidence.score;
  return {
    ...confidence,
    score: Number.isFinite(score) && score > 0 && score <= 1 ? Math.round(score * 100) : score
  };
}

// Shared by the live adapter and offline diagnostic replay; no transport or write.
export function normalizeWeeklyEditorialProviderOutput(output, input, { generatedAt = output?.generatedAt, model = output?.model } = {}) {
  const references = completeClaimIndicatorReferences(normalizeMediaClaimNames(output, input), input);
  const normalized = {
    ...references.output,
    schemaVersion: 'bubble-watch-weekly-editorial-output-v1', generatedAt,
    asOfDate: input.asOfDate, provider: 'deepseek', model, mode: 'external_ai_weekly_editorial'
  };
  for (const key of ['weeklyTimeline', 'keyTensions', 'categoryAnalysis']) {
    if (!Object.hasOwn(normalized, key)) normalized[key] = [];
  }
  if (!Object.hasOwn(normalized, 'historicalComparison')) normalized.historicalComparison = null;
  normalized.sourceAttribution = normalizeSourceAttribution(normalized, input);
  normalized.confidence = normalizeConfidence(normalized.confidence);
  if (input?.newsContext?.coverageMode === 'limited_single_search' && Array.isArray(normalized.dataGaps)
    && normalized.dataGaps.every(gap => typeof gap === 'string') && !normalized.dataGaps.includes(LIMITED_SEARCH_DISCLOSURE)) {
    normalized.dataGaps = [...normalized.dataGaps, LIMITED_SEARCH_DISCLOSURE];
  }
  return { output: normalized, referenceNormalization: references.diagnostics };
}

export function parseWeeklyEditorialProviderContent(content) {
  if (typeof content !== 'string' || !content.trim()) throw new SyntaxError('provider content is empty');
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch (directError) {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
    if (!fenced) throw directError;
    return JSON.parse(fenced[1]);
  }
}

export function classifyProviderFailure(error) {
  if (/^deepseek_budget_[a-z_]+$/u.test(error?.budgetCode || '')) return { category: error.budgetCode, retryAllowedInSameRun: false, recommendedAction: 'Keep the paid provider stopped; review the shared budget evidence without retrying.' };
  if (error?.name === 'AbortError' || error?.category === 'provider_timeout') {
    return { category: 'provider_timeout', retryAllowedInSameRun: false, recommendedAction: 'Inspect input size and retry once in a later run.' };
  }
  if ([429, 500, 502, 503, 504].includes(error?.httpStatus)) {
    return { category: 'provider_unavailable', retryAllowedInSameRun: false, recommendedAction: 'Stop repeated paid calls and retry later.' };
  }
  if (error?.category === 'provider_transport_error') {
    return { category: 'provider_transport_error', retryAllowedInSameRun: false, recommendedAction: 'Inspect sanitized transport diagnostics and retry once in a later run.' };
  }
  if (error?.category === 'provider_response_envelope_invalid') {
    return { category: 'provider_response_envelope_invalid', retryAllowedInSameRun: false, recommendedAction: 'Inspect the sanitized HTTP status and retry only after ruling out a provider outage.' };
  }
  if (error?.category === 'provider_output_contract_invalid') {
    if (error?.responseDiagnostics?.finishReason === 'length') {
      return { category: 'provider_output_truncated', retryAllowedInSameRun: false, recommendedAction: 'Reduce requested output density and inspect the bounded prompt before any later run.' };
    }
    return { category: 'provider_output_contract_invalid', retryAllowedInSameRun: false, recommendedAction: 'Inspect sanitized contract diagnostics and correct the prompt or deterministic normalization before any later run.' };
  }
  if (error?.category === 'invalid_provider_json') {
    if (error?.responseDiagnostics?.finishReason === 'length') {
      return { category: 'provider_output_truncated', retryAllowedInSameRun: false, recommendedAction: 'Reduce requested output density and inspect the bounded prompt before any later run.' };
    }
    return { category: 'invalid_provider_json', retryAllowedInSameRun: false, recommendedAction: 'Inspect the sanitized failure artifact and prompt contract.' };
  }
  return { category: 'provider_unknown_error', retryAllowedInSameRun: false, recommendedAction: 'Inspect sanitized diagnostics before any later run.' };
}

export async function requestWeeklyEditorial({ input, apiKey, fetchImpl = fetch, now = () => new Date(), config = WEEKLY_EDITORIAL_PROVIDER_CONFIG, budget = withDeepSeekBudget }) {
  assertValid(validateWeeklyEditorialInput(input), 'weekly editorial provider input');
  const promptCheck = validateWeeklyEditorialPrompt(input);
  if (!promptCheck.ok) throw new Error(`weekly editorial prompt contract missing: ${promptCheck.missingMarkers.join(', ')}`);
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('DEEPSEEK_API_KEY is required');

  const controller = new AbortController();
  let timeout;
  let response;
  let responseJson;
  const payload = {
    model: config.model,
    stream: false,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildWeeklyEditorialSystemPrompt(input) },
      { role: 'user', content: buildWeeklyEditorialUserPrompt(input) }
    ]
  };
  try {
    responseJson = await budget({ key: apiKey, payload, consumer: 'bubble-editorial' }, async ({ url, headers, body }) => {
      timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      response = await fetchImpl(url, { method: 'POST', headers, body, redirect: 'error', signal: controller.signal });
      try {
        responseJson = await response.json();
      } catch {
        const error = new Error('DeepSeek response envelope was not valid JSON');
        error.category = 'provider_response_envelope_invalid';
        error.httpStatus = response?.status || null;
        error.responseDiagnostics = responseDiagnostics(null, response?.status || null);
        throw error;
      }
      if (!response.ok) {
        const error = new Error(`DeepSeek HTTP ${response.status}`);
        error.httpStatus = response.status;
        error.responseDiagnostics = responseDiagnostics(responseJson, response.status);
        throw error;
      }
      return responseJson;
    });
  } catch (error) {
    if (error?.name === 'AbortError') error.category = 'provider_timeout';
    else if (!error?.category && !response) {
      error.category = 'provider_transport_error';
      error.responseDiagnostics = transportDiagnostics(error);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const content = responseJson?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const error = new Error('DeepSeek response did not contain message content');
    error.category = 'invalid_provider_json';
    error.responseDiagnostics = responseDiagnostics(responseJson, response?.status || null);
    throw error;
  }

  let output;
  try {
    output = parseWeeklyEditorialProviderContent(content);
  } catch {
    const error = new Error('DeepSeek message content was not valid JSON');
    error.category = 'invalid_provider_json';
    error.responseDiagnostics = responseDiagnostics(responseJson, response?.status || null);
    throw error;
  }

  const generatedAt = now().toISOString();
  const { output: normalizedOutput, referenceNormalization } = normalizeWeeklyEditorialProviderOutput(output, input, { generatedAt, model: config.model });
  const outputValidation = validateWeeklyEditorialOutput(normalizedOutput, input);
  if (!outputValidation.ok) {
    const error = new Error('DeepSeek weekly editorial output failed contract validation');
    error.category = 'provider_output_contract_invalid';
    // ADR-0103: rejected prose is not retained in ordinary Actions artifacts.
    error.responseDiagnostics = {
      ...responseDiagnostics(responseJson, response?.status || null),
      contract: {
        errorCount: outputValidation.errors.length,
        visibleTextLength: outputValidation.visibleTextLength,
        errors: outputValidation.errors.slice(0, 24).map((item) => String(item).slice(0, 240)),
        mediaClaims: diagnoseMediaClaims(normalizedOutput, input, { secret: apiKey })
      }
    };
    throw error;
  }
  return {
    output: normalizedOutput,
    diagnostics: {
      provider: 'deepseek',
      model: config.model,
      apiCallCount: 1,
      referenceNormalization,
      retryCount: 0,
      timeoutMs: config.timeoutMs,
      maxTokens: config.maxTokens,
      response: responseDiagnostics(responseJson, response?.status || null)
    }
  };
}
