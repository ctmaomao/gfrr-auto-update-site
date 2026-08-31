import fs from 'node:fs';

import { EDITORIAL_TOPICS, assertValid, validateEditorialInput, validateEditorialOutput, validateEditorialReview, visibleEditorialText } from './macro-risk/editorial-contract.mjs';
import { buildEditorialInput } from './macro-risk/editorial-input.mjs';
import { assessEditorialNewsReadiness, buildNewsDiscovery } from './macro-risk/editorial-news.mjs';
import { EDITORIAL_PROVIDER_CONFIG, classifyProviderFailure, parseEditorialProviderContent, requestEditorial, validateEditorialPrompt } from './macro-risk/editorial-provider.mjs';
import { applyEditorialProjection, projectEditorial, reviewEditorial, validateEditorialProduction } from './macro-risk/editorial-production.mjs';
import { classifySearchRequestError } from './macro-risk/search-request-policy.mjs';
import { assertEditorialSafeTarget, buildEditorialWriteResult } from './write-macro-risk-editorial.mjs';

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function stripCredibleSourceRefs(value, credibleIds) {
  if (Array.isArray(value)) return value.map((item) => stripCredibleSourceRefs(item, credibleIds));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key !== 'sourceRefIds' || !Array.isArray(item)) return [key, stripCredibleSourceRefs(item, credibleIds)];
    const filtered = item.filter((refId) => !credibleIds.has(refId));
    return [key, filtered.length > 0 ? filtered : ['site:score']];
  }));
}

function replaceSourceRefIds(value, sourceRefIds) {
  if (Array.isArray(value)) return value.map((item) => replaceSourceRefIds(item, sourceRefIds));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === 'sourceRefIds' && Array.isArray(item)
      ? [...sourceRefIds]
      : replaceSourceRefIds(item, sourceRefIds)
  ]));
}

const rawStories = [
  ['tavily', 'central_bank_inflation', 'Federal Reserve publishes policy statement', 'https://federalreserve.gov/newsevents/pressreleases/monetary20260808a.htm'],
  ['brave', 'central_bank_inflation', 'Federal Reserve publishes policy statement', 'https://federalreserve.gov/newsevents/pressreleases/monetary20260808a.htm'],
  ['tavily', 'energy_geopolitics', 'EIA publishes latest weekly petroleum status', 'https://eia.gov/petroleum/supply/weekly/'],
  ['brave', 'energy_geopolitics', 'EIA publishes latest weekly petroleum status', 'https://eia.gov/petroleum/supply/weekly/'],
  ['tavily', 'credit_liquidity', 'Credit conditions remain under review', 'https://example-a.com/credit-review'],
  ['brave', 'credit_liquidity', 'Credit conditions remain under review', 'https://example-b.com/credit-review'],
  ['tavily', 'growth_employment_consumer', 'Employment data update released', 'https://bls.gov/news.release/empsit.htm'],
  ['tavily', 'global_china_europe', 'Global outlook data update', 'https://imf.org/en/Publications/WEO'],
  ['tavily', 'market_volatility_valuation', 'Market volatility and valuations remain in focus', 'https://example-c.com/markets']
].map(([provider, topic, title, url]) => ({ provider, topic, title, url, publishedAt: '2026-08-10T10:00:00Z', snippet: `${title} with bounded fixture context.` }));
const discovery = buildNewsDiscovery({
  rawStories,
  sourceStatus: { tavily: { status: 'ok' }, brave: { status: 'ok' } },
  generatedAt: '2026-08-11T06:00:00.000Z', windowStart: '2026-08-04', windowEnd: '2026-08-11'
});
assert(discovery.status === 'ok', `fixture news discovery should be ok, got ${discovery.status}`);

