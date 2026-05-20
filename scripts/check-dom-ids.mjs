import fs from 'node:fs';

const REQUIRED_IDS = [
  'runtime-badge',
  'realtime-updated-at',
  'rt-brent',
  'rt-dxy',
  'rt-vix',
  'rt-hy',
  'rt-us10y',
  'rt-gold',
  'rt-spx',
  'top-risks',
  'summary-text',
  'phase-signals',
  'liquidity-notes',
  'signal-notes',
  'action-watch',
  'asset-table-body',
  'scenario-list',
  'trigger-critical',
  'trigger-drivers',
  'trigger-watchlist',
  'world-heatmap',
  'heatmap-list',
  'core-dashboard',
  'detail-data-header',
  'advanced-audit'
];

const html = fs.readFileSync('index.html', 'utf8');

const missing = REQUIRED_IDS.filter((id) => {
  const pattern = new RegExp(`id=["']${id}["']`);
  return !pattern.test(html);
});

if (missing.length) {
  console.error('DOM id check failed. Missing ids:');
  missing.forEach((id) => console.error(`- ${id}`));
  process.exit(1);
}

console.log('DOM id check passed');
