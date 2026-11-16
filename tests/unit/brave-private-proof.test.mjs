import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createBraveBudget, summarizeBraveLedger } from '../../scripts/lib/brave-budget.mjs';
import { keyFingerprint, createSearchLedger } from '../../scripts/lib/free-search-ledger.mjs';
import { prepareBravePrivateProof, parseBravePrivateProof, createBravePublicProjection, withBravePrivateProof } from '../../scripts/lib/brave-private-proof.mjs';
const time = Date.parse('2026-11-16T12:00:00.000Z');
const key = 'SYNTHETIC_PRIVATE_API_KEY';
const grant = () => ({ id: randomUUID(), keyId: keyFingerprint(key), scope: 'provider_enforced_free_only', source: 'owner_dashboard',
  evidenceSha256: 'a'.repeat(64), accountPlanBindingSha256: 'b'.repeat(64), verifiedAt: '2026-11-16T11:00:00.000Z',
  expiresAt: '2026-11-17T11:00:00.000Z', protectionEndsAt: '2026-11-17T11:00:00.000Z', requestLimit: 50,
  freeOnlyEnabled: true, hardStopConfirmed: true, plan: 'search_postpaid', bindingType: 'verified_dashboard_login_and_plan_key',
  loginIdentityVerified: true, planKeyAssociationVerified: true, accountObservation: { source: 'owner_dashboard',
    observedAt: '2026-11-16T11:00:00.000Z', requestsUsed: 123, usageCostUsd: '0.62', outOfPocketCostUsd: '0.00', monthlyFreeCreditUsd: '5.00' } });
const fixture = () => ({ schemaVersion: 'brave-private-proof-v1', repository: 'ctmaomao/gfrr-auto-update-site',
  branch: 'brave-usage-ledger', ledgerId: randomUUID(), commitmentNonce: '3'.repeat(64),
  recordingStartedAt: '2026-11-16T11:30:00.000Z', grants: [grant()] });
const project = proof => createBravePublicProjection({ privateProof: proof, now: time });
const forbidden = proof => [key, proof.commitmentNonce, proof.grants[0].keyId, proof.grants[0].evidenceSha256,
  proof.grants[0].accountPlanBindingSha256, 'accountObservation', 'requestsUsed', 'usageCostUsd', 'outOfPocketCostUsd',
  'monthlyFreeCreditUsd', 'search_postpaid', 'keyId', 'loginIdentityVerified', 'planKeyAssociationVerified'];
function assertPrivate(value, proof) { const text = JSON.stringify(value); for (const token of forbidden(proof)) assert.ok(!text.includes(token), `private token leaked: ${token}`); }
function memory(ledger) {
  let current = structuredClone(ledger), head = '0'; const writes = [];
  return { writes, async read() { return { head, serverTime: time, ledger: structuredClone(current) }; },
    async write(previous, next) { if (previous.head !== head) return false; writes.push(structuredClone(next)); current = structuredClone(next); head = String(+head + 1); return true; } };
}
const context = { key, consumer: 'oil-news', mode: 'automated', runId: '42' };
const never = () => assert.fail('provider must not be called');
const gate = (store, proof, options = {}) => createBraveBudget({ store: withBravePrivateProof(store, proof, () => time), now: () => time, ...options });
test.before(() => { globalThis.fetch = async () => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); }; });

