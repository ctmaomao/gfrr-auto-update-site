import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createBraveLedger } from './lib/brave-budget.mjs';
import { SEARCH_REPOSITORY } from './lib/free-search-ledger.mjs';
import { CANARY, runBraveCanary, requestDiscardedCanary } from './lib/brave-manual-canary.mjs';

// Fixed entry point: no CLI command, query, path, branch or code input.
try {
  if (process.argv.length !== 2 || process.env.NODE_OPTIONS || process.env.NODE_PATH) throw new Error();
  const env = process.env;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== SEARCH_REPOSITORY || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.RUNNER_DEBUG === '1') throw new Error();
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  if (Object.keys(event.inputs || {}).join(',') !== 'operation' || !['preview', 'single-test'].includes(event.inputs.operation)) throw new Error();
  if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim() !== env.GITHUB_SHA) throw new Error();
  const api = async path => {
    const response = await fetch(`https://api.github.com/repos/${SEARCH_REPOSITORY}${path}`, {
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    const text = await response.text(); if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error();
    return { json: JSON.parse(text), serverTime: Date.parse(response.headers.get('date') || '') };
  };
  const main = (await api('/git/ref/heads/main')).json;
  const base = await api(`/contents/usage.json?ref=${CANARY.baseHead}`);
  if (base.json.encoding !== 'base64' || typeof base.json.content !== 'string') throw new Error();
  const baseSnapshot = { head: CANARY.baseHead, serverTime: base.serverTime,
    ledger: JSON.parse(Buffer.from(base.json.content, 'base64').toString('utf8')) };
  if (!['preview', 'single-test'].includes(env.GITHUB_JOB)
    || (env.GITHUB_JOB === 'single-test' && event.inputs.operation !== 'single-test')) throw new Error();
  const operation = env.GITHUB_JOB;
  const rawStore = createBraveLedger({ token: env.GITHUB_TOKEN });
  const store = operation === 'preview' ? { read: () => rawStore.read(), write: () => { throw new Error(); } } : rawStore;
  const status = await runBraveCanary({ originalProof: env.BRAVE_BUDGET_PRIVATE_PROOF, chain: env.BRAVE_BUDGET_RENEWAL_CHAIN,
    keys: [env.BRAVE_API_KEYS, env.BRAVE_API_KEY], context: { actions: env.GITHUB_ACTIONS, repository: env.GITHUB_REPOSITORY,
      ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME, sha: env.GITHUB_SHA, workflowSha: env.GITHUB_WORKFLOW_SHA,
      liveMainSha: main.object?.sha, workflowRef: env.GITHUB_WORKFLOW_REF, runId: env.GITHUB_RUN_ID, job: env.GITHUB_JOB, operation },
    baseSnapshot, store, request: requestDiscardedCanary });
  console.log(status === 'PREVIEW_READY' ? 'BRAVE_CANARY_PREVIEW_READY' : 'BRAVE_CANARY_SINGLE_TEST_FINISHED');
} catch {
  // Never print exception text, response, private input, key or derived values.
  console.error('BRAVE_CANARY_REFUSED_OR_UNCERTAIN'); process.exitCode = 1;
}
