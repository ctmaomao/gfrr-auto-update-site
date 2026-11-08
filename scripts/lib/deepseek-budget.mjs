import { createHash, randomUUID } from 'node:crypto';

// This is an admission ceiling under a reviewed price contract, not a promise
// that the vendor cannot change its fees. No runtime rate/limit overrides exist.
export const BUDGET_REPOSITORY = 'ctmaomao/gfrr-auto-update-site';
export const BUDGET_BRANCH = 'deepseek-usage-ledger';
export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
export const POLICY = Object.freeze({
  id: 'deepseek-flash-cny-20261108-v1', currency: 'CNY', capMicroCny: 5_000_000,
  windowDays: 31, model: 'deepseek-v4-flash', responseModel: 'deepseek-flash',
  documentedModelVersion: 'DeepSeek-V4.1-Flash-1017', underlyingVersionPinned: false,
  contextTokens: 1_048_576, maxOutputTokens: 8_000,
  inputMicroCnyPerToken: 2, outputMicroCnyPerToken: 8,
  // Deliberately double-count output against the whole input context bound.
  reserveMicroCny: 2_161_152, maxReviewAgeMs: 86_400_000,
  maxClockSkewMs: 60_000, metadataTimeoutMs: 15_000, timestampResolutionMs: 1_000,
  dashboardReportingLagMs: 300_000, dashboardQuantumMicroCny: 10_000, maxBootstrapEvidenceAgeMs: 300_000,
  verifiedAtUtc: '2026-11-07',
  priceSource: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  modelSource: 'https://api-docs.deepseek.com/api/list-models/',
  requestSource: 'https://api-docs.deepseek.com/api/create-chat-completion/'
});
export const CONSUMERS = Object.freeze(['macro-editorial', 'bubble-editorial']);
const DAY = 86_400_000, WINDOW = POLICY.windowDays * DAY, MAX_BYTES = 2 * 1024 * 1024;
// Two independent processes may sit at opposite accepted clock-error extremes.
// Include each HTTP request's bounded transit and second-resolution Date header.
// 31 days +152s therefore NEVER retires debt early solely because of that skew.
export const RETIREMENT_MARGIN_MS = 2 * (POLICY.maxClockSkewMs + POLICY.metadataTimeoutMs + POLICY.timestampResolutionMs);
const RETIREMENT_WINDOW = WINDOW + RETIREMENT_MARGIN_MS;
const HEX = /^[a-f0-9]{64}$/u, SHA = /^[a-f0-9]{40}$/u;
const fail = code => { throw Object.assign(new Error(`deepseek_budget_${code}`), { budgetCode: `deepseek_budget_${code}` }); };
const integer = n => Number.isSafeInteger(n) && n >= 0;
const iso = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === keys.split(',').sort().join(',');
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export const POLICY_DIGEST = digest(POLICY);
const same = (a, b) => canonical(a) === canonical(b);
const time = now => { if (!integer(now) || now > 8_640_000_000_000_000) fail('clock_unknown'); return now; };

/** Canonical bootstrap contract, prepared OFFLINE, never initialized by a call.
 * bootstrap = { cutoverAt, evidenceSha256, history: 'full-cap-quarantine',
 *   currency: 'CNY', historicalDebitMicroCny: 5000000,
 *   outstandingRequests: 0, ungatedConsumersDisabled: true }.
 * Evidence must prove every earlier project request is finished and every
 * ungated caller is disabled at cutoverAt. Unknown history is quarantined for
 * 31 FULL days plus the cross-process clock margin, not assumed zero. This does not claim past spend was <=CNY5.
 * Operator must preserve any pre-existing ledger; initialization is one-time.
 * review = { policyDigest, verifiedAt, expiresAt, evidenceSha256 }.
 * Its digest is pinned separately by DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256.
 * Reverification appends a review; NEVER replace bootstrap/history/old reviews.
 * Alternatively history='reviewed-complete-history' requires coveredFrom at least
 * 31 days plus the clock margin before cutoverAt, scope='both-editorial-consumers-all-keys', and complete
 * historicalEntries=[{recordSha256,time,costMicroCny}]. historicalDebitMicroCny
 * must equal their sum. The preparer requires approvedRecordDigest=digest(bootstrap)
 * from independent review; empty entries are permitted ONLY with positive evidence
 * that the complete project history is zero. A balance snapshot is not that evidence.
 *
 * A third mode, history='reviewed-current-calendar-month', may conservatively
 * cover pre-cutover project spend with the CURRENT calendar month's complete
 * account-all-keys total. It requires the common fields above plus:
 * calendarMonth='YYYY-MM', calendarUtcOffsetMinutes (verified FIXED billing offset),
 * coveredFrom=that month's exact start, scope='account-all-keys-upper-bound',
 * accountEvidenceSha256 (minimal account/period binding and verified BILLING
 *   calendar offset, never inferred from browser/display timezone),
 * quiescence={ungatedPathsDisabledAt,allRequestsFinishedBy,evidenceSha256},
 * dashboard={observedAt,reportedSpendMicroCny,displayQuantumMicroCny:10000,
 *   reportedCalls,reportingLagMs:300000,lagBoundEvidenceSha256,evidenceSha256}.
 * All times are canonical ISO UTC. Approval must attest COMPLETE all-key/current-
 * month coverage, the verified fixed billing offset and bounded reporting lag;
 * guessed timestamps, an approximate/unknown lag, balance, one-key filters or
 * pending older requests are NOT evidence. In particular, a dashboard saying
 * 'may be delayed5 minutes' does not establish a maximum settled reporting lag. Observe the dashboard only AFTER
 * both quiescence times +5min lag +clock margin; observe before cutover; prepare
 * within5min of observation and in that same billing month (observation, cutover
 * and preparation must each remain in that month over their ±76s clock range). The debit is exactly
 * displayed spend +one full0.01 CNY quantum (0.14 ->0.15), never a rounded-down
 * estimate. Independently approve digest(bootstrap), including every evidence
 * digest. This is a one-time genesis migration, not a monthly reinitialization.
 * Prior-month unrelated account activity is not current-month project spend.
 * Hold this bootstrap debt for31 days+margin after cutover; post-cutover calls
 * still share the conservative rolling window. Every later fixed-offset
 * calendar month is at most31 days, so it cannot contain spend beyond the cap.
 */
