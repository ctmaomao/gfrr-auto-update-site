// Storage layer: schema, ingest planning and the synchronous commit path.
//
// All database access goes through a storage adapter (see storage-adapter.js), so the identical SQL
// runs against the Cloudflare Durable Object SQL API in production and against `node:sqlite` in the
// local phase. No statement here uses SQL transaction-control syntax; atomicity comes from
// `adapter.transaction()`.
//
// Two accounting numbers are deliberately separate:
//   obs_rows    = the sum of committed observation row updates
//   ledger_rows = the number of successful non-empty batches
// `used = obs_rows + ledger_rows` is what the INGEST budget checks, and the planned cost of a batch
// includes BOTH its observation writes and its ledger write. This is an application-side ingest
// budget only: it is not a platform reservation and not a cap on total platform spend.
import { LIMITS, OVERFLOW, bucketFor, retentionThreshold } from './constants.js';

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS obs (
     bucket     TEXT    NOT NULL,
     directive  TEXT    NOT NULL,
     blocked    TEXT    NOT NULL,
     doc        TEXT    NOT NULL,
     policy_tag TEXT    NOT NULL,
     mechanism  TEXT    NOT NULL,
     reports    INTEGER NOT NULL CHECK (reports >= 0),
     ops        INTEGER NOT NULL CHECK (ops >= 0),
     reports_incomplete INTEGER NOT NULL DEFAULT 0 CHECK (reports_incomplete IN (0,1)),
     PRIMARY KEY (bucket, directive, blocked, doc, policy_tag, mechanism)
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS obs_write_ledger (
     bucket      TEXT    PRIMARY KEY,
     obs_rows    INTEGER NOT NULL CHECK (obs_rows >= 0),
     ledger_rows INTEGER NOT NULL CHECK (ledger_rows >= 0)
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID`,
];

/** Creates tables. Safe to call repeatedly; it writes no rows. */
export function applySchema(adapter) {
  for (const statement of SCHEMA) adapter.exec(statement);
}

/** Meta keys seeded with INSERT OR IGNORE, so an existing value is never overwritten. */
export const META_DEFAULTS = [
  ['schema_version', '1'],
  ['retention_days', String(LIMITS.RETENTION_DAYS)],
  ['cleanup_started_at', ''],
  ['last_cleaned_bucket', ''],
  ['cleanup_attempts', '0'],
];

/** Splits a normalised key back into its five enum dimensions. */
export function splitKey(key) {
  const [directive, blocked, doc, policyTag, mechanism] = key.split('|');
  return { directive, blocked, doc, policyTag, mechanism };
}

export const SQL = {
  insertMeta: `INSERT OR IGNORE INTO meta(k,v) VALUES(?,?)`,
  used: `SELECT obs_rows, ledger_rows FROM obs_write_ledger WHERE bucket = ?`,
  normalRows: `SELECT COUNT(*) AS c FROM obs WHERE bucket = ? AND directive <> '${OVERFLOW}'`,
  existing: `SELECT directive, blocked, doc, policy_tag, mechanism FROM obs WHERE bucket = ?`,

  // Saturation is expressed in SQL so a stored value can never exceed its cap. The "incomplete"
  // flag is raised on BOTH paths: the inserted value is clamped here, and an UPDATE whose applied
  // increment was clamped is detected in the conflict branch. MAX() keeps the flag monotonic.
  upsertObs: `
    INSERT INTO obs(bucket,directive,blocked,doc,policy_tag,mechanism,reports,ops,reports_incomplete)
    VALUES (?,?,?,?,?,?, MIN(?, ${LIMITS.REPORTS_HARD_CAP}), 1,
            MAX(?, CASE WHEN ? > ${LIMITS.REPORTS_HARD_CAP} THEN 1 ELSE 0 END))
    ON CONFLICT(bucket,directive,blocked,doc,policy_tag,mechanism) DO UPDATE SET
      reports            = reports + MIN(excluded.reports, MAX(${LIMITS.REPORTS_HARD_CAP} - reports, 0)),
      ops                = ops + MIN(1, MAX(${LIMITS.OPS_HARD_CAP} - ops, 0)),
      reports_incomplete = MAX(obs.reports_incomplete, MAX(excluded.reports_incomplete,
                             CASE WHEN excluded.reports > MAX(${LIMITS.REPORTS_HARD_CAP} - obs.reports, 0)
                                  THEN 1 ELSE 0 END))`,

  upsertLedger: `
    INSERT INTO obs_write_ledger(bucket, obs_rows, ledger_rows) VALUES (?, ?, 1)
    ON CONFLICT(bucket) DO UPDATE SET
      obs_rows    = obs_rows + excluded.obs_rows,
      ledger_rows = ledger_rows + 1`,
};

/** Reads `used = obs_rows + ledger_rows` for a bucket; a missing row counts as zero. */
export function readUsed(adapter, bucket) {
  const row = adapter.one(SQL.used, bucket);
  return { obsRows: row?.obs_rows ?? 0, ledgerRows: row?.ledger_rows ?? 0 };
}

/**
 * Merges the per-key increments that the overflow row will carry.
 *
 * Accumulation is item-by-item against the container bound, so no intermediate value can exceed it.
 * A clamp at this level, or on any contributing key, sets `incomplete`.
 */
export function accumulateOverflow(entries, { cap = LIMITS.MAX_OVERFLOW_REPORTS_PER_BATCH } = {}) {
  let total = 0;
  let incomplete = false;
  for (const entry of entries) {
    const delta = Math.max(0, Number(entry.reports) || 0);
    const room = Math.max(cap - total, 0);
    const take = Math.min(delta, room);
    if (take < delta) incomplete = true;         // container clamp
    if (entry.incomplete) incomplete = true;     // carried in from batch merging
    total += take;                               // total never exceeds cap
  }
  return { reports: total, incomplete };
}

/**
 * Builds the write plan for a bucket WITHOUT writing anything.
 *
 * The budget judgement happens here, before any statement runs, and it covers the WHOLE batch:
 * observation writes AND the ledger write. A batch that would cross the line writes nothing.
 */
export function planBatch(adapter, bucket, plan, {
  bucketRowCap = LIMITS.BUCKET_ROW_CAP,
  ingestBudget = LIMITS.INGEST_WRITE_BUDGET,
} = {}) {
  // (bucket, five enums) is the table's primary key, so a Map cannot hold duplicate keys.
  const entries = [...plan.entries()].map(([key, value]) => (
    typeof value === 'number'
      ? { key, reports: value, incomplete: false }
      : { key, reports: value?.reports ?? 0, incomplete: Boolean(value?.incomplete) }
  )).filter((entry) => entry.reports > 0);

  if (entries.length === 0) return { action: 'noop', reason: 'empty-plan' };

  const { obsRows, ledgerRows } = readUsed(adapter, bucket);
  const used = obsRows + ledgerRows;
  const normalRows = adapter.one(SQL.normalRows, bucket)?.c ?? 0;
  // The existing set must be read as concrete keys; a count cannot tell us which keys are present.
  const existingKeys = new Set(adapter.all(SQL.existing, bucket).map(
    (row) => [row.directive, row.blocked, row.doc, row.policy_tag, row.mechanism].join('|'),
  ));

  // Classification cap: existing + accepted together may not exceed the per-batch key budget.
  const classified = entries.slice(0, LIMITS.MAX_CLASSIFIED_KEYS_PER_BATCH);
  const droppedByClassification = entries.slice(LIMITS.MAX_CLASSIFIED_KEYS_PER_BATCH);

  const existing = classified.filter((entry) => existingKeys.has(entry.key));
  const fresh = classified.filter((entry) => !existingKeys.has(entry.key));
  const free = Math.max(bucketRowCap - normalRows, 0);
  const accepted = fresh.slice(0, free);
  const overCapacity = fresh.slice(free);

  // Everything that cannot keep its classification is summarised into the single overflow row:
  // keys that exceeded the per-batch classification cap AND keys with no bucket capacity left.
  const overflowEntries = [...overCapacity, ...droppedByClassification];
  const overflow = overflowEntries.length > 0
    ? accumulateOverflow(overflowEntries)
    : { reports: 0, incomplete: false };

  const plannedObsRows = existing.length + accepted.length + (overflow.reports > 0 ? 1 : 0);
  // The ledger row is a real row write and must be part of the budget decision.
  const plannedLedgerRows = 1;
  const plannedTotal = plannedObsRows + plannedLedgerRows;

  if (used + plannedTotal > ingestBudget) {
    return {
      action: 'reject',
      reason: 'ingest-budget',
      used,
      plannedObsRows,
      plannedLedgerRows,
      // Rejections are diagnostics for this call only: nothing is persisted for a rejected batch,
      // precisely so a rejection is never recorded by bypassing the budget it just hit.
      diagnostics: { droppedByClassification: droppedByClassification.length },
    };
  }

  return {
    action: 'commit',
    bucket,
    used,
    plannedObsRows,
    plannedLedgerRows,
    plannedTotal,
    existing,
    accepted,
    overflow,
    diagnostics: {
      droppedByClassification: droppedByClassification.length,
      overflowReports: overflow.reports,
      overflowIncomplete: overflow.incomplete,
    },
  };
}

/** Executes a plan in one transaction. Any throw rolls observation and ledger writes back together. */
export function commitBatch(adapter, request) {
  return adapter.transaction(() => {
    for (const entry of [...request.existing, ...request.accepted]) {
      const { directive, blocked, doc, policyTag, mechanism } = splitKey(entry.key);
      // `reports` appears twice: once as the clamped value, once for the insert-path clamp check.
      adapter.run(
        SQL.upsertObs,
        request.bucket, directive, blocked, doc, policyTag, mechanism,
        entry.reports, entry.incomplete ? 1 : 0, entry.reports,
      );
    }
    if (request.overflow.reports > 0) {
      adapter.run(
        SQL.upsertObs,
        request.bucket, OVERFLOW, OVERFLOW, OVERFLOW, OVERFLOW, OVERFLOW,
        request.overflow.reports, request.overflow.incomplete ? 1 : 0, request.overflow.reports,
      );
    }
    // One ledger row per successful non-empty batch; it is counted in its own column.
    adapter.run(SQL.upsertLedger, request.bucket, request.plannedObsRows);
    return { ok: true };
  });
}

/** Convenience wrapper: plan, then commit when the budget allows. */
export function ingest(adapter, timestampMs, plan, options = {}) {
  const bucket = bucketFor(timestampMs);
  const request = planBatch(adapter, bucket, plan, options);
  if (request.action !== 'commit') return request;
  commitBatch(adapter, request);
  return request;
}

/** Idempotent retention cleanup. Deletes observation and ledger rows together, in one transaction. */
export function cleanup(adapter, timestampMs, {
  retentionDays = LIMITS.RETENTION_DAYS,
  failAfterPartialWrites = false,
} = {}) {
  const today = bucketFor(timestampMs);
  const threshold = retentionThreshold(today, retentionDays);
  return adapter.transaction(() => {
    const obsDeleted = adapter.run('DELETE FROM obs WHERE bucket < ?', threshold).changes;
    if (failAfterPartialWrites) throw new Error('injected cleanup failure after partial writes');
    const ledgerDeleted = adapter.run('DELETE FROM obs_write_ledger WHERE bucket < ?', threshold).changes;
    adapter.run(`INSERT INTO meta(k,v) VALUES('last_cleaned_bucket',?)
                 ON CONFLICT(k) DO UPDATE SET v = excluded.v`, today);
    return { ok: true, threshold, obsDeleted, ledgerDeleted };
  });
}
