import {
  buildEmptySummary,
  buildSourceResult,
  clampConfidence,
  fetchTextWithTimeout,
  isoNow,
  sanitizeStringArray,
  withPreviousSummaryOnFailure
} from './normalize-world-order-inputs.mjs';

const DEFAULT_OFAC_RECENT_ACTIONS_URL = 'https://ofac.treasury.gov/recent-actions';
const ALLOWED_OFAC_HOSTS = new Set(['ofac.treasury.gov']);

function normalizeOfacUrl(value) {
  const url = new URL(value || DEFAULT_OFAC_RECENT_ACTIONS_URL);
  if (url.protocol !== 'https:' || !ALLOWED_OFAC_HOSTS.has(url.hostname)) {
    throw new Error(`OFAC recentActionsUrl is not allowlisted: ${url.origin}`);
  }
  return url.toString();
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function extractRecentActionTitles(html) {
  const titleMatches = [...html.matchAll(/<a[^>]+href=["'][^"']*recent-actions[^"']*["'][^>]*>([\s\S]*?)<\/a>/giu)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
  const headingMatches = [...html.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/giu)]
    .map((match) => stripHtml(match[1]))
    .filter((text) => /sanction|license|enforcement|regulation|update|ofac/iu.test(text));
  return [...new Set([...titleMatches, ...headingMatches])].slice(0, 80);
}

function extractLastUpdated(html) {
  const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["']/iu);
  if (timeMatch) return timeMatch[1];
  const dateMatch = stripHtml(html).match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/iu);
  return dateMatch ? dateMatch[0] : null;
}

function countMatching(titles, pattern) {
  return titles.filter((title) => pattern.test(title)).length;
}

export async function fetchOfacSummary({ config = {}, previousSource = null } = {}) {
  if (config.enabled === false) {
    return buildSourceResult({
      enabled: false,
      status: 'disabled',
      summary: buildEmptySummary({
        recentActionsCount: 0,
        listUpdatesCount: 0,
        enforcementActionsCount: 0,
        guidanceCount: 0,
        highRiskPrograms: [],
        lastUpdated: null,
        sourceFreshness: 'not-applicable'
      })
    });
  }

  try {
    const url = normalizeOfacUrl(config.recentActionsUrl);
    const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : 9000;
    const response = await fetchTextWithTimeout(url, timeoutMs);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const titles = extractRecentActionTitles(response.text);
    const listUpdatesCount = countMatching(titles, /sanctions list|sdn|list update|designation|designat/iu);
    const enforcementActionsCount = countMatching(titles, /enforcement|settlement|penalt/iu);
    const guidanceCount = countMatching(titles, /general license|guidance|regulation|faq|directive/iu);
    const programs = ['Russia', 'Iran', 'North Korea', 'Syria', 'Cyber', 'Terrorism', 'Venezuela', 'Belarus', 'China'];
    const text = titles.join(' ');
    const highRiskPrograms = sanitizeStringArray(programs.filter((program) => text.toLowerCase().includes(program.toLowerCase())));
    const lastUpdated = extractLastUpdated(response.text);

    const summary = {
      recentActionsCount: titles.length,
      listUpdatesCount,
      enforcementActionsCount,
      guidanceCount,
      highRiskPrograms,
      lastUpdated,
      sourceFreshness: titles.length > 0 ? 'fresh' : 'unknown',
      errors: []
    };

    return buildSourceResult({
      enabled: true,
      status: titles.length > 0 ? 'ok' : 'error',
      lastFetchedAt: isoNow(),
      summary,
      evidence: [
        {
          labelZh: 'OFAC 近期制裁与执法活动',
          source: 'OFAC Recent Actions',
          summary: `解析到 ${titles.length} 条近期行动，其中清单更新 ${listUpdatesCount} 条、执法 ${enforcementActionsCount} 条。`,
          value: titles.length,
          direction: titles.length > 0 ? 'up' : 'neutral',
          confidence: titles.length > 0 ? 0.7 : 0.1
        }
      ],
      confidence: clampConfidence(titles.length > 0 ? 0.7 : 0.1)
    });
  } catch (err) {
    return withPreviousSummaryOnFailure({
      sourceKey: 'OFAC',
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      previousSource,
      emptySummary: buildEmptySummary({
        recentActionsCount: 0,
        listUpdatesCount: 0,
        enforcementActionsCount: 0,
        guidanceCount: 0,
        highRiskPrograms: [],
        lastUpdated: null,
        sourceFreshness: 'error'
      })
    });
  }
}
