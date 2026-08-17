import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { assertValid, validateNewsDiscovery, validateWeeklyEditorialInput } from './weekly-editorial-contract.mjs';
import { buildWeeklyEditorialInput } from './weekly-editorial-input.mjs';
import { assessWeeklyEditorialNewsReadiness } from './weekly-editorial-news.mjs';

const DEFAULTS = Object.freeze({
  bubbleWatch: 'data/bubble-watch.json',
  radarData: 'data/radar-data.json',
  oilNews: 'data/oil-news-event-watch.json',
  discovery: 'manual-artifacts/bubble-watch-weekly-editorial/news-discovery-latest.json',
  output: 'manual-artifacts/bubble-watch-weekly-editorial/editorial-input-latest.json'
});
const ARTIFACT_PREFIX = 'manual-artifacts/bubble-watch-weekly-editorial/';

function parseArgs(argv) {
  const options = { ...DEFAULTS, allowExpectedNewsSkip: false };
  const names = new Map([
    ['--bubble-watch', 'bubbleWatch'],
    ['--radar-data', 'radarData'],
    ['--oil-news', 'oilNews'],
    ['--discovery', 'discovery'],
    ['--output', 'output']
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-expected-news-skip') {
      options.allowExpectedNewsSkip = true;
      continue;
    }
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
    '### Bubble Watch weekly editorial refresh skipped safely',
    '',
    '- Classification: `SKIPPED_NO_CREDIBLE_NEWS`',
    `- Search providers: ${readiness.providerStatuses.join(' / ')}`,
    `- Sanitized stories: ${readiness.storyCount}`,
    '- Credible stories: 0 (`official=0`, `cross_checked=0`)',
    '- DeepSeek calls: 0',
    '- Production data writes: 0',
    '- Deterministic `bubble-watch-narrative-v2` remains the fallback.',
    ''
  ].join('\n'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.output, ARTIFACT_PREFIX);
  const discovery = await readJson(options.discovery);
  assertValid(validateNewsDiscovery(discovery), 'weekly editorial news discovery');
  const readiness = assessWeeklyEditorialNewsReadiness(discovery);
  if (options.allowExpectedNewsSkip && readiness.expectedSkip) {
    await reportWorkflowState(readiness);
    console.log(`Bubble Watch weekly editorial input SKIP (reason=${readiness.reason}, providers=${readiness.providerStatuses.join('/')}, stories=${readiness.storyCount}, DeepSeekCalls=0, productionDataWrites=0)`);
    return;
  }
  if (!readiness.editorialReady) {
    throw new Error(`weekly editorial news is not ready: ${readiness.reason} (providers=${readiness.providerStatuses.join('/')}, credibleStories=${readiness.credibleCount})`);
  }
  const [bubbleWatch, radarData, oilNewsWatch] = await Promise.all([
    readJson(options.bubbleWatch),
    readJson(options.radarData),
    readJson(options.oilNews)
  ]);
  const input = buildWeeklyEditorialInput({ bubbleWatch, radarData, oilNewsWatch, discovery });
  const validation = assertValid(validateWeeklyEditorialInput(input), 'weekly editorial compact input');
  writeJson(options.output, input);
  await reportWorkflowState(readiness);
  console.log(`Bubble Watch weekly editorial input PASS (facts=${input.structuredFacts.length}, sources=${input.sourceRefs.length}, bytes=${Buffer.byteLength(JSON.stringify(input))}, output=${options.output}, errors=${validation.errors.length})`);
}

main().catch((error) => {
  console.error(`Bubble Watch weekly editorial input failed: ${error.message}`);
  process.exitCode = 1;
});
