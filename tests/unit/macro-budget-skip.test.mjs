import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, POLICY_DIGEST } from '../../scripts/lib/deepseek-budget.mjs';
import { reviewMacroBudgetSkip } from '../../scripts/review-pages-deployment.mjs';
import { buildEditorialDiagnosticReceipt } from '../../scripts/write-editorial-diagnostic-receipt.mjs';

const repository = 'ctmaomao/gfrr-auto-update-site';
const sha = 'a'.repeat(40), token = 'SYNTHETIC_PRIVATE_TOKEN';
const environment = {
  GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: 'workflow_run',
  GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/macro-risk-editorial-refresh.yml@refs/heads/main`,
  DEEPSEEK_BUDGET_SELECTION: 'monthly', DEEPSEEK_BUDGET_CONSUMER: 'macro-editorial',
  DEEPSEEK_BUDGET_GITHUB_TOKEN: token
};
const cli = new URL('../../scripts/review-deepseek-budget.mjs', import.meta.url).href;
function budgetCli({ env = {}, flag = true, transport = '' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-budget-skip-'));
  try {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GITHUB_|DEEPSEEK_|EDITORIAL_|GH_TOKEN$)/u.test(key)));
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      let reads = 0, writes = 0, providers = 0;
      globalThis.fetch = async (url, init) => {
        if (!url.startsWith('https://api.github.com/')) providers++;
        if (init?.method === 'GET') reads++; else writes++;
        ${transport || "throw new Error('SYNTHETIC_PRIVATE_TOKEN');"}
      };
      process.on('exit', () => console.log(JSON.stringify({ reads, writes, providers })));
      process.argv = [process.execPath, ${JSON.stringify(cli)}, '--require-eligible',
        ...${JSON.stringify(flag ? ['--allow-uninitialized-monthly-skip'] : [])}];
      await import(${JSON.stringify(cli)});
    `], { cwd: root, encoding: 'utf8', timeout: 15000, env: { ...clean, ...environment, ...env,
      GITHUB_OUTPUT: path.join(root, 'outputs'), GITHUB_STEP_SUMMARY: path.join(root, 'summary') } });
    const text = name => fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name), 'utf8') : '';
    return { ...result, outputs: text('outputs'), summary: text('summary'), files: fs.readdirSync(root) };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function privateFree(result) {
  assert.equal(result.error, undefined);
  assert.doesNotMatch(result.stdout + result.stderr + result.outputs + result.summary, /SYNTHETIC_PRIVATE_TOKEN/u);
  assert.match(result.stdout, /"writes":0,"providers":0/u);
  assert.deepEqual(result.files.sort(), ['outputs', 'summary']);
}

test('only opted-in automatic Macro monthly dual-empty configuration skips before every request/write', () => {
  for (const env of [{}, { DEEPSEEK_BUDGET_GENESIS_SHA: '', DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256: '' }]) {
    const result = budgetCli({ env }); privateFree(result);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"reads":0/u);
    assert.match(result.outputs, /budget_eligible=false\nbudget_disposition=expected_skip\nbudget_reason=deepseek_budget_uninitialized/u);
    assert.match(result.summary, /expected_skip; reason=deepseek_budget_uninitialized/u);
  }
});

