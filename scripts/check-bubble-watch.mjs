// check-bubble-watch.mjs — AI 泡沫监测(Bubble Watch)契约检查
//
// leaf 检查:
//   1. contract   — data/bubble-watch.json schema + 27 展示 / Core-23 / Shadow-4 完整性
//   2. scoring    — Core-23 red_pct 分档 + 分类强制升级规则 replay,Shadow-4 不得入分
//   3. freshness  — as_of_date 不得超过 35 天(周更 + 缓冲)
//   4. provenance — curated/auto_fallback 必带 asOfDate;stale 标记与 maxAgeDays 一致
//   5. boundary   — display-only:主站 app.js / index.html 不读本数据;build 不碰
//                   radar-data / realtime;双页书签组件两侧都在
//   6. history    — 历史文件与 latest 对齐,history_seed 尾点一致
//   7. public-copy — 前台卡片文案不得暴露 builder/provenance/fallback/proxy 等工程语言

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCoreAiAccountingEnforcementEvent } from './bubble-watch/accounting-event-classifier.mjs';
import { assessUnderlyingObservationFreshness } from './bubble-watch/observation-freshness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const failures = [];
function check(group, cond, message) {
  if (!cond) failures.push(`[${group}] ${message}`);
}

const EXPECTED_IDS = [
  'cape', 'top5_weight', 'nvda_fpe', 'private_secondary_marks',
  'hyperscaler_capex_yoy', 'mag4_fcf_yoy', 'vc_ai_share', 'nvda_invest_revenue',
  'breadth_50d', 'spy_vs_rsp_6m', 'insider_sell_buy', 'ai_ipo_pipeline',
  'hy_oas', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'token_revenue_ratio', 'gpu_rental_price', 'arr_2nd_deriv', 'enterprise_deploy', 'cloud_rpo_growth', 'frontier_progress',
  'accounting_events', 'fed_policy', 'capex_reaction', 'ceo_hedging'
];
const CORE_IDS = [
  'cape', 'top5_weight', 'nvda_fpe',
  'hyperscaler_capex_yoy', 'mag4_fcf_yoy', 'vc_ai_share', 'nvda_invest_revenue',
  'breadth_50d', 'spy_vs_rsp_6m', 'insider_sell_buy', 'ai_ipo_pipeline',
  'hy_oas', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'arr_2nd_deriv', 'enterprise_deploy', 'cloud_rpo_growth',
  'accounting_events', 'fed_policy', 'capex_reaction', 'ceo_hedging'
];
const SHADOW_IDS = ['private_secondary_marks', 'token_revenue_ratio', 'gpu_rental_price', 'frontier_progress'];
const CORE_ID_SET = new Set(CORE_IDS);
const SHADOW_ID_SET = new Set(SHADOW_IDS);
const SCORING_MODEL_VERSION = 'bubble-watch-v2-core23-shadow4';
const CURATED_ORIGIN_IDS = [
  'private_secondary_marks', 'vc_ai_share', 'ai_ipo_pipeline', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'token_revenue_ratio', 'gpu_rental_price', 'arr_2nd_deriv', 'enterprise_deploy', 'frontier_progress',
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
const CANDIDATE_ONLY_IDS = ['private_secondary_marks', 'gpu_rental_price', 'frontier_progress'];
const CATEGORIES = ['valuation', 'capital', 'market_structure', 'credit', 'fundamentals', 'macro'];
const STATUSES = ['red', 'yellow', 'green'];
const AXES = ['stage', 'trigger'];
const STATUS_SCORE = { red: 100, yellow: 50, green: 0 };
const TECHNICAL_HEAT_IDS = [
  'relative_momentum_21d',
  'rsi_14d',
  'bollinger_pct_b',
  'sma_200_deviation',
  'correlation_beta_60d'
];
const TIER_LABEL_ZH = { observation: '观察期', caution: '中度警戒', alert: '高风险预警', top: '系统性顶部' };
const TIER_LABEL_EN = { observation: 'Observation', caution: 'Moderate Caution', alert: 'High Risk Alert', top: 'Systemic Top' };
const NARRATIVE_ENGINE_VERSION = 'bubble-watch-narrative-v2';
const VISIBLE_COPY_FORBIDDEN_PATTERNS = [
  { re: /\blocal_proxy_confidence_v1\b/iu, label: 'local_proxy_confidence_v1' },
  { re: /\bprovenance\b/iu, label: 'provenance' },
  { re: /\bred_pct\b/iu, label: 'red_pct internal field name' },
  { re: /\btemplate\b|模板|上游模板/iu, label: 'template/upstream template' },
  { re: /\bfallback\b|兜底|fail-closed|fail closed/iu, label: 'fallback/fail-closed' },
  { re: /\bproxy\b|代理源置信度|自动代理源|新闻事件代理|平台代理|技术超买代理/iu, label: 'proxy implementation wording' },
  { re: /自动原始|原始判级|原始值「/iu, label: 'raw automatic classification wording' },
  { re: /实时抓取|实拉|抓取失败|source failed|fetch failed/iu, label: 'fetch/build implementation wording' },
  { re: /\bMCP\b|付费可选源|paid optional|paid final|paid source/iu, label: 'paid source implementation wording' },
  { re: /\bcurated\b|\bhybrid\b|\bbuilder\b|\bendpoint\b/iu, label: 'builder/internal source wording' },
  { re: /\bAPI\b/iu, label: 'API implementation wording' }
];

const data = JSON.parse(read('data/bubble-watch.json'));
const history = JSON.parse(read('data/bubble-watch-history.json'));
const pageHtml = read('bubble-watch.html');
const indexHtml = read('index.html');
const appJs = read('scripts/app.js');
const buildSrc = read('scripts/build-bubble-watch.mjs');
const sourceCandidates = JSON.parse(read('config/bubble-watch-source-candidates.json'));
const curatedConfig = JSON.parse(read('config/bubble-watch-curated.json'));
const gdeltBubbleCache = JSON.parse(read('data/gdelt-bubble-watch-cache.json'));

// ---- 1. contract ----
check('contract', data.contractVersion === 'bubble-watch-v2', `contractVersion 异常: ${data.contractVersion}`);
check('contract', history.contractVersion === 'bubble-watch-history-v2', `history contractVersion 异常: ${history.contractVersion}`);
check('contract', Number.isInteger(data.issue_number) && data.issue_number > 0, `issue_number 异常: ${data.issue_number}`);
check('contract', /^\d{4}-\d{2}-\d{2}$/u.test(data.as_of_date || ''), `as_of_date 异常: ${data.as_of_date}`);
check('contract', Array.isArray(data.indicators) && data.indicators.length === EXPECTED_IDS.length,
  `indicators 长度 ${data.indicators?.length} ≠ ${EXPECTED_IDS.length}`);

const ids = new Set();
for (const ind of data.indicators || []) {
  ids.add(ind.id);
  check('contract', CATEGORIES.includes(ind.category), `${ind.id} category 非法: ${ind.category}`);
  check('contract', AXES.includes(ind.axis), `${ind.id} axis 非法: ${ind.axis}`);
  check('contract', STATUSES.includes(ind.status), `${ind.id} status 非法: ${ind.status}`);
  const expectedRole = CORE_ID_SET.has(ind.id) ? 'core' : SHADOW_ID_SET.has(ind.id) ? 'shadow' : null;
  check('contract', ind.score_role === expectedRole, `${ind.id} score_role ${ind.score_role} ≠ ${expectedRole}`);
  for (const field of ['name_en', 'name_zh', 'value_display', 'note', 'threshold_text', 'source_name']) {
    check('contract', typeof ind[field] === 'string' && ind[field].length > 0, `${ind.id} 缺 ${field}`);
  }
  check('contract', typeof ind.stale === 'boolean', `${ind.id} stale 非 boolean`);
  check('contract', /^\d{4}-\d{2}-\d{2}$/u.test(ind.as_of || ''), `${ind.id} as_of 缺失/异常`);
  check('contract', ['auto', 'curated', 'auto_fallback'].includes(ind.provenance?.mode), `${ind.id} provenance.mode 非法`);
}
check('contract', EXPECTED_IDS.every((id) => ids.has(id)) && ids.size === EXPECTED_IDS.length,
  `指标 id 集不等于预登记 ${EXPECTED_IDS.length} 项 (got ${ids.size})`);
const indicatorById = Object.fromEntries((data.indicators || []).map((ind) => [ind.id, ind]));
const coreIndicators = (data.indicators || []).filter((ind) => ind.score_role === 'core');
const shadowIndicators = (data.indicators || []).filter((ind) => ind.score_role === 'shadow');
check('contract', coreIndicators.length === CORE_IDS.length, `Core 指标数 ${coreIndicators.length} ≠ ${CORE_IDS.length}`);
check('contract', shadowIndicators.length === SHADOW_IDS.length, `Shadow 指标数 ${shadowIndicators.length} ≠ ${SHADOW_IDS.length}`);

check('contract', gdeltBubbleCache.schemaVersion === 'gdelt-bubble-watch-cache-p38',
  `GDELT Bubble cache schemaVersion 异常: ${gdeltBubbleCache.schemaVersion}`);
check('contract', gdeltBubbleCache.module === 'gdelt-bubble-watch-cache', 'GDELT Bubble cache module 异常');
check('contract', gdeltBubbleCache.cacheScope === 'bubble_watch_ceo_hedging', `GDELT Bubble cache scope 异常: ${gdeltBubbleCache.cacheScope}`);
check('contract', ['ok', 'stale', 'error', 'not_initialized'].includes(gdeltBubbleCache.status),
  `GDELT Bubble cache status 异常: ${gdeltBubbleCache.status}`);
check('contract', ['live', 'stale', 'error', 'not_initialized'].includes(gdeltBubbleCache.sourceStatus),
  `GDELT Bubble cache sourceStatus 异常: ${gdeltBubbleCache.sourceStatus}`);
check('contract', gdeltBubbleCache.cachePolicy?.lowFrequencyCache === true && gdeltBubbleCache.cachePolicy?.broadQueryLocalClassification === true,
  'GDELT Bubble cache 必须声明 lowFrequencyCache + broadQueryLocalClassification');
check('contract', gdeltBubbleCache.query?.id === 'gdelt_bubble_ceo_hedging', 'GDELT Bubble cache query.id 异常');
check('contract', Array.isArray(gdeltBubbleCache.articles), 'GDELT Bubble cache articles 必须为数组');
for (const field of ['affectsValues', 'affectsScoring', 'affectsDecisionModel', 'affectsExecutionLock', 'affectsPositionGuidance', 'affectsBrentPromotion', 'affectsOdpFinalBias', 'affectsGlobalRiskHeatmap', 'affectsCrossValidation']) {
  check('contract', gdeltBubbleCache.productionImpact?.[field] === false, `GDELT Bubble cache productionImpact.${field} 必须为 false`);
}

const s = data.summary || {};
const red = (data.indicators || []).filter((i) => i.status === 'red').length;
const yellow = (data.indicators || []).filter((i) => i.status === 'yellow').length;
const green = (data.indicators || []).filter((i) => i.status === 'green').length;
const coreRed = coreIndicators.filter((i) => i.status === 'red').length;
const coreYellow = coreIndicators.filter((i) => i.status === 'yellow').length;
const coreGreen = coreIndicators.filter((i) => i.status === 'green').length;
check('contract', s.total_indicators === EXPECTED_IDS.length, `summary.total_indicators ${s.total_indicators}`);
check('contract', s.red_count === red && s.yellow_count === yellow && s.green_count === green,
  `summary 展示计数 ${s.red_count}/${s.yellow_count}/${s.green_count} ≠ 实算 ${red}/${yellow}/${green}`);
check('contract', Math.abs(s.display_red_pct - (red / EXPECTED_IDS.length) * 100) < 0.06, `display_red_pct ${s.display_red_pct} 复算不符`);
check('contract', Math.abs(s.display_weighted_risk_score - ((red + 0.5 * yellow) / EXPECTED_IDS.length) * 100) < 0.06,
  `display_weighted_risk_score ${s.display_weighted_risk_score} 复算不符`);
check('contract', s.scoring_total_indicators === CORE_IDS.length, `summary.scoring_total_indicators ${s.scoring_total_indicators}`);
check('contract', s.scoring_red_count === coreRed && s.scoring_yellow_count === coreYellow && s.scoring_green_count === coreGreen,
  `summary 核心计数 ${s.scoring_red_count}/${s.scoring_yellow_count}/${s.scoring_green_count} ≠ 实算 ${coreRed}/${coreYellow}/${coreGreen}`);
check('contract', s.primary_score_pct === s.red_pct, `primary_score_pct ${s.primary_score_pct} 必须等于 red_pct ${s.red_pct}`);
check('contract', s.primary_score_basis === 'core_red_light_ratio', `primary_score_basis 异常: ${s.primary_score_basis}`);
check('contract', Math.abs(s.red_pct - (coreRed / CORE_IDS.length) * 100) < 0.06, `red_pct ${s.red_pct} Core-23 复算不符`);
check('contract', Math.abs(s.weighted_risk_score - ((coreRed + 0.5 * coreYellow) / CORE_IDS.length) * 100) < 0.06,
  `weighted_risk_score ${s.weighted_risk_score} Core-23 复算不符`);
function replayAxisScore(axis) {
  const items = coreIndicators.filter((item) => item.axis === axis);
  return Number((items.reduce((sum, item) => sum + STATUS_SCORE[item.status], 0) / items.length).toFixed(1));
}
function replayAxisLabel(axis, score) {
  if (axis === 'stage') {
    if (score < 30) return ['早期 Displacement', 'Displacement'];
    if (score < 50) return ['扩张 Boom', 'Boom'];
    if (score < 70) return ['亢奋 Euphoria', 'Euphoria'];
    return ['极端 Mania', 'Mania'];
  }
  if (score < 25) return ['引线未燃', 'Fuse Unlit'];
  if (score < 45) return ['零星火花', 'Sparks'];
  if (score < 65) return ['引线点燃', 'Fuse Lit'];
  return ['破裂进行中', 'Unwinding'];
}
const replayStage = replayAxisScore('stage');
const replayTrigger = replayAxisScore('trigger');
const [stageLabelZh, stageLabelEn] = replayAxisLabel('stage', replayStage);
const [triggerLabelZh, triggerLabelEn] = replayAxisLabel('trigger', replayTrigger);
check('contract', Math.abs(s.stage_score - replayStage) < 0.06, `stage_score ${s.stage_score} 复算不符 ${replayStage}`);
check('contract', Math.abs(s.trigger_score - replayTrigger) < 0.06, `trigger_score ${s.trigger_score} 复算不符 ${replayTrigger}`);
check('contract', s.stage_label === stageLabelZh && s.stage_label_en === stageLabelEn, 'stage label 与区间不符');
check('contract', s.trigger_label === triggerLabelZh && s.trigger_label_en === triggerLabelEn, 'trigger label 与区间不符');
for (const category of CATEGORIES) {
  const items = coreIndicators.filter((item) => item.category === category);
  const replay = Number((items.reduce((sum, item) => sum + STATUS_SCORE[item.status], 0) / items.length).toFixed(1));
  check('contract', Math.abs(s.category_scores?.[category] - replay) < 0.06, `category_scores.${category} 复算不符`);
}
const previousComparable = [...(history.entries || [])].reverse().find((entry) => entry.date !== data.as_of_date && entry.statuses);
let replayDeteriorated = 0;
let replayImproved = 0;
for (const item of coreIndicators) {
  const previous = previousComparable?.statuses?.[item.id];
  if (!previous || previous === item.status) continue;
  const delta = STATUSES.indexOf(previous) - STATUSES.indexOf(item.status);
  if (delta > 0) replayDeteriorated += delta;
  else replayImproved -= delta;
}
check('contract', s.momentum?.deteriorated === replayDeteriorated && s.momentum?.improved === replayImproved && s.momentum?.net === replayDeteriorated - replayImproved,
  'summary.momentum 与历史状态迁移不符');
check('contract', Array.isArray(s.similarity) && s.similarity.length === 4, 'summary.similarity 必须含 4 个历史时点');
check('contract', new Set((s.similarity || []).map((item) => item.period)).size === 4
  && (s.similarity || []).every((item) => Number.isInteger(item.match_pct) && item.match_pct >= 0 && item.match_pct <= 100
    && Number.isInteger(item.denominator) && item.denominator > 0 && item.basis === 'core_calibrated_indicators_only'),
  'summary.similarity period/match_pct 非法');
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

function checkVisibleCopy(fieldName, value) {
  const text = String(value || '');
  for (const { re, label } of VISIBLE_COPY_FORBIDDEN_PATTERNS) {
    check('public-copy', !re.test(text), `${fieldName} 暴露工程语言: ${label}`);
  }
}

for (const ind of data.indicators || []) {
  for (const field of ['note', 'source_name']) {
    checkVisibleCopy(`indicators.${ind.id}.${field}`, ind[field]);
  }
}
checkVisibleCopy('summary.verdict_desc', s.verdict_desc);
for (const [index, section] of (s.narrative_plan?.sections || []).entries()) {
  checkVisibleCopy(`summary.narrative_plan.sections[${index}].summaryZh`, section.summaryZh);
}
for (const [index, item] of (s.narrative_plan?.evidenceHighlights || []).entries()) {
  checkVisibleCopy(`summary.narrative_plan.evidenceHighlights[${index}].note_summary`, item.note_summary);
}
for (const [index, text] of (s.narrative_plan?.limitations || []).entries()) {
  checkVisibleCopy(`summary.narrative_plan.limitations[${index}]`, text);
}
for (const [index, item] of (data.wow_changes || []).entries()) {
  checkVisibleCopy(`wow_changes[${index}].note`, item.note);
}

const technicalHeat = data.market_technical_heat || {};
check('contract', technicalHeat.contractVersion === 'bubble-watch-market-technical-heat-v1', 'market_technical_heat contractVersion 缺失/异常');
check('contract', String(technicalHeat.boundary || '').includes('display-only') && String(technicalHeat.boundary || '').includes('excluded from Bubble Watch core/shadow indicator scoring'),
  'market_technical_heat 必须声明 display-only 且排除 Bubble Watch v2 计分');
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
    for (const field of ['note', 'source_name']) {
      checkVisibleCopy(`market_technical_heat.items.${item.id}.${field}`, item[field]);
    }
  }
} else {
  check('contract', Array.isArray(technicalHeat.items) && technicalHeat.items.length === 0, 'market_technical_heat unavailable 时 items 应为空');
}
checkVisibleCopy('market_technical_heat.summary', technicalHeat.summary);

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
for (const id of CANDIDATE_ONLY_IDS) {
  check('contract', candidateEntries[id]?.automationStatus === 'candidate_only', `${id} 必须保持 candidate_only,由现有上游周报同步 + curated STALE 链更新`);
}
check('contract', buildSrc.includes('SOURCE_CANDIDATES_PATH') && buildSrc.includes('hybridCuratedBuilders'), 'build 须读取 source-candidates 并保留 hybrid curated builders');
for (const id of [...HYBRID_LIVE_IDS, ...HYBRID_PAID_OPTIONAL_IDS]) {
  check('contract', buildSrc.includes(`${id}:`), `build 缺 ${id} hybrid builder 绑定`);
}
check('contract', buildSrc.includes('fetchInsiderTotals') && buildSrc.includes('SEC EDGAR Form 4 ownership XML'),
  'insider_sell_buy 必须使用 SEC Form 4 官方路径');
