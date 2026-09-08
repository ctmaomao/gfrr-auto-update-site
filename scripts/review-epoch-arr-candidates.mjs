import { EPOCH_ARR_LIMITS, sanitizeEpochArrCsv } from './bubble-watch/epoch-arr-candidate.mjs';

// Stdin/stdout only: no filesystem targets, credentials, URL flags or writer.
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--as-of' || !/^\d{4}-\d{2}-\d{2}$/u.test(args[1])) {
    throw new Error('usage');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > EPOCH_ARR_LIMITS.bytes) throw new Error('csv_byte_limit');
    chunks.push(chunk);
  }
  const report = sanitizeEpochArrCsv(Buffer.concat(chunks), { asOfDate: args[1] });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  // Never serialize exception messages that may contain raw CSV, URLs or paths.
  const known = new Set(['usage', 'as_of_date_invalid', 'csv_input_type', 'csv_byte_limit',
    'csv_utf8_invalid', 'csv_column_count', 'csv_row_limit', 'csv_cell_limit',
    'csv_quote_invalid', 'csv_quote_unclosed', 'csv_schema_mismatch']);
  const code = known.has(error?.message) ? error.message : 'candidate_review_failed';
  process.stdout.write(`${JSON.stringify({ status: 'invalid_input', code, productionEligible: false })}\n`);
  process.exitCode = 1;
}
