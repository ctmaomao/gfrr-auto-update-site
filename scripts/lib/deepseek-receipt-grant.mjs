import { randomUUID } from 'node:crypto';
import { BUDGET_REPOSITORY, BUDGET_BRANCH, POLICY, POLICY_DIGEST, RETIREMENT_MARGIN_MS,
  digest, createGithubLedgerStore, prepareRequest, readDeepSeekBalance, validateBalance,
  validateReview, activeReview, validateTokenUsage, receipt } from './deepseek-budget.mjs';
import { GRANT, VERIFICATION_GRANT, oneShotSelection, validateOneShotLedger } from './deepseek-one-shot.mjs';

// Transitional authorization only. Account-wide export is a deliberately loose
// historical ceiling, NOT website spend or a recurring account-wide budget.
export const RECEIPT_GRANT = Object.freeze({ id: 'editorial-bubble-receipt-20261112-v1',
  currency: 'CNY', capMicroCny: 10_000_000, consumer: 'bubble-editorial', attempts: 1,
  policyDigest: POLICY_DIGEST, calendarMonth: '2026-11', maxAgeMs: 86_400_000 });
export const RECEIPT_BRANCH = 'deepseek-bubble-receipt-20261112';
const HEX = /^[a-f0-9]{64}$/u, SHA = /^[a-f0-9]{40}$/u;
const fail = code => { throw Object.assign(new Error(`deepseek_budget_${code}`), { budgetCode: `deepseek_budget_${code}` }); };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === keys.split(',').sort().join(',');
const same = (a, b) => digest(a) === digest(b);
const iso = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const clockValue = n => { if (!Number.isSafeInteger(n) || n < 0 || n > 8_640_000_000_000_000) fail('clock_unknown'); return n; };
const monthAt = (n, offset) => new Date(n + offset * 60_000).toISOString().slice(0, 7);
const margin = RETIREMENT_MARGIN_MS / 2;

