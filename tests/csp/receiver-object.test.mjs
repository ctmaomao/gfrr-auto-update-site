// Batch planning, truncation, transaction rollback, cleanup and health regressions.
//
// Local phase (D-C): real SQLite via `node:sqlite`, plus a minimal scheduling simulation for the
// application-side judgement. Platform metering, quota, alarm retry and billing are NOT covered
// here and remain stage B.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LIMITS, addDays, bucketFor } from '../../workers/gfrr-csp-report-receiver/src/constants.js';
import {
  applySchema, cleanup, commitBatch, ingest, planBatch, readUsed, splitKey,
} from '../../workers/gfrr-csp-report-receiver/src/storage.js';
import { buildPlan, mapBlocked, mapDirective, readBodyWithinLimit } from '../../workers/gfrr-csp-report-receiver/src/normalize.js';
import { evaluateHealth } from '../../workers/gfrr-csp-report-receiver/src/health.js';

const fresh = () => {
  const db = new DatabaseSync(':memory:');
  applySchema(db);
  return db;
};

const DAY = 24 * 60 * 60 * 1000;
const TODAY = '2026-10-10';
const at = (bucket) => Date.parse(`${bucket}T00:00:00.000Z`);

/** Builds a legacy-shaped report body. */
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

const keyOf = (directive, blocked, doc, policyTag = 'unknown', mechanism = 'legacy') =>
  [directive, blocked, doc, policyTag, mechanism].join('|');

/**
 * Enumerates the whole closed key space for the normal (non-overflow) rows.
 *
 * `policy_tag` and `mechanism` are fixed on a normal row: the tag is `unknown` unless the payload
 * matches the finite known table (empty in local tests) and the mechanism is `legacy` for this
 * shape. So the reachable key space is DIRECTIVES x BLOCKED x DOCS.
 */
/**
 * Enumerates the NORMALISED key space for normal rows, by running every combination of the closed
 * enums through the real normalisation. It is computed rather than assumed because some raw values
 * collapse: `cross-origin` and `other` both normalise to `other`, so the reachable space is smaller
 * than DIRECTIVES x BLOCKED x DOCS.
 *
 * `policy_tag` is `unknown` unless a payload matches the finite known table (empty in local tests).
 */
const keySpace = (mechanism = 'legacy') => {
  const directives = ['script-src', 'script-src-attr', 'style-src-elem', 'other'];
  const blocked = ['inline', 'self', 'cross-origin', 'eval', 'data', 'other'];
  const docs = ['index', 'bubble-watch', 'other'];
  const keys = new Set();
  for (const doc of docs) {
    for (const block of blocked) {
      for (const directive of directives) {
        const normalised = mapBlocked(block);
        keys.add(keyOf(mapDirective(directive), normalised, doc, 'unknown', mechanism));
      }
    }
  }
  return [...keys].sort();
};

/** A Reporting API item. Arrays only ever carry this shape; a legacy body is one report per call. */
const reportingItem = ({ directive = 'script-src', blocked = 'inline', document = 'https://x.test/index.html', extra = {} } = {}) => ({
  type: 'csp-violation',
  body: {
    effectiveDirective: directive,
    blockedURL: blocked,
    documentURL: document,
    ...extra,
  },
});

/**
 * Round-trips each enum value through a payload, so the fixture cannot collapse keys.
 * A multi-report request uses the Reporting API array shape; it cannot use legacy, which carries
 * exactly one report per request.
 */
const payloadForKeys = (keys) => {
  const docFor = (doc) => (doc === 'index' ? 'index.html' : `${doc}.html`);
  const blockedFor = (blocked) => (blocked === 'data' ? 'data:font/woff' : blocked);
  return keys.map((key) => {
    const { directive, blocked, doc } = splitKey(key);
    return reportingItem({ directive, blocked: blockedFor(blocked), document: `https://x.test/${docFor(doc)}` });
  });
};

/** Inserts `count` distinct normal rows directly, to reach a bucket state without paying ingest. */
function seedNormalRows(db, bucket, count, { reports = 1 } = {}) {
  const keys = keySpace().slice(0, count);
  const statement = db.prepare(`INSERT INTO obs(bucket,directive,blocked,doc,policy_tag,mechanism,reports,ops,reports_incomplete)
                                VALUES(?,?,?,?,?,?,?,1,0)`);
  for (const key of keys) {
    const { directive, blocked, doc, policyTag, mechanism } = splitKey(key);
    statement.run(bucket, directive, blocked, doc, policyTag, mechanism, reports);
  }
  return keys;
}

