import fs from'node:fs';
import {collectCapexEventPanel}from'./bubble-watch/capex-event-collector.mjs';
const args=new Set(process.argv.slice(2));
if([...args].some(a=>!['--allow-network','--write'].includes(a))){console.error('Unsupported capex collection argument');process.exitCode=1;}
else{
 const report=await collectCapexEventPanel({allowNetwork:args.has('--allow-network')});
 if(args.has('--write')){fs.mkdirSync('manual-artifacts',{recursive:true});fs.writeFileSync('manual-artifacts/bubble-capex-event-panel-latest.json',JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({policy:report.policy,networkEnabled:args.has('--allow-network'),requests:report.budget.actualRequests,companies:report.companies.map(c=>({symbol:c.symbol,status:c.status,secFilingEnumerationComplete:c.secFilingEnumerationComplete,latestSecReportConfirmed:c.latestSecReportConfirmed,reports:c.reports.length,gaps:c.gaps})),sourceFailures:report.sourceFailures.length,scoringEligible:false,productionEligible:false}));
 if(report.sourceFailures.length)process.exitCode=1;
}