export function prepareBootstrapLedger({ bootstrap, review, approvedRecordDigest }, now = Date.now()) {
  if (['reviewed-complete-history', 'reviewed-current-calendar-month'].includes(bootstrap?.history) && (!HEX.test(approvedRecordDigest || '') || digest(bootstrap) !== approvedRecordDigest)) fail('bootstrap_unproven');
  const ledger = { schemaVersion: 'deepseek-budget-v1', bootstrap, reviews: [review], entries: [] };
  validateLedger(ledger, now);
  if (bootstrap.history === 'reviewed-current-calendar-month'
    && (!sameBillingMonthWithinSkew(now, bootstrap)
      || now - Date.parse(bootstrap.dashboard.observedAt) > POLICY.maxBootstrapEvidenceAgeMs)) fail('bootstrap_unproven');
  return structuredClone(ledger);
}
function validateReview(review, now) {
  if (!exact(review, 'policyDigest,verifiedAt,expiresAt,evidenceSha256') || review.policyDigest !== POLICY_DIGEST
    || !iso(review.verifiedAt) || !iso(review.expiresAt) || !HEX.test(review.evidenceSha256)
    || Date.parse(review.verifiedAt) > now || Date.parse(review.expiresAt) <= Date.parse(review.verifiedAt)
    || Date.parse(review.expiresAt) - Date.parse(review.verifiedAt) > POLICY.maxReviewAgeMs) fail('price_policy_unknown');
}
function activeReview(ledger, approvedReviewDigest, now) {
  const review = ledger.reviews.at(-1);
  if (!HEX.test(approvedReviewDigest || '') || digest(review) !== approvedReviewDigest
    || Date.parse(review.expiresAt) <= now + RETIREMENT_MARGIN_MS / 2) fail('price_review_required');
  return review;
}

const monthAt = (at, utcOffsetMinutes) => new Date(at + utcOffsetMinutes * 60_000).toISOString().slice(0, 7);
const sameBillingMonthWithinSkew = (at, bootstrap) => [-1, 1].every(direction =>
  monthAt(at + direction * RETIREMENT_MARGIN_MS / 2, bootstrap.calendarUtcOffsetMinutes) === bootstrap.calendarMonth);
