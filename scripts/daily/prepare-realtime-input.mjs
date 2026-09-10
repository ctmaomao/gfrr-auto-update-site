import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canUseRealtimePayloadValues, FRESHNESS_WINDOWS } from '../modules/freshness.js';
import { timestampAgeMinutes } from '../health/timestamp-policy.mjs';

export function assessDailyInput(payload, nowMs = Date.now()) {
  const age = timestampAgeMinutes(payload?.updatedAt, nowMs);
  if (age === null || age < 0 || age > FRESHNESS_WINDOWS.aging) return { ok: false, reason: 'input_timestamp_unusable' };
  if (!['live', 'live-with-fallback'].includes(payload?.sourceMode) || !canUseRealtimePayloadValues(payload)) {
    return { ok: false, reason: 'input_trust_gate_failed' };
  }
  return { ok: true, reason: 'ready', ageMinutes: age };
}

// A single free realtime dispatch, with bounded polling; never retries Daily or calls a paid provider.
export async function prepareDailyInput({ read, recover, wait, now = Date.now, maxPolls = 8 }) {
  const inspect = async () => {
    try {
      const candidate = await read();
      if (!/^[a-f0-9]{40}$/.test(candidate.sha)) return null;
      return assessDailyInput(candidate.payload, now()).ok ? candidate : null;
    } catch { return null; }
  };
  let candidate = await inspect();
  if (candidate) return candidate;
  await recover();
  for (let i = 0; i < maxPolls; i++) {
    await wait();
    candidate = await inspect();
    if (candidate) return candidate;
  }
  throw new Error('Daily input unavailable after one realtime recovery; generation must not start.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--check-file') {
    const verdict = assessDailyInput(JSON.parse(fs.readFileSync(args[1], 'utf8')));
    console.log(JSON.stringify(verdict));
    if (!verdict.ok) process.exitCode = 1;
    return;
  }
  if (args.join(' ') !== '--recover' || process.env.GITHUB_REF !== 'refs/heads/main' || !process.env.GITHUB_REPOSITORY) {
    throw new Error('Use --check-file PATH offline, or --recover in a main GitHub workflow.');
  }
  const exec = promisify(execFile);
  const run = async (command, argv) => (await exec(command, argv, { timeout: 20000, maxBuffer: 8 * 1024 * 1024 })).stdout;
  const candidate = await prepareDailyInput({
    read: async () => {
      await run('git', ['fetch', 'origin', 'realtime-data']);
      const sha = (await run('git', ['rev-parse', 'origin/realtime-data'])).trim();
      const text = await run('git', ['show', `${sha}:realtime/market.json`]);
      return { sha, text, payload: JSON.parse(text) };
    },
    recover: async () => {
      console.log('Daily preflight: requesting one free realtime recovery.');
      await run('gh', ['workflow', 'run', 'build-realtime-market.yml', '--repo', process.env.GITHUB_REPOSITORY, '--ref', 'main']);
    },
    wait: () => new Promise(resolve => setTimeout(resolve, 15000))
  });
  fs.mkdirSync('realtime', { recursive: true });
  fs.writeFileSync('realtime/market.json', candidate.text);
  fs.appendFileSync(process.env.GITHUB_ENV, `GFRR_REALTIME_COMMIT_SHA=${candidate.sha}\n`);
  console.log(`Daily input ready: ${candidate.sha}, observed payload ${candidate.payload.updatedAt}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Daily realtime preflight failed; no Daily generation authorized by this step.'); process.exitCode = 1; });
}
