import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const INDEX_PATH = 'index.html';
const STYLES_PATH = 'assets/styles.css';
const MACRO_OVERVIEW_PATH = 'scripts/modules/renderMacroOverview.js';
const RENDER_TABLES_PATH = 'scripts/modules/renderTables.js';
const PACKAGE_PATH = 'package.json';
const DESIGN_PATH = 'DESIGN.md';
const MARKET_PRICING_HISTORY_PATH = 'data/market-pricing-history.json';

const html = fs.readFileSync(INDEX_PATH, 'utf8');
const styles = fs.readFileSync(STYLES_PATH, 'utf8');
const macroOverview = fs.readFileSync(MACRO_OVERVIEW_PATH, 'utf8');
const renderTables = fs.readFileSync(RENDER_TABLES_PATH, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
const designContract = fs.readFileSync(DESIGN_PATH, 'utf8');
const errors = [];

function fail(message) {
  errors.push(message);
}

function textOnly(source) {
  return source
    .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function includesAny(source, markers) {
  return markers.some((marker) => source.includes(marker));
}

function requireMarker(source, label, marker) {
  if (!source.includes(marker)) fail(`${label} missing required marker: ${marker}`);
}

function requireAnyMarker(source, label, markers) {
  if (!includesAny(source, markers)) fail(`${label} missing one of required markers: ${markers.join(' | ')}`);
}

function getNavLinks() {
  const navMatch = html.match(/<nav\b[^>]*class=["'][^"']*\bdashboard-jump-nav\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/iu);
  if (!navMatch) {
    fail('homepage jump nav missing');
    return [];
  }

  return [...navMatch[1].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)]
    .map((match) => ({
      href: match[1],
      label: textOnly(match[2]),
    }));
}

function firstIndexOfAny(source, markers) {
  const indexes = markers
    .map((marker) => source.indexOf(marker))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function extractHeadStyleBlocks() {
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu);
  if (!headMatch) {
    fail('index.html missing <head> block');
    return '';
  }
  return [...headMatch[1].matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)]
    .map((match) => match[1])
    .join('\n');
}

function extractCssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 'u'))?.[0] ?? '';
}

