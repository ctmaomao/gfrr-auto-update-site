import {
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_CHAT_ENDPOINT
} from '../external-ai/provider-adapters.mjs';
import {
  OUTPUT_SCHEMA,
  RISK_MODULES,
  assertValid,
  validateEditorialInput,
  validateEditorialOutput
} from './editorial-contract.mjs';

export const EDITORIAL_PROVIDER_CONFIG = Object.freeze({
  provider: 'deepseek',
  model: DEFAULT_DEEPSEEK_MODEL,
  timeoutMs: 120_000,
  maxTokens: 8_000,
  temperature: 0.2,
  maxCallsPerRun: 1,
  retryCount: 0
});

export function buildEditorialSystemPrompt() {
  return `你是 GFRR 的宏观风险主编。请把近 7 日可信新闻与站内结构化数据综合成中文宏观判读，输出严格 JSON，不要 Markdown。

目标：产出 4,000–5,600 个可见中文字符，信息密度接近专业周报；允许范围为 2,000–6,800 字，但不得为凑字数重复。结论必须是“当前压力判读”，不得伪装成危机预测、战争概率、投资建议或交易信号。

硬性事实与边界：
- GFRR 分数及六大模块是既有规则结果；你只能解释，不得重算、改写或建议调整。
- discovery_only 新闻不得单独支撑事实性判断，必须同时引用站内结构化数据或 official/cross_checked 新闻。
- 所有事实段落都必须提供 sourceRefIds，且只能使用输入 sourceRefs 中的 id。
- 历史比较必须同时写相似点与差异点，并明确不代表危机概率或时间预测。
- 不得给出买卖、仓位、现金比例、目标价、止损、风险敞口或执行建议。
- 不得复述输入中不存在的具体数字、日期或事实。
- dataGaps 必须至少保留一项；confidence.score 必须是 0–100 整数，不是 0–1 概率。

严格输出字段：
{
  "headlineZh": "8–90 字",
  "leadZh": "80–900 字",
  "weeklyTimeline": [{"date":"YYYY-MM-DD","titleZh":"...","detailZh":"...","sourceRefIds":["..."]}],
  "scoreSynthesis": {"assessmentZh":"...","sourceRefIds":["..."]},
  "keyTensions": [{"titleZh":"...","detailZh":"...","sourceRefIds":["..."]}],
  "moduleAnalysis": [{"module":"energy|geopolitical|inflation|liquidity|debt|banking","labelZh":"...","score":0,"assessmentZh":"...","sourceRefIds":["..."]}],
  "crossMarketAnalysis": [{"assetZh":"...","observationZh":"...","implicationZh":"...","sourceRefIds":["..."]}],
  "historicalComparison": {"periodZh":"...","similaritiesZh":"...","differencesZh":"...","sourceRefIds":["..."]},
  "watchNext": [{"conditionZh":"...","whyItMattersZh":"...","invalidationZh":"...","sourceRefIds":["..."]}],
  "dataGaps": ["..."],
  "sourceAttribution": [{"sourceRefId":"...","claimType":"site_structured_data|official_news_context|cross_checked_news_context|discovery_only_news_context","noteZh":"..."}],
  "confidence": {"level":"low|medium|high","score":0,"reasonZh":"..."},
  "auditFlags": ["current_pressure_not_forecast","read_only_editorial","source_attributed"],
  "boundaries": {
    "displayOnly":true,"commentaryOnly":true,"externalAiGenerated":true,"usesExternalAiApi":true,"notInvestmentAdvice":true,
    "affectsGfrrScoring":false,"affectsRiskModules":false,"affectsTailRiskOverlay":false,"affectsDecisionModel":false,
    "affectsExecutionLock":false,"affectsPositionGuidance":false,"affectsWorldOrder":false,"affectsOdp":false,"affectsBubbleWatch":false
  }
}

数量上限：weeklyTimeline 3–5；keyTensions 2–4；moduleAnalysis 恰好 6 且顺序为 ${RISK_MODULES.join(', ')}；crossMarketAnalysis 3–5；watchNext 3–5；dataGaps 1–12。`;
}

export function buildEditorialUserPrompt(input) {
  const credibleCount = (input?.newsContext?.stories || []).filter((story) => ['official', 'cross_checked'].includes(story.evidenceStatus)).length;
  return `请依据以下紧凑证据包生成本期宏观判读。可用可信新闻 ${credibleCount} 条。只返回 JSON 对象。\n${JSON.stringify(input)}`;
}

export function validateEditorialPrompt(input) {
  const system = buildEditorialSystemPrompt();
  const user = buildEditorialUserPrompt(input);
  const required = ['4,000–5,600', '2,000–6,800', 'discovery_only', '不得重算', '不得伪装成危机预测', 'sourceRefIds', '恰好 6', 'confidence.score', '只返回 JSON'];
  const missingMarkers = required.filter((marker) => !`${system}\n${user}`.includes(marker));
  return { ok: missingMarkers.length === 0, missingMarkers };
}