check('contract', buildSrc.includes('fetchXoomarForm4InsiderTotals') &&
  buildSrc.includes('https://xoomar.com/api/markets/insiders/') &&
  buildSrc.includes("sourceMode: 'xoomar_form4_fallback'"),
  'insider_sell_buy 必须保留 Xoomar HTTPS 独立实时备用路径');
check('contract', buildSrc.includes('row?.isOpenMarket !== true') &&
  buildSrc.includes("code !== 'P' && code !== 'S'"),
  'insider_sell_buy Xoomar 备用只能统计 open-market P/S 交易');
check('contract', !buildSrc.includes('http://openinsider.com') && !buildSrc.includes('fetchOpenInsiderTotals'),
  'insider_sell_buy 不得使用明文 HTTP OpenInsider 路径');
check('contract', buildSrc.includes('fetchLatestFedSepMedians') && buildSrc.includes('fetchYearEndFedFundsFuture') && buildSrc.includes('fed_policy_path_v2'),
  'fed_policy 必须保留 Fed SEP + 年末 Fed funds futures 政策路径证据');
check('contract', indicatorById.fed_policy?.provenance?.detail?.policyPathEvidenceVersion === 'fed_policy_path_v2',
  'fed_policy provenance 缺 fed_policy_path_v2 审计版本');
