import { acceptAcledBatch, batchExecutionAllowed } from './world-order/acled-batch-acceptance.mjs';
const args = process.argv.slice(2);
if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
  console.log(JSON.stringify({ status: 'dry_run', requestCount: 0, maxRequests: 26, htmlMaxBytes: 12 * 1024 * 1024,
    weeklyMaxBytes: 64 * 1024 * 1024, monthlyMaxBytes: 2 * 1024 * 1024, controlMaxBytes: 128 * 1024,
    timeoutMsEach: 15000, retries: 0, redirects: 0, productionWritten: false, rawFilesRetained: false }));
} else if (args.length !== 1 || args[0] !== '--live' || !batchExecutionAllowed(process.env)) {
  console.log(JSON.stringify({ status: 'stopped', reason: 'execution_context', requestCount: 0 })); process.exitCode = 1;
} else {
  const report = await acceptAcledBatch({ username: process.env.ACLED_DOWNLOAD_USERNAME,
    password: process.env.ACLED_DOWNLOAD_PASSWORD, fetchImpl: fetch });
  console.log(JSON.stringify(report));
  if (report.status !== 'validated_not_published') process.exitCode = 1;
}
