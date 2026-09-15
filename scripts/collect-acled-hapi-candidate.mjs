import { mkdir, lstat, realpath, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { acledHapiPlan, ACLED_HAPI_ATTEMPT, ACLED_HAPI_BUDGET,
  validateAcledHapiInput, collectAcledHapiCandidate } from './world-order/acled-hapi-collector.mjs';

// Fixed private destination, no caller-supplied paths or replacement switches.
// Keeping the attempt directory after failures enforces this one-time budget.
const root = fileURLToPath(new URL('../', import.meta.url));
async function stdin() {
  const chunks = []; let bytes = 0;
  const timer = setTimeout(() => process.stdin.destroy(new Error('input_invalid')), 5000);
  try {
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) throw new Error('input_invalid');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}
async function privateDirectory() {
  const canonicalRoot = await realpath(root);
  let current = canonicalRoot;
  for (const name of ['manual-artifacts', 'acled-hapi-collector']) {
    current = path.join(current, name);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(current) !== current) throw new Error('unsafe_directory');
  }
  const dir = path.join(current, ACLED_HAPI_ATTEMPT);
  // Check repository ignore protection before reserving any attempt or network.
  execFileSync('git', ['check-ignore', '--quiet', '--', path.join(dir, 'candidate.private.json')], { cwd: canonicalRoot, stdio: 'ignore' });
  await mkdir(dir, { mode: 0o700 }); // EEXIST refuses completed AND failed attempts.
  return dir;
}
async function main() {
  const args = process.argv.slice(2);
  if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
    console.log(JSON.stringify(acledHapiPlan())); return;
  }
  if (args.length !== 1 || args[0] !== '--live') throw new Error('input_invalid');
  const input = await stdin();
  if (!validateAcledHapiInput(input)) throw new Error('input_invalid');
  const dir = await privateDirectory();
  await writeFile(path.join(dir, 'attempt.json'), JSON.stringify({ attempt: ACLED_HAPI_ATTEMPT,
    budget: ACLED_HAPI_BUDGET, startedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
  const result = await collectAcledHapiCandidate(input);
  if (result.privateCandidate) {
    // One atomic envelope; a failed write cannot leave a published candidate.
    const temporary = path.join(dir, 'candidate.pending');
    await writeFile(temporary, JSON.stringify({ current: result.privateCandidate, baseline: null,
      metadataBeforeJson: result.privateMetadataBefore }), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path.join(dir, 'candidate.private.json'));
  }
  await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(result.report), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(result.report));
  if (result.report.status !== 'candidate_ready') process.exitCode = 1;
}
main().catch(() => {
  // Do not echo native paths, response text, application contact or identifier.
  console.log(JSON.stringify({ status: 'stopped', reason: 'input_or_private_artifact_failure',
    productionWriteApproved: false, sourceCutoverApproved: false }));
  process.stdin.destroy(); process.exitCode = 1;
});
