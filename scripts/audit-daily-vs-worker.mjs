import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { finiteAuditNumber, brentObservationAudit, brentComparability, inputIdentity } from './audit/brent-observation.mjs';

const WORKER_PREVIEW_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.worker-preview.json';
const REALTIME_INPUT_PATH = 'realtime/market.json';
const WORKER_FETCH_TIMEOUT_MS = 4500;
const COMPARED_FIELDS = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y', 'gold', 'spx'];

const MATERIAL_THRESHOLDS = {
  brent: { pctDiff: 0.5 },
  gold: { pctDiff: 0.5 },
  spx: { pctDiff: 0.5 },
  dxy: { absDiff: 0.25 },
  vix: { absDiff: 1 },
  hyOas: { absDiff: 0.05 },
  us10y: { absDiff: 0.05 },
  real10y: { absDiff: 0.05 },
};

function hasArg(name) {
  return process.argv.includes(name);
}

const finiteNumber = finiteAuditNumber;

function readJsonFile(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function pickValues(payload) {
  const values = payload?.values || {};
  return Object.fromEntries(COMPARED_FIELDS.map((field) => [field, finiteNumber(values[field])]));
}

export function summarizePayload(payload, checkedAt, commit = null) {
  return {
    updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : null,
    sourceMode: payload?.sourceMode ?? null,
    healthScore: finiteNumber(payload?.healthScore),
    criticalMissing: finiteNumber(payload?.criticalMissing),
    values: pickValues(payload),
    inputIdentity: inputIdentity(payload, commit),
    brentObservation: brentObservationAudit(payload, checkedAt),
  };
}

async function fetchWorkerPreview() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${WORKER_PREVIEW_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent':
          'Mozilla/5.0 (compatible; GFRRDailyWorkerAudit/28.0F-1; +https://ctmaomao.github.io/gfrr-auto-update-site/)',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        available: false,
        payload: null,
        error: `HTTP ${response.status}`,
      };
    }
    return {
      available: true,
      payload: JSON.parse(text),
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error && err.name === 'AbortError'
      ? `timeout after ${WORKER_FETCH_TIMEOUT_MS}ms`
      : 'worker-fetch-or-json-failed'; // Do not retain arbitrary response/error text.
    return {
      available: false,
      payload: null,
      error,
    };
  } finally {
    clearTimeout(timer);
  }
}

function minutesBetween(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return null;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round((right - left) / 60000);
}

export function compareField(field, dailyValue, workerValue) {
  const daily = finiteNumber(dailyValue);
  const worker = finiteNumber(workerValue);
  const absDiff = daily == null || worker == null ? null : Math.abs(worker - daily);
  const pctDiff = daily == null || worker == null || daily === 0
    ? null
    : Math.abs((worker - daily) / daily) * 100;
  const threshold = MATERIAL_THRESHOLDS[field] || {};
  const material = (
    (threshold.pctDiff != null && pctDiff != null && pctDiff >= threshold.pctDiff) ||
    (threshold.absDiff != null && absDiff != null && absDiff >= threshold.absDiff)
  );

  return {
    daily,
    worker,
    absDiff: absDiff == null ? null : Number(absDiff.toFixed(4)),
    pctDiff: pctDiff == null ? null : Number(pctDiff.toFixed(4)),
    material,
  };
}

export function buildDrift(dailyInput, worker) {
  const fields = Object.fromEntries(
    COMPARED_FIELDS.map((field) => [
      field,
      compareField(field, dailyInput.values[field], worker.values[field]),
    ]),
  );
  const pctEntries = Object.entries(fields)
    .filter(([, value]) => value.pctDiff != null)
    .sort((a, b) => b[1].pctDiff - a[1].pctDiff);
  const materialDriftFields = Object.entries(fields)
    .filter(([, value]) => value.material)
    .map(([field]) => field);

  const brentComparison = brentComparability(dailyInput.brentObservation?.selected, worker.brentObservation?.selected);
  return {
    brentComparison,
    differenceMeaning: 'arithmetic-only-not-source-equivalence',
    ageGapMinutes: minutesBetween(dailyInput.updatedAt, worker.updatedAt),
    fields,
    largestPctDiffField: pctEntries[0]?.[0] ?? null,
    largestPctDiff: pctEntries[0]?.[1].pctDiff ?? null,
    materialDriftFields,
  };
}

function tableValue(value) {
  if (value === null || value === undefined || value === '') return '--';
  return String(value).replace(/\r?\n/gu, ' ').replace(/\|/gu, '\\|');
}

function appendGithubSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const driftRows = Object.entries(summary.drift.fields).map(([field, value]) => [
    field,
    value.daily ?? '--',
    value.worker ?? '--',
    value.absDiff ?? '--',
    value.pctDiff == null ? '--' : `${value.pctDiff}%`,
    value.material ? 'yes' : 'no',
  ]);
  const lines = [
    '## Daily vs Worker Input Audit',
    '',
    `Checked at: ${summary.checkedAt}`,
    '',
    '| Item | Value |',
    '|---|---|',
    `| Daily updatedAt | ${tableValue(summary.dailyInput.updatedAt)} |`,
    `| Daily sourceMode | ${tableValue(summary.dailyInput.sourceMode)} |`,
    `| Daily healthScore | ${tableValue(summary.dailyInput.healthScore)} |`,
    `| Worker available | ${summary.worker.available ? 'true' : 'false'} |`,
    `| Worker updatedAt | ${tableValue(summary.worker.updatedAt)} |`,
    `| Worker sourceMode | ${tableValue(summary.worker.sourceMode)} |`,
    `| Worker healthScore | ${tableValue(summary.worker.healthScore)} |`,
    `| Payload generation gap minutes (not quote age) | ${tableValue(summary.drift.ageGapMinutes)} |`,
    `| Material drift fields | ${tableValue(summary.drift.materialDriftFields.join(', ') || 'none')} |`,
    `| Conclusion | ${tableValue(summary.conclusion)} |`,
    '',
    `| Brent comparability | ${tableValue(summary.drift.brentComparison.status)}: ${tableValue(summary.drift.brentComparison.reason)} |`,
    '',
    'Differences below are arithmetic only, not evidence of equivalent instruments or observations.',
    '',
    '| Field | Daily | Worker | Abs diff | Pct diff | Arithmetic threshold crossed |',
    '|---|---:|---:|---:|---:|---|',
    ...driftRows.map((row) => `| ${row.map(tableValue).join(' | ')} |`),
    '',
  ];

  lines.push('### Brent observation metadata (allowlisted)', '', '```json', JSON.stringify({ daily: { identity: summary.dailyInput.inputIdentity, ...summary.dailyInput.brentObservation }, worker: { identity: summary.worker.inputIdentity, fetchedByAuditAt: summary.worker.fetchedByAuditAt, ...summary.worker.brentObservation } }, null, 2), '```', '');
  fs.appendFileSync(summaryPath, lines.join('\n'));
}

function buildConclusion(worker, drift) {
  if (!worker.available) {
    return 'Worker preview unavailable; Daily still uses realtime-data input. Audit only.';
  }
  if (drift.materialDriftFields.length > 0) {
    return `Arithmetic difference threshold crossed in ${drift.materialDriftFields.join(', ')}; Brent comparability=${drift.brentComparison.status}. Audit only; Daily input unchanged.`;
  }
  return 'No arithmetic threshold crossed (missing values are not evidence of agreement); Daily input remains realtime-data. Audit only.';
}

export async function main() {
const checkedAt = new Date().toISOString();
const githubSummary = hasArg('--github-summary');
const failOnLargeDrift = hasArg('--fail-on-large-drift');

let dailyPayload;
try {
  dailyPayload = readJsonFile(REALTIME_INPUT_PATH);
} catch (err) {
  console.error('[daily-worker-audit] realtime-input-read-or-json-failed');
  process.exit(1);
}

const dailyInput = summarizePayload(dailyPayload, checkedAt, process.env.GFRR_REALTIME_COMMIT_SHA);
const workerFetch = await fetchWorkerPreview();
const worker = workerFetch.available
  ? {
      available: true,
      ...summarizePayload(workerFetch.payload, checkedAt),
      fetchedByAuditAt: new Date().toISOString(),
      error: null,
    }
  : {
      available: false,
      updatedAt: null,
      sourceMode: null,
      healthScore: null,
      criticalMissing: null,
      values: Object.fromEntries(COMPARED_FIELDS.map((field) => [field, null])),
      inputIdentity: null,
      brentObservation: null,
      fetchedByAuditAt: null,
      error: workerFetch.error,
    };
const drift = buildDrift(dailyInput, worker);
const summary = {
  checkedAt,
  dailyInput,
  worker,
  drift,
  conclusion: buildConclusion(worker, drift),
};

console.log(JSON.stringify(summary, null, 2));
if (githubSummary) appendGithubSummary(summary);

if (failOnLargeDrift && drift.materialDriftFields.length > 0) {
  process.exit(2);
}

}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
