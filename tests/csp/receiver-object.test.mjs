// Batch planning, truncation, transaction rollback, cleanup, alarm scheduling and health.
//
// Local phase (D-C): real SQLite via `node:sqlite` through the same storage adapter the Durable
// Object uses, plus a minimal alarm/context simulation for the application-side behaviour.
// Platform metering, quota, real alarm retry and billing are NOT covered here (stage B).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LIMITS, addDays, bucketFor } from '../../workers/gfrr-csp-report-receiver/src/constants.js';
import {
  applySchema, cleanup, commitBatch, ingest, planBatch, readUsed, splitKey,
} from '../../workers/gfrr-csp-report-receiver/src/storage.js';
import { createNodeSqliteAdapter } from '../../workers/gfrr-csp-report-receiver/src/storage-adapter.js';
import {
  buildPlan, buildPolicyTable, mapBlocked, mapDirective, mapDoc, readBodyWithinLimit,
} from '../../workers/gfrr-csp-report-receiver/src/normalize.js';
import { CspReceiverObject, nextCleanupAt } from '../../workers/gfrr-csp-report-receiver/src/receiver-object.js';
import { evaluateHealth } from '../../workers/gfrr-csp-report-receiver/src/health.js';

const fresh = () => {
  const db = new DatabaseSync(':memory:');
  const adapter = createNodeSqliteAdapter(db);
  applySchema(adapter);
  return { db, adapter };
};

const TODAY = '2026-10-10';
const at = (bucket) => Date.parse(`${bucket}T00:00:00.000Z`);

const legacy = ({
  directive = 'script-src',
  blocked = 'inline',
  document = 'https://radar.gfrfinradar.uk/index.html',
  policy,
  extra = {},
} = {}) => ({
  'csp-report': {
    'effective-directive': directive,
    'blocked-uri': blocked,
    'document-uri': document,
    ...(policy === undefined ? {} : { 'original-policy': policy }),
    ...extra,
  },
});

const reportingItem = ({ directive = 'script-src', blocked = 'inline', document = 'https://x.test/index.html', extra = {} } = {}) => ({
  type: 'csp-violation',
  body: { effectiveDirective: directive, blockedURL: blocked, documentURL: document, ...extra },
});

const keyOf = (directive, blocked, doc, policyTag = 'unknown', mechanism = 'legacy') =>
  [directive, blocked, doc, policyTag, mechanism].join('|');

const planOf = (entries) => new Map(entries.map(([key, reports]) => [
  key,
  typeof reports === 'number' ? { reports, incomplete: false } : reports,
]));

/**
 * Blocked values paired with the page they are judged against. `cross-origin` cannot be produced
 * without a page origin to compare with, so each raw value carries its own document.
 */
const BLOCKED_SAMPLES = [
  ['inline', 'https://x.test/index.html'],
  ['self', 'https://x.test/index.html'],
  ['https://evil.example/x', 'https://x.test/index.html'],
  ['eval', 'https://x.test/index.html'],
  ['data:font/woff', 'https://x.test/index.html'],
  ['not-a-uri', 'https://x.test/index.html'],
];

/**
 * Enumerates the NORMALISED key space for normal rows for BOTH mechanisms, by running every
 * combination of the closed enums through the real normalisation. `policy_tag` is `unknown` here
 * only because the known policy table is empty in local tests.
 */
const keySpace = (mechanisms = ['legacy', 'reporting']) => {
  const directives = ['script-src', 'script-src-attr', 'style-src-elem', 'style-src-attr', 'other'];
  const docs = ['index', 'bubble-watch', 'other'];
  const keys = new Set();
  for (const mechanism of mechanisms) {
    for (const doc of docs) {
      for (const [blockedRaw, baseDocument] of BLOCKED_SAMPLES) {
        const document = baseDocument.replace('index.html', doc === 'index' ? 'index.html' : `${doc}.html`);
        for (const directive of directives) {
          keys.add(keyOf(
            mapDirective(directive), mapBlocked(blockedRaw, document), mapDoc(document), 'unknown', mechanism,
          ));
        }
      }
    }
  }
  return [...keys].sort();
};

