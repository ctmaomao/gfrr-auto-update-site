import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const html = read('index.html');
const renderer = read('scripts/modules/renderMacroOverview.js');
const styles = read('assets/styles.css');
const design = read('DESIGN.md');
const adr = read('docs/ADR/0023-macro-overview-narrative-first-evidence-on-demand.md');
const pkg = read('package.json');
const suite = read('scripts/check-suite.mjs');
const e2e = read('tests/e2e/site-smoke.spec.mjs');

const overviewStart = html.indexOf('<section class="editorial-section" id="macro-risk-overview"');
const overviewEnd = html.indexOf('<section class="editorial-section" id="macro-thematic-cards"', overviewStart);
assert(overviewStart >= 0 && overviewEnd > overviewStart, 'macro overview boundaries are missing');
const overview = html.slice(overviewStart, overviewEnd);

const primaryOrder = [
  'homepage-today-judgment',
  'macro-risk-editorial',
  'wow-key-changes',
  'homepage-macro-drivers',
  'homepage-market-temperature',
  'macro-professional-evidence',
];
let previous = -1;
for (const id of primaryOrder) {
  const offset = overview.indexOf(`id="${id}"`);
  assert(offset > previous, `primary narrative order drifted at #${id}`);
  previous = offset;
}

const foldOpenTag = overview.match(/<details\s+class="macro-evidence-fold"\s+id="macro-professional-evidence"([^>]*)>/u);
assert(foldOpenTag, 'professional evidence details container is missing');
assert(!/\bopen\b/u.test(foldOpenTag[1]), 'professional evidence must not be statically open');
const foldStart = overview.indexOf(foldOpenTag[0]);
const foldEnd = overview.indexOf('</details>', foldStart);
assert(foldEnd > foldStart, 'professional evidence details closing tag is missing');
const fold = overview.slice(foldStart, foldEnd);
const evidenceOrder = [
  'homepage-pressure-sources',
  'homepage-signal-layers',
  'homepage-risk-engines',
  'homepage-cross-validation',
  'homepage-macro-coherence',
];
previous = -1;
for (const id of evidenceOrder) {
  const offset = fold.indexOf(`id="${id}"`);
  assert(offset > previous, `professional evidence order drifted at #${id}`);
  previous = offset;
}
assert(fold.includes('id="macro-professional-evidence-status"'), 'evidence fold runtime status is missing');

const navStart = html.indexOf('<nav class="dashboard-jump-nav"');
const navEnd = html.indexOf('</nav>', navStart);
assert(navStart >= 0 && navEnd > navStart, 'dashboard jump navigation is missing');
const nav = html.slice(navStart, navEnd);
const navHrefs = [...nav.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
const expectedNav = [
  '#homepage-today-judgment',
  '#macro-risk-editorial',
  '#wow-key-changes',
  '#homepage-macro-drivers',
  '#homepage-market-temperature',
  '#macro-professional-evidence',
  '#macro-thematic-cards',
  '#global-risk-heatmap',
  '#oil-directional-pressure',
  '#detail-data',
  '#world-order-stress-section',
  '#method-evidence',
  '#execution-risk-detail',
];
assert(JSON.stringify(navHrefs) === JSON.stringify(expectedNav), `jump-nav order/count drifted: ${navHrefs.join(' / ')}`);
for (const removed of ['#homepage-pressure-sources', '#homepage-signal-layers', '#homepage-risk-engines', '#homepage-cross-validation', '#homepage-macro-coherence']) {
  assert(!navHrefs.includes(removed), `technical child anchor must be consolidated out of top navigation: ${removed}`);
}

for (const marker of [
  'function syncProfessionalEvidenceDisclosure(editorialVisible)',
  'evidence.open = !usesEditorial',
  "evidence.dataset.editorialState = usesEditorial ? 'editorial-visible' : 'deterministic-fallback'",
  'const editorialVisible = renderMacroRiskEditorial({ radarData });',
  'syncProfessionalEvidenceDisclosure(editorialVisible);',
]) {
  assert(renderer.includes(marker), `conditional evidence fallback marker missing: ${marker}`);
}

for (const marker of [
  '.macro-evidence-fold',
  '.macro-evidence-summary',
  '.macro-evidence-marker::before',
  '.macro-evidence-fold[open] .macro-evidence-marker::before',
  '.macro-evidence-content',
]) {
  assert(styles.includes(marker), `professional evidence style missing: ${marker}`);
}

for (const marker of ['ADR-0023', '#macro-professional-evidence', 'AI 判读不可用时自动展开']) {
  assert(design.includes(marker) || adr.includes(marker), `IA authority marker missing: ${marker}`);
}
assert(pkg.includes('"check:macro-overview-evidence-fold"'), 'package.json must expose the evidence-fold contract check');
assert(suite.includes("'check:macro-overview-evidence-fold'"), 'frontend-live-contracts must include the evidence-fold check');
for (const marker of [
  "page.locator('#macro-professional-evidence')",
  "toHaveAttribute('data-editorial-state', 'editorial-visible')",
  "toHaveAttribute('data-editorial-state', 'deterministic-fallback')",
]) {
  assert(e2e.includes(marker), `e2e evidence-fold coverage missing: ${marker}`);
}

console.log('Macro overview evidence fold PASS (13 nav items, narrative-first order, 5 preserved evidence blocks, conditional deterministic fallback)');
