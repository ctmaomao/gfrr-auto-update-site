import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildEditorialInput } from '../../scripts/macro-risk/editorial-input.mjs';
import { buildNewsDiscovery } from '../../scripts/macro-risk/editorial-news.mjs';
import { validateEditorialInput } from '../../scripts/macro-risk/editorial-contract.mjs';
import { validateWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';

const text = path => readFileSync(path, 'utf8');
const json = path => JSON.parse(text(path));
const workflow = name => text(`.github/workflows/${name}.yml`).replaceAll('\r\n', '\n');
const key = 'SYNTHETIC_PRIVATE_KEY';
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:DEEPSEEK|TAVILY|BRAVE|GITHUB_|EXTERNAL_AI)/u.test(name)));

// Every child replaces fetch before importing its entry point. An unexpected
// request is counted and fails locally; no fixture can reach a real provider.
function offlineChild(source, env = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    let networkCalls = 0;
    globalThis.fetch = async () => { networkCalls++; throw new Error('NETWORK_FORBIDDEN'); };
    process.on('exit', () => console.log('NETWORK_CALLS=' + networkCalls));
    ${source}
  `], { encoding: 'utf8', timeout: 15_000, env: { ...cleanEnv(), ...env } });
}

function assertZeroNetwork(result, expectedExit = 0) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, expectedExit, result.stderr + result.stdout);
  assert.match(result.stdout, /NETWORK_CALLS=0\n$/u);
  assert.ok(!(result.stdout + result.stderr).includes(key), 'credentials must not reach diagnostics');
}

function macroInput() {
  const discovery = buildNewsDiscovery({
    rawStories: [{ provider: 'tavily', topic: 'central_bank_inflation',
      title: 'Federal Reserve policy statement', url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260810a.htm',
      publishedAt: '2026-08-10T10:00:00.000Z', snippet: 'Synthetic official policy context for an offline admission test.' }],
    sourceStatus: { tavily: { status: 'ok' }, brave: { status: 'ok' } },
    generatedAt: '2026-08-11T06:00:00.000Z', windowStart: '2026-08-04', windowEnd: '2026-08-11'
  });
  return buildEditorialInput({ radarData: json('data/radar-data.json'),
    worldOrder: json('data/world-order-stress.json'), marketPricing: json('data/market-pricing-metrics.json'),
    radarHistory: json('data/radar-history.json'), oilDirectional: json('data/oil-directional-pressure.json'),
    oilNews: json('data/oil-news-event-watch.json'), discovery, generatedAt: '2026-08-11T06:01:00.000Z' });
}

test('both real editorial entry points default to the shared gate and make zero requests without budget configuration', () => {
  for (const [module, method, input, validate] of [
    ['macro-risk/editorial-provider', 'requestEditorial', macroInput(), validateEditorialInput],
    ['bubble-watch/weekly-editorial-provider', 'requestWeeklyEditorial', json('docs/fixtures/bubble-watch-weekly-editorial/sample-input-v1.json'), validateWeeklyEditorialInput]
  ]) {
    const validation = validate(input);
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    const result = offlineChild(`
      const { ${method} } = await import('./scripts/${module}.mjs');
      try { await ${method}({ input: ${JSON.stringify(input)}, apiKey: process.env.DEEPSEEK_API_KEY });
        throw new Error('UNEXPECTED_ADMISSION');
      } catch (error) {
        if (!/^deepseek_budget_/u.test(error.budgetCode || '')) throw error;
        console.log(error.budgetCode);
      }
    `, { DEEPSEEK_API_KEY: key });
    assertZeroNetwork(result);
  }
});

test('real article search collectors cannot use supplied keys without shared accounting configuration', () => {
  for (const module of ['macro-risk/collect-editorial-news', 'bubble-watch/collect-weekly-editorial-news']) {
    const result = offlineChild(`
      const assert = (await import('node:assert/strict')).default;
      const { collectProvider } = await import('./scripts/${module}.mjs');
      for (const provider of ['tavily', 'brave']) {
        const result = await collectProvider(provider, [process.env.TAVILY_API_KEY]);
        assert.equal(result.status.status, 'error');
        assert.equal(result.status.successCount, 0);
        assert.equal(result.rows.length, 0);
        assert.equal(result.status.queryRuns.length, 6);
        for (const row of result.status.queryRuns) {
          assert.equal(row.status, 'error');
          assert.match(row.error, new RegExp('^' + provider + '_budget_'));
        }
      }
    `, { TAVILY_API_KEY: key });
    assertZeroNetwork(result);
  }
});

test('manual external-AI CLI is not a third consumer of the two-article allowance', () => {
  mkdirSync('manual-artifacts/external-ai', { recursive: true });
  const directory = mkdtempSync('manual-artifacts/external-ai/editorial-budget-wiring-');
  try {
    const result = offlineChild(`
      process.argv = [process.execPath, 'scripts/run-external-ai-manual-test.mjs',
        '--provider', 'deepseek', '--allow-network', '--validate-output',
        '--input', 'docs/fixtures/external-ai/sample-input-v28.0K-1.json',
        '--output', ${JSON.stringify(`${directory}/result.json`)}];
      await import('./scripts/run-external-ai-manual-test.mjs');
    `, { DEEPSEEK_API_KEY: key, DEEPSEEK_BUDGET_GITHUB_TOKEN: 'SYNTHETIC_TOKEN',
      DEEPSEEK_BUDGET_GENESIS_SHA: 'a'.repeat(40), DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256: 'b'.repeat(64) });
    assertZeroNetwork(result, 1);
    assert.match(result.stderr + result.stdout, /deepseek_budget_invalid_request/u);
    for (const file of readdirSync(directory)) assert.ok(!text(`${directory}/${file}`).includes(key));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('all three budget plans are offline and status commands fail closed with no credentials', () => {
  for (const provider of ['deepseek', 'tavily', 'brave']) {
    for (const args of [['--plan'], []]) {
      const result = offlineChild(`
        process.argv = [process.execPath, 'scripts/review-${provider}-budget.mjs', ...${JSON.stringify(args)}];
        await import('./scripts/review-${provider}-budget.mjs');
      `);
      assertZeroNetwork(result, args.length ? 0 : 1);
      if (args.length) assert.match(result.stdout, /"writes"\s*:\s*0/u);
    }
  }
});

function steps(source) {
  return source.split(/(?=^      - (?:name:|uses:))/mu).slice(1);
}

test('each article workflow checks the shared cap before discovery and scopes budget credentials to preflight and provider only', () => {
  for (const [name, collector, provider] of [
    ['macro-risk-editorial-refresh', 'collect:macro-risk-editorial-news', 'run:macro-risk-editorial-deepseek'],
    ['bubble-watch-weekly-editorial-refresh', 'collect:bubble-watch-weekly-news', 'run:bubble-watch-weekly-editorial-deepseek']
  ]) {
    const source = workflow(name), blocks = steps(source);
    const preflights = blocks.filter(block => block.includes('node scripts/review-deepseek-budget.mjs --require-eligible'));
    const providers = blocks.filter(block => block.includes(`npm run ${provider} `));
    assert.equal(preflights.length, 1); assert.equal(providers.length, 1);
    const preflight = preflights[0], paid = providers[0];
    assert.ok(source.indexOf(preflight) < source.indexOf(`npm run ${collector}`));
    assert.ok(source.indexOf(`npm run ${collector}`) < source.indexOf(paid));
    assert.doesNotMatch(preflight, /^        (?:if:|continue-on-error:)/mu, 'budget preflight cannot be bypassed');
    for (const name of ['DEEPSEEK_BUDGET_GITHUB_TOKEN', 'DEEPSEEK_BUDGET_GENESIS_SHA', 'DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256']) {
      assert.equal((source.match(new RegExp(`${name}:`, 'gu')) || []).length, 2);
      assert.match(preflight, new RegExp(`^          ${name}:`, 'mu'));
      assert.match(paid, new RegExp(`^          ${name}:`, 'mu'));
    }
    assert.equal((source.match(/DEEPSEEK_API_KEY:/gu) || []).length, 1);
    assert.ok(paid.includes('DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}'));
    assert.match(paid, /^        if: .*editorial_ready == 'true'/mu);
    assert.ok(source.includes('cancel-in-progress: false'));
    assert.ok(source.includes('environment: external-ai-production-refresh'));
  }
});

test('existing Tavily status workflow remains read-only and cannot probe, initialize, search, or generate', () => {
  const source = workflow('tavily-budget-status');
  assert.ok(source.includes('contents: read'));
  assert.ok(source.includes('persist-credentials: false'));
  assert.match(source, /run: node scripts\/review-tavily-budget\.mjs --verify\s*$/u);
  assert.doesNotMatch(source, /contents: write|--probe|--usage-only|--initialize|--activate|DEEPSEEK_|collect:|build:/u);
});

function scriptInventory(directory = 'scripts') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? scriptInventory(`${directory}/${entry.name}`)
    : /\.(?:mjs|js)$/u.test(entry.name) ? [`${directory}/${entry.name}`] : []);
}

test('repository endpoint inventory binds every Tavily and Brave search caller to the same durable gates', () => {
  const expected = [
    ['scripts/build-bubble-watch.mjs', 'bubble-ceo'],
    ['scripts/bubble-watch/collect-weekly-editorial-news.mjs', 'bubble-editorial'],
    ['scripts/macro-risk/collect-editorial-news.mjs', 'macro-editorial'],
    ['scripts/oil-directional/diagnose-oil-news-events.mjs', 'oil-news']
  ];
  const files = scriptInventory();
  for (const endpoint of [/https:\/\/api\.tavily\.com\/search/u, /https:\/\/api\.search\.brave\.com\/res\/v1\/(?:news\/)?search/u]) {
    assert.deepEqual(files.filter(file => endpoint.test(text(file))).sort(), expected.map(([file]) => file).sort(),
      'a new provider caller requires explicit shared-ledger admission and inventory review');
  }
  for (const [file, consumer] of expected) {
    const source = text(file);
    assert.match(source, /import \{ withTavilyBudget \} from ['"].*lib\/tavily-budget\.mjs['"]/u);
    assert.match(source, /import \{ withBraveBudget \} from ['"].*lib\/brave-budget\.mjs['"]/u);
    assert.match(source, new RegExp(`budget\\(\\{ key, payload(?:[: ,][^}]+)?, consumer: '${consumer}' \\}`, 'u'));
    assert.match(source, new RegExp(`(?:braveBudget|budget)\\(\\{ key, consumer: '${consumer}' \\}`, 'u'));
  }
});

test('npm aggregate retains old checks and reaches all new offline budget tests', () => {
  const { scripts } = json('package.json');
  assert.ok(scripts['check:all'].includes('npm run check:tavily-budget'));
  for (const name of ['deepseek-budget', 'free-search-budget', 'editorial-budget-wiring']) {
    assert.ok(scripts['check:all'].includes(`npm run check:${name}`));
    assert.ok(scripts[`check:${name}`].includes(`node --test tests/unit/${name}.test.mjs`));
  }
  for (const name of ['deepseek', 'tavily', 'brave']) assert.equal(scripts[`review:${name}-budget`], `node scripts/review-${name}-budget.mjs`);
});
