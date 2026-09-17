import { CHANNEL_KEYS, FEATURE_KEYS, digest, pressureFeatures, scorePressure, replayPressureInputs, validateResearchProtocol } from './pressure-model.mjs';
import { agreementMetrics, validateShadowLedger } from './pressure-evaluation.mjs';
import { deriveHistoricalRisk } from './historical-score.mjs';
import { isHistoricalDate } from './historical-validation.mjs';
import { weeklyDates, legacyAvailableSeries, implementationHash } from '../research-pressure-model.mjs';
import { decomposeScoreChange } from '../audit-pressure-vintages.mjs';

const DAY = 86400000;
const gapDays = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

export function classifyAgreement(score, benchmark, threshold) {
  if (![score, benchmark, threshold].every(Number.isFinite)) return 'unavailable';
  return score >= threshold ? (benchmark > 0 ? 'tp' : 'fp') : (benchmark > 0 ? 'fn' : 'tn');
}

// Correct weeks, missing weeks and calendar gaps all terminate an episode.
export function errorEpisodes(rows) {
  const episodes = []; let active = null, previousDate = '';
  for (const row of rows) {
    if (!isHistoricalDate(row.date) || row.date <= previousDate) throw new Error('Invalid diagnostic dates');
    previousDate = row.date;
    if (!['fp', 'fn'].includes(row.classification)) { active = null; continue; }
    if (!active || active.classification !== row.classification || gapDays(active.endDate, row.date) !== 7) {
      active = { classification: row.classification, startDate: row.date, endDate: row.date, weeks: 0, dates: [] };
      episodes.push(active);
    }
    active.endDate = row.date; active.weeks++; active.dates.push(row.date);
  }
  return episodes;
}

export function candidateAccounting(candidate) {
  if (!Number.isFinite(candidate?.score)) return null;
  const channels = Object.fromEntries(CHANNEL_KEYS.map(key => [key, {
    pressure: candidate.channels[key], weight: candidate.weights[key],
    linearContribution: candidate.channels[key] * candidate.weights[key],
    deviationFromMidpoint: (candidate.channels[key] - 50) * candidate.weights[key]
  }]));
  const linearTotal = Object.values(channels).reduce((sum, row) => sum + row.linearContribution, 0);
  if (Math.abs(linearTotal + candidate.smoothTailContribution - candidate.score) > 1e-9) throw new Error('Candidate accounting mismatch');
  return { channels, linearTotal, smoothTailContribution: candidate.smoothTailContribution,
    total: candidate.score, causalAttribution: false,
    note: 'Weighted channel accounting; the midpoint is a relative scale, not an economically safe state.' };
}

function legacyAccounting(row, rules) {
  const contributions = Object.fromEntries(Object.entries(rules.moduleWeights).filter(([key]) => key !== '_comment')
    .map(([key, weight]) => [key, { pressure: row.modules[key], weight, contribution: row.modules[key] * weight }]));
  const unroundedBase = Object.values(contributions).reduce((sum, item) => sum + item.contribution, 0);
  const tailFloorContribution = row.overlayApplied ? Math.max(0, row.overlayFloor - row.baseScore) : 0;
  if (!Number.isFinite(unroundedBase) || Math.min(100, Math.max(0, Math.round(unroundedBase))) !== row.baseScore
    || row.baseScore + tailFloorContribution !== row.score) throw new Error('Legacy historical accounting mismatch');
  return { modules: contributions, unroundedBase, roundedBase: row.baseScore,
    roundingAdjustment: row.baseScore - unroundedBase, tailFloorContribution,
    total: row.score, overlayReasons: row.overlayReasons, components: row.components,
    proxies: row.historicalProxyInputs, defaults: row.defaultedHistoricalInputs,
    unavailable: row.unavailableHistoricalInputs,
    // Publish provenance and derived accounting, not raw historical price/rate series.
    inputDiagnostics: Object.fromEntries(Object.entries(row.inputDiagnostics).map(([key, item]) => [key,
      Object.fromEntries(['observationDate', 'ageDays', 'maxAgeDays', 'status', 'valueOrigin', 'effectiveSourceKey',
        'effectiveObservationDate', 'unit', 'changeWindow', 'previousObservationDate', 'previousObservationStatus', 'limitation']
        .filter(field => Object.hasOwn(item, field)).map(field => [field, item[field]]))])),
    causalAttribution: false, actualProductionSnapshot: false };
}

