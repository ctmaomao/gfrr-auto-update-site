import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';

// One authority for all repository checkouts, local runs and Actions. This branch
// contains only the ledger, never site files; workflow triggers are main-only.
export const BUDGET_REPOSITORY = 'ctmaomao/gfrr-auto-update-site';
export const BUDGET_BRANCH = 'tavily-usage-ledger';
export const POLICY = Object.freeze({ total: 950, automated: 800, manual: 150, windowDays: 31, accountHeadroom: 50 });
const CONSUMERS = ['macro-editorial', 'bubble-editorial', 'oil-news', 'bubble-ceo'];
const STATES = ['reserved', 'success', 'failed'];
const MAX_BYTES = 2 * 1024 * 1024;
const WINDOW_MS = POLICY.windowDays * 86400000;
const sha = value => /^[a-f0-9]{40}$/u.test(value || '');
const fail = code => { const e = new Error(code); e.budgetCode = code; throw e; };
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const count = value => Number.isSafeInteger(value) && value >= 0;

export function emptyLedger() { return { schemaVersion: 'tavily-budget-v1', entries: [] }; }

export function validateLedger(ledger, now) {
  if (!ledger || ledger.schemaVersion !== 'tavily-budget-v1' || !Array.isArray(ledger.entries)
    || Object.keys(ledger).sort().join(',') !== 'entries,schemaVersion' || !Number.isFinite(now)) fail('tavily_budget_invalid_ledger');
  const ids = new Set();
  for (const entry of ledger.entries) {
    if (Object.keys(entry).sort().join(',') !== 'accountUsageBefore,consumer,credits,id,keyId,mode,reportedCredits,runId,state,time'
      || !/^[a-f0-9-]{36}$/u.test(entry.id) || ids.has(entry.id) || !timestamp(entry.time) || Date.parse(entry.time) > now
      || !CONSUMERS.includes(entry.consumer) || !['automated', 'manual'].includes(entry.mode)
      || !/^[a-f0-9]{16}$/u.test(entry.keyId) || !/^(local|[0-9]+)$/u.test(entry.runId)
      || entry.credits !== 1 || !STATES.includes(entry.state) || !count(entry.accountUsageBefore)
      || !(entry.reportedCredits === null || (count(entry.reportedCredits) && entry.reportedCredits <= 1))) fail('tavily_budget_invalid_ledger');
    ids.add(entry.id);
  }
  if (JSON.stringify(ledger).length > MAX_BYTES) fail('tavily_budget_ledger_full');
  return ledger;
}

export function validateUsage(json) {
  const a = json?.account;
  const k = json?.key;
  if (!a || !k || !count(a.plan_usage) || !count(a.plan_limit) || a.plan_limit < 1
    || !count(a.paygo_usage) || !count(a.paygo_limit) || !count(k.usage) || !count(k.limit) || k.limit < 1) fail('tavily_budget_usage_unknown');
  // Account limits are authoritative; upgrading the account never raises project limits.
  return { planUsage: a.plan_usage, planLimit: a.plan_limit, keyUsage: k.usage, keyLimit: k.limit };
}

export function summarizeLedger(ledger, now = Date.now()) {
  validateLedger(ledger, now);
  const recent = ledger.entries.filter(row => Date.parse(row.time) > now - WINDOW_MS);
  const result = { reservedCredits: recent.length, byConsumer: {}, byKey: {}, byDayUtc: {}, byMode: {} };
  for (const row of recent) {
    for (const [groups, name] of [[result.byConsumer, row.consumer], [result.byKey, row.keyId],
      [result.byDayUtc, row.time.slice(0, 10)], [result.byMode, row.mode]]) {
      const group = groups[name] ||= { reserved: 0, success: 0, failed: 0, pending: 0, reportedCredits: 0, unreportedRequests: 0 };
      group.reserved += row.credits;
      group[row.state === 'reserved' ? 'pending' : row.state]++;
      if (row.reportedCredits === null) group.unreportedRequests++;
      else group.reportedCredits += row.reportedCredits;
    }
  }
  return result;
}

export function reserveCredit(ledger, entry, usage, now) {
  validateLedger(ledger, now);
  const recent = ledger.entries.filter(row => Date.parse(row.time) > now - WINDOW_MS);
  // Snapshot completed IDs BEFORE querying the provider. A competing request
  // that completes during /usage is still unobserved by that meter snapshot.
  const completedBeforeUsage = usage.completedBeforeUsage && new Set(usage.completedBeforeUsage);
  const pending = recent.filter(row => row.state === 'reserved' || (completedBeforeUsage && !completedBeforeUsage.has(row.id))).length;
  if (recent.length + 1 > POLICY.total || recent.filter(row => row.mode === entry.mode).length + 1 > POLICY[entry.mode]) fail('tavily_budget_project_limit');
  if (usage.planUsage + pending + 1 > Math.min(1000, usage.planLimit) - POLICY.accountHeadroom
    || usage.keyUsage + pending + 1 > usage.keyLimit) fail('tavily_budget_account_limit');
  const result = { ...ledger, entries: [...ledger.entries, entry] };
  validateLedger(result, now);
  return result;
}

