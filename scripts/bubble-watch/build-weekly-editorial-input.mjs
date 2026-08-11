import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { assertValid, validateWeeklyEditorialInput } from './weekly-editorial-contract.mjs';
import { buildWeeklyEditorialInput } from './weekly-editorial-input.mjs';

const DEFAULTS = Object.freeze({
  bubbleWatch: 'data/bubble-watch.json',
  radarData: 'data/radar-data.json',
  oilNews: 'data/oil-news-event-watch.json',
  discovery: 'manual-artifacts/bubble-watch-weekly-editorial/news-discovery-latest.json',
  output: 'manual-artifacts/bubble-watch-weekly-editorial/editorial-input-latest.json'
});
const ARTIFACT_PREFIX = 'manual-artifacts/bubble-watch-weekly-editorial/';

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  const names = new Map([
    ['--bubble-watch', 'bubbleWatch'],
    ['--radar-data', 'radarData'],
    ['--oil-news', 'oilNews'],
    ['--discovery', 'discovery'],
    ['--output', 'output']
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const inline = [...names.keys()].find((name) => arg.startsWith(`${name}=`));
    if (inline) options[names.get(inline)] = arg.slice(inline.length + 1);
    else if (names.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      options[names.get(arg)] = value;
      index += 1;
    } else throw new Error(`unsupported argument: ${arg}`);
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.output, ARTIFACT_PREFIX);
  const [bubbleWatch, radarData, oilNewsWatch, discovery] = await Promise.all([
    readJson(options.bubbleWatch),
    readJson(options.radarData),
    readJson(options.oilNews),
    readJson(options.discovery)
  ]);
  const input = buildWeeklyEditorialInput({ bubbleWatch, radarData, oilNewsWatch, discovery });
  const validation = assertValid(validateWeeklyEditorialInput(input), 'weekly editorial compact input');
  writeJson(options.output, input);
  console.log(`Bubble Watch weekly editorial input PASS (facts=${input.structuredFacts.length}, sources=${input.sourceRefs.length}, bytes=${Buffer.byteLength(JSON.stringify(input))}, output=${options.output}, errors=${validation.errors.length})`);
}

main().catch((error) => {
  console.error(`Bubble Watch weekly editorial input failed: ${error.message}`);
  process.exitCode = 1;
});
