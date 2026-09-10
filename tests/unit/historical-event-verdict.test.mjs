import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeEvent, makeWeeklyDates, eventResultGroups, auditVerdict,
  summarizeWindScenario, evaluateWindScenario } from '../../scripts/audit-main-score-backtest.mjs';

const event = { key: 'gfc_2008', start: '2008-09-15', end: '2009-03-09', minMaxScore: 75 };
const options = { startDate: event.start, endDate: event.end };
const full = makeWeeklyDates(event.start, event.end).map(date => ({ date, score: 80, overlayApplied: false }));

test('one high score cannot pass a 26-week event or the overall verdict', () => {
  const sparse = summarizeEvent(full.slice(0, 1), event, options);
  assert.equal(sparse.coverage.expectedObservations, 26);
  assert.equal(sparse.coverage.validObservations, 1);
  assert.equal(sparse.coverage.missingDates.length, 25);
  assert.equal(sparse.status, 'insufficient_coverage');
  assert.equal(sparse.pass, false);
  assert.equal(sparse.scorePass, null);
  assert.equal(auditVerdict([sparse], { pass: true }), 'needs_review');
});

test('complete coverage still must satisfy the original score threshold', () => {
  const passed = summarizeEvent(full, event, options);
  assert.equal(passed.status, 'passed');
  assert.equal(passed.coverage.fraction, 1);
  assert.equal(auditVerdict([passed], { pass: true }), 'pass_with_limitations');
  assert.equal(auditVerdict([passed], { pass: false }), 'needs_review');
  assert.equal(auditVerdict([], { pass: true }), 'needs_review');
  const failed = summarizeEvent(full.map(row => ({ ...row, score: 74 })), event, options);
  assert.equal(failed.status, 'score_failed');
  assert.deepEqual(eventResultGroups([failed]).failedEvents, ['gfc_2008']);
  const calm = summarizeEvent(full, { ...event, minMaxScore: undefined, maxAvgScore: 45 }, options);
  assert.equal(calm.status, 'score_failed');
});

test('missing, duplicate, invalid and off-grid samples cannot inflate coverage', () => {
  const duplicate = summarizeEvent(Array(26).fill(full[0]), event, options);
  assert.equal(duplicate.coverage.validObservations, 1);
  for (const replacement of [null, NaN, Infinity, -1, 101]) {
    const rows = full.map((row, i) => i === 0 ? { ...row, score: replacement } : row);
    assert.equal(summarizeEvent(rows, event, options).status, 'insufficient_coverage');
  }
  const offGrid = [{ ...full[0], date: '2008-09-16' }, ...full.slice(1)];
  assert.equal(summarizeEvent(offGrid, event, options).coverage.validObservations, 25);
});

test('weekly denominator uses the original evaluation grid, not event-start weekday', () => {
  const shifted = { startDate: '2008-09-02', endDate: event.end };
  const rows = makeWeeklyDates(shifted.startDate, shifted.endDate).map(date => ({ date, score: 80 }));
  const result = summarizeEvent(rows, event, shifted);
  assert.equal(result.status, 'passed');
  assert.equal(result.coverage.expectedObservations, 25);
  assert.equal(result.coverage.validObservations, 25);
});

test('out-of-window and partial windows are incomplete, not score failures', () => {
  const absent = summarizeEvent(full, event, { startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.equal(absent.status, 'not_evaluated');
  assert.equal(absent.scorePass, null);
  assert.equal(absent.pass, false);
  const partial = summarizeEvent(full, event, { ...options, startDate: '2008-10-01' });
  assert.equal(partial.status, 'partial_window');
  const groups = eventResultGroups([absent]);
  assert.deepEqual(groups.failedEvents, []);
  assert.deepEqual(groups.notEvaluatedEvents, ['gfc_2008']);
  assert.deepEqual(groups.unpassedEvents, ['gfc_2008']);
  assert.equal(auditVerdict([absent], { pass: true }), 'needs_review');
  assert.equal(auditVerdict([partial], { pass: true }), 'needs_review');
});

test('Wind automatic and raw replay share coverage gates even with zero score deltas', () => {
  const scenario = { key: 'unchanged', adjustments: {} };
  const summary = summarizeWindScenario(full.slice(0, 1), full.slice(0, 1), scenario, options);
  assert.equal(summary.observations, 1);
  assert.equal(summary.maxAbsScoreDelta, 0);
  assert.equal(summary.events.find(item => item.key === event.key).status, 'insufficient_coverage');
  assert.equal(summary.rawConflictStress.events.find(item => item.key === event.key).status, 'insufficient_coverage');
  assert.deepEqual(summary.failedEvents, []);
  assert.ok(evaluateWindScenario(summary, {}, true).some(reason => reason.includes('event_windows_not_passed')));
});

test('all complete qualifying event windows still allow an unchanged Wind replay', () => {
  const range = { startDate: '2006-01-01', endDate: '2026-01-01' };
  const rows = makeWeeklyDates(range.startDate, range.endDate).map(date => ({ date,
    score: date.startsWith('2017') ? 30 : 80, overlayApplied: false }));
  const summary = summarizeWindScenario(rows, rows, { key: 'unchanged', adjustments: {} }, range);
  assert.equal(summary.events.length, 6);
  assert.ok(summary.events.every(event => event.status === 'passed'));
  assert.deepEqual(evaluateWindScenario(summary, { maxAbsScoreDeltaMax: 18, calmWindowAvgAbsDeltaMax: 5 }, true), []);
  assert.equal(auditVerdict(summary.events, { pass: true }), 'pass_with_limitations');
});
