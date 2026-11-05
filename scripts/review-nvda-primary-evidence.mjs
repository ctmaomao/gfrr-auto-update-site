import { readFileSync } from 'node:fs';
import { reviewNvdaPrimaryEvidence } from './bubble-watch/nvda-primary-source-audit.mjs';

// Fixed local evidence pack; stdout only, no network or production writes.
try {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/review-nvda-primary-evidence.mjs [YYYY-MM-DD]');
  const input = JSON.parse(readFileSync(new URL('../docs/fixtures/nvda/primary-evidence-20261104.json', import.meta.url), 'utf8'));
  const asOfDate = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  process.stdout.write(`${JSON.stringify(reviewNvdaPrimaryEvidence(input, asOfDate), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
