import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createBraveLedger } from './lib/brave-budget.mjs';
import { CANARY } from './lib/brave-manual-canary.mjs';
import { OIL_DISCOVERY, runBraveOilDiscovery } from './lib/brave-oil-news-one-shot.mjs';
import { prepareBravePrivateRenewal } from './lib/brave-private-proof.mjs';
import { SEARCH_REPOSITORY } from './lib/free-search-ledger.mjs';

// Fixed entry point. No shell interpolation, operator-supplied query, scope
// or destination, package install, environment writes, or artifact creation.
const require = condition => { if (!condition) throw new Error(); };
try {
  const env = process.env;
  require(process.argv.length === 2 && !env.NODE_OPTIONS && !env.NODE_PATH && env.RUNNER_DEBUG !== '1');
  require(env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY === SEARCH_REPOSITORY
    && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && Boolean(env.GITHUB_TOKEN));
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')), operation = env.GITHUB_JOB;
  require(Object.keys(event.inputs || {}).join(',') === 'operation' && ['preview', 'single-discovery'].includes(event.inputs.operation)
    && ['preview', 'single-discovery'].includes(operation) && (operation === 'preview' || event.inputs.operation === operation));
  require(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', env: {
    PATH: env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null'
  } }).trim() === env.GITHUB_SHA);
  const priorSupplement = env.BRAVE_BUDGET_RENEWAL_CHAIN;
  require(typeof priorSupplement === 'string' && Buffer.byteLength(priorSupplement) <= 48000);
  const record = JSON.parse(priorSupplement);
  require(Object.keys(record).sort().join(',') === 'approvedDispatchSha,baseHead,freshAccountPlanBindingSha256,freshKeyId,grant,purpose,schemaVersion'
    && record.schemaVersion === 'brave-renewal-chain-v1' && record.purpose === CANARY.purpose && record.baseHead === CANARY.baseHead
    && record.grant?.id === CANARY.grantId && record.grant.keyId === record.freshKeyId
    && record.grant.accountPlanBindingSha256 === record.freshAccountPlanBindingSha256);
  const priorProof = prepareBravePrivateRenewal({ privateProof: env.BRAVE_BUDGET_PRIVATE_PROOF, grant: record.grant });
  const api = async path => {
    const response = await fetch(`https://api.github.com/repos/${SEARCH_REPOSITORY}${path}`, {
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        require(length <= 2 * 1024 * 1024);
        chunks.push(Buffer.from(value));
      }
      return { json: JSON.parse(Buffer.concat(chunks).toString('utf8')), serverTime: Date.parse(response.headers.get('date') || '') };
    } finally { await reader.cancel().catch(() => {}); }
  };
  const main = (await api('/git/ref/heads/main')).json;
  const base = await api(`/contents/usage.json?ref=${OIL_DISCOVERY.baseHead}`);
  require(base.json.encoding === 'base64' && typeof base.json.content === 'string');
  const baseSnapshot = { head: OIL_DISCOVERY.baseHead, serverTime: base.serverTime,
    ledger: JSON.parse(Buffer.from(base.json.content, 'base64').toString('utf8')) };
  const rawStore = createBraveLedger({ token: env.GITHUB_TOKEN });
  const store = operation === 'preview' ? { read: () => rawStore.read() } : rawStore;
  const result = await runBraveOilDiscovery({
    priorProof, authorization: env.BRAVE_BUDGET_OIL_R2,
    keys: [env.BRAVE_API_KEYS, env.BRAVE_API_KEY],
    context: { actions: env.GITHUB_ACTIONS, repository: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF,
      event: env.GITHUB_EVENT_NAME, sha: env.GITHUB_SHA, workflowSha: env.GITHUB_WORKFLOW_SHA, liveMainSha: main.object?.sha,
      workflowRef: env.GITHUB_WORKFLOW_REF, runId: env.GITHUB_RUN_ID, job: operation, operation },
    baseSnapshot, store, fetchImpl: fetch
  });
  if (result.status === 'OFFICIAL_RELEASE_VERIFIED') {
    require(/^https:\/\/www\.eia\.gov\/todayinenergy\/detail\.php\?id=[1-9][0-9]{3,6}$/u.test(result.officialUrl)
      && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(result.releaseDate));
    console.log(`BRAVE_OIL_OFFICIAL_RELEASE_VERIFIED ${result.releaseDate} ${result.officialUrl}`);
  } else {
    require(['PREVIEW_READY', 'NO_MATCHING_OFFICIAL_RELEASE', 'OFFICIAL_VERIFICATION_UNAVAILABLE_NO_REQUEST',
      'NO_RECENT_OFFICIAL_RELEASE_NO_REQUEST'].includes(result.status));
    console.log(`BRAVE_OIL_${result.status}`);
  }
} catch {
  console.error('BRAVE_OIL_DISCOVERY_REFUSED_OR_UNCERTAIN');
  process.exitCode = 1;
}
