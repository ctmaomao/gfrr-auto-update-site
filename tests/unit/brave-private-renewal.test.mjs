import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BRAVE_RENEWAL_SMOKE_GRANT_ID, createBraveBudget } from '../../scripts/lib/brave-budget.mjs';
import { keyFingerprint, createSearchLedger } from '../../scripts/lib/free-search-ledger.mjs';
import { prepareBravePrivateProof, createBravePublicProjection, withBravePrivateProof,
  prepareBravePrivateRenewal, renewBravePrivateProof } from '../../scripts/lib/brave-private-proof.mjs';

const time = Date.parse('2026-11-18T12:00:00.000Z');
const before = time - 86400000;
const key = 'SYNTHETIC_RENEWAL_KEY';
const iso = ms => new Date(ms).toISOString();
const grant = (at, evidence) => ({ id: randomUUID(), keyId: keyFingerprint(key), scope: 'provider_enforced_free_only', source: 'owner_dashboard',
  evidenceSha256: evidence.repeat(64), accountPlanBindingSha256: 'b'.repeat(64), verifiedAt: iso(at), expiresAt: iso(at + 3600000),
  protectionEndsAt: iso(at + 3600000), requestLimit: 50, freeOnlyEnabled: true, hardStopConfirmed: true, plan: 'search_postpaid',
  bindingType: 'verified_dashboard_login_and_plan_key', loginIdentityVerified: true, planKeyAssociationVerified: true,
  accountObservation: { source: 'owner_dashboard', observedAt: iso(at), requestsUsed: 123, usageCostUsd: '0.62', outOfPocketCostUsd: '0.00', monthlyFreeCreditUsd: '5.00' } });
function fixture() {
  const old = prepareBravePrivateProof({ grant: grant(before, 'a'), recordingStartedAt: iso(before), now: before });
  const next = prepareBravePrivateRenewal({ privateProof: old, grant: grant(time - 60000, 'c'), now: time });
  const ledger = createBravePublicProjection({ privateProof: old, now: before });
  ledger.entries.push({ id: randomUUID(), grantId: old.grants[0].id, consumer: 'oil-news', mode: 'automated', runId: '42',
    requests: 1, time: iso(before + 1000), finishedAt: iso(before + 2000), state: 'success' });
  return { old, next, ledger };
}
function memory(initial, at = time) {
  let ledger = structuredClone(initial), rev = 1;
  const writes = [];
  return { writes, async read() { return { head: rev.toString(16).padStart(40, '0'), serverTime: at, ledger: structuredClone(ledger) }; },
    async write(previous, next) { if (previous.head !== rev.toString(16).padStart(40, '0')) return false;
      writes.push(structuredClone(next)); ledger = structuredClone(next); rev++; return true; } };
}
const args = (store, f) => ({ store, privateProof: f.old, nextPrivateProof: f.next, now: () => time });
const context = { key, consumer: 'oil-news', mode: 'automated', runId: '42' };
const gate = (store, proof, now = () => time) => createBraveBudget({ store: withBravePrivateProof(store, proof, now), now });
const never = () => assert.fail('No provider request permitted');
test.before(() => { globalThis.fetch = async () => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); }; });

