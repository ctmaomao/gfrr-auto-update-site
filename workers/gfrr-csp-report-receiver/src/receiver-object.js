// Durable Object holding the aggregated observations.
//
// LOCAL PHASE: written and reviewed, NOT deployed (stage B needs its own authorization).
//
// The object deliberately holds all writes to ONE instance: the design uses a single object rather
// than a sharded set, because there is no load evidence that sharding is needed and a single object
// keeps the update path serial and the key space bounded.
//
// Storage model (see storage.js for the SQL):
//   obs                one row per normalised key, plus a single overflow row per bucket
//   obs_write_ledger   obs_rows + ledger_rows for the bucket; `used` is their sum
//   meta               schema version, retention, cleanup watermark and start marker
//
// The budget checked here is an application-side INGEST budget. It is not a platform reservation,
// it does not cap total platform spend, and it cannot speak for other workers on the account.
import { LIMITS, bucketFor } from './constants.js';
import { evaluateHealth } from './health.js';
import { applySchema, cleanup, commitBatch, planBatch, readUsed } from './storage.js';

export class CspReceiverObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.ready = false;
  }

  /** Creates the schema and the first cleanup alarm once per object lifetime. */
  async initialise() {
    if (this.ready) return;
    applySchema(this.sql);
    // INSERT OR IGNORE: a restart must not reset the cleanup watermark or any failure marker.
    for (const [key, value] of [
      ['schema_version', '1'],
      ['retention_days', String(LIMITS.RETENTION_DAYS)],
      ['cleanup_started_at', ''],
      ['last_cleaned_bucket', ''],
      ['cleanup_attempts', '0'],
    ]) {
      this.sql.prepare(`INSERT OR IGNORE INTO meta(k,v) VALUES(?,?)`).run(key, value);
    }
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(nextCleanupAt(Date.now()));
    }
    this.ready = true;
  }

  /**
   * Plans and commits one batch. Planning happens before any write, and the budget decision covers
   * the whole batch.
   */
  async ingest({ entries, receivedAt }) {
    await this.initialise();
    const bucket = bucketFor(receivedAt);
    const plan = new Map(entries);
    const request = planBatch(this.sql, bucket, plan);
    if (request.action !== 'commit') return request;
    try {
      commitBatch(this.sql, request);
    } catch (error) {
      // Nothing is persisted for a failed batch: both observation and ledger writes roll back.
      return { action: 'error', reason: 'commit-failed', message: String(error?.message ?? error) };
    }
    return {
      action: 'commit',
      stored: request.plannedObsRows,
      overflowReports: request.overflow.reports,
      diagnostics: request.diagnostics,
    };
  }

  /** Alarm handler: idempotent retention cleanup, then scheduling the next run. */
  async alarm() {
    await this.initialise();
    const now = Date.now();
    this.sql.prepare(`INSERT INTO meta(k,v) VALUES('cleanup_started_at',?)
                      ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(String(now));
    try {
      cleanup(this.sql, now, {
        retentionDays: Number(this.sql.prepare("SELECT v FROM meta WHERE k='retention_days'").get()?.v ?? LIMITS.RETENTION_DAYS),
      });
      // Success clears the start marker so a stale value cannot look like an in-flight run.
      this.sql.prepare(`UPDATE meta SET v = '' WHERE k = 'cleanup_started_at'`).run();
      this.sql.prepare(`INSERT INTO meta(k,v) VALUES('cleanup_completed_at',?)
                        ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(String(now));
      this.sql.prepare(`INSERT INTO meta(k,v) VALUES('cleanup_attempts','0')
                        ON CONFLICT(k) DO UPDATE SET v = '0'`).run();
    } catch (error) {
      // The failure counter is best effort; the ORIGINAL error is always rethrown so the platform's
      // own limited retry still happens and the failure is not swallowed.
      try {
        this.sql.prepare(`INSERT INTO meta(k,v) VALUES('cleanup_attempts','1')
                          ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT)`).run();
        this.sql.prepare(`INSERT INTO meta(k,v) VALUES('last_error',?)
                          ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(String(error?.message ?? error));
      } catch {
        // Ignored on purpose: recording the failure must never mask the failure itself.
      }
      throw error;
    } finally {
      // Schedule the next run whether or not cleanup succeeded; a failed run keeps the marker so the
      // external check can tell "in flight" from "stuck".
      await this.ctx.storage.setAlarm(nextCleanupAt(now + 24 * 60 * 60 * 1000));
    }
  }

  /** Read-only health. A read failure is reported as "cannot confirm", never as healthy. */
  async health({ now }) {
    try {
      await this.initialise();
      const read = (key) => this.sql.prepare('SELECT v FROM meta WHERE k = ?').get(key)?.v ?? null;
      const lastCleaned = read('last_cleaned_bucket');
      const startedAt = read('cleanup_started_at');
      const alarmAt = await this.ctx.storage.getAlarm();
      const used = readUsed(this.sql, bucketFor(now));
      return {
        ...evaluateHealth({
          now,
          lastCleanedBucket: lastCleaned || null,
          cleanupStartedAt: startedAt ? Number(startedAt) : null,
          alarmAt: alarmAt ?? null,
        }),
        ingestUsed: used.obsRows + used.ledgerRows,
        ingestBudget: LIMITS.INGEST_WRITE_BUDGET,
      };
    } catch (error) {
      return { status: 'unknown', alerts: ['cannot-confirm'], message: String(error?.message ?? error) };
    }
  }
}

/** Next daily cleanup instant, in milliseconds. */
export function nextCleanupAt(fromMs) {
  const day = bucketFor(fromMs);
  return Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000 + 10 * 60 * 1000;
}
