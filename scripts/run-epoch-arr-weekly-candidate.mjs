import { appendFileSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { collectEpochWeeklyCandidate, epochWeeklyContext } from './bubble-watch/epoch-arr-weekly.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--allow-network')) throw new Error('weekly_options_invalid');
  if (!args.length) process.stdout.write(`${JSON.stringify(await collectEpochWeeklyCandidate())}\n`);
  else {
    const context = epochWeeklyContext(process.env);
    // Only the hosted runner's pre-existing temp directory and command files.
    // Never accept an output path via CLI, source content or artifact metadata.
    const temp = process.env.RUNNER_TEMP, output = process.env.GITHUB_OUTPUT, summary = process.env.GITHUB_STEP_SUMMARY;
    if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.RUNNER_OS !== 'Linux') throw new Error('weekly_runner_invalid');
    for (const [path, directory] of [[temp, true], [output, false], [summary, false]]) {
      if (!path || !isAbsolute(path)) throw new Error('weekly_runner_invalid');
      const info = lstatSync(path);
      if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || realpathSync(path) !== resolve(path)) throw new Error('weekly_runner_invalid');
    }
    const result = await collectEpochWeeklyCandidate({ allowNetwork: true });
    const directory = join(temp, `epoch-arr-candidate-${context.runId}-1`);
    mkdirSync(directory); // Existing directory is a refusal, never reuse leftovers.
    const path = join(directory, result.artifact.fileName);
    writeFileSync(path, result.artifact.payload, { flag: 'wx', mode: 0o600 });
    appendFileSync(summary, `## ARR 周一候选（非生产）\n\n仅比较历史候选，不批准收入事实、生产切源或评分。\n\n\`\`\`json\n${JSON.stringify(result.summary, null, 2)}\n\`\`\`\n`);
    appendFileSync(output, `artifact_path=${path}\nartifact_name=${result.artifact.artifactName}\n`);
    process.stdout.write(`${JSON.stringify({ status: result.status, ...result.summary })}\n`);
  }
} catch (error) {
  // Never interpolate raw upstream errors, paths, credentials or source rows.
  const safe = /^(?:weekly_(?:context|options|runner|history|comparison)_invalid|weekly_history_timeout|weekly_artifact_[a-z_]+|weekly_source_[a-z_]+)$/u;
  const code = typeof error?.message === 'string' && safe.test(error.message) ? error.message : 'weekly_candidate_failed';
  process.stdout.write(`${JSON.stringify({ status: 'candidate_failed', code, productionEligible: false, baselineUpdated: false })}\n`);
  process.exitCode = 1;
}
