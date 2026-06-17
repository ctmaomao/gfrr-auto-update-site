// check-bubble-watch.mjs — AI 泡沫监测(Bubble Watch)契约检查
//
// leaf 检查:
//   1. contract   — data/bubble-watch.json schema + 指标完整性 + 计数/打分一致
//   2. scoring    — red_pct 分档 + 分类强制升级规则 replay,verdict 必须可复算
//   3. freshness  — as_of_date 不得超过 35 天(周更 + 缓冲)
//   4. provenance — curated/auto_fallback 必带 asOfDate;stale 标记与 maxAgeDays 一致
//   5. boundary   — display-only:主站 app.js / index.html 不读本数据;build 不碰
//                   radar-data / realtime;双页书签组件两侧都在
//   6. history    — 历史文件与 latest 对齐,history_seed 尾点一致

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const failures = [];
function check(group, cond, message) {
  if (!cond) failures.push(`[${group}] ${message}`);
}

const EXPECTED_IDS = [
  'cape', 'top5_weight', 'nvda_fpe',
  'hyperscaler_capex_yoy', 'mag4_fcf_yoy', 'vc_ai_share', 'nvda_invest_revenue',
  'breadth_50d', 'spy_vs_rsp_6m', 'insider_sell_buy', 'ai_ipo_pipeline',
  'hy_oas', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'token_revenue_ratio', 'arr_2nd_deriv', 'enterprise_deploy', 'cloud_rpo_growth',
  'accounting_events', 'fed_policy', 'capex_reaction', 'ceo_hedging'
];
const CURATED_ORIGIN_IDS = [
  'vc_ai_share', 'ai_ipo_pipeline', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'token_revenue_ratio', 'arr_2nd_deriv', 'enterprise_deploy',
  'accounting_events', 'capex_reaction', 'ceo_hedging'
];
const HYBRID_LIVE_IDS = [
  'vc_ai_share',
  'ai_ipo_pipeline',
  'debt_capex_ratio',
  'neocloud_credit',
  'token_volume_mom',
  'token_revenue_ratio',
  'arr_2nd_deriv',
  'enterprise_deploy',
  'accounting_events',
  'capex_reaction',
  'ceo_hedging'
];
const HYBRID_PAID_OPTIONAL_IDS = [
  'dc_abs_spread'
];
const CATEGORIES = ['valuation', 'capital', 'market_structure', 'credit', 'fundamentals', 'macro'];
const STATUSES = ['red', 'yellow', 'green'];
const TECHNICAL_HEAT_IDS = [
  'relative_momentum_21d',
  'rsi_14d',
  'bollinger_pct_b',
  'sma_200_deviation',
  'correlation_beta_60d'
];
const TIER_LABEL_ZH = { observation: '观察期', caution: '中度警戒', alert: '高风险预警', top: '系统性顶部' };
const TIER_LABEL_EN = { observation: 'Observation', caution: 'Moderate Caution', alert: 'High Risk Alert', top: 'Systemic Top' };
const NARRATIVE_ENGINE_VERSION = 'bubble-watch-narrative-v1';

const data = JSON.parse(read('data/bubble-watch.json'));
const history = JSON.parse(read('data/bubble-watch-history.json'));
const pageHtml = read('bubble-watch.html');
const indexHtml = read('index.html');
const appJs = read('scripts/app.js');
const buildSrc = read('scripts/build-bubble-watch.mjs');
const sourceCandidates = JSON.parse(read('config/bubble-watch-source-candidates.json'));

// ---- 1. contract ----
check('contract', data.contractVersion === 'bubble-watch-v1', `contractVersion 异常: ${data.contractVersion}`);
check('contract', Number.isInteger(data.issue_number) && data.issue_number > 0, `issue_number 异常: ${data.issue_number}`);
check('contract', /^\d{4}-\d{2}-\d{2}$/u.test(data.as_of_date || ''), `as_of_date 异常: ${data.as_of_date}`);
check('contract', Array.isArray(data.indicators) && data.indicators.length === EXPECTED_IDS.length,
  `indicators 长度 ${data.indicators?.length} ≠ ${EXPECTED_IDS.length}`);