test('manual, one-shot, other consumer/context, absent token, partial or malformed configuration never become skips', () => {
  for (const options of [{ flag: false }, ...[
    { GITHUB_REF: 'refs/heads/other' }, { GITHUB_WORKFLOW_REF: '' }, { GITHUB_ACTIONS: '' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { DEEPSEEK_BUDGET_SELECTION: '' }, { DEEPSEEK_BUDGET_SELECTION: 'editorial-verification-20261111-cny433-v1' },
    { DEEPSEEK_BUDGET_CONSUMER: 'bubble-editorial' }, { DEEPSEEK_BUDGET_GITHUB_TOKEN: '' },
    { DEEPSEEK_BUDGET_GENESIS_SHA: 'malformed' }, { DEEPSEEK_BUDGET_GENESIS_SHA: ' ' },
    { DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256: 'b'.repeat(64) },
    { DEEPSEEK_BUDGET_GENESIS_SHA: sha },
  ].map(env => ({ env }))]) {
    const result = budgetCli(options); privateFree(result);
    assert.equal(result.status, 1, JSON.stringify(options));
    assert.match(result.outputs, /budget_eligible=false\nbudget_disposition=failure/u);
    assert.doesNotMatch(result.outputs + result.summary, /expected_skip/u);
  }
});

test('real CLI keeps API errors, transport errors and bad ledgers red, with zero mutation/provider requests', () => {
  const env = { DEEPSEEK_BUDGET_GENESIS_SHA: sha, DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256: 'b'.repeat(64) };
  for (const transport of [
    "return new Response('{}', { status: 503, headers: { date: new Date().toUTCString() } });",
    "throw new Error('SYNTHETIC_PRIVATE_TOKEN');",
    `const data = url.includes('/git/ref/') ? {object:{sha:'${sha}'}}
      : url.includes('/git/commits/') ? {sha:'${sha}',parents:[]}
      : {encoding:'base64',content:Buffer.from('{"private":"SYNTHETIC_PRIVATE_TOKEN"}').toString('base64')};
      return new Response(JSON.stringify(data), { status:200, headers:{date:new Date().toUTCString()} });`
  ]) {
    const result = budgetCli({ env, transport }); privateFree(result);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.outputs, /budget_disposition=failure/u);
    assert.doesNotMatch(result.outputs + result.summary, /expected_skip/u);
  }
});

test('valid monthly snapshot is eligible; stale review, depleted budget, corrupt ledger and missing remote ledger still fail', () => {
  const now = Date.now(), day = 86400000;
  const review = { policyDigest: POLICY_DIGEST, verifiedAt: new Date(now - 60000).toISOString(),
    expiresAt: new Date(now + day - 60000).toISOString(), evidenceSha256: 'b'.repeat(64) };
  const ledger = { schemaVersion: 'deepseek-budget-v1', bootstrap: {
    cutoverAt: new Date(now - 32 * day).toISOString(), evidenceSha256: 'c'.repeat(64),
    history: 'full-cap-quarantine', currency: 'CNY', historicalDebitMicroCny: 5000000,
    outstandingRequests: 0, ungatedConsumersDisabled: true }, reviews: [review], entries: [] };
  const cases = [
    { ledger, reason: 'eligible_snapshot_only', status: 0 },
    { ledger: { ...ledger, schemaVersion: 'broken' }, reason: 'deepseek_budget_invalid_ledger', status: 1 },
    { ledger: { ...ledger, bootstrap: { ...ledger.bootstrap, cutoverAt: new Date(now - 60000).toISOString() } },
      reason: 'deepseek_budget_project_limit', status: 1 },
    { ledger: { ...ledger, reviews: [{ ...review, verifiedAt: new Date(now - day).toISOString(), expiresAt: new Date(now - 1000).toISOString() }] },
      reason: 'deepseek_budget_price_review_required', status: 1 },
    { ledger, remoteMissing: true, reason: 'deepseek_budget_uninitialized', status: 1 },
  ];
  for (const fixture of cases) {
    const result = budgetCli({ env: { DEEPSEEK_BUDGET_GENESIS_SHA: sha,
      DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256: digest(fixture.ledger.reviews[0]) }, transport: `
      const data = url.includes('/git/ref/') ? {object:{sha:'${sha}'}}
        : url.includes('/git/commits/') ? {sha:'${sha}',parents:[]}
        : {encoding:'base64',content:Buffer.from(${JSON.stringify(JSON.stringify(fixture.ledger))}).toString('base64')};
      return new Response(JSON.stringify(data), { status:${fixture.remoteMissing ? 404 : 200}, headers:{date:new Date().toUTCString()} });
    ` });
    privateFree(result); assert.equal(result.status, fixture.status, result.stdout + result.stderr);
    assert.match(result.outputs, new RegExp(`budget_reason=${fixture.reason}`));
    assert.match(result.outputs, new RegExp(`budget_eligible=${fixture.status === 0}`));
    assert.doesNotMatch(result.outputs, /expected_skip/u);
  }
});