/** A plan whose single key is the given (deterministically ordered) entry list. */
const planOf = (entries) => new Map(entries.map(([key, reports]) => [key, reports]));

test('batch merging sums items that normalise to the same key', () => {
  const { plan, diagnostics } = buildPlan(legacy({ directive: 'script-src' }));
  assert.equal(plan.get(keyOf('script-src', 'inline', 'index')), 1);
  assert.equal(diagnostics.droppedKeys, 0);
});

test('a legacy payload needs no Reporting API wrapper or type field', () => {
  const { plan, malformed } = buildPlan(legacy());
  assert.equal(malformed, false);
  assert.equal(plan.size, 1);
});

test('a Reporting API payload keeps only csp-violation items', () => {
  const payload = [
    { type: 'csp-violation', body: { effectiveDirective: 'script-src', blockedURL: 'inline', documentURL: 'https://radar.gfrfinradar.uk/index.html' } },
    { type: 'deprecation', body: {} },
    { type: 'csp-violation', body: { effectiveDirective: 'style-src-attr', blockedURL: 'inline', documentURL: 'https://radar.gfrfinradar.uk/bubble-watch.html' } },
  ];
  const { plan, diagnostics } = buildPlan(payload);
  assert.equal(plan.size, 2);
  assert.equal(diagnostics.droppedNotCsp, 1);
  assert.ok(plan.has(keyOf('script-src', 'inline', 'index', 'unknown', 'reporting')));
});

test('normalisation happens before key counting, so raw values cannot exhaust the key budget', () => {
  // 500 distinct hostile directive and blocked values all collapse to `other|other`.
  const payload = Array.from({ length: 500 }, (_, index) =>
    reportingItem({ directive: `evil-${index}`, blocked: `evil-${index}` }));
  const { plan } = buildPlan(payload);
  assert.equal(plan.size, 1, 'raw variety must not inflate the normalised key count');
  assert.equal(plan.get(keyOf('other', 'other', 'index', 'unknown', 'reporting')), 500);
});

test('the closed key space is far smaller than the declared input-key and bucket caps', () => {
  // Recorded deliberately: the reachable normal-row key space is far below
  // LIMITS.MAX_INPUT_KEYS_PER_BATCH (200) and BUCKET_ROW_CAP (512), so neither candidate value can
  // be exercised through the normal path. The parameters must be reconciled before they mean
  // anything; the mechanisms themselves are asserted in the following cases.
  const keys = keySpace('reporting');
  assert.ok(keys.length <= 72, `reachable key space is ${keys.length}`);
  assert.ok(keys.length < LIMITS.MAX_INPUT_KEYS_PER_BATCH, 'input-key bound exceeds the reachable key space');
  assert.ok(keys.length < LIMITS.BUCKET_ROW_CAP, 'bucket cap exceeds the reachable key space');
});

