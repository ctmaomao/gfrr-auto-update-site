import { buildEpochArrSnapshot, compareEpochArrSnapshots, validateEpochArrSnapshot } from './bubble-watch/epoch-arr-snapshot.mjs';
import { readEpochArrCandidate, epochReaderDiagnostic } from './bubble-watch/epoch-arr-reader.mjs';

// JSON stdin -> JSON stdout. No path/output/URL options and no automatic baseline
// persistence. Offline by default; live mode requires --allow-network explicitly.
try {
  const args = process.argv.slice(2);
  const live = args.length === 3 && args[2] === '--allow-network';
  if ((!live && args.length !== 2) || args[0] !== '--as-of') throw new Error('usage');
  let size = 0; const chunks = [];
  if (!process.stdin.isTTY) for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error('input_byte_limit');
    chunks.push(chunk);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  const input = text.trim() ? JSON.parse(text) : {};
  const allowed = live ? ['previousSnapshot'] : ['previousSnapshot', 'currentCsv'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new Error('input_schema_invalid');
  const previous = input.previousSnapshot === undefined || input.previousSnapshot === null ? null : validateEpochArrSnapshot(input.previousSnapshot);
  const result = live ? await readEpochArrCandidate({ allowNetwork: true, asOfDate: args[1] })
    : { status: 'offline_candidate_snapshot', networkCalls: 0, ...buildEpochArrSnapshot(input.currentCsv, { asOfDate: args[1] }) };
  const comparison = compareEpochArrSnapshots(previous, result.snapshot);
  process.stdout.write(`${JSON.stringify({ ...result, comparison, productionWrites: 0, productionEligible: false })}\n`);
} catch (error) {
  const known = new Set(['usage', 'input_byte_limit', 'input_schema_invalid', 'snapshot_invalid', 'snapshot_identity_conflict',
    'as_of_date_invalid', 'csv_input_type', 'csv_byte_limit', 'csv_utf8_invalid', 'csv_column_count', 'csv_row_limit',
    'csv_cell_limit', 'csv_quote_invalid', 'csv_quote_unclosed', 'csv_schema_mismatch']);
  const diagnostic = epochReaderDiagnostic(error);
  const code = known.has(error?.message) ? error.message : diagnostic.code === 'reader_failed' ? 'input_or_review_failed' : diagnostic.code;
  process.stdout.write(`${JSON.stringify({ status: 'review_failed', code, httpStatus: diagnostic.httpStatus, baselineUpdated: false, productionEligible: false })}\n`);
  process.exitCode = 1;
}
