#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'oil-thermal-watch-1';
const MODULE = 'oil-thermal-watch';
const DEFAULT_FACILITIES = 'config/oil-thermal-watch-facilities.json';
const DEFAULT_OUTPUT = 'data/oil-thermal-watch.json';
const DEFAULT_KEY_FILE = 'manual-artifacts/oil-thermal/firms-map-key.txt';
const DEFAULT_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
const VALID_SOURCES = new Set([...DEFAULT_SOURCES, 'MODIS_NRT']);
const DEFAULT_DAY_RANGE = 1;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_FACILITIES_PER_RUN = 50;
const MAX_REQUESTS_PER_RUN = 150;
const MAX_FACILITY_BBOX_SPAN_DEGREES = 1.5;
const BOUNDARY =
  'production read-only satellite thermal watch; display-only/audit-only; NOT in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function parseArgs(argv) {
  const options = {
    facilitiesPath: DEFAULT_FACILITIES,
    output: DEFAULT_OUTPUT,
    keyFile: DEFAULT_KEY_FILE,
    sources: DEFAULT_SOURCES,
    dayRange: DEFAULT_DAY_RANGE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    writeOutput: true,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    const nextValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === '--facilities') {
      options.facilitiesPath = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--map-key-file') {
      options.keyFile = nextValue();
    } else if (arg === '--sources') {
      options.sources = nextValue().split(',').map((source) => source.trim()).filter(Boolean);
    } else if (arg === '--day-range') {
      options.dayRange = Number(nextValue());
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.dayRange) || options.dayRange < 1 || options.dayRange > 5) {
    throw new Error('Invalid --day-range. NASA FIRMS Area API supports 1..5.');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 60000) {
    throw new Error('Invalid --timeout-ms. Expected 1000..60000.');
  }
  options.sources = [...new Set(options.sources)];
  const invalidSources = options.sources.filter((source) => !VALID_SOURCES.has(source));
  if (options.sources.length === 0 || invalidSources.length > 0) {
    throw new Error(`Unsupported FIRMS source(s): ${invalidSources.join(', ') || '(none)'}`);
  }
  return options;
}

function resolveMapKey(options) {
  const envKey = String(process.env.FIRMS_MAP_KEY ?? '').trim();
  if (envKey) {
    return { mapKey: envKey, source: 'env:FIRMS_MAP_KEY', status: 'configured' };
  }
  if (options.keyFile && existsSync(resolve(options.keyFile))) {
    const fileKey = readFileSync(resolve(options.keyFile), 'utf8').trim();
    if (fileKey) return { mapKey: fileKey, source: `file:${options.keyFile}`, status: 'configured' };
  }
  return { mapKey: null, source: null, status: 'missing' };
}

