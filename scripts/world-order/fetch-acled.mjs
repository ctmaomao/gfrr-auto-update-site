import {
  buildEmptySummary,
  buildSourceResult,
  fetchTextWithTimeout,
  isoNow,
  safeJsonParse,
  withPreviousSummaryOnFailure
} from './normalize-world-order-inputs.mjs';

export async function fetchAcledSummary({ config = {}, previousSource = null } = {}) {
  const email = process.env.ACLED_EMAIL || '';
  const key = process.env.ACLED_API_KEY || process.env.ACLED_ACCESS_KEY || '';

  if (!email || !key) {
    return buildSourceResult({
      enabled: false,
      status: 'not_configured',
      lastFetchedAt: null,
      summary: buildEmptySummary({
        eventCount: 0,
        countriesCovered: [],
        sourceFreshness: 'not_configured',
        noteZh: 'ACLED 数据源未配置，当前冲突事件层由 GDELT 代理估算。'
      }),
      evidence: [
        {
          labelZh: 'ACLED 冲突事件数据',
          source: 'ACLED adapter',
          summary: '未配置 ACLED 凭据，暂由 GDELT 代理估算冲突事件层。',
          value: null,
          direction: 'neutral',
          confidence: 0
        }
      ],
      confidence: 0
    });
  }

  const baseUrl = config.apiBaseUrl || 'https://api.acleddata.com/acled/read';
  const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : 9000;
  const params = new URLSearchParams({
    email,
    key,
    limit: '100',
    format: 'json',
    event_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    event_date_where: '>='
  });

  try {
    const response = await fetchTextWithTimeout(`${baseUrl}?${params.toString()}`, timeoutMs);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = safeJsonParse(response.text);
    if (!parsed.ok) throw new Error(parsed.error);
    const rows = Array.isArray(parsed.value?.data) ? parsed.value.data : [];
    const countriesCovered = [...new Set(rows.map((row) => row.country).filter(Boolean))].slice(0, 20);

    return buildSourceResult({
      enabled: true,
      status: 'ok',
      lastFetchedAt: isoNow(),
      summary: buildEmptySummary({
        eventCount: rows.length,
        countriesCovered,
        sourceFreshness: 'fresh',
        noteZh: 'ACLED 已配置并返回近期事件摘要。'
      }),
      evidence: [
        {
          labelZh: 'ACLED 近期冲突事件',
          source: 'ACLED',
          summary: `近 14 天返回 ${rows.length} 条事件，覆盖 ${countriesCovered.length} 个国家或地区。`,
          value: rows.length,
          direction: rows.length > 0 ? 'up' : 'neutral',
          confidence: rows.length > 0 ? 0.8 : 0.3
        }
      ],
      confidence: rows.length > 0 ? 0.8 : 0.3
    });
  } catch (err) {
    return withPreviousSummaryOnFailure({
      sourceKey: 'ACLED',
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      previousSource,
      emptySummary: buildEmptySummary({
        eventCount: 0,
        countriesCovered: [],
        sourceFreshness: 'error',
        noteZh: 'ACLED 已配置但本轮请求失败。'
      })
    });
  }
}
