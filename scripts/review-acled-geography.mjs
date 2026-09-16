import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readAnnualCandidateForReview } from './world-order/acled-annual-store.mjs';
import { reviewAcledGeography } from './world-order/acled-geography-review.mjs';

async function main() {
  if (process.argv.length !== 2) throw new Error();
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url))), now = new Date().toISOString();
  const snapshot = await readAnnualCandidateForReview(root, now);
  console.log(JSON.stringify(reviewAcledGeography(snapshot, now), null, 2));
}
main().catch(() => { console.log(JSON.stringify({ status: 'geography_review_unavailable', networkRequests: 0, productionEligible: false })); process.exitCode = 1; });