const payloadForKeys = (keys) => {
  const rawBlocked = {
    inline: 'inline',
    self: 'self',
    'cross-origin': 'https://evil.example/x',
    eval: 'eval',
    data: 'data:font/woff',
    other: 'not-a-uri',
  };
  const docFor = (doc) => (doc === 'index' ? 'index.html' : `${doc}.html`);
  return keys.map((key) => {
    const { directive, blocked, doc } = splitKey(key);
    return reportingItem({ directive, blocked: rawBlocked[blocked] ?? 'not-a-uri', document: `https://x.test/${docFor(doc)}` });
  });
};

// ---------------------------------------------------------------------------
// Parsing, gating and normalisation
// ---------------------------------------------------------------------------

test('a legacy payload needs no Reporting API wrapper or type field', () => {
  const { plan, malformed } = buildPlan(legacy());
  assert.equal(malformed, false);
  assert.equal(plan.size, 1);
});

test('a Reporting API payload keeps only csp-violation items', () => {
  const payload = [
    reportingItem({ directive: 'script-src' }),
    { type: 'deprecation', body: {} },
    reportingItem({ directive: 'style-src-attr', document: 'https://x.test/bubble-watch.html' }),
  ];
  const { plan, diagnostics } = buildPlan(payload);
  assert.equal(plan.size, 2);
  assert.equal(diagnostics.droppedNotCsp, 1);
});

test('the array item limit is enforced and reported', () => {
  const payload = Array.from({ length: LIMITS.MAX_ARRAY_ITEMS + 1 }, () => reportingItem());
  const { plan, diagnostics } = buildPlan(payload);
  assert.equal(diagnostics.droppedArrayOverflow, 1, 'items beyond the array limit must be reported');
  // All the considered items collapse to one key, so the count is what proves the bound.
  assert.equal(plan.get(keyOf('script-src', 'inline', 'index', 'unknown', 'reporting')).reports,
    LIMITS.MAX_ARRAY_ITEMS);
});

test('a report without a usable effective directive is rejected', () => {
  const empty = buildPlan({ 'csp-report': {} });
  assert.equal(empty.plan.size, 0, 'an empty csp-report must not produce a plan');
  assert.equal(empty.diagnostics.droppedMissingDirective, 1);

  const reporting = buildPlan([{ type: 'csp-violation', body: { disposition: 'report' } }]);
  assert.equal(reporting.plan.size, 0);
  assert.equal(reporting.diagnostics.droppedMissingDirective, 1);

  const numeric = buildPlan({ 'csp-report': { 'effective-directive': 123 } });
  assert.equal(numeric.plan.size, 0, 'a non-string directive is not classifiable');
  assert.equal(numeric.diagnostics.droppedMissingDirective, 1);
});

test('a non-object body is rejected rather than treated as an empty report', () => {
  const stringBody = buildPlan([{ type: 'csp-violation', body: 'nope' }]);
  assert.equal(stringBody.plan.size, 0);
  assert.equal(stringBody.diagnostics.droppedBodyShape, 1);

  const numberBody = buildPlan([{ type: 'csp-violation', body: 42 }]);
  assert.equal(numberBody.plan.size, 0);

  const legacyString = buildPlan({ 'csp-report': 'nope' });
  assert.equal(legacyString.malformed, true, 'a string inside csp-report is malformed');
});

test('normalisation happens before key counting, so raw values cannot exhaust the key budget', () => {
  const payload = Array.from({ length: 50 }, (_, index) =>
    reportingItem({ directive: `evil-${index}`, blocked: `evil-${index}` }));
  const { plan } = buildPlan(payload);
  assert.equal(plan.size, 1, 'raw variety must not inflate the normalised key count');
  assert.equal(plan.get(keyOf('other', 'other', 'index', 'unknown', 'reporting')).reports, 50);
});

test('the reachable key space is smaller than the declared input-key and bucket caps', () => {
  const both = keySpace();
  const perMechanism = both.length / 2;
  // 5 directives x 6 blocked x 3 docs = 90 per mechanism; 180 across both.
  assert.equal(perMechanism, 90);
  assert.equal(both.length, 180);

  // Both candidate caps are above the reachable space, so neither can be hit through the normal
  // path today. The capacity branch is covered by injecting `bucketRowCap`, which proves that
  // value only — NOT that the default 512 is reachable.
  assert.ok(both.length < LIMITS.BUCKET_ROW_CAP, `key space ${both.length} vs BUCKET_ROW_CAP`);
  assert.ok(both.length < LIMITS.MAX_INPUT_KEYS_PER_BATCH, `key space ${both.length} vs MAX_INPUT_KEYS`);
});

