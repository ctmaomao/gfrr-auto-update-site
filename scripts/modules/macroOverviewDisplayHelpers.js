// scripts/modules/macroOverviewDisplayHelpers.js
// Pure display helpers for Macro Overview labels and lightweight status text.

const WORLD_ORDER_STATE_LABELS = {
  multi_theater_stress: '多战区压力期',
  war_economy_stress: '战时经济压力期',
  world_order_pressure_crossing: '世界秩序压力穿越',
  normal: '常态观察',
  unknown: '状态待确认',
};

const SOURCE_MODE_LABELS = {
  live: '实时',
  fallback: '回退',
  degraded: '降级',
  'cache-only': '缓存',
  'live-with-fallback': '实时含回退',
  'worker-generated-preview': 'Worker 主预览',
};

const BRENT_MODE_LABELS = {
  public_proxy_observation: '公开代理观察',
};

const RISK_BIAS_LABELS = {
  upward: '上修偏置',
  neutral: '中性',
  downward: '下修偏置',
};

function textValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

// 6 pressure module tone threshold: red >= 70, yellow 50-69, green < 50.
export function moduleTone(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 70) return 'red';
  if (score >= 50) return 'yellow';
  return 'green';
}

export function trendArrow(trend) {
  if (!Number.isFinite(trend)) return '→';
  if (trend > 2) return '↑';
  if (trend < -2) return '↓';
  return '→';
}

export function sourceModeZh(value) {
  const text = textValue(value);
  return text ? (SOURCE_MODE_LABELS[text] || text) : '—';
}

export function brentModeZh(value) {
  const text = textValue(value);
  return text ? (BRENT_MODE_LABELS[text] || text) : '—';
}

export function worldOrderStateLabel(state, labelZh) {
  const label = textValue(labelZh);
  if (label) return label;
  const stateText = textValue(state);
  return stateText ? (WORLD_ORDER_STATE_LABELS[stateText] || '状态待确认') : '状态待确认';
}

export function riskBiasZh(value) {
  const text = textValue(value);
  return text ? (RISK_BIAS_LABELS[text] || text) : '—';
}

// Display only: use each leg's original observation date and never coerce null to zero.
export function shippingFreightDisplay(source, nowMs = Date.now()) {
  const sf = source || {};
  const legs = [
    ['BDTI', 'balticDirtyTanker', 'dirtyTanker'],
    ['BCTI', 'balticCleanTanker', 'cleanTanker'],
    ['BDI', 'balticDry', 'dryBulk'],
  ].map(([label, prefix, key]) => {
    const value = sf[`${prefix}Index`];
    const timestamp = sf[`${prefix}UpdatedAt`];
    const time = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
    const dated = typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(timestamp)
      && Number.isFinite(time) && Number.isFinite(nowMs) && time <= nowMs
      && new Date(time).toISOString().slice(0, 10) === timestamp.slice(0, 10);
    const status = sf.sourceStatus?.[key];
    const usable = Number.isSafeInteger(value) && value > 0 && dated
      && ['live', 'fallback'].includes(status);
    if (!usable) return { value: null, fresh: false, text: `${label} — · 缺少可用报价` };
    const fresh = status === 'live' && nowMs - time <= 7 * 86400000;
    const change = sf[`${prefix}DailyChangePct`];
    const delta = Number.isFinite(change)
      ? ` ${change >= 0 ? '+' : ''}${(change * 100).toFixed(2)}%` : '';
    return { value, fresh,
      text: `${label} ${value}${delta} · ${timestamp.slice(0, 10)} ${fresh ? '已更新' : '沿用旧值'}` };
  });
  const allFresh = legs.every(leg => leg.fresh);
  const hasValue = legs.some(leg => leg.value !== null);
  return {
    number: legs[2].value === null ? '—' : String(legs[2].value),
    detail: legs.map(leg => leg.text).join(' · '),
    allFresh,
    hasValue,
    sourceLabel: allFresh ? '已更新' : !hasValue ? '来源不可用'
      : legs.some(leg => leg.fresh) ? '来源不完整' : '沿用旧值',
  };
}
