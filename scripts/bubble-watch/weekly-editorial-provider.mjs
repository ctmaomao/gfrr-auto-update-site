import {
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_CHAT_ENDPOINT
} from '../external-ai/provider-adapters.mjs';
import { assertValid, validateWeeklyEditorialInput, validateWeeklyEditorialOutput } from './weekly-editorial-contract.mjs';
import {
  buildWeeklyEditorialSystemPrompt,
  buildWeeklyEditorialUserPrompt,
  validateWeeklyEditorialPrompt
} from './weekly-editorial-prompt.mjs';

export const WEEKLY_EDITORIAL_PROVIDER_CONFIG = Object.freeze({
  provider: 'deepseek',
  model: DEFAULT_DEEPSEEK_MODEL,
  timeoutMs: 120_000,
  maxTokens: 5_000,
  temperature: 0.2,
  maxCallsPerRun: 1,
  retryCount: 0
});

function responseDiagnostics(responseJson, status = null) {
  return {
    httpStatus: status,
    errorType: typeof responseJson?.error?.type === 'string' ? responseJson.error.type.slice(0, 80) : null,
    errorCode: typeof responseJson?.error?.code === 'string' ? responseJson.error.code.slice(0, 80) : null,
    requestIdPresent: Boolean(responseJson?.id),
    choicesCount: Array.isArray(responseJson?.choices) ? responseJson.choices.length : 0
  };
}

export function classifyProviderFailure(error) {
  if (error?.name === 'AbortError' || error?.category === 'provider_timeout') {
    return { category: 'provider_timeout', retryAllowedInSameRun: false, recommendedAction: 'Inspect input size and retry once in a later run.' };
  }
  if ([429, 500, 502, 503, 504].includes(error?.httpStatus)) {
    return { category: 'provider_unavailable', retryAllowedInSameRun: false, recommendedAction: 'Stop repeated paid calls and retry later.' };
  }
  if (error?.category === 'invalid_provider_json') {
    return { category: 'invalid_provider_json', retryAllowedInSameRun: false, recommendedAction: 'Inspect the sanitized failure artifact and prompt contract.' };
  }
  return { category: 'provider_unknown_error', retryAllowedInSameRun: false, recommendedAction: 'Inspect sanitized diagnostics before any later run.' };
}

export async function requestWeeklyEditorial({ input, apiKey, fetchImpl = fetch, now = () => new Date(), config = WEEKLY_EDITORIAL_PROVIDER_CONFIG }) {
  assertValid(validateWeeklyEditorialInput(input), 'weekly editorial provider input');
  const promptCheck = validateWeeklyEditorialPrompt(input);
  if (!promptCheck.ok) throw new Error(`weekly editorial prompt contract missing: ${promptCheck.missingMarkers.join(', ')}`);
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('DEEPSEEK_API_KEY is required');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  let responseJson;
  try {
    response = await fetchImpl(`${DEEPSEEK_BASE_URL}${DEEPSEEK_CHAT_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildWeeklyEditorialSystemPrompt() },
          { role: 'user', content: buildWeeklyEditorialUserPrompt(input) }
        ]
      }),
      signal: controller.signal
    });
    responseJson = await response.json();
    if (!response.ok) {
      const error = new Error(`DeepSeek HTTP ${response.status}`);
      error.httpStatus = response.status;
      error.responseDiagnostics = responseDiagnostics(responseJson, response.status);
      throw error;
    }
  } catch (error) {
    if (error?.name === 'AbortError') error.category = 'provider_timeout';
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
    output = JSON.parse(content);
  } catch {
    const error = new Error('DeepSeek message content was not valid JSON');
    error.category = 'invalid_provider_json';
    error.responseDiagnostics = responseDiagnostics(responseJson, response?.status || null);
    throw error;
  }

  const generatedAt = now().toISOString();
  const normalizedOutput = {
    ...output,
    schemaVersion: 'bubble-watch-weekly-editorial-output-v1',
    generatedAt,
    asOfDate: input.asOfDate,
    provider: 'deepseek',
    model: config.model,
    mode: 'external_ai_weekly_editorial'
  };
  assertValid(validateWeeklyEditorialOutput(normalizedOutput, input), 'DeepSeek weekly editorial output');
  return {
    output: normalizedOutput,
    diagnostics: {
      provider: 'deepseek',
      model: config.model,
      apiCallCount: 1,
      retryCount: 0,
      timeoutMs: config.timeoutMs,
      maxTokens: config.maxTokens,
      response: responseDiagnostics(responseJson, response?.status || null)
    }
  };
}
