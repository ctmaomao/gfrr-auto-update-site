import { ACLED_CONFIG_REVIEW_LIMITS, reviewAcledConfigPair } from './world-order/acled-config-review.mjs';

// Bounded stdin only: no file paths, credentials, fetch or writer options.
async function main() {
  if (process.argv.length !== 2 || process.stdin.isTTY) throw new Error();
  let size = 0;
  const chunks = [];
  const timer = setTimeout(() => process.stdin.destroy(new Error('timeout')), 5000);
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > ACLED_CONFIG_REVIEW_LIMITS.inputBytes) throw new Error();
      chunks.push(chunk);
    }
  } finally { clearTimeout(timer); }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  const report = reviewAcledConfigPair(JSON.parse(text));
  console.log(JSON.stringify(report));
  if (report.status === 'invalid' || report.status.endsWith('_hold')) process.exitCode = 1;
}
main().catch(() => {
  console.log(JSON.stringify({ status: 'invalid', reason: 'invalid_config_review_input',
    networkRequests: 0, writesFiles: false, productionEligible: false }));
  process.stdin.destroy(); process.exitCode = 1;
});