function findElementStartById(source, id) {
  const pattern = new RegExp(`<([a-z0-9-]+)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'iu');
  const match = pattern.exec(source);
  if (!match) return null;
  return {
    tagName: match[1].toLowerCase(),
    index: match.index,
    source: match[0],
  };
}

function findMatchingCloseTag(source, startIndex, tagName) {
  const pattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'giu');
  pattern.lastIndex = startIndex;
  let depth = 0;
  let match;
  while ((match = pattern.exec(source))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return pattern.lastIndex;
  }
  return -1;
}

function sliceElementById(source, id) {
  const start = findElementStartById(source, id);
  if (!start) return '';
  const end = findMatchingCloseTag(source, start.index, start.tagName);
  if (end === -1) {
    fail(`${id} must have a matching </${start.tagName}>`);
    return '';
  }
  return source.slice(start.index, end);
}

function topLevelEditorialSubsections(sectionHtml) {
  const tagPattern = /<\/?([a-z0-9-]+)\b[^>]*>/giu;
  const stack = [];
  const subsections = [];
  let match;
  while ((match = tagPattern.exec(sectionHtml))) {
    const tagName = match[1].toLowerCase();
    const tagSource = match[0];

    if (tagSource.startsWith('</')) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tagName === tagName) {
          stack.splice(index, 1);
          break;
        }
      }
      continue;
    }

    const isEditorialSubsection = tagName === 'details' && /\beditorial-subsection\b/u.test(tagSource);
    const hasEditorialSubsectionAncestor = stack.some((entry) => entry.isEditorialSubsection);
    if (isEditorialSubsection && !hasEditorialSubsectionAncestor) {
      const end = findMatchingCloseTag(sectionHtml, match.index, tagName);
      if (end === -1) {
        fail(`editorial-subsection in ${sectionHtml.slice(0, 80)} must have a matching </details>`);
      } else {
        subsections.push(sectionHtml.slice(match.index, end));
      }
    }

    if (!tagSource.endsWith('/>')) {
      stack.push({ tagName, isEditorialSubsection });
    }
  }
  return subsections;
}

function checkHomepageIa() {
  const expectedLinks = [
    ['今日总判断', '#homepage-today-judgment'],
    ['压力来源', '#homepage-pressure-sources'],
    ['信号分层', '#homepage-signal-layers'],
    ['四大驱动', '#homepage-macro-drivers'],
    ['市场温度', '#homepage-market-temperature'],
    ['风险引擎', '#homepage-risk-engines'],
    ['交叉验证', '#homepage-cross-validation'],
    ['本期关键变化', '#wow-key-changes'],
    ['宏观主题卡阵', '#macro-thematic-cards'],
    ['风险热力图', '#global-risk-heatmap'],
    ['详细数据', '#detail-data'],
    ['世界秩序', '#world-order-stress-section'],
    ['方法说明', '#method-evidence'],
    ['外部 AI', '#external-ai-auxiliary'],
    ['执行风控', '#execution-risk-detail'],
  ];

  const links = getNavLinks();
  const actual = links.map((link) => `${link.label}|${link.href}`).join('\n');
  const expected = expectedLinks.map(([label, href]) => `${label}|${href}`).join('\n');
  if (actual !== expected) fail('homepage nav must keep the exact 15-item editorial IA order and labels');
}

function checkThemeFoundation() {
  const requiredStyleMarkers = [
    '--editorial-paper',
    '--editorial-ink',
    '--font-display',
    '--font-body',
    '--font-mono',
    'Playfair Display',
    'Noto Serif SC',
    'IBM Plex Mono',
  ];
  for (const marker of requiredStyleMarkers) requireMarker(styles, STYLES_PATH, marker);
  requireAnyMarker(styles, STYLES_PATH, ['#FBF7F0', '#fbf7f0']);
}

function checkDesignContractDoc() {
  const requiredMarkers = [
    '本文档是设计合约',
    'The Bubble Watch / AI 泡沫监测',
    '--paper-bg: #FBF7F0',
    '--paper-ink: #1A1815',
    '--font-display',
    '--font-serif',
    '--font-mono',
    'Playfair Display',
    'Noto Serif SC',
    'IBM Plex Mono',
    'dashboard-jump-nav            (顶部跳转导航 15 项)',
    '#macro-risk-overview',
    '#wow-key-changes',
    '#homepage-realtime-band',
    '#macro-thematic-cards',
    '#global-risk-heatmap',
    '#detail-data',
    '#world-order-stress-section',
    '#method-evidence',
    '#external-ai-auxiliary',
    '#execution-risk-detail',
    '本 PR 符合 DESIGN.md 的所有规则',
    '#plain-summary-card',
    'non-nav preface block',
    'PR #164（本 PR）',
  ];
  for (const marker of requiredMarkers) requireMarker(designContract, DESIGN_PATH, marker);
}

function checkDesignContractM32Amendments() {
  const requiredMarkers = [
    '--paper-bg-canvas: #F5F0E5',
    '图表 / 画布容器背景',
    'section / card 主背景使用任何渐变',
    '装饰性 ::before / ::after',
    '数据可视化色阶',
    'M-32 修订',
    '主背景: section / card / body 的 background 属性',
    '装饰层: ::before / ::after 伪元素',
  ];
  for (const marker of requiredMarkers) requireMarker(designContract, DESIGN_PATH, marker);
}

function checkExternalUrlGuard() {
  const scannedFiles = [
    [INDEX_PATH, html],
    [STYLES_PATH, styles],
    [MACRO_OVERVIEW_PATH, macroOverview],
  ];
  const forbiddenPatterns = [
    [/fonts\.gstatic\.com/iu, 'Google Fonts asset URL'],
    [/@import\s+url\s*\(/iu, '@import url()'],
    [/cdn\.jsdelivr/iu, 'jsDelivr CDN URL'],
    [/unpkg\.com/iu, 'unpkg CDN URL'],
  ];

  for (const [filePath, source] of scannedFiles) {
    for (const [pattern, label] of forbiddenPatterns) {
      if (pattern.test(source)) fail(`${filePath} must not introduce ${label} into the editorial theme surface`);
    }

    for (const urlText of extractExternalUrls(source)) {
      if (isAllowedGoogleFontsStylesheetUrl(urlText)) continue;
      if (/fonts\.googleapis\.com/iu.test(urlText)) {
        fail(`${filePath} must not introduce a non-allowlisted Google Fonts stylesheet URL into the editorial theme surface`);
      } else {
        fail(`${filePath} must not introduce external URL into the editorial theme surface: ${urlText}`);
      }
    }
  }
}

function extractExternalUrls(source) {
  return [...source.matchAll(/https?:\/\/[^\s"'<>\\)]+/giu)].map((match) => match[0]);
}

function isAllowedGoogleFontsStylesheetUrl(urlText) {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'fonts.googleapis.com') return false;
  if (!url.pathname.startsWith('/css')) return false;

  const families = url.searchParams
    .getAll('family')
    .map((family) => family.split(':')[0].trim())
    .filter(Boolean);

  // Font allowlist: Bubble Watch editorial redesign adopted three-stack fonts
  // (Playfair Display / Noto Serif SC / IBM Plex Mono) via Google Fonts CDN.
  // Only these three families are permitted. Any other external font load
  // (including other Google Fonts families) remains prohibited.
  const allowedFamilies = new Set(['Playfair Display', 'Noto Serif SC', 'IBM Plex Mono']);
  return families.length > 0 && families.every((family) => allowedFamilies.has(family));
}

function checkEditorialStructures() {
  const combined = `${html}\n${macroOverview}\n${styles}`;
  const requiredMarkers = [
    'editorial-big-number',
    'GLOBAL RISK SCORE',
    'editorial-verdict',
    "TODAY\\'S VERDICT",
    'editorial-threshold',
    'THRESHOLD-ALIGNED RISK STAGE SCALE',
    '正常观察',
    '压力上升',
    '局部冲击观察',
    '系统性风险观察',
    "'wow-key-changes'",
    'wow-section',
    '本期关键变化 · Week-over-Week',
    'wow-grid',
    'wow-item',
    'wow-source',
    '本期关键变化',
    'this issue\\\'s deltas',
    "'homepage-pressure-sources'",
    'PRESSURE SOURCES',
    '六大底层模块 · data.modules 扁平数字 · data.moduleTrends 趋势',
    'appendMiniGrid',
    'appendMiniCard',
    'mini-grid',
    'mini-card',
    'Energy 能源',
    'Geopolitical 地缘',
    'Inflation 通胀',
    'Liquidity 流动性',
    'Debt 债务',
    'Banking 银行',
    "'homepage-signal-layers'",
    'SIGNAL LAYERS · 7 NARRATIVES',
    'deriveSignalMeta',
    'appendNarrativeList',
    'appendNarrativeItem',
    'narrative-list',
    'narrative-item',
    'energy_shock',
    '能源冲击',
    'stagflation_pressure',
    '滞胀压力',
    'risk_asset_mismatch',
    '风险资产错配',
    'overheat_confirmation',
    '过热确认',
    'credit_spread_warning',
    '信用利差告警',
    'liquidity_tightening',
    '流动性收紧',
    'world_order_pressure_crossing',
    '世界秩序压力穿越',
    "'homepage-risk-engines'",
    'RISK ENGINES · 6 ENGINES + AUXILIARY',
    'data.modules 6 引擎 + divergenceLayer + privateCreditProxy + worldOrderStress + marketTemperature 等多源派生',
    'B1 Energy',
    'B2 Liquidity',
    'B3 Credit',
    'B4 Debt',
    'B5 Consumer',
    'B6 Geopolitical',
    "'homepage-cross-validation'",
    'CROSS VALIDATION MATRIX',
    'consistency-block',
  ];
  for (const marker of requiredMarkers) requireMarker(combined, 'editorial redesign structures', marker);
  for (const marker of [
    'appendEditorialPressureCard',
    'appendEditorialPressureSublist',
    'editorial-pressure-grid',
    'appendEditorialSignalCard',
    'appendEditorialSignalSublist',
    'editorial-signal-grid',
    'buildSignalCategorySummary',
    'buildSignalCounts',
    'signalStatusClass',
    'signalBucketLabel',
    'appendEditorialEngineCard',
    'appendEditorialEngineSublist',
    'editorial-engine-grid',
  ]) {
    if (macroOverview.includes(marker)) fail(`legacy runtime marker must be removed from ${MACRO_OVERVIEW_PATH}: ${marker}`);
  }
  for (const marker of ['.wow-tag.is-up', '.wow-tag.is-down', '.wow-tag.is-flat', '.mini-card.red', '.mini-card.yellow', '.mini-card.green', '.narrative-list', '.narrative-item', '.narrative-item.active']) {
    requireMarker(styles, STYLES_PATH, marker);
  }

  const stageAreaStart = macroOverview.indexOf('function stageFromScore');
  const thresholdAreaStart = firstIndexOfAny(macroOverview, [
    'function appendRiskStageScale',
    'function appendThresholdScale',
    'editorial-threshold',
  ]);
  const stageArea = stageAreaStart >= 0 ? macroOverview.slice(stageAreaStart, stageAreaStart + 900) : '';
  const thresholdArea = thresholdAreaStart >= 0 ? macroOverview.slice(thresholdAreaStart, thresholdAreaStart + 2600) : '';
  const thresholdSource = `${stageArea}\n${thresholdArea}`;
  for (const value of ['0', '50', '65', '85', '100']) {
    if (!new RegExp(`\\b${value}\\b`, 'u').test(thresholdSource)) {
      fail(`threshold/stage source must preserve ${value} semantic marker`);
    }
  }
}

function checkMarketPricingTemperatureContract() {
  const requiredMarkers = [
    'appendMarketTemperatureBody',
    'homepage-market-temperature',
    'runtime-block',
    'market-temp-layout',
    'market-temp-zscore',
    'market-temp-metrics',
    'classifyZScoreBucket',
    '本数据为统计描述，不构成投资建议。',
    'QQQ',
    'NDX/IXIC',
    '60 周均值',
    '标准差',
    'z-score',
  ];
  for (const marker of requiredMarkers) requireMarker(macroOverview, MACRO_OVERVIEW_PATH, marker);
  requireAnyMarker(macroOverview, MACRO_OVERVIEW_PATH, ['MARKET PRICING TEMPERATURE', '市场温度']);
  for (const marker of [
    'market-temp-layout',
    'market-temp-bucket',
    'market-temp-zscore',
    'market-temp-sub',
    'market-temp-detail',
    'market-temp-metrics',
  ]) {
    requireMarker(styles, STYLES_PATH, marker);
  }
  for (const marker of ['buildCrossValidationMatrix', 'crossValidationMatrix', 'consistencyScore', 'oneLineSummary']) {
    requireMarker(macroOverview, MACRO_OVERVIEW_PATH, marker);
  }
  for (const marker of ['consistency-block', 'consistency-bar', 'consistency-detail']) {
    requireMarker(styles, STYLES_PATH, marker);
  }

  const changedFiles = [
    ...gitDiffNames(['diff', '--name-only', '--', MARKET_PRICING_HISTORY_PATH]),
    ...gitDiffNames(['diff', '--cached', '--name-only', '--', MARKET_PRICING_HISTORY_PATH]),
  ];
  if (changedFiles.length) fail(`${MARKET_PRICING_HISTORY_PATH} must not be modified by editorial redesign guard work`);
}

function gitDiffNames(args) {
  try {
    const output = execFileSync('git', args, { encoding: 'utf8' }).trim();
    return output ? output.split(/\r?\n/u) : [];
  } catch {
    fail(`unable to inspect git diff for ${MARKET_PRICING_HISTORY_PATH}`);
    return [];
  }
}

function checkExternalAiBoundary() {
  const requiredHtmlMarkers = [
    'id="external-ai-display-panel"',
    'hidden',
    'aria-hidden="true"',
    '外部 AI 解读（只读辅助）',
    '不改变评分',
  ];
  for (const marker of requiredHtmlMarkers) requireMarker(html, INDEX_PATH, marker);
  requireAnyMarker(html, INDEX_PATH, ['READ-ONLY AUXILIARY INTERPRETATION', 'read-only auxiliary']);
  requireAnyMarker(html, INDEX_PATH, ['decision', '决策']);
  requireAnyMarker(html, INDEX_PATH, ['execution', '执行']);
  requireAnyMarker(html, INDEX_PATH, ['position guidance', '仓位']);
  requireMarker(styles, STYLES_PATH, 'editorial-external-ai-panel');
  requireMarker(styles, STYLES_PATH, 'editorial-external-ai-card');
}

function checkHeatmapStandalone() {
  const requiredMarkers = [
    'id="global-risk-heatmap"',
    'id="world-heatmap"',
    'id="heatmap-list"',
    'GLOBAL RISK HEATMAP',
  ];
  for (const marker of requiredMarkers) requireMarker(html, INDEX_PATH, marker);
  requireAnyMarker(html, INDEX_PATH, ['独立视觉证据层', 'evidence-layer explanation', '证据层的一部分']);

  const heatmapIndex = html.indexOf('id="global-risk-heatmap"');
  const detailIndex = html.indexOf('id="detail-data"');
  const methodIndex = html.indexOf('id="method-evidence"');
  if (heatmapIndex < 0 || detailIndex < 0 || methodIndex < 0) return;
  if (!(heatmapIndex < detailIndex && detailIndex < methodIndex)) {
    fail('Global Risk Heatmap, Detail Data, and Method Evidence must keep standalone reading order');
  }
}

function checkAppendices() {
  const requiredMarkers = [
    'id="detail-data"',
    'id="detail-data-header"',
    'DATA APPENDIX',
    'editorial-section-folded',
    'editorial-folded-content',
    'id="world-order-stress-section"',
    'REGIME OVERLAY',
    'id="method-evidence"',
    'METHOD / EVIDENCE / BOUNDARY',
    'id="external-ai-auxiliary"',
    'id="execution-risk-detail"',
  ];
  for (const marker of requiredMarkers) requireMarker(html, INDEX_PATH, marker);
}

function checkTopLevelSubsectionKickers() {
  const checkedSections = [
    ['#detail-data', 'detail-data'],
    ['#execution-risk-detail', 'execution-risk-detail'],
  ];
  for (const [label, id] of checkedSections) {
    const sectionHtml = sliceElementById(html, id);
    if (!sectionHtml) {
      fail(`${label} must exist for subsection kicker validation`);
      continue;
    }

    const subsections = topLevelEditorialSubsections(sectionHtml);
    if (subsections.length === 0) {
      fail(`${label} must contain top-level editorial-subsection entries`);
      continue;
    }

    for (const subsection of subsections) {
      const summaryMatch = subsection.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/iu);
      if (!summaryMatch) {
        fail(`${label} top-level editorial-subsection missing summary`);
        continue;
      }
      const summaryHtml = summaryMatch[1];
      if (!/<span\b[^>]*class=["'][^"']*\bsubsection-meta\b[^"']*["'][^>]*>/iu.test(summaryHtml)) {
        fail(`${label} top-level editorial-subsection summary missing .subsection-meta kicker: ${textOnly(summaryHtml)}`);
      }
    }
  }

  const methodSection = sliceElementById(html, 'method-evidence');
  if (!methodSection) {
    fail('#method-evidence must exist for method-grid validation');
  } else {
    if (!/\beditorial-method-grid\b/u.test(methodSection)) {
      fail('#method-evidence must keep the editorial method grid');
    }
    if (topLevelEditorialSubsections(methodSection).length > 0) {
      fail('#method-evidence must not contain top-level editorial-subsection data details');
    }
  }
}

function checkInlineDarkThemeCleanup() {
  const inlineStyles = extractHeadStyleBlocks();
  const forbiddenInlineMarkers = [
    'rgba(15, 23, 42, 0.72)',
    'rgba(20, 31, 48, 0.9)',
    'rgba(12, 20, 34, 0.9)',
    '#4f86ff',
    '#82d9ff',
    'linear-gradient(90deg, #4f86ff, #82d9ff)',
    '#f8fafc',
    '#dbeafe',
    '#aebed2',
    '#94a3b8',
    '#bfd5ee',
    '#a8c0da',
  ];
  const lowerInlineStyles = inlineStyles.toLowerCase();
  for (const marker of forbiddenInlineMarkers) {
    if (lowerInlineStyles.includes(marker.toLowerCase())) {
      fail(`inline <head><style> must not reintroduce legacy dark-blue theme marker: ${marker}`);
    }
  }
}

function checkMethodCardBorderRadius() {
  const methodCardRule = extractCssRule(styles, '.editorial-method-card');
  if (!methodCardRule) {
    fail('.editorial-method-card rule missing from assets/styles.css');
    return;
  }
  if (/border-radius:\s*[1-9]/u.test(methodCardRule)) {
    fail('.editorial-method-card must use border-radius: 0 per DESIGN.md §6.2 / §8.1 #1');
  }
}

function checkMethodCardAccentConsistency() {
  const methodCardRule = extractCssRule(styles, '.editorial-method-card');
  if (!methodCardRule.includes('border-left:') || !methodCardRule.includes('--method-card-accent')) {
    fail('.editorial-method-card must define a left accent stripe using --method-card-accent');
  }

  const methodGridMatch = html.match(/<section\b[^>]*class=["'][^"']*\beditorial-method-grid\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/iu);
  if (!methodGridMatch) {
    fail('method evidence grid missing from index.html');
    return;
  }

  const methodCards = [...methodGridMatch[1].matchAll(/<article\b(?=[^>]*class=["'][^"']*\beditorial-method-card\b[^"']*["'])([^>]*)>([\s\S]*?)<\/article>/giu)]
    .map((match) => ({
      attrs: match[1],
      body: match[2],
    }));

  if (methodCards.length !== 6) {
    fail(`method evidence grid must contain exactly 6 editorial-method-card articles; got ${methodCards.length}`);
    return;
  }

  const expectedCards = [
    ['READING PATH', 'var(--paper-ink)'],
    ['EVIDENCE LAYERS', 'var(--paper-ink)'],
    ['DATA BOUNDARY', 'var(--editorial-orange)'],
    ['AI BOUNDARY', 'var(--paper-muted)'],
    ['NOT ADVICE', 'var(--risk-red)'],
    ['GOVERNANCE', 'var(--paper-ink)'],
  ];

  expectedCards.forEach(([label, accent], index) => {
    const card = methodCards[index];
    if (!card.body.includes(label)) {
      fail(`method evidence card ${index + 1} must preserve label ${label}`);
    }
    if (!new RegExp(`style=["'][^"']*--method-card-accent:\\s*${accent.replace(/[()]/gu, '\\$&')}\\s*;?[^"']*["']`, 'u').test(card.attrs)) {
      fail(`method evidence card ${label} must set --method-card-accent: ${accent}`);
    }
  });
}

