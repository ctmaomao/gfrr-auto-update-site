#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  parseAsOfDate,
  parseDatasetDateEnd,
  summarizeHdxPackages
} from './world-order/probe-acled-hdx-refresh.mjs';

function readFixture(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

assert.equal(parseDatasetDateEnd('[1997-01-01T00:00:00 TO 2026-06-26T23:59:59]'), '2026-06-26');
assert.equal(parseAsOfDate('nigeria_HRP_demo_by_month-year_as-of-01jul2026.xlsx'), '2026-07-01');
assert.equal(parseAsOfDate('political-violence-events-and-fatalities_as-of-2026-06-26.xlsx'), '2026-06-26');

const ready = summarizeHdxPackages(readFixture('docs/fixtures/world-order/acled-hdx-package-show-ready.json'));
assert.equal(ready.readyForManualReminder, true);
assert.equal(ready.status, 'hdx_acled_asof_ready');
assert.equal(ready.asOfDate, '2026-06-26');
assert.equal(ready.reminderKey, 'acled-hdx-asof-2026-06-26');
assert.deepEqual(ready.blockers, []);

const lagged = summarizeHdxPackages(readFixture('docs/fixtures/world-order/acled-hdx-package-show-lagged.json'));
assert.equal(lagged.readyForManualReminder, false);
assert.equal(lagged.status, 'hdx_acled_asof_not_ready');
assert.equal(lagged.asOfDate, '2026-06-19');
assert.ok(lagged.blockers.includes('inconsistent_as_of_dates:2026-06-19,2026-06-26'));

console.log('ACLED HDX refresh probe check: PASS');
