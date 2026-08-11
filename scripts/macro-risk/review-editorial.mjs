import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { assertValid, validateEditorialReview } from './editorial-contract.mjs';
import { reviewEditorial } from './editorial-production.mjs';

const PREFIX = 'manual-artifacts/macro-risk-editorial/';

async function main() {
  const argv = process.argv.slice(2);
  const value = (flag, fallback) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : fallback; };
  const inputPath = value('--input', `${PREFIX}editorial-input-latest.json`);
  const outputPath = value('--output', `${PREFIX}deepseek-output-latest.json`);
  const reviewPath = value('--review-output', `${PREFIX}review-latest.json`);
  assertManualArtifactWritePath(reviewPath, PREFIX);
  const [input, output] = await Promise.all([fs.readFile(inputPath, 'utf8'), fs.readFile(outputPath, 'utf8')]).then((values) => values.map(JSON.parse));
  const review = reviewEditorial({ input, output });
  assertValid(validateEditorialReview(review), 'macro risk editorial review');
  writeJson(reviewPath, review);
  console.log(`Macro risk editorial review ${review.status.toUpperCase()} (displayEligible=${review.frontendDisplayEligible}, output=${reviewPath})`);
  if (review.status === 'fail') process.exitCode = 1;
}

main().catch((error) => { console.error(`Macro risk editorial review failed: ${error.message}`); process.exitCode = 1; });
