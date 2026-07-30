#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildVerdictManualAction,
  buildVerdictTrend,
  classifyVerdictMonitorStatus,
  MONITOR_VERSION,
  summarizeOdpArtifact,
  verdictFamily
} from './oil-directional/monitor-oil-directional-verdict-history.mjs';

const MONITOR_PATH = 'scripts/oil-directional/monitor-oil-directional-verdict-history.mjs';
const WORKFLOW_PATH = '.github/workflows/oil-directional-verdict-history-monitor.yml';
const DOC_PATH = 'docs/OIL_DIRECTIONAL_VERDICT_HISTORY_MONITOR.md';
const failures = [];

function read(path) {
  return readFileSync(resolve(path), 'utf8');
}

function parseJson(path) {
  return JSON.parse(read(path));
}

function requireValue(condition, message) {
  if (!condition) failures.push(message);
}

function requireIncludes(text, marker, label) {
  requireValue(text.includes(marker), `${label} missing marker: ${marker}`);
}

function forbidIncludes(text, marker, label) {
  requireValue(!text.includes(marker), `${label} must not include marker: ${marker}`);
}

function sample(finalBias, physicalBias = finalBias, overrides = {}) {
  return {
    commitHash: overrides.commitHash ?? finalBias,
    committedAt: overrides.committedAt ?? '2026-07-29T00:00:00.000Z',
    finalBias,
    verdictFamily: verdictFamily(finalBias),
    physicalBias,
    divergence: overrides.divergence ?? (finalBias === physicalBias ? 'none' : finalBias),
    divergenceActive: overrides.divergenceActive ?? (finalBias !== physicalBias),
    confidence: overrides.confidence ?? 'low',
    dataSufficiency: overrides.dataSufficiency ?? 'full',
    degradedEvidenceCount: overrides.degradedEvidenceCount ?? 0,
    maxEvidenceAgeDays: overrides.maxEvidenceAgeDays ?? 4,
    globalOverlay: { effect: overrides.overlayEffect ?? 'neutral' }
  };
}

function assertBehavior() {
  const live = parseJson('data/oil-directional-pressure.json');
  const summarized = summarizeOdpArtifact(live, {
    hash: 'a'.repeat(40),
    committedAt: '2026-07-29T00:00:00.000Z',
    subject: 'fixture'
  });
  requireValue(summarized.finalBias === live.finalBias, 'live summary finalBias mismatch');
  requireValue(summarized.physicalBias === live.interpretation.physicalBias, 'live summary physicalBias mismatch');
  requireValue(summarized.evidenceCount === Object.keys(live.evidence).length, 'live summary evidence count mismatch');
  requireValue(Number.isFinite(summarized.maxEvidenceAgeDays), 'live summary max evidence age missing');

  const stableTrend = buildVerdictTrend([
    sample('moderate_bullish'),
    sample('moderate_bullish'),
    sample('moderate_bullish')
  ]);
  requireValue(stableTrend.currentVerdictStreak === 3, 'stable trend streak mismatch');
  requireValue(
    classifyVerdictMonitorStatus(stableTrend) === 'stable_current_verdict',
    'stable trend classification mismatch'
  );
  requireValue(stableTrend.persistentLowConfidence === false, 'short low-confidence run must not be persistent');

  const persistentLowConfidenceTrend = buildVerdictTrend(
    Array.from({ length: 7 }, () => sample('moderate_bullish'))
  );
  requireValue(
    persistentLowConfidenceTrend.recentLowConfidenceCount === 7,
    'persistent low-confidence count mismatch'
  );
  requireValue(
    persistentLowConfidenceTrend.persistentLowConfidence === true,
    'seven recent low-confidence samples must activate the observation'
  );
  requireValue(
    classifyVerdictMonitorStatus(persistentLowConfidenceTrend) === 'stable_current_verdict',
    'persistent low confidence must not replace the primary monitor status'
  );
  const persistentManualAction = buildVerdictManualAction(
    'stable_current_verdict',
    persistentLowConfidenceTrend
  );
  requireValue(
    persistentManualAction.requiredNow === false,
    'persistent low confidence alone must not require immediate action'
  );
  requireValue(
    persistentManualAction.suggestedNow === true,
    'persistent low confidence must suggest manual review'
  );
  requireValue(
    persistentManualAction.recommendation
      === 'review_existing_confidence_caps_without_changing_classifier',
    'persistent low-confidence recommendation mismatch'
  );

  const mixedConfidenceTrend = buildVerdictTrend([
    ...Array.from({ length: 6 }, () => sample('moderate_bullish')),
    sample('moderate_bullish', 'moderate_bullish', { confidence: 'medium' })
  ]);
  requireValue(
    mixedConfidenceTrend.persistentLowConfidence === false,
    'mixed recent confidence must not activate the persistent observation'
  );

  const divergenceTrend = buildVerdictTrend([
    sample('false_down_physical_stress', 'moderate_bullish'),
    sample('moderate_bullish')
  ]);
  requireValue(
    classifyVerdictMonitorStatus(divergenceTrend) === 'watch_active_price_physical_divergence',
    'active divergence classification mismatch'
  );

  const churnTrend = buildVerdictTrend([
    sample('moderate_bullish'),
    sample('false_down_physical_stress', 'moderate_bullish'),
    sample('moderate_bullish'),
    sample('false_down_physical_stress', 'moderate_bullish')
  ]);
  requireValue(churnTrend.recentVerdictTransitionCount === 3, 'recent verdict transition count mismatch');
  requireValue(
    classifyVerdictMonitorStatus(churnTrend) === 'watch_recent_verdict_churn',
    'recent churn classification mismatch'
  );

  const degradedTrend = buildVerdictTrend([
    sample('moderate_bullish', 'moderate_bullish', { degradedEvidenceCount: 1 })
  ]);
  requireValue(
    classifyVerdictMonitorStatus(degradedTrend) === 'watch_latest_evidence_degraded',
    'degraded evidence classification mismatch'
  );

  const insufficientTrend = buildVerdictTrend([
    sample('insufficient_data', 'insufficient_data', { dataSufficiency: 'insufficient' })
  ]);
  requireValue(
    classifyVerdictMonitorStatus(insufficientTrend) === 'watch_latest_data_insufficient',
    'insufficient-data classification mismatch'
  );
}

