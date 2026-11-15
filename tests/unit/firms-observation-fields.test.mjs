import test from 'node:test';
import assert from 'node:assert/strict';
import { firmsFrpOrNull, firmsAcquisitionIso } from '../../scripts/oil-directional/firms-observation-fields.mjs';
test('missing FRP is unknown; observed zero and decimals survive', () => {
  for (const v of [undefined, null, '', '   ']) assert.equal(firmsFrpOrNull(v), null);
  for (const v of [0, '0', '0.0']) assert.equal(firmsFrpOrNull(v), 0);
  assert.equal(firmsFrpOrNull('57.24'), 57.24);
  for (const v of ['NaN', 'Infinity', '-1', '0x20', 'bad', true]) assert.throws(() => firmsFrpOrNull(v));
});
test('calendar and HHMM are strict; midnight and leap day survive', () => {
  assert.equal(firmsAcquisitionIso({acq_date:'2024-02-29',acq_time:'5'}), '2024-02-29T00:05:00Z');
  assert.equal(firmsAcquisitionIso({acq_date:'2026-11-15',acq_time:0}), '2026-11-15T00:00:00Z');
  for (const d of ['', '2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01']) assert.throws(() => firmsAcquisitionIso({acq_date:d,acq_time:'1200'}));
  for (const t of ['', null, undefined, '2400', '1260', '-1', '12000', '12:00']) assert.throws(() => firmsAcquisitionIso({acq_date:'2026-11-15',acq_time:t}));
});
