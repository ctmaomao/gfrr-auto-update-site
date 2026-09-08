import { PUBLICATION_EVIDENCE_LIMITS, publicationEvidenceBoundaries, reviewPublicationEvidence } from './oil-directional/oil-news-publication-evidence.mjs';

// No network/write flags: lawful local evidence enters via stdin only.
try {
  if (process.argv.length !== 2) throw new Error();
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > PUBLICATION_EVIDENCE_LIMITS.bytes) throw new Error();
    chunks.push(chunk);
  }
  process.stdout.write(`${JSON.stringify(reviewPublicationEvidence(Buffer.concat(chunks)))}\n`);
} catch {
  process.stdout.write(`${JSON.stringify({ status: 'invalid_input', code: 'publication_evidence_invalid', ...publicationEvidenceBoundaries() })}\n`);
  process.exitCode = 1;
}
