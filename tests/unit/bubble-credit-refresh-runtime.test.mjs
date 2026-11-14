import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDIT_SERIES, creditPublicationEnabled, validateCreditPoints } from '../../scripts/bubble-watch/credit-spreads.mjs';

const url = new URL('../../scripts/refresh-bubble-credit-spreads.mjs', import.meta.url);
const source = fs.readFileSync(url, 'utf8');
const baseline = JSON.parse(fs.readFileSync(new URL('../../data/bubble-watch.json', import.meta.url)));
async function run({ write = false, concurrent = false, enabled = true, invalid = false } = {}) {
  const writes = [], logs = [];
  let targetReads = 0, calls = 0;
  const credit = structuredClone(baseline.credit_spreads);
  credit.checkedAt = '2026-11-12T06:20:00.000Z';
  if (invalid) credit.series.hy = [];
  const fakeFs = {
    readFileSync(file) {
      if (String(file).endsWith('config/bubble-credit-spreads.json')) return JSON.stringify({ enabled, publicationRights: 'owner_risk_accepted' });
      targetReads++;
      return JSON.stringify(concurrent && targetReads > 1 ? { ...baseline, issue_number: 999 } : baseline);
    },
    writeFileSync(file, text) { writes.push({ file, data: JSON.parse(text) }); }
  };
  const context = vm.createContext({ fs: fakeFs, path, fileURLToPath, CREDIT_SERIES, creditPublicationEnabled, validateCreditPoints,
    collectCreditSpreads: async ({ previous }) => { calls++; assert.deepEqual(JSON.parse(JSON.stringify(previous)), baseline.credit_spreads); return credit; },
    process: { argv: ['node', 'refresh', ...(write ? ['--write'] : [])] },
    console: { log: text => logs.push(text) }
  });
  const executable = source.replace(/^import .*;\n/gmu, '').replaceAll('import.meta.url', JSON.stringify(url.href));
  try { await vm.runInContext(`(async () => {${executable}\n})()`, context); }
  catch (error) { error.writes = writes; error.calls = calls; throw error; }
  return { writes, calls, logs, credit };
}

test('actual credit writer changes only display credit; score, issue, evidence, narrative and history references stay intact', async () => {
  const result = await run({ write: true });
  assert.equal(result.calls, 1); assert.equal(result.writes.length, 1);
  assert.ok(result.writes[0].file.endsWith('/data/bubble-watch.json'));
  const { credit_spreads, ...after } = result.writes[0].data;
  const { credit_spreads: beforeCredit, ...before } = baseline;
  assert.deepEqual(after, before); assert.deepEqual(credit_spreads, result.credit);
  assert.notEqual(credit_spreads.checkedAt, beforeCredit.checkedAt);
});
test('dry run never writes; disabled publication, invalid series and concurrent replacement fail closed', async () => {
  assert.equal((await run()).writes.length, 0);
  for (const options of [{ enabled: false }, { invalid: true }, { concurrent: true }]) {
    await assert.rejects(run({ ...options, write: true }), error => error.writes.length === 0 && (options.enabled !== false || error.calls === 0));
  }
});
test('scheduled independent-display path has no provider credentials, broad builder, paid editorial trigger or retries', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/refresh-bubble-credit-spreads.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '20 6 \* \* 2-6'/u);
  assert.match(workflow, /group: gfrr-main-writer-main/u);
  assert.match(workflow, /node scripts\/refresh-bubble-credit-spreads\.mjs --write/u);
  assert.match(workflow, /git add data\/bubble-watch\.json data\/bubble-market-observations\.json\n/u);
  assert.match(workflow, /node scripts\/refresh-bubble-market-observations\.mjs --write/u);
  assert.ok(workflow.indexOf('npm run check:all') < workflow.indexOf('git commit'));
  assert.doesNotMatch(workflow, /secrets\.|WIND|DEEPSEEK|TAVILY|BRAVE|build:bubble|workflow_run:|git pull --rebase/u);
  const editorial = fs.readFileSync(new URL('../../.github/workflows/bubble-watch-weekly-editorial-refresh.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(editorial, /Refresh Bubble Credit Spreads/u);
  const pages = fs.readFileSync(new URL('../../.github/workflows/deploy-static-site-to-pages.yml', import.meta.url), 'utf8');
  assert.match(pages, /workflow_run:[\s\S]*?workflows:[\s\S]*?      - Refresh Bubble Credit Spreads\n/u);
  assert.match(pages, /github.event.workflow_run.conclusion == 'success'/u);
});
