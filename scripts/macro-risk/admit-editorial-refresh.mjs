import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { admitRefresh, githubClient, planAdmission } from './editorial-refresh-admission.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--reserve') || args.length > 1) throw new Error('unsupported_arguments');
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('actions_context_required');
  const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const event = read(process.env.GITHUB_EVENT_PATH);
  const radar = read('data/radar-data.json');
  const world = read('data/world-order-stress.json');
  const oil = read('data/oil-directional-pressure.json');
  const now = new Date().toISOString();
  const radarDigest = createHash('sha256').update(JSON.stringify(radar)).digest('hex');
  const context = { event, eventName: process.env.GITHUB_EVENT_NAME, runAttempt: process.env.GITHUB_RUN_ATTEMPT, repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, radar, radarDigest, world, oil, now };
  const plan = planAdmission(context);
  const result = await admitRefresh({
    plan, event, eventName: context.eventName, now, snapshots: [radar.updatedAt, world.updatedAt, oil.builtAt],
    headSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    api: plan.ready ? githubClient({ token: process.env.GITHUB_TOKEN }) : null, reserve: args.includes('--reserve'),
  });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `refresh_allowed=${result.ready}\n`);
  const summary = `Macro editorial admission: ${result.reason}; refresh_allowed=${result.ready}`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Macro editorial admission\n\n${summary}\n\n${result.ready ? 'Budget reserved before discovery; at most one provider call, no automatic retry.' : 'No discovery, DeepSeek call or production write admitted.'}\n`);
}

main().catch(() => {
  console.error('Macro editorial admission failed closed; inspect metadata availability/permissions. No automatic retry.');
  process.exitCode = 1;
});
