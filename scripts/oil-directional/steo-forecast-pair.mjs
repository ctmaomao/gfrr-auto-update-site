/** Offline, fixed two-workbook feasibility audit. No network, production writes or price outcomes. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const STEO_PAIR = Object.freeze([
  Object.freeze({ issue: 'October 2026', forecastDate: 'Thursday, October 1, 2026', releaseDate: '2026-10-06', sha256: '54989362410da4aff5673580396380c3a8f4f111fa6d01c6d4fab05ef90efbf4', url: 'https://www.eia.gov/outlooks/steo/archives/oct26_base.xlsx' }),
  Object.freeze({ issue: 'November 2026', forecastDate: 'Thursday, November 5, 2026', releaseDate: '2026-11-10', sha256: '7d28012ff726ebeafd584905d842ded42bb3c9922550cb26e005af9cd4e27fb5', url: 'https://www.eia.gov/outlooks/steo/archives/nov26_base.xlsx' }),
]);
const fail = reason => { throw new Error(`STEO pair rejected: ${reason}`); };
const text = (s, a, expected) => { if (s?.[a]?.v !== expected) fail(`unexpected ${a}`); };
const number = (s, a) => { const c = s?.[a]; if (c?.t !== 'n' || !Number.isFinite(c.v) || c.f || c.v <= 0) fail(`invalid ${a}`); return c.v; };

/** Cell-level calculation only; callers cannot establish original vintage authenticity. */
export function extractSteoForecastCells(sheet, issueIndex) {
  if (!Number.isInteger(issueIndex) || !STEO_PAIR[issueIndex]) fail('issue index');
  const issue = STEO_PAIR[issueIndex];
  for (const [a, v] of Object.entries({
    B1: 'Table 3a.  World Petroleum and Other Liquid Fuels Production, Consumption, and Inventories',
    B2: `U.S. Energy Information Administration  |  Short-Term Energy Outlook  - ${issue.issue}`,
    A3: 'Forecast date:', A4: issue.forecastDate,
    B5: 'Production (million barrels per day) (a)', A6: 'papr_world', A10: 'papr_world',
    B6: 'World total', B10: 'World total',
    B18: 'Consumption (million barrels per day) (c)', A19: 'patc_world', B19: 'World total',
    BK3: 2027, BK4: 'Jan', BL4: 'Feb', BM4: 'Mar',
    B55: 'Forecasts: EIA Short-Term Integrated Forecasting System. ',
  })) text(sheet, a, v);
  const months = ['BK', 'BL', 'BM'].map((col, i) => {
    const production = number(sheet, `${col}6`), consumption = number(sheet, `${col}19`);
    if (production !== number(sheet, `${col}10`)) fail('repeated production disagrees');
    return { month: `2027-0${i + 1}`, production, consumption, productionLessConsumption: production - consumption, cells: [`${col}6`, `${col}19`] };
  });
  const mean = key => months.reduce((sum, m, i) => sum + m[key] * [31, 28, 31][i], 0) / 90;
  return { issue: issue.issue, officialReleaseDateClaim: issue.releaseDate, forecastCompletedDateText: issue.forecastDate,
    target: '2027-Q1', unit: 'million barrels per day', months,
    quarterDayWeighted: { production: mean('production'), consumption: mean('consumption'), productionLessConsumption: mean('productionLessConsumption') },
    historicalVintageAuthenticityVerified: false, eligibleForEvaluation: false, eligibleForPublicProbability: false };
}

export function compareSteoForecastCells(sheets) {
  if (!Array.isArray(sheets) || sheets.length !== 2) fail('exactly two sheets required');
  const reports = sheets.map(extractSteoForecastCells);
  const revision = Object.fromEntries(Object.keys(reports[0].quarterDayWeighted).map(k => [k, reports[1].quarterDayWeighted[k] - reports[0].quarterDayWeighted[k]]));
  return { scope: 'fixed_pair_current_archive_copies_not_historical_vintage_proof', reports, revisionNovemberLessOctober: revision,
    source: 'EIA Short-Term Integrated Forecasting System', priceOutcomesComputed: false, forecastAccuracyMeasured: false,
    eligibleForEvaluation: false, eligibleForMainScore: false, eligibleForPublicProbability: false };
}

export async function inspectSteoPair(paths) {
  if (paths.length !== 2) fail('supply October and November local XLSX paths');
  const buffers = paths.map((p, i) => {
    const st = fs.lstatSync(p); if (!st.isFile() || st.size > 5242880) fail('regular bounded file required');
    const b = fs.readFileSync(p); if (b.length > 5242880 || createHash('sha256').update(b).digest('hex') !== STEO_PAIR[i].sha256) fail('fixed source bytes differ');
    return b;
  });
  // Existing development-only dependency; never imported by production.
  const XLSX = await import('xlsx');
  const sheets = buffers.map(b => XLSX.read(b, { type: 'buffer', cellFormula: true, sheets: '3atab' }).Sheets['3atab']);
  return { ...compareSteoForecastCells(sheets), inspectedAt: new Date().toISOString(),
    sourceByteIdentityVerified: true, sourceCopies: STEO_PAIR.map((s, i) => ({ url: s.url, sha256: s.sha256, bytes: buffers[i].length })),
    firstPublicAvailabilityVerified: false, revisionHistoryComplete: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await inspectSteoPair(process.argv.slice(2)), null, 2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
