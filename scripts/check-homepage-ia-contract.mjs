import fs from 'node:fs';

const INDEX_PATH = 'index.html';
const MACRO_OVERVIEW_PATH = 'scripts/modules/renderMacroOverview.js';
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const macroOverviewSource = fs.readFileSync(MACRO_OVERVIEW_PATH, 'utf8');
const combinedSource = `${html}\n${macroOverviewSource}`;
const errors = [];

const navContract = [
  ['今日总判断', '#homepage-today-judgment'],
  ['压力来源', '#homepage-pressure-sources'],
  ['信号分层', '#homepage-signal-layers'],
  ['四大驱动', '#homepage-macro-drivers'],
  ['市场温度', '#homepage-market-temperature'],
  ['风险引擎', '#homepage-risk-engines'],
  ['交叉验证', '#homepage-cross-validation'],
  ['风险热力图', '#global-risk-heatmap'],
  ['详细数据', '#detail-data'],
  ['方法说明', '#method-evidence'],
];

const macroRuntimeIds = [
  'homepage-today-judgment',
  'homepage-pressure-sources',
  'homepage-signal-layers',
  'homepage-macro-drivers',
  'homepage-market-temperature',
  'homepage-risk-engines',
  'homepage-cross-validation',
];

const staticRequiredIds = [
  'global-risk-heatmap',
  'detail-data',
  'method-evidence',
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
  if (!start) return '';
  const end = findMatchingCloseTag(source, start.index, start.tagName);
  if (end === -1) {
    fail(`${id} must have a matching </${start.tagName}>`);
    return '';
  }
  return source.slice(start.index, end);
}

function elementRanges(source, tagName) {
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'giu');
  const stack = [];
  const ranges = [];
  let match;
  while ((match = tagPattern.exec(source))) {
    if (match[0].startsWith('</')) {
      const start = stack.pop();
      if (typeof start === 'number') ranges.push([start, tagPattern.lastIndex]);
    } else {
      stack.push(match.index);
    }
  }
  return ranges;
}

function isInsideRange(index, ranges) {
  return ranges.some(([start, end]) => index > start && index < end);
}

function isElementInside(parentId, childId) {
  const parent = findElementStartById(html, parentId);
  const child = findElementStartById(html, childId);
  if (!parent || !child) return false;
  const parentEnd = findMatchingCloseTag(html, parent.index, parent.tagName);
  return parentEnd !== -1 && child.index > parent.index && child.index < parentEnd;
}

function firstHeadingText(sectionHtml) {
  const match = sectionHtml.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/iu);
  return match ? textOnly(match[1]) : '';
}

