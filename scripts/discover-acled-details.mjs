import { discoverAcledDetails } from './world-order/acled-detail-discovery.mjs';
const args=process.argv.slice(2);
if (!args.length || (args.length===1 && args[0]==='--dry-run')) {
  console.log(JSON.stringify({status:'dry_run',requestCount:0,maxRequests:14,htmlMaxBytesEach:1048576,
    controlMaxBytesEach:65536,timeoutMsEach:15000,retries:0,redirects:0,rawPagesSaved:false,productionWritten:false}));
} else if (args.length!==1 || args[0]!=='--live' || process.env.GITHUB_ACTIONS!=='true'
  || process.env.GITHUB_EVENT_NAME!=='workflow_dispatch' || process.env.GITHUB_REF!=='refs/heads/main'
  || process.env.GITHUB_REPOSITORY!=='ctmaomao/gfrr-auto-update-site' || process.env.GITHUB_RUN_ATTEMPT!=='1'
  || process.env.GITHUB_WORKFLOW_REF!=='ctmaomao/gfrr-auto-update-site/.github/workflows/acled-authenticated-detail-discovery.yml@refs/heads/main') {
  console.log(JSON.stringify({status:'stopped',reason:'execution_context',requestCount:0}));process.exitCode=1;
} else {
  try {
    const report=await discoverAcledDetails({username:process.env.ACLED_DOWNLOAD_USERNAME,password:process.env.ACLED_DOWNLOAD_PASSWORD});
    console.log(JSON.stringify(report));
    if (report.status!=='links_discovered' || report.logout!=='confirmed') process.exitCode=1;
  } catch {
    console.log(JSON.stringify({status:'stopped',reason:'unexpected_failure',sessionMayRemain:true}));process.exitCode=1;
  }
}
