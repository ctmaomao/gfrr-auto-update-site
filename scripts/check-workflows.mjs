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
      'workflow_run',
      'Build Daily Radar Data',
      "github.event.workflow_run.conclusion == 'success'",
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
    'GC%3DF'
  ],
  routerRequired: [
    'market:secondary-preview',
    '/market.secondary-preview.json',
    'CBOE_VIX_HISTORY_URL',
    'YAHOO_GOLD_SECONDARY_URL',
    'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=5d',
    'parseYahooGoldChart',
    'fetchYahooGoldSecondaryLatest',
    'yahoo:GC=F',
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
    'yahoo:BZ=F',
    'excluded-non-positive-or-invalid'
  ],
  sourceProbeRequired: [
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
  if (/\{\s*\.\.\.stooq,\s*role:\s*['"]validation['"]/u.test(text)) {
    addRuntimeFailure(workerContract.mainPreviewFile, 'stooq:brn.f must not be spread with validation role');
  }
  if (!/source\s*=\s*['"]stooq:brn\.f['"][\s\S]{0,160}role\s*=\s*['"]diagnostic['"][\s\S]{0,160}participatesInConsensus\s*=\s*false[\s\S]{0,160}quality\s*=\s*['"]csv-symbol-unstable['"]/u.test(text)) {
    addRuntimeFailure(workerContract.mainPreviewFile, 'stooq:brn.f must remain diagnostic-only csv-symbol-unstable');
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
