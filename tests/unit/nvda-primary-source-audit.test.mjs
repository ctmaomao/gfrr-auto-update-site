import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { reviewNvdaPrimaryEvidence } from '../../scripts/bubble-watch/nvda-primary-source-audit.mjs';
import { inspectNvdaNumerator } from '../../scripts/bubble-watch/nvda-ratio-evidence.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('../../docs/fixtures/nvda/primary-evidence-20261104.json', import.meta.url), 'utf8'));
const review = input => reviewNvdaPrimaryEvidence(input, '2026-11-04');

test('primary disclosures retain both LTM calculations and their unresolved 1M difference', () => {
  const result = review(fixture());
  assert.equal(result.revenue.quarterSumMillion, 302969);
  assert.equal(result.revenue.bridgeMillion, 302970);
  assert.equal(result.revenue.differenceMillion, 1);
  assert.equal(result.revenue.reconciliation, 'unresolved_disclosed_amount_difference');
  assert.equal(result.revenue.periodStart, '2025-07-28');
  assert.equal(result.revenue.periodEnd, '2026-07-26');
  assert.equal(result.sourceAuthenticity, 'manual_review_not_machine_certified');
});

test('real individual transactions and mixed-basis amounts never become an invented numerator or ratio', () => {
  const input = fixture(), result = review(input);
  assert.equal(result.numerator.disclosures.length, 7);
  assert.ok(result.numerator.disclosures.every(row => row.eligibleNumerator === false));
  assert.equal(result.numerator.status, 'unknown');
  assert.equal(result.numerator.value, null);
  assert.equal(result.numerator.coverage, 'not_established');
  assert.equal(result.ratio, null);
  assert.equal(result.productionEligible, false);
  assert.equal(result.revenue.productionEligible, false);
  assert.equal(result.changesScore, false);
  assert.equal(result.networkCalls, 0);
  assert.equal(result.productionWrites, 0);
  const config = JSON.parse(readFileSync(new URL('../../config/bubble-watch-curated.json', import.meta.url), 'utf8'));
  assert.equal(inspectNvdaNumerator(config, '2026-11-04').status, 'unavailable');
});

test('re-reading old revenue does not renew its existing 120-day policy', () => {
  const input = fixture(); input.reviewedAt = '2026-11-24';
  const boundary = reviewNvdaPrimaryEvidence(fixture(), '2026-11-23');
  assert.equal(boundary.revenue.ageDays, 120);
  assert.equal(boundary.revenue.timeStatus, 'within_existing_age_limit');
  const stale = reviewNvdaPrimaryEvidence(input, '2026-11-24');
  assert.equal(stale.revenue.ageDays, 121);
  assert.equal(stale.revenue.maxAgeDays, 120);
  assert.equal(stale.revenue.timeStatus, 'stale');
  assert.equal(stale.productionEligible, false);
});

test('missing, duplicate, disjoint, future or invalid quarter evidence is rejected', () => {
  const edits = [
    input => input.quarters.pop(),
    input => { input.quarters[1] = { ...input.quarters[0] }; },
    input => { input.quarters[1].start = '2025-10-28'; },
    input => { input.quarters[3].end = '2027-07-26'; },
    input => { input.quarters[0].start = '2025-02-30'; },
    input => { input.quarters[0].revenueMillion = null; },
    input => { input.quarters[0].revenueMillion = -1; },
    input => { input.quarters[0].revenueMillion = 57006.1; }
  ];
  for (const edit of edits) { const input = fixture(); edit(input); assert.throws(() => review(input), /nvda_primary_audit_/u); }
});

test('wrong units, issuer, source identities and publication clocks are rejected', () => {
  const edits = [
    input => { input.currency = 'EUR'; },
    input => { input.issuer = 'AMD'; },
    input => { input.amountUnit = 'USD'; },
    input => { input.scope = 'production'; },
    input => { input.sources.q3fy26.url = 'https://nvidianews.nvidia.com.evil.example/news'; },
    input => { input.sources.q3fy26.url = 'https://token@nvidianews.nvidia.com/news'; },
    input => { input.sources.q3fy26.url = 'not a URL'; },
    input => { input.sources.q3fy26.publishedAt = '2025-10-25'; },
    input => { input.sources.q3fy26.publishedAt = '2026-11-05'; },
    input => { input.sources.q3fy26.locator = ''; },
    input => { input.reviewedAt = '2026-11-05'; }
  ];
  for (const edit of edits) { const input = fixture(); edit(input); assert.throws(() => review(input), /nvda_primary_audit_/u); }
  for (const clock of ['bad', '2026-02-30', '2026-11-03']) assert.throws(() => reviewNvdaPrimaryEvidence(fixture(), clock), /clock_invalid/u);
});

test('bridge must cover the exact same LTM, never a neighboring or extended period', () => {
  for (const field of ['priorYear', 'priorHalf', 'currentHalf']) {
    for (const boundary of ['start', 'end']) {
      const input = fixture(); input.bridge[field][boundary] = '2025-01-01';
      assert.throws(() => review(input), /nvda_primary_audit_/u);
    }
  }
  const input = fixture(); input.bridge.currentHalf.revenueMillion -= 1;
  assert.equal(review(input).revenue.reconciliation, 'matched');
  assert.equal(review(input).productionEligible, false, 'even a reconciled transcription is not production admission');
});

test('malformed, duplicate and future disclosures or missing gap explanations fail closed', () => {
  const edits = [
    input => { input.disclosures = []; },
    input => { input.disclosures.push({ ...input.disclosures[0] }); },
    input => { input.disclosures[0].observedAt = '2026-11-05'; },
    input => { input.disclosures[0].observedAt = '2026-08-27'; },
    input => { input.disclosures[0].amountMillion = 0; },
    input => { input.disclosures[0].exclusionReason = ''; },
    input => { input.disclosures[0].basis = ''; },
    input => { input.missingNumeratorEvidence = []; },
    input => { input.missingNumeratorEvidence[0] = null; }
  ];
  for (const edit of edits) { const input = fixture(); edit(input); assert.throws(() => review(input), /nvda_primary_audit_/u); }
});
