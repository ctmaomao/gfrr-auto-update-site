import { createBraveBudget, summarizeBraveLedger, BRAVE_DISPATCH_DEADLINE_MS, BRAVE_RENEWAL_SMOKE_GRANT_ID } from './brave-budget.mjs';
import { parseBravePrivateProof, prepareBravePrivateRenewal, renewBravePrivateProof, withBravePrivateProof } from './brave-private-proof.mjs';
import { keyFingerprint, SEARCH_REPOSITORY, SEARCH_CLOCK_POLICY } from './free-search-ledger.mjs';

export const CANARY = Object.freeze({
  purpose: 'brave-private-renewal-single-canary-20261118',
  baseHead: '5c9b8d129bcd188b98aeeeac25840a0f3acfe169',
  grantId: BRAVE_RENEWAL_SMOKE_GRANT_ID,
  workflow: '.github/workflows/brave-private-canary.yml',
  query: 'solar eclipse'
});
const fail = () => { throw new Error('brave_canary_refused'); };
const stable = value => JSON.stringify(value);
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === fields.split(',').sort().join(',');
const hex = (value, n) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${n}}$`, 'u').test(value);

// This is a private attestation from an independently verified dashboard review,
// NOT proof that arbitrary JSON claims are true. Provisioning is a trusted act.
// No real identity, evidence or account-derived digest belongs in repository code.
export function validateCanaryInputs({ originalProof, chain, keys, context, now }) {
  try {
    if (typeof chain !== 'string' || Buffer.byteLength(chain) > 48000) fail();
    const record = JSON.parse(chain);
    if (!exact(record, 'schemaVersion,purpose,baseHead,approvedDispatchSha,freshKeyId,freshAccountPlanBindingSha256,grant')
      || record.schemaVersion !== 'brave-renewal-chain-v1' || record.purpose !== CANARY.purpose
      || record.baseHead !== CANARY.baseHead || !hex(record.approvedDispatchSha, 40)
      || !hex(record.freshKeyId, 16) || !hex(record.freshAccountPlanBindingSha256, 64)) fail();
    if (context.actions !== 'true' || context.repository !== SEARCH_REPOSITORY || context.ref !== 'refs/heads/main'
      || context.event !== 'workflow_dispatch' || context.sha !== record.approvedDispatchSha
      || context.workflowSha !== record.approvedDispatchSha || context.liveMainSha !== record.approvedDispatchSha
      || context.workflowRef !== `${SEARCH_REPOSITORY}/${CANARY.workflow}@refs/heads/main`
      || !/^[0-9]+$/u.test(context.runId || '') || !['preview', 'single-test'].includes(context.operation)
      || context.job !== context.operation) fail();
    const unique = [...new Set(keys.flatMap(value => String(value || '').split(/[\n,;]+/u)).map(value => value.trim()).filter(Boolean))];
    if (unique.length !== 1 || /\s/u.test(unique[0])) fail();
    const key = unique[0], original = parseBravePrivateProof(originalProof, now);
    const prior = original.grants.at(-1), grant = record.grant;
    if (original.grants.some(g => g.id === CANARY.grantId) || grant?.id !== CANARY.grantId
      || keyFingerprint(key) !== record.freshKeyId || prior.keyId !== record.freshKeyId || grant.keyId !== record.freshKeyId
      || prior.accountPlanBindingSha256 !== record.freshAccountPlanBindingSha256
      || grant.accountPlanBindingSha256 !== record.freshAccountPlanBindingSha256
      || grant.requestLimit !== prior.requestLimit) fail();
    const next = prepareBravePrivateRenewal({ privateProof: original, grant, now });
    return { key, original, next };
  } catch { fail(); }
}

// One logical authorization forever, not one call per dispatch or per process.
// Every reservation attempt uses the ordinary shared budget/receipt machinery.
// A CAS loser throws instead of returning false, preventing admission retries.
function oneShotStore(adapter, next) {
  const reads = new WeakMap();
  let ownReservation;
  return {
    async read() {
      const snapshot = await adapter.read(); reads.set(snapshot, structuredClone(snapshot.ledger)); return snapshot;
    },
    async write(previous, ledger) {
      const before = reads.get(previous);
      if (!before || stable(before.grants) !== stable(next.grants)) fail();
      const oldRows = before.entries.filter(row => row.grantId === CANARY.grantId);
      const rows = ledger.entries.filter(row => row.grantId === CANARY.grantId);
      if (!ownReservation) {
        if (oldRows.length !== 0 || rows.length !== 1 || rows[0].state !== 'reserved'
          || rows[0].consumer !== 'brave-renewal-smoke' || rows[0].mode !== 'manual') fail();
        ownReservation = rows[0].id;
      } else if (oldRows.length !== 1 || rows.length !== 1 || rows[0].id !== ownReservation
        || oldRows[0].id !== ownReservation || oldRows[0].state !== 'reserved' || !['success', 'failed'].includes(rows[0].state)) fail();
      let result;
      try { result = await adapter.write(previous, ledger); } catch { fail(); }
      if (result !== true) fail();
      return true;
    }
  };
}

export async function runBraveCanary({ originalProof, chain, keys, context, baseSnapshot, store, request,
  now = Date.now, monotonicNow = () => performance.now() }) {
  const { key, original, next } = validateCanaryInputs({ originalProof, chain, keys, context, now: now() });
  if (baseSnapshot?.head !== CANARY.baseHead) fail();
  // Authenticate the fixed old root and receipt history without changing it.
  await withBravePrivateProof({ read: async () => structuredClone(baseSnapshot) }, original, now).read();
  const current = await store.read();
  const prefix = baseSnapshot.ledger.entries;
  if (current.ledger?.entries?.length < prefix.length
    || stable(current.ledger.entries.slice(0, prefix.length)) !== stable(prefix)) fail();
  let projected = current.ledger;
  if (current.head === CANARY.baseHead) {
    // Run the actual #650 validator against a captured snapshot and a read-only
    // write sink. No public API write or provider call occurs in preview.
    let projection;
    await renewBravePrivateProof({ store: { read: async () => current,
      write: async (_previous, value) => { projection = value; return true; } }, privateProof: original,
    nextPrivateProof: next, now, monotonicNow });
    projected = projection;
  } else {
    // Resume only this exact fixed successor. A changed supplement cannot
    // append a second grant, clear a debit or establish another authorization.
    const snapshot = await withBravePrivateProof({ read: async () => current }, next, now).read();
    if (!Number.isFinite(snapshot.serverTime) || Math.abs(now() - snapshot.serverTime) > SEARCH_CLOCK_POLICY.maxSkewMs
      || Math.max(now(), snapshot.serverTime) + BRAVE_DISPATCH_DEADLINE_MS + SEARCH_CLOCK_POLICY.httpDatePrecisionMs >= Date.parse(next.grants.at(-1).expiresAt)
      || summarizeBraveLedger(snapshot.ledger, now()).status !== 'eligible_snapshot_only'
      || snapshot.ledger.hold !== null || snapshot.ledger.entries.some(row => row.state === 'reserved')
      || snapshot.ledger.entries.some(row => row.grantId === CANARY.grantId)) fail();
  }
  // The normal gate is exercised before ANY real CAS in both root/resume
  // paths. Its reservations/receipts exist solely in this discarded sink.
  let simulated = { ...current, ledger: structuredClone(projected) };
  const sink = { read: async () => structuredClone(simulated), write: async (_previous, ledger) => {
    simulated = { ...simulated, ledger: structuredClone(ledger) }; return true;
  } };
  await createBraveBudget({ store: oneShotStore(withBravePrivateProof(sink, next, now), next), now, monotonicNow })(
    { key, consumer: 'brave-renewal-smoke', mode: 'manual', runId: context.runId }, async () => ({ results: [] }));
  if (context.operation === 'preview') return 'PREVIEW_READY';
  if (current.head === CANARY.baseHead) {
    let saved;
    try { saved = await store.write(current, projected); } catch { fail(); }
    if (saved !== true) fail();
  }
  const adapter = withBravePrivateProof(store, next, now);
  const budget = createBraveBudget({ store: oneShotStore(adapter, next), now, monotonicNow });
  await budget({ key, consumer: 'brave-renewal-smoke', mode: 'manual', runId: context.runId }, () => request(key));
  const settled = await adapter.read();
  const receipt = settled.ledger.entries.filter(row => row.grantId === CANARY.grantId);
  if (receipt.length !== 1 || receipt[0].state !== 'success' || receipt[0].runId !== context.runId
    || receipt[0].consumer !== 'brave-renewal-smoke' || settled.ledger.hold !== null) fail();
  // Results are deliberately not returned. The shared public receipt is the
  // only retained fact; output is a fixed enum with no provider-derived data.
  return 'SINGLE_TEST_FINISHED';
}

export async function requestDiscardedCanary(key, fetchImpl = fetch) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(`https://api.search.brave.com/res/v1/news/search?${new URLSearchParams({ q: CANARY.query, count: '1' })}`, {
      redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', 'X-Subscription-Token': key }
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error('brave_canary_provider_rejected'), { providerResponseReceived: true, httpStatus: response.status });
    }
    // Transient bounded parsing only. No content leaves this function, enters
    // a log, artifact, summary, file or exception. A malformed 2xx stays debt.
    const reader = response.body.getReader(), chunks = []; let length = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 1024 * 1024) { await reader.cancel(); throw new Error('brave_canary_response_invalid'); }
      chunks.push(Buffer.from(value));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || !Array.isArray(body.results) || body.error || body.errors) throw new Error('brave_canary_response_invalid');
    return { results: [] };
  } finally { clearTimeout(timer); }
}
