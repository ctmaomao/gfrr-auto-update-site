import fs from 'node:fs';
import process from 'node:process';

import { assertValid, validateNewsDiscovery, validateWeeklyEditorialInput } from './bubble-watch/weekly-editorial-contract.mjs';

const DEFAULT_DISCOVERY = 'manual-artifacts/bubble-watch-weekly-editorial/news-discovery-latest.json';
const DEFAULT_INPUT = 'manual-artifacts/bubble-watch-weekly-editorial/editorial-input-latest.json';
const DEFAULT_BUBBLE = 'data/bubble-watch.json';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const options = { discovery: DEFAULT_DISCOVERY, input: DEFAULT_INPUT, bubbleWatch: DEFAULT_BUBBLE };
  const flags = new Map([['--discovery', 'discovery'], ['--input', 'input'], ['--bubble-watch', 'bubbleWatch']]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const inline = [...flags.keys()].find((flag) => arg.startsWith(`${flag}=`));
    if (inline) options[flags.get(inline)] = arg.slice(inline.length + 1);
    else if (flags.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      options[flags.get(arg)] = value;
      index += 1;
    } else throw new Error(`unsupported argument: ${arg}`);
  }
  return options;
}

function collectKeys(value, output = []) {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, output));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      output.push(key);
      collectKeys(item, output);
    }
  }
  return output;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const discovery = readJson(options.discovery);
  const input = readJson(options.input);
  const bubbleWatch = readJson(options.bubbleWatch);
  assertValid(validateNewsDiscovery(discovery), 'live weekly news discovery');
  assertValid(validateWeeklyEditorialInput(input), 'live weekly editorial input');
  if (!['ok', 'partial'].includes(discovery.status) || discovery.liveProviderCount !== 2) {
    throw new Error('production provider call requires usable live results from both Tavily and Brave');
  }
  const credibleStories = discovery.stories.filter((story) => ['official', 'cross_checked'].includes(story.evidenceStatus));
  if (credibleStories.length < 1) throw new Error('production provider call requires at least one official/cross_checked story');
  if (input.fixtureOnly !== false || input.inputMode !== 'live_site_compact_evidence_pack') throw new Error('production provider call rejects fixture/non-live input');
  if (input.asOfDate !== bubbleWatch.as_of_date) throw new Error('provider input asOfDate must match current Bubble Watch data');
  const inputBytes = Buffer.byteLength(JSON.stringify(input));
  if (inputBytes > 60 * 1024) throw new Error(`provider input exceeds 60 KiB: ${inputBytes}`);
  const forbiddenKeys = new Set(['rawResponse', 'rawContent', 'headers', 'authorization', 'apiKey', 'positionGuidance', 'executionLock', 'actionQueue']);
  const found = collectKeys(input).filter((key) => forbiddenKeys.has(key));
  if (found.length > 0) throw new Error(`provider input contains forbidden keys: ${[...new Set(found)].join(', ')}`);
  console.log(`Bubble Watch weekly editorial live input PASS (status=${discovery.status}, providers=2, credibleStories=${credibleStories.length}, bytes=${inputBytes}, asOf=${input.asOfDate})`);
}

try {
  main();
} catch (error) {
  console.error(`Bubble Watch weekly editorial live input FAIL: ${error.message}`);
  process.exitCode = 1;
}