check('contract', buildSrc.includes('isCoreAiAccountingEnforcementEvent'),
  'accounting_events 必须使用会计执法语义分类器');
check('contract', isCoreAiAccountingEnforcementEvent({
  title: 'Grosse Ile Man Charged with Child Pornography Offenses',
  context: 'The defendant allegedly uploaded files to Google Drive and was charged by criminal complaint.',
  date: '2026-07-24'
}) === false, 'accounting_events 不得把 Google Drive 消费服务提及误判为企业会计事件');
check('contract', isCoreAiAccountingEnforcementEvent({
  title: 'SEC Charges Alphabet with Accounting Fraud',
  context: 'The complaint alleges financial statement misstatements and revenue-recognition violations.',
  date: '2026-07-24'
}) === true, 'accounting_events 必须识别核心企业正式会计执法事件');
const staleArrFixture = assessUnderlyingObservationFreshness({
  observationDate: '2026-05-28',
  asOfDate: '2026-07-28',
  maxAgeDays: 45
});
check('freshness', staleArrFixture.status === 'stale' && staleArrFixture.ageDays === 61,
  'ARR 底层里程碑新鲜度回归样本必须判为 stale');
check('contract', buildSrc.includes('requireFreshUnderlyingObservation') && buildSrc.includes('hybridBuilder(ctx, entry)'),
  'arr_2nd_deriv 必须按 curated maxAgeDays 检查底层观测日期');
