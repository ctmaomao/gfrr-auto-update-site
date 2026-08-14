import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { assertValid, validateEditorialInput, validateNewsDiscovery } from './editorial-contract.mjs';
import { buildEditorialInput } from './editorial-input.mjs';
import { assessEditorialNewsReadiness } from './editorial-news.mjs';

const PREFIX = 'manual-artifacts/macro-risk-editorial/';
const defaults = {
  radarData: 'data/radar-data.json', worldOrder: 'data/world-order-stress.json', marketPricing: 'data/market-pricing-metrics.json',
  radarHistory: 'data/radar-history.json', oilDirectional: 'data/oil-directional-pressure.json', oilNews: 'data/oil-news-event-watch.json',
  discovery: `${PREFIX}news-discovery-latest.json`, output: `${PREFIX}editorial-input-latest.json`
};

function parseArgs(argv) {
  const options = { ...defaults, allowExpectedNewsSkip: false };
  const flags = new Map([['--radar-data', 'radarData'], ['--world-order', 'worldOrder'], ['--market-pricing', 'marketPricing'], ['--radar-history', 'radarHistory'], ['--oil-directional', 'oilDirectional'], ['--oil-news', 'oilNews'], ['--discovery', 'discovery'], ['--output', 'output']]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--allow-expected-news-skip') {
      options.allowExpectedNewsSkip = true;
      continue;
    }
    if (!flags.has(flag)) throw new Error(`unsupported argument: ${flag}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    options[flags.get(flag)] = value;
  }
  return options;
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }

async function appendWorkflowFile(name, text) {
  const target = process.env[name];
  if (target) await fs.appendFile(target, text, 'utf8');
}

async function reportWorkflowState(readiness) {
  await appendWorkflowFile('GITHUB_OUTPUT', [
    `editorial_ready=${readiness.editorialReady}`,
    `skip_reason=${readiness.reason || ''}`,
    ''
  ].join('\n'));
  if (!readiness.expectedSkip) return;
  await appendWorkflowFile('GITHUB_STEP_SUMMARY', [
    '### Macro Risk Editorial refresh skipped safely',
    '',
    '- Classification: `SKIPPED_NO_CREDIBLE_NEWS`',
    `- Search providers: ${readiness.providerStatuses.join(' / ')}`,
    `- Sanitized stories: ${readiness.storyCount}`,
    '- Credible stories: 0 (`official=0`, `cross_checked=0`)',
    '- DeepSeek calls: 0',
    '- Production data writes: 0',
    '- Deterministic Macro Risk Overview remains the fallback.',
    ''
  ].join('\n'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.output, PREFIX);
  const discovery = await readJson(options.discovery);
  assertValid(validateNewsDiscovery(discovery), 'macro risk editorial news discovery');
  const readiness = assessEditorialNewsReadiness(discovery);
  if (options.allowExpectedNewsSkip && readiness.expectedSkip) {
    await reportWorkflowState(readiness);
    console.log(`Macro risk editorial input SKIP (reason=${readiness.reason}, providers=${readiness.providerStatuses.join('/')}, stories=${readiness.storyCount}, DeepSeekCalls=0, productionDataWrites=0)`);
    return;
  }
  const [radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews] = await Promise.all([
    readJson(options.radarData), readJson(options.worldOrder), readJson(options.marketPricing), readJson(options.radarHistory), readJson(options.oilDirectional), readJson(options.oilNews)
  ]);
  const input = buildEditorialInput({ radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews, discovery });
  assertValid(validateEditorialInput(input), 'macro risk editorial compact input');
  writeJson(options.output, input);
  await reportWorkflowState(readiness);
  console.log(`Macro risk editorial input PASS (facts=${input.structuredFacts.length}, sources=${input.sourceRefs.length}, bytes=${Buffer.byteLength(JSON.stringify(input))}, output=${options.output})`);
}

main().catch((error) => { console.error(`Macro risk editorial input failed: ${error.message}`); process.exitCode = 1; });
