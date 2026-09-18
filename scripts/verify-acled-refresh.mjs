import fs from 'node:fs';
import { checkAcledRefreshReceipt, acledSourceMatches } from './world-order/acled-refresh-receipt.mjs';
import { fetchAcledSummary } from './world-order/fetch-acled.mjs';
import { dispatchAcledFollowup } from './world-order/acled-auto-github.mjs';
const args = process.argv.slice(2);
const receipt = { acled_config_commit: process.env.ACLED_CONFIG_COMMIT,
  acled_weekly_sha256: process.env.ACLED_WEEKLY_SHA256, acled_monthly_sha256: process.env.ACLED_MONTHLY_SHA256 };
let report = { status: 'receipt_hold' };
if (args.length === 1 && ['--before', '--after', '--edgeone'].includes(args[0])
  && checkAcledRefreshReceipt({ root: process.cwd(), receipt })) {
  report.status = 'receipt_verified';
  if (args[0] !== '--before') {
    try {
      const file = 'data/world-order-stress.json';
      if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error();
      const actual = JSON.parse(fs.readFileSync(file, 'utf8')).externalSources?.acled;
      const expected = await fetchAcledSummary();
      report.status = acledSourceMatches(actual, expected) ? 'projection_verified' : 'projection_hold';
    } catch { report.status = 'projection_hold'; }
    if (args[0] === '--edgeone' && report.status === 'projection_verified') {
      // This step never acquires ACLED credentials or re-downloads source files.
      report = await dispatchAcledFollowup({ target: 'edgeone', token: process.env.GH_TOKEN });
    }
  }
}
console.log(JSON.stringify(report));
if (!['receipt_verified', 'projection_verified', 'dispatch_accepted'].includes(report.status)) process.exitCode = 1;
