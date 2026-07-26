#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isManualArtifactPath, safeRelativePath } from './lib/check-script-helpers.mjs';

const DEFAULT_INPUT = 'data/radar-data.json';
const DEFAULT_OUTPUT = 'manual-artifacts/policy-review/fomc-minutes-tone-quality-latest.json';
const DEFAULT_MAX_AGE_HOURS = 120;
const BOUNDARY =
  'read-only review only; no scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation impact';
const CONTRACT_VERSION = 'fomc-minutes-tone-quality-review-v1';
const CONTRACT = {
  kind: 'fomc_minutes_tone_quality_review',
  productionImpact: {
    noProductionWrite: true,
    noRealtimeWrite: true,
    noWorkflowChange: true,
    noFrontendChange: true,
    noWorkerRuntimeChange: true,
    noNetworkCall: true,
    noEnvironmentRead: true,
    affectsValues: false,
    affectsDisplayInputsBaseline: false,
    affectsEffectiveDisplayInputs: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsWorldOrderWeights: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  },
  noNetworkCall: true
};

const ALLOWED_TONES = new Set(['偏鹰', '偏鸽', '平衡', '未知']);
const ALLOWED_STATUS = new Set(['live', 'fallback', 'missing', 'manual_required']);
const TOPIC_KEYS = [
  'inflation',
  'laborMarket',
  'growth',
  'financialConditions',
  'balanceSheet',
  'risks'
];
const FORBIDDEN_PHRASES = [
  /决策/gu,
  /执行/gu,
  /仓位|交易|加仓|减仓|买入|卖出|做空|持仓/gu,
  /position|execution|scoring|trade|buy|sell/iu
];

