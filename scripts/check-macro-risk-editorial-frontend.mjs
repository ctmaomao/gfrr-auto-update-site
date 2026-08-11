import fs from 'node:fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const html = read('index.html');
const overview = read('scripts/modules/renderMacroOverview.js');
const renderer = read('scripts/modules/renderMacroRiskEditorial.js');
const styles = read('assets/styles.css');
const e2e = read('tests/e2e/site-smoke.spec.mjs');

assert(html.includes('id="macro-risk-editorial" hidden'), 'integrated macro editorial container is missing or not hidden by default');
assert(html.includes('id="macro-editorial-content"'), 'integrated macro editorial content root is missing');
assert(html.includes('href="#macro-risk-editorial"') && html.includes('本期判读 AI'), 'top navigation must link to the integrated editorial');
for (const legacy of ['id="external-ai-auxiliary"', 'href="#external-ai-auxiliary"', 'External AI Auxiliary', 'id="ext-ai-']) assert(!html.includes(legacy), `legacy external AI UI marker must be removed: ${legacy}`);
assert(!fs.existsSync('scripts/modules/renderExternalAi.js'), 'legacy renderExternalAi.js must be deleted');
assert(overview.includes("import { renderMacroRiskEditorial } from './renderMacroRiskEditorial.js"), 'macro overview must import integrated editorial renderer');
assert(overview.includes('renderMacroRiskEditorial({ radarData });'), 'macro overview must call integrated editorial renderer');
assert(!overview.includes('renderExternalAiAuxiliary'), 'macro overview must not call legacy external AI renderer');
for (const marker of ['sourceDataUpdatedAt !== radarData.updatedAt', "layer.validation?.status !== 'pass'", "layer.qualityReview?.promotionEligible !== false", "layer.provenance?.humanApproved !== false", 'layer.freshness?.maxAgeHours !== MAX_AGE_HOURS', 'layer.boundaries?.frontendDisplayApproved !== true']) {
  assert(renderer.includes(marker), `frontend visibility guard missing: ${marker}`);
}
for (const unsafe of ['.innerHTML', 'insertAdjacentHTML', 'document.write']) assert(!renderer.includes(unsafe), `renderer must use safe DOM construction, found ${unsafe}`);
for (const className of ['.macro-editorial-header', '.macro-editorial-module-grid', '.macro-editorial-market-grid', '.macro-editorial-watch-row', '@media (max-width: 560px)']) assert(styles.includes(className), `macro editorial styles missing ${className}`);
assert(e2e.includes("page.locator('#macro-risk-editorial')") && e2e.includes("page.locator('#external-ai-auxiliary')).toHaveCount(0)"), 'e2e coverage must prove integrated visibility and legacy removal');

console.log('Macro risk editorial frontend PASS (integrated panel, fail-closed visibility, safe DOM, responsive layout, legacy UI removed)');
