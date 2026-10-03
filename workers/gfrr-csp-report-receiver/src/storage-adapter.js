// Storage adapter: one small interface over two real implementations.
//
// The receiver must run on both, with identical SQL:
//   * Cloudflare Durable Objects expose `ctx.storage.sql.exec(query, ...bindings)`, which returns a
//     cursor synchronously, and forbid SQL transaction-control statements (`BEGIN`, `COMMIT`,
//     `ROLLBACK`, `SAVEPOINT`). Transactions there come from `ctx.storage.transactionSync(cb)`.
//   * `node:sqlite` (used by the local phase) exposes `prepare(sql)` plus `exec(sql)`, and needs
//     explicit `BEGIN`/`COMMIT`/`ROLLBACK`.
//
// Keeping that difference in one adapter is what lets the local tests exercise the real SQL while
// the deployed object uses the platform API, without duplicating any statement.
//
// Interface used by storage.js / receiver-object.js:
//   run(sql, ...bindings)        -> { changes }
//   one(sql, ...bindings)        -> row object or null
//   all(sql, ...bindings)        -> array of row objects
//   exec(sql)                    -> executes a statement with no bindings and no result
//   transaction(fn)              -> runs fn synchronously, atomically

/** Adapter for Cloudflare Durable Object SQL. Transactions use the platform API. */
export function createDurableObjectAdapter(storage) {
  const sql = storage.sql;
  return {
    run(statement, ...bindings) {
      const cursor = sql.exec(statement, ...bindings);
      // The Cloudflare cursor exposes rowsWritten; a plain write reports no columns.
      return { changes: cursor?.rowsWritten ?? 0 };
    },
    one(statement, ...bindings) {
      const rows = [...sql.exec(statement, ...bindings)];
      return rows.length > 0 ? rows[0] : null;
    },
    all(statement, ...bindings) {
      return [...sql.exec(statement, ...bindings)];
    },
    exec(statement) {
      sql.exec(statement);
    },
    transaction(fn) {
      // The callback must be synchronous; every storage call inside is.
      return storage.transactionSync(fn);
    },
  };
}

/**
 * Adapter for `node:sqlite`, used by the local tests. It deliberately mimics the Cloudflare
 * semantics (synchronous execution, a transaction wrapper) so the same statements run unchanged.
 */
export function createNodeSqliteAdapter(db) {
  return {
    run(statement, ...bindings) {
      const result = db.prepare(statement).run(...bindings);
      return { changes: Number(result?.changes ?? 0) };
    },
    one(statement, ...bindings) {
      return db.prepare(statement).get(...bindings) ?? null;
    },
    all(statement, ...bindings) {
      return db.prepare(statement).all(...bindings);
    },
    exec(statement) {
      db.exec(statement);
    },
    transaction(fn) {
      db.exec('BEGIN');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
