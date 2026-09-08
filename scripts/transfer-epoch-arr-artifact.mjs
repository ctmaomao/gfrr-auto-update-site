import { packEpochArrArtifact, EPOCH_ARTIFACT_POLICY } from './bubble-watch/epoch-arr-artifact.mjs';
import { epochArtifactReadPlan, retrieveEpochArrArtifact, epochArtifactDiagnostic } from './bubble-watch/epoch-arr-artifact-reader.mjs';

// JSON stdin/stdout only. No file writes, uploads, deletion, schedules or source
// CSV access. The GitHub token is read only after an explicit live opt-in.
try {
  const args = process.argv.slice(2); let result;
  if (args.length === 1 && args[0] === '--pack') {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > EPOCH_ARTIFACT_POLICY.bytes) throw new Error('input_limit');
      chunks.push(chunk);
    }
    const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!input || Object.keys(input).sort().join('|') !== 'producer|snapshot') throw new Error('input_invalid');
    result = { status: 'artifact_pack_ready', ...packEpochArrArtifact(input.snapshot, input.producer) };
  } else if ((args.length === 3 || args.length === 4) && args[0] === '--retrieve'
    && /^\d+$/u.test(args[1]) && /^\d+$/u.test(args[2]) && (args.length === 3 || args[3] === '--allow-network')) {
    const selection = { runId: Number(args[1]), artifactId: Number(args[2]) };
    result = epochArtifactReadPlan(selection);
    if (args[3] === '--allow-network') result = await retrieveEpochArrArtifact({ ...selection, allowNetwork: true, token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '' });
  } else throw new Error('usage');
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ status: 'artifact_transfer_failed', code: error?.message === 'usage' ? 'usage' : epochArtifactDiagnostic(error),
    productionEligible: false, baselineUpdated: false })}\n`);
  process.exitCode = 1;
}
