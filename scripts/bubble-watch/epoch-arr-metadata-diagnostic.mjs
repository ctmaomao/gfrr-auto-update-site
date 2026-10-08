import { EPOCH_ARTIFACT_POLICY as p, artifactId, artifactTime, epochArtifactName } from './epoch-arr-artifact.mjs';
import { validateEpochWeeklyRunIdentity } from './epoch-arr-weekly-history.mjs';

// First failed cross-cycle run; immutable incident scope, no caller URL/run override.
export const EPOCH_METADATA_INCIDENT = Object.freeze({ runId: 35591049191,
  headSha: '7fe5f73dbf90ab08d093271c7ad6010ab4cd92ca', createdAt: '2026-09-21T10:52:32Z' });
const API = `https://api.github.com/repos/${p.repository}`;

// A completed-run inspection is separate from the live scheduler's in-progress
// identity gate. It never impersonates schedule, authenticates a ZIP or reads CSV.
export async function diagnoseEpochMetadata({ allowNetwork = false, token = '',
  fetchImpl = globalThis.fetch, timeoutMs = p.timeoutMs,
  now = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z') } = {}) {
  const result = { status: 'dry_run_no_network', incidentRunId: EPOCH_METADATA_INCIDENT.runId,
    networkCalls: 0, stage: 'plan', httpStatus: null, historicalFailureReproduced: false,
    artifactDigestVerified: false, productionEligible: false, baselineUpdated: false, observationDatesRefreshed: false };
  if (!allowNetwork) return result;
  if (allowNetwork !== true || typeof token !== 'string' || (token && !/^[\x21-\x7e]{1,512}$/u.test(token))
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > p.timeoutMs) throw new Error('metadata_options_invalid');
  const inspectionTime = artifactTime(now);
  const controller = new AbortController(), readers = new Set();
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'GFRR-Epoch-metadata-diagnostic' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let timer;
  const fail = () => { throw new Error('metadata_invalid'); };
  const active = () => { if (controller.signal.aborted) fail(); };
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('metadata_timeout')); }, timeoutMs); });
  async function request(route, stage) {
    active(); result.stage = stage; result.httpStatus = null;
    if (++result.networkCalls > 3) fail();
    const url = `${API}${route}`;
    const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', headers, signal: controller.signal });
    active();
    result.httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
    if (response.status !== 200 || response.redirected || response.url !== url || !response.body
      || !/^application\/(?:json|vnd\.github\+json)(?:\s*;.*)?$/iu.test(response.headers.get('content-type') || '')) fail();
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
  async function work() {
    const incident = EPOCH_METADATA_INCIDENT;
    const run = await request(`/actions/runs/${incident.runId}`, 'incident_request');
    result.stage = 'incident_identity'; validateEpochWeeklyRunIdentity(run);
    if (run.id !== incident.runId || run.head_sha !== incident.headSha || run.created_at !== incident.createdAt) fail();
    const time = artifactTime(run.created_at), until = run.created_at.slice(0, 10);
    const since = new Date(time - p.retentionDays * 86400000).toISOString().slice(0, 10);
    const listing = await request(`/actions/workflows/${p.workflowId}/runs?branch=main&event=schedule&status=success&created=${since}..${until}&exclude_pull_requests=true&per_page=100`, 'history_request');
    result.stage = 'history_completeness';
    if (!Array.isArray(listing.workflow_runs) || !Number.isSafeInteger(listing.total_count) || listing.total_count < 0
      || listing.total_count > 100 || listing.workflow_runs.length !== listing.total_count) fail();
    const seen = new Set(); result.stage = 'history_identity';
    for (const item of listing.workflow_runs) {
      validateEpochWeeklyRunIdentity(item);
      if (seen.has(item.id)) fail(); seen.add(item.id);
      // Today the incident is completed and therefore appears in success lists.
      // Exclude only its exact authenticated identity, without fabricating status.
      if (item.id === run.id) {
        if (item.head_sha !== run.head_sha || item.created_at !== run.created_at) fail();
      } else if (artifactTime(item.created_at) >= time) fail();
    }
    const previous = listing.workflow_runs.filter(item => item.id !== run.id)
      .sort((a, b) => artifactTime(b.created_at) - artifactTime(a.created_at) || b.id - a.id)[0];
    if (!previous) return { ...result, status: 'metadata_inspected', historyStatus: 'history_missing' };
    result.previousRunId = previous.id;
    if (time - artifactTime(previous.created_at) > p.retentionDays * 86400000)
      return { ...result, status: 'metadata_inspected', historyStatus: 'history_expired_at_incident' };
    const artifacts = await request(`/actions/runs/${previous.id}/artifacts?per_page=100`, 'artifacts_request');
    result.stage = 'artifacts_completeness';
    if (!Array.isArray(artifacts.artifacts) || !Number.isSafeInteger(artifacts.total_count) || artifacts.total_count < 0
      || artifacts.total_count > 100 || artifacts.artifacts.length !== artifacts.total_count) fail();
    const matches = artifacts.artifacts.filter(item => typeof item.name === 'string' && item.name.startsWith('epoch-arr-candidate-v1-'));
    if (!matches.length) return { ...result, status: 'metadata_inspected', historyStatus: 'artifact_missing_now' };
    result.stage = 'artifact_identity'; if (matches.length !== 1) fail();
    const artifact = matches[0], identity = artifact.workflow_run;
    if (!artifactId(artifact.id) || artifact.name !== epochArtifactName(previous.id) || identity?.id !== previous.id
      || identity.repository_id !== p.repositoryId || identity.head_repository_id !== p.repositoryId
      || identity.head_branch !== 'main' || identity.head_sha !== previous.head_sha || typeof artifact.expired !== 'boolean') fail();
    result.stage = 'artifact_time';
    const created = artifactTime(artifact.created_at), expires = artifactTime(artifact.expires_at);
    if (created < artifactTime(previous.created_at) || created >= time || expires <= created) fail();
    return { ...result, status: 'metadata_inspected', artifactId: artifact.id,
      historyStatus: artifact.expired || expires <= inspectionTime ? 'artifact_expired_now' : 'artifact_metadata_valid_now',
      artifactExpiredAtIncident: expires <= time, artifactDigestVerified: false };
  }
  try { return await Promise.race([work(), deadline]); }
  catch { return { ...result, status: 'diagnostic_failed', code: controller.signal.aborted ? 'metadata_timeout' : 'metadata_invalid' }; }
  finally { clearTimeout(timer); controller.abort(); for (const reader of readers) void reader.cancel().catch(() => {}); }
}
