// Free, credit-only refresh of the existing Bubble display payload. Default is dry-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCreditSpreads, creditPublicationEnabled, CREDIT_SERIES, validateCreditPoints } from './bubble-watch/credit-spreads.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'data/bubble-watch.json');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--write') || args.length > 1) throw new Error('Usage: node scripts/refresh-bubble-credit-spreads.mjs [--write]');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/bubble-credit-spreads.json'), 'utf8'));
if (!creditPublicationEnabled(config)) throw new Error('Credit publication not enabled by owner');
const original = fs.readFileSync(target, 'utf8');
const data = JSON.parse(original);
const credit = await collectCreditSpreads({ previous: data.credit_spreads });
for (const key of Object.keys(CREDIT_SERIES)) validateCreditPoints(credit.series[key]);
const output = { ...data, credit_spreads: credit };
const withoutCredit = value => { const { credit_spreads, ...rest } = value; return JSON.stringify(rest); };
if (withoutCredit(output) !== withoutCredit(data)) throw new Error('Credit-only mutation guard failed');
if (fs.readFileSync(target, 'utf8') !== original) throw new Error('Bubble payload changed during fetch; refusing to overwrite');
if (args.includes('--write')) fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ mode: args.includes('--write') ? 'written' : 'dry-run', field: 'credit_spreads', sources: credit.sources }, null, 2));
