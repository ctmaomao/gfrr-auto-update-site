// Browser-only display qualification. No provider, network, or score calculation.
const MAX_AGE_MS = 30 * 3600000;
const DAY = 86400000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' && value.trim().length > 0;
const finiteOrNull = value => value === null || Number.isFinite(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const pick = (object, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(object || {}, key)).map(key => [key, object[key]]));
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function clock(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value) && date(value.slice(0, 10));
}

// Must match editorial-ofr-snapshot.mjs; a parity regression protects this
// narrow browser projection from drift without importing Node's crypto tree.
export function projectOfrEditorialSnapshot(p) {
  return {
    ...pick(p, ['contractVersion', 'modelId', 'asOf', 'status', 'currentEligible', 'contributionsPublished']),
    source: pick(p.source, ['provider', 'sourceUrl', 'observedDate', 'retrievedAt', 'snapshotSha256', 'firstReleaseHistory', 'publicationLagNote']),
    retrieval: { ...pick(p.retrieval, ['attemptedAt', 'status', 'fallbackUsed']), error: p.retrieval.error === null ? null : 'source_retrieval_failed' },
    index: pick(p.index, ['value', 'observedDate', 'ageDays', 'freshnessMaxCalendarDays']),
    lastKnown: p.lastKnown === null ? null : pick(p.lastKnown, ['value', 'observedDate']),
    weeklyChange: pick(p.weeklyChange, ['value', 'fromDate', 'toDate', 'targetDate', 'meaning']),
    percentile: pick(p.percentile, ['value', 'method', 'years', 'minimumRows', 'startDate', 'endDateExclusive', 'historyRows', 'firstObservation', 'lastObservation', 'maxGapDays', 'lower', 'equal', 'reasons', 'meaning']),
    history: p.history.slice(-12).map(row => pick(row, ['date', 'value'])),
    boundaries: pick(p.boundaries, ['calibratedProbability', 'crisisStateAssigned', 'oldThresholdsApplied', 'tailFloorAdded', 'worldOrderAdded', 'decisionMapping', 'positionMapping', 'notInvestmentAdvice'])
  };
}

