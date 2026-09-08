import { EPOCH_ARTIFACT_POLICY as p, artifactHash, artifactId, artifactTime, validateEpochArtifactMetadata, validateEpochArrArtifact } from './epoch-arr-artifact.mjs';
import { readEpochArtifactZip } from './epoch-arr-artifact-zip.mjs';

const API = `https://api.github.com/repos/${p.repository}`;
class Failure extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new Failure(code); };
export function epochArtifactReadPlan({ runId, artifactId: selectedId }) {
  if (!artifactId(runId) || !artifactId(selectedId)) fail('artifact_selection_invalid');
  return { status: 'dry_run_no_network', repository: p.repository, workflowId: p.workflowId,
    runId, artifactId: selectedId, maxRequests: 5, timeoutMs: p.timeoutMs,
    productionEligible: false, baselineUpdated: false, automaticSelection: false };
}

// No token is ever forwarded to the signed blob redirect. These are only the
// known Actions artifact storage hosts; a new host requires reviewed support.
function blobTarget(location) {
  let target;
  try { target = new URL(location); } catch { fail('artifact_redirect_invalid'); }
  if (target.protocol !== 'https:' || target.port || target.username || target.password || target.hash
    || !/^productionresultssa\d+\.blob\.core\.windows\.net$/u.test(target.hostname)) fail('artifact_redirect_invalid');
  return target.href;
}

export async function retrieveEpochArrArtifact({ runId, artifactId: selectedId, allowNetwork = false,
  token = '', now = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'), timeoutMs = p.timeoutMs, fetchImpl = globalThis.fetch } = {}) {
  const plan = epochArtifactReadPlan({ runId, artifactId: selectedId });
  if (allowNetwork !== true) return plan;
  if (typeof token !== 'string' || (token && !/^[\x21-\x7e]{1,512}$/u.test(token))
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > p.timeoutMs) fail('artifact_options_invalid');
  artifactTime(now);
  const controller = new AbortController(), readers = new Set(); let calls = 0, timer;
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'GFRR-Epoch-artifact-review' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Failure('artifact_timeout')); }, timeoutMs); });
  const active = () => { if (controller.signal.aborted) fail('artifact_timeout'); };
  async function request(url, { blob = false, redirectOnly = false } = {}) {
    active(); calls += 1;
    if (calls > 5) fail('artifact_request_limit');
    const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
      headers: blob ? { Accept: 'application/zip' } : headers, signal: controller.signal });
    active();
    if (response.redirected || response.url !== url) fail('artifact_response_target_invalid');
    if ([404, 410].includes(response.status)) fail('artifact_unavailable');
    if (response.status !== (redirectOnly ? 302 : 200)) fail('artifact_http_status');
    if (redirectOnly) {
      if (response.body) void response.body.cancel().catch(() => {});
      return blobTarget(response.headers.get('location'));
    }
    const limit = blob ? p.zipBytes : p.metadataBytes;
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/u.test(length) || Number(length) > limit)) fail('artifact_byte_limit');
    if (!blob && !/^application\/(?:json|vnd\.github\+json)(?:\s*;.*)?$/iu.test(response.headers.get('content-type') || '')) fail('artifact_content_type_invalid');
    if (!response.body) fail('artifact_body_missing');
    const reader = response.body.getReader(); readers.add(reader); const chunks = []; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); active();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) fail('artifact_chunk_invalid');
        size += chunk.value.byteLength;
        if (size > limit) fail('artifact_byte_limit');
        chunks.push(Buffer.from(chunk.value));
      }
    } finally { readers.delete(reader); void reader.cancel().catch(() => {}); }
    const bytes = Buffer.concat(chunks);
    if (blob) return bytes;
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { fail('artifact_metadata_invalid'); }
  }
  const work = async () => {
    const run = await request(`${API}/actions/runs/${runId}`);
    const artifact = await request(`${API}/actions/artifacts/${selectedId}`);
    let producer;
    try { producer = validateEpochArtifactMetadata(run, artifact, { runId, artifactId: selectedId, now }); }
    catch { fail('artifact_metadata_invalid'); }
    // Branch labels alone do not prove reachability from the current main.
    const ancestry = await request(`${API}/compare/${producer.headSha}...main?per_page=1`);
    if (!['ahead', 'identical'].includes(ancestry.status) || ancestry.merge_base_commit?.sha !== producer.headSha
      || ancestry.base_commit?.sha !== producer.headSha) fail('artifact_main_ancestry_invalid');
    const location = await request(`${API}/actions/artifacts/${selectedId}/zip`, { redirectOnly: true });
    const bytes = await request(location, { blob: true });
    if (bytes.length !== artifact.size_in_bytes || `sha256:${artifactHash(bytes)}` !== artifact.digest) fail('artifact_digest_mismatch');
    const snapshot = validateEpochArrArtifact(readEpochArtifactZip(bytes), producer);
    active();
    return { status: 'historical_candidate_ready', snapshot, receipt: { repository: p.repository, workflowId: p.workflowId,
      runId, artifactId: selectedId, headSha: producer.headSha, zipSha256: artifactHash(bytes), provenance: 'github_api_bound' },
    networkCalls: calls, productionEligible: false, baselineUpdated: false, observationDatesRefreshed: false };
  };
  try { return await Promise.race([work(), deadline]); }
  catch (error) {
    if (error instanceof Failure) throw error;
    if (['artifact_invalid', 'artifact_zip_invalid', 'snapshot_invalid'].includes(error?.message)) fail(error.message);
    fail(controller.signal.aborted ? 'artifact_timeout' : 'artifact_request_failed');
  } finally {
    clearTimeout(timer); controller.abort();
    // Never await cleanup from an upstream reader that ignores cancellation.
    for (const reader of readers) void reader.cancel().catch(() => {});
  }
}

export function epochArtifactDiagnostic(error) {
  return error instanceof Failure ? error.code : 'artifact_invalid';
}
