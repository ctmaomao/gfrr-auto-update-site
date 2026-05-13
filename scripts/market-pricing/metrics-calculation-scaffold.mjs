/*
 * v28.0M-26 Market Pricing Metrics Calculation Scaffold
 *
 * Reads weekly close records from data/market-pricing-history.json (asset=qqq)
 * and computes rolling 60-week MA, sample stdDev, and z-score per record.
 * Writes to data/market-pricing-metrics.json under two-stage manual confirmation.
 *
 * Stage 1 (default): --dry-run-calculate. Preview only. No file write.
 * Stage 2 (explicit): --commit-metrics. Writes data/market-pricing-metrics.json
 *                     atomically (.tmp + rename).
 *
 * Hard guarantees:
 *   - No network calls
 *   - No environment-variable reads
 *   - No writes to data/market-pricing-history.json
 *   - No writes outside data/market-pricing-metrics.json during commit
 *   - 6 sanity checks must all pass before any write
 *   - StdDev uses SAMPLE formula (divisor N-1)
 *   - Z-score raw value is stored; display limiting is M-27's job
 *   - Window size locked to 60 (rejects other values)
 *   - Output records correspond to source records 60..N (first 59 omitted)
 *   - Idempotent: same input -> identical output (except generatedAt and sourceCommit)
 *   - No frontend modification (that is M-27)
 *   - No scoring, decision, execution, position change
 *
 * CI MUST NOT invoke --commit-metrics. The npm script is manual-only.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DEFAULT_INPUT_HISTORY = 'data/market-pricing-history.json';
const DEFAULT_OUTPUT_METRICS = 'data/market-pricing-metrics.json';
const TARGET_ASSET = 'qqq';
const WINDOW_SIZE = 60;
const CONTRACT_VERSION = 'v28.0M-26-metrics-calculation-1';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SANITY_CHECKS = [
  'sanity check 1: history_file_valid_json',
  'sanity check 2: history_state_has_history',
  'sanity check 3: target_asset_active',
  'sanity check 4: sufficient_records_for_window',
  'sanity check 5: records_sorted_unique',
  'sanity check 6: records_close_finite_positive'
];

function toProjectRelative(absolutePath) {
  return path.relative(ROOT, absolutePath).replace(/\\/g, '/');
}

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseCliArgs(argv) {
  const options = {
    inputHistory: DEFAULT_INPUT_HISTORY,
    outputMetrics: DEFAULT_OUTPUT_METRICS,
    asset: TARGET_ASSET,
    windowSize: WINDOW_SIZE,
    dryRunCalculate: false,
    commitMetrics: false,
    quiet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--input-history') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for --input-history'), { exitCode: 2 });
      }
      options.inputHistory = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--input-history=')) {
      options.inputHistory = arg.slice('--input-history='.length);
      continue;
    }

    if (arg === '--output-metrics') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for --output-metrics'), { exitCode: 2 });
      }
      options.outputMetrics = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--output-metrics=')) {
      options.outputMetrics = arg.slice('--output-metrics='.length);
      continue;
    }

    if (arg === '--asset') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for --asset'), { exitCode: 2 });
      }
      options.asset = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--asset=')) {
      options.asset = arg.slice('--asset='.length);
      continue;
    }

    if (arg === '--window-size') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for --window-size'), { exitCode: 2 });
      }
      options.windowSize = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--window-size=')) {
      options.windowSize = Number(arg.slice('--window-size='.length));
      continue;
    }

    if (arg === '--dry-run-calculate') {
      options.dryRunCalculate = true;
      continue;
    }

    if (arg === '--commit-metrics') {
      options.commitMetrics = true;
      continue;
    }

    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }

    throw Object.assign(new Error(`Unknown metrics calculation argument: ${arg}`), { exitCode: 2 });
  }

  if (options.asset !== TARGET_ASSET) {
    throw Object.assign(new Error(`M-26 supports only --asset ${TARGET_ASSET}`), { exitCode: 2 });
  }

  if (!Number.isInteger(options.windowSize) || options.windowSize !== WINDOW_SIZE) {
    throw Object.assign(new Error('M-26 supports only --window-size 60'), { exitCode: 2 });
  }

  return {
    inputHistory: options.inputHistory,
    outputMetrics: options.outputMetrics,
    asset: options.asset,
    windowSize: options.windowSize,
    dryRun: options.dryRunCalculate || !options.commitMetrics,
    quiet: options.quiet
  };
}

function resolveOutputMetricsFile(rawOutputMetrics) {
  const resolved = path.resolve(ROOT, rawOutputMetrics || DEFAULT_OUTPUT_METRICS);
  const required = path.resolve(ROOT, DEFAULT_OUTPUT_METRICS);

  if (resolved !== required) {
    throw Object.assign(
      new Error(`Metrics output target must be ${DEFAULT_OUTPUT_METRICS}`),
      { exitCode: 2 }
    );
  }

  return resolved;
}

function buildFailure({
  dryRun,
  inputHistory,
  outputMetrics,
  asset,
  windowSize,
  failedCheck,
  exitCode,
  reason
}) {
  return {
    ok: false,
    status: 'failed',
    dryRun,
    writePerformed: false,
    inputHistory,
    outputMetrics,
    asset,
    windowSize,
    failedCheck,
    exitCode,
    reason,
    noWritePerformed: true,
    sanityChecks: SANITY_CHECKS
  };
}

function readHistory(inputHistoryPath, inputHistoryDisplay) {
  if (!fs.existsSync(inputHistoryPath)) {
    return {
      ok: false,
      reason: 'history_file_not_valid_json'
    };
  }

  try {
    return {
      ok: true,
      history: JSON.parse(fs.readFileSync(inputHistoryPath, 'utf8'))
    };
  } catch {
    return {
      ok: false,
      reason: 'history_file_not_valid_json'
    };
  }
}

function validateHistoryForMetrics(history, asset, windowSize) {
  if (!isRecord(history)) {
    return {
      ok: false,
      failedCheck: 1,
      exitCode: 11,
      reason: 'history_file_not_valid_json'
    };
  }

  if (history.status !== 'has_history') {
    return {
      ok: false,
      failedCheck: 2,
      exitCode: 12,
      reason: `history_state_not_ready: got ${history.status}`
    };
  }

  const targetAsset = history.assets?.[asset];
  if (!isRecord(targetAsset) || targetAsset.status !== 'active') {
    return {
      ok: false,
      failedCheck: 3,
      exitCode: 13,
      reason: `asset_not_active: ${asset}`
    };
  }

  const records = Array.isArray(targetAsset.records) ? targetAsset.records : [];
  if (records.length < windowSize) {
    return {
      ok: false,
      failedCheck: 4,
      exitCode: 14,
      reason: `insufficient_records_for_window: got ${records.length}, need >= ${windowSize}`
    };
  }

  const seenDates = new Set();
  const seenWeeks = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!isRecord(record) || typeof record.date !== 'string' || !DATE_PATTERN.test(record.date)) {
      return {
        ok: false,
        failedCheck: 5,
        exitCode: 15,
        reason: `record_order_invalid: index ${index}`
      };
    }

    if (index > 0 && record.date <= records[index - 1].date) {
      return {
        ok: false,
        failedCheck: 5,
        exitCode: 15,
        reason: `record_order_invalid: index ${index}`
      };
    }

    if (seenDates.has(record.date) || seenWeeks.has(record.isoWeek)) {
      return {
        ok: false,
        failedCheck: 5,
        exitCode: 15,
        reason: `record_order_invalid: index ${index}`
      };
    }

    seenDates.add(record.date);
    seenWeeks.add(record.isoWeek);
  }

  for (let index = 0; index < records.length; index += 1) {
    const close = records[index]?.close;
    if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) {
      return {
        ok: false,
        failedCheck: 6,
        exitCode: 16,
        reason: `record_value_invalid: index ${index}`
      };
    }
  }

  return {
    ok: true,
    records
  };
}

export function computeRollingMetrics(records, windowSize = WINDOW_SIZE) {
  if (!Array.isArray(records) || records.length < windowSize) return [];

  const output = [];
  for (let endIndex = windowSize - 1; endIndex < records.length; endIndex += 1) {
    const windowRecords = records.slice(endIndex - windowSize + 1, endIndex + 1);
    const closes = windowRecords.map((record) => record.close);
    const mean = closes.reduce((sum, close) => sum + close, 0) / windowSize;
    const squaredDeviationSum = closes.reduce((sum, close) => sum + ((close - mean) ** 2), 0);
    const stdDev = Math.sqrt(squaredDeviationSum / (windowSize - 1));
    const currentRecord = records[endIndex];
    const zScore = stdDev === 0 ? 0 : (currentRecord.close - mean) / stdDev;

    output.push({
      date: currentRecord.date,
      isoWeek: currentRecord.isoWeek,
      close: currentRecord.close,
      ma60: round4(mean),
      stdDev60: round4(stdDev),
      zScore: round4(zScore)
    });
  }

  return output;
}

function rangeFor(records, key) {
  const values = records.map((record) => record[key]);
  return {
    min: round4(Math.min(...values)),
    max: round4(Math.max(...values))
  };
}

function getSourceCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return 'unknown';
  }
}

function buildBoundaries() {
  return {
    noFetch: true,
    noFrontendChange: true,
    noHistoryWrite: true,
    noScoringChange: true,
    noDecisionChange: true,
    notInvestmentAdvice: true,
    calculationLayerActive: true,
    displayLayerActive: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false
  };
}

function buildMetricsOutput(report, generatedAt, sourceCommit) {
  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_metrics_calculation',
    generatedAt,
    sourceHistoryFile: report.sourceHistoryFile,
    sourceCommit,
    asset: report.asset,
    windowSize: report.windowSize,
    stdDevFormula: 'sample',
    stdDevDivisor: 'N-1',
    zScoreCapped: false,
    sourceRecordsCount: report.sourceRecordsCount,
    metricsRecordsCount: report.metricsRecordsCount,
    earliestMetricDate: report.earliestMetricDate,
    latestMetricDate: report.latestMetricDate,
    ma60Range: report.ma60Range,
    stdDev60Range: report.stdDev60Range,
    zScoreRange: report.zScoreRange,
    boundaries: buildBoundaries(),
    records: cloneJson(report.records)
  };
}

function writeMetricsAtomically(outputPath, output) {
  const tmpPath = `${outputPath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, outputPath);
  } catch (error) {
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
    }
    throw Object.assign(error, { exitCode: 3 });
  }
}

export function buildMetricsCalculationReport(options = {}) {
  const dryRun = options.dryRun !== false;
  const asset = options.asset || TARGET_ASSET;
  const windowSize = options.windowSize || WINDOW_SIZE;
  const inputHistoryPath = path.resolve(ROOT, options.inputHistory || DEFAULT_INPUT_HISTORY);
  const outputMetricsPath = resolveOutputMetricsFile(options.outputMetrics || DEFAULT_OUTPUT_METRICS);
  const inputHistoryDisplay = toProjectRelative(inputHistoryPath);
  const outputMetricsDisplay = toProjectRelative(outputMetricsPath);

  if (asset !== TARGET_ASSET) {
    throw Object.assign(new Error(`M-26 supports only asset ${TARGET_ASSET}`), { exitCode: 2 });
  }

  if (windowSize !== WINDOW_SIZE) {
    throw Object.assign(new Error('M-26 supports only window size 60'), { exitCode: 2 });
  }

  const historyRead = readHistory(inputHistoryPath, inputHistoryDisplay);
  if (!historyRead.ok) {
    return buildFailure({
      dryRun,
      inputHistory: inputHistoryDisplay,
      outputMetrics: outputMetricsDisplay,
      asset,
      windowSize,
      failedCheck: 1,
      exitCode: 11,
      reason: historyRead.reason
    });
  }

  const sanityResult = validateHistoryForMetrics(historyRead.history, asset, windowSize);
  if (!sanityResult.ok) {
    return buildFailure({
      dryRun,
      inputHistory: inputHistoryDisplay,
      outputMetrics: outputMetricsDisplay,
      asset,
      windowSize,
      failedCheck: sanityResult.failedCheck,
      exitCode: sanityResult.exitCode,
      reason: sanityResult.reason
    });
  }

  const metricsRecords = computeRollingMetrics(sanityResult.records, windowSize);
  const report = {
    ok: true,
    status: dryRun ? 'dry_run' : 'committed',
    dryRun,
    writePerformed: false,
    sourceHistoryFile: inputHistoryDisplay,
    outputMetricsFile: outputMetricsDisplay,
    asset,
    windowSize,
    stdDevFormula: 'sample',
    stdDevDivisor: 'N-1',
    zScoreCapped: false,
    sourceRecordsCount: sanityResult.records.length,
    metricsRecordsCount: metricsRecords.length,
    earliestMetricDate: metricsRecords[0].date,
    latestMetricDate: metricsRecords.at(-1).date,
    ma60Range: rangeFor(metricsRecords, 'ma60'),
    stdDev60Range: rangeFor(metricsRecords, 'stdDev60'),
    zScoreRange: rangeFor(metricsRecords, 'zScore'),
    boundaries: buildBoundaries(),
    records: metricsRecords,
    previewFirst3: metricsRecords.slice(0, 3),
    previewLast3: metricsRecords.slice(-3),
    sanityChecks: SANITY_CHECKS,
    sanityCheckCount: SANITY_CHECKS.length,
    noWritePerformed: dryRun
  };

  if (!dryRun) {
    const output = buildMetricsOutput(report, nowIso(), getSourceCommit());
    writeMetricsAtomically(outputMetricsPath, output);
    report.writePerformed = true;
    report.noWritePerformed = false;
  }

  return report;
}

function formatRange(range) {
  return `[${range.min}, ${range.max}]`;
}

function printFailure(report) {
  console.error('Market pricing metrics calculation: FAIL');
  console.error(`failed_check=${report.failedCheck}`);
  console.error(`reason=${report.reason}`);
  console.error('no_write_performed=true');
}

function printDryRun(report) {
  console.log('Market pricing metrics calculation: DRY-RUN OK');
  console.log(`would_write_records=${report.metricsRecordsCount}`);
  console.log(`asset=${report.asset}`);
  console.log(`window_size=${report.windowSize}`);
  console.log(`earliest_metric_date=${report.earliestMetricDate}`);
  console.log(`latest_metric_date=${report.latestMetricDate}`);
  console.log(`ma60_range=${formatRange(report.ma60Range)}`);
  console.log(`stdDev60_range=${formatRange(report.stdDev60Range)}`);
  console.log(`zScore_range=${formatRange(report.zScoreRange)}`);
  console.log(`preview_first_3=${JSON.stringify(report.previewFirst3)}`);
  console.log(`preview_last_3=${JSON.stringify(report.previewLast3)}`);
  console.log(`output_path=${report.outputMetricsFile}`);
  console.log('(no write performed)');
}

function printCommitted(report) {
  console.log('Market pricing metrics calculation: COMMITTED');
  console.log(`wrote_records=${report.metricsRecordsCount}`);
  console.log(`asset=${report.asset}`);
  console.log(`window_size=${report.windowSize}`);
  console.log(`earliest_metric_date=${report.earliestMetricDate}`);
  console.log(`latest_metric_date=${report.latestMetricDate}`);
  console.log(`output_path=${report.outputMetricsFile}`);
  console.log('(file written atomically via .tmp + rename)');
}

function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const report = buildMetricsCalculationReport(options);

    if (!report.ok) {
      if (!options.quiet) {
        printFailure(report);
      }
      process.exitCode = report.exitCode;
      return;
    }

    if (report.dryRun) {
      if (!options.quiet) {
        printDryRun(report);
      }
      return;
    }

    if (!options.quiet) {
      printCommitted(report);
    }
  } catch (error) {
    console.error('Market pricing metrics calculation: FAIL');
    console.error('failed_check=fatal_io_or_cli');
    console.error(`reason=${error.message}`);
    console.error('no_write_performed=true');
    process.exitCode = error.exitCode || 3;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main();
}
