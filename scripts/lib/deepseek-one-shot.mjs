import { randomUUID } from 'node:crypto';
import {
  BUDGET_REPOSITORY, CONSUMERS, POLICY, POLICY_DIGEST, RETIREMENT_MARGIN_MS,
  digest, createGithubLedgerStore, prepareRequest, readDeepSeekBalance,
  validateReview, activeReview, validateTokenUsage, receipt
} from './deepseek-budget.mjs';

// Separate additional authorization. This is NOT a historical-spend assertion,
// monthly-budget migration, recurring allowance, or automatic fallback.
export const GRANT = Object.freeze({
  id: 'editorial-additional-20261109-cny433-v1', currency: 'CNY',
  capMicroCny: 4_330_000, historicalProjectSpend: 'unknown-not-covered',
  expiresAt: '2026-11-30T00:00:00.000Z', policyDigest: POLICY_DIGEST,
  consumers: Object.freeze([...CONSUMERS]), attemptsPerConsumer: 1
});
export const ONE_SHOT_BRANCH = 'deepseek-editorial-one-shot-20261109';
const HEX = /^[a-f0-9]{64}$/u;
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === keys.split(',').sort().join(',');
const iso = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const fail = code => { throw Object.assign(new Error(`deepseek_budget_${code}`), { budgetCode: `deepseek_budget_${code}` }); };
const same = (a, b) => digest(a) === digest(b);
const timestamp = now => { if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) fail('clock_unknown'); return now; };

export function validateOneShotLedger(ledger, now = Date.now()) {
  timestamp(now);
  if (!exact(ledger, 'schemaVersion,grant,reviews,entries') || ledger.schemaVersion !== 'deepseek-one-shot-v1'
    || !exact(ledger.grant, 'policy,authorizedAt,authorizationEvidenceSha256,initializationParentSha') || !same(ledger.grant.policy, GRANT)
    || !iso(ledger.grant.authorizedAt) || Date.parse(ledger.grant.authorizedAt) > now
    || Date.parse(ledger.grant.authorizedAt) >= Date.parse(GRANT.expiresAt)
    || !HEX.test(ledger.grant.authorizationEvidenceSha256 || '')
    || !/^[a-f0-9]{40}$/u.test(ledger.grant.initializationParentSha || '')
    || !Array.isArray(ledger.reviews) || !ledger.reviews.length || !Array.isArray(ledger.entries)) fail('grant_invalid');
  let previousTime = Date.parse(ledger.grant.authorizedAt);
  const reviews = new Set();
  for (const review of ledger.reviews) {
    validateReview(review, now);
    if (Date.parse(review.verifiedAt) < previousTime || reviews.has(digest(review))) fail('price_policy_unknown');
    previousTime = Date.parse(review.verifiedAt); reviews.add(digest(review));
  }
  previousTime = Date.parse(ledger.grant.authorizedAt);
  const ids = new Set(), consumers = new Set(), reservations = new Map(), outcomes = new Set();
  for (const row of ledger.entries) {
    if (!row || !/^[a-f0-9-]{36}$/u.test(row.id || '') || ids.has(row.id) || !iso(row.time)
      || Date.parse(row.time) > now || Date.parse(row.time) < previousTime) fail('invalid_ledger');
    ids.add(row.id); previousTime = Date.parse(row.time);
    if (row.kind === 'reserve') {
      if (!exact(row, 'id,kind,time,consumer,mode,runId,keyId,requestDigest,reservedMicroCny,reviewDigest')
        || !CONSUMERS.includes(row.consumer) || consumers.has(row.consumer) || row.mode !== 'manual'
        || !/^[0-9]+$/u.test(row.runId) || !HEX.test(row.keyId || '') || !HEX.test(row.requestDigest || '')
        || row.reservedMicroCny !== POLICY.reserveMicroCny || !reviews.has(row.reviewDigest)
        || Date.parse(row.time) >= Date.parse(GRANT.expiresAt)) fail('grant_invalid');
      const review = ledger.reviews.find(r => digest(r) === row.reviewDigest);
      if (Date.parse(row.time) < Date.parse(review.verifiedAt) || Date.parse(row.time) >= Date.parse(review.expiresAt)) fail('price_policy_unknown');
      consumers.add(row.consumer); reservations.set(row.id, row);
    } else if (row.kind === 'outcome') {
      if (!exact(row, 'id,kind,time,reservationId,status,requestIdDigest,usage,code') || !reservations.has(row.reservationId)
        || outcomes.has(row.reservationId) || !['complete_unreconciled', 'failed_unknown', 'contract_hold'].includes(row.status)) fail('invalid_ledger');
      if (row.status === 'complete_unreconciled') {
        if (!HEX.test(row.requestIdDigest || '') || row.code !== null) fail('invalid_ledger');
        validateTokenUsage(row.usage);
      } else if (row.requestIdDigest !== null || row.usage !== null || !/^deepseek_budget_[a-z_]+$/u.test(row.code || '')) fail('invalid_ledger');
      outcomes.add(row.reservationId);
    } else fail('invalid_ledger'); // No refunds, settlements, migrations or resets.
  }
  if (reservations.size * POLICY.reserveMicroCny > GRANT.capMicroCny
    || Buffer.byteLength(JSON.stringify(ledger)) > 2 * 1024 * 1024) fail('grant_invalid');
  return ledger;
}

