import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readPilotCandidateForReview } from './world-order/acled-pilot-store.mjs';
import { reviewAcledReplacement } from './world-order/acled-replacement-review.mjs';

async function main() {
  if (process.argv.length !== 2) throw new Error();
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const now = new Date().toISOString();
  const candidate = await readPilotCandidateForReview(root, now);
  console.log(JSON.stringify(reviewAcledReplacement(candidate, null, now), null, 2));
}
main().catch(() => { console.log(JSON.stringify({ status: 'review_unavailable', networkRequests: 0, productionEligible: false })); process.exitCode = 1; });
