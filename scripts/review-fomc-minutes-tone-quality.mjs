#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  assertManualArtifactWritePath,
  safeRelativePath,
  writeJson
} from './lib/check-script-helpers.mjs';

export const REVIEW_SCHEMA = 'fomc-minutes-tone-quality-review-v1';
export const FRESH_MAX_AGE_DAYS = 70;
export const STALE_MAX_AGE_DAYS = 120;
export const TOPIC_KEYS = [
  'inflation',
  'laborMarket',
  'growth',
  'financialConditions',
  'balanceSheet',
  'risks'
];

const DEFAULT_INPUT = 'data/radar-data.json';
const DEFAULT_OUTPUT = 'manual-artifacts/fomc-minutes/fomc-minutes-tone-quality-latest.json';
const ALLOWED_SOURCE_STATUSES = new Set(['live', 'fallback', 'missing', 'manual_required']);
const ALLOWED_TONES = new Set(['偏鹰', '偏鸽', '平衡', '未知']);
const UNSAFE_WORDING = [
  /买入|卖出|加仓|减仓|持仓|仓位|止损|止盈|交易指令|必须行动|建议配置/iu,
  /预测|必然|确定会|保证/iu,
  /\b(?:scoring|decisionModel|executionLock|positionGuidance|action queue|trigger monitor|invalidation rules)\b/iu
];
const BOUNDARY = Object.freeze({
  auditOnly: true,
  displayOnly: true,
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
  npm run review:fomc-minutes-tone-quality -- [options]

Options:
  --input <path>       Radar JSON input. Default: ${DEFAULT_INPUT}
  --output <path>      Ignored manual artifact. Default: ${DEFAULT_OUTPUT}
  --no-output          Do not write an artifact.
  --now <ISO>          Override review time for reproducible review.
  --strict             Exit non-zero on WATCH as well as FAIL.
  --json               Print full JSON review.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    writeOutput: true,
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
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (['--input', '--output', '--now'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--input') options.input = value;
      if (arg === '--output') options.output = value;
      if (arg === '--now') options.nowMs = Date.parse(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.nowMs)) throw new Error('Invalid --now timestamp.');
  const inputPath = safeRelativePath(options.input);
  if (!inputPath || ![
    'data/radar-data.json',
    'docs/fixtures/',
    'manual-artifacts/'
  ].some((prefix) => inputPath === prefix || inputPath.startsWith(prefix))) {
    throw new Error(`Refusing input outside approved paths: ${options.input}`);
  }
  if (options.writeOutput) assertManualArtifactWritePath(options.output);
  return options;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function expectedMinutesTone(hawkishCount, dovishCount) {
  if (!isNonNegativeInteger(hawkishCount) || !isNonNegativeInteger(dovishCount)) return '未知';
  if (hawkishCount >= dovishCount + 8) return '偏鹰';
  if (dovishCount >= hawkishCount + 8) return '偏鸽';
  return '平衡';
}

export function expectedMinutesSummary(tone, topicCounts) {
  const topics = TOPIC_KEYS
    .map((key) => [key, topicCounts?.[key]])
    .filter(([, value]) => Number.isFinite(value))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key, value]) => `${key}:${value}`);
  return `FOMC minutes keyword NLP 显示语气${tone}；高频主题 ${topics.join(' / ') || '待确认'}。`;
}

function addFinding(findings, severity, code, message) {
  findings.push({ severity, code, message });
}

function validateOfficialMinutesIdentity(policy, findings) {
  let parsedUrl = null;
  try {
    parsedUrl = new URL(policy.minutesUrl);
  } catch {
    addFinding(findings, 'fail', 'minutes_url_invalid', 'minutesUrl must be a parseable URL.');
    return;
  }
  const match = parsedUrl.pathname.match(/^\/monetarypolicy\/fomcminutes(\d{8})\.htm$/iu);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'www.federalreserve.gov' || !match) {
    addFinding(findings, 'fail', 'minutes_url_not_official', 'minutesUrl must match the official Federal Reserve minutes page.');
    return;
  }
  const expectedDate = `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`;
  const actualDate = new Date(policy.minutesDate);
  if (!Number.isFinite(actualDate.getTime())) {
    addFinding(findings, 'fail', 'minutes_date_invalid', 'minutesDate must be a parseable ISO timestamp.');
  } else if (actualDate.toISOString().slice(0, 10) !== expectedDate) {
    addFinding(findings, 'fail', 'minutes_url_date_mismatch', 'minutesDate must match the date encoded in minutesUrl.');
  }
}

