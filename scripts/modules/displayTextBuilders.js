import { fmtNumSafe } from './config.js?v=bofa-report-review-1';

const SOURCE_MODE_CN = {
  'live': '实时',
  'live-with-fallback': '实时带回退',
  'cache-only': '缓存模式',
  'mock': '模拟'
};

function containsComparisonSymbol(text) {
  return typeof text === 'string' && /[<>≤≥≠=]/.test(text);
}

function hasAnyFiniteField(inputs, keys) {
  return keys.some((key) => Number.isFinite(inputs?.[key]));
}

export function buildTopRisksDisplay(inputs) {
  if (!hasAnyFiniteField(inputs, ['brent', 'dxy', 'hyOas', 'us10y', 'real10y'])) {
    return ['实时快变量暂不可用。'];
  }
  return [
    `布伦特 ${fmtNumSafe(inputs.brent, 1)} 美元，能源链条仍在传导。`,
    `广义美元指数 ${fmtNumSafe(inputs.dxy, 2)}，融资环境仍在持续观察。`,
    `HY OAS（高收益债相对无风险利率信用利差）${fmtNumSafe(inputs.hyOas, 2)}%，信用风险需持续观察。`,
    `10年期美债 ${fmtNumSafe(inputs.us10y, 2)}%，实际利率 ${fmtNumSafe(inputs.real10y, 2)}%。`
  ];
}

export function buildPhaseSignalsDisplay(inputs, realtimePayload) {
  if (!hasAnyFiniteField(inputs, ['brent', 'vix', 'hyOas', 'us10y', 'real10y', 'breakeven10y'])) {
    return ['实时快变量暂不可用。'];
  }
  const sourceModeLabel = SOURCE_MODE_CN[realtimePayload?.sourceMode] || realtimePayload?.sourceMode || '--';
  const healthScore = Number.isFinite(realtimePayload?.healthScore) ? realtimePayload.healthScore : '--';
  return [
    `实时输入：布伦特 ${fmtNumSafe(inputs.brent, 1)} / VIX（标普500期权隐含波动率）${fmtNumSafe(inputs.vix, 2)} / HY OAS（高收益债相对无风险利率信用利差）${fmtNumSafe(inputs.hyOas, 2)}%。`,
    `利率输入：10年期 ${fmtNumSafe(inputs.us10y, 2)} / 实际利率 ${fmtNumSafe(inputs.real10y, 2)} / 盈亏平衡通胀 ${fmtNumSafe(inputs.breakeven10y, 2)}%。`,
    `快变量状态：${sourceModeLabel}，健康度 ${healthScore}。`
  ];
}

export function buildSummaryDisplay(inputs) {
  if (!hasAnyFiniteField(inputs, ['brent', 'dxy', 'vix', 'hyOas'])) {
    return 'v28.0C 正根据 Worker-first 混合实时架构输出交易引擎结论。实时快变量暂不可用。';
  }
  return `v28.0C 正根据 Worker-first 混合实时架构输出交易引擎结论。最新快变量：布伦特 ${fmtNumSafe(inputs.brent, 1)}、广义美元指数 ${fmtNumSafe(inputs.dxy, 2)}、VIX（标普500期权隐含波动率）${fmtNumSafe(inputs.vix, 2)}、HY OAS（高收益债相对无风险利率信用利差）${fmtNumSafe(inputs.hyOas, 2)}%。`;
}

export function buildDecisionLineDisplay(realtimePayload, lock, gating) {
  const sourceModeLabel = SOURCE_MODE_CN[realtimePayload?.sourceMode] || realtimePayload?.sourceMode || '--';
  const lockLabel = lock?.levelLabel || '--';
  const sigClause = gating?.activeLabels?.length
    ? `已激活结构信号：${gating.activeLabels.join('、')}。`
    : (gating?.allMissing ? '结构信号数据源暂不可用。' : '');
  return `当前已进入 v28.0C 交易引擎模式：实时快变量${sourceModeLabel}，执行状态灯为${lockLabel}。${sigClause}先看状态灯，再决定能不能动。`;
}

export function buildTriggerPanelDisplay(inputs, base) {
  const prev = base?.triggerPanel || {};
  const watchlist = Array.isArray(prev.watchlist) ? [...prev.watchlist] : [];
  return {
    critical: [
      `布伦特 ${fmtNumSafe(inputs.brent, 1)}`,
      `广义美元指数 ${fmtNumSafe(inputs.dxy, 2)}`,
      `HY OAS（高收益债相对无风险利率信用利差）${fmtNumSafe(inputs.hyOas, 2)}%`
    ],
    drivers: [
      `VIX（标普500期权隐含波动率）${fmtNumSafe(inputs.vix, 2)}`,
      `10年期美债 ${fmtNumSafe(inputs.us10y, 2)}%`,
      `实际利率 ${fmtNumSafe(inputs.real10y, 2)}%`
    ],
    watchlist
  };
}