test('public projection is an exact project-only allowlist, never account metadata or unsalted identity hashes', () => {
  const proof = fixture(), ledger = project(proof); assertPrivate(ledger, proof);
  assert.deepEqual(Object.keys(ledger).sort(), ['entries','grants','historyBeforeRecording','hold','ledgerId','proofCommitment','recordingStartedAt','schemaVersion'].sort());
  assert.deepEqual(Object.keys(ledger.grants[0]).sort(), ['expiresAt','id','requestLimit','verifiedAt']);
  assert.equal(ledger.historyBeforeRecording, 'unknown'); assert.deepEqual(ledger.entries, []);
  assert.match(ledger.proofCommitment, /^[a-f0-9]{64}$/u);
  const other = structuredClone(proof); other.commitmentNonce = '4'.repeat(64);
  assert.notEqual(project(other).proofCommitment, ledger.proofCommitment, 'identical account evidence has no reusable public digest across fresh private nonces');
});
test('private proof parser rejects malformed, overlarge, foreign and incomplete attestations without echoing input', () => {
  for (const raw of ['SYNTHETIC_PRIVATE_DATA', 'x'.repeat(1024 * 1024 + 1), null]) {
    assert.throws(() => parseBravePrivateProof(raw, time), error => error.message === 'brave_budget_private_proof_invalid');
  }
  for (const patch of [{ branch: 'main' }, { repository: 'foreign/repo' }, { commitmentNonce: '' }, { grants: [] },
    { recordingStartedAt: '2026-11-16T11:30:00Z' }, { extra: 'private' }]) {
    assert.throws(() => parseBravePrivateProof({ ...fixture(), ...patch }, time), /private_proof_invalid/);
  }
});
test('proof cannot replay to another ledger, creation time, private identity or public grant chain', async () => {
  const proof = fixture(), ledger = project(proof);
  for (const mutate of [p => { p.ledgerId = randomUUID(); }, p => { p.recordingStartedAt = '2026-11-16T11:29:00.000Z'; },
    p => { p.commitmentNonce = '4'.repeat(64); }, p => { p.grants[0].keyId = 'f'.repeat(16); },
    p => { p.grants[0].accountPlanBindingSha256 = 'c'.repeat(64); }, p => { p.grants[0].accountObservation.requestsUsed++; }]) {
    const altered = structuredClone(proof); mutate(altered);
    await assert.rejects(gate(memory(ledger), altered)(context, never), /private_proof_invalid/);
  }
  for (const mutate of [l => { l.proofCommitment = '0'.repeat(64); }, l => { l.grants[0].requestLimit++; },
    l => { l.grants = []; }, l => { l.grants.push({ ...l.grants[0], id: randomUUID() }); },
    l => { l.accountObservation = { usageCostUsd: '0.62' }; }]) {
    const altered = structuredClone(ledger); mutate(altered);
    await assert.rejects(gate(memory(altered), proof)(context, never), /private_proof_invalid/);
  }
});
test('same canonical private evidence accepts reordered JSON, but caller mutation cannot change the captured proof', async () => {
  const proof = fixture(), ledger = project(proof), reordered = Object.fromEntries(Object.entries(proof).reverse());
  reordered.grants = proof.grants.map(g => Object.fromEntries(Object.entries(g).reverse()));
  const store = memory(ledger), run = gate(store, reordered);
  reordered.grants[0].keyId = 'f'.repeat(16);
  await run(context, async () => ({ results: [] }));
  assert.equal(store.writes.length, 2); store.writes.forEach(value => assertPrivate(value, proof));
});
test('real v3 gate writes only anonymous v4 reservations/receipts and sanitized reports', async () => {
  const proof = fixture(), store = memory(project(proof)), reports = [];
  await gate(store, proof, { report: value => reports.push(value) })(context, async () => ({ results: [] }));
  assert.equal(store.writes[0].entries[0].state, 'reserved'); assert.equal(store.writes[1].entries[0].state, 'success');
  store.writes.forEach(value => assertPrivate(value, proof)); assertPrivate(reports, proof);
  assert.equal((await store.read()).ledger.schemaVersion, 'brave-budget-v4');
  assert.throws(() => summarizeBraveLedger((store.writes[1]), time), /invalid_ledger/, 'old public summary cannot expose hydrated private state');
});
test('missing proof, wrong actual key, near expiry, CAS exhaustion and unknown outcomes stay fail closed', async () => {
  const proof = fixture(), publicLedger = project(proof);
  await assert.rejects(createBraveBudget({ store: memory(publicLedger), now: () => time })(context, never), /invalid_ledger/);
  await assert.rejects(gate(memory(publicLedger), proof)({ ...context, key: 'OTHER_SYNTHETIC_KEY' }, never), /key_scope_unknown/);
  const near = fixture(); near.grants[0].expiresAt = new Date(time + 31000).toISOString();
  await assert.rejects(gate(memory(project(near)), near)(context, never), /grant_expired/);
  const conflict = memory(publicLedger); conflict.write = async () => false;
  await assert.rejects(gate(conflict, proof)(context, never), /contention/);
  const pending = memory(publicLedger);
  await assert.rejects(gate(pending, proof)(context, async () => { throw new Error('network timeout'); }), /provider_outcome_unknown/);
  await assert.rejects(gate(pending, proof)(context, never), /pending_accounting/);
  pending.writes.forEach(value => assertPrivate(value, proof));
});
test('simultaneous final allowance remains one dispatch and a failed quota response leaves durable public hold', async () => {
  const proof = fixture(); proof.grants[0].requestLimit = 1;
  const store = memory(project(proof)); let calls = 0;
  await Promise.allSettled([1,2].map(() => gate(store, proof)(context, async () => { calls++; return { results: [] }; })));
  assert.equal(calls, 1);
  const quota = memory(project(proof));
  await assert.rejects(gate(quota, proof)(context, async () => { throw Object.assign(new Error('quota'), { providerResponseReceived: true, httpStatus: 429 }); }), /provider_quota_unknown/);
  await assert.rejects(gate(quota, proof)(context, never), /provider_quota_unknown/);
  quota.writes.forEach(value => assertPrivate(value, proof));
});
test('adapter rejects forged prior snapshots and private-field injection before any public write', async () => {
  const proof = fixture(), raw = memory(project(proof)), store = withBravePrivateProof(raw, proof, () => time);
  const snapshot = await store.read();
  await assert.rejects(store.write({ ...snapshot }, snapshot.ledger), /private_proof_invalid/);
  snapshot.ledger.entries.push({ keyId: proof.grants[0].keyId, secret: 'SYNTHETIC' });
  await assert.rejects(store.write(snapshot, snapshot.ledger), /private_proof_invalid/);
  assert.equal(raw.writes.length, 0);
});
test('production entry rejects malformed private env without echoing it or attempting a provider request', () => {
  const secret = 'SYNTHETIC_PRIVATE_PROOF_SENTINEL';
  const script = `globalThis.fetch=async()=>{throw new Error('UNEXPECTED_NETWORK')};const {withBraveBudget}=await import('./scripts/lib/brave-budget.mjs');try{await withBraveBudget({key:'synthetic',consumer:'oil-news'},()=>{throw new Error('UNEXPECTED_PROVIDER')})}catch(e){console.log(e.message)}`;
  const child = spawnSync(process.execPath, ['--input-type=module','-e',script], { encoding:'utf8', env: {
    TAVILY_BUDGET_GITHUB_TOKEN: 'synthetic', BRAVE_BUDGET_PRIVATE_PROOF: secret } });
  assert.equal(child.status, 0); assert.match(child.stdout, /brave_budget_private_proof_invalid/);
  assert.ok(!(child.stdout + child.stderr).includes(secret));
});
test('production runtime detects private proof removal or replacement before another ledger or provider call', () => {
  const proof = fixture(), ledger = project(proof);
  for (const replacement of ['', JSON.stringify({ ...proof, commitmentNonce: '4'.repeat(64) })]) {
    const source = `Date.now=()=>${time};let reads=0;globalThis.fetch=async(url)=>{reads++;const body=url.includes('/git/ref/')?{object:{sha:'a'.repeat(40)}}:{encoding:'base64',content:Buffer.from(JSON.stringify(${JSON.stringify(ledger)})).toString('base64')};return Response.json(body,{headers:{date:new Date(Date.now()).toUTCString()}})};const {withBraveBudget}=await import('./scripts/lib/brave-budget.mjs');try{await withBraveBudget({key:'wrong-synthetic',consumer:'oil-news'},()=>{throw Error('UNEXPECTED_PROVIDER')})}catch(e){if(e.message!=='brave_budget_key_scope_unknown')throw e;}process.env.BRAVE_BUDGET_PRIVATE_PROOF=${JSON.stringify(replacement)};try{await withBraveBudget({key:'wrong-synthetic',consumer:'oil-news'},()=>{throw Error('UNEXPECTED_PROVIDER')})}catch(e){console.log(e.message)}console.log('READS='+reads);`;
    const child = spawnSync(process.execPath, ['--input-type=module','-e',source], { encoding:'utf8', env: {
      TAVILY_BUDGET_GITHUB_TOKEN:'synthetic', BRAVE_BUDGET_PRIVATE_PROOF:JSON.stringify(proof) } });
    assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /private_proof_configuration_changed/);
    assert.match(child.stdout, /READS=2/); assertPrivate(child.stdout + child.stderr, proof);
  }
});
test('receipt write uncertainty leaves public reservation and never serializes hydrated private evidence', async () => {
  const proof = fixture(), raw = memory(project(proof)), write = raw.write; let writes = 0;
  raw.write = async (previous, next) => { assertPrivate(next, proof); if (++writes > 1) throw new Error('synthetic store lost'); return write(previous, next); };
  const reports = [];
  await gate(raw, proof, { report: value => reports.push(value) })(context, async () => ({ results: [] }));
  assert.equal((await raw.read()).ledger.entries[0].state, 'reserved');
  await assert.rejects(gate(raw, proof)(context, never), /pending_accounting/);
  assertPrivate(reports, proof); assert.ok(reports.some(row => row.status === 'brave_budget_receipt_pending'));
});

