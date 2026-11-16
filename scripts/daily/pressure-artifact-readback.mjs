// Inactive same-job readback boundary. No CLI, collector, token minting or upload.
// Only native upload-artifact step IDs/digests may feed this API. Local JSON is
// never evidence of remote persistence. Job/runner fields prevent accidental
// transfer, not same-privilege environment forgery or hostile in-process JS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const REPOSITORY = 'ctmaomao/gfrr-auto-update-site';
const REPOSITORY_ID = 1214037901;
const WORKFLOW_ID = 355507532;
const WORKFLOW_PATH = '.github/workflows/pressure-model-shadow.yml';
export const PRESSURE_PERSISTENCE_IDENTITY = Object.freeze({
  repository: REPOSITORY, repositoryId: REPOSITORY_ID, workflowId: WORKFLOW_ID, workflowPath: WORKFLOW_PATH
});
const COHORT = 'pressure-shadow-29d69c0ecb7b98a0';
const OLD_COMMIT = '5f4fb4c1ea4c870af0dd36b6c3e0683a79f026f6';
const OLD_IMPLEMENTATION = 'd3723b145c0eab8538938d3d95bdf033c68dd8ee7e68e85630b354c6d5e8001b';
export const PRESSURE_PERSISTENCE_MANIFEST_FIELDS = Object.freeze([
  'schemaVersion', 'repositoryId', 'runId', 'attempt', 'workflowId', 'workflowPath', 'headSha', 'checkoutSha',
  'runnerName', 'jobName', 'legacyArtifactId', 'legacyCommit', 'legacyImplementation', 'protocolHash', 'targetImplementation',
  'retrievedAt', 'evaluationDate', 'legacyRecordHash', 'startedAt', 'finishedAt', 'cacheSha256',
  'legacyReportSha256', 'legacyLedgerSha256'
]);
// Current 50-record derived bundle is ~118 KiB zipped / 2 MiB expanded.
// Fixed headroom covers bounded 84/90-record research without ratio heuristics.
const MAX_ZIP = 8 * 1024 * 1024;
const MAX_OUTPUT = 24 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;
const hold = reason => { throw new Error(`pressure_artifact_hold:${reason}`); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const positiveId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
async function command(program, args, options) {
  try { return (await execute(program, args, options)).stdout; }
  catch { hold('readback_command_failed'); } // Never expose stderr, signed URLs or credentials.
}

// Python stdlib only; no extraction, shell or new packages. Names/size are checked
// before decompression; bounded reads also enforce actual decompressed length.
const ZIP_READER = String.raw`import base64,json,stat,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    expected=json.loads(sys.argv[2]); entries=z.infolist()
    if len(entries)!=len(expected) or sorted(i.filename for i in entries)!=sorted(expected): raise ValueError('members')
    if sum(i.file_size for i in entries)>16*1024*1024: raise ValueError('total')
    result={}
    for i in entries:
        mode=(i.external_attr>>16)&0xffff
        if i.is_dir() or i.flag_bits&1 or i.file_size>8*1024*1024 or stat.S_ISLNK(mode): raise ValueError('entry')
        if i.filename=='retrieval-receipt.json' and i.file_size>65536: raise ValueError('manifest_size')
        with z.open(i) as f: data=f.read(8*1024*1024+1)
        if len(data)!=i.file_size or len(data)>8*1024*1024: raise ValueError('size')
        data.decode('utf-8',errors='strict')
        result[i.filename]=base64.b64encode(data).decode('ascii')
    print(json.dumps(result))`;

function checkArtifact(metadata, { id, digest, name, runId, headSha, attemptStart, now }) {
  const run = metadata?.workflow_run;
  if (metadata?.id !== Number(id) || metadata.name !== name || metadata.expired !== false
    || metadata.digest !== `sha256:${digest}` || !Number.isSafeInteger(metadata.size_in_bytes)
    || metadata.size_in_bytes <= 0 || metadata.size_in_bytes > MAX_ZIP
    || run?.id !== Number(runId) || run.repository_id !== REPOSITORY_ID
    || run.head_repository_id !== REPOSITORY_ID || run.head_branch !== 'main' || run.head_sha !== headSha
    || !timestamp(metadata.created_at) || Date.parse(metadata.created_at) < Math.floor(attemptStart / 1000) * 1000
    || Date.parse(metadata.created_at) > now) hold('artifact_identity');
}

// Authenticates remote provenance only. Caller MUST still replay the actual
// ledger, validateSharedCycle and runner-local cache before minting any receipt.
export async function readPersistedPressureArtifacts({ legacyArtifactId, legacyArtifactDigest,
  manifestArtifactId, manifestArtifactDigest, targetImplementation }) {
  const env = process.env, runId = env.GITHUB_RUN_ID, attempt = env.GITHUB_RUN_ATTEMPT;
  const headSha = env.GITHUB_SHA;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== REPOSITORY
    || env.GITHUB_REPOSITORY_ID !== String(REPOSITORY_ID) || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_JOB !== 'research' || typeof env.RUNNER_NAME !== 'string' || !/^.{1,256}$/u.test(env.RUNNER_NAME)
    || env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`
    || !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
    || !positiveId(runId) || !positiveId(attempt) || !/^[a-f0-9]{40}$/.test(headSha ?? '')
    || !positiveId(legacyArtifactId) || !positiveId(manifestArtifactId) || legacyArtifactId === manifestArtifactId
    || !SHA.test(legacyArtifactDigest ?? '') || !SHA.test(manifestArtifactDigest ?? '')
    || !SHA.test(targetImplementation ?? '') || targetImplementation === OLD_IMPLEMENTATION) hold('execution_identity');
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) hold('missing_read_token');
  const local = { cwd: process.cwd(), env: { PATH: env.PATH }, timeout: 30000, maxBuffer: MAX_OUTPUT };
  const checkout = String(await command('git', ['rev-parse', 'HEAD'], local)).trim();
  if (checkout !== headSha) hold('checkout_identity');
  const api = async suffix => command('gh', ['api', '--hostname', 'github.com', `repos/${REPOSITORY}/${suffix}`],
    { ...local, env: { PATH: env.PATH, GH_TOKEN: token, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1' }, encoding: 'buffer', maxBuffer: MAX_ZIP });
  const json = async suffix => {
    try { return JSON.parse(String(await api(suffix))); } catch { hold('api_json'); }
  };
  const currentRun = await json(`actions/runs/${runId}/attempts/${attempt}`);
  if (currentRun?.id !== Number(runId) || currentRun.run_attempt !== Number(attempt)
    || currentRun.workflow_id !== WORKFLOW_ID || currentRun.path !== WORKFLOW_PATH
    || currentRun.repository?.id !== REPOSITORY_ID || currentRun.head_repository?.id !== REPOSITORY_ID
    || currentRun.head_branch !== 'main' || currentRun.head_sha !== headSha
    || currentRun.event !== env.GITHUB_EVENT_NAME || currentRun.status !== 'in_progress'
    || !timestamp(currentRun.run_started_at)) hold('run_identity');
  const now = Date.now(), attemptStart = Date.parse(currentRun.run_started_at);
  if (attemptStart > now) hold('attempt_clock');
  const legacyMetadata = await json(`actions/artifacts/${legacyArtifactId}`);
  const manifestMetadata = await json(`actions/artifacts/${manifestArtifactId}`);
  checkArtifact(legacyMetadata, { id: legacyArtifactId, digest: legacyArtifactDigest, name: COHORT, runId, headSha, attemptStart, now });
  checkArtifact(manifestMetadata, { id: manifestArtifactId, digest: manifestArtifactDigest,
    name: `pressure-shared-${runId}-${attempt}`, runId, headSha, attemptStart, now });
  if (Date.parse(manifestMetadata.created_at) < Date.parse(legacyMetadata.created_at)) hold('persistence_order');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-artifact-readback-'));
  try {
    const readArchive = async (id, metadata, digest, names) => {
      const bytes = await api(`actions/artifacts/${id}/zip`);
      if (!Buffer.isBuffer(bytes) || bytes.length !== metadata.size_in_bytes || bytes.length > MAX_ZIP || hash(bytes) !== digest) hold('archive_digest');
      const file = path.join(temporary, `${id}.zip`);
      fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
      let parsed;
      try { parsed = JSON.parse(String(await command('python3', ['-I', '-c', ZIP_READER, file, JSON.stringify(names)], local))); }
      catch { hold('archive_members'); }
      if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify([...names].sort())) hold('archive_members');
      return Object.fromEntries(names.map(name => [name, Buffer.from(parsed[name], 'base64')]));
    };
    const legacy = await readArchive(legacyArtifactId, legacyMetadata, legacyArtifactDigest, ['report.json', 'shadow-ledger.json']);
    const shared = await readArchive(manifestArtifactId, manifestMetadata, manifestArtifactDigest, ['retrieval-receipt.json']);
    let manifest;
    try { manifest = JSON.parse(shared['retrieval-receipt.json'].toString('utf8')); } catch { hold('manifest_json'); }
    if (!manifest || JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...PRESSURE_PERSISTENCE_MANIFEST_FIELDS].sort())
      || manifest.schemaVersion !== 'pressure-shared-persistence-v1' || manifest.repositoryId !== REPOSITORY_ID
      || manifest.runId !== runId || manifest.attempt !== attempt || manifest.workflowId !== WORKFLOW_ID
      || manifest.runnerName !== env.RUNNER_NAME || manifest.jobName !== env.GITHUB_JOB
      || manifest.workflowPath !== WORKFLOW_PATH || manifest.headSha !== headSha || manifest.checkoutSha !== checkout
      || manifest.legacyArtifactId !== legacyArtifactId || manifest.legacyCommit !== OLD_COMMIT
      || manifest.legacyImplementation !== OLD_IMPLEMENTATION || manifest.targetImplementation !== targetImplementation
      || !SHA.test(manifest.protocolHash ?? '') || !SHA.test(manifest.cacheSha256 ?? '')
      || !SHA.test(manifest.legacyRecordHash ?? '') || manifest.legacyReportSha256 !== hash(legacy['report.json'])
      || manifest.legacyLedgerSha256 !== hash(legacy['shadow-ledger.json'])) hold('manifest_binding');
    const finished = Date.parse(manifest.finishedAt), started = Date.parse(manifest.startedAt), retrieved = Date.parse(manifest.retrievedAt);
    const checked = Date.now();
    if (![manifest.startedAt, manifest.finishedAt, manifest.retrievedAt].every(timestamp)
      || started < attemptStart || finished < started || retrieved < started || retrieved > finished
      || checked < finished || checked - started > 15 * 60000
      || manifest.evaluationDate !== new Date(checked).toISOString().slice(0, 10)
      || [manifest.startedAt, manifest.finishedAt, manifest.retrievedAt].some(t => t.slice(0, 10) !== manifest.evaluationDate)
      // GitHub created_at has seconds precision; compare at that precision.
      || Date.parse(legacyMetadata.created_at) < Math.floor(finished / 1000) * 1000) hold('manifest_clock');
    return { manifest, reportBytes: legacy['report.json'], ledgerBytes: legacy['shadow-ledger.json'],
      legacyArtifactId, manifestArtifactId };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
