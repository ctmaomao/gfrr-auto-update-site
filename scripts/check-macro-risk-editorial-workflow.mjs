import fs from 'node:fs';

function assert(condition, message) { if (!condition) throw new Error(message); }
function count(text, needle) { return text.split(needle).length - 1; }

const path = '.github/workflows/macro-risk-editorial-refresh.yml';
assert(fs.existsSync(path), 'Macro Risk Editorial Refresh workflow is missing');
const workflow = fs.readFileSync(path, 'utf8');

for (const marker of [
  'name: Macro Risk Editorial Refresh',
  'cron: "5 0 * * *"',
  'environment: external-ai-production-refresh',
  'npm run check:macro-risk-editorial-workflow',
  'npm run collect:macro-risk-editorial-news -- --allow-network',
  'npm run build:macro-risk-editorial-input',
  'npm run run:macro-risk-editorial-deepseek -- --allow-network',
  'npm run review:macro-risk-editorial',
  'npm run project:macro-risk-editorial',
  'npm run write:macro-risk-editorial --',
  'npm run check:macro-risk-editorial-live -- --require-layer',
  'git add data/radar-data.json',
  'git push origin HEAD:main'
]) assert(workflow.includes(marker), `workflow missing ${marker}`);
assert(count(workflow, 'npm run run:macro-risk-editorial-deepseek -- --allow-network') === 1, 'workflow must call DeepSeek exactly once');
assert(workflow.includes('DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}'), 'workflow must inject DeepSeek key only at provider step');
assert(count(workflow, 'DEEPSEEK_API_KEY:') === 1, 'DeepSeek key must be scoped to one step');
assert(workflow.includes('acknowledge_cost') && workflow.includes('allow_network'), 'workflow dispatch must require network and cost acknowledgement');
assert(workflow.includes('changed_paths="$(git diff --name-only)"') && workflow.includes('if [ "$changed_paths" != "data/radar-data.json" ]'), 'workflow must protect the production write path');
assert(!fs.existsSync('.github/workflows/external-ai-production-refresh.yml'), 'legacy External AI Production Refresh workflow must be retired');
const pages = fs.readFileSync('.github/workflows/deploy-static-site-to-pages.yml', 'utf8');
assert(pages.includes('- Macro Risk Editorial Refresh'), 'Pages workflow must listen for macro editorial refresh completion');
assert(!pages.includes('- External AI Production Refresh'), 'Pages workflow must not listen for retired external AI refresh');

console.log('Macro risk editorial workflow PASS (daily 00:05 UTC, one paid call, fail-closed review/write, protected path, Pages trigger)');
