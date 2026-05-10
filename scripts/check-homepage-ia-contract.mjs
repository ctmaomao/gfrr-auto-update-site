import fs from 'node:fs';

const INDEX_PATH = 'index.html';
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const errors = [];

function fail(message) {
  errors.push(message);
}

function indexOfRequired(needle) {
  const index = html.indexOf(needle);
  if (index === -1) fail(`${INDEX_PATH} missing ${needle}`);
  return index;
}

function findElementStartById(id) {
  const pattern = new RegExp(`<([a-z0-9-]+)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'iu');
  const match = pattern.exec(html);
  if (!match) return null;
  return {
    tagName: match[1].toLowerCase(),
    index: match.index,
    source: match[0]
  };
}

function findMatchingCloseTag(startIndex, tagName) {
  const pattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'giu');
  pattern.lastIndex = startIndex;
  let depth = 0;
  for (const match of html.matchAll(pattern)) {
    const isClose = match[0].startsWith('</');
    depth += isClose ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return -1;
}

function sliceElementById(id) {
  const start = findElementStartById(id);
  if (!start) return '';
  const end = findMatchingCloseTag(start.index, start.tagName);
  if (end === -1) {
    fail(`${id} must have a matching </${start.tagName}>`);
    return '';
  }
  return html.slice(start.index, end);
}

function openDetailsRanges() {
  const tagPattern = /<\/?details\b[^>]*>/giu;
  const stack = [];
  const ranges = [];

  for (const match of html.matchAll(tagPattern)) {
    if (match[0].startsWith('</')) {
      const start = stack.pop();
      if (typeof start === 'number') ranges.push([start, match.index + match[0].length]);
    } else {
      stack.push(match.index);
    }
  }

  return ranges;
}

function isInsideDetails(index) {
  return openDetailsRanges().some(([start, end]) => index > start && index < end);
}

function firstHeadingText(sectionHtml) {
  const match = sectionHtml.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/iu);
  return match ? match[1].replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim() : '';
}

function hasSummaryOrSecondaryMarker(sectionHtml) {
  return (
    /<summary\b[^>]*>[\s\S]*(?:原始依据|证据|可展开)[\s\S]*<\/summary>/iu.test(sectionHtml) ||
    /class=["'][^"']*(?:secondary|detail|evidence|advanced)[^"']*["']/iu.test(sectionHtml) ||
    /<h2\b[^>]*>[\s\S]*(?:原始依据|证据|可展开)[\s\S]*<\/h2>/iu.test(sectionHtml)
  );
}

function contextAround(index, size = 40) {
  return html.slice(Math.max(0, index - size), Math.min(html.length, index + size)).replace(/\s+/gu, ' ').trim();
}

function checkForbiddenCopy() {
  const forbidden = ['买入', '卖出', '加仓', '做多', '做空', '长期反向 ETF', '操作建议'];
  for (const phrase of forbidden) {
    const index = html.indexOf(phrase);
    if (index !== -1) fail(`forbidden user-visible copy found: ${phrase} near "${contextAround(index)}"`);
  }

  for (const match of html.matchAll(/(?:减仓|交易建议)/gu)) {
    const context = contextAround(match.index ?? 0, 56);
    const allowed =
      context.includes('强制减仓阈值') ||
      context.includes('不参与') ||
      context.includes('不改变') ||
      context.includes('不构成');
    if (!allowed) fail(`forbidden user-visible copy found: ${match[0]} near "${context}"`);
  }
}

function main() {
  const macroIndex = indexOfRequired('id="macro-risk-overview"');
  const dailyIndex = indexOfRequired('id="daily-brief-section"');
  indexOfRequired('id="external-ai-display-panel"');
  indexOfRequired('id="ai-interpretation-layer-section"');
  indexOfRequired('id="world-heatmap"');

  if (macroIndex !== -1 && dailyIndex !== -1 && macroIndex > dailyIndex) {
    fail('Macro Risk Overview must appear before Daily Brief');
  }

  const dailySection = sliceElementById('daily-brief-section');
  const dailyHeading = firstHeadingText(dailySection);
  if (dailyHeading === '今日主判断') {
    fail('Daily Brief main h2 must not be exactly 今日主判断');
  }
  if (!hasSummaryOrSecondaryMarker(dailySection)) {
    fail('Daily Brief must be represented as secondary evidence or collapsible detail');
  }

  const externalPanel = findElementStartById('external-ai-display-panel');
  const heatmap = findElementStartById('world-heatmap');
  if (externalPanel && heatmap) {
    const heatmapSection = html.lastIndexOf('<section', heatmap.index);
    const heatmapSectionEnd = html.indexOf('</section>', heatmap.index);
    if (externalPanel.index > heatmapSection && externalPanel.index < heatmapSectionEnd) {
      fail('External AI panel must not be inside Global Risk Heatmap');
    }
  }

  if (heatmap && isInsideDetails(heatmap.index)) {
    fail('Global Risk Heatmap must not be inside a collapsed details element');
  }

  const aiSection = sliceElementById('ai-interpretation-layer-section');
  if (!aiSection) {
    fail('ai-interpretation-layer-section must exist');
  } else if (!hasSummaryOrSecondaryMarker(aiSection)) {
    fail('ai-interpretation-layer-section must remain secondary or collapsible');
  }

  checkForbiddenCopy();

  if (/市场定价温度计(?:已启用|已激活|active|正式启用)/iu.test(html)) {
    fail('Market Pricing Temperature must not be claimed active');
  }
  if (/(?:Nasdaq|QQQ).{0,12}温度(?:已存在|已启用|已接入|active)/iu.test(html)) {
    fail('Homepage copy must not claim Nasdaq / QQQ temperature exists');
  }

  if (errors.length > 0) {
    console.error('Homepage IA contract: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Homepage IA contract: PASS');
}

main();
