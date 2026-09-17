import { runAcledAutoUpdate } from './world-order/acled-auto-update.mjs';
const args = process.argv.slice(2);
if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
  console.log(JSON.stringify({ status: 'dry_run', acledRequests: 0, githubRequests: 0, maxAcledRequests: 26,
    maxGithubRequests: 5, timeoutMsEach: 15000, retries: 0, redirects: 0, productionWritten: false }));
} else if (args.length === 1 && args[0] === '--live') {
  const report = await runAcledAutoUpdate({ execute: true });
  console.log(JSON.stringify(report));
  if (!['unchanged', 'refresh_dispatched_site_pending'].includes(report.status)) process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'execution_hold', reason: 'invalid_arguments', acledRequests: 0 })); process.exitCode = 1;
}
