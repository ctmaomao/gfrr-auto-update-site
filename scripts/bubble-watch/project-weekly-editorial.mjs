import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { assertValid } from './weekly-editorial-contract.mjs';
import { projectWeeklyEditorial, validateWeeklyEditorialProduction } from './weekly-editorial-production.mjs';

const PREFIX = 'manual-artifacts/bubble-watch-weekly-editorial/';

function parseArgs(argv) {
  const options = {
    input: `${PREFIX}editorial-input-latest.json`,
    output: `${PREFIX}deepseek-output-latest.json`,
    review: `${PREFIX}quality-review-latest.json`,
    bubbleWatch: 'data/bubble-watch.json',
    projection: `${PREFIX}production-projection-latest.json`
  };
  const flags = new Map([
    ['--input', 'input'],
    ['--output', 'output'],
    ['--review', 'review'],
    ['--bubble-watch', 'bubbleWatch'],
    ['--projection', 'projection']
  ]);
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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.projection, PREFIX);
  const [input, output, review, bubbleWatch] = await Promise.all([
    readJson(options.input),
    readJson(options.output),
    readJson(options.review),
    readJson(options.bubbleWatch)
  ]);
  const generatedAt = new Date().toISOString();
  const layer = projectWeeklyEditorial({
    input,
    output,
    review,
    generatedAt,
    sourceCommit: process.env.GITHUB_SHA || null,
    runId: process.env.GITHUB_RUN_ID || null
  });
  assertValid(validateWeeklyEditorialProduction(layer, bubbleWatch), 'weekly editorial production projection');
  const projection = {
    schemaVersion: 'bubble-watch-weekly-editorial-production-projection-v1',
    generatedAt,
    target: 'data/bubble-watch.json.summary.weekly_editorial',
    weeklyEditorial: layer,
    productionImpact: {
      writesProductionData: false,
      modifiesBubbleWatchScoring: false,
      modifiesGfrrScoring: false,
      frontendDisplayApproved: true
    }
  };
  writeJson(options.projection, projection);
  console.log(`Bubble Watch weekly editorial projection PASS (sources=${layer.sourceLedger.length}, review=${layer.qualityReview.status}, output=${options.projection})`);
}

main().catch((error) => {
  console.error(`Bubble Watch weekly editorial projection failed: ${error.message}`);
  process.exitCode = 1;
});
