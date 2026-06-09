// check:frontend-zh-copy — 前端用户可见文案「中文友好度」守卫。
//
// 背景:本站用户是纯中文用户。多次升级后,前端显示反复堆积工程英文(内部模块名、状态枚举、
// 裸字段名),对用户极不友好。本 checker 把"中文优先"做成机器强制:用户可见的显示文案不得
// 直显工程语言。
//
// 禁(必中文化):
//   - 内部模块/边界英文:scoring / decisionModel / executionLock / positionGuidance /
//     displayOnly / externalAiGenerated / promotionEligible / audit-only / display-only / ...
//   - snake_case 枚举/代号:multi_theater_stress / strong_confirmation / public_proxy_observation / ...
//   - 裸 camelCase 工程字段名:riskBias / crackSpread4wChange / decisionModifier / ...
//
// 放行(不算违规):
//   - 报刊双语美学:刊头 "Global Financial Risk Radar"、section kicker(英文大写)、
//     "中文标题 · English subtitle" 副标题模式、THIS ISSUE / AS OF。
//   - 金融标准缩写:VIX / PMI / NFCI / SLOOS / JOLTS / HY OAS / BDI / BDTI / BCTI /
//     WALCL / SOFR / EFFR / DXY / ETF 代码 等(均为 UPPERCASE/含空格,不触发下面的规则)。
//
// 范围:index.html 可见文本(剥标签/注释/属性)+ render 模块的 setLeafText/textContent 显示串。
//
// 新增前端显示时必跑此 checker(已并入 check:all)。要新增"允许的英文"请在下方白名单显式登记,
// 不要直接放宽规则。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (m) => errors.push(m);

// 明确禁止的工程英文(case-sensitive;出现在用户可见显示文案即违规)。
// 注意大小写:编辑副标题 "Scoring Method" 的 'Scoring' 大写,不在此列;工程 'scoring' 小写在列。
const FORBIDDEN_TERMS = [
  'audit-only', 'display-only', 'displayOnly',
  'scoring', 'decisionModel', 'executionLock', 'positionGuidance',
  'externalAiGenerated', 'usesExternalAiApi', 'notInvestmentAdvice',
  'promotionEligible', 'frontendDisplayApproved',
  'decisionModifier', 'riskBias', 'maxStateBoost', 'stateScore',
  'healthScore', 'sourceStatus', 'sourceMode', 'inputSource',
  'artifactDigest', 'sourceCommit', 'humanApproved', 'selectedBrent',
  'regime overlay', 'unknown-source', 'production data write',
];

// snake_case 枚举/代号(全小写词以下划线连接)= 一律工程语言,中文里不会自然出现。
const SNAKE_CASE = /[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g;

// 显式登记的"可审计标识符"白名单 —— 这些是 External AI 溯源/审计块里有意保留给审计核对的
// 标识符(owner 决定:字段名标签已中文化,代号本身作为标识符保留)。新增登记须是确属"审计溯源
// 用途"的代号,不是图省事放行普通工程枚举。
const SNAKE_CASE_ALLOW = new Set([
  'local_compact', 'manual_local_compact',         // provenance: 输入源 / 来源模式
  'manual_artifact_only', 'site_structured_data_only',
  'validator_required', 'non_production_output', 'no_frontend_display', // auditFlags
]);

function scanText(text, where) {
  for (const term of FORBIDDEN_TERMS) {
    if (text.includes(term)) {
      fail(`${where}: 用户可见文案含工程英文 '${term}' — 改成中文人话(或登记为编辑/金融白名单)`);
    }
  }
  let m;
  SNAKE_CASE.lastIndex = 0;
  while ((m = SNAKE_CASE.exec(text))) {
    if (SNAKE_CASE_ALLOW.has(m[0])) continue;
    fail(`${where}: 用户可见文案直显 snake_case 工程代号 '${m[0]}' — 改成中文标签`);
  }
}

// ---------- 1. index.html 可见文本(剥注释 → 剥标签连带属性 → 解 HTML 实体噪音忽略)----------
const html = readFileSync(resolve('index.html'), 'utf8');
const visibleText = html
  .replace(/<!--[\s\S]*?-->/g, ' ')   // 注释
  .replace(/<[^>]+>/g, ' ');          // 标签 + 属性(id/class 里的工程名不算用户可见)
scanText(visibleText, 'index.html 可见文本');

// ---------- 2. render 模块的显示串(setLeafText/setBadge 字符串参数 + .textContent 赋值)----------
const RENDER_MODULES = ['renderOilDirectional.js', 'renderMacroOverview.js'];
const DISPLAY_STRING =
  /(?:setLeafText|setBadge)\s*\([^,]+,\s*(`[^`]*`|'[^']*'|"[^"]*")|\.textContent\s*=\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
const DISPLAY_PROPERTY_STRING =
  /\b(?:activeText|shortName|name|description)\s*:\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
const MINI_CARD_CALL = /setMiniCardState\s*\(([\s\S]*?)\);/g;
const STRING_LITERAL = /`[^`]*`|'[^']*'|"[^"]*"/g;

function scanRawLiteral(raw, where) {
  const inner = raw.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
  scanText(inner, where);
}

for (const mod of RENDER_MODULES) {
  const src = readFileSync(resolve('scripts/modules', mod), 'utf8');
  let m;
  DISPLAY_STRING.lastIndex = 0;
  while ((m = DISPLAY_STRING.exec(src))) {
    const raw = m[1] || m[2] || '';
    // 去首尾引号/反引号;再去模板插值 ${expr}(那是代码/变量名,不是用户看到的显示文本)。
    scanRawLiteral(raw, `${mod} 显示串`);
  }
  DISPLAY_PROPERTY_STRING.lastIndex = 0;
  while ((m = DISPLAY_PROPERTY_STRING.exec(src))) {
    scanRawLiteral(m[1], `${mod} 显示属性`);
  }
  MINI_CARD_CALL.lastIndex = 0;
  while ((m = MINI_CARD_CALL.exec(src))) {
    const callBody = m[1] || '';
    let lit;
    STRING_LITERAL.lastIndex = 0;
    while ((lit = STRING_LITERAL.exec(callBody))) {
      scanRawLiteral(lit[0], `${mod} mini-card 显示串`);
    }
  }
}

if (errors.length > 0) {
  console.error('Frontend zh-copy check FAILED — 用户可见文案出现工程英文 / snake_case 代号:');
  errors.forEach((e) => console.error('  -', e));
  console.error(
    '\n规则:前端用户可见显示文案必须中文优先。' +
    '保留报刊双语美学(刊头 / section kicker / 「中文 · English」副标题)+ 金融标准缩写(VIX / PMI / HY OAS / BDI 等);' +
    '工程内部名 / snake_case 枚举 / 裸字段名一律中文化。新增"允许英文"请在 FORBIDDEN_TERMS / SNAKE_CASE_ALLOW 显式登记,不要放宽规则。'
  );
  process.exit(1);
}

console.log('Frontend zh-copy check: PASS (用户可见文案无工程英文 / snake_case 代号)');
