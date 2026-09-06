import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/runtime-scoring-migration-authorization-v1.json';

const RUNTIME_FORBIDDEN_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/oil-directional-pressure.json'
];

const RUNTIME_MARKER_ALLOWED_BY_FILE = {
  'scripts/modules/renderMacroOverview.js': new Set([
    'transportShockScoringImpact'
  ])
};

const OUT_OF_SCOPE_RUNTIME_MARKERS = [
  'runtime_scoring_migration_authorized_capped_free_proxy',
  'transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1',
  'transportShockScoringImpact'
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

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Runtime scoring migration authorization fixture is missing.');
  const authorization = JSON.parse(readText(FIXTURE));
  assert(
    authorization.schemaVersion === 'transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1',
    'Authorization schemaVersion mismatch.'
  );
  assert(
    authorization.status === 'runtime_scoring_migration_authorized_capped_free_proxy',
    'Authorization status mismatch.'
  );
  assert(authorization.authorizedBy === 'owner_thread_approval', 'Authorization must record owner_thread_approval.');
  assert(
    authorization.authorizationScope === 'transport_shock_confirmation_factor_free_proxy_low_weight_runtime_scoring_migration',
    'Authorization scope mismatch.'
  );
  assert(
    authorization.approvedRuntimeSourcePath === 'macroDrivers.energyTransport.transportShockCandidate',
    'Authorization runtime source path mismatch.'
  );
  assert(authorization.approvedScoreImpact.maxContributionPct === 3, 'Authorization cap must stay 3%.');
  assert(authorization.approvedScoreImpact.defaultContributionPct === 0, 'Default contribution must stay fail-closed 0.');
  assert(authorization.approvedScoreImpact.direction === 'transport_shock_pressure_only', 'Direction must stay pressure-only.');
  assert(authorization.approvedScoreImpact.mayReduceMainScore === false, 'Authorization must not reduce main score.');
  assert(authorization.approvedScoreImpact.mayOverrideCoreRiskModel === false, 'Authorization must not override core risk model.');
  assert(authorization.approvedScoreImpact.mayOverrideOdpFinalBias === false, 'Authorization must not override ODP finalBias.');
  assert(authorization.approvedScoreImpact.mayAffectBrentPromotion === false, 'Authorization must not affect Brent promotion.');
  assert(
    authorization.requiredRuntimeOutputs.includes('transportShockScoringImpact.runtimeScoringAuthorized'),
    'Authorization must require explicit runtimeScoringAuthorized output.'
  );
  for (const guard of [
    'candidate_missing_zero_contribution',
    'candidate_not_live_zero_contribution',
    'candidate_not_eligible_zero_contribution',
    'hard_cap_three_pct'
  ]) {
    assert(authorization.requiredFailClosedGuards.includes(guard), `Authorization missing guard: ${guard}`);
  }
  assert(authorization.explicitlyStillNotApproved.routeFreightConfirmationConnected === false, 'Route freight confirmation must remain unapproved.');
  assert(authorization.explicitlyStillNotApproved.odpFinalBiasMutation === false, 'ODP finalBias mutation must remain unapproved.');
  assert(authorization.explicitlyStillNotApproved.bubbleWatchMutation === false, 'Bubble Watch mutation must remain unapproved.');
  assert(
    authorization.nextAllowedStep === 'implement_runtime_scoring_with_fail_closed_guards_and_checker',
    'Authorization next step mismatch.'
  );
}

function assertRuntimeImplementationScopedForAuthorization() {
  const daily = readText('scripts/run-daily-pipeline.mjs');
  for (const marker of [
    'TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT = 3',
    'function buildTransportShockScoringImpact',
    'runtimeScoringAuthorized: true',
    'candidate_missing_zero_contribution',
    'candidate_not_live_zero_contribution',
    'candidate_not_eligible_zero_contribution',
    'candidate_stale_zero_contribution',
    'transportShockScoringImpact: risk.transportShockScoringImpact'
  ]) {
    assert(daily.includes(marker), `scripts/run-daily-pipeline.mjs missing scoped runtime marker: ${marker}`);
  }
  const validator = readText('scripts/validate-data.mjs');
  for (const marker of [
    'function validateTransportShockScoringImpact',
    'transportShockScoringImpact.runtimeScoringAuthorized must remain true under P-score-50 authorization',
    'transportShockScoringImpact.contributionPct must stay within 0..3',
    'transportShockScoringImpact must not claim route freight confirmation',
    'transportShockScoringImpact score delta must stay capped at +3'
  ]) {
    assert(validator.includes(marker), `scripts/validate-data.mjs missing scoped validator marker: ${marker}`);
  }
  for (const relativePath of RUNTIME_FORBIDDEN_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    const allowedMarkers = RUNTIME_MARKER_ALLOWED_BY_FILE[relativePath] || new Set();
    for (const marker of OUT_OF_SCOPE_RUNTIME_MARKERS) {
      if (allowedMarkers.has(marker)) continue;
      assert(!source.includes(marker), `${relativePath} contains out-of-scope runtime scoring marker: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');
  for (const marker of [
    'transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1',
    'runtime_scoring_migration_authorized_capped_free_proxy',
    'owner_thread_approval',
    'maxContributionPct=3'
  ]) {
    assert(agents.includes(marker), `docs/AGENT_DOMAIN_BOUNDARIES.md missing marker: ${marker}`);
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1',
    'transportShockScoringImpact',
    'maxContributionPct=3',
    'defaultContributionPct=0'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('runtime_scoring_migration_authorized_capped_free_proxy'), 'SIGNAL_INTAKE missing authorization marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor runtime scoring migration authorization'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing authorization marker.');
  assert(
    packageJson.scripts['check:transport-shock-confirmation-factor-runtime-scoring-migration-authorization'],
    'package.json missing authorization checker.'
  );
  assert(
    checkSuite.includes('check:transport-shock-confirmation-factor-runtime-scoring-migration-authorization'),
    'check-suite missing authorization checker.'
  );
}

function main() {
  assertFixture();
  assertRuntimeImplementationScopedForAuthorization();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor runtime scoring migration authorization: PASS');
}

main();
