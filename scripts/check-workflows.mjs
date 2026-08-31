import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DAILY_REFRESH_SCHEDULE_UTC } from './transport-shock-refresh-history.mjs';
import { replaceJsonBatchSafely } from './run-daily-pipeline.mjs';
import { EDITORIAL_TOPICS as BUBBLE_EDITORIAL_TOPICS } from './bubble-watch/weekly-editorial-contract.mjs';
import { EDITORIAL_TOPICS as MACRO_EDITORIAL_TOPICS } from './macro-risk/editorial-contract.mjs';
import { QUERY_SET as OIL_NEWS_QUERY_SET } from './oil-directional/diagnose-oil-news-events.mjs';

const contracts = [
  {
    file: '.github/workflows/build-realtime-market.yml',
    required: [
      'workflow_dispatch',
      "cron: '7,17,27,37,47,57 * * * *'",
      'concurrency',
      'group: gfrr-realtime-writer-realtime-data',
      "if: ${{ github.ref == 'refs/heads/main' }}",
      'permissions:',
      'contents: write',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'for attempt in 1 2 3',
      'npm ci',
      '          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}',
      'Validate realtime payload',
      'npm run check:realtime-local-schema',
      'Summarize realtime output',
      'Commit updated realtime file'
    ],
    forbidden: [
      '\n  FRED_API_KEY: ${{ secrets.FRED_API_KEY }}',
      'group: gfrr-realtime-${{ github.ref }}'
    ],
    exactlyOnce: ['FRED_API_KEY: ${{ secrets.FRED_API_KEY }}']
  },
  {
    file: '.github/workflows/recover-stale-realtime-market.yml',
    required: [
      'name: Recover Stale Realtime Market',
      'workflow_dispatch',
      "cron: '8,28,48 * * * *'",
      'permissions:',
      'contents: write',
      'concurrency',
      'group: gfrr-realtime-writer-realtime-data',
      'cancel-in-progress: false',
      "if: ${{ github.ref == 'refs/heads/main' }}",
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'node scripts/check-realtime-health.mjs --soft --github-output',
      'npm run build:realtime',
      'git push --set-upstream origin realtime-data'
    ],
    forbidden: [
      'npm run build:daily',
      'scripts/run-daily-pipeline.mjs',
      'data/radar-data.json',
      'ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION',
      'group: gfrr-realtime-${{ github.ref }}'
    ]
  },
  {
    file: '.github/workflows/build-daily-radar-data.yml',
    required: [
      'workflow_dispatch',
      'concurrency',
      'gfrr-main-writer-main',
      'git show origin/realtime-data:realtime/market.json',
      'GFRR_REALTIME_COMMIT_SHA',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'Audit Daily realtime input vs Worker preview',
      'node scripts/audit-daily-vs-worker.mjs --github-summary',
      '          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}',
      'npm run build:data',
      'npm run check:data',
      'Daily Radar Summary',
      'Decision Summary',
      'Transmission Delta Summary'
    ],
    forbidden: [
      '\n  FRED_API_KEY: ${{ secrets.FRED_API_KEY }}'
    ],
    exactlyOnce: ['FRED_API_KEY: ${{ secrets.FRED_API_KEY }}']
  },
  {
    file: '.github/workflows/deploy-static-site-to-pages.yml',
    required: [
      'workflow_run',
      'Build Daily Radar Data',
      "github.event.workflow_run.conclusion == 'success'",
      'cancel-in-progress: false',
      'npm run check:all',
      'Prepare clean Pages artifact',
      'npm run build:pages-artifact',
      'path: _site',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'fetch-depth: 0',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'upload-pages-artifact',
      'deploy-pages',
      'continue-on-error: true',
      'Wait before Pages deploy retry 1',
      'Wait before Pages deploy retry 2',
      'Wait before Pages deploy retry 3',
      'Retry deploy to GitHub Pages 1',
      'Retry deploy to GitHub Pages 2',
      'Retry deploy to GitHub Pages 3',
      'steps.deployment.outputs.page_url || steps.deployment_retry_1.outputs.page_url || steps.deployment_retry_2.outputs.page_url || steps.deployment_retry_3.outputs.page_url'
    ]
  },
  {
    file: '.github/workflows/publish-edgeone-release.yml',
    required: [
      'name: Publish EdgeOne Release Channel',
      'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true',
      'RELEASE_REPOSITORY: ctmaomao/gfrr-edgeone-release',
      'workflow_dispatch:',
      "cron: '55 */3 * * *'",
      'contents: read',
      'group: edgeone-release-publisher',
      'cancel-in-progress: false',
      "if: ${{ github.ref == 'refs/heads/main' }}",
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'npm ci',
      'npm run check:all',
      'npm run build:pages-artifact',
      'EDGEONE_RELEASE_DEPLOY_KEY: ${{ secrets.EDGEONE_RELEASE_DEPLOY_KEY }}',
      'https://api.github.com/meta',
      "rsync -a --delete --exclude='.git/'",
      "git rev-list --count --since='32 days ago' HEAD",
      '"$release_count" -ge 400',
      'git push origin main',
      'if: always()'
    ],
    forbidden: [
      'contents: write',
      'EDGEONE_API_TOKEN',
      'edgeone makers deploy',
      'secrets.GITHUB_TOKEN'
    ],
    exactlyOnce: [
      'EDGEONE_RELEASE_DEPLOY_KEY: ${{ secrets.EDGEONE_RELEASE_DEPLOY_KEY }}',
      "cron: '55 */3 * * *'",
      'git push origin main'
    ]
  },
  {
    file: '.github/workflows/check-all-pr.yml',
    required: [
      'name: Check All PR',
      'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true',
      'workflow_dispatch:',
      'pull_request:',
      'branches:',
      '- main',
      'permissions:',
      'contents: read',
      'concurrency:',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'fetch-depth: 0',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'npm ci',
      'npm audit --include=dev',
      'npx --no-install playwright install --with-deps chromium',
      'npm run test:unit:coverage',
      'npm run check:all',
      'npm run test:e2e'
    ],
    forbidden: [
      'contents: write',
      'pull_request_target',
      'secrets.',
      'git push',
      'git commit',
      'deploy-pages',
      'upload-pages-artifact'
    ]
  },
  {
    file: '.github/workflows/check-realtime-health.yml',
    required: [
      'name: Check Realtime Health',
      'workflow_dispatch',
      "cron: '13,43 * * * *'",
      'permissions:',
      'contents: read',
      'concurrency',
      'realtime-health',
      'timeout-minutes: 2',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'node scripts/check-realtime-health.mjs --github-output'
    ],
    forbidden: [
      '--fail-on-stale',
      'contents: write',
      'git push',
      'git commit',
      'wrangler deploy',
      'run-realtime',
      'run-daily',
      'npm run build:realtime',
      'npm run build:data',
      'data/radar-data.json',
      'realtime/market.json',
      'realtime-data'
    ]
  },
  {
    file: '.github/workflows/check-worker-health.yml',
    required: [
      'name: Check Worker Health',
      'workflow_dispatch',
      "cron: '16,46 * * * *'",
      'permissions:',
      'contents: read',
      'concurrency',
      'group: worker-health',
      'cancel-in-progress: true',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'node scripts/check-worker-health.mjs --github-summary --fail-on-unhealthy',
      '--snapshot-file health-worker-snapshot.json',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      'worker-health-snapshot',
      'retention-days: 14'
    ],
    forbidden: [
      'contents: write',
      'git push',
      'git commit',
      'wrangler deploy',
      'npm run build:realtime',
      'npm run build:data',
      'data/radar-data.json',
      'realtime/market.json'
    ]
  },
  {
    file: '.github/workflows/refresh-world-order-stress.yml',
    required: [
      'name: Refresh World Order Stress',
      'workflow_dispatch',
      "cron: '0 23 * * *'",
      'permissions:',
      'contents: write',
      'concurrency',
      'gfrr-main-writer-main',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'GDELT_CLOUD_API_KEY: ${{ secrets.GDELT_CLOUD_API_KEY }}',
      'npm run build:world-order',
      'npm run check:world-order',
      'data/world-order-stress.json',
      'data/gdelt-world-order-cache.json',
      'chore: refresh world order stress'
    ],
    forbidden: [
      'ACLED_USERNAME: ${{ secrets.ACLED_USERNAME }}',
      'ACLED_PASSWORD: ${{ secrets.ACLED_PASSWORD }}',
      'continue-on-error: true',
      'npm run build:data',
      'scripts/run-daily-pipeline.mjs',
      'data/radar-data.json'
    ]
  },
  {
    file: '.github/workflows/refresh-oil-thermal-watch.yml',
    required: [
      'name: Refresh Oil Thermal Watch',
      'workflow_dispatch',
      "cron: '17 */3 * * *'",
      'permissions:',
      'contents: write',
      'concurrency',
      'gfrr-main-writer-main',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'FIRMS_MAP_KEY: ${{ secrets.FIRMS_MAP_KEY }}',
      'npm run build:oil-thermal-watch',
      'npm run check:oil-thermal-watch',
      'data/oil-thermal-watch.json',
      'chore: refresh oil thermal watch',
      'git pull --rebase origin "${GITHUB_REF_NAME}"'
    ],
    forbidden: [
      'npm run build:data',
      'scripts/run-daily-pipeline.mjs',
      'data/radar-data.json',
      'data/oil-directional-pressure.json',
      'realtime/market.json'
    ]
  },
  {
    file: '.github/workflows/oil-thermal-baseline-quality-reminder.yml',
    required: [
      'name: Oil Thermal Baseline Quality Reminder',
      'workflow_dispatch',
      "cron: '47 */12 * * *'",
      'permissions:',
      'contents: read',
      'concurrency',
      'oil-thermal-baseline-quality-reminder',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'fetch-depth: 0',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'npm run monitor:oil-thermal-baseline-quality -- --github-summary',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      'oil-thermal-baseline-quality-monitor',
      'retention-days: 30'
    ],
    forbidden: [
      'contents: write',
      'git push',
      'git commit',
      'FIRMS_MAP_KEY',
      'npm run build:oil-thermal-watch',
      '--write-production-baseline',
      'data/radar-data.json',
      'data/oil-directional-pressure.json',
      'data/oil-thermal-watch.json',
      'realtime/market.json'
    ]
  },
  {
    file: '.github/workflows/oil-directional-verdict-history-monitor.yml',
    required: [
      'name: Oil Directional Verdict History Monitor',
      'workflow_dispatch',
      "cron: '29 1 * * *'",
      'permissions:',
      'contents: read',
      'concurrency',
      'oil-directional-verdict-history-monitor',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'fetch-depth: 0',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'npm run monitor:oil-directional-verdict-history -- --github-summary',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      'oil-directional-verdict-history-monitor',
      'retention-days: 30'
    ],
    forbidden: [
      'contents: write',
      'git push',
      'git commit',
      'secrets.',
      'EIA_API_KEY',
      'FIRMS_MAP_KEY',
      'TAVILY_API',
      'BRAVE_API',
      'npm run build:oil-directional',
      'npm run build:data',
      'scripts/run-daily-pipeline.mjs',
      'data/oil-directional-pressure.json',
      'data/radar-data.json',
      'realtime/market.json'
    ]
  },
  {
    file: '.github/workflows/gdelt-web-ngrams-article-shadow-readiness.yml',
    required: [
      'name: GDELT Web NGrams Article Shadow Readiness',
      'workflow_dispatch',
      "cron: '41 2 * * *'",
      'permissions:',
      'contents: read',
      'concurrency',
      'gdelt-web-ngrams-article-shadow-readiness',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'fetch-depth: 0',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'npm run review:gdelt-web-ngrams-article-shadow-history -- --github-summary',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      'gdelt-web-ngrams-article-shadow-readiness',
      'retention-days: 35'
    ],
    forbidden: [
      'contents: write',
      'git push',
      'git commit',
      'secrets.',
      'TAVILY_API',
      'BRAVE_API',
      'npm run build:oil-news-event-watch',
      'npm run build:oil-directional',
      'npm run build:data',
      'scripts/run-daily-pipeline.mjs',
      'data/oil-news-event-watch.json',
      'data/oil-directional-pressure.json',
      'data/radar-data.json',
      'realtime/market.json'
    ]
  },
  {
    file: '.github/workflows/transport-shock-confirmation-factor-production-refresh-monitor.yml',
    required: [
      'name: Transport Shock Production Refresh Monitor',
      'workflow_dispatch',
      "cron: '19 23 * * *'",
      'permissions:',
      'contents: read',
      'concurrency',
      'transport-shock-production-refresh-monitor',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'fetch-depth: 0',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'npm run monitor:transport-shock-confirmation-factor-production-refresh -- --github-summary',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      'transport-shock-production-refresh-monitor',
      'retention-days: 14'
    ],
    forbidden: [
      'contents: write',
      'git push',
      'git commit',
      'FIRMS_MAP_KEY',
      'TAVILY_API',
      'BRAVE_API',
      'npm run build:data',
      'npm run build:oil-directional',
      'scripts/run-daily-pipeline.mjs',
      'data/radar-data.json',
      'data/oil-directional-pressure.json',
      'realtime/market.json'
    ]
  },
  {
    file: '.github/workflows/refresh-oil-news-event-watch.yml',
    required: [
      'name: Refresh Oil News Event Watch',
      'workflow_dispatch',
      "cron: '37 */6 * * *'",
      'permissions:',
      'contents: write',
      'concurrency',
      'gfrr-main-writer-main',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'TAVILY_API_KEYS: ${{ secrets.TAVILY_API_KEYS }}',
      'BRAVE_API_KEYS: ${{ secrets.BRAVE_API_KEYS }}',
      'npm run build:oil-news-event-watch',
      'npm run check:oil-news-event-watch',
      'data/oil-news-event-watch.json',
      'data/gdelt-news-cache.json',
      'chore: refresh oil news event watch',
      'git pull --rebase origin "${GITHUB_REF_NAME}"'
    ],
    forbidden: [
      "cron: '37 */2 * * *'",
      "cron: '37 */3 * * 1-5'",
      "cron: '37 */4 * * 0,6'",
      'npm run build:data',
      'scripts/run-daily-pipeline.mjs',
      'data/radar-data.json',
      'data/oil-directional-pressure.json',
      'realtime/market.json'
    ]
  },
  {
    file: '.github/workflows/refresh-bubble-watch.yml',
    required: [
      'name: Refresh Bubble Watch',
      'workflow_dispatch',
      "cron: '30 5 * * 1'",
      'permissions:',
      'contents: write',
      'concurrency',
      'gfrr-main-writer-main',
      'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      'node-version: 24',
      'package-manager-cache: false',
      'FRED_API_KEY: ${{ secrets.FRED_API_KEY }}',
      'TAVILY_API_KEYS: ${{ secrets.TAVILY_API_KEYS }}',
      'BRAVE_API_KEYS: ${{ secrets.BRAVE_API_KEYS }}',
      'WIND_API_KEY: ${{ secrets.WIND_API_KEY }}',
      'npm run build:bubble-watch',
      'npm run check:bubble-watch',
      'data/bubble-watch.json',
      'data/bubble-watch-history.json',
      'data/gdelt-bubble-watch-cache.json',
      'config/bubble-watch-curated.json',
      'chore: refresh bubble watch',
      'git pull --rebase origin "${GITHUB_REF_NAME}"'
    ],
    forbidden: [
      'continue-on-error: true',
      'npm run build:data',
      'scripts/run-daily-pipeline.mjs',
      'data/radar-data.json',
      'realtime/market.json'
    ]
  },
  {
    file: '.github/workflows/bubble-watch-weekly-editorial-refresh.yml',
    required: [
      'name: Bubble Watch Weekly Editorial Refresh',
      'workflow_run:',
      '- Refresh Bubble Watch',
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.head_branch == 'main'",
      'workflow_dispatch:',
      'acknowledge_cost:',
      'permissions:',
      'contents: write',
      'actions: read',
      'gfrr-main-writer-main',
      'environment: external-ai-production-refresh',
      'TAVILY_API_KEYS: ${{ secrets.TAVILY_API_KEYS }}',
      'BRAVE_API_KEYS: ${{ secrets.BRAVE_API_KEYS }}',
      'DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}',
      'npm run check:bubble-watch-weekly-editorial-live-input',
      'npm run run:bubble-watch-weekly-editorial-deepseek -- --allow-network',
      'npm run check:all',
      'git add data/bubble-watch.json',
      'chore: refresh Bubble Watch weekly editorial',
      'git push origin HEAD:main'
    ],
    forbidden: [
      'schedule:',
      'continue-on-error: true',
      'WIND_API_KEY',
      'data/radar-data.json',
      'data/bubble-watch-history.json',
      'realtime/',
      'npm run build:data',
      'npm run build:bubble-watch\n'
    ]
  }
];