test('the distinct-key bound keeps exactly the declared number of keys', () => {
  const keys = keySpace(['reporting']);
  assert.equal(keys.length, 90);
  const { plan, diagnostics } = buildPlan(payloadForKeys(keys));
  assert.equal(plan.size, Math.min(keys.length, LIMITS.MAX_INPUT_KEYS_PER_BATCH));
  assert.equal(diagnostics.droppedKeys, Math.max(keys.length - LIMITS.MAX_INPUT_KEYS_PER_BATCH, 0));
});

test('field handling differs by kind: reject, ignore, and never truncate-then-classify', () => {
  const tooLong = 'x'.repeat(LIMITS.MAX_FIELD_LENGTH + 1);

  const critical = buildPlan(legacy({ extra: { 'effective-directive': tooLong } }));
  assert.equal(critical.plan.size, 0, 'a critical classification field that is too long rejects the item');
  assert.equal(critical.diagnostics.droppedCriticalField, 1);

  const url = buildPlan(legacy({ extra: { 'blocked-uri': tooLong } }));
  assert.equal(url.plan.size, 0, 'an over-long URL field is rejected, not truncated');
  assert.equal(url.diagnostics.droppedUrlField, 1);

  const optional = buildPlan(legacy({ extra: { sample: tooLong, referrer: tooLong } }));
  assert.equal(optional.plan.size, 1, 'fields that are never stored are ignored outright');
  assert.equal(optional.diagnostics.droppedCriticalField, 0);
});

test('the byte gate stops reading and needs no Content-Length', async () => {
  const chunk = new Uint8Array(1024).fill(120);
  let read = 0;
  const body = {
    getReader: () => ({
      async read() {
        if (read >= 100) return { done: true };
        read += 1;
        return { done: false, value: chunk };
      },
      async cancel() {},
    }),
  };
  const result = await readBodyWithinLimit(body, 16 * 1024);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'body-too-large');
  assert.ok(read < 100, 'reading stops at the limit instead of draining the stream');
});

test('a body within the limit is decoded fully', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(legacy()));
  let done = false;
  const body = {
    getReader: () => ({
      async read() {
        if (done) return { done: true };
        done = true;
        return { done: false, value: bytes };
      },
      async cancel() {},
    }),
  };
  const result = await readBodyWithinLimit(body, 64 * 1024);
  assert.equal(result.ok, true);
  assert.equal(buildPlan(JSON.parse(result.text)).plan.size, 1);
});

// ---------------------------------------------------------------------------
// Storage behaviour
// ---------------------------------------------------------------------------

test('existing keys keep being updated and are never dropped', () => {
  const { adapter } = fresh();
  const key = keyOf('script-src', 'inline', 'index');
  commitBatch(adapter, planBatch(adapter, TODAY, planOf([[key, 5]])));
  const second = planBatch(adapter, TODAY, planOf([[key, 7]]));
  assert.equal(second.existing.length, 1);
  commitBatch(adapter, second);
  const row = adapter.one('SELECT reports, ops FROM obs WHERE directive = ?', 'script-src');
  assert.equal(row.reports, 12);
  assert.equal(row.ops, 2);
});

test('a full bucket folds new keys into a single overflow row and counts one row write', () => {
  const { adapter } = fresh();
  const CAP = 4;
  const seeded = keySpace(['legacy']).slice(0, CAP);
  for (const key of seeded) {
    const { directive, blocked, doc, policyTag, mechanism } = splitKey(key);
    adapter.run(`INSERT INTO obs(bucket,directive,blocked,doc,policy_tag,mechanism,reports,ops,reports_incomplete)
                 VALUES(?,?,?,?,?,?,1,1,0)`, TODAY, directive, blocked, doc, policyTag, mechanism);
  }

  const freshKey = 'style-src-elem|self|other|unknown|legacy';
  const result = planBatch(adapter, TODAY, planOf([[freshKey, 2]]), { bucketRowCap: CAP });
  assert.equal(result.accepted.length, 0, 'no bucket capacity remains for a new normal row');
  assert.equal(result.overflow.reports, 2);
  assert.equal(result.plannedObsRows, 1);
  commitBatch(adapter, result);
  assert.equal(adapter.one("SELECT reports FROM obs WHERE directive = 'overflow'").reports, 2);
});

