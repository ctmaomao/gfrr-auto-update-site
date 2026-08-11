import fs from 'node:fs';

import { assertValid } from './macro-risk/editorial-contract.mjs';
import { validateEditorialProduction } from './macro-risk/editorial-production.mjs';

const requireLayer = process.argv.includes('--require-layer');
const radarData = JSON.parse(fs.readFileSync('data/radar-data.json', 'utf8'));
if (!radarData.macroRiskEditorialLayer) {
  if (requireLayer) throw new Error('data/radar-data.json is missing required macroRiskEditorialLayer');
  console.log('Macro risk editorial live layer SKIP (not written yet; deterministic macro overview remains active)');
} else {
  const result = assertValid(validateEditorialProduction(radarData.macroRiskEditorialLayer, radarData), 'macro risk editorial live layer');
  console.log(`Macro risk editorial live layer PASS (sources=${radarData.macroRiskEditorialLayer.sourceLedger.length}, errors=${result.errors.length})`);
}
