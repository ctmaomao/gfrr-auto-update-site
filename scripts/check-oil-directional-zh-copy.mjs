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
// P50: satellite thermal watch must expose baseline quality/sample-window copy
// and keep the short-window starter caveat visible.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FINAL_BIAS_VALUES } from './oil-directional/odp-classifier.mjs';

const errors = [];
const fail = (m) => errors.push(m);

const src = readFileSync(resolve('scripts/modules/renderOilDirectional.js'), 'utf8');

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
if (!src.includes('不展示标题原文')) {
  fail('ODP oil-news copy must explicitly state that original headlines are not displayed');
}
if (!src.includes('odp-news-event-source-health') || !src.includes('newsSourceHealthText')) {
  fail('ODP renderer must expose dedicated oil-news source-health/fallback text');
}
if (!src.includes('失败关闭') || !src.includes('不把单一路径报道写成确认事件')) {
  fail('ODP oil-news source-health copy must preserve fail-closed and no-single-path-confirmation wording');
}
if (!src.includes('odp-thermal-baseline-quality') || !src.includes('thermalBaselineQualityText')) {
  fail('ODP satellite thermal watch must expose baseline quality/sample-window text');
}
for (const marker of [
  '短窗口起步基线',
  '小于 7 天',
  '不是成熟季节性或长历史运行基线',
]) {
  if (!src.includes(marker)) {
    fail(`ODP satellite thermal baseline copy must preserve marker: ${marker}`);
  }
}
if (!src.includes('sampleWindowDays') || !src.includes('sampleCount') || !src.includes('starter_short_window')) {
  fail('ODP satellite thermal baseline copy must read sampleWindowDays and starter_short_window');
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure zh-copy check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log(`Oil Directional Pressure zh-copy check: PASS (no trade-action words; all ${FINAL_BIAS_VALUES.length} finalBias labels; 暂不判断 fallback)`);
