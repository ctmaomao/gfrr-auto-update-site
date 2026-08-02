#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildCenturyProxyRows } from './main-score/century-proxy.mjs';
import {
  annualBlockBootstrap,
  buildBinaryEpisodes,
  daysBetween,
  summarizeBinaryTask
} from './main-score/validation-metrics.mjs';

const CONFIG_PATH = path.resolve('config/main-score-century-proxy.json');
const DEFAULT_OUTPUT = 'manual-artifacts/main-score-audit/main-score-century-proxy-latest.json';
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_CSV_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const FRED_API_KEY = (process.env.FRED_API_KEY || '').trim();
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    startDate: config.targetStartDate,
    endDate: new Date().toISOString().slice(0, 10),
    output: DEFAULT_OUTPUT
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-network') options.allowNetwork = true;
    else if (arg === '--start-date') options.startDate = argv[++index];
    else if (arg === '--end-date') options.endDate = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function resolveOutputPath(output) {
  const allowedRoot = path.resolve('manual-artifacts/main-score-audit');
  const resolved = path.resolve(output);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Century proxy output must stay under manual-artifacts/main-score-audit.');
  }
  return resolved;
}

function parseRows(payload) {
  return (Array.isArray(payload?.observations) ? payload.observations : [])
    .map((row) => ({ date: row?.date, value: Number(row?.value) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) && Number.isFinite(row.value));
}

function parseCsv(text) {
  return String(text).trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, rawValue] = line.split(',');
    return { date, value: Number(rawValue) };
  }).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) && Number.isFinite(row.value));
}

async function fetchFredSeries(seriesId, observationStart, observationEnd) {
  if (FRED_API_KEY) {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: FRED_API_KEY,
      file_type: 'json',
      observation_start: observationStart,
      observation_end: observationEnd,
      sort_order: 'asc'
    });
    const response = await fetch(`${FRED_API_BASE}?${params}`);
    if (!response.ok) throw new Error(`FRED API ${seriesId} HTTP ${response.status}`);
    return { rows: parseRows(await response.json()), fetchMode: 'fred_api' };
  }
  const params = new URLSearchParams({ id: seriesId });
  const response = await fetch(`${FRED_CSV_BASE}?${params}`, {
    headers: { 'User-Agent': 'gfrr-main-score-century-proxy/1.0' }
  });
  if (!response.ok) throw new Error(`FRED CSV ${seriesId} HTTP ${response.status}`);
  return {
    rows: parseCsv(await response.text()).filter((row) => row.date >= observationStart && row.date <= observationEnd),
    fetchMode: 'fred_csv'
  };
}

function labelEarlyWarnings(rows, recessionRows) {
  const leadDays = config.labels.earlyWarning6m.leadDays;
  const episodes = buildBinaryEpisodes(recessionRows);
  return rows.map((row) => {
    const nextEpisode = episodes.find((episode) => episode.start > row.date);
    const daysToOnset = nextEpisode ? daysBetween(row.date, nextEpisode.start) : null;
    return {
      ...row,
      earlyWarning6m: !row.label && Number.isFinite(daysToOnset) && daysToOnset >= 1 && daysToOnset <= leadDays,
      daysToNextRecessionOnset: daysToOnset
    };
  });
}

function taskRobustness(observations) {
  return {
    annualBlockBootstrap: annualBlockBootstrap(observations, config.robustness.annualBlockBootstrap),
    temporalHoldouts: config.robustness.temporalHoldouts.map((holdout) => ({
      ...holdout,
      ...summarizeBinaryTask(
        observations.filter((row) => row.date >= holdout.start && row.date <= holdout.end),
        config.thresholds
      )
    }))
  };
}

function episodeDiagnostics(rows, recessionRows) {
  const leadDays = config.labels.earlyWarning6m.leadDays;
  const episodes = buildBinaryEpisodes(recessionRows).filter((episode) => (
    episode.start >= rows[0]?.date && episode.start <= rows[rows.length - 1]?.date
  ));
  const diagnostics = episodes.map((episode) => {
    const preStart = new Date(Date.parse(episode.start) - leadDays * 86400000).toISOString().slice(0, 10);
    const preRows = rows.filter((row) => row.date >= preStart && row.date < episode.start);
    const activeRows = rows.filter((row) => row.date >= episode.start && row.date <= episode.end);
    const firstPreSignal = preRows.find((row) => row.score >= config.primaryThreshold);
    const firstActiveSignal = activeRows.find((row) => row.score >= config.primaryThreshold);
    return {
      start: episode.start,
      end: episode.end,
      preOnsetDetected: Boolean(firstPreSignal),
      firstPreOnsetSignalDate: firstPreSignal?.date ?? null,
      leadDays: firstPreSignal ? daysBetween(firstPreSignal.date, episode.start) : null,
      activeStressDetected: Boolean(firstActiveSignal),
      firstActiveSignalDate: firstActiveSignal?.date ?? null,
      detectionDelayDays: firstActiveSignal ? daysBetween(episode.start, firstActiveSignal.date) : null,
      maxPreOnsetScore: preRows.length ? Math.max(...preRows.map((row) => row.score)) : null,
      maxActiveScore: activeRows.length ? Math.max(...activeRows.map((row) => row.score)) : null
    };
  });
  return {
    threshold: config.primaryThreshold,
    episodes: diagnostics.length,
    preOnsetHits: diagnostics.filter((row) => row.preOnsetDetected).length,
    activeStressHits: diagnostics.filter((row) => row.activeStressDetected).length,
    details: diagnostics
  };
}

