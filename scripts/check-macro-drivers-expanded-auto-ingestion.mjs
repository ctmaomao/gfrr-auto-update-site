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

function assertEnergyTransportChokepoint(layer, path, key, requireLiveValues = false) {
  const node = layer?.chokepoints?.[key];
  if (!isPlainObject(node)) {
    fail(`${path}.chokepoints.${key} is missing or not an object`);
    return;
  }
  if (!isPlainObject(node.latest)) {
    fail(`${path}.chokepoints.${key}.latest is missing or not an object`);
    return;
  }
  if (!isFiniteNumberOrNull(node.latest.nTanker)) fail(`${path}.chokepoints.${key}.latest.nTanker must be finite number or null`);
  if (!isFiniteNumberOrNull(node.latest.capacityTanker)) fail(`${path}.chokepoints.${key}.latest.capacityTanker must be finite number or null`);
  if (requireLiveValues) {
    if (!Number.isFinite(node.latest.nTanker)) fail(`${path}.chokepoints.${key}.latest.nTanker must be finite when live/fallback`);
    if (!Number.isFinite(node.latest.capacityTanker)) fail(`${path}.chokepoints.${key}.latest.capacityTanker must be finite when live/fallback`);
  }
}

const radarData = JSON.parse(readText('data/radar-data.json'));
const runDailyText = readText('scripts/run-daily-pipeline.mjs');
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

const energySpareCapacity = macroDrivers?.energySpareCapacity;
if (energySpareCapacity !== undefined) {
  assertLayer('macroDrivers.energySpareCapacity', energySpareCapacity);
  if (isPlainObject(energySpareCapacity)) {
    assertFiniteOrNull(energySpareCapacity, 'macroDrivers.energySpareCapacity', ['spareCapacityMbpd', 'forecast12mMbpd', 'forecast18mMbpd']);
    assertStatusKeys(energySpareCapacity, 'macroDrivers.energySpareCapacity', ['spareCapacity'], new Set(['live', 'fallback', 'missing', 'stale']));
    if (energySpareCapacity.source !== 'EIA:STEO:COPS_OPEC') fail('macroDrivers.energySpareCapacity.source is not the approved EIA STEO source string');
    if (energySpareCapacity.unit !== 'million barrels per day') fail('macroDrivers.energySpareCapacity.unit is not the approved unit');
    if (energySpareCapacity.frequency !== 'monthly') fail('macroDrivers.energySpareCapacity.frequency must be monthly');
  }
}

