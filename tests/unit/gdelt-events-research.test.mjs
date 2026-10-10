import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseTimestamp, formatTimestamp, parseEventsTsv } from '../../scripts/gdelt/events-candidate.mjs';
import { projectResearchFile, buildResearchDay, validateResearchDay, researchWindow, prepareResearchCalibration, hashResearchPayload } from '../../scripts/gdelt/events-research.mjs';

function row(stamp, id = '42', root = '19', quad = '4') {
  const f = Array(61).fill('');
  f[0] = id; f[1] = stamp.slice(0, 8); f[7] = 'USA'; f[17] = 'RUS'; f[25] = '1';
  f[26] = `${root}0`; f[27] = `${root}0`; f[28] = root; f[29] = quad;
  f[53] = 'UP'; f[59] = stamp; f[60] = 'https://example.com/PRIVATE_SENTINEL';
  return f.join('\t');
}
function dayArtifact(day, { bad = false, duplicate = false } = {}) {
  const files = [], digests = [];
  for (let i = 0; i < 96; i++) {
    const timestamp = formatTimestamp(parseTimestamp(`${day}000000`) + i * 900000);
    const text = row(timestamp, duplicate ? '42' : `${day}${i}`)
      + (bad && i === 0 ? `\n${row(timestamp, '99', '--', '3')}` : '');
    files.push({ timestamp, projection: projectResearchFile(text, timestamp) });
    digests.push({ timestamp, bytes: 100, sha256: 'a'.repeat(64) });
  }
  return buildResearchDay(day, files, { files: digests });
}
test('research quarantine preserves evidence but strict parser still rejects malformed root', () => {
  const stamp = '20261006033000', text = `${row(stamp)}\n${row(stamp, '99', '--', '3')}`;
  assert.throws(() => parseEventsTsv(text, stamp));
  const p = projectResearchFile(text, stamp);
  assert.equal(p.rows.length, 1); assert.equal(p.quarantinedRows, 1);
  assert.deepEqual(p.rejected, { event_code: 1 });
  assert.doesNotMatch(JSON.stringify(p), /PRIVATE_SENTINEL|https|USA|RUS/);
  const a = dayArtifact('20261006', { bad: true });
  validateResearchDay(a);
  assert.equal(a.payload.productionEligible, false);
  const w = researchWindow(new Map([['20261006', a]]), '20261006');
  assert.equal(w.qualifiedViolenceCount, null); assert.equal(w.quarantinedRows, 1);
});
test('daily archives reject missing files, digest tampering and manufactured rejection counts', () => {
  const a = dayArtifact('20261006');
  a.payload.groups[0].country = 'US'; assert.throws(() => validateResearchDay(a), /digest/);
  const b = dayArtifact('20261006'); b.payload.downloadedFiles = 95;
  b.digest = hashResearchPayload(b.payload); assert.throws(() => validateResearchDay(b), /incomplete/);
  const c = dayArtifact('20261006'); c.payload.rejected = { event_code: 1 };
  c.digest = hashResearchPayload(c.payload); assert.throws(() => validateResearchDay(c), /counts/);
});
test('window dedup and overlapping quarantined IDs cannot fabricate a qualified count', () => {
  const days = new Map();
  for (let i = 0; i < 7; i++) {
    const day = formatTimestamp(parseTimestamp('20261001000000') + i * 86400000).slice(0, 8);
    days.set(day, dayArtifact(day, { duplicate: true }));
  }
  const w = researchWindow(days, '20261007');
  assert.equal(w.conflictingIds, 6); assert.equal(w.qualifiedViolenceCount, null);
  assert.equal(w.validSubsetCounts.violence, 1);
  const ambiguous = dayArtifact('20261007', { bad: true });
  ambiguous.payload.groups[0].idHashes[0] = hashResearchPayload('99');
  ambiguous.digest = hashResearchPayload(ambiguous.payload);
  const held = researchWindow(new Map([['20261007', ambiguous]]), '20261007');
  assert.equal(held.ambiguousIds, 1); assert.equal(held.qualifiedViolenceCount, null);
  assert.throws(() => researchWindow(new Map([['20261006', ambiguous]]), '20261006'), /cache_day/);
});
test('49-day split separates underlying train/holdout dates and contamination holds the scale', () => {
  const days = new Map(), end = parseTimestamp('20261007000000');
  for (let i = 48; i >= 0; i--) {
    const day = formatTimestamp(end - i * 86400000).slice(0, 8);
    days.set(day, dayArtifact(day));
  }
  const r = prepareResearchCalibration(days, '20261007');
  assert.equal(r.cohort.trainingFirst, '20260826'); assert.equal(r.cohort.trainingLast, '20260924');
  assert.equal(r.cohort.holdoutFirst, '20261001'); assert.equal(r.cohort.sourcePeriodsDisjoint, true);
  assert.equal(r.proposedReferenceScale, 672); assert.equal(r.holdoutReplay[0].candidateNormalizedPressure, 50);
  assert.equal(r.productionEligible, false); assert.equal(r.calibrationApproved, false);
  days.set('20261006', dayArtifact('20261006', { bad: true }));
  const held = prepareResearchCalibration(days, '20261007');
  assert.equal(held.proposedReferenceScale, null);
  assert.ok(held.holdoutReplay.every(w => w.candidateNormalizedPressure === null));
  assert.equal(prepareResearchCalibration(new Map(), '20261007').descriptiveValidSubsetMedian, null);
});
test('manual CLI defaults offline, rejects output paths, future dates and unbounded download days', () => {
  for (const args of [[], ['--days', '8'], ['--end', '20990101'], ['--output', 'data/world-order.json']]) {
    const r = spawnSync(process.execPath, ['scripts/world-order/research-gdelt-events.mjs', ...args], { encoding: 'utf8' });
    assert.equal(r.status, args.length ? 1 : 0, r.stderr);
    if (!args.length) assert.match(r.stdout, /"requests": 0/);
  }
});
