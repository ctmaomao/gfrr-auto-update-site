import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { budgetFailure, createSearchLedger, isCount, isTime, keyFingerprint, SEARCH_REPOSITORY, SEARCH_CLOCK_POLICY } from './free-search-ledger.mjs';

export const BRAVE_DISPATCH_DEADLINE_MS = 30000;
export const BRAVE_PROJECT_COUNTER_DISCLOSURE = Object.freeze({ countBasis: 'recorded_reservation_time', strictDispatchWindowVerified: false });
export const BRAVE_POLICY = Object.freeze({ maxGrantRequests: 950, maxGrantDays: 31, rollingRequests: 950, windowDays: 31 });
const CONSUMERS = ['macro-editorial', 'bubble-editorial', 'oil-news', 'bubble-ceo'];
const fail = (suffix, providerRequestAttempted = false) => {
  try { budgetFailure(`brave_budget_${suffix}`); } catch (error) { error.providerRequestAttempted = providerRequestAttempted; throw error; }
};
export const emptyBraveLedger = () => ({ schemaVersion: 'brave-budget-v1', grants: [], entries: [], hold: null });

// A grant records an operator-verified remaining free request allowance, NOT a
// money balance. Rate-limit headers and the owner's zero-charge assurance alone
// cannot establish quota. No automatic renewal, calendar reset or key rotation.
export function validateBraveLedger(ledger, now) {
  if (!Number.isFinite(now) || ledger?.schemaVersion !== 'brave-budget-v1' || !Array.isArray(ledger.entries) || !Array.isArray(ledger.grants)
    || Object.keys(ledger).sort().join(',') !== 'entries,grants,hold,schemaVersion') fail('invalid_ledger');
  const grantIds = new Set();
  let prior;
  for (const grant of ledger.grants) {
    if (!grant || typeof grant !== 'object' || Object.keys(grant).sort().join(',') !== 'evidenceRef,expiresAt,id,keyId,requestLimit,scope,source,usageAtActivation,verifiedAt,zeroChargeConfirmed'
      || !/^[a-f0-9-]{36}$/u.test(grant.id || '') || grantIds.has(grant.id) || !/^[a-f0-9]{16}$/u.test(grant.keyId || '') || grant.zeroChargeConfirmed !== true
      || grant.scope !== 'exclusive_repository_key' || grant.source !== 'owner_dashboard'
      || typeof grant.evidenceRef !== 'string' || !/^[a-zA-Z0-9._:-]{1,160}$/u.test(grant.evidenceRef)
      || !isTime(grant.verifiedAt) || !isTime(grant.expiresAt) || Date.parse(grant.verifiedAt) > now
      || Date.parse(grant.expiresAt) <= Date.parse(grant.verifiedAt)
      || Date.parse(grant.expiresAt) - Date.parse(grant.verifiedAt) > BRAVE_POLICY.maxGrantDays * 86400000
      || !isCount(grant.requestLimit) || !isCount(grant.usageAtActivation) || grant.requestLimit <= grant.usageAtActivation
      || grant.requestLimit - grant.usageAtActivation > BRAVE_POLICY.maxGrantRequests
      || (prior && (Date.parse(grant.verifiedAt) <= Date.parse(prior.verifiedAt) || grant.keyId !== prior.keyId))) fail('grant_invalid');
    grantIds.add(grant.id);
    prior = grant;
  }
  const ids = new Set();
  for (const row of ledger.entries) {
    if (!row || typeof row !== 'object') fail('invalid_ledger');
    const grant = ledger.grants.find(item => item.id === row.grantId);
    if (Object.keys(row).sort().join(',') !== 'consumer,finishedAt,grantId,id,keyId,mode,requests,runId,state,time'
      || !/^[a-f0-9-]{36}$/u.test(row.id || '') || ids.has(row.id) || !isTime(row.time) || Date.parse(row.time) > now
      || !grant || Date.parse(row.time) < Date.parse(grant.verifiedAt) || Date.parse(row.time) >= Date.parse(grant.expiresAt)
      || row.keyId !== grant.keyId || row.requests !== 1
      || !CONSUMERS.includes(row.consumer) || !['manual','automated'].includes(row.mode) || !/^(local|[0-9]+)$/u.test(row.runId || '')
      || !['reserved','success','failed'].includes(row.state)
      || (row.state === 'reserved' ? row.finishedAt !== null : !isTime(row.finishedAt) || Date.parse(row.finishedAt) < Date.parse(row.time) || Date.parse(row.finishedAt) > now)) fail('invalid_ledger');
    ids.add(row.id);
  }
  if (ledger.hold !== null && (Object.keys(ledger.hold).sort().join(',') !== 'code,reservationId'
    || ledger.hold.code !== 'brave_budget_provider_quota_unknown' || !ids.has(ledger.hold.reservationId))) fail('invalid_ledger');
  return ledger;
}

