import { existsSync, statSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev';
const DEFAULT_PATH = '/market.preview.json';
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
  'unavailable',
  'fredAllFailed',
  'fredFailureStatuses',
  'yahooStatus',
  'stooqStatus',
  'goldStatus',
  'googleFinanceStatus',
  'tradingEconomicsStatus',
  'secondaryDxyOkCount',
  'secondaryVixOkCount',
  'secondaryHyOasOkCount',
  'secondaryGoldOkCount',
  'secondaryUs10yOkCount',
  'secondaryWarnings',
  'brent',
  'brentConsensus',
  'canPromoteToPrimary',
];

function parseArgs(argv) {
  const options = {
    base: DEFAULT_BASE_URL,
    path: DEFAULT_PATH,
    samples: DEFAULT_SAMPLES,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  };

  for (const arg of argv) {
    const [name, value] = arg.split('=');
    if (name === '--base' && value) {
      options.base = value;
    } else if (name === '--path' && value) {
      options.path = value.startsWith('/') ? value : `/${value}`;
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

function buildPreviewUrl(base, previewPath) {
  const url = new URL(previewPath, base);
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
    payload?.workerGeneratedPreview?.canPromoteToPrimary ??
    payload?.brentValidation?.consensus?.canPromoteToPrimary ??
    ''
  );
}

function detectPreviewMeta(payload, error) {
  if (payload?.workerGeneratedPreview) {
    return {
      mode: 'worker-generated-preview',
      timestamp: payload.workerGeneratedPreview.generatedAt ?? '',
      source: payload.workerGeneratedPreview.source ?? '',
      status: payload.workerGeneratedPreview.previewFetchStatus ?? 'ok',
    };
  }

  if (payload?.workerPreview) {
    return {
      mode: 'github-mirror-preview',
      timestamp: payload.workerPreview.fetchedAt ?? '',
      source: payload.workerPreview.source ?? '',
      status: payload.workerPreview.previewFetchStatus ?? error ?? '',
    };
  }

  return {
    mode: 'unknown',
    timestamp: '',
    source: '',
    status: error ?? '',
  };
}

function sourceStatus(summary, name) {
  const status = summary?.[name]?.status;
  return status == null ? '' : status;
}

function sourceSummaryText(row) {
  const parts = [
    row.yahooStatus ? `yahoo=${row.yahooStatus}` : '',
    row.stooqStatus ? `stooq=${row.stooqStatus}` : '',
    row.goldStatus ? `gold=${row.goldStatus}` : '',
    row.googleFinanceStatus ? `googleFinance=${row.googleFinanceStatus}` : '',
    row.tradingEconomicsStatus ? `tradingEconomics=${row.tradingEconomicsStatus}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function secondaryMetricSummary(summary, metric, secondaryDiagnostics) {
  if (secondaryDiagnostics?.enabled === false) {
    return { okCount: '', failCount: '', text: `${metric}=disabled` };
  }
  const item = summary?.[metric];
  if (!item || typeof item !== 'object') {
    return { okCount: '', failCount: '', text: `${metric}=n/a` };
  }
  const okCount = Number.isFinite(item.okCount) ? item.okCount : 0;
  const failCount = Number.isFinite(item.failCount) ? item.failCount : 0;
  return {
    okCount,
    failCount,
    text: `${metric}=${okCount}/${okCount + failCount}`,
  };
}

function secondaryWarnings(summary, secondaryDiagnostics) {
  if (secondaryDiagnostics?.enabled === false) return 'disabled';
  if (!summary || typeof summary !== 'object') return '';
  return ['dxy', 'vix', 'hyOas', 'gold', 'us10y']
    .filter((metric) => {
      const item = summary[metric];
      if (!item || typeof item !== 'object') return true;
      return Number(item.failCount) > 0 || Number(item.okCount) === 0;
    })
    .join('|');
}

function secondarySummaryText(row) {
  const parts = [
    row.secondaryDxyText,
    row.secondaryVixText,
    row.secondaryHyOasText,
    row.secondaryGoldText,
    row.secondaryUs10yText,
  ].filter(Boolean);
  return parts.length > 0 ? ` secondary: ${parts.join(' ')}` : '';
}

function buildRow(checkedAt, httpStatus, payload, error) {
  const nowMs = Date.parse(checkedAt);
  const previewMeta = detectPreviewMeta(payload, error);
  const payloadUpdatedAt = payload?.updatedAt ?? '';
  const diagnostics = payload?.workerGeneratedPreview?.diagnostics ?? {};
  const sourceHttpSummary = diagnostics?.sourceHttpSummary ?? {};
  const secondaryDiagnostics = diagnostics?.secondaryDiagnostics ?? {};
  const secondarySummary = diagnostics?.secondarySourceSummary ?? {};
  const secondaryDxy = secondaryMetricSummary(secondarySummary, 'dxy', secondaryDiagnostics);
  const secondaryVix = secondaryMetricSummary(secondarySummary, 'vix', secondaryDiagnostics);
  const secondaryHyOas = secondaryMetricSummary(secondarySummary, 'hyOas', secondaryDiagnostics);
  const secondaryGold = secondaryMetricSummary(secondarySummary, 'gold', secondaryDiagnostics);
  const secondaryUs10y = secondaryMetricSummary(secondarySummary, 'us10y', secondaryDiagnostics);

  return {
    checkedAt,
    httpStatus,
    payloadUpdatedAt,
    payloadAgeMinutes: minutesSince(payloadUpdatedAt, nowMs),
    workerPreviewFetchedAt: previewMeta.timestamp,
    workerPreviewFetchAgeMinutes: minutesSince(previewMeta.timestamp, nowMs),
    workerPreviewSource: previewMeta.source,
    workerPreviewStatus: previewMeta.status,
    previewMode: previewMeta.mode,
    sourceMode: payload?.sourceMode ?? '',
    healthScore: payload?.healthScore ?? '',
    cacheOnly: payload?.cacheOnly ?? '',
    criticalMissing: pickCriticalMissing(payload),
    unavailable: payload?.unavailable ?? '',
    fredAllFailed: diagnostics?.fredAllFailed ?? '',
    fredFailureStatuses: Array.isArray(diagnostics?.fredFailureStatuses)
      ? diagnostics.fredFailureStatuses.join('|')
      : '',
    yahooStatus: sourceStatus(sourceHttpSummary, 'yahoo'),
    stooqStatus: sourceStatus(sourceHttpSummary, 'stooq'),
    goldStatus: sourceStatus(sourceHttpSummary, 'gold'),
    googleFinanceStatus: sourceStatus(sourceHttpSummary, 'googleFinance'),
    tradingEconomicsStatus: sourceStatus(sourceHttpSummary, 'tradingEconomics'),
    secondaryDxyOkCount: secondaryDxy.okCount,
    secondaryVixOkCount: secondaryVix.okCount,
    secondaryHyOasOkCount: secondaryHyOas.okCount,
    secondaryGoldOkCount: secondaryGold.okCount,
    secondaryUs10yOkCount: secondaryUs10y.okCount,
    secondaryWarnings: secondaryWarnings(secondarySummary, secondaryDiagnostics),
    secondaryDxyText: secondaryDxy.text,
    secondaryVixText: secondaryVix.text,
    secondaryHyOasText: secondaryHyOas.text,
    secondaryGoldText: secondaryGold.text,
    secondaryUs10yText: secondaryUs10y.text,
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

function formatValue(value) {
  return value === '' || value == null ? 'n/a' : value;
}

function logSummary(index, total, row) {
  console.log(
    `[${index}/${total}] preview=${row.httpStatus} ` +
      `workerFetchAge=${formatAge(row.workerPreviewFetchAgeMinutes)} ` +
      `payloadAge=${formatAge(row.payloadAgeMinutes)} ` +
      `mode=${formatValue(row.previewMode)} ` +
      `sourceMode=${formatValue(row.sourceMode)} ` +
      `healthScore=${formatValue(row.healthScore)} ` +
      `criticalMissing=${formatValue(row.criticalMissing)} ` +
      `unavailable=${row.unavailable === '' ? 'n/a' : row.unavailable} ` +
      `fredAllFailed=${row.fredAllFailed === '' ? 'n/a' : row.fredAllFailed} ` +
      `fredStatuses=${formatValue(row.fredFailureStatuses)}` +
      sourceSummaryText(row) +
      secondarySummaryText(row) +
      ' ' +
      `brent=${formatValue(row.brent)} ` +
      `consensus=${formatValue(row.brentConsensus)}`,
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function samplePreview(base, previewPath) {
  const checkedAt = new Date().toISOString();
  const previewUrl = buildPreviewUrl(base, previewPath);

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
    'Health note: prefer workerPreview.fetchedAt or workerGeneratedPreview.generatedAt; heartbeat is no longer a per-run success signal.',
  );

  for (let i = 1; i <= options.samples; i += 1) {
    const row = await samplePreview(options.base, options.path);
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
