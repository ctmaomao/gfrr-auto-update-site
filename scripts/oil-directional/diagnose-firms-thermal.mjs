#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  createFirmsRetryBudget,
  fetchFirmsText,
  getFirmsErrorDiagnostics,
  summarizeFirmsRequestDiagnostics,
  wrapFirmsResponseError
} from './firms-request-policy.mjs';

const DEFAULT_SOURCE = 'VIIRS_SNPP_NRT';
const DEFAULT_BBOX = '47,23,58,31';
const DEFAULT_DAY_RANGE = '1';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json';
const DEFAULT_MAP_KEY_FILE = 'manual-artifacts/oil-thermal/firms-map-key.txt';
const DEFAULT_FACILITIES_PATH = 'manual-artifacts/oil-thermal/facilities.json';
const DEFAULT_FACILITIES_TEMPLATE = 'docs/fixtures/oil-thermal/facilities.example.json';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_FACILITIES_PER_RUN = 50;
const MAX_REQUESTS_PER_RUN = 150;
const MAX_FACILITY_BBOX_SPAN_DEGREES = 1.5;
const VALID_SOURCES = new Set(['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT']);
const BOUNDARY =
  'manual diagnostic only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run diagnose:firms-thermal -- [options]

Options:
  --source <id>        FIRMS product source. Default: ${DEFAULT_SOURCE}
  --sources <a,b,c>    Comma-separated FIRMS sources for facility batch mode.
  --facilities <path>  Manual facility JSON list. Writes facility-level summary.
  --bbox <w,s,e,n>     Bounded area in west,south,east,north format. Default: ${DEFAULT_BBOX}
  --day-range <1..5>   FIRMS day range. Default: ${DEFAULT_DAY_RANGE}
  --date <YYYY-MM-DD>  Optional FIRMS end date.
  --output <path>      JSON artifact path. Default: ${DEFAULT_OUTPUT}
  --map-key-file <p>   Local ignored key file fallback. Default: ${DEFAULT_MAP_KEY_FILE}
  --timeout-ms <ms>    Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --init-facilities    Create/validate the ignored facility list and exit. Default path: ${DEFAULT_FACILITIES_PATH}
  --strict-facilities  Require facility region, assetType and sourceNote metadata.
  --dry-run            Validate arguments and print the redacted request plan without network.
  --no-output          Do not write the manual artifact.
  --quiet              Suppress progress logs; final JSON still prints.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    sources: null,
    facilitiesPath: null,
    bbox: DEFAULT_BBOX,
    dayRange: DEFAULT_DAY_RANGE,
    date: null,
    output: DEFAULT_OUTPUT,
    mapKeyFile: DEFAULT_MAP_KEY_FILE,
    mapKeyFileProvided: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    initFacilities: false,
    strictFacilities: false,
    dryRun: false,
    writeOutput: true,
    progress: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--quiet') {
      options.progress = false;
      continue;
    }
    if (arg === '--init-facilities') {
      options.initFacilities = true;
      continue;
    }
    if (arg === '--strict-facilities') {
      options.strictFacilities = true;
      continue;
    }

    const nextValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    if (arg === '--source') {
      options.source = nextValue();
    } else if (arg === '--sources') {
      options.sources = nextValue();
    } else if (arg === '--facilities') {
      options.facilitiesPath = nextValue();
    } else if (arg === '--bbox') {
      options.bbox = nextValue();
    } else if (arg === '--day-range') {
      options.dayRange = nextValue();
    } else if (arg === '--date') {
      options.date = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--map-key-file') {
      options.mapKeyFile = nextValue();
      options.mapKeyFileProvided = true;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseSourceList(options) {
  const rawSources = options.sources
    ? options.sources.split(',').map((source) => source.trim()).filter(Boolean)
    : [options.source];
  const sources = [...new Set(rawSources)];
  if (sources.length === 0) {
    throw new Error('At least one FIRMS source is required.');
  }
  const invalid = sources.filter((source) => !VALID_SOURCES.has(source));
  if (invalid.length > 0) {
    throw new Error(`Unsupported FIRMS source(s): ${invalid.join(', ')}`);
  }
  return sources;
}

function parseBboxValue(rawBbox, label = '--bbox', options = {}) {
  const bboxValues = Array.isArray(rawBbox)
    ? rawBbox.map((part) => Number(part))
    : String(rawBbox)
        .split(',')
        .map((part) => Number(part.trim()));
  if (bboxValues.length !== 4 || bboxValues.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid ${label}. Expected west,south,east,north numeric coordinates.`);
  }
  const [west, south, east, north] = bboxValues;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error(`Invalid ${label} bounds. Expected -180<=west<east<=180 and -90<=south<north<=90.`);
  }
  if (options.facilityLevel) {
    const width = east - west;
    const height = north - south;
    if (width > MAX_FACILITY_BBOX_SPAN_DEGREES || height > MAX_FACILITY_BBOX_SPAN_DEGREES) {
      throw new Error(
        `Invalid ${label}. Facility bbox must be a small box (max span ${MAX_FACILITY_BBOX_SPAN_DEGREES} degrees); use --bbox mode for region-level smoke tests.`
      );
    }
  }
  return {
    values: bboxValues,
    string: bboxValues.join(',')
  };
}

function validateCommonOptions(options) {
  const sourceList = parseSourceList(options);
  const dayRange = Number(options.dayRange);
  if (!Number.isInteger(dayRange) || dayRange < 1 || dayRange > 5) {
    throw new Error('Invalid --day-range. NASA FIRMS Area API supports 1..5.');
  }
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error('Invalid --date. Expected YYYY-MM-DD.');
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 60000) {
    throw new Error('Invalid --timeout-ms. Expected 1000..60000.');
  }
  return { sourceList, dayRange };
}

function buildUrl(mapKey, request) {
  const base = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(
    mapKey
  )}/${request.source}/${request.bbox}/${request.dayRange}`;
  return request.date ? `${base}/${encodeURIComponent(request.date)}` : base;
}

function redactUrl(url, mapKey) {
  return url.replace(encodeURIComponent(mapKey), '<FIRMS_MAP_KEY>');
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
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('FIRMS response was empty.');
  }
  if (lines[0].startsWith('<')) {
    throw new Error('FIRMS response was not CSV.');
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const requiredHeaders = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp'];
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new Error(`FIRMS CSV missing expected columns: ${missing.join(', ')}`);
  }

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
  if (!record.acq_date || !record.acq_time) {
    return null;
  }
  const time = String(record.acq_time).padStart(4, '0');
  return `${record.acq_date}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`;
}

function summarizeRecords(records) {
  const confidenceCounts = {};
  const dayNightCounts = {};
  let maxFrp = null;
  let latestAcqAt = null;
  let highConfidenceCount = 0;
  let frpOver50Count = 0;
  let frpOver100Count = 0;

  records.forEach((record) => {
    const confidence = record.confidence || 'unknown';
    confidenceCounts[confidence] = (confidenceCounts[confidence] ?? 0) + 1;
    const numericConfidence = Number(confidence);
    if (confidence === 'h' || (Number.isFinite(numericConfidence) && numericConfidence >= 80)) {
      highConfidenceCount += 1;
    }

    const dayNight = record.daynight || 'unknown';
    dayNightCounts[dayNight] = (dayNightCounts[dayNight] ?? 0) + 1;

    const frp = Number(record.frp);
    if (Number.isFinite(frp) && (maxFrp === null || frp > maxFrp)) {
      maxFrp = frp;
    }
    if (Number.isFinite(frp) && frp >= 50) {
      frpOver50Count += 1;
    }
    if (Number.isFinite(frp) && frp >= 100) {
      frpOver100Count += 1;
    }

    const acqAt = toAcqIso(record);
    if (acqAt && (!latestAcqAt || acqAt > latestAcqAt)) {
      latestAcqAt = acqAt;
    }
  });

  return {
    rowCount: records.length,
    latestAcqAt,
    maxFrp,
    confidenceCounts,
    highConfidenceCount,
    frpOver50Count,
    frpOver100Count,
    dayNightCounts
  };
}

function mergeCounts(target, source) {
  Object.entries(source ?? {}).forEach(([key, value]) => {
    target[key] = (target[key] ?? 0) + value;
  });
}

function deriveAnomalyLevel(summary, sourcesWithDetections = summary.rowCount > 0 ? 1 : 0) {
  if (summary.rowCount === 0) {
    return {
      level: 'none_observed',
      labelZh: '未观察到',
      reason: 'No FIRMS detections were returned for the selected facility window.'
    };
  }
  if (sourcesWithDetections >= 2 && (summary.highConfidenceCount >= 2 || (summary.maxFrp ?? 0) >= 50)) {
    return {
      level: 'elevated_watch',
      labelZh: '升高观察',
      reason: 'Multiple sources detected activity and at least one strength filter was elevated.'
    };
  }
  if (summary.highConfidenceCount >= 1 || (summary.maxFrp ?? 0) >= 20 || summary.rowCount >= 5) {
    return {
      level: 'watch',
      labelZh: '观察',
      reason: 'Detections exist, but source agreement or strength is not enough for elevated_watch.'
    };
  }
  return {
    level: 'low_signal',
    labelZh: '低信号',
    reason: 'Sparse or low-strength detections; likely needs more context before interpretation.'
  };
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

  summaries.forEach((summary) => {
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
  });

  return aggregate;
}

function writeJsonArtifact(outputPath, artifact) {
  const absolutePath = resolve(outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`);
  return absolutePath;
}

function logProgress(options, message) {
  if (!options.progress || options.dryRun) {
    return;
  }
  process.stderr.write(`[firms-thermal] ${message}\n`);
}

function resolveMapKey(options) {
  const envKey = String(process.env.FIRMS_MAP_KEY ?? '').trim();
  if (envKey) {
    return {
      mapKey: envKey,
      source: 'env:FIRMS_MAP_KEY',
      checkedMapKeyFile: options.mapKeyFile
    };
  }

  if (options.mapKeyFile) {
    const absolutePath = resolve(options.mapKeyFile);
    if (existsSync(absolutePath)) {
      const fileKey = readFileSync(absolutePath, 'utf8').trim();
      if (fileKey) {
        return {
          mapKey: fileKey,
          source: `file:${options.mapKeyFile}`,
          checkedMapKeyFile: options.mapKeyFile
        };
      }
      throw new Error(`FIRMS map key file is empty: ${options.mapKeyFile}`);
    }
    if (options.mapKeyFileProvided) {
      throw new Error(`FIRMS map key file was not found: ${options.mapKeyFile}`);
    }
  }

  return {
    mapKey: null,
    source: null,
    checkedMapKeyFile: options.mapKeyFile
  };
}

function readFacilityList(facilitiesPath, options = {}) {
  if (!facilitiesPath) {
    return [];
  }
  const absolutePath = resolve(facilitiesPath);
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  const facilities = Array.isArray(parsed) ? parsed : parsed.facilities;
  if (!Array.isArray(facilities) || facilities.length === 0) {
    throw new Error('--facilities must point to a JSON array or an object with a non-empty facilities array.');
  }
  if (facilities.length > MAX_FACILITIES_PER_RUN) {
    throw new Error(`Too many facilities (${facilities.length}). Limit is ${MAX_FACILITIES_PER_RUN} per manual run.`);
  }

  const seenFacilityIds = new Set();
  return facilities.map((facility, index) => {
    const id = String(facility.id ?? '').trim();
    if (!id || !/^[A-Za-z0-9_.:-]+$/.test(id)) {
      throw new Error(`Facility at index ${index} needs an id using letters, numbers, dot, colon, underscore or dash.`);
    }
    if (seenFacilityIds.has(id)) {
      throw new Error(`Duplicate facility id: ${id}`);
    }
    seenFacilityIds.add(id);
    const label = String(facility.label ?? facility.name ?? '').trim();
    if (!label) {
      throw new Error(`Facility ${id} needs a label.`);
    }
    if (!facility.bbox) {
      throw new Error(`Facility ${id} needs a bbox.`);
    }
    const bbox = parseBboxValue(facility.bbox, `facility ${id} bbox`, { facilityLevel: true });
    const region = String(facility.region ?? '').trim();
    const assetType = String(facility.assetType ?? '').trim();
    const sourceNote = String(facility.sourceNote ?? '').trim();

    if (options.strict) {
      const missing = [];
      if (!region) {
        missing.push('region');
      }
      if (!assetType) {
        missing.push('assetType');
      }
      if (!sourceNote) {
        missing.push('sourceNote');
      }
      if (missing.length > 0) {
        throw new Error(`Facility ${id} is missing strict metadata: ${missing.join(', ')}`);
      }
    }

    return {
      id,
      label,
      region: region || null,
      assetType: assetType || null,
      bbox: {
        west: bbox.values[0],
        south: bbox.values[1],
        east: bbox.values[2],
        north: bbox.values[3]
      },
      bboxString: bbox.string,
      sourceNote: sourceNote || null
    };
  });
}

function initializeFacilitiesFile(options, generatedAt) {
  const facilitiesPath = options.facilitiesPath || DEFAULT_FACILITIES_PATH;
  const absoluteFacilitiesPath = resolve(facilitiesPath);
  const absoluteTemplatePath = resolve(DEFAULT_FACILITIES_TEMPLATE);
  const existed = existsSync(absoluteFacilitiesPath);

  if (!existed) {
    mkdirSync(dirname(absoluteFacilitiesPath), { recursive: true });
    const template = readFileSync(absoluteTemplatePath, 'utf8');
    writeFileSync(absoluteFacilitiesPath, template.endsWith('\n') ? template : `${template}\n`);
  }

  const facilities = readFacilityList(facilitiesPath, { strict: options.strictFacilities });
  const normalizedPath = facilitiesPath.replace(/\\/g, '/');
  const isIgnoredManualPath = normalizedPath.startsWith('manual-artifacts/oil-thermal/');

  return {
    schemaVersion: 'firms-facility-list-init-1',
    status: existed ? 'exists' : 'created',
    generatedAt,
    facilitiesPath: absoluteFacilitiesPath,
    templatePath: absoluteTemplatePath,
    strictFacilities: options.strictFacilities,
    isIgnoredManualPath,
    facilityCount: facilities.length,
    facilityIds: facilities.map((facility) => facility.id),
    boundary: BOUNDARY,
    notes: existed
      ? 'Existing facility list was validated and not overwritten.'
      : 'Created from the committed schema example. Replace example coordinates with operator-reviewed public facility coordinates before live diagnosis.'
  };
}

function makeRequest({ source, bbox, dayRange, date }) {
  return {
    source,
    bbox,
    dayRange: String(dayRange),
    date
  };
}

async function runFirmsRequest(mapKey, request, timeoutMs, retryBudget) {
  const url = buildUrl(mapKey, request);
  const response = await fetchFirmsText(url, {
    timeoutMs,
    retryBudget
  });
  let records;
  try {
    records = parseCsv(response.text);
  } catch (error) {
    wrapFirmsResponseError(error, response.diagnostics);
  }
  const summary = summarizeRecords(records);
  return {
    status: 'ok',
    diagnosis: summary.rowCount > 0 ? 'firms-api-ok-detections-returned' : 'firms-api-ok-no-detections-in-bbox',
    source: request.source,
    summary,
    requestDiagnostics: response.diagnostics,
    redactedUrl: redactUrl(url, mapKey)
  };
}

function makeFacilityDryRunPlan(facilities, sourceList, options, dayRange) {
  const dryRunKey = 'DRY_RUN_MAP_KEY';
  return facilities.map((facility) => ({
    id: facility.id,
    label: facility.label,
    region: facility.region,
    assetType: facility.assetType,
    bbox: facility.bbox,
    requestCount: sourceList.length,
    redactedUrls: sourceList.map((source) =>
      redactUrl(
        buildUrl(
          dryRunKey,
          makeRequest({
            source,
            bbox: facility.bboxString,
            dayRange,
            date: options.date
          })
        ),
        dryRunKey
      )
    )
  }));
}

function buildFacilityAggregate(sourceResults) {
  const sourceSummaries = sourceResults.map((result) => result.summary);
  const summary = aggregateSummaries(sourceSummaries);
  const sourcesWithDetections = sourceResults.filter((result) => result.summary.rowCount > 0).length;
  const sourceErrorCount = sourceResults.filter((result) => result.status !== 'ok').length;
  const anomaly = deriveAnomalyLevel(summary, sourcesWithDetections);
  return {
    ...summary,
    sourcesChecked: sourceResults.length,
    sourcesWithDetections,
    sourceErrorCount,
    sourceStatus: sourceErrorCount === 0
      ? 'live'
      : (sourceErrorCount === sourceResults.length ? 'error' : 'partial'),
    sourceAgreement: `${sourcesWithDetections}/${sourceResults.length}`,
    anomalyLevel: anomaly.level,
    anomalyLabelZh: anomaly.labelZh,
    anomalyReason: anomaly.reason,
    heuristicOnly: true
  };
}

async function runFacilityBatch({ mapKey, options, sourceList, dayRange, facilities }) {
  const requestCount = facilities.length * sourceList.length;
  if (requestCount > MAX_REQUESTS_PER_RUN) {
    throw new Error(`Too many FIRMS requests (${requestCount}). Limit is ${MAX_REQUESTS_PER_RUN} per manual run.`);
  }

  const facilityResults = [];
  let completedRequests = 0;
  const retryBudget = createFirmsRetryBudget();
  const allRequestDiagnostics = [];
  logProgress(options, `facility batch start: facilities=${facilities.length}, sources=${sourceList.length}, requests=${requestCount}`);
  for (const [facilityIndex, facility] of facilities.entries()) {
    logProgress(options, `facility ${facilityIndex + 1}/${facilities.length}: ${facility.id} (${facility.label})`);
    const sourceResults = [];
    for (const source of sourceList) {
      const request = makeRequest({
        source,
        bbox: facility.bboxString,
        dayRange,
        date: options.date
      });
      try {
        logProgress(options, `request ${completedRequests + 1}/${requestCount}: ${facility.id} ${source}`);
        const result = await runFirmsRequest(mapKey, request, options.timeoutMs, retryBudget);
        completedRequests += 1;
        allRequestDiagnostics.push(result.requestDiagnostics);
        logProgress(options, `done ${completedRequests}/${requestCount}: ${facility.id} ${source} rows=${result.summary.rowCount}`);
        sourceResults.push(result);
      } catch (error) {
        completedRequests += 1;
        const requestDiagnostics = getFirmsErrorDiagnostics(error, {
          timeoutMs: options.timeoutMs
        });
        allRequestDiagnostics.push(requestDiagnostics);
        logProgress(
          options,
          `failed ${completedRequests}/${requestCount}: ${facility.id} ${source} category=${requestDiagnostics.category}`
        );
        sourceResults.push({
          status: 'error',
          diagnosis: 'firms-request-failed',
          source,
          summary: aggregateSummaries([]),
          requestDiagnostics,
          redactedUrl: redactUrl(buildUrl(mapKey, request), mapKey)
        });
      }
    }

    facilityResults.push({
      id: facility.id,
      label: facility.label,
      region: facility.region,
      assetType: facility.assetType,
      bbox: facility.bbox,
      sourceNote: facility.sourceNote,
      aggregate: buildFacilityAggregate(sourceResults),
      sources: sourceResults
    });
  }

  const batchSummary = aggregateSummaries(facilityResults.map((facility) => facility.aggregate));
  const requestErrorCount = facilityResults.reduce(
    (sum, facility) => sum + facility.aggregate.sourceErrorCount,
    0
  );
  const facilitiesByAnomalyLevel = {};
  facilityResults.forEach((facility) => {
    const level = facility.aggregate.anomalyLevel;
    facilitiesByAnomalyLevel[level] = (facilitiesByAnomalyLevel[level] ?? 0) + 1;
  });

  return {
    facilityResults,
    aggregate: {
      ...batchSummary,
      facilityCount: facilityResults.length,
      requestCount,
      requestErrorCount,
      requestDiagnostics: summarizeFirmsRequestDiagnostics(allRequestDiagnostics, {
        logicalRequestCount: requestCount,
        retryBudget
      }),
      facilitiesWithDetections: facilityResults.filter((facility) => facility.aggregate.rowCount > 0).length,
      facilitiesByAnomalyLevel
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  if (options.initFacilities) {
    const initResult = initializeFacilitiesFile(options, generatedAt);
    console.log(JSON.stringify(initResult, null, 2));
    return;
  }

  const { sourceList, dayRange } = validateCommonOptions(options);
  const facilities = readFacilityList(options.facilitiesPath, { strict: options.strictFacilities });
  const isFacilityBatch = facilities.length > 0;
  if (!isFacilityBatch && options.strictFacilities) {
    throw new Error('--strict-facilities requires --facilities or --init-facilities.');
  }
  if (!isFacilityBatch && sourceList.length !== 1) {
    throw new Error('--sources is only supported with --facilities. Use --source for single bbox mode.');
  }
  if (isFacilityBatch && facilities.length * sourceList.length > MAX_REQUESTS_PER_RUN) {
    throw new Error(
      `Too many FIRMS requests (${facilities.length * sourceList.length}). Limit is ${MAX_REQUESTS_PER_RUN} per manual run.`
    );
  }

  let bboxValues = null;
  if (!isFacilityBatch) {
    const parsedBbox = parseBboxValue(options.bbox);
    bboxValues = parsedBbox.values;
    options.bbox = parsedBbox.string;
  }
  options.dayRange = String(dayRange);
  const keyResolution = resolveMapKey(options);

  if (options.dryRun) {
    const dryRunPayload = isFacilityBatch
      ? {
          status: 'dry_run',
          generatedAt,
          mode: 'facility_batch',
          sources: sourceList,
          strictFacilities: options.strictFacilities,
          facilityCount: facilities.length,
          requestCount: facilities.length * sourceList.length,
          dayRange,
          date: options.date,
          keySource: keyResolution.source,
          checkedMapKeyFile: keyResolution.checkedMapKeyFile,
          facilities: makeFacilityDryRunPlan(facilities, sourceList, options, dayRange),
          boundary: BOUNDARY
        }
      : {
          status: 'dry_run',
          generatedAt,
          mode: 'single_bbox',
          source: sourceList[0],
          sources: sourceList,
          strictFacilities: options.strictFacilities,
          bbox: bboxValues,
          dayRange,
          date: options.date,
          keySource: keyResolution.source,
          checkedMapKeyFile: keyResolution.checkedMapKeyFile,
          redactedUrl: redactUrl(
            buildUrl(
              'DRY_RUN_MAP_KEY',
              makeRequest({
                source: sourceList[0],
                bbox: options.bbox,
                dayRange,
                date: options.date
              })
            ),
            'DRY_RUN_MAP_KEY'
          ),
          boundary: BOUNDARY
        };
    console.log(
      JSON.stringify(dryRunPayload, null, 2)
    );
    return;
  }

  if (!keyResolution.mapKey) {
    throw new Error(
      `FIRMS MAP_KEY is not configured. Set FIRMS_MAP_KEY or create the ignored local key file: ${DEFAULT_MAP_KEY_FILE}`
    );
  }
  logProgress(options, `using MAP_KEY source: ${keyResolution.source}`);

  if (isFacilityBatch) {
    const { facilityResults, aggregate } = await runFacilityBatch({
      mapKey: keyResolution.mapKey,
      options,
      sourceList,
      dayRange,
      facilities
    });
    const batchStatus = aggregate.requestErrorCount === 0
      ? 'ok'
      : (aggregate.requestErrorCount === aggregate.requestCount ? 'source_unavailable' : 'partial');
    const artifact = {
      schemaVersion: 'firms-facility-thermal-diagnosis-1',
      status: batchStatus,
      diagnosis: batchStatus === 'source_unavailable'
        ? 'firms-facility-batch-source-unavailable'
        : aggregate.facilitiesWithDetections > 0
          ? 'firms-facility-batch-detections-returned'
          : batchStatus === 'partial'
            ? 'firms-facility-batch-partial-no-detections'
            : 'firms-facility-batch-no-detections',
      generatedAt,
      mode: 'facility_batch',
      sources: sourceList,
      strictFacilities: options.strictFacilities,
      dayRange,
      date: options.date,
      mapKeySource: keyResolution.source,
      aggregate,
      facilities: facilityResults,
      outputPath: options.writeOutput ? options.output : null,
      boundary: BOUNDARY,
      notes:
        'Facility anomalyLevel is a manual diagnostic heuristic only. It does not confirm an incident, outage, supply interruption, or oil-price direction.'
    };

    let absoluteOutputPath = null;
    if (options.writeOutput) {
      absoluteOutputPath = writeJsonArtifact(options.output, artifact);
    }

    console.log(
      JSON.stringify(
        {
          status: artifact.status,
          diagnosis: artifact.diagnosis,
          mode: artifact.mode,
          sources: artifact.sources,
          strictFacilities: artifact.strictFacilities,
          dayRange: artifact.dayRange,
          mapKeySource: artifact.mapKeySource,
          aggregate: artifact.aggregate,
          outputPath: absoluteOutputPath,
          boundary: artifact.boundary
        },
        null,
        2
      )
    );
    return;
  }

  const request = makeRequest({
    source: sourceList[0],
    bbox: options.bbox,
    dayRange,
    date: options.date
  });
  logProgress(options, `single bbox request start: source=${request.source}, bbox=${request.bbox}, dayRange=${request.dayRange}`);
  const result = await runFirmsRequest(
    keyResolution.mapKey,
    request,
    options.timeoutMs,
    createFirmsRetryBudget()
  );
  logProgress(options, `single bbox request done: source=${request.source}, rows=${result.summary.rowCount}`);
  const summary = result.summary;
  const anomaly = deriveAnomalyLevel(summary);

  const artifact = {
    schemaVersion: 'firms-thermal-diagnosis-1',
    status: 'ok',
    diagnosis: result.diagnosis,
    generatedAt,
    source: request.source,
    bbox: {
      west: bboxValues[0],
      south: bboxValues[1],
      east: bboxValues[2],
      north: bboxValues[3]
    },
    dayRange,
    date: options.date,
    mapKeySource: keyResolution.source,
    summary,
    anomalyLevel: anomaly.level,
    anomalyLabelZh: anomaly.labelZh,
    anomalyReason: anomaly.reason,
    heuristicOnly: true,
    redactedUrl: result.redactedUrl,
    outputPath: options.writeOutput ? options.output : null,
    boundary: BOUNDARY,
    notes:
      summary.rowCount > 0
        ? 'Detections require facility whitelist, FRP/confidence filtering, repeated-observation rules, and historical baseline before any production display.'
        : 'Header-only CSV is a valid FIRMS response for a bounded area with no detections in the selected window.'
  };

  let absoluteOutputPath = null;
  if (options.writeOutput) {
    absoluteOutputPath = writeJsonArtifact(options.output, artifact);
  }

  console.log(
    JSON.stringify(
      {
        status: artifact.status,
        diagnosis: artifact.diagnosis,
        source: artifact.source,
        bbox: artifact.bbox,
        dayRange: artifact.dayRange,
        mapKeySource: artifact.mapKeySource,
        summary: artifact.summary,
        anomalyLevel: artifact.anomalyLevel,
        outputPath: absoluteOutputPath,
        boundary: artifact.boundary
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`FIRMS thermal diagnosis failed: ${error.message}`);
  process.exit(1);
});