const ids = new Set();
for (const ind of data.indicators || []) {
  ids.add(ind.id);
  check('contract', CATEGORIES.includes(ind.category), `${ind.id} category 非法: ${ind.category}`);
  check('contract', STATUSES.includes(ind.status), `${ind.id} status 非法: ${ind.status}`);
  for (const field of ['name_en', 'name_zh', 'value_display', 'note', 'threshold_text', 'source_name']) {
    check('contract', typeof ind[field] === 'string' && ind[field].length > 0, `${ind.id} 缺 ${field}`);
  }
  check('contract', typeof ind.stale === 'boolean', `${ind.id} stale 非 boolean`);
  check('contract', ['auto', 'curated', 'auto_fallback'].includes(ind.provenance?.mode), `${ind.id} provenance.mode 非法`);
}
check('contract', EXPECTED_IDS.every((id) => ids.has(id)) && ids.size === EXPECTED_IDS.length,
  `指标 id 集不等于预登记 ${EXPECTED_IDS.length} 项 (got ${ids.size})`);

const s = data.summary || {};
const red = (data.indicators || []).filter((i) => i.status === 'red').length;
const yellow = (data.indicators || []).filter((i) => i.status === 'yellow').length;
const green = (data.indicators || []).filter((i) => i.status === 'green').length;
check('contract', s.total_indicators === EXPECTED_IDS.length, `summary.total_indicators ${s.total_indicators}`);
check('contract', s.red_count === red && s.yellow_count === yellow && s.green_count === green,
  `summary 计数 ${s.red_count}/${s.yellow_count}/${s.green_count} ≠ 实算 ${red}/${yellow}/${green}`);
check('contract', s.primary_score_pct === s.red_pct, `primary_score_pct ${s.primary_score_pct} 必须等于 red_pct ${s.red_pct}`);
check('contract', s.primary_score_basis === 'red_light_ratio', `primary_score_basis 异常: ${s.primary_score_basis}`);
check('contract', Math.abs(s.red_pct - (red / EXPECTED_IDS.length) * 100) < 0.06, `red_pct ${s.red_pct} 复算不符`);
check('contract', Math.abs(s.weighted_risk_score - ((red + 0.5 * yellow) / EXPECTED_IDS.length) * 100) < 0.06, `weighted_risk_score ${s.weighted_risk_score} 复算不符`);
const verdictDescBytes = Buffer.byteLength(String(s.verdict_desc || ''), 'utf8');
check('contract', typeof s.verdict_desc === 'string' && s.verdict_desc.length >= 650, 'verdict_desc 过短/缺失研究员式判读');
check('contract', verdictDescBytes >= 900 && verdictDescBytes <= 2600, `verdict_desc 字节数 ${verdictDescBytes} 不在 900-2600 预算内`);
check('contract', !String(s.verdict_desc || '').includes('加权风险分'), 'verdict_desc 不得把加权辅助压力写成主风险分');
check('contract', s.verdict_desc_source === NARRATIVE_ENGINE_VERSION, `verdict_desc_source 异常: ${s.verdict_desc_source}`);
check('contract', s.narrative_plan?.version === NARRATIVE_ENGINE_VERSION, 'summary.narrative_plan.version 缺失/异常');
check('contract', s.narrative_plan?.sourceMode === 'local_indicator_evidence_pack', 'summary.narrative_plan.sourceMode 必须为 local_indicator_evidence_pack');
check('contract', s.narrative_plan?.upstreamVerdictPolicy === 'calibration_only_never_copied', 'summary.narrative_plan 上游正文策略异常');
check('contract', Array.isArray(s.narrative_plan?.sections) && s.narrative_plan.sections.length >= 5, 'summary.narrative_plan.sections 不足');
check('contract', Array.isArray(s.narrative_plan?.evidenceHighlights) && s.narrative_plan.evidenceHighlights.length >= 8, 'summary.narrative_plan.evidenceHighlights 不足');
for (const section of s.narrative_plan?.sections || []) {
  check('contract', typeof section.key === 'string' && section.key.length > 0, 'narrative_plan section 缺 key');
  check('contract', typeof section.summaryZh === 'string' && section.summaryZh.length >= 40, `narrative_plan.${section.key || '?'} summaryZh 过短`);
  check('contract', Array.isArray(section.sourceIndicators), `narrative_plan.${section.key || '?'} sourceIndicators 非数组`);
}