export function validateReceiptSnapshot(s, now = Date.now()) {
  clockValue(now);
  if (!exact(s, 'observedAt,calendarMonth,projectUtcOffsetMinutes,exportUtcOffsetMinutes,coveredFrom,coveredThrough,exportSha256,accountScopeEvidenceSha256,accountSpendCny,historicalDebitMicroCny,keyId,quiescenceEvidenceSha256,unknownRequests,allProjectPathsControlled,legacy,earlyCompleted,inventorySha256')
    || !iso(s.observedAt) || Date.parse(s.observedAt) > now || s.calendarMonth !== RECEIPT_GRANT.calendarMonth
    || s.projectUtcOffsetMinutes !== 0
    || s.exportUtcOffsetMinutes !== 780 || !iso(s.coveredFrom) || !iso(s.coveredThrough)
    || ![s.exportSha256, s.accountScopeEvidenceSha256, s.keyId, s.quiescenceEvidenceSha256, s.inventorySha256].every(v => HEX.test(v || ''))
    || s.accountSpendCny !== '0.2643584' || s.unknownRequests !== 0 || s.allProjectPathsControlled !== true
    || !Array.isArray(s.legacy) || s.legacy.length !== 2
    || !Array.isArray(s.earlyCompleted) || s.earlyCompleted.length !== 4) fail('snapshot_unproven');
  const start = Date.parse(`${s.calendarMonth}-01T00:00:00.000Z`) - s.projectUtcOffsetMinutes * 60_000;
  const bucket = n => (n + s.exportUtcOffsetMinutes * 60_000) % 86_400_000 === 0;
  // Whole displayed buckets, including the straddling month-start bucket.
  if (Date.parse(s.coveredFrom) > start || Date.parse(s.coveredFrom) <= start - 86_400_000
    || !bucket(Date.parse(s.coveredFrom)) || !bucket(Date.parse(s.coveredThrough))
    || Date.parse(s.coveredThrough) <= Date.parse(s.observedAt)
    || Date.parse(s.coveredThrough) > Date.parse(s.observedAt) + 86_400_000
    || monthAt(Date.parse(s.observedAt) - margin, s.projectUtcOffsetMinutes) !== s.calendarMonth
    || monthAt(Date.parse(s.observedAt) + margin, s.projectUtcOffsetMinutes) !== s.calendarMonth) fail('snapshot_unproven');
  let bounded = 0; const requestIds = new Set();
  for (const [i, historic] of s.legacy.entries()) {
    const selection = [GRANT.id, VERIFICATION_GRANT.id][i];
    if (!exact(historic, 'selection,head,genesisSha,ledgerSha256,ledger') || historic.selection !== selection
      || !SHA.test(historic.head || '') || !SHA.test(historic.genesisSha || '')
      || !HEX.test(historic.ledgerSha256 || '') || digest(historic.ledger) !== historic.ledgerSha256) fail('snapshot_unproven');
    validateOneShotLedger(historic.ledger, now, selection);
    const reservations = historic.ledger.entries.filter(r => r.kind === 'reserve');
    const outcomes = historic.ledger.entries.filter(r => r.kind === 'outcome');
    if (reservations.length !== 2 || outcomes.length !== 2) fail('snapshot_unproven');
    for (const r of reservations) {
      const o = outcomes.find(row => row.reservationId === r.id);
      if (r.keyId !== s.keyId || Date.parse(r.time) < start || Date.parse(r.time) > Date.parse(s.observedAt)
        || !o || o.status !== 'complete_unreconciled' || Date.parse(o.time) > Date.parse(s.observedAt)
        || requestIds.has(o.requestIdDigest)) fail('snapshot_unproven');
      requestIds.add(o.requestIdDigest);
      bounded += o.usage.prompt_tokens * POLICY.inputMicroCnyPerToken + o.usage.completion_tokens * POLICY.outputMicroCnyPerToken;
    }
  }
  // These four completed early requests predate the grant ledgers. Three
  // provider HTTP200 receipts remain billable despite article validation failure.
  // The fourth completion has no token receipt: retain a full-context ceiling.
  const earlyRuns = ['41526065601', '41531578149', '41534908718', '41539541399'];
  const earlyUsage = [[17086, 4740, 21826], [17188, 5138, 22326], [17111, 4845, 21956]];
  let earlyBounded = 0;
  for (const [i, row] of s.earlyCompleted.entries()) {
    if (!exact(row, 'runId,completedAt,evidenceSha256,status,usage') || row.runId !== earlyRuns[i]
      || row.status !== 'completed' || !iso(row.completedAt) || !HEX.test(row.evidenceSha256 || '')
      || Date.parse(row.completedAt) < start || Date.parse(row.completedAt) > Date.parse(s.observedAt)) fail('snapshot_unproven');
    if (i === 3) {
      if (row.usage !== null) fail('snapshot_unproven');
      earlyBounded += POLICY.reserveMicroCny;
    } else {
      validateTokenUsage(row.usage);
      if (!same([row.usage.prompt_tokens, row.usage.completion_tokens, row.usage.total_tokens], earlyUsage[i])) fail('snapshot_unproven');
      earlyBounded += row.usage.prompt_tokens * POLICY.inputMicroCnyPerToken + row.usage.completion_tokens * POLICY.outputMicroCnyPerToken;
    }
  }
  // Intentional overlap: do NOT subtract receipts already present in the export.
  const [whole, fraction] = s.accountSpendCny.split('.');
  const units = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'));
  const exported = Number((units + 99n) / 100n);
  if (bounded !== 190_920 || earlyBounded !== 220_554 + POLICY.reserveMicroCny
    || s.historicalDebitMicroCny !== exported + bounded + earlyBounded
    || s.historicalDebitMicroCny + POLICY.reserveMicroCny > RECEIPT_GRANT.capMicroCny) fail('project_limit');
  return s;
}

