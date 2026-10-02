// Storage layer: schema, ingest planning and the synchronous commit path.
//
// The driver interface is the small subset shared by `node:sqlite` (`DatabaseSync`) and the
// Durable Object SQL API: `exec(sql)` plus `prepare(sql)` returning `{ run, get, all }`. That is
// what lets the local phase exercise the real SQLite semantics without extra dependencies.
//
// Two accounting numbers are deliberately separate:
//   obs_rows    = the sum of committed observation row updates
//   ledger_rows = the number of successful non-empty batches
// `used = obs_rows + ledger_rows` is what the INGEST budget checks. It is an application-side
// ingest budget only: it is not a platform reservation and not a cap on total platform spend.
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

export function applySchema(db) {
  for (const statement of SCHEMA) db.exec(statement);
}

/** Splits a normalised key back into its five enum dimensions. */
export function splitKey(key) {
  const [directive, blocked, doc, policyTag, mechanism] = key.split('|');
  return { directive, blocked, doc, policyTag, mechanism };
}

export const SQL = {
  used: `SELECT obs_rows, ledger_rows FROM obs_write_ledger WHERE bucket = ?`,
  normalRows: `SELECT COUNT(*) AS c FROM obs WHERE bucket = ? AND directive <> '${OVERFLOW}'`,
  existing: `SELECT directive, blocked, doc, policy_tag, mechanism FROM obs WHERE bucket = ?`,  overflowExists: `SELECT 1 AS present FROM obs WHERE bucket = ? AND directive = '${OVERFLOW}'`,

  // Saturation is expressed in SQL so the stored value can never exceed its cap, and the
  // "incomplete" flag is raised whenever the applied increment was clamped. The flag only ever
  // goes 0 -> 1 because MAX() is used on both paths.
  upsertNormal: `
    INSERT INTO obs(bucket,directive,blocked,doc,policy_tag,mechanism,reports,ops,reports_incomplete)
    VALUES (?,?,?,?,?,?, MIN(?, ${LIMITS.REPORTS_HARD_CAP}), 1, ?)
    ON CONFLICT(bucket,directive,blocked,doc,policy_tag,mechanism) DO UPDATE SET
      reports            = reports + MIN(excluded.reports, MAX(${LIMITS.REPORTS_HARD_CAP} - reports, 0)),
      ops                = ops + MIN(1, MAX(${LIMITS.OPS_HARD_CAP} - ops, 0)),
      reports_incomplete = MAX(obs.reports_incomplete, MAX(excluded.reports_incomplete,
                             CASE WHEN excluded.reports > MAX(${LIMITS.REPORTS_HARD_CAP} - obs.reports, 0)
                                  THEN 1 ELSE 0 END))`,

  upsertOverflow: `
    INSERT INTO obs(bucket,directive,blocked,doc,policy_tag,mechanism,reports,ops,reports_incomplete)
    VALUES (?, '${OVERFLOW}','${OVERFLOW}','${OVERFLOW}','${OVERFLOW}','${OVERFLOW}', MIN(?, ${LIMITS.REPORTS_HARD_CAP}), 1, ?)
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
export function readUsed(db, bucket) {
  const row = db.prepare(SQL.used).get(bucket);
  return { obsRows: row?.obs_rows ?? 0, ledgerRows: row?.ledger_rows ?? 0 };
}

/**
 * Merges the per-key increments that the overflow row will carry.
 *
 * Accumulation is item-by-item against the container bound, so no intermediate value can exceed it.
 * A clamped item sets `incomplete`, which is also raised when any contributing key was already
 * flagged (including a per-key clamp that happened during batch merging).
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
 * Budget judgement happens here, before any statement runs, and it decides on the WHOLE batch
 * (`used + plannedObsRows`) rather than on the current value alone. The ledger row is counted in
 * its own right.
 */
export function planBatch(db, bucket, plan, { bucketRowCap = LIMITS.BUCKET_ROW_CAP, ingestBudget = LIMITS.INGEST_WRITE_BUDGET } = {}) {
  // (bucket, five enums) is already the table's primary key, so a Map cannot hold duplicates.
  const entries = [...plan.entries()].map(([key, reports]) => ({ key, reports }));
  if (entries.length === 0) return { action: 'noop', reason: 'empty-plan' };

  const { obsRows, ledgerRows } = readUsed(db, bucket);
  const used = obsRows + ledgerRows;
  const normalRows = db.prepare(SQL.normalRows).get(bucket)?.c ?? 0;
  // The existing set must be read as concrete keys; a count cannot tell us which keys are present.
  const existingKeys = new Set(db.prepare(SQL.existing).all(bucket).map(
    (row) => [row.directive, row.blocked, row.doc, row.policy_tag, row.mechanism].join('|'),
  ));
  const overflowExists = db.prepare(SQL.overflowExists).get(bucket) !== undefined;

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
  const plannedLedgerRows = 1;

  if (used + plannedObsRows > ingestBudget) {
    return {
      action: 'reject',
      reason: 'ingest-budget',
      used,
      plannedObsRows,
      // Rejections are diagnostics for this call only: nothing is persisted for a rejected batch,
      // precisely so the rejection cannot be recorded by bypassing the budget it just hit.
      diagnostics: { droppedByClassification: droppedByClassification.length },
    };
  }

  return {
    action: 'commit',
    bucket,
    used,
    plannedObsRows,
    plannedLedgerRows,
    existing,
    accepted,
    overflow,
    overflowExists,
    diagnostics: {
      droppedByClassification: droppedByClassification.length,
      overflowReports: overflow.reports,
      overflowIncomplete: overflow.incomplete,
    },
  };
}

/**
 * Executes a plan inside a single synchronous transaction. Any throw rolls back observation and
 * ledger writes together.
 */
export function commitBatch(db, request) {
  // Callers pass a plan produced by planBatch; the transaction is the atomicity boundary.
  db.exec('BEGIN');
  try {
    for (const entry of [...request.existing, ...request.accepted]) {
      const { directive, blocked, doc, policyTag, mechanism } = splitKey(entry.key);
      db.prepare(SQL.upsertNormal).run(
        request.bucket, directive, blocked, doc, policyTag, mechanism,
        entry.reports, entry.incomplete ? 1 : 0,
      );
    }
    if (request.overflow.reports > 0) {
      db.prepare(SQL.upsertOverflow).run(
        request.bucket, request.overflow.reports, request.overflow.incomplete ? 1 : 0,
      );
    }
    // One ledger row per successful non-empty batch; it is counted in its own column.
    db.prepare(SQL.upsertLedger).run(request.bucket, request.plannedObsRows);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Convenience wrapper used by the receiver entry: plan, then commit when allowed. */
export function ingest(db, timestampMs, plan, options = {}) {
  const bucket = bucketFor(timestampMs);
  const request = planBatch(db, bucket, plan, options);
  if (request.action !== 'commit') return request;
  commitBatch(db, request);
  return request;
}

/** Idempotent retention cleanup. Deletes observation and ledger rows together. */
export function cleanup(db, timestampMs, { retentionDays = LIMITS.RETENTION_DAYS, failAfterPartialWrites = false } = {}) {
  const today = bucketFor(timestampMs);
  const threshold = retentionThreshold(today, retentionDays);
  db.exec('BEGIN');
  try {
    const obsDeleted = db.prepare('DELETE FROM obs WHERE bucket < ?').run(threshold).changes;
    if (failAfterPartialWrites) throw new Error('injected cleanup failure after partial writes');
    const ledgerDeleted = db.prepare('DELETE FROM obs_write_ledger WHERE bucket < ?').run(threshold).changes;
    db.prepare(`INSERT INTO meta(k,v) VALUES('last_cleaned_bucket',?)
               ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(today);
    db.exec('COMMIT');
    return { ok: true, threshold, obsDeleted: Number(obsDeleted ?? 0), ledgerDeleted: Number(ledgerDeleted ?? 0) };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