const governmentDomainDiscovery = buildNewsDiscovery({
  rawStories: [
    { provider: 'tavily', topic: 'credit_liquidity', title: 'New York City pension funds publish annual returns', url: 'https://comptroller.nyc.gov/reports/pension-fund-returns', publishedAt: '2026-08-13T02:00:00Z' },
    { provider: 'brave', topic: 'credit_liquidity', title: 'Macro government themed commentary', url: 'https://macro-gov.example.com/commentary', publishedAt: '2026-08-13T03:00:00Z' }
  ],
  sourceStatus: { tavily: { status: 'ok' }, brave: { status: 'ok' } },
  generatedAt: '2026-08-14T02:38:55.000Z', windowStart: '2026-08-07', windowEnd: '2026-08-14'
});
assert(governmentDomainDiscovery.stories.find((story) => story.domain === 'comptroller.nyc.gov')?.evidenceStatus === 'official', 'verified .gov subdomains must be classified as official');
assert(governmentDomainDiscovery.stories.find((story) => story.domain === 'macro-gov.example.com')?.evidenceStatus === 'discovery_only', 'non-government lookalike domains must not be classified as official');

const healthyNoCredibleDiscovery = buildNewsDiscovery({
  rawStories: [{ provider: 'tavily', topic: 'credit_liquidity', title: 'Credit conditions commentary', url: 'https://example.com/credit', publishedAt: '2026-08-13T02:00:00Z' }],
  sourceStatus: Object.fromEntries(['tavily', 'brave'].map((provider) => [provider, {
    status: 'ok', successCount: 6, failureCount: 0,
    queryRuns: EDITORIAL_TOPICS
      .map((topic) => ({ topic, status: 'ok', resultCount: provider === 'tavily' && topic === 'credit_liquidity' ? 1 : 0 }))
  }])),
  generatedAt: '2026-08-14T02:38:55.000Z', windowStart: '2026-08-07', windowEnd: '2026-08-14'
});
const healthyNoCredibleReadiness = assessEditorialNewsReadiness(healthyNoCredibleDiscovery);
assert(!healthyNoCredibleReadiness.editorialReady && healthyNoCredibleReadiness.expectedSkip && healthyNoCredibleReadiness.reason === 'no_credible_news', 'healthy search with zero credible news must be an expected pre-provider skip');
const degradedNoCredibleReadiness = assessEditorialNewsReadiness({ ...healthyNoCredibleDiscovery, sourceStatus: { ...healthyNoCredibleDiscovery.sourceStatus, brave: { status: 'error' } } });
assert(!degradedNoCredibleReadiness.expectedSkip && degradedNoCredibleReadiness.reason === 'news_source_health_incomplete', 'source-health failures must remain hard failures');

const searchStatusCases = new Map([
  [401, 'http_401_unauthorized'],
  [402, 'http_402_payment_required'],
  [403, 'http_403_forbidden'],
  [429, 'http_429_rate_limited'],
  [432, 'http_432_plan_limit'],
  [433, 'http_433_paygo_limit']
]);
for (const [httpStatus, expected] of searchStatusCases) {
  assert(classifySearchRequestError(Object.assign(new Error(`HTTP ${httpStatus}`), { httpStatus })) === expected, `search HTTP ${httpStatus} diagnostics must remain explicit and sanitized`);
}
const abortError = new Error('aborted'); abortError.name = 'AbortError';
assert(classifySearchRequestError(Object.assign(new Error('HTTP 503'), { httpStatus: 503 })) === 'http_5xx_server_error', 'search provider 5xx diagnostics must remain categorized');
assert(classifySearchRequestError(abortError) === 'request_timeout', 'search provider aborts must remain categorized');
assert(classifySearchRequestError(new TypeError('fetch failed')) === 'network_error', 'search provider transport failures must remain categorized');
assert(classifySearchRequestError(new SyntaxError('invalid JSON')) === 'invalid_json', 'search provider JSON failures must remain categorized');

const radarData = readJson('data/radar-data.json');
const input = buildEditorialInput({
  radarData,
  worldOrder: readJson('data/world-order-stress.json'),
  marketPricing: readJson('data/market-pricing-metrics.json'),
  radarHistory: readJson('data/radar-history.json'),
  oilDirectional: readJson('data/oil-directional-pressure.json'),
  oilNews: readJson('data/oil-news-event-watch.json'),
  discovery,
  generatedAt: '2026-08-11T06:01:00.000Z'
});
assertValid(validateEditorialInput(input), 'macro editorial input');
assert(input.structuredFacts.length >= 30 && Buffer.byteLength(JSON.stringify(input)) < 65_536, 'input must remain dense and compact');