const arrSecondDerivative = indicatorById.arr_2nd_deriv;
if (arrSecondDerivative?.provenance?.mode === 'auto'
  && /SaaStr WordPress public API/iu.test(arrSecondDerivative.provenance?.detail?.source || '')) {
  check('freshness',
    arrSecondDerivative.provenance?.detail?.underlyingObservationFreshness?.status === 'fresh'
      && Number(arrSecondDerivative.provenance?.detail?.underlyingObservationFreshness?.ageDays)
        <= Number(arrSecondDerivative.provenance?.detail?.underlyingObservationFreshness?.maxAgeDays),
    'arr_2nd_deriv 自动发布时底层 ARR 里程碑必须 fresh');
}
const insiderSellBuy = indicatorById.insider_sell_buy;
if (insiderSellBuy?.provenance?.detail?.proxyConfidenceCalibration?.applied === true) {
  check('public-copy', insiderSellBuy.value_display === '高卖压·覆盖受限',
    'insider_sell_buy 代理校准后必须显示覆盖受限,不得展示不可比极端倍数');
  check('public-copy', /记录上限|覆盖受限/u.test(insiderSellBuy.note || '')
    && !/尚未接近互联网泡沫峰值/u.test(insiderSellBuy.note || ''),
  'insider_sell_buy 必须解释样本覆盖限制,不得用与展示倍数矛盾的峰值文案');
}
if (indicatorById.fed_policy?.provenance?.detail?.classificationReason === 'policy_path_above_current_target') {
  check('public-copy', indicatorById.fed_policy.value_display === '年末路径隐含加息',
    'fed_policy 年末路径红灯必须明确显示观察周期');
}
check('contract', buildSrc.includes('fetchBarchartS5fiBreadth') && buildSrc.includes('Barchart:$S5FI'),
  'breadth_50d 必须优先尝试 Barchart $S5FI 直接广度源');
