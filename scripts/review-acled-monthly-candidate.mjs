import { ACLED_CANDIDATE_LIMITS, reviewAcledMonthlyCandidate } from './world-order/acled-monthly-candidate.mjs';

// No path, network, write or credential options. A bounded JSON envelope arrives
// through stdin; raw exceptions and input never reach stdout/stderr.
async function main() {
  if (process.argv.length !== 2 || process.stdin.isTTY) throw new Error('input_invalid');
  let size = 0;
  const chunks = [];
  const timer = setTimeout(() => process.stdin.destroy(new Error('stdin_timeout')), 5000);
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > ACLED_CANDIDATE_LIMITS.inputBytes) throw new Error('stdin_size');
      chunks.push(chunk);
    }
  } finally { clearTimeout(timer); }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('input_invalid'); }
  const report = reviewAcledMonthlyCandidate(input);
  console.log(JSON.stringify(report));
  if (report.status === 'invalid') process.exitCode = 1;
}
main().catch(error => {
  const reason = ['stdin_size', 'stdin_timeout'].includes(error?.message) ? error.message : 'input_invalid';
  console.log(JSON.stringify({ status: 'invalid', reason, networkRequests: 0, writesFiles: false,
    productionWriteApproved: false, sourceCutoverApproved: false }));
  process.stdin.destroy();
  process.exitCode = 1;
});