function checkHeatmapFrameBorderStrength() {
  const heatmapFrameRule = extractCssRule(styles, '.heatmap-frame');
  if (!heatmapFrameRule) {
    fail('.heatmap-frame rule missing from assets/styles.css');
    return;
  }
  if (!/border\s*:\s*1px\s+solid\s+var\(--paper-line-strong\)/u.test(heatmapFrameRule)) {
    fail('.heatmap-frame must use border: 1px solid var(--paper-line-strong)');
  }
}

function checkPaperCanvasToken() {
  const rootRule = extractCssRule(styles, ':root');
  if (!/--paper-bg-canvas\s*:\s*#F5F0E5\s*;/iu.test(rootRule)) {
    fail(':root must define --paper-bg-canvas: #F5F0E5 for chart/canvas containers');
  }
}

function checkHeatmapFrameCanvasBackground() {
  const heatmapFrameRule = extractCssRule(styles, '.heatmap-frame');
  if (!heatmapFrameRule) {
    fail('.heatmap-frame rule missing from assets/styles.css');
    return;
  }
  if (!/background\s*:\s*var\(--paper-bg-canvas\)/u.test(heatmapFrameRule)) {
    fail('.heatmap-frame must use background: var(--paper-bg-canvas)');
  }
}

function checkBiasSemanticColors() {
  const rootRule = extractCssRule(styles, ':root');
  const strongRule = extractCssRule(styles, '.badge.strong');
  const strongMidRule = extractCssRule(styles, '.badge.strong-mid');
  const cautiousBearRule = extractCssRule(styles, '.badge.cautious-bear');
  const methodCardRule = extractCssRule(styles, '.editorial-method-card');
  const methodBoundaryRule = extractCssRule(styles, '.editorial-method-boundary');

  if (!/--risk-green-soft\s*:\s*rgba\(31,\s*77,\s*44,\s*0\.78\)\s*;/u.test(rootRule)) {
    fail(':root must define --risk-green-soft for mild bullish bias badges');
  }
  if (!/background\s*:\s*var\(--risk-green\)/u.test(strongRule)) {
    fail('.badge.strong must use var(--risk-green) for bullish / strong allocation semantics');
  }
  if (!/background\s*:\s*var\(--risk-green-soft\)/u.test(strongMidRule)) {
    fail('.badge.strong-mid must use var(--risk-green-soft)');
  }
  if (!/background\s*:\s*var\(--risk-orange\)/u.test(cautiousBearRule)) {
    fail('.badge.cautious-bear must use var(--risk-orange)');
  }
  if (!/\.badge\.underweight\s*\{\s*background\s*:\s*var\(--risk-red\)\s*\}/u.test(styles)) {
    fail('.badge.underweight must use var(--risk-red) for bearish / underweight semantics');
  }
  if (!/background\s*:\s*rgba\(238,\s*231,\s*219,\s*0\.86\)/u.test(methodCardRule)) {
    fail('.editorial-method-card must use the unified DATA BOUNDARY warm background');
  }
  if (/background\s*:/u.test(methodBoundaryRule)) {
    fail('.editorial-method-boundary must not override the unified method-card background');
  }

  const requiredRenderMarkers = [
    'function classifyBiasMatrix',
    'function classifyBiasReturnMap',
    "return 'strong-mid'",
    "return 'cautious-bear'",
    'classifyBiasMatrix(row.bias)',
    'classifyBiasReturnMap(row.bias)',
  ];
  for (const marker of requiredRenderMarkers) requireMarker(renderTables, RENDER_TABLES_PATH, marker);
}

