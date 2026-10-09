// Durable Object holding the aggregated observations.
//
// Deployment and verification status live in docs/PROJECT_BACKLOG.md. Further stage B platform
// changes and stage C production reporting each require separate authorization.
//
// The object deliberately holds all writes in ONE instance: there is no load evidence that sharding
// is needed, and a single object keeps the update path serial and the key space bounded.
//
// Platform specifics are isolated here:
//   * storage goes through `createDurableObjectAdapter`, so the SQL in storage.js runs unchanged
//     against the Durable Object SQL API (which has no `prepare()` and forbids BEGIN/COMMIT);
//   * atomicity comes from `storage.transactionSync()`, exposed through the adapter;
//   * `ctx.storage.getAlarm()` / `setAlarm()` drive the daily cleanup.
import { LIMITS, bucketFor, CLEANUP_AT_UTC_MINUTE } from './constants.js';
import { evaluateHealth } from './health.js';
import { createDurableObjectAdapter } from './storage-adapter.js';
import { applySchema, cleanup, commitBatch, META_DEFAULTS, planBatch, readUsed, SQL } from './storage.js';

/**
 * Next daily cleanup instant.
 *
 * If today's slot is still ahead, that is the next run; otherwise the run belongs to the following
 * day. Advancing by exactly one day from the day boundary — never two — is asserted by a regression.
 */
export function nextCleanupAt(fromMs) {
  const base = Date.parse(`${bucketFor(fromMs)}T00:00:00.000Z`);
  const todaySlot = base + CLEANUP_AT_UTC_MINUTE * 60 * 1000;
  return todaySlot > fromMs ? todaySlot : todaySlot + 24 * 60 * 60 * 1000;
}

/**
 * Builds the Durable Object class over a supplied base class.
 *
 * The base class is injected rather than imported so the SAME implementation serves both runtimes:
 * the Worker entry passes the platform's `DurableObject` (required for `stub.ingest()` /
 * `stub.health()` to work as RPC), while the local tests pass a plain class and keep exercising the
 * logic in Node without a Workers runtime.
 */
