import { parseObservationDate } from './source-observation.mjs';
import { structuralSourceUsable } from './score-input-contract.mjs';
import {
  requireStructuralObservation, structuralLagValue, structuralObservationUsable, structuralValueUsable
} from './structural-freshness.mjs';

export const NY_FED_ON_RRP_URL = 'https://markets.newyorkfed.org/api/rp/reverserepo/all/results/last/6.json';
const NY_FED_ON_RRP_SOURCE = 'NYFED:overnight-reverse-repo-results';

export function parseNyFedOnRrpRows(payload, nowIso) {
  const operations = payload?.repo?.operations;
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > 6) return [];
  const rows = [];
  const dates = new Set();
  for (const operation of operations) {
    const date = parseObservationDate(operation?.operationDate, nowIso);
    const detail = operation?.details?.[0];
    if (date === null || date !== operation.operationDate || dates.has(date)
        || operation.operationType !== 'Reverse Repo' || operation.auctionStatus !== 'Results'
        || operation.term !== 'Overnight' || !Number.isInteger(operation.termCalenderDays) || operation.termCalenderDays < 1
        || !Array.isArray(operation.details) || operation.details.length !== 1 || detail?.securityType !== 'Treasury'
        || !structuralValueUsable(detail?.amtAccepted, 'onRrp')) return [];
    // Use actual Treasury awards on the operation date (not all-collateral totals or maturity).
    dates.add(date);
    rows.push({ date, value: detail.amtAccepted / 1e9 });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function liveReading(rows, now, source = null) {
  const date = requireStructuralObservation(rows, 'onRrp', now);
  const value = rows.at(-1).value;
  const ago = structuralLagValue(rows, 7, 3);
  const weekChangeStatus = ago === 0 ? 'undefined_zero_baseline' : Number.isFinite(ago) ? 'observed' : 'missing';
  const weekChange = Number.isFinite(ago) && ago !== 0 ? +(((value - ago) / ago) * 100).toFixed(3) : null;
  return { value, date, weekChange, weekChangeStatus, status: 'live', source };
}

export async function resolveOnRrp(prevFed, nowIso, fetchPrimary, fetchSecondary) {
  const now = Date.parse(nowIso);
  try {
    return liveReading(await fetchPrimary(), now);
  } catch {
    // The backup is for a missing level, not for filling an incomplete FRED comparison.
  }

  const previousDate = prevFed?.sourceObservedAt?.onRrp;
  const hasCache = structuralValueUsable(prevFed?.onRrp, 'onRrp')
    && structuralSourceUsable(prevFed?.sourceStatus?.onRrp)
    && structuralObservationUsable(previousDate, 'onRrp', now);
  try {
    const rows = parseNyFedOnRrpRows(await fetchSecondary(), nowIso);
    const candidate = liveReading(rows, now, NY_FED_ON_RRP_SOURCE);
    if (!hasCache || candidate.date > previousDate) return candidate;
  } catch {
    // Keep the incumbent reading, date and provenance together.
  }

  if (hasCache) {
    const weekChange = Number.isFinite(prevFed.onRrpWeekChange) ? prevFed.onRrpWeekChange : null;
    const weekChangeStatus = weekChange !== null ? 'observed'
      : prevFed.onRrpWeekChangeStatus === 'undefined_zero_baseline' ? 'undefined_zero_baseline' : 'missing';
    const source = prevFed.onRrpSource === NY_FED_ON_RRP_SOURCE ? prevFed.onRrpSource : null;
    return { value: prevFed.onRrp, date: previousDate, weekChange, weekChangeStatus, status: 'fallback', source };
  }

  return { value: null, date: null, weekChange: null, weekChangeStatus: 'missing', status: 'missing', source: null };
}
