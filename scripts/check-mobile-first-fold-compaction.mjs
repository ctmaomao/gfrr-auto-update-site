import fs from 'node:fs';

// Ignore list: empty. M-92A+ uses a named mobile-only media block and exact
// static-structure assertions, so no selector or HTML range is skipped.
const IGNORE_RANGES = [];

const STYLE_PATH = 'assets/styles.css';
const INDEX_PATH = 'index.html';
const styles = fs.readFileSync(STYLE_PATH, 'utf8');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const errors = [];

const navContract = [
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
  if (!start) {
    fail(`${INDEX_PATH} missing #${id}`);
    return '';
  }
  const end = findMatchingCloseTag(source, start.index, start.tagName);
  if (end === -1) {
    fail(`#${id} must have a matching close tag`);
    return '';
  }
  return source.slice(start.index, end);
}

function extractBraceBlock(source, openBraceIndex) {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex + 1, index);
    }
  }
  return '';
}

function getM92CompactionBlock() {
  const marker = 'M-92A+ mobile first-fold compaction';
  const markerIndex = styles.indexOf(marker);
  if (markerIndex === -1) {
    fail('styles.css must include the M-92A+ mobile compaction marker');
    return '';
  }
  const mediaStart = styles.indexOf('@media', markerIndex);
  const openBrace = styles.indexOf('{', mediaStart);
  const mediaHeader = styles.slice(mediaStart, openBrace);
  if (!/@media\s*\(\s*max-width\s*:\s*640px\s*\)/u.test(mediaHeader)) {
    fail('M-92A+ compaction marker must guard an @media (max-width: 640px) block');
  }
  return extractBraceBlock(styles, openBrace);
}

function checkIgnoreList() {
  if (IGNORE_RANGES.length !== 0) fail('mobile compaction checker ignore list must stay empty unless each item is justified');
}

function checkMobileCssBoundary() {
  const block = getM92CompactionBlock();
  const requiredSelectors = [
    '.hero',
    '.hero-masthead',
    '.hero .eyebrow',
    '.hero h1',
    '.hero h1 small',
    '.hero .hero-subtitle,.hero-version',
    '.hero-status',
    '.dashboard-jump-nav',
    '.dashboard-jump-nav a',
    '#macro-risk-overview.editorial-section',
    '#macro-risk-overview > .editorial-section-header',
    '#macro-risk-overview > .editorial-section-header .section-kicker',
    '#macro-risk-overview > .editorial-section-header .section-title',
    '#macro-risk-overview > .editorial-section-header .section-note',
  ];
  for (const selector of requiredSelectors) {
    if (!block.includes(selector)) fail(`M-92A+ mobile block missing selector: ${selector}`);
  }
  for (const property of ['padding', 'margin', 'font-size', 'display']) {
    if (!new RegExp(`${property}\\s*:`, 'u').test(block)) {
      fail(`M-92A+ mobile block must include bounded ${property} changes`);
    }
  }
  if (block.includes('@media')) fail('M-92A+ mobile compaction block must not nest another media query');
}

function checkHeroStructure() {
  const hero = sliceElementById(html, 'runtime-badge');
  const heroSection = html.match(/<header\b[^>]*class=["']hero["'][^>]*>[\s\S]*?<\/header>/iu)?.[0] || '';
  if (!heroSection) fail('hero header structure must remain present');
  const requiredMarkers = [
    '<div class="hero-masthead">',
    '<div class="eyebrow">机构级宏观风险简报</div>',
    '<span>全球金融风险雷达</span>',
    '<small>Global Financial Risk Radar</small>',
    '<p class="hero-subtitle">结论 → 原因 → 证据 → 展开详情</p>',
    '<p class="hero-version">',
    '<div class="hero-status" id="runtime-badge">加载中...</div>',
  ];
  for (const marker of requiredMarkers) {
    if (!heroSection.includes(marker)) fail(`hero static structure changed or missing marker: ${marker}`);
  }
  if (!hero.includes('id="runtime-badge"')) fail('runtime badge id must remain unchanged');
}

function checkNavStructure() {
  const nav = html.match(/<nav\b[^>]*class=["']dashboard-jump-nav["'][^>]*>([\s\S]*?)<\/nav>/iu);
  if (!nav) {
    fail('dashboard jump nav must remain present');
    return;
  }
  const links = [...nav[1].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)]
    .map((match) => [textOnly(match[2]), match[1]]);
  const actual = links.map(([label, href]) => `${label}|${href}`).join('\n');
  const expected = navContract.map(([label, href]) => `${label}|${href}`).join('\n');
  if (actual !== expected) fail('dashboard jump nav labels, hrefs, or order changed');
}

function checkMacroHeaderStructure() {
  const macro = sliceElementById(html, 'macro-risk-overview');
  const header = macro.match(/<header\b[^>]*class=["']editorial-section-header["'][^>]*>([\s\S]*?)<\/header>/iu)?.[1] || '';
  const requiredMarkers = [
    '<span class="section-kicker">MACRO RISK OVERVIEW</span>',
    '<span class="section-title">宏观风险判断总览</span>',
    '<span class="section-note" id="core-dashboard">',
  ];
  for (const marker of requiredMarkers) {
    if (!header.includes(marker)) fail(`macro overview header static structure changed or missing marker: ${marker}`);
  }
}

function main() {
  checkIgnoreList();
  checkMobileCssBoundary();
  checkHeroStructure();
  checkNavStructure();
  checkMacroHeaderStructure();

  if (errors.length > 0) {
    console.error('Mobile first-fold compaction contract: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Mobile first-fold compaction contract: PASS');
}

main();