test('an existing overflow row still costs one row write', () => {
  const { adapter } = fresh();
  const overflowKey = keyOf('overflow', 'overflow', 'overflow', 'overflow', 'overflow');
  commitBatch(adapter, planBatch(adapter, TODAY, planOf([[overflowKey, 3]])));
  const second = planBatch(adapter, TODAY, planOf([[overflowKey, 4]]));
  assert.equal(second.plannedObsRows, 1, 'updating overflow must not be free');
  commitBatch(adapter, second);
  assert.equal(readUsed(adapter, TODAY).obsRows, 2, 'both overflow writes were accounted');
});

test('keys beyond the per-batch classification cap also fold into overflow', () => {
  const { adapter } = fresh();
  const entries = [];
  const keys = keySpace(['legacy']);
  for (let index = 0; index < LIMITS.MAX_CLASSIFIED_KEYS_PER_BATCH + 3; index += 1) {
    entries.push([keys[index], 1]);
  }
  const result = planBatch(adapter, TODAY, planOf(entries));
  assert.equal(result.accepted.length, LIMITS.MAX_CLASSIFIED_KEYS_PER_BATCH);
  assert.equal(result.overflow.reports, 3);
  assert.equal(result.diagnostics.droppedByClassification, 3);
});

test('saturation raises the persistent lower-bound flag, including on the first insert', () => {
  const { adapter } = fresh();
  const key = keyOf('script-src', 'inline', 'index');

  // First INSERT with an increment far beyond the cap: the stored value saturates, so the row must
  // be flagged as a lower bound even though there was no earlier row.
  const first = commitBatch(adapter, planBatch(adapter, TODAY, planOf([[key, LIMITS.REPORTS_HARD_CAP + 1]])));
  assert.ok(first.ok);
  let row = adapter.one('SELECT reports, reports_incomplete FROM obs');
  assert.equal(row.reports, LIMITS.REPORTS_HARD_CAP);
  assert.equal(row.reports_incomplete, 1, 'a first-insert clamp must set the flag');

  // A later update must not clear it.
  commitBatch(adapter, planBatch(adapter, TODAY, planOf([[key, 1]])));
  row = adapter.one('SELECT reports, reports_incomplete FROM obs');
  assert.equal(row.reports_incomplete, 1, 'the flag never falls back to 0');
});

test('a batch-merge clamp reaches storage as an incomplete count', () => {
  // The array limit caps how many items can arrive, so the per-key bound is injected here rather
  // than trying to exceed it from a payload the array gate would already truncate. This is a
  // parameter value, not a claim about the default bound.
  const payload = Array.from({ length: 5 }, () => reportingItem());
  const { plan, diagnostics } = buildPlan(payload, { maxReportsPerKey: 3 });
  const entry = plan.get(keyOf('script-src', 'inline', 'index', 'unknown', 'reporting'));
  assert.equal(entry.reports, 3, 'the merged total is clamped at the per-key bound');
  assert.equal(entry.incomplete, true, 'the batch merge flags the clamp');
  assert.equal(diagnostics.truncatedKeys, 2);

  const { adapter } = fresh();
  commitBatch(adapter, planBatch(adapter, TODAY, plan));
  const row = adapter.one('SELECT reports, reports_incomplete FROM obs');
  assert.equal(row.reports, 3);
  assert.equal(row.reports_incomplete, 1, 'the merge clamp must survive into storage');
});

