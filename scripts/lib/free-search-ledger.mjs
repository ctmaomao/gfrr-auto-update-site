import { createHash } from 'node:crypto';

// Account state lives outside deployment branches and is shared by every checkout.
export const SEARCH_REPOSITORY = 'ctmaomao/gfrr-auto-update-site';
export const SEARCH_CLOCK_POLICY = Object.freeze({ maxSkewMs: 30000, httpDatePrecisionMs: 1000 });
const BRANCHES = new Set(['tavily-meter-ledger', 'brave-usage-ledger']);
export const keyFingerprint = key => createHash('sha256').update(key).digest('hex').slice(0, 16);
export const isCount = value => Number.isSafeInteger(value) && value >= 0;
export const isTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function budgetFailure(code) { throw Object.assign(new Error(code), { budgetCode: code }); }

export function createSearchLedger({ branch, token, fetchImpl = fetch, initialLedger, prefix, now = Date.now }) {
  const fail = suffix => budgetFailure(`${prefix}_${suffix}`);
  if (!BRANCHES.has(branch)) fail('invalid_branch');
  if (!token) fail('credentials_missing');
  const base = `https://api.github.com/repos/${SEARCH_REPOSITORY}`;
  const verifiedClock = value => {
    if (!Number.isFinite(value)) fail('clock_unknown');
    const local = now();
    if (!Number.isFinite(local) || Math.abs(local - value) > SEARCH_CLOCK_POLICY.maxSkewMs) fail('clock_skew');
    return value;
  };
  const sha = value => /^[a-f0-9]{40}$/u.test(value || '');
  async function api(path, method = 'GET', body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(`${base}${path}`, {
        method, redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', 'Cache-Control': 'no-cache' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const dateHeader = response.headers.get('date');
      const serverTime = verifiedClock(dateHeader ? Date.parse(dateHeader) : NaN);
      if (!response.ok) { await response.body?.cancel(); return { status: response.status, serverTime: verifiedClock(serverTime) }; }
      const reader = response.body.getReader();
      const chunks = []; let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 2 * 1024 * 1024) { await reader.cancel(); fail('response_too_large'); }
        chunks.push(Buffer.from(value));
      }
      return { status: response.status, serverTime: verifiedClock(serverTime), json: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    } catch (error) { if (error?.budgetCode) throw error; fail('transport_unknown'); } finally { clearTimeout(timer); }
  }
  return {
    async read() {
      const ref = await api(`/git/ref/heads/${branch}`);
      if (ref.status === 404) fail('uninitialized');
      if (ref.status !== 200 || !sha(ref.json?.object?.sha)) fail('store_unavailable');
      const head = ref.json.object.sha;
      const file = await api(`/contents/usage.json?ref=${head}`);
      if (file.status !== 200 || file.json?.encoding !== 'base64' || typeof file.json.content !== 'string') fail('invalid_ledger');
      try { return { head, serverTime: Math.max(ref.serverTime, file.serverTime), ledger: JSON.parse(Buffer.from(file.json.content, 'base64').toString('utf8')) }; }
      catch { fail('invalid_ledger'); }
    },
    async write(previous, ledger) {
      if (Buffer.byteLength(JSON.stringify(ledger)) > 1024 * 1024) fail('ledger_full');
      const tree = await api('/git/trees', 'POST', { tree: [{ path: 'usage.json', mode: '100644', type: 'blob', content: JSON.stringify(ledger) }] });
      if (tree.status !== 201 || !sha(tree.json?.sha)) fail('store_unavailable');
      const commit = await api('/git/commits', 'POST', { message: `Record ${branch} accounting`, tree: tree.json.sha, parents: previous.head ? [previous.head] : [] });
      if (commit.status !== 201 || !sha(commit.json?.sha)) fail('store_unavailable');
      const update = previous.head
        ? await api(`/git/refs/heads/${branch}`, 'PATCH', { sha: commit.json.sha, force: false })
        : await api('/git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: commit.json.sha });
      if ([409, 422].includes(update.status)) return false;
      if (![200, 201].includes(update.status) || update.json?.object?.sha !== commit.json.sha) fail('write_uncertain');
      return true;
    },
    async initialize() {
      if (typeof initialLedger !== 'function') fail('initialization_refused');
      const ref = await api(`/git/ref/heads/${branch}`);
      if (ref.status !== 404) fail('initialization_refused');
      return this.write({ head: null }, initialLedger(ref.serverTime));
    }
  };
}