const failures = [];

function addFailure(file, missing) {
  failures.push({ file, missing });
  console.error(`Workflow contract failed: ${file} missing "${missing}"`);
}

function addForbiddenFailure(file, forbidden) {
  failures.push({ file, forbidden });
  console.error(`Workflow contract failed: ${file} must not contain "${forbidden}"`);
}

function addRuntimeFailure(file, message) {
  failures.push({ file, runtime: message });
  console.error(`Workflow runtime contract failed: ${file} ${message}`);
}

function requireSourceMarker(file, source, marker) {
  if (!source.includes(marker)) {
    addRuntimeFailure(file, `source marker missing: ${marker}`);
  }
}

for (const contract of contracts) {
  if (!fs.existsSync(contract.file)) {
    addFailure(contract.file, 'workflow file');
    continue;
  }

  const text = fs.readFileSync(contract.file, 'utf8');

  for (const needle of contract.required) {
    if (!text.includes(needle)) addFailure(contract.file, needle);
  }

  for (const needle of contract.forbidden || []) {
    if (text.includes(needle)) addForbiddenFailure(contract.file, needle);
  }

  for (const needle of contract.exactlyOnce || []) {
    const count = text.split(needle).length - 1;
    if (count !== 1) addRuntimeFailure(contract.file, `must contain exactly one "${needle}" occurrence; found ${count}`);
  }

  for (const group of contract.anyOf || []) {
    if (!group.options.some((needle) => text.includes(needle))) {
      addFailure(contract.file, `${group.label}: ${group.options.join(' | ')}`);
    }
  }
}

// Both providers include 1,000 monthly free requests. Keep a 200-request reserve
// for bounded manual reruns and key-rotation diagnostics instead of scheduling to
// the hard limit. Counts are conservative worst cases for a 31-day month.
const sharedSearchScheduledRequests =
  (31 * 4 * OIL_NEWS_QUERY_SET.length) +
  (31 * MACRO_EDITORIAL_TOPICS.length) +
  5 + // weekly Bubble Watch refresh: one CEO-news query per provider
  20 + // Tuesday-Friday source audit: at most 20 runs in a 31-day month
  (5 * BUBBLE_EDITORIAL_TOPICS.length);
const sharedSearchManualReserve = 200;
const sharedSearchMonthlyLimit = 1000;
if (sharedSearchScheduledRequests + sharedSearchManualReserve > sharedSearchMonthlyLimit) {
  addRuntimeFailure(
    '.github/workflows/refresh-oil-news-event-watch.yml',
    `shared Tavily/Brave monthly budget exceeds limit: scheduled=${sharedSearchScheduledRequests}, reserve=${sharedSearchManualReserve}, limit=${sharedSearchMonthlyLimit}`
  );
}
console.log(`Shared Tavily/Brave monthly budget: scheduled=${sharedSearchScheduledRequests}, reserve=${sharedSearchManualReserve}, limit=${sharedSearchMonthlyLimit}`);

const gitignoreFile = '.gitignore';
if (fs.existsSync(gitignoreFile)) {
  const ignored = new Set(fs.readFileSync(gitignoreFile, 'utf8').split(/\r?\n/u).map((line) => line.trim()));
  for (const entry of ['.codex/', '.env', '.env.*', '.dev.vars', '.dev.vars.*', '.wrangler/', 'workers/gfrr-realtime-worker/wrangler.toml']) {
    if (!ignored.has(entry)) addRuntimeFailure(gitignoreFile, `missing local secret/config ignore: ${entry}`);
  }
} else {
  addRuntimeFailure(gitignoreFile, 'file missing');
}

const mainWriterWorkflows = [
  'build-daily-radar-data.yml',
  'macro-risk-editorial-refresh.yml',
  'refresh-bubble-watch.yml',
  'refresh-oil-directional-pressure.yml',
  'refresh-oil-news-event-watch.yml',
  'refresh-oil-thermal-watch.yml',
  'refresh-qqq-market-pricing.yml',
  'refresh-world-order-stress.yml'
];
const scopedMainWriterGates = {
  'macro-risk-editorial-refresh.yml': 'npm run check:macro-risk-editorial-live -- --require-layer',
};
for (const workflow of mainWriterWorkflows) {
  const file = `.github/workflows/${workflow}`;
  const text = fs.readFileSync(file, 'utf8');
  requireSourceMarker(file, text, 'group: gfrr-main-writer-main');
  requireSourceMarker(file, text, 'cancel-in-progress: false');
  requireSourceMarker(file, text, 'queue: max');
  requireSourceMarker(file, text, "if: ${{ github.ref == 'refs/heads/main' }}");
  requireSourceMarker(file, text, 'ref: main');
  requireSourceMarker(file, text, 'fetch-depth: 0');
  requireSourceMarker(file, text, 'git pull --ff-only origin main');
  const requiredGate = scopedMainWriterGates[workflow] || 'npm run check:all';
  const fullCheckIndex = text.indexOf(requiredGate);
  const commitIndex = text.indexOf('git commit');
  if (fullCheckIndex === -1 || commitIndex === -1 || fullCheckIndex > commitIndex) {
    addRuntimeFailure(file, `must run ${requiredGate} before committing to main`);
  }
}