test('a partial failure rolls observation and ledger writes back together', () => {
  const { adapter } = fresh();
  const existingKey = keyOf('script-src', 'inline', 'index');
  const newKey = keyOf('style-src-elem', 'self', 'bubble-watch');

  // Seed one existing key so the batch writes it first, then fail on the second observation write.
  commitBatch(adapter, planBatch(adapter, TODAY, planOf([[existingKey, 1]])));
  const before = readUsed(adapter, TODAY);
  const beforeReports = adapter.one('SELECT reports FROM obs WHERE directive = ?', 'script-src').reports;

  adapter.exec(`CREATE TRIGGER fail_second_obs BEFORE INSERT ON obs
                WHEN NEW.directive = 'style-src-elem'
                BEGIN SELECT RAISE(ABORT, 'injected-after-partial-write'); END`);

  const request = planBatch(adapter, TODAY, planOf([[existingKey, 50], [newKey, 7]]));
  assert.equal(request.action, 'commit');
  assert.equal(request.existing.length, 1);
  assert.equal(request.accepted.length, 1);
  assert.throws(() => commitBatch(adapter, request), /injected-after-partial-write/);

  adapter.exec('DROP TRIGGER fail_second_obs');
  // The first observation write did happen inside the transaction, so proving it was undone is the
  // whole point of this case.
  assert.equal(adapter.one('SELECT reports FROM obs WHERE directive = ?', 'script-src').reports, beforeReports,
    'the earlier observation write in the same batch was rolled back');
  assert.equal(adapter.one('SELECT COUNT(*) AS c FROM obs').c, 1, 'no new row survived');
  assert.deepEqual(readUsed(adapter, TODAY), before, 'the ledger write rolled back too');
});

test('a new UTC day starts a fresh ledger row through an upsert', () => {
  const { adapter } = fresh();
  const key = keyOf('script-src', 'inline', 'index');
  commitBatch(adapter, planBatch(adapter, TODAY, planOf([[key, 1]])));
  const tomorrow = bucketFor(at(TODAY) + 24 * 60 * 60 * 1000);
  const result = planBatch(adapter, tomorrow, planOf([[key, 1]]));
  assert.equal(result.used, 0, 'a day with no ledger row is treated as zero');
  commitBatch(adapter, result);
  assert.deepEqual(readUsed(adapter, tomorrow), { obsRows: 1, ledgerRows: 1 });
});

test('cleanup keeps exactly R buckets and deletes the expired ones from both tables', () => {
  const { adapter } = fresh();
  const key = keyOf('script-src', 'inline', 'index');
  const buckets = [];
  for (let offset = -16; offset <= 0; offset += 1) buckets.push(addDays(TODAY, offset));
  for (const day of buckets) commitBatch(adapter, planBatch(adapter, day, planOf([[key, 1]])));
  assert.equal(adapter.one('SELECT COUNT(*) AS c FROM obs').c, 17);

  const result = cleanup(adapter, at(TODAY), { retentionDays: 14 });
  assert.equal(result.threshold, '2026-09-27');
  const remaining = adapter.all('SELECT bucket FROM obs ORDER BY bucket').map((row) => row.bucket);
  assert.equal(remaining.length, 14, 'exactly 14 buckets survive');
  assert.equal(remaining[0], '2026-09-27');
  assert.equal(remaining.at(-1), TODAY);
  assert.ok(!remaining.includes('2026-09-26'));
  assert.equal(result.obsDeleted, 3);
  assert.equal(adapter.one('SELECT COUNT(*) AS c FROM obs_write_ledger').c, 14);
});

test('cleanup is idempotent and advances the watermark', () => {
  const { adapter } = fresh();
  commitBatch(adapter, planBatch(adapter, '2026-09-01', planOf([[keyOf('script-src', 'inline', 'index'), 1]])));
  assert.equal(cleanup(adapter, at(TODAY), { retentionDays: 14 }).obsDeleted, 1);
  assert.equal(cleanup(adapter, at(TODAY), { retentionDays: 14 }).obsDeleted, 0);
  assert.equal(adapter.one("SELECT v FROM meta WHERE k='last_cleaned_bucket'").v, TODAY);
});

test('a cleanup failure rethrows the original error and rolls the deletion back', () => {
  const { adapter } = fresh();
  commitBatch(adapter, planBatch(adapter, '2026-09-01', planOf([[keyOf('script-src', 'inline', 'index'), 1]])));
  assert.throws(
    () => cleanup(adapter, at(TODAY), { retentionDays: 14, failAfterPartialWrites: true }),
    /injected cleanup failure/,
  );
  assert.equal(adapter.one('SELECT COUNT(*) AS c FROM obs').c, 1);
  assert.equal(adapter.one("SELECT COUNT(*) AS c FROM meta WHERE k='last_cleaned_bucket'").c, 0);
});

