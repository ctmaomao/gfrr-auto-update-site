import { EPOCH_ARTIFACT_POLICY as p, artifactId, artifactTime, epochArtifactName } from './epoch-arr-artifact.mjs';

const API = `https://api.github.com/repos/${p.repository}`;
const fail = () => { throw new Error('weekly_history_invalid'); };
function runIdentity(run, current = false) {
  if (!run || !artifactId(run.id) || run.workflow_id !== p.workflowId || run.path !== p.workflowPath
    || run.repository?.id !== p.repositoryId || run.repository?.full_name !== p.repository
    || run.head_repository?.id !== p.repositoryId || run.head_repository?.full_name !== p.repository
    || run.head_branch !== 'main' || run.event !== 'schedule' || run.run_attempt !== 1
    || typeof run.head_sha !== 'string' || !/^[a-f0-9]{40}$/u.test(run.head_sha)
    || (current ? run.status !== 'in_progress' : run.status !== 'completed' || run.conclusion !== 'success')) fail();
  artifactTime(run.created_at);
}

// Fixed API routes only. Three metadata reads share one deadline and byte cap;
// no pagination, retries, arbitrary URLs, or signed storage targets here.
export async function discoverEpochWeeklyHistory({ allowNetwork = false, runId, headSha, token = '', now, timeoutMs = p.timeoutMs, fetchImpl = globalThis.fetch } = {}) {
  if (allowNetwork !== true) throw new Error('weekly_network_not_authorized');
  if (!artifactId(runId) || typeof headSha !== 'string' || !/^[a-f0-9]{40}$/u.test(headSha)
    || typeof token !== 'string' || (token && !/^[\x21-\x7e]{1,512}$/u.test(token))
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > p.timeoutMs) fail();
  const time = artifactTime(now), controller = new AbortController(), readers = new Set();
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'GFRR-Epoch-weekly-candidate' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let calls = 0, timer;
  const active = () => { if (controller.signal.aborted) fail(); };
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('weekly_history_timeout')); }, timeoutMs); });
  async function request(route) {
    active(); if (++calls > 3) fail();
    const url = `${API}${route}`;
    const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', headers, signal: controller.signal });
    active();
    if (response.status !== 200 || response.redirected || response.url !== url
      || !/^application\/(?:json|vnd\.github\+json)(?:\s*;.*)?$/iu.test(response.headers.get('content-type') || '') || !response.body) fail();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/u.test(length) || Number(length) > p.metadataBytes)) fail();
    const reader = response.body.getReader(), chunks = []; let size = 0; readers.add(reader);
    try {
      while (true) {
        const chunk = await reader.read(); active(); if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) fail();
        size += chunk.value.byteLength; if (size > p.metadataBytes) fail(); chunks.push(Buffer.from(chunk.value));
      }
    } finally { readers.delete(reader); void reader.cancel().catch(() => {}); }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  }
  const work = async () => {
    const run = await request(`/actions/runs/${runId}`); runIdentity(run, true);
    if (run.id !== runId || run.head_sha !== headSha || artifactTime(run.created_at) > time
      || time - artifactTime(run.created_at) > p.retentionDays * 86400000) fail();
    const producer = { runId, runAttempt: 1, headSha, createdAt: run.created_at };
    const since = new Date(time - p.retentionDays * 86400000).toISOString().slice(0, 10);
    const listing = await request(`/actions/workflows/${p.workflowId}/runs?branch=main&event=schedule&status=success&created=${since}..${now.slice(0, 10)}&exclude_pull_requests=true&per_page=100`);
    const result = (historyStatus, selection = null) => ({ producer, historyStatus, selection, networkCalls: calls });
    if (!Array.isArray(listing.workflow_runs) || !Number.isSafeInteger(listing.total_count)
      || listing.total_count < 0 || listing.workflow_runs.length !== listing.total_count || listing.total_count > 100) fail();
    const seen = new Set();
    for (const item of listing.workflow_runs) {
      if (!artifactId(item.id) || seen.has(item.id) || artifactTime(item.created_at) >= artifactTime(run.created_at)) fail();
      seen.add(item.id);
    }
    // Stable explicit selection; never trust API order or silently try older
    // runs after the selected run/artifact fails identity or integrity checks.
    const previous = [...listing.workflow_runs].sort((a, b) => artifactTime(b.created_at) - artifactTime(a.created_at) || b.id - a.id)[0];
    if (!previous) return result('history_missing');
    runIdentity(previous);
    if (time - artifactTime(previous.created_at) > p.retentionDays * 86400000) return result('history_expired');
    const artifacts = await request(`/actions/runs/${previous.id}/artifacts?per_page=100`);
    if (!Array.isArray(artifacts.artifacts) || !Number.isSafeInteger(artifacts.total_count) || artifacts.total_count < 0
      || artifacts.total_count > 100 || artifacts.artifacts.length !== artifacts.total_count) fail();
    const matching = artifacts.artifacts.filter(item => typeof item.name === 'string' && item.name.startsWith('epoch-arr-candidate-v1-'));
    if (!matching.length) return result('artifact_missing');
    if (matching.length !== 1) fail();
    const artifact = matching[0], identity = artifact.workflow_run;
    if (!artifactId(artifact.id) || artifact.name !== epochArtifactName(previous.id) || identity?.id !== previous.id
      || identity.repository_id !== p.repositoryId || identity.head_repository_id !== p.repositoryId
      || identity.head_branch !== 'main' || identity.head_sha !== previous.head_sha || typeof artifact.expired !== 'boolean') fail();
    const expires = artifactTime(artifact.expires_at), created = artifactTime(artifact.created_at);
    if (created < artifactTime(previous.created_at) || created >= artifactTime(run.created_at) || expires <= created) fail();
    if (artifact.expired || expires <= time) return result('history_expired');
    return result('selected_pending_validation', { runId: previous.id, artifactId: artifact.id });
  };
  try { return await Promise.race([work(), deadline]); }
  catch { throw new Error(controller.signal.aborted ? 'weekly_history_timeout' : 'weekly_history_invalid'); }
  finally { clearTimeout(timer); controller.abort(); for (const reader of readers) void reader.cancel().catch(() => {}); }
}
