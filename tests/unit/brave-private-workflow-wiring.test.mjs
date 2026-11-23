import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const directory = '.github/workflows/';
const expected = new Map([
  ['macro-risk-editorial-refresh.yml', ['Collect near-7-day macro news', 'collect:macro-risk-editorial-news']],
  ['bubble-watch-weekly-editorial-refresh.yml', ['Collect bounded weekly news context', 'collect:bubble-watch-weekly-news']],
  ['refresh-oil-news-event-watch.yml', ['Refresh oil news event watch', 'build:oil-news-event-watch']],
  ['refresh-bubble-watch.yml', ['Refresh bubble watch data', 'build:bubble-watch']],
  ['refresh-bubble-watch-free.yml', ['Refresh all Bubble evidence using free sources only', 'build:bubble-watch']]
]);
const discoveryWorkflow = 'brave-oil-news-official-discovery.yml';
const injection = '          BRAVE_BUDGET_PRIVATE_PROOF: ${{ secrets.BRAVE_BUDGET_PRIVATE_PROOF }}';
test('private proof is injected only into the five reviewed Brave steps, not jobs, CI or publication', () => {
  const found = [];
  for (const file of readdirSync(directory).filter(name => /\.ya?ml$/u.test(name))) {
    const source = readFileSync(directory + file, 'utf8').replaceAll('\r\n', '\n');
    if (!source.includes('BRAVE_BUDGET_PRIVATE_PROOF')) continue;
    // ADR-0111 explicitly adds only this separately constrained manual canary.
    // Its complete secret inventory is asserted below, not exempted from review.
    // The new fixed official-discovery workflow likewise has its exact
    // scope, command and step-only secret allowlist asserted separately.
    if (file === 'brave-private-canary.yml' || file === discoveryWorkflow) continue;
    found.push(file);
    assert.ok(expected.has(file), `unreviewed proof consumer: ${file}`);
    assert.equal(source.match(/BRAVE_BUDGET_PRIVATE_PROOF/gu).length, 2);
    assert.equal(source.split('\n').filter(line => line === injection).length, 1);
    const [name, command] = expected.get(file);
    const step = source.split(/^      - /mu).find(part => part.startsWith(`name: ${name}\n`));
    assert.ok(step?.includes(injection), file);
    assert.match(step, /^        env:$/mu);
    assert.ok(step.includes(command));
    assert.ok(step.includes('secrets.BRAVE_API_KEYS'));
    assert.ok(!/set -x|printenv|toJSON\(secrets\)|echo.*PRIVATE_PROOF/u.test(step));
    const jobScope = source.slice(0, source.indexOf(`      - name: ${name}\n`));
    assert.ok(jobScope.includes("github.ref == 'refs/heads/main'"));
    assert.match(jobScope, /ref: main\n/u);
  }
  assert.deepEqual(found.sort(), [...expected.keys()].sort());
});
test('private wiring does not authorize extra collection, broaden token permissions or add a new credential consumer', () => {
  for (const file of expected.keys()) {
    const source = readFileSync(directory + file, 'utf8');
    assert.match(source, /contents: write/u, 'reuse the already-required project accounting permission');
    assert.ok(!source.includes('secrets.GITHUB_TOKEN'));
    assert.ok(!/initialize-private|initialize-shared|prepareBravePrivateProof|createBravePublicProjection/u.test(source));
  }
  const audit = readFileSync(directory + 'audit-bubble-watch-sources.yml', 'utf8');
  const diagnostic = readFileSync(directory + 'tavily-budget-status.yml', 'utf8');
  assert.ok(!audit.includes('BRAVE_BUDGET_PRIVATE_PROOF'));
  assert.ok(!diagnostic.includes('BRAVE_BUDGET_PRIVATE_PROOF'));
});

