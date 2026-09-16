import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readAnnualCandidateForReview } from './world-order/acled-annual-store.mjs';
import { reviewAcledGeography } from './world-order/acled-geography-review.mjs';
import { readAdmin2CandidateForReview } from './world-order/acled-admin2-store.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--admin2')) throw new Error();
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url))), now = new Date().toISOString();
  const snapshot = await readAnnualCandidateForReview(root, now);
  const admin2 = args.length ? await readAdmin2CandidateForReview(root, now) : null;
  console.log(JSON.stringify(reviewAcledGeography(snapshot, now, admin2), null, 2));
}
main().catch(() => { console.log(JSON.stringify({ status: 'geography_review_unavailable', networkRequests: 0, productionEligible: false })); process.exitCode = 1; });