function pressureValid(p, now) {
  if (!record(p) || p.contractVersion !== 'ofr-primary-pressure-observation-v1' || p.modelId !== 'ofr_fsi_published_index'
      || !clock(p.asOf) || Date.parse(p.asOf) > now || !['available', 'cached', 'stale', 'missing_current', 'unavailable'].includes(p.status)
      || p.currentEligible !== (p.status === 'available') || p.contributionsPublished !== false) return false;
  const s = p.source, x = p.index, r = p.retrieval, b = p.boundaries, w = p.weeklyChange, q = p.percentile;
  if (s?.provider !== 'Office of Financial Research' || s.sourceUrl !== 'https://www.financialresearch.gov/financial-stress-index/' || s.firstReleaseHistory !== false
      || !string(s.publicationLagNote) || !record(x) || !finiteOrNull(x.value) || x.freshnessMaxCalendarDays !== 7
      || !record(r) || r.attemptedAt !== p.asOf || !['received', 'failed'].includes(r.status) || typeof r.fallbackUsed !== 'boolean'
      || (r.error !== null && r.error !== 'source_retrieval_failed') || !record(b) || b.notInvestmentAdvice !== true
      || ['calibratedProbability', 'crisisStateAssigned', 'oldThresholdsApplied', 'tailFloorAdded', 'worldOrderAdded'].some(key => b[key] !== false)
      || b.decisionMapping !== null || b.positionMapping !== null) return false;
  if (p.status === 'unavailable') {
    if ([x.value, x.observedDate, x.ageDays, s.observedDate, s.retrievedAt, s.snapshotSha256, p.lastKnown].some(v => v !== null) || r.status !== 'failed' || r.fallbackUsed) return false;
  } else {
    if (!date(x.observedDate) || x.observedDate !== s.observedDate || !clock(s.retrievedAt) || Date.parse(s.retrievedAt) > Date.parse(p.asOf)
        || x.observedDate > s.retrievedAt.slice(0, 10) || !hash(s.snapshotSha256)
        || x.ageDays !== (Date.parse(p.asOf.slice(0, 10)) - Date.parse(x.observedDate)) / DAY || x.ageDays < 0) return false;
    const liveAge = (Date.parse(new Date(now).toISOString().slice(0, 10)) - Date.parse(x.observedDate)) / DAY;
    // Do not let an article silently age from a current observation into stale.
    if (p.status === 'available' && (liveAge > 7 || r.status !== 'received' || r.fallbackUsed || !Number.isFinite(x.value))) return false;
    if (p.status === 'cached' && (liveAge > 7 || x.ageDays > 7 || r.status !== 'failed' || !r.fallbackUsed || !Number.isFinite(x.value))) return false;
    if (p.status === 'stale' && x.ageDays <= 7) return false;
    if (p.status === 'missing_current' && x.value !== null) return false;
    if (Number.isFinite(x.value) && (p.lastKnown?.value !== x.value || p.lastKnown?.observedDate !== x.observedDate)) return false;
    if (p.lastKnown !== null && (!Number.isFinite(p.lastKnown?.value) || !date(p.lastKnown?.observedDate) || p.lastKnown.observedDate > x.observedDate)) return false;
  }
  if (!Array.isArray(p.history) || p.history.length > 12) return false;
  let prior = '';
  for (const row of p.history) {
    if (!date(row?.date) || row.date <= prior || row.date > x.observedDate || !Number.isFinite(row.value)) return false;
    prior = row.date;
  }
  if (!record(w) || !finiteOrNull(w.value)) return false;
  if (w.value !== null) {
    const from = p.history.find(row => row.date === w.fromDate), to = p.history.find(row => row.date === w.toDate);
    const gap = (Date.parse(w.toDate) - Date.parse(w.fromDate)) / DAY;
    if (!from || !to || w.toDate !== x.observedDate || to.value !== x.value || gap < 7 || gap > 11
        || w.targetDate !== new Date(Date.parse(w.toDate) - 7 * DAY).toISOString().slice(0, 10)
        || Math.abs(to.value - from.value - w.value) > 1e-9) return false;
  }
  if (!record(q) || !finiteOrNull(q.value) || q.method !== 'strict_prior_midrank' || q.years !== 10 || !Array.isArray(q.reasons)) return false;
  if (q.value !== null) {
    if (q.value < 0 || q.value > 100 || !Number.isInteger(q.historyRows) || q.historyRows < 2000 || q.endDateExclusive !== x.observedDate || q.reasons.length !== 0
        || !date(q.startDate) || q.startDate >= x.observedDate || !Number.isInteger(q.lower) || !Number.isInteger(q.equal) || q.lower < 0 || q.equal < 0 || q.lower + q.equal > q.historyRows
        || Math.abs(q.value - 100 * (q.lower + 0.5 * q.equal) / q.historyRows) >= 1e-9
        || !date(q.firstObservation) || !date(q.lastObservation) || q.firstObservation < q.startDate || (Date.parse(q.firstObservation) - Date.parse(q.startDate)) / DAY > 7
        || q.lastObservation >= x.observedDate || !Number.isFinite(q.maxGapDays) || q.maxGapDays > 14) return false;
  }
  return true;
}