test('only two fixed main manual canary steps receive the private renewal chain and original proof', () => {
  const filename = 'brave-private-canary.yml';
  const source = readFileSync(directory + filename, 'utf8').replaceAll('\r\n', '\n');
  const chainInjection = '          BRAVE_BUDGET_RENEWAL_CHAIN: ${{ secrets.BRAVE_BUDGET_RENEWAL_CHAIN }}';
  const chainFiles = readdirSync(directory).filter(name => /\.ya?ml$/u.test(name)
    && readFileSync(directory + name, 'utf8').includes('BRAVE_BUDGET_RENEWAL_CHAIN'));
  assert.deepEqual(chainFiles.sort(), [discoveryWorkflow, filename].sort());
  assert.equal(source.match(/BRAVE_BUDGET_PRIVATE_PROOF/gu).length, 4);
  assert.equal(source.match(/BRAVE_BUDGET_RENEWAL_CHAIN/gu).length, 4);
  assert.equal(source.split('\n').filter(line => line === injection).length, 2);
  assert.equal(source.split('\n').filter(line => line === chainInjection).length, 2);
  for (const name of ['Private read-only preflight', 'One durable authorized request only']) {
    const step = source.split(/^      - /mu).find(part => part.startsWith(`name: ${name}\n`));
    assert.ok(step?.includes(injection)); assert.ok(step.includes(chainInjection));
    assert.match(step, /^        env:$/mu);
    assert.match(step, /^        run: node scripts\/run-brave-private-canary\.mjs$/mu);
  }
  // Indentation/count above excludes top-level/job-scope injection; exact
  // commands and identities exclude using these secrets in other execution.
  assert.equal((source.match(/^        run:/gmu) || []).length, 2);
  assert.equal((source.match(/github.ref == 'refs\/heads\/main'/gu) || []).length, 2);
  assert.equal((source.match(/ref: \$\{\{ github.sha \}\}/gu) || []).length, 2);
  assert.match(source, /needs: preview/u); assert.match(source, /workflow_dispatch:/u);
  assert.doesNotMatch(source, /schedule:|pull_request:|workflow_run:|workflow_call:|push:|set -x|printenv|toJSON\(secrets\)|upload-artifact|GITHUB_STEP_SUMMARY/u);
  assert.doesNotMatch(source, /TAVILY_BUDGET_GITHUB_TOKEN|DEEPSEEK_|secrets\.GITHUB_TOKEN/u);
});

test('only the two fixed manual R2 steps receive its proof chain, key and private authorization', () => {
  const source = readFileSync(directory + discoveryWorkflow, 'utf8').replaceAll('\r\n', '\n');
  const files = readdirSync(directory).filter(name => /\.ya?ml$/u.test(name)
    && readFileSync(directory + name, 'utf8').includes('BRAVE_BUDGET_OIL_R2'));
  assert.deepEqual(files, [discoveryWorkflow]);
  const env = [
    '          GITHUB_TOKEN: ${{ github.token }}',
    injection,
    '          BRAVE_BUDGET_RENEWAL_CHAIN: ${{ secrets.BRAVE_BUDGET_RENEWAL_CHAIN }}',
    '          BRAVE_BUDGET_OIL_R2: ${{ secrets.BRAVE_BUDGET_OIL_R2 }}',
    '          BRAVE_API_KEYS: ${{ secrets.BRAVE_API_KEYS }}',
    '          BRAVE_API_KEY: ${{ secrets.BRAVE_API_KEY }}'
  ];
  for (const [name, job] of [['Private read-only preflight', 'preview'], ['One durable authorized Oil News discovery request', 'single-discovery']]) {
    const step = source.split(/^      - /mu).find(part => part.startsWith(`name: ${name}\n`));
    assert.ok(step, name);
    assert.deepEqual(step.split(/\n(?= {0,7}\S)/u)[0].trimEnd().split('\n').slice(1), ['        env:', ...env, '        run: node scripts/run-brave-oil-news-official-discovery.mjs']);
    const scope = source.split(/^  (?=preview:|single-discovery:)/mu).find(part => part.startsWith(`${job}:\n`));
    assert.ok(scope.includes("github.ref == 'refs/heads/main'"));
    assert.equal(scope.includes('contents: write'), job === 'single-discovery');
  }
  for (const row of env) assert.equal(source.split('\n').filter(line => line === row).length, 2);
  assert.equal((source.match(/secrets\./gu) ?? []).length, 10);
  assert.equal((source.match(/^        run:/gmu) ?? []).length, 2);
  assert.equal((source.match(/ref: \$\{\{ github\.sha \}\}/gu) ?? []).length, 2);
  assert.match(source, /permissions:\n  contents: read/u);
  assert.match(source, /single-discovery:\n    needs: preview/u);
  assert.doesNotMatch(source, /schedule:|pull_request:|workflow_run:|workflow_call:|push:|set -x|printenv|upload-artifact|GITHUB_STEP_SUMMARY|environment:|npm /u);
});
