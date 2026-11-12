import { BUDGET_REPOSITORY, POLICY, RETIREMENT_MARGIN_MS, digest, prepareRequest, readDeepSeekBalance, validateBalance, receipt } from './deepseek-budget.mjs';
import { RECEIPT_GRANT, prepareReceiptLedger, createReceiptExposureVerifier } from './deepseek-receipt-grant.mjs';

// One random public identifier for this fixed authorization. Secret rotation
// cannot generate a second marker or restore a consumed slot. It encodes no data.
export const PRIVATE_CLAIM_ID = 'e3626949043a19cfc977db6b37a51ce6859af701297e9dbf2d2c8a19161c1b8a';
export const OPAQUE_MARKER = Object.freeze({ schemaVersion: 'opaque-one-use-v1', state: 'consumed' });
export const PRIVATE_SNAPSHOT_LIMIT = 48 * 1024;
const HEX = /^[a-f0-9]{64}$/u, SHA = /^[a-f0-9]{40}$/u;
const fail = code => { throw Object.assign(new Error(`deepseek_budget_${code}`), { budgetCode: `deepseek_budget_${code}` }); };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === keys.split(',').sort().join(',');
const same = (a, b) => digest(a) === digest(b);
const time = n => { if (!Number.isSafeInteger(n) || n < 0 || n > 8_640_000_000_000_000) fail('clock_unknown'); return n; };
export function opaqueClaimRef(claimId) {
  if (claimId !== PRIVATE_CLAIM_ID) fail('private_snapshot_unproven');
  return `refs/heads/deepseek-once-${claimId}`;
}
export function validateOpaqueMarker(marker) {
  if (!exact(marker, 'schemaVersion,state') || !same(marker, OPAQUE_MARKER)) fail('claim_unproven');
  return marker;
}
export function validatePrivateSnapshot(snapshot, { approvedSnapshotDigest, approvedReviewDigest }, now = Date.now()) {
  time(now);
  if (!exact(snapshot, 'schemaVersion,claimId,sourceCommit,grant,review') || snapshot.schemaVersion !== 'deepseek-private-claim-v1'
    || snapshot.claimId !== PRIVATE_CLAIM_ID || !SHA.test(snapshot.sourceCommit || '') || !HEX.test(approvedSnapshotDigest || '')
    || !HEX.test(approvedReviewDigest || '') || digest(snapshot) !== approvedSnapshotDigest
    || digest(snapshot.review) !== approvedReviewDigest || Buffer.byteLength(JSON.stringify(snapshot)) > PRIVATE_SNAPSHOT_LIMIT) fail('private_snapshot_unproven');
  // Existing reviewed accounting is evaluated only in memory. It is never sent
  // to the public claim store, printed, or retained as an Actions artifact.
  prepareReceiptLedger({ grant: snapshot.grant, review: snapshot.review, approvedGrantDigest: digest(snapshot.grant) }, now);
  return snapshot;
}
export function parsePrivateSnapshot(serialized, approvals, now = Date.now()) {
  if (typeof serialized !== 'string' || !serialized || Buffer.byteLength(serialized) > PRIVATE_SNAPSHOT_LIMIT) fail('private_snapshot_unproven');
  let snapshot;
  try { snapshot = JSON.parse(serialized); } catch { fail('private_snapshot_unproven'); }
  return validatePrivateSnapshot(snapshot, approvals, now);
}

