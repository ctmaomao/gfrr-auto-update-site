#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { safeRelativePath } from './lib/check-script-helpers.mjs';

export const REVIEW_SCHEMA = 'market-pricing-freshness-review-v1';
export const ACTIVE_ASSETS = ['qqq', 'ndx', 'ixic'];
export const MAX_ACTIVE_ASSET_AGE_DAYS = 10;
export const MAX_AUXILIARY_LAG_DAYS = 7;

const DEFAULT_HISTORY = 'data/market-pricing-history.json';
const DEFAULT_METRICS = 'data/market-pricing-metrics.json';
const DAY_MS = 86_400_000;
const BOUNDARY = Object.freeze({
  auditOnly: true,
  displayOnly: true,
  readOnly: true,
  networkAccessed: false,
  productionWriteAttempted: false,
  affectsValues: false,
  affectsScoring: false,
  affectsDecisionModel: false,
  affectsExecutionLock: false,
  affectsPositionGuidance: false,
  affectsWorkerRuntime: false,
  affectsCrossValidation: false
});

function printUsage() {
  console.log(`Usage:
  npm run review:market-pricing-freshness -- [options]

Options:
  --history <path>  History JSON. Default: ${DEFAULT_HISTORY}
  --metrics <path>  Metrics JSON. Default: ${DEFAULT_METRICS}
  --now <ISO>       Override review time for reproducible review.
  --strict          Exit non-zero on WARN as well as FAIL.
  --json            Print the full JSON review.
  --help            Show this help.

This helper is offline and read-only. It does not refresh Yahoo or write data.`);
}

function approvedInputPath(value, expectedDataPath) {
  const inputPath = safeRelativePath(value);
  const approved = inputPath && (
    inputPath === expectedDataPath
    || inputPath.startsWith('docs/fixtures/')
    || inputPath.startsWith('manual-artifacts/')
  );
  if (!approved) throw new Error(`Refusing input outside approved paths: ${value}`);
  return inputPath;
}