test('the distinct-key bound keeps exactly the declared number of keys', () => {
  const keys = keySpace('reporting');
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
    getReader() {
      return {
        async read() {
          if (read >= 100) return { done: true };
          read += 1;
          return { done: false, value: chunk };
        },
        async cancel() {},
      };
    },
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

test('existing keys keep being updated and are never dropped', () => {
  const db = fresh();
  const key = keyOf('script-src', 'inline', 'index');
  const first = planBatch(db, TODAY, planOf([[key, 5]]));
  commitBatch(db, first);

  const second = planBatch(db, TODAY, planOf([[key, 7]]));
  assert.equal(second.action, 'commit');
  assert.equal(second.existing.length, 1, 'the key is recognised as existing');
  commitBatch(db, second);

  const row = db.prepare('SELECT reports, ops FROM obs WHERE directive = ?').get('script-src');
  assert.equal(row.reports, 12);
  assert.equal(row.ops, 2);
});

test('a full bucket folds new keys into a single overflow row and counts one row write', () => {
  const db = fresh();
  // The declared cap (512) is unreachable with a 72-key space, so the capacity is injected here to
  // exercise the state the overflow branch exists for.
  const CAP = 4;
  seedNormalRows(db, TODAY, CAP);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM obs WHERE directive <> 'overflow'").get().c, CAP);

  const freshKey = 'style-src-elem|self|other|unknown|legacy';
  assert.ok(db.prepare('SELECT 1 AS p FROM obs WHERE directive = ? LIMIT 1').get('style-src-elem') === undefined,
    'the fresh key must not already exist');

  const result = planBatch(db, TODAY, planOf([[freshKey, 2]]), { bucketRowCap: CAP });
  assert.equal(result.accepted.length, 0, 'no bucket capacity remains for a new normal row');
  assert.equal(result.overflow.reports, 2, 'the reports survive as an unclassified summary');
  assert.equal(result.plannedObsRows, 1, 'new or updated, the overflow row is one row write');
  commitBatch(db, result);
  assert.equal(db.prepare("SELECT reports FROM obs WHERE directive = 'overflow'").get().reports, 2);
});

test('an existing overflow row still costs one row write', () => {
  const db = fresh();
  const overflowKey = keyOf('overflow', 'overflow', 'overflow', 'overflow', 'overflow');
  const first = planBatch(db, TODAY, planOf([[overflowKey, 3]]));
  commitBatch(db, first);

  const second = planBatch(db, TODAY, planOf([[overflowKey, 4]]));
  assert.equal(second.plannedObsRows, 1, 'updating overflow must not be free');
  commitBatch(db, second);

  const row = db.prepare("SELECT reports, ops FROM obs WHERE directive = 'overflow'").get();
  assert.equal(row.reports, 7);
  assert.equal(row.ops, 2);
  const used = readUsed(db, TODAY);
  assert.equal(used.obsRows, 2, 'both overflow writes were accounted');
});

test('keys beyond the per-batch classification cap also fold into overflow', () => {
  const db = fresh();
  const entries = [];
  for (let index = 0; index < LIMITS.MAX_CLASSIFIED_KEYS_PER_BATCH + 3; index += 1) {
    entries.push([keyOf('script-src', 'inline', 'other', `tag${String(index).padStart(3, '0')}`), 1]);
  }
  const result = planBatch(db, TODAY, planOf(entries));
  assert.equal(result.accepted.length, LIMITS.MAX_CLASSIFIED_KEYS_PER_BATCH);
  assert.equal(result.overflow.reports, 3);
  assert.equal(result.diagnostics.droppedByClassification, 3);
});

test('saturation raises the persistent lower-bound flag exactly once and keeps it', () => {
  const db = fresh();
  const key = keyOf('script-src', 'inline', 'index');
  db.exec(`INSERT INTO obs(bucket,directive,blocked,doc,policy_tag,mechanism,reports,ops,reports_incomplete)
           VALUES('${TODAY}','script-src','inline','index','unknown','legacy',${LIMITS.REPORTS_HARD_CAP - 1},1,0)`);

  const request = planBatch(db, TODAY, planOf([[key, 50]]));
  commitBatch(db, request);
  let row = db.prepare('SELECT reports, reports_incomplete FROM obs').get();
  assert.equal(row.reports, LIMITS.REPORTS_HARD_CAP, 'the value saturates at its cap');
  assert.equal(row.reports_incomplete, 1, 'the clamp is persisted, not merely reported');

  // A later, fully applied update must not clear the flag.
  const again = planBatch(db, TODAY, planOf([[key, 1]]));
  commitBatch(db, again);
  row = db.prepare('SELECT reports, reports_incomplete FROM obs').get();
  assert.equal(row.reports_incomplete, 1, 'the flag never falls back to 0');
});

test('a partial failure rolls observation and ledger writes back together', () => {
  const db = fresh();
  const key = keyOf('script-src', 'inline', 'index');
  // A trigger fails the observation insert, i.e. after part of the batch has already been applied.
  db.exec(`CREATE TRIGGER fail_obs BEFORE INSERT ON obs BEGIN SELECT RAISE(ABORT, 'injected'); END`);

  const request = planBatch(db, TODAY, planOf([[key, 1]]));
  assert.equal(request.action, 'commit');
  assert.throws(() => commitBatch(db, request), /injected/);

  db.exec('DROP TRIGGER fail_obs');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM obs').get().c, 0, 'observation write rolled back');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM obs_write_ledger').get().c, 0, 'ledger write rolled back');
});

test('a new UTC day starts a fresh ledger row through an upsert', () => {
  const db = fresh();
  const key = keyOf('script-src', 'inline', 'index');
  commitBatch(db, planBatch(db, TODAY, planOf([[key, 1]])));
  const tomorrow = bucketFor(at(TODAY) + DAY);
  const result = planBatch(db, tomorrow, planOf([[key, 1]]));
  assert.equal(result.used, 0, 'a day with no ledger row is treated as zero, not as an error');
  commitBatch(db, result);
  assert.deepEqual(readUsed(db, tomorrow), { obsRows: 1, ledgerRows: 1 });
});

