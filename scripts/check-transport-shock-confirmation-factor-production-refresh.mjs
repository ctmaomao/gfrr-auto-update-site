import fs from 'node:fs';

import {
  MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES,
  TRANSPORT_SHOCK_CANDIDATE_WRITER_MARKER,
  runTransportShockRefreshHistorySelfTests,
  summarizeMissingCandidateRefreshHistory
} from './transport-shock-refresh-history.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');
const parseJson = (path) => JSON.parse(read(path));

const CONTRACT_VERSION = 'transport-shock-candidate-v1';
const failures = [];

function fail(message) {
  failures.push(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumberOrNull(value) {
  return value === null || Number.isFinite(value);
}

function requireMarker(text, marker, file) {
  if (!text.includes(marker)) fail(`${file} missing marker: ${marker}`);
}

function forbidMarker(text, marker, file) {
  if (text.includes(marker)) fail(`${file} must not include marker: ${marker}`);
}

function validateWriterPath() {
  const daily = read('scripts/run-daily-pipeline.mjs');
  for (const marker of [
    "const ENERGY_TRANSPORT_SHOCK_CANDIDATE_CONTRACT_VERSION = 'transport-shock-candidate-v1'",
    'function buildEnergyTransportShockCandidate',
    'function buildMissingEnergyTransportShockCandidate',
    TRANSPORT_SHOCK_CANDIDATE_WRITER_MARKER,
    "transportShockCandidate: buildEnergyTransportShockCandidate(previousChokepoints, reroutingProxy, 'fallback')",
    'transportShockCandidate: buildMissingEnergyTransportShockCandidate(reason)',
    'eligibleForMainScore: false',
    "routeFreightConfirmation: 'not_connected'",
    "marketConfirmation: 'not_connected'"
  ]) {
    requireMarker(daily, marker, 'scripts/run-daily-pipeline.mjs');
  }
}

function validateNoScoreWiring() {
  for (const file of [
    'scripts/modules/buildCrossValidationMatrix.js',
    'data/oil-directional-pressure.json'
  ]) {
    const text = read(file);
    for (const marker of [
      'transportShockConfirmationFactorProductionRefresh',
      'transport-shock-confirmation-factor-production-refresh-v1',
      'candidate_present_verified'
    ]) {
      forbidMarker(text, marker, file);
    }
  }
}

function validateAuthorityDocs() {
  const docs = {
    dataSources: read('docs/DATA_SOURCES.md'),
    dataContract: read('docs/DATA_CONTRACT.md'),
    signalIntake: read('docs/SIGNAL_INTAKE.md'),
    backlog: read('docs/PROJECT_BACKLOG.md'),
    agents: read('AGENTS.md'),
    packageJson: read('package.json'),
    checkSuite: read('scripts/check-suite.mjs')
  };
  for (const [key, marker] of [
    ['dataSources', 'Transport Shock Confirmation Factor production refresh verification(P-score-8)'],
    ['dataContract', 'transport-shock-confirmation-factor-production-refresh-v1'],
    ['signalIntake', 'Transport Shock Confirmation Factor production refresh verification'],
    ['backlog', 'Transport Shock Confirmation Factor production refresh verification(2026-06-28,P-score-8 read-only)'],
    ['agents', 'Transport Shock Confirmation Factor production refresh verification 只是 P-score-8 只读核验层'],
    ['packageJson', 'check:transport-shock-confirmation-factor-production-refresh'],
    ['checkSuite', 'check:transport-shock-confirmation-factor-production-refresh']
  ]) {
    requireMarker(docs[key], marker, key);
  }
}

function validateCandidate(candidate) {
  if (!isPlainObject(candidate)) {
    fail('transportShockCandidate must be an object when present.');
    return;
  }
  if (candidate.contractVersion !== CONTRACT_VERSION) fail('transportShockCandidate.contractVersion mismatch.');
  if (!['unavailable', 'normal', 'watch', 'elevated_watch'].includes(candidate.status)) {
    fail(`transportShockCandidate.status is unsupported: ${candidate.status}`);
  }
  if (!isFiniteNumberOrNull(candidate.score)) fail('transportShockCandidate.score must be finite number or null.');
  if (Number.isFinite(candidate.score) && (candidate.score < 0 || candidate.score > 100)) {
    fail('transportShockCandidate.score must be within 0..100.');
  }
  if (!['none', 'low'].includes(candidate.confidence)) fail('transportShockCandidate.confidence must be none/low.');
  if (candidate.candidateOnly !== true) fail('transportShockCandidate.candidateOnly must be true.');
  if (candidate.auditOnly !== true) fail('transportShockCandidate.auditOnly must be true.');
  if (candidate.eligibleForMainScore !== false) fail('transportShockCandidate.eligibleForMainScore must be false.');
  if (candidate.routeFreightConfirmation !== 'not_connected') fail('transportShockCandidate.routeFreightConfirmation must stay not_connected.');
  if (candidate.marketConfirmation !== 'not_connected') fail('transportShockCandidate.marketConfirmation must stay not_connected.');
  if (!isPlainObject(candidate.evidence)) fail('transportShockCandidate.evidence must be an object.');
  if (!Array.isArray(candidate.drivers)) fail('transportShockCandidate.drivers must be an array.');
  if (!Array.isArray(candidate.reasons) || !candidate.reasons.length) fail('transportShockCandidate.reasons must be a non-empty array.');
  const boundaries = candidate.boundaries;
  if (!isPlainObject(boundaries)) {
    fail('transportShockCandidate.boundaries must be an object.');
  } else {
    for (const key of [
      'affectsValues',
      'affectsDisplayInputsBaseline',
      'affectsEffectiveDisplayInputs',
      'affectsScoring',
      'affectsDecisionModel',
      'affectsExecutionLock',
      'affectsPositionGuidance',
      'affectsBrentPromotion',
      'affectsWorldOrderWeights',
      'affectsGlobalRiskHeatmap',
      'affectsCrossValidation'
    ]) {
      if (boundaries[key] !== false) fail(`transportShockCandidate.boundaries.${key} must be false.`);
    }
  }
}

function inspectProductionPayload() {
  const radar = parseJson('data/radar-data.json');
  const energyTransport = radar?.macroDrivers?.energyTransport;
  if (!isPlainObject(energyTransport)) {
    fail('data/radar-data.json missing macroDrivers.energyTransport.');
    return { state: 'missing_energy_transport' };
  }
  if (energyTransport.source !== 'IMFPortWatch:Daily_Chokepoints_Data') {
    fail('macroDrivers.energyTransport.source is not IMFPortWatch:Daily_Chokepoints_Data.');
  }
  if (energyTransport.usageTermsPinned !== 'imf_data_terms_pinned') {
    fail('macroDrivers.energyTransport.usageTermsPinned must be imf_data_terms_pinned.');
  }
  if (energyTransport.redistributionCaveat !== true) {
    fail('macroDrivers.energyTransport.redistributionCaveat must be true.');
  }
  const sourceStatus = energyTransport.sourceStatus?.chokepoints || 'missing';
  const candidate = energyTransport.transportShockCandidate;
  if (candidate === undefined) {
    const missingCandidateRefreshHistory = summarizeMissingCandidateRefreshHistory(radar, energyTransport);
    if (
      missingCandidateRefreshHistory.historyAvailable === true
      &&
      missingCandidateRefreshHistory.consecutiveDailyRefreshesMissingCandidate
        >= MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES
    ) {
      fail(`transportShockCandidate is still missing after ${missingCandidateRefreshHistory.consecutiveDailyRefreshesMissingCandidate}/${MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES} successful Daily refreshes since writer activation.`);
    }
    return {
      state: 'awaiting_production_refresh',
      sourceStatus,
      latestDate: energyTransport.latestDate ?? null,
      latestAgeDays: energyTransport.latestAgeDays ?? null,
      candidatePresent: false,
      missingCandidateRefreshHistory,
      recommendation: 'wait_for_next_daily_refresh_then_rerun_check'
    };
  }
  validateCandidate(candidate);
  return {
    state: 'candidate_present_verified',
    sourceStatus,
    latestDate: energyTransport.latestDate ?? null,
    latestAgeDays: energyTransport.latestAgeDays ?? null,
    candidatePresent: true,
    candidateStatus: candidate.status,
    candidateScore: candidate.score,
    recommendation: 'frontend_card_can_render_production_candidate_display_only'
  };
}

function runSelfTests() {
  runTransportShockRefreshHistorySelfTests();
}

function main() {
  runSelfTests();
  validateWriterPath();
  validateNoScoreWiring();
  validateAuthorityDocs();
  const result = inspectProductionPayload();
  if (failures.length) {
    console.error('Transport Shock Confirmation Factor production refresh verification: FAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  const status = result.state === 'candidate_present_verified' ? 'PASS' : 'WATCH';
  console.log(`Transport Shock Confirmation Factor production refresh verification: ${status}`);
  console.log(`state: ${result.state}`);
  console.log(`sourceStatus: ${result.sourceStatus}`);
  console.log(`latestDate: ${result.latestDate ?? '—'}`);
  console.log(`latestAgeDays: ${result.latestAgeDays ?? '—'}`);
  console.log(`candidatePresent: ${result.candidatePresent ? 'true' : 'false'}`);
  if (result.missingCandidateRefreshHistory) {
    const history = result.missingCandidateRefreshHistory;
    console.log(`missingCandidateRefreshHistory.source: ${history.source}`);
    console.log(`missingCandidateRefreshHistory.anchor: ${history.anchorCommit ? history.anchorCommit.slice(0, 8) : history.anchorCommittedAt}`);
    console.log(`missingCandidateRefreshHistory.historyAvailable: ${history.historyAvailable}`);
    if (history.historyUnavailableReason) console.log(`missingCandidateRefreshHistory.historyUnavailableReason: ${history.historyUnavailableReason}`);
    console.log(`missingCandidateRefreshHistory.consecutiveDailyRefreshesMissingCandidate: ${history.consecutiveDailyRefreshesMissingCandidate}/${history.failAfterDailyRefreshes}`);
  }
  if (result.candidatePresent) {
    console.log(`candidateStatus: ${result.candidateStatus}`);
    console.log(`candidateScore: ${result.candidateScore ?? '—'}`);
  }
  console.log(`recommendation: ${result.recommendation}`);
  console.log('boundary: read-only production refresh verification; no network, no production write, no scoring, no ODP finalBias, no cross-validation');
}

main();
