import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = (path) => fs.readFileSync(path, 'utf8');
const parseJson = (path) => JSON.parse(read(path));

const CONTRACT_VERSION = 'transport-shock-candidate-v1';
const DAILY_REFRESH_SUBJECT = 'chore: refresh radar data';
const TRANSPORT_SHOCK_CANDIDATE_WRITER_MARKER = "transportShockCandidate: buildEnergyTransportShockCandidate(chokepoints, reroutingProxy, 'live')";
const TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO = '2026-06-28T02:48:22.000Z';
const TRANSPORT_SHOCK_MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES = 2;
const DAILY_REFRESH_SCHEDULE_UTC = {
  hour: 22,
  minute: 30
};
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

function gitOutput(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function gitHistoryTrustStatus() {
  const shallow = gitOutput(['rev-parse', '--is-shallow-repository']);
  if (shallow === 'true') return { trusted: false, reason: 'git_history_shallow' };
  if (shallow === null) return { trusted: false, reason: 'git_unavailable' };
  return { trusted: true, reason: null };
}

function countDailyScheduleSlotsSince(startIso, endIso) {
  const startMs = Date.parse(startIso || '');
  const endMs = Date.parse(endIso || '');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs <= startMs) return 0;

  const start = new Date(startMs);
  const dayMs = 24 * 60 * 60 * 1000;
  let cursorMs = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    DAILY_REFRESH_SCHEDULE_UTC.hour,
    DAILY_REFRESH_SCHEDULE_UTC.minute,
    0,
    0
  );
  if (cursorMs <= startMs) cursorMs += dayMs;

  let count = 0;
  while (cursorMs <= endMs) {
    count += 1;
    cursorMs += dayMs;
  }
  return count;
}

function countConsecutiveDailyRefreshesMissingCandidate(records) {
  let count = 0;
  for (const record of records) {
    if (record.candidatePresent === true) break;
    count += 1;
  }
  return count;
}

function findTransportShockWriterAnchor() {
  const trust = gitHistoryTrustStatus();
  if (!trust.trusted) {
    return {
      commit: null,
      committedAt: TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO,
      source: trust.reason,
      historyTrusted: false
    };
  }

  const output = gitOutput([
    'log',
    '--reverse',
    '--format=%H%x09%aI',
    `-S${TRANSPORT_SHOCK_CANDIDATE_WRITER_MARKER}`,
    '--',
    'scripts/run-daily-pipeline.mjs'
  ]);
  const first = output?.split(/\r?\n/u).find(Boolean);
  if (!first) {
    return {
      commit: null,
      committedAt: TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO,
      source: 'fallback_expected_after',
      historyTrusted: true
    };
  }
  const [commit, committedAt] = first.split('\t');
  return {
    commit,
    committedAt: committedAt || TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO,
    source: 'git_pickaxe',
    historyTrusted: true
  };
}

function summarizeDailyRefreshHistoryAfterWriter(currentRadar, currentEnergyTransport) {
  const anchor = findTransportShockWriterAnchor();
  const summary = {
    source: anchor.commit ? 'git_history' : 'updatedAt_schedule_fallback',
    anchorCommit: anchor.commit,
    anchorCommittedAt: anchor.committedAt,
    historyUnavailableReason: anchor.commit ? null : anchor.source,
    failAfterDailyRefreshes: TRANSPORT_SHOCK_MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES,
    consecutiveDailyRefreshesMissingCandidate: 0,
    inspectedDailyRefreshes: [],
    historyAvailable: Boolean(anchor.commit && anchor.historyTrusted)
  };

  if (anchor.commit) {
    const output = gitOutput([
      'log',
      '--format=%H%x09%s',
      `${anchor.commit}..HEAD`,
      '--',
      'data/radar-data.json'
    ]);
    const dailyLines = (output || '')
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const [commit, subject] = line.split('\t');
        return { commit, subject };
      })
      .filter((row) => row.subject === DAILY_REFRESH_SUBJECT);

    for (const row of dailyLines) {
      try {
        const data = JSON.parse(execFileSync('git', ['show', `${row.commit}:data/radar-data.json`], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore']
        }));
        const energyTransport = data?.macroDrivers?.energyTransport;
        summary.inspectedDailyRefreshes.push({
          commit: row.commit.slice(0, 8),
          updatedAt: data?.updatedAt || null,
          sourceStatus: energyTransport?.sourceStatus?.chokepoints || 'missing',
          candidatePresent: energyTransport?.transportShockCandidate !== undefined
        });
      } catch {
        summary.inspectedDailyRefreshes.push({
          commit: row.commit.slice(0, 8),
          updatedAt: null,
          sourceStatus: 'unreadable',
          candidatePresent: false
        });
        break;
      }
    }
    summary.consecutiveDailyRefreshesMissingCandidate = countConsecutiveDailyRefreshesMissingCandidate(summary.inspectedDailyRefreshes);
    return summary;
  }

  const candidatePresent = currentEnergyTransport?.transportShockCandidate !== undefined;
  const scheduledSlotsCoveredByCurrentData = countDailyScheduleSlotsSince(anchor.committedAt, currentRadar?.updatedAt);
  summary.scheduledSlotsCoveredByCurrentData = scheduledSlotsCoveredByCurrentData;
  summary.consecutiveDailyRefreshesMissingCandidate = candidatePresent === false && Number.isFinite(scheduledSlotsCoveredByCurrentData)
    ? scheduledSlotsCoveredByCurrentData
    : 0;
  return summary;
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
    const missingCandidateRefreshHistory = summarizeDailyRefreshHistoryAfterWriter(radar, energyTransport);
    if (
      missingCandidateRefreshHistory.historyAvailable === true
      &&
      missingCandidateRefreshHistory.consecutiveDailyRefreshesMissingCandidate
        >= TRANSPORT_SHOCK_MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES
    ) {
      fail(`transportShockCandidate is still missing after ${missingCandidateRefreshHistory.consecutiveDailyRefreshesMissingCandidate}/${TRANSPORT_SHOCK_MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES} successful Daily refreshes since writer activation.`);
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

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(`Transport Shock production refresh self-test failed: ${message}`);
}

function runSelfTests() {
  assertSelfTest(
    countDailyScheduleSlotsSince('2026-06-28T02:48:22.000Z', '2026-06-28T22:29:59.000Z') === 0,
    'daily slot count before first post-writer Daily schedule'
  );
  assertSelfTest(
    countDailyScheduleSlotsSince('2026-06-28T02:48:22.000Z', '2026-06-28T22:30:00.000Z') === 1,
    'daily slot count at first post-writer Daily schedule'
  );
  assertSelfTest(
    countConsecutiveDailyRefreshesMissingCandidate([
      { sourceStatus: 'live', candidatePresent: false },
      { sourceStatus: 'live', candidatePresent: false },
      { sourceStatus: 'live', candidatePresent: true }
    ]) === 2,
    'consecutive missing candidate count stops at first candidate-present Daily'
  );
  assertSelfTest(
    countConsecutiveDailyRefreshesMissingCandidate([
      { sourceStatus: 'fallback', candidatePresent: false },
      { sourceStatus: 'live', candidatePresent: false }
    ]) === 2,
    'successful Daily commits count even when sourceStatus is fallback'
  );
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
