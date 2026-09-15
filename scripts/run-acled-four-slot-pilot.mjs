import { readFile, lstat, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PILOT, pilotContact } from './world-order/acled-pilot.mjs';
import { executePilotSlot, pilotStoreStatus } from './world-order/acled-pilot-store.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
    console.log(JSON.stringify({ status: 'dry_run', policy: PILOT, networkRequests: 0, productionWriteApproved: false })); return;
  }
  if (args.length !== 1 || !['--live', '--status'].includes(args[0])) throw new Error();
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (path.dirname(await realpath(common)) !== root) throw new Error();
  const dir = path.join(root, 'manual-artifacts', PILOT.id);
  execFileSync('git', ['check-ignore', '--quiet', '--', path.join(dir, 'probe.private.json')], { cwd: root, stdio: 'ignore' });
  if (args[0] === '--status') { console.log(JSON.stringify(await pilotStoreStatus(dir))); return; }
  // This ignored pointer stores a path, never a duplicate email or identifier.
  const pointer = path.join(dir, 'contact-source.json');
  const pstat = await lstat(pointer);
  if (!pstat.isFile() || pstat.isSymbolicLink() || pstat.size > 4096 || await realpath(pointer) !== pointer) throw new Error();
  const source = JSON.parse(await readFile(pointer, 'utf8')).path;
  if (typeof source !== 'string' || !path.isAbsolute(source)) throw new Error();
  const stat = await lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096 || await realpath(source) !== path.normalize(source)) throw new Error();
  const contact = JSON.parse(await readFile(source, 'utf8')); pilotContact(contact);
  const result = await executePilotSlot(root, contact);
  console.log(JSON.stringify(result));
  if (result.status === 'stopped' || result.paused) process.exitCode = 1;
}
main().catch(() => {
  console.log(JSON.stringify({ status: 'paused', reason: 'local_preflight_or_state_failure', networkRequests: 'not_inferred',
    productionWriteApproved: false, sourceCutoverApproved: false })); process.exitCode = 1;
});
