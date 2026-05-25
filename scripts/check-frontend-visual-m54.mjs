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

if (!renderContent.includes('appendNarrativeList')) {
  fail('M-54 PR 2b: appendNarrativeList function not found for mock narrative-list rendering');
}
if (!renderContent.includes('appendNarrativeItem')) {
  fail('M-54 PR 2b: appendNarrativeItem function not found for mock narrative-item rendering');
}
if (!renderContent.includes('narrative-item') || !renderContent.includes("'emoji'") || !renderContent.includes('NARRATIVE_EMOJI[item?.key]')) {
  fail('M-54 PR 2b: NARRATIVE_EMOJI must render through .narrative-item .emoji');
}
if (renderContent.includes('appendEditorialSignalCard')) {
  fail('M-54 PR 2b: legacy appendEditorialSignalCard must be removed (replaced by appendNarrativeList)');
}

// Check 3 (PR 2b rewrite): cross-validation must use mock consistency-block style.
// Legacy appendEditorialValidationCard removed per contract v3.0 sec 8.7.
if (renderContent.includes('appendEditorialValidationCard')) {
  fail('M-54 PR 2b: legacy appendEditorialValidationCard must be removed (replaced by appendConsistencyBlock)');
}
if (!renderContent.includes('appendConsistencyBlock')) {
  fail('M-54 PR 2b: appendConsistencyBlock function not found in renderMacroOverview.js (mock-compliant cross-validation rendering)');
}
if (!renderContent.includes('consistency-block')) {
  fail('M-54 PR 2b: consistency-block CSS class not found in renderMacroOverview.js');
}

if (errors.length > 0) {
  console.error('Frontend visual M-54 check FAILED:');
  errors.forEach(err => console.error('  -', err));
  process.exit(1);
}
console.log('Frontend visual M-54 check: PASS (evidence colors fixed + emoji prefix preserved for narrative-list + cross-validation migrated to mock consistency-block + typography scale)');