function checkGroupAArticleCardSpacing() {
  const articleCardRule = extractCssRule(styles, '.editorial-subsection > article.card');
  const metricRowResetRule = extractCssRule(styles, '.editorial-subsection > article.card > .metric-row');
  const paragraphResetRule = extractCssRule(styles, '.editorial-subsection > article.card > p');

  if (!/display\s*:\s*flex/u.test(articleCardRule)) {
    fail('.editorial-subsection > article.card must use display: flex for Group A spacing governance');
  }
  if (!/flex-direction\s*:\s*column/u.test(articleCardRule)) {
    fail('.editorial-subsection > article.card must use flex-direction: column');
  }
  if (!/gap\s*:\s*18px/u.test(articleCardRule)) {
    fail('.editorial-subsection > article.card must use gap: 18px');
  }
  if (!/margin-top\s*:\s*0/u.test(metricRowResetRule)) {
    fail('.editorial-subsection > article.card > .metric-row must reset margin-top to 0');
  }
  if (!/margin\s*:\s*0/u.test(paragraphResetRule)) {
    fail('.editorial-subsection > article.card > p must reset paragraph margins to 0');
  }
  if (styles.includes('#ai-interpretation-layer-section .grid.hero-grid')) {
    fail('M-33 ai-interpretation hero-grid case patch must be retired in favor of Group A article.card gap');
  }

  const worldOrderStatusRule = extractCssRule(extractHeadStyleBlocks(), '.world-order-status-grid');
  if (/margin-top\s*:\s*18px/u.test(worldOrderStatusRule)) {
    fail('.world-order-status-grid must not carry its own margin-top: 18px; parent flex gap governs spacing');
  }
}

