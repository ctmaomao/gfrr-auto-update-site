import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const POLICY_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md';
const POLICY_FIXTURE = 'docs/fixtures/route-level-tanker-freight-baltic-context-policy-v1.json';

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, marker, label) {
  assert(text.includes(marker), `${label} missing marker: ${marker}`);
}

function allFalse(record, label) {
  for (const [key, value] of Object.entries(record || {})) {
    assert(value === false, `${label}.${key} must be false.`);
  }
}

function allTrue(record, label) {
  for (const [key, value] of Object.entries(record || {})) {
    assert(value === true, `${label}.${key} must be true.`);
  }
}

function assertPolicyDoc() {
  assert(fs.existsSync(absolute(POLICY_DOC)), 'Baltic context policy doc is missing.');
  const doc = readText(POLICY_DOC);
  for (const marker of [
    'Docs/checker-only coexistence policy',
    'card-c1-shipping-freight',
    'Baltic Freight / 波罗的海运费',
    'macroDrivers.shippingFreight',
    'c1-route-tanker-freight',
    'macroDrivers.energyTransport.routeFreightConfirmation',
    'keep Baltic Freight as broad context',
    'future route-level card is additive if implemented',
    'current thematic card count remains 51',
    'future additive thematic card count would be 52',
    'Deletion or replacement is not approved'
  ]) {
    assertIncludes(doc, marker, POLICY_DOC);
  }
}