function validateCache(cache) {
  if (cache?.schemaVersion !== 'pressure-source-cache-v1' || !Number.isFinite(Date.parse(cache.retrievedAt))) throw new Error('Invalid historical cache');
  for (const rows of Object.values(cache.series || {})) {
    let prior = '';
    for (const row of rows) {
      if (!isHistoricalDate(row.date) || row.date <= prior || !Number.isFinite(row.value)
        || row.date > cache.retrievedAt.slice(0, 10)) throw new Error('Invalid historical observation');
      prior = row.date;
    }
  }
}

export function historicalErrorDiagnostics(cache, report, protocol, rules) {
  validateResearchProtocol(protocol); validateCache(cache);
  if (report?.schemaVersion !== 'pressure-model-research-report-v1' || report.protocolHash !== digest(protocol)
    || report.implementationHash !== implementationHash() || report.sourceRetrievedAt !== cache.retrievedAt
    || !isHistoricalDate(report.current?.date)) throw new Error('Historical report/cache identity mismatch');
  const dates = weeklyDates(protocol.evaluation.startDate, report.current.date);
  const features = dates.map(date => pressureFeatures(cache.series, date, protocol));
  const histories = Object.fromEntries(protocol.variants.map(variant => [variant.id,
    features.map(row => scorePressure(row, features, protocol, variant))]));
  for (const variant of protocol.variants) {
    const expected = report.weeklyScores?.[variant.id];
    const replay = histories[variant.id].filter(row => row.date <= protocol.evaluation.historicalCutoff);
    if (!expected || expected.length !== replay.length || replay.some((row, i) => row.date !== expected[i].date
      || row.status !== expected[i].status || (row.score === null ? expected[i].score !== null
        : !Number.isFinite(expected[i].score) || Math.abs(row.score - expected[i].score) > 1e-9))) throw new Error('Historical candidate replay mismatch');
  }
  const evidence = {}, paired = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (date > protocol.evaluation.historicalCutoff || protocol.variants.some(v => !Number.isFinite(histories[v.id][i].score))) continue;
    // Match the frozen report's intersection, including the diagnostic unlagged baseline.
    const legacy = deriveHistoricalRisk(date, legacyAvailableSeries(cache.series, date, protocol), rules);
    if (!legacy || !deriveHistoricalRisk(date, cache.series, rules)) continue;
    const scores = { legacy_assumed_lags: legacy.score };
    evidence[date] = { observationDates: Object.fromEntries(Object.entries(features[i].evidence).map(([key, row]) => [key, row?.observationDate ?? null])),
      candidates: {}, legacy: legacyAccounting(legacy, rules) };
    for (const variant of protocol.variants) {
      const candidate = histories[variant.id][i]; scores[variant.id] = candidate.score;
      evidence[date].candidates[variant.id] = candidateAccounting(candidate);
    }
    paired.push({ date, scores, legacyCreditOrigin: legacy.inputDiagnostics.hyOas.valueOrigin });
  }
  const comparisons = {};
  for (const id of ['legacy_assumed_lags', ...protocol.variants.map(v => v.id)]) {
    comparisons[id] = {};
    for (const key of Object.keys(protocol.benchmarks)) {
      const benchmark = new Map((cache.series[key] || []).map(row => [row.date, row.value]));
      const rows = paired.map(row => ({ date: row.date, score: row.scores[id], benchmark: benchmark.get(row.date) ?? null,
        legacyCreditOrigin: row.legacyCreditOrigin,
        classification: classifyAgreement(row.scores[id], benchmark.get(row.date), protocol.evaluation.alertThreshold) }));
      const metrics = agreementMetrics(rows, protocol.evaluation);
      const original = report.comparison?.[id];
      const expected = original?.benchmarks?.[key]?.overall;
      if (original?.coverage !== paired.length || !expected || Object.entries(metrics).some(([metric, value]) =>
        !Object.hasOwn(expected, metric) || digest(expected[metric]) !== digest(value))) throw new Error('Historical comparison reconciliation failed');
      const errors = rows.filter(row => ['fp', 'fn'].includes(row.classification));
      comparisons[id][key] = { metrics, unavailableBenchmarkWeeks: rows.length - metrics.n,
        errors, episodes: errorEpisodes(rows),
        byLegacyCreditOrigin: Object.fromEntries(['historical', 'proxy'].map(origin => [origin,
          agreementMetrics(rows.filter(row => row.legacyCreditOrigin === origin), protocol.evaluation)])),
        byYear: Object.fromEntries([...new Set(rows.map(row => row.date.slice(0, 4)))].map(year => [year,
          agreementMetrics(rows.filter(row => row.date.startsWith(year)), protocol.evaluation)])) };
    }
  }
  const errorDates = new Set(Object.values(comparisons).flatMap(b => Object.values(b).flatMap(c => c.errors.map(row => row.date))));
  return { sourceRetrievedAt: cache.retrievedAt, sourceCacheHash: digest(cache), historicalCutoff: protocol.evaluation.historicalCutoff,
    matchedWeeks: paired.length, comparisons,
    legacyCreditCoverage: { historical: paired.filter(row => row.legacyCreditOrigin === 'historical').length,
      proxy: paired.filter(row => row.legacyCreditOrigin === 'proxy').length,
      note: 'BAA10Y substitution is not actual HY OAS. Historical HY coverage alone does not establish complete production-input parity.' },
    evidenceByDate: Object.fromEntries(Object.entries(evidence).filter(([date]) => errorDates.has(date))),
    interpretation: 'All disagreements against contemporaneous US reference indices; not independent crisis truth, forecasts or point-in-time validation.' };
}