export function createCspReceiverObject(Base) {
  return class CspReceiverObject extends Base {
    constructor(ctx, env) {
      super(ctx, env);
      this.ctx = ctx;
      this.env = env;
      this.adapter = createDurableObjectAdapter(ctx.storage);
      this.schemaReady = false;
    }

    /** Creates tables and seeds missing meta keys. Writes only what is absent, never overwrites. */
    ensureSchema() {
      if (this.schemaReady) return;
      applySchema(this.adapter);
      for (const [key, value] of META_DEFAULTS) {
        this.adapter.run(SQL.insertMeta, key, value);
      }
      this.schemaReady = true;
    }

    /** Schedules the daily cleanup if none is pending. Only the ingest path calls this. */
    async ensureAlarm(now = Date.now()) {
      if ((await this.ctx.storage.getAlarm()) === null) {
        await this.ctx.storage.setAlarm(nextCleanupAt(now));
      }
    }

    /** Plans and commits one batch. The budget decision covers the whole batch, ledger included. */
    async ingest({ entries, receivedAt }) {
      this.ensureSchema();
      await this.ensureAlarm(receivedAt);
      const bucket = bucketFor(receivedAt);
      const request = planBatch(this.adapter, bucket, new Map(entries));
      if (request.action !== 'commit') return request;
      try {
        commitBatch(this.adapter, request);
      } catch (error) {
        // Nothing is persisted for a failed batch: the transaction rolls both tables back.
        return { action: 'error', reason: 'commit-failed', message: String(error?.message ?? error) };
      }
      return {
        action: 'commit',
        stored: request.plannedObsRows,
        overflowReports: request.overflow.reports,
        diagnostics: request.diagnostics,
      };
    }

    /** Alarm handler: idempotent cleanup, then schedule the next run even if it failed. */
    async alarm() {
      this.ensureSchema();
      const now = Date.now();
      this.adapter.run(`INSERT INTO meta(k,v) VALUES('cleanup_started_at',?)
                        ON CONFLICT(k) DO UPDATE SET v = excluded.v`, String(now));

      let cleanupError = null;
      try {
        const retentionDays = Number(
          this.adapter.one("SELECT v FROM meta WHERE k='retention_days'")?.v ?? LIMITS.RETENTION_DAYS,
        );
        cleanup(this.adapter, now, { retentionDays });
        // Success clears the start marker so a stale value cannot look like an in-flight run.
        this.adapter.run(`UPDATE meta SET v = '' WHERE k = 'cleanup_started_at'`);
        this.adapter.run(`INSERT INTO meta(k,v) VALUES('cleanup_completed_at',?)
                          ON CONFLICT(k) DO UPDATE SET v = excluded.v`, String(now));
        this.adapter.run(`INSERT INTO meta(k,v) VALUES('cleanup_attempts','0')
                          ON CONFLICT(k) DO UPDATE SET v = '0'`);
      } catch (error) {
        cleanupError = error;
        // Best effort only: recording the failure must never replace the failure itself.
        try {
          this.adapter.run(`INSERT INTO meta(k,v) VALUES('cleanup_attempts','1')
                            ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT)`);
          this.adapter.run(`INSERT INTO meta(k,v) VALUES('last_error',?)
                            ON CONFLICT(k) DO UPDATE SET v = excluded.v`, String(error?.message ?? error));
        } catch {
          // Ignored on purpose.
        }
      }

      let scheduleError = null;
      try {
        await this.ctx.storage.setAlarm(nextCleanupAt(now));
      } catch (error) {
        scheduleError = error;
      }

      if (cleanupError) {
        // The cleanup failure stays the primary error; a scheduling failure is attached, not swapped in.
        if (scheduleError) cleanupError.scheduleError = String(scheduleError?.message ?? scheduleError);
        throw cleanupError;
      }
      if (scheduleError) throw scheduleError;
    }

    /**
     * Read-only health: ZERO storage writes and ZERO schedule repair.
     *
     * An earlier revision called `ensureSchema()` here. That was wrong even though it only used
     * `CREATE TABLE IF NOT EXISTS` and `INSERT OR IGNORE`: creating tables and seeding five meta keys
     * IS a write, and "does not overwrite existing values" is not the same as "does not write".
     * A health check that mutates storage can also hide the scheduling loss it exists to report.
     *
     * The fresh-object case is handled by probing for the tables instead of creating them:
     *   * no tables yet  -> `uninitialized`, which is a distinct state and NOT health;
     *   * tables present -> the normal evaluation;
     *   * a real read failure -> `unknown` / `cannot-confirm`, never masked as health.
     */
    async health({ now, inspect = false }) {
      let lastCleaned = null;
      let startedAt = null;
      try {
        if (!this.tablesPresent()) {
          return {
            status: 'uninitialized',
            alerts: ['not-initialized'],
            message: 'no tables yet: the object has never ingested a report',
          };
        }
        lastCleaned = this.adapter.one("SELECT v FROM meta WHERE k='last_cleaned_bucket'")?.v ?? null;
        startedAt = this.adapter.one("SELECT v FROM meta WHERE k='cleanup_started_at'")?.v ?? null;
      } catch (error) {
        return { status: 'unknown', alerts: ['cannot-confirm'], message: String(error?.message ?? error) };
      }

      try {
        const alarmAt = await this.ctx.storage.getAlarm();
        const used = readUsed(this.adapter, bucketFor(now));
        // Opt-in operational evidence only; the default health payload stays unchanged.
        // Return raw meta values, including null for absent keys, rather than inventing dates.
        const observations = inspect ? {
          contract: 'csp-retention-inspection-v1', observedAt: now, alarmAt: alarmAt ?? null,
          ...Object.fromEntries(this.adapter.all(
            "SELECT k,v FROM meta WHERE k IN ('last_cleaned_bucket','cleanup_completed_at','cleanup_started_at','cleanup_attempts','retention_days')",
          ).map(row => [row.k, row.v])),
        } : null;
        if (observations) {
          for (const key of ['last_cleaned_bucket', 'cleanup_completed_at', 'cleanup_started_at', 'cleanup_attempts', 'retention_days']) {
            observations[key] ??= null;
          }
        }
        return {
          ...evaluateHealth({
            now,
            lastCleanedBucket: lastCleaned || null,
            cleanupStartedAt: startedAt ? Number(startedAt) : null,
            alarmAt: alarmAt ?? null,
          }),
          ingestUsed: used.obsRows + used.ledgerRows,
          ingestBudget: LIMITS.INGEST_WRITE_BUDGET,
          ...(observations ? { observations } : {}),
        };
      } catch (error) {
        return { status: 'unknown', alerts: ['cannot-confirm'], message: String(error?.message ?? error) };
      }
    }

    /** True when the observation tables exist. Pure read: it never creates anything. */
    tablesPresent() {
      const row = this.adapter.one(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'obs'",
      );
      return (row?.c ?? 0) > 0;
    }
  };
}