const ref = (id) => input.sourceRefs.some((item) => item.id === id) ? id : (() => { throw new Error(`missing fixture ref ${id}`); })();
const credibleNews = discovery.stories.filter((story) => ['official', 'cross_checked'].includes(story.evidenceStatus));
const prose = {
  score: '综合分数处在中等偏低区间，但能源、地缘政治与通胀三个模块仍高于流动性、债务和银行模块。分数较七日前回落，说明广泛金融压力尚未同步扩张；然而能源价格、长端利率和美元同时偏高，使风险缓和仍带有明显条件。这里描述的是当下压力结构，不是未来危机概率。',
  tension: '风险资产定价保持韧性，而实际利率与名义长端收益率仍处高位，构成融资成本和估值之间的观察性背离。若信用利差与波动率继续平稳，这一背离可能以利率回落消化；若两者同步扩张，则需要重新评估压力是否从宏观价格传入金融条件。',
  module: '该模块的既有规则分数反映当前可观察压力。近 7 日新闻只提供背景校验，不能覆盖站内结构化数据，也不改变模块权重。需要同时观察同链条市场变量、数据新鲜度及反向证据，避免把单一事件解释为确定性趋势。'
};
const output = {
  schemaVersion: 'macro-risk-editorial-output-v1', generatedAt: '2026-08-11T06:02:00.000Z', sourceDataUpdatedAt: input.sourceDataUpdatedAt,
  provider: 'deepseek', model: EDITORIAL_PROVIDER_CONFIG.model, mode: 'external_ai_macro_risk_editorial',
  headlineZh: '风险缓和仍有条件：能源与利率链条尚未完成降温',
  leadZh: `${prose.score}${prose.tension}`,
  weeklyTimeline: credibleNews.slice(0, 3).map((story, index) => ({ date: '2026-08-10', titleZh: ['政策信号进入再定价窗口', '能源物理链继续提供背景确认', '信用条件尚未转向广泛紧缩'][index], detailZh: `${story.title}。这一信息仅作为近 7 日背景，并与站内分数、市场价格或官方物理数据交叉使用，不据此推导确定性事件路径。`, sourceRefIds: [story.id, ref(index === 1 ? 'site:context:odp' : index === 2 ? 'site:macro:credit' : 'site:macro:policy')] })),
  scoreSynthesis: { assessmentZh: prose.score, sourceRefIds: [ref('site:score'), ref('site:daily:conclusion'), ref('site:context:history'), ref('site:daily:risk-chain')] },
  keyTensions: [
    { titleZh: '利率压力与风险资产韧性', detailZh: prose.tension, sourceRefIds: [ref('site:market:us10y'), ref('site:market:real10y'), ref('site:market:spx'), ref('site:context:market-pricing')] },
    { titleZh: '能源偏紧与信用平稳并存', detailZh: '油价、运输与物理库存证据继续支持能源链条观察，但 HY OAS 与 VIX 暂未给出广泛金融压力确认。这意味着风险仍集中在能源到通胀再到利率的传导路径，是否扩散到信用是下一步区分局部压力和系统性压力的关键。', sourceRefIds: [ref('site:market:brent'), ref('site:macro:freight'), ref('site:context:odp'), ref('site:market:hyOas'), ref('site:market:vix')] }
  ],
  moduleAnalysis: input.moduleSnapshot.map((item) => ({ module: item.module, labelZh: item.labelZh, score: item.score, assessmentZh: `${item.labelZh}为 ${item.score}/100。${prose.module}`, sourceRefIds: [ref(`site:module:${item.module}`), ref(item.module === 'energy' ? 'site:context:odp' : item.module === 'geopolitical' ? 'site:context:world-order' : item.module === 'inflation' ? 'site:market:breakeven10y' : item.module === 'liquidity' ? 'site:macro:liquidity' : item.module === 'debt' ? 'site:market:us10y' : 'site:macro:credit')] })),
  crossMarketAnalysis: [
    { assetZh: '原油与通胀预期', observationZh: '布伦特处在较高水平，而盈亏平衡通胀仍需与实际利率合并观察。', implicationZh: '能源向通胀和利率的传导仍是当前主链，但单日价格不能确认持续性。', sourceRefIds: [ref('site:market:brent'), ref('site:market:breakeven10y'), ref('site:context:odp')] },
    { assetZh: '美元、长端利率与黄金', observationZh: '美元与长端收益率偏高，黄金价格也处高位，反映避险、实际利率与货币条件之间并非单向关系。', implicationZh: '需观察美元和实际利率是否共同回落，或黄金继续独立走强。', sourceRefIds: [ref('site:market:dxy'), ref('site:market:us10y'), ref('site:market:real10y'), ref('site:market:gold')] },
    { assetZh: '股票、波动率与信用', observationZh: '股指与科技定价代理保持韧性，同时 VIX 和 HY OAS 尚未显著扩张。', implicationZh: '金融市场暂未全面确认宏观压力升级，但高估值环境降低了对新冲击的缓冲。', sourceRefIds: [ref('site:market:spx'), ref('site:market:vix'), ref('site:market:hyOas'), ref('site:context:market-pricing')] }
  ],
  historicalComparison: { periodZh: '最近 14 个日度样本', similaritiesZh: '当前分数仍落在近期运行区间内，压力主要由能源、通胀和地缘背景贡献，信用与银行模块相对克制。', differencesZh: '与分数更高的近期日期相比，当前广泛金融压力有所回落；这一比较只描述同步状态，不代表提前预警、危机概率或发生时间。', sourceRefIds: [ref('site:context:history'), ref('site:score'), ref('site:module:energy'), ref('site:module:banking')] },
  watchNext: [
    { conditionZh: '布伦特与运价继续上行并得到物理链确认', whyItMattersZh: '这会强化能源向通胀和长端利率传导的当前压力判断。', invalidationZh: '油价回落、库存修复且期限结构转松。', sourceRefIds: [ref('site:market:brent'), ref('site:macro:freight'), ref('site:context:odp')] },
    { conditionZh: '美国 10 年期收益率、实际利率和美元同步维持高位', whyItMattersZh: '同步高位会延长金融条件偏紧的时间窗口。', invalidationZh: '三者出现有持续性的共同回落。', sourceRefIds: [ref('site:market:us10y'), ref('site:market:real10y'), ref('site:market:dxy')] },
    { conditionZh: 'HY OAS 或 VIX 从平稳状态明显扩张', whyItMattersZh: '信用与波动率是宏观压力是否扩散到金融市场的交叉确认。', invalidationZh: '利差和波动率保持受控，同时综合分数继续回落。', sourceRefIds: [ref('site:market:hyOas'), ref('site:market:vix'), ref('site:macro:credit')] }
  ],
  dataGaps: ['新闻搜索只能提供标题与摘要级上下文，不能替代原始统计发布或完整报道。', '历史分数是同期压力轨迹，不具备已验证的六个月提前预警能力。'],
  sourceAttribution: [],
  confidence: { level: 'medium', score: 78, reasonZh: '站内数据覆盖完整，且有多条官方或交叉确认的近 7 日新闻；但市场背离和新闻摘要边界限制了结论强度。' },
  auditFlags: ['current_pressure_not_forecast', 'read_only_editorial', 'source_attributed'],
  boundaries: { displayOnly: true, commentaryOnly: true, externalAiGenerated: true, usesExternalAiApi: true, notInvestmentAdvice: true, affectsGfrrScoring: false, affectsRiskModules: false, affectsTailRiskOverlay: false, affectsDecisionModel: false, affectsExecutionLock: false, affectsPositionGuidance: false, affectsWorldOrder: false, affectsOdp: false, affectsBubbleWatch: false }
};

