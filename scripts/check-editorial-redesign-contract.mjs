import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const INDEX_PATH = 'index.html';
const STYLES_PATH = 'assets/styles.css';
const MACRO_OVERVIEW_PATH = 'scripts/modules/renderMacroOverview.js';
const PACKAGE_PATH = 'package.json';
const DESIGN_PATH = 'DESIGN.md';
const MARKET_PRICING_HISTORY_PATH = 'data/market-pricing-history.json';

const html = fs.readFileSync(INDEX_PATH, 'utf8');
const styles = fs.readFileSync(STYLES_PATH, 'utf8');
const macroOverview = fs.readFileSync(MACRO_OVERVIEW_PATH, 'utf8');
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
    ['风险热力图', '#global-risk-heatmap'],
    ['详细数据', '#detail-data'],
    ['方法说明', '#method-evidence'],
    ['外部 AI', '#external-ai-auxiliary'],
    ['执行风控', '#execution-risk-detail'],
  ];

  const links = getNavLinks();
  const actual = links.map((link) => `${link.label}|${link.href}`).join('\n');
  const expected = expectedLinks.map(([label, href]) => `${label}|${href}`).join('\n');
  if (actual !== expected) fail('homepage nav must keep the exact 13-item editorial IA order and labels');
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
    'dashboard-jump-nav            (顶部跳转导航 13 项)',
    '#macro-risk-overview',
    '#wow-key-changes',
    '#global-risk-heatmap',
    '#detail-data',
    '#method-evidence',
    '#external-ai-auxiliary',
    '#execution-risk-detail',
    '本 PR 符合 DESIGN.md 的所有规则',
    'PR #164（本 PR）',
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
    'id="wow-key-changes"',
    'editorial-section-wow',
    'wow-key-changes-root',
    'wow-grid',
    '本期关键变化',
    'KEY CHANGES',
    'editorial-watch-list',
    '下一步验证清单',
    'WHAT TO WATCH',
  ];
  for (const marker of requiredMarkers) requireMarker(combined, 'editorial redesign structures', marker);

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

function checkMarketPricingWaitingState() {
  const requiredMarkers = [
    '等待历史周线数据接入',
    'QQQ',
    'Nasdaq',
    'MA60',
    '标准差',
    'z-score',
  ];
  for (const marker of requiredMarkers) requireMarker(macroOverview, MACRO_OVERVIEW_PATH, marker);
  requireAnyMarker(macroOverview, MACRO_OVERVIEW_PATH, ['Market Temperature', '市场定价温度计']);
  requireAnyMarker(macroOverview, MACRO_OVERVIEW_PATH, ['standard deviation', '标准差']);

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
    'DATA APPENDIX',
    'editorial-section-folded',
    'editorial-folded-content',
    'id="method-evidence"',
    'METHOD / EVIDENCE / BOUNDARY',
    'id="external-ai-auxiliary"',
    'id="execution-risk-detail"',
  ];
  for (const marker of requiredMarkers) requireMarker(html, INDEX_PATH, marker);
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

function checkPackageScript() {
  const expected = 'node --check scripts/check-editorial-redesign-contract.mjs && node scripts/check-editorial-redesign-contract.mjs';
  if (packageJson.scripts?.['check:editorial-redesign-contract'] !== expected) {
    fail('package.json must wire check:editorial-redesign-contract to the editorial redesign guard');
  }
}

checkHomepageIa();
checkThemeFoundation();
checkDesignContractDoc();
checkExternalUrlGuard();
checkEditorialStructures();
checkMarketPricingWaitingState();
checkExternalAiBoundary();
checkHeatmapStandalone();
checkAppendices();
checkInlineDarkThemeCleanup();
checkPackageScript();

if (errors.length) {
  throw new Error(`Editorial redesign contract failed:\n- ${errors.join('\n- ')}`);
}

console.log('Editorial redesign contract: PASS');