const energyTransport = macroDrivers?.energyTransport;
if (energyTransport !== undefined) {
  assertLayer('macroDrivers.energyTransport', energyTransport);
  if (isPlainObject(energyTransport)) {
    assertStatusKeys(energyTransport, 'macroDrivers.energyTransport', ['chokepoints'], new Set(['live', 'fallback', 'missing', 'stale']));
    if (energyTransport.source !== 'IMFPortWatch:Daily_Chokepoints_Data') fail('macroDrivers.energyTransport.source is not the approved IMF PortWatch source string');
    if (energyTransport.usageTermsPinned !== 'imf_data_terms_pinned') fail('macroDrivers.energyTransport.usageTermsPinned must be imf_data_terms_pinned after PortWatch TOS pin proof');
    if (energyTransport.redistributionCaveat !== true) fail('macroDrivers.energyTransport.redistributionCaveat must be true');
    if (!isPlainObject(energyTransport.reroutingProxy)) fail('macroDrivers.energyTransport.reroutingProxy is missing');
    const status = energyTransport.sourceStatus?.chokepoints;
    const requireLiveValues = status === 'live' || status === 'fallback';
    for (const key of ['suez', 'babElMandeb', 'malacca', 'hormuz', 'capeGoodHope', 'gibraltar']) {
      assertEnergyTransportChokepoint(energyTransport, 'macroDrivers.energyTransport', key, requireLiveValues);
    }
  }
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
  assertFiniteOrNull(privateCredit, 'macroDrivers.privateCreditProxy', ['bdcEtfPrice', 'bdcEtf4wChange', 'pbdcEtfPrice', 'pbdcEtf4wChange', 'seniorLoanEtfPrice', 'seniorLoanEtf4wChange', 'intervalFundNavPrice', 'intervalFundNav4wChange', 'hyOas', 'igOas', 'igMinusHyOas', 'cdxHyPrice', 'cdxIgPrice']);
  assertStatusKeys(privateCredit, 'macroDrivers.privateCreditProxy', ['bdcEtf', 'pbdcEtf', 'seniorLoanEtf', 'intervalFundNav', 'hyOas', 'igOas', 'cdxHy', 'cdxIg', 'privateCreditMarks']);
  if (privateCredit.source !== 'Yahoo:BIZD; Yahoo:PBDC; Yahoo:SRLN; Yahoo:CCLFX; FRED:BAMLH0A0HYM2; FRED:BAMLC0A0CM; ICE:CDX-index-settlement-public') fail('macroDrivers.privateCreditProxy.source is not the approved M-83 source string');
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
  'resolveEnergySpareCapacity(prevMd.energySpareCapacity)',
  'ENERGY_SPARE_CAPACITY_SOURCE',
  'ENERGY_SPARE_CAPACITY_SERIES_ID',
  'buildEnergySpareCapacityApiUrl',
  'parseEnergySpareCapacityRows',
  'energySpareCapacity: macroDrivers.energySpareCapacity',
  'resolveEnergyTransport(prevMd.energyTransport)',
  'ENERGY_TRANSPORT_SOURCE',
  'ENERGY_TRANSPORT_QUERY_URL',
  'buildEnergyTransportQueryUrl',
  'parseEnergyTransportRows',
  'energyTransport: macroDrivers.energyTransport',
  'async function resolvePrivateCreditProxy(prevPrivateCredit, hyOasLive)',
  "fetchYahooChartQuote('BIZD', '1mo', '1d')",
  "fetchYahooChartQuote('PBDC', '1mo', '1d')",
  "fetchYahooChartQuote('SRLN', '1mo', '1d')",
  "fetchYahooChartQuote('CCLFX', '1mo', '1d')",
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

// PR 2b: M-74/M-79/M-80/M-83 expanded auto-ingestion renderer markers in renderMacroOverview.js
// were removed in Stage 8 per contract v3.0 sec 8.4 (buildMacroDrivers simplified to mock
// 4-pillar object; driver-shipping-freight, driver-policy, driver-private-credit-proxy nodes
// and their detailed evidence all deleted).
// Field consumption status:
//   - macroDrivers.policyExpectations: preserved in renderThematicCards.js (2 references,
//     c2-fed-path card consumes targetMid/effectiveFedFundsRate/ZQ futures curve)
//   - macroDrivers.privateCreditProxy: preserved in renderThematicCards.js (2 references,
//     c3-private-credit-proxy card consumes bdcEtfPrice/pbdcEtfPrice/seniorLoanEtfPrice etc.)
//   - macroDrivers.shippingFreight: 0 references in renderThematicCards.js (matches its
//     milestone design: BDTI/BCTI/BDI are audit-only / display-only data and were never
//     intended for primary UI display; data field validation + runDaily contract still enforce
//     the field exists in radar-data.json)
// Data field validation + 29 runDailyMarkers + 17 contractMarkers (+ same in DATA_SOURCES) +
// validate-data markers + AGENTS marker all preserved.

const requiredValidateMarkers = [
  'validateMacroDriversShippingFreight(data)',
  'validateMacroDriversEnergySpareCapacity(data)',
  'validateMacroDriversEnergyTransport(data)',
  'validateMacroDriversPolicyExpectations(data)',
  'validateMacroDriversPrivateCreditProxy(data)'
];
for (const marker of requiredValidateMarkers) {
  if (!validateText.includes(marker)) fail(`validate-data missing M-74 marker: ${marker}`);
}

for (const marker of [
  'macroDrivers.shippingFreight',
  'macroDrivers.energySpareCapacity',
  'EIA:STEO:COPS_OPEC',
  'COPS_OPEC',
  'macroDrivers.energyTransport',
  'IMFPortWatch:Daily_Chokepoints_Data',
  'usageTermsPinned',
  'redistributionCaveat',
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
  'CCLFX',
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
  `dot=${policy.dotPlotMedianCurrentYear}, minutes=${policy.minutesPolicyTone}, BIZD=${privateCredit.bdcEtfPrice}, CCLFX=${privateCredit.intervalFundNavPrice}, ` +
  `CDXHY=${privateCredit.cdxHyPrice}, PortWatch=${energyTransport?.sourceStatus?.chokepoints || 'pending'})`
);
