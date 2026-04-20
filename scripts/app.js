import { $, fmtSignedArrow, trendClass } from './modules/config.js';
import { buildHealthDashboardModel } from './modules/health.js';
import { fetchBaselineData, fetchHistoryData, fetchRealtimePayload, buildRuntimeState } from './modules/realtime.js';
import { createDecisionFallback, buildPositionGuidanceFallback, buildActionQueueFallback, buildTriggerMonitorFallback, buildInvalidationRulesFallback } from './modules/decision.js';
import { renderRealtimeStrip, renderHealthDashboard, buildDecisionHeaderModel, renderDecisionHeader, renderBars, renderList, renderLineChart, renderHeatmap, renderTransmission, renderExecutionLock, renderSignalEngine, renderActionLayer, renderPositioning, renderRiskControl, renderDiscipline, renderWarningSystem, renderAssetReturnMap, renderAssetTable, renderScenarioTree, renderNonCriticalSection } from './modules/render.js';

async function main() {
  const [baseline, history, realtimeResult] = await Promise.all([
    fetchBaselineData(),
    fetchHistoryData(),
    fetchRealtimePayload()
  ]);

  const runtimeState = buildRuntimeState(baseline, history, realtimeResult);
  const data = runtimeState.data;
  const realtime = runtimeState.realtimePayload;
  const metadata = runtimeState.runtimeMetadata;
  const healthDashboard = runtimeState.healthDashboard || buildHealthDashboardModel(runtimeState);
  window.__GFRR_RUNTIME__ = runtimeState;
  window.__GFRR_DECISION_MODEL__ = data.decisionModel || createDecisionFallback(data, metadata);
  window.__GFRR_STRATEGY_STATE__ = window.__GFRR_DECISION_MODEL__?.strategyState || 'Caution';
  window.__GFRR_POSITION_GUIDANCE__ = window.__GFRR_DECISION_MODEL__?.positionGuidance || buildPositionGuidanceFallback(data, metadata, window.__GFRR_STRATEGY_STATE__);
  window.__GFRR_ACTION_QUEUE__ = window.__GFRR_DECISION_MODEL__?.actionQueue || buildActionQueueFallback(data, metadata, window.__GFRR_STRATEGY_STATE__);
  window.__GFRR_TRIGGER_MONITOR__ = window.__GFRR_DECISION_MODEL__?.triggerMonitor || buildTriggerMonitorFallback(data, metadata, window.__GFRR_STRATEGY_STATE__);
  window.__GFRR_INVALIDATION_RULES__ = window.__GFRR_DECISION_MODEL__?.invalidationRules || buildInvalidationRulesFallback(data, metadata, window.__GFRR_STRATEGY_STATE__);
  window.__GFRR_DECISION_HEADER__ = buildDecisionHeaderModel(window.__GFRR_DECISION_MODEL__, data);
  console.info('GFRR decision model ready', window.__GFRR_DECISION_MODEL__);

  if (metadata.realtimeOverlayEnabled && realtime?.values) {
    renderRealtimeStrip(realtime, metadata);
    $('runtime-badge').textContent = metadata.realtimeFallbackUsed
      ? '快变量来自本地 fallback'
      : realtime.degradedMode
        ? '快变量部分降级 / 慢变量正常'
        : '快变量已实时覆盖';
  } else {
    $('runtime-badge').textContent = metadata.realtimeFetchFailed ? '当前处于基线模式 / realtime 不可用' : '当前处于基线模式';
  }
  if (!metadata.realtimeOverlayEnabled) {
    $('rt-source-mode').textContent = 'baseline only';
  }
  $('runtime-badge').textContent = metadata.realtimeStatusLabel;
  renderDecisionHeader(window.__GFRR_DECISION_HEADER__);
  renderHealthDashboard(healthDashboard);
  // Legacy display dependencies: these older overview fields remain for the
  // current page layout, but they are not part of the v26 canonical contract.
  $('overview-date').textContent = data.updatedAt.slice(0, 10);
  $('decision-line').textContent = data.decisionLine || '当前以防守型决策为主，等待更明确的宽松与增长信号。';
  $('summary-text').textContent = data.summary;
  $('global-score').textContent = data.score;
  $('macro-regime').textContent = data.currentMacroRegime;
  $('crisis-phase').textContent = data.currentCrisisPhase;
  $('confidence-level').textContent = data.confidenceLevel;
  $('trend-label').textContent = data.trendLabel;
  $('score-change-1d').textContent = fmtSignedArrow(data.scoreChange1d);
  $('score-change-7d').textContent = fmtSignedArrow(data.scoreChange7d);
  $('phase-current').textContent = data.currentCrisisPhase;
  $('phase-next').textContent = data.nextCrisisPhase;
  $('phase-transition').textContent = `${data.transitionRisk}%`;
  $('confidence-score').textContent = data.confidenceScore;
  $('confidence-level-bottom').textContent = data.confidenceLevel;
  $('degraded-mode').textContent = data.recovery.degradedMode ? '是' : '否';
  $('safe-output').textContent = data.recovery.safeOutput ? '是' : '否';
  $('last-run').textContent = data.recovery.lastRun;
  $('liquidity-score').textContent = data.liquidityIndex.score;
  $('liquidity-regime').textContent = data.liquidityIndex.regime;
  $('liquidity-change').textContent = fmtSignedArrow(data.liquidityIndex.change1d);
  $('liquidity-direction').textContent = data.liquidityIndex.directionLabel;

  $('score-change-30d').textContent = fmtSignedArrow(data.timeDimension.scoreChange30d);
  $('avg-30d').textContent = data.timeDimension.avg30d;
  $('range-30d').textContent = `${data.timeDimension.peak30d} / ${data.timeDimension.trough30d}`;
  $('draw-from-peak').textContent = fmtSignedArrow(data.timeDimension.drawFromPeak);
  $('transmission-speed').textContent = data.timeDimension.transmissionSpeed;
  $('transmission-acceleration').textContent = data.timeDimension.transmissionAcceleration;
  $('time-dominant-path').textContent = data.timeDimension.dominantPath;
  $('trend-explanation').textContent = data.timeDimension.trendExplanation;

  renderList('top-risks', data.topRisks);
  renderList('phase-signals', data.phaseSignals);
  renderList('trigger-critical', data.triggerPanel.critical);
  renderList('trigger-drivers', data.triggerPanel.drivers);
  renderList('trigger-watchlist', data.triggerPanel.watchlist);
  renderList('confidence-notes', data.confidenceNotes);
  renderList('recovery-notes', data.recovery.notes);
  renderList('liquidity-notes', data.liquidityIndex.notes);
  renderList('time-notes', data.timeDimension.notes);

  const moduleLabelMap = {
    geopolitical: '地缘政治', energy: '能源', inflation: '通胀', liquidity: '流动性', debt: '债务', banking: '银行'
  };
  renderBars('module-bars', Object.entries(data.modules).map(([key, value]) => ({
    label: moduleLabelMap[key] || key,
    value,
    delta: data.moduleTrends[key],
    mode: trendClass(data.moduleTrends[key])
  })), true);

  renderBars('regime-bars', [
    ['通缩增长', data.regimeProbabilities.disinflationaryGrowth],
    ['流动性多头', data.regimeProbabilities.liquidityBull],
    ['滞胀冲击', data.regimeProbabilities.stagflationShock],
    ['危机式流动性挤压', data.regimeProbabilities.crisisLiquiditySqueeze],
    ['货币贬值', data.regimeProbabilities.monetaryDebasement],
    ['通缩衰退', data.regimeProbabilities.deflationaryBust]
  ].map(([label, value]) => ({ label, value })));

  renderBars('liquidity-pillars', data.liquidityIndex.pillars.map((item) => ({
    label: item.label,
    value: item.value,
    delta: item.delta,
    mode: trendClass(item.delta)
  })), true);

  renderBars('path-change-bars', data.timeDimension.pathChanges.map((item) => ({
    label: item.label,
    value: item.value,
    delta: item.delta,
    mode: trendClass(item.delta)
  })), true);

  renderNonCriticalSection('trend-chart', () => {
    renderLineChart('trend-chart', history.slice(-7), { width: 760, height: 220, pad: { top: 18, right: 18, bottom: 34, left: 46 } });
  });
  renderNonCriticalSection('trend-chart-30d', () => {
    renderLineChart('trend-chart-30d', history, { width: 980, height: 260, pad: { top: 18, right: 18, bottom: 34, left: 46 } });
  });
  renderNonCriticalSection('heatmap', () => renderHeatmap(data.heatmap));
  renderNonCriticalSection('transmission', () => renderTransmission(data.transmissionChain));
  renderNonCriticalSection('execution-lock', () => renderExecutionLock(data.tradingSystem.executionLock));
  renderNonCriticalSection('signal-engine', () => renderSignalEngine(data.tradingSystem.signalEngine));
  renderNonCriticalSection('action-layer', () => renderActionLayer(data.tradingSystem.actionLayer));
  renderNonCriticalSection('positioning', () => renderPositioning(data.tradingSystem.positioning));
  renderNonCriticalSection('risk-control', () => renderRiskControl(data.tradingSystem.riskControl));
  renderNonCriticalSection('discipline', () => renderDiscipline(data.tradingSystem.discipline));
  renderNonCriticalSection('warning-system', () => renderWarningSystem(data.warningSystem));
  renderNonCriticalSection('asset-return-map', () => renderAssetReturnMap(data.assetReturnMap));
  renderNonCriticalSection('asset-table', () => renderAssetTable(data.assetMatrix));
  renderNonCriticalSection('scenario-tree', () => renderScenarioTree(data.scenarioTree));
}

main().catch((error) => {
  console.error(error);
  $('runtime-badge').textContent = '加载失败';
  renderDecisionHeader(buildDecisionHeaderModel({}, {}));
  $('summary-text').textContent = `风险数据加载失败：${error.message}`;
});
