import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
function fail(msg) { errors.push(msg); }

// Check 1: assets/styles.css evidence color semantic
const cssPath = resolve('assets/styles.css');
const cssContent = readFileSync(cssPath, 'utf8');

// Verify supporting evidence is now red
const supportingRedPattern = /\.editorial-evidence-supporting\s*\{\s*border-top-color:\s*var\(--risk-red\)/;
if (!supportingRedPattern.test(cssContent)) {
  fail('M-54 evidence color fix: supporting should use --risk-red');
}

// Verify contradicting evidence is now green
const contradictingGreenPattern = /\.editorial-evidence-contradicting\s*\{\s*border-top-color:\s*var\(--risk-green\)/;
if (!contradictingGreenPattern.test(cssContent)) {
  fail('M-54 evidence color fix: contradicting should use --risk-green');
}

// Verify typography scale variables exist
const typographyVars = [
  '--font-size-xs',
  '--font-size-sm',
  '--font-size-base',
  '--font-size-md',
  '--font-size-lg',
  '--font-size-xl',
  '--font-size-2xl',
  '--font-size-3xl',
];
for (const v of typographyVars) {
  if (!cssContent.includes(v)) {
    fail(`M-54 typography scale: ${v} not found in styles.css :root`);
  }
}

// Check 2: scripts/modules/renderMacroOverview.js emoji prefix
const renderPath = resolve('scripts/modules/renderMacroOverview.js');
const renderContent = readFileSync(renderPath, 'utf8');

// Verify NARRATIVE_EMOJI constant
if (!renderContent.includes('NARRATIVE_EMOJI')) {
  fail('M-54 narrative emoji: NARRATIVE_EMOJI constant not found');
}

const expectedEmojis = [
  { id: 'energy_shock', emoji: '⚡' },
  { id: 'stagflation_pressure', emoji: '⚖️' },
  { id: 'risk_asset_mismatch', emoji: '📉' },
  { id: 'overheat_confirmation', emoji: '🔥' },
  { id: 'credit_spread_warning', emoji: '💰' },
  { id: 'liquidity_tightening', emoji: '💧' },
  { id: 'world_order_pressure_crossing', emoji: '🌐' },
];
for (const { id, emoji } of expectedEmojis) {
  if (!renderContent.includes(id) || !renderContent.includes(emoji)) {
    fail(`M-54 narrative emoji: ${id} or ${emoji} not found`);
  }
}

// Check 3: evidence order in renderMacroOverview.js
// supporting must come before contradicting must come before missing
const cardStart = renderContent.indexOf('function appendEditorialValidationCard');
const cardEnd = renderContent.indexOf('function appendEditorialSignalSublist', cardStart);
const cardContent = cardStart >= 0 && cardEnd > cardStart
  ? renderContent.slice(cardStart, cardEnd)
  : '';
const supportingIdx = cardContent.indexOf("'支持证据'");
const contradictingIdx = cardContent.indexOf("'矛盾证据'");
const missingIdx = cardContent.indexOf("'缺失证据'");

if (!cardContent || supportingIdx === -1 || contradictingIdx === -1 || missingIdx === -1) {
  fail('M-54 evidence order: not all 3 evidence labels found');
} else {
  if (!(supportingIdx < contradictingIdx && contradictingIdx < missingIdx)) {
    fail(`M-54 evidence order: expected supporting < contradicting < missing, got positions ${supportingIdx}, ${contradictingIdx}, ${missingIdx}`);
  }
}

if (errors.length > 0) {
  console.error('Frontend visual M-54 check FAILED:');
  errors.forEach(err => console.error('  -', err));
  process.exit(1);
}
console.log('Frontend visual M-54 check: PASS (evidence colors fixed + emoji prefix added + evidence reordered + typography scale)');
