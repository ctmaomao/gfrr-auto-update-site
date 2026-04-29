import { existsSync, statSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev';
const DEFAULT_SAMPLES = 96;
const DEFAULT_INTERVAL_MINUTES = 15;
const CSV_FILE = path.join(
  process.env.TEMP || process.cwd(),
  'gfrr-worker-preview-observation.csv',
);

const CSV_FIELDS = [
  'checkedAt',
  'httpStatus',
  'payloadUpdatedAt',
  'payloadAgeMinutes',
  'workerPreviewFetchedAt',
  'workerPreviewFetchAgeMinutes',
  'workerPreviewSource',
  'workerPreviewStatus',
  'sourceMode',
  'healthScore',
  'cacheOnly',
  'criticalMissing',
  'brent',
  'brentConsensus',
  'canPromoteToPrimary',
];

function parseArgs(argv) {
  const options = {
    base: DEFAULT_BASE_URL,
    samples: DEFAULT_SAMPLES,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  };

  for (const arg of argv) {
    const [name, value] = arg.split('=');
    if (name === '--base' && value) {
      options.base = value;
    } else if (name === '--samples' && value) {
      options.samples = Number(value);
    } else if (name === '--interval-minutes' && value) {
      options.intervalMinutes = Number(value);
    } else {
      throw new Error(`Unknown or invalid argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.samples) || options.samples < 1) {
    throw new Error('--samples must be a positive number');
  }
  if (!Number.isFinite(options.intervalMinutes) || options.intervalMinutes < 0) {
    throw new Error('--interval-minutes must be a non-negative number');
  }

  options.samples = Math.floor(options.samples);
  return options;
}

function buildPreviewUrl(base) {
  const url = new URL('/market.preview.json', base);
  url.searchParams.set('t', String(Date.now()));
  return url;
}

function minutesSince(iso, nowMs) {
  if (typeof iso !== 'string' || iso === '') return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  return Math.max(0, Math.round((nowMs - ts) / 60000));
}

function pickBrent(payload) {
  return payload?.values?.brent ?? payload?.brent ?? '';
}

function pickBrentConsensus(payload) {
  return (
    payload?.brentValidation?.consensus?.recommendedValue ??
    payload?.brentConsensus ??
    ''
  );
}

function pickCriticalMissing(payload) {
  const criticalMissing = payload?.criticalMissing;
  if (Array.isArray(criticalMissing)) return criticalMissing.join('|');
  if (criticalMissing == null) return '';
  return criticalMissing;
}

function pickCanPromoteToPrimary(payload) {
  return (
    payload?.canPromoteToPrimary ??
    payload?.workerPreview?.canPromoteToPrimary ??
    ''
  );
}

function buildRow(checkedAt, httpStatus, payload, error) {
  const nowMs = Date.parse(checkedAt);
  const workerPreview = payload?.workerPreview ?? {};
  const payloadUpdatedAt = payload?.updatedAt ?? '';
  const workerPreviewFetchedAt = workerPreview?.fetchedAt ?? '';

  return {
    checkedAt,
    httpStatus,
    payloadUpdatedAt,
    payloadAgeMinutes: minutesSince(payloadUpdatedAt, nowMs),
    workerPreviewFetchedAt,
    workerPreviewFetchAgeMinutes: minutesSince(workerPreviewFetchedAt, nowMs),
    workerPreviewSource: workerPreview?.source ?? '',
    workerPreviewStatus: workerPreview?.previewFetchStatus ?? error ?? '',
    sourceMode: payload?.sourceMode ?? '',
    healthScore: payload?.healthScore ?? '',
    cacheOnly: payload?.cacheOnly ?? '',
    criticalMissing: pickCriticalMissing(payload),
    brent: pickBrent(payload),
    brentConsensus: pickBrentConsensus(payload),
    canPromoteToPrimary: pickCanPromoteToPrimary(payload),
  };
}

function csvEscape(value) {
  if (value == null) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function rowToCsv(row) {
  return CSV_FIELDS.map((field) => csvEscape(row[field])).join(',');
}

async function ensureCsvHeader() {
  if (!existsSync(CSV_FILE) || statSync(CSV_FILE).size === 0) {
    await writeFile(CSV_FILE, `${CSV_FIELDS.join(',')}\n`, 'utf8');
  }
}

async function appendRow(row) {
  await appendFile(CSV_FILE, `${rowToCsv(row)}\n`, 'utf8');
}

function formatAge(value) {
  return value === '' ? 'n/a' : `${value}m`;
}

function logSummary(index, total, row) {
  console.log(
    `[${index}/${total}] preview=${row.httpStatus} ` +
      `workerFetchAge=${formatAge(row.workerPreviewFetchAgeMinutes)} ` +
      `payloadAge=${formatAge(row.payloadAgeMinutes)} ` +
      `sourceMode=${row.sourceMode || 'n/a'} ` +
      `healthScore=${row.healthScore || 'n/a'} ` +
      `brent=${row.brent || 'n/a'} ` +
      `consensus=${row.brentConsensus || 'n/a'}`,
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function samplePreview(base) {
  const checkedAt = new Date().toISOString();
  const previewUrl = buildPreviewUrl(base);

  try {
    const response = await fetch(previewUrl, { cache: 'no-store' });
    let payload = null;
    let error = '';

    try {
      payload = await response.json();
    } catch (err) {
      error = err instanceof Error ? `json-error: ${err.message}` : 'json-error';
    }

    return buildRow(checkedAt, response.status, payload, error);
  } catch (err) {
    const error = err instanceof Error ? `fetch-error: ${err.message}` : 'fetch-error';
    return buildRow(checkedAt, 0, null, error);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const intervalMs = options.intervalMinutes * 60 * 1000;

  await ensureCsvHeader();
  console.log(`Writing observation CSV to: ${CSV_FILE}`);
  console.log(
    'Health note: prefer workerPreview.fetchedAt; heartbeat is no longer a per-run success signal.',
  );

  for (let i = 1; i <= options.samples; i += 1) {
    const row = await samplePreview(options.base);
    await appendRow(row);
    logSummary(i, options.samples, row);

    if (i < options.samples && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
