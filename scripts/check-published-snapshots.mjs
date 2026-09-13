#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TARGETS, probePublishedSnapshots } from './lib/published-snapshots.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--allow-network', '--github-summary'].includes(arg))) throw new Error('Unsupported argument');
if (!args.includes('--allow-network')) {
  console.log(JSON.stringify({ status: 'dry_run', maxRequests: 12, targets: TARGETS.map(target => target.path), productionWrites: 0 }));
} else {
  const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  const sha = git('rev-parse', 'HEAD').trim();
  const baseline = Object.fromEntries(TARGETS.map(target => [target.path, {
    text: git('show', `${sha}:${target.path}`),
    committedAt: git('log', '-1', '--format=%cI', sha, '--', target.path).trim()
  }]));
  // Git returns offset ISO clocks; normalize before checking the baseline.
  for (const value of Object.values(baseline)) value.committedAt = new Date(value.committedAt).toISOString();
  const result = { baselineCommit: sha, ...await probePublishedSnapshots({ baseline }) };
  const directory = 'manual-artifacts/publication-monitor';
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(`${directory}/latest.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, checkedAt: result.checkedAt, baselineCommit: sha,
    requests: result.requestCount, rows: result.rows.map(({ site, path, errors, warnings }) => ({ site, path, errors, warnings })) }));
  if (args.includes('--github-summary') && process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['## Published snapshot delivery', '', `Status: **${result.status}**; baseline: \`${sha}\`; ${result.requestCount}/12 read-only requests.`, '',
      '| Site | File | Delivery errors | Source/transition warnings |', '|---|---|---|---|',
      ...result.rows.map(row => `| ${row.site} | ${row.path} | ${row.errors.join(', ') || 'none'} | ${row.warnings.join(', ') || 'none'} |`), '',
      'Source degradation is not a publication outage. Collection timestamps are not source observation/publication dates. No data/provider writes or recovery dispatch.'];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  process.exitCode = result.status === 'fail' ? 1 : 0;
}