test('explicit v4 renewal preserves complete public history and uses the unchanged private adapter', async () => {
  const f = fixture(), store = memory(f.ledger);
  const result = await renewBravePrivateProof(args(store, f));
  assert.equal(store.writes.length, 1);
  assert.deepEqual(result.entries, f.ledger.entries);
  for (const field of ['ledgerId', 'recordingStartedAt', 'historyBeforeRecording', 'hold', 'schemaVersion']) assert.deepEqual(result[field], f.ledger[field]);
  assert.deepEqual(result.grants.slice(0, -1), f.ledger.grants);
  assert.notEqual(result.proofCommitment, f.ledger.proofCommitment);
  assert.equal(result.grants.length, 2);
  await gate(store, f.next)(context, async () => ({ results: [] }));
  assert.equal((await store.read()).ledger.entries.length, 2);
  for (const token of [key, f.old.commitmentNonce, f.old.grants[0].keyId, f.old.grants[0].evidenceSha256,
    f.next.grants[1].evidenceSha256, 'accountObservation', 'accountPlanBindingSha256', 'search_postpaid']) {
    assert.ok(!JSON.stringify(store.writes).includes(token));
  }
});
test('expired settled smoke proof can be reconstructed for one append-only business renewal', async () => {
  const { old: p0, ledger: original } = fixture();
  const smoke = { ...grant(time - 60000, 'c'), id: BRAVE_RENEWAL_SMOKE_GRANT_ID };
  const prepare = (privateProof, grant, now) => prepareBravePrivateRenewal({ privateProof, grant, now });
  const smokeProofAtSettlement = prepare(p0, smoke, time);
  const smokeReceipt = { id: randomUUID(), grantId: smoke.id, consumer: 'brave-renewal-smoke', mode: 'manual',
    runId: '43', requests: 1, time: iso(time), finishedAt: iso(time + 1000), state: 'success' };
  const settled = { ...createBravePublicProjection({ privateProof: smokeProofAtSettlement, now: time }),
    entries: [...original.entries, smokeReceipt] };
  const recovery = time + 7200000, now = () => recovery, store = memory(settled, recovery);
  const frozen = await store.read();
  const readonly = { read: () => store.read(), write: () => assert.fail('Read-only rehearsal attempted a write') };
  const p1 = prepare(p0, structuredClone(smoke), recovery);
  const business = grant(recovery - 60000, 'd');
  assert.notEqual(business.id, smoke.id);
  const p2 = prepare(p1, business, recovery);
  const readWith = (proof, backing = readonly) => withBravePrivateProof(backing, proof, now).read();
  const matched = await readWith(p1);
  assert.equal(matched.head, frozen.head);
  assert.deepEqual(matched.ledger.entries.slice(1), [{ ...smokeReceipt, keyId: keyFingerprint(key) }]);
  for (const mismatch of [p0, p2]) {
    await assert.rejects(gate(readonly, mismatch, now)(context, never), /private_proof_invalid/);
  }
  await assert.rejects(gate(readonly, p1, now)(context, never), /brave_budget_grant_expired/);
  assert.deepEqual(await store.read(), frozen);

  const result = await renewBravePrivateProof({ store, privateProof: p1, nextPrivateProof: p2, now });
  const projection = createBravePublicProjection({ privateProof: p2, now: recovery });
  assert.notEqual(result.proofCommitment, settled.proofCommitment);
  assert.deepEqual(result, { ...settled, proofCommitment: projection.proofCommitment,
    grants: [...settled.grants, { id: business.id, verifiedAt: business.verifiedAt, expiresAt: business.expiresAt,
      requestLimit: business.requestLimit }] });
  assert.deepEqual(store.writes, [result]);
  assert.deepEqual((await store.read()).ledger, result);
  await assert.rejects(readWith(p1), /private_proof_invalid/);
  const admitted = (await readWith(p2)).ledger;
  assert.deepEqual(admitted.grants, [...matched.ledger.grants, business]);
  assert.deepEqual(admitted.entries, matched.ledger.entries);
});
test('two-phase mismatch is fail-closed in either order, old clients cannot write the new ledger', async () => {
  const f = fixture(), store = memory(f.ledger);
  await assert.rejects(gate(store, f.next)(context, never), /private_proof_invalid/);
  const oldAdapter = withBravePrivateProof(store, f.old, () => time), snapshot = await oldAdapter.read();
  await renewBravePrivateProof(args(store, f));
  await assert.rejects(gate(store, f.old)(context, never), /private_proof_invalid/);
  assert.equal(await oldAdapter.write(snapshot, snapshot.ledger), false);
  // Rolling a secret back cannot roll the public accounting back or reactivate it.
  await assert.rejects(gate(store, f.old)(context, never), /private_proof_invalid/);
});
test('identity, nonce, prefix, rotation, stale evidence and grant expansion are rejected', async () => {
  const mutations = [p => p.ledgerId = randomUUID(), p => p.commitmentNonce = 'd'.repeat(64), p => p.repository = 'other/repo',
    p => p.grants[0].accountObservation.requestsUsed++, p => p.grants.shift(), p => p.grants.push(grant(time - 1000, 'd')),
    p => p.grants[1].keyId = 'e'.repeat(16), p => p.grants[1].accountPlanBindingSha256 = 'e'.repeat(64),
    p => p.grants[1].evidenceSha256 = p.grants[0].evidenceSha256, p => p.grants[1].requestLimit = 51,
    p => p.grants[1].expiresAt = iso(time + 86400000), p => p.grants[1].freeOnlyEnabled = false,
    p => p.grants[1].hardStopConfirmed = false, p => p.grants[1].accountObservation.outOfPocketCostUsd = '0.01'];
  for (const mutate of mutations) {
    const f = fixture(), store = memory(f.ledger); mutate(f.next);
    await assert.rejects(renewBravePrivateProof(args(store, f)), /private_proof_invalid/);
    assert.equal(store.writes.length, 0);
  }
  const f = fixture(); f.old.grants[0].requestLimit = 1;
  assert.throws(() => prepareBravePrivateRenewal({ privateProof: f.old, grant: f.next.grants[1], now: time }), /private_proof_invalid/);
});
test('pending, held, untrusted clocks, corrupt ledger and wrong head never write', async () => {
  for (const mutate of [x => x.ledger.entries[0].state = 'reserved', x => x.ledger.hold = { code: 'brave_budget_provider_quota_unknown', reservationId: x.ledger.entries[0].id },
    x => x.serverTime = NaN, x => x.serverTime = time - 30001, x => x.head = null,
    x => x.ledger.proofCommitment = '0'.repeat(64), x => x.ledger.entries = [{ ...x.ledger.entries[0], requests: 0 }]]) {
    const f = fixture(), store = memory(f.ledger), read = store.read; store.read = async () => { const x = await read(); mutate(x); return x; };
    await assert.rejects(renewBravePrivateProof(args(store, f)), /private_proof_invalid/); assert.equal(store.writes.length, 0);
  }
});
test('old grant must be expired conservatively, new grant must have a dispatch margin', async () => {
  for (const expires of [time + 1000, time - 500]) {
    const f = fixture(); f.old.grants[0].verifiedAt = iso(time - 10000); f.old.grants[0].accountObservation.observedAt = iso(time - 10000);
    f.old.grants[0].expiresAt = iso(expires); f.old.grants[0].protectionEndsAt = iso(expires);
    f.next = { ...f.old, grants: [...f.old.grants, grant(time, 'c')] };
    await assert.rejects(renewBravePrivateProof(args(memory(f.ledger), f)), /private_proof_invalid/);
  }
  const f = fixture(); f.next.grants[1].expiresAt = iso(time + 31000);
  const store = memory(f.ledger); await assert.rejects(renewBravePrivateProof(args(store, f)), /private_proof_invalid/);
  for (const ticks of [[0, 30000], [100, 99], [0, NaN]]) {
    const other = fixture(); await assert.rejects(renewBravePrivateProof({ ...args(memory(other.ledger), other), monotonicNow: () => ticks.shift() }), /private_proof_invalid/);
  }
});
test('concurrent renewals have one winner; write outcome uncertainty never retries or reports success', async () => {
  const f = fixture(), store = memory(f.ledger);
  const results = await Promise.allSettled([renewBravePrivateProof(args(store, f)), renewBravePrivateProof(args(store, f))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(store.writes.length, 1);
  await assert.rejects(renewBravePrivateProof(args(store, f)), /private_proof_invalid/);
  for (const result of [false, undefined, 'true']) {
    let writes = 0; const s = memory(f.ledger); s.write = async () => { writes++; return result; };
    await assert.rejects(renewBravePrivateProof(args(s, f)), error => error.message === (result === false
      ? 'brave_budget_renewal_conflict' : 'brave_budget_renewal_write_uncertain')); assert.equal(writes, 1);
  }
  const s = memory(f.ledger), write = s.write; s.write = async (...values) => { await write(...values); throw new Error('PRIVATE_FAILURE'); };
  await assert.rejects(renewBravePrivateProof(args(s, f)), error => error.message === 'brave_budget_renewal_write_uncertain');
  assert.equal(s.writes.length, 1); await assert.rejects(gate(s, f.old)(context, never), /private_proof_invalid/);
});
test('new evidence cannot reconcile a receipt finished on or after its observation', async () => {
  const f = fixture(); f.ledger.entries[0].finishedAt = f.next.grants[1].verifiedAt;
  const store = memory(f.ledger); await assert.rejects(renewBravePrivateProof(args(store, f)), /private_proof_invalid/);
  assert.equal(store.writes.length, 0);
});
test('inputs are snapshotted before asynchronous read, caller mutation cannot substitute identity', async () => {
  const f = fixture(), store = memory(f.ledger), read = store.read;
  store.read = async () => { f.next.commitmentNonce = 'e'.repeat(64); f.old.grants[0].accountObservation.requestsUsed++; return read(); };
  const output = await renewBravePrivateProof(args(store, f)); assert.equal(output.entries.length, 1);
});
test('renewed v4 proof keeps all 950 rolling reservations across past grants', async () => {
  const f = fixture(); f.old.recordingStartedAt = iso(time - 20 * 86400000);
  f.old.grants = Array.from({ length: 19 }, (_, index) => grant(time - (20 - index) * 86400000, 'a'));
  f.next = prepareBravePrivateRenewal({ privateProof: f.old, grant: grant(time - 60000, 'c'), now: time });
  const ledger = createBravePublicProjection({ privateProof: f.old, now: time });
  ledger.entries = f.old.grants.flatMap(g => Array.from({ length: 50 }, (_, index) => ({ id: randomUUID(), grantId: g.id,
    consumer: ['oil-news','macro-editorial','bubble-editorial','bubble-ceo'][index % 4], mode: 'automated', runId: '42', requests: 1,
    time: iso(Date.parse(g.verifiedAt) + 1000), finishedAt: iso(Date.parse(g.verifiedAt) + 2000), state: 'success' })));
  const store = memory(ledger); await renewBravePrivateProof(args(store, f));
  assert.deepEqual((await store.read()).ledger.entries, ledger.entries);
  await assert.rejects(gate(store, f.next)(context, never), /brave_budget_project_limit/);
  assert.equal(store.writes.length, 1);
});
test('actual GitHub store renews via one non-force parented CAS with no private serialization or retry', async () => {
  for (const outcome of ['success', 'conflict', 'lost-response']) {
    const f = fixture(), head = 'a'.repeat(40), nextHead = 'b'.repeat(40), requests = [];
    let nextLedger;
    const fetchImpl = async (url, options) => {
      const path = new URL(url).pathname, body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, method: options.method, body });
      let data, status = 200;
      if (options.method === 'GET' && path.endsWith('/git/ref/heads/brave-usage-ledger')) data = { object: { sha: head } };
      else if (options.method === 'GET' && path.endsWith('/contents/usage.json')) {
        assert.equal(new URL(url).searchParams.get('ref'), head);
        data = { encoding: 'base64', content: Buffer.from(JSON.stringify(f.ledger)).toString('base64') };
      } else if (options.method === 'POST' && path.endsWith('/git/trees')) {
        assert.equal(body.tree.length, 1); assert.equal(body.tree[0].path, 'usage.json');
        nextLedger = JSON.parse(body.tree[0].content); data = { sha: 'c'.repeat(40) }; status = 201;
      } else if (options.method === 'POST' && path.endsWith('/git/commits')) {
        assert.deepEqual(body.parents, [head]); data = { sha: nextHead }; status = 201;
      } else if (options.method === 'PATCH' && path.endsWith('/git/refs/heads/brave-usage-ledger')) {
        assert.deepEqual(body, { sha: nextHead, force: false });
        if (outcome === 'lost-response') throw new Error('SYNTHETIC_PRIVATE_TRANSPORT_DETAIL');
        status = outcome === 'conflict' ? 422 : 200; data = { object: { sha: nextHead } };
      } else assert.fail('unexpected transport');
      return Response.json(data, { status, headers: { date: new Date(time).toUTCString() } });
    };
    const store = createSearchLedger({ branch: 'brave-usage-ledger', token: 'SYNTHETIC_ONLY', fetchImpl, now: () => time, prefix: 'brave_budget' });
    if (outcome === 'success') await renewBravePrivateProof(args(store, f));
    else await assert.rejects(renewBravePrivateProof(args(store, f)), error => error.message === (outcome === 'conflict'
      ? 'brave_budget_renewal_conflict' : 'brave_budget_renewal_write_uncertain'));
    assert.equal(requests.length, 5); assert.equal(requests.filter(x => x.method === 'PATCH').length, 1);
    assert.deepEqual(nextLedger.entries, f.ledger.entries);
    for (const token of [f.old.commitmentNonce, 'accountObservation', f.old.grants[0].keyId, 'SYNTHETIC_PRIVATE_TRANSPORT_DETAIL',
      f.old.grants[0].evidenceSha256, f.next.grants[1].evidenceSha256, 'accountPlanBindingSha256', key]) assert.ok(!JSON.stringify(requests).includes(token));
  }
});
test('legal old multi-grant v4 with nonmonotone expiries cannot hide a still-live earlier grant', async () => {
  const f = fixture();
  const first = grant(time - 7200000, 'a'); first.expiresAt = iso(time + 5000); first.protectionEndsAt = first.expiresAt;
  const second = grant(time - 3600000, 'd'); second.expiresAt = iso(time - 1800000);
  f.old.grants = [first, second];
  // Existing v3 accepts ordered verifications with overlapping/nonordered
  // expiries; this is a valid existing public/private pair, not a bad fixture.
  f.ledger = createBravePublicProjection({ privateProof: f.old, now: time });
  const added = grant(time - 60000, 'c');
  assert.throws(() => prepareBravePrivateRenewal({ privateProof: f.old, grant: added, now: time }), /private_proof_invalid/);
  f.next = { ...f.old, grants: [...f.old.grants, added] };
  const store = memory(f.ledger); await assert.rejects(renewBravePrivateProof(args(store, f)), /private_proof_invalid/);
  assert.equal(store.writes.length, 0);
});
test('successor secret compact UTF-8 bound is enforced before CAS at 47999/48000/48001 bytes', async () => {
  for (const size of [47999, 48000, 48001]) {
    const f = fixture();
    f.old.recordingStartedAt = iso(time - 100 * 86400000);
    // Grow a valid complete prefix, then tune decimal observation lengths to
    // the exact byte boundary. No fabricated real evidence is used.
    const candidates = Array.from({ length: 90 }, (_, i) => { const g = grant(time - (100 - i) * 86400000, 'a'); g.accountObservation.requestsUsed = 0; return g; });
    const added = grant(time - 60000, 'c'); added.accountObservation.requestsUsed = 0;
    let next;
    for (let n = 1; n <= candidates.length; n++) {
      next = { ...f.old, grants: [...structuredClone(candidates.slice(0, n)), structuredClone(added)] };
      const len = Buffer.byteLength(JSON.stringify(next));
      if (len <= size && size - len <= 14 * (n + 1)) break;
    }
    let remaining = size - Buffer.byteLength(JSON.stringify(next));
    assert.ok(remaining >= 0);
    for (const g of next.grants) {
      const extra = Math.min(14, remaining); g.accountObservation.requestsUsed = Number('1'.repeat(1 + extra)); remaining -= extra;
    }
    assert.equal(remaining, 0); assert.equal(Buffer.byteLength(JSON.stringify(next)), size);
    f.old.grants = structuredClone(next.grants.slice(0, -1)); f.next = next;
    f.ledger = createBravePublicProjection({ privateProof: f.old, now: time });
    const store = memory(f.ledger);
    if (size > 48000) {
      assert.throws(() => prepareBravePrivateRenewal({ privateProof: f.old, grant: next.grants.at(-1), now: time }), /private_proof_invalid/);
      await assert.rejects(renewBravePrivateProof(args(store, f)), /private_proof_invalid/); assert.equal(store.writes.length, 0);
    } else { await renewBravePrivateProof(args(store, f)); assert.equal(store.writes.length, 1); }
  }
});
test('local clock lead cannot authorize an observation still in the trusted server future', async () => {
  const f = fixture(); f.next.grants[1].verifiedAt = iso(time - 10000); f.next.grants[1].accountObservation.observedAt = iso(time - 10000);
  const store = memory(f.ledger), read = store.read;
  store.read = async () => ({ ...await read(), serverTime: time - 30000 });
  await assert.rejects(renewBravePrivateProof(args(store, f)), /private_proof_invalid/); assert.equal(store.writes.length, 0);
});