test('ingest is a single call that plans then commits', () => {
  const { adapter } = fresh();
  const result = ingest(adapter, at(TODAY), planOf([[keyOf('script-src', 'inline', 'index'), 2]]));
  assert.equal(result.action, 'commit');
  assert.equal(adapter.one('SELECT reports FROM obs').reports, 2);
});

// ---------------------------------------------------------------------------
// Durable Object behaviour (context simulated; platform runtime not covered)
// ---------------------------------------------------------------------------

/**
 * Minimal Durable Object context that mimics the PLATFORM interface rather than node:sqlite:
 * `storage.sql.exec(query, ...bindings)` returning an array of row objects, and
 * `storage.transactionSync(cb)`. This is what the adapter has to translate, so exercising it here
 * is the point — not a convenience wrapper around the same node:sqlite calls.
 *
 * The real runtime forbids BEGIN/COMMIT; the fake rejects them too, so a regression that
 * reintroduced SQL transaction control would fail here.
 */
function makeContext() {
  const db = new DatabaseSync(':memory:');
  let alarm = null;

  const exec = (statement, ...bindings) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/iu.test(statement)) {
      throw new Error(`SQL transaction control is not allowed: ${statement.trim().split(/\s+/u)[0]}`);
    }
    const trimmed = statement.trimStart();
    const producesRows = /^(SELECT|WITH|PRAGMA)\b/iu.test(trimmed);
    if (producesRows) {
      const rows = db.prepare(statement).all(...bindings);
      return rows;
    }
    // DDL and plain writes return no rows; run them and report the affected count like the cursor.
    db.prepare(statement).run(...bindings);
    const changes = db.prepare('SELECT changes() AS c').get().c;
    const rows = [];
    rows.rowsWritten = changes;
    return rows;
  };

  const storage = {
    sql: { exec },
    async getAlarm() { return alarm; },
    async setAlarm(time) { alarm = time; },
    transactionSync(callback) {
      db.exec('BEGIN');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };

  const adapter = createNodeSqliteAdapter(db);
  return {
    ctx: { storage },
    adapter,
    getAlarm: () => alarm,
    breakScheduling(error) { storage.setAlarm = async () => { throw error; }; },
  };
}

/** Seeds one expired bucket through the object's own adapter. */
function seedExpired(object, bucket = '2026-09-01') {
  const { directive, blocked, doc, policyTag, mechanism } = splitKey(keyOf('script-src', 'inline', 'index'));
  object.adapter.run(`INSERT INTO obs(bucket,directive,blocked,doc,policy_tag,mechanism,reports,ops,reports_incomplete)
                      VALUES(?,?,?,?,?,?,1,1,0)`, bucket, directive, blocked, doc, policyTag, mechanism);
}

test('the daily cleanup is rescheduled to the NEXT day, not the day after', () => {
  const sameDay = Date.parse('2026-10-10T00:05:00.000Z');
  assert.equal(new Date(nextCleanupAt(sameDay)).toISOString(), '2026-10-10T00:10:00.000Z', 'today\'s slot is ahead');
  const afterSlot = Date.parse('2026-10-10T00:10:00.000Z');
  assert.equal(new Date(nextCleanupAt(afterSlot)).toISOString(), '2026-10-11T00:10:00.000Z', 'exactly the next day');
  const lateInDay = Date.parse('2026-10-10T18:00:00.000Z');
  assert.equal(new Date(nextCleanupAt(lateInDay)).toISOString(), '2026-10-11T00:10:00.000Z');
});

test('the adapter rejects SQL transaction control from the object', async () => {
  const { ctx } = makeContext();
  assert.throws(() => ctx.storage.sql.exec('BEGIN'), /not allowed/u);
  const object = new CspReceiverObject(ctx, {});
  object.ensureSchema();
  const key = keyOf('script-src', 'inline', 'index');
  const result = await object.ingest({
    entries: [[key, { reports: 1, incomplete: false }]],
    receivedAt: Date.parse('2026-10-10T05:00:00.000Z'),
  });
  assert.equal(result.action, 'commit', 'the real commit path must not use BEGIN/COMMIT');
});