function metadata() {
  const run = { name: 'Macro Risk Editorial Refresh', path: '.github/workflows/macro-risk-editorial-refresh.yml',
    repository: { full_name: repository }, head_repository: { full_name: repository },
    head_branch: 'main', head_sha: sha, event: 'workflow_run', status: 'completed', conclusion: 'success',
    id: 123, workflow_id: 456, run_attempt: 1 };
  const step = (name, conclusion) => ({ name, status: 'completed', conclusion });
  const job = { id: 789, name: 'macro-risk-editorial-refresh', run_id: 123, run_attempt: 1, head_sha: sha, status: 'completed', conclusion: 'success', steps: [
    ...['Checkout repository', 'Sync latest main before refresh', 'Setup Node.js', 'Install dependencies',
      'Preflight editorial contracts', 'Confirm network and cost authorization', 'Check shared CNY budget before discovery', 'Verify uninitialized monthly budget skip stayed side-effect free',
      'Prepare safe editorial diagnostic receipt', 'Upload safe editorial diagnostic receipt'].map(name => step(name, 'success')),
    ...['Verify expected skip stayed side-effect free', 'Admit one refresh for current upstream data', 'Prepare transient artifact directory', 'Collect near-7-day macro news',
      'Build compact editorial evidence pack', 'Run one DeepSeek editorial call', 'Review editorial quality',
      'Project production layer', 'Write production editorial layer', 'Validate final production data',
      'Protected path assertion', 'Commit refreshed macro editorial if changed'].map(name => step(name, 'skipped'))
  ].map((value, index) => ({ ...value, number: index + 1 })) };
  return { event: { action: 'completed', repository: { full_name: repository }, workflow_run: run },
    values: [structuredClone(run), { total_count: 1, jobs: [job] }] };
}
async function publication({ event, values } = metadata(), options = {}) {
  const calls = [];
  const result = await reviewMacroBudgetSkip({ repository, eventName: 'workflow_run', event, token,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      assert.ok(calls.length <= 2);
      return new Response(JSON.stringify(values[calls.length - 1]), { status: 200 });
    }, ...options });
  return { result, calls };
}

test('publication skip requires exact authenticated run/attempt/head and successful no-side-effect step evidence', async () => {
  const { result, calls } = await publication();
  assert.deepEqual(result, { shouldPublish: false, reason: 'macro_monthly_budget_uninitialized_no_publication' });
  assert.deepEqual(calls.map(({ url }) => url), [
    `https://api.github.com/repos/${repository}/actions/runs/123/attempts/1`,
    `https://api.github.com/repos/${repository}/actions/runs/123/attempts/1/jobs?per_page=100`
  ]);
  for (const { init } of calls) {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
  }
});

test('foreign, manual, missing and mismatched upstream identity never suppresses publication', async () => {
  for (const patch of [{ repository: { full_name: 'other/repo' } }, { head_repository: { full_name: 'other/repo' } },
    { path: '.github/workflows/other.yml' }, { head_branch: 'other' }, { head_sha: 'invalid' }, { event: 'workflow_dispatch' },
    { status: 'in_progress' }, { conclusion: 'failure' }, { id: -1 }, { workflow_id: null }, { run_attempt: 0 }]) {
    const data = metadata(); Object.assign(data.event.workflow_run, patch);
    const { result, calls } = await publication(data); assert.equal(result.shouldPublish, true); assert.equal(calls.length, 0);
  }
  for (const patch of [{ id: 999 }, { run_attempt: 2 }, { workflow_id: 777 }, { head_sha: 'b'.repeat(40) }]) {
    const data = metadata(); Object.assign(data.values[0], patch);
    assert.equal((await publication(data)).result.shouldPublish, true);
  }
  for (const options of [{ eventName: 'push' }, { eventName: 'schedule' }, { eventName: 'workflow_dispatch' },
    { event: undefined }, { token: '' }, { repository: 'other/repo' }]) {
    const { result, calls } = await publication(metadata(), options); assert.equal(result.shouldPublish, true); assert.equal(calls.length, 0);
  }
});