let apiCalls = 0;
let capturedRequest;
const result = await requestEditorial({
  input,
  apiKey: 'fixture-secret-not-serialized',
  fetchImpl: async (url, request) => {
    apiCalls += 1;
    capturedRequest = { url, request };
    return { ok: true, status: 200, async json() { return { model: EDITORIAL_PROVIDER_CONFIG.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 900, completion_tokens: 1800 } }; } };
  },
  now: () => new Date('2026-08-11T06:02:00.000Z')
});
const outputResult = assertValid(validateEditorialOutput(result.output, input), 'macro editorial output');
assert(outputResult.visibleTextLength >= 2000 && outputResult.visibleTextLength <= 6800, 'fixture output length drifted');
assert(validateEditorialPrompt(input).ok, 'prompt contract must pass');
assert(apiCalls === 1 && result.diagnostics.retryCount === 0, 'provider path must use one call and no retry');
const body = JSON.parse(capturedRequest.request.body);
assert(body.max_tokens === 8000 && body.response_format.type === 'json_object' && body.thinking.type === 'disabled', 'DeepSeek request bounds drifted');
const providerSystemPrompt = body.messages.find((message) => message.role === 'system')?.content || '';
const providerUserPrompt = body.messages.find((message) => message.role === 'user')?.content || '';
const discoveryOnlyStory = discovery.stories.find((story) => story.evidenceStatus === 'discovery_only');
assert(discoveryOnlyStory, 'fixture must include a discovery_only story');
assert(providerSystemPrompt.includes('可见正文预算') && providerSystemPrompt.includes('不计 sourceRefIds') && providerSystemPrompt.includes('weeklyTimeline 恰好 3') && providerSystemPrompt.includes('不超过 6,200'), 'provider system prompt must budget actual frontend prose with a safe global buffer');
assert(providerUserPrompt.includes('长度自检') && providerUserPrompt.includes('3/2/3/3') && providerUserPrompt.includes('不得依赖 adapter/writer 修正'), 'provider user prompt must require section-budget self-review without downstream rewriting');
assert(providerUserPrompt.includes('逐项引用自检') && providerUserPrompt.includes(discoveryOnlyStory.id) && providerUserPrompt.includes('site:score'), 'provider prompt must expose claim-level discovery-only grounding guard and valid independent source IDs');
assert(credibleNews.every((story) => providerUserPrompt.includes(story.id)) && providerUserPrompt.includes('必须至少引用其中 1 条') && providerUserPrompt.includes('weeklyTimeline 至少一个对象'), 'provider prompt must enumerate credible news IDs and require an actual factual-object citation');
assert(!JSON.stringify(result).includes('fixture-secret-not-serialized'), 'provider result leaked API key');
assert(JSON.stringify(parseEditorialProviderContent(`\`\`\`json\n${JSON.stringify(result.output)}\n\`\`\``)) === JSON.stringify(result.output), 'fenced JSON parser failed');

