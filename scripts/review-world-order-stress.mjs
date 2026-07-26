#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { safeRelativePath } from './lib/check-script-helpers.mjs';

export const REVIEW_SCHEMA = 'world-order-source-health-consistency-review-v1';
export const SOURCE_KEYS = ['gdelt', 'ofac', 'sipri', 'acled'];

const DEFAULT_INPUT = 'data/world-order-stress.json';
const ALLOWED_SOURCE_STATUSES = Object.freeze({
  gdelt: new Set(['ok', 'partial', 'stale', 'error', 'not_configured', 'disabled']),
  ofac: new Set(['ok', 'error', 'disabled']),
  sipri: new Set(['ok', 'stale', 'error', 'manual_required', 'disabled']),
  acled: new Set(['ok', 'partial', 'error', 'manual_required', 'not_configured', 'disabled'])
});
const ALLOWED_RISK_BIASES = new Set(['neutral', 'upward']);
const UNSAFE_NARRATIVE_PATTERNS = [
  /世界大战.{0,8}(?:即将|必然|确定|概率)/iu,
  /战争.{0,8}(?:已确认|即将爆发|必然发生|概率)/iu,
  /(?:买入|卖出|加仓|减仓|持仓|仓位|止损|止盈|交易指令|必须行动|建议配置)/iu,
  /\b(?:scoring|decisionModel|executionLock|positionGuidance|action queue|trigger monitor|invalidation rules)\b/iu
];
const BOUNDARY = Object.freeze({
  auditOnly: true,
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
  npm run review:world-order -- [input.json] [options]

Options:
  --input <path>  World Order JSON input. Default: ${DEFAULT_INPUT}
  --strict        Exit non-zero on WATCH as well as FAIL.
  --json          Print the full JSON review.
  --help          Show this help.

This helper is offline and read-only. It never refreshes sources or writes artifacts.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    strict: false,
    printJson: false
  };
  let positionalInputSeen = false;
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
    if (arg === '--input') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --input');
      options.input = value;
      positionalInputSeen = true;
      index += 1;
      continue;
    }
    if (!arg.startsWith('--') && !positionalInputSeen) {
      options.input = arg;
      positionalInputSeen = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  const inputPath = safeRelativePath(options.input);
  const approved = inputPath && [
    'data/world-order-stress.json',
    'docs/fixtures/',
    'manual-artifacts/'
  ].some((prefix) => inputPath === prefix || inputPath.startsWith(prefix));
  if (!approved) throw new Error(`Refusing input outside approved paths: ${options.input}`);
  options.inputPath = inputPath;
  return options;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addFinding(findings, severity, code, message, action) {
  findings.push({ severity, code, message, action });
}

export function expectedFreshnessFromSources(externalSources) {
  const statuses = SOURCE_KEYS.map((key) => externalSources?.[key]?.status);
  if (statuses.every((status) => status === 'ok')) return 'fresh';
  const usableCount = statuses.filter((status) => ['ok', 'partial'].includes(status)).length;
  if (usableCount >= 1) return 'partial';
  if (statuses.includes('stale')) return 'stale';
  return 'error';
}

export function expectedSourceMode(freshness) {
  if (freshness === 'fresh') return 'computed_with_external_sources';
  if (freshness === 'partial' || freshness === 'stale') {
    return 'computed_with_partial_external_sources';
  }
  return 'computed_with_source_errors';
}

function validateCore(payload, findings) {
  if (!isObject(payload)) {
    addFinding(findings, 'fail', 'payload_invalid', 'Payload must be an object.', 'repair_world_order_contract');
    return false;
  }
  for (const key of [
    'sourceMode',
    'score',
    'state',
    'confidence',
    'freshness',
    'externalSources',
    'systemInterpretationZh',
    'decisionModifier',
    'warnings'
  ]) {
    if (!(key in payload)) {
      addFinding(findings, 'fail', 'core_field_missing', `Missing required field: ${key}.`, 'repair_world_order_contract');
    }
  }
  if (!Number.isFinite(payload.score) || payload.score < 0 || payload.score > 100) {
    addFinding(findings, 'fail', 'score_invalid', 'score must be within 0-100.', 'repair_world_order_contract');
  }
  if (!Number.isFinite(payload.confidence) || payload.confidence < 0 || payload.confidence > 1) {
    addFinding(findings, 'fail', 'confidence_invalid', 'confidence must be within 0-1.', 'repair_world_order_contract');
  }
  if (!isObject(payload.externalSources)) {
    addFinding(findings, 'fail', 'external_sources_invalid', 'externalSources must be an object.', 'repair_world_order_contract');
    return false;
  }
  return true;
}

function sourceAction(sourceKey, status) {
  if (sourceKey === 'acled' && ['manual_required', 'not_configured'].includes(status)) {
    return 'download_acled_weekly_monthly_xlsx_then_run_sanitizers';
  }
  if (sourceKey === 'sipri' && status === 'manual_required') {
    return 'import_real_sipri_normalized_data';
  }
  if (sourceKey === 'gdelt' && status === 'not_configured') {
    return 'review_gdelt_configuration_and_cache_state';
  }
  if (status === 'disabled') return `confirm_${sourceKey}_disabled_intentionally`;
  return `inspect_${sourceKey}_source_health`;
}

function validateSources(payload, findings) {
  for (const sourceKey of SOURCE_KEYS) {
    const source = payload.externalSources?.[sourceKey];
    if (!isObject(source)) {
      addFinding(findings, 'fail', 'source_missing', `${sourceKey} source is missing.`, 'repair_world_order_contract');
      continue;
    }
    const status = source.status;
    if (!ALLOWED_SOURCE_STATUSES[sourceKey].has(status)) {
      addFinding(
        findings,
        'fail',
        'source_status_invalid',
        `${sourceKey} status is unsupported: ${String(status)}.`,
        'repair_world_order_contract'
      );
      continue;
    }
    if (source.lastFetchedAt !== null && source.lastFetchedAt !== undefined) {
      if (!Number.isFinite(Date.parse(source.lastFetchedAt))) {
        addFinding(
          findings,
          'fail',
          'source_timestamp_invalid',
          `${sourceKey} lastFetchedAt is not a parseable timestamp.`,
          'repair_world_order_contract'
        );
      }
    }
    if (status !== 'ok') {
      addFinding(
        findings,
        'watch',
        `${sourceKey}_source_${status}`,
        `${sourceKey} source status is ${status}.`,
        sourceAction(sourceKey, status)
      );
    }
  }
}

function validateAggregateState(payload, findings) {
  const expectedFreshness = expectedFreshnessFromSources(payload.externalSources);
  if (payload.freshness !== expectedFreshness) {
    addFinding(
      findings,
      'fail',
      'freshness_source_status_mismatch',
      `freshness is ${String(payload.freshness)} but source statuses require ${expectedFreshness}.`,
      'repair_world_order_aggregate_contract'
    );
  }
  const expectedMode = expectedSourceMode(expectedFreshness);
  if (payload.sourceMode !== expectedMode) {
    addFinding(
      findings,
      'fail',
      'source_mode_freshness_mismatch',
      `sourceMode is ${String(payload.sourceMode)} but freshness requires ${expectedMode}.`,
      'repair_world_order_aggregate_contract'
    );
  }
  if (expectedFreshness !== 'fresh' && Number(payload.confidence) >= 0.85) {
    addFinding(
      findings,
      'watch',
      'degraded_sources_high_confidence',
      `Aggregate confidence is ${Math.round(Number(payload.confidence) * 100)}% while freshness is ${expectedFreshness}.`,
      'review_degraded_source_confidence_and_copy'
    );
  }
}

function validateNarrativeBoundary(payload, findings) {
  const interpretation = String(payload.systemInterpretationZh || '');
  const modifier = payload.decisionModifier;
  if (!interpretation.includes('结构性风险')) {
    addFinding(
      findings,
      'fail',
      'interpretation_boundary_missing',
      'systemInterpretationZh must identify this as structural-risk interpretation.',
      'repair_world_order_narrative_boundary'
    );
  }
  if (!isObject(modifier)) {
    addFinding(findings, 'fail', 'decision_modifier_invalid', 'decisionModifier must be an object.', 'repair_world_order_contract');
    return;
  }
  if (typeof modifier.enabled !== 'boolean') {
    addFinding(findings, 'fail', 'decision_modifier_enabled_invalid', 'decisionModifier.enabled must be boolean.', 'repair_world_order_contract');
  }
  if (!ALLOWED_RISK_BIASES.has(modifier.riskBias)) {
    addFinding(findings, 'fail', 'decision_modifier_bias_invalid', 'decisionModifier.riskBias must be neutral or upward.', 'repair_world_order_contract');
  }
  if (!Number.isInteger(modifier.maxStateBoost) || modifier.maxStateBoost < 0 || modifier.maxStateBoost > 1) {
    addFinding(findings, 'fail', 'decision_modifier_boost_invalid', 'decisionModifier.maxStateBoost must be integer 0 or 1.', 'repair_world_order_contract');
  }
  const appliesWhen = String(modifier.appliesWhen || '');
  if (!appliesWhen.includes('未来') || !appliesWhen.includes('参考')) {
    addFinding(
      findings,
      'fail',
      'decision_modifier_reference_boundary_missing',
      'decisionModifier.appliesWhen must preserve future-reference-only wording.',
      'repair_world_order_narrative_boundary'
    );
  }
  const narrativeText = `${interpretation}\n${appliesWhen}`;
  if (UNSAFE_NARRATIVE_PATTERNS.some((pattern) => pattern.test(narrativeText))) {
    addFinding(
      findings,
      'fail',
      'unsafe_prediction_or_action_language',
      'World Order narrative contains prediction, action, or decision-engine language.',
      'repair_world_order_narrative_boundary'
    );
  }
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];
  if (!warnings.some((warning) => warning.includes('不构成战争预测或投资建议'))) {
    addFinding(
      findings,
      'fail',
      'required_disclaimer_missing',
      'Required no-war-prediction/no-investment-advice disclaimer is missing.',
      'repair_world_order_narrative_boundary'
    );
  }
}

