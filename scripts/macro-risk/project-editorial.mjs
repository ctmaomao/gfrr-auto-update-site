import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { projectEditorial } from './editorial-production.mjs';

const PREFIX = 'manual-artifacts/macro-risk-editorial/';

async function main() {
  const argv = process.argv.slice(2);
  const value = (flag, fallback) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : fallback; };
  const inputPath = value('--input', `${PREFIX}editorial-input-latest.json`);
  const outputPath = value('--output', `${PREFIX}deepseek-output-latest.json`);
  const reviewPath = value('--review', `${PREFIX}review-latest.json`);
  const projectionPath = value('--projection-output', `${PREFIX}production-projection-latest.json`);
  assertManualArtifactWritePath(projectionPath, PREFIX);
  const [input, output, review] = await Promise.all([inputPath, outputPath, reviewPath].map((file) => fs.readFile(file, 'utf8'))).then((values) => values.map(JSON.parse));
  const macroRiskEditorialLayer = projectEditorial({ input, output, review, sourceCommit: process.env.GITHUB_SHA || null, runId: process.env.GITHUB_RUN_ID || null });
  writeJson(projectionPath, { schemaVersion: 'macro-risk-editorial-production-projection-v1', target: 'data/radar-data.json.macroRiskEditorialLayer', macroRiskEditorialLayer });
  console.log(`Macro risk editorial production projection PASS (sources=${macroRiskEditorialLayer.sourceLedger.length}, output=${projectionPath})`);
}

main().catch((error) => { console.error(`Macro risk editorial projection failed: ${error.message}`); process.exitCode = 1; });