function validateMonthlyBootstrap(b, common) {
  if (!exact(b, `${common},calendarMonth,calendarUtcOffsetMinutes,coveredFrom,scope,accountEvidenceSha256,quiescence,dashboard`)
    || !/^20\d{2}-(0[1-9]|1[0-2])$/u.test(b.calendarMonth || '')
    || !Number.isSafeInteger(b.calendarUtcOffsetMinutes) || Math.abs(b.calendarUtcOffsetMinutes) > 14 * 60
    || b.calendarUtcOffsetMinutes % 15 !== 0 || !iso(b.coveredFrom)
    || b.scope !== 'account-all-keys-upper-bound' || !HEX.test(b.accountEvidenceSha256)) fail('bootstrap_unproven');
  const monthStart = Date.parse(`${b.calendarMonth}-01T00:00:00.000Z`) - b.calendarUtcOffsetMinutes * 60_000;
  if (Date.parse(b.coveredFrom) !== monthStart || !sameBillingMonthWithinSkew(Date.parse(b.cutoverAt), b)) fail('bootstrap_unproven');
  const q = b.quiescence, d = b.dashboard;
  if (!exact(q, 'ungatedPathsDisabledAt,allRequestsFinishedBy,evidenceSha256')
    || !iso(q.ungatedPathsDisabledAt) || !iso(q.allRequestsFinishedBy) || !HEX.test(q.evidenceSha256)
    || !exact(d, 'observedAt,reportedSpendMicroCny,displayQuantumMicroCny,reportedCalls,reportingLagMs,lagBoundEvidenceSha256,evidenceSha256')
    || !iso(d.observedAt) || !HEX.test(d.evidenceSha256) || !HEX.test(d.lagBoundEvidenceSha256) || !integer(d.reportedSpendMicroCny)
    || !integer(d.reportedCalls) || (d.reportedCalls === 0 && d.reportedSpendMicroCny !== 0)
    || d.displayQuantumMicroCny !== POLICY.dashboardQuantumMicroCny
    || d.reportedSpendMicroCny % d.displayQuantumMicroCny !== 0
    || d.reportingLagMs !== POLICY.dashboardReportingLagMs
    || b.historicalDebitMicroCny !== d.reportedSpendMicroCny + d.displayQuantumMicroCny) fail('bootstrap_unproven');
  const drainedAt = Math.max(Date.parse(q.ungatedPathsDisabledAt), Date.parse(q.allRequestsFinishedBy));
  if (Date.parse(d.observedAt) < drainedAt + POLICY.dashboardReportingLagMs + RETIREMENT_MARGIN_MS
    || Date.parse(d.observedAt) > Date.parse(b.cutoverAt)
    || Date.parse(b.cutoverAt) - Date.parse(d.observedAt) > POLICY.maxBootstrapEvidenceAgeMs
    || !sameBillingMonthWithinSkew(Date.parse(d.observedAt), b)) fail('bootstrap_unproven');
}

