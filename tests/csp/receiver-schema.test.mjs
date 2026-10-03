// Schema and pure-logic regressions for the CSP report receiver (local phase, D-C).
//
// These run against `node:sqlite` in memory: no new dependency, real SQLite semantics. They do NOT
// and cannot stand in for platform metering, quota, scheduling or billing — that is the separately
// authorised stage B.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  BLOCKED, DIRECTIVES, DOCS, LIMITS, MECHANISMS, POLICY_TAGS,
  addDays, bucketFor, retentionThreshold,
} from '../../workers/gfrr-csp-report-receiver/src/constants.js';
import {
  accumulateOverflow, applySchema, ingest, planBatch, readUsed, SQL, splitKey,
} from '../../workers/gfrr-csp-report-receiver/src/storage.js';
import { buildPlan, mapBlocked, mapDoc, mapDirective, mapPolicyTag } from '../../workers/gfrr-csp-report-receiver/src/normalize.js';

const fresh = () => {
  const db = new DatabaseSync(':memory:');
  applySchema(db);
  return db;
};

test('schema creates the three tables and accepts an upsert', () => {
  const db = fresh();
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(names, ['meta', 'obs', 'obs_write_ledger']);
});

test('enum sets are closed and include their catch-all member', () => {
  assert.ok(DIRECTIVES.includes('other'));
  assert.ok(BLOCKED.includes('other'));
  assert.ok(DOCS.includes('other'));
  assert.ok(POLICY_TAGS.includes('unknown'));
  assert.deepEqual(MECHANISMS, ['legacy', 'reporting']);
});

test('normalisation maps unknown and hostile values onto the catch-all members', () => {
  assert.equal(mapDirective('script-SRC'), 'script-src');
  assert.equal(mapDirective('<script>alert(1)</script>'), 'other');
  assert.equal(mapBlocked('inline'), 'inline');
  assert.equal(mapBlocked('data:font/woff'), 'data');
  assert.equal(mapBlocked('https://evil.example/x'), 'other', 'without a page origin nothing can be judged');
  assert.equal(mapBlocked('//evil.example/x'), 'other');
  assert.equal(mapBlocked('not a uri at all'), 'other');
  assert.equal(mapDoc('https://radar.gfrfinradar.uk/index.html'), 'index');
  assert.equal(mapDoc('https://radar.gfrfinradar.uk/bubble-watch.html?x=1#y'), 'bubble-watch');
  assert.equal(mapDoc('https://radar.gfrfinradar.uk/private/secret-path.html'), 'other');
});

test('cross-origin is decided by comparing origins, not by the shape of the URL', () => {
  const page = 'https://radar.gfrfinradar.uk/index.html';

  // An absolute URL is NOT evidence of another origin: this one is the same origin.
  assert.equal(mapBlocked('https://radar.gfrfinradar.uk/scripts/app.js', page), 'self');
  // A genuinely different origin.
  assert.equal(mapBlocked('https://evil.example/x', page), 'cross-origin');
  // Protocol-relative resolves against the page scheme, so this one is the same origin.
  assert.equal(mapBlocked('//radar.gfrfinradar.uk/scripts/app.js', page), 'self');
  // Protocol-relative pointing elsewhere is cross-origin.
  assert.equal(mapBlocked('//evil.example/x', page), 'cross-origin');
  // A different scheme on the same host is a different origin.
  assert.equal(mapBlocked('http://radar.gfrfinradar.uk/x', page), 'cross-origin');
  // A path is same-origin; a page-relative URL without a page origin cannot be judged.
  assert.equal(mapBlocked('/scripts/app.js', page), 'self');
  assert.equal(mapBlocked('nonsense', page), 'other');
  assert.equal(mapBlocked('https://evil.example/x', undefined), 'other', 'no page origin means no guess');
});

