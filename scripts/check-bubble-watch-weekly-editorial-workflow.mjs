import fs from 'node:fs';

const WORKFLOW = '.github/workflows/bubble-watch-weekly-editorial-refresh.yml';
const PAGES = '.github/workflows/deploy-static-site-to-pages.yml';
const PROVIDER = 'scripts/bubble-watch/weekly-editorial-provider.mjs';
const WRITER = 'scripts/write-bubble-watch-weekly-editorial.mjs';
const errors = [];

function requireMarker(text, marker, label) {
  if (!text.includes(marker)) errors.push(`${label} missing marker: ${marker}`);
}

function forbidMarker(text, marker, label) {
  if (text.includes(marker)) errors.push(`${label} contains forbidden marker: ${marker}`);
}

function forbidExactCommand(text, command, label) {
  const lines = text.split(/\r?\n/u).map((line) => line.trim());
  if (lines.includes(command)) errors.push(`${label} contains forbidden command: ${command}`);
}

function requireReadyGate(stepName) {
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(`- name: ${escaped}\\r?\\n\\s+if: steps\\.build_input\\.outputs\\.editorial_ready == 'true'`, 'u');
  if (!pattern.test(workflow)) errors.push(`${WORKFLOW} step must be gated by editorial_ready=true: ${stepName}`);
}

const workflow = fs.readFileSync(WORKFLOW, 'utf8');
const pages = fs.readFileSync(PAGES, 'utf8');
const provider = fs.readFileSync(PROVIDER, 'utf8');
const writer = fs.readFileSync(WRITER, 'utf8');

for (const marker of [
  'name: Bubble Watch Weekly Editorial Refresh',
  'workflow_run:',
  '- Refresh Bubble Watch',
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.head_branch == 'main'",
  'acknowledge_cost:',
  'environment: external-ai-production-refresh',
  'gfrr-main-writer-main',
  'TAVILY_API_KEYS: ${{ secrets.TAVILY_API_KEYS }}',
  'BRAVE_API_KEYS: ${{ secrets.BRAVE_API_KEYS }}',
  'DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}',
  'collect:bubble-watch-weekly-news -- --allow-network',
  'id: build_input',
  'build:bubble-watch-weekly-editorial-input -- --allow-expected-news-skip',
  "if: steps.build_input.outputs.editorial_ready == 'true'",
  'check:bubble-watch-weekly-editorial-live-input',
  'run:bubble-watch-weekly-editorial-deepseek -- --allow-network',
  'review:bubble-watch-weekly-editorial',
  'project:bubble-watch-weekly-editorial',
  '--confirm-production-write',
  '--data-only',
  'changed_paths="$(git diff --name-only)"',
  'git add data/bubble-watch.json',
  'chore: refresh Bubble Watch weekly editorial',
  'git push origin HEAD:main',
  "if: steps.build_input.outputs.editorial_ready == 'false'",
  'SKIPPED_NO_CREDIBLE_NEWS: no DeepSeek call and no production write.',
  'test ! -e manual-artifacts/bubble-watch-weekly-editorial/deepseek-output-latest.json',
  'git diff --quiet --exit-code',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'
]) requireMarker(workflow, marker, WORKFLOW);

for (const stepName of [
  'Hard-check compact provider input',
  'Run one DeepSeek editorial call',
  'Review and project display-only production layer',
  'Write weekly editorial field',
  'Validate final data and repository contracts',
  'Protected path assertion',
  'Commit refreshed weekly editorial'
]) requireReadyGate(stepName);

for (const marker of [
  'schedule:',
  'continue-on-error: true',
  'WIND_API_KEY',
  'FRED_API_KEY',
  'data/radar-data.json',
  'data/bubble-watch-history.json',
  'realtime/',
  'npm run build:data',
  'gh workflow run'
]) forbidMarker(workflow, marker, WORKFLOW);
forbidExactCommand(workflow, 'npm run build:bubble-watch', WORKFLOW);

requireMarker(pages, '- Bubble Watch Weekly Editorial Refresh', PAGES);
for (const marker of [
  'maxCallsPerRun: 1',
  'retryCount: 0',
  'timeoutMs: 120_000',
  'maxTokens: 8_000',
  "response_format: { type: 'json_object' }"
]) requireMarker(provider, marker, PROVIDER);
for (const marker of [
  "const SAFE_TARGET = 'data/bubble-watch.json'",
  "new Set(['--confirm-production-write', '--data-only'])",
  'applyWeeklyEditorialProjection',
  'writeJsonAtomically'
]) requireMarker(writer, marker, WRITER);

const providerInvocationCount = workflow.split('run:bubble-watch-weekly-editorial-deepseek -- --allow-network').length - 1;
if (providerInvocationCount !== 1) errors.push(`${WORKFLOW} must invoke DeepSeek runner exactly once; got ${providerInvocationCount}`);

if (errors.length > 0) {
  console.error('Bubble Watch weekly editorial workflow check FAIL:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Bubble Watch weekly editorial workflow check PASS (post-refresh/manual, healthy no-credible expected skip, one DeepSeek call when ready, protected data-only write, Pages trigger)');
