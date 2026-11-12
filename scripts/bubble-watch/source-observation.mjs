import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

export const SOURCE_OBSERVATION_CONTRACT = 'bubble-source-observation-v1';
export const KPMG_ADOPTION_BASIS = 'kpmg_significant_workforce_adoption';
const TYPED_BASES = Object.freeze({
  enterprise_deploy: KPMG_ADOPTION_BASIS,
  vc_ai_share: 'crunchbase_global_quarterly',
  arr_2nd_deriv: 'same_basis_disclosed_series_3m_vs_prior3m'
});
const LIGHTS = new Set(['red', 'yellow', 'green']);
const MAX_AGES = Object.freeze({ enterprise_deploy: 120, vc_ai_share: 120, arr_2nd_deriv: 45 });
const DAY_MS = 86400000;

function fail(reason) { throw new Error(reason); }
function date(value, label = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) fail(`${label}_invalid`);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail(`${label}_invalid`);
  return time;
}
function number(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label}_invalid`);
  return value;
}
function sourceUrl(value, host, pathPattern) {
  let parsed;
  try { parsed = new URL(value); } catch { fail('source_url_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== host || parsed.username || parsed.password
    || parsed.port || parsed.search || parsed.hash || !pathPattern.test(parsed.pathname)) fail('source_url_not_allowlisted');
  return value;
}
function quarter(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-Q([1-4])$/u);
  if (!match) fail('quarter_invalid');
  const year = Number(match[1]);
  const q = Number(match[2]);
  return {
    index: year * 4 + q - 1,
    year, q,
    start: `${match[1]}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`,
    end: new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10)
  };
}
function freshness(id, entry, today) {
  if (entry.maxAgeDays !== MAX_AGES[id]) fail('max_age_policy_mismatch');
  return assessUnderlyingObservationFreshness({ observationDate: entry.asOfDate, asOfDate: today, maxAgeDays: entry.maxAgeDays });
}
function commonObservation(id, entry, today) {
  const evidence = entry?.sourceObservation;
  if (!evidence || evidence.contract !== SOURCE_OBSERVATION_CONTRACT) fail('typed_observation_required');
  if (evidence.basis !== TYPED_BASES[id]) fail('observation_basis_not_allowlisted');
  if (evidence.observationDate !== entry.asOfDate) fail('observation_date_mismatch');
  date(today, 'today');
  date(evidence.observationDate, 'observation_date');
  if (evidence.observationDate > today) fail('observation_date_future');
  const assessment = freshness(id, entry, today);
  return { evidence, assessment };
}

function enterprise(entry, today) {
  const { evidence: e, assessment } = commonObservation('enterprise_deploy', entry, today);
  if (e.previousBasis !== KPMG_ADOPTION_BASIS || e.population !== 'us_executives_annual_revenue_gte_1bn') fail('survey_population_or_basis_mismatch');
  const current = quarter(e.currentQuarter);
  const previous = quarter(e.previousQuarter);
  if (current.index !== previous.index + 1) fail('survey_quarters_not_consecutive');
  sourceUrl(e.sourceUrl, 'kpmg.com', new RegExp(`^/us/en/media/news/q${current.q}-ai-pulse-${current.year}\\.html$`, 'u'));
  number(e.currentPct, 0, 100, 'current_pct');
  number(e.previousPct, 0, 100, 'previous_pct');
  if (!Number.isInteger(e.sampleSize) || e.sampleSize <= 0) fail('sample_size_invalid');
  date(e.publicationDate, 'publication_date');
  date(e.surveyStart, 'survey_start');
  date(e.surveyEnd, 'survey_end');
  if (e.publicationDate !== e.observationDate || e.surveyStart > e.surveyEnd
    || e.surveyStart < current.start || e.surveyEnd > current.end || e.surveyEnd > e.publicationDate) fail('survey_dates_inconsistent');
  const changePp = e.currentPct - e.previousPct;
  if (e.changePp !== undefined && e.changePp !== changePp) fail('survey_change_mismatch');
  const status = changePp >= 3 ? 'green' : changePp >= -3 ? 'yellow' : 'red';
  return { evidence: e, assessment, status, value: e.currentPct, changePp };
}

function vc(entry, today) {
  const { evidence: e, assessment } = commonObservation('vc_ai_share', entry, today);
  const period = quarter(e.period);
  sourceUrl(e.sourceUrl, 'news.crunchbase.com', /^\/venture\/[a-z0-9-]+\/$/u);
  if (e.geography !== 'global' || e.periodStart !== period.start || e.periodEnd !== period.end
    || e.publicationDate !== e.observationDate || e.publicationDate < e.periodEnd) fail('vc_period_or_geography_mismatch');
  number(e.aiFundingUsdB, 0, 1000000, 'ai_funding');
  number(e.totalFundingUsdB, Number.MIN_VALUE, 1000000, 'total_funding');
  if (e.aiFundingUsdB > e.totalFundingUsdB) fail('vc_funding_inconsistent');
  const value = e.aiFundingUsdB / e.totalFundingUsdB * 100;
  return { evidence: e, assessment, value, status: value > 50 ? 'red' : value >= 30 ? 'yellow' : 'green' };
}

function arr(entry, today) {
  const { evidence: e, assessment } = commonObservation('arr_2nd_deriv', entry, today);
  // These three old disclosures are a historical audit record, not an admission of
  // a new current ARR series, exact three-month growth, or the Epoch candidate.
  if (e.productionEligible !== false || e.measurement !== 'historical_disclosed_run_rate_anchors'
    || e.company !== 'Anthropic' || e.revenueBasis !== 'gross' || !Array.isArray(e.anchors) || e.anchors.length !== 3) fail('arr_historical_basis_required');
  sourceUrl(e.sourceUrl, 'www.anthropic.com', /^\/news\/google-broadcom-partnership-compute$/u);
  const expected = [['2025-12-31', 9, 'about'], ['2026-04-06', 30, 'more_than'], ['2026-07-31', 65, 'more_than']];
  for (const [index, anchor] of e.anchors.entries()) {
    if (!anchor || anchor.asOfDate !== expected[index][0] || anchor.amountUsdB !== expected[index][1]
      || anchor.qualifier !== expected[index][2] || anchor.isForecast !== false) fail('arr_unreviewed_anchor');
    date(anchor.sourceDate, 'anchor_source_date');
    if (anchor.sourceDate < anchor.asOfDate || anchor.sourceDate > today) fail('anchor_source_date_inconsistent');
    sourceUrl(anchor.sourceUrl, index === 2 ? 'www.marketscreener.com' : 'www.anthropic.com', index === 2
      ? /^\/news\/anthropic-revenue-run-rate-tops-65-billion-source-says-ce7859dcdd80ff2d$/u
      : /^\/news\/google-broadcom-partnership-compute$/u);
  }
  if (e.observationDate !== e.anchors.at(-1).asOfDate) fail('arr_latest_anchor_date_mismatch');
  return { evidence: e, assessment, status: null, value: null };
}

/** Pure projection: status=null whenever typed evidence is invalid or stale. */
export function evaluateEnterpriseObservation(entry, today) {
  try {
    const { evidence: e, assessment, status, value, changePp } = enterprise(entry, today);
    const stale = assessment.status === 'stale';
    return {
      valid: true, ok: !stale, reason: stale ? 'enterprise_observation_stale' : null,
      status: stale ? null : status, historicalStatus: status, value,
      asOfDate: e.observationDate, ageDays: assessment.ageDays, maxAgeDays: assessment.maxAgeDays, stale,
      detail: { sourceObservation: structuredClone(e), currentPct: value, previousPct: e.previousPct,
        changePp, currentQuarter: e.currentQuarter, previousQuarter: e.previousQuarter, basis: e.basis,
        sourceUrl: e.sourceUrl, publicationDate: e.publicationDate, surveyStart: e.surveyStart,
        surveyEnd: e.surveyEnd, sampleSize: e.sampleSize, population: e.population }
    };
  } catch (error) {
    return { valid: false, ok: false, reason: error.message, status: null, historicalStatus: null,
      value: null, asOfDate: null, ageDays: null, maxAgeDays: 120, stale: true, detail: null };
  }
}

/** Coherent KPMG display fields; a Google AI-agent survey is a different metric. */
export function buildEnterpriseObservationProjection(entry, today) {
  const result = evaluateEnterpriseObservation(entry, today);
  const fields = {
    name_en: 'KPMG Significant Workforce AI Adoption', name_zh: '企业显著员工 AI 采用率',
    threshold_text: '较上季 ≥+3pp 绿 / −3pp ≤变化<+3pp 黄 / 下降>3pp 红',
    source_name: 'KPMG US AI Quarterly Pulse'
  };
  if (!result.valid) return { ...result, ...fields, value_display: '待确认', note: '尚未取得可核验的同口径员工 AI 采用率调查。' };
  const d = result.detail;
  const change = `${d.changePp >= 0 ? '+' : ''}${Number(d.changePp.toFixed(4))}`;
  const note = `KPMG ${d.currentQuarter} 调查：${d.currentPct}% 受访高管报告显著员工 AI 采用，上一季 ${d.previousPct}%，变化 ${change} 个百分点。样本为 ${d.sampleSize} 位美国高管，所在机构年收入至少 10 亿美元；调查期 ${d.surveyStart} 至 ${d.surveyEnd}，发布于 ${d.publicationDate}。这是员工采用率，不是 AI-agent 生产部署率。${result.stale ? '原调查已超过 120 天时效，当前灯色待确认。' : ''}`;
  return { ...result, ...fields, value_display: `${d.currentPct}%（QoQ ${change}pp）`, note };
}

/** Score proof excludes display text but preserves every quantity and date. */
export function validateEnterpriseScoreEvidence(item, today) {
  const p = item?.provenance;
  if (item?.id !== 'enterprise_deploy' || p?.mode !== 'curated' || !p.detail?.sourceObservation) return false;
  const projection = buildEnterpriseObservationProjection({
    asOfDate: p.asOfDate, maxAgeDays: p.maxAgeDays, sourceObservation: p.detail.sourceObservation
  }, today);
  if (!projection.ok || item.stale !== false || item.as_of !== projection.asOfDate
    || item.status !== projection.status || p.ageDays !== projection.ageDays || p.maxAgeDays !== projection.maxAgeDays) return false;
  for (const key of ['currentPct', 'previousPct', 'changePp', 'currentQuarter', 'previousQuarter',
    'basis', 'sourceUrl', 'publicationDate', 'surveyStart', 'surveyEnd', 'sampleSize', 'population']) {
    if (p.detail[key] !== projection.detail[key]) return false;
  }
  return true;
}

/** Narrow source-health admission: a complete, current, replayable KPMG card. */
export function validateEnterpriseObservationRecord(item, today) {
  if (!validateEnterpriseScoreEvidence(item, today)) return false;
  const p = item.provenance;
  const projection = buildEnterpriseObservationProjection({
    asOfDate: p.asOfDate, maxAgeDays: p.maxAgeDays, sourceObservation: p.detail.sourceObservation
  }, today);
  for (const key of ['name_en', 'name_zh', 'threshold_text', 'source_name', 'value_display', 'status', 'note']) {
    if (item[key] !== projection[key]) return false;
  }
  return item.value === undefined || item.value === projection.value;
}

function inspectTyped(id, entry, today) {
  return id === 'enterprise_deploy' ? enterprise(entry, today) : id === 'vc_ai_share' ? vc(entry, today) : arr(entry, today);
}
function typedValueMatches(id, indicator, checked) {
  if (id === 'arr_2nd_deriv') return indicator.value === '披露序列减速';
  return typeof indicator.value === 'number' && Number.isFinite(indicator.value)
    && (id === 'vc_ai_share' ? indicator.value === Math.round(checked.value * 10) / 10 : indicator.value === checked.value);
}

/**
 * No I/O or mutation. as_of is an observation date; as_of_date/reportDate is
 * review metadata only. The three repaired slots require allowlisted typed
 * evidence, not prose parsing, a claimed `current` flag, or an upstream color.
 * Other slots retain their existing semantics but never receive report dates
 * as observations. An explicit reviewed config migration repairs old bad dates.
 */
export function syncUpstreamObservation({ id, entry, upstreamIndicator: up, reportDate, today }) {
  const reject = reason => ({ accepted: false, changed: false, reason, entry: structuredClone(entry) });
  try {
    if (!entry || !up || up.id !== id) return reject('indicator_mismatch');
    date(today, 'today');
    date(reportDate, 'report_date');
    date(up.as_of, 'observation_date');
    date(entry.asOfDate, 'existing_observation_date');
    if (reportDate > today) return reject('report_date_future');
    if (up.as_of > today || up.as_of > reportDate) return reject('observation_date_future');
    if (entry.asOfDate > today) return reject('existing_observation_date_future');
    if (up.as_of < entry.asOfDate) return reject('observation_date_regression');
    for (const priorReview of [entry.reviewAsOfDate, entry.reportAsOfDate].filter(value => value !== undefined)) {
      date(priorReview, 'existing_review_date');
      if (priorReview > today || priorReview < entry.asOfDate) return reject('existing_review_date_inconsistent');
      if (reportDate < priorReview) return reject('report_date_regression');
    }
    let next = { ...structuredClone(entry), asOfDate: up.as_of };
    if (Object.hasOwn(TYPED_BASES, id)) {
      if (up.basis !== TYPED_BASES[id]) return reject('observation_basis_not_allowlisted');
      // Upstream JSON is not an approval of a new official observation. Reuse
      // only this exact reviewed record. A new quarter or publisher correction
      // requires an explicit reviewed config update; live collectors are separate.
      if (up.as_of !== entry.asOfDate) return reject('reviewed_observation_update_required');
      if (up.sourceObservation && JSON.stringify(up.sourceObservation) !== JSON.stringify(entry.sourceObservation)) {
        return reject('reviewed_observation_replacement_forbidden');
      }
      const checked = inspectTyped(id, next, today);
      if (up.source_url !== checked.evidence.sourceUrl) return reject('upstream_source_mismatch');
      if (!typedValueMatches(id, up, checked)) return reject('upstream_value_mismatch');
      if (id === 'enterprise_deploy') {
        const projection = buildEnterpriseObservationProjection(next, today);
        next.status = checked.status;
        next.value_display = projection.value_display;
        next.note = projection.note;
      } else if (id === 'vc_ai_share') {
        next.status = checked.status;
        next.value_display = `${checked.value.toFixed(1)}%`;
        const e = checked.evidence;
        next.note = `Crunchbase ${e.period} 全球创投融资：AI ${e.aiFundingUsdB}B 美元 / 总额 ${e.totalFundingUsdB}B 美元，占比 ${checked.value.toFixed(1)}%。原报告发布于 ${e.publicationDate}；后续周报复核不改变该观察日期。`;
      }
      // ARR remains the reviewed historical record, not a newly admitted series.
    } else {
      if (!LIGHTS.has(up.status)) return reject('upstream_status_invalid');
      if (up.as_of > entry.asOfDate) {
        next.status = up.status;
        next.value_display = String(up.value_display ?? up.value ?? entry.value_display).slice(0, 40);
        if (typeof up.note === 'string' && up.note.length > 20) next.note = up.note.slice(0, 800);
      }
    }
    next = { ...next, reviewAsOfDate: reportDate, reportAsOfDate: reportDate, syncedFromUpstream: true };
    return { accepted: true, changed: JSON.stringify(next) !== JSON.stringify(entry),
      reason: up.as_of === entry.asOfDate ? 'same_observation_reviewed' : 'new_observation', entry: next,
      observationDate: up.as_of, reportDate, ageDays: Math.floor((date(today) - date(up.as_of)) / DAY_MS) };
  } catch (error) { return reject(error.message); }
}

/** Historical ARR anchors remain audit-only, but must still have exact identities. */
export function validateHistoricalArrObservation(entry, today) {
  try { arr(entry, today); return true; } catch { return false; }
}