function coverageYears(rows) {
  if (rows.length < 2) return 0;
  return Number(((Date.parse(rows[rows.length - 1].date) - Date.parse(rows[0].date)) / (365.25 * 86400000)).toFixed(2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.allowNetwork) throw new Error('Refusing network access. Re-run with --allow-network.');
  const outputPath = resolveOutputPath(options.output);
  const fetchStart = '1919-01-01';
  const seriesRows = {};
  const seriesStatus = {};
  for (const [key, seriesId] of Object.entries(config.series)) {
    const result = await fetchFredSeries(seriesId, fetchStart, options.endDate);
    seriesRows[key] = result.rows;
    seriesStatus[key] = {
      seriesId,
      fetchMode: result.fetchMode,
      observations: result.rows.length,
      firstDate: result.rows[0]?.date ?? null,
      lastDate: result.rows[result.rows.length - 1]?.date ?? null,
      revisionPolicy: 'latest_revised_observations',
      pointInTimeVintage: false
    };
  }
  const rows = buildCenturyProxyRows(seriesRows, config, options.startDate, options.endDate);
  const labeledRows = labelEarlyWarnings(rows, seriesRows.recessionLabel);
  const nowcastObservations = labeledRows.map((row) => ({ date: row.date, score: row.score, label: row.label }));
  const earlyWarningObservations = labeledRows
    .filter((row) => !row.label)
    .map((row) => ({ date: row.date, score: row.score, label: row.earlyWarning6m }));
  const report = {
    generatedAt: new Date().toISOString(),
    contractVersion: config.schemaVersion,
    auditOnly: true,
    productionFormulaReplay: false,
    eligibleForProductionScore: false,
    interpretation: 'century_scale_proxy_validation_not_historical_reconstruction_of_the_six_module_production_score',
    options,
    model: config.model,
    coverage: {
      observations: rows.length,
      firstDate: rows[0]?.date ?? null,
      lastDate: rows[rows.length - 1]?.date ?? null,
      years: coverageYears(rows),
      meetsOneHundredYearTarget: coverageYears(rows) >= 100
    },
    dataVintageAudit: {
      status: 'current_revised_data_not_point_in_time',
      alfredVintageApplied: false,
      causalTransforms: true,
      remainingLookAheadRisk: 'Input levels are causally transformed, but FRED revisions and historical reconstruction changes are not removed.'
    },
    sourceRights: {
      rawSeriesCommitted: false,
      rawSeriesWrittenToArtifact: false,
      aggregateStatisticsOnly: true,
      moodySeriesRedistributionCaveat: true
    },
    seriesStatus,
    tasks: {
      stressNowcast: summarizeBinaryTask(nowcastObservations, config.thresholds),
      earlyWarning6m: summarizeBinaryTask(earlyWarningObservations, config.thresholds)
    },
    robustness: {
      stressNowcast: taskRobustness(nowcastObservations),
      earlyWarning6m: taskRobustness(earlyWarningObservations)
    },
    eventLevel: episodeDiagnostics(labeledRows, seriesRows.recessionLabel),
    limitations: [
      'This proxy does not reconstruct Brent, DXY, VIX, OAS, Treasury, Fed-liquidity, tail-overlay, or six-module production inputs before 2006.',
      'The score is a different three-component proxy and must never be described as the historical production score.',
      'FRED rows are latest revised observations, not ALFRED point-in-time vintages.',
      'BAA and AAA series are Moody data distributed through FRED; raw observations are not committed by this audit.',
      'USREC is an ex-post NBER chronology label and is not an input to the proxy.'
    ]
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[main-score-century-proxy] coverage=${report.coverage.years}y observations=${rows.length}`);
  console.log(`[main-score-century-proxy] stressNowcast AUROC=${report.tasks.stressNowcast.auroc} AP=${report.tasks.stressNowcast.averagePrecision}`);
  console.log(`[main-score-century-proxy] earlyWarning6m AUROC=${report.tasks.earlyWarning6m.auroc} AP=${report.tasks.earlyWarning6m.averagePrecision}`);
  console.log(`[main-score-century-proxy] wrote ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(`[main-score-century-proxy] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