const trueBounds = ['displayOnly', 'commentaryOnly', 'externalAiGenerated', 'usesExternalAiApi', 'notInvestmentAdvice'];
const falseBounds = ['affectsGfrrScoring', 'affectsRiskModules', 'affectsTailRiskOverlay', 'affectsDecisionModel', 'affectsExecutionLock', 'affectsPositionGuidance', 'affectsWorldOrder', 'affectsOdp', 'affectsBubbleWatch'];
function safeBounds(b) { return record(b) && trueBounds.every(k => b[k] === true) && falseBounds.every(k => b[k] === false); }
function outputValid(o, ledger) {
  if (!record(o) || o.schemaVersion !== 'macro-risk-editorial-ofr-output-v2' || o.provider !== 'deepseek' || o.mode !== 'external_ai_macro_risk_editorial'
      || !string(o.headlineZh) || !string(o.leadZh) || !safeBounds(o.boundaries)) return false;
  const fields = ['schemaVersion', 'provider', 'mode', 'model', 'generatedAt', 'sourceDataUpdatedAt', 'headlineZh', 'leadZh', 'sourceRefIds', 'auditFlags', 'pressureSynthesis', 'contextAnalysis', 'weeklyTimeline', 'keyTensions', 'crossMarketAnalysis', 'historicalComparison', 'watchNext', 'dataGaps', 'sourceAttribution', 'confidence', 'boundaries'];
  if (Object.keys(o).some(key => !fields.includes(key))) return false;
  const refs = new Set();
  const claim = (item, names) => {
    if (!record(item) || Object.keys(item).some(k => ![...names, 'sourceRefIds'].includes(k)) || names.some(k => !string(item[k]))
        || !Array.isArray(item.sourceRefIds) || item.sourceRefIds.length < 1 || item.sourceRefIds.length > 12) return false;
    for (const id of item.sourceRefIds) { if (!ledger.has(id)) return false; refs.add(id); }
    return true;
  };
  if (!Array.isArray(o.sourceRefIds) || !o.sourceRefIds.length || o.sourceRefIds.length > 12 || o.sourceRefIds.some(id => !ledger.has(id))) return false;
  o.sourceRefIds.forEach(id => refs.add(id));
  if (o.headlineZh.length > 90 || o.leadZh.length > 900 || !claim(o.pressureSynthesis, ['assessmentZh'])
      || o.pressureSynthesis.assessmentZh.length > 1000 || /[0-9０-９]|百分之[零〇一二三四五六七八九十百]|(?:原值|指数|周变化|变化幅度|历史百分位|百分位)(?:为|是|达到|升至|降至|[:：])\s*(?:负|正)?[零〇一二三四五六七八九十百千万亿两]+(?:点[零〇一二三四五六七八九]+)?(?:[，。、；\s]|$)/u.test(o.pressureSynthesis.assessmentZh)) return false;
  for (const [key, names, min, max] of [
    ['contextAnalysis', ['topic', 'labelZh', 'assessmentZh'], 0, 6],
    ['weeklyTimeline', ['date', 'titleZh', 'detailZh'], 0, 5],
    ['keyTensions', ['titleZh', 'detailZh'], 0, 4],
    ['crossMarketAnalysis', ['assetZh', 'observationZh', 'implicationZh'], 0, 5],
    ['watchNext', ['conditionZh', 'whyItMattersZh', 'invalidationZh'], 1, 5]
  ]) {
    if (o[key] === undefined && min === 0) continue;
    if (!Array.isArray(o[key]) || o[key].length < min || o[key].length > max || !o[key].every(item => claim(item, names))) return false;
  }
  if (o.historicalComparison !== null && o.historicalComparison !== undefined && !claim(o.historicalComparison, ['periodZh', 'similaritiesZh', 'differencesZh'])) return false;
  if (!Array.isArray(o.dataGaps) || !o.dataGaps.length || o.dataGaps.length > 12 || !o.dataGaps.every(string)
      || !Array.isArray(o.sourceAttribution) || !o.sourceAttribution.length) return false;
  const attributed = new Set();
  for (const item of o.sourceAttribution) {
    if (!record(item) || !ledger.has(item.sourceRefId) || attributed.has(item.sourceRefId)) return false;
    attributed.add(item.sourceRefId);
  }
  if ([...refs].some(id => !attributed.has(id))) return false;
  if (!record(o.confidence) || Object.keys(o.confidence).some(k => !['level', 'score', 'reasonZh'].includes(k))
      || !['low', 'medium', 'high'].includes(o.confidence.level) || !Number.isFinite(o.confidence.score) || o.confidence.score < 0 || o.confidence.score > 100 || !string(o.confidence.reasonZh)) return false;
  if (o.weeklyTimeline?.some(item => !date(item.date))) return false;
  const body = JSON.stringify(o);
  if (body.length > 100000 || /(?:建议|应当|可以)(?:买入|卖出|加仓|减仓|建仓|清仓|做多|做空)|(?:目标价|止损位|仓位比例|现金仓位|风险敞口建议)|(?:危机|战争|衰退|崩盘)(?:概率|几率)(?:为|是|达到)?\s*\d/u.test(body)) return false;
  if (/(?:总分|综合分|风险评分|模块分)(?:为|是|达到|升至|降至|[:：])\s*[\d零一二三四五六七八九十]|(?:仓位|配置|现金|敞口)(?:比例|建议|上限)|(?:建议|应当).{0,8}(?:买入|卖出|加仓|减仓|做多|做空)/u.test(body)) return false;
  return true;
}

