import fs from 'node:fs';

import {
  MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES,
  TRANSPORT_SHOCK_CANDIDATE_WRITER_MARKER,
  gitJsonAtCommit,
  runTransportShockRefreshHistorySelfTests,
  summarizeMissingCandidateRefreshHistory
} from './transport-shock-refresh-history.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');
const parseCommittedJson = (path) => gitJsonAtCommit('HEAD', path);

const CONTRACT_VERSION = 'transport-shock-candidate-v1';
const failures = [];
const NO_SCORE_WIRING_FORBIDDEN_SCOPES = [
  {
    file: 'scripts/modules/decision.js',
    markers: [
      'transportShockCandidate',
      'transportShockConfirmationFactorProductionRefresh',
      'transport-shock-confirmation-factor-production-refresh-v1',
      'candidate_present_verified'
    ]
  },
  {
    file: 'scripts/modules/buildCrossValidationMatrix.js',
    markers: [
      'transportShockCandidate',
      'transportShockConfirmationFactorProductionRefresh',
      'transport-shock-confirmation-factor-production-refresh-v1',
      'candidate_present_verified'
    ]
  },
  {
    file: 'scripts/modules/realtime.js',
    markers: [
      'transportShockCandidate',
      'transportShockConfirmationFactorProductionRefresh',
      'transport-shock-confirmation-factor-production-refresh-v1',
      'candidate_present_verified'
    ]
  },
  {
    file: 'workers/gfrr-realtime-worker/src/index.js',
    markers: [
      'transportShockCandidate',
      'transportShockConfirmationFactorProductionRefresh',
      'transport-shock-confirmation-factor-production-refresh-v1',
      'candidate_present_verified'
    ]
  },
  {
    file: 'workers/gfrr-realtime-worker/src/worker-market-preview.js',
    markers: [
      'transportShockCandidate',
      'transportShockConfirmationFactorProductionRefresh',
      'transport-shock-confirmation-factor-production-refresh-v1',
      'candidate_present_verified'
    ]
  },
  {
    file: 'scripts/modules/renderOilDirectional.js',
    markers: [
      'transportShockCandidate',
      'transportShockConfirmationFactorProductionRefresh',
      'transport-shock-confirmation-factor-production-refresh-v1',
      'candidate_present_verified'
    ]
  },
  {
    file: 'data/oil-directional-pressure.json',
    markers: [
      'transportShockCandidate',
      'transportShockConfirmationFactorProductionRefresh',
      'transport-shock-confirmation-factor-production-refresh-v1',
      'candidate_present_verified'
    ]
  }
];

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

function requireMarkers(text, markers, file) {
  for (const marker of markers) requireMarker(text, marker, file);
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
    'eligibleForMainScore:',
    'TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT = 3',
    'function buildTransportShockScoringImpact',
    "routeFreightConfirmation: 'not_connected'",
    "marketConfirmation: 'not_connected'"
  ]) {
    requireMarker(daily, marker, 'scripts/run-daily-pipeline.mjs');
  }
}

function validateNoScoreWiring() {
  for (const { file, markers } of NO_SCORE_WIRING_FORBIDDEN_SCOPES) {
    const text = read(file);
    for (const marker of markers) {
      forbidMarker(text, marker, file);
    }
  }
}

function validateAuthorityDocs() {
  const docs = [
    {
      file: 'docs/DATA_SOURCES.md',
      markers: ['P-score-8', 'check:transport-shock-confirmation-factor-production-refresh']
    },
    {
      file: 'docs/DATA_CONTRACT.md',
      markers: ['transport-shock-confirmation-factor-production-refresh-v1', 'P-score-8']
    },
    {
      file: 'docs/SIGNAL_INTAKE.md',
      markers: ['transport-shock-confirmation-factor-production-refresh-v1', 'P-score-8']
    },
    {
      file: 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md',
      markers: ['P-score-8', 'check:transport-shock-confirmation-factor-production-refresh']
    },
    {
      file: 'docs/AGENT_DOMAIN_BOUNDARIES.md',
      markers: ['transport-shock-confirmation-factor-production-refresh-v1', 'check:transport-shock-confirmation-factor-production-refresh']
    },
    {
      file: 'package.json',
      markers: ['check:transport-shock-confirmation-factor-production-refresh']
    },
    {
      file: 'scripts/check-suite.mjs',
      markers: ['check:transport-shock-confirmation-factor-production-refresh']
    }
  ];
  for (const { file, markers } of docs) {
    requireMarkers(read(file), markers, file);
  }
}

function validateCandidate(candidate, sourceStatus) {
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
  if (typeof candidate.eligibleForMainScore !== 'boolean') fail('transportShockCandidate.eligibleForMainScore must be boolean.');
  if (candidate.eligibleForMainScore === true) {
    if (sourceStatus !== 'live') fail('transportShockCandidate can be main-score eligible only when PortWatch source is live.');
    if (!['watch', 'elevated_watch'].includes(candidate.status)) fail('transportShockCandidate eligible status must be watch/elevated_watch.');
    if (!Number.isFinite(candidate.score) || candidate.score < 50) fail('transportShockCandidate eligible score must be >= 50.');
  }
  if (candidate.routeFreightConfirmation !== 'not_connected') fail('transportShockCandidate.routeFreightConfirmation must stay not_connected.');
  if (candidate.marketConfirmation !== 'not_connected') fail('transportShockCandidate.marketConfirmation must stay not_connected.');
  if (!isPlainObject(candidate.evidence)) fail('transportShockCandidate.evidence must be an object.');
  if (!Array.isArray(candidate.drivers)) fail('transportShockCandidate.drivers must be an array.');
  if (!Array.isArray(candidate.reasons) || !candidate.reasons.length) fail('transportShockCandidate.reasons must be a non-empty array.');
  const boundaries = candidate.boundaries;
  if (!isPlainObject(boundaries)) {
    fail('transportShockCandidate.boundaries must be an object.');
  } else {
    const runtimeScoringBoundaryKeys = new Set([
      'affectsScoring',
      'affectsDecisionModel',
      'affectsExecutionLock',
      'affectsPositionGuidance'
    ]);
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
      if (candidate.eligibleForMainScore === true && runtimeScoringBoundaryKeys.has(key)) {
        if (boundaries[key] !== true) fail(`transportShockCandidate.boundaries.${key} must be true when main-score eligible.`);
      } else if (boundaries[key] !== false) {
        fail(`transportShockCandidate.boundaries.${key} must be false.`);
      }
    }
  }
}

function inspectProductionPayload() {
  const radar = parseCommittedJson('data/radar-data.json');
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
  validateCandidate(candidate, sourceStatus);
  return {
    state: 'candidate_present_verified',
    sourceStatus,
    latestDate: energyTransport.latestDate ?? null,
    latestAgeDays: energyTransport.latestAgeDays ?? null,
    candidatePresent: true,
    candidateStatus: candidate.status,
    candidateScore: candidate.score,
    recommendation: 'frontend_card_can_render_candidate_and_capped_score_impact'
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
  console.log('boundary: read-only production refresh verification; no network, no production write, no route/market confirmation write, no ODP finalBias, no Brent promotion, no Global Risk Heatmap, no cross-validation');
}

main();
