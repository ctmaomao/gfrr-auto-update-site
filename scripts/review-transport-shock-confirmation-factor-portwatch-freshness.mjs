#!/usr/bin/env node
import { safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-portwatch-freshness-v1';
const SOURCE = 'IMFPortWatch:Daily_Chokepoints_Data';
const SOURCE_URL = 'https://portwatch.imf.org/';
const QUERY_URL = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query';
const QUERY_RECORD_LIMIT = 1000;
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/portwatch-freshness-latest.json';
const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_TIMEOUT_MS = 10000;
const CHOKEPOINTS = [
  { key: 'suez', portid: 'chokepoint1', portname: 'Suez Canal', core: true },
  { key: 'panama', portid: 'chokepoint2', portname: 'Panama Canal', core: false },
  { key: 'bosporus', portid: 'chokepoint3', portname: 'Bosporus Strait', core: false },
  { key: 'babElMandeb', portid: 'chokepoint4', portname: 'Bab el-Mandeb Strait', core: true },
  { key: 'malacca', portid: 'chokepoint5', portname: 'Malacca Strait', core: true },
  { key: 'hormuz', portid: 'chokepoint6', portname: 'Strait of Hormuz', core: true },
  { key: 'capeGoodHope', portid: 'chokepoint7', portname: 'Cape of Good Hope', core: true },
  { key: 'gibraltar', portid: 'chokepoint8', portname: 'Gibraltar Strait', core: true }
];
const CHOKEPOINT_BY_PORTID = new Map(CHOKEPOINTS.map((item) => [item.portid, item]));
const CORE_KEYS = CHOKEPOINTS.filter((item) => item.core).map((item) => item.key);
const BOUNDARY =
  'artifact-only Transport Shock PortWatch freshness probe; reads IMF PortWatch ArcGIS or fixture payload, writes ignored manual-artifacts only; no production data write; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-portwatch-freshness -- [options]

Options:
  --input <path>          Optional ArcGIS fixture/manual payload. If omitted, fetches PortWatch live.
  --output <path>         Ignored review artifact. Default: ${DEFAULT_OUTPUT}
  --max-age-days <n>      Freshness threshold for core chokepoints. Default: ${DEFAULT_MAX_AGE_DAYS}
  --timeout-ms <n>        Live fetch timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --as-of <YYYY-MM-DD>    Evaluation date override for fixture review.
  --json                  Print full JSON review to stdout.
  --no-output             Do not write ignored artifact.
  --help                  Show this help.

Boundary:
  Reads only docs/fixtures/transport-shock-confirmation-factor/,
  manual-artifacts/transport-shock-confirmation-factor/, or live IMF PortWatch.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  Does not write production data, frontend, workflow, Worker, ODP finalBias, or main judgment scoring.`);
}

function isAllowedInputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true
    || relativePath?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function isManualOutputPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function parseDateOnly(value, label) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString().slice(0, 10);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (Number.isFinite(parsed.valueOf())) return parsed.toISOString().slice(0, 10);
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

function dateOnlyAgeDays(dateOnly, asOfDateOnly) {
  if (!dateOnly || !asOfDateOnly) return null;
  const dateMs = Date.parse(`${dateOnly}T00:00:00Z`);
  const asOfMs = Date.parse(`${asOfDateOnly}T00:00:00Z`);
  if (!Number.isFinite(dateMs) || !Number.isFinite(asOfMs)) return null;
  return Math.floor((asOfMs - dateMs) / 86400000);
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseArgs(argv) {
  const options = {
    input: null,
    output: DEFAULT_OUTPUT,
    maxAgeDays: DEFAULT_MAX_AGE_DAYS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    asOf: new Date().toISOString().slice(0, 10),
    printJson: false,
    writeOutput: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--input') options.input = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--max-age-days') options.maxAgeDays = Number(nextValue());
    else if (arg === '--timeout-ms') options.timeoutMs = Number(nextValue());
    else if (arg === '--as-of') options.asOf = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.input && !isAllowedInputPath(options.input)) throw new Error(`Refusing to read input outside allowed paths: ${options.input}`);
  if (options.writeOutput && !isManualOutputPath(options.output)) {
    throw new Error(`Refusing to write freshness review outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  if (!Number.isInteger(options.maxAgeDays) || options.maxAgeDays < 1 || options.maxAgeDays > 30) {
    throw new Error('Invalid --max-age-days. Expected integer 1..30.');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 30000) {
    throw new Error('Invalid --timeout-ms. Expected integer 1000..30000.');
  }
  options.asOf = parseDateOnly(options.asOf, '--as-of');
  return options;
}

function buildQueryUrl() {
  const params = new URLSearchParams();
  const quotedIds = CHOKEPOINTS.map((item) => `'${item.portid}'`).join(',');
  params.set('f', 'json');
  params.set('where', `portid IN (${quotedIds})`);
  params.set('outFields', 'date,portid,portname,n_tanker,n_total,capacity_tanker,capacity');
  params.set('orderByFields', 'date DESC');
  params.set('returnGeometry', 'false');
  params.set('resultRecordCount', String(QUERY_RECORD_LIMIT));
  return `${QUERY_URL}?${params.toString()}`;
}

async function fetchPayload(options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(buildQueryUrl(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'GFRRBot/1.0 TransportShockPortWatchFreshnessProbe' }
    });
    if (!response.ok) throw new Error(`portwatch_http_${response.status}`);
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