check('contract', buildSrc.includes('capexResearchConfirmationAnchor') && buildSrc.includes('capex_market_repricing_research_confirmation_v1'),
  'capex_reaction 必须允许新鲜上游研究周报确认系统性重定价证据');
check('contract', buildSrc.includes('capex_reaction_multi_window_v1') && buildSrc.includes('windowEvidence') && buildSrc.includes('systemicWindowCount'),
  'capex_reaction 必须使用多窗口价格反应公式,避免单一 21 日相对收益噪音');
const capexReaction = indicatorById.capex_reaction;
const capexResearchConfirmation = capexReaction?.provenance?.detail?.upstreamResearchConfirmation;
if (capexResearchConfirmation?.confirmationPolicy === 'capex_market_repricing_research_confirmation_v1'
  && Number(capexReaction?.provenance?.detail?.systemicWindowCount) >= 2) {
  check('contract', capexReaction.status === 'red' && capexReaction.value_display === '系统性惩罚',
    'capex_reaction 本地多窗口价格代理红灯且上游研究确认时不得降档为黄灯');
}
check('contract', buildSrc.includes('fetchSecAiIpoFilingConfirmations') && buildSrc.includes('SEC EDGAR S-1/F-1 confirmation'),
  'ai_ipo_pipeline 必须保留 SEC S-1/F-1 官方申报确认路径');
check('contract', candidateEntries.ai_ipo_pipeline?.freeSourceCandidates?.some((source) => /SEC EDGAR/iu.test(source.source || '') && /S-1|F-1|424B4/iu.test(`${source.role || ''} ${source.limitations || ''}`)),
  'ai_ipo_pipeline source candidates 缺 SEC S-1/F-1/424B4 官方确认源');
