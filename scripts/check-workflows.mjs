import fs from 'node:fs';

const contracts = [
  {
    file: '.github/workflows/build-realtime-market.yml',
    required: [
      'workflow_dispatch',
      "cron: '7,17,27,37,47,57 * * * *'",
      'concurrency',
      'gfrr-realtime',
      'permissions:',
      'contents: write',
      'actions/checkout@v6',
      'actions/setup-node@v6',
      'node-version: 24',
      'Summarize realtime output',
      'Commit updated realtime file'
    ]
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
      'group: gfrr-realtime-${{ github.ref }}',
      'cancel-in-progress: false',
      'actions/checkout@v6',
      'actions/setup-node@v6',
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
      'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24',
      'ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION'
    ]
  },
  {
    file: '.github/workflows/build-daily-radar-data.yml',
    required: [
      'workflow_dispatch',
      'concurrency',
      'gfrr-daily',
      'git show origin/realtime-data:realtime/market.json',
      'GFRR_REALTIME_COMMIT_SHA',
      'actions/checkout@v6',
      'actions/setup-node@v6',
      'node-version: 24',
      'npm run build:data',
      'npm run check:data',
      'Daily Radar Summary',
      'Decision Summary',
      'Transmission Delta Summary'
    ]
  },
  {
    file: '.github/workflows/deploy-static-site-to-pages.yml',
    required: [
      'npm run check:syntax',
      'npm run check:dom',
      'npm run check:modules',
      'npm run check:copy',
      'npm run check:workflows',
      'npm run check:docs',
      'npm run check:data',
      'actions/checkout@v6',
      'actions/setup-node@v6',
      'node-version: 24',
      'upload-pages-artifact',
      'deploy-pages'
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
      'actions/checkout@v6',
      'actions/setup-node@v6',
      'node-version: 24',
      'package-manager-cache: false',
      'node scripts/check-realtime-health.mjs --fail-on-stale'
    ],
    forbidden: [
      'contents: write',
      'git push',
      'git commit',
      'run-realtime',
      'run-daily',
      'npm run build:realtime',
      'npm run build:data',
      'data/radar-data.json',
      'realtime/market.json',
      'realtime-data'
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

  for (const group of contract.anyOf || []) {
    if (!group.options.some((needle) => text.includes(needle))) {
      addFailure(contract.file, `${group.label}: ${group.options.join(' | ')}`);
    }
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
  [/actions\/setup-node@v4/u, 'must not use actions/setup-node@v4'],
  [/node-version:\s*['"]?20['"]?/u, 'must not use node-version 20'],
  [/ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/u, 'must not use ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION'],
  [/FORCE_JAVASCRIPT_ACTIONS_TO_NODE24/u, 'must not use FORCE_JAVASCRIPT_ACTIONS_TO_NODE24']
];

for (const file of workflowFiles) {
  const text = fs.readFileSync(file, 'utf8');

  for (const [pattern, message] of forbiddenRuntimePatterns) {
    if (pattern.test(text)) addRuntimeFailure(file, message);
  }

  const checkoutMatches = text.match(/actions\/checkout@[^\s'"]+/gu) || [];
  for (const match of checkoutMatches) {
    if (match !== 'actions/checkout@v6') {
      addRuntimeFailure(file, `uses ${match}; expected actions/checkout@v6`);
    }
  }

  const setupNodeMatches = text.match(/actions\/setup-node@[^\s'"]+/gu) || [];
  for (const match of setupNodeMatches) {
    if (match !== 'actions/setup-node@v6') {
      addRuntimeFailure(file, `uses ${match}; expected actions/setup-node@v6`);
    }
  }

  if (setupNodeMatches.length > 0 && !/node-version:\s*['"]?24['"]?/u.test(text)) {
    addRuntimeFailure(file, 'uses setup-node but does not set node-version: 24');
  }
}

if (failures.length > 0) {
  console.error(`Workflow contract check failed: ${failures.length} issue(s) found`);
  process.exit(1);
}

console.log('Workflow contract check passed');
