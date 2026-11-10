import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { safeProviderDiagnostics } from './lib/editorial-safe-diagnostics.mjs';

const PREFIXES = { macro: 'manual-artifacts/macro-risk-editorial', bubble: 'manual-artifacts/bubble-watch-weekly-editorial' };
const FILES = { news: 'news-discovery-latest.json', input: 'editorial-input-latest.json', output: 'deepseek-output-latest.json', failure: 'deepseek-failure-latest.json', projection: 'production-projection-latest.json' };
const OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);
const MAX_BYTES = 2 * 1024 * 1024;

function safeDirectory(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink())) throw new Error('unsafe_receipt_directory');
  }
  return current;
}
function inspect(file) {
  if (!fs.existsSync(file)) return { metadata: { state: 'missing', bytes: null, sha256: null }, parsed: null };
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return { metadata: { state: 'not_read', bytes: null, sha256: null }, parsed: null };
  const bytes = fs.readFileSync(file);
  let parsed = null;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { /* No parse errors or input text leave the process. */ }
  return { metadata: { state: 'present', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, parsed };
}
export function buildEditorialDiagnosticReceipt({ consumer, root = process.cwd(), outcomes = {} }) {
  if (!Object.hasOwn(PREFIXES, consumer)) throw new Error('unknown_editorial_consumer');
  const directory = safeDirectory(root, PREFIXES[consumer]);
  const files = { ...FILES, review: consumer === 'macro' ? 'review-latest.json' : 'quality-review-latest.json' };
  const inspected = Object.fromEntries(Object.entries(files).map(([key, name]) => [key, inspect(path.join(directory, name))]));
  const states = Object.fromEntries(['provider', 'review', 'writer', 'save'].map(key => [key, OUTCOMES.has(outcomes[key]) ? outcomes[key] : 'unknown']));
  const review = inspected.review.parsed;
  return {
    schemaVersion: 'editorial-safe-diagnostic-receipt-v1', consumer,
    rawTextRetained: false, replayPossibleFromReceipt: false,
    // This is a step receipt, not verification of remote save or live deployment.
    repositorySaveVerified: false, livePublicationVerified: false,
    stepOutcomes: states,
    files: Object.fromEntries(Object.entries(inspected).map(([key, value]) => [key, value.metadata])),
    qualityReview: {
      status: ['pass', 'warn', 'fail'].includes(review?.status) ? review.status : 'unknown',
      blockerCount: Array.isArray(review?.blockers) ? Math.min(review.blockers.length, 1000) : null,
      warningCount: Array.isArray(review?.warnings) ? Math.min(review.warnings.length, 1000) : null
    },
    providerDiagnostics: safeProviderDiagnostics(inspected.failure.parsed?.requestDiagnostics?.response, null)
  };
}
function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--consumer') throw new Error('invalid_receipt_arguments');
  const consumer = process.argv[3];
  const outcomes = Object.fromEntries(['provider', 'review', 'writer', 'save'].map(key => [key, process.env[`EDITORIAL_${key.toUpperCase()}_OUTCOME`]]));
  const receipt = buildEditorialDiagnosticReceipt({ consumer, outcomes });
  const directory = safeDirectory(process.cwd(), PREFIXES[consumer]);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, 'safe-diagnostic-receipt.json');
  if (fs.existsSync(destination) && (!fs.lstatSync(destination).isFile() || fs.lstatSync(destination).isSymbolicLink())) throw new Error('unsafe_receipt_destination');
  fs.writeFileSync(destination, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log('Editorial diagnostic receipt written; no raw text retained.');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(); } catch { console.error('Editorial diagnostic receipt failed; no raw artifact upload authorized.'); process.exitCode = 1; }
}