function parseBbox(rawBbox, label) {
  const values = Array.isArray(rawBbox)
    ? rawBbox.map((value) => Number(value))
    : String(rawBbox).split(',').map((value) => Number(value.trim()));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} must be west,south,east,north numeric coordinates.`);
  }
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error(`${label} bounds are invalid.`);
  }
  if (east - west > MAX_FACILITY_BBOX_SPAN_DEGREES || north - south > MAX_FACILITY_BBOX_SPAN_DEGREES) {
    throw new Error(`${label} must be a small facility bbox, max ${MAX_FACILITY_BBOX_SPAN_DEGREES} degrees per axis.`);
  }
  return { west, south, east, north, string: values.join(',') };
}

function readFacilityConfig(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    return {
      schemaVersion: 'oil-thermal-facilities-production-v1',
      facilities: [],
      missingFile: true
    };
  }
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  const facilities = Array.isArray(parsed) ? parsed : parsed.facilities;
  if (!Array.isArray(facilities)) {
    throw new Error('Oil thermal facility config must be an array or an object with facilities[].');
  }
  if (facilities.length > MAX_FACILITIES_PER_RUN) {
    throw new Error(`Too many facilities (${facilities.length}); max ${MAX_FACILITIES_PER_RUN}.`);
  }
  const ids = new Set();
  return {
    schemaVersion: parsed.schemaVersion ?? 'oil-thermal-facilities-production-v1',
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((note) => typeof note === 'string') : [],
    facilities: facilities.map((facility, index) => {
      const id = String(facility.id ?? '').trim();
      if (!/^[A-Za-z0-9_.:-]+$/.test(id)) throw new Error(`Facility ${index} has invalid id.`);
      if (ids.has(id)) throw new Error(`Duplicate facility id: ${id}`);
      ids.add(id);
      const label = String(facility.label ?? facility.name ?? '').trim();
      const region = String(facility.region ?? '').trim();
      const assetType = String(facility.assetType ?? '').trim();
      const sourceNote = String(facility.sourceNote ?? '').trim();
      if (!label || !region || !assetType || !sourceNote) {
        throw new Error(`Facility ${id} must include label, region, assetType, and sourceNote.`);
      }
      const bbox = parseBbox(facility.bbox, `Facility ${id} bbox`);
      return { id, label, region, assetType, sourceNote, bbox };
    })
  };
}

function buildUrl(mapKey, source, bboxString, dayRange) {
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${source}/${bboxString}/${dayRange}`;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/u, '').split(/\r?\n/u).map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length === 0) throw new Error('FIRMS response was empty.');
  if (lines[0].startsWith('<')) throw new Error('FIRMS response was not CSV.');
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const missing = ['acq_date', 'acq_time', 'confidence', 'frp', 'daynight'].filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new Error(`FIRMS CSV missing expected columns: ${missing.join(', ')}`);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
}

function toAcqIso(record) {
  if (!record.acq_date || !record.acq_time) return null;
  const time = String(record.acq_time).padStart(4, '0');
  return `${record.acq_date}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`;
}

function summarizeRecords(records) {
  const summary = {
    rowCount: records.length,
    latestAcqAt: null,
    maxFrp: null,
    confidenceCounts: {},
    highConfidenceCount: 0,
    frpOver50Count: 0,
    frpOver100Count: 0,
    dayNightCounts: {}
  };
  for (const record of records) {
    const confidence = record.confidence || 'unknown';
    summary.confidenceCounts[confidence] = (summary.confidenceCounts[confidence] ?? 0) + 1;
    const numericConfidence = Number(confidence);
    if (confidence === 'h' || (Number.isFinite(numericConfidence) && numericConfidence >= 80)) summary.highConfidenceCount += 1;
    const frp = Number(record.frp);
    if (Number.isFinite(frp) && (summary.maxFrp === null || frp > summary.maxFrp)) summary.maxFrp = frp;
    if (Number.isFinite(frp) && frp >= 50) summary.frpOver50Count += 1;
    if (Number.isFinite(frp) && frp >= 100) summary.frpOver100Count += 1;
    const dayNight = record.daynight || 'unknown';
    summary.dayNightCounts[dayNight] = (summary.dayNightCounts[dayNight] ?? 0) + 1;
    const acqAt = toAcqIso(record);
    if (acqAt && (!summary.latestAcqAt || acqAt > summary.latestAcqAt)) summary.latestAcqAt = acqAt;
  }
  return summary;
}

function mergeCounts(target, source) {
  Object.entries(source ?? {}).forEach(([key, value]) => {
    target[key] = (target[key] ?? 0) + value;
  });
}