function assertPolicyFixture() {
  assert(fs.existsSync(absolute(POLICY_FIXTURE)), 'Baltic context policy fixture is missing.');
  const policy = readJson(POLICY_FIXTURE);
  assert(policy.contractVersion === 'route-level-tanker-freight-baltic-context-policy-v1', 'Unexpected contractVersion.');
  assert(policy.kind === 'route_level_tanker_freight_baltic_context_policy', 'Unexpected kind.');
  assert(policy.status === 'docs_checker_only_no_frontend_change', 'Policy must stay docs/checker-only.');
  assert(policy.existingCard?.domId === 'card-c1-shipping-freight', 'Existing Baltic card DOM id must be locked.');
  assert(policy.existingCard?.sourceField === 'macroDrivers.shippingFreight', 'Existing card source field mismatch.');
  assert(policy.existingCard?.role === 'broad_freight_context', 'Existing card must remain broad context.');
  assert(policy.existingCard?.deleteApproved === false, 'Baltic card deletion must not be approved.');
  assert(policy.existingCard?.routeLevelConfirmationApproved === false, 'Baltic card must not become route-level confirmation.');
  assert(policy.futureRouteLevelCard?.proposedDomId === 'c1-route-tanker-freight', 'Unexpected future route card DOM id.');
  assert(policy.futureRouteLevelCard?.futureSourceField === 'macroDrivers.energyTransport.routeFreightConfirmation', 'Unexpected future source field.');
  assert(policy.futureRouteLevelCard?.frontendImplementationApproved === false, 'Future route card implementation must not be approved.');
  assert(policy.futureRouteLevelCard?.productionWriteApproved === false, 'Future route card production write must not be approved.');
  assert(policy.iaDecision?.currentPolicy === 'keep_baltic_freight_as_broad_context', 'Unexpected current policy.');
  assert(policy.iaDecision?.futureImplementationMode === 'additive_card_until_separate_deprecation_review', 'Unexpected future implementation mode.');
  assert(policy.iaDecision?.currentExpectedThematicCardCount === 51, 'Current thematic card count must remain 51.');
  assert(policy.iaDecision?.futureAdditiveExpectedThematicCardCount === 52, 'Future additive card count must be 52.');
  assert(policy.iaDecision?.deletionRequiresSeparateReview === true, 'Deletion must require separate review.');
  assert(policy.iaDecision?.mergeRequiresSeparateReview === true, 'Merge must require separate review.');
  assert(policy.currentProductionState?.shippingFreightConnected === true, 'shippingFreight must remain connected.');
  assert(policy.currentProductionState?.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(policy.currentProductionState?.sourceRightsStatus === 'manual_review_required', 'source rights must still require manual review.');
  allFalse(policy.approvalState, 'policy.approvalState');
  allTrue(policy.boundaries, 'policy.boundaries');
}

function assertFrontendState() {
  const html = readText('index.html');
  for (const marker of [
    'card-c1-shipping-freight',
    'c1-freight-status',
    'c1-freight-badge',
    'c1-freight-number',
    'c1-freight-aux',
    'Baltic Freight',
    '波罗的海运费',
    'StockQ BDTI/BCTI/BDI'
  ]) {
    assertIncludes(html, marker, 'index.html');
  }
  assert(!html.includes('c1-route-tanker-freight'), 'Future route-level card DOM is not approved yet.');
  const thematicCardCount = (html.slice(
    html.indexOf('<section class="editorial-section" id="macro-thematic-cards"'),
    html.indexOf('<section class="editorial-section" id="global-risk-heatmap"')
  ).match(/<article class="indicator-card/g) || []).length;
  assert(thematicCardCount === 51, `Thematic card count must remain 51, got ${thematicCardCount}.`);
}

function assertProductionDataState() {
  const radar = readJson('data/radar-data.json');
  const freight = radar?.macroDrivers?.shippingFreight;
  assert(freight && typeof freight === 'object', 'macroDrivers.shippingFreight must remain present.');
  assert(freight.source === 'StockQ:BDTI; StockQ:BCTI; StockQ:BDI', 'shippingFreight source string drifted.');
  assert(!radar?.macroDrivers?.energyTransport?.routeFreightConfirmation, 'Production routeFreightConfirmation field is not approved yet.');
  const candidate = radar?.macroDrivers?.energyTransport?.transportShockCandidate;
  if (candidate) {
    assert(candidate.routeFreightConfirmation === 'not_connected', 'transportShockCandidate.routeFreightConfirmation must stay not_connected.');
    assert(candidate.marketConfirmation === 'not_connected', 'transportShockCandidate.marketConfirmation must stay not_connected.');
    assert(candidate.eligibleForMainScore === false, 'transportShockCandidate.eligibleForMainScore must stay false.');
  }
}

function assertRendererState() {
  const renderer = readText('scripts/modules/renderMacroOverview.js');
  for (const marker of [
    "const sf = radarData?.macroDrivers?.shippingFreight",
    "'c1-freight-status'",
    "'c1-freight-badge'",
    "'c1-freight-number'",
    "'c1-freight-aux'"
  ]) {
    assertIncludes(renderer, marker, 'scripts/modules/renderMacroOverview.js');
  }
  assert(!renderer.includes('c1-route-tanker-freight'), 'Future route-level card renderer is not approved yet.');
}

function assertAuthorityDocs() {
  const index = readText('docs/INDEX.md');
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/PROJECT_BACKLOG.md');
  const agents = readText('AGENTS.md');
  const packageJson = readJson('package.json');
  const checkSuite = readText('scripts/check-suite.mjs');

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-baltic-context-policy-v1',
    'Route-level tanker freight Baltic context policy',
    'keep_baltic_freight_as_broad_context',
    'additive_card_until_separate_deprecation_review'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-baltic-context-policy-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight Baltic context policy', 'docs/PROJECT_BACKLOG.md');
  assertIncludes(agents, 'route-level tanker freight Baltic context policy', 'AGENTS.md');
  assert(packageJson.scripts['check:route-level-tanker-freight-baltic-context-policy'], 'package.json missing Baltic context policy check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-baltic-context-policy', 'scripts/check-suite.mjs');
}

function main() {
  assertPolicyDoc();
  assertPolicyFixture();
  assertFrontendState();
  assertProductionDataState();
  assertRendererState();
  assertAuthorityDocs();
  console.log('Route-level tanker freight Baltic context policy: PASS');
}

main();
