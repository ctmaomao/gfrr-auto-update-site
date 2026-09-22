import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { assertValid, validateEditorialInput, validateNewsDiscovery } from './editorial-contract.mjs';
import { buildEditorialInput } from './editorial-input.mjs';
import { assessEditorialNewsReadiness, describeProviderHealth, formatProviderHealth } from './editorial-news.mjs';

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

// ADR-0060: a hold raised by our own budget guard before any provider request
// skips; a real provider failure stays a hard failure. Both are visible in the
// step summary so a green run never hides why the AI layer did not refresh.
const SKIP_CLASSIFICATION = Object.freeze({
  no_credible_news: 'SKIPPED_NO_CREDIBLE_NEWS',
  search_budget_exhausted: 'SKIPPED_SEARCH_BUDGET_EXHAUSTED'
});

async function reportWorkflowState(readiness, discovery) {
  await appendWorkflowFile('GITHUB_OUTPUT', [
    `editorial_ready=${readiness.editorialReady}`,
    `skip_reason=${readiness.reason || ''}`,
    ''
  ].join('\n'));
  if (!readiness.expectedSkip) return;
  const classification = SKIP_CLASSIFICATION[readiness.reason] || 'SKIPPED_NO_CREDIBLE_NEWS';
  const budgetHeld = readiness.reason === 'search_budget_exhausted';
  // Bounded, classified diagnostics: a green skip must still state which codes
  // stopped the collection, so a budget hold is never invisible in the log.
  const diagnostics = formatProviderHealth(describeProviderHealth(discovery));
  console.log(`::warning title=Macro Risk AI not refreshed::${budgetHeld
    ? `The shared search budget refused every provider call before any request, so the AI layer was not refreshed (${diagnostics}). DeepSeek calls: 0; production writes: 0. The account cannot recover through code: top up the plan or wait for the billing period. This run stays green, so check the step summary, the artifact, or dispatch the read-only Tavily Budget Status probe.`
    : 'No credible news survived the evidence gate. DeepSeek calls: 0; production writes: 0. Check the discovery artifact; workflow success does not mean AI availability.'}`);
  await appendWorkflowFile('GITHUB_STEP_SUMMARY', [
    '### Macro Risk Editorial refresh skipped safely',
    '',
    `- Classification: \`${classification}\``,
    `- Search providers: ${readiness.providerStatuses.join(' / ')}`,
    `- Provider diagnostics: ${diagnostics}`,
    `- Sanitized stories: ${readiness.storyCount}`,
    '- Credible stories: 0 (`official=0`, `cross_checked=0`)',
    '- DeepSeek calls: 0',
    '- Production data writes: 0',
    ...(budgetHeld ? ['- Cause: the shared Tavily budget guard refused before any provider request; no index or source-health failure is implied.', '- Alerting: this skip is not a failure, so budget exhaustion raises no red run. Verify with the manual read-only `Tavily Budget Status` workflow.'] : []),
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
    await reportWorkflowState(readiness, discovery);
    console.log(`Macro risk editorial input SKIP (classification=${SKIP_CLASSIFICATION[readiness.reason] || readiness.reason}, reason=${readiness.reason}, providers=${formatProviderHealth(describeProviderHealth(discovery))}, stories=${readiness.storyCount}, DeepSeekCalls=0, productionDataWrites=0)`);
    return;
  }
  if (!readiness.editorialReady) {
    // Zero credible stories with a real provider failure is a source-health
    // failure, not a bad evidence pack. Name the classified cause here instead of
    // letting the compact-input validator report a generic missing-story error.
    const health = describeProviderHealth(discovery);
    await appendWorkflowFile('GITHUB_STEP_SUMMARY', [
      '### Macro Risk Editorial refresh failed closed',
      '',
      `- Classification: \`${readiness.reason}\``,
      `- Search providers: ${formatProviderHealth(health)}`,
      `- Sanitized stories: ${readiness.storyCount} (official=${readiness.officialCount}, cross_checked=${readiness.crossCheckedCount})`,
      '- DeepSeek calls: 0',
      '- Production data writes: 0',
      '- Deterministic Macro Risk Overview remains the published fallback.',
      ''
    ].join('\n'));
    throw new Error(`${readiness.reason}: no official or cross_checked news survived the evidence gate; providers=${formatProviderHealth(health)}; stories=${readiness.storyCount}`);
  }
  const [radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews] = await Promise.all([
    readJson(options.radarData), readJson(options.worldOrder), readJson(options.marketPricing), readJson(options.radarHistory), readJson(options.oilDirectional), readJson(options.oilNews)
  ]);
  const input = buildEditorialInput({ radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews, discovery });
  assertValid(validateEditorialInput(input), 'macro risk editorial compact input');
  writeJson(options.output, input);
  await reportWorkflowState(readiness, discovery);
  console.log(`Macro risk editorial input PASS (facts=${input.structuredFacts.length}, sources=${input.sourceRefs.length}, bytes=${Buffer.byteLength(JSON.stringify(input))}, output=${options.output})`);
}

main().catch((error) => { console.error(`Macro risk editorial input failed: ${error.message}`); process.exitCode = 1; });
