import { diagnoseEpochMetadata } from './bubble-watch/epoch-arr-metadata-diagnostic.mjs';

// Manual stdout-only entry point; token is never accepted via CLI arguments.
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--allow-network')) throw new Error('usage');
  const live = args.length === 1;
  const result = await diagnoseEpochMetadata({ allowNetwork: live,
    token: live ? process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '' : '' });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status === 'diagnostic_failed') process.exitCode = 1;
} catch {
  process.stdout.write(`${JSON.stringify({ status: 'diagnostic_failed', code: 'metadata_options_invalid', productionEligible: false })}\n`);
  process.exitCode = 1;
}
