import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(filePath) {
  return readFileSync(resolve(filePath), 'utf8');
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumberOrNull(value) {
  return value === null || Number.isFinite(value);
}

function assertLayer(path, layer) {
  if (!isPlainObject(layer)) fail(`${path} is missing or not an object`);
}

function assertFiniteOrNull(layer, path, fields) {
  for (const field of fields) {
    if (!Object.hasOwn(layer, field)) fail(`${path}.${field} is missing`);
    else if (!isFiniteNumberOrNull(layer[field])) fail(`${path}.${field} must be finite number or null`);
  }
}

function assertStatusKeys(layer, path, keys, allowed = new Set(['live', 'fallback', 'missing', 'manual_required'])) {
  if (!isPlainObject(layer.sourceStatus)) {
    fail(`${path}.sourceStatus must be an object`);
    return;
  }
  for (const key of keys) {
    if (!allowed.has(layer.sourceStatus[key])) fail(`${path}.sourceStatus.${key} is not supported`);
  }
}

const radarData = JSON.parse(readText('data/radar-data.json'));
const runDailyText = readText('scripts/run-daily-pipeline.mjs');
const renderMacroText = readText('scripts/modules/renderMacroOverview.js');
const validateText = readText('scripts/validate-data.mjs');
const dataContractText = readText('docs/DATA_CONTRACT.md');
const dataSourcesText = readText('docs/DATA_SOURCES.md');
const agentsText = readText('AGENTS.md');

const macroDrivers = radarData?.macroDrivers;
if (!isPlainObject(macroDrivers)) fail('macroDrivers is missing or not an object');

const freight = macroDrivers?.shippingFreight;
assertLayer('macroDrivers.shippingFreight', freight);
if (isPlainObject(freight)) {
  assertFiniteOrNull(freight, 'macroDrivers.shippingFreight', [
    'balticDirtyTankerIndex',
    'balticDirtyTankerDailyChangePct',
    'balticCleanTankerIndex',
    'balticCleanTankerDailyChangePct',
    'balticDryIndex',
    'balticDryDailyChangePct'
  ]);
  assertStatusKeys(freight, 'macroDrivers.shippingFreight', ['dirtyTanker', 'cleanTanker', 'dryBulk']);
  if (freight.source !== 'StockQ:BDTI; StockQ:BCTI; StockQ:BDI') fail('macroDrivers.shippingFreight.source is not the approved M-74 source string');
}

const policy = macroDrivers?.policyExpectations;
assertLayer('macroDrivers.policyExpectations', policy);
if (isPlainObject(policy)) {
  assertFiniteOrNull(policy, 'macroDrivers.policyExpectations', [
    'targetLower',
    'targetUpper',
    'targetMid',
    'effectiveFedFundsRate',
    'fedFundsFutureFrontPrice',
    'fedFundsFutureImpliedRate',
    'futureMinusTargetMid',
    'dotPlotMedianCurrentYear',
    'dotPlotMedianNextYear',
    'minutesHawkishTermCount',
    'minutesDovishTermCount',
    'hawkishTermCount',
    'dovishTermCount',
    'oisForwardRate'
  ]);
  if (!isPlainObject(policy.fedFundsFuturesCurve) || !Array.isArray(policy.fedFundsFuturesCurve.contracts)) {
    fail('macroDrivers.policyExpectations.fedFundsFuturesCurve is missing');
  }
  if (!isPlainObject(policy.sofrFuturesCurve) || !Array.isArray(policy.sofrFuturesCurve.contracts)) {
    fail('macroDrivers.policyExpectations.sofrFuturesCurve is missing');
  }
  if (!isPlainObject(policy.oisForwardCurve) || !Array.isArray(policy.oisForwardCurve.tenors)) {
    fail('macroDrivers.policyExpectations.oisForwardCurve is missing');
  }
  assertStatusKeys(policy, 'macroDrivers.policyExpectations', ['targetRange', 'fedFundsFuture', 'fedFundsFuturesCurve', 'sofrFuturesCurve', 'sepDotPlot', 'policyStatement', 'fomcMinutes', 'oisForward']);
  if (policy.source !== 'FRED:DFEDTARL/DFEDTARU/DFF; Yahoo:ZQ=F/ZQ-monthly-futures/SR3-monthly-SOFR-futures; CheckMySwap:USD-OIS-public-curve; FederalReserve:FOMC statement/SEP/minutes') {
    fail('macroDrivers.policyExpectations.source is not the approved M-80 source string');
  }
}

const privateCredit = macroDrivers?.privateCreditProxy;
assertLayer('macroDrivers.privateCreditProxy', privateCredit);
if (isPlainObject(privateCredit)) {
  assertFiniteOrNull(privateCredit, 'macroDrivers.privateCreditProxy', ['bdcEtfPrice', 'bdcEtf4wChange', 'pbdcEtfPrice', 'pbdcEtf4wChange', 'seniorLoanEtfPrice', 'seniorLoanEtf4wChange', 'hyOas', 'igOas', 'igMinusHyOas', 'cdxHyPrice', 'cdxIgPrice']);
  assertStatusKeys(privateCredit, 'macroDrivers.privateCreditProxy', ['bdcEtf', 'pbdcEtf', 'seniorLoanEtf', 'hyOas', 'igOas', 'cdxHy', 'cdxIg', 'privateCreditMarks']);
  if (privateCredit.source !== 'Yahoo:BIZD; Yahoo:PBDC; Yahoo:SRLN; FRED:BAMLH0A0HYM2; FRED:BAMLC0A0CM; ICE:CDX-index-settlement-public') fail('macroDrivers.privateCreditProxy.source is not the approved M-81 source string');
}

const consumerRetail = macroDrivers?.consumerRetail;
assertLayer('macroDrivers.consumerRetail', consumerRetail);
if (isPlainObject(consumerRetail)) {
  assertFiniteOrNull(consumerRetail, 'macroDrivers.consumerRetail', [
    'bofaCardSpendingYoY',
    'bofaCardSpendingPriorYoY',
    'bofaCardSpendingExGasYoY',
    'redbookRetailSalesYoY',
    'redbookHistoricalAverageYoY'
  ]);
  assertStatusKeys(consumerRetail, 'macroDrivers.consumerRetail', ['carts', 'cartsr', 'retailSegments', 'bofaConsumerCheckpoint', 'redbookPublicHtml'], new Set(['live', 'fallback', 'missing']));
  if (consumerRetail.source !== 'FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments; BofA:ConsumerCheckpoint-public-html; TradingEconomics:Redbook-public-html') {
    fail('macroDrivers.consumerRetail.source is not the approved M-79 source string');
  }
}

const requiredRunDailyMarkers = [
  'async function resolveShippingFreight(prevShippingFreight)',
  "fetchStockqIndex('BDTI', 'Baltic Dirty Tanker Index')",
  "fetchStockqIndex('BCTI', 'Baltic Clean Tanker Index')",
  "fetchStockqIndex('BDI', 'Baltic Dry Index')",
  'async function resolvePolicyExpectations(prevPolicy)',
  "fetchYahooChartQuote('ZQ=F', '1mo', '1d')",
  "root: 'ZQ'",
  "root: 'SR3'",
  'fetchCheckMySwapUsdOisCurve',
  'parseFedSepMedians',
  'parseFedPolicyTone',
  'parseFedMinutesTone',
  'async function resolvePrivateCreditProxy(prevPrivateCredit, hyOasLive)',
  "fetchYahooChartQuote('BIZD', '1mo', '1d')",
  "fetchYahooChartQuote('PBDC', '1mo', '1d')",
  "fetchYahooChartQuote('SRLN', '1mo', '1d')",
  'fetchIceCdxIndexSettlements',
  'ICE_CDX_INDEX_SETTLEMENT_URL',
  "fetchFredSeries('BAMLC0A0CM', 30)",
  'fetchBofaConsumerCheckpoint',
  'fetchTradingEconomicsRedbookIndex',
  'resolveBrentFuturesCurve',
  'resolveBrentFuturesPriceCurve',
  'shippingFreight: macroDrivers.shippingFreight',
  'policyExpectations: macroDrivers.policyExpectations',
  'privateCreditProxy: macroDrivers.privateCreditProxy'
];
for (const marker of requiredRunDailyMarkers) {
  if (!runDailyText.includes(marker)) fail(`run-daily-pipeline missing M-74 marker: ${marker}`);
}

const requiredRenderMarkers = [
  "id: 'driver-shipping-freight'",
  "id: 'driver-policy'",
  "id: 'driver-private-credit-proxy'",
  'BDTI',
  'BCTI',
  'BDI',
  'TGCR-SOFR',
  'ZQ front price',
  'ZQ monthly futures curve proxy',
  'two-year',
  'longer-run',
  'hawkish',
  'dovish',
  'FOMC minutes',
  'BoA Consumer Checkpoint',
  'ICE Brent futuresCurve structure-only',
  'Yahoo Brent priced futures proxy',
  'MRTS 细分 ${index + 1}:',
  'non-public CRE loan tape status',
  'CDX HY status',
  'private credit marks status',
  'sourceStatus:',
  'NFCI',
  'Fed funds futures',
  'SR3 SOFR futures',
  'CheckMySwap USD OIS public curve',
  'FOMC statement',
  'BIZD',
  'PBDC',
  'SRLN',
  'ICE CDX',
  'IG OAS',
  'Redbook public HTML'
];
for (const marker of requiredRenderMarkers) {
  if (!renderMacroText.includes(marker)) fail(`renderMacroOverview missing M-74 marker: ${marker}`);
}

const requiredValidateMarkers = [
  'validateMacroDriversShippingFreight(data)',
  'validateMacroDriversPolicyExpectations(data)',
  'validateMacroDriversPrivateCreditProxy(data)'
];
for (const marker of requiredValidateMarkers) {
  if (!validateText.includes(marker)) fail(`validate-data missing M-74 marker: ${marker}`);
}

for (const marker of [
  'macroDrivers.shippingFreight',
  'macroDrivers.policyExpectations',
  'macroDrivers.privateCreditProxy',
  'BDTI',
  'ZQ=F',
  'ZQ-monthly-futures',
  'SR3-monthly-SOFR-futures',
  'CheckMySwap',
  'fomcminutesYYYYMMDD.htm',
  'BoA Consumer Checkpoint',
  'Redbook public HTML',
  'BAMLC0A0CM',
  'BIZD',
  'PBDC',
  'SRLN',
  'ICE:CDX-index-settlement-public'
]) {
  if (!dataContractText.includes(marker)) fail(`DATA_CONTRACT missing M-74 marker: ${marker}`);
  if (!dataSourcesText.includes(marker)) fail(`DATA_SOURCES missing M-74 marker: ${marker}`);
}

if (!agentsText.includes('M-74 后')) fail('AGENTS.md missing M-74 boundary note');

if (errors.length > 0) {
  console.error('Expanded macro-driver auto-ingestion check FAILED:');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}

console.log(
  'Expanded macro-driver auto-ingestion check: PASS ' +
  `(BDTI=${freight.balticDirtyTankerIndex}, ZQ=${policy.fedFundsFutureImpliedRate}, ` +
  `dot=${policy.dotPlotMedianCurrentYear}, minutes=${policy.minutesPolicyTone}, BIZD=${privateCredit.bdcEtfPrice}, CDXHY=${privateCredit.cdxHyPrice})`
);