const technicalHeat = data.market_technical_heat || {};
check('contract', technicalHeat.contractVersion === 'bubble-watch-market-technical-heat-v1', 'market_technical_heat contractVersion 缺失/异常');
check('contract', String(technicalHeat.boundary || '').includes('display-only') && String(technicalHeat.boundary || '').includes('excluded from 24-indicator'),
  'market_technical_heat 必须声明 display-only 且排除 24 项主分');
check('contract', ['red', 'yellow', 'green', 'unavailable'].includes(technicalHeat.status), `market_technical_heat.status 非法:${technicalHeat.status}`);
check('contract', typeof technicalHeat.summary === 'string' && technicalHeat.summary.length >= 40, 'market_technical_heat.summary 缺失/过短');
check('contract', Array.isArray(technicalHeat.source_priority) && technicalHeat.source_priority.length >= 3, 'market_technical_heat.source_priority 不足');
check('contract', technicalHeat.source_priority?.some((s) => /Yahoo Chart/iu.test(s.name || '')), 'market_technical_heat 缺 Yahoo Chart 主源声明');
check('contract', technicalHeat.source_priority?.some((s) => /public-apis/iu.test(s.name || s.url || '')), 'market_technical_heat 缺 public-apis 候选源声明');
check('contract', technicalHeat.source_priority?.some((s) => /Wind/iu.test(s.name || 'paid final fallback only')), 'market_technical_heat 缺 Wind paid final fallback 边界声明');
if (technicalHeat.status !== 'unavailable') {
  const heatItems = technicalHeat.items || [];
  check('contract', Array.isArray(heatItems) && heatItems.length === TECHNICAL_HEAT_IDS.length,
    `market_technical_heat.items 长度 ${heatItems.length} ≠ ${TECHNICAL_HEAT_IDS.length}`);
  const heatIds = new Set(heatItems.map((item) => item.id));
  check('contract', TECHNICAL_HEAT_IDS.every((id) => heatIds.has(id)) && heatIds.size === TECHNICAL_HEAT_IDS.length,
    'market_technical_heat.items id 集异常');
  const heatRed = heatItems.filter((item) => item.status === 'red').length;
  const heatYellow = heatItems.filter((item) => item.status === 'yellow').length;
  const heatGreen = heatItems.filter((item) => item.status === 'green').length;
  check('contract', technicalHeat.counts?.red === heatRed && technicalHeat.counts?.yellow === heatYellow && technicalHeat.counts?.green === heatGreen,
    'market_technical_heat counts 与 items 不符');
  check('contract', Math.abs(technicalHeat.heat_score - ((heatRed + 0.5 * heatYellow) / heatItems.length) * 100) < 0.06,
    'market_technical_heat.heat_score 复算不符');
  for (const item of heatItems) {
    check('contract', STATUSES.includes(item.status), `${item.id} technical heat status 非法:${item.status}`);
    for (const field of ['name_en', 'name_zh', 'value_display', 'note', 'threshold_text', 'source_name']) {
      check('contract', typeof item[field] === 'string' && item[field].length > 0, `${item.id} 缺 ${field}`);
    }
    check('contract', /Yahoo Chart/iu.test(item.source_name), `${item.id} source_name 应标 Yahoo Chart`);
  }
} else {
  check('contract', Array.isArray(technicalHeat.items) && technicalHeat.items.length === 0, 'market_technical_heat unavailable 时 items 应为空');
}