function aggregateSummaries(summaries) {
  const aggregate = {
    rowCount: 0,
    latestAcqAt: null,
    maxFrp: null,
    confidenceCounts: {},
    highConfidenceCount: 0,
    frpOver50Count: 0,
    frpOver100Count: 0,
    dayNightCounts: {}
  };
  for (const summary of summaries) {
    aggregate.rowCount += summary.rowCount;
    if (summary.latestAcqAt && (!aggregate.latestAcqAt || summary.latestAcqAt > aggregate.latestAcqAt)) {
      aggregate.latestAcqAt = summary.latestAcqAt;
    }
    if (summary.maxFrp !== null && (aggregate.maxFrp === null || summary.maxFrp > aggregate.maxFrp)) {
      aggregate.maxFrp = summary.maxFrp;
    }
    aggregate.highConfidenceCount += summary.highConfidenceCount;
    aggregate.frpOver50Count += summary.frpOver50Count;
    aggregate.frpOver100Count += summary.frpOver100Count;
    mergeCounts(aggregate.confidenceCounts, summary.confidenceCounts);
    mergeCounts(aggregate.dayNightCounts, summary.dayNightCounts);
  }
  return aggregate;
}

function emptySummary() {
  return aggregateSummaries([]);
}

function deriveAnomalyLevel(summary, sourceCount, sourceDetections) {
  if (summary.rowCount === 0) return 'none_observed';
  if (sourceDetections >= Math.min(2, sourceCount) && (summary.highConfidenceCount >= 2 || (summary.maxFrp ?? 0) >= 50)) {
    return 'elevated_watch';
  }
  if (summary.highConfidenceCount >= 1 || (summary.maxFrp ?? 0) >= 20 || summary.rowCount >= 5) return 'watch';
  return 'low_signal';
}