function assertDryRun() {
  const output = execFileSync(process.execPath, [
    MONITOR_PATH,
    '--dry-run',
    '--no-output',
    '--max-commits',
    '40',
    '--max-samples',
    '20',
    '--json'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true
  });
  const result = JSON.parse(output);
  requireValue(result.monitorVersion === MONITOR_VERSION, 'dry-run monitor version mismatch');
  requireValue(result.artifactOnly === true, 'dry-run must be artifact-only');
  requireValue(result.productionDataWriteApproved === false, 'dry-run must not approve production writes');
  requireValue(result.trend?.sampleCount >= 10, 'dry-run must read sufficient current git history');
  requireValue(result.trend?.latest?.commitHash, 'dry-run latest history sample missing');
  requireValue(result.input?.gitPath === 'data/oil-directional-pressure.json', 'dry-run git path mismatch');
  requireValue(result.productionImpact?.calculatesNewVerdict === false, 'dry-run must not calculate a new verdict');
  requireValue(result.productionImpact?.calculatesNewScore === false, 'dry-run must not calculate a new score');
  requireValue(result.artifacts?.outputPath === null, 'dry-run must not expose an output path');
  const confidenceObservation = result.observations?.persistentLowConfidence;
  requireValue(
    typeof confidenceObservation?.active === 'boolean',
    'dry-run persistent-low-confidence active flag missing'
  );
  requireValue(
    confidenceObservation?.changesPrimaryStatus === false,
    'low-confidence observation must not change the primary status'
  );
  requireValue(
    result.manualAction?.suggestedNow === confidenceObservation?.active,
    'dry-run suggestion must follow the persistent-low-confidence observation'
  );
}

function assertStaticBoundaries() {
  const monitor = read(MONITOR_PATH);
  const workflow = read(WORKFLOW_PATH);
  const packageJson = parseJson('package.json');
  const suite = read('scripts/check-suite.mjs');
  const docs = read(DOC_PATH);

  for (const marker of [
    "export const MONITOR_VERSION = 'oil-directional-verdict-history-monitor-p66'",
    'git_show_history',
    'function readJsonAtCommit',
    'function createMonitorResult',
    'persistentLowConfidence',
    'changesPrimaryStatus: false',
    'buildVerdictManualAction',
    'Recommendation:',
    'calculatesNewVerdict: false',
    'calculatesNewScore: false',
    'artifact-only ODP verdict history and drift monitor'
  ]) {
    requireIncludes(monitor, marker, MONITOR_PATH);
  }
  for (const marker of [
    'fetch(',
    'process.env.EIA_API_KEY',
    'writeFileSync(ODP_PATH',
    'npm run build:oil-directional'
  ]) {
    forbidIncludes(monitor, marker, MONITOR_PATH);
  }
  for (const marker of [
    'name: Oil Directional Verdict History Monitor',
    "cron: '29 1 * * *'",
    'permissions:',
    'contents: read',
    'fetch-depth: 0',
    'npm run monitor:oil-directional-verdict-history -- --github-summary',
    'oil-directional-verdict-history-monitor',
    'retention-days: 30'
  ]) {
    requireIncludes(workflow, marker, WORKFLOW_PATH);
  }
  for (const marker of [
    'contents: write',
    'git push',
    'git commit',
    'secrets.',
    'npm run build:oil-directional',
    'data/oil-directional-pressure.json',
    'data/radar-data.json',
    'realtime/market.json'
  ]) {
    forbidIncludes(workflow, marker, WORKFLOW_PATH);
  }
  requireValue(packageJson.scripts['monitor:oil-directional-verdict-history'], 'package monitor script missing');
  requireValue(packageJson.scripts['check:oil-directional-verdict-history-monitor'], 'package check script missing');
  requireValue(packageJson.scripts['check:all']?.includes('check:oil-directional'), 'check:all missing ODP suite');
  requireIncludes(suite, 'check:oil-directional-verdict-history-monitor', 'scripts/check-suite.mjs');
  for (const marker of [
    'oil-directional-verdict-history-monitor-p66',
    'git history only',
    'persistentLowConfidence',
    'productionDataWriteApproved=false',
    'calculatesNewVerdict=false',
    'calculatesNewScore=false'
  ]) {
    requireIncludes(docs, marker, DOC_PATH);
  }
  for (const path of [
    'data/oil-directional-pressure.json',
    'data/radar-data.json',
    'scripts/oil-directional/build-oil-directional-pressure.mjs',
    'scripts/modules/decision.js',
    'scripts/modules/buildCrossValidationMatrix.js'
  ]) {
    forbidIncludes(read(path), 'oil-directional-verdict-history-monitor-p66', path);
  }
}

assertBehavior();
assertDryRun();
assertStaticBoundaries();

if (failures.length) {
  console.error('ODP verdict history monitor contract: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('ODP verdict history monitor contract: PASS');