function checkGroupBSingleCardSpacing() {
  const articleCardRule = extractCssRule(styles, '.editorial-subsection > section.full-width-section > article.card');
  const metricRowResetRule = extractCssRule(styles, '.editorial-subsection > section.full-width-section > article.card > .metric-row');
  const paragraphResetRule = extractCssRule(styles, '.editorial-subsection > section.full-width-section > article.card > p');
  const listResetRule = extractCssRule(styles, '.editorial-subsection > section.full-width-section > article.card > ul');

  if (!/display\s*:\s*flex/u.test(articleCardRule)) {
    fail('.editorial-subsection > section.full-width-section > article.card must use display: flex for Group B spacing governance');
  }
  if (!/flex-direction\s*:\s*column/u.test(articleCardRule)) {
    fail('.editorial-subsection > section.full-width-section > article.card must use flex-direction: column');
  }
  if (!/gap\s*:\s*18px/u.test(articleCardRule)) {
    fail('.editorial-subsection > section.full-width-section > article.card must use gap: 18px');
  }
  if (!/margin-top\s*:\s*0/u.test(metricRowResetRule)) {
    fail('.editorial-subsection > section.full-width-section > article.card > .metric-row must reset margin-top to 0');
  }
  if (!/margin\s*:\s*0/u.test(paragraphResetRule)) {
    fail('.editorial-subsection > section.full-width-section > article.card > p must reset paragraph margins to 0');
  }
  if (!/margin-top\s*:\s*0/u.test(listResetRule) || !/margin-bottom\s*:\s*0/u.test(listResetRule)) {
    fail('.editorial-subsection > section.full-width-section > article.card > ul must reset top and bottom margins to 0');
  }
}