const review = reviewEditorial({ input, output: result.output, generatedAt: '2026-08-11T06:03:00.000Z' });
assertValid(validateEditorialReview(review), 'macro editorial review');
assert(['pass', 'warn'].includes(review.status), `fixture review must be display eligible, got ${review.status}: ${review.blockers.join('; ')}`);
const credibleIds = new Set(credibleNews.map((story) => story.id));
const noCredibleCitationReview = reviewEditorial({ input, output: stripCredibleSourceRefs(result.output, credibleIds), generatedAt: '2026-08-11T06:03:30.000Z' });
assert(noCredibleCitationReview.status === 'fail' && noCredibleCitationReview.blockers.includes('至少需要引用 1 条 official 或 cross_checked 新闻'), 'output that ignores every enumerated credible news ID must remain fail closed');
const layer = projectEditorial({ input, output: result.output, review, generatedAt: '2026-08-11T06:04:00.000Z', sourceCommit: '0123456789012345678901234567890123456789', runId: '123' });
assertValid(validateEditorialProduction(layer, radarData, new Date('2026-08-11T06:05:00.000Z')), 'macro editorial production');
assert(layer.sourceLedger.every((source) => !Object.hasOwn(source, 'snippet')), 'production ledger must remove news snippets');
const projection = { schemaVersion: 'macro-risk-editorial-production-projection-v1', target: 'data/radar-data.json.macroRiskEditorialLayer', macroRiskEditorialLayer: layer };
const next = buildEditorialWriteResult(radarData, projection, new Date('2026-08-11T06:05:00.000Z'));
const beforeWithoutLayer = structuredClone(radarData); delete beforeWithoutLayer.macroRiskEditorialLayer;
const afterWithoutLayer = structuredClone(next); delete afterWithoutLayer.macroRiskEditorialLayer;
assert(JSON.stringify(beforeWithoutLayer) === JSON.stringify(afterWithoutLayer), 'writer changed data outside macroRiskEditorialLayer');
assert(JSON.stringify(applyEditorialProjection(radarData, layer, new Date('2026-08-11T06:05:00.000Z'))) === JSON.stringify(next), 'pure writer paths disagree');