function usage() {
  console.log(`Usage:
  npm run review:fomc-minutes-tone-quality -- [options]

Options:
  --input <path>         Path to payload file. Default: ${DEFAULT_INPUT}
  --output <path>        Manual review output path. Default: ${DEFAULT_OUTPUT}
  --max-age-hours <num>  Minutes freshness hard warning threshold in hours. Default: ${DEFAULT_MAX_AGE_HOURS}
  --strict               Exit non-zero on FAIL/WARN/WATCH.
  --no-output            Skip writing review JSON.
  --json                 Print full review JSON.
  --help                 Show this help.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    writeOutput: true,
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
    strict: false,
    printJson: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
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
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--input') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options.input = value;
      index += 1;
      continue;
    }
    if (arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options.output = value;
      index += 1;
      continue;
    }
    if (arg === '--max-age-hours') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('--max-age-hours must be > 0');
      options.maxAgeHours = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isManualArtifactPath(options.output) && options.writeOutput) {
    throw new Error(`Refusing output outside manual-artifacts/: ${options.output}`);
  }
  if (!safeRelativePath(options.input)) {
    throw new Error(`Input path is outside repo root: ${options.input}`);
  }
  const safeInput = safeRelativePath(options.input);
  if (!safeInput.startsWith('data/') && !safeInput.startsWith('docs/fixtures/')) {
    throw new Error(`Refusing input outside data/ or docs/fixtures/: ${options.input}`);
  }
  return options;
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function ageHours(value, nowMs = Date.now()) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const age = (nowMs - parsed) / 36e5;
  return Number.isFinite(age) ? Number(age.toFixed(2)) : null;
}

function toneFromCounts(hawkish, dovish) {
  if (!Number.isFinite(hawkish) || !Number.isFinite(dovish)) return null;
  if (hawkish >= dovish + 8) return '偏鹰';
  if (dovish >= hawkish + 8) return '偏鸽';
  return '平衡';
}

function isValidTopicCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const key of TOPIC_KEYS) {
    const v = value[key];
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) return false;
  }
  return true;
}

function topTopics(value) {
  if (!isValidTopicCounts(value)) return [];
  return Object.entries(value)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => `${key}:${value}`)
    .join(' / ') || '待确认';
}

function textHash(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 16);
}

function pushFinding(state, severity, code, message) {
  state.findings.push({ severity, code, message });
  if (severity === 'fail') state.failCount += 1;
  if (severity === 'warn') state.warningCount += 1;
  if (severity === 'watch') state.watchCount += 1;
}

function makeReviewHeader(options, policyInput) {
  const nowIso = new Date().toISOString();
  const radarMinutesDate = policyInput.minutesDate;
  const summary = policyInput.minutesSummaryZh;
  return {
    schemaVersion: 'fomc-minutes-tone-quality-review-v1',
    contractVersion: CONTRACT_VERSION,
    generatedAt: nowIso,
    boundary: BOUNDARY,
    productionImpact: CONTRACT.productionImpact,
    sourcePath: safeRelativePath(options.input),
    outputPath: options.writeOutput ? safeRelativePath(options.output) : null,
    maxAgeHours: options.maxAgeHours,
    checks: {
      toneAllowed: false,
      toneConsistentWithCounts: null,
      summaryContainsTone: null,
      summaryContainsTopics: null,
      minutesDateParsed: isIsoDate(radarMinutesDate),
      sourceStatusFomcMinutes: policyInput?.sourceStatus?.fomcMinutes ?? null
    },
    findings: [],
    failCount: 0,
    warningCount: 0,
    watchCount: 0,
    meta: {
      minutesDate: radarMinutesDate,
      minutesUrl: policyInput.minutesUrl || null,
      minutesHawkishTermCount: policyInput.minutesHawkishTermCount ?? null,
      minutesDovishTermCount: policyInput.minutesDovishTermCount ?? null,
      minutesTopicCounts: policyInput.minutesTopicCounts ?? null,
      minutesSummaryZh: summary ? summary : null,
      minutesSummaryToneTag: typeof summary === 'string' ? summary.slice(0, 64) : null,
      minutesSummaryHash: textHash(summary),
      status: policyInput.sourceStatus?.fomcMinutes || null
    }
  };
}

function buildReview(inputPath, outputPath, writeOutput, maxAgeHours, strict) {
  if (!existsSync(inputPath)) {
    throw new Error(`Input missing: ${inputPath}`);
  }
  const payload = JSON.parse(readFileSync(inputPath, 'utf8'));
  const policy = payload?.macroDrivers?.policyExpectations;
  const state = makeReviewHeader(
    { input: inputPath, output: outputPath },
    policy || {}
  );
  const minutesStatus = policy?.sourceStatus?.fomcMinutes;
  if (!policy || typeof policy !== 'object') {
    throw new Error('macroDrivers.policyExpectations missing or invalid.');
  }

  state.checks.toneAllowed = ALLOWED_TONES.has(policy.minutesPolicyTone);
  if (!state.checks.toneAllowed) {
    pushFinding(state, 'fail', 'policy_tone_unknown', `Unsupported minutesPolicyTone: ${policy.minutesPolicyTone}`);
  }

  if (!ALLOWED_STATUS.has(minutesStatus)) {
    pushFinding(state, 'fail', 'fomc_minutes_status_invalid', `policy.sourceStatus.fomcMinutes unsupported: ${String(minutesStatus)}`);
  }

  const hawkish = policy.minutesHawkishTermCount;
  const dovish = policy.minutesDovishTermCount;
  const topicCounts = policy.minutesTopicCounts;
  const minutesSummaryZh = policy.minutesSummaryZh;
  if (minutesStatus === 'live') {
    if (!isIsoDate(policy.minutesDate)) {
      pushFinding(state, 'fail', 'minutes_date_missing', 'minutesDate must be valid ISO when sourceStatus is live.');
    }
    if (!policy.minutesUrl || typeof policy.minutesUrl !== 'string') {
      pushFinding(state, 'fail', 'minutes_url_missing', 'minutesUrl must exist when sourceStatus is live.');
    }
  }

  if (typeof hawkish === 'number' || typeof dovish === 'number') {
    if (!Number.isFinite(hawkish) || !Number.isInteger(hawkish) || hawkish < 0
      || !Number.isFinite(dovish) || !Number.isInteger(dovish) || dovish < 0) {
      pushFinding(state, 'fail', 'minutes_term_count_invalid', 'minutesHawkishTermCount and minutesDovishTermCount must be finite non-negative integers.');
    }
  }

  const expectedTone = toneFromCounts(hawkish, dovish);
  if (expectedTone && state.checks.toneAllowed) {
    state.checks.toneConsistentWithCounts = expectedTone;
    if (policy.minutesPolicyTone !== expectedTone) {
      pushFinding(
        state,
        'fail',
        'tone_count_mismatch',
        `minutesPolicyTone (${policy.minutesPolicyTone}) inconsistent with hawkish/dovish counts (${hawkish}, ${dovish}).`
      );
    }
  } else if (policy.minutesPolicyTone && policy.minutesPolicyTone !== '未知') {
    pushFinding(state, 'warn', 'tone_mismatch_degraded', 'Could not validate tone consistency due to non-finite counts.');
  }

  if (topicCounts === null) {
    if (minutesStatus === 'live' || minutesStatus === 'fallback') {
      pushFinding(
        state,
        'fail',
        'minutes_topic_counts_missing',
        'minutesTopicCounts should be present when sourceStatus is live/fallback.'
      );
    }
  } else {
    if (!isValidTopicCounts(topicCounts)) {
      pushFinding(state, 'fail', 'minutes_topic_counts_invalid', 'minutesTopicCounts must be non-negative integer count map with required keys.');
    }
    for (const key of TOPIC_KEYS) {
      if (!(key in (topicCounts || {}))) {
        pushFinding(state, 'fail', 'minutes_topic_counts_missing_key', `minutesTopicCounts missing key ${key}.`);
      }
    }
    state.checks.summaryContainsTopics = typeof topicCounts === 'object' && !Array.isArray(topicCounts);
  }

  if (minutesSummaryZh === null) {
    if (minutesStatus === 'live' || minutesStatus === 'fallback') {
      pushFinding(
        state,
        'warn',
        'minutes_summary_missing',
        'minutesSummaryZh missing while sourceStatus is live/fallback; review context may be incomplete.'
      );
    }
  } else if (typeof minutesSummaryZh !== 'string') {
    pushFinding(state, 'fail', 'minutes_summary_invalid_type', 'minutesSummaryZh must be string or null.');
  } else {
    const containsTone = new RegExp(`语气\\s*${policy.minutesPolicyTone}`).test(minutesSummaryZh);
    const containsTopicHeader = minutesSummaryZh.includes('高频主题');
    state.checks.summaryContainsTone = containsTone;
    state.checks.summaryContainsTopics = containsTopicHeader;
    if (!minutesSummaryZh.startsWith('FOMC minutes keyword NLP 显示语气')) {
      pushFinding(
        state,
        'warn',
        'minutes_summary_format',
        'minutesSummaryZh should follow the expected template prefix.'
      );
    }
    if (!containsTone) {
      pushFinding(state, 'warn', 'minutes_summary_tone_mismatch', 'minutesSummaryZh does not repeat current minutesPolicyTone token.');
    }
    if (!containsTopicHeader) {
      pushFinding(state, 'warn', 'minutes_summary_topic_header_missing', 'minutesSummaryZh should include 高频主题.');
    }
    for (const phrase of FORBIDDEN_PHRASES) {
      if (phrase.test(minutesSummaryZh)) {
        pushFinding(state, 'warn', 'minutes_summary_forbidden_phrase', `minutesSummaryZh contains restricted phrase: ${phrase.source}`);
        break;
      }
    }
    if (minutesSummaryZh.length > 500) {
      pushFinding(state, 'watch', 'minutes_summary_unusually_long', 'minutesSummaryZh is unexpectedly long for keyword-only summary.');
    }
    const topTopicString = topTopics(topicCounts);
    if (topTopicString !== '待确认' && typeof minutesSummaryZh === 'string' && !topTopicString.split(' / ').every((entry) => minutesSummaryZh.includes(entry))) {
      pushFinding(state, 'watch', 'minutes_summary_topic_mismatch', 'minutesSummaryZh may not reflect current top topic counts.');
    }
  }

  const minutesAgeHours = ageHours(policy.minutesDate);
  if (minutesAgeHours !== null) {
    state.meta.ageHours = minutesAgeHours;
    if (minutesAgeHours < 0) {
      pushFinding(
        state,
        'warn',
        'minutes_date_future',
        `minutesDate appears in the future by ${Math.abs(minutesAgeHours).toFixed(2)}h.`
      );
    } else if (minutesAgeHours > maxAgeHours) {
      pushFinding(
        state,
        'watch',
        'minutes_stale',
        `minutesDate is stale: ${minutesAgeHours}h > ${maxAgeHours}h.`
      );
    }
  } else if (policy.minutesDate !== null && policy.minutesDate !== undefined) {
    pushFinding(state, 'fail', 'minutes_date_invalid', `minutesDate is invalid: ${policy.minutesDate}`);
  }

  const status = state.findings.some((f) => f.severity === 'fail') ? 'fail'
    : state.findings.some((f) => f.severity === 'warn') ? 'warn'
      : state.findings.some((f) => f.severity === 'watch') ? 'watch'
        : 'pass';
  state.status = status;

  if (writeOutput) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  if (status === 'pass') {
    console.log(`FOMC minutes tone quality review: PASS (${state.findings.length} findings).`);
  } else {
    const summary = state.findings.map((finding) => `[${finding.severity}] ${finding.code}`).join('; ');
    console.log(`FOMC minutes tone quality review: ${status.toUpperCase()} — ${summary}`);
  }

  return state;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = safeRelativePath(options.input) || options.input;
  const outputPath = options.output;
  const review = buildReview(
    inputPath,
    outputPath,
    options.writeOutput,
    options.maxAgeHours,
    options.strict
  );
  if (options.printJson) {
    console.log(JSON.stringify(review, null, 2));
  }
  const shouldFail = options.strict
    ? review.status !== 'pass'
    : review.findings.some((finding) => finding.severity === 'fail');
  if (shouldFail) process.exit(1);
}

main();