export function createBraveLedger({ token = process.env.TAVILY_BUDGET_GITHUB_TOKEN, fetchImpl = fetch, grant = null, now = Date.now } = {}) {
  return createSearchLedger({ branch: 'brave-usage-ledger', token, fetchImpl, now, prefix: 'brave_budget',
    initialLedger: () => validateBraveLedger({ ...emptyBraveLedger(), grants: grant ? [grant] : [] }, now()) });
}
export function summarizeBraveLedger(ledger, now = Date.now()) {
  validateBraveLedger(ledger, now);
  const { entries } = ledger;
  const grant = ledger.grants.at(-1);
  const grantEntries = entries.filter(row => row.grantId === grant?.id);
  const rollingRequests = entries.filter(row => Date.parse(row.time) > now - BRAVE_POLICY.windowDays * 86400000).length;
  const status = ledger.hold ? ledger.hold.code : !grant ? 'brave_budget_quota_unknown' : Date.parse(grant.expiresAt) <= now ? 'brave_budget_grant_expired'
    : grant.usageAtActivation + grantEntries.length >= grant.requestLimit ? 'brave_budget_quota_exhausted' : entries.some(row => row.state === 'reserved') ? 'brave_budget_pending_accounting' : rollingRequests >= BRAVE_POLICY.rollingRequests ? 'brave_budget_project_limit' : 'eligible_snapshot_only';
  const byConsumer = {}, byMode = {}, byKey = {}, byDayUtc = {};
  for (const row of entries) for (const [group, key] of [[byConsumer,row.consumer],[byMode,row.mode],[byKey,row.keyId],[byDayUtc,row.time.slice(0,10)]]) {
    const counts = group[key] ||= { reserved: 0, success: 0, failed: 0, pending: 0 };
    counts.reserved++;
    counts[row.state === 'reserved' ? 'pending' : row.state]++;
  }
  return { ...BRAVE_PROJECT_COUNTER_DISCLOSURE, status, grant: grant || null, rollingRequests, reservedRequests: entries.length, remainingVerifiedRequests: grant ? Math.max(0, grant.requestLimit - grant.usageAtActivation - grantEntries.length) : null,
    monetaryBalance: 'unavailable_no_official_api', byConsumer, byMode, byKey, byDayUtc };
}
export function createBraveBudget({ store, now = Date.now, monotonicNow = () => performance.now(), id = randomUUID, report = () => {} }) {
  let stopped = false, stoppedAfterDispatch = false;
  return async ({ key, consumer, mode = 'manual', runId = 'local' }, request) => {
    if (stopped) fail('session_stopped', stoppedAfterDispatch);
    if (!key || !CONSUMERS.includes(consumer) || !['manual','automated'].includes(mode) || !/^(local|[0-9]+)$/u.test(runId)) fail('invalid_request');
    const admissionStartedAt = monotonicNow();
    const row = { id: id(), keyId: keyFingerprint(key), time: new Date(now()).toISOString(), consumer, mode, runId, requests: 1, state: 'reserved', finishedAt: null };
    try {
      let admitted = false, expiresAt, reservationServerTime;
      for (let attempt = 0; attempt < 3 && !admitted; attempt++) {
        const previous = await store.read();
        const summary = summarizeBraveLedger(previous.ledger, now());
        if (summary.status !== 'eligible_snapshot_only') budgetFailure(summary.status);
        if (summary.grant.keyId !== row.keyId) fail('key_scope_unknown');
        const ledger = structuredClone(previous.ledger);
        row.grantId = summary.grant.id;
        expiresAt = Date.parse(summary.grant.expiresAt);
        reservationServerTime = previous.serverTime;
        if (!Number.isFinite(reservationServerTime)) fail('clock_unknown');
        if (Math.abs(now() - reservationServerTime) > SEARCH_CLOCK_POLICY.maxSkewMs) fail('clock_skew');
        ledger.entries.push(row);
        validateBraveLedger(ledger, now());
        admitted = await store.write(previous, ledger);
      }
      if (!admitted) fail('contention');
      const elapsed = monotonicNow() - admissionStartedAt;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= BRAVE_DISPATCH_DEADLINE_MS) fail('dispatch_deadline');
      // The response's Date was generated within this bounded admission. Add
      // the entire dispatch interval and HTTP precision: even an accepted slow
      // runner cannot send after the verified grant expiry. No wall-clock guess.
      if (now() >= expiresAt || reservationServerTime + BRAVE_DISPATCH_DEADLINE_MS + SEARCH_CLOCK_POLICY.httpDatePrecisionMs >= expiresAt) fail('grant_expired');
    } catch (error) { stopped = true; report({ consumer, status: error.budgetCode || 'brave_budget_unknown' }); throw error; }
    let result, failure;
    try { result = await request(); } catch (error) { failure = error; }
    // A client timeout/abort, network loss, 5xx, malformed success body, or text
    // that merely mentions an HTTP code cannot prove the provider has stopped.
    // Keep its durable debit unresolved. Even a later dashboard snapshot cannot
    // retire this debt: the request may finish or appear in accounting later.
    const responseStatus = failure?.providerResponseReceived === true && Number.isInteger(failure?.httpStatus)
      ? failure.httpStatus : null;
    const rejected = responseStatus >= 400 && responseStatus < 500;
    if (failure ? !rejected : !result || !Array.isArray(result.results) || result.error || result.errors) {
      stopped = true; stoppedAfterDispatch = true;
      report({ consumer, status: 'brave_budget_provider_outcome_unknown', reservationId: row.id, reservedRequests: 1 });
      fail('provider_outcome_unknown', true);
    }
    try {
      let saved = false;
      for (let attempt = 0; attempt < 3 && !saved; attempt++) {
        const previous = await store.read();
        validateBraveLedger(previous.ledger, now());
        const ledger = structuredClone(previous.ledger);
        const pending = ledger.entries.find(entry => entry.id === row.id);
        if (!pending || pending.state !== 'reserved') fail('receipt_mismatch');
        pending.state = failure ? 'failed' : 'success';
        pending.finishedAt = new Date(now()).toISOString();
        if ([402, 429, 432, 433].includes(responseStatus)) ledger.hold = { code: 'brave_budget_provider_quota_unknown', reservationId: row.id };
        saved = await store.write(previous, ledger);
      }
      if (!saved) fail('receipt_pending');
    } catch { stopped = true; stoppedAfterDispatch = true; report({ consumer, status: 'brave_budget_receipt_pending', reservationId: row.id }); }
    report({ consumer, status: failure ? 'failed' : 'success', reservationId: row.id, reservedRequests: 1 });
    if (failure) {
      if ([402, 429, 432, 433].includes(responseStatus)) { stopped = true; stoppedAfterDispatch = true; fail('provider_quota_unknown', true); }
      failure.providerRequestAttempted = true;
      throw failure;
    }
    return result;
  };
}
// Explicit reconciliation appends evidence; it never erases past reservations or
// resets the recorded-reservation project counter. Pending calls require separate provider
// settlement evidence; a newer dashboard reading alone never clears them.
export async function activateBraveGrant({ store, grant, now = Date.now }) {
  if (!grant || typeof grant !== 'object') fail('grant_invalid');
  const previous = await store.read();
  validateBraveLedger(previous.ledger, now());
  if (previous.ledger.entries.some(row => row.state === 'reserved' || Date.parse(row.finishedAt) >= Date.parse(grant.verifiedAt))) fail('activation_pending_accounting');
  const ledger = { ...previous.ledger, grants: [...previous.ledger.grants, grant], hold: null };
  validateBraveLedger(ledger, now());
  if (Date.parse(grant.expiresAt) <= now()) fail('grant_expired');
  if (!await store.write(previous, ledger)) fail('activation_conflict');
  return ledger;
}

let runtime;
export async function withBraveBudget({ key, consumer }, request) {
  const env = process.env;
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY !== SEARCH_REPOSITORY) fail('wrong_repository');
  runtime ||= createBraveBudget({ store: createBraveLedger(), report: row => {
    console.log(`Brave budget: ${JSON.stringify(row)}`);
    if (env.GITHUB_STEP_SUMMARY) try { appendFileSync(env.GITHUB_STEP_SUMMARY, `\n- Brave budget: ${JSON.stringify(row)}\n`); } catch { /* Durable ledger is authoritative. */ }
  } });
  const automated = env.GITHUB_ACTIONS === 'true' && ['schedule','workflow_run'].includes(env.GITHUB_EVENT_NAME);
  return runtime({ key, consumer, mode: automated ? 'automated' : 'manual', runId: env.GITHUB_ACTIONS === 'true' ? env.GITHUB_RUN_ID : 'local' }, request);
}