export function validateLedger(ledger, now = Date.now()) {
  time(now);
  if (!exact(ledger, 'schemaVersion,bootstrap,reviews,entries') || ledger.schemaVersion !== 'deepseek-budget-v1'
    || !Array.isArray(ledger.entries) || !Array.isArray(ledger.reviews) || ledger.reviews.length < 1) fail('invalid_ledger');
  const b = ledger.bootstrap;
  const common = 'cutoverAt,evidenceSha256,history,currency,historicalDebitMicroCny,outstandingRequests,ungatedConsumersDisabled';
  if (!b || !iso(b.cutoverAt) || Date.parse(b.cutoverAt) > now || !HEX.test(b.evidenceSha256)
    || b.currency !== POLICY.currency || !integer(b.historicalDebitMicroCny)
    || b.outstandingRequests !== 0 || b.ungatedConsumersDisabled !== true) fail('bootstrap_unproven');
  if (b.history === 'full-cap-quarantine') {
    if (!exact(b, common) || b.historicalDebitMicroCny !== POLICY.capMicroCny) fail('bootstrap_unproven');
  } else if (b.history === 'reviewed-complete-history') {
    if (!exact(b, `${common},coveredFrom,scope,historicalEntries`) || !iso(b.coveredFrom)
      || Date.parse(b.coveredFrom) > Date.parse(b.cutoverAt) - RETIREMENT_WINDOW
      || b.scope !== 'both-editorial-consumers-all-keys' || !Array.isArray(b.historicalEntries)) fail('bootstrap_unproven');
    let total = 0; const historicIds = new Set();
    for (const entry of b.historicalEntries) {
      if (!exact(entry, 'recordSha256,time,costMicroCny') || !HEX.test(entry.recordSha256) || historicIds.has(entry.recordSha256)
        || !iso(entry.time) || Date.parse(entry.time) > Date.parse(b.cutoverAt) || Date.parse(entry.time) < Date.parse(b.coveredFrom)
        || !integer(entry.costMicroCny)) fail('bootstrap_unproven');
      total += entry.costMicroCny; historicIds.add(entry.recordSha256);
    }
    if (!integer(total) || total !== b.historicalDebitMicroCny) fail('bootstrap_unproven');
  } else if (b.history === 'reviewed-current-calendar-month') {
    validateMonthlyBootstrap(b, common);
  } else fail('bootstrap_unproven');
  let reviewedAt = Date.parse(b.cutoverAt);
  const reviews = new Set();
  for (const review of ledger.reviews) {
    validateReview(review, now);
    if (Date.parse(review.verifiedAt) < reviewedAt || reviews.has(digest(review))) fail('price_policy_unknown');
    reviewedAt = Date.parse(review.verifiedAt); reviews.add(digest(review));
  }
  const ids = new Set(), reserved = new Map(), outcomes = new Set(), settlements = new Set();
  let previousTime = Date.parse(b.cutoverAt);
  for (const row of ledger.entries) {
    if (!row || !/^[a-f0-9-]{36}$/u.test(row.id || '') || ids.has(row.id) || !iso(row.time)
      || Date.parse(row.time) > now || Date.parse(row.time) < previousTime) fail('invalid_ledger');
    previousTime = Date.parse(row.time); ids.add(row.id);
    if (row.kind === 'reserve') {
      if (!exact(row, 'id,kind,time,consumer,mode,runId,keyId,requestDigest,reservedMicroCny,reviewDigest')
        || !CONSUMERS.includes(row.consumer) || !['manual', 'automated'].includes(row.mode)
        || !/^(local|[0-9]+)$/u.test(row.runId) || !HEX.test(row.keyId) || !HEX.test(row.requestDigest)
        || row.reservedMicroCny !== POLICY.reserveMicroCny || !reviews.has(row.reviewDigest)) fail('invalid_ledger');
      const review = ledger.reviews.find(r => digest(r) === row.reviewDigest);
      if (Date.parse(row.time) < Date.parse(review.verifiedAt) || Date.parse(row.time) >= Date.parse(review.expiresAt)) fail('invalid_ledger');
      reserved.set(row.id, row);
    } else if (row.kind === 'outcome') {
      if (!exact(row, 'id,kind,time,reservationId,status,requestIdDigest,usage,code') || !reserved.has(row.reservationId)
        || outcomes.has(row.reservationId) || !['complete_unreconciled', 'failed_unknown', 'contract_hold'].includes(row.status)
        || !(row.requestIdDigest === null || HEX.test(row.requestIdDigest))
        || !(row.code === null || /^deepseek_budget_[a-z_]+$/u.test(row.code))) fail('invalid_ledger');
      if (row.status === 'complete_unreconciled') {
        if (!row.requestIdDigest || row.code !== null) fail('invalid_ledger');
        validateTokenUsage(row.usage);
      } else if (row.usage !== null || row.requestIdDigest !== null || !row.code) fail('invalid_ledger');
      outcomes.add(row.reservationId);
    } else if (row.kind === 'settlement') {
      // Only an explicitly reviewed, provider-issued billing record can close an
      // uncertain liability. Even here the full reserve is charged, NEVER refunded.
      if (!exact(row, 'id,kind,time,reservationId,currency,billedMicroCny,billingEvidenceSha256,requestIdDigest,model')
        || !reserved.has(row.reservationId) || settlements.has(row.reservationId) || row.currency !== POLICY.currency
        || !integer(row.billedMicroCny) || row.billedMicroCny > POLICY.reserveMicroCny
        || !HEX.test(row.billingEvidenceSha256) || !HEX.test(row.requestIdDigest) || row.model !== POLICY.responseModel) fail('billing_unknown');
      const outcome = ledger.entries.find(e => e.kind === 'outcome' && e.reservationId === row.reservationId);
      if (outcome?.requestIdDigest && outcome.requestIdDigest !== row.requestIdDigest) fail('billing_unknown');
      settlements.add(row.reservationId);
    } else fail('invalid_ledger');
  }
  if (Buffer.byteLength(JSON.stringify(ledger)) > MAX_BYTES) fail('ledger_full');
  return ledger;
}

export function validateTransition(previous, next, now) {
  validateLedger(previous, now); validateLedger(next, now);
  if (!same(previous.bootstrap, next.bootstrap) || next.reviews.length < previous.reviews.length || next.entries.length < previous.entries.length
    || !previous.reviews.every((r, i) => same(r, next.reviews[i])) || !previous.entries.every((r, i) => same(r, next.entries[i]))) fail('history_changed');
  const addedEntries = next.entries.length - previous.entries.length, addedReviews = next.reviews.length - previous.reviews.length;
  if (addedEntries + addedReviews !== 1) fail('history_changed');
  if (addedEntries && next.entries.at(-1).kind === 'reserve') {
    const row = next.entries.at(-1);
    const summary = summarizeLedger(previous, Date.parse(row.time));
    if (summary.hold) fail('contract_hold');
    if (summary.unresolved) fail('receipt_pending');
    if (summary.reservedMicroCny + row.reservedMicroCny > POLICY.capMicroCny) fail('project_limit');
    if (row.reviewDigest !== digest(previous.reviews.at(-1))) fail('price_policy_unknown');
  }
  return next;
}