function admission(ledger, { consumer, approvedGrantDigest, approvedReviewDigest }, now) {
  validateOneShotLedger(ledger, now);
  if (!CONSUMERS.includes(consumer)) fail('invalid_request');
  if (!HEX.test(approvedGrantDigest || '') || digest(ledger.grant) !== approvedGrantDigest) fail('grant_unapproved');
  if (now + RETIREMENT_MARGIN_MS / 2 >= Date.parse(GRANT.expiresAt)) fail('grant_expired');
  activeReview(ledger, approvedReviewDigest, now);
  if (ledger.entries.some(r => r.kind === 'reserve' && r.consumer === consumer)) fail('grant_consumed');
  if (ledger.entries.some(r => r.kind === 'outcome' && r.status === 'contract_hold')) fail('contract_hold');
  if (ledger.entries.some(r => r.kind === 'reserve' && !ledger.entries.some(o =>
    o.kind === 'outcome' && o.reservationId === r.id && o.status === 'complete_unreconciled'))) fail('receipt_pending');
}

export function validateOneShotTransition(previous, next, now = Date.now()) {
  validateOneShotLedger(previous, now); validateOneShotLedger(next, now);
  if (!same(previous.grant, next.grant) || next.entries.length < previous.entries.length || next.reviews.length < previous.reviews.length
    || !previous.entries.every((r, i) => same(r, next.entries[i])) || !previous.reviews.every((r, i) => same(r, next.reviews[i]))
    || next.entries.length - previous.entries.length + next.reviews.length - previous.reviews.length !== 1) fail('history_changed');
  if (next.entries.length > previous.entries.length && next.entries.at(-1).kind === 'reserve') {
    const row = next.entries.at(-1);
    admission(previous, { consumer: row.consumer, approvedGrantDigest: digest(previous.grant), approvedReviewDigest: row.reviewDigest }, Date.parse(row.time));
  }
  return next;
}

export function prepareOneShotLedger({ grant, review, approvedGrantDigest }, now = Date.now()) {
  const ledger = { schemaVersion: 'deepseek-one-shot-v1', grant, reviews: [review], entries: [] };
  admission(ledger, { consumer: CONSUMERS[0], approvedGrantDigest, approvedReviewDigest: digest(review) }, now);
  return structuredClone(ledger);
}
export function createOneShotStore(options) {
  return createGithubLedgerStore(options, { branch: ONE_SHOT_BRANCH,
    validateLedger: validateOneShotLedger, validateTransition: validateOneShotTransition,
    // Only this grant permits a non-root genesis, bound into its approved digest.
    // The selected parent is an initialization anchor, not earlier budget history.
    validateGenesis: snapshot => snapshot.parents.length === 1
      && /^[a-f0-9]{40}$/u.test(snapshot.ledger.grant?.initializationParentSha || '')
      && snapshot.parents[0]?.sha === snapshot.ledger.grant.initializationParentSha });
}
export async function verifyOneShotStatus({ store, consumer, approvedGrantDigest, approvedReviewDigest, now = Date.now }) {
  const snapshot = await store.read(); store.assertClock?.();
  admission(snapshot.ledger, { consumer, approvedGrantDigest, approvedReviewDigest }, timestamp(now()));
  const reservedMicroCny = snapshot.ledger.entries.filter(r => r.kind === 'reserve').length * POLICY.reserveMicroCny;
  return { operation: 'read_only_verification', providerCalls: 0, writes: 0, head: snapshot.head,
    grant: GRANT, consumer, reservedMicroCny, remainingMicroCny: GRANT.capMicroCny - reservedMicroCny, admission: 'eligible_snapshot_only' };
}

// Owner-reported CNY billing permits only CNY-funded one-shot requests.
// Optional USD metadata is accepted only when every USD amount is exactly zero.
// No FX, spending-history inference, balance logging or monthly-policy change.
export function validateOneShotBalance(json) {
  if (json?.is_available !== true || !Array.isArray(json.balance_infos)
    || json.balance_infos.length < 1 || json.balance_infos.length > 2) fail('currency_unknown');
  const rows = new Map();
  for (const row of json.balance_infos) {
    if (!exact(row, 'currency,total_balance,granted_balance,topped_up_balance')
      || !['CNY', 'USD'].includes(row.currency) || rows.has(row.currency)) fail('currency_unknown');
    const amounts = ['total_balance', 'granted_balance', 'topped_up_balance'].map(field => {
      const value = row[field];
      if (typeof value !== 'string' || value.length > 32
        || !/^(0|[1-9]\d*)(\.\d{1,8})?$/u.test(value)) fail('currency_unknown');
      const [whole, fraction = ''] = value.split('.');
      return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'));
    });
    if (amounts[0] !== amounts[1] + amounts[2]
      || (row.currency === 'USD' && amounts.some(value => value !== 0n))) fail('currency_unknown');
    rows.set(row.currency, amounts);
  }
  if (!rows.has('CNY') || rows.get('CNY')[0] < BigInt(POLICY.reserveMicroCny) * 100n) fail('currency_unknown');
  return { currency: 'CNY' };
}
export const readOneShotBalance = (key, fetchImpl = fetch) => readDeepSeekBalance(key, fetchImpl, validateOneShotBalance);

