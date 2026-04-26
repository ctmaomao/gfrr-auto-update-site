import fs from 'node:fs';

const contracts = [
  {
    file: '.github/workflows/build-realtime-market.yml',
    required: [
      'workflow_dispatch',
      "cron: '7,22,37,52 * * * *'",
      'concurrency',
      'gfrr-realtime',
      'permissions:',
      'contents: write',
      'Summarize realtime output',
      'Commit updated realtime file'
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
      'npm run build:data',
      'Daily Radar Summary',
      'Decision Summary',
      'Transmission Delta Summary'
    ],
    anyOf: [
      {
        label: 'data validation command',
        options: [
          'node scripts/validate-data.mjs',
          'npm run validate',
          'npm run check:data'
        ]
      }
    ]
  },
  {
    file: '.github/workflows/deploy-static-site-to-pages.yml',
    required: [
      'npm run check:syntax',
      'npm run check:dom',
      'npm run check:modules',
      'npm run check:copy',
      'npm run check:data',
      'upload-pages-artifact',
      'deploy-pages'
    ]
  }
];

const failures = [];

function addFailure(file, missing) {
  failures.push({ file, missing });
  console.error(`Workflow contract failed: ${file} missing "${missing}"`);
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

  for (const group of contract.anyOf || []) {
    if (!group.options.some((needle) => text.includes(needle))) {
      addFailure(contract.file, `${group.label}: ${group.options.join(' | ')}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Workflow contract check failed: ${failures.length} issue(s) found`);
  process.exit(1);
}

console.log('Workflow contract check passed');
