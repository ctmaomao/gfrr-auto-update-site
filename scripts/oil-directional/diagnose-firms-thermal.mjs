#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const DEFAULT_SOURCE = 'VIIRS_SNPP_NRT';
const DEFAULT_BBOX = '47,23,58,31';
const DEFAULT_DAY_RANGE = '1';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json';
const DEFAULT_TIMEOUT_MS = 15000;
const VALID_SOURCES = new Set(['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT']);
const BOUNDARY =
  'manual diagnostic only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run diagnose:firms-thermal -- [options]

Options:
  --source <id>        FIRMS product source. Default: ${DEFAULT_SOURCE}
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

function validateOptions(options) {
  if (!VALID_SOURCES.has(options.source)) {
    throw new Error(`Unsupported FIRMS source: ${options.source}`);
  }

  const bboxValues = options.bbox.split(',').map((part) => Number(part.trim()));
  if (bboxValues.length !== 4 || bboxValues.some((value) => !Number.isFinite(value))) {
    throw new Error('Invalid --bbox. Expected west,south,east,north numeric coordinates.');
  }
  const [west, south, east, north] = bboxValues;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error('Invalid --bbox bounds. Expected -180<=west<east<=180 and -90<=south<north<=90.');
  }

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

  return { bboxValues, dayRange };
}

function buildUrl(mapKey, options) {
  const base = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(
    mapKey
  )}/${options.source}/${options.bbox}/${options.dayRange}`;
  return options.date ? `${base}/${encodeURIComponent(options.date)}` : base;
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
  let maxFrp = null;
  let latestAcqAt = null;

  records.forEach((record) => {
    const confidence = record.confidence || 'unknown';
    confidenceCounts[confidence] = (confidenceCounts[confidence] ?? 0) + 1;

    const frp = Number(record.frp);
    if (Number.isFinite(frp) && (maxFrp === null || frp > maxFrp)) {
      maxFrp = frp;
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
    confidenceCounts
  };
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { bboxValues, dayRange } = validateOptions(options);
  options.bbox = bboxValues.join(',');
  options.dayRange = String(dayRange);
  const generatedAt = new Date().toISOString();
  const mapKey = process.env.FIRMS_MAP_KEY;
  const url = buildUrl(mapKey || 'DRY_RUN_MAP_KEY', options);
  const redactedUrl = redactUrl(url, mapKey || 'DRY_RUN_MAP_KEY');

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          status: 'dry_run',
          generatedAt,
          source: options.source,
          bbox: bboxValues,
          dayRange,
          date: options.date,
          redactedUrl,
          boundary: BOUNDARY
        },
        null,
        2
      )
    );
    return;
  }

  if (!mapKey) {
    throw new Error('FIRMS_MAP_KEY is not set. Set it as an environment variable before running this diagnostic.');
  }

  const responseText = await fetchWithTimeout(url, options.timeoutMs);
  const records = parseCsv(responseText);
  const summary = summarizeRecords(records);
  const diagnosis =
    summary.rowCount > 0 ? 'firms-api-ok-detections-returned' : 'firms-api-ok-no-detections-in-bbox';

  const artifact = {
    schemaVersion: 'firms-thermal-diagnosis-1',
    status: 'ok',
    diagnosis,
    generatedAt,
    source: options.source,
    bbox: {
      west: bboxValues[0],
      south: bboxValues[1],
      east: bboxValues[2],
      north: bboxValues[3]
    },
    dayRange,
    date: options.date,
    summary,
    redactedUrl,
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
