#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function readText(file) {
  return fs.readFileSync(path.resolve(file), 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

const failures = [];

function fail(message) {
  failures.push(message);
}

function includesAll(array, expected, label) {
  for (const item of expected) {
    if (!Array.isArray(array) || !array.includes(item)) fail(`${label} missing ${item}`);
  }
}

const policy = readJson('config/main-score-source-policy.json');
const packageJson = readJson('package.json');
const auditScript = readText('scripts/audit-main-score-backtest.mjs');
const runDailyScript = readText('scripts/run-daily-pipeline.mjs');
const validateDataScript = readText('scripts/validate-data.mjs');
const dailyWorkflow = readText('.github/workflows/build-daily-radar-data.yml');
const dataContract = readText('docs/DATA_CONTRACT.md');
const dataSources = readText('docs/DATA_SOURCES.md');
const adr = readText('docs/ADR/0017-main-score-wind-fallback-policy.md');
const adrIndex = readText('docs/ADR/README.md');

const expectedInputs = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y', 'breakeven10y', 'spx'];

if (policy.contractVersion !== 'main-score-source-policy-v1') fail('policy contractVersion must be main-score-source-policy-v1');
includesAll(policy.coreScoreInputs, expectedInputs, 'policy.coreScoreInputs');
includesAll(policy.windPaidFallback?.eligibleInputs, expectedInputs, 'policy.windPaidFallback.eligibleInputs');
if (policy.windPaidFallback?.participatesInMainScore !== true) fail('Wind fallback must be explicitly allowed to participate in main score');

const activationRules = (policy.windPaidFallback?.activationRules || []).join('\n');
for (const marker of [
  'must not replace a fresh official or existing public primary source',
  'public primary chain is unavailable, stale, structurally blocked, or explicitly degraded',
  'sourceMode=wind_paid_fallback',
  'sourceConflictAudit'
]) {
  if (!activationRules.includes(marker)) fail(`activationRules missing marker: ${marker}`);
}
if (!Number.isFinite(policy.windPaidFallback?.scoreImpactGuards?.maxAutomaticScoreDeltaWithoutReview)) {
  fail('scoreImpactGuards.maxAutomaticScoreDeltaWithoutReview must be numeric');
}
if (policy.windPaidFallback?.scoreImpactGuards?.tailOverlaySwitchRequiresConfirmation !== true) {
  fail('scoreImpactGuards.tailOverlaySwitchRequiresConfirmation must be true');
}
if (policy.windPaidFallback?.scoreImpactGuards?.riskTierDowngradeRequiresConfirmationFrom !== 'yellow') {
  fail('scoreImpactGuards.riskTierDowngradeRequiresConfirmationFrom must be yellow');
}

const runtimeFallback = policy.runtimeFallback || {};
if (runtimeFallback.mode !== 'wind_paid_invalid_leaf_fallback_v1') fail('runtimeFallback.mode must be wind_paid_invalid_leaf_fallback_v1');
if (runtimeFallback.enabledEnvVar !== 'GFRR_MAIN_SCORE_WIND_FALLBACK') fail('runtimeFallback.enabledEnvVar must be GFRR_MAIN_SCORE_WIND_FALLBACK');
if (runtimeFallback.requiresSecret !== 'WIND_API_KEY') fail('runtimeFallback.requiresSecret must be WIND_API_KEY');
if (runtimeFallback.doesNotBypassRealtimeTrustGate !== true) fail('runtimeFallback must not bypass realtime trust gate');
if (runtimeFallback.doesNotOverrideFinitePublicPrimary !== true) fail('runtimeFallback must not override finite public primary');
if (runtimeFallback.rawWindResponsePersisted !== false) fail('runtimeFallback.rawWindResponsePersisted must be false');
includesAll(runtimeFallback.eligibleWhen, ['current_value_missing_or_nonfinite', 'source_detail_not_ok', 'source_status_missing_or_fallback'], 'runtimeFallback.eligibleWhen');

for (const key of expectedInputs) {
  if (!policy.windPaidFallback?.plausibilityRanges?.[key]) fail(`plausibilityRanges missing ${key}`);
}

const replay = policy.replayValidation || {};
if (replay.method !== 'wind_fallback_conflict_replay_v1') fail('replayValidation.method must be wind_fallback_conflict_replay_v1');
if (replay.eventWindowsMustPass !== true) fail('replayValidation.eventWindowsMustPass must be true');
if (!Array.isArray(replay.stressScenarios) || replay.stressScenarios.length < 3) fail('replayValidation must define at least 3 stress scenarios');
for (const key of ['p95AbsScoreDeltaMax', 'maxAbsScoreDeltaMax', 'tierFlipPctMax', 'calmWindowAvgAbsDeltaMax', 'guardedSwitchPctMax']) {
  if (!Number.isFinite(replay.passThresholds?.[key])) fail(`replayValidation.passThresholds missing numeric ${key}`);
}

for (const marker of [
  'SOURCE_POLICY_PATH',
  'buildWindFallbackPolicyReplay',
  'sourceConflictArbitration',
  'windFallbackPolicy',
  'scoreImpactGuards',
  'rawConflictStress',
  'wind_fallback_conflict_replay_v1',
  'Wind fallback replay is a deterministic conflict-stress simulation'
]) {
  if (!auditScript.includes(marker)) fail(`audit-main-score-backtest missing marker: ${marker}`);
}

for (const marker of [
  'MAIN_SCORE_WIND_FALLBACK_ENV',
  'GFRR_MAIN_SCORE_WIND_FALLBACK',
  'WIND_API_KEY',
  'resolveMainScoreRuntimeSource',
  'wind_paid_invalid_leaf_fallback_v1',
  'doesNotBypassRealtimeTrustGate',
  'doesNotOverrideFinitePublicPrimary',
  'mainScoreSourcePolicy',
  'sourceConflictAudit',
  'paidWindFallback: true',
  'participatesInMainScore: true',
  "sourceMode: 'wind_paid_fallback'",
  'cloneRealtimeWithWindInput',
  'canUseRealtimePayloadValues(realtimePayload)',
  'no_labeled_plausible_timestamped_value',
  'score_delta_exceeds_guard',
  'review_required'
]) {
  if (!runDailyScript.includes(marker)) fail(`run-daily-pipeline missing runtime marker: ${marker}`);
}

for (const marker of [
  'validateMainScoreSourcePolicy',
  'MAIN_SCORE_SOURCE_POLICY_STATUSES',
  'wind_paid_invalid_leaf_fallback_v1',
  'GFRR_MAIN_SCORE_WIND_FALLBACK',
  'doesNotBypassRealtimeTrustGate',
  'doesNotOverrideFinitePublicPrimary',
  'sourceConflictAudit',
  'mainScoreSourcePolicy must not include raw secret/header marker'
]) {
  if (!validateDataScript.includes(marker)) fail(`validate-data missing marker: ${marker}`);
}

for (const marker of [
  'WIND_API_KEY: ${{ secrets.WIND_API_KEY }}',
  'GFRR_MAIN_SCORE_WIND_FALLBACK: "1"',
  'npm run build:data'
]) {
  if (!dailyWorkflow.includes(marker)) fail(`build-daily-radar-data workflow missing marker: ${marker}`);
}

if (!packageJson.scripts?.['audit:main-score-backtest']?.includes('scripts/audit-main-score-backtest.mjs')) {
  fail('package.json audit:main-score-backtest must run scripts/audit-main-score-backtest.mjs');
}
if (!packageJson.scripts?.['check:main-score-wind-fallback']?.includes('check-main-score-wind-fallback-contract.mjs')) {
  fail('package.json missing check:main-score-wind-fallback script');
}
if (!packageJson.scripts?.['check:all']?.includes('check:main-score-wind-fallback')) {
  fail('package.json check:all must include check:main-score-wind-fallback');
}

for (const marker of [
  '## 主分数 Wind paid fallback 契约',
  'main-score-source-policy-v1',
  'participatesInMainScore=true',
  'sourceConflictAudit',
  'mainScoreSourcePolicy',
  'wind_paid_invalid_leaf_fallback_v1',
  '分数影响守门',
  'wind_fallback_conflict_replay_v1'
]) {
  if (!dataContract.includes(marker)) fail(`DATA_CONTRACT.md missing marker: ${marker}`);
}

for (const marker of [
  '### GFRR 主雷达核心分数 Wind paid fallback 源策略',
  'config/main-score-source-policy.json',
  'Wind 兜底成功可以进入 GFRR 主雷达核心分数',
  'fresh official/public primary',
  'GFRR_MAIN_SCORE_WIND_FALLBACK=1',
  'WIND_API_KEY',
  'wind_paid_invalid_leaf_fallback_v1'
]) {
  if (!dataSources.includes(marker)) fail(`DATA_SOURCES.md missing marker: ${marker}`);
}

for (const marker of [
  '# ADR-0017: Wind paid fallback may enter main radar scoring only through source arbitration and replay gates',
  'Accepted',
  'config/main-score-source-policy.json',
  'wind_fallback_conflict_replay_v1',
  'wind_paid_invalid_leaf_fallback_v1'
]) {
  if (!adr.includes(marker)) fail(`ADR-0017 missing marker: ${marker}`);
}
if (!adrIndex.includes('[ADR-0017](0017-main-score-wind-fallback-policy.md)')) {
  fail('ADR README missing ADR-0017 index row');
}

if (failures.length) {
  console.error('[check-main-score-wind-fallback-contract] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-main-score-wind-fallback-contract] PASS');
