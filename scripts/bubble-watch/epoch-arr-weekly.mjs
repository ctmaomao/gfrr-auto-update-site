import { EPOCH_ARTIFACT_POLICY as p, packEpochArrArtifact, artifactId } from './epoch-arr-artifact.mjs';
import { discoverEpochWeeklyHistory } from './epoch-arr-weekly-history.mjs';
import { retrieveEpochArrArtifact, epochArtifactDiagnostic } from './epoch-arr-artifact-reader.mjs';
import { readEpochArrCandidate, epochReaderDiagnostic } from './epoch-arr-reader.mjs';
import { compareEpochArrSnapshots } from './epoch-arr-snapshot.mjs';

const fail = code => { throw new Error(code); };
export function epochWeeklyContext(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== p.repository || env.GITHUB_REPOSITORY_ID !== String(p.repositoryId)
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'schedule' || env.GITHUB_RUN_ATTEMPT !== '1'
    || env.GITHUB_WORKFLOW_REF !== `${p.repository}/${p.workflowPath}@refs/heads/main`
    || !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID || '') || !artifactId(Number(env.GITHUB_RUN_ID))
    || typeof env.GITHUB_SHA !== 'string' || !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA)) fail('weekly_context_invalid');
  return { runId: Number(env.GITHUB_RUN_ID), headSha: env.GITHUB_SHA };
}

// Three separately bounded phases, max 9 GETs / 45s network deadline budgets.
// Fetch injection is test-only. The CLI has no context/URL/provider overrides.
export async function collectEpochWeeklyCandidate({ allowNetwork = false, env = process.env,
  now = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'), timeoutMs = p.timeoutMs, fetchImpl = globalThis.fetch } = {}) {
  if (allowNetwork !== true) return { status: 'dry_run_no_network', maxRequests: 9, productionEligible: false, baselineUpdated: false };
  const context = epochWeeklyContext(env), token = env.GITHUB_TOKEN || '';
  const history = await discoverEpochWeeklyHistory({ ...context, token, now, timeoutMs, fetchImpl, allowNetwork: true });
  let previous = null, receipt = null, calls = history.networkCalls;
  if (history.selection) {
    try {
      const retrieved = await retrieveEpochArrArtifact({ ...history.selection, token, now, timeoutMs, fetchImpl, allowNetwork: true });
      previous = retrieved.snapshot; receipt = retrieved.receipt; calls += retrieved.networkCalls;
    } catch (error) { fail(`weekly_${epochArtifactDiagnostic(error)}`); }
  }
  let current;
  try { current = await readEpochArrCandidate({ allowNetwork: true, asOfDate: now.slice(0, 10), timeoutMs, fetchImpl }); }
  catch (error) { fail(`weekly_source_${epochReaderDiagnostic(error).code}`); }
  let comparison;
  try { comparison = compareEpochArrSnapshots(previous, current.snapshot); }
  catch { fail('weekly_comparison_invalid'); }
  const artifact = packEpochArrArtifact(current.snapshot, history.producer);
  const changeCounts = {};
  for (const change of comparison.changes) changeCounts[change.kind] = (changeCounts[change.kind] || 0) + 1;
  return { status: 'candidate_artifact_ready', artifact, summary: {
    historyStatus: previous ? 'historical_candidate_ready' : history.historyStatus,
    historicalReceipt: receipt, comparisonStatus: comparison.status,
    currentFileHash: current.snapshot.fileHash, previousFileHash: comparison.previousFileHash,
    totalRows: current.snapshot.totalRows, targetRows: current.snapshot.rows.length, changeCounts,
    fieldGroupsChanged: [...new Set(comparison.changes.flatMap(change => change.fieldsChanged))].sort(),
    networkCalls: calls + current.networkCalls, productionEligible: false, baselineUpdated: false,
    observationDatesRefreshed: false, sourceAuthenticity: 'unverified',
    attribution: 'Epoch AI — Data on AI Companies; CC BY 4.0; filtered hash-only derivative, no endorsement',
    sourcePage: 'https://epoch.ai/data/ai-companies', license: 'https://creativecommons.org/licenses/by/4.0/'
  } };
}
