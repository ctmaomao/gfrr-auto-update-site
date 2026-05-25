import fs from 'node:fs';

const INDEX_PATH = 'index.html';
const APP_PATH = 'scripts/app.js';
const RENDER_PATH = 'scripts/modules/renderThematicCards.js';
const THRESHOLD_PATH = 'scripts/modules/displayStatusThresholds.js';
const CROSS_VALIDATION_PATH = 'scripts/modules/buildCrossValidationMatrix.js';
const STYLE_PATH = 'assets/styles.css';
const RADAR_DATA_PATH = 'data/radar-data.json';
const WORLD_ORDER_PATH = 'data/world-order-stress.json';
const MARKET_PRICING_PATH = 'data/market-pricing-metrics.json';

const errors = [];

function fail(message) {
  errors.push(message);
}

function requireMarker(source, marker, label) {
  if (!source.includes(marker)) fail(`${label}: missing marker ${marker}`);
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function extractCardSource(renderedHtml, cardId) {
  const marker = `data-card-id="${cardId}"`;
  const markerIndex = renderedHtml.indexOf(marker);
  if (markerIndex === -1) return null;
  const articleStart = renderedHtml.lastIndexOf('<article', markerIndex);
  const articleEnd = renderedHtml.indexOf('</article>', markerIndex);
  if (articleStart === -1 || articleEnd === -1) return null;
  return renderedHtml.slice(articleStart, articleEnd + '</article>'.length);
}

const expectedThemes = [
  'cat-inflation-energy',
  'cat-global-liquidity',
  'cat-credit-corporate',
  'cat-us-economy',
  'cat-world-economy',
  'cat-china-macro',
  'cat-market-sentiment',
  'cat-geopolitics'
];

const expectedCards = [
  'c1-brent',
  'c1-crack-spread',
  'c1-ism-pmi',
  'c1-us-cpi',
  'c1-wti',
  'c2-dxy',
  'c2-gold',
  'c2-us10y-curve',
  'c2-usd-liquidity',
  'c2-fed-path',
  'c2-cu-au',
  'c2-cfets-rmb',
  'c3-hy-oas',
  'c3-ig-oas',
  'c3-nfci',
  'c3-private-credit-proxy',
  'c3-commercial-re',
  'c4-employment-agg',
  'c4-consumer-agg',
  'c5-world-order-placeholder',
  'c5-stoxx-50',
  'c5-nikkei-225',
  'c5-dax',
  'c5-v2x',
  'c6-sse-composite',
  'c6-hang-seng',
  'c6-csi-300',
  'c6-china-pmi',
  'c6-china-cpi-ppi',
  'c6-china-10y',
  'c6-cfets-rmb',
  'c7-vix',
  'c7-spx',
  'c7-ndx-zscore',
  'c8-geopolitical-module',
  'c8-world-order-overlay',
  'c8-economic-weaponization',
  'c8-arms-conflict'
];

const requiredCssSelectors = [
  '.reader-cat-block',
  '.reader-cat-header',
  '.cat-intro',
  '.indicator-card',
  '.indicator-card.pending',
  '.agg-rows',
  '.agg-rows .k',
  '.agg-rows .v',
  '.badge.red',
  '.badge.yellow',
  '.badge.green',
  '.badge.orange',
  '.badge.pending'
];

const requiredThresholdKeys = [
  'brent',
  'hyOas',
  'igOas',
  'vix',
  'nfci',
  'dxy',
  'us10y',
  'crackSpread',
  'creDelinquencyRate',
  'initialClaims',
  'geopoliticalScore',
  'worldOrderScore',
  'dimensionScore',
  'fedPathSpreadBp',
  'ismManufacturingPmi',
  'cartsRealYoY'
];

const highestCardMarkers = new Map([
  ['Brent', ['公开现货代理 EIA', '期货 front Yahoo', '期货 ICE', 'spotMinusFutures', 'maxProxyDivergencePct']],
  ['USD Liquidity', ['水位 WALCL', '准备金 reserveBalances', 'ON RRP', '隔夜 SOFR / EFFR', '回购 BGCR / TGCR', 'repoSpreadRegime']],
  ['Fed Path', ['targetMid', 'fedFundsFutureFront', 'ZQ futures curve', 'SR3 futures curve', 'OIS forward 12M', 'SEP dot', 'statement / minutes tone']],
  ['Employment', ['initialClaims / 4w', 'continuingClaims / 4w', 'JOLTS openings', 'U-6 失业率', 'AHE YoY', 'industry diffusion', 'diffusion regime']],
  ['Consumer', ['CARTS nominal', 'CARTS real', 'segment diffusion', 'strongest segment', 'weakest segment', 'UMich Sentiment', 'BoA ex-gas / Redbook']],
  ['CRE', ['违约率', '核销率', 'SLOOS 非农非住宅', 'SLOOS 建筑', 'SLOOS 多家庭', 'sloosCreTighteningMax']]
]);

async function main() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const renderSource = fs.readFileSync(RENDER_PATH, 'utf8');
  const thresholdSource = fs.readFileSync(THRESHOLD_PATH, 'utf8');
  const crossValidationSource = fs.readFileSync(CROSS_VALIDATION_PATH, 'utf8');
  const styles = fs.readFileSync(STYLE_PATH, 'utf8');

  requireMarker(html, 'id="macro-thematic-cards-root"', INDEX_PATH);
  requireMarker(appSource, 'renderThematicCards(data, document.getElementById(\'macro-thematic-cards-root\'), marketPricingMetricsData)', APP_PATH);
  requireMarker(renderSource, 'export function renderThematicCards(data, root, marketPricingMetricsData = null)', RENDER_PATH);

  for (const selector of requiredCssSelectors) requireMarker(styles, selector, STYLE_PATH);
  for (const selector of ['.badge.strong', '.badge.strong-mid', '.badge.cautious-bear', '.badge.underweight']) {
    requireMarker(styles, selector, `${STYLE_PATH} legacy badge selector`);
  }

  requireMarker(thresholdSource, 'export const THRESHOLDS', THRESHOLD_PATH);
  requireMarker(thresholdSource, 'export function classifyByThreshold', THRESHOLD_PATH);
  for (const key of requiredThresholdKeys) requireMarker(thresholdSource, `${key}: Object.freeze`, `${THRESHOLD_PATH} THRESHOLDS`);
  if (!/from ['"]\.\/displayStatusThresholds\.js(?:\?v=[^'"]+)?['"]/u.test(renderSource)) {
    fail(`${RENDER_PATH}: must import display status thresholds module`);
  }
  if (/\bconst\s+THRESHOLDS\b/u.test(renderSource)) fail(`${RENDER_PATH}: must not define local THRESHOLDS`);

  if (!/import\s*\{\s*classifyZScoreBucket\s*\}\s*from\s*['"]\.\/buildCrossValidationMatrix\.js(?:\?v=[^'"]+)?['"]/u.test(renderSource)) {
    fail(`${RENDER_PATH}: must import classifyZScoreBucket from buildCrossValidationMatrix.js`);
  }
  if (/\bfunction\s+classifyZScoreBucket\b/u.test(renderSource)) {
    fail(`${RENDER_PATH}: must not copy classifyZScoreBucket implementation`);
  }
  requireMarker(crossValidationSource, 'export { classifyZScoreBucket };', CROSS_VALIDATION_PATH);

  const { renderThematicCards } = await import('./modules/renderThematicCards.js');
  const data = readJson(RADAR_DATA_PATH);
  data.worldOrderStress = readJson(WORLD_ORDER_PATH);
  const marketPricingMetricsData = readJson(MARKET_PRICING_PATH);
  const root = { innerHTML: '' };
  renderThematicCards(data, root, marketPricingMetricsData);
  const renderedHtml = root.innerHTML;

  const themeCount = countMatches(renderedHtml, /class="reader-cat-block"/gu);
  if (themeCount !== 8) fail(`rendered theme count must be 8, got ${themeCount}`);
  const cardCount = countMatches(renderedHtml, /class="indicator-card/gu);
  if (cardCount !== 38) fail(`rendered indicator-card count must be 38, got ${cardCount}`);

  for (const id of expectedThemes) requireMarker(renderedHtml, `id="${id}"`, 'rendered thematic cards');
  for (const id of expectedCards) {
    const cardSource = extractCardSource(renderedHtml, id);
    if (!cardSource) {
      fail(`rendered card missing: ${id}`);
      continue;
    }
    if (!/\bdata-status="(red|yellow|green|orange|pending)"/u.test(cardSource)) {
      fail(`${id}: missing data-status`);
    }
    if (!/class="badge (red|yellow|green|orange|pending)"/u.test(cardSource)) {
      fail(`${id}: missing status badge`);
    }
  }

  const intros = [...renderedHtml.matchAll(/<p class="cat-intro">([\s\S]*?)<\/p>/gu)];
  if (intros.length !== 8) fail(`cat-intro count must be 8, got ${intros.length}`);
  intros.forEach((match, index) => {
    const text = match[1].replace(/<[^>]+>/gu, '').trim();
    if (!text) fail(`cat-intro ${index + 1} must not be empty`);
  });

  for (const [label, markers] of highestCardMarkers) {
    for (const marker of markers) {
      if (!renderedHtml.includes(marker)) fail(`${label}: missing agg-row marker ${marker}`);
    }
  }
}

await main();

if (errors.length > 0) {
  console.error('Thematic cards contract: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Thematic cards contract: PASS');
