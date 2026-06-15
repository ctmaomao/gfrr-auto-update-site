import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  MACRO_OVERVIEW_NARRATIVE_BYTE_BUDGET,
  MACRO_OVERVIEW_NARRATIVE_VERSION,
  buildMacroOverviewNarrativePlan,
  buildMacroOverviewVerdictBodyFromPlan,
} from './modules/macroOverviewNarrative.js';

const ROOT = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readText(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || '')).length;
}

function assertNoEngineeringText(text) {
  const forbidden = [
    'audit-only',
    'display-only',
    'scoring',
    'decisionModel',
    'executionLock',
    'positionGuidance',
    'externalAiGenerated',
    'promotionEligible',
    'frontendDisplayApproved',
  ];
  for (const term of forbidden) {
    assert(!text.includes(term), `verdict body must not expose engineering term '${term}'`);
  }

  const snake = text.match(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/gu) || [];
  assert(snake.length === 0, `verdict body must not expose snake_case terms: ${snake.join(', ')}`);
}

function assertBoundaryIsolation() {
  const sourceFiles = [
    'scripts/run-daily-pipeline.mjs',
    'scripts/validate-data.mjs',
    'scripts/modules/decision.js',
    'scripts/modules/realtime.js',
    'scripts/modules/buildCrossValidationMatrix.js',
  ];
  for (const file of sourceFiles) {
    const source = readText(file);
    assert(!source.includes('buildMacroOverviewNarrativePlan'), `${file} must not import/use macro overview narrative planner`);
    assert(!source.includes(MACRO_OVERVIEW_NARRATIVE_VERSION), `${file} must not reference ${MACRO_OVERVIEW_NARRATIVE_VERSION}`);
  }

  const data = readJson('data/radar-data.json');
  assert(!Object.prototype.hasOwnProperty.call(data, 'macroOverviewNarrative'), 'macro overview narrative must stay render-time only, not persisted in radar-data.json');
  assert(!Object.prototype.hasOwnProperty.call(data, 'macroNarrativePlan'), 'macro narrative plan must stay render-time only, not persisted in radar-data.json');
}

function main() {
  const radarData = readJson('data/radar-data.json');
  const worldOrderStressData = readJson('data/world-order-stress.json');
  const marketPricingMetricsData = readJson('data/market-pricing-metrics.json');
  const oilDirectionalData = readJson('data/oil-directional-pressure.json');

  const plan = buildMacroOverviewNarrativePlan({
    radarData,
    worldOrderStressData,
    marketPricingMetricsData,
    oilDirectionalData,
  });
  const verdict = buildMacroOverviewVerdictBodyFromPlan(plan);
  const verdictBytes = byteLength(verdict);

  assert(plan.version === MACRO_OVERVIEW_NARRATIVE_VERSION, 'narrative plan version mismatch');
  assert(plan.sourceMode === 'local_frontend_evidence_pack', 'narrative plan must use local frontend evidence pack');
  assert(plan.boundaries?.displayOnly === true, 'narrative boundary must be displayOnly=true');
  assert(plan.boundaries?.affectsScoring === false, 'narrative boundary must not affect scoring');
  assert(plan.boundaries?.affectsDecisionModel === false, 'narrative boundary must not affect decisionModel');
  assert(plan.boundaries?.affectsExecutionLock === false, 'narrative boundary must not affect executionLock');
  assert(plan.boundaries?.affectsPositionGuidance === false, 'narrative boundary must not affect positionGuidance');
  assert(plan.boundaries?.affectsCrossValidation === false, 'narrative boundary must not affect cross-validation');
  assert(plan.boundaries?.affectsGlobalRiskHeatmap === false, 'narrative boundary must not affect Global Risk Heatmap');
  assert(plan.boundaries?.usesExternalAi === false, 'narrative planner must not use external AI');

  assert(verdictBytes >= MACRO_OVERVIEW_NARRATIVE_BYTE_BUDGET.min, `verdict body too short: ${verdictBytes} bytes`);
  assert(verdictBytes <= MACRO_OVERVIEW_NARRATIVE_BYTE_BUDGET.max, `verdict body too long: ${verdictBytes} bytes`);
  assert(Array.isArray(plan.sections) && plan.sections.length >= 5, 'narrative plan must contain at least 5 sections');
  assert(Array.isArray(plan.evidenceHighlights) && plan.evidenceHighlights.length >= 12, 'narrative plan must carry at least 12 evidence highlights');

  const sectionKeys = new Set(plan.sections.map((section) => section.key));
  for (const key of ['scorecard', 'oil_directional_pressure', 'market_credit_confirmation', 'policy_liquidity', 'conclusion']) {
    assert(sectionKeys.has(key), `narrative plan missing section '${key}'`);
  }

  for (const section of plan.sections) {
    assert(typeof section.summaryZh === 'string' && byteLength(section.summaryZh) >= 100, `section '${section.key}' summary is too thin`);
    assert(Array.isArray(section.sourceIndicators) && section.sourceIndicators.length > 0, `section '${section.key}' missing sourceIndicators`);
  }

  const oilSection = plan.sections.find((section) => section.key === 'oil_directional_pressure');
  assert(oilSection?.sourceIndicators?.includes('oil-directional-pressure'), 'ODP section must cite oil-directional-pressure source');
  assert(verdict.includes('ODP') && verdict.includes('油价') && verdict.includes('布伦特'), 'verdict body must explicitly integrate ODP oil-price evidence');
  assert(verdict.includes('高收益债利差') && verdict.includes('世界秩序压力'), 'verdict body must integrate credit and world-order evidence');
  assertNoEngineeringText(verdict);

  const renderer = readText('scripts/modules/renderMacroOverview.js');
  const app = readText('scripts/app.js');
  assert(renderer.includes("import { buildMacroOverviewVerdictBody } from './macroOverviewNarrative.js"), 'renderMacroOverview must import macroOverviewNarrative');
  assert(renderer.includes('oilDirectionalData'), 'renderMacroOverview must accept/pass oilDirectionalData');
  assert(app.includes('renderMacroOverview({ radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData, oilDirectionalData })'), 'app.js must pass oilDirectionalData into Macro Overview');

  assertBoundaryIsolation();

  if (errors.length > 0) {
    console.error('Macro Overview narrative check FAILED:');
    errors.forEach((message) => console.error('  -', message));
    process.exit(1);
  }

  console.log(`Macro Overview narrative check: PASS (${verdictBytes} bytes, ${plan.sections.length} sections, ${plan.evidenceHighlights.length} evidence highlights)`);
}

main();