test('cleanup keeps exactly R buckets and deletes the expired ones from both tables', () => {
  const db = fresh();
  const key = keyOf('script-src', 'inline', 'index');
  const buckets = [];
  // 14 buckets that must survive (2026-09-27 .. 2026-10-10) plus 2 that must be deleted.
  for (let offset = -16; offset <= 0; offset += 1) {
    buckets.push(addDays(TODAY, offset));
  }
  assert.equal(buckets.length, 17);
  assert.equal(buckets[0], '2026-09-24');
  for (const day of buckets) {
    commitBatch(db, planBatch(db, day, planOf([[key, 1]])));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM obs').get().c, 17, 'the fixture seeded 17 buckets');

  const result = cleanup(db, at(TODAY), { retentionDays: 14 });
  assert.equal(result.threshold, '2026-09-27');

  const remaining = db.prepare('SELECT bucket FROM obs ORDER BY bucket').all().map((row) => row.bucket);
  assert.equal(remaining.length, 14, 'exactly 14 buckets survive');
  assert.equal(remaining[0], '2026-09-27');
  assert.equal(remaining.at(-1), TODAY);
  assert.ok(!remaining.includes('2026-09-26'), 'the first expired bucket is gone');
  assert.ok(!remaining.includes('2026-09-24'), 'every expired bucket is gone');
  assert.equal(result.obsDeleted, 3, 'three seeded buckets fell before the threshold');

  const ledger = db.prepare('SELECT COUNT(*) AS c FROM obs_write_ledger').get().c;
  assert.equal(ledger, 14, 'the ledger is trimmed in step with the observations');
});

test('cleanup is idempotent and advances the watermark', () => {
  const db = fresh();
  commitBatch(db, planBatch(db, '2026-09-01', planOf([[keyOf('script-src', 'inline', 'index'), 1]])));
  const first = cleanup(db, at(TODAY), { retentionDays: 14 });
  const second = cleanup(db, at(TODAY), { retentionDays: 14 });
  assert.equal(first.obsDeleted, 1);
  assert.equal(second.obsDeleted, 0, 'a repeated cleanup deletes nothing further');
  assert.equal(db.prepare("SELECT v FROM meta WHERE k='last_cleaned_bucket'").get().v, TODAY);
});

test('a cleanup failure rethrows the original error and rolls the deletion back', () => {
  const db = fresh();
  commitBatch(db, planBatch(db, '2026-09-01', planOf([[keyOf('script-src', 'inline', 'index'), 1]])));
  assert.throws(
    () => cleanup(db, at(TODAY), { retentionDays: 14, failAfterPartialWrites: true }),
    /injected cleanup failure/,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM obs').get().c, 1, 'the expired row is still there');
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM meta WHERE k='last_cleaned_bucket'").get().c, 0);
});

test('health judges the watermark and the follow-up schedule independently', () => {
  const now = at(TODAY) + 12 * 60 * 60 * 1000; // midday

  // Healthy: watermark on time and a valid follow-up alarm.
  const healthy = evaluateHealth({ now, lastCleanedBucket: TODAY, alarmAt: now + DAY });
  assert.equal(healthy.status, 'healthy');

  // The regression that matters: the watermark advanced, but nothing is scheduled.
  const scheduleLost = evaluateHealth({ now, lastCleanedBucket: TODAY, alarmAt: null });
  assert.equal(scheduleLost.status, 'alert');
  assert.ok(scheduleLost.alerts.includes('schedule-missing'), 'scheduling is judged without the watermark');
  assert.ok(!scheduleLost.alerts.includes('cleanup-watermark-stale'));

  // Stale watermark with an in-flight marker is downgraded, not silently healthy.
  const inFlight = evaluateHealth({
    now,
    lastCleanedBucket: '2026-10-05',
    cleanupStartedAt: now - 60 * 1000,
    alarmAt: now + DAY,
  });
  assert.ok(inFlight.alerts.includes('cleanup-possibly-in-flight'));

  // A read failure is never health.
  const unreadable = evaluateHealth({ now, readFailed: true });
  assert.equal(unreadable.status, 'unknown');
  assert.deepEqual(unreadable.alerts, ['cannot-confirm']);

  // An overdue alarm with no in-flight run is an alert.
  const overdue = evaluateHealth({ now, lastCleanedBucket: TODAY, alarmAt: now - 60 * 1000 });
  assert.ok(overdue.alerts.includes('schedule-overdue'));
});

test('ingest is a single call that plans then commits', () => {
  const db = fresh();
  const result = ingest(db, at(TODAY), planOf([[keyOf('script-src', 'inline', 'index'), 2]]));
  assert.equal(result.action, 'commit');
  assert.equal(db.prepare('SELECT reports FROM obs').get().reports, 2);
});
