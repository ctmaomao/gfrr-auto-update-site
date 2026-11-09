import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(path, 'utf8');
const workflow = read('.github/workflows/refresh-bubble-watch-free.yml');
const builder = read('scripts/build-bubble-watch.mjs');

test('dedicated full refresh is manual/main-only and hard-disables paid providers', () => {
  assert.match(workflow, /^name: Refresh Bubble Watch Free\n/u);
  assert.match(workflow, /on:\n  workflow_dispatch:\n\n/u);
  assert.ok(workflow.includes("if: ${{ github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch' }}"));
  assert.match(workflow, /BUBBLE_WATCH_DISABLE_WIND: '1'/u);
  assert.doesNotMatch(workflow, /WIND_API_KEY|DEEPSEEK|schedule:|workflow_run:|--refresh-qualified|--publish-qualified|allow_paid|continue-on-error/u);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z_]+)/gu)].map(match => match[1]).sort(),
    ['BRAVE_API_KEYS', 'BUBBLE_WATCH_EDGAR_CONTACT', 'FRED_API_KEY', 'TAVILY_API_KEYS']);
  assert.match(workflow, /TAVILY_BUDGET_GITHUB_TOKEN: \$\{\{ github.token \}\}/u);
  assert.equal((workflow.match(/run: npm run build:bubble-watch\n/gu) || []).length, 1);
  assert.doesNotMatch(builder, /api\.deepseek\.com|requestWeeklyEditorial\(|requestEditorial\(/u);
});

test('ordinary schedule/default and candidate collection remain separate', () => {
  const original = read('.github/workflows/refresh-bubble-watch.yml');
  assert.match(original, /workflow_dispatch:\n  schedule:/u);
  assert.match(original, /cron: '30 5 \* \* 1'/u);
  assert.match(original, /WIND_API_KEY: \$\{\{ secrets.WIND_API_KEY \}\}/u);
  assert.doesNotMatch(original, /BUBBLE_WATCH_DISABLE_WIND|free_only/u);
  assert.match(original, /github.event_name == 'schedule' && github.run_attempt == 1/u);
  assert.doesNotMatch(workflow, /epoch-candidate|run-epoch-arr-weekly-candidate/u);
});

test('shared writer, exact output set and full gates precede publication', () => {
  for (const marker of ['group: gfrr-main-writer-main', 'cancel-in-progress: false', 'queue: max',
    'ref: main', 'fetch-depth: 0', 'git pull --ff-only origin main', 'node-version: 24',
    'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
    'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
    'git add data/bubble-watch.json data/bubble-watch-history.json data/gdelt-bubble-watch-cache.json config/bubble-watch-curated.json',
    'git commit -m "chore: refresh bubble watch"']) assert.ok(workflow.includes(marker), marker);
  const build = workflow.indexOf('run: npm run build:bubble-watch');
  const commit = workflow.indexOf('git commit');
  for (const command of ['npm run check:bubble-watch', 'npm run check:gdelt-cache-health', 'npm run check:all']) {
    const index = workflow.indexOf(command);
    assert.ok(index > build && index < commit, command);
  }
  assert.ok(workflow.indexOf('git push') > commit);
  assert.match(workflow, /git pull --rebase origin "\$\{GITHUB_REF_NAME\}"/u);
  assert.match(workflow, /data\.meta\.wind_key_present !== false \|\| data\.meta\.paid_wind_fallback_count !== 0 \|\| data\.meta\.qualified_refresh/u);
  assert.match(workflow, /data\.meta\.fetch_failures\.length/u);
  assert.match(workflow, /item\.as_of.*item\.stale.*item\.provenance\.mode/u);
});

test('new completion publishes through existing guards without triggering editorial providers', () => {
  const pages = read('.github/workflows/deploy-static-site-to-pages.yml');
  const triggers = pages.slice(pages.indexOf('  workflow_run:'), pages.indexOf('  push:'));
  assert.match(triggers, /      - Refresh Bubble Watch Free\n/u);
  for (const file of ['bubble-watch-weekly-editorial-refresh', 'macro-risk-editorial-refresh', 'bubble-watch-editorial-followup']) {
    const source = read(`.github/workflows/${file}.yml`);
    assert.doesNotMatch(source, /Refresh Bubble Watch Free/u);
    assert.doesNotMatch(source, /^  push:/mu);
  }
  const dispatch = 'run: gh workflow run publish-edgeone-release.yml --repo "$GITHUB_REPOSITORY" --ref main';
  assert.ok(workflow.includes(dispatch));
  assert.ok(read('.github/workflows/refresh-bubble-qualified-evidence.yml').includes(dispatch));
  assert.ok(workflow.indexOf(dispatch) > workflow.indexOf('git push'));
  assert.doesNotMatch(workflow, /run: gh workflow run (?!publish-edgeone-release\.yml)/u);
});

function functionSource(name, next) {
  const start = builder.indexOf(`function ${name}(`);
  const end = builder.indexOf(`\n${next}`, start);
  assert.ok(start >= 0 && end > start);
  return builder.slice(start, end);
}

test('Wind disable wins before environment key and local config access', () => {
  let reads = 0;
  const env = { BUBBLE_WATCH_DISABLE_WIND: '1' };
  Object.defineProperty(env, 'WIND_API_KEY', { get() { reads++; throw new Error('secret read forbidden'); } });
  const context = vm.createContext({ process: { env }, fs: new Proxy({}, { get() { reads++; throw new Error('file read forbidden'); } }),
    os: { homedir() { reads++; throw new Error('home read forbidden'); } } });
  vm.runInContext(functionSource('readWindApiKey', 'function readSecretList') + '\nglobalThis.result = readWindApiKey();', context);
  assert.equal(context.result, '');
  assert.equal(reads, 0);
});

test('all three Wind MCP services reject before any request when disabled', async () => {
  let calls = 0;
  const context = vm.createContext({ WIND_API_KEY: '', WIND_MCP_TIMEOUT_MS: 60000, fetch: async () => { calls++; } });
  vm.runInContext('async ' + functionSource('windMcpRequest', 'async function windMcpCall') + '\nglobalThis.request = windMcpRequest;', context);
  for (const service of ['analytics_data', 'economic_data', 'financial_docs']) {
    await assert.rejects(context.request(service, 'tools/call', {}), /WIND_API_KEY/u);
  }
  assert.equal(calls, 0);
});

test('CEO search retains both durable free-only budget gates and test stays in aggregate', () => {
  assert.match(builder, /async function tavilySearch\(payload, \{ budget = withTavilyBudget/u);
  assert.match(builder, /budget\(\{ key, payload, consumer: 'bubble-ceo' \}/u);
  assert.match(builder, /async function braveNewsSearch\(params, \{ budget = withBraveBudget/u);
  assert.match(builder, /budget\(\{ key, consumer: 'bubble-ceo' \}/u);
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.ok(scripts['check:workflows'].includes('tests/unit/bubble-free-refresh-workflow.test.mjs'));
  assert.ok(scripts['check:all'].includes('npm run check:workflows'));
});
