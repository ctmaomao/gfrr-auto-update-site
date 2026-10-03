// Schema and pure-logic regressions for the CSP report receiver (local phase, D-C).
//
// These run against `node:sqlite` in memory through the same storage adapter the Durable Object
// uses, so the SQL under test is the SQL that will run in production. No new dependency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  BLOCKED, DIRECTIVES, DOCS, LIMITS, MECHANISMS, POLICY_TAGS,
  addDays, bucketFor, retentionThreshold,
} from '../../workers/gfrr-csp-report-receiver/src/constants.js';
import {
  accumulateOverflow, applySchema, commitBatch, ingest, planBatch, readUsed, splitKey,
} from '../../workers/gfrr-csp-report-receiver/src/storage.js';
import { createNodeSqliteAdapter } from '../../workers/gfrr-csp-report-receiver/src/storage-adapter.js';
import {
  buildPlan, buildPolicyTable, mapBlocked, mapDirective, mapDoc, mapPolicyTag,
} from '../../workers/gfrr-csp-report-receiver/src/normalize.js';

const fresh = () => {
  const db = new DatabaseSync(':memory:');
  const adapter = createNodeSqliteAdapter(db);
  applySchema(adapter);
  return { db, adapter };
};

test('schema creates the three tables', () => {
  const { adapter } = fresh();
  const names = adapter.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((row) => row.name);
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
  assert.equal(mapBlocked('eval'), 'eval');
  assert.equal(mapBlocked('data:font/woff'), 'data');
  assert.equal(mapBlocked('not a uri at all'), 'other');
  assert.equal(mapDoc('https://radar.gfrfinradar.uk/index.html'), 'index');
  assert.equal(mapDoc('https://radar.gfrfinradar.uk/bubble-watch.html?x=1#y'), 'bubble-watch');
  assert.equal(mapDoc('https://radar.gfrfinradar.uk/private/secret-path.html'), 'other');
});

test('cross-origin is decided by comparing origins, not by the shape of the URL', () => {
  const page = 'https://radar.gfrfinradar.uk/index.html';
  assert.equal(mapBlocked('https://radar.gfrfinradar.uk/scripts/app.js', page), 'self');
  assert.equal(mapBlocked('https://evil.example/x', page), 'cross-origin');
  assert.equal(mapBlocked('//radar.gfrfinradar.uk/scripts/app.js', page), 'self');
  assert.equal(mapBlocked('//evil.example/x', page), 'cross-origin');
  assert.equal(mapBlocked('http://radar.gfrfinradar.uk/x', page), 'cross-origin');
  assert.equal(mapBlocked('/scripts/app.js', page), 'self');
  assert.equal(mapBlocked('nonsense', page), 'other');
  assert.equal(mapBlocked('https://evil.example/x', undefined), 'other', 'no page origin means no guess');
});

test('a policy tag comes from the finite table, never from a raw digest', () => {
  const table = buildPolicyTable(['default-src \'none\'', 'script-src \'self\'']);
  assert.equal(mapPolicyTag(table, 'default-src \'none\''), 'p1');
  assert.equal(mapPolicyTag(table, 'script-src \'self\''), 'p2');
  assert.equal(mapPolicyTag(table, 'something else'), 'unknown');
  assert.equal(mapPolicyTag(buildPolicyTable([]), 'default-src \'none\''), 'unknown');

  // Every produced tag must be in the allowed set, and a known policy must NOT be dropped.
  for (const tag of [mapPolicyTag(table, 'default-src \'none\''), mapPolicyTag(table, 'script-src \'self\'')]) {
    assert.ok(POLICY_TAGS.includes(tag), `${tag} must be an allowed tag`);
  }
  const { plan, diagnostics } = buildPlan(
    { 'csp-report': { 'effective-directive': 'script-src', 'original-policy': 'default-src \'none\'' } },
    { policyTable: table },
  );
  assert.equal(diagnostics.droppedPolicyField, 0);
  assert.equal(plan.size, 1, 'a report whose policy IS known must be classified, not dropped');
  assert.equal(splitKey([...plan.keys()][0]).policyTag, 'p1');
});

test('a browser-submitted policyTag is never trusted', () => {
  const { plan } = buildPlan({ 'csp-report': { 'effective-directive': 'script-src', policyTag: 'p1' } });
  assert.equal(splitKey([...plan.keys()][0]).policyTag, 'unknown');
});