check('contract', candidateEntries.ceo_hedging?.freeSourceCandidates?.some((source) => /Tavily/iu.test(source.source || '')),
  'ceo_hedging source candidates 缺 Tavily 免费新闻兜底');
check('contract', buildSrc.includes('fetchCeoHedgingFromTavilyPublic') && buildSrc.includes('TAVILY_API_KEYS'),
  'ceo_hedging build path 必须保留 Tavily 免费新闻兜底');
check('contract', candidateEntries.ceo_hedging?.freeSourceCandidates?.some((source) => /Brave/iu.test(source.source || '')),
  'ceo_hedging source candidates 缺 Brave 免费新闻交叉确认');
check('contract', buildSrc.includes('fetchCeoHedgingFromBraveNews') && buildSrc.includes('BRAVE_API_KEYS'),
  'ceo_hedging build path 必须保留 Brave 免费新闻交叉确认');
check('contract', buildSrc.includes("from './gdelt/fetch-gdelt.mjs'") && buildSrc.includes('fetchGdeltDocJson') && buildSrc.includes('GDELT_BUBBLE_CACHE_SCHEMA_VERSION'),
  'ceo_hedging GDELT public search 必须走共享 wrapper + Bubble compact cache');
check('contract', buildSrc.includes('readGdeltBubbleWatchCache') && buildSrc.includes('writeGdeltBubbleWatchCache') && buildSrc.includes('GDELT_BUBBLE_CACHE_TTL_HOURS'),
  'ceo_hedging GDELT public search 必须保留低频缓存与 stale fallback');
check('contract', buildSrc.includes('mergeCeoHedgingNewsConfirmations') && buildSrc.includes('Brave News Search API'),
  'ceo_hedging 必须保留 Tavily/Brave 交叉确认路径');
check('contract', buildSrc.includes('capSingleSourceCeoHedgingRed') && buildSrc.includes('redRequiresTwoIndependentNewsSources'),
  'ceo_hedging 必须保留单源红灯封顶规则');
check('contract', buildSrc.includes('extractVcAiFundingShare') && buildSrc.includes('ai_sector_total_global_vc_sentence_v2'),
  'vc_ai_share 必须使用 AI sector / total global VC 句子级解析器,避免误抓巨额轮次数值');
check('contract', buildSrc.includes('UPSTREAM_SYNC_LOCAL_AUTHORITY_BLOCKLIST') && buildSrc.includes("'mag4_fcf_yoy'"),
  'mag4_fcf_yoy 必须在上游同步 blocklist 中,不得被参考站编辑口径覆盖');

const vcAiShare = indicatorById.vc_ai_share;
if (vcAiShare?.provenance?.mode === 'auto' && /Crunchbase News WordPress API/iu.test(vcAiShare.provenance?.detail?.source || '')) {
  const detail = vcAiShare.provenance.detail;
  check('contract', detail.parser === 'ai_sector_total_global_vc_sentence_v2', 'vc_ai_share Crunchbase 路径必须标注 v2 parser');
  check('contract', Number(detail.aiFundingB) >= 200 && Number(detail.sharePct) >= 75,
    `vc_ai_share Crunchbase 解析疑似误抓巨额轮次: aiFundingB=${detail.aiFundingB}, sharePct=${detail.sharePct}`);
  check('contract', /total global venture funding/iu.test(detail.evidenceText || ''),
    'vc_ai_share evidenceText 必须来自 total global venture funding 句子');
}

const mag4Fcf = indicatorById.mag4_fcf_yoy;
if (mag4Fcf?.provenance?.mode === 'auto') {
  const detail = mag4Fcf.provenance.detail || {};
  check('contract', detail.formula === 'big5_realized_ttm_cash_capex_to_operating_cash_flow',
    'mag4_fcf_yoy 必须声明 Big5 realized TTM cash capex/OCF 公式');
  check('contract', detail.adoptedModel === 'epoch_apollo_big5_cash_capex_to_ocf_coverage',
    'mag4_fcf_yoy 必须标注采用 Epoch/Apollo 式 Big5 capex/OCF 覆盖率模型');
  check('contract', Array.isArray(detail.perCompany) && detail.perCompany.length === 5,
    `mag4_fcf_yoy 必须五家公司齐全,当前 ${detail.perCompany?.length || 0}/5`);
  const expectedMag4 = ['AMZN', 'MSFT', 'GOOGL', 'META', 'ORCL'];
  const usedMag4 = new Set((detail.perCompany || []).map((row) => row.ticker));
  check('contract', expectedMag4.every((ticker) => usedMag4.has(ticker)) && usedMag4.size === expectedMag4.length,
    'mag4_fcf_yoy perCompany 必须正好覆盖 AMZN/MSFT/GOOGL/META/ORCL');
  const selfAudit = detail.selfContractAudit || {};
  check('contract', selfAudit.status === 'passed' && selfAudit.sourceIndependence === 'does_not_require_external_reference_site',
    'mag4_fcf_yoy 必须通过本站自有公式审计,且声明不依赖参考站');
  check('contract', selfAudit.fallbackPolicy === 'use_local_big5_capex_ocf_snapshot_only; upstream_or_reference_editorial_snapshots_are_not_eligible_fallback',
    'mag4_fcf_yoy fallbackPolicy 必须禁止参考站/前瞻编辑口径作为 Big5 capex/OCF 备用快照');
  check('contract', Math.abs(Number(selfAudit.capexOcfPct) - Number(selfAudit.replayCapexOcfPct)) < 0.2,
    `mag4_fcf_yoy 自审 capexOcfPct ${selfAudit.capexOcfPct} 与 replay ${selfAudit.replayCapexOcfPct} 不符`);
  check('contract', selfAudit.thresholdReplayStatus === mag4Fcf.status,
    `mag4_fcf_yoy 阈值 replay ${selfAudit.thresholdReplayStatus} 与发布状态 ${mag4Fcf.status} 不符`);
  check('contract', detail.externalReferenceAudit?.requiredForPublication === false,
    'mag4_fcf_yoy 外部参考审计只能是非必需的漂移提示');
  check('contract', /Epoch AI \/ Apollo style Big5/u.test(detail.externalReferenceAudit?.adoptedSourceLogic || ''),
    'mag4_fcf_yoy 外部参考审计必须标明采用 Epoch/Apollo Big5 capex/OCF 逻辑');
  check('contract', ['skipped_no_wind_key', 'not_run_in_builder_public_primary_succeeded'].includes(detail.windCrossCheck?.status),
    `mag4_fcf_yoy windCrossCheck.status 异常: ${detail.windCrossCheck?.status}`);
}
const mag4Fallback = curatedConfig.autoFallback?.mag4_fcf_yoy || {};
check('contract', mag4Fallback.fallbackContract === 'local_big5_capex_ocf_snapshot_v1',
  'mag4_fcf_yoy autoFallback 必须是本站 Big5 capex/OCF 本地备用快照');
