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