test('the retention threshold keeps exactly R buckets including today', () => {
  assert.equal(retentionThreshold('2026-10-10', 14), '2026-09-27');
  assert.equal(retentionThreshold('2026-10-10', 7), '2026-10-04');
  let cursor = '2026-09-27';
  let count = 0;
  while (cursor <= '2026-10-10') { count += 1; cursor = addDays(cursor, 1); }
  assert.equal(count, 14);
});

test('bucket boundaries are derived from server time', () => {
  assert.equal(bucketFor(Date.parse('2026-10-10T00:00:00.000Z')), '2026-10-10');
  assert.equal(bucketFor(Date.parse('2026-10-10T23:59:59.999Z')), '2026-10-10');
});

test('overflow accumulation clamps item by item and flags every clamp', () => {
  assert.deepEqual(accumulateOverflow([{ reports: 10 }, { reports: 20 }]), { reports: 30, incomplete: false });
  assert.deepEqual(accumulateOverflow([{ reports: 80 }, { reports: 80 }], { cap: 100 }), { reports: 100, incomplete: true });
  assert.deepEqual(accumulateOverflow([{ reports: 5, incomplete: true }]), { reports: 5, incomplete: true });
});

test('used is obs_rows + ledger_rows, so it can exceed the number of rows', () => {
  const { db, adapter } = fresh();
  const bucket = '2026-10-10';
  const plan = new Map([['script-src|inline|index|unknown|legacy', 5]]);

  ingest(adapter, Date.parse(`${bucket}T00:00:00.000Z`), plan);
  assert.deepEqual(readUsed(adapter, bucket), { obsRows: 1, ledgerRows: 1 });

  ingest(adapter, Date.parse(`${bucket}T00:00:00.000Z`), plan);
  assert.deepEqual(readUsed(adapter, bucket), { obsRows: 2, ledgerRows: 2 });

  const rows = adapter.one('SELECT COUNT(*) AS c FROM obs').c;
  assert.equal(rows, 1, 'one row, updated twice');
  assert.ok(readUsed(adapter, bucket).obsRows + readUsed(adapter, bucket).ledgerRows >= rows);
  assert.ok(db);
});

test('the budget decision includes the ledger write', () => {
  const { adapter } = fresh();
  const bucket = '2026-10-10';
  const key = 'script-src|inline|index|unknown|legacy';

  // A batch costs one observation write PLUS one ledger write, so a budget of 1 cannot fit it.
  const rejected = planBatch(adapter, bucket, new Map([[key, 1]]), { ingestBudget: 1 });
  assert.equal(rejected.action, 'reject', 'the ledger row must count towards the budget');
  assert.equal(rejected.plannedObsRows, 1);
  assert.equal(rejected.plannedLedgerRows, 1);
  assert.deepEqual(readUsed(adapter, bucket), { obsRows: 0, ledgerRows: 0 }, 'a rejected batch writes nothing');

  // A budget of exactly the batch cost is allowed, and the recorded usage matches.
  const accepted = planBatch(adapter, bucket, new Map([[key, 1]]), { ingestBudget: 2 });
  assert.equal(accepted.action, 'commit');
  assert.equal(accepted.plannedTotal, 2);
  commitBatch(adapter, accepted);
  assert.deepEqual(readUsed(adapter, bucket), { obsRows: 1, ledgerRows: 1 });
});

test('a rejected batch is judged on the whole batch and writes nothing', () => {
  const { adapter } = fresh();
  const bucket = '2026-10-10';
  const key = 'script-src|inline|index|unknown|legacy';
  let guard = 0;
  while (readUsed(adapter, bucket).obsRows + readUsed(adapter, bucket).ledgerRows
         <= LIMITS.INGEST_WRITE_BUDGET - 2) {
    ingest(adapter, Date.parse(`${bucket}T00:00:00.000Z`), new Map([[key, 1]]));
    guard += 1;
    assert.ok(guard < 5000, 'loop should terminate well before the budget');
  }
  const before = readUsed(adapter, bucket);
  const result = planBatch(adapter, bucket, new Map([[key, 1]]));
  assert.equal(result.action, 'reject');
  assert.deepEqual(readUsed(adapter, bucket), before, 'a rejected batch changes nothing');
});

test('an empty plan is a noop that never writes a ledger row', () => {
  const { adapter } = fresh();
  assert.equal(planBatch(adapter, '2026-10-10', new Map()).action, 'noop');
  assert.equal(adapter.one('SELECT COUNT(*) AS c FROM obs_write_ledger').c, 0);
});