check('contract', mag4Fallback.syncedFromUpstream !== true,
  'mag4_fcf_yoy autoFallback 不得 syncedFromUpstream');
check('contract', mag4Fallback.status === 'red' && /^≈?7[0-9]%/u.test(mag4Fallback.value_display || ''),
  `mag4_fcf_yoy autoFallback 值异常:${mag4Fallback.status} ${mag4Fallback.value_display}`);
check('contract', /Big5 capex\/OCF|Epoch\/Apollo/u.test(mag4Fallback.note || ''),
  'mag4_fcf_yoy autoFallback note 必须写明 Big5 capex/OCF 口径');

// ---- 2. scoring replay ----
function tierFromPct(p) {
  if (p >= 60) return 'top';
  if (p >= 40) return 'alert';
  if (p >= 25) return 'caution';
  return 'observation';
}
const baseTier = tierFromPct(s.red_pct);
const resonant = CATEGORIES.filter((cat) => {
  const items = coreIndicators.filter((i) => i.category === cat);
  if (!items.length) return false;
  return items.filter((i) => i.status === 'red').length / items.length >= 0.5;
});
const tierRank = { observation: 0, caution: 1, alert: 2, top: 3 };
let effTier = baseTier;
if (resonant.length >= 2 && tierRank[effTier] < tierRank.alert) effTier = 'alert';
const twoAxisTarget = replayStage >= 60 && replayTrigger >= 65
  ? 'top'
  : replayStage >= 60 && replayTrigger >= 50
    ? 'alert'
    : null;
const twoAxisUpgrade = twoAxisTarget && tierRank[twoAxisTarget] > tierRank[effTier] ? twoAxisTarget : null;
if (twoAxisUpgrade) effTier = twoAxisUpgrade;
check('scoring', s.verdict_label === TIER_LABEL_ZH[effTier], `verdict_label「${s.verdict_label}」≠ replay「${TIER_LABEL_ZH[effTier]}」`);
check('scoring', s.verdict_label_en === TIER_LABEL_EN[effTier], `verdict_label_en「${s.verdict_label_en}」≠ replay`);
check('scoring', data.scoring?.base_tier === baseTier, `scoring.base_tier ${data.scoring?.base_tier} ≠ replay ${baseTier}`);
check('scoring', data.scoring?.effective_tier === effTier, `scoring.effective_tier ${data.scoring?.effective_tier} ≠ replay ${effTier}`);
check('scoring', data.scoring?.model_version === SCORING_MODEL_VERSION, `scoring.model_version ${data.scoring?.model_version}`);
check('scoring', data.scoring?.primary_universe === 'core', `scoring.primary_universe ${data.scoring?.primary_universe}`);
check('scoring', JSON.stringify(data.scoring?.core_indicator_ids) === JSON.stringify(CORE_IDS), 'scoring.core_indicator_ids 漂移');
check('scoring', JSON.stringify(data.scoring?.shadow_indicator_ids) === JSON.stringify(SHADOW_IDS), 'scoring.shadow_indicator_ids 漂移');
check('scoring', data.scoring?.shadow_policy === 'display_only_no_score_impact', `scoring.shadow_policy ${data.scoring?.shadow_policy}`);
const promotion = data.scoring?.shadow_promotion_policy || {};
check('scoring', promotion.automatic_promotion === false && promotion.separate_review_required === true,
  'Shadow promotion 必须禁止自动晋升并要求独立评审');
check('scoring', promotion.minimum_observation_weeks === 52 && promotion.minimum_fresh_availability_pct === 90,
  'Shadow promotion 最低 52 周 / 90% fresh 可用率门槛漂移');
