import assert from 'node:assert/strict';
import test from 'node:test';
import { extractAnthropicArrB } from '../../scripts/bubble-watch/arr-milestone-parser.mjs';
import { assessUnderlyingObservationFreshness as assess, requireFreshUnderlyingObservation as requireFresh } from '../../scripts/bubble-watch/observation-freshness.mjs';

const parse = (text, extra = {}) => extractAnthropicArrB({ id: 0, text, date: '2026-09-05', ...extra });

test('reviewed explicit company headlines and annualized body claims preserve prior values', () => {
  assert.equal(parse('Historical body', { title: 'How Anthropic Rocketed to $4B ARR — And Why Your B2B Playbook May Already Be Obsolete' }), 4);
  assert.equal(parse('Anthropic hit $1 billion ARR in 2024.', { title: 'Anthropic Just Hit $14 Billion in ARR. Up From $1 Billion Just 14 Months Ago.' }), 14);
  assert.equal(parse('Anthropic just hit $30 billion in annualized revenue.'), 30);
  assert.equal(parse("Anthropic's $4.5B ARR is a milestone."), 4.5);
});

test('reviewed continuation requires exact post and isolated company-bound sentence structure', () => {
  const statement = 'Anthropic margins went from 38% to 70%. Profitable. $44B ARR.';
  assert.equal(parse(statement, { id: 325206 }), 44);
  assert.equal(parse(statement.replace('$44B', '$43.5B'), { id: 325206 }), 43.5);
  assert.throws(() => parse(statement));
  for (const text of [
    statement.replace('Profitable.', 'OpenAI grew.'),
    statement.replace('Profitable.', 'Profitable. More financing is coming.'),
    statement.replace('$44B ARR', '$44B quarterly revenue'),
    statement.replace('Anthropic margins', 'OpenAI margins'),
    statement.replace('Profitable.', 'Profitable. Anthropic changed its strategy.')
  ]) assert.throws(() => parse(text, { id: 325206 }));
});

test('other companies, ordinary revenue, valuation, financing and projections cannot become Anthropic ARR', () => {
  for (const text of [
    'OpenAI reached $40B ARR. Anthropic discussed its enterprise customers.',
    'Anthropic and OpenAI reached $40B ARR.',
    'Anthropic discussed customers. Acme reached $40B ARR.',
    'Anthropic reached $40B valuation.',
    'Anthropic raised $40B in funding.',
    'Anthropic revenue was $11.5B in Q2.',
    'Anthropic reached $40B in revenue.',
    'Anthropic could hit $40B ARR.',
    'Analysts forecast Anthropic hit $40B ARR.',
    'Claude Code at Anthropic hit $3B ARR.'
  ]) assert.throws(() => parse(text), text);
});

test('conflicting claims, out-of-range and malformed numeric values fail closed', () => {
  assert.throws(() => parse('Anthropic hit $30B ARR. Anthropic hit $40B ARR.'), /conflict/u);
  for (const amount of ['$0.5B', '$81B', '$1000B', '$1,000B', '-$30B', '$NaNB']) {
    assert.throws(() => parse('Anthropic hit ' + amount + ' ARR.'));
  }
  assert.throws(() => parse('x'.repeat(200001)));
  assert.throws(() => parse(null));
  assert.throws(() => parse('text', { title: {} }));
});

test('conditional, negated, future and ARR-equivalent statements are not observed milestones', () => {
  for (const text of [
    'If Anthropic hits $40B ARR, investors celebrate.',
    'When Anthropic hits $40B ARR next year, growth slows.',
    'It is not true that Anthropic hit $30B ARR.',
    'Anthropic hits $40B ARR in 2027.',
    'Anthropic hit $30B ARR-equivalent bookings.',
    'Anthropic hit $30B ARR equivalent bookings.'
  ]) assert.throws(() => parse(text));
  assert.throws(() => parse('No. The number has not been reached.', { title: 'Did Anthropic Hit $14 Billion in ARR?' }));
  assert.throws(() => parse('Scenario for 2027. Anthropic margins went from 38% to 70%. Profitable. $44B ARR.', { id: 325206 }));
  assert.throws(() => parse('Anthropic hit $4B ARR.', { date: '2026-02-30' }));
});

test('underlying observation uses real calendar dates for both endpoints', () => {
  const base = { observationDate: '2026-02-28', asOfDate: '2026-03-02', maxAgeDays: 45 };
  assert.equal(assess(base).ageDays, 2);
  for (const date of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-01', '2026-04-31', '2026-02-28T00:00:00Z']) {
    assert.throws(() => assess({ ...base, observationDate: date }));
    assert.throws(() => assess({ ...base, asOfDate: date }));
  }
  assert.throws(() => assess({ ...base, observationDate: { toString: () => '2026-02-28' } }));
  assert.equal(assess({ ...base, observationDate: '2024-02-29', asOfDate: '2024-03-01' }).ageDays, 1);
  assert.throws(() => assess({ ...base, observationDate: '2026-03-03' }), /later/u);
});

test('45-day stale/fallback boundary is unchanged and a refresh cannot make an old milestone fresh', () => {
  const base = { observationDate: '2026-07-01', asOfDate: '2026-08-15', maxAgeDays: 45 };
  assert.equal(requireFresh(base).status, 'fresh');
  assert.equal(assess({ ...base, asOfDate: '2026-08-16' }).status, 'stale');
  assert.throws(() => requireFresh({ ...base, asOfDate: '2026-08-16' }), /arr_underlying_observation_stale/u);
});