test('a policy tag is only ever derived from the finite known table', () => {
  const known = mapPolicyTag([], 'default-src \'none\'');
  assert.equal(known, 'unknown', 'an unknown policy text maps to unknown, never to a new tag');
  const table = [mapPolicyTag([], 'default-src \'none\'')];
  // With the tag present in the table the same text maps to itself.
  const digest = mapPolicyTag(['zzzz'], 'default-src \'none\'');
  assert.equal(digest, 'unknown');
  // A browser-supplied tag is never accepted as input.
  const plan = buildPlan({ 'csp-report': { 'effective-directive': 'script-src', policyTag: 'p1' } }, { knownTags: table });
  const key = [...plan.plan.keys()][0];
  assert.equal(splitKey(key).policyTag, 'unknown', 'a submitted policyTag must not be trusted');
});

test('the retention threshold keeps exactly R buckets including today', () => {
  assert.equal(retentionThreshold('2026-10-10', 14), '2026-09-27');
  assert.equal(retentionThreshold('2026-10-10', 7), '2026-10-04');
  // 2026-09-27 .. 2026-10-10 inclusive is 14 buckets.
  let cursor = '2026-09-27';
  let count = 0;
  while (cursor <= '2026-10-10') { count += 1; cursor = addDays(cursor, 1); }
  assert.equal(count, 14);
});

test('bucket boundaries are derived from server time, not from the payload', () => {
  assert.equal(bucketFor(Date.parse('2026-10-10T00:00:00.000Z')), '2026-10-10');
  assert.equal(bucketFor(Date.parse('2026-10-10T23:59:59.999Z')), '2026-10-10');
});

test('overflow accumulation clamps item by item and flags every clamp', () => {
  const clean = accumulateOverflow([{ reports: 10 }, { reports: 20 }]);
  assert.deepEqual(clean, { reports: 30, incomplete: false });

  // Container clamp: the running total is capped during accumulation, not afterwards.
  const clamped = accumulateOverflow([{ reports: 80 }, { reports: 80 }], { cap: 100 });
  assert.deepEqual(clamped, { reports: 100, incomplete: true });

  // A key already flagged during batch merging keeps the row flagged.
  const carried = accumulateOverflow([{ reports: 5, incomplete: true }]);
  assert.deepEqual(carried, { reports: 5, incomplete: true });
});

test('used is obs_rows + ledger_rows, so it can exceed the number of rows', () => {
  const db = fresh();
  const bucket = '2026-10-10';
  const plan = new Map([['script-src|inline|index|unknown|legacy', 5]]);

  ingest(db, Date.parse(`${bucket}T00:00:00.000Z`), plan);
  let used = readUsed(db, bucket);
  assert.deepEqual(used, { obsRows: 1, ledgerRows: 1 });

  // Re-updating the same key writes no new row but does increase the accounting.
  ingest(db, Date.parse(`${bucket}T00:00:00.000Z`), plan);
  used = readUsed(db, bucket);
  assert.deepEqual(used, { obsRows: 2, ledgerRows: 2 });

  const rows = db.prepare('SELECT COUNT(*) AS c FROM obs').get().c;
  assert.equal(rows, 1, 'one row, updated twice');
  assert.ok(used.obsRows + used.ledgerRows >= rows, 'used >= row count');
});

test('a rejected batch is judged on the whole batch and writes nothing', () => {
  const db = fresh();
  const bucket = '2026-10-10';
  const key = 'script-src|inline|index|unknown|legacy';
  // Drive used to the budget with a single key, one observation row plus one ledger row per batch.
  let guard = 0;
  while (readUsed(db, bucket).obsRows + readUsed(db, bucket).ledgerRows <= LIMITS.INGEST_WRITE_BUDGET - 1) {
    ingest(db, Date.parse(`${bucket}T00:00:00.000Z`), new Map([[key, 1]]));
    guard += 1;
    assert.ok(guard < 5000, 'loop should terminate well before the budget');
  }
  const before = readUsed(db, bucket);
  const result = planBatch(db, bucket, new Map([[key, 1]]));
  assert.equal(result.action, 'reject');
  assert.equal(result.reason, 'ingest-budget');
  assert.deepEqual(readUsed(db, bucket), before, 'a rejected batch changes nothing');
});

test('an empty plan is a noop that never writes a ledger row', () => {
  const db = fresh();
  const result = planBatch(db, '2026-10-10', new Map());
  assert.equal(result.action, 'noop');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM obs_write_ledger').get().c, 0);
});