test('a cleanup failure is rethrown even when rescheduling also fails', async () => {
  const { ctx, breakScheduling } = makeContext();
  const object = new CspReceiverObject(ctx, {});
  object.ensureSchema();
  seedExpired(object);

  const cleanupError = new Error('delete-original');
  const delegate = object.adapter;
  object.adapter = {
    ...delegate,
    run(statement, ...bindings) {
      if (/^DELETE FROM obs /u.test(statement)) throw cleanupError;
      return delegate.run(statement, ...bindings);
    },
  };
  breakScheduling(new Error('schedule-error'));

  await assert.rejects(() => object.alarm(), (error) => {
    assert.match(error.message, /delete-original/, 'the cleanup failure stays primary');
    assert.match(String(error.scheduleError), /schedule-error/, 'the scheduling failure is reported too');
    return true;
  });
});

test('a successful alarm clears the start marker and schedules the next run', async () => {
  const { ctx, getAlarm } = makeContext();
  const object = new CspReceiverObject(ctx, {});
  object.ensureSchema();
  seedExpired(object);
  await object.alarm();
  assert.equal(object.adapter.one('SELECT COUNT(*) AS c FROM obs').c, 0, 'the expired row was deleted');
  assert.equal(object.adapter.one("SELECT v FROM meta WHERE k='cleanup_started_at'").v, '', 'marker cleared');
  assert.ok(getAlarm() !== null, 'a follow-up alarm is scheduled');
});

test('health is read-only: it writes nothing and schedules nothing', async () => {
  const { ctx, getAlarm } = makeContext();
  const object = new CspReceiverObject(ctx, {});
  object.ensureSchema();

  const metaBefore = JSON.stringify(object.adapter.all('SELECT k, v FROM meta ORDER BY k'));
  const alarmBefore = getAlarm();
  const result = await object.health({ now: Date.parse('2026-10-10T12:00:00.000Z') });

  assert.equal(typeof result.status, 'string');
  assert.equal(getAlarm(), alarmBefore, 'health must not schedule an alarm');
  assert.equal(JSON.stringify(object.adapter.all('SELECT k, v FROM meta ORDER BY k')), metaBefore,
    'health must not write meta');
  assert.ok(result.alerts.includes('cleanup-never-ran'), 'a missing watermark is still reported');
});

test('health reports a missing schedule without repairing it', async () => {
  const { ctx, getAlarm } = makeContext();
  const object = new CspReceiverObject(ctx, {});
  object.ensureSchema();
  // The schema seeds this key, so set it with an upsert rather than a plain insert.
  object.adapter.run(`INSERT INTO meta(k,v) VALUES('last_cleaned_bucket','2026-10-10')
                      ON CONFLICT(k) DO UPDATE SET v = excluded.v`);
  const result = await object.health({ now: Date.parse('2026-10-10T12:00:00.000Z') });
  assert.ok(result.alerts.includes('schedule-missing'), 'the scheduling gap is reported');
  assert.ok(!result.alerts.includes('cleanup-watermark-stale'), 'the watermark itself is fine');
  assert.equal(getAlarm(), null, 'health did not silently fix the schedule');
});

test('ingest schedules the first cleanup alarm', async () => {
  const { ctx, getAlarm } = makeContext();
  const object = new CspReceiverObject(ctx, {});
  const key = keyOf('script-src', 'inline', 'index');
  const result = await object.ingest({
    entries: [[key, { reports: 1, incomplete: false }]],
    receivedAt: Date.parse('2026-10-10T00:05:00.000Z'),
  });
  assert.equal(result.action, 'commit');
  assert.equal(new Date(getAlarm()).toISOString(), '2026-10-10T00:10:00.000Z');
});

test('health judges the watermark and the follow-up schedule independently', () => {
  const now = at(TODAY) + 12 * 60 * 60 * 1000;
  assert.equal(evaluateHealth({ now, lastCleanedBucket: TODAY, alarmAt: now + 24 * 60 * 60 * 1000 }).status, 'healthy');
  const scheduleLost = evaluateHealth({ now, lastCleanedBucket: TODAY, alarmAt: null });
  assert.ok(scheduleLost.alerts.includes('schedule-missing'));
  assert.ok(!scheduleLost.alerts.includes('cleanup-watermark-stale'));
  const unreadable = evaluateHealth({ now, readFailed: true });
  assert.equal(unreadable.status, 'unknown');
  assert.deepEqual(unreadable.alerts, ['cannot-confirm']);
});