export function validateReceiptLedger(ledger, now = Date.now()) {
  clockValue(now);
  if (!exact(ledger, 'schemaVersion,grant,reviews,entries') || ledger.schemaVersion !== 'deepseek-receipt-grant-v1'
    || !exact(ledger.grant, 'policy,authorizedAt,expiresAt,authorizationEvidenceSha256,initializationParentSha,snapshot')
    || !same(ledger.grant.policy, RECEIPT_GRANT) || !iso(ledger.grant.authorizedAt) || !iso(ledger.grant.expiresAt)
    || Date.parse(ledger.grant.authorizedAt) > now || !HEX.test(ledger.grant.authorizationEvidenceSha256 || '')
    || !SHA.test(ledger.grant.initializationParentSha || '') || !Array.isArray(ledger.reviews)
    || ledger.reviews.length !== 1 || !Array.isArray(ledger.entries) || ledger.entries.length > 2) fail('grant_invalid');
  const g = ledger.grant, s = validateReceiptSnapshot(g.snapshot, now);
  if (Date.parse(g.expiresAt) <= Date.parse(g.authorizedAt)
    || Date.parse(g.expiresAt) - Date.parse(s.observedAt) > RECEIPT_GRANT.maxAgeMs
    || monthAt(Date.parse(g.expiresAt) + margin, s.projectUtcOffsetMinutes) !== s.calendarMonth) fail('grant_invalid');
  validateReview(ledger.reviews[0], now);
  if (Date.parse(ledger.reviews[0].verifiedAt) < Math.max(Date.parse(g.authorizedAt), Date.parse(s.observedAt))) fail('price_policy_unknown');
  let prior = Date.parse(g.authorizedAt); const ids = new Set();
  for (const [i, row] of ledger.entries.entries()) {
    if (!row || !/^[a-f0-9-]{36}$/u.test(row.id || '') || ids.has(row.id) || !iso(row.time)
      || Date.parse(row.time) > now || Date.parse(row.time) < prior) fail('invalid_ledger');
    ids.add(row.id); prior = Date.parse(row.time);
    if (i === 0) {
      if (!exact(row, 'id,kind,time,consumer,mode,runId,keyId,requestDigest,reservedMicroCny,reviewDigest')
        || row.kind !== 'reserve' || row.consumer !== RECEIPT_GRANT.consumer || row.mode !== 'manual'
        || !/^[0-9]+$/u.test(row.runId || '') || row.keyId !== s.keyId || !HEX.test(row.requestDigest || '')
        || row.reservedMicroCny !== POLICY.reserveMicroCny || row.reviewDigest !== digest(ledger.reviews[0])) fail('grant_invalid');
      admission({ ...ledger, entries: [] }, { consumer: row.consumer, approvedGrantDigest: digest(g), approvedReviewDigest: row.reviewDigest }, prior, true);
    } else {
      if (!exact(row, 'id,kind,time,reservationId,status,requestIdDigest,usage,code') || row.kind !== 'outcome'
        || row.reservationId !== ledger.entries[0].id || !['complete_unreconciled', 'failed_unknown', 'contract_hold'].includes(row.status)) fail('invalid_ledger');
      if (row.status === 'complete_unreconciled') {
        if (!HEX.test(row.requestIdDigest || '') || row.code !== null) fail('invalid_ledger');
        validateTokenUsage(row.usage);
      } else if (row.requestIdDigest !== null || row.usage !== null || !/^deepseek_budget_[a-z_]+$/u.test(row.code || '')) fail('invalid_ledger');
    }
  }
  if (Buffer.byteLength(JSON.stringify(ledger)) > 2 * 1024 * 1024) fail('grant_invalid');
  return ledger;
}
function admission(ledger, { consumer, approvedGrantDigest, approvedReviewDigest, keyId }, now, validated = false) {
  if (!validated) validateReceiptLedger(ledger, now);
  if (consumer !== RECEIPT_GRANT.consumer) fail('grant_manual_only');
  if (!HEX.test(approvedGrantDigest || '') || digest(ledger.grant) !== approvedGrantDigest) fail('grant_unapproved');
  if (keyId !== undefined && keyId !== ledger.grant.snapshot.keyId) fail('key_mismatch');
  if (now + margin >= Date.parse(ledger.grant.expiresAt)
    || now - Date.parse(ledger.grant.snapshot.observedAt) > RECEIPT_GRANT.maxAgeMs) fail('grant_expired');
  activeReview(ledger, approvedReviewDigest, now);
  if (ledger.entries.length) fail('grant_consumed');
}
export function validateReceiptTransition(previous, next, now = Date.now()) {
  validateReceiptLedger(previous, now); validateReceiptLedger(next, now);
  if (!same(previous.grant, next.grant) || !same(previous.reviews, next.reviews)
    || next.entries.length !== previous.entries.length + 1
    || !previous.entries.every((r, i) => same(r, next.entries[i]))) fail('history_changed');
  return next;
}
export function prepareReceiptLedger({ grant, review, approvedGrantDigest }, now = Date.now()) {
  const ledger = { schemaVersion: 'deepseek-receipt-grant-v1', grant, reviews: [review], entries: [] };
  admission(ledger, { consumer: RECEIPT_GRANT.consumer, approvedGrantDigest, approvedReviewDigest: digest(review) }, now);
  return structuredClone(ledger);
}
export function createReceiptStore(options) {
  return createGithubLedgerStore(options, { branch: RECEIPT_BRANCH, validateLedger: validateReceiptLedger,
    validateTransition: validateReceiptTransition, validateGenesis: snapshot => snapshot.parents.length === 1
      && snapshot.parents[0]?.sha === snapshot.ledger.grant.initializationParentSha });
}
async function exposure(verifyExposure, snapshot, runId) {
  if (typeof verifyExposure !== 'function' || await verifyExposure(structuredClone(snapshot), runId) !== true) fail('exposure_unproven');
}
export async function verifyReceiptStatus({ store, consumer = RECEIPT_GRANT.consumer, approvedGrantDigest, approvedReviewDigest,
  verifyExposure, runId, now = Date.now }) {
  const snapshot = await store.read(); store.assertClock?.();
  const options = { consumer, approvedGrantDigest, approvedReviewDigest };
  admission(snapshot.ledger, options, clockValue(now()));
  await exposure(verifyExposure, snapshot.ledger.grant.snapshot, runId);
  admission(snapshot.ledger, options, clockValue(now())); store.assertClock?.();
  return { operation: 'read_only_verification', providerCalls: 0, writes: 0, head: snapshot.head,
    admission: 'eligible_snapshot_only', historicalUpperBoundMicroCny: snapshot.ledger.grant.snapshot.historicalDebitMicroCny,
    nextReservationMicroCny: POLICY.reserveMicroCny, keyIdentity: 'checked_at_paid_admission' };
}
export function createReceiptBudget({ store, approvedGrantDigest, approvedReviewDigest, verifyExposure,
  readBalance = readDeepSeekBalance, now = Date.now, id = randomUUID }) {
  let stopped = false, last = -1;
  const clock = () => { const at = clockValue(now()); if (at < last) fail('clock_rollback'); last = at; return at; };
  return async (context, request) => {
    if (stopped) fail('session_stopped');
    let prepared, reservation;
    try {
      prepared = prepareRequest(context);
      if (prepared.mode !== 'manual' || !/^[0-9]+$/u.test(prepared.runId) || typeof request !== 'function') fail('grant_manual_only');
      const previous = await store.read(); store.assertClock?.();
      const options = { consumer: prepared.consumer, keyId: prepared.keyId, approvedGrantDigest, approvedReviewDigest };
      admission(previous.ledger, options, clock());
      await exposure(verifyExposure, previous.ledger.grant.snapshot, prepared.runId);
      validateBalance(await readBalance(context.key));
      const at = clock(); admission(previous.ledger, options, at);
      reservation = { id: id(), kind: 'reserve', time: new Date(at).toISOString(), consumer: prepared.consumer,
        mode: 'manual', runId: prepared.runId, keyId: prepared.keyId, requestDigest: prepared.requestDigest,
        reservedMicroCny: POLICY.reserveMicroCny, reviewDigest: approvedReviewDigest };
      const next = validateReceiptTransition(previous.ledger, { ...previous.ledger, entries: [reservation] }, at);
      if (await store.write(previous, next) !== true) fail('contention');
      // Recheck remote exposure after reservation, immediately before dispatch.
      await exposure(verifyExposure, previous.ledger.grant.snapshot, prepared.runId);
      if (!same(prepared, prepareRequest(context))) fail('request_changed');
      admission(previous.ledger, options, clock()); store.assertClock?.();
      stopped = true; // A second call is forbidden even if the store is replaced.
    } catch (error) { stopped = true; throw error; }
    let result, failure, proof;
    try { result = await request(prepared); proof = receipt(result, Date.parse(reservation.time), clock()); }
    catch (error) { failure = error; }
    try {
      const previous = await store.read(); store.assertClock?.(); const at = clock();
      if (!same(previous.ledger.entries[0], reservation)) fail('receipt_mismatch');
      const outcome = { id: id(), kind: 'outcome', time: new Date(at).toISOString(), reservationId: reservation.id,
        status: !failure ? 'complete_unreconciled' : failure.budgetCode ? 'contract_hold' : 'failed_unknown',
        requestIdDigest: proof?.requestIdDigest || null, usage: proof?.usage || null,
        code: failure?.budgetCode || (failure ? 'deepseek_budget_provider_unknown' : null) };
      const next = validateReceiptTransition(previous.ledger, { ...previous.ledger, entries: [...previous.ledger.entries, outcome] }, at);
      if (await store.write(previous, next) !== true) fail('receipt_pending');
    } catch { if (!failure) fail('receipt_pending'); }
    if (failure) throw failure;
    return result;
  };
}