export function ledgerChangeDiagnostics(ledger, protocol, now = new Date().toISOString()) {
  if (!ledger) throw new Error('Missing shadow ledger');
  validateShadowLedger(ledger, protocol, implementationHash(), now);
  const observations = ledger.records.map(row => ({ date: row.date, recordedAt: row.recordedAt,
    inputHash: row.inputHash, recordHash: row.recordHash,
    sources: Object.fromEntries(Object.entries(row.scoreInputs.evidence).map(([key, item]) => [key, {
      observationDate: item.observationDate, ageDays: gapDays(item.observationDate, row.date),
      maxAgeDays: protocol.sources[key].maxAgeDays, assumedReleaseLagDays: item.assumedReleaseLagDays }])),
    unavailableVariants: protocol.variants.filter(v => !Number.isFinite(row.variantScores[v.id])).map(v => v.id) }));
  const transitions = [];
  for (let i = 1; i < ledger.records.length; i++) {
    const previous = ledger.records[i - 1], current = ledger.records[i];
    const days = gapDays(previous.date, current.date);
    const changedObservations = Object.keys(protocol.sources).filter(key => digest(previous.scoreInputs.evidence[key]) !== digest(current.scoreInputs.evidence[key]));
    const changedReferences = Object.keys(current.scoreInputs.references).filter(key => digest(previous.scoreInputs.references[key]) !== digest(current.scoreInputs.references[key]));
    const unchangedCurrentValues = Object.keys(protocol.sources).every(key => previous.scoreInputs.evidence[key].value === current.scoreInputs.evidence[key].value);
    const variants = protocol.variants.map(variant => {
      if (![previous.variantScores[variant.id], current.variantScores[variant.id]].every(Number.isFinite)) {
        return { variant: variant.id, status: 'unavailable', reason: 'missing_adjacent_variant_score', totalChange: null };
      }
      const result = decomposeScoreChange(previous, current, variant);
      const reverseIntermediate = replayPressureInputs(previous.scoreInputs.features, current.scoreInputs.parameters[variant.id], variant);
      const reverseCalibrationStep = reverseIntermediate - previous.variantScores[variant.id];
      const reverseMarketStep = current.variantScores[variant.id] - reverseIntermediate;
      return { ...result, status: 'evaluated', reverseCalibrationStep, reverseMarketStep,
        orderSensitivity: result.marketInputStep - reverseMarketStep,
        arithmeticResidual: result.totalChange - result.marketInputStep - result.recalibrationStep,
        calibrationOnlyDecline: result.totalChange < -1e-9 && Math.abs(result.marketInputStep) < 1e-9,
        changedFeatures: FEATURE_KEYS.filter(key => previous.scoreInputs.features[key] !== current.scoreInputs.features[key]) };
    });
    transitions.push({ fromDate: previous.date, toDate: current.date, calendarGapDays: days,
      consecutiveCalendarDays: days === 1, changedObservations, changedReferences, unchangedCurrentValues, variants });
  }
  return { createdAt: ledger.createdAt, records: ledger.records.length, inputLedgerHash: digest(ledger),
    protocolHash: ledger.protocolHash, implementationHash: ledger.implementationHash,
    status: transitions.length ? 'observed_transitions' : 'awaiting_second_distinct_date',
    observations, transitions, productionReplacementEnabled: false, causalAttribution: false,
    note: 'Accounting in both substitution orders; the market-feature step can include revisions, reference-window rolls and source changes, not just current prices. Calendar gaps are not one-day moves. No cross-cohort splicing.' };
}