const scoreMutation = structuredClone(result.output); scoreMutation.boundaries.affectsGfrrScoring = true;
assert(!validateEditorialOutput(scoreMutation, input).ok, 'score mutation negative test must fail');
const unsafe = structuredClone(result.output); unsafe.watchNext[0].conditionZh = '建议买入并加仓';
assert(!validateEditorialOutput(unsafe, input).ok, 'unsafe wording negative test must fail');
const unsupportedDiscoveryClaim = structuredClone(result.output);
unsupportedDiscoveryClaim.weeklyTimeline[1].sourceRefIds = [discoveryOnlyStory.id];
const unsupportedDiscoveryResult = validateEditorialOutput(unsupportedDiscoveryClaim, input);
assert(!unsupportedDiscoveryResult.ok && unsupportedDiscoveryResult.errors.some((error) => error.includes('relies only on discovery_only news')), 'discovery-only factual claim negative test must fail closed');
const citationIds = result.output.sourceAttribution.map((item) => item.sourceRefId).slice(0, 12);
const citationRichOutput = replaceSourceRefIds(structuredClone(result.output), citationIds);
const citationRichResult = validateEditorialOutput(citationRichOutput, input);
assert(citationIds.length >= 2 && citationRichResult.ok, `machine citation metadata must not invalidate otherwise bounded visible prose: ${citationRichResult.errors.join('; ')}`);
assert(citationRichResult.visibleTextLength === outputResult.visibleTextLength && visibleEditorialText(citationRichOutput) === visibleEditorialText(result.output), 'sourceRefIds must not be counted as visible editorial prose');
const oversizedVisibleProse = structuredClone(result.output);
oversizedVisibleProse.moduleAnalysis[0].assessmentZh = '长'.repeat(6801);
const oversizedVisibleResult = validateEditorialOutput(oversizedVisibleProse, input);
assert(!oversizedVisibleResult.ok && oversizedVisibleResult.errors.some((error) => error.includes('visible editorial text')), 'genuinely oversized visible prose must remain fail closed');
assert(oversizedVisibleResult.visibleTextSectionLengths.modules > 6800, 'oversized visible prose diagnostics must identify the responsible section without storing provider text');
const stale = validateEditorialProduction(layer, radarData, new Date('2026-08-13T06:05:00.000Z'));
assert(!stale.ok && stale.errors.some((error) => error.includes('stale')), 'stale layer negative test must fail');
let unsafeTarget = false; try { assertEditorialSafeTarget('data/bubble-watch.json'); } catch { unsafeTarget = true; }
assert(unsafeTarget, 'unsafe writer target negative test must fail');
const truncated = new Error('truncated'); truncated.category = 'provider_output_contract_invalid'; truncated.responseDiagnostics = { finishReason: 'length' };
assert(classifyProviderFailure(truncated).category === 'provider_output_truncated', 'truncation classification failed');

console.log(`Macro risk editorial core PASS (facts=${input.structuredFacts.length}, sources=${input.sourceRefs.length}, visibleChars=${outputResult.visibleTextLength}, review=${review.status}, apiCalls=${apiCalls}, readinessTests=4, searchDiagnosticsTests=${searchStatusCases.size + 4}, metadataRegressionTests=1, negativeTests=8)`);
