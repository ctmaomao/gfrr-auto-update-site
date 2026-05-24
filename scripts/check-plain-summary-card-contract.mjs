import fs from 'node:fs';

// Ignore list: empty. M-93A plain-summary checker only scans
// (1) #plain-summary-card section in index.html,
// (2) user-visible string literals emitted by renderPlainSummary.js,
// (3) .plain-summary-* selectors in styles.css.
// It never scans existing IA sections, data/*.json, threshold constants,
// other renderer files, import paths, or other contract checkers.
const IGNORE_RANGES = [];

const INDEX_PATH = 'index.html';
const RENDER_PATH = 'scripts/modules/renderPlainSummary.js';
const STYLE_PATH = 'assets/styles.css';

const html = fs.readFileSync(INDEX_PATH, 'utf8');
const renderSource = fs.readFileSync(RENDER_PATH, 'utf8');
const styles = fs.readFileSync(STYLE_PATH, 'utf8');
const errors = [];

const requiredElements = [
  'section-title',
  'risk-level',
  'score-trend',
  'plain-story',
  'top-risks',
  'data-health',
  'scroll-hint'
];

const requiredCssClasses = [
  'plain-summary-section',
  'plain-summary-title',
  'plain-summary-risk-level',
  'plain-summary-score-trend',
  'plain-summary-story',
  'plain-summary-risks',
  'plain-summary-data-health',
  'plain-summary-scroll-hint'
];

const requiredNarrativeKeys = [
  'energy_shock',
  'stagflation_pressure',
  'risk_asset_mismatch',
  'overheat_confirmation',
  'credit_spread_warning',
  'liquidity_tightening',
  'world_order_pressure_crossing',
  'energy_inflation_rates',
  'unknown'
];

const requiredEvidenceKeys = [
  'brent',
  'breakeven10y',
  'us10y',
  'vix',
  'hy_oas',
  'ig_oas',
  'sofr',
  'dff',
  'zq_curve',
  'sr3_curve',
  'ois_curve',
  'cdx_hy',
  'cdx_ig',
  'bizd',
  'pbdc',
  'srln',
  'cclfx',
  'vnq',
  'rem',
  'cmbs',
  'bdti',
  'bcti',
  'bdi',
  'nfci',
  'walcl',
  'on_rrp',
  'consumer_retail',
  'employment',
  'commercial_real_estate',
  'shipping_freight',
  'unknown'
];

const allowedRiskLevels = [
  '风险较低',
  '风险正常',
  '风险偏高',
  '风险很高',
  '风险非常高'
];

const allowedDataHealthStates = [
  '数据正常',
  '数据稍旧',
  '数据不够新'
];

const forbiddenPatterns = [
  'display-only',
  'audit-only',
  'sourceStatus',
  'status=live',
  'status=live_proxy_curve',
  'status=live_public_curve',
  'live_structure_only',
  'live_proxy_priced',
  'live_delayed_priced',
  'manual_required',
  'displayInputsBaseline',
  'effectiveDisplayInputs|__effectiveDisplayInputs',
  'contractVersion',
  'schemaVersion',
  'boundaries',
  'affectsScoring=false',
  'affectsDecisionModel=false',
  'affectsExecutionLock=false',
  'affectsPositionGuidance=false',
  'realtime payload',
  'Worker|Worker-first',
  'Daily fallback|baseline',
  'worker-generated-preview',
  'cross-validation matrix',
  'narrative',
  'promotion|Brent promotion',
  'proxy|public proxy',
  'frontendDisplayApproved|productionWriteApproved',
  'cache version|module graph',
  'UMCSENT',
  'ISM PMI',
  'JOLTS',
  'U-6',
  'AHE',
  'ICSA',
  'CCSA',
  'CARTS',
  'CARTSR',
  'MRTS',
  'SLOOS',
  'HY OAS',
  'IG OAS',
  'SOFR',
  'BGCR',
  'TGCR',
  'ZQ',
  'SR3',
  'OIS',
  'NFCI',
  'CDX',
  'CDX HY',
  'CDX IG',
  'BIZD',
  'PBDC',
  'SRLN',
  'CCLFX',
  'BDTI',
  'BCTI',
  'BDI',
  'VNQ',
  'REM',
  'CMBS',
  'WALCL',
  'ON RRP',
  'QoQ',
  'YoY',
  '4w-MA',
  'bp',
  'pp',
  'Brent',
  'ULSD',
  'Platts',
  'SEP',
  'FOMC',
  'DFF',
  'QQQ',
  'NDX',
  'IXIC',
  'VIX',
  '系统性风险观察',
  '压力上升观察',
  '维持当前判断',
  '证据不足，等待确认',
  '慢变量',
  '相对平稳',
  '边际',
  '滞胀冲击',
  '局部冲击观察',
  '压力较高',
  '数据降级维持观察',
  '压力边际缓和',
  '买入',
  '卖出',
  '减仓',
  '加仓',
  '止损',
  '止盈',
  '建仓',
  '平仓'
].map((pattern) => ({ pattern, regex: new RegExp(pattern, 'iu') }));