const meta = data.meta || {};
check('contract', (meta.auto_count || 0) + (meta.curated_count || 0) + (meta.fallback_count || 0) === EXPECTED_IDS.length,
  `meta 计数和 ≠ ${EXPECTED_IDS.length}`);
check('contract', meta.upstream_sync?.checked === true, 'meta.upstream_sync 缺失(build 须每轮检查上游周报)');
check('contract', meta.upstream_sync?.summaryAdopted === false, '不得直接采纳上游 summary.verdict_desc 作为生产正文');
check('contract', meta.upstream_sync?.summaryUsage === 'not_used_for_production_narrative', 'meta.upstream_sync.summaryUsage 异常');
check('contract', buildSrc.includes('UPSTREAM_LATEST_URLS') && buildSrc.includes('UPSTREAM_SNAPSHOT_INDEX_URLS'), 'build 须保留上游 latest + snapshots 双层同步入口');
check('contract', buildSrc.includes('crystal-xiaoxiao.github.io/ai-bubble-monitor/data/latest.json'), 'build 须保留上游 GitHub Pages latest 兜底入口');
check('contract', buildSrc.includes('contents/docs/data/snapshots?ref=main'), 'build 须保留 GitHub API snapshots 兜底入口');
check('contract', sourceCandidates.contractVersion === 'bubble-watch-source-candidates-v1', `source candidates contractVersion 异常: ${sourceCandidates.contractVersion}`);
const candidateEntries = sourceCandidates.indicators || {};
check('contract', CURATED_ORIGIN_IDS.every((id) => candidateEntries[id]) && Object.keys(candidateEntries).length === CURATED_ORIGIN_IDS.length,
  `source candidates 必须覆盖 ${CURATED_ORIGIN_IDS.length} 个 curated-origin 指标(got ${Object.keys(candidateEntries).length})`);
for (const id of CURATED_ORIGIN_IDS) {
  const entry = candidateEntries[id] || {};
  check('contract', ['hybrid_live', 'hybrid_paid_optional', 'candidate_only'].includes(entry.automationStatus), `${id} automationStatus 非法: ${entry.automationStatus}`);
  check('contract', typeof entry.primarySignal === 'string' && entry.primarySignal.length >= 10, `${id} 缺 primarySignal`);
  check('contract', Array.isArray(entry.freeSourceCandidates) && entry.freeSourceCandidates.length >= 1, `${id} 缺 freeSourceCandidates`);
}
for (const id of HYBRID_LIVE_IDS) {
  check('contract', candidateEntries[id]?.automationStatus === 'hybrid_live', `${id} 必须保持 hybrid_live`);
}
for (const id of HYBRID_PAID_OPTIONAL_IDS) {
  check('contract', candidateEntries[id]?.automationStatus === 'hybrid_paid_optional', `${id} 必须保持 hybrid_paid_optional`);
  check('contract', Array.isArray(candidateEntries[id]?.paidSourceCandidates) && candidateEntries[id].paidSourceCandidates.length >= 1, `${id} 缺 paidSourceCandidates`);
}
check('contract', buildSrc.includes('SOURCE_CANDIDATES_PATH') && buildSrc.includes('hybridCuratedBuilders'), 'build 须读取 source-candidates 并保留 hybrid curated builders');
for (const id of [...HYBRID_LIVE_IDS, ...HYBRID_PAID_OPTIONAL_IDS]) {
  check('contract', buildSrc.includes(`${id}:`), `build 缺 ${id} hybrid builder 绑定`);
}
check('contract', candidateEntries.ceo_hedging?.freeSourceCandidates?.some((source) => /Tavily/iu.test(source.source || '')),
  'ceo_hedging source candidates 缺 Tavily 免费新闻兜底');
