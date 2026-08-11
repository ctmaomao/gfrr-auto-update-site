import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { assertValid, validateEditorialInput } from './editorial-contract.mjs';
import { buildEditorialInput } from './editorial-input.mjs';

const PREFIX = 'manual-artifacts/macro-risk-editorial/';
const defaults = {
  radarData: 'data/radar-data.json', worldOrder: 'data/world-order-stress.json', marketPricing: 'data/market-pricing-metrics.json',
  radarHistory: 'data/radar-history.json', oilDirectional: 'data/oil-directional-pressure.json', oilNews: 'data/oil-news-event-watch.json',
  discovery: `${PREFIX}news-discovery-latest.json`, output: `${PREFIX}editorial-input-latest.json`
};

function parseArgs(argv) {
  const options = { ...defaults };
  const flags = new Map([['--radar-data', 'radarData'], ['--world-order', 'worldOrder'], ['--market-pricing', 'marketPricing'], ['--radar-history', 'radarHistory'], ['--oil-directional', 'oilDirectional'], ['--oil-news', 'oilNews'], ['--discovery', 'discovery'], ['--output', 'output']]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flags.has(flag)) throw new Error(`unsupported argument: ${flag}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    options[flags.get(flag)] = value;
  }
  return options;
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.output, PREFIX);
  const [radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews, discovery] = await Promise.all([
    readJson(options.radarData), readJson(options.worldOrder), readJson(options.marketPricing), readJson(options.radarHistory), readJson(options.oilDirectional), readJson(options.oilNews), readJson(options.discovery)
  ]);
  const input = buildEditorialInput({ radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews, discovery });
  assertValid(validateEditorialInput(input), 'macro risk editorial compact input');
  writeJson(options.output, input);
  console.log(`Macro risk editorial input PASS (facts=${input.structuredFacts.length}, sources=${input.sourceRefs.length}, bytes=${Buffer.byteLength(JSON.stringify(input))}, output=${options.output})`);
}

main().catch((error) => { console.error(`Macro risk editorial input failed: ${error.message}`); process.exitCode = 1; });