export function buildAssetMatrixReasons(list, inputs) {
  if (!Array.isArray(list)) return list;
  const builders = {
    '黄金': () => `金价 ${fmtNumSafe(inputs.gold, 1)}，通胀对冲仍在，但真实利率仍需观察。`,
    '原油': () => `布伦特 ${fmtNumSafe(inputs.brent, 1)} 美元，仍是主导链条。`,
    '美元': () => `广义美元指数 ${fmtNumSafe(inputs.dxy, 2)}，融资偏紧阶段继续占优。`,
    '美债久期': () => `10年期 ${fmtNumSafe(inputs.us10y, 2)} / 实际利率 ${fmtNumSafe(inputs.real10y, 2)}%。`
  };
  return list.map((row) => {
    const builder = builders[row?.asset];
    if (!builder) return row;
    if (containsComparisonSymbol(row?.reason)) return row;
    return { ...row, reason: builder() };
  });
}

export function buildScenarioTreeTriggers(list, inputs) {
  if (!Array.isArray(list)) return list;
  const rebuilt = `布伦特 ${fmtNumSafe(inputs.brent, 1)} / 广义美元指数 ${fmtNumSafe(inputs.dxy, 2)} / HY OAS（高收益债相对无风险利率信用利差）${fmtNumSafe(inputs.hyOas, 2)}`;
  return list.map((entry) => {
    const triggers = entry?.triggers;
    if (typeof triggers !== 'string' || !triggers) return entry;
    if (containsComparisonSymbol(triggers)) return entry;
    return { ...entry, triggers: rebuilt };
  });
}

export function buildSignalEngineNotes(inputs, realtimePayload, lock, gating) {
  const levelLabel = lock?.levelLabel || '--';
  const healthScore = Number.isFinite(realtimePayload?.healthScore) ? realtimePayload.healthScore : '--';
  const criticalMissing = Number.isFinite(realtimePayload?.criticalMissing) ? realtimePayload.criticalMissing : 0;
  const structuralLine = gating?.activeLabels?.length
    ? `结构信号：${gating.activeLabels.join('、')}。`
    : (gating?.allMissing ? '结构信号数据源全不可用，门控已降级。' : '结构信号：无激活。');
  return [
    `执行引擎状态：${levelLabel}。`,
    `关键快变量：布伦特 ${fmtNumSafe(inputs.brent, 1)} / 广义美元指数 ${fmtNumSafe(inputs.dxy, 2)} / VIX（标普500期权隐含波动率）${fmtNumSafe(inputs.vix, 2)} / HY OAS（高收益债相对无风险利率信用利差）${fmtNumSafe(inputs.hyOas, 2)}。`,
    `健康度 ${healthScore}，关键缺失 ${criticalMissing}。`,
    structuralLine
  ];
}

export function buildLiquidityNotes(inputs, realtimePayload) {
  const sourceModeLabel = SOURCE_MODE_CN[realtimePayload?.sourceMode] || realtimePayload?.sourceMode || '--';
  const healthScore = Number.isFinite(realtimePayload?.healthScore) ? realtimePayload.healthScore : '--';
  const criticalMissing = Number.isFinite(realtimePayload?.criticalMissing) ? realtimePayload.criticalMissing : 0;
  const payloadNotes = Array.isArray(realtimePayload?.notes) ? realtimePayload.notes : [];
  return [
    `实时快变量：布伦特 ${fmtNumSafe(inputs.brent, 1)} / 广义美元指数 ${fmtNumSafe(inputs.dxy, 2)} / VIX（标普500期权隐含波动率）${fmtNumSafe(inputs.vix, 2)} / HY OAS（高收益债相对无风险利率信用利差）${fmtNumSafe(inputs.hyOas, 2)}。`,
    `10年期美债 ${fmtNumSafe(inputs.us10y, 2)} / 实际利率 ${fmtNumSafe(inputs.real10y, 2)} / 黄金 ${fmtNumSafe(inputs.gold, 1)} / 标普500 ${fmtNumSafe(inputs.spx, 0)}。`,
    `数据模式：${sourceModeLabel} / 健康分数：${healthScore} / 关键缺失：${criticalMissing}。`,
    ...payloadNotes
  ];
}

export function buildHeatmapNotes(list, inputs) {
  if (!Array.isArray(list)) return list;
  return list.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const note = typeof entry.note === 'string' ? entry.note : '';
    if (entry.key === 'us' && /实际利率/.test(note) && !containsComparisonSymbol(note)) {
      return { ...entry, note: `融资偏紧 + 实际利率 ${fmtNumSafe(inputs.real10y, 2)}%` };
    }
    return entry;
  });
}