export function summarizeLedger(ledger, now = Date.now()) {
  validateLedger(ledger, now);
  let reservedMicroCny = Date.parse(ledger.bootstrap.cutoverAt) + RETIREMENT_WINDOW >= now ? ledger.bootstrap.historicalDebitMicroCny : 0;
  const byConsumer = Object.fromEntries(CONSUMERS.map(c => [c, 0]));
  let unresolved = 0;
  for (const row of ledger.entries.filter(r => r.kind === 'reserve')) {
    const settlement = ledger.entries.find(r => r.kind === 'settlement' && r.reservationId === row.id);
    const completed = ledger.entries.find(r => r.kind === 'outcome' && r.reservationId === row.id && r.status === 'complete_unreconciled');
    const finished = settlement || completed;
    if (!finished) unresolved++;
    // A complete validated provider result proves the attempt has finished, not
    // its billed amount. Keep the FULL reserve for31 days+clock margin after completion.
    // Unknown timeout/crash outcomes never age away without reviewed proof. They
    // also block subsequent admission, so a failed durable contract-hold write
    // cannot accidentally permit another request against unknown prices/model.
    if (!finished || Date.parse(finished.time) + RETIREMENT_WINDOW >= now) {
      reservedMicroCny += row.reservedMicroCny; byConsumer[row.consumer] += row.reservedMicroCny;
    }
  }
  const hold = ledger.entries.some(r => r.kind === 'outcome' && r.status === 'contract_hold');
  return { currency: POLICY.currency, capMicroCny: POLICY.capMicroCny, reservedMicroCny,
    remainingMicroCny: Math.max(0, POLICY.capMicroCny - reservedMicroCny), byConsumer, unresolved, hold };
}

export function appendPriceReview(ledger, review, approvedReviewDigest, now = Date.now()) {
  if (!HEX.test(approvedReviewDigest || '') || digest(review) !== approvedReviewDigest) fail('price_review_required');
  return validateTransition(ledger, { ...ledger, reviews: [...ledger.reviews, review] }, now);
}
export function appendVerifiedSettlement(ledger, record, approvedRecordDigest, now = Date.now()) {
  if (!HEX.test(approvedRecordDigest || '') || digest(record) !== approvedRecordDigest || record?.kind !== 'settlement') fail('billing_unknown');
  return validateTransition(ledger, { ...ledger, entries: [...ledger.entries, record] }, now);
}

export function prepareRequest({ key, payload, consumer, mode = 'manual', runId = 'local' }) {
  if (typeof key !== 'string' || !key || /[\r\n]/u.test(key) || !CONSUMERS.includes(consumer)
    || !['manual', 'automated'].includes(mode) || !/^(local|[0-9]+)$/u.test(runId)) fail('invalid_request');
  // Only plain JSON with data properties: getters/toJSON would change the body
  // between validation, reservation and serialization.
  function plain(value) {
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) fail('invalid_request');
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (descriptor.get || descriptor.set) fail('invalid_request');
      plain(descriptor.value);
    }
    if (Object.getOwnPropertySymbols(value).length) fail('invalid_request');
  }
  try { plain(payload); } catch { fail('invalid_request'); }
  if (!exact(payload, 'model,temperature,max_tokens,stream,thinking,response_format,messages')
    || payload.model !== POLICY.model || payload.temperature !== 0.2 || payload.max_tokens !== POLICY.maxOutputTokens
    || payload.stream !== false || !same(payload.thinking, { type: 'disabled' })
    || !same(payload.response_format, { type: 'json_object' }) || !Array.isArray(payload.messages) || payload.messages.length !== 2
    || payload.messages.some((m, i) => !exact(m, 'role,content') || m.role !== ['system', 'user'][i] || typeof m.content !== 'string' || !m.content)) fail('invalid_request');
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > MAX_BYTES) fail('invalid_request');
  return Object.freeze({ url: DEEPSEEK_URL, body, method: 'POST', redirect: 'error',
    headers: Object.freeze({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }),
    consumer, mode, runId, keyId: digest(key), requestDigest: digest(body) });
}