check('contract', buildSrc.includes('fetchCeoHedgingFromTavilyPublic') && buildSrc.includes('TAVILY_API_KEYS'),
  'ceo_hedging build path 必须保留 Tavily 免费新闻兜底');
check('contract', candidateEntries.ceo_hedging?.freeSourceCandidates?.some((source) => /Brave/iu.test(source.source || '')),
  'ceo_hedging source candidates 缺 Brave 免费新闻交叉确认');
check('contract', buildSrc.includes('fetchCeoHedgingFromBraveNews') && buildSrc.includes('BRAVE_API_KEYS'),
  'ceo_hedging build path 必须保留 Brave 免费新闻交叉确认');
check('contract', buildSrc.includes('fetchGdeltDocCeoHedgingArticles') && buildSrc.includes('gdeltRetryDelayMs') && buildSrc.includes('Retry-After'),
  'ceo_hedging GDELT public search 必须保留有界退避重试');
check('contract', buildSrc.includes('mergeCeoHedgingNewsConfirmations') && buildSrc.includes('Brave News Search API'),
  'ceo_hedging 必须保留 Tavily/Brave 交叉确认路径');
check('contract', buildSrc.includes('capSingleSourceCeoHedgingRed') && buildSrc.includes('redRequiresTwoIndependentNewsSources'),
  'ceo_hedging 必须保留单源红灯封顶规则');

// ---- 2. scoring replay ----
function tierFromPct(p) {
  if (p >= 60) return 'top';
  if (p >= 40) return 'alert';
  if (p >= 25) return 'caution';
  return 'observation';
}
const baseTier = tierFromPct(s.red_pct);
const resonant = CATEGORIES.filter((cat) => {
  const items = (data.indicators || []).filter((i) => i.category === cat);
  if (!items.length) return false;
  return items.filter((i) => i.status === 'red').length / items.length >= 0.5;
});
const tierRank = { observation: 0, caution: 1, alert: 2, top: 3 };
let effTier = baseTier;
if (resonant.length >= 2 && tierRank[effTier] < tierRank.alert) effTier = 'alert';
check('scoring', s.verdict_label === TIER_LABEL_ZH[effTier], `verdict_label「${s.verdict_label}」≠ replay「${TIER_LABEL_ZH[effTier]}」`);
check('scoring', s.verdict_label_en === TIER_LABEL_EN[effTier], `verdict_label_en「${s.verdict_label_en}」≠ replay`);
check('scoring', data.scoring?.base_tier === baseTier, `scoring.base_tier ${data.scoring?.base_tier} ≠ replay ${baseTier}`);
check('scoring', data.scoring?.effective_tier === effTier, `scoring.effective_tier ${data.scoring?.effective_tier} ≠ replay ${effTier}`);
check('scoring', data.scoring?.override_active === (effTier !== baseTier), 'scoring.override_active 与 replay 不符');

// ---- 3. freshness ----
const ageDays = Math.round((Date.now() - new Date(`${data.as_of_date}T00:00:00Z`).getTime()) / 86400000);
check('freshness', ageDays <= 35, `as_of_date ${data.as_of_date} 已 ${ageDays} 天(>35);请触发 Refresh Bubble Watch workflow`);
check('freshness', ageDays >= -1, `as_of_date ${data.as_of_date} 在未来`);

