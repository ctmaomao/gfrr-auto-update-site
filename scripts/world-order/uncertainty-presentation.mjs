import { normalizeWorldOrderStressHistorySnapshot, validateV2HistorySnapshot, WORLD_ORDER_HISTORY_V2 } from '../daily/world-order-history.mjs';

// Prepared-only view model. No production renderer imports this module.
// Callers must replace the entire previous view on incomplete/invalid input;
// they must not catch validation errors by retaining a prior green/neutral view.
export function buildWorldOrderUncertaintyPresentation(payload, { allowV2 = false, nowMs = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'contractVersion')) return null;
  if (!allowV2) throw new Error('world_order_v2_presentation_not_activated');
  const snapshot = payload.contractVersion === WORLD_ORDER_HISTORY_V2
    ? validateV2HistorySnapshot(payload, { nowMs })
    : normalizeWorldOrderStressHistorySnapshot(payload, { allowV2: true, nowMs });
  const range = snapshot.scoreRange;
  return {
    status: 'incomplete',
    score: null,
    scoreText: '—',
    confidenceText: '待核验',
    stateText: '证据不足，暂不分档',
    tone: null,
    decisionModifier: null,
    observedAt: snapshot.observedAt,
    rangeText: `条件外界限 ${range.lower}～${range.upper}（既有公式）`,
    boundaryText: '仅表示既有公式下、其它成分固定时的市场输入补全外界限，不是当前点估计、概率区间或未来风险保证；不代表风险解除。',
    missingReasons: [...snapshot.missingReasons],
    lastKnownText: snapshot.lastKnown
      ? `历史记录 ${snapshot.lastKnown.observedAt}：${snapshot.lastKnown.score}/100（不是当前评分）`
      : '无可核验的历史评分',
    productionEligible: false,
  };
}
