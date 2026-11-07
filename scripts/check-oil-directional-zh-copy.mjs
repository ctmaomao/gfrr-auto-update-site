// check:oil-directional-zh-copy — PR4 · the ODP energy-theme renderer copy is an
// OBSERVATIONAL verdict, not a trade instruction. It must:
//   (1) carry NO trade-action words,
//   (2) map EVERY finalBias enum value (single source of truth = the classifier) to a
//       Chinese label,
//   (3) keep an explicit "暂不判断" fallback for insufficient data.
//
// Scope = scripts/modules/renderOilDirectional.js (the dynamic Chinese copy). The static
// index.html section copy is boundary disclaimers ("不进打分 / 执行 / 热力图") and is
// reviewed manually under DESIGN.md §4.1/§5.6 + ADR-0014.
// P32: the oil-news event watch may display headline readiness and title-risk
// aggregate counts only. It must not render article titles or iterate topArticles.
// P33: oil-news event watch source health/fallback copy must stay explicit:
// aggregate source health is allowed, but no single news path may be written as
// a confirmed oil event.
// P53: claim polarity may be rendered only as aggregate counts from the production
// artifact; the renderer still must not read article lists or expose headlines.
// P50/P62/P68 thermal, P54 cross-confirmation and P56 readiness displays are
// retired by the approved simplification. Their compatibility DOM must stay
// hidden/inert, their readers must be absent, and unsafe source fields stay banned.
// P63 reviewed Web NGrams aggregate health remains active; no raw news is allowed.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FINAL_BIAS_VALUES } from './oil-directional/odp-classifier.mjs';

const errors = [];
const fail = (m) => errors.push(m);

const src = readFileSync(resolve('scripts/modules/renderOilDirectional.js'), 'utf8');
const html = readFileSync(resolve('index.html'), 'utf8');

// (1) No trade-action words. These are instructions; ODP is display-only observation.
// Directional VIEWS (看涨 / 偏空 / 中性) are allowed — they are assessments, not actions.
const FORBIDDEN_ACTION = [
  '买入', '卖出', '买进', '卖掉', '做多', '做空', '加仓', '减仓', '建仓', '平仓',
  '持仓', '仓位', '止损', '止盈', '抄底', '清仓', '入场', '离场', '加杠杆', '挂单',
];
for (const w of FORBIDDEN_ACTION) {
  if (src.includes(w)) fail(`ODP UI copy must not contain trade-action word '${w}' (display-only observational verdict)`);
}

// (2) Every finalBias enum value maps to a Chinese label.
const mapMatch = src.match(/const FINAL_BIAS_ZH = \{([\s\S]*?)\};/);
if (!mapMatch) {
  fail('FINAL_BIAS_ZH map not found in renderOilDirectional.js');
} else {
  for (const v of FINAL_BIAS_VALUES) {
    if (!new RegExp(`(^|[^A-Za-z_])${v}\\s*:`).test(mapMatch[1])) {
      fail(`FINAL_BIAS_ZH is missing a Chinese label for finalBias '${v}'`);
    }
  }
}

// (3) Explicit insufficient -> 暂不判断 fallback present.
if (!src.includes('暂不判断')) {
  fail("ODP UI copy must keep an explicit '暂不判断' fallback for insufficient data");
}

