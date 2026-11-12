import { safeProviderDiagnostics } from '../lib/editorial-safe-diagnostics.mjs';
import { withDeepSeekBudget } from '../lib/deepseek-budget.mjs';
import {
  DEFAULT_DEEPSEEK_MODEL
} from '../external-ai/provider-adapters.mjs';
import {
  OUTPUT_SCHEMA,
  OFR_INPUT_SCHEMA,
  OFR_OUTPUT_SCHEMA,
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

export function buildEditorialSystemPrompt(input = null) {
  if (input?.schemaVersion === OFR_INPUT_SCHEMA) return buildOfrEditorialSystemPrompt();
  return `你是 GFRR 的宏观风险主编。请把近 7 日可信新闻与站内结构化数据综合成中文宏观判读，输出严格 JSON，不要 Markdown。

目标：产出 4,000–5,600 个可见中文字符，信息密度接近专业周报；允许范围为 2,000–6,800 字，但不得为凑字数重复。结论必须是“当前压力判读”，不得伪装成危机预测、战争概率、投资建议或交易信号。

可见正文预算：只统计前端实际展示的标题、日期、正文、数据限制与置信度说明；不计 sourceRefIds、module 枚举、claimType、auditFlags 或其他机器元数据。
- leadZh 是 Hero 导语，目标 350–600 字，必须不超过 650 字；只概括总分、主风险链、关键张力和证据边界。
- weeklyTimeline 恰好 3 条，每条 detailZh 100–170 字；keyTensions 恰好 2 条，每条 detailZh 180–280 字。
- moduleAnalysis 恰好 6 条，每条 assessmentZh 180–250 字；不得把其他章节原句重复到六模块。
- crossMarketAnalysis 恰好 3 条，每条 observationZh 与 implicationZh 各 70–120 字。
- historicalComparison 的 similaritiesZh 与 differencesZh 各 140–200 字。
- watchNext 恰好 3 条；每条 conditionZh 不超过 50 字、whyItMattersZh 不超过 100 字、invalidationZh 不超过 80 字。
- dataGaps 恰好 2 条，每条不超过 80 字；confidence.reasonZh 不超过 140 字。
- 输出前按上述真实可见字段汇总自检，目标 4,000–5,600 字且必须不超过 6,200 字，为 6,800 字 hard cap 保留缓冲。超长时完整重写压缩，不得截断 JSON、不得把溢出内容搬到机器字段，也不得依赖 adapter/writer 修正。

硬性事实与边界：
- 标题、节目名称、视频介绍和发布时间不能代替正文结论或事件日期；不得把就业主题节目写成测得的劳动统计。同一新闻稿被不同网站转载不等于独立确认。只复述合格摘要确有支持的事实或具出处观点。
- GFRR 分数及六大模块是既有规则结果；你只能解释，不得重算、改写或建议调整。
- weeklyTimeline、scoreSynthesis、keyTensions、moduleAnalysis、crossMarketAnalysis、historicalComparison、watchNext 中的每一个对象都视为事实性断言。
- 若任一事实性断言引用 discovery_only 新闻，同一个 sourceRefIds 数组还必须至少包含一条站内结构化数据或 official/cross_checked 新闻；只在 sourceAttribution 补来源不算合格。
- 无法为 discovery_only 新闻找到独立支撑时，不得输出该新闻断言，应改用有依据的站内结构化事实。
- 整份输出的事实对象引用集合必须至少实际引用 1 条 official/cross_checked 新闻；weeklyTimeline 至少一个对象必须引用可信新闻。只在 sourceAttribution 列出可信新闻不算合格。
- 所有事实段落都必须提供 sourceRefIds，且只能使用输入 sourceRefs 中的 id。
- 每个事实对象的 sourceRefIds 必须是含 1–12 个字符串的 JSON 数组，不能是字符串、null 或空数组；建议仅选 2–6 条直接支撑该段的来源，不得复制整个来源目录。
- historicalComparison 同样遵守单段 1–12 条引用上限。若一段必须依赖超过 12 条来源，先收窄并重写论断，再核对每项事实均有支撑；不得机械截断引用或删除必要证据。
- 历史比较必须同时写相似点与差异点，并明确不代表危机概率或时间预测。
- 不得给出买卖、仓位、现金比例、目标价、止损、风险敞口或执行建议。
- 不得复述输入中不存在的具体数字、日期或事实。
- dataGaps 必须至少保留一项；confidence.score 必须是 0–100 整数，不是 0–1 概率。

严格输出字段：
{
  "headlineZh": "8–90 字",
  "leadZh": "80–900 字 hard contract；本次目标 350–600 字且必须不超过 650 字",
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

合同允许范围：weeklyTimeline 3–5；keyTensions 2–4；moduleAnalysis 恰好 6 且顺序为 ${RISK_MODULES.join(', ')}；crossMarketAnalysis 3–5；watchNext 3–5；dataGaps 1–12。本次生成必须采用上方较窄预算，不得把合同兼容上限当作目标。`;
}

export function buildEditorialUserPrompt(input) {
  if (input?.schemaVersion === OFR_INPUT_SCHEMA) {
    const credibleNewsIds = (input.newsContext?.stories || [])
      .filter(story => ['official', 'cross_checked'].includes(story.evidenceStatus))
      .map(story => story.id);
    const discoveryOnlyIds = (input.newsContext?.stories || [])
      .filter(story => story.evidenceStatus === 'discovery_only')
      .map(story => story.id);
    return `只返回 JSON。按实际证据写简版，不凑字数或栏目。每段 sourceRefIds 必须属于输入；discovery_only 不可独立支撑事实。
本期可引用的 official/cross_checked 新闻 IDs：${JSON.stringify(credibleNewsIds)}。
仅供发现的 discovery_only IDs：${JSON.stringify(discoveryOnlyIds)}。
至少一个实际事实对象的 sourceRefIds 必须引用上述可信新闻 ID，且该对象的事实确由该新闻摘要支持。只在 sourceAttribution 列出不算实际引用；不得为满足引用要求添加与正文无关的 ID。没有合格摘要支撑的事实就不写，不得用标题或发布时间补造内容。
正文数字、金额、币种、单位、日期必须与同段引用一致；明确引语必须逐字存在于被引证据。
数值引用池仅为同段sourceRefIds对应的structuredFacts.factZh和合格新闻摘要。pressureSnapshot、pressureFreshness、historicalContext的数值供程序展示或背景理解，不能单独充当正文数值依据；不从这些对象另取历史读数、期限或端点加入正文。
输入中的 dataGaps、窗口日期、搜索渠道数和新闻条数属于采集元数据，不是 sourceRefIds 所引用的事实正文。不要照抄其中的“近7日”“1条”等数字到正文或 dataGaps；可定性披露“新闻覆盖有限”“搜索渠道响应不完整”，不得把元数据数字移到别处或拼接无关来源来通过核验。
OFR 原值正负仅对比 OFR 校准历史均值；严格过去十年百分位独立描述本站历史样本排序，负值不等于该窗口低位。定性比较必须在同一分句写出基准并引用对应的 site:ofr:pressure 或 site:ofr:percentile，不能只写“低位”“历史相对偏低”“宽松底色”。与样本排序有关的高低只描述中位位置的两侧，不定义压力等级。
contributionsPublished=false 仅表示本站当前快照未包含贡献分解，不代表 OFR 官方未公布；本站缺项必须明确写“本站当前快照/输入”，引用 site:ofr:coverage，不把来源机构写成缺少数据。
OFR 数字由程序展示。pressureSynthesis.assessmentZh 只写定性解释，不含数字、日期、期限、百分位值或编号列表；也不用中文数字规避。它仍须引用对应的站内来源。
紧凑证据包：\n${JSON.stringify(input)}
输出前逐项自检：仅用本版本字段；缺证据的可选栏目用[]或null；顶层sourceRefIds覆盖headlineZh/leadZh/dataGaps/confidence.reasonZh中的事实，其它对象单独引用；实际引用至少一条内容相关的可信新闻；pressureSynthesis纯定性；所有具体数值及日期有同段证据；字段长度和数组数量符合系统契约；完成整个JSON，不依赖程序删除不合格正文。`;
  }
  const credibleNewsIds = (input?.newsContext?.stories || [])
    .filter((story) => ['official', 'cross_checked'].includes(story.evidenceStatus))
    .map((story) => story.id);
  const credibleCount = credibleNewsIds.length;
  const discoveryOnlyIds = (input?.newsContext?.stories || [])
    .filter((story) => story?.evidenceStatus === 'discovery_only')
    .map((story) => story.id);
  const independentSourceRefIds = (input?.sourceRefs || [])
    .filter((source) => source?.kind === 'site_structured' || ['official', 'cross_checked'].includes(source?.sourceClass))
    .map((source) => source.id);
  return `请依据以下紧凑证据包生成本期宏观判读。可用可信新闻 ${credibleCount} 条。只返回 JSON 对象。

长度自检（输出前必须执行）：
1. 只汇总前端真实可见字段，不计 sourceRefIds 或其他机器元数据；总计目标 4,000–5,600 字，必须不超过 6,200 字。
2. 逐项核对系统提示中的分区数量和字符预算，尤其是 leadZh 必须不超过 650 字，weeklyTimeline/keyTensions/crossMarketAnalysis/watchNext 分别采用 3/2/3/3 条。
3. 若超出任一预算，先完整重写压缩；不得截断 JSON、不得将正文移入 sourceRefIds/sourceAttribution/auditFlags、不得依赖 adapter/writer 修正。

逐项引用自检（输出前必须执行）：
1. 逐一检查 weeklyTimeline、scoreSynthesis、keyTensions、moduleAnalysis、crossMarketAnalysis、historicalComparison、watchNext 内每个对象的 sourceRefIds。
2. 可信新闻 source IDs = ${JSON.stringify(credibleNewsIds)}；整份输出的事实对象 sourceRefIds 并集必须至少引用其中 1 条，且 weeklyTimeline 至少一个对象必须引用其中 1 条。仅在 sourceAttribution 列出不算合格。
3. discovery_only source IDs = ${JSON.stringify(discoveryOnlyIds)}。
4. 可提供独立支撑的 source IDs = ${JSON.stringify(independentSourceRefIds)}。
5. 若某个 sourceRefIds 含任一 discovery_only ID，同一个数组必须同时含至少一个可独立支撑 ID；仅在 sourceAttribution 中补 ID 无效。
6. 禁止示例：{"sourceRefIds":["discovery_only_id"]}。合格示例：{"sourceRefIds":["discovery_only_id","site_structured_or_credible_news_id"]}。
7. 无法满足时删除该 discovery_only 断言，改写为由站内结构化数据支撑的当前压力判断；不得编造支撑来源。
8. 对每个事实对象确认 sourceRefIds 是 1–12 项字符串数组；优先 2–6 条直接相关来源，historicalComparison 也不能汇集全部来源。超过上限须先收窄并重写论断，再重新检查事实支撑；禁止截断引用或依赖 adapter/writer 修正。

紧凑证据包：
${JSON.stringify(input)}`;
}

export function validateEditorialPrompt(input) {
  const system = buildEditorialSystemPrompt(input);
  if (input?.schemaVersion === OFR_INPUT_SCHEMA) {
    const required = ['pressureSynthesis', '不生成仓位', '校准历史均值', '严格过去十年', '本站当前快照', 'OFR 官方提供'];
    const missingMarkers = required.filter(marker => !system.includes(marker));
    return { ok: missingMarkers.length === 0, missingMarkers };
  }
  const user = buildEditorialUserPrompt(input);
  const required = ['4,000–5,600', '2,000–6,800', '不计 sourceRefIds', 'weeklyTimeline 恰好 3', 'keyTensions 恰好 2', 'crossMarketAnalysis 恰好 3', 'watchNext 恰好 3', '不超过 6,200', '长度自检', '不得截断 JSON', '不得依赖 adapter/writer 修正', 'discovery_only', '逐项引用自检', '可信新闻 source IDs', '必须至少引用其中 1 条', 'weeklyTimeline 至少一个对象', '同一个 sourceRefIds', '不得重算', '不得伪装成危机预测', 'sourceRefIds', '恰好 6', 'confidence.score', '只返回 JSON'];
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

export function normalizeOutput(output, input, generatedAt, model) {
  const normalized = {
    ...output,
    schemaVersion: input.schemaVersion === OFR_INPUT_SCHEMA ? OFR_OUTPUT_SCHEMA : OUTPUT_SCHEMA,
    generatedAt,
    sourceDataUpdatedAt: input.sourceDataUpdatedAt,
    provider: 'deepseek',
    model,
    mode: 'external_ai_macro_risk_editorial'
  };
  if (input.schemaVersion === OFR_INPUT_SCHEMA) {
    for (const key of ['weeklyTimeline', 'keyTensions', 'contextAnalysis', 'crossMarketAnalysis']) {
      if (!Object.hasOwn(normalized, key)) normalized[key] = [];
    }
    if (!Object.hasOwn(normalized, 'historicalComparison')) normalized.historicalComparison = null;
  }
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
  if (/^deepseek_budget_[a-z_]+$/u.test(error?.budgetCode || '')) return { category: error.budgetCode, retryAllowedInSameRun: false, recommendedAction: 'Keep the paid provider stopped; review the shared budget evidence without retrying.' };
  if (error?.name === 'AbortError' || error?.category === 'provider_timeout') return { category: 'provider_timeout', retryAllowedInSameRun: false };
  if ([429, 500, 502, 503, 504].includes(error?.httpStatus)) return { category: 'provider_unavailable', retryAllowedInSameRun: false };
  if (error?.category === 'provider_output_contract_invalid' && error?.responseDiagnostics?.finishReason === 'length') return { category: 'provider_output_truncated', retryAllowedInSameRun: false };
  return { category: error?.category || 'provider_unknown_error', retryAllowedInSameRun: false };
}

export async function requestEditorial({ input, apiKey, fetchImpl = fetch, now = () => new Date(), config = EDITORIAL_PROVIDER_CONFIG, budget = withDeepSeekBudget }) {
  assertValid(validateEditorialInput(input), 'macro risk editorial provider input');
  const prompt = validateEditorialPrompt(input);
  if (!prompt.ok) throw new Error(`macro risk editorial prompt contract missing: ${prompt.missingMarkers.join(', ')}`);
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
      { role: 'system', content: buildEditorialSystemPrompt(input) },
      { role: 'user', content: buildEditorialUserPrompt(input) }
    ]
  };
  try {
    responseJson = await budget({ key: apiKey, payload, consumer: 'macro-editorial' }, async ({ url, headers, body }) => {
      timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      response = await fetchImpl(url, { method: 'POST', headers, body, redirect: 'error', signal: controller.signal });
      try {
        responseJson = await response.json();
      } catch (cause) {
        if (cause?.name === 'AbortError' || controller.signal.aborted) { const timeoutError = new Error('DeepSeek response body timed out'); timeoutError.name = 'AbortError'; throw timeoutError; }
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
    else if (!error?.category && !response) error.category = 'provider_transport_error';
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (input.schemaVersion === OFR_INPUT_SCHEMA && responseJson?.choices?.[0]?.finish_reason !== 'stop') {
    const error = new Error('DeepSeek response did not complete normally');
    error.category = responseJson?.choices?.[0]?.finish_reason === 'length' ? 'provider_output_truncated' : 'provider_completion_invalid';
    error.responseDiagnostics = responseDiagnostics(responseJson, response?.status || null);
    throw error;
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
      contract: {
        errorCount: validation.errors.length,
        visibleTextLength: validation.visibleTextLength,
        visibleTextSectionLengths: validation.visibleTextSectionLengths,
        errors: validation.errors.slice(0, 24),
        claims: validation.diagnostics || [],
        diagnosticsTruncated: (validation.diagnostics?.length || 0) > 24
      }
    };
    error.responseDiagnostics = safeProviderDiagnostics(error.responseDiagnostics, input, apiKey);
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


export function buildOfrEditorialSystemPrompt() {
  return `你是 GFRR 的宏观压力解释编辑。只根据输入证据输出中文严格 JSON。
标题、节目名称、视频介绍和发布时间不能代替正文结论或事件日期；不得把就业主题节目写成测得的劳动统计。同一新闻稿被不同网站转载不等于独立确认。只复述合格摘要确有支持的事实或具出处观点。
主读数是 OFR 官方发表的金融压力指数原值，可负可零；不是0–100风险评分、危机概率或仓位模型。当前/缓存/过期/缺失状态和实际观察日必须尊重。独立结构指标不是 OFR 的分解或加分。旧总分、模块分及旧分历史已退役，不能重新引入。不生成仓位、买卖、配置、执行、危机概率或确定性崩盘指令。
原值低于 OFR 校准历史均值与严格过去十年样本中的相对位置是不同基准；同一分句必须明确比较基准和方向，不把负值推成历史低位或宽松状态。任何标题、导语、压力解释、张力、数据限制或置信度说明都遵守该规则。contributionsPublished=false 仅是本站当前快照未纳入类别/地区贡献的限制；OFR 官方提供这些贡献，不得写“OFR未公布贡献分解”。
数字标签（OFR原值、实际观察日、周变化端点及百分位）由程序从已验证快照展示，不要在 pressureSynthesis 复述数字。正文解释关系和限制。其它具体数字、日期、币种和单位只能来自同段引用证据；不能根据同一个数字猜测含义。明确引语须逐字存在，不能将一般术语包装成别人原话。
可以写有依据的简版。目标为800–2400字，只是建议；不为满足栏目/来源数量凑字。保留6800字/64KiB上限、有效JSON和所有安全边界。只有真正有依据的栏目才写，空栏目用[]、无历史比较用null。每个事实对象都要1–12条合法sourceRefIds；headline/lead/dataGaps/confidence的事实引用用顶层sourceRefIds。全文必须实际引用至少一条 official/cross_checked 新闻，discovery_only 不能单独支撑事实。dataGaps至少一条，watchNext至少一条可观察条件和反证。
字段上限不是写作目标：headlineZh为1–90字，leadZh为1–900字；pressureSynthesis.assessmentZh及各栏目单个正文字段为1–1000字；每条dataGaps和confidence.reasonZh为1–800字。weeklyTimeline最多5条，keyTensions最多4条，contextAnalysis最多6条，crossMarketAnalysis最多5条，watchNext为1–5条，dataGaps为1–12条。空白字符串不合格，不能用未声明字段承接超长正文。
可选栏目若有依据才填充，严格使用以下对象字段，不猜测同义字段名：
keyTensions: [{"titleZh":"张力标题","detailZh":"两侧证据与限制","sourceRefIds":["..."]}]
crossMarketAnalysis: [{"assetZh":"市场名称","observationZh":"已知观察","implicationZh":"解释与限制","sourceRefIds":["..."]}]
historicalComparison: {"periodZh":"有证据的历史时期","similaritiesZh":"有依据的相似点","differencesZh":"有依据的差异点","sourceRefIds":["..."]}，无依据时为null。
只返回这些字段，不输出scoreSynthesis/moduleAnalysis或风险score数值标签；confidence.score是唯一编辑信心字段，使用0–100整数，不是风险读数或概率：
{"headlineZh":"标题","leadZh":"导语","sourceRefIds":["..."],"pressureSynthesis":{"assessmentZh":"只解释，不复述数字","sourceRefIds":["..."]},"weeklyTimeline":[{"date":"YYYY-MM-DD","titleZh":"...","detailZh":"...","sourceRefIds":["..."]}],"keyTensions":[],"contextAnalysis":[{"topic":"independent_context","labelZh":"独立结构观察","assessmentZh":"...","sourceRefIds":["..."]}],"crossMarketAnalysis":[],"historicalComparison":null,"watchNext":[{"conditionZh":"...","whyItMattersZh":"...","invalidationZh":"...","sourceRefIds":["..."]}],"dataGaps":["..."],"confidence":{"level":"low|medium|high","score":50,"reasonZh":"编辑信心，不是风险读数或概率"},"auditFlags":["read_only_editorial","source_attributed"],"boundaries":{"displayOnly":true,"commentaryOnly":true,"externalAiGenerated":true,"usesExternalAiApi":true,"notInvestmentAdvice":true,"affectsGfrrScoring":false,"affectsRiskModules":false,"affectsTailRiskOverlay":false,"affectsDecisionModel":false,"affectsExecutionLock":false,"affectsPositionGuidance":false,"affectsWorldOrder":false,"affectsOdp":false,"affectsBubbleWatch":false}}
sourceAttribution由程序从实际引用的既有来源生成；不编造来源，不把未知改为零。`;
}