export function createOneShotBudget({ store, approvedGrantDigest, approvedReviewDigest, readBalance = readOneShotBalance,
  now = Date.now, id = randomUUID }) {
  let stopped = false, lastTime = -1;
  const clock = () => { const at = timestamp(now()); if (at < lastTime) fail('clock_rollback'); lastTime = at; return at; };
  return async (context, request) => {
    if (stopped) fail('session_stopped');
    let prepared, reservation;
    try {
      prepared = prepareRequest(context);
      if (prepared.mode !== 'manual' || !/^[0-9]+$/u.test(prepared.runId) || typeof request !== 'function') fail('grant_manual_only');
      const previous = await store.read(); store.assertClock?.();
      const options = { consumer: prepared.consumer, approvedGrantDigest, approvedReviewDigest };
      admission(previous.ledger, options, clock());
      validateOneShotBalance(await readBalance(context.key));
      const at = clock(); admission(previous.ledger, options, at);
      reservation = { id: id(), kind: 'reserve', time: new Date(at).toISOString(), consumer: prepared.consumer,
        mode: 'manual', runId: prepared.runId, keyId: prepared.keyId, requestDigest: prepared.requestDigest,
        reservedMicroCny: POLICY.reserveMicroCny, reviewDigest: approvedReviewDigest };
      const next = validateOneShotTransition(previous.ledger, { ...previous.ledger, entries: [...previous.ledger.entries, reservation] }, at);
      if (await store.write(previous, next) !== true) fail('contention');
      if (!same(prepared, prepareRequest(context))) fail('request_changed');
      // Check the pre-reservation snapshot again for expiry/clock at dispatch.
      admission(previous.ledger, options, clock()); store.assertClock?.();
    } catch (error) { stopped = true; throw error; }
    let result, failure, proof;
    try { result = await request(prepared); proof = receipt(result, Date.parse(reservation.time), clock()); }
    catch (error) { failure = error; stopped = true; }
    try {
      const previous = await store.read(); store.assertClock?.(); const at = clock();
      validateOneShotLedger(previous.ledger, at);
      if (!same(previous.ledger.entries.find(r => r.id === reservation.id), reservation)) fail('receipt_mismatch');
      const outcome = { id: id(), kind: 'outcome', time: new Date(at).toISOString(), reservationId: reservation.id,
        status: !failure ? 'complete_unreconciled' : failure.budgetCode ? 'contract_hold' : 'failed_unknown',
        requestIdDigest: proof?.requestIdDigest || null, usage: proof?.usage || null,
        code: failure?.budgetCode || (failure ? 'deepseek_budget_provider_unknown' : null) };
      const next = validateOneShotTransition(previous.ledger, { ...previous.ledger, entries: [...previous.ledger.entries, outcome] }, at);
      if (await store.write(previous, next) !== true) fail('receipt_pending');
    } catch { stopped = true; if (!failure) fail('receipt_pending'); }
    if (failure) throw failure;
    return result;
  };
}

export function oneShotRuntimeConfig(env = process.env) {
  if (env.DEEPSEEK_BUDGET_SELECTION !== GRANT.id || env.GITHUB_ACTIONS !== 'true'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REPOSITORY !== BUDGET_REPOSITORY
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_RUN_ATTEMPT !== '1'
    || !/^[0-9]+$/u.test(env.GITHUB_RUN_ID || '')) fail('grant_manual_only');
  const consumer = env.DEEPSEEK_BUDGET_CONSUMER;
  const workflows = { 'macro-editorial': 'macro-risk-editorial-refresh.yml', 'bubble-editorial': 'bubble-watch-weekly-editorial-refresh.yml' };
  if (!CONSUMERS.includes(consumer)
    || env.GITHUB_WORKFLOW_REF !== `${BUDGET_REPOSITORY}/.github/workflows/${workflows[consumer]}@refs/heads/main`) fail('grant_manual_only');
  return { consumer, approvedGrantDigest: env.DEEPSEEK_ONE_SHOT_GRANT_SHA256,
    approvedReviewDigest: env.DEEPSEEK_ONE_SHOT_PRICE_REVIEW_SHA256,
    store: createOneShotStore({ token: env.DEEPSEEK_BUDGET_GITHUB_TOKEN, genesisSha: env.DEEPSEEK_ONE_SHOT_GENESIS_SHA }) };
}
let runtime;
export async function withOneShotBudget({ key, payload, consumer }, request) {
  const config = oneShotRuntimeConfig();
  if (consumer !== config.consumer) fail('invalid_request');
  if (!runtime) runtime = createOneShotBudget(config);
  return runtime({ key, payload, consumer, mode: 'manual', runId: process.env.GITHUB_RUN_ID }, request);
}