export function validateBalance(json) {
  if (json?.is_available !== true || !Array.isArray(json.balance_infos) || json.balance_infos.length !== 1) fail('currency_unknown');
  const b = json.balance_infos[0];
  if (b?.currency !== POLICY.currency || ['total_balance', 'granted_balance', 'topped_up_balance'].some(k =>
    typeof b[k] !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,8})?$/u.test(b[k]) || !Number.isFinite(Number(b[k])))) fail('currency_unknown');
  // Balance proves only a currency snapshot. It is NOT a project spend meter,
  // bootstrap evidence, an account identity or authority to raise the cap.
  return { currency: b.currency };
}
function validateTokenUsage(usage) {
  if (!exact(usage, 'prompt_tokens,completion_tokens,total_tokens') || !integer(usage.prompt_tokens)
    || !integer(usage.completion_tokens) || !integer(usage.total_tokens)
    || usage.completion_tokens > POLICY.maxOutputTokens || usage.total_tokens > POLICY.contextTokens
    || usage.prompt_tokens + usage.completion_tokens !== usage.total_tokens) fail('receipt_unknown');
  return usage;
}
function receipt(result, startedAt, completedAt) {
  // Three audited 2026-11-02 Bubble responses use deepseek-flash for the exact
  // request alias. The generic API identifier does NOT pin the model-card version.
  if (!result || result.model !== POLICY.responseModel) fail('model_changed');
  if (typeof result.id !== 'string' || !result.id || result.id.length > 256
    || result.object !== 'chat.completion' || !integer(result.created)
    || result.created * 1000 < startedAt - 60_000 || result.created * 1000 > completedAt + 60_000) fail('receipt_unknown');
  // The documented completion payload has no monetary receipt. Do not silently
  // reinterpret an unexpected cost/currency field or invent one from token usage.
  if (Object.keys(result).some(k => /cost|currency|billing/iu.test(k))
    || Object.keys(result.usage || {}).some(k => /cost|currency|billing/iu.test(k))) fail('billing_unknown');
  const u = result.usage;
  if (u?.completion_tokens_details !== undefined
    && (!exact(u.completion_tokens_details, 'reasoning_tokens') || u.completion_tokens_details.reasoning_tokens !== 0)) fail('model_changed');
  const usage = validateTokenUsage({ prompt_tokens: u?.prompt_tokens, completion_tokens: u?.completion_tokens, total_tokens: u?.total_tokens });
  if (u.prompt_cache_hit_tokens !== undefined || u.prompt_cache_miss_tokens !== undefined) {
    if (!integer(u.prompt_cache_hit_tokens) || !integer(u.prompt_cache_miss_tokens)
      || u.prompt_cache_hit_tokens + u.prompt_cache_miss_tokens !== u.prompt_tokens) fail('receipt_unknown');
  }
  if (!Array.isArray(result.choices) || result.choices.length !== 1
    || !['stop', 'length', 'content_filter'].includes(result.choices[0]?.finish_reason)
    || result.choices[0]?.message?.role !== 'assistant'
    || !(typeof result.choices[0].message.content === 'string'
      || (result.choices[0].finish_reason === 'content_filter' && result.choices[0].message.content === null))) fail('receipt_unknown');
  if (result.choices[0].message.reasoning_content) fail('model_changed');
  return { usage, requestIdDigest: digest(result.id) };
}

