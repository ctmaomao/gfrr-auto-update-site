import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, needle, label) {
  assert(text.includes(needle), `${label} missing required marker: ${needle}`);
}

const daily = readText('scripts/run-daily-pipeline.mjs');
const render = readText('scripts/modules/render.js');
const macroOverview = readText('scripts/modules/renderMacroOverview.js');
const crossValidation = readText('scripts/modules/buildCrossValidationMatrix.js');
const validator = readText('scripts/validate-data.mjs');
const html = readText('index.html');
const packageJson = readText('package.json');

for (const marker of [
  'BRENT_TERM_STRUCTURE_FETCH_TIMEOUT_MS',
  'resolveBrentTermStructureProxy',
  'fetchYahooBrentContract',
  'query1.finance.yahoo.com/v8/finance/chart/',
  'buildFormalDatedBrentStatus',
  'buildShippingFreightProxyStatus',
  'termStructureProxy',
  'formalDatedBrent',
  'shippingFreightProxy'
]) {
  assertIncludes(daily, marker, 'run-daily-pipeline');
}

for (const marker of [
  'brent-formal-dated',
  'brent-term-structure-proxy',
  'brent-shipping-freight-proxy'
]) {
  assertIncludes(html, `id="${marker}"`, 'index.html');
  assertIncludes(render, marker, 'render.js');
}

for (const marker of [
  'formatBrentStatusNode',
  'formatBrentTermStructureProxy',
  'Number.isFinite(Number(node.value))',
  'formatBrentValue(proxy.frontToBackSpread)'
]) {
  assertIncludes(render, marker, 'render.js');
}

for (const marker of [
  'validateBrentTermStructureProxy',
  'validateBrentLayerStatusNode',
  'status ok requires finite value',
  'value must not use 0 as a missing placeholder'
]) {
  assertIncludes(validator, marker, 'validate-data');
}

for (const marker of [
  'brentTermStructureEvidenceLine',
  'Brent 期限结构公开代理'
]) {
  assertIncludes(macroOverview, marker, 'renderMacroOverview');
}
assertIncludes(crossValidation, 'term_structure_proxy', 'buildCrossValidationMatrix');
assertIncludes(crossValidation, 'Brent 期限结构公开代理', 'buildCrossValidationMatrix');

for (const phrase of [
  'Platts Dated Brent 已接入',
  '真实 Dated Brent 已接入',
  '正式 Dated Brent 已接入',
  'shipping / freight stress 已接入'
]) {
  assert(!daily.includes(phrase), `run-daily-pipeline contains forbidden connected claim: ${phrase}`);
  assert(!render.includes(phrase), `render.js contains forbidden connected claim: ${phrase}`);
  assert(!macroOverview.includes(phrase), `renderMacroOverview contains forbidden connected claim: ${phrase}`);
  assert(!crossValidation.includes(phrase), `buildCrossValidationMatrix contains forbidden connected claim: ${phrase}`);
}

for (const pattern of [
  /termStructureProxy[^;\n]*\|\|\s*0/u,
  /formalDatedBrent[^;\n]*\|\|\s*0/u,
  /shippingFreightProxy[^;\n]*\|\|\s*0/u,
  /\.toFixed\([^)]*\)\s*:\s*['"]0\.00['"]/u,
  /\.toFixed\([^)]*\)\s*:\s*['"]\+0\.0bp['"]/u
]) {
  assert(!pattern.test(render), `render.js contains forbidden null-to-zero fallback pattern: ${pattern}`);
}

assertIncludes(packageJson, '"check:brent-production-proxy-display"', 'package.json');
assertIncludes(packageJson, 'check:brent-production-proxy-display && npm run check:macro-drivers-fed-liquidity-extended', 'package.json check:all order');

console.log('Brent production proxy display check passed.');