function readPayload(options) {
  if (!options.input) return null;
  const absolutePath = resolve(options.input);
  if (!existsSync(absolutePath)) throw new Error(`Input file does not exist: ${options.input}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function parseRows(payload) {
  if (payload?.error) throw new Error(`portwatch_api_error:${JSON.stringify(payload.error).slice(0, 160)}`);
  const features = payload?.features;
  if (!Array.isArray(features)) throw new Error('portwatch_missing_features');
  return features
    .map((feature) => {
      const row = feature?.attributes || {};
      const portid = typeof row.portid === 'string' ? row.portid : null;
      const definition = portid ? CHOKEPOINT_BY_PORTID.get(portid) : null;
      return {
        date: parseDateOnly(row.date, 'PortWatch row date'),
        portid,
        key: definition?.key ?? null,
        portname: typeof row.portname === 'string' ? row.portname : definition?.portname ?? null,
        core: definition?.core === true,
        nTanker: asNumber(row.n_tanker),
        nTotal: asNumber(row.n_total),
        capacityTanker: asNumber(row.capacity_tanker),
        capacityTotal: asNumber(row.capacity)
      };
    })
    .filter((row) => row.key && row.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function latestRowsByChokepoint(rows, asOf) {
  return Object.fromEntries(CHOKEPOINTS.map((definition) => {
    const latest = rows.find((row) => row.key === definition.key) || null;
    return [definition.key, {
      portid: definition.portid,
      portname: definition.portname,
      core: definition.core,
      rowCount: rows.filter((row) => row.key === definition.key).length,
      latestDate: latest?.date ?? null,
      latestAgeDays: latest ? dateOnlyAgeDays(latest.date, asOf) : null,
      nTanker: latest?.nTanker ?? null,
      capacityTanker: latest?.capacityTanker ?? null
    }];
  }));
}

function falseImpactMap() {
  return {
    writesProductionData: false,
    modifiesFrontend: false,
    modifiesWorkerRuntime: false,
    modifiesWorkflow: false,
    affectsValues: false,
    affectsDisplayInputsBaseline: false,
    affectsEffectiveDisplayInputs: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsMainJudgment: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function buildReview(payload, options, sourceMode) {
  const rows = parseRows(payload);
  const latestDate = rows[0]?.date ?? null;
  const latestAgeDays = latestDate ? dateOnlyAgeDays(latestDate, options.asOf) : null;
  const chokepoints = latestRowsByChokepoint(rows, options.asOf);
  const missingCoreKeys = CORE_KEYS.filter((key) => !chokepoints[key]?.latestDate);
  const staleCoreKeys = CORE_KEYS.filter((key) => {
    const age = chokepoints[key]?.latestAgeDays;
    return age === null || age > options.maxAgeDays || age < 0;
  });
  const freshEnough = latestAgeDays !== null && latestAgeDays >= 0 && latestAgeDays <= options.maxAgeDays;
  const coreFreshEnough = missingCoreKeys.length === 0 && staleCoreKeys.length === 0;
  const supportsPortWatchFreshnessPass = freshEnough && coreFreshEnough;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: supportsPortWatchFreshnessPass
      ? 'portwatch_freshness_probe_fresh_no_production_write'
      : 'portwatch_freshness_probe_stale_or_partial_no_production_write',
    recommendation: supportsPortWatchFreshnessPass
      ? 'rerun_transport_shock_cross_confirmation_to_clear_portwatch_freshness_only'
      : 'keep_portwatch_freshness_blocker_until_source_updates_or_daily_refreshes',
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    sourceMode,
    inputPath: options.input ? safeRelativePath(options.input) : null,
    asOf: options.asOf,
    maxAgeDays: options.maxAgeDays,
    rowCount: rows.length,
    latestDate,
    latestAgeDays,
    freshEnough,
    coreFreshEnough,
    supportsPortWatchFreshnessPass,
    missingCoreKeys,
    staleCoreKeys,
    chokepoints,
    preflightImpact: {
      canClearHardBlockerId: supportsPortWatchFreshnessPass ? 'portwatch_physical_proxy_freshness' : null,
      cannotClearHardBlockerIds: [
        'route_freight_confirmation',
        'news_manual_gate',
        'high_frequency_physical_confirmation'
      ],
      scoreWriteApproved: false,
      eligibleForMainScore: false
    },
    productionImpact: falseImpactMap(),
    boundaries: {
      outputOnlyToManualArtifacts: true,
      productionDataWriteApproved: false,
      frontendDisplayApproved: false,
      scoreWriteApproved: false,
      eligibleForMainScore: false,
      noRawProviderResponseStored: true,
      portwatchFreshnessProbeOnly: true
    },
    boundary: BOUNDARY,
    limitationZh: '本探针只确认 PortWatch 咽喉代理是否足够新鲜;不确认油轮路线运费、封锁、断供、暗航行、战争概率或油价方向。'
  };
}

function printSummary(review) {
  console.log(`Transport Shock PortWatch freshness probe: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`sourceMode: ${review.sourceMode}`);
  console.log(`latestDate: ${review.latestDate || 'none'}`);
  console.log(`latestAgeDays: ${review.latestAgeDays ?? 'n/a'}`);
  console.log(`supportsPortWatchFreshnessPass: ${review.supportsPortWatchFreshnessPass}`);
  console.log(`missingCoreKeys: ${review.missingCoreKeys.join(', ') || 'none'}`);
  console.log(`staleCoreKeys: ${review.staleCoreKeys.join(', ') || 'none'}`);
  console.log(`scoreWriteApproved: ${review.boundaries.scoreWriteApproved}`);
  console.log(`boundary: ${review.boundary}`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const sourceMode = options.input ? 'fixture_or_manual_payload' : 'live_portwatch';
    const payload = readPayload(options) || await fetchPayload(options);
    const review = buildReview(payload, options, sourceMode);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