check('scoring', JSON.stringify(promotion.required_reviews) === JSON.stringify([
  'historical_proxy_or_backfill', 'non_redundancy_ablation', 'out_of_sample_target_improvement', 'separate_contract_migration'
]), 'Shadow promotion required_reviews 漂移');
check('scoring', data.scoring?.override_active === (effTier !== baseTier), 'scoring.override_active 与 replay 不符');
check('scoring', data.scoring?.two_axis_upgrade === twoAxisUpgrade, 'scoring.two_axis_upgrade 与 replay 不符');
check('scoring', typeof data.scoring?.override_rules?.two_axis_alert === 'string' && typeof data.scoring?.override_rules?.two_axis_top === 'string',
  'scoring.override_rules 缺两轴升级规则');

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
check('boundary', pageHtml.includes('两轴判读') && pageHtml.includes('Stage × Trigger') && pageHtml.includes('s.stage_score') && pageHtml.includes('s.trigger_score'),
  'bubble-watch.html 缺 Stage × Trigger 两轴判读');
check('boundary', !pageHtml.includes('Threshold Scale') && !pageHtml.includes('触发阈值标尺'),
  'bubble-watch.html 仍残留已移除的单轴阈值标尺');
check('boundary', pageHtml.includes('id="market-technical-heat"') && pageHtml.includes('renderMarketTechnicalHeat'), 'bubble-watch.html 缺公开市场技术热度审计面板渲染');
check('boundary', !pageHtml.includes('WEIGHTED RISK SCORE'), 'bubble-watch.html 不得把 weighted_risk_score 标成页面主风险分');
check('boundary', pageHtml.includes('PRIMARY SCORE:'), 'bubble-watch.html 必须显式标注主分数口径');
check('boundary', pageHtml.includes('固定核心') && pageHtml.includes('影子观察') && pageHtml.includes('CORE-23'),
  'bubble-watch.html 必须显式区分固定核心与影子观察');
check('public-copy', !/Yellow-adjusted aux|数据管线|实时接入|人工研究口径|分类升级 →|不计入 27 项主分|不改变 27 项红灯比例|不参与平台的风险打分与决策/u.test(pageHtml),
  'bubble-watch.html 可见模板残留工程语言');
check('boundary', !buildSrc.includes('radar-data.json') && !buildSrc.includes("'realtime"), 'build 脚本不得触碰 radar-data / realtime');
check('boundary', !/scoring\s*[:=].*decisionModel|executionLock|positionGuidance/u.test(buildSrc), 'build 脚本出现决策链字段');
check('boundary', (data.meta?.boundary || '').includes('display-only'), 'meta.boundary 缺 display-only 声明');

// ---- 6. history 对齐 ----
const entries = history.entries || [];
check('history', entries.length >= 1, 'history entries 为空');
const last = entries[entries.length - 1] || {};
check('history', last.date === data.as_of_date, `history 尾项 ${last.date} ≠ as_of_date ${data.as_of_date}`);
check('history', last.red_pct === s.red_pct && last.risk_score === s.weighted_risk_score, 'history 尾项分值与 summary 不符');
check('history', last.scoring_model_version === SCORING_MODEL_VERSION
  && last.core_red_pct === s.red_pct
  && last.core_risk_score === s.weighted_risk_score
  && last.display_red_pct === s.display_red_pct
  && last.display_risk_score === s.display_weighted_risk_score,
  'history 尾项 v2 core/display 字段与 summary 不符');
check('history', last.statuses && Object.keys(last.statuses).length === EXPECTED_IDS.length, 'history 尾项 statuses 不全');
const seed = data.history_seed || [];
check('history', seed.length >= 1 && seed.length <= 10, `history_seed 长度异常 ${seed.length}`);
check('history', seed.length && seed[seed.length - 1].week === last.week, 'history_seed 尾点与 history 尾项不符');
const replayableCoreEntries = entries.filter((entry) => CORE_IDS.every((id) => STATUSES.includes(entry.statuses?.[id])));
check('history', seed.length === Math.min(10, replayableCoreEntries.length),
  `history_seed ${seed.length} 项 ≠ Core-23 可回放周次 ${Math.min(10, replayableCoreEntries.length)}`);
check('history', seed.every((entry) => entry.model_version === SCORING_MODEL_VERSION), 'history_seed 混入非 v2 模型点');
for (const [index, entry] of seed.entries()) {
  const source = replayableCoreEntries.slice(-10)[index];
  check('history', source?.week === entry.week && source?.core_red_pct === entry.red_pct && source?.core_risk_score === entry.risk_score,
    `history_seed[${index}] 未按 Core-23 回放字段生成`);
}
for (const w of data.wow_changes || []) {
  check('history', ['status_upgrade', 'status_downgrade', 'flat'].includes(w.type) && typeof w.note === 'string' && w.note.length > 0, 'wow_changes 项非法');
}

// ---- 输出 ----
const groups = ['contract', 'scoring', 'freshness', 'provenance', 'boundary', 'history', 'public-copy'];
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`check:bubble-watch FAILED (${failures.length} failure${failures.length > 1 ? 's' : ''})`);
  process.exit(1);
}
for (const g of groups) console.log(`OK bubble-watch ${g}`);
console.log('check:bubble-watch PASS (7 leaf checks)');
