import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseTimestamp, formatTimestamp } from '../gdelt/events-candidate.mjs';
import { validateResearchDay, prepareResearchCalibration } from '../gdelt/events-research.mjs';
import { buildImpactContext, replayScoreImpact } from '../gdelt/events-score-impact.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = path.join(root, 'manual-artifacts/world-order/gdelt-events/research-v2');
let end = '20261007', write = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--end') end = args[++i];
  else if (args[i] === '--write-report') write = true;
  else throw new Error('events_impact_unknown_option');
}
if (!/^\d{8}$/u.test(end || '')) throw new Error('events_impact_end');
const endMs = parseTimestamp(`${end}000000`);
if (endMs >= Math.floor(Date.now() / 86400000) * 86400000) throw new Error('events_impact_incomplete_day');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const ref = git(['log', '-1', '--format=%H', 'origin/main', '--', 'data/world-order-stress.json']).trim();
if (!/^[a-f0-9]{40}$/u.test(ref)) throw new Error('events_impact_baseline_ref');
const modelPaths = ['scripts/world-order/score-world-order-stress.mjs', 'scripts/world-order/gdelt-score.mjs',
  'scripts/world-order/normalize-world-order-inputs.mjs', 'scripts/world-order/acled-freshness.mjs',
  'scripts/world-order/classify-world-order-state.mjs', 'config/gdelt-score-calibration.json'];
git(['diff', '--exit-code', ref, '--', ...modelPaths]);
const inputDigests = {};
const read = filename => {
  const text = git(['show', `${ref}:${filename}`]);
  inputDigests[filename] = createHash('sha256').update(text).digest('hex');
  return JSON.parse(text);
};
const published = read('data/world-order-stress.json'), rules = read('config/world-order-rules.json');
const data = read('data/radar-data.json');
const context = buildImpactContext({ sources: published.externalSources, market: published.dimensions.marketConfirmation,
  data, rules, published });
const days = new Map(), dayDigests = {};
let archiveBytes = 0;
for (let i = 48; i >= 0; i--) {
  const day = formatTimestamp(endMs - i * 86400000).slice(0, 8), filename = path.join(dir, `${day}.json`);
  if (!fs.existsSync(filename)) continue;
  const bytes = fs.statSync(filename).size;
  archiveBytes += bytes;
  if (bytes > 40 * 1024 * 1024 || archiveBytes > 256 * 1024 * 1024) throw new Error('events_impact_cache_size');
  const a = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (validateResearchDay(a).day !== day) throw new Error('events_impact_cache_day');
  days.set(day, a); dayDigests[day] = a.digest;
}
const calibration = prepareResearchCalibration(days, end);
const report = replayScoreImpact(calibration, context);
report.provenance = { baselineCommit: ref, baselineUpdatedAt: published.updatedAt, inputDigests, dayDigests,
  originalSourceCoverage: calibration.sourceCoverage, originalCohort: calibration.cohort,
  strictPointScale: calibration.proposedReferenceScale, requests: 0 };
if (write) {
  fs.mkdirSync(dir, { recursive: true });
  const filename = path.join(dir, `score-impact-${end}-${Date.now()}.json`);
  fs.writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`Research report: ${path.relative(root, filename)}`);
}
console.log(JSON.stringify({ ...report, provenance: { ...report.provenance, inputDigests: undefined, dayDigests: undefined },
  scenarios: report.scenarios.map(s => ({ factor: s.factor, windows: s.windows.map(w => ({ endDay: w.endDay,
    lower: w.targeted?.lower.score ?? null, upper: w.targeted?.upper.score ?? null,
    state: w.targeted?.lower.state ?? null, blanket: w.blanket?.lower.score ?? null,
    naive: w.naiveOldScale?.score ?? null })) })) }, null, 2));
