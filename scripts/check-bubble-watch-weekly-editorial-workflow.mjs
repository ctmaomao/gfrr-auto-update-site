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
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'
]) requireMarker(workflow, marker, WORKFLOW);

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
  'maxTokens: 5_000',
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
console.log('Bubble Watch weekly editorial workflow check PASS (post-refresh/manual, one DeepSeek call, protected data-only write, Pages trigger)');
