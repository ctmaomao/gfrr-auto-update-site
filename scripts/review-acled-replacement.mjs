import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readPilotCandidateForReview } from './world-order/acled-pilot-store.mjs';
import { reviewAcledReplacement } from './world-order/acled-replacement-review.mjs';
import { readAnnualCandidateForReview } from './world-order/acled-annual-store.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--annual')) throw new Error();
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const now = new Date().toISOString();
  const candidate = await readPilotCandidateForReview(root, now);
  const annual = args.length ? await readAnnualCandidateForReview(root, now) : null;
  console.log(JSON.stringify(reviewAcledReplacement(candidate, null, now, annual), null, 2));
}
main().catch(() => { console.log(JSON.stringify({ status: 'review_unavailable', networkRequests: 0, productionEligible: false })); process.exitCode = 1; });
