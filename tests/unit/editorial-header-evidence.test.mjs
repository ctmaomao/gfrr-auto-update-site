import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compactNewsStory, evidenceEligibility } from '../../scripts/lib/editorial-news-hygiene.mjs';
import { buildNewsDiscovery as bubbleDiscovery } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { buildNewsDiscovery as macroDiscovery, assessEditorialNewsReadiness } from '../../scripts/macro-risk/editorial-news.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { buildEditorialInput } from '../../scripts/macro-risk/editorial-input.mjs';
import { validateWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
import { validateEditorialInput } from '../../scripts/macro-risk/editorial-contract.mjs';

// Public administrative template shape, synthetic results, no personal contacts.
const header = 'Transmission of material in this news release is embargoed until USDL-00-0000 8:30 a.m. (ET) Friday, November 6, 2026 Technical information: Household data: [synthetic contact] Establishment data: [synthetic contact] Media contact: [synthetic contact] ';
const heading = 'THE EMPLOYMENT SITUATION - OCTOBER 2026';
const result = 'Total nonfarm payroll employment rose by 12,000, and the unemployment rate was unchanged at 4.2 percent.';
const url = 'https://bls.gov/news.release/archives/empsit_11062026.htm';
const row = (snippet, extra = {}) => ({ provider: 'tavily', topic: 'growth_employment_consumer', title: heading, url, publishedAt: '2026-11-06T00:00:00Z', snippet, ...extra });
const healthy = { status: 'ok', successCount: 6, failureCount: 0 };
const common = { sourceStatus: { tavily: healthy, brave: healthy }, generatedAt: '2026-11-10T12:00:00Z', windowStart: '2026-11-03', windowEnd: '2026-11-10' };

test('recognized long administrative header is removed before either projection limit', () => {
  const raw = row(header.repeat(2) + heading + '\n' + result);
  const before = structuredClone(raw);
  for (const limit of [280, 360]) {
    const compact = compactNewsStory(raw, limit);
    assert.equal(compact.snippet, result);
    assert.equal(compact.publishedAt, raw.publishedAt);
    assert.equal(compact.title, raw.title);
    assert.equal(compact.url, raw.url);
  }
  assert.deepEqual(raw, before);
  const discovery = macroDiscovery({ ...common, rawStories: [raw] });
  assert.equal(discovery.stories[0].snippet, result);
  assert.equal(discovery.stories[0].evidenceStatus, 'official');
  assert.equal(assessEditorialNewsReadiness(discovery).credibleCount, 1);
});

test('header-only, incomplete heading and title-only excerpts remain ineligible', () => {
  for (const snippet of [header, header + 'THE EMPLOYMENT SITUATION - OCTOBER 202…', header + heading, heading, 'Technical information: [synthetic contact] Media co…']) {
    assert.equal(evidenceEligibility(row(snippet)).eligible, false);
    const compact = compactNewsStory(row(snippet, { evidenceStatus: 'official', contentScope: 'excerpt' }), 280);
    assert.equal(compact.snippet, null);
    assert.equal(compact.evidenceStatus, 'discovery_only');
    const d = macroDiscovery({ ...common, rawStories: [row(snippet)] });
    assert.equal(assessEditorialNewsReadiness(d).credibleCount, 0);
  }
});

test('short actual results and decimal-bearing observation sentences are not rejected by a new length floor', () => {
  for (const snippet of ['Payrolls rose.', 'Employment fell.', 'Employment was unchanged.', 'The unemployment rate, at 4.2 percent, was little changed.', 'The number of unemployed persons remained steady.']) {
    assert.equal(compactNewsStory(row(snippet), 280).snippet, snippet);
    assert.equal(macroDiscovery({ ...common, rawStories: [row(snippet)] }).stories[0].evidenceStatus, 'official');
  }
});

test('source-aware cleanup does not act on other sources, paths, or ordinary prose', () => {
  const prose = "Analysts will watch next week's payroll release. A technical information contact discussed embargo policy, not a new employment result.";
  for (const url of ['https://reuters.com/markets/outlook', 'https://federalreserve.gov/newsevents/speech/outlook.htm', 'https://bls.gov/news.release/cpi.htm', 'https://bls.gov.example.org/news.release/archives/empsit_11062026.htm']) {
    assert.equal(compactNewsStory(row(prose, { url }), 280).snippet, prose);
    const administrativeQuote = header + heading;
    assert.equal(evidenceEligibility(row(administrativeQuote, { url })).eligible, true, 'no cleanup or source-specific observation requirement on unrelated URLs');
  }
});

test('final truncation cannot borrow an observation that is no longer present', () => {
  const lead = 'This report provides background information about the current survey and its scope. '.repeat(4);
  const raw = row(heading + ' ' + lead + result);
  assert.equal(evidenceEligibility(raw).eligible, true);
  assert.equal(compactNewsStory(raw, 280).snippet, null);
  assert.equal(compactNewsStory(raw, 360).snippet, null);
  assert.throws(() => compactNewsStory(raw, 0), /invalid excerpt limit/);
});

for (const [name, build, topic] of [['Bubble', bubbleDiscovery, 'macro_policy'], ['Macro', macroDiscovery, 'growth_employment_consumer']]) {
  test(`${name} actual compact projection rechecks the final text and preserves financial snapshots`, () => {
    const read = file => JSON.parse(fs.readFileSync(new URL(`../../data/${file}`, import.meta.url)));
    const bubble = read('bubble-watch.json'), radar = read('radar-data.json');
    const buildInput = discovery => name === 'Bubble' ? buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery }) : buildEditorialInput({ radarData: radar, discovery });
    const d = build({ ...common, rawStories: [row(result, { topic })] });
    // Existing discovery metadata is not authority to accept its later replacement.
    d.stories[0].evidenceStatus = 'official';
    const baseline = buildInput(d), before = JSON.stringify({ bubble, radar });
    for (const snippet of [header + heading, heading + ' ' + 'Background context for this release. '.repeat(12) + result]) {
      const damaged = structuredClone(d);
      damaged.stories[0].snippet = snippet;
      damaged.stories[0].contentScope = 'excerpt';
      const input = buildInput(damaged);
      assert.equal(input.newsContext.stories[0].snippet, null);
      assert.equal(input.newsContext.stories[0].evidenceStatus, 'discovery_only');
      assert.ok(input.sourceRefs.filter(s => s.kind === 'news').every(s => s.sourceClass === 'discovery_only'));
      if (name === 'Bubble') {
        assert.deepEqual(input.scoringSnapshot, baseline.scoringSnapshot);
        assert.equal(input.sourceSnapshotDigest, baseline.sourceSnapshotDigest);
        assert.equal(validateWeeklyEditorialInput(input).ok, true, 'Bubble live readiness is separate from structural validation');
      } else {
        assert.deepEqual(input.pressureSnapshot, baseline.pressureSnapshot);
        assert.equal(validateEditorialInput(input).ok, false, 'no credible news remains: provider input must fail');
      }
      assert.deepEqual(input.structuredFacts, baseline.structuredFacts);
    }
    assert.equal(JSON.stringify({ bubble, radar }), before);
  });
}


test('official result wording is distinct from forecast-only past participles', () => {
  const observed = 'Total nonfarm payroll employment was essentially unchanged in October (+12,000).';
  assert.equal(compactNewsStory(row(observed), 280).snippet, observed);
  for (const factual of ['Payroll employment rose in May.', 'Payroll employment rose above expectations.', 'Payrolls rose by 20,000, as expected.']) assert.equal(compactNewsStory(row(factual), 280).snippet, factual);
  for (const forecast of ['Payrolls are expected to have increased by 200,000.', 'The unemployment rate is forecast to have increased to 4.5 percent.']) {
    assert.equal(compactNewsStory(row(forecast), 280).snippet, null);
    assert.equal(compactNewsStory(row(forecast + ' ' + observed), 280).snippet, forecast + ' ' + observed);
  }
});