test('missing/duplicate/incomplete steps, ordinary skips, true generation/save failure and partial jobs remain publishable by existing rules', async () => {
  const baseline = metadata();
  for (const original of baseline.values[1].jobs[0].steps) {
    for (const conclusion of ['failure', 'cancelled', original.conclusion === 'skipped' ? 'success' : 'skipped']) {
      const data = metadata(); data.values[1].jobs[0].steps.find(step => step.name === original.name).conclusion = conclusion;
      assert.equal((await publication(data)).result.shouldPublish, true, `${original.name}: ${conclusion}`);
    }
  }
  for (const mutate of [
    data => data.values[1].jobs[0].steps.pop(),
    data => data.values[1].jobs[0].steps.push(data.values[1].jobs[0].steps[0]),
    data => { data.values[1].jobs[0].steps[1].number = data.values[1].jobs[0].steps[0].number; },
    data => { delete data.values[1].jobs[0].steps[0].number; },
    data => { data.values[1].jobs[0].id = 0; },
    data => { data.values[1].jobs[0].steps[0].status = 'in_progress'; },
    data => { data.values[1].total_count = 101; },
    data => { data.values[1].jobs[0].run_id = 124; },
    data => { data.values[1].jobs[0].run_attempt = 2; },
    data => { delete data.values[1].jobs[0].run_attempt; },
    data => data.values[1].jobs[0].steps.push({name: 'Unexpected production writer', status: 'completed', conclusion: 'success'}),
    data => { data.values[1].jobs[0].head_sha = 'b'.repeat(40); },
    data => { data.values[1].jobs[0].conclusion = 'failure'; },
    data => { data.values[1].jobs[0].name = 'other-job'; },
  ]) { const data = metadata(); mutate(data); assert.equal((await publication(data)).result.shouldPublish, true); }
});

test('publication inspection failures are bounded, redacted and preserve existing checked deployment', async () => {
  for (const response of [new Response(token, { status: 403 }), new Response(token, { status: 500 }),
    new Response(token), new Response('x'.repeat(65537)), new Response('{}', { headers: { 'content-length': '65537' } })]) {
    const { result } = await publication(metadata(), { fetchImpl: async () => response });
    assert.deepEqual(result, { shouldPublish: true, reason: 'macro_skip_metadata_unavailable' });
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE_TOKEN/u);
  }
  const { result } = await publication(metadata(), { fetchImpl: async () => { throw new Error(token); } });
  assert.equal(result.shouldPublish, true);
});