function checkFooterMethodStructure() {
  const footerMatch = html.match(/<footer\b[^>]*class=["'][^"']*\bfooter-method\b[^"']*["'][^>]*>([\s\S]*?)<\/footer>/iu);
  if (!footerMatch) {
    fail('index.html must include footer.footer-method');
    return;
  }

  const footer = footerMatch[0];
  if (!footer.includes('footer-method-grid')) fail('footer.footer-method must include .footer-method-grid');
  const blockCount = [...footer.matchAll(/\bfooter-method-block\b/giu)].length;
  if (blockCount !== 2) fail(`footer.footer-method must include exactly 2 footer-method-block elements; got ${blockCount}`);
  requireMarker(footer, 'footer.footer-method', '<h4>方法论</h4>');
  requireMarker(footer, 'footer.footer-method', '<h4>免责</h4>');
  requireMarker(footer, 'footer.footer-method', '本站采用三层风险框架');
  requireMarker(footer, 'footer.footer-method', '不构成投资建议');
  requireMarker(footer, 'footer.footer-method', '2026-05-14');

  const forbiddenFooterMarkers = ['历史对照', 'dot-com', '1929', '2000', '2008', '1845', 'telecom', 'AI 泡沫'];
  for (const marker of forbiddenFooterMarkers) {
    if (footer.includes(marker)) fail(`footer.footer-method must not include historical comparison marker: ${marker}`);
  }

  const footerRule = extractCssRule(styles, '.footer-method');
  const footerGridRule = extractCssRule(styles, '.footer-method-grid');
  const footerHeadingRule = extractCssRule(styles, '.footer-method-block h4');
  const footerParagraphRule = extractCssRule(styles, '.footer-method-block p');
  const footerDateRule = extractCssRule(styles, '.footer-method-block .footer-date');
  const footerStyles = [footerRule, footerGridRule, footerHeadingRule, footerParagraphRule, footerDateRule].join('\n');

  if (!/border-top\s*:\s*3px\s+double\s+var\(--paper-ink\)/u.test(footerRule)) {
    fail('.footer-method must use border-top: 3px double var(--paper-ink)');
  }
  if (!/font-family\s*:\s*var\(--font-mono\)/u.test(footerRule)) {
    fail('.footer-method must use font-family: var(--font-mono)');
  }
  if (!/color\s*:\s*var\(--paper-muted\)/u.test(footerRule)) {
    fail('.footer-method must use color: var(--paper-muted)');
  }
  if (!/display\s*:\s*grid/u.test(footerGridRule)) {
    fail('.footer-method-grid must use display: grid');
  }
  if (!/color\s*:\s*var\(--paper-ink\)/u.test(footerHeadingRule) || !/font-family\s*:\s*var\(--font-mono\)/u.test(footerHeadingRule)) {
    fail('.footer-method-block h4 must use paper-ink and font-mono tokens');
  }
  if (!/color\s*:\s*var\(--paper-muted\)/u.test(footerParagraphRule) || !/font-family\s*:\s*var\(--font-mono\)/u.test(footerParagraphRule)) {
    fail('.footer-method-block p must use paper-muted and font-mono tokens');
  }
  if (!/color\s*:\s*var\(--paper-ink\)/u.test(footerDateRule)) {
    fail('.footer-date must use color: var(--paper-ink)');
  }
  if (/var\(--ink\)/u.test(footerStyles)) {
    fail('footer method CSS must use var(--paper-ink), not var(--ink)');
  }
  if (/IBM Plex Mono/u.test(footerStyles)) {
    fail('footer method CSS must use var(--font-mono), not direct font strings');
  }
}

function checkInlineHeadStyleGradientScope() {
  const inlineStyles = extractHeadStyleBlocks();
  for (const match of inlineStyles.matchAll(/([^{}]+)\{[^{}]*linear-gradient\s*\([^{}]*\)[^{}]*\}/giu)) {
    const selectorList = match[1]
      .split(',')
      .map((selector) => selector.trim())
      .filter(Boolean);
    const allDecorativePseudoElements = selectorList.length > 0
      && selectorList.every((selector) => /::(?:before|after)\b/u.test(selector));

    if (!allDecorativePseudoElements) {
      fail(`inline <head><style> may use linear-gradient only on decorative ::before / ::after selectors; got ${selectorList.join(', ')}`);
    }
  }
}

function checkEditorialSectionBorder() {
  if (!/\.editorial-section\s*\{[^}]*border:\s*1px\s+solid\s+var\(--paper-line-strong\)/su.test(styles)) {
    fail('.editorial-section must use border: 1px solid var(--paper-line-strong)');
  }
  if (!/#macro-risk-overview\s*\{[^}]*border:\s*none/su.test(styles)) {
    fail('#macro-risk-overview must reset the global editorial-section border');
  }
}

function checkPackageScript() {
  const expected = 'node --check scripts/check-editorial-redesign-contract.mjs && node scripts/check-editorial-redesign-contract.mjs';
  if (packageJson.scripts?.['check:editorial-redesign-contract'] !== expected) {
    fail('package.json must wire check:editorial-redesign-contract to the editorial redesign guard');
  }
}

checkHomepageIa();
checkThemeFoundation();
checkDesignContractDoc();
checkDesignContractM32Amendments();
checkExternalUrlGuard();
checkEditorialStructures();
checkMarketPricingTemperatureContract();
checkExternalAiBoundary();
checkHeatmapStandalone();
checkAppendices();
checkTopLevelSubsectionKickers();
checkInlineDarkThemeCleanup();
checkMethodCardBorderRadius();
checkMethodCardAccentConsistency();
checkHeatmapFrameBorderStrength();
checkPaperCanvasToken();
checkHeatmapFrameCanvasBackground();
checkBiasSemanticColors();
checkGroupAArticleCardSpacing();
checkGroupBSingleCardSpacing();
checkFooterMethodStructure();
checkInlineHeadStyleGradientScope();
checkEditorialSectionBorder();
checkPackageScript();

if (errors.length) {
  throw new Error(`Editorial redesign contract failed:\n- ${errors.join('\n- ')}`);
}

console.log('Editorial redesign contract: PASS');