// This read-only check verifies cooperating project paths. The reviewed scope
// attestation covers known local/manual project callers. It does not claim to
// exclude hypothetical copied or modified code outside these approved paths.
export function createReceiptExposureVerifier({ token, fetchImpl = fetch, now = Date.now }) {
  if (!token) fail('credentials_missing');
  async function get(path) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), POLICY.metadataTimeoutMs);
    const started = performance.now();
    const boundary = response => {
      if (performance.now() - started > POLICY.metadataTimeoutMs
        || Math.abs(clockValue(now()) - Date.parse(response.headers.get('date') || '')) > POLICY.maxClockSkewMs
        || !Number.isFinite(Date.parse(response.headers.get('date') || ''))) fail('clock_unknown');
    };
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${BUDGET_REPOSITORY}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        method: 'GET', redirect: 'error', signal: controller.signal });
      boundary(response);
      if (response.status === 404) { await response.body?.cancel(); boundary(response); return { status: 404 }; }
      if (response.status !== 200 || !response.body) fail('exposure_unproven');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); boundary(response); if (done) break;
        size += value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); fail('exposure_unproven'); }
        chunks.push(Buffer.from(value));
      }
      const json = JSON.parse(Buffer.concat(chunks).toString('utf8')); boundary(response);
      return { status: 200, json };
    } catch (error) { if (error.budgetCode) throw error; fail('exposure_unproven'); }
    finally { clearTimeout(timer); }
  }
  return async (snapshot, runId) => {
    validateReceiptSnapshot(snapshot, clockValue(now()));
    if (!/^[0-9]+$/u.test(runId || '')) fail('exposure_unproven');
    for (const historic of snapshot.legacy) {
      const ref = await get(`/git/ref/heads/${oneShotSelection(historic.selection).branch}`);
      if (ref.status !== 200 || ref.json?.object?.sha !== historic.head) fail('exposure_changed');
      const file = await get(`/contents/usage.json?ref=${historic.head}`);
      if (file.status !== 200 || file.json?.encoding !== 'base64' || typeof file.json.content !== 'string') fail('exposure_unproven');
      let ledger;
      try { ledger = JSON.parse(Buffer.from(file.json.content, 'base64').toString('utf8')); } catch { fail('exposure_unproven'); }
      if (digest(ledger) !== historic.ledgerSha256) fail('exposure_changed');
    }
    if ((await get(`/git/ref/heads/${BUDGET_BRANCH}`)).status !== 404) fail('exposure_changed');
    const paths = ['.github/workflows/macro-risk-editorial-refresh.yml', '.github/workflows/bubble-watch-weekly-editorial-refresh.yml'];
    for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
      const runs = await get(`/actions/runs?status=${status}&per_page=100`);
      if (runs.status !== 200 || !Number.isSafeInteger(runs.json?.total_count) || runs.json.total_count < 0
        || runs.json.total_count > 100 || !Array.isArray(runs.json.workflow_runs)
        || runs.json.workflow_runs.length !== runs.json.total_count) fail('exposure_unproven');
      for (const run of runs.json.workflow_runs) {
        if (!Number.isSafeInteger(run.id) || typeof run.path !== 'string') fail('exposure_unproven');
        if (paths.includes(run.path.split('@')[0]) && String(run.id) !== runId) fail('exposure_changed');
      }
    }
    return true;
  };
}
export function receiptRuntimeConfig(env = process.env) {
  if (env.DEEPSEEK_BUDGET_SELECTION !== RECEIPT_GRANT.id || env.DEEPSEEK_BUDGET_CONSUMER !== RECEIPT_GRANT.consumer
    || env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REPOSITORY !== BUDGET_REPOSITORY || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_RUN_ATTEMPT !== '1' || !/^[0-9]+$/u.test(env.GITHUB_RUN_ID || '')
    || env.GITHUB_WORKFLOW_REF !== `${BUDGET_REPOSITORY}/.github/workflows/bubble-watch-weekly-editorial-refresh.yml@refs/heads/main`) fail('grant_manual_only');
  const genesisSha = env.DEEPSEEK_RECEIPT_20261112_GENESIS_SHA;
  const approvedGrantDigest = env.DEEPSEEK_RECEIPT_20261112_GRANT_SHA256;
  const approvedReviewDigest = env.DEEPSEEK_RECEIPT_20261112_PRICE_REVIEW_SHA256;
  const token = env.DEEPSEEK_BUDGET_GITHUB_TOKEN;
  const runtimeIdentity = digest({ selection: RECEIPT_GRANT.id, genesisSha: genesisSha || null,
    approvedGrantDigest: approvedGrantDigest || null, approvedReviewDigest: approvedReviewDigest || null,
    runId: env.GITHUB_RUN_ID, tokenDigest: digest(token || '') });
  return { consumer: RECEIPT_GRANT.consumer, runId: env.GITHUB_RUN_ID, approvedGrantDigest, approvedReviewDigest, runtimeIdentity,
    store: createReceiptStore({ token, genesisSha }), verifyExposure: createReceiptExposureVerifier({ token }) };
}
let runtime, runtimeIdentity;
export async function withReceiptBudget({ key, payload, consumer }, request) {
  const config = receiptRuntimeConfig();
  if (consumer !== config.consumer) fail('grant_manual_only');
  if (runtimeIdentity && runtimeIdentity !== config.runtimeIdentity) fail('session_stopped');
  if (!runtime) { runtimeIdentity = config.runtimeIdentity; runtime = createReceiptBudget(config); }
  return runtime({ key, payload, consumer, mode: 'manual', runId: config.runId }, request);
}
