import { controlRequest } from './acled-authenticated-probe.mjs';
import { validAcledScheduledSlot } from './acled-auto-cadence.mjs';

const repo = 'ctmaomao/gfrr-auto-update-site';
const api = `https://api.github.com/repos/${repo}`;
const oid = v => typeof v === 'string' && /^[a-f0-9]{40}$/u.test(v);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const validToken = v => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,4096}$/u.test(v);
const headers = token => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'GFRR-ACLED-Automation' });
function json(response) {
  if (!response.ok || response.httpStatus !== 200
    || (response.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') throw new Error();
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.bytes));
}

export function acledWeekSlot(now = new Date()) {
  const d = new Date(now);
  if (!Number.isFinite(d.getTime())) throw new Error('invalid_clock');
  d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

// Permanent, create-only claims. No deletion/update API, pagination or retry.
export async function claimAcledSlot({ slot, expectedHead, token, fetchImpl = fetch } = {}) {
  const report = { status: 'claim_hold', requestCount: 0, mutationAttempted: false, retryAllowed: false };
  try {
    if (!validToken(token) || !oid(expectedHead) || (slot !== 'initial' && !validAcledScheduledSlot(slot))) return report;
    const name = `refs/tags/acled-auto-attempt-v1/${slot}`;
    async function graphql(query, variables) {
      report.requestCount++;
      const value = json(await controlRequest('https://api.github.com/graphql', { method: 'POST',
        headers: headers(token), body: JSON.stringify({ query, variables }) }, fetchImpl, 15000));
      if (value.errors !== undefined || !value.data) throw new Error();
      return value.data;
    }
    const snapshot = await graphql('query($name:String!) { repository(owner:"ctmaomao",name:"gfrr-auto-update-site") { id ref(qualifiedName:"refs/heads/main") { target { oid } } claim:ref(qualifiedName:$name) { id } } }', { name });
    const r = snapshot.repository;
    if (!r || r.ref?.target?.oid !== expectedHead || typeof r.id !== 'string' || !r.id || r.id.length > 256) return report;
    if (r.claim !== null) { report.status = 'slot_unavailable'; return report; }
    report.mutationAttempted = true; report.status = 'claim_unknown';
    const result = await graphql('mutation($input:CreateRefInput!) { createRef(input:$input) { ref { prefix name target { oid } } } }',
      { input: { repositoryId: r.id, name, oid: expectedHead } });
    const ref = result.createRef?.ref;
    if (`${ref?.prefix}${ref?.name}` !== name || ref?.target?.oid !== expectedHead) return report;
    report.status = 'claimed'; report.slot = slot;
    return report;
  } catch { return report; }
}

export function validAcledReceipt(receipt) {
  return receipt && Object.keys(receipt).sort().join('|') === 'acled_config_commit|acled_monthly_sha256|acled_weekly_sha256'
    && oid(receipt.acled_config_commit) && hash(receipt.acled_weekly_sha256) && hash(receipt.acled_monthly_sha256);
}

// One explicit dispatch; API 2026-03-10 returns an exact run ID, not "latest run".
// Failure after sending is unknown. Caller must not retry automatically.
export async function dispatchAcledFollowup({ target, receipt, token, fetchImpl = fetch } = {}) {
  const report = { status: 'dispatch_hold', requestCount: 0, retryAllowed: false };
  if (!validToken(token) || !['refresh', 'edgeone'].includes(target)
    || (target === 'refresh' && !validAcledReceipt(receipt))) return report;
  const workflow = target === 'refresh' ? 'refresh-world-order-stress.yml' : 'publish-edgeone-release.yml';
  try {
    const body = JSON.stringify({ ref: 'main', ...(target === 'refresh' ? { inputs: { ...receipt } } : {}) });
    report.requestCount = 1; report.status = 'dispatch_unknown';
    const value = json(await controlRequest(`${api}/actions/workflows/${workflow}/dispatches`,
      { method: 'POST', headers: headers(token), body }, fetchImpl, 15000));
    const id = value.workflow_run_id;
    if (!Number.isSafeInteger(id) || id <= 0 || value.run_url !== `${api}/actions/runs/${id}`
      || value.html_url !== `https://github.com/${repo}/actions/runs/${id}`) return report;
    report.status = 'dispatch_accepted'; report.runId = id; report.url = value.html_url;
    return report;
  } catch { return report; }
}