function responseDiagnostics(responseJson, status = null) {
  const choice = Array.isArray(responseJson?.choices) ? responseJson.choices[0] : null;
  const message = choice?.message && typeof choice.message === 'object' ? choice.message : null;
  const content = message?.content;
  const usage = responseJson?.usage && typeof responseJson.usage === 'object' ? responseJson.usage : null;
  const trimmed = typeof content === 'string' ? content.trim() : '';
  return {
    httpStatus: status,
    errorType: typeof responseJson?.error?.type === 'string' ? responseJson.error.type.slice(0, 80) : null,
    errorCode: typeof responseJson?.error?.code === 'string' ? responseJson.error.code.slice(0, 80) : null,
    responseModel: typeof responseJson?.model === 'string' ? responseJson.model.slice(0, 80) : null,
    choicesCount: Array.isArray(responseJson?.choices) ? responseJson.choices.length : 0,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason.slice(0, 80) : null,
    hasContent: trimmed.length > 0,
    contentLength: typeof content === 'string' ? content.length : null,
    contentStartsWithObject: trimmed.startsWith('{'),
    contentEndsWithObject: trimmed.endsWith('}'),
    usage: usage ? Object.fromEntries(Object.entries(usage).filter(([, value]) => Number.isFinite(value))) : null
  };
}

function collectSourceRefIds(value, output = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectSourceRefIds(item, output));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'sourceRefIds' && Array.isArray(item)) item.forEach((entry) => typeof entry === 'string' && output.add(entry));
      else collectSourceRefIds(item, output);
    }
  }
  return output;
}

function deterministicAttribution(source) {
  const claimType = source?.kind === 'site_structured'
    ? 'site_structured_data'
    : source?.sourceClass === 'official'
      ? 'official_news_context'
      : source?.sourceClass === 'cross_checked'
        ? 'cross_checked_news_context'
        : 'discovery_only_news_context';
  return {
    sourceRefId: source.id,
    claimType,
    noteZh: `${source.sourceName || source.domain || source.id}（${claimType === 'site_structured_data' ? '站内结构化数据' : '近 7 日新闻上下文'}）`.slice(0, 90)
  };
}

function normalizeOutput(output, input, generatedAt, model) {
  const normalized = {
    ...output,
    schemaVersion: OUTPUT_SCHEMA,
    generatedAt,
    sourceDataUpdatedAt: input.sourceDataUpdatedAt,
    provider: 'deepseek',
    model,
    mode: 'external_ai_macro_risk_editorial'
  };
  if (normalized.confidence && Number.isFinite(normalized.confidence.score) && normalized.confidence.score > 0 && normalized.confidence.score <= 1) {
    normalized.confidence = { ...normalized.confidence, score: Math.round(normalized.confidence.score * 100) };
  }
  const sourceMap = new Map((input.sourceRefs || []).map((source) => [source.id, source]));
  const referencedIds = collectSourceRefIds(normalized);
  const existing = new Map((Array.isArray(normalized.sourceAttribution) ? normalized.sourceAttribution : [])
    .filter((item) => referencedIds.has(item?.sourceRefId) && sourceMap.has(item.sourceRefId))
    .map((item) => [item.sourceRefId, item]));
  normalized.sourceAttribution = [...referencedIds].map((id) => existing.get(id) || deterministicAttribution(sourceMap.get(id) || { id }));
  return normalized;
}

export function parseEditorialProviderContent(content) {
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
  if (error?.name === 'AbortError' || error?.category === 'provider_timeout') return { category: 'provider_timeout', retryAllowedInSameRun: false };
  if ([429, 500, 502, 503, 504].includes(error?.httpStatus)) return { category: 'provider_unavailable', retryAllowedInSameRun: false };
  if (error?.category === 'provider_output_contract_invalid' && error?.responseDiagnostics?.finishReason === 'length') return { category: 'provider_output_truncated', retryAllowedInSameRun: false };
  return { category: error?.category || 'provider_unknown_error', retryAllowedInSameRun: false };
}

export async function requestEditorial({ input, apiKey, fetchImpl = fetch, now = () => new Date(), config = EDITORIAL_PROVIDER_CONFIG }) {
  assertValid(validateEditorialInput(input), 'macro risk editorial provider input');
  const prompt = validateEditorialPrompt(input);
  if (!prompt.ok) throw new Error(`macro risk editorial prompt contract missing: ${prompt.missingMarkers.join(', ')}`);
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('DEEPSEEK_API_KEY is required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  let responseJson;
  try {
    response = await fetchImpl(`${DEEPSEEK_BASE_URL}${DEEPSEEK_CHAT_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildEditorialSystemPrompt() },
          { role: 'user', content: buildEditorialUserPrompt(input) }
        ]
      }),
      signal: controller.signal
    });
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
  } catch (error) {
    if (error?.name === 'AbortError') error.category = 'provider_timeout';
    else if (!error?.category && !response) error.category = 'provider_transport_error';
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const content = responseJson?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = parseEditorialProviderContent(content);
  } catch {
    const error = new Error('DeepSeek message content was not valid JSON');
    error.category = 'invalid_provider_json';
    error.responseDiagnostics = responseDiagnostics(responseJson, response?.status || null);
    throw error;
  }
  const output = normalizeOutput(parsed, input, now().toISOString(), config.model);
  const validation = validateEditorialOutput(output, input);
  if (!validation.ok) {
    const error = new Error('DeepSeek macro risk editorial output failed contract validation');
    error.category = 'provider_output_contract_invalid';
    error.responseDiagnostics = {
      ...responseDiagnostics(responseJson, response?.status || null),
      contract: { errorCount: validation.errors.length, visibleTextLength: validation.visibleTextLength, errors: validation.errors.slice(0, 24) }
    };
    throw error;
  }
  return {
    output,
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
