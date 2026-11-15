import { randomUUID } from 'node:crypto';
import { budgetFailure, createSearchLedger, isTime, keyFingerprint, SEARCH_CLOCK_POLICY } from './free-search-ledger.mjs';

const ACCOUNTING_WINDOW_MS = 600000 + 30000 + SEARCH_CLOCK_POLICY.maxSkewMs + SEARCH_CLOCK_POLICY.httpDatePrecisionMs;
export const METER_POLICY = Object.freeze({ requests: 10, windowMs: 600000, dispatchDeadlineMs: 30000, initializationCooldownMs: ACCOUNTING_WINDOW_MS });
const fail = suffix => budgetFailure(`tavily_budget_meter_${suffix}`);
export function emptyMeterLedger(initializedAt) {
  if (!isTime(initializedAt)) fail('initialization_time_unknown');
  return { schemaVersion: 'tavily-meter-v1', initializedAt, entries: [] };
}
export function validateMeterLedger(ledger, now) {
  if (!Number.isFinite(now) || ledger?.schemaVersion !== 'tavily-meter-v1' || !Array.isArray(ledger.entries)
    || Object.keys(ledger).sort().join(',') !== 'entries,initializedAt,schemaVersion'
    || !isTime(ledger.initializedAt) || Date.parse(ledger.initializedAt) > now) fail('invalid_ledger');
  const ids = new Set();
  for (const row of ledger.entries) {
    if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'id,keyId,state,time' || !/^[a-f0-9-]{36}$/u.test(row.id || '')
      || ids.has(row.id) || !isTime(row.time) || Date.parse(row.time) < Date.parse(ledger.initializedAt) || Date.parse(row.time) > now || !/^[a-f0-9]{16}$/u.test(row.keyId || '')
      || !['reserved', 'success', 'failed'].includes(row.state)) fail('invalid_ledger');
    ids.add(row.id);
  }
  return ledger;
}
export function createTavilyMeterStore({ token = process.env.TAVILY_BUDGET_GITHUB_TOKEN, fetchImpl = fetch, now = Date.now } = {}) {
  return createSearchLedger({ branch: 'tavily-meter-ledger', token, fetchImpl, now, prefix: 'tavily_budget_meter', initialLedger: serverTime => emptyMeterLedger(new Date(serverTime).toISOString()) });
}

// Every real /usage attempt, including operator probes, reserves first. No stale
// snapshot is reused when admission is blocked. Failed and pending attempts count.
export function createMeteredTavilyUsage({ store, readUsage, now = Date.now, id = randomUUID }) {
  let stopped = false;
  const trustedTime = snapshot => {
    if (!Number.isFinite(snapshot?.serverTime)) fail('clock_unknown');
    if (!Number.isFinite(now()) || Math.abs(now() - snapshot.serverTime) > SEARCH_CLOCK_POLICY.maxSkewMs) fail('clock_skew');
    return snapshot.serverTime;
  };
  return async key => {
    if (stopped) fail('session_stopped');
    if (!key) fail('key_missing');
    const row = { id: id(), keyId: keyFingerprint(key), state: 'reserved' };
    try {
      let admitted = false;
      for (let attempt = 0; attempt < 3 && !admitted; attempt++) {
        const previous = await store.read();
        const serverTime = trustedTime(previous);
        row.time ||= new Date(serverTime).toISOString();
        validateMeterLedger(previous.ledger, serverTime);
        // Pre-existing probes are unknown at bootstrap. Wait a whole safe
        // window instead of treating a newly empty branch as zero prior usage.
        if (serverTime - Date.parse(previous.ledger.initializedAt) <= ACCOUNTING_WINDOW_MS) fail('initialization_cooldown');
        // A request can start after its CAS reservation. Retain the bounded
        // dispatch interval, allowed clock skew and HTTP Date precision too.
        // Rolling admission uses GitHub time, never a fresh runner's clock.
        if (previous.ledger.entries.filter(entry => Date.parse(entry.time) >= serverTime - ACCOUNTING_WINDOW_MS).length >= METER_POLICY.requests) fail('rate_limit');
        const ledger = structuredClone(previous.ledger);
        ledger.entries.push(row);
        validateMeterLedger(ledger, serverTime);
        admitted = await store.write(previous, ledger);
      }
      if (!admitted) fail('contention');
      if (now() - Date.parse(row.time) >= METER_POLICY.dispatchDeadlineMs) fail('dispatch_deadline');
      let result, failure;
      try { result = await readUsage(key); } catch (error) { failure = error; }
      let saved = false;
      for (let attempt = 0; attempt < 3 && !saved; attempt++) {
        const previous = await store.read();
        validateMeterLedger(previous.ledger, trustedTime(previous));
        const ledger = structuredClone(previous.ledger);
        const pending = ledger.entries.find(entry => entry.id === row.id);
        if (!pending || pending.state !== 'reserved') fail('receipt_mismatch');
        pending.state = failure ? 'failed' : 'success';
        saved = await store.write(previous, ledger);
      }
      if (!saved) fail('receipt_pending');
      if (failure) throw failure;
      return result;
    } catch (error) { stopped = true; throw error; }
  };
}
