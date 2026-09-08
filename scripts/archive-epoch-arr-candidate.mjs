import { archiveEpochArrSnapshot, compareArchivedEpochArrSnapshot, epochArchiveDiagnostic } from './bubble-watch/epoch-arr-archive.mjs';

// Stdin must contain only the hash-only snapshot, not the reader's full report.
// No network, output path, overwrite, prune, schedule or baseline selection flag.
try {
  const args = process.argv.slice(2);
  const compare = args.length === 2 && args[0] === '--compare';
  const write = args.length === 1 && args[0] === '--write';
  if (!compare && !write && args.length) throw new Error('usage');
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('archive_byte_limit');
    chunks.push(chunk);
  }
  const snapshot = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  const report = compare ? compareArchivedEpochArrSnapshot(args[1], snapshot) : archiveEpochArrSnapshot(snapshot, { write });
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  const code = error?.message === 'usage' ? 'usage' : epochArchiveDiagnostic(error);
  process.stdout.write(`${JSON.stringify({ status: 'archive_failed', code, productionEligible: false, baselineUpdated: false })}\n`);
  process.exitCode = 1;
}
