import assert from 'node:assert/strict';
import test from 'node:test';
import { walkForward } from '../../scripts/treasury-fiscal-data/liquidity-model-cross-audit.mjs';

for (const [horizon, targetKey] of [[56, 'financialStress'], [56, 'reserveStress'], [91, 'fundingStress']]) {
  test(`${targetKey} h${horizon}: select from matured labels only, without purging test rows`, () => {
    const asDate = (ms) => new Date(ms).toISOString().slice(0, 10);
    const day = 86_400_000;
    const start = Date.UTC(2025, 0, 1);
    const row = (date, pressure, positive) => ({
      date, pressure, walcl4wChange: 0, targets: { [`h${horizon}`]: { [targetKey]: positive } }
    });
    const history = Array.from({ length: 100 }, (_, i) =>
      row(asDate(Date.UTC(2022, 0, 1) + i * day), i < 60 ? 50 : 0, i < 60));
    const previous = [row('2023-01-01', 50, true), row('2023-12-31', 0, false)];
    const testRows = [row('2025-01-01', 35, true), row('2025-12-31', 0, false)];
    const matured = row(asDate(start - (horizon + 1) * day), 35, true);
    const clean = [...history, ...previous, matured, ...testRows];
    const expected = walkForward(clean, horizon, targetKey, 2023, 2025);
    assert.deepEqual(expected.folds.map(({ testYear, chosen, test }) => [testYear, chosen.p, test.n]), [
      [2023, 30, 2], [2024, 30, 1], [2025, 30, 2]
    ]);
    assert.equal(expected.folds[2].test.tp, 1);
    assert.equal(expected.folds[2].test.tn, 1);
    for (const [offset, boundary] of [[horizon, 'equal'], [horizon - 1, 'crossing']]) {
      const late = row(asDate(start - offset * day), 35, false);
      const actual = walkForward([...clean.slice(0, -2), late, ...testRows], horizon, targetKey, 2023, 2025);
      assert.deepEqual(actual.folds[0], expected.folds[0]);
      assert.equal(actual.folds[1].test.n, 2, 'late row still belongs to its own test year');
      assert.deepEqual(actual.folds[2], expected.folds[2], `${boundary} label endpoint must not affect tuning`);
    }
  });
}