export function diagnosticsMarkdown(result) {
  const lines = ['# 压力模型证据诊断', '', `历史源快照：${result.history.sourceRetrievedAt}`, '',
    '以下是相对参考指标的同期偏离，不是危机预测或独立真值验证。报警阈值及候选保持冻结。', '',
    '| 模型 | 参考指标 | 匹配周 | 漏报周 | 误报周 | 连续偏离段 |', '|---|---|---:|---:|---:|---:|'];
  for (const [id, benchmarks] of Object.entries(result.history.comparisons)) for (const [key, row] of Object.entries(benchmarks)) {
    lines.push(`| ${id} | ${key} | ${row.metrics.n} | ${row.metrics.confusion.fn} | ${row.metrics.confusion.fp} | ${row.episodes.length} |`);
  }
  lines.push('', '## 真实记录变化', '', `批次包含 ${result.shadow.records} 条真实记录、${result.shadow.transitions.length} 个相邻记录区间。`);
  if (!result.shadow.transitions.length) lines.push('等待第二个不同日期；未生成虚构变化或拼接旧批次。');
  for (const transition of result.shadow.transitions) {
    lines.push('', `### ${transition.fromDate} → ${transition.toDate}（间隔 ${transition.calendarGapDays} 日）`, '',
      '| 候选 | 总变化 | 先换输入 | 再换校准 | 反向顺序的输入步 |', '|---|---:|---:|---:|---:|');
    for (const row of transition.variants) lines.push(row.status === 'evaluated'
      ? `| ${row.variant} | ${row.totalChange.toFixed(4)} | ${row.marketInputStep.toFixed(4)} | ${row.recalibrationStep.toFixed(4)} | ${row.reverseMarketStep.toFixed(4)} |`
      : `| ${row.variant} | 缺失 | — | — | — |`);
  }
  lines.push('', '完整 JSON 保留全部偏离周、连续时段、模块/通道记账及观测日期。分解依赖替换顺序，不代表经济因果贡献。', '');
  return lines.join('\n');
}
