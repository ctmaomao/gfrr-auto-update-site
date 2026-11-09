// Display/audit clocks only. Published lights, counts and scores are immutable.
import { nvdaRatioAgeAt } from './nvdaEvidencePolicy.js?v=data-provenance-20261109';
const DAY = 86400000;
export const BUBBLE_ISSUE_MAX_AGE_DAYS = 35; // Existing weekly publication policy.
export function strictEvidenceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}
export function evidenceFreshnessAtAudit(item, now) {
  const today = typeof now === 'string' ? now.slice(0, 10) : null;
  const observedDate = strictEvidenceDate(item?.as_of) ? item.as_of : null;
  const limit = item?.provenance?.maxAgeDays;
  const maxAgeDays = Number.isFinite(limit) && limit >= 0 ? limit : null;
  const ageDays = observedDate === null || !strictEvidenceDate(today) ? null : (Date.parse(today) - Date.parse(observedDate)) / DAY;
  const reason = ageDays === null ? 'card_date_invalid' : ageDays < 0 ? 'card_date_future'
    : maxAgeDays === null ? 'card_age_policy_unavailable'
      : ageDays > maxAgeDays ? 'age_exceeds_policy' : 'within_policy_age';
  return { observedDate, ageDays, maxAgeDays,
    status: reason === 'age_exceeds_policy' ? 'stale' : reason === 'within_policy_age' ? 'within_policy_age' : 'unknown', reason };
}
export function buildBubbleFreshnessView(data, nowMs = Date.now()) {
  const now = Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : '';
  const issue = evidenceFreshnessAtAudit({ as_of: data?.as_of_date, provenance: { maxAgeDays: BUBBLE_ISSUE_MAX_AGE_DAYS } }, now);
  const cards = (data?.indicators ?? []).map(item => {
    const age = evidenceFreshnessAtAudit(item, now);
    const label = age.status === 'stale' ? `已超龄 ${age.ageDays}天 / 上限${age.maxAgeDays}天`
      : age.status === 'unknown' ? age.reason === 'card_age_policy_unavailable' ? '时效政策未记录' : '观测日期待核验'
        : `观测已过${age.ageDays}天 / 上限${age.maxAgeDays}天`;
    return { id: item.id, ...age, publishedStale: item.stale === true,
      label: `${label}${item.stale === true ? ' · 发布时已标旧' : ''}` };
  });
  const stale = cards.filter(c => c.status === 'stale').length;
  const unknown = cards.filter(c => c.status === 'unknown').length;
  const issueLabel = issue.status === 'stale' ? '历史期次 · 整期已超龄' : issue.status === 'unknown' ? '期次日期待核验' : '本期期次';
  const nvda = nvdaDisplayState(data?.indicators?.find(item => item.id === 'nvda_invest_revenue'), nowMs);
  const ratioNote = nvda && !nvda.qualified ? 'NVIDIA比率待核验，已发布分数不可视为全部输入已获当前验证。' : '';
  return { issue, cards, nvda, verdictLabel: issue.status === 'within_policy_age' ? '本期判读 · ISSUE VERDICT' : '历史或待核验判读 · ARCHIVED / UNVERIFIED',
    summary: `${issueLabel} · ${data?.as_of_date ?? '日期缺失'}${issue.ageDays === null ? '' : ` · 已过${issue.ageDays}天 / 上限${BUBBLE_ISSUE_MAX_AGE_DAYS}天`}；逐卡超龄${stale}张，时效待核验${unknown}张。灯色与分数保留发布口径；日期为卡片记录，未独立核验源日期。${ratioNote}` };
}

// A page may carry an old publication without silently certifying its ratio.
export function nvdaDisplayState(item, nowMs = Date.now()) {
  if (item?.id !== 'nvda_invest_revenue') return null;
  const d = item.provenance?.detail, n = d?.numerator, r = d?.revenue;
  const today = Number.isFinite(nowMs) ? new Date(nowMs).toISOString().slice(0, 10) : '';
  const age = nvdaRatioAgeAt(d, today);
  const source = r?.source;
  const sourceValid = source?.issuer === 'NVDA' && source.currency === 'USD'
    && ((source.provider === 'SEC' && /^https:\/\/data\.sec\.gov\/api\/xbrl\/companyconcept\/CIK0001045810\/us-gaap\/(RevenueFromContractWithCustomerExcludingAssessedTax|Revenues)\.json$/.test(source.url ?? ''))
      || (source.provider === 'StockAnalysis' && source.url === 'https://stockanalysis.com/stocks/nvda/financials/?p=quarterly'));
  const qs = r?.quarters;
  const periods = Array.isArray(qs) && qs.length === 4 && qs.every((q, i) =>
    strictEvidenceDate(q.start) && strictEvidenceDate(q.end) && Number.isFinite(q.value) && q.value > 0
    && (Date.parse(q.end) - Date.parse(q.start)) / DAY >= 74
    && (Date.parse(q.end) - Date.parse(q.start)) / DAY <= 104
    && (!i || Date.parse(q.start) - Date.parse(qs[i - 1].end) === DAY));
  const qualified = item.status !== 'unknown' && d?.contractVersion === 'nvda-period-aligned-ratio-v1'
    && d.qualificationStatus === 'qualified' && d.currentEligible === true && sourceValid
    && n?.currency === 'USD' && r?.currency === 'USD' && n.basis === 'signed_customer_equity_commitments_in_period'
    && n.includesGuarantees === false && n.includesCollateralizedDebt === false
    && n.review?.status === 'accepted' && strictEvidenceDate(n.review.reviewedAt)
    && n.review.reviewedAt >= n.asOfDate && n.review.reviewedAt <= age?.proofDate
    && n.periodStart === r.periodStart && n.periodEnd === r.periodEnd && periods
    && qs[0].start === n.periodStart && qs[3].end === n.periodEnd
    && (Date.parse(n.periodEnd) - Date.parse(n.periodStart)) / DAY + 1 >= 350
    && (Date.parse(n.periodEnd) - Date.parse(n.periodStart)) / DAY + 1 <= 380
    && r.observationDate === r.periodEnd && item.as_of === r.periodEnd
    && Number.isFinite(n.usd) && n.usd > 0 && Number.isFinite(r.value) && r.value > 1e10
    && Math.abs(qs.reduce((sum, q) => sum + q.value, 0) - r.value) <= 0.01
    && Number.isFinite(d.ratioPct) && Math.abs(n.usd / r.value * 100 - d.ratioPct) <= 1e-8
    && age?.numerator.status === 'fresh' && age.revenue.status === 'fresh';
  return { qualified, value: qualified ? item.value_display : '待核验 · 期间或口径不可比',
    note: qualified ? item.note : '尚无同一期间、同一口径且仍有效的承诺与收入证据，当前不展示比率。原台账保留供审计；页面灯色、计数与分数是已发布快照，未在浏览器重算。',
    label: qualified ? '同期间证据 · 页面时效核验通过' : '比率待核验 · 灯色保留发布记录' };
}
