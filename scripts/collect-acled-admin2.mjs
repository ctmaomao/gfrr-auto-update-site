import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ADMIN2 } from './world-order/acled-admin2-collector.mjs';
import { PILOT } from './world-order/acled-pilot.mjs';
import { safeDirectory } from './world-order/acled-pilot-store.mjs';
import { readAnnualPrivateFile } from './world-order/acled-annual-store.mjs';
import { runAdmin2Acceptance, reviewStoredAdmin2 } from './world-order/acled-admin2-store.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
    console.log(JSON.stringify({ status: 'dry_run', budget: ADMIN2, country: 'AFG', month: '2025-01', layer: 2, networkRequests: 0, productionEligible: false })); return;
  }
  if (args.length !== 1 || !['--live', '--review'].includes(args[0])) throw new Error();
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (path.dirname(await realpath(common)) !== root) throw new Error();
  execFileSync('git', ['check-ignore', '--quiet', '--', path.join(root, 'manual-artifacts', ADMIN2.id, 'probe.private.json')], { cwd: root, stdio: 'ignore' });
  if (args[0] === '--review') { console.log(JSON.stringify(await reviewStoredAdmin2(root))); return; }
  const parent = await safeDirectory(root, 'manual-artifacts'), pilot = await safeDirectory(parent, PILOT.id);
  const source = JSON.parse(await readAnnualPrivateFile(path.join(pilot, 'contact-source.json'), 4096)).path;
  if (typeof source !== 'string' || !path.isAbsolute(source)) throw new Error();
  const contact = JSON.parse(await readAnnualPrivateFile(source, 4096));
  const report = await runAdmin2Acceptance(root, contact);
  console.log(JSON.stringify(report)); if (report.status !== 'candidate_ready') process.exitCode = 1;
}
main().catch(() => { console.log(JSON.stringify({ status: 'stopped', reason: 'local_preflight_or_storage_failure', productionEligible: false })); process.exitCode = 1; });
