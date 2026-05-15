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
      'Audit Daily realtime input vs Worker preview',
      'node scripts/audit-daily-vs-worker.mjs --github-summary',
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
      'workflow_run',
      'Build Daily Radar Data',
      "github.event.workflow_run.conclusion == 'success'",
      'npm run check:syntax',
      'npm run check:dom',
      'npm run check:modules',
      'npm run check:copy',
      'npm run check:node-runtime',
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
      'actions/checkout@v6',
      'actions/setup-node@v6',
      'node-version: 24',
      'package-manager-cache: false',
      'node scripts/check-worker-health.mjs --github-summary --fail-on-unhealthy',
      '--snapshot-file health-worker-snapshot.json',
      'actions/upload-artifact@v7',
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
  [/actions\/checkout@v5/u, 'must not use actions/checkout@v5'],
  [/actions\/setup-node@v4/u, 'must not use actions/setup-node@v4'],
  [/actions\/setup-node@v5/u, 'must not use actions/setup-node@v5'],
  [/actions\/upload-artifact@v4/u, 'must not use actions/upload-artifact@v4'],
  [/actions\/download-artifact@v4/u, 'must not use actions/download-artifact@v4'],
  [/node-version:\s*['"]?20(?:\.x)?['"]?/u, 'must not use node-version 20'],
  [/node20/u, 'must not use node20'],
  [/ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/u, 'must not use ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION'],
  [/FORCE_JAVASCRIPT_ACTIONS_TO_NODE20/u, 'must not use FORCE_JAVASCRIPT_ACTIONS_TO_NODE20']
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
  'README.md',
  'AGENTS.md',
  'docs/DATA_CONTRACT.md',
  'docs/OPERATIONS.md',
  'workers/gfrr-realtime-worker/README.md',
];
const g4cRuntimeDocs = [
  'README.md',
  'AGENTS.md',
  'docs/DATA_CONTRACT.md',
  'docs/OPERATIONS.md',
  'workers/gfrr-realtime-worker/README.md',
];
const releaseStateDocs = [
  'README.md',
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
const worldOrderGdeltDiagnosisFile = 'scripts/world-order/diagnose-gdelt-source.mjs';
const worldOrderReliefWebDiagnosisFile = 'scripts/world-order/diagnose-reliefweb-source.mjs';
const worldOrderSourceReviewFile = 'docs/WORLD_ORDER_SOURCE_REVIEW.md';
const worldOrderRequiredFiles = [
  'scripts/build-world-order-stress.mjs',
  'scripts/check-world-order-stress.mjs',
  'scripts/world-order/fetch-gdelt.mjs',
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
const frontendAssetVersion = '28.0M-41V';
const frontendAssetEntryFile = 'index.html';
const frontendAssetAppFile = 'scripts/app.js';
const frontendAssetModuleDir = 'scripts/modules';
const frontendAssetBumpScriptFile = 'scripts/bump-frontend-asset-version.mjs';
const frontendAssetDocs = [
  'README.md',
  'AGENTS.md',
  'docs/OPERATIONS.md',
  'docs/DATA_CONTRACT.md',
  'workers/gfrr-realtime-worker/README.md',
];
const dataCheckDocs = [
  'README.md',
  'AGENTS.md',
  'docs/OPERATIONS.md',
  'docs/DATA_CONTRACT.md',
  'workers/gfrr-realtime-worker/README.md',
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
    'key === MARKET_WORKER_GENERATED_PREVIEW_KEY',
    'readPreviousWorkerPreviewSummary',
    'previousPreviewSummary',
    'previousSourceProbe'
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
    'stooq:brn.c',
    'experimental-alt-symbol',
    'csv-no-numeric-close',
    'csv-symbol-unstable',
    'stooq-brn-f-diagnostic-only-not-used-for-promotion',
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
    'probeCount: probes.length',
    'fullHtmlStored: false',
    'fullCsvStored: false',
    'maxSampleRows: PROBE_SAMPLE_ROW_LIMIT',
    'maxSnippetChars: PROBE_SNIPPET_LIMIT',
    'role: \'diagnostic-only\'',
    'affectsPromotion: false',
    'participatesInConsensus: false',
    'promotionEligible: false',
    'header-unrecognized',
    'non-csv-response',
    'unreliable-html-parse',
    'stooqProbeUrl(symbol)',
    'google-finance:BZW00:NYMEX canonical',
    'google-finance:BZY00:NYMEX front-month',
    'stooq:brn.f',
    'stooq:brn.c',
    '\'bz.f\''
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

  for (const [pattern, message] of forbiddenRuntimePatterns) {
    if (pattern.test(text)) addRuntimeFailure(file, message);
  }

  if (!hasNode24ActionsEnv(text)) {
    addRuntimeFailure(file, 'must set top-level FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true');
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

  for (const match of text.matchAll(/actions\/setup-node@[^\s'"]+/gu)) {
    const stepBlock = getStepBlock(text, match.index);
    if (!/node-version:\s*['"]?24['"]?/u.test(stepBlock)) {
      addRuntimeFailure(file, 'uses setup-node but does not set node-version: 24');
    }
  }

  const uploadArtifactMatches = text.match(/actions\/upload-artifact@[^\s'"]+/gu) || [];
  for (const match of uploadArtifactMatches) {
    if (match !== 'actions/upload-artifact@v7') {
      addRuntimeFailure(file, `uses ${match}; expected actions/upload-artifact@v7`);
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
  if (!packageText.includes('"diagnose:gdelt": "node scripts/world-order/diagnose-gdelt-source.mjs"')) {
    addRuntimeFailure(packageFile, 'missing diagnose:gdelt package script');
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
if (fs.existsSync(worldOrderGdeltDiagnosisFile)) {
  const text = fs.readFileSync(worldOrderGdeltDiagnosisFile, 'utf8');
  for (const needle of [
    'GDELT Diagnosis Summary',
    'production-query-too-heavy',
    'rate-limited',
    'network-or-gdelt-availability',
    'gdelt-currently-healthy',
    'local-runtime-network-error',
    'delay',
    'timeout',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(worldOrderGdeltDiagnosisFile, `missing GDELT diagnosis marker "${needle}"`);
    }
  }
  for (const forbiddenNeedle of [
    'data/world-order-stress.json',
    'writeFileSync',
    'GFRR_MARKET_KV',
    'wrangler',
  ]) {
    if (text.includes(forbiddenNeedle)) {
      addRuntimeFailure(worldOrderGdeltDiagnosisFile, `diagnose:gdelt must remain diagnostic-only; found "${forbiddenNeedle}"`);
    }
  }
} else {
  addRuntimeFailure(worldOrderGdeltDiagnosisFile, 'GDELT diagnosis script missing');
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
const worldOrderGdeltFile = 'scripts/world-order/fetch-gdelt.mjs';
if (fs.existsSync(worldOrderGdeltFile)) {
  const text = fs.readFileSync(worldOrderGdeltFile, 'utf8');
  for (const needle of [
    'delay',
    'rate_limited',
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
    '不自动刷新',
    'scheduled refresh 后续再评估',
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

if (fs.existsSync(frontendAssetBumpScriptFile)) {
  const text = fs.readFileSync(frontendAssetBumpScriptFile, 'utf8');
  for (const needle of [
    'Frontend asset version bumped to',
    '__GFRR_FRONTEND_VERSION__',
    'scripts/modules',
    'index.html',
    'check-workflows.mjs',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(frontendAssetBumpScriptFile, `missing bump helper marker "${needle}"`);
    }
  }
  for (const forbiddenNeedle of [
    'fetch(',
    'wrangler',
    'GFRR_MARKET_KV',
    'data/radar-data.json',
    'realtime/market.json',
  ]) {
    if (text.includes(forbiddenNeedle)) {
      addRuntimeFailure(frontendAssetBumpScriptFile, `frontend bump helper must remain local-only; found "${forbiddenNeedle}"`);
    }
  }
} else {
  addRuntimeFailure(frontendAssetBumpScriptFile, 'frontend asset version bump helper missing');
}

if (fs.existsSync(frontendAssetEntryFile)) {
  const text = fs.readFileSync(frontendAssetEntryFile, 'utf8');
  if (!text.includes(`app.js?v=${frontendAssetVersion}`)) {
    addRuntimeFailure(frontendAssetEntryFile, `missing app.js?v=${frontendAssetVersion}`);
  }
  for (const needle of [
    'world-order-stress-section',
    '世界秩序压力层',
    '和平红利退潮、阵营化与多战区风险监测',
    'world-order-score-bar',
    'world-order-source-status',
    'world-order-warnings',
    'ai-interpretation-layer-section',
    '规则化 AI 解释层',
    '当前不调用外部 AI',
    'ai-interpretation-scenarios',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(frontendAssetEntryFile, `missing world order UI marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(frontendAssetEntryFile, 'frontend entry file missing');
}

if (fs.existsSync(frontendAssetAppFile)) {
  const text = fs.readFileSync(frontendAssetAppFile, 'utf8');
  if (!text.includes('__GFRR_FRONTEND_VERSION__') || !text.includes(frontendAssetVersion)) {
    addRuntimeFailure(frontendAssetAppFile, `missing frontend version marker ${frontendAssetVersion}`);
  }
  for (const needle of [
    'renderWorldOrderStressOverlay',
    '__GFRR_WORLD_ORDER_STRESS__',
    'fetchWorldOrderStressData',
    'renderAiInterpretationLayer',
    'data.aiInterpretationLayer',
  ]) {
    if (!text.includes(needle)) {
      addRuntimeFailure(frontendAssetAppFile, `missing world order app marker "${needle}"`);
    }
  }
} else {
  addRuntimeFailure(frontendAssetAppFile, 'frontend app file missing');
}

const frontendAssetFiles = [
  frontendAssetAppFile,
  ...(fs.existsSync(frontendAssetModuleDir)
    ? fs.readdirSync(frontendAssetModuleDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => `${frontendAssetModuleDir}/${file}`)
    : [])
];
const localJsImportPattern = /(?:^|\n)\s*(?:import\s+(?:[^;]*?\s+from\s+)?|export\s+[^;]*?\s+from\s+)['"](\.{1,2}\/[^'"]+\.js(?:\?[^'"]*)?)['"]/gu;
for (const file of frontendAssetFiles) {
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'frontend asset file missing');
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  const staleFrontendAssetVersions = ['28.0H-5', '28.0H-2', '28.0G-9'];
  for (const staleAssetVersion of staleFrontendAssetVersions) {
    const staleVersion = `?v=${staleAssetVersion}`;
    const staleVersionPattern = new RegExp(`\\?v=${staleAssetVersion.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![A-Za-z0-9._-])`, 'u');
    if (staleVersionPattern.test(text)) {
      addRuntimeFailure(file, `frontend asset file must not retain ${staleVersion}`);
    }
  }
  for (const match of text.matchAll(localJsImportPattern)) {
    const specifier = match[1];
    if (!specifier.endsWith(`?v=${frontendAssetVersion}`)) {
      addRuntimeFailure(file, `local JS import must use ?v=${frontendAssetVersion}: ${specifier}`);
    }
  }
}

const frontendWorldOrderText = frontendAssetFiles
  .concat(frontendAssetEntryFile)
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
for (const needle of [
  'data/world-order-stress.json',
  'worldOrderStressUrl',
  'fetchWorldOrderStressData',
  'renderWorldOrderStressOverlay',
  '数据质量',
  '当前数据限制',
  '置信度反映',
  'Worker 快变量',
  'ACLED 未配置',
  'SIPRI',
  'GDELT',
  'buildWorldOrderConfidenceExplanation',
  'classifyWorldOrderDataQuality',
  'buildWorldOrderLimitations',
  'formatWorldOrderTrend',
  'formatWorldOrderSource',
  'formatWorldOrderDirection',
  'extractWorldOrderEvidenceSources',
  ".join(' + ')",
]) {
  if (!frontendWorldOrderText.includes(needle)) {
    addRuntimeFailure('frontend world order UI', `missing marker "${needle}"`);
  }
}
for (const forbiddenUiCopy of [
  '趋势：watching',
  '趋势：rising',
  '趋势：stable',
  '模式：rule_based_structured_interpretation',
  'market 风险上升',
  '数据质量：数据质量',
  'undefined',
  'NaN',
]) {
  if (frontendWorldOrderText.includes(forbiddenUiCopy)) {
    addRuntimeFailure('frontend world order UI', `must not expose stale UI copy "${forbiddenUiCopy}"`);
  }
}
for (const file of [
  frontendAssetEntryFile,
  ...frontendAssetFiles,
  worldOrderDocFile,
  worldOrderDataFile,
]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const phrase of worldOrderForbiddenPhrases) {
    if (text.includes(phrase)) {
      addRuntimeFailure(file, 'must not contain forbidden world order phrase');
    }
  }
}

const frontendAssetDocText = frontendAssetDocs
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
for (const file of frontendAssetDocs) {
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'frontend asset cache busting document missing');
  }
}
for (const needle of [
  `v${frontendAssetVersion}`,
  'Frontend Asset Cache Busting',
  'Android Chrome cached old module graph',
  '__GFRR_FRONTEND_VERSION__',
  'frontend asset cache version must be bumped when index.html or frontend JS changes',
  'v28.0G-9B',
  'Frontend Asset Version Bump Helper',
  'bump:frontend-asset-version',
  'node scripts/bump-frontend-asset-version.mjs 28.0M-41V',
]) {
  if (!frontendAssetDocText.includes(needle)) {
    addRuntimeFailure('frontend asset cache busting docs', `missing marker "${needle}"`);
  }
}

const dataCheckDocText = dataCheckDocs
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
for (const file of dataCheckDocs) {
  if (!fs.existsSync(file)) {
    addRuntimeFailure(file, 'data check expected-skip document missing');
  }
}
for (const needle of [
  'v28.0G-10',
  'Data Check Expected-Skip Noise Cleanup',
  'expected skip',
  'check:data:verbose',
  'check:data:strict-live-alignment',
  'Worker-first runtime',
  'fallback / Daily baseline',
]) {
  if (!dataCheckDocText.includes(needle)) {
    addRuntimeFailure('data check expected-skip docs', `missing marker "${needle}"`);
  }
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
    ]) {
      if (!fetchHelperBlock.includes(needle)) {
        addRuntimeFailure(workerContract.mainPreviewFile, `fetchTextWithDiagnostics missing timeout guard "${needle}"`);
      }
    }
  } else {
    addRuntimeFailure(workerContract.mainPreviewFile, 'missing fetchTextWithDiagnostics timeout guard block');
  }
  if (/\{\s*\.\.\.stooq,\s*role:\s*['"]validation['"]/u.test(text)) {
    addRuntimeFailure(workerContract.mainPreviewFile, 'stooq:brn.f must not be spread with validation role');
  }
  if (!/source\s*=\s*['"]stooq:brn\.f['"][\s\S]{0,160}role\s*=\s*['"]diagnostic['"][\s\S]{0,160}participatesInConsensus\s*=\s*false[\s\S]{0,160}quality\s*=\s*['"]csv-symbol-unstable['"]/u.test(text)) {
    addRuntimeFailure(workerContract.mainPreviewFile, 'stooq:brn.f must remain diagnostic-only csv-symbol-unstable');
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
    const stooqSymbolBlockMatch = text.match(/const STOOQ_BRENT_PROBE_SYMBOLS = \[([\s\S]*?)\];/u);
    const googleProbeCount = googleProbeBlockMatch
      ? (googleProbeBlockMatch[1].match(/probeId:/gu) || []).length
      : 0;
    const stooqProbeCount = stooqSymbolBlockMatch
      ? (stooqSymbolBlockMatch[1].match(/'[^']+'/gu) || []).length
      : 0;
    if (googleProbeCount + stooqProbeCount > 5) {
      addRuntimeFailure(
        workerContract.mainPreviewFile,
        `D-8B-lite sourceProbe count must be <= 5; found ${googleProbeCount + stooqProbeCount}`,
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
} else {
  addRuntimeFailure(workerContract.routerFile, 'worker router file missing');
}

if (failures.length > 0) {
  console.error(`Workflow contract check failed: ${failures.length} issue(s) found`);
  process.exit(1);
}

console.log('Workflow contract check passed');