async function boundedJson(fetchImpl, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); return { status: response.status }; }
    const reader = response.body.getReader();
    const chunks = []; let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) { await reader.cancel(); fail('tavily_budget_response_too_large'); }
      chunks.push(Buffer.from(value));
    }
    return { status: response.status, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch { fail('tavily_budget_transport_unknown'); } finally { clearTimeout(timer); }
}

export function createGithubLedger({ token, fetchImpl = fetch }) {
  if (!token) fail('tavily_budget_credentials_missing');
  const base = `https://api.github.com/repos/${BUDGET_REPOSITORY}`;
  const api = (path, method = 'GET', body) => boundedJson(fetchImpl, `${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return {
    async read() {
      const ref = await api(`/git/ref/heads/${BUDGET_BRANCH}`);
      if (ref.status === 404) fail('tavily_budget_uninitialized');
      if (ref.status !== 200 || !sha(ref.json?.object?.sha)) fail('tavily_budget_store_unavailable');
      const head = ref.json.object.sha;
      const file = await api(`/contents/usage.json?ref=${head}`);
      if (file.status !== 200 || file.json?.encoding !== 'base64' || typeof file.json.content !== 'string') fail('tavily_budget_invalid_ledger');
      try { return { head, ledger: JSON.parse(Buffer.from(file.json.content, 'base64').toString('utf8')) }; }
      catch { fail('tavily_budget_invalid_ledger'); }
    },
    async write(previous, ledger) {
      // Do not use PUT contents: the explicit parent plus non-force ref update is
      // a compare-and-swap. Concurrent siblings cannot both become the branch head.
      const tree = await api('/git/trees', 'POST', { tree: [{ path: 'usage.json', mode: '100644', type: 'blob', content: JSON.stringify(ledger) }] });
      if (tree.status !== 201 || !sha(tree.json?.sha)) fail('tavily_budget_store_unavailable');
      const commit = await api('/git/commits', 'POST', { message: 'Record bounded Tavily usage', tree: tree.json.sha, parents: previous.head ? [previous.head] : [] });
      if (commit.status !== 201 || !sha(commit.json?.sha)) fail('tavily_budget_store_unavailable');
      const update = previous.head
        ? await api(`/git/refs/heads/${BUDGET_BRANCH}`, 'PATCH', { sha: commit.json.sha, force: false })
        : await api('/git/refs', 'POST', { ref: `refs/heads/${BUDGET_BRANCH}`, sha: commit.json.sha });
      if ([409, 422].includes(update.status)) return false;
      if (![200, 201].includes(update.status) || update.json?.object?.sha !== commit.json.sha) fail('tavily_budget_write_uncertain');
      return true;
    },
    async initialize() {
      // Explicit operator operation, never implicit on a search request. Missing
      // state after initialization cannot reset the rolling counter to zero.
      const ref = await api(`/git/ref/heads/${BUDGET_BRANCH}`);
      if (ref.status !== 404) fail('tavily_budget_initialization_refused');
      return this.write({ head: null }, emptyLedger());
    }
  };
}

export async function readTavilyUsage(key, fetchImpl = fetch) {
  if (!key) fail('tavily_budget_key_missing');
  const response = await boundedJson(fetchImpl, 'https://api.tavily.com/usage', { headers: { Authorization: `Bearer ${key}` } });
  if (response.status !== 200) fail('tavily_budget_usage_unavailable');
  validateUsage(response.json);
  return response.json;
}

// Deployment/status probe only. It performs GETs, never reserves or searches;
// admission below remains advisory until the real request atomically reserves.
export async function verifyBudgetStatus({ store, keys, readUsage = readTavilyUsage, now = Date.now }) {
  if (!keys.length) fail('tavily_budget_key_missing');
  const { head, ledger } = await store.read();
  const summary = summarizeLedger(ledger, now());
  const meters = [];
  for (const key of [...new Set(keys)]) {
    const usage = validateUsage(await readUsage(key));
    const keyId = createHash('sha256').update(key).digest('hex').slice(0, 16);
    const admission = {};
    for (const mode of ['automated', 'manual']) {
      try {
        reserveCredit(ledger, { id: randomUUID(), time: new Date(now()).toISOString(), consumer: 'oil-news',
          mode, runId: 'local', keyId, credits: 1, state: 'reserved', accountUsageBefore: usage.planUsage, reportedCredits: null }, usage, now());
        admission[mode] = 'eligible_snapshot_only';
      } catch (error) {
        if (!['tavily_budget_project_limit', 'tavily_budget_account_limit'].includes(error.budgetCode)) throw error;
        admission[mode] = error.budgetCode;
      }
    }
    meters.push({ keyId, ...usage, admission });
  }
  return { operation: 'read_only_verification', searches: 0, writes: 0, head, policy: POLICY, ...summary, meters };
}

export function createTavilyBudget({ store, readUsage, now = Date.now, id = randomUUID, report = () => {} }) {
  let stopped = false;
  return async ({ key, payload, consumer, mode = 'manual', runId = 'local' }, request) => {
    if (stopped) fail('tavily_budget_session_stopped');
    if (!key || !CONSUMERS.includes(consumer) || !['automated', 'manual'].includes(mode)
      || !/^(local|[0-9]+)$/u.test(runId) || payload?.search_depth !== 'basic' || payload.auto_parameters === true) fail('tavily_budget_invalid_request');
    let entry;
    try {
      const baseline = await store.read();
      validateLedger(baseline.ledger, now());
      const usage = validateUsage(await readUsage(key));
      usage.completedBeforeUsage = baseline.ledger.entries.filter(row => row.state !== 'reserved').map(row => row.id);
      entry = { id: id(), time: new Date(now()).toISOString(), consumer, mode, runId,
        keyId: createHash('sha256').update(key).digest('hex').slice(0, 16), credits: 1, state: 'reserved',
        accountUsageBefore: usage.planUsage, reportedCredits: null };
      let admitted = false;
      // Only CAS conflicts retry metadata. Network ambiguity never retries; the
      // provider callback is invoked at most once and only after confirmed reserve.
      for (let n = 0; n < 3 && !admitted; n++) {
        const previous = await store.read();
        const next = reserveCredit(previous.ledger, entry, usage, now());
        admitted = await store.write(previous, next);
      }
      if (!admitted) fail('tavily_budget_contention');
    } catch (error) { stopped = true; report({ consumer, status: error.budgetCode || 'tavily_budget_unknown' }); throw error; }
    let result, failure;
    try { result = await request(); } catch (error) { failure = error; }
    const reported = result?.usage?.credits;
    try {
      let saved = false;
      for (let n = 0; n < 3 && !saved; n++) {
        const previous = await store.read();
        validateLedger(previous.ledger, now());
        const row = previous.ledger.entries.find(item => item.id === entry.id);
        if (!row || row.state !== 'reserved') fail('tavily_budget_receipt_mismatch');
        const next = structuredClone(previous.ledger);
        Object.assign(next.entries.find(item => item.id === entry.id), { state: failure ? 'failed' : 'success', reportedCredits: count(reported) ? reported : null });
        saved = await store.write(previous, next);
      }
      if (!saved) fail('tavily_budget_receipt_pending');
    } catch { stopped = true; report({ consumer, status: 'tavily_budget_receipt_pending', reservationId: entry.id }); }
    report({ consumer, status: failure ? 'failed' : 'success', reservationId: entry.id, reservedCredits: 1, reportedCredits: count(reported) ? reported : null });
    if (count(reported) && reported > 1) { stopped = true; fail('tavily_budget_cost_contract_changed'); }
    if (failure) throw failure;
    return result;
  };
}

let runtime;
export async function withTavilyBudget({ key, payload, consumer }, request) {
  const env = process.env;
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY !== BUDGET_REPOSITORY) fail('tavily_budget_wrong_repository');
  if (!runtime) runtime = createTavilyBudget({
    store: createGithubLedger({ token: env.TAVILY_BUDGET_GITHUB_TOKEN }),
    readUsage: readTavilyUsage,
    report: row => {
      console.log(`Tavily budget: ${JSON.stringify(row)}`);
      if (env.GITHUB_STEP_SUMMARY) {
        try { appendFileSync(env.GITHUB_STEP_SUMMARY, `\n- Tavily budget: ${JSON.stringify(row)}\n`); } catch { /* Durable ledger is the authority; summary is best effort. */ }
      }
    }
  });
  const automated = env.GITHUB_ACTIONS === 'true' && ['schedule', 'workflow_run'].includes(env.GITHUB_EVENT_NAME);
  return runtime({ key, payload, consumer, mode: automated ? 'automated' : 'manual', runId: env.GITHUB_ACTIONS === 'true' ? env.GITHUB_RUN_ID : 'local' }, request);
}