export function isOfrEditorialVisible(layer, radarData, now = new Date()) {
  try {
    const ms = now.getTime();
    if (!Number.isFinite(ms) || layer?.schemaVersion !== 'macro-risk-editorial-ofr-production-v2' || layer.status !== 'valid' || layer.displayEnabled !== true
        || layer.provider !== 'deepseek' || layer.mode !== 'external_ai_macro_risk_editorial' || layer.sourceDataUpdatedAt !== radarData?.updatedAt
        || layer.validation?.status !== 'pass' || !['pass', 'warn'].includes(layer.qualityReview?.status)
        || layer.qualityReview.promotionEligible !== false || layer.provenance?.humanApproved !== false
        || !hash(layer.provenance?.inputDigest) || !hash(layer.provenance?.artifactDigest) || layer.validation.artifactDigest !== layer.provenance.artifactDigest
        || layer.provenance.generatedBy !== 'github_actions_workflow' || !/^\d+$/.test(String(layer.provenance.runId ?? '')) || !/^[a-f0-9]{40}$/.test(layer.provenance.sourceCommit ?? '')
        || layer.freshness?.maxAgeHours !== 30 || layer.freshness.isStale !== false || !safeBounds(layer.boundaries) || layer.boundaries.frontendDisplayApproved !== true) return false;
    for (const time of [layer.generatedAt, layer.output?.generatedAt, layer.sourceDataUpdatedAt]) {
      if (!clock(time) || Date.parse(time) > ms) return false;
    }
    for (const time of [layer.generatedAt, layer.output.generatedAt]) if (ms - Date.parse(time) > MAX_AGE_MS || Date.parse(time) < Date.parse(layer.sourceDataUpdatedAt)) return false;
    if (layer.output.model !== layer.model || layer.output.sourceDataUpdatedAt !== layer.sourceDataUpdatedAt
        || layer.freshness.artifactGeneratedAt !== layer.output.generatedAt || layer.freshness.sourceDataUpdatedAt !== layer.sourceDataUpdatedAt) return false;
    if (!pressureValid(layer.pressureSnapshot, ms) || canonical(layer.pressureSnapshot) !== canonical(projectOfrEditorialSnapshot(radarData.mainPressureReadout))) return false;
    if (!Array.isArray(layer.sourceLedger) || !layer.sourceLedger.length) return false;
    const ledger = new Set();
    const sourceFields = ['id', 'kind', 'sourceName', 'sourceClass', 'asOfDate', 'title', 'url', 'domain', 'publishedAt', 'topic', 'providers', 'supportingDomains', 'factIds'];
    for (const source of layer.sourceLedger) {
      if (!record(source) || !string(source.id) || ledger.has(source.id) || !['site', 'site_structured', 'news'].includes(source.kind)
          || Object.keys(source).some(k => !sourceFields.includes(k)) || (source.kind === 'news' && !/^https:\/\//.test(source.url ?? ''))) return false;
      ledger.add(source.id);
    }
    return outputValid(layer.output, ledger);
  } catch { return false; }
}