const USER_VISIBLE_DECIMAL_PATTERN = /\d+\.\d+%?/u;

function fail(message) {
  errors.push(message);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function findElementStartById(source, id) {
  const pattern = new RegExp(`<([a-z0-9-]+)\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>`, 'iu');
  const match = pattern.exec(source);
  if (!match) return null;
  return { index: match.index, tagName: match[1].toLowerCase(), source: match[0] };
}

function findMatchingCloseTag(source, element) {
  const tagPattern = new RegExp(`<\\/?${escapeRegExp(element.tagName)}\\b[^>]*>`, 'giu');
  tagPattern.lastIndex = element.index;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(source))) {
    const tag = match[0];
    if (tag.startsWith('</')) {
      depth -= 1;
      if (depth === 0) return tagPattern.lastIndex;
    } else if (!tag.endsWith('/>')) {
      depth += 1;
    }
  }
  return -1;
}

function sliceElementById(source, id) {
  const element = findElementStartById(source, id);
  if (!element) return null;
  const closeIndex = findMatchingCloseTag(source, element);
  if (closeIndex === -1) return null;
  return {
    ...element,
    content: source.slice(element.index, closeIndex)
  };
}

function extractNavBlock() {
  const navMatch = html.match(/<nav\b[^>]*class=["'][^"']*\bdashboard-jump-nav\b[^"']*["'][^>]*>/iu);
  if (!navMatch) return '';
  const end = html.indexOf('</nav>', navMatch.index);
  return end >= 0 ? html.slice(navMatch.index, end + '</nav>'.length) : '';
}

function findMatchingBracket(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function getFrozenBlock(name) {
  const pattern = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*Object\\.freeze\\s*\\(\\s*([\\[{])`, 'u');
  const match = pattern.exec(renderSource);
  if (!match) {
    fail(`${name} must be defined via Object.freeze`);
    return '';
  }
  const openChar = match[1];
  const openIndex = match.index + match[0].lastIndexOf(openChar);
  const closeChar = openChar === '{' ? '}' : ']';
  const closeIndex = findMatchingBracket(renderSource, openIndex, openChar, closeChar);
  if (closeIndex === -1) {
    fail(`${name} Object.freeze block must be closed`);
    return '';
  }
  return renderSource.slice(openIndex, closeIndex + 1);
}

function extractObjectStringValues(name) {
  const block = getFrozenBlock(name);
  return [...block.matchAll(/:\s*"((?:[^"\\]|\\.)*)"/gu)].map((match) => match[1]);
}

function extractArrayStringValues(name) {
  const block = getFrozenBlock(name);
  return [...block.matchAll(/"((?:[^"\\]|\\.)*)"/gu)].map((match) => match[1]);
}

function checkObjectKeys(name, requiredKeys) {
  const block = getFrozenBlock(name);
  for (const key of requiredKeys) {
    const keyPattern = new RegExp(`["']${escapeRegExp(key)}["']\\s*:`, 'u');
    if (!keyPattern.test(block)) fail(`${name} missing required key: ${key}`);
  }
}

function checkExactArray(name, expectedValues) {
  const actualValues = extractArrayStringValues(name);
  const actual = JSON.stringify(actualValues);
  const expected = JSON.stringify(expectedValues);
  if (actual !== expected) fail(`${name} must equal ${expected}; received ${actual}`);
}

function checkDomContract() {
  const section = sliceElementById(html, 'plain-summary-card');
  if (!section) {
    fail('#plain-summary-card section must exist');
    return;
  }
  if (section.tagName !== 'section') fail('#plain-summary-card must use a <section> container');
  if (!/\beditorial-section\b/u.test(section.source) || !/\bplain-summary-section\b/u.test(section.source)) {
    fail('#plain-summary-card must use editorial-section plain-summary-section classes');
  }
  if (!/aria-label=["']今天全球金融风险一览["']/u.test(section.source)) {
    fail('#plain-summary-card must keep the plain Chinese aria-label');
  }
  for (const element of requiredElements) {
    const pattern = new RegExp(`data-plain-summary-element=["']${escapeRegExp(element)}["']`, 'u');
    if (!pattern.test(section.content)) fail(`#plain-summary-card missing data-plain-summary-element="${element}"`);
  }
  if (!section.content.includes('今天全球金融风险一览')) fail('#plain-summary-card must include the fixed section title');
  if (!section.content.includes('继续往下看专业分析与原始数据')) fail('#plain-summary-card must include the fixed scroll hint');

  const nav = extractNavBlock();
  if (nav.includes('#plain-summary-card')) fail('plain-summary-card must not appear in dashboard-jump-nav');
  const navStart = html.search(/<nav\b[^>]*class=["'][^"']*\bdashboard-jump-nav\b[^"']*["']/iu);
  const macro = findElementStartById(html, 'macro-risk-overview');
  if (navStart < 0) fail('dashboard-jump-nav positional anchor must exist');
  if (!macro) fail('#macro-risk-overview positional anchor must exist');
  if (navStart >= 0 && section.index <= navStart) fail('#plain-summary-card must appear after dashboard-jump-nav');
  if (macro && section.index >= macro.index) fail('#plain-summary-card must appear before #macro-risk-overview');
}

function checkTranslationTables() {
  checkObjectKeys('PLAIN_NARRATIVE_PHRASES', requiredNarrativeKeys);
  checkObjectKeys('PLAIN_EVIDENCE_PHRASES', requiredEvidenceKeys);
  checkExactArray('PLAIN_RISK_LEVELS', allowedRiskLevels);
  checkExactArray('PLAIN_DATA_HEALTH_STATES', allowedDataHealthStates);
  if (!renderSource.includes('"unknown": null')) fail('PLAIN_EVIDENCE_PHRASES unknown fallback must be null');
  if (!renderSource.includes('Math.round(scoreValue)')) fail('risk score output must round scoreValue before display');
  if (!renderSource.includes('Math.round(Math.abs(changeValue))')) fail('score trend output must round absolute scoreChange7d before display');
}

function checkCssContract() {
  const plainSelectorText = [...styles.matchAll(/(^|\n)([^{}\n]*\.plain-summary-[^{]+)\{/gu)]
    .map((match) => match[2])
    .join('\n');
  for (const className of requiredCssClasses) {
    if (!plainSelectorText.includes(`.${className}`)) fail(`${STYLE_PATH} missing .${className} selector`);
  }
}

function checkUserVisibleCopy() {
  const userVisibleStrings = [
    ...extractObjectStringValues('PLAIN_NARRATIVE_PHRASES'),
    ...extractObjectStringValues('PLAIN_EVIDENCE_PHRASES'),
    ...extractArrayStringValues('PLAIN_RISK_LEVELS'),
    ...extractArrayStringValues('PLAIN_DATA_HEALTH_STATES'),
    ...extractObjectStringValues('PLAIN_COPY')
  ].filter(Boolean);

  for (const text of userVisibleStrings) {
    if (USER_VISIBLE_DECIMAL_PATTERN.test(text)) {
      fail(`user-visible plain-summary text must not contain decimal values: ${text}`);
    }
    for (const { pattern, regex } of forbiddenPatterns) {
      if (regex.test(text)) fail(`user-visible plain-summary text contains forbidden pattern "${pattern}": ${text}`);
    }
  }
}

function main() {
  if (IGNORE_RANGES.length !== 0) fail('plain-summary checker ignore list must remain empty');
  checkDomContract();
  checkTranslationTables();
  checkCssContract();
  checkUserVisibleCopy();

  if (errors.length > 0) {
    console.error('Plain summary card contract: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Plain summary card contract: PASS');
}

main();