export function reviewWorldOrderStress(payload, { inputPath = DEFAULT_INPUT } = {}) {
  const findings = [];
  if (validateCore(payload, findings)) {
    validateSources(payload, findings);
    validateAggregateState(payload, findings);
    validateNarrativeBoundary(payload, findings);
  }
  const failCount = findings.filter((finding) => finding.severity === 'fail').length;
  const watchCount = findings.filter((finding) => finding.severity === 'watch').length;
  const status = failCount > 0 ? 'FAIL' : watchCount > 0 ? 'WARN' : 'PASS';
  return {
    schemaVersion: REVIEW_SCHEMA,
    inputPath: safeRelativePath(inputPath) || inputPath,
    boundary: { ...BOUNDARY },
    review: {
      status,
      observedFreshness: payload?.freshness ?? null,
      expectedFreshness: isObject(payload?.externalSources)
        ? expectedFreshnessFromSources(payload.externalSources)
        : null,
      observedSourceMode: payload?.sourceMode ?? null,
      expectedSourceMode: isObject(payload?.externalSources)
        ? expectedSourceMode(expectedFreshnessFromSources(payload.externalSources))
        : null,
      confidence: Number.isFinite(payload?.confidence) ? payload.confidence : null,
      sourceStatuses: Object.fromEntries(
        SOURCE_KEYS.map((key) => [key, payload?.externalSources?.[key]?.status ?? 'missing'])
      ),
      findings
    },
    summary: {
      failCount,
      watchCount,
      actions: [...new Set(findings.map((finding) => finding.action).filter(Boolean))],
      recommendation: status === 'PASS'
        ? 'keep_current_overlay_only_contract'
        : status === 'WARN'
          ? 'inspect_degraded_sources_keep_overlay_only'
          : 'fix_contract_or_narrative_mismatch_before_refresh'
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(readFileSync(resolve(options.input), 'utf8'));
  const report = reviewWorldOrderStress(payload, { inputPath: options.input });
  if (options.printJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('World Order Stress Source Health Review');
    console.log(`Result: ${report.review.status}`);
    console.log(`freshness: ${report.review.observedFreshness} (expected ${report.review.expectedFreshness})`);
    console.log(`sourceMode: ${report.review.observedSourceMode} (expected ${report.review.expectedSourceMode})`);
    console.log(`confidence: ${Number.isFinite(report.review.confidence) ? `${Math.round(report.review.confidence * 100)}%` : 'null'}`);
    console.log(`sources: ${SOURCE_KEYS.map((key) => `${key}=${report.review.sourceStatuses[key]}`).join(', ')}`);
    console.log('Findings');
    if (report.review.findings.length === 0) console.log('- none');
    for (const finding of report.review.findings) {
      console.log(`- [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`);
    }
    console.log('Suggested action');
    if (report.summary.actions.length === 0) console.log('- No action needed');
    for (const action of report.summary.actions) console.log(`- ${action}`);
  }
  if (report.review.status === 'FAIL' || (options.strict && report.review.status === 'WARN')) {
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`World Order Stress source health review failed: ${error.message}`);
    process.exitCode = 1;
  });
}
