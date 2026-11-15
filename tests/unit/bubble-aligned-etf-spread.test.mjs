import test from 'node:test';
import assert from 'node:assert/strict';
import { alignedEtfSpread } from '../../scripts/bubble-watch/aligned-etf-spread.mjs';
const rows = Array.from({ length: 181 }, (_, i) => ({ date: new Date(Date.UTC(2026, 4, 12 + i)).toISOString().slice(0, 10), close: 100 + i }));
const today = rows.at(-1).date;
test('same-session price returns preserve formula and observation date', () => {
  const result = alignedEtfSpread(rows, rows.map(row => ({ ...row, close: 100 })), today);
  assert.equal(result.spyRet, 180); assert.equal(result.rspRet, 0); assert.equal(result.spread, 180);
  assert.equal(result.observationDate, today); assert.equal(result.commonSessions, 181);
});
test('different endpoints align rather than compare unmatched sessions', () => {
  const result = alignedEtfSpread(rows.slice(1), rows.slice(0, -1), today);
  assert.equal(result.spread, 0); assert.equal(result.startDate, rows[1].date);
  assert.equal(result.observationDate, rows.at(-2).date);
});
test('reject stale, future, malformed, duplicate, nonpositive, sparse and short histories', () => {
  assert.throws(() => alignedEtfSpread(rows, rows, '2026-11-16'), /stale/);
  for (const bad of [{date:null,close:100},{date:'2026-02-30',close:100},{date:'2027-01-01',close:100},{date:today,close:0}]) {
    assert.throws(() => alignedEtfSpread([...rows.slice(0,-1),bad], rows, today));
  }
  assert.throws(() => alignedEtfSpread([...rows,rows[0]],rows,today), /duplicate/);
  assert.throws(() => alignedEtfSpread(rows.slice(-99),rows,today), /insufficient/);
  assert.throws(() => alignedEtfSpread(rows.slice(-110),rows,today), /window_invalid/);
});

test('weekday history accepts seven-day age, rejects eight and overflow', () => {
  const weekdays = rows.filter(row => ![0,6].includes(new Date(row.date).getUTCDay()));
  const end = weekdays.at(-1).date;
  const plus = days => new Date(Date.parse(end) + days * 86400000).toISOString().slice(0,10);
  assert.equal(alignedEtfSpread(weekdays,weekdays,plus(7)).spread,0);
  assert.throws(() => alignedEtfSpread(weekdays,weekdays,plus(8)), /stale/);
  const huge = weekdays.map((row,i) => ({...row,close:i === 0 ? 1e-300 : 1e300}));
  assert.throws(() => alignedEtfSpread(huge,weekdays,end), /nonfinite/);
});
