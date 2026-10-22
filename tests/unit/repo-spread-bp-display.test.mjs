import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { classifyRepoEvidence } from '../../scripts/modules/macroOverviewNarrative.js';

const RENDER = fileURLToPath(new URL('../../scripts/modules/renderMacroOverview.js', import.meta.url));

function extract(name) {
  const src = fs.readFileSync(RENDER, 'utf8');
  const asyncNeedle = `async function ${name}`;
  const start = src.includes(asyncNeedle) ? src.indexOf(asyncNeedle) : src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `extract ${name}: function not found`);
  const rest = src.slice(start + 10);
  const match = /\n(?:export )?(?:async )?function [A-Za-z0-9_]+/.exec(rest);
  const end = match ? start + 10 + match.index : -1;
  assert.ok(end > start, `extract ${name}: function boundary not found`);
  return src.slice(start, end);
}

// Real render function + its real numeric helpers, with only the DOM sink stubbed.
// console.error throws so any unexpected catch inside the render function fails the test
// instead of being swallowed.
function buildSandbox() {
  const calls = [];
  const sandbox = {
    classifyRepoEvidence,
    setLeafText: (id, value) => calls.push([id, String(value)]),
    console: {
      error: (...args) => {
        throw new Error(`unexpected catch in renderMacroDriversPillars: ${args.map((arg) => String(arg)).join(' ')}`);
      },
    },
  };
  const source = [
    extract('asNumber'),
    extract('signedFixed'),
    extract('signedFixedWithZero'),
    extract('renderMacroDriversPillars'),
    'renderMacroDriversPillars',
  ].join('\n\n');
  const render = vm.runInNewContext(source, sandbox);
  return { render, calls, sandbox };
}

function radarDataFor(bgcrSofrSpread) {
  const fedLiquidity = {
    regime: '正常',
    reserveBalances: 3620000,
    onRrpLevel: '充裕',
    repoSpreadRegime: '正常',
    repoSpreadDateStatus: { bgcrSofr: 'same_day', tgcrSofr: 'mismatch' },
  };
  if (bgcrSofrSpread !== undefined) fedLiquidity.bgcrSofrSpread = bgcrSofrSpread;
  return {
    macroDrivers: {
      fedLiquidity,
      policyExpectations: {},
      curve: {},
      credit: { nfci: null },
    },
  };
}

function renderPillarOne(bgcrSofrSpread) {
  const { render, calls, sandbox } = buildSandbox();
  render({ radarData: radarDataFor(bgcrSofrSpread) });
  assert.equal(calls.length, 4, 'renderMacroDriversPillars must write all four pillar texts without hitting catch');
  const map = new Map(calls);
  assert.ok(map.has('pillar-1-text'));
  assert.ok(typeof sandbox.console.error === 'function', 'sandbox guard must stay wired');
  return map.get('pillar-1-text');
}

test('real pillar renders percentage-point spread as bps instead of a rounded 0', () => {
  assert.match(renderPillarOne(-0.02), /回购利差\(BGCR-SOFR\) -2bp/);
  assert.match(renderPillarOne(0.02), /回购利差\(BGCR-SOFR\) \+2bp/);
  assert.match(renderPillarOne(0), /回购利差\(BGCR-SOFR\) \+0bp/);
  assert.doesNotMatch(renderPillarOne(-0.02), /-0bp/);
  assert.doesNotMatch(renderPillarOne(0.02), /\+0bp/);
});

test('real pillar keeps missing spread pending and never fabricates 0bp', () => {
  for (const missing of [null, undefined, '', Number.NaN]) {
    const text = renderPillarOne(missing);
    assert.match(text, /回购利差\(BGCR-SOFR\) 待核验/, `missing case ${String(missing)}`);
    assert.doesNotMatch(text, /[+-]?\d+bp/, `missing case ${String(missing)} must not render bp`);
    assert.doesNotMatch(text, /[+-]0bp/, `missing case ${String(missing)} must not render 0bp`);
  }
});

test('real pillar rejects malformed non-number spread shapes as pending', () => {
  for (const malformed of [false, [], {}, '0.02', '-0.02', '0']) {
    const text = renderPillarOne(malformed);
    assert.match(text, /回购利差\(BGCR-SOFR\) 待核验/, `malformed case ${String(malformed)}`);
    assert.doesNotMatch(text, /[+-]?\d+bp/, `malformed case ${String(malformed)} must not render bp`);
    assert.doesNotMatch(text, /[+-]0bp/, `malformed case ${String(malformed)} must not render 0bp`);
  }
  // Keep the real numeric helpers as the render dependency; assert only contract-valid
  // numbers here. The global asNumber(null/empty) === 0 coercion is a known helper issue
  // and must not be locked into this contract test.
  const asNumber = vm.runInNewContext(`${extract('asNumber')}\nasNumber`, {});
  const signedFixedWithZero = vm.runInNewContext(`${extract('signedFixedWithZero')}\nsignedFixedWithZero`, { asNumber });
  assert.equal(signedFixedWithZero(0, 0), '+0');
  assert.equal(signedFixedWithZero(2, 0), '+2');
  assert.equal(signedFixedWithZero(-2, 0), '-2');
});