async function boundedJson(fetchImpl, url, init = {}, validateDate = () => {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), POLICY.metadataTimeoutMs);
  const startedAt = performance.now();
  const validateBoundary = observedAt => {
    // setTimeout can be delayed by event-loop suspension. The margin assumes an
    // actual bounded metadata duration, measured independently of the wall clock.
    if (performance.now() - startedAt > POLICY.metadataTimeoutMs) fail('transport_unknown');
    validateDate(observedAt);
  };
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error' });
    const observedAt = Date.parse(response.headers.get('date') || '');
    validateBoundary(observedAt);
    if (!response.ok) { await response.body?.cancel(); validateBoundary(observedAt); return { status: response.status, observedAt }; }
    if (!response.body) fail('transport_unknown');
    const reader = response.body.getReader(), chunks = []; let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read(); validateBoundary(observedAt); if (done) break;
      bytes += value.length; if (bytes > MAX_BYTES) { await reader.cancel(); fail('response_too_large'); }
      chunks.push(Buffer.from(value));
    }
    const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    validateBoundary(observedAt);
    return { status: response.status, observedAt, json };
  } catch (error) { if (error.budgetCode) throw error; fail('transport_unknown'); } finally { clearTimeout(timer); }
}
export async function readDeepSeekBalance(key, fetchImpl = fetch) {
  if (typeof key !== 'string' || !key || /[\r\n]/u.test(key)) fail('key_missing');
  const response = await boundedJson(fetchImpl, 'https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` } });
  if (response.status !== 200) fail('balance_unavailable');
  validateBalance(response.json); return response.json;
}

/** Durable authority: independent branch pinned to an operator-verified genesis
 * SHA. Every historical transition is checked; writes are non-force CAS only.
 * This protects cooperating callers, corruption and accidental history removal.
 * An administrator can rewrite code/anchors/refs: arbitrary external malicious
 * rewinds are outside this client-side guarantee. No protection/permission
 * settings are created or required by this module.
 */
export function createGithubLedger({ token, genesisSha, fetchImpl = fetch, now = Date.now }) {
  if (!token) fail('credentials_missing');
  if (!SHA.test(genesisSha || '')) fail('uninitialized');
  const base = `https://api.github.com/repos/${BUDGET_REPOSITORY}`;
  const snapshots = new WeakMap();
  let lastObservedHead, lastObservedDate;
  // The152s retirement margin requires a CURRENT bounded clock, not merely a
  // passing initial ref read. Check EVERY response, every awaited body read and
  // every accounting/dispatch boundary. Keep the raw server Date as a conservative
  // anchor: a long pause may hold rather than extrapolating an untrusted wall clock.
  const assertClock = (observedAt = lastObservedDate) => {
    if (!Number.isFinite(observedAt) || Math.abs(time(now()) - observedAt) > POLICY.maxClockSkewMs) fail('clock_unknown');
  };
  const validateDate = observedAt => { assertClock(observedAt); lastObservedDate = observedAt; };
  const api = (path, method = 'GET', body) => boundedJson(fetchImpl, `${base}${path}`, { method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    ...(body ? { body: JSON.stringify(body) } : {}) }, validateDate);
  async function load(head) {
    const commit = await api(`/git/commits/${head}`);
    if (commit.status !== 200 || commit.json?.sha !== head || !Array.isArray(commit.json.parents)) fail('history_unproven');
    const file = await api(`/contents/usage.json?ref=${head}`);
    if (file.status !== 200 || file.json?.encoding !== 'base64' || typeof file.json.content !== 'string') fail('invalid_ledger');
    let ledger;
    try { ledger = JSON.parse(Buffer.from(file.json.content, 'base64').toString('utf8')); } catch { fail('invalid_ledger'); }
    return { ledger, parents: commit.json.parents };
  }
  return {
    async read() {
      const ref = await api(`/git/ref/heads/${BUDGET_BRANCH}`);
      if (ref.status === 404) fail('uninitialized');
      if (ref.status !== 200 || !SHA.test(ref.json?.object?.sha || '')) fail('store_unavailable');
      const chain = [], heads = [], head = ref.json.object.sha; let current = head;
      for (let n = 0; n < 1024; n++) {
        const snapshot = await load(current); chain.push(snapshot); heads.push(current);
        if (current === genesisSha) {
          if (snapshot.parents.length || snapshot.ledger.entries?.length || snapshot.ledger.reviews?.length !== 1) fail('bootstrap_unproven');
          break;
        }
        if (snapshot.parents.length !== 1 || !SHA.test(snapshot.parents[0]?.sha || '')) fail('history_unproven');
        current = snapshot.parents[0].sha;
      }
      if (current !== genesisSha) fail('history_unproven');
      if (lastObservedHead && !heads.includes(lastObservedHead)) fail('history_rollback');
      validateLedger(chain.at(-1).ledger, now());
      for (let n = chain.length - 2; n >= 0; n--) validateTransition(chain[n + 1].ledger, chain[n].ledger, now());
      assertClock();
      const snapshot = { head, ledger: chain[0].ledger, observedAt: lastObservedDate };
      snapshots.set(snapshot, structuredClone(snapshot)); lastObservedHead = head; return snapshot;
    },
    assertClock,
    async write(previous, ledger) {
      assertClock();
      const original = snapshots.get(previous);
      if (!original || !same(previous, original) || !SHA.test(previous.head)) fail('unproven_write_parent');
      validateTransition(original.ledger, ledger, now());
      assertClock();
      const tree = await api('/git/trees', 'POST', { tree: [{ path: 'usage.json', mode: '100644', type: 'blob', content: JSON.stringify(ledger) }] });
      if (tree.status !== 201 || !SHA.test(tree.json?.sha || '')) fail('store_unavailable');
      const commit = await api('/git/commits', 'POST', { message: 'Record capped DeepSeek admission', tree: tree.json.sha, parents: [previous.head] });
      if (commit.status !== 201 || !SHA.test(commit.json?.sha || '')) fail('store_unavailable');
      const update = await api(`/git/refs/heads/${BUDGET_BRANCH}`, 'PATCH', { sha: commit.json.sha, force: false });
      if ([409, 422].includes(update.status)) return false;
      if (update.status !== 200 || update.json?.object?.sha !== commit.json.sha) fail('write_uncertain');
      // A committed ref with a lost/untrusted clock acknowledgment is uncertain:
      // throw and preserve the pending debit, NEVER dispatch a paid callback.
      assertClock();
      return true;
    }
    // Deliberately no initialize() or force-write. prepareBootstrapLedger is an
    // offline plan; one-time root creation and protection are operator actions.
  };
}

export async function verifyBudgetStatus({ store, approvedReviewDigest, now = Date.now }) {
  const snapshot = await store.read(), at = time(now());
  store.assertClock?.();
  validateLedger(snapshot.ledger, at);
  const summary = summarizeLedger(snapshot.ledger, at);
  let admission = 'eligible_snapshot_only';
  try { activeReview(snapshot.ledger, approvedReviewDigest, at); if (summary.hold) fail('contract_hold');
    if (summary.unresolved) fail('receipt_pending');
    if (summary.remainingMicroCny < POLICY.reserveMicroCny) fail('project_limit');
  } catch (error) { admission = error.budgetCode; }
  return { operation: 'read_only_verification', providerCalls: 0, writes: 0, head: snapshot.head, policy: POLICY, ...summary, admission };
}

export function createDeepSeekBudget({ store, readBalance = readDeepSeekBalance, approvedReviewDigest, now = Date.now, id = randomUUID, report = () => {} }) {
  let stopped = false, lastTime = -1;
  const clock = () => { const n = time(now()); if (n < lastTime) fail('clock_rollback'); lastTime = n; return n; };
  const safeReport = row => { try { report(row); } catch { /* Observability never changes accounting. */ } };
  return async (context, request) => {
    if (stopped) fail('session_stopped');
    let prepared, reservation;
    try {
      prepared = prepareRequest(context);
      if (typeof request !== 'function') fail('invalid_request');
      const previous = await store.read(), at = clock();
      store.assertClock?.();
      validateLedger(previous.ledger, at); activeReview(previous.ledger, approvedReviewDigest, at);
      const summary = summarizeLedger(previous.ledger, at);
      if (summary.hold) fail('contract_hold');
      if (summary.unresolved) fail('receipt_pending');
      if (summary.remainingMicroCny < POLICY.reserveMicroCny) fail('project_limit');
      validateBalance(await readBalance(prepared.headers.Authorization.slice(7)));
      // Do not retry even metadata CAS conflicts: a later independent invocation
      // must reassess current history. No uncertain write can reach the callback.
      const reservedAt = clock(); activeReview(previous.ledger, approvedReviewDigest, reservedAt);
      reservation = { id: id(), kind: 'reserve', time: new Date(reservedAt).toISOString(), consumer: prepared.consumer,
        mode: prepared.mode, runId: prepared.runId, keyId: prepared.keyId, requestDigest: prepared.requestDigest,
        reservedMicroCny: POLICY.reserveMicroCny, reviewDigest: approvedReviewDigest };
      const next = validateTransition(previous.ledger, { ...previous.ledger, entries: [...previous.ledger.entries, reservation] }, reservedAt);
      if (await store.write(previous, next) !== true) fail('contention');
      // Reject mutable caller metadata even though the serialized callback body is
      // already immutable. Policy expiry between reserve and dispatch is a hold.
      if (!same(prepared, prepareRequest(context))) fail('request_changed');
      activeReview(next, approvedReviewDigest, clock());
      store.assertClock?.(); // Last synchronous boundary before the sole paid send.
    } catch (error) {
      stopped = true; safeReport({ consumer: prepared?.consumer || 'unknown', status: error.budgetCode || 'deepseek_budget_unknown' }); throw error;
    }
    let result, failure, proof;
    try { result = await request(prepared); proof = receipt(result, Date.parse(reservation.time), clock()); }
    catch (error) { failure = error; stopped = true; }
    const code = failure?.budgetCode || (failure ? 'deepseek_budget_provider_unknown' : null);
    const status = !failure ? 'complete_unreconciled' : failure.budgetCode ? 'contract_hold' : 'failed_unknown';
    try {
      const previous = await store.read(), at = clock();
      store.assertClock?.();
      validateLedger(previous.ledger, at);
      if (!same(previous.ledger.entries.find(r => r.id === reservation.id), reservation)) fail('receipt_mismatch');
      const outcome = { id: id(), kind: 'outcome', time: new Date(at).toISOString(), reservationId: reservation.id,
        status, requestIdDigest: proof?.requestIdDigest || null, usage: proof?.usage || null, code };
      const next = validateTransition(previous.ledger, { ...previous.ledger, entries: [...previous.ledger.entries, outcome] }, at);
      if (await store.write(previous, next) !== true) fail('receipt_pending');
    } catch { stopped = true; safeReport({ consumer: prepared.consumer, status: 'deepseek_budget_receipt_pending', reservationId: reservation.id });
      if (!failure) fail('receipt_pending'); }
    safeReport({ consumer: prepared.consumer, status, reservationId: reservation.id, reservedMicroCny: POLICY.reserveMicroCny });
    if (failure) throw failure;
    return result;
  };
}

let runtime;
export async function withDeepSeekBudget({ key, payload, consumer }, request) {
  const env = process.env;
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY !== BUDGET_REPOSITORY) fail('wrong_repository');
  if (!runtime) runtime = createDeepSeekBudget({
    store: createGithubLedger({ token: env.DEEPSEEK_BUDGET_GITHUB_TOKEN, genesisSha: env.DEEPSEEK_BUDGET_GENESIS_SHA }),
    approvedReviewDigest: env.DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256,
    report: row => console.log(`DeepSeek budget: ${JSON.stringify(row)}`)
  });
  return runtime({ key, payload, consumer,
    mode: env.GITHUB_ACTIONS === 'true' && ['schedule', 'workflow_run'].includes(env.GITHUB_EVENT_NAME) ? 'automated' : 'manual',
    runId: env.GITHUB_ACTIONS === 'true' ? env.GITHUB_RUN_ID : 'local' }, request);
}