function parseArgs(argv) {
  const options = {
    history: DEFAULT_HISTORY,
    metrics: DEFAULT_METRICS,
    strict: false,
    printJson: false,
    nowMs: Date.now()
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (['--history', '--metrics', '--now'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--history') options.history = value;
      if (arg === '--metrics') options.metrics = value;
      if (arg === '--now') options.nowMs = Date.parse(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.nowMs)) throw new Error('Invalid --now timestamp.');
  options.historyPath = approvedInputPath(options.history, DEFAULT_HISTORY);
  options.metricsPath = approvedInputPath(options.metrics, DEFAULT_METRICS);
  return options;
}

function addFinding(findings, severity, code, message, action) {
  findings.push({ severity, code, message, action });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseMarketDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function roundDays(value) {
  return Number(value.toFixed(2));
}

function assetSnapshot(assetKey, history, metrics, nowMs, findings) {
  const historyAsset = history?.assets?.[assetKey];
  const metricsAsset = metrics?.assets?.[assetKey];
  if (!isObject(historyAsset) || !Array.isArray(historyAsset.records) || historyAsset.records.length === 0) {
    addFinding(findings, 'fail', `${assetKey}_history_missing`, `${assetKey} active history is missing.`, 'repair_market_pricing_history');
    return {
      asset: assetKey,
      historyLatestDate: null,
      metricsLatestDate: null,
      ageDays: null,
      lagVsPrimaryDays: null
    };
  }
  if (!isObject(metricsAsset) || !Array.isArray(metricsAsset.records) || metricsAsset.records.length === 0) {
    addFinding(findings, 'fail', `${assetKey}_metrics_missing`, `${assetKey} active metrics are missing.`, 'recompute_market_pricing_metrics');
  }

  const historyLatestDate = historyAsset.records.at(-1)?.date ?? null;
  const metricsLatestDate = metricsAsset?.records?.at(-1)?.date ?? metricsAsset?.latestMetricDate ?? null;
  const historyLatestMs = parseMarketDate(historyLatestDate);
  if (historyLatestMs === null) {
    addFinding(findings, 'fail', `${assetKey}_latest_date_invalid`, `${assetKey} latest history date is invalid.`, 'repair_market_pricing_history');
  }
  if (historyAsset.coverage?.latestDate !== historyLatestDate) {
    addFinding(findings, 'fail', `${assetKey}_coverage_latest_mismatch`, `${assetKey} coverage.latestDate does not match history.`, 'repair_market_pricing_history');
  }
  if (metricsAsset?.latestMetricDate !== metricsLatestDate) {
    addFinding(findings, 'fail', `${assetKey}_metrics_summary_mismatch`, `${assetKey} metrics latest summary does not match records.`, 'recompute_market_pricing_metrics');
  }
  if (historyLatestDate !== metricsLatestDate) {
    addFinding(
      findings,
      'fail',
      `${assetKey}_history_metrics_mismatch`,
      `${assetKey} history latest ${historyLatestDate} does not match metrics latest ${metricsLatestDate}.`,
      'recompute_market_pricing_metrics'
    );
  }

  let ageDays = null;
  if (historyLatestMs !== null) {
    ageDays = roundDays((nowMs - historyLatestMs) / DAY_MS);
    if (ageDays < -3) {
      addFinding(findings, 'fail', `${assetKey}_date_in_future`, `${assetKey} latest market date is ${Math.abs(ageDays)} days in the future.`, 'repair_market_pricing_history');
    } else if (ageDays > MAX_ACTIVE_ASSET_AGE_DAYS) {
      addFinding(
        findings,
        'warn',
        `${assetKey}_history_stale`,
        `${assetKey} latest weekly record is ${ageDays} days old.`,
        assetKey === 'qqq'
          ? 'inspect_qqq_weekly_workflow_or_run_approved_manual_refresh'
          : 'run_approved_ndx_ixic_manual_refresh_then_recompute_metrics'
      );
    }
  }

  const lastCommittedAt = historyAsset.source?.lastCommittedAt;
  const lastCommittedMs = Date.parse(lastCommittedAt || '');
  if (!Number.isFinite(lastCommittedMs)) {
    addFinding(findings, 'fail', `${assetKey}_commit_timestamp_invalid`, `${assetKey} source.lastCommittedAt is invalid.`, 'repair_market_pricing_history');
  } else if (historyLatestMs !== null && lastCommittedMs < historyLatestMs) {
    addFinding(findings, 'fail', `${assetKey}_commit_before_market_date`, `${assetKey} commit timestamp predates its latest market date.`, 'repair_market_pricing_history');
  }

  return {
    asset: assetKey,
    historyLatestDate,
    metricsLatestDate,
    ageDays,
    lagVsPrimaryDays: null,
    historyRecords: historyAsset.records.length,
    metricsRecords: Array.isArray(metricsAsset?.records) ? metricsAsset.records.length : 0,
    lastCommittedAt: Number.isFinite(lastCommittedMs) ? lastCommittedAt : null
  };
}

export function reviewMarketPricingFreshness(history, metrics, {
  historyPath = DEFAULT_HISTORY,
  metricsPath = DEFAULT_METRICS,
  nowMs = Date.now()
} = {}) {
  const findings = [];
  if (!isObject(history)) {
    addFinding(findings, 'fail', 'history_payload_invalid', 'History payload must be an object.', 'repair_market_pricing_history');
  }
  if (!isObject(metrics)) {
    addFinding(findings, 'fail', 'metrics_payload_invalid', 'Metrics payload must be an object.', 'recompute_market_pricing_metrics');
  }

  const assets = ACTIVE_ASSETS.map((assetKey) => assetSnapshot(assetKey, history, metrics, nowMs, findings));
  const primary = assets.find((asset) => asset.asset === 'qqq');
  const primaryMs = parseMarketDate(primary?.historyLatestDate);
  for (const asset of assets.filter((item) => item.asset !== 'qqq')) {
    const assetMs = parseMarketDate(asset.historyLatestDate);
    if (primaryMs === null || assetMs === null) continue;
    asset.lagVsPrimaryDays = roundDays((primaryMs - assetMs) / DAY_MS);
    if (asset.lagVsPrimaryDays > MAX_AUXILIARY_LAG_DAYS) {
      addFinding(
        findings,
        'warn',
        `${asset.asset}_lags_primary`,
        `${asset.asset} trails QQQ by ${asset.lagVsPrimaryDays} days.`,
        'run_approved_ndx_ixic_manual_refresh_then_recompute_metrics'
      );
    }
  }

  const failCount = findings.filter((finding) => finding.severity === 'fail').length;
  const warnCount = findings.filter((finding) => finding.severity === 'warn').length;
  const status = failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS';
  return {
    schemaVersion: REVIEW_SCHEMA,
    reviewedAt: new Date(nowMs).toISOString(),
    input: {
      historyPath: safeRelativePath(historyPath) || historyPath,
      metricsPath: safeRelativePath(metricsPath) || metricsPath
    },
    thresholds: {
      maxActiveAssetAgeDays: MAX_ACTIVE_ASSET_AGE_DAYS,
      maxAuxiliaryLagDays: MAX_AUXILIARY_LAG_DAYS
    },
    boundary: { ...BOUNDARY },
    review: {
      status,
      assets,
      findings
    },
    summary: {
      failCount,
      warnCount,
      actions: [...new Set(findings.map((finding) => finding.action).filter(Boolean))],
      recommendation: status === 'PASS'
        ? 'keep_current_display_only_history'
        : status === 'WARN'
          ? 'refresh_or_inspect_stale_market_pricing_asset'
          : 'repair_history_metrics_alignment_before_display'
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const history = JSON.parse(readFileSync(resolve(options.history), 'utf8'));
  const metrics = JSON.parse(readFileSync(resolve(options.metrics), 'utf8'));
  const report = reviewMarketPricingFreshness(history, metrics, {
    historyPath: options.history,
    metricsPath: options.metrics,
    nowMs: options.nowMs
  });
  if (options.printJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `Market pricing freshness review: ${report.review.status} ` +
      `(${report.review.assets.map((asset) => `${asset.asset}=${asset.historyLatestDate || 'missing'}`).join(', ')}, ` +
      `fail=${report.summary.failCount}, warn=${report.summary.warnCount})`
    );
    for (const finding of report.review.findings) {
      console.log(`- [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`);
    }
  }
  if (report.review.status === 'FAIL' || (options.strict && report.review.status === 'WARN')) {
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`Market pricing freshness review failed: ${error.message}`);
    process.exitCode = 1;
  });
}
