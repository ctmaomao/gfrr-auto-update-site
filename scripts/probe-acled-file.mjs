import { FILE_PROBE, probeAcledFile } from './world-order/acled-file-probe.mjs';

const args = process.argv.slice(2);
if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
  console.log(JSON.stringify({ status: 'dry_run', requestCount: 0, budget: FILE_PROBE, productionWritten: false }));
} else if (args.length !== 1 || args[0] !== '--live'
  || process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
  || process.env.GITHUB_REPOSITORY !== 'ctmaomao/gfrr-auto-update-site'
  || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1') {
  console.log(JSON.stringify({ status: 'stopped', reason: 'execution_context', requestCount: 0 })); process.exitCode = 1;
} else {
  const report = await probeAcledFile(); console.log(JSON.stringify(report));
  if (report.status !== 'workbook_container_verified') process.exitCode = 1;
}