test('offline proof preparation uses independent random ledger identities and private commitment nonces', () => {
  const options = { grant: grant(), recordingStartedAt: fixture().recordingStartedAt, now: time };
  const first = prepareBravePrivateProof(options), second = prepareBravePrivateProof(options);
  assert.notEqual(first.ledgerId, second.ledgerId); assert.notEqual(first.commitmentNonce, second.commitmentNonce);
  assert.match(first.commitmentNonce, /^[a-f0-9]{64}$/u);
  assertPrivate(project(first), first);
});

test('real GitHub store serialization contains only public v4 accounting, never hydrated proof', async () => {
  const proof = fixture(); let ledger = project(proof), head = 'a'.repeat(40), nextLedger, commitCount = 0;
  const bodies = [];
  const transport = async (url, options) => {
    const path = new URL(url).pathname, body = options.body ? JSON.parse(options.body) : null;
    if (body) { bodies.push(body); assertPrivate(body, proof); }
    let data, status = 200;
    if (options.method === 'GET' && path.includes('/git/ref/')) data = { object: { sha: head } };
    else if (options.method === 'GET' && path.endsWith('/contents/usage.json')) data = { encoding: 'base64', content: Buffer.from(JSON.stringify(ledger)).toString('base64') };
    else if (options.method === 'POST' && path.endsWith('/git/trees')) {
      assert.deepEqual(Object.keys(body), ['tree']); assert.equal(body.tree.length, 1);
      assert.equal(body.tree[0].path, 'usage.json'); nextLedger = JSON.parse(body.tree[0].content);
      assert.equal(nextLedger.schemaVersion, 'brave-budget-v4'); data = { sha: 'c'.repeat(40) }; status = 201;
    } else if (options.method === 'POST' && path.endsWith('/git/commits')) {
      assert.deepEqual(body.parents, [head]); data = { sha: (++commitCount).toString(16).padStart(40, '0') }; status = 201;
    } else if (options.method === 'PATCH' && path.endsWith('/git/refs/heads/brave-usage-ledger')) {
      assert.equal(body.force, false); head = body.sha; ledger = nextLedger; data = { object: { sha: head } };
    } else throw new Error('unexpected offline transport');
    return Response.json(data, { status, headers: { date: new Date(time).toUTCString() } });
  };
  const store = createSearchLedger({ branch: 'brave-usage-ledger', token: 'SYNTHETIC_GITHUB_TOKEN', fetchImpl: transport, now: () => time, prefix: 'brave_budget' });
  await gate(store, proof)(context, async () => ({ results: [] }));
  assert.equal(ledger.entries[0].state, 'success'); assert.equal(bodies.length, 6); assertPrivate(ledger, proof);
});