function validateCountsAndSummary(policy, findings) {
  const counts = [policy.minutesHawkishTermCount, policy.minutesDovishTermCount];
  if (counts.some((value) => !isNonNegativeInteger(value))) {
    addFinding(findings, 'fail', 'tone_count_invalid', 'Hawkish and dovish counts must be non-negative integers.');
    return { expectedTone: '未知', expectedSummaryZh: null };
  }
  if (!policy.minutesTopicCounts || typeof policy.minutesTopicCounts !== 'object' || Array.isArray(policy.minutesTopicCounts)) {
    addFinding(findings, 'fail', 'topic_counts_missing', 'minutesTopicCounts must be an object.');
    return { expectedTone: expectedMinutesTone(...counts), expectedSummaryZh: null };
  }
  for (const key of TOPIC_KEYS) {
    if (!isNonNegativeInteger(policy.minutesTopicCounts[key])) {
      addFinding(findings, 'fail', 'topic_count_invalid', `minutesTopicCounts.${key} must be a non-negative integer.`);
    }
  }
  const expectedTone = expectedMinutesTone(...counts);
  if (policy.minutesPolicyTone !== expectedTone) {
    addFinding(findings, 'fail', 'tone_count_mismatch', `minutesPolicyTone must be ${expectedTone} for the stored counts.`);
  }
  const expectedSummaryZh = expectedMinutesSummary(expectedTone, policy.minutesTopicCounts);
  if (policy.minutesSummaryZh !== expectedSummaryZh) {
    addFinding(findings, 'fail', 'summary_not_reproducible', 'minutesSummaryZh must match the deterministic tone/topic summary.');
  }
  if (typeof policy.minutesSummaryZh !== 'string' || policy.minutesSummaryZh.length > 180) {
    addFinding(findings, 'fail', 'summary_not_bounded', 'minutesSummaryZh must be a string of at most 180 characters.');
  } else if (UNSAFE_WORDING.some((pattern) => pattern.test(policy.minutesSummaryZh))) {
    addFinding(findings, 'fail', 'summary_decision_language', 'minutesSummaryZh contains prediction, trading, or decision-engine language.');
  }
  const total = counts.reduce((sum, value) => sum + value, 0)
    + TOPIC_KEYS.reduce((sum, key) => sum + (policy.minutesTopicCounts[key] || 0), 0);
  if (total === 0) addFinding(findings, 'watch', 'empty_keyword_result', 'All keyword counts are zero; inspect parser coverage.');
  return { expectedTone, expectedSummaryZh };
}

function freshnessContext(minutesDate, nowMs, findings) {
  const timestamp = Date.parse(minutesDate || '');
  if (!Number.isFinite(timestamp)) return { status: 'unknown', ageDays: null };
  const ageDays = Number(((nowMs - timestamp) / 86_400_000).toFixed(2));
  if (ageDays < -2) {
    addFinding(findings, 'fail', 'minutes_date_in_future', 'minutesDate is more than two days in the future.');
    return { status: 'future', ageDays };
  }
  if (ageDays > STALE_MAX_AGE_DAYS) {
    addFinding(findings, 'watch', 'minutes_stale', `Minutes evidence is older than ${STALE_MAX_AGE_DAYS} days.`);
    return { status: 'stale', ageDays };
  }
  if (ageDays > FRESH_MAX_AGE_DAYS) {
    addFinding(findings, 'watch', 'minutes_aging', `Minutes evidence is older than ${FRESH_MAX_AGE_DAYS} days.`);
    return { status: 'aging', ageDays };
  }
  return { status: 'fresh', ageDays };
}

