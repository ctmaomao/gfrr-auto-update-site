import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { assertValid, validateWeeklyEditorialReview } from './weekly-editorial-contract.mjs';
import { reviewWeeklyEditorial } from './weekly-editorial-production.mjs';

const PREFIX = 'manual-artifacts/bubble-watch-weekly-editorial/';

function parseArgs(argv) {
  const options = {
    input: `${PREFIX}editorial-input-latest.json`,
    output: `${PREFIX}deepseek-output-latest.json`,
    review: `${PREFIX}quality-review-latest.json`
  };
  const flags = new Map([['--input', 'input'], ['--output', 'output'], ['--review', 'review']]);
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
  assertManualArtifactWritePath(options.review, PREFIX);
  const [input, output] = await Promise.all([readJson(options.input), readJson(options.output)]);
  const review = reviewWeeklyEditorial({ input, output });
  assertValid(validateWeeklyEditorialReview(review), 'weekly editorial quality review');
  writeJson(options.review, review);
  console.log(`Bubble Watch weekly editorial review ${review.status.toUpperCase()} (warnings=${review.warnings.length}, blockers=${review.blockers.length}, output=${options.review})`);
  if (review.status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Bubble Watch weekly editorial review failed: ${error.message}`);
  process.exitCode = 1;
});