// ---- 4. provenance / stale 一致性 ----
for (const ind of data.indicators || []) {
  const p = ind.provenance || {};
  if (p.mode === 'auto') {
    check('provenance', ind.stale === false, `${ind.id} auto 模式不应 stale`);
  } else {
    check('provenance', /^\d{4}-\d{2}-\d{2}$/u.test(p.asOfDate || ''), `${ind.id} ${p.mode} 缺 asOfDate`);
    check('provenance', Number.isFinite(p.maxAgeDays), `${ind.id} 缺 maxAgeDays`);
    if (p.asOfDate && Number.isFinite(p.maxAgeDays)) {
      const age = Math.round((new Date(`${data.as_of_date}T00:00:00Z`) - new Date(`${p.asOfDate}T00:00:00Z`)) / 86400000);
      check('provenance', ind.stale === (age > p.maxAgeDays), `${ind.id} stale=${ind.stale} 与 age ${age}/max ${p.maxAgeDays} 不符`);
    }
  }
}

// ---- 5. boundary(display-only + 双页书签)----
// 注意:asset version token(如 bubble-watch-tab-1)允许出现在 app.js;禁的是读专题数据文件
check('boundary', !appJs.includes('bubble-watch.json'), '主站 scripts/app.js 不得读取 bubble-watch.json');
check('boundary', !indexHtml.includes('bubble-watch.json'), 'index.html 不得 fetch bubble-watch.json');
check('boundary', indexHtml.includes('class="page-bookmarks"') && indexHtml.includes('href="bubble-watch.html"'), 'index.html 缺页面切换书签组件');
check('boundary', pageHtml.includes('class="page-bookmarks"') && pageHtml.includes('href="index.html"'), 'bubble-watch.html 缺页面切换书签组件');
check('boundary', pageHtml.includes('data/bubble-watch.json'), 'bubble-watch.html 未读 data/bubble-watch.json');
check('boundary', pageHtml.includes('id="market-technical-heat"') && pageHtml.includes('renderMarketTechnicalHeat'), 'bubble-watch.html 缺公开市场技术热度审计面板渲染');
check('boundary', !pageHtml.includes('WEIGHTED RISK SCORE'), 'bubble-watch.html 不得把 weighted_risk_score 标成页面主风险分');
check('boundary', pageHtml.includes('PRIMARY SCORE:'), 'bubble-watch.html 必须显式标注主分数口径');
check('boundary', !buildSrc.includes('radar-data.json') && !buildSrc.includes("'realtime"), 'build 脚本不得触碰 radar-data / realtime');
check('boundary', !/scoring\s*[:=].*decisionModel|executionLock|positionGuidance/u.test(buildSrc), 'build 脚本出现决策链字段');
check('boundary', (data.meta?.boundary || '').includes('display-only'), 'meta.boundary 缺 display-only 声明');

// ---- 6. history 对齐 ----
const entries = history.entries || [];
check('history', entries.length >= 1, 'history entries 为空');
const last = entries[entries.length - 1] || {};
check('history', last.date === data.as_of_date, `history 尾项 ${last.date} ≠ as_of_date ${data.as_of_date}`);
check('history', last.red_pct === s.red_pct && last.risk_score === s.weighted_risk_score, 'history 尾项分值与 summary 不符');
check('history', last.statuses && Object.keys(last.statuses).length === EXPECTED_IDS.length, 'history 尾项 statuses 不全');
const seed = data.history_seed || [];
check('history', seed.length >= 1 && seed.length <= 10, `history_seed 长度异常 ${seed.length}`);
check('history', seed.length && seed[seed.length - 1].week === last.week, 'history_seed 尾点与 history 尾项不符');
for (const w of data.wow_changes || []) {
  check('history', ['status_upgrade', 'status_downgrade', 'flat'].includes(w.type) && typeof w.note === 'string' && w.note.length > 0, 'wow_changes 项非法');
}

// ---- 输出 ----
const groups = ['contract', 'scoring', 'freshness', 'provenance', 'boundary', 'history'];
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`check:bubble-watch FAILED (${failures.length} failure${failures.length > 1 ? 's' : ''})`);
  process.exit(1);
}
for (const g of groups) console.log(`OK bubble-watch ${g}`);
console.log('check:bubble-watch PASS (6 leaf checks)');