export function reviewFomcMinutesToneQuality(data, { inputPath = DEFAULT_INPUT, nowMs = Date.now() } = {}) {
  const findings = [];
  const policy = data?.macroDrivers?.policyExpectations;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    addFinding(findings, 'fail', 'policy_expectations_missing', 'macroDrivers.policyExpectations is missing.');
  }
  const sourceStatus = policy?.sourceStatus?.fomcMinutes;
  if (!ALLOWED_SOURCE_STATUSES.has(sourceStatus)) {
    addFinding(findings, 'fail', 'source_status_invalid', 'sourceStatus.fomcMinutes must be live, fallback, missing, or manual_required.');
  }
  let expectedTone = '未知';
  let expectedSummaryZh = null;
  let freshness = { status: 'unknown', ageDays: null };
  if (sourceStatus === 'missing' || sourceStatus === 'manual_required') {
    const populated = [
      policy.minutesDate,
      policy.minutesUrl,
      policy.minutesHawkishTermCount,
      policy.minutesDovishTermCount,
      policy.minutesTopicCounts,
      policy.minutesSummaryZh
    ].some((value) => value !== null && value !== undefined);
    if (populated || policy.minutesPolicyTone !== '未知') {
      addFinding(findings, 'fail', 'missing_source_with_payload', `${sourceStatus} source must expose null minutes fields and tone 未知.`);
    } else {
      addFinding(
        findings,
        'watch',
        sourceStatus === 'manual_required' ? 'minutes_source_manual_required' : 'minutes_source_missing',
        sourceStatus === 'manual_required'
          ? 'FOMC minutes source is manual_required; no tone claim is available.'
          : 'FOMC minutes source is missing; no tone claim is available.'
      );
    }
  } else if (sourceStatus === 'live' || sourceStatus === 'fallback') {
    validateOfficialMinutesIdentity(policy, findings);
    ({ expectedTone, expectedSummaryZh } = validateCountsAndSummary(policy, findings));
    freshness = freshnessContext(policy.minutesDate, nowMs, findings);
    if (sourceStatus === 'fallback') {
      addFinding(findings, 'watch', 'minutes_source_fallback', 'FOMC minutes uses the last-good fallback payload.');
    }
  }
  if (!ALLOWED_TONES.has(policy?.minutesPolicyTone)) {
    addFinding(findings, 'fail', 'minutes_tone_invalid', 'minutesPolicyTone is not supported.');
  }
  const failCount = findings.filter((item) => item.severity === 'fail').length;
  const watchCount = findings.filter((item) => item.severity === 'watch').length;
  const status = failCount ? 'FAIL' : watchCount ? 'WATCH' : 'PASS';
  return {
    schemaVersion: REVIEW_SCHEMA,
    generatedAt: new Date(nowMs).toISOString(),
    inputPath: safeRelativePath(inputPath) || inputPath,
    boundary: { ...BOUNDARY },
    review: {
      status,
      sourceStatus: sourceStatus || null,
      freshness,
      observedTone: policy?.minutesPolicyTone ?? null,
      expectedTone,
      observedSummaryZh: policy?.minutesSummaryZh ?? null,
      expectedSummaryZh,
      findings
    },
    summary: {
      failCount,
      watchCount,
      recommendation: status === 'PASS'
        ? 'keep_display_only_current_contract'
        : status === 'WATCH'
          ? 'inspect_freshness_or_fallback_keep_display_only'
          : 'fix_contract_or_semantic_mismatch_before_display_refresh'
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const data = JSON.parse(readFileSync(resolve(options.input), 'utf8'));
  const report = reviewFomcMinutesToneQuality(data, {
    inputPath: options.input,
    nowMs: options.nowMs
  });
  if (options.writeOutput) writeJson(options.output, report);
  if (options.printJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      `FOMC minutes tone quality: ${report.review.status} ` +
      `(source=${report.review.sourceStatus}, freshness=${report.review.freshness.status}, ` +
      `tone=${report.review.observedTone}, fail=${report.summary.failCount}, watch=${report.summary.watchCount})`
    );
  }
  if (report.review.status === 'FAIL' || (options.strict && report.review.status === 'WATCH')) process.exitCode = 1;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`FOMC minutes tone quality review failed: ${error.message}`);
    process.exitCode = 1;
  });
}
