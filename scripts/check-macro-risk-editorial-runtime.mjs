import fs from 'node:fs';
import { assertValid } from './macro-risk/editorial-contract.mjs';
import { inspectRetainedEditorial } from './macro-risk/editorial-runtime-check.mjs';

if (process.argv.length > 2) throw new Error('Retained editorial check takes no flags; use the strict live command for production acceptance.');
const radarData = JSON.parse(fs.readFileSync('data/radar-data.json', 'utf8'));
const result = assertValid(inspectRetainedEditorial(radarData), 'macro risk editorial retained snapshot');
if (result.status === 'expired_hidden') {
  const message = `Macro risk editorial expired_hidden (${result.ageHours.toFixed(1)}h); deterministic overview remains active; no new AI refresh verified.`;
  console.warn(process.env.GITHUB_ACTIONS === 'true' ? `::warning::${message}` : `WARN ${message}`);
} else {
  console.log(`Macro risk editorial retained snapshot ${result.status === 'valid' ? 'PASS' : 'SKIP'} (${result.status})`);
}
