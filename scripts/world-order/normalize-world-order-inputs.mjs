export const WORLD_ORDER_WARNING = '该模块用于结构性风险识别，不构成战争预测或投资建议。';

export const DIMENSION_LABELS_ZH = {
  peaceDividendRetreat: '和平红利退潮',
  blocFormation: '阵营化与联盟硬化',
  multiTheaterConflict: '多战区冲突',
  economicWeaponization: '经济金融武器化',
  capitalControlRisk: '资本管制与金融抑制风险',
  marketConfirmation: '市场确认'
};

export const DIMENSION_KEYS = [
  'peaceDividendRetreat',
  'blocFormation',
  'multiTheaterConflict',
  'economicWeaponization',
  'capitalControlRisk'
];

export const SOURCE_KEYS = ['gdelt', 'ofac', 'sipri', 'acled'];

export function clampNumber(value, min, max, fallback = min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function clampScore(value) {
  return Math.round(clampNumber(value, 0, 100, 0));
}

export function clampConfidence(value) {
  return Number(clampNumber(value, 0, 1, 0).toFixed(2));
}

export function finiteOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isoNow() {
  return new Date().toISOString();
}

export function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeString(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function sanitizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .slice(0, 20);
}

export function sanitizeEvidence(evidence, fallbackSource = 'unknown') {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter((item) => isPlainObject(item))
    .map((item) => ({
      labelZh: sanitizeString(item.labelZh, '未命名证据'),
      source: sanitizeString(item.source, fallbackSource),
      summary: sanitizeString(item.summary, item.value == null ? '无摘要' : String(item.value)),
      value: item.value == null ? null : item.value,
      direction: sanitizeString(item.direction, 'neutral'),
      confidence: clampConfidence(item.confidence)
    }))
    .slice(0, 12);
}

export function buildEmptySummary(extra = {}) {
  return {
    errors: [],
    ...extra
  };
}

export function buildSourceResult({
  enabled = true,
  status = 'error',
  lastFetchedAt = null,
  summary = {},
  evidence = [],
  confidence = 0,
  reusedPrevious = false,
  warnings = []
} = {}) {
  return {
    enabled: enabled === true,
    status: sanitizeString(status, 'error'),
    lastFetchedAt: typeof lastFetchedAt === 'string' ? lastFetchedAt : null,
    summary: isPlainObject(summary) ? summary : {},
    evidence: sanitizeEvidence(evidence),
    confidence: clampConfidence(confidence),
    reusedPrevious: reusedPrevious === true,
    warnings: sanitizeStringArray(warnings)
  };
}

export function normalizeErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error || 'unknown error');
  if (/aborted|abort|timeout/iu.test(raw)) return '请求超时或被中止';
  if (/HTTP\s+\d+/iu.test(raw)) return `HTTP 请求失败：${raw.match(/HTTP\s+\d+/iu)?.[0] || raw}`;
  if (/JSON|parse|Unexpected/iu.test(raw)) return '响应解析失败';
  return `请求失败：${raw}`;
}

export function withPreviousSummaryOnFailure({ sourceKey, status, error, previousSource, emptySummary }) {
  const hasPrevious = isPlainObject(previousSource?.summary) && Object.keys(previousSource.summary).length > 0;
  const normalizedError = normalizeErrorMessage(error);
  return buildSourceResult({
    enabled: previousSource?.enabled !== false,
    status: hasPrevious ? 'stale' : status,
    lastFetchedAt: hasPrevious && typeof previousSource.lastFetchedAt === 'string' ? previousSource.lastFetchedAt : null,
    summary: hasPrevious
      ? {
        ...previousSource.summary,
        errors: [...(Array.isArray(previousSource.summary.errors) ? previousSource.summary.errors : []), normalizedError]
      }
      : {
        ...emptySummary,
        errors: [normalizedError]
      },
    evidence: previousSource?.evidence || [],
    confidence: hasPrevious ? 0.25 : 0.05,
    reusedPrevious: hasPrevious,
    warnings: [`${sourceKey} 数据源本轮不可用，已${hasPrevious ? '沿用旧摘要' : '输出空摘要'}。`]
  });
}

export async function fetchTextWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'gfrr-world-order-stress/1.0'
      }
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      contentType: response.headers.get('content-type') || ''
    };
  } finally {
    clearTimeout(timer);
  }
}

export function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function compactObject(value) {
  if (Array.isArray(value)) {
    return value.map(compactObject).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) {
    if (Number.isNaN(value)) return null;
    if (value === undefined) return null;
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, compactObject(entry)])
  );
}
