import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const checker = path.join(repo, 'scripts/check-route-level-tanker-freight-baltic-context-policy.mjs');
const policy = 'docs/fixtures/route-level-tanker-freight-baltic-context-policy-v1.json';
const policyDoc = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md';
const entries = ['INDEX', 'DATA_SOURCES', 'DATA_CONTRACT', 'SIGNAL_INTAKE',
  'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY', 'AGENT_DOMAIN_BOUNDARIES'].map(name => `docs/${name}.md`);
const inputs = [...entries, policy, policyDoc, 'index.html', 'data/radar-data.json',
  'scripts/modules/renderMacroOverview.js', 'package.json', 'scripts/check-suite.mjs'];

function runWith(mutate, expectedPass) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-baltic-policy-'));
  const change = (name, fn) => {
    const target = path.join(dir, name);
    fs.writeFileSync(target, fn(fs.readFileSync(target, 'utf8')));
  };
  const json = (name, fn) => change(name, text => {
    const value = JSON.parse(text); fn(value); return JSON.stringify(value);
  });
  try {
    for (const name of inputs) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.copyFileSync(path.join(repo, name), path.join(dir, name));
    }
    mutate({ change, json, dir });
    const result = spawnSync(process.execPath, [checker], { cwd: dir, encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error);
    if (expectedPass) assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0, 'unsafe/missing input unexpectedly passed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('canonical policy and live state pass without repeated policy prose', () => {
  runWith(({ change }) => {
    for (const entry of entries) change(entry, () => '[Policy](ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md)');
  }, true);
});

for (const entry of entries) test(`missing or wrong canonical link fails: ${entry}`, () => {
  for (const replacement of ['', 'ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md',
    '[Policy](missing-policy.md)']) {
    runWith(({ change }) => change(entry, () => replacement), false);
  }
});

for (const marker of ['Deletion or replacement is not approved',
  'keep_baltic_freight_as_broad_context', 'additive_card_until_separate_deprecation_review',
  '(fixtures/route-level-tanker-freight-baltic-context-policy-v1.json)']) {
  test(`canonical policy retains required evidence: ${marker}`, () => {
    runWith(({ change }) => change(policyDoc, text => text.replaceAll(marker, 'removed')), false);
  });
}

const unsafePolicy = [
  p => { delete p.contractVersion; },
  p => { p.existingCard.deleteApproved = true; },
  p => { p.existingCard.routeLevelConfirmationApproved = true; },
  p => { p.futureRouteLevelCard.productionWriteApproved = true; },
  p => { p.iaDecision.currentExpectedThematicCardCount = 53; },
  p => { p.currentProductionState.routeFreightConfirmation = 'connected'; },
  p => { p.currentProductionState.sourceRightsStatus = 'approved'; },
  p => { p.approvalState.mainScoreApproved = true; },
  p => { p.boundaries.noProductionDataWrite = false; }
];
test('fixture and authorization negative cases remain rejected', () => {
  for (const mutation of unsafePolicy) runWith(({ json }) => json(policy, mutation), false);
});

test('DOM, production, renderer and check registration remain enforced', () => {
  runWith(({ change }) => change('index.html', text => text.replace('<article class="indicator-card', '<article class="removed-card')), false);
  runWith(({ change }) => change('index.html', text => `${text}\nc1-route-tanker-freight`), false);
  runWith(({ json }) => json('data/radar-data.json', radar => {
    radar.macroDrivers.energyTransport.routeFreightConfirmation = { status: 'confirmed' };
  }), false);
  runWith(({ change }) => change('scripts/modules/renderMacroOverview.js', text => `${text}\nc1-route-tanker-freight`), false);
  runWith(({ json }) => json('package.json', pkg => {
    delete pkg.scripts['check:route-level-tanker-freight-baltic-context-policy'];
  }), false);
  runWith(({ change }) => change('scripts/check-suite.mjs', text => text.replaceAll('check:route-level-tanker-freight-baltic-context-policy', 'removed')), false);
});

for (const section of ['approvalState', 'boundaries']) {
  test(`${section} requires a complete boolean object`, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(repo, policy), 'utf8'));
    for (const invalid of [undefined, null, {}, [], false, true, 0, 1, '']) {
      runWith(({ json }) => json(policy, p => { p[section] = invalid; }), false);
    }
    for (const key of Object.keys(fixture[section])) {
      runWith(({ json }) => json(policy, p => { delete p[section][key]; }), false);
      for (const invalid of [null, !fixture[section][key], String(fixture[section][key]), 0, 1]) {
        runWith(({ json }) => json(policy, p => { p[section][key] = invalid; }), false);
      }
    }
    runWith(({ json }) => json(policy, p => { p[section].unexpected = section === 'approvalState'; }), false);
    // Existing all-value checks still permit additional equally restrictive flags.
    runWith(({ json }) => json(policy, p => { p[section].additionalGuard = section === 'boundaries'; }), true);
  });
}
