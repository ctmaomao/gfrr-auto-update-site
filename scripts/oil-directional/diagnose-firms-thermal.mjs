#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const DEFAULT_SOURCE = 'VIIRS_SNPP_NRT';
const DEFAULT_BBOX = '47,23,58,31';
const DEFAULT_DAY_RANGE = '1';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json';
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
  --timeout-ms <ms>    Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --dry-run            Validate arguments and print the redacted request plan without network.
  --no-output          Do not write the manual artifact.
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false,
    writeOutput: true
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

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`FIRMS HTTP ${response.status}: ${text.slice(0, 160)}`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function writeJsonArtifact(outputPath, artifact) {
  const absolutePath = resolve(outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`);
  return absolutePath;
}

function readFacilityList(facilitiesPath) {
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

  return facilities.map((facility, index) => {
    const id = String(facility.id ?? '').trim();
    if (!id || !/^[A-Za-z0-9_.:-]+$/.test(id)) {
      throw new Error(`Facility at index ${index} needs an id using letters, numbers, dot, colon, underscore or dash.`);
    }
    const label = String(facility.label ?? facility.name ?? '').trim();
    if (!label) {
      throw new Error(`Facility ${id} needs a label.`);
    }
    if (!facility.bbox) {
      throw new Error(`Facility ${id} needs a bbox.`);
    }
    const bbox = parseBboxValue(facility.bbox, `facility ${id} bbox`, { facilityLevel: true });

    return {
      id,
      label,
      region: facility.region ? String(facility.region) : null,
      assetType: facility.assetType ? String(facility.assetType) : null,
      bbox: {
        west: bbox.values[0],
        south: bbox.values[1],
        east: bbox.values[2],
        north: bbox.values[3]
      },
      bboxString: bbox.string,
      sourceNote: facility.sourceNote ? String(facility.sourceNote) : null
    };
  });
}

function makeRequest({ source, bbox, dayRange, date }) {
  return {
    source,
    bbox,
    dayRange: String(dayRange),
    date
  };
}

async function runFirmsRequest(mapKey, request, timeoutMs) {
  const url = buildUrl(mapKey, request);
  const responseText = await fetchWithTimeout(url, timeoutMs);
  const records = parseCsv(responseText);
  const summary = summarizeRecords(records);
  return {
    status: 'ok',
    diagnosis: summary.rowCount > 0 ? 'firms-api-ok-detections-returned' : 'firms-api-ok-no-detections-in-bbox',
    source: request.source,
    summary,
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
  const anomaly = deriveAnomalyLevel(summary, sourcesWithDetections);
  return {
    ...summary,
    sourcesChecked: sourceResults.length,
    sourcesWithDetections,
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
  for (const facility of facilities) {
    const sourceResults = [];
    for (const source of sourceList) {
      const request = makeRequest({
        source,
        bbox: facility.bboxString,
        dayRange,
        date: options.date
      });
      try {
        sourceResults.push(await runFirmsRequest(mapKey, request, options.timeoutMs));
      } catch (error) {
        throw new Error(`FIRMS request failed for facility ${facility.id} source ${source}: ${error.message}`);
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
      facilitiesWithDetections: facilityResults.filter((facility) => facility.aggregate.rowCount > 0).length,
      facilitiesByAnomalyLevel
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { sourceList, dayRange } = validateCommonOptions(options);
  const generatedAt = new Date().toISOString();
  const facilities = readFacilityList(options.facilitiesPath);
  const isFacilityBatch = facilities.length > 0;
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

  const mapKey = process.env.FIRMS_MAP_KEY;

  if (options.dryRun) {
    const dryRunPayload = isFacilityBatch
      ? {
          status: 'dry_run',
          generatedAt,
          mode: 'facility_batch',
          sources: sourceList,
          facilityCount: facilities.length,
          requestCount: facilities.length * sourceList.length,
          dayRange,
          date: options.date,
          facilities: makeFacilityDryRunPlan(facilities, sourceList, options, dayRange),
          boundary: BOUNDARY
        }
      : {
          status: 'dry_run',
          generatedAt,
          mode: 'single_bbox',
          source: sourceList[0],
          sources: sourceList,
          bbox: bboxValues,
          dayRange,
          date: options.date,
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

  if (!mapKey) {
    throw new Error('FIRMS_MAP_KEY is not set. Set it as an environment variable before running this diagnostic.');
  }

  if (isFacilityBatch) {
    const { facilityResults, aggregate } = await runFacilityBatch({
      mapKey,
      options,
      sourceList,
      dayRange,
      facilities
    });
    const artifact = {
      schemaVersion: 'firms-facility-thermal-diagnosis-1',
      status: 'ok',
      diagnosis:
        aggregate.facilitiesWithDetections > 0
          ? 'firms-facility-batch-detections-returned'
          : 'firms-facility-batch-no-detections',
      generatedAt,
      mode: 'facility_batch',
      sources: sourceList,
      dayRange,
      date: options.date,
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
          dayRange: artifact.dayRange,
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
  const result = await runFirmsRequest(mapKey, request, options.timeoutMs);
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
