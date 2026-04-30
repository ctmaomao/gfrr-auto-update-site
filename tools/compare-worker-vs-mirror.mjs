import { existsSync, readFileSync, statSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev';
const DEFAULT_SAMPLES = 1;
const DEFAULT_INTERVAL_MINUTES = 15;
const MIRROR_PATH = '/market.preview.json';
const WORKER_PATH = '/market.worker-preview.json';
const OUTPUT_BASENAME = 'gfrr-worker-vs-mirror-comparison';
const OUTPUT_DIR = process.env.TEMP || process.cwd();

const COMPARE_FIELDS = [
  'brent',
  'dxy',
  'hyOas',
  'vix',
  'spx',
  'us10y',
  'us2y',
  'real10y',
  'breakeven10y',
  'gold',
];

const CRITICAL_FIELDS = ['brent', 'dxy', 'hyOas', 'vix', 'us10y', 'real10y'];

const THRESHOLDS = {
  brent: { type: 'pct', ok: 2, warn: 5 },
  dxy: { type: 'pct', ok: 1, warn: 2 },
  hyOas: { type: 'pct', ok: 10, warn: 20 },
  vix: { type: 'pct', ok: 10, warn: 20 },
  spx: { type: 'pct', ok: 2, warn: 5 },
  us10y: { type: 'abs', ok: 0.1, warn: 0.25 },
  us2y: { type: 'abs', ok: 0.1, warn: 0.25 },
  real10y: { type: 'abs', ok: 0.1, warn: 0.25 },
  breakeven10y: { type: 'abs', ok: 0.1, warn: 0.25 },
  gold: { type: 'pct', ok: 2, warn: 5 },
};

const BASE_CSV_FIELDS = [
  'checkedAt',
  'mirrorHttpStatus',
  'workerHttpStatus',
  'mirrorUpdatedAt',
  'workerUpdatedAt',
  'mirrorAgeMinutes',
  'workerAgeMinutes',
  'mirrorSourceMode',
  'workerSourceMode',
  'mirrorHealthScore',
  'workerHealthScore',
  'workerCriticalMissing',
  'workerUnavailable',
  'workerFredAllFailed',
  'workerDiagnosticsSummary',
  'totalWarnCount',
  'totalFailCount',
  'warnFields',
  'failFields',
  'overallStatus',
];

const FIELD_CSV_FIELDS = COMPARE_FIELDS.flatMap((field) => [
  `${field}MirrorValue`,
  `${field}WorkerValue`,
  `${field}AbsDiff`,
  `${field}PctDiff`,
  `${field}Status`,
]);

const CSV_FIELDS = [...BASE_CSV_FIELDS, ...FIELD_CSV_FIELDS];

function parseArgs(argv) {
  const options = {
    base: DEFAULT_BASE_URL,
    samples: DEFAULT_SAMPLES,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    format: 'csv',
  };

  for (const arg of argv) {
    const [name, value] = arg.split('=');
    if (name === '--base' && value) {
      options.base = value;
    } else if (name === '--samples' && value) {
      options.samples = Number(value);
    } else if (name === '--interval-minutes' && value) {
      options.intervalMinutes = Number(value);
    } else if (name === '--format' && value) {
      options.format = value;
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
  if (!['csv', 'json'].includes(options.format)) {
    throw new Error('--format must be csv or json');
  }

  options.samples = Math.floor(options.samples);
  return options;
}

function outputPath(format) {
  return path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.${format}`);
}

function buildUrl(base, endpointPath) {
  const url = new URL(endpointPath, base);
  url.searchParams.set('t', String(Date.now()));
  return url;
}

async function fetchJsonEndpoint(base, endpointPath) {
  const url = buildUrl(base, endpointPath);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    let payload = null;
    let error = null;

    try {
      payload = await response.json();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    return {
      httpStatus: response.status,
      ok: response.ok && payload != null,
      payload,
      error,
    };
  } catch (err) {
    return {
      httpStatus: 0,
      ok: false,
      payload: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function numericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[$,\s]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function minutesSince(iso, nowMs) {
  if (typeof iso !== 'string' || iso === '') return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  return Math.max(0, Math.round((nowMs - ts) / 60000));
}

function round(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) return '';
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function compareField(field, mirrorPayload, workerPayload) {
  const mirrorValue = numericValue(mirrorPayload?.values?.[field]);
  const workerValue = numericValue(workerPayload?.values?.[field]);

  if (mirrorValue == null && workerValue == null) {
    return { field, mirrorValue: '', workerValue: '', absDiff: '', pctDiff: '', status: 'both-missing' };
  }
  if (mirrorValue == null) {
    return { field, mirrorValue: '', workerValue, absDiff: '', pctDiff: '', status: 'mirror-missing' };
  }
  if (workerValue == null) {
    return { field, mirrorValue, workerValue: '', absDiff: '', pctDiff: '', status: 'worker-missing' };
  }

  const absDiff = Math.abs(workerValue - mirrorValue);
  const pctDiff = mirrorValue === 0 ? null : (absDiff / Math.abs(mirrorValue)) * 100;

  if (absDiff === 0) {
    return { field, mirrorValue, workerValue, absDiff: 0, pctDiff: 0, status: 'exact' };
  }

  const threshold = THRESHOLDS[field];
  const metric = threshold.type === 'abs' ? absDiff : pctDiff;
  let status = 'fail';
  if (metric != null && metric <= threshold.ok) status = 'ok';
  else if (metric != null && metric <= threshold.warn) status = 'warn';

  return {
    field,
    mirrorValue,
    workerValue,
    absDiff: round(absDiff),
    pctDiff: pctDiff == null ? '' : round(pctDiff),
    status,
  };
}

function diagnosticsSummary(workerPayload) {
  const diagnostics = workerPayload?.workerGeneratedPreview?.diagnostics;
  if (!diagnostics) return '';
  const summary = diagnostics.sourceHttpSummary ?? {};
  const fredStatuses = Array.isArray(diagnostics.fredFailureStatuses)
    ? diagnostics.fredFailureStatuses.join('|')
    : '';
  const sourceStatus = (name) => {
    const status = summary?.[name]?.status;
    return status == null ? 'n/a' : status;
  };

  return [
    `fredAllFailed=${diagnostics.fredAllFailed ?? 'n/a'}`,
    `fredStatuses=${fredStatuses || 'n/a'}`,
    `yahoo=${sourceStatus('yahoo')}`,
    `stooq=${sourceStatus('stooq')}`,
    `gold=${sourceStatus('gold')}`,
    `googleFinance=${sourceStatus('googleFinance')}`,
    `tradingEconomics=${sourceStatus('tradingEconomics')}`,
  ].join(' ');
}

function overallStatus(comparisons, mirrorResult, workerResult, workerPayload) {
  if (mirrorResult.httpStatus !== 200 || workerResult.httpStatus !== 200) return 'fail';

  const failFields = comparisons.filter((item) => item.status === 'fail').map((item) => item.field);
  const warnFields = comparisons.filter((item) => item.status === 'warn').map((item) => item.field);
  if (failFields.some((field) => CRITICAL_FIELDS.includes(field))) return 'fail';
  if (workerPayload?.degradedMode === true || workerPayload?.unavailable === true) return 'warn';
  if (failFields.length > 0) return 'fail';
  if (warnFields.length > 2) return 'warn';
  return 'pass';
}

function buildRow(checkedAt, mirrorResult, workerResult) {
  const nowMs = Date.parse(checkedAt);
  const mirrorPayload = mirrorResult.payload;
  const workerPayload = workerResult.payload;
  const comparisons = COMPARE_FIELDS.map((field) => compareField(field, mirrorPayload, workerPayload));
  const warnFields = comparisons.filter((item) => item.status === 'warn').map((item) => item.field);
  const failFields = comparisons.filter((item) => item.status === 'fail').map((item) => item.field);
  const row = {
    checkedAt,
    mirrorHttpStatus: mirrorResult.httpStatus,
    workerHttpStatus: workerResult.httpStatus,
    mirrorUpdatedAt: mirrorPayload?.updatedAt ?? '',
    workerUpdatedAt: workerPayload?.updatedAt ?? '',
    mirrorAgeMinutes: minutesSince(mirrorPayload?.updatedAt, nowMs),
    workerAgeMinutes: minutesSince(workerPayload?.updatedAt, nowMs),
    mirrorSourceMode: mirrorPayload?.sourceMode ?? '',
    workerSourceMode: workerPayload?.sourceMode ?? '',
    mirrorHealthScore: mirrorPayload?.healthScore ?? '',
    workerHealthScore: workerPayload?.healthScore ?? '',
    workerCriticalMissing: workerPayload?.criticalMissing ?? '',
    workerUnavailable: workerPayload?.unavailable ?? '',
    workerFredAllFailed: workerPayload?.workerGeneratedPreview?.diagnostics?.fredAllFailed ?? '',
    workerDiagnosticsSummary: diagnosticsSummary(workerPayload),
    totalWarnCount: warnFields.length,
    totalFailCount: failFields.length,
    warnFields: warnFields.join('|') || 'none',
    failFields: failFields.join('|') || 'none',
    overallStatus: '',
  };

  row.overallStatus = overallStatus(comparisons, mirrorResult, workerResult, workerPayload);

  for (const item of comparisons) {
    row[`${item.field}MirrorValue`] = item.mirrorValue;
    row[`${item.field}WorkerValue`] = item.workerValue;
    row[`${item.field}AbsDiff`] = item.absDiff;
    row[`${item.field}PctDiff`] = item.pctDiff;
    row[`${item.field}Status`] = item.status;
  }

  return row;
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

async function ensureCsvHeader(filePath) {
  const header = CSV_FIELDS.join(',');
  if (!existsSync(filePath) || statSync(filePath).size === 0) {
    await writeFile(filePath, `${header}\n`, 'utf8');
    return;
  }

  const firstLine = readFileSync(filePath, 'utf8').split(/\r?\n/, 1)[0];
  if (firstLine !== header) {
    throw new Error(`Existing CSV header does not match expected structure: ${filePath}`);
  }
}

function formatAge(value) {
  return value === '' ? 'n/a' : `${value}m`;
}

function formatValue(value) {
  return value === '' || value == null ? 'n/a' : value;
}

function logRow(index, total, row) {
  console.log(
    `[${index}/${total}] overall=${row.overallStatus} ` +
      `mirrorAge=${formatAge(row.mirrorAgeMinutes)} ` +
      `workerAge=${formatAge(row.workerAgeMinutes)} ` +
      `brent mirror=${formatValue(row.brentMirrorValue)} ` +
      `worker=${formatValue(row.brentWorkerValue)} ` +
      `diff=${formatValue(row.brentPctDiff)}% ` +
      `workerHealth=${formatValue(row.workerHealthScore)} ` +
      `missing=${formatValue(row.workerCriticalMissing)}`,
  );
  console.log(`warnFields: ${row.warnFields}`);
  console.log(`failFields: ${row.failFields}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sample(base) {
  const checkedAt = new Date().toISOString();
  const [mirrorResult, workerResult] = await Promise.all([
    fetchJsonEndpoint(base, MIRROR_PATH),
    fetchJsonEndpoint(base, WORKER_PATH),
  ]);
  return buildRow(checkedAt, mirrorResult, workerResult);
}

async function writeCsvRows(filePath, rows) {
  await ensureCsvHeader(filePath);
  await appendFile(filePath, rows.map(rowToCsv).join('\n') + '\n', 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = [];
  const intervalMs = options.intervalMinutes * 60 * 1000;
  const filePath = outputPath(options.format);

  console.log(`Comparing ${WORKER_PATH} against ${MIRROR_PATH}`);
  console.log(`Writing comparison ${options.format.toUpperCase()} to: ${filePath}`);

  for (let i = 1; i <= options.samples; i += 1) {
    const row = await sample(options.base);
    rows.push(row);
    logRow(i, options.samples, row);

    if (i < options.samples && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }

  if (options.format === 'json') {
    await writeFile(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  } else {
    await writeCsvRows(filePath, rows);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
