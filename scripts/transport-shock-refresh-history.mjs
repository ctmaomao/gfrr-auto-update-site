import { execFileSync } from 'node:child_process';

export const DAILY_REFRESH_SUBJECT = 'chore: refresh radar data';
export const TRANSPORT_SHOCK_CANDIDATE_WRITER_ANCHOR = 'transport-shock-candidate-writer-anchor-v1';
export const TRANSPORT_SHOCK_CANDIDATE_WRITER_MARKER = TRANSPORT_SHOCK_CANDIDATE_WRITER_ANCHOR;
export const TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO = '2026-06-28T02:48:22.000Z';
export const MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES = 2;
export const DAILY_REFRESH_SCHEDULE_UTC = {
  hour: 22,
  minute: 30
};

export function gitOutput(args) {
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

export function gitJsonAtCommit(commit, path) {
  return JSON.parse(execFileSync('git', ['show', `${commit}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  }));
}

export function gitHistoryTrustStatus({ gitOutputFn = gitOutput } = {}) {
  const shallow = gitOutputFn(['rev-parse', '--is-shallow-repository']);
  if (shallow === 'true') return { trusted: false, reason: 'git_history_shallow' };
  if (shallow === null) return { trusted: false, reason: 'git_unavailable' };
  return { trusted: true, reason: null };
}

export function countDailyScheduleSlotsSince(startIso, endIso, schedule = DAILY_REFRESH_SCHEDULE_UTC) {
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
    schedule.hour,
    schedule.minute,
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

export function countConsecutiveDailyRefreshesMissingCandidate(records) {
  let count = 0;
  for (const record of records) {
    if (record.candidatePresent === true) break;
    count += 1;
  }
  return count;
}

export function findTransportShockWriterAnchor({ gitOutputFn = gitOutput } = {}) {
  const trust = gitHistoryTrustStatus({ gitOutputFn });
  if (!trust.trusted) {
    return {
      commit: null,
      committedAt: TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO,
      source: trust.reason,
      historyTrusted: false
    };
  }

  const output = gitOutputFn([
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

export function summarizeMissingCandidateRefreshHistory(
  currentRadar,
  currentEnergyTransport,
  {
    radarDataPath = 'data/radar-data.json',
    gitOutputFn = gitOutput,
    gitJsonAtCommitFn = gitJsonAtCommit
  } = {}
) {
  const anchor = findTransportShockWriterAnchor({ gitOutputFn });
  const summary = {
    source: anchor.commit ? 'git_history' : 'updatedAt_schedule_fallback',
    anchorCommit: anchor.commit,
    anchorCommittedAt: anchor.committedAt,
    historyUnavailableReason: anchor.commit ? null : anchor.source,
    failAfterDailyRefreshes: MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES,
    consecutiveDailyRefreshesMissingCandidate: 0,
    inspectedDailyRefreshes: [],
    historyAvailable: Boolean(anchor.commit && anchor.historyTrusted)
  };

  if (anchor.commit) {
    const output = gitOutputFn([
      'log',
      '--format=%H%x09%s',
      `${anchor.commit}..HEAD`,
      '--',
      radarDataPath
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
        const data = gitJsonAtCommitFn(row.commit, radarDataPath);
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
    summary.consecutiveDailyRefreshesMissingCandidate =
      countConsecutiveDailyRefreshesMissingCandidate(summary.inspectedDailyRefreshes);
    return summary;
  }

  const candidatePresent = currentEnergyTransport?.transportShockCandidate !== undefined;
  const scheduledSlotsCoveredByCurrentData = countDailyScheduleSlotsSince(anchor.committedAt, currentRadar?.updatedAt);
  summary.scheduledSlotsCoveredByCurrentData = scheduledSlotsCoveredByCurrentData;
  summary.consecutiveDailyRefreshesMissingCandidate =
    candidatePresent === false && Number.isFinite(scheduledSlotsCoveredByCurrentData)
      ? scheduledSlotsCoveredByCurrentData
      : 0;
  return summary;
}

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(`Transport Shock refresh history self-test failed: ${message}`);
}

export function runTransportShockRefreshHistorySelfTests() {
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

  const fakeRadar = { updatedAt: '2026-06-30T22:30:00.000Z' };
  const fakeEnergyTransport = {};
  const shallowSummary = summarizeMissingCandidateRefreshHistory(fakeRadar, fakeEnergyTransport, {
    gitOutputFn: (args) => (args[0] === 'rev-parse' ? 'true' : null)
  });
  assertSelfTest(shallowSummary.historyAvailable === false, 'shallow git history is not trusted');
  assertSelfTest(shallowSummary.historyUnavailableReason === 'git_history_shallow', 'shallow history reason is explicit');
  assertSelfTest(shallowSummary.consecutiveDailyRefreshesMissingCandidate >= 2, 'schedule fallback can count elapsed slots diagnostically');

  const historySummary = summarizeMissingCandidateRefreshHistory(fakeRadar, fakeEnergyTransport, {
    gitOutputFn: (args) => {
      if (args[0] === 'rev-parse') return 'false';
      if (args[0] === 'log' && args.includes('--reverse')) return 'anchor\t2026-06-28T02:48:22.000Z';
      if (args[0] === 'log') {
        return [
          'daily2\tchore: refresh radar data',
          'daily1\tchore: refresh radar data',
          'other\tchore: unrelated'
        ].join('\n');
      }
      return null;
    },
    gitJsonAtCommitFn: (commit) => ({
      updatedAt: `${commit}-updated`,
      macroDrivers: {
        energyTransport: {
          sourceStatus: { chokepoints: 'live' }
        }
      }
    })
  });
  assertSelfTest(historySummary.historyAvailable === true, 'trusted git history is available');
  assertSelfTest(historySummary.consecutiveDailyRefreshesMissingCandidate === 2, 'history-backed missing candidate streak reaches threshold');

  const recoveredSummary = summarizeMissingCandidateRefreshHistory(fakeRadar, fakeEnergyTransport, {
    gitOutputFn: (args) => {
      if (args[0] === 'rev-parse') return 'false';
      if (args[0] === 'log' && args.includes('--reverse')) return 'anchor\t2026-06-28T02:48:22.000Z';
      if (args[0] === 'log') {
        return [
          'daily3\tchore: refresh radar data',
          'daily2\tchore: refresh radar data',
          'daily1\tchore: refresh radar data'
        ].join('\n');
      }
      return null;
    },
    gitJsonAtCommitFn: (commit) => ({
      updatedAt: `${commit}-updated`,
      macroDrivers: {
        energyTransport: {
          sourceStatus: { chokepoints: 'live' },
          ...(commit === 'daily3' ? { transportShockCandidate: { status: 'watch' } } : {})
        }
      }
    })
  });
  assertSelfTest(recoveredSummary.consecutiveDailyRefreshesMissingCandidate === 0, 'latest candidate-present Daily clears missing streak');
}
