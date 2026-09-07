import { readFile } from 'node:fs/promises';
import { reviewArrIndependentEvidence } from './bubble-watch/arr-independent-source-review.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !/^--as-of=\d{4}-\d{2}-\d{2}$/u.test(args[0]))) {
    throw new Error('invalid options');
  }
  const asOfDate = args.length ? args[0].slice('--as-of='.length) : new Date().toISOString().slice(0, 10);
  const input = JSON.parse(await readFile(new URL('../config/bubble-watch-arr-evidence.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(reviewArrIndependentEvidence(input, { asOfDate }), null, 2));
} catch {
  console.error('ARR candidate review failed: invalid input, date, options, or unavailable candidate file.');
  process.exitCode = 1;
}
