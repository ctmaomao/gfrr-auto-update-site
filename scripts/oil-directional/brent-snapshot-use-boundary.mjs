// Offline purpose boundary; reverify bytes, never promote a supplied summary.
import { verifyBrentReceivedSnapshot } from './brent-received-snapshot.mjs';
function exact(o, keys) {
  if (!o || Object.getPrototypeOf(o) !== Object.prototype || Reflect.ownKeys(o).length !== keys.length
    || !keys.every(k => Object.hasOwn(o, k) && 'value' in Object.getOwnPropertyDescriptor(o, k))) throw new Error('invalid use schema');
}
function utc(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)
    || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s) throw new Error('invalid use UTC');
  return Date.parse(s);
}
export function reviewBrentSnapshotUse(input) {
  exact(input, ['snapshot', 'purpose', 'originUTC', 'useAtUTC']);
  const { snapshot, purpose, originUTC, useAtUTC } = input;
  if (!['feature_at_origin', 'training_label_at_origin', 'posterior_evaluation_label_candidate'].includes(purpose)) throw new Error('unsupported snapshot purpose');
  const origin = utc(originUTC), use = utc(useAtUTC);
  const { publicSummary: checked } = verifyBrentReceivedSnapshot(snapshot);
  if (origin > use || utc(checked.snapshotReadAtUTC) > use) throw new Error('origin/read after use review');
  const receivedAfterOrigin = utc(checked.receivedAtUTC) > origin;
  const posterior = purpose === 'posterior_evaluation_label_candidate';
  const reasons = ['caller_receipt_not_source_authentication', 'quote_calendar_not_verified',
    'initial_version_not_verified', 'label_construction_not_verified'];
  if (posterior) {
    reasons.push('fixed_received_version_candidate_only', 'not_historical_training_permission');
    if (receivedAfterOrigin) reasons.push('later_snapshot_cannot_backfill_origin');
  } else {
    reasons.push('historical_availability_not_verified');
    if (receivedAfterOrigin) reasons.push('received_after_origin');
    reasons.push(purpose === 'feature_at_origin' ? 'feature_use_not_admitted' : 'training_label_use_not_admitted');
  }
  // Explicit whitelist: no prices, rows, inferred target, returns, or fitted output.
  return { schemaVersion: 'brent-snapshot-use-boundary-v1', purpose,
    status: posterior ? 'pending_independent_review' : 'rejected', reasons,
    originUTC, useAtUTC, snapshotReadAtUTC: checked.snapshotReadAtUTC,
    receivedAtUTC: checked.receivedAtUTC, receivedAfterOrigin,
    sha256: checked.sha256, bytes: checked.bytes, rowCount: checked.rowCount,
    numericCount: checked.numericCount, missingCount: checked.missingCount,
    receiptConsistencyVerified: true, callerClockAuthenticityVerified: false,
    inputAuthenticityVerified: false, quoteCalendarCompletenessVerified: false,
    sourceInitialVersionVerified: false, historicalFeatureEligible: false,
    historicalLabelAvailabilityVerified: false, trainingLabelEligible: false,
    labelConstructionVerified: false, eligibleForV2Fit: false, eligibleForEvaluation: false,
    eligibleForPublicProbability: false, eligibleForMainScore: false };
}
