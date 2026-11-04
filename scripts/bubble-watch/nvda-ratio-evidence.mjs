import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';
import { NVDA_NUMERATOR_MAX_AGE_DAYS, NVDA_REVENUE_MAX_AGE_DAYS, nvdaNumeratorAgeAt, nvdaRevenueAgeAt, nvdaRatioAgeAt } from '../modules/nvdaEvidencePolicy.js';

export const NVDA_RATIO_CONTRACT = 'nvda-period-aligned-ratio-v1';
export const NVDA_GAP_REASON = 'nvda_comparable_commitment_revenue_evidence_unavailable';
const realDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0, 10) === value;
const official = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password
    && ['www.sec.gov', 'investor.nvidia.com', 'nvidianews.nvidia.com'].includes(u.hostname); } catch { return false; }
};
export function inspectNvdaNumerator(config, asOfDate) {
  if (!realDay(asOfDate)) throw new Error('nvda_audit_clock_invalid');
  const p = config?.params?.nvdaCommitments, ledger = config?.autoFallback?.nvda_invest_revenue;
  const dates = [p?.asOfDate, ledger?.asOfDate].filter(date => realDay(date) && date <= asOfDate).sort();
  const latestLedgerDate = dates.at(-1) ?? null;
  const audit = { latestLedgerDate, parameterDate: realDay(p?.asOfDate) ? p.asOfDate : null,
    newerLedgerProtected: Boolean(latestLedgerDate && realDay(p?.asOfDate) && latestLedgerDate > p.asOfDate) };
  const hold = reason => ({ status: 'unavailable', reason, ...audit });
  if (ledger?.asOfDate && (!realDay(ledger.asOfDate) || ledger.asOfDate > asOfDate)) return hold('ledger_date_invalid');
  if (!p || !realDay(p.asOfDate) || p.asOfDate > asOfDate) return hold('numerator_date_invalid');
  if (audit.newerLedgerProtected) return hold('newer_ledger_requires_comparable_evidence');
  // Existing text-only cumulative commitments can mix guarantees, debt and future
  // intentions. A date or a large total does not establish a comparable flow.
  if (p.contractVersion !== 'nvda-period-aligned-commitments-v1'
    || p.currency !== 'USD' || p.issuer !== 'NVDA'
    || p.basis !== 'signed_customer_equity_commitments_in_period'
    || p.includesGuarantees !== false || p.includesCollateralizedDebt !== false
    || !realDay(p.periodStart) || !realDay(p.periodEnd) || p.periodStart > p.periodEnd || p.periodEnd > p.asOfDate
    || p.review?.status !== 'accepted' || !realDay(p.review.reviewedAt)
    || p.review.reviewedAt > asOfDate || p.review.reviewedAt < p.asOfDate) return hold('numerator_basis_unverified');
  const limit = ledger?.maxAgeDays;
  if (!Number.isFinite(limit) || limit < 0) return hold('numerator_age_policy_missing');
  if (limit !== NVDA_NUMERATOR_MAX_AGE_DAYS) return hold('numerator_age_policy_mismatch');
  const freshness = assessUnderlyingObservationFreshness({ observationDate: p.asOfDate, asOfDate, maxAgeDays: NVDA_NUMERATOR_MAX_AGE_DAYS });
  if (freshness.status !== 'fresh') return hold('numerator_record_stale');
  if (!Array.isArray(p.records) || !p.records.length) return hold('signed_records_missing');
  const ids = new Set(); let total = 0;
  for (const row of p.records) {
    if (typeof row?.id !== 'string' || !row.id || ids.has(row.id)
      || row.kind !== 'equity_commitment' || row.bindingStatus !== 'signed' || row.counterpartyRole !== 'customer'
      || !realDay(row.signedDate) || row.signedDate < p.periodStart || row.signedDate > p.periodEnd
      || !Number.isFinite(row.usd) || row.usd <= 0 || !official(row.sourceUrl)) return hold('signed_record_invalid');
    ids.add(row.id); total += row.usd;
  }
  if (!Number.isFinite(p.usd) || p.usd <= 0 || Math.abs(total - p.usd) > 0.01) return hold('numerator_total_not_replayed');
  return { status: 'qualified', ...audit, usd: total, currency: 'USD', periodStart: p.periodStart,
    periodEnd: p.periodEnd, asOfDate: p.asOfDate, freshness, recordCount: ids.size,
    issuer: 'NVDA', basis: p.basis, includesGuarantees: false, includesCollateralizedDebt: false,
    review: { status: 'accepted', reviewedAt: p.review.reviewedAt },
    records: p.records.map(row => ({ id: row.id, signedDate: row.signedDate, usd: row.usd,
      kind: row.kind, bindingStatus: row.bindingStatus, counterpartyRole: row.counterpartyRole, sourceUrl: row.sourceUrl })) };
}
export function qualifyNvdaRatio(numerator, revenue) {
  if (numerator?.status !== 'qualified') return { status: 'unavailable', reason: numerator?.reason ?? 'numerator_basis_unverified' };
  const numeratorAge = nvdaNumeratorAgeAt(numerator, numerator.freshness?.asOfDate);
  if (numeratorAge?.status !== 'fresh' || Object.entries(numeratorAge).some(([key, value]) => numerator.freshness[key] !== value)) {
    return { status: 'unavailable', reason: 'numerator_age_policy_or_age_invalid' };
  }
  const first = revenue?.quarters?.[0], last = revenue?.quarters?.at(-1);
  const quarters = revenue?.quarters;
  const source = revenue?.source;
  const sourceValid = source?.issuer === 'NVDA' && source.currency === 'USD'
    && ((source.provider === 'SEC' && /^https:\/\/data\.sec\.gov\/api\/xbrl\/companyconcept\/CIK0001045810\/us-gaap\/(RevenueFromContractWithCustomerExcludingAssessedTax|Revenues)\.json$/.test(source.url ?? ''))
      || (source.provider === 'StockAnalysis' && source.url === 'https://stockanalysis.com/stocks/nvda/financials/?p=quarterly'));
  const age = nvdaRevenueAgeAt(revenue, numerator.freshness?.asOfDate);
  const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
  const validQuarters = Array.isArray(quarters) && quarters.length === 4 && quarters.every((q, i) =>
    realDay(q.start) && realDay(q.end) && days(q.start, q.end) >= 74 && days(q.start, q.end) <= 104
    && Number.isFinite(q.value) && q.value > 0 && (!i || days(quarters[i - 1].end, q.start) === 1));
  if (!validQuarters || !realDay(first?.start) || !realDay(last?.end) || first.start !== numerator.periodStart || last.end !== numerator.periodEnd
    || !Number.isFinite(revenue?.value) || revenue.value <= 1e10 || !sourceValid
    || age?.status !== 'fresh' || revenue.freshness?.status !== 'fresh' || revenue.freshness.maxAgeDays !== NVDA_REVENUE_MAX_AGE_DAYS) {
    return { status: 'unavailable', reason: 'numerator_revenue_periods_not_comparable' };
  }
  if (Math.abs(quarters.reduce((sum, q) => sum + q.value, 0) - revenue.value) > 0.01
    || days(first.start, last.end) + 1 < 350 || days(first.start, last.end) + 1 > 380
    || revenue.observationDate !== last.end || revenue.freshness.observationDate !== last.end
    || revenue.freshness.asOfDate !== numerator.freshness?.asOfDate) return { status: 'unavailable', reason: 'revenue_period_identity_invalid' };
  const ratioPct = numerator.usd / revenue.value * 100;
  return { status: 'qualified', contractVersion: NVDA_RATIO_CONTRACT, ratioPct,
    numerator, revenue: { value: revenue.value, currency: 'USD', periodStart: first.start,
      periodEnd: last.end, observationDate: revenue.observationDate, quarters: revenue.quarters, freshness: age, source } };
}
export function validateNvdaRatioRecord(item, asOfDate) {
  const d = item?.provenance?.detail;
  // Old publications stay readable audit records; the UI must not qualify them.
  if (d?.contractVersion !== NVDA_RATIO_CONTRACT || item.status === 'unknown') return [];
  try {
    const n = d.numerator;
    if (n?.freshness?.maxAgeDays !== NVDA_NUMERATOR_MAX_AGE_DAYS) return ['NVDA numerator age policy differs from trusted contract'];
    const proofDate = n.freshness.asOfDate;
    if (!realDay(asOfDate) || !realDay(proofDate) || proofDate > asOfDate
      || d.revenue?.freshness?.asOfDate !== proofDate) return ['NVDA proof clock is invalid'];
    // Reconstruct the original proof at its own clock. Carrying it into a later
    // issue must not require mutating historical ageDays/asOfDate declarations.
    const numerator = inspectNvdaNumerator({ params: { nvdaCommitments: { ...n, contractVersion: 'nvda-period-aligned-commitments-v1' } },
      autoFallback: { nvda_invest_revenue: { asOfDate: n?.asOfDate, maxAgeDays: NVDA_NUMERATOR_MAX_AGE_DAYS } } }, proofDate);
    const replay = qualifyNvdaRatio(numerator, d.revenue);
    if (d.qualificationStatus !== 'qualified' || d.currentEligible !== true || replay.status !== 'qualified'
      || Object.entries(numerator.freshness).some(([key, value]) => n.freshness[key] !== value)
      || !Number.isFinite(d.ratioPct) || Math.abs(replay.ratioPct - d.ratioPct) > 1e-8
      || d.revenue.periodStart !== replay.revenue.periodStart || d.revenue.periodEnd !== replay.revenue.periodEnd
      || d.revenue.currency !== 'USD'
      || item.as_of !== replay.revenue.observationDate || item.stale !== false
      || item.status !== (replay.ratioPct > 30 ? 'red' : replay.ratioPct > 15 ? 'yellow' : 'green')) return ['NVDA ratio evidence does not replay'];
    const current = nvdaRatioAgeAt(d, asOfDate);
    return current?.numerator.status === 'fresh' && current.revenue.status === 'fresh'
      ? [] : ['NVDA evidence is expired or invalid at current issue'];
  } catch { return ['NVDA ratio evidence is malformed']; }
}
export function buildNvdaGap(base, today, assessment, checkedAt = new Date().toISOString()) {
  if (!realDay(today) || !Number.isFinite(Date.parse(checkedAt)) || new Date(checkedAt).toISOString().slice(0, 10) !== today) throw new Error('nvda_check_clock_invalid');
  return { ...base, status: 'unknown', value_display: '待确认 · 期间或口径不可比', as_of: null, stale: false,
    source_name: 'NVIDIA 可比投资承诺与收入证据待核验',
    note: `未取得同一期间、同一口径的已签客户股权承诺与收入证据，当前不计算比率。${assessment.latestLedgerDate ? `较新台账${assessment.latestLedgerDate}保留作审计，未用旧参数覆盖。` : ''}累计承诺、担保上限、抵押债务或未来意向不能直接拼入同期间比率。`,
    evidence_gap: { policy: NVDA_RATIO_CONTRACT, reasonCode: NVDA_GAP_REASON, checkedDate: today },
    provenance: { mode: 'auto', checkedAt, detail: { contractVersion: NVDA_RATIO_CONTRACT,
      qualificationStatus: 'unavailable', reason: assessment.reason, latestLedgerDate: assessment.latestLedgerDate ?? null,
      parameterDate: assessment.parameterDate ?? null, newerLedgerProtected: assessment.newerLedgerProtected === true,
      ratioPct: null, currentEligible: false } } };
}