test('safe receipts preserve budget pause reason but never infer expected skip from unknown/failure or provider activity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-budget-receipt-'));
  try {
    const outcomes = { provider: 'skipped', review: 'skipped', writer: 'skipped', save: 'skipped' };
    const budget = { outcome: 'success', disposition: 'expected_skip', reason: 'deepseek_budget_uninitialized', skipVerification: 'success' };
    const receipt = buildEditorialDiagnosticReceipt({ consumer: 'macro', root, outcomes, budget });
    assert.equal(receipt.budgetPreflight.expectedSkip, true);
    assert.equal(receipt.budgetPreflight.reason, 'deepseek_budget_uninitialized');
    assert.ok(Object.values(receipt.files).every(file => file.state === 'missing'));
    for (const options of [{ budget: {} }, { budget: { ...budget, skipVerification: 'failure' } }, { budget: { ...budget, outcome: 'failure' } },
      { budget: { ...budget, reason: token } }, { budget: { ...budget, disposition: 'failure' } },
      { outcomes: { ...outcomes, provider: 'success' } }, { consumer: 'bubble' }]) {
      const result = buildEditorialDiagnosticReceipt({ consumer: 'macro', root, outcomes, budget, ...options });
      assert.equal(result.budgetPreflight.expectedSkip, false); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE_TOKEN/u);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('workflow budget gate is mandatory, downstream steps remain fail-closed, and both publishers consume the trusted skip review', () => {
  const workflow = fs.readFileSync('.github/workflows/macro-risk-editorial-refresh.yml', 'utf8');
  const blocks = workflow.split(/(?=^      - name:)/mu).slice(1);
  assert.ok(workflow.includes('node scripts/review-deepseek-budget.mjs --require-eligible --allow-uninitialized-monthly-skip'));
  assert.doesNotMatch(workflow, /continue-on-error:/u);
  const admission = blocks.find(block => block.includes('id: admission'));
  assert.ok(admission.includes("if: steps.budget_preflight.outputs.budget_eligible == 'true'"));
  for (const name of metadata().values[1].jobs[0].steps.filter(step => step.conclusion === 'skipped').map(step => step.name).filter(name => name !== 'Admit one refresh for current upstream data')) {
    const block = blocks.find(step => step.startsWith(`      - name: ${name}\n`));
    assert.ok(block?.includes("if: steps.admission.outputs.refresh_allowed == 'true'"), name);
  }
  const skip = blocks.find(block => block.includes('name: Verify uninitialized monthly budget skip'));
  for (const check of ['test "$ADMISSION_OUTCOME" = skipped', 'test "$PROVIDER_OUTCOME" = skipped', 'test "$SAVE_OUTCOME" = skipped',
    'test ! -e manual-artifacts/macro-risk-editorial', 'git diff --quiet --exit-code', 'git diff --cached --quiet --exit-code']) assert.ok(skip.includes(check));
  const pages = fs.readFileSync('.github/workflows/deploy-static-site-to-pages.yml', 'utf8');
  const edge = fs.readFileSync('.github/workflows/publish-edgeone-release.yml', 'utf8');
  assert.ok(pages.includes('node scripts/review-pages-deployment.mjs'));
  assert.ok(edge.includes('node scripts/review-pages-deployment.mjs --upstream-only'));
  assert.ok(edge.includes("needs.publication_check.outputs.should_publish != 'false'"));
  assert.ok(edge.includes('actions: read')); assert.doesNotMatch(edge, /actions: write/u);
  for (const source of [pages, edge]) assert.ok(source.includes('run: npm run check:all'));
});

test('both real publication CLI modes stop before deployment metadata on verified skip and keep unknown state publishable', () => {
  const reviewCli = new URL('../../scripts/review-pages-deployment.mjs', import.meta.url).pathname;
  for (const args of [[], ['--upstream-only']]) {
    for (const verified of [true, false]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-publication-cli-'));
      try {
        const fixture = metadata();
        if (!verified) fixture.values[1].jobs[0].steps[0].conclusion = 'failure';
        fs.writeFileSync(path.join(root, 'event.json'), JSON.stringify(fixture.event));
        fs.writeFileSync(path.join(root, 'preload.mjs'), `
          import fs from 'node:fs';
          const values = ${JSON.stringify(fixture.values)}, calls = [];
          globalThis.fetch = async (url, init) => {
            if (init.method !== 'GET' || !url.startsWith('https://api.github.com/repos/${repository}/')) throw new Error('NETWORK_FORBIDDEN');
            calls.push(url);
            if (calls.length > 3) throw new Error('REQUEST_LIMIT');
            return new Response(JSON.stringify(values[calls.length - 1] ?? []), {status: 200});
          };
          process.on('exit', () => fs.writeFileSync('calls.json', JSON.stringify(calls)));
        `);
        const result = spawnSync(process.execPath, ['--import', path.join(root, 'preload.mjs'), reviewCli, ...args], {
          cwd: root, encoding: 'utf8', timeout: 15000, env: { ...process.env, GH_TOKEN: token,
            GITHUB_EVENT_NAME: 'workflow_run', GITHUB_REPOSITORY: repository, SOURCE_SHA: sha, FORCE_DEPLOY: '',
            GITHUB_EVENT_PATH: path.join(root, 'event.json'), GITHUB_OUTPUT: path.join(root, 'output'),
            GITHUB_STEP_SUMMARY: path.join(root, 'summary') }
        });
        assert.equal(result.status, 0, result.stderr);
        const output = fs.readFileSync(path.join(root, 'output'), 'utf8');
        assert.match(output, new RegExp(`should_${args.length ? 'publish' : 'deploy'}=${!verified}`));
        const calls = JSON.parse(fs.readFileSync(path.join(root, 'calls.json')));
        assert.equal(calls.length, verified || args.length ? 2 : 3);
        if (verified) assert.ok(calls.every(url => url.includes('/actions/runs/')));
        assert.doesNotMatch(result.stdout + result.stderr + output, /SYNTHETIC_PRIVATE_TOKEN/u);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
  }
});
