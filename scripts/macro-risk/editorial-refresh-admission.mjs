import { createHash } from 'node:crypto';

export const REPOSITORY = 'ctmaomao/gfrr-auto-update-site';
export const UPSTREAMS = [
  ['Build Daily Radar Data', 'build-daily-radar-data.yml'],
  ['Refresh World Order Stress', 'refresh-world-order-stress.yml'],
  ['Refresh Oil Directional Pressure', 'refresh-oil-directional-pressure.yml'],
];
const MAX_AGE_MS = 30 * 3600000;
const PREFIX = 'tags/macro-editorial-budget/v1/';
const hold = (reason) => ({ ready: false, reason });

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  return Date.parse(value);
}

export function trustedUpstream(run) {
  return UPSTREAMS.some(([name, file]) => run?.name === name && run?.path === `.github/workflows/${file}`)
    && run?.repository?.full_name === REPOSITORY && run?.head_repository?.full_name === REPOSITORY
    && run?.head_branch === 'main' && run?.event === 'schedule' && run?.run_attempt === 1
    && run?.status === 'completed' && run?.conclusion === 'success' && Number.isSafeInteger(run?.id);
}

export function planAdmission({ eventName, event, runAttempt, repository, ref, radar, world, oil, now }) {
  if (repository !== REPOSITORY || ref !== 'refs/heads/main') return hold('untrusted_context');
  if (String(runAttempt) !== '1') return hold('rerun_requires_new_review');
  if (eventName === 'workflow_run') {
    if (event?.action !== 'completed' || !trustedUpstream(event?.workflow_run)) return hold('ineligible_upstream_event');
  } else if (eventName === 'workflow_dispatch') {
    if (![true, 'true'].includes(event?.inputs?.allow_network) || ![true, 'true'].includes(event?.inputs?.acknowledge_cost)) return hold('manual_authorization_missing');
  } else return hold('ineligible_event');
  const at = Date.parse(now);
  const dates = [radar?.updatedAt, world?.updatedAt, oil?.builtAt].map(timestamp);
  if (!Number.isFinite(at) || dates.some((date) => !Number.isFinite(date) || date > at || at - date > MAX_AGE_MS)) return hold('snapshot_not_fresh');
  // Never transplant yesterday's editorial onto a new Daily timestamp.
  if (radar?.macroRiskEditorialLayer?.sourceDataUpdatedAt === radar.updatedAt) return hold('input_already_has_editorial');
  if (eventName === 'workflow_run' && (dates[1] < dates[0] || dates[2] < dates[0])) return hold('waiting_for_upstream_snapshots');
  const sourceDataUpdatedAt = new Date(dates[0]).toISOString();
  const inputKey = createHash('sha256').update(sourceDataUpdatedAt).digest('hex');
  return { ready: true, reason: 'candidate', sourceDataUpdatedAt, refs: [`${PREFIX}day-${now.slice(0, 10)}`, `${PREFIX}input-${inputKey}`] };
}

// Only GitHub metadata is read. No provider key, artifact body or untrusted code.
export function githubClient({ token, fetchImpl = fetch }) {
  if (!token) throw new Error('github_token_missing');
  let requests = 0;
  return async (path, method = 'GET', body) => {
    if (++requests > 10 || !/^\/(?:actions\/|git\/)/.test(path) || path.includes('..') || /[\r\n?#]/.test(path.split('?')[0])) throw new Error('github_request_out_of_bounds');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${REPOSITORY}${path}`, {
        method, redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body || []) {
        bytes += chunk.length;
        if (bytes > 1048576) { controller.abort(); throw new Error('github_response_too_large'); }
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      return { status: response.status, data: text ? JSON.parse(text) : null };
    } catch {
      // Never include transport messages, headers, response bodies or tokens.
      throw new Error('github_metadata_request_failed');
    } finally { clearTimeout(timer); }
  };
}

export async function admitRefresh({ plan, eventName, event, now, snapshots, headSha, api, reserve = false }) {
  if (!plan.ready) return plan;
  if (!/^[a-f0-9]{40}$/.test(headSha)) throw new Error('invalid_checkout_sha');
  if (eventName === 'workflow_run') {
    const trigger = await api(`/actions/runs/${event.workflow_run.id}`);
    if (trigger.status !== 200 || !trustedUpstream(trigger.data) || trigger.data.id !== event.workflow_run.id) throw new Error('upstream_identity_unverified');
    for (let index = 0; index < UPSTREAMS.length; index++) {
      const [name, file] = UPSTREAMS[index];
      const result = await api(`/actions/workflows/${file}/runs?branch=main&event=schedule&per_page=1`);
      if (result.status !== 200 || !Array.isArray(result.data?.workflow_runs)) throw new Error('upstream_status_unavailable');
      const latest = result.data.workflow_runs[0];
      if (!trustedUpstream(latest) || latest.name !== name) return hold('waiting_for_successful_upstreams');
      const created = timestamp(latest.created_at);
      const ended = timestamp(latest.updated_at);
      const current = Date.parse(now);
      if (!Number.isFinite(created) || !Number.isFinite(ended) || created > ended || ended > current || current - created > MAX_AGE_MS || timestamp(snapshots[index]) < created) return hold('upstream_snapshot_not_current');
      if (latest.name === trigger.data.name && latest.id !== trigger.data.id) return hold('superseded_upstream_event');
    }
  }
  // Two independent ceilings: one attempt per UTC day AND per Daily input.
  // Read before reserving to avoid burning a day on an already-claimed input.
  for (const ref of plan.refs) {
    const result = await api(`/git/ref/${ref}`);
    if (result.status === 200) return hold('budget_already_reserved');
    if (result.status !== 404) throw new Error('budget_state_unknown');
  }
  if (!reserve) return { ...plan, ready: false, reason: 'dry_run_would_reserve' };
  for (const ref of plan.refs) {
    const result = await api('/git/refs', 'POST', { ref: `refs/${ref}`, sha: headSha });
    // Only a confirmed new ref admits work. A collision, timeout, uncertain
    // response or partial reservation never admits a call and is never undone.
    if (result.status !== 201 || result.data?.ref !== `refs/${ref}` || result.data?.object?.sha !== headSha) throw new Error('budget_reservation_not_confirmed');
  }
  return { ...plan, reason: 'budget_reserved' };
}
