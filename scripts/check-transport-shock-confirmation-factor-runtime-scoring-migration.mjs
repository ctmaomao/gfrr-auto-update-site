import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const OUT_OF_SCOPE_FILES = [
  'scripts/modules/decision.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'scripts/modules/realtime.js',
  'scripts/modules/renderOilDirectional.js',
  'workers/gfrr-realtime-worker/src/index.js',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/oil-directional-pressure.json'
];

const OUT_OF_SCOPE_MARKERS = [
  'transportShockScoringImpact',
  'transport-shock-scoring-impact-v1',
  'TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT'
];

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertMarkers(file, markers) {
  const text = readText(file);
  for (const marker of markers) {
    assert(text.includes(marker), `${file} missing marker: ${marker}`);
  }
}

function assertNoMarkers(file, markers) {
  const text = readText(file);
  for (const marker of markers) {
    assert(!text.includes(marker), `${file} must not include out-of-scope marker: ${marker}`);
  }
}

function assertDailyRuntimePath() {
  assertMarkers('scripts/run-daily-pipeline.mjs', [
    "const TRANSPORT_SHOCK_SCORING_IMPACT_CONTRACT_VERSION = 'transport-shock-scoring-impact-v1'",
    'const TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT = 3',
    'const TRANSPORT_SHOCK_RUNTIME_SCORING_STALE_AFTER_DAYS = 7',
    'function buildTransportShockScoringImpact',
    'runtimeScoringAuthorized: true',
    'candidate_missing_zero_contribution',
    'candidate_not_live_zero_contribution',
    'candidate_stale_zero_contribution',
    'candidate_not_eligible_zero_contribution',
    'candidate_not_pressure_status_zero_contribution',
    'candidate_score_not_positive_zero_contribution',
    'candidate_score_below_contribution_threshold_zero_contribution',
    'score_ceiling_zero_contribution',
    'return ageDays >= 0 ? ageDays : null',
    '&& latestAgeDays >= 0',
    'routeFreightConfirmationConnected: false',
    'marketConfirmationConnected: false',
    'candidateScore >= 75 ? 3 : candidateScore >= 60 ? 2 : candidateScore >= 50 ? 1 : 0',
    'const score = transportShockScoringImpact.applied',
    'transportShockScoringImpact: risk.transportShockScoringImpact'
  ]);
  const daily = readText('scripts/run-daily-pipeline.mjs');
  assert(
    daily.includes("eligibleForMainScore: sourceStatus === 'live' && status !== 'normal'"),
    'Transport candidate eligibility must remain live-source and pressure-status gated.'
  );
  assert(
    daily.includes("routeFreightConfirmation: 'not_connected'") &&
    daily.includes("marketConfirmation: 'not_connected'"),
    'Route freight and market confirmation must remain not_connected.'
  );
  assert(
    daily.includes('affectsBrentPromotion: false') &&
    daily.includes('affectsWorldOrderWeights: false') &&
    daily.includes('affectsGlobalRiskHeatmap: false') &&
    daily.includes('affectsCrossValidation: false'),
    'Transport scoring migration must preserve Brent/World Order/Heatmap/cross-validation boundaries.'
  );
}

function assertValidatorPath() {
  assertMarkers('scripts/validate-data.mjs', [
    "const TRANSPORT_SHOCK_SCORING_IMPACT_CONTRACT_VERSION = 'transport-shock-scoring-impact-v1'",
    'const TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT = 3',
    'function validateTransportShockScoringImpact',
    'transportShockScoringImpact.runtimeScoringAuthorized must remain true under P-score-50 authorization',
    'transportShockScoringImpact.contributionPct must stay within 0..3',
    'transportShockScoringImpact.direction must stay pressure-only',
    'transportShockScoringImpact must not claim route freight confirmation',
    'transportShockScoringImpact must not claim market confirmation',
    'transportShockScoringImpact score delta must stay capped at +3',
    'transportShockScoringImpact contributionPct must equal the actual score delta',
    'impact.latestAgeDays >= 0',
    'validateTransportShockScoringImpact(data)'
  ]);
}

function assertLegacyCheckersUpdated() {
  assertMarkers('scripts/check-transport-shock-confirmation-factor-production-refresh.mjs', [
    'TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT = 3',
    'function buildTransportShockScoringImpact',
    'transportShockCandidate.eligibleForMainScore must be boolean.',
    'transportShockCandidate can be main-score eligible only when PortWatch source is live.'
  ]);
  assertMarkers('scripts/archive-transport-shock-confirmation-factor-history-samples.mjs', [
    'eligibleForMainScore must be boolean.',
    'eligibleForMainScore requires live source.',
    'eligibleForMainScore requires watch/elevated_watch status.'
  ]);
  assertMarkers('scripts/check-macro-drivers-expanded-auto-ingestion.mjs', [
    'eligibleForMainScore must be boolean',
    'can be eligible only when PortWatch is live'
  ]);
}

function assertOutOfScopeRemainsUntouched() {
  for (const file of OUT_OF_SCOPE_FILES) {
    assert(fs.existsSync(absolute(file)), `${file} is missing.`);
    assertNoMarkers(file, OUT_OF_SCOPE_MARKERS);
  }
}

function assertAuthorityWiring() {
  const packageJson = JSON.parse(readText('package.json'));
  assert(
    packageJson.scripts['check:transport-shock-confirmation-factor-runtime-scoring-migration'],
    'package.json missing runtime scoring migration checker.'
  );
  assert(
    readText('scripts/check-suite.mjs').includes('check:transport-shock-confirmation-factor-runtime-scoring-migration'),
    'check-suite missing runtime scoring migration checker.'
  );
  assertMarkers('docs/DATA_CONTRACT.md', ['transport-shock-scoring-impact-v1']);
  assertMarkers('docs/DATA_SOURCES.md', ['transport-shock-scoring-impact-v1']);
  assertMarkers('docs/AGENT_DOMAIN_BOUNDARIES.md', ['transport-shock-scoring-impact-v1']);
}

function main() {
  assertDailyRuntimePath();
  assertValidatorPath();
  assertLegacyCheckersUpdated();
  assertOutOfScopeRemainsUntouched();
  assertAuthorityWiring();
  console.log('Transport Shock Confirmation Factor runtime scoring migration: PASS');
}

main();