// The only public payload is a constant marker. The random identifier is not a
// digest of account, key, request, evidence or financial data. No outcome update
// exists: successful, failed and uncertain attempts all consume the same slot.
export function createOpaqueClaimStore({ token, claimId, fetchImpl = fetch, now = Date.now }) {
  if (!token) fail('credentials_missing');
  const ref = opaqueClaimRef(claimId), base = `https://api.github.com/repos/${BUDGET_REPOSITORY}`;
  let lastServerDate;
  const assertClock = () => {
    if (!Number.isFinite(lastServerDate) || Math.abs(time(now()) - lastServerDate) > POLICY.maxClockSkewMs) fail('clock_unknown');
  };
  async function api(path, method = 'GET', body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), POLICY.metadataTimeoutMs);
    const started = performance.now();
    const boundary = response => {
      const date = Date.parse(response.headers.get('date') || '');
      if (performance.now() - started > POLICY.metadataTimeoutMs || !Number.isFinite(date)
        || Math.abs(time(now()) - date) > POLICY.maxClockSkewMs) fail('clock_unknown');
      lastServerDate = date;
    };
    try {
      const response = await fetchImpl(`${base}${path}`, { method, redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      boundary(response);
      if (![200, 201].includes(response.status)) {
        await response.body?.cancel(); boundary(response); return { status: response.status };
      }
      if (!response.body) fail('claim_unproven');
      const reader = response.body.getReader(), chunks = []; let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read(); boundary(response); if (done) break;
        bytes += value.length; if (bytes > 64 * 1024) { await reader.cancel(); fail('claim_unproven'); }
        chunks.push(Buffer.from(value));
      }
      const json = JSON.parse(Buffer.concat(chunks).toString('utf8')); boundary(response);
      return { status: response.status, json };
    } catch (error) { if (error.budgetCode) throw error; fail('claim_uncertain'); }
    finally { clearTimeout(timer); }
  }
  return {
    assertClock,
    async available() {
      const result = await api(`/git/ref/${ref.slice(5)}`);
      if (result.status === 404) return true;
      if (result.status === 200) fail('grant_consumed');
      fail('claim_unproven');
    },
    async claim() {
      // Parentless marker commits cannot include a source tree or private files.
      const tree = await api('/git/trees', 'POST', { tree: [{ path: 'claim.json', mode: '100644', type: 'blob', content: JSON.stringify(OPAQUE_MARKER) }] });
      if (tree.status !== 201 || !SHA.test(tree.json?.sha || '')) fail('claim_unproven');
      const commit = await api('/git/commits', 'POST', { message: 'Record one-use claim', tree: tree.json.sha, parents: [] });
      if (commit.status !== 201 || !SHA.test(commit.json?.sha || '')) fail('claim_unproven');
      const created = await api('/git/refs', 'POST', { ref, sha: commit.json.sha });
      if ([409, 422].includes(created.status)) fail('grant_consumed');
      if (created.status !== 201 || created.json?.ref !== ref || created.json?.object?.sha !== commit.json.sha) fail('claim_uncertain');
      assertClock();
      return commit.json.sha;
    },
    async verifyClaim(head) {
      if (!SHA.test(head || '')) fail('claim_unproven');
      const result = await api(`/git/ref/${ref.slice(5)}`);
      if (result.status !== 200 || result.json?.object?.sha !== head) fail('claim_unproven');
      assertClock(); return true;
    }
  };
}
const requireExposure = async (verifyExposure, snapshot, runId) => {
  if (typeof verifyExposure !== 'function' || await verifyExposure(structuredClone(snapshot.grant.snapshot), runId) !== true) fail('exposure_unproven');
};
export async function verifyPrivateClaimStatus({ snapshot, approvedSnapshotDigest, approvedReviewDigest, store, verifyExposure, runId, now = Date.now }) {
  validatePrivateSnapshot(snapshot, { approvedSnapshotDigest, approvedReviewDigest }, time(now()));
  if (await store.available() !== true) fail('claim_unproven');
  await requireExposure(verifyExposure, snapshot, runId);
  validatePrivateSnapshot(snapshot, { approvedSnapshotDigest, approvedReviewDigest }, time(now())); store.assertClock?.();
  return { operation: 'read_only_verification', providerCalls: 0, writes: 0, admission: 'eligible_snapshot_only' };
}
export function createPrivateClaimBudget({ snapshot, approvedSnapshotDigest, approvedReviewDigest, store, verifyExposure,
  readBalance = readDeepSeekBalance, now = Date.now }) {
  let stopped = false, lastTime = -1;
  const clock = () => { const at = time(now()); if (at < lastTime) fail('clock_rollback'); lastTime = at; return at; };
  const approvals = { approvedSnapshotDigest, approvedReviewDigest };
  return async (context, request) => {
    if (stopped) fail('session_stopped');
    let prepared, startedAt;
    try {
      validatePrivateSnapshot(snapshot, approvals, clock());
      prepared = prepareRequest(context);
      if (prepared.consumer !== RECEIPT_GRANT.consumer || prepared.mode !== 'manual' || !/^[0-9]+$/u.test(prepared.runId)
        || typeof request !== 'function') fail('grant_manual_only');
      if (prepared.keyId !== snapshot.grant.snapshot.keyId) fail('key_mismatch');
      if (await store.available() !== true) fail('claim_unproven');
      await requireExposure(verifyExposure, snapshot, prepared.runId);
      validateBalance(await readBalance(context.key));
      validatePrivateSnapshot(snapshot, approvals, clock()); store.assertClock?.();
      const claimHead = await store.claim();
      // Slot is permanently consumed before the callback. No private data is
      // supplied to store.claim, even on subsequent response-validation failure.
      stopped = true;
      await requireExposure(verifyExposure, snapshot, prepared.runId);
      if (!same(prepared, prepareRequest(context))) fail('request_changed');
      validatePrivateSnapshot(snapshot, approvals, clock());
      if (await store.verifyClaim(claimHead) !== true) fail('claim_unproven');
      store.assertClock?.(); startedAt = clock();
      validatePrivateSnapshot(snapshot, approvals, startedAt);
      if (!same(prepared, prepareRequest(context))) fail('request_changed');
      if (startedAt + RETIREMENT_MARGIN_MS / 2 >= Date.parse(snapshot.grant.expiresAt)) fail('grant_expired');
    } catch (error) { stopped = true; throw error; }
    try {
      const result = await request(prepared);
      receipt(result, startedAt, clock()); // Memory-only validation; never publish usage.
      return result;
    } catch (error) {
      if (/^deepseek_budget_[a-z_]+$/u.test(error?.budgetCode || '')) throw error;
      fail('provider_unknown');
    }
  };
}
export function privateClaimRuntimeConfig(env = process.env, at = Date.now()) {
  if (env.DEEPSEEK_BUDGET_SELECTION !== RECEIPT_GRANT.id || env.DEEPSEEK_BUDGET_CONSUMER !== RECEIPT_GRANT.consumer
    || env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REPOSITORY !== BUDGET_REPOSITORY || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_RUN_ATTEMPT !== '1' || !/^[0-9]+$/u.test(env.GITHUB_RUN_ID || '')
    || env.GITHUB_WORKFLOW_REF !== `${BUDGET_REPOSITORY}/.github/workflows/bubble-watch-weekly-editorial-refresh.yml@refs/heads/main`) fail('grant_manual_only');
  const approvedSnapshotDigest = env.DEEPSEEK_RECEIPT_PRIVATE_APPROVAL_SHA256;
  const approvedReviewDigest = env.DEEPSEEK_RECEIPT_PRIVATE_PRICE_SHA256;
  const snapshot = parsePrivateSnapshot(env.DEEPSEEK_RECEIPT_PRIVATE_SNAPSHOT, { approvedSnapshotDigest, approvedReviewDigest }, at);
  if (env.GITHUB_SHA !== snapshot.sourceCommit) fail('source_changed');
  const token = env.DEEPSEEK_BUDGET_GITHUB_TOKEN;
  const runtimeIdentity = digest({ approvedSnapshotDigest, approvedReviewDigest, runId: env.GITHUB_RUN_ID, tokenDigest: digest(token || '') });
  return { snapshot, approvedSnapshotDigest, approvedReviewDigest, runId: env.GITHUB_RUN_ID, runtimeIdentity,
    store: createOpaqueClaimStore({ token, claimId: snapshot.claimId }), verifyExposure: createReceiptExposureVerifier({ token }) };
}
let runtime, runtimeIdentity;
export async function withPrivateClaimBudget({ key, payload, consumer }, request) {
  const config = privateClaimRuntimeConfig();
  if (consumer !== RECEIPT_GRANT.consumer) fail('grant_manual_only');
  if (runtimeIdentity && runtimeIdentity !== config.runtimeIdentity) fail('session_stopped');
  if (!runtime) { runtimeIdentity = config.runtimeIdentity; runtime = createPrivateClaimBudget(config); }
  return runtime({ key, payload, consumer, mode: 'manual', runId: config.runId }, request);
}
