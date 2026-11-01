import { OFR_READOUT_CONTRACT, OFR_SOURCE_URL, strictOfrDate, validateOfrRows } from './ofr-pressure-readout.mjs';

// A pure publication contract, not a writer or an activation switch.
export const OFR_PUBLICATION_CONTRACT = 'ofr-primary-pressure-observation-v1';
export const ADVICE_RETIREMENT_CONTRACT = 'legacy-score-advice-retirement-v1';
export const ADVICE_RETIREMENT_NOTICE = '旧模型的状态、仓位与动作建议已退役；平台提供压力观测与独立警报，不生成仓位指令。';
const DAY = 86400000;
const STATUS = new Set(['available', 'cached', 'stale', 'missing_current', 'unavailable']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireThat(condition, message) { if (!condition) throw new Error(`OFR publication contract: ${message}`); }
function isoTime(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value) && strictOfrDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)); }
const age = (now, date) => (Date.parse(`${now.slice(0, 10)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY;

function checkPreparedReadout(readout, now) {
  requireThat(plain(readout) && readout.contractVersion === OFR_READOUT_CONTRACT && readout.lifecycle === 'prepared_not_activated' && readout.productionEligible === false, 'prepared readout identity');
  requireThat(plain(readout.source) && readout.source.provider === 'Office of Financial Research' && readout.source.sourceUrl === OFR_SOURCE_URL, 'official provider identity');
  requireThat(/^[a-f0-9]{64}$/.test(readout.source.snapshotSha256 ?? ''), 'snapshot hash');
  requireThat(isoTime(readout.source.retrievedAt) && Date.parse(readout.source.retrievedAt) <= Date.parse(now), 'receipt time');
  requireThat(strictOfrDate(readout.index?.observedDate) && readout.source.observedDate === readout.index.observedDate && readout.index.observedDate <= readout.source.retrievedAt.slice(0, 10), 'observation time');
  requireThat(readout.index.value === null || finite(readout.index.value), 'raw index');
  requireThat(['available', 'stale', 'missing_current'].includes(readout.status), 'source readout status');
  requireThat((readout.status === 'missing_current') === (readout.index.value === null), 'missing source value');
  requireThat(plain(readout.boundaries) && readout.boundaries.calibratedProbability === false && readout.boundaries.oldThresholdsApplied === false && readout.boundaries.tailFloorAdded === false && readout.boundaries.worldOrderAdded === false && readout.boundaries.decisionMapping === null && readout.boundaries.positionMapping === null, 'readout boundaries');
}

export function buildPublishedOfrComponent({ readout = null, rows = [], previous = null, now, retrievalError = null } = {}) {
  requireThat(isoTime(now), 'publication time');
  let selected = null, status = 'unavailable';
  if (readout) {
    checkPreparedReadout(readout, now);
    validateOfrRows(rows);
    requireThat(rows.at(-1).date === readout.index.observedDate && rows.at(-1).value === readout.index.value, 'receipt/history latest identity');
    selected = structuredClone(readout);
    const last = rows.findLast(row => finite(row.value));
    const lastKnown = last ? { value: last.value, observedDate: last.date } : null;
    requireThat(canonical(readout.lastKnown) === canonical(lastKnown), 'last known receipt/history identity');
    selected.lastKnown = lastKnown;
    status = readout.index.value === null ? 'missing_current' : age(now, readout.index.observedDate) > 7 ? 'stale' : 'available';
  } else if (previous) {
    validatePublishedOfrComponent(previous);
    requireThat(previous.source.retrievedAt === null || Date.parse(previous.source.retrievedAt) <= Date.parse(now), 'cached receipt from future');
    selected = { source: structuredClone(previous.source), index: structuredClone(previous.index), weeklyChange: structuredClone(previous.weeklyChange), percentile: structuredClone(previous.percentile), lastKnown: structuredClone(previous.lastKnown) };
    status = selected.index.observedDate === null ? 'unavailable' : age(now, selected.index.observedDate) > 7 ? 'stale' : selected.index.value === null ? 'missing_current' : 'cached';
  }
  const index = selected?.index ? { value: selected.index.value, observedDate: selected.index.observedDate, ageDays: selected.index.observedDate === null ? null : age(now, selected.index.observedDate), freshnessMaxCalendarDays: 7 } : { value: null, observedDate: null, ageDays: null, freshnessMaxCalendarDays: 7 };
  const history = readout ? rows.filter(r => strictOfrDate(r?.date) && finite(r.value) && r.date <= index.observedDate && age(now, r.date) <= 63).map(r => ({ date: r.date, value: r.value })) : structuredClone(previous?.history ?? []);
  const output = {
    contractVersion: OFR_PUBLICATION_CONTRACT, modelId: 'ofr_fsi_published_index', asOf: now, status, currentEligible: status === 'available',
    source: selected ? { provider: 'Office of Financial Research', sourceUrl: OFR_SOURCE_URL, observedDate: index.observedDate, retrievedAt: selected.source.retrievedAt, snapshotSha256: selected.source.snapshotSha256, firstReleaseHistory: false, publicationLagNote: '数据约为两个营业日前，实际观察日单列。' } : { provider: 'Office of Financial Research', sourceUrl: OFR_SOURCE_URL, observedDate: null, retrievedAt: null, snapshotSha256: null, firstReleaseHistory: false, publicationLagNote: '数据约为两个营业日前，实际观察日单列。' },
    retrieval: { attemptedAt: now, status: readout ? 'received' : 'failed', fallbackUsed: !readout && Boolean(previous?.index?.observedDate), error: retrievalError === null ? null : String(retrievalError).slice(0, 160) }, index,
    lastKnown: selected?.lastKnown ?? (finite(index.value) ? { value: index.value, observedDate: index.observedDate } : null),
    weeklyChange: selected?.weeklyChange ?? { value: null, fromDate: null, toDate: null, targetDate: null },
    percentile: selected?.percentile ?? { value: null, method: 'strict_prior_midrank', years: 10, historyRows: 0, startDate: null, endDateExclusive: null, reasons: ['source_unavailable'], meaning: 'historical_relative_position_not_crisis_probability' },
    history, contributionsPublished: false,
    boundaries: { calibratedProbability: false, crisisStateAssigned: false, oldThresholdsApplied: false, tailFloorAdded: false, worldOrderAdded: false, decisionMapping: null, positionMapping: null, notInvestmentAdvice: true }
  };
  validatePublishedOfrComponent(output); return output;
}

export function validatePublishedOfrComponent(component) {
  requireThat(plain(component) && component.contractVersion === OFR_PUBLICATION_CONTRACT && component.modelId === 'ofr_fsi_published_index', 'component identity');
  requireThat(isoTime(component.asOf) && STATUS.has(component.status), 'component clock/status');
  requireThat(component.currentEligible === (component.status === 'available'), 'current eligibility');
  requireThat(plain(component.source) && component.source.provider === 'Office of Financial Research' && component.source.sourceUrl === OFR_SOURCE_URL && component.source.firstReleaseHistory === false, 'component source');
  const x = component.index;
  requireThat(plain(x) && x.freshnessMaxCalendarDays === 7 && (x.value === null || finite(x.value)), 'component raw index');
  if (component.status === 'unavailable') requireThat(x.value === null && x.observedDate === null && x.ageDays === null && component.source.retrievedAt === null && component.source.snapshotSha256 === null, 'unavailable clock/value');
  else {
    requireThat(strictOfrDate(x.observedDate) && x.observedDate === component.source.observedDate && isoTime(component.source.retrievedAt) && Date.parse(component.source.retrievedAt) <= Date.parse(component.asOf) && x.observedDate <= component.source.retrievedAt.slice(0, 10), 'component observation/receipt');
    requireThat(/^[a-f0-9]{64}$/.test(component.source.snapshotSha256 ?? '') && x.ageDays === age(component.asOf, x.observedDate) && x.ageDays >= 0, 'component source age/hash');
    if (component.status === 'available' || component.status === 'cached') requireThat(finite(x.value) && x.ageDays <= 7, 'available/cached index');
    if (component.status === 'stale') requireThat(x.ageDays > 7, 'stale index');
    if (component.status === 'missing_current') requireThat(x.value === null, 'missing current index');
  }
  requireThat(plain(component.retrieval) && isoTime(component.retrieval.attemptedAt) && component.retrieval.attemptedAt === component.asOf && ['received', 'failed'].includes(component.retrieval.status), 'retrieval audit');
  const last = component.lastKnown;
  requireThat(last === null || (plain(last) && finite(last.value) && strictOfrDate(last.observedDate) && strictOfrDate(x.observedDate) && last.observedDate <= x.observedDate && last.observedDate <= component.source.retrievedAt?.slice(0, 10)), 'last known date/value');
  if (finite(x.value)) requireThat(last?.value === x.value && last?.observedDate === x.observedDate, 'last known/current identity');
  else if (last !== null) requireThat(last.observedDate < x.observedDate, 'last known precedes missing observation');
  requireThat(typeof component.retrieval.fallbackUsed === 'boolean', 'fallback audit');
  if (component.status === 'available') requireThat(component.retrieval.status === 'received' && component.retrieval.fallbackUsed === false, 'available requires current receipt');
  if (component.status === 'cached') requireThat(component.retrieval.status === 'failed' && component.retrieval.fallbackUsed === true, 'cached requires failed receipt');
  requireThat(plain(component.percentile) && component.percentile.method === 'strict_prior_midrank' && component.percentile.years === 10 && (component.percentile.value === null || (finite(component.percentile.value) && component.percentile.value >= 0 && component.percentile.value <= 100)), 'percentile scope/range');
  if (component.percentile.value !== null) {
    const p = component.percentile;
    requireThat(p.endDateExclusive === x.observedDate && Number.isInteger(p.historyRows) && p.historyRows >= 2000 && strictOfrDate(p.startDate) && p.startDate < x.observedDate && Array.isArray(p.reasons) && p.reasons.length === 0, 'percentile history qualification');
    requireThat(Number.isInteger(p.lower) && Number.isInteger(p.equal) && p.lower >= 0 && p.equal >= 0 && p.lower + p.equal <= p.historyRows && Math.abs(p.value - 100 * (p.lower + 0.5 * p.equal) / p.historyRows) < 1e-9, 'percentile rank identity');
    requireThat(strictOfrDate(p.firstObservation) && strictOfrDate(p.lastObservation) && p.firstObservation >= p.startDate && age(p.firstObservation + 'T00:00:00Z', p.startDate) <= 7 && p.lastObservation < x.observedDate && finite(p.maxGapDays) && p.maxGapDays <= 14, 'percentile coverage');
  }
  requireThat(plain(component.weeklyChange) && (component.weeklyChange.value === null || finite(component.weeklyChange.value)), 'weekly change');
  if (component.weeklyChange.value !== null) requireThat(strictOfrDate(component.weeklyChange.fromDate) && component.weeklyChange.toDate === x.observedDate && component.weeklyChange.fromDate < x.observedDate && age(x.observedDate + 'T00:00:00Z', component.weeklyChange.fromDate) >= 7 && age(x.observedDate + 'T00:00:00Z', component.weeklyChange.fromDate) <= 11, 'weekly endpoints');
  requireThat(Array.isArray(component.history) && component.history.length <= 64, 'compact observed history');
  let prior = '';
  for (const row of component.history) { requireThat(strictOfrDate(row?.date) && row.date > prior && row.date <= x.observedDate && finite(row.value), 'history observation'); prior = row.date; }
  if (last !== null) {
    const match = component.history.find(row => row.date === last.observedDate);
    if (match) requireThat(match.value === last.value, 'last known/history identity');
  }
  requireThat(component.contributionsPublished === false && !Object.hasOwn(component, 'contributions'), 'unreviewed contribution revision scope');
  const b = component.boundaries;
  requireThat(plain(b) && b.calibratedProbability === false && b.crisisStateAssigned === false && b.oldThresholdsApplied === false && b.tailFloorAdded === false && b.worldOrderAdded === false && b.decisionMapping === null && b.positionMapping === null && b.notInvestmentAdvice === true, 'publication boundaries');
  return true;
}

function retiredObject() { return { status: 'retired', notice: ADVICE_RETIREMENT_NOTICE }; }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function retiredDecision() {
  return { contractVersion: 'v27.0', strategyState: 'ObservationOnly', stateLabel: '压力观测', stateReason: ADVICE_RETIREMENT_NOTICE, positionGuidance: retiredObject(), actionQueue: { ...retiredObject(), priorityActions: [], blockedActions: [], watchItems: [] }, triggerMonitor: { ...retiredObject(), upgradeTriggers: [], activeEscalationSignals: [] }, invalidationRules: { ...retiredObject(), resetConditions: [] } };
}
function retiredTrading() {
  return { executionLock: { tag: '建议已退役', level: 'not_provided', levelLabel: '不提供仓位指令', title: '压力观测与独立警报', description: ADVICE_RETIREMENT_NOTICE, allow: [], block: [], mandatory: [], structurallyTriggered: false }, positioning: retiredObject(), actionLayer: { ...retiredObject(), checkpoints: [], controlActions: [] }, riskControl: { ...retiredObject(), hardThresholds: [], resetThresholds: [] }, discipline: { ...retiredObject(), entryConditions: [], prohibitedBehaviors: [], mandatoryRules: [] }, signalEngine: { ...retiredObject(), signals: [], notes: [] } };
}
export function retireLegacyAdvice(data, mainPressureReadout, { retiredAt = mainPressureReadout?.asOf } = {}) {
  validatePublishedOfrComponent(mainPressureReadout);
  requireThat(plain(data) && finite(data.score) && data.score >= 0 && data.score <= 100, 'legacy audit score');
  requireThat(isoTime(retiredAt) && Date.parse(retiredAt) <= Date.parse(mainPressureReadout.asOf), 'retirement clock');
  const output = structuredClone(data);
  output.mainPressureReadout = structuredClone(mainPressureReadout);
  output.scoreRole = 'legacy_model_audit_only';
  output.legacyModelAudit = { model: 'legacy_six_module_tail_floor', score: data.score, baseScore: data.tailRiskOverlay?.baseScore ?? null, sourceDataUpdatedAt: data.updatedAt, historyReference: 'radar-history.json and git-published snapshots', currentAdviceGenerated: false };
  output.advicePolicy = { contractVersion: ADVICE_RETIREMENT_CONTRACT, mode: 'retired', retiredAt, notice: ADVICE_RETIREMENT_NOTICE, historyPreserved: true, sourceSafetyGatesPreserved: true, ofrToPositionMapping: null };
  output.independentWarnings = { structuralSignals: structuredClone(data.independentWarnings?.structuralSignals ?? data.decisionModel?.structuralSignals ?? []), scope: 'input_conditions_not_position_instructions' };
  // The old warningSystem mixed collection diagnostics with allocation commands.
  // Keep collection counters and raw structural observations, not those commands.
  output.warningSystem = { status: '数据与独立警报', ...(finite(data.warningSystem?.criticalCount) ? { criticalCount: data.warningSystem.criticalCount } : {}), ...(finite(data.warningSystem?.warningCount) ? { warningCount: data.warningSystem.warningCount } : {}), watchCount: output.independentWarnings.structuralSignals.length, alerts: output.independentWarnings.structuralSignals.map(s => ({ title: s.label, condition: s.detail, driver: '独立结构观察' })), rules: [] };
  output.decisionModel = retiredDecision(); output.tradingSystem = retiredTrading();
  for (const key of ['positionGuidance', 'riskControl', 'rotation', 'assetRotation']) if (Object.hasOwn(output, key)) output[key] = retiredObject();
  output.assetReturnMap = { ...retiredObject(), horizon: '不提供收益或回撤预测', rows: [] };
  output.regimeProbabilities = retiredObject(); output.scenarios = []; output.scenarioTree = []; output.assetMatrix = [];
  for (const key of ['currentCrisisPhase', 'nextCrisisPhase', 'transitionRisk', 'confidenceScore', 'confidenceLevel']) delete output[key];
  output.timeDimension = { role: 'legacy_model_audit_only', historyReference: 'radar-history.json', notice: '旧分数历史单列，不与OFR序列拼接。' };
  output.currentMacroRegime = '金融压力观测';
  output.decisionLine = mainPressureReadout.currentEligible ? `OFR观察日${mainPressureReadout.index.observedDate}，金融压力原值${mainPressureReadout.index.value}。` : '官方金融压力读数待更新；当前不输出旧模型建议。';
  output.summary = output.decisionLine;
  // Retain original historical publications in Git; do not transplant old AI or
  // rule-based narratives onto the new measurement/decision contract.
  for (const key of ['dailyBrief', 'aiInterpretationLayer', 'externalAiInterpretationLayer', 'macroRiskEditorialLayer', 'macroRiskEditorialPreviousIssue']) delete output[key];
  validateOfrPublicationIfPresent(output); return output;
}

export function validateOfrPublicationIfPresent(data) {
  if (data?.mainPressureReadout === undefined && data?.advicePolicy === undefined) return false;
  validatePublishedOfrComponent(data.mainPressureReadout);
  const p = data.advicePolicy;
  requireThat(plain(p) && p.contractVersion === ADVICE_RETIREMENT_CONTRACT && p.mode === 'retired' && p.notice === ADVICE_RETIREMENT_NOTICE && p.historyPreserved === true && p.sourceSafetyGatesPreserved === true && p.ofrToPositionMapping === null && isoTime(p.retiredAt) && Date.parse(p.retiredAt) <= Date.parse(data.mainPressureReadout.asOf), 'retired advice policy');
  requireThat(data.scoreRole === 'legacy_model_audit_only' && plain(data.legacyModelAudit) && data.legacyModelAudit.score === data.score && data.legacyModelAudit.currentAdviceGenerated === false, 'legacy score identity');
  const d = data.decisionModel, t = data.tradingSystem;
  requireThat(plain(d) && d.contractVersion === 'v27.0' && d.strategyState === 'ObservationOnly' && d.stateLabel === '压力观测' && d.stateReason === ADVICE_RETIREMENT_NOTICE && !Object.hasOwn(d, 'stateScore'), 'no legacy strategy score/state');
  requireThat(canonical(d) === canonical(retiredDecision()) && canonical(t) === canonical(retiredTrading()), 'exact retired advice records');
  for (const obj of [d.positionGuidance, t?.positioning]) requireThat(canonical(obj) === canonical(retiredObject()), 'no current allocation fields');
  requireThat(plain(d.actionQueue) && d.actionQueue.status === 'retired' && d.actionQueue.priorityActions?.length === 0 && d.actionQueue.blockedActions?.length === 0 && d.actionQueue.watchItems?.length === 0, 'empty current action queue');
  requireThat(t?.executionLock?.level === 'not_provided' && t.executionLock.allow?.length === 0 && t.executionLock.block?.length === 0 && t.executionLock.mandatory?.length === 0, 'no execution advice');
  requireThat(canonical(data.assetReturnMap) === canonical({ ...retiredObject(), horizon: '不提供收益或回撤预测', rows: [] }) && canonical(data.regimeProbabilities) === canonical(retiredObject()), 'no old forecasts/probabilities');
  for (const key of ['scenarios', 'scenarioTree', 'assetMatrix']) requireThat(Array.isArray(data[key]) && data[key].length === 0, 'no scenario or asset allocation advice');
  for (const key of ['currentCrisisPhase', 'nextCrisisPhase', 'transitionRisk', 'confidenceScore', 'confidenceLevel']) requireThat(!Object.hasOwn(data, key), 'no legacy current state/confidence');
  for (const key of ['positionGuidance', 'riskControl', 'rotation', 'assetRotation']) if (Object.hasOwn(data, key)) requireThat(canonical(data[key]) === canonical(retiredObject()), 'no optional legacy allocation advice');
  requireThat(plain(data.independentWarnings) && Array.isArray(data.independentWarnings.structuralSignals) && data.independentWarnings.scope === 'input_conditions_not_position_instructions', 'independent warning observations');
  requireThat(data.warningSystem?.status === '数据与独立警报' && Array.isArray(data.warningSystem.alerts) && data.warningSystem.alerts.every(a => !Object.hasOwn(a, 'action')) && Array.isArray(data.warningSystem.rules) && data.warningSystem.rules.length === 0, 'no warning engine execution advice');
  for (const key of ['dailyBrief', 'aiInterpretationLayer', 'externalAiInterpretationLayer', 'macroRiskEditorialLayer', 'macroRiskEditorialPreviousIssue']) requireThat(!Object.hasOwn(data, key), 'old narrative not current');
  return true;
}
