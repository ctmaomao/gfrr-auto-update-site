// Offline historical audit, not a live signal or a generalized event classifier.
// Pin the local transcription, not the publisher's mutable web pages.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const manifest = new URL('../../docs/fixtures/oil-thermal/schwechat-control-audit.json', import.meta.url);
const digest = '7a7b89b2a6f619d5c910dedcd3561b7066589b4f40ce0840a6ddee2af1933ba1';

export function replayControlAudit(bytes = readFileSync(manifest)) {
  if (createHash('sha256').update(bytes).digest('hex') !== digest) {
    throw new Error('Historical claim transcription does not match reviewed pin');
  }
  const {caseStudy, episode, timeZone, claims} = JSON.parse(bytes);
  // The publications describe two states of ONE incident, not two sampled episodes.
  // A point statement of full operation does not cover an entire negative window.
  const rows = claims.map(({publicationDate, state, reference}) => ({
    episode, publicationDate, publicationPrecision: 'local_date_only', timeZone,
    state, reference, eventFreeThroughoutWindow: null, firstKnownToStudyAt: null,
    qualifiedThermalObservation: null, comparatorDecision: null, augmentedDecision: null
  }));
  return {
    caseStudy, transcriptionSha256: digest, rows,
    documentedEpisodes: new Set(rows.map(row => row.episode)).size,
    admittedIndependentControlWindows: 0, admittedPairedHoldoutWindows: 0,
    abstentionReasons: ['outcome_selected_case', 'same_episode_recovery',
      'no_window_wide_control_ascertainment', 'no_as_of_receipts_for_either_arm',
      'no_qualified_thermal_window', 'no_frozen_independent_holdout'],
    incrementalGain: null, falseAlertHarm: null, status: 'inconclusive',
    eligibleForProduction: false
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(replayControlAudit(), null, 2) + '\n');
}