const workflowDir = '.github/workflows';
const workflowFiles = fs.existsSync(workflowDir)
  ? fs.readdirSync(workflowDir)
    .filter((file) => /\.ya?ml$/u.test(file))
    .map((file) => `${workflowDir}/${file}`)
  : [];

const forbiddenRuntimePatterns = [
  [/actions\/checkout@v4/u, 'must not use actions/checkout@v4'],
  [/actions\/checkout@v5/u, 'must not use actions/checkout@v5'],
  [/actions\/setup-node@v4/u, 'must not use actions/setup-node@v4'],
  [/actions\/setup-node@v5/u, 'must not use actions/setup-node@v5'],
  [/actions\/upload-artifact@v4/u, 'must not use actions/upload-artifact@v4'],
  [/actions\/download-artifact@v4/u, 'must not use actions/download-artifact@v4'],
  [/node-version:\s*['"]?20(?:\.x)?['"]?/u, 'must not use node-version 20'],
  [/node20/u, 'must not use node20'],
  [/ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/u, 'must not use ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION'],
  [/FORCE_JAVASCRIPT_ACTIONS_TO_NODE20/u, 'must not use FORCE_JAVASCRIPT_ACTIONS_TO_NODE20'],
  // ACLED is manual xlsx only — no automated access from ANY workflow.
  // Authority: docs/DATA_SOURCES.md:310 (EULA §3.3 bans scraping/crawling), AGENTS.md:86/88
  // (no ACLED_API_KEY / ACLED_EMAIL / api.acleddata.com; reminder workflows must not make any
  // network request to acleddata.com), docs/WORLD_ORDER_STRESS.md:87.
  // Precise by design: matches any ACLED_* secret injection, the API subdomain/paths, and scripted
  // network verbs hitting acleddata.com — NOT the bare domain, so the acled-*-refresh-reminder
  // workflows may still cite the public download URL (acleddata.com/conflict-data/...) in text.
  [/secrets\.ACLED_/u, 'must not inject any ACLED_* secret — ACLED is manual xlsx only (docs/DATA_SOURCES.md:310 / AGENTS.md:86 / EULA §3.3)'],
  [/api\.acleddata\.com/u, 'must not reference the ACLED API subdomain api.acleddata.com — ACLED is manual xlsx only (AGENTS.md:86)'],
  [/acleddata\.com\/(?:oauth|api)/u, 'must not call ACLED oauth/api endpoints — ACLED is manual xlsx only (docs/DATA_SOURCES.md:310 / EULA §3.3)'],
  [/(?:curl|wget)\s[^\n]*acleddata\.com/u, 'must not curl/wget acleddata.com — ACLED EULA §3.3 bans scraping; reminders must not contact acleddata.com (AGENTS.md:88)'],
  [/fetch\([^\n]*acleddata\.com/u, 'must not fetch() acleddata.com — ACLED is manual xlsx only (docs/DATA_SOURCES.md:310 / EULA §3.3)']
];

function hasNode24ActionsEnv(text) {
  return /^env:\s*\r?\n(?:[ \t]+[^\r\n]*\r?\n)*[ \t]+FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true\s*$/mu.test(text);
}

function getStepBlock(text, index) {
  const rest = text.slice(index);
  const nextStep = rest.slice(1).search(/\n\s+-\s+name:/u);
  return nextStep === -1 ? rest : rest.slice(0, nextStep + 1);
}

const dailyWorkflowFile = '.github/workflows/build-daily-radar-data.yml';
const auditScriptFile = 'scripts/audit-daily-vs-worker.mjs';
const workerHealthScriptFile = 'scripts/check-worker-health.mjs';
const workerHealthSnapshotReviewScriptFile = 'scripts/review-worker-health-snapshot.mjs';
const packageFile = 'package.json';
const secondaryConsolidationDocs = [
  'AGENTS.md',
  'docs/DATA_CONTRACT.md',
  'docs/OPERATIONS.md',
  'workers/gfrr-realtime-worker/README.md',
];
const g4cRuntimeDocs = [
  'AGENTS.md',
  'docs/DATA_CONTRACT.md',
  'docs/OPERATIONS.md',
  'workers/gfrr-realtime-worker/README.md',
];
const releaseStateDocs = [
  'AGENTS.md',
  'docs/DATA_CONTRACT.md',
  'docs/OPERATIONS.md',
  'workers/gfrr-realtime-worker/README.md',
];
const operationsRunbookFile = 'docs/OPERATIONS.md';
const dataContractFile = 'docs/DATA_CONTRACT.md';
const validateDataScriptFile = 'scripts/validate-data.mjs';
const worldOrderDataFile = 'data/world-order-stress.json';
const worldOrderDocFile = 'docs/WORLD_ORDER_STRESS.md';
const worldOrderSipriExampleFile = 'config/world-order-sipri-normalized.example.json';
const worldOrderBuildScriptFile = 'scripts/build-world-order-stress.mjs';
const worldOrderCheckScriptFile = 'scripts/check-world-order-stress.mjs';
const worldOrderReviewScriptFile = 'scripts/review-world-order-stress.mjs';
const worldOrderReliefWebDiagnosisFile = 'scripts/world-order/diagnose-reliefweb-source.mjs';
const worldOrderOfacFile = 'scripts/world-order/fetch-ofac.mjs';
const worldOrderSourceReviewFile = 'docs/WORLD_ORDER_SOURCE_REVIEW.md';
const worldOrderRequiredFiles = [
  'scripts/build-world-order-stress.mjs',
  'scripts/check-world-order-stress.mjs',
  'scripts/world-order/fetch-gdelt-cloud.mjs',
  'scripts/world-order/fetch-ofac.mjs',
  'scripts/world-order/import-sipri.mjs',
  'scripts/world-order/fetch-acled.mjs',
  'scripts/world-order/score-world-order-stress.mjs',
  'scripts/world-order/classify-world-order-state.mjs',
  'scripts/world-order/build-market-confirmation.mjs',
];
const worldOrderForbiddenPhrases = [
  ['WW3 ', '概率'].join(''),
  ['世界大战', '即将爆发'].join(''),
  ['战争', '已确认'].join(''),
  ['已经进入', '第三次世界大战'].join(''),
  ['13 步', '已走几步'].join(''),
  ['世界大战', '第几步'].join(''),
];
const workerContract = {
  mainPreviewFile: 'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  routerFile: 'workers/gfrr-realtime-worker/src/index.js',
  mainPreviewForbidden: [
    'secondarySources',
    'secondaryDiagnostics',
    'secondarySourceSummary',
    'market:secondary-preview',
    '/market.secondary-preview.json',
    'VIX_History',
    'CBOE_VIX_HISTORY_URL',
    'yahoo:GC=F',
    'GC%3DF',
    'yahoo:DX-Y.NYB',
    'DX-Y.NYB',
    'yahoo:^TNX',
    '%5ETNX',
    'yahoo:^GSPC',
    '%5EGSPC'
  ],
  routerRequired: [
    'market:secondary-preview',
    '/market.secondary-preview.json',
    'CBOE_VIX_HISTORY_URL',
    'YAHOO_GOLD_SECONDARY_URL',
    'YAHOO_DXY_SECONDARY_URL',
    'YAHOO_US10Y_SECONDARY_URL',
    'YAHOO_SPX_SECONDARY_URL',
    'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=5d',
    'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d',
    'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d',
    'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d',
    'parseYahooGoldChart',
    'parseYahooDxyChart',
    'parseYahooUs10yChart',
    'parseYahooSpxChart',
    'fetchYahooGoldSecondaryLatest',
    'fetchYahooDxySecondaryLatest',
    'fetchYahooUs10ySecondaryLatest',
    'fetchYahooSpxSecondaryLatest',
    'yahoo:GC=F',
    'yahoo:DX-Y.NYB',
    'yahoo:^TNX',
    'yahoo:^GSPC',
    'rawValue',
    'normalization',
    'normalizationReason',
    'raw-yahoo-tnx-appears-times-10',
    'raw-yahoo-tnx-already-percent',
    'no-valid-yahoo-tnx-value',
    'tryWriteSecondaryPreview',
    'key === MARKET_PREVIEW_KEY',
    'readPreviousWorkerPreviewSummary',
    'previousPreviewSummary',
    'previousSourceProbe',
    "runtimeBudget: 'free-tier-10ms'",
    "text.lastIndexOf('\\n'"
  ],
  brentAuditRequired: [
    'buildBrentAudit',
    'buildBrentPromotionDecision',
    'buildBrentSourceProbe',
    'selectPreviousBrentReference',
    'buildMoveAssessment',
    'brentValidation.audit',
    'brentValidation.promotion',
    'sourceProbe',
    'selectedSource',
    'promoteDecision',
    'moveStatus',
    'promotedChangePct',
    'confirmed-extreme-move',
    'unconfirmed-jump-hold',
    'extremeMoveConfirmedBy',
    'BRENT_ANCHOR_STALE_HOURS',
    'BRENT_CONFIRMATION_FRESH_HOURS',
    'BRENT_PROMOTION_MAX_DIVERGENCE_PCT',
    'BRENT_EXTREME_CONFIRMATION_DIVERGENCE_PCT',
    'google-finance:BZW00:NYMEX',
    'html-experimental',
    'Google Finance HTML may contain futures-chain zero / non-primary price',
    'google-finance:BZW00:NYMEX canonical',
    'google-finance:BZY00:NYMEX front-month',
    'tradingeconomics:brent-crude-oil',
    'parseTradingEconomicsObservedAt',
    'tradingeconomics-observedAt-invalid',
    'tradingeconomics-confirmation-stale',
    'tradingEconomicsAgeHours',
    'tradingeconomics-observedAt-unparsed',
    'tradingeconomics-observedAt-within-48h',
    'tradingeconomics-observedAt-stale',
    'yahoo:BZ=F',
    'excluded-non-positive-or-invalid'
  ],
  sourceProbeRequired: [
    'WORKER_FETCH_TIMEOUT_MS = 4500',
    'SOURCE_PROBE_FETCH_TIMEOUT_MS = 4000',
    'AbortController',
    'options.timeoutMs',
    'clearTimeout(timer)',
    'timeout after ${timeoutMs}ms',
    'PROBE_SAMPLE_ROW_LIMIT = 3',
    'PROBE_SNIPPET_LIMIT = 120',
    'SOURCE_PROBE_FREQUENCY_MINUTES = 60',
    'frequencyMinutes: SOURCE_PROBE_FREQUENCY_MINUTES',
    'reused: true',
    'reused: false',
    'source-probe-reused-within-60m',
    'source-probe-refresh-deferred-free-tier-cpu-budget',
    'deferred-free-tier-cpu-budget',
    'probeCount: probes.length',
    'fullHtmlStored: false',
    'fullCsvStored: false',
    'maxSampleRows: PROBE_SAMPLE_ROW_LIMIT',
    'maxSnippetChars: PROBE_SNIPPET_LIMIT',
    'role: \'diagnostic-only\'',
    'affectsPromotion: false',
    'participatesInConsensus: false',
    'promotionEligible: false',
    'unreliable-html-parse',
    'google-finance:BZW00:NYMEX canonical',
    'google-finance:BZY00:NYMEX front-month'
  ],
  brentPrimaryForbiddenPatterns: [
    [/values\.brent\s*=\s*.*recommendedValue/u, 'must not assign values.brent directly from consensus recommendedValue'],
    [/values\[['"]brent['"]\]\s*=\s*.*recommendedValue/u, 'must not assign values[brent] directly from consensus recommendedValue'],
    [/values\.brent[\s\S]{0,80}consensusValue/u, 'must not connect values.brent directly to consensusValue'],
    [/values\.brent\s*=\s*.*sourceProbe/u, 'must not assign values.brent from sourceProbe'],
    [/values\[['"]brent['"]\]\s*=\s*.*sourceProbe/u, 'must not assign values[brent] from sourceProbe']
  ]
};

for (const file of workflowFiles) {
  const text = fs.readFileSync(file, 'utf8');

  for (const match of text.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)) {
    const actionRef = match[1].replace(/['"]/gu, '');
    if (actionRef.startsWith('./')) continue;
    if (!/^[^@\s]+@[a-f0-9]{40}$/u.test(actionRef)) {
      addRuntimeFailure(file, `external action must be pinned to a full commit SHA: ${actionRef}`);
    }
  }

  for (const [pattern, message] of forbiddenRuntimePatterns) {
    if (pattern.test(text)) addRuntimeFailure(file, message);
  }

  if (!hasNode24ActionsEnv(text)) {
    addRuntimeFailure(file, 'must set top-level FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true');
  }

  const checkoutMatches = text.match(/actions\/checkout@[^\s'"]+/gu) || [];
  for (const match of checkoutMatches) {
    if (match !== 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10') {
      addRuntimeFailure(file, `uses ${match}; expected actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10`);
    }
  }

  const setupNodeMatches = text.match(/actions\/setup-node@[^\s'"]+/gu) || [];
  for (const match of setupNodeMatches) {
    if (match !== 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e') {
      addRuntimeFailure(file, `uses ${match}; expected actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`);
    }
  }

  for (const match of text.matchAll(/actions\/setup-node@[^\s'"]+/gu)) {
    const stepBlock = getStepBlock(text, match.index);
    if (!/node-version:\s*['"]?24['"]?/u.test(stepBlock)) {
      addRuntimeFailure(file, 'uses setup-node but does not set node-version: 24');
    }
  }

  const uploadArtifactMatches = text.match(/actions\/upload-artifact@[^\s'"]+/gu) || [];
  for (const match of uploadArtifactMatches) {
    if (match !== 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a') {
      addRuntimeFailure(file, `uses ${match}; expected actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`);
    }
  }
}

for (const file of [
  '.github/workflows/acled-weekly-refresh-reminder.yml',
  '.github/workflows/acled-monthly-refresh-reminder.yml'
]) {
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'ACLED reminder workflow missing');
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  if (file.includes('acled-weekly') && !text.includes("cron: '0 0 * * *'")) {
    addRuntimeFailure(file, 'ACLED weekly reminder must scan HDX metadata daily so weekly releases are caught promptly.');
  }
  for (const needle of [
    'https://data.humdata.org/api/3/action/package_show',
    'political-violence-events-and-fatalities',
    'civilian-targeting-events-and-fatalities',
    'demonstration-events',
    'hdx_acled_asof_ready',
    'state: \'all\'',
    'per_page: 100',
    'does not download HDX data files',
    'does not contact acleddata.com'
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(file, `missing HDX-gated ACLED reminder marker "${needle}"`);
    }
  }
  for (const forbiddenNeedle of [
    'actions/checkout@',
    'npm ci',
    'npm install',
    'acled:sanitize',
    'scripts/world-order/sanitize-acled',
    'curl ',
    'wget '
  ]) {
    if (text.includes(forbiddenNeedle)) {
      addRuntimeFailure(file, `ACLED reminder must stay metadata-only; found "${forbiddenNeedle}"`);
    }
  }
}

{
  const file = '.github/workflows/refresh-oil-directional-pressure.yml';
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'Oil Directional Pressure refresh workflow missing');
  } else {
    const text = fs.readFileSync(file, 'utf8');
    for (const needle of [
      "cron: '45 23 * * *'",
      'after Build Daily Radar Data (22:30)',
      'fresh radar market proxies',
      'EIA WPSR remains the weekly physical anchor',
      'npm run build:oil-directional',
      'npm run check:oil-directional',
      'data/oil-directional-pressure.json'
    ]) {
      if (!text.includes(needle)) {
        addRuntimeFailure(file, `missing ODP daily refresh marker "${needle}"`);
      }
    }
    if (text.includes('continue-on-error: true')) {
      addRuntimeFailure(file, 'ODP builder failure must stop the refresh before stale artifact checks');
    }
  }
}

if (fs.existsSync(dailyWorkflowFile)) {
  const text = fs.readFileSync(dailyWorkflowFile, 'utf8');
  if (text.includes('--fail-on-large-drift')) {
    addRuntimeFailure(dailyWorkflowFile, 'Daily workflow must not enable --fail-on-large-drift');
  }
  for (const forbiddenNeedle of [
    'market.worker-preview.json > realtime/market.json',
    'curl https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.worker-preview.json',
    'wget https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.worker-preview.json',
  ]) {
    if (text.includes(forbiddenNeedle)) {
      addRuntimeFailure(dailyWorkflowFile, `Daily input must not be replaced by Worker endpoint: "${forbiddenNeedle}"`);
    }
  }
} else {
  addRuntimeFailure(dailyWorkflowFile, 'Daily workflow file missing');
}

if (!fs.existsSync(auditScriptFile)) {
  addRuntimeFailure(auditScriptFile, 'Daily vs Worker audit script missing');
}

if (fs.existsSync(workerHealthSnapshotReviewScriptFile)) {
  const text = fs.readFileSync(workerHealthSnapshotReviewScriptFile, 'utf8');
  for (const needle of [
    'Worker Health Snapshot Review',
    'schemaVersion',
    'tradingEconomics',
    'SourceProbe',
    'Secondary',
    'PASS',
    'WARN',
    'FAIL',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(workerHealthSnapshotReviewScriptFile, `missing snapshot review marker "${needle}"`);
    }
  }
  for (const forbiddenNeedle of [
    'fetch(',
    'wrangler',
    'GFRR_MARKET_KV',
    'put(',
    'data/radar-data.json',
    'realtime/market.json',
  ]) {
    if (text.includes(forbiddenNeedle)) {
      addRuntimeFailure(workerHealthSnapshotReviewScriptFile, `snapshot review helper must remain local read-only; found "${forbiddenNeedle}"`);
    }
  }
} else {
  addRuntimeFailure(workerHealthSnapshotReviewScriptFile, 'Worker health snapshot review script missing');
}

if (fs.existsSync(workerHealthScriptFile)) {
  const text = fs.readFileSync(workerHealthScriptFile, 'utf8');
  for (const needle of [
    'market.worker-preview.json',
    'market.secondary-preview.json',
    'FETCH_TIMEOUT_MS = 4500',
    '--github-summary',
    '--fail-on-unhealthy',
    '--snapshot-file',
    'schemaVersion',
    'v28.0G-7A',
    'worker-first-hard-gate',
    'tradingEconomics',
    'validateSnapshotPath',
    'data/ or realtime/',
    'Worker-first Health Check',
    'hard gate for Cloudflare Worker runtime',
    'Worker-first runtime is healthy',
    'Investigate Worker runtime',
    'secondarySources',
    'secondaryDiagnostics',
    'secondarySourceSummary',
    'sourceProbe.frequencyMinutes !== 60',
    'sourceProbe.probeCount',
    'CORE_SECONDARY_SET',
    'vix',
    'gold',
    'dxy',
    'us10y',
    'spx',
    'parseObservedAt',
    'observedAgeHours',
    'freshnessStatus',
    'freshnessReason',
    'market-closed-stale-ok',
    'stale-warning',
    'stale-critical',
    'missing-observedAt',
    'unparsable-observedAt',
    'cboe:VIX_History',
    'yahoo:GC=F',
    'yahoo:DX-Y.NYB',
    'yahoo:^TNX',
    'yahoo:^GSPC',
    'divide-by-10',
    'no-op',
    'unknown',
    'normalizationReason',
    'rawValue',
    'rawValue > 20',
    'rawValue <= 20',
    'VIX, Gold, DXY, US10Y, and SPX secondary sources are all missing',
    'participatesInPrimary !== false',
    'participatesInValidation !== false',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(workerHealthScriptFile, `missing Worker health contract "${needle}"`);
    }
  }
  for (const forbiddenNeedle of [
    'GFRR_MARKET_KV',
    'data/radar-data.json',
    'realtime/market.json',
  ]) {
    if (text.includes(forbiddenNeedle)) {
      addRuntimeFailure(workerHealthScriptFile, `Worker health check must remain read-only; found "${forbiddenNeedle}"`);
    }
  }
} else {
  addRuntimeFailure(workerHealthScriptFile, 'Worker health check script missing');
}

const realtimeHealthScriptFile = 'scripts/check-realtime-health.mjs';
if (fs.existsSync(realtimeHealthScriptFile)) {
  const text = fs.readFileSync(realtimeHealthScriptFile, 'utf8');
  for (const needle of [
    'fallback/Daily baseline observation',
    'Realtime-data Health',
    'soft observer for fallback / Daily baseline',
    'This check does not represent the Worker-first runtime health',
    'Worker-first runtime hard fail',
    'Check Worker Health',
    'GITHUB_STEP_SUMMARY',
    'soft-fail mode',
    'shouldRecover',
    '--fail-on-stale',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(realtimeHealthScriptFile, `missing soft-fail realtime health contract "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(realtimeHealthScriptFile, 'Realtime health check script missing');
}

for (const file of secondaryConsolidationDocs) {
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'secondary diagnostics consolidation document missing');
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of [
    'core secondary set',
    'vix',
    'gold',
    'dxy',
    'us10y',
    'spx',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(file, `missing secondary diagnostics consolidation marker "${needle}"`);
    }
  }
}

for (const file of g4cRuntimeDocs) {
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'G-4C runtime document missing');
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of [
    'G-4C',
    'Trading Economics freshness hard gate',
    'tradingeconomics-observedAt-invalid',
    'tradingeconomics-confirmation-stale',
    'observedAt failure does not make candidate ok false',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(file, `missing G-4C runtime marker "${needle}"`);
    }
  }
}

for (const file of releaseStateDocs) {
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'release state document missing');
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of [
    'v28.0G-4C',
    'Trading Economics freshness hard gate',
    'worker-health-snapshot',
    'review:worker-health-snapshot',
    'Operations Runbook',
    'KV write guard deferred',
    'PR #53 superseded',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(file, `missing release state marker "${needle}"`);
    }
  }
}

if (fs.existsSync(operationsRunbookFile)) {
  const text = fs.readFileSync(operationsRunbookFile, 'utf8');
  for (const needle of [
    'v28.0G-6 Operations Runbook',
    'Check Worker Health',
    'Check Realtime Health',
    'Recover Stale Realtime Market',
    'Trading Economics freshness',
    'SourceProbe',
    'Cloudflare KV usage',
    'Rollback',
    'No rollback',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(operationsRunbookFile, `missing G-6 operations runbook marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(operationsRunbookFile, 'G-6 operations runbook document missing');
}

if (fs.existsSync(dataContractFile)) {
  const text = fs.readFileSync(dataContractFile, 'utf8');
  for (const needle of [
    'Worker-first runtime hard gate',
    'fallback / Daily baseline soft observer',
    'tradingeconomics-observedAt-invalid',
    'tradingeconomics-confirmation-stale',
    'promotionApplied',
    'moveStatus',
    'freshnessStatus',
    'secondary pollution',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(dataContractFile, `missing G-6 data contract marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(dataContractFile, 'data contract document missing');
}

const readmeText = fs.existsSync('README.md') ? fs.readFileSync('README.md', 'utf8') : '';
const agentsText = fs.existsSync('AGENTS.md') ? fs.readFileSync('AGENTS.md', 'utf8') : '';
for (const needle of [
  'serial trunk mode',
  'latest main',
  'no stacked PR',
]) {
  if (!agentsText.includes(needle)) {
    addRuntimeFailure('AGENTS.md', `missing serial trunk marker "${needle}"`);
  }
}
for (const needle of [
  'Operations Runbook',
  'PR #53 superseded',
  'KV write guard deferred',
]) {
  if (!readmeText.includes(needle) && !agentsText.includes(needle)) {
    addRuntimeFailure('README.md / AGENTS.md', `missing G-6 repository marker "${needle}"`);
  }
}

if (fs.existsSync(packageFile)) {
  const packageText = fs.readFileSync(packageFile, 'utf8');
  if (!packageText.includes('"audit:daily-worker": "node scripts/audit-daily-vs-worker.mjs"')) {
    addRuntimeFailure(packageFile, 'missing audit:daily-worker package script');
  }
  if (!packageText.includes('"check:worker-health": "node scripts/check-worker-health.mjs"')) {
    addRuntimeFailure(packageFile, 'missing check:worker-health package script');
  }
  if (!packageText.includes('"review:worker-health-snapshot": "node scripts/review-worker-health-snapshot.mjs"')) {
    addRuntimeFailure(packageFile, 'missing review:worker-health-snapshot package script');
  }
  if (!packageText.includes('"bump:frontend-asset-version": "node scripts/bump-frontend-asset-version.mjs"')) {
    addRuntimeFailure(packageFile, 'missing bump:frontend-asset-version package script');
  }
  if (!packageText.includes('"check:data:verbose": "node scripts/validate-data.mjs --verbose"')) {
    addRuntimeFailure(packageFile, 'missing check:data:verbose package script');
  }
  if (!packageText.includes('"check:data:strict-live-alignment": "node scripts/validate-data.mjs --strict-live-alignment"')) {
    addRuntimeFailure(packageFile, 'missing check:data:strict-live-alignment package script');
  }
  if (!packageText.includes('"build:world-order": "node scripts/build-world-order-stress.mjs"')) {
    addRuntimeFailure(packageFile, 'missing build:world-order package script');
  }
  if (!packageText.includes('"check:world-order": "node scripts/check-world-order-stress.mjs"')) {
    addRuntimeFailure(packageFile, 'missing check:world-order package script');
  }
  if (!packageText.includes('"review:world-order": "node scripts/review-world-order-stress.mjs data/world-order-stress.json"')) {
    addRuntimeFailure(packageFile, 'missing review:world-order package script');
  }
  if (!packageText.includes('"diagnose:reliefweb": "node scripts/world-order/diagnose-reliefweb-source.mjs"')) {
    addRuntimeFailure(packageFile, 'missing diagnose:reliefweb package script');
  }
  const checkAllMatch = packageText.match(/"check:all":\s*"([^"]+)"/u);
  const checkAllScript = checkAllMatch?.[1] || '';
  if (!checkAllScript.includes('npm run check:world-order')) {
    addRuntimeFailure(packageFile, 'check:all must include check:world-order');
  }
  if (checkAllScript.includes('build:world-order')) {
    addRuntimeFailure(packageFile, 'check:all must not run build:world-order');
  }
} else {
  addRuntimeFailure(packageFile, 'package.json missing');
}

for (const file of worldOrderRequiredFiles) {
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'world order stress pipeline file missing');
  }
}
if (fs.existsSync(worldOrderBuildScriptFile)) {
  const text = fs.readFileSync(worldOrderBuildScriptFile, 'utf8');
  for (const needle of [
    'World Order Stress Build Summary',
    'Sources',
    'Market confirmation',
    'GDELT',
    'OFAC',
    'SIPRI',
    'ACLED',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderBuildScriptFile, `missing build summary marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderBuildScriptFile, 'world order build script missing');
}
if (fs.existsSync(worldOrderCheckScriptFile)) {
  const text = fs.readFileSync(worldOrderCheckScriptFile, 'utf8');
  for (const needle of [
    'World Order Stress Check',
    'Result: PASS',
    'marketConfirmationSource',
    'gdeltStatus',
    'sipriStatus',
    'acledStatus',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderCheckScriptFile, `missing check summary marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderCheckScriptFile, 'world order check script missing');
}
if (fs.existsSync(worldOrderReviewScriptFile)) {
  const text = fs.readFileSync(worldOrderReviewScriptFile, 'utf8');
  for (const needle of ['PASS', 'WARN', 'FAIL']) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderReviewScriptFile, `missing review marker "${needle}"`);
    }
  }
  for (const forbiddenNeedle of ['fetch(', 'writeFile', 'writeFileSync']) {
    if (text.includes(forbiddenNeedle)) {
      addRuntimeFailure(worldOrderReviewScriptFile, `review:world-order must remain local read-only; found "${forbiddenNeedle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderReviewScriptFile, 'world order review helper missing');
}
if (fs.existsSync(worldOrderReliefWebDiagnosisFile)) {
  const text = fs.readFileSync(worldOrderReliefWebDiagnosisFile, 'utf8');
  for (const needle of [
    'ReliefWeb Source Diagnosis Summary',
    'reliefweb-currently-healthy',
    'reliefweb-query-too-narrow',
    'reliefweb-network-or-availability',
    'reliefweb-rate-limited',
    'reliefweb-api-contract-changed',
    'delay',
    'timeout',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderReliefWebDiagnosisFile, `missing ReliefWeb diagnosis marker "${needle}"`);
    }
  }
  for (const forbiddenNeedle of [
    'data/world-order-stress.json',
    'writeFileSync',
    'GFRR_MARKET_KV',
    'wrangler',
  ]) {
    if (text.includes(forbiddenNeedle)) {
      addRuntimeFailure(worldOrderReliefWebDiagnosisFile, `diagnose:reliefweb must remain diagnostic-only; found "${forbiddenNeedle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderReliefWebDiagnosisFile, 'ReliefWeb diagnosis script missing');
}
if (fs.existsSync(worldOrderSourceReviewFile)) {
  const text = fs.readFileSync(worldOrderSourceReviewFile, 'utf8');
  for (const needle of [
    'GDELT DOC 2.0',
    'GDELT Context 2.0',
    'ACLED',
    'ReliefWeb',
    'OFAC',
    'SIPRI',
    'requires_key',
    'not_now',
    'v28.0H-4B',
    'diagnose:reliefweb',
    '不接入 scoring',
    '不写 data/world-order-stress.json',
    'v28.0H-4C ReliefWeb Fallback Adapter',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderSourceReviewFile, `missing source review marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderSourceReviewFile, 'world order source review document missing');
}
if (!fs.existsSync(worldOrderDataFile)) {
  addRuntimeFailure(worldOrderDataFile, 'world order stress data product missing');
} else {
  const text = fs.readFileSync(worldOrderDataFile, 'utf8');
  if (!text.includes('marketConfirmationInput')) {
    addRuntimeFailure(worldOrderDataFile, 'missing marketConfirmationInput');
  }
  for (const needle of [
    'usedCachedSummary',
    'successCount',
    'rateLimitedCount',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderDataFile, `missing GDELT hardening marker "${needle}"`);
    }
  }
  for (const phrase of worldOrderForbiddenPhrases) {
    if (text.includes(phrase)) {
      addRuntimeFailure(worldOrderDataFile, `must not contain forbidden phrase "${phrase}"`);
    }
  }
}
const worldOrderMarketConfirmationFile = 'scripts/world-order/build-market-confirmation.mjs';
if (fs.existsSync(worldOrderMarketConfirmationFile)) {
  const text = fs.readFileSync(worldOrderMarketConfirmationFile, 'utf8');
  for (const needle of [
    'worker-generated-preview',
    'local-realtime',
    'daily-baseline',
    'marketConfirmationInput',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderMarketConfirmationFile, `missing market confirmation source marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderMarketConfirmationFile, 'world order market confirmation script missing');
}
const worldOrderGdeltFile = 'scripts/world-order/fetch-gdelt-cloud.mjs';
if (fs.existsSync(worldOrderGdeltFile)) {
  const text = fs.readFileSync(worldOrderGdeltFile, 'utf8');
  for (const needle of [
    'GDELT_CLOUD_API_KEY',
    '../gdelt/fetch-gdelt.mjs',
    'fetchGdeltCloudJson',
    'DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT',
    'KEY_CONFLICT_REGIONS',
    'successCount',
    'usedCachedSummary',
    'cacheReason',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderGdeltFile, `missing GDELT throttle/cache marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderGdeltFile, 'world order GDELT fetcher missing');
}
if (fs.existsSync(worldOrderOfacFile)) {
  const text = fs.readFileSync(worldOrderOfacFile, 'utf8');
  for (const needle of [
    'DEFAULT_OFAC_RECENT_ACTIONS_URL',
    'ALLOWED_OFAC_HOSTS',
    'ofac.treasury.gov',
    'function normalizeOfacUrl',
    "url.protocol !== 'https:'",
    '!ALLOWED_OFAC_HOSTS.has(url.hostname)',
    'normalizeOfacUrl(config.recentActionsUrl)',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderOfacFile, `missing OFAC URL allowlist guard "${needle}"`);
    }
  }
  if (/const\s+url\s*=\s*config\.recentActionsUrl\s*\|\|/u.test(text)) {
    addRuntimeFailure(worldOrderOfacFile, 'OFAC recentActionsUrl must be normalized before fetch');
  }
} else {
  addRuntimeFailure(worldOrderOfacFile, 'world order OFAC fetcher missing');
}
if (fs.existsSync(worldOrderSipriExampleFile)) {
  const text = fs.readFileSync(worldOrderSipriExampleFile, 'utf8');
  for (const needle of [
    'exampleOnly',
    'notForScoring',
    'SIPRI Military Expenditure Database',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderSipriExampleFile, `missing SIPRI example marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderSipriExampleFile, 'SIPRI normalized example file missing');
}
const worldOrderSipriImporterFile = 'scripts/world-order/import-sipri.mjs';
if (fs.existsSync(worldOrderSipriImporterFile)) {
  const text = fs.readFileSync(worldOrderSipriImporterFile, 'utf8');
  for (const needle of [
    'world-order-sipri-normalized.json',
    'exampleOnly',
    'notForScoring',
    'quality.isRealData',
    'manual_required',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderSipriImporterFile, `missing SIPRI importer marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderSipriImporterFile, 'world order SIPRI importer missing');
}
if (fs.existsSync(worldOrderDataFile)) {
  const text = fs.readFileSync(worldOrderDataFile, 'utf8');
  if (/"status":\s*"ok"[\s\S]{0,1200}(exampleOnly|notForScoring)/u.test(text)) {
    addRuntimeFailure(worldOrderDataFile, 'must not treat SIPRI example/template data as ok scoring data');
  }
}
if (!fs.existsSync(worldOrderDocFile)) {
  addRuntimeFailure(worldOrderDocFile, 'world order stress document missing');
} else {
  const text = fs.readFileSync(worldOrderDocFile, 'utf8');
  for (const needle of [
    '不预测战争',
    '不输出战争概率',
    'GDELT',
    'OFAC',
    'SIPRI',
    'ACLED',
    'decisionModifier',
    'GDELT 代理估算',
    'check:world-order',
    'check:all includes check:world-order',
    'build:world-order is manual',
    'H-2 前端展示',
    '前端只读取 data/world-order-stress.json',
    '前端不调用外部 API',
    '不接入 decisionModel',
    'marketConfirmation 优先使用 Worker-generated preview',
    'fallback 到 local realtime',
    'fallback 到 Daily baseline',
    'GDELT query throttle',
    'partial success',
    'stale cache fallback',
    '429 handling',
    'world-order-sipri-normalized.example.json',
    'quality.isRealData',
    '手动导入',
    '示例数据不会参与评分',
    'v28.0H-4',
    '手动刷新',
    'scheduled workflow',
    'data/gdelt-world-order-cache.json',
    'P39',
    'GDELT stale / partial 可接受条件',
    'v28.0H-4A',
    'diagnose:gdelt',
    '不改变 production scoring',
    '不写 data/world-order-stress.json',
    'v28.0H-4B',
    'ReliefWeb public fallback feasibility probe',
    'v28.0H-5',
    '数据质量',
    '置信度解释',
    '当前数据限制',
    '不改变 scoring',
    '前端只读取 data/world-order-stress.json',
    'v28.0H-5A',
    'UI 文案清理',
    '中文化趋势',
    '证据来源归因',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderDocFile, `missing world order stress marker "${needle}"`);
    }
  }
}

if (fs.existsSync(validateDataScriptFile)) {
  const text = fs.readFileSync(validateDataScriptFile, 'utf8');
  for (const needle of [
    '--verbose',
    '--strict-live-alignment',
    'VALIDATE_DATA_VERBOSE',
    'VALIDATE_DATA_STRICT_LIVE_ALIGNMENT',
    'Expected skip',
    'strict live alignment requested',
    'validateRealtimeBaselineAlignment',
    'validateDisplayInputsBaseline',
    'validateDailyRealtimeInput',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(validateDataScriptFile, `missing validate-data expected-skip marker "${needle}"`);
    }
  }
  if (text.includes('Skipping live realtime/displayInputsBaseline alignment')) {
    addRuntimeFailure(validateDataScriptFile, 'default live alignment expected skip must not use the old warning text');
  }
} else {
  addRuntimeFailure(validateDataScriptFile, 'validate data script missing');
}

if (fs.existsSync(workerContract.mainPreviewFile)) {
  const text = fs.readFileSync(workerContract.mainPreviewFile, 'utf8');
  for (const needle of workerContract.mainPreviewForbidden) {
    if (text.includes(needle)) {
      addRuntimeFailure(workerContract.mainPreviewFile, `must not contain isolated secondary preview marker "${needle}"`);
    }
  }
  for (const needle of workerContract.brentAuditRequired) {
    if (!text.includes(needle)) {
      addRuntimeFailure(workerContract.mainPreviewFile, `missing Brent audit contract "${needle}"`);
    }
  }
  for (const needle of workerContract.sourceProbeRequired) {
    if (!text.includes(needle)) {
      addRuntimeFailure(workerContract.mainPreviewFile, `missing Brent source probe contract "${needle}"`);
    }
  }
  for (const [pattern, message] of workerContract.brentPrimaryForbiddenPatterns) {
    if (pattern.test(text)) addRuntimeFailure(workerContract.mainPreviewFile, message);
  }
  const fredApiUrlStart = text.indexOf('export function buildFredApiUrl');
  const fredFallbackStart = text.indexOf('function fredApiFallbackFields', fredApiUrlStart);
  if (fredApiUrlStart !== -1 && fredFallbackStart > fredApiUrlStart) {
    const fredApiUrlBlock = text.slice(fredApiUrlStart, fredFallbackStart);
    for (const needle of ["sort_order: 'desc'", "limit: '2'"]) {
      if (!fredApiUrlBlock.includes(needle)) {
        addRuntimeFailure(
          workerContract.mainPreviewFile,
          `free-tier FRED request must keep compact newest-two marker "${needle}"`,
        );
      }
    }
  } else {
    addRuntimeFailure(workerContract.mainPreviewFile, 'missing compact FRED API URL builder');
  }
  // F6: Stooq diagnostic Brent probe permanently removed — block reintroduction (worker file only).
  for (const removedStooqMarker of [
    'STOOQ_BRENT_PROBE_SYMBOLS',
    'stooqProbeUrl',
    'probeStooqBrentSource',
    'fetchStooqBrentCandidate',
    'stooq:brn.f',
    'stooq:brn.c',
    'stooq:bz.f',
    'stooq.com/q/d/l/',
  ]) {
    if (text.includes(removedStooqMarker)) {
      addRuntimeFailure(workerContract.mainPreviewFile, `F6: removed Stooq Brent probe must not return ("${removedStooqMarker}")`);
    }
  }
  const fetchHelperStart = text.indexOf('async function fetchTextWithDiagnostics');
  const splitCsvStart = text.indexOf('function splitCsvLine');
  if (fetchHelperStart !== -1 && splitCsvStart !== -1 && splitCsvStart > fetchHelperStart) {
    const fetchHelperBlock = text.slice(fetchHelperStart, splitCsvStart);
    for (const needle of [
      'new AbortController()',
      'setTimeout(() => controller.abort(), timeoutMs)',
      'signal: controller.signal',
      'clearTimeout(timer)',
      'options.timeoutMs',
      'WORKER_FETCH_TIMEOUT_MS',
      'sanitizeDiagnosticUrl(response.url || url)',
      'sanitizeDiagnosticUrl(url)',
    ]) {
      if (!fetchHelperBlock.includes(needle)) {
        addRuntimeFailure(workerContract.mainPreviewFile, `fetchTextWithDiagnostics missing required guard "${needle}"`);
      }
    }
    if (/finalUrl:\s*(?:response\.url\s*\|\|\s*url|url)\s*,/u.test(fetchHelperBlock)) {
      addRuntimeFailure(
        workerContract.mainPreviewFile,
        'fetchTextWithDiagnostics finalUrl must use sanitizeDiagnosticUrl to avoid leaking query params',
      );
    }
  } else {
    addRuntimeFailure(workerContract.mainPreviewFile, 'missing fetchTextWithDiagnostics timeout guard block');
  }
  const tradingEconomicsCandidateStart = text.indexOf('async function fetchTradingEconomicsDiagnosticCandidate');
  const buildValidationAfterTradingEconomics = text.indexOf('async function buildBrentValidation', tradingEconomicsCandidateStart);
  if (
    tradingEconomicsCandidateStart !== -1 &&
    buildValidationAfterTradingEconomics !== -1 &&
    buildValidationAfterTradingEconomics > tradingEconomicsCandidateStart
  ) {
    const tradingEconomicsCandidateBlock = text.slice(
      tradingEconomicsCandidateStart,
      buildValidationAfterTradingEconomics,
    );
    if (/ok:\s*result\.ok\s*&&\s*value\s*!=\s*null\s*&&\s*observedAt\s*!=\s*null/u.test(tradingEconomicsCandidateBlock)) {
      addRuntimeFailure(
        workerContract.mainPreviewFile,
        'Trading Economics candidate must not require observedAt for ok=true',
      );
    }
  } else {
    addRuntimeFailure(workerContract.mainPreviewFile, 'missing Trading Economics diagnostic candidate block');
  }
  if (text.includes('(?:Brent|BZW00|Crude Oil)[\\s\\S]{0,600}?([0-9]{2,3}')) {
    addRuntimeFailure(
      workerContract.mainPreviewFile,
      'Trading Economics HTML price fallback must not match arbitrary 2-3 digit numbers after Brent text',
    );
  }
  if (!text.includes('(?:price|last|close|value|usd|dollars?)')) {
    addRuntimeFailure(
      workerContract.mainPreviewFile,
      'Trading Economics HTML price fallback must require nearby price context',
    );
  }
  const promotionDecisionStart = text.indexOf('function buildBrentPromotionDecision');
  const summarizeCandidateStart = text.indexOf('function summarizeBrentCandidate', promotionDecisionStart);
  if (
    promotionDecisionStart !== -1 &&
    summarizeCandidateStart !== -1 &&
    summarizeCandidateStart > promotionDecisionStart
  ) {
    const promotionDecisionBlock = text.slice(promotionDecisionStart, summarizeCandidateStart);
    for (const needle of [
      'tradingEconomicsAgeHours',
      'tradingeconomics-observedAt-invalid',
      'tradingeconomics-confirmation-stale',
      'tradingEconomicsAgeHours > BRENT_CONFIRMATION_FRESH_HOURS',
    ]) {
      if (!promotionDecisionBlock.includes(needle)) {
        addRuntimeFailure(
          workerContract.mainPreviewFile,
          `G-4C Trading Economics promotion hard gate missing "${needle}"`,
        );
      }
    }
  } else {
    addRuntimeFailure(workerContract.mainPreviewFile, 'missing Brent promotion decision block');
  }
  const moveAssessmentStart = text.indexOf('function buildMoveAssessment');
  const promotionDecisionAfterMove = text.indexOf('function buildBrentPromotionDecision', moveAssessmentStart);
  if (
    moveAssessmentStart !== -1 &&
    promotionDecisionAfterMove !== -1 &&
    promotionDecisionAfterMove > moveAssessmentStart
  ) {
    const moveAssessmentBlock = text.slice(moveAssessmentStart, promotionDecisionAfterMove);
    for (const needle of [
      'tradingEconomicsAgeHours',
      'tradingEconomicsAgeHours <= BRENT_CONFIRMATION_FRESH_HOURS',
      'confirmed-extreme-move',
      'unconfirmed-jump-hold',
    ]) {
      if (!moveAssessmentBlock.includes(needle)) {
        addRuntimeFailure(
          workerContract.mainPreviewFile,
          `G-4C extreme move confirmation missing "${needle}"`,
        );
      }
    }
  } else {
    addRuntimeFailure(workerContract.mainPreviewFile, 'missing Brent move assessment block');
  }
  const sourceProbeStart = text.indexOf('async function buildBrentSourceProbe(');
  const buildValidationStart = text.indexOf('async function buildBrentValidation');
  if (sourceProbeStart !== -1 && buildValidationStart !== -1 && buildValidationStart > sourceProbeStart) {
    const sourceProbeBlock = text.slice(sourceProbeStart, buildValidationStart);
    for (const forbiddenNeedle of [
      'role: \'validation\'',
      'participatesInConsensus: true',
      'canPromoteToPrimary: true',
      'values.brent',
    ]) {
      if (sourceProbeBlock.includes(forbiddenNeedle)) {
        addRuntimeFailure(
          workerContract.mainPreviewFile,
          `Brent sourceProbe must not contain promotion marker "${forbiddenNeedle}"`,
        );
      }
    }
    for (const removedProbe of [
      'google-finance:BZW00:NYMEX beta',
      'bzy.f',
      'bzw.f',
      'brent.f',
      'ukousd',
      'ukousd.c'
    ]) {
      if (sourceProbeBlock.includes(removedProbe)) {
        addRuntimeFailure(
          workerContract.mainPreviewFile,
          `D-8B-lite sourceProbe must not include removed probe "${removedProbe}"`,
        );
      }
    }
    const googleProbeBlockMatch = sourceProbeBlock.match(/const googleProbes = \[([\s\S]*?)\];/u);
    const googleProbeCount = googleProbeBlockMatch
      ? (googleProbeBlockMatch[1].match(/probeId:/gu) || []).length
      : 0;
    if (googleProbeCount > 5) {
      addRuntimeFailure(
        workerContract.mainPreviewFile,
        `D-8B-lite sourceProbe count must be <= 5; found ${googleProbeCount}`,
      );
    }
  } else {
    addRuntimeFailure(workerContract.mainPreviewFile, 'missing Brent sourceProbe function block');
  }
  const confirmationStart = text.indexOf('confirmationSources: [');
  const excludedStart = text.indexOf('excludedSources: [');
  if (confirmationStart !== -1 && excludedStart !== -1 && excludedStart > confirmationStart) {
    const confirmationBlock = text.slice(confirmationStart, excludedStart);
    for (const forbiddenSource of [
      'google-finance:',
      'stooq:brn.f',
      'stooq:brn.c',
      'stooq:bzy.f',
      'stooq:bzw.f',
      'stooq:bz.f',
      'stooq:brent.f',
      'stooq:ukousd',
      'stooq:ukousd.c'
    ]) {
      if (confirmationBlock.includes(forbiddenSource)) {
        addRuntimeFailure(
          workerContract.mainPreviewFile,
          `Brent promotion confirmationSources must not include ${forbiddenSource}`,
        );
      }
    }
  } else {
    addRuntimeFailure(workerContract.mainPreviewFile, 'missing Brent confirmation/exclusion contract blocks');
  }
} else {
  addRuntimeFailure(workerContract.mainPreviewFile, 'worker main preview file missing');
}

if (fs.existsSync(workerContract.routerFile)) {
  const text = fs.readFileSync(workerContract.routerFile, 'utf8');
  for (const needle of workerContract.routerRequired) {
    if (!text.includes(needle)) {
      addRuntimeFailure(workerContract.routerFile, `missing isolated secondary preview contract "${needle}"`);
    }
  }
  if (
    !/source:\s*['"]yahoo:GC=F['"]/u.test(text) ||
    !/participatesInPrimary:\s*false/u.test(text) ||
    !/participatesInValidation:\s*false/u.test(text)
  ) {
    addRuntimeFailure(workerContract.routerFile, 'Gold secondary must remain diagnostic-only and out of primary/validation');
  }
  if (
    !/source:\s*['"]yahoo:DX-Y\.NYB['"]/u.test(text) ||
    !/participatesInPrimary:\s*false/u.test(text) ||
    !/participatesInValidation:\s*false/u.test(text)
  ) {
    addRuntimeFailure(workerContract.routerFile, 'DXY secondary must remain diagnostic-only and out of primary/validation');
  }
  if (
    !/source:\s*['"]yahoo:\^TNX['"]/u.test(text) ||
    !/participatesInPrimary:\s*false/u.test(text) ||
    !/participatesInValidation:\s*false/u.test(text) ||
    !/rawValue/u.test(text) ||
    !/normalization/u.test(text) ||
    !/normalizationReason/u.test(text) ||
    !/raw-yahoo-tnx-appears-times-10/u.test(text) ||
    !/raw-yahoo-tnx-already-percent/u.test(text) ||
    !/no-valid-yahoo-tnx-value/u.test(text)
  ) {
    addRuntimeFailure(workerContract.routerFile, 'US10Y secondary must remain diagnostic-only with audited normalization');
  }
  if (
    !/source:\s*['"]yahoo:\^GSPC['"]/u.test(text) ||
    !/participatesInPrimary:\s*false/u.test(text) ||
    !/participatesInValidation:\s*false/u.test(text)
  ) {
    addRuntimeFailure(workerContract.routerFile, 'SPX secondary must remain diagnostic-only and out of primary/validation');
  }
  if (!/MARKET_SECONDARY_PREVIEW_KEY\s*=\s*['"]market:secondary-preview['"]/u.test(text)) {
    addRuntimeFailure(workerContract.routerFile, 'secondary preview must continue using market:secondary-preview KV key');
  }
  const vixParserStart = text.indexOf('export function parseCboeVixHistory');
  const yahooGoldParserStart = text.indexOf('function parseYahooGoldChart', vixParserStart);
  if (vixParserStart !== -1 && yahooGoldParserStart > vixParserStart) {
    const vixParserBlock = text.slice(vixParserStart, yahooGoldParserStart);
    if (!vixParserBlock.includes("lastIndexOf('\\n'")) {
      addRuntimeFailure(workerContract.routerFile, 'VIX parser must scan from the CSV tail under the free-tier CPU budget');
    }
    if (/\.split\(\/\\r\?\\n\//u.test(vixParserBlock)) {
      addRuntimeFailure(workerContract.routerFile, 'VIX parser must not materialize the full Cboe history CSV');
    }
  } else {
    addRuntimeFailure(workerContract.routerFile, 'missing VIX tail parser');
  }
  const scheduledStart = text.indexOf('async scheduled(_event, env)');
  const scheduledBlock = scheduledStart === -1 ? '' : text.slice(scheduledStart);
  if (scheduledStart === -1) {
    addRuntimeFailure(workerContract.routerFile, 'missing scheduled handler');
  } else {
    const hasGuardedPrimaryWrite = [
      'try {',
      'await env.GFRR_MARKET_KV.put(key, JSON.stringify(value));',
      '} catch (err) {',
      "console.warn('scheduled primary KV write failed'",
    ].every((needle) => scheduledBlock.includes(needle));
    if (!hasGuardedPrimaryWrite) {
      addRuntimeFailure(workerContract.routerFile, 'scheduled primary KV write must be guarded with try/catch diagnostics');
    }
    const catchStart = scheduledBlock.indexOf('} catch (err)');
    const secondaryStart = scheduledBlock.indexOf('await tryWriteSecondaryPreview', catchStart);
    const catchBlock = secondaryStart === -1 ? scheduledBlock.slice(catchStart) : scheduledBlock.slice(catchStart, secondaryStart);
    if (!catchBlock.includes('return;')) {
      addRuntimeFailure(workerContract.routerFile, 'scheduled primary KV write failure must not proceed to secondary preview write');
    }
  }
} else {
  addRuntimeFailure(workerContract.routerFile, 'worker router file missing');
}

// M-WF-1: merged from former check:pages-trigger-coverage. Verifies the Pages
// deploy workflow's workflow_run.workflows list covers every commits-to-main
// workflow (or excludes it with a reason), that listed entries match real
// workflows, and that refresh-world-order-stress.yml has no obsolete Pages step.
function checkRefreshScheduleConsistency() {
  const dailyWorkflow = '.github/workflows/build-daily-radar-data.yml';
  const dailyBuilder = 'scripts/run-daily-pipeline.mjs';
  const transportCheck = 'scripts/check-transport-shock-confirmation-factor-production-refresh.mjs';
  const transportMonitor = 'scripts/monitor-transport-shock-confirmation-factor-production-refresh.mjs';
  const transportHelper = 'scripts/transport-shock-refresh-history.mjs';
  const bubbleWorkflow = '.github/workflows/refresh-bubble-watch.yml';
  const gdeltReview = 'scripts/review-gdelt-cache-health.mjs';

  const dailyCron = `cron: '${DAILY_REFRESH_SCHEDULE_UTC.minute} ${DAILY_REFRESH_SCHEDULE_UTC.hour} * * *'`;
  if (fs.existsSync(dailyWorkflow)) {
    const dailySrc = fs.readFileSync(dailyWorkflow, 'utf8');
    if (!dailySrc.includes(dailyCron)) {
      addRuntimeFailure(dailyWorkflow, `Daily cron must match Transport Shock schedule constants: ${dailyCron}`);
    }
  }
  const dailyBuilderSource = fs.readFileSync(dailyBuilder, 'utf8');
  for (const marker of [
    'function replaceJsonBatchSafely(entries, replaceFile = fs.renameSync)',
    'fs.writeFileSync(entry.tmpPath',
    'fs.copyFileSync(entry.filePath, entry.backupPath)',
    'fs.copyFileSync(entry.backupPath, entry.filePath)',
    'replaceJsonBatchSafely(['
  ]) {
    requireSourceMarker(dailyBuilder, dailyBuilderSource, marker);
  }

  const rollbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-daily-batch-'));
  try {
    const files = ['history.json', 'history-full.json', 'radar.json'].map((name) => path.join(rollbackDir, name));
    files.forEach((file, index) => fs.writeFileSync(file, `${JSON.stringify({ old: index })}\n`, 'utf8'));
    let renameCount = 0;
    let injectedFailureObserved = false;
    try {
      replaceJsonBatchSafely(
        files.map((file, index) => [file, { next: index }]),
        (source, target) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error('injected second rename failure');
          fs.renameSync(source, target);
        },
      );
    } catch (error) {
      injectedFailureObserved = error?.message === 'injected second rename failure';
    }
    if (!injectedFailureObserved) {
      addRuntimeFailure(dailyBuilder, 'Daily batch rollback test did not observe the injected rename failure.');
    }
    files.forEach((file, index) => {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value.old !== index) {
        addRuntimeFailure(dailyBuilder, `Daily batch rollback did not restore ${path.basename(file)}.`);
      }
    });
    if (fs.readdirSync(rollbackDir).some((name) => name.startsWith('.'))) {
      addRuntimeFailure(dailyBuilder, 'Daily batch rollback left temporary or backup files behind.');
    }
  } finally {
    fs.rmSync(rollbackDir, { recursive: true, force: true });
  }

  for (const file of [transportCheck, transportMonitor]) {
    const source = fs.readFileSync(file, 'utf8');
    requireSourceMarker(file, source, "from './transport-shock-refresh-history.mjs'");
  }

  const helperSource = fs.readFileSync(transportHelper, 'utf8');
  requireSourceMarker(transportHelper, helperSource, 'hour: 22');
  requireSourceMarker(transportHelper, helperSource, 'minute: 30');

  if (fs.existsSync(bubbleWorkflow)) {
    const bubbleSource = fs.readFileSync(bubbleWorkflow, 'utf8');
    const gdeltSource = fs.readFileSync(gdeltReview, 'utf8');
    if (!bubbleSource.includes("cron: '30 5 * * 1'")) {
      addRuntimeFailure(bubbleWorkflow, 'Bubble Watch cron must stay Monday 05:30 UTC.');
    }
    if (!bubbleSource.includes('git commit -m "chore: refresh bubble watch"')) {
      addRuntimeFailure(bubbleWorkflow, 'Bubble Watch refresh commit subject must remain available to cache history review.');
    }
    if (!bubbleSource.includes('npm run check:gdelt-cache-health')) {
      addRuntimeFailure(bubbleWorkflow, 'Bubble Watch refresh must enforce the GDELT placeholder escalation gate before commit.');
    }
    for (const marker of [
      "BUBBLE_WATCH_REFRESH_COMMIT_SUBJECT = 'chore: refresh bubble watch'",
      "'rev-parse', '--is-shallow-repository'",
      'gitJsonAtCommitFn(refresh.commit, CACHE_PATHS.bubbleWatch)'
    ]) {
      requireSourceMarker(gdeltReview, gdeltSource, marker);
    }
  }
}

checkRefreshScheduleConsistency();

// All assertions preserved verbatim; failures feed the aggregate exit via
// addRuntimeFailure, and the operator-facing coverage report still prints.
function checkPagesTriggerCoverage() {
  const WORKFLOWS_DIR = '.github/workflows';
  const PAGES_WORKFLOW = '.github/workflows/deploy-static-site-to-pages.yml';
  const EXCLUDED_FROM_PAGES = {
    'Build Realtime Market': 'commits to realtime-data branch (consumed by daily-radar, not by Pages)',
    'Recover Stale Realtime Market': 'commits to realtime-data branch (same publish branch as Build Realtime Market)',
  };
  const pagesErrors = [];
  const pagesWarnings = [];
  const pfail = (msg) => pagesErrors.push(msg);
  const pwarn = (msg) => pagesWarnings.push(msg);

  if (!fs.existsSync(PAGES_WORKFLOW)) {
    addRuntimeFailure(PAGES_WORKFLOW, `M-60: ${PAGES_WORKFLOW} missing`);
    return;
  }

  const pagesSrc = fs.readFileSync(PAGES_WORKFLOW, 'utf8');
  const wfRunMatch = pagesSrc.match(/workflow_run:\s*\n\s+workflows:\s*\n([\s\S]+?)\n\s+types:/);
  let pagesListeners = new Set();
  if (!wfRunMatch) {
    pfail('Pages workflow missing workflow_run.workflows block (or types: not found as sibling key)');
  } else {
    const listed = wfRunMatch[1]
      .split('\n')
      .map((line) => line.trim().replace(/^-\s*/, '').trim())
      .filter(Boolean);
    pagesListeners = new Set(listed);
  }

  const workflowFiles = fs.readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => `${WORKFLOWS_DIR}/${f}`)
    .filter((p) => p.replace(/\\/g, '/') !== PAGES_WORKFLOW);

  const report = [];

  for (const filepath of workflowFiles) {
    const src = fs.readFileSync(filepath, 'utf8');
    const nameMatch = src.match(/^name:\s*(.+)$/m);
    const workflowName = nameMatch ? nameMatch[1].trim() : null;
    if (!workflowName) {
      pfail(`${filepath}: missing top-level "name:" declaration; cannot match against Pages workflow_run list`);
      continue;
    }

    const hasContentsWrite = /permissions:\s*\n[\s\S]*?contents:\s*write/.test(src);
    const hasContentsRead = /permissions:\s*\n[\s\S]*?contents:\s*read/.test(src);
    const pushLines = src.match(/git\s+push[^\n]*/g) || [];
    const commitLines = src.match(/git\s+commit[^\n]*/g) || [];
    const pushesToRealtimeBranch = pushLines.some((line) => line.includes('realtime-data'));
    const pushesToMain = pushLines.some((line) => !line.includes('realtime-data'));
    const pushesToExternalEdgeOneRelease = src.includes('RELEASE_REPOSITORY: ctmaomao/gfrr-edgeone-release');
    const hasCommit = commitLines.length > 0;
    const hasPush = pushLines.length > 0;
    const assertsNoDiff = /git\s+diff\s+--exit-code/.test(src);

    let category;
    let needsPagesTrigger = false;
    if (hasContentsRead && !hasContentsWrite && !hasPush) {
      category = 'read-only';
    } else if (assertsNoDiff && !pushesToMain) {
      category = 'dry-run';
    } else if (pushesToRealtimeBranch && !pushesToMain) {
      category = 'realtime-data-branch';
    } else if (pushesToExternalEdgeOneRelease && hasCommit && hasPush) {
      category = 'external-release-repository';
    } else if (hasCommit && pushesToMain) {
      category = 'commits-to-main';
      needsPagesTrigger = true;
    } else if (hasContentsWrite && hasCommit && hasPush) {
      category = 'commits-unclear';
      needsPagesTrigger = true;
    } else if (!hasCommit && !hasPush) {
      category = 'no-write';
    } else {
      category = 'unclassified';
    }

    const isExcluded = Object.prototype.hasOwnProperty.call(EXCLUDED_FROM_PAGES, workflowName);
    const isInPagesList = pagesListeners.has(workflowName);

    report.push({ filepath, workflowName, category, needsPagesTrigger, isInPagesList, isExcluded });

    if (needsPagesTrigger) {
      if (isExcluded) {
        pwarn(`${workflowName} (${filepath}) commits to main BUT is in EXCLUDED_FROM_PAGES with reason "${EXCLUDED_FROM_PAGES[workflowName]}". Verify the exclusion is intentional; commits-to-main workflows normally need Pages auto-deploy.`);
      } else if (!isInPagesList) {
        pfail(`${workflowName} (${filepath}) commits to main but is NOT in ${PAGES_WORKFLOW} workflow_run.workflows list. Either:\n` +
          `    (a) add "${workflowName}" to deploy-static-site-to-pages.yml workflow_run.workflows, or\n` +
          '    (b) if this workflow should NOT trigger Pages, add it to EXCLUDED_FROM_PAGES in this check with a written reason.');
      }
    }

    if (!needsPagesTrigger && isInPagesList) {
      pwarn(`${workflowName} (${filepath}) is in Pages workflow_run.workflows but no main commit was detected. Heuristic may be wrong, or the listing may be obsolete. Category: ${category}.`);
    }

    if (category === 'commits-unclear' && !isExcluded && !isInPagesList) {
      pfail(`${workflowName} (${filepath}) has contents:write + git commit + git push but the destination branch is unclear. Manually verify and either:\n` +
        `    (a) add to Pages workflow_run.workflows if pushing to main, or\n` +
        '    (b) add to EXCLUDED_FROM_PAGES with reason.');
    }
  }

  for (const listed of pagesListeners) {
    if (!report.find((r) => r.workflowName === listed)) {
      pfail(`Pages workflow_run lists "${listed}" but no workflow file with that name: declaration was found. Either rename the workflow or update Pages listing.`);
    }
  }

  const refreshPath = '.github/workflows/refresh-world-order-stress.yml';
  if (fs.existsSync(refreshPath)) {
    const refreshSrc = fs.readFileSync(refreshPath, 'utf8');
    if (refreshSrc.includes('gh workflow run deploy-static-site-to-pages.yml')) {
      pfail(`${refreshPath} still has explicit "gh workflow run deploy-static-site-to-pages.yml" step from PR #213. Remove it; M-60 uses workflow_run in Pages workflow to auto-trigger instead.`);
    }
    if (/id:\s*commit_step/.test(refreshSrc) && refreshSrc.includes('committed=true')) {
      pfail(`${refreshPath} still has commit_step id and committed output from PR #213. Simplify the Commit step now that the explicit Pages trigger step has been removed.`);
    }
  }

  // Operator-facing coverage report (preserved from former standalone checker).
  console.log('Pages trigger coverage report:');
  console.log('');
  console.log('  Status | Category              | Workflow Name');
  console.log('  -------|-----------------------|--------------');
  const statusPriority = { MISSING: 0, unclear: 1, registered: 2, excluded: 3, 'N/A': 4 };
  const statusKey = (item) => {
    if (item.needsPagesTrigger) {
      if (item.isInPagesList) return 'registered';
      if (item.isExcluded) return 'excluded';
      return 'MISSING';
    }
    if (item.isExcluded) return 'excluded';
    if (item.isInPagesList) return 'unclear';
    return 'N/A';
  };
  for (const r of report.slice().sort((a, b) => (statusPriority[statusKey(a)] ?? 9) - (statusPriority[statusKey(b)] ?? 9))) {
    let status;
    if (r.needsPagesTrigger) {
      if (r.isInPagesList) status = '✓ registered';
      else if (r.isExcluded) status = '✓ excluded';
      else status = '✗ MISSING';
    } else if (r.isExcluded) status = '✓ excluded';
    else if (r.isInPagesList) status = '⚠ listed-but-no-commit';
    else status = '— N/A';
    console.log(`  ${status.padEnd(22)} | ${r.category.padEnd(22)} | ${r.workflowName}`);
  }
  console.log('');
  if (pagesWarnings.length > 0) {
    console.log('Pages trigger coverage warnings:');
    for (const w of pagesWarnings) console.log('  -', w);
    console.log('');
  }
  for (const e of pagesErrors) addRuntimeFailure(PAGES_WORKFLOW, e);
}

checkPagesTriggerCoverage();

if (failures.length > 0) {
  console.error(`Workflow contract check failed: ${failures.length} issue(s) found`);
  process.exit(1);
}

console.log('Workflow contract check passed');