function anomalyLabelZh(level) {
  return ({
    none_observed: '未观察到',
    low_signal: '低信号',
    watch: '观察',
    elevated_watch: '升高观察'
  })[level] || '待核';
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`FIRMS HTTP ${response.status}: ${text.slice(0, 120)}`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSource({ mapKey, source, facility, dayRange, timeoutMs }) {
  const url = buildUrl(mapKey, source, facility.bbox.string, dayRange);
  const text = await fetchWithTimeout(url, timeoutMs);
  const records = parseCsv(text);
  return {
    source,
    sourceStatus: 'live',
    summary: summarizeRecords(records)
  };
}

function latestAgeHours(latestAcqAt, generatedAt) {
  if (!latestAcqAt) return null;
  const latest = Date.parse(latestAcqAt);
  const generated = Date.parse(generatedAt);
  if (Number.isNaN(latest) || Number.isNaN(generated)) return null;
  return Math.max(0, Math.round(((generated - latest) / 3600000) * 10) / 10);
}

function requestBudget(sources) {
  return {
    sourceCount: sources.length,
    sources,
    maxFacilitiesPerRun: MAX_FACILITIES_PER_RUN,
    maxRequestsPerRun: MAX_REQUESTS_PER_RUN,
    maxFacilityBboxSpanDegrees: MAX_FACILITY_BBOX_SPAN_DEGREES
  };
}

function baseArtifact({ generatedAt, options, config, keyResolution, status, signalState, displayStatusZh }) {
  const facilities = config.facilities ?? [];
  return {
    schemaVersion: SCHEMA_VERSION,
    module: MODULE,
    generatedAt,
    source: 'NASA FIRMS Area API',
    sources: options.sources,
    status,
    signalState,
    displayStatusZh,
    sourceStatus: {
      mapKey: keyResolution.status,
      firms: 'not_queried',
      facilities: facilities.length > 0 ? 'configured' : 'missing'
    },
    freshness: {
      windowDays: options.dayRange,
      latestAcqAt: null,
      latestAgeHours: null,
      cadenceZh: '分钟至数小时级;受卫星过境、云层、热源持续性和 FIRMS NRT 延迟影响'
    },
    facilityCoverage: {
      configPath: options.facilitiesPath,
      configSchemaVersion: config.schemaVersion,
      whitelistStatus: facilities.length > 0 ? 'configured' : 'missing',
      facilityCount: facilities.length,
      regions: [...new Set(facilities.map((facility) => facility.region))],
      assetTypes: [...new Set(facilities.map((facility) => facility.assetType))],
      requestCount: facilities.length * options.sources.length,
      requestBudget: requestBudget(options.sources),
      notes: config.notes ?? []
    },
    aggregate: {
      ...emptySummary(),
      facilityCount: facilities.length,
      facilitiesWithDetections: 0,
      requestCount: facilities.length * options.sources.length,
      requestErrorCount: 0,
      baselineStatus: 'not_established',
      facilitiesByAnomalyLevel: {}
    },
    facilities: [],
    productionImpact: {
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    },
    boundary: BOUNDARY,
    limitationsZh: [
      'FIRMS/VIIRS 是热异常和火点代理,不是炼厂事故、停产、断供或油价方向确认。',
      '生产展示只保留设施级聚合摘要,不保存 MAP_KEY、raw URL 或原始火点明细。',
      '历史基线尚未建立前,任何热异常计数都只能作为人工复核观察。'
    ]
  };
}

async function buildLiveArtifact({ generatedAt, options, config, keyResolution }) {
  const artifact = baseArtifact({
    generatedAt,
    options,
    config,
    keyResolution,
    status: 'ok',
    signalState: 'baseline_building_no_detections',
    displayStatusZh: '观察层已接入'
  });

  const requestCount = config.facilities.length * options.sources.length;
  if (requestCount > MAX_REQUESTS_PER_RUN) {
    throw new Error(`Too many FIRMS requests (${requestCount}); max ${MAX_REQUESTS_PER_RUN}.`);
  }

  const facilityRows = [];
  for (const facility of config.facilities) {
    const sourceResults = [];
    for (const source of options.sources) {
      try {
        sourceResults.push(await fetchSource({
          mapKey: keyResolution.mapKey,
          source,
          facility,
          dayRange: options.dayRange,
          timeoutMs: options.timeoutMs
        }));
      } catch (error) {
        sourceResults.push({
          source,
          sourceStatus: 'error',
          errorReason: error.message.slice(0, 160),
          summary: emptySummary()
        });
      }
    }
    const sourceSummaries = sourceResults.map((result) => result.summary);
    const summary = aggregateSummaries(sourceSummaries);
    const sourcesWithDetections = sourceResults.filter((result) => result.summary.rowCount > 0).length;
    const sourceErrorCount = sourceResults.filter((result) => result.sourceStatus !== 'live').length;
    const anomalyLevel = deriveAnomalyLevel(summary, options.sources.length, sourcesWithDetections);
    facilityRows.push({
      id: facility.id,
      label: facility.label,
      region: facility.region,
      assetType: facility.assetType,
      sourceNote: facility.sourceNote,
      sourceAgreement: `${sourcesWithDetections}/${options.sources.length}`,
      sourceStatus: sourceErrorCount === 0 ? 'live' : (sourceErrorCount === options.sources.length ? 'error' : 'partial'),
      requestErrorCount: sourceErrorCount,
      ...summary,
      latestAgeHours: latestAgeHours(summary.latestAcqAt, generatedAt),
      anomalyLevel,
      anomalyLabelZh: anomalyLabelZh(anomalyLevel),
      baselineStatus: 'not_established',
      noteZh: '设施级热异常观察仅供人工复核;未建立历史基线前不确认事故、停产、断供或油价方向。'
    });
  }

  const aggregate = aggregateSummaries(facilityRows);
  const requestErrorCount = facilityRows.reduce((sum, facility) => sum + facility.requestErrorCount, 0);
  const facilitiesByAnomalyLevel = {};
  for (const facility of facilityRows) {
    facilitiesByAnomalyLevel[facility.anomalyLevel] = (facilitiesByAnomalyLevel[facility.anomalyLevel] ?? 0) + 1;
  }

  artifact.facilities = facilityRows;
  artifact.aggregate = {
    ...aggregate,
    latestAgeHours: latestAgeHours(aggregate.latestAcqAt, generatedAt),
    facilityCount: facilityRows.length,
    facilitiesWithDetections: facilityRows.filter((facility) => facility.rowCount > 0).length,
    requestCount,
    requestErrorCount,
    baselineStatus: 'not_established',
    facilitiesByAnomalyLevel
  };
  artifact.freshness.latestAcqAt = aggregate.latestAcqAt;
  artifact.freshness.latestAgeHours = latestAgeHours(aggregate.latestAcqAt, generatedAt);
  artifact.sourceStatus.firms = requestErrorCount === 0 ? 'live' : (requestErrorCount === requestCount ? 'error' : 'partial');
  artifact.status = artifact.sourceStatus.firms === 'error' ? 'source_unavailable' : (artifact.sourceStatus.firms === 'partial' ? 'partial' : 'ok');
  artifact.displayStatusZh = artifact.status === 'source_unavailable' ? '源暂不可用' : '观察层已接入';
  if (artifact.status === 'source_unavailable') {
    artifact.signalState = 'source_unavailable';
  } else if (artifact.aggregate.rowCount === 0) {
    artifact.signalState = 'baseline_building_no_detections';
  } else if ((artifact.aggregate.facilitiesByAnomalyLevel.elevated_watch ?? 0) > 0) {
    artifact.signalState = 'baseline_building_elevated_watch';
  } else {
    artifact.signalState = 'baseline_building_watch';
  }
  return artifact;
}

function writeJson(path, payload) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
  return absolutePath;
}

