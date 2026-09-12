import fs from 'node:fs';
import { assertValid } from './macro-risk/editorial-contract.mjs';
import { validateEditorialPreviousIssue } from './macro-risk/editorial-history.mjs';

const radarData = JSON.parse(fs.readFileSync('data/radar-data.json', 'utf8'));
if (Object.hasOwn(radarData, 'macroRiskEditorialPreviousIssue')) {
  assertValid(validateEditorialPreviousIssue(radarData.macroRiskEditorialPreviousIssue, radarData), 'macro risk editorial previous issue');
  console.log('Macro risk editorial previous issue PASS (historical only; original clocks and output digest verified)');
} else console.log('Macro risk editorial previous issue SKIP (no retained issue yet)');
