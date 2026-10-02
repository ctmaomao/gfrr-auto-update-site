// Fixed enums, field limits and budget candidates for the CSP report receiver.
//
// Everything here is a *test candidate*: the values chosen for the local implementation phase.
// They are not production values and none of them may be presented as platform guarantees.

/** Closed sets. Anything not listed normalises to the trailing `other` / `unknown` member. */
export const DIRECTIVES = ['script-src', 'script-src-attr', 'style-src-elem', 'style-src-attr', 'other'];
export const BLOCKED = ['inline', 'self', 'cross-origin', 'eval', 'data', 'other'];
export const DOCS = ['index', 'bubble-watch', 'other'];
export const MECHANISMS = ['legacy', 'reporting'];
/** Sentinel used by the single overflow row; every dimension is `overflow`. */
export const OVERFLOW = 'overflow';

/** Finite known policy-version table. A report's own tag is never trusted as input. */
export const POLICY_TAGS = ['p1', 'p2', 'p3', 'p4', 'unknown'];

/** Input limits. The byte gate runs BEFORE parsing; the count gates run AFTER parsing. */
export const LIMITS = {
  /** Candidate start value; to be raised only after measured CPU and memory. */
  MAX_BODY_BYTES: 64 * 1024,
  /** Reporting API payload array length. */
  MAX_ARRAY_ITEMS: 100,
  /** Single string field length, applied to raw values before any mapping. */
  MAX_FIELD_LENGTH: 2048,
  /** Distinct normalised keys accepted for processing; the tail is dropped. */
  MAX_INPUT_KEYS_PER_BATCH: 200,
  /** Keys that may keep their classification in one batch (existing + accepted). */
  MAX_CLASSIFIED_KEYS_PER_BATCH: 32,
  /** Normal rows per daily bucket; beyond this, new keys fold into the overflow row. */
  BUCKET_ROW_CAP: 512,
  /** Candidate retention window, measured in whole UTC day buckets (inclusive of today). */
  RETENTION_DAYS: 14,
  /** Independent INGEST budget. Not a platform reservation and not a total-spend cap. */
  INGEST_WRITE_BUDGET: 2500,
  /** Per-key, per-batch increment bound. */
  MAX_REPORTS_PER_KEY_PER_BATCH: 10000,
  /** Saturation points. A value at its cap means "displayed value is a lower bound". */
  REPORTS_HARD_CAP: 1e9,
  OPS_HARD_CAP: 1e6,
  /** Accumulator bound for the merged overflow increment. */
  MAX_OVERFLOW_REPORTS_PER_BATCH: 100000,
};

/** Health-check windows. */
export const HEALTH = {
  /** Cleanup is expected once per day; a watermark older than this raises an alert. */
  ALLOWED_DELAY_MS: 24 * 60 * 60 * 1000,
  /** How long after the expected cleanup time a missing follow-up alarm is still tolerated. */
  RESCHEDULE_WINDOW_MS: 2 * 60 * 60 * 1000,
  /** A `cleanup_started_at` older than this is a stuck-run signal, not an in-flight one. */
  IN_FLIGHT_WINDOW_MS: 30 * 60 * 1000,
};

/** Daily cleanup time, in minutes after 00:00 UTC. */
export const CLEANUP_AT_UTC_MINUTE = 10;

/** UTC day bucket for a timestamp. The bucket always comes from server time. */
export function bucketFor(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

/** Adds whole days to a `YYYY-MM-DD` bucket string. */
export function addDays(bucket, days) {
  const date = new Date(`${bucket}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * First bucket that is NOT deleted for a retention of `retentionDays` whole buckets including
 * today. With today = 2026-10-10 and 14 days this is 2026-09-27, so exactly 14 buckets survive.
 */
export function retentionThreshold(todayBucket, retentionDays) {
  return addDays(todayBucket, -(retentionDays - 1));
}