function withoutGeneratedAt(payload) {
  const clone = JSON.parse(JSON.stringify(payload));
  delete clone.generatedAt;
  return clone;
}

function stabilizeUnqueriedArtifact(options, artifact) {
  if (artifact.status !== 'not_configured' || artifact.sourceStatus?.firms !== 'not_queried') {
    return artifact;
  }
  const outputPath = resolve(options.output);
  if (!existsSync(outputPath)) {
    return artifact;
  }
  try {
    const previous = JSON.parse(readFileSync(outputPath, 'utf8'));
    if (
      previous?.schemaVersion === artifact.schemaVersion
      && typeof previous.generatedAt === 'string'
      && JSON.stringify(withoutGeneratedAt(previous)) === JSON.stringify(withoutGeneratedAt(artifact))
    ) {
      return {
        ...artifact,
        generatedAt: previous.generatedAt
      };
    }
  } catch {
    return artifact;
  }
  return artifact;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const keyResolution = resolveMapKey(options);
  const config = readFacilityConfig(options.facilitiesPath);
  let artifact;

  if (config.facilities.length === 0) {
    artifact = baseArtifact({
      generatedAt,
      options,
      config,
      keyResolution,
      status: 'not_configured',
      signalState: keyResolution.mapKey ? 'facility_whitelist_missing' : 'map_key_or_facility_missing',
      displayStatusZh: keyResolution.mapKey ? '待设施白名单' : '待配置'
    });
  } else if (!keyResolution.mapKey) {
    artifact = baseArtifact({
      generatedAt,
      options,
      config,
      keyResolution,
      status: 'not_configured',
      signalState: 'map_key_missing',
      displayStatusZh: '待配置 MAP_KEY'
    });
  } else if (options.dryRun) {
    artifact = baseArtifact({
      generatedAt,
      options,
      config,
      keyResolution,
      status: 'dry_run',
      signalState: 'dry_run',
      displayStatusZh: 'Dry run'
    });
  } else {
    artifact = await buildLiveArtifact({ generatedAt, options, config, keyResolution });
  }

  artifact = stabilizeUnqueriedArtifact(options, artifact);
  const outputPath = options.writeOutput ? writeJson(options.output, artifact) : null;
  console.log(JSON.stringify({
    status: artifact.status,
    signalState: artifact.signalState,
    sourceStatus: artifact.sourceStatus,
    facilityCoverage: artifact.facilityCoverage,
    aggregate: artifact.aggregate,
    outputPath,
    boundary: artifact.boundary
  }, null, 2));
}

main().catch((error) => {
  console.error(`Oil thermal watch build failed: ${error.message}`);
  process.exit(1);
});