// (4) Oil-news headline guard: frontend must not expose article title lists.
if (src.includes('topArticles')) {
  fail('ODP renderer must not read oil-news topArticles; headline display is not approved');
}
if (!src.includes('headlineDisplayReadiness') || !src.includes('titleRisk')) {
  fail('ODP renderer must expose oil-news headline readiness/title-risk aggregate guard text');
}
if (!src.includes('claimPolarity') || !src.includes('odp-news-event-claim-polarity') || !src.includes('claimPolarityText')) {
  fail('ODP renderer must expose oil-news claim polarity aggregate text');
}
if (!src.includes('odp-news-event-claim-quality') || !src.includes('claimQualityText') || !src.includes('claimQualityTone')) {
  fail('ODP renderer must expose oil-news claim quality aggregate text');
}
if (!src.includes('不展示标题原文')) {
  fail('ODP oil-news copy must explicitly state that original headlines are not displayed');
}
if (!src.includes('主张方向只显示聚合计数')) {
  fail('ODP oil-news claim-polarity copy must preserve aggregate-count-only wording');
}
if (!src.includes('质量待核') || !src.includes('标题未批准') || !src.includes('不把单一路径报道写成确认事件')) {
  fail('ODP oil-news claim-quality copy must preserve review-gate and no-single-path wording');
}
if (!src.includes('odp-news-event-source-health') || !src.includes('newsSourceHealthText')) {
  fail('ODP renderer must expose dedicated oil-news source-health/fallback text');
}
if (!src.includes('失败关闭') || !src.includes('不把单一路径报道写成确认事件')) {
  fail('ODP oil-news source-health copy must preserve fail-closed and no-single-path-confirmation wording');
}
if (
  !src.includes('odp-news-event-web-ngrams-health')
  || !src.includes('webNgramsSourceHealth')
  || !src.includes('gdelt-web-ngrams-display-fallback-cache-v1')
  || !src.includes('aggregate_source_health_only_no_headlines')
) {
  fail('ODP renderer must expose the P63 aggregate-only Web NGrams source-health row');
}
for (const marker of ['聚合背景样本门已通过', '聚合背景样本门待复核', '不用于当前新闻信号']) {
  if (!src.includes(marker)) {
    fail(`ODP Web NGrams aggregate-health copy must preserve marker: ${marker}`);
  }
}
// Replacement for the old mandatory thermal baseline/request-health, joint
// confirmation and readiness copy: a retired layer cannot receive any claims.
function retiredDomIds(text) {
  const ids = new Set();
  const stack = [];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const match of text.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    const token = match[0]; const tag = match[1].toLowerCase();
    if (token.startsWith('</')) {
      const index = stack.findLastIndex((entry) => entry.tag === tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    const retired = Boolean(stack.at(-1)?.retired || (/\shidden(?:\s|=|>)/.test(token) && /\sinert(?:\s|=|>)/.test(token) && /class="[^"]*\blegacy-model-retired\b/.test(token)));
    const id = token.match(/\bid="([^"]+)"/)?.[1];
    if (id && retired) ids.add(id);
    if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push({ tag, retired });
  }
  return ids;
}
const retiredIds = retiredDomIds(html);
for (const id of [
  'odp-thermal-status', 'odp-thermal-source', 'odp-thermal-request-health',
  'odp-thermal-window', 'odp-thermal-facility', 'odp-thermal-baseline-quality',
  'odp-thermal-signal', 'odp-thermal-note',
  'odp-cross-confirmation-status', 'odp-cross-confirmation-eia',
  'odp-cross-confirmation-market', 'odp-cross-confirmation-news',
  'odp-cross-confirmation-thermal', 'odp-cross-confirmation-summary', 'odp-cross-confirmation-note',
  'odp-evidence-readiness-matrix', 'odp-ladder-watch', 'odp-ladder-global',
  'odp-energy-transport-status', 'odp-energy-transport-date', 'odp-energy-transport-coverage',
  'odp-energy-transport-hormuz', 'odp-energy-transport-rerouting', 'odp-energy-transport-ais-caveat',
  'odp-energy-transport-core', 'odp-energy-transport-note',
]) {
  if (!retiredIds.has(id)) fail(`retired ODP compatibility element must remain hidden/inert: ${id}`);
  if (src.includes(`setLeafText('${id}',`) || src.includes(`setLeafText("${id}",`)) {
    fail(`retired ODP leaf must not receive a current conclusion: ${id}`);
  }
}
for (const symbol of [
  'renderSatelliteThermalWatch', 'thermalBaselineQualityText', 'thermalRequestHealthText',
  'crossConfirmationSummary', 'renderCrossConfirmation', 'renderEvidenceReadinessMatrix',
  'thermalReadiness', 'globalReadiness', 'transportReadiness', 'renderEnergyTransport',
]) {
  if (new RegExp(`\\b${symbol}\\s*\\(`).test(src)) fail(`retired ODP implementation/call must not return: ${symbol}`);
}
// No read of satellite data means even an old artifact cannot bypass its baseline
// maturity, request-health or facility-window qualification by supplying prose.
for (const marker of ['oilThermalWatchData', 'aggregate?.requestDiagnostics', 'elevatedRepeatedObservationCount', 'sourceReview.baselineQuality']) {
  if (src.includes(marker)) fail(`retired satellite evidence must not feed current display: ${marker}`);
}
// The original unsafe-field prohibition remains unconditional.
for (const forbidden of ['providerBody', 'responseBody', 'rawUrl', 'errorMessage']) {
  if (src.includes(forbidden)) {
    fail(`ODP renderer must not read unsafe FIRMS request field: ${forbidden}`);
  }
}
for (const marker of [
  'qualifyOdpDisplay(oilData, radarData)', 'const ev = qualified.evidence',
  'const finalBias = qualified.displayBias', 'priceContext: qualified.priceContext',
  '不独立确认、不提高置信', '仅供参考,不参与平台的风险打分与决策',
  '缺少同日同口径两腿报价与 ULSD 观察日，不判断收窄',
]) {
  if (!src.includes(marker)) fail(`qualified ODP observation boundary missing: ${marker}`);
}
for (const marker of ['多源部分确认', '多源同向', '/3 确认', 'deriveDisplayGlobalOverlay']) {
  if (src.includes(marker)) fail(`retired or unqualified confirmation must not return: ${marker}`);
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure zh-copy check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log(`Oil Directional Pressure zh-copy check: PASS (no trade-action words; all ${FINAL_BIAS_VALUES.length} finalBias labels; 暂不判断 fallback)`);