function contextAround(index, size = 56) {
  return textOnly(html.slice(Math.max(0, index - size), Math.min(html.length, index + size)));
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

function checkNav() {
  const links = getNavLinks();
  const labels = links.map((link) => link.label);
  const oldLabels = ['核心判断', '宏观风险判断', '辅助解释', '方法、证据与审计'];

  for (const [label, href] of navContract) {
    const link = links.find((candidate) => candidate.label === label);
    if (!link) {
      fail(`top nav missing reading-path label: ${label}`);
    } else if (link.href !== href) {
      fail(`top nav label ${label} must point to ${href}, found ${link.href}`);
    }
  }

  for (const oldLabel of oldLabels) {
    if (labels.includes(oldLabel)) fail(`top nav must not contain old abstract label: ${oldLabel}`);
  }

  const actualPairs = links.map((link) => `${link.label}|${link.href}`).join('\n');
  const expectedPairs = navContract.map(([label, href]) => `${label}|${href}`).join('\n');
  if (actualPairs !== expectedPairs) {
    fail('top nav must follow the exact 10-step reading-path order');
  }

  for (const link of links) {
    if (!link.href.startsWith('#')) {
      fail(`top nav href must be an in-page anchor: ${link.href}`);
      continue;
    }
    const id = link.href.slice(1);
    if (macroRuntimeIds.includes(id)) {
      if (!macroOverviewSource.includes(`'${id}'`) && !macroOverviewSource.includes(`"${id}"`)) {
        fail(`top nav target ${id} must be created by renderMacroOverview.js`);
      }
      continue;
    }
    if (!findElementStartById(html, id)) fail(`top nav href ${link.href} points to missing id`);
  }
}

function checkRequiredIds() {
  for (const id of macroRuntimeIds) {
    if (!macroOverviewSource.includes(`'${id}'`) && !macroOverviewSource.includes(`"${id}"`)) {
      fail(`renderMacroOverview.js missing generated block id ${id}`);
    }
  }
  if (!/function\s+appendSection[\s\S]*section\.id\s*=\s*id/u.test(macroOverviewSource)) {
    fail('renderMacroOverview.js must assign IDs to actual generated section elements');
  }
  for (const id of staticRequiredIds) {
    if (!findElementStartById(html, id)) fail(`${INDEX_PATH} missing ${id}`);
  }
}

function checkNoEmptyNavTargets() {
  const links = getNavLinks();
  for (const link of links) {
    const id = link.href.slice(1);
    if (macroRuntimeIds.includes(id)) continue;
    const start = findElementStartById(html, id);
    if (!start) continue;
    if (start.tagName === 'h2') {
      fail(`nav target ${id} must not be a standalone h2`);
      continue;
    }
    const sectionHtml = sliceElementById(html, id);
    if (textOnly(sectionHtml).length < 12) fail(`nav target ${id} must contain meaningful visible content`);
  }
}

function checkOrdering() {
  const macroRootIndex = html.indexOf('id="macro-risk-overview-root"');
  const orderIndex = new Map();
  macroRuntimeIds.forEach((id, index) => orderIndex.set(id, macroRootIndex + index + 1));
  for (const id of staticRequiredIds) {
    const element = findElementStartById(html, id);
    if (element) orderIndex.set(id, element.index);
  }

  const expectedOrder = [
    ...macroRuntimeIds,
    'global-risk-heatmap',
    'detail-data',
    'method-evidence',
  ];

  for (let index = 0; index < expectedOrder.length - 1; index += 1) {
    const current = expectedOrder[index];
    const next = expectedOrder[index + 1];
    if ((orderIndex.get(current) ?? Infinity) >= (orderIndex.get(next) ?? -1)) {
      fail(`${current} must appear before ${next}`);
    }
  }
}

function checkDailyBrief() {
  const daily = findElementStartById(html, 'daily-brief-section');
  if (!daily) {
    fail('daily-brief-section must exist');
    return;
  }
  if (!isElementInside('method-evidence', 'daily-brief-section')) {
    fail('daily-brief-section must live inside method-evidence as secondary evidence detail');
  }
  if (daily.tagName !== 'details') {
    fail('daily-brief-section must remain collapsible details');
  }
  const dailySection = sliceElementById(html, 'daily-brief-section');
  if (firstHeadingText(dailySection) === '今日主判断') {
    fail('Daily Brief main h2 must not be exactly 今日主判断');
  }
}

function checkExternalAi() {
  const panel = findElementStartById(html, 'external-ai-display-panel');
  if (!panel) {
    fail('external-ai-display-panel must exist');
    return;
  }
  if (isElementInside('global-risk-heatmap', 'external-ai-display-panel')) {
    fail('External AI panel must not be inside Global Risk Heatmap');
  }
  if (isElementInside('method-evidence', 'external-ai-display-panel')) {
    fail('External AI panel must stay auxiliary, outside method-evidence');
  }
  if (!isElementInside('external-ai-auxiliary', 'external-ai-display-panel')) {
    fail('External AI panel must have a stable auxiliary wrapper');
  }
  if (!panel.source.includes('hidden') || !panel.source.includes('aria-hidden="true"')) {
    fail('External AI display gate must remain hidden by default');
  }
}

function checkHeatmap() {
  const heatmap = findElementStartById(html, 'global-risk-heatmap');
  const svg = findElementStartById(html, 'world-heatmap');
  if (!heatmap) fail('global-risk-heatmap must exist');
  if (!svg) {
    fail('world-heatmap must exist');
    return;
  }
  if (!isElementInside('global-risk-heatmap', 'world-heatmap')) {
    fail('world-heatmap must be inside the global-risk-heatmap wrapper');
  }
  if (isInsideRange(svg.index, elementRanges(html, 'details'))) {
    fail('world-heatmap must not be inside a collapsed details element');
  }
}

function checkMarketTemperature() {
  if (!combinedSource.includes('等待历史周线数据接入')) {
    fail('Market temperature copy must still indicate waiting-for-history');
  }
  if (/市场定价温度计.{0,40}(?:已启用|已激活|正式启用|active)/iu.test(combinedSource)) {
    fail('Market Pricing Temperature must not be claimed active');
  }
  if (/(?:Nasdaq|QQQ).{0,16}温度.{0,16}(?:已存在|已启用|已接入|active)/iu.test(combinedSource)) {
    fail('Homepage copy must not claim Nasdaq / QQQ temperature exists');
  }
}

function checkForbiddenCopy() {
  const forbidden = ['买入', '卖出', '加仓', '做多', '做空', '长期反向 ETF', '操作建议'];
  for (const phrase of forbidden) {
    const index = html.indexOf(phrase);
    if (index !== -1) fail(`forbidden user-visible copy found: ${phrase} near "${contextAround(index)}"`);
  }

  for (const match of html.matchAll(/(?:减仓|交易建议)/gu)) {
    const context = contextAround(match.index ?? 0, 80);
    const allowed =
      context.includes('不构成') ||
      context.includes('不参与') ||
      context.includes('不改变') ||
      context.includes('不作为') ||
      context.includes('阈值');
    if (!allowed) fail(`forbidden user-visible copy found: ${match[0]} near "${context}"`);
  }
}

function main() {
  checkNav();
  checkRequiredIds();
  checkNoEmptyNavTargets();
  checkOrdering();
  checkDailyBrief();
  checkExternalAi();
  checkHeatmap();
  checkMarketTemperature();
  checkForbiddenCopy();

  if (errors.length > 0) {
    console.error('Homepage IA contract: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Homepage IA contract: PASS');
}

main();
