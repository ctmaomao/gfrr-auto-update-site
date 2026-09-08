import { createHash } from 'node:crypto';
import { validateEpochArrSnapshot } from './epoch-arr-snapshot.mjs';

// Repository/workflow identities verified from GitHub, not supplied by a bundle.
export const EPOCH_ARTIFACT_POLICY = Object.freeze({
  repository: 'ctmaomao/gfrr-auto-update-site', repositoryId: 1214037901,
  workflowId: 293558804, workflowPath: '.github/workflows/refresh-bubble-watch.yml',
  fileName: 'epoch-arr-snapshot.json', retentionDays: 30, bytes: 2 * 1024 * 1024,
  zipBytes: 3 * 1024 * 1024, metadataBytes: 1024 * 1024, timeoutMs: 15000
});
export const artifactHash = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw new Error('artifact_invalid'); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
export const artifactId = value => Number.isSafeInteger(value) && value > 0;
export function artifactTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value) fail();
  return Date.parse(value);
}
function producer(input) {
  if (!exact(input, ['runId', 'runAttempt', 'headSha', 'createdAt']) || !artifactId(input.runId)
    // Until rerun artifact ownership is independently designed, reject reruns.
    || input.runAttempt !== 1 || typeof input.headSha !== 'string' || !/^[a-f0-9]{40}$/u.test(input.headSha)) fail();
  artifactTime(input.createdAt);
  return { runId: input.runId, runAttempt: 1, headSha: input.headSha, createdAt: input.createdAt };
}
export const epochArtifactName = runId => {
  if (!artifactId(runId)) fail();
  return `epoch-arr-candidate-v1-${runId}-1`;
};
export function canonicalEpochSnapshot(input) {
  const snapshot = validateEpochArrSnapshot(input);
  snapshot.rows.sort((a, b) => a.rowHash.localeCompare(b.rowHash));
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
  return Buffer.from(`${JSON.stringify(sort(snapshot))}\n`);
}

// A portable, hash-only payload for a future reviewed upload-artifact step.
// Self-described producer metadata is NOT authenticated until fetched via API.
export function packEpochArrArtifact(snapshotInput, producerInput) {
  const snapshot = validateEpochArrSnapshot(snapshotInput), context = producer(producerInput);
  const bundle = { schemaVersion: 'epoch-arr-artifact-v1', repository: EPOCH_ARTIFACT_POLICY.repository,
    repositoryId: EPOCH_ARTIFACT_POLICY.repositoryId, workflowId: EPOCH_ARTIFACT_POLICY.workflowId,
    workflowPath: EPOCH_ARTIFACT_POLICY.workflowPath, producer: context,
    snapshotSha256: artifactHash(canonicalEpochSnapshot(snapshot)), snapshot };
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  if (bytes.length > EPOCH_ARTIFACT_POLICY.bytes) fail();
  return { artifactName: epochArtifactName(context.runId), fileName: EPOCH_ARTIFACT_POLICY.fileName,
    retentionDays: EPOCH_ARTIFACT_POLICY.retentionDays, payload: bytes.toString('utf8'),
    productionEligible: false, baselineUpdated: false, provenance: 'self_described_unverified' };
}

export function validateEpochArrArtifact(bytes, expectedProducer) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > EPOCH_ARTIFACT_POLICY.bytes) fail();
  let bundle;
  try { bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(); }
  if (!exact(bundle, ['schemaVersion', 'repository', 'repositoryId', 'workflowId', 'workflowPath', 'producer', 'snapshotSha256', 'snapshot'])
    || bundle.schemaVersion !== 'epoch-arr-artifact-v1'
    || ['repository', 'repositoryId', 'workflowId', 'workflowPath'].some(key => bundle[key] !== EPOCH_ARTIFACT_POLICY[key])) fail();
  const actual = producer(bundle.producer), expected = producer(expectedProducer);
  if (Object.keys(expected).some(key => expected[key] !== actual[key])) fail();
  const snapshot = validateEpochArrSnapshot(bundle.snapshot);
  if (bundle.snapshotSha256 !== artifactHash(canonicalEpochSnapshot(snapshot))) fail();
  return snapshot;
}

// Inputs must be responses from the fixed authenticated API adapter; calling
// this pure validator on a fabricated JSON fixture does not establish provenance.
export function validateEpochArtifactMetadata(run, artifact, { runId, artifactId: selectedId, now }) {
  const p = EPOCH_ARTIFACT_POLICY, clock = artifactTime(now);
  if (!artifactId(runId) || !artifactId(selectedId) || run?.id !== runId
    || run.workflow_id !== p.workflowId || run.path !== p.workflowPath || run.head_branch !== 'main'
    || run.repository?.id !== p.repositoryId || run.repository?.full_name !== p.repository
    || run.head_repository?.id !== p.repositoryId || run.head_repository?.full_name !== p.repository
    || !['schedule', 'workflow_dispatch'].includes(run.event) || run.run_attempt !== 1
    || run.status !== 'completed' || run.conclusion !== 'success') fail();
  const context = producer({ runId, runAttempt: run.run_attempt, headSha: run.head_sha, createdAt: run.created_at });
  const created = artifactTime(run.created_at), uploaded = artifactTime(artifact?.created_at), expires = artifactTime(artifact?.expires_at);
  if (created > clock || clock - created > p.retentionDays * 86400000 || uploaded < created || uploaded > clock
    || expires <= clock || expires <= uploaded || artifact.expired !== false || artifact.id !== selectedId
    || artifact.name !== epochArtifactName(runId) || !artifactId(artifact.size_in_bytes) || artifact.size_in_bytes > p.zipBytes
    || typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest)
    || artifact.workflow_run?.id !== runId || artifact.workflow_run?.repository_id !== p.repositoryId
    || artifact.workflow_run?.head_repository_id !== p.repositoryId || artifact.workflow_run?.head_branch !== 'main'
    || artifact.workflow_run?.head_sha !== context.headSha) fail();
  return context;
}
