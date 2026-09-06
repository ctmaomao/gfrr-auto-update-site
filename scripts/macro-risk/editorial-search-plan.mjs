// Reallocate two existing Tavily slots to registered primary sources. There are
// still six basic searches per provider; Brave retains broad news coverage.
const PRIMARY_SEARCHES = Object.freeze({
  central_bank_inflation: {
    domain: 'federalreserve.gov',
    query: 'site:federalreserve.gov/newsevents/ monetary policy economic outlook speech press release'
  },
  growth_employment_consumer: {
    domain: 'bls.gov',
    query: 'site:bls.gov/news.release/archives/ employment jobs unemployment productivity news release'
  }
});

export function buildTavilyEditorialSearch(topic, query, maxResults = 5) {
  const primary = PRIMARY_SEARCHES[topic];
  return {
    query: primary?.query || query,
    topic: primary ? 'general' : 'news',
    search_depth: 'basic',
    max_results: maxResults,
    time_range: 'week',
    include_answer: false,
    include_raw_content: false,
    ...(primary ? { include_domains: [primary.domain] } : {})
  };
}

function calendarDate(year, month, day) {
  const date = `${year}-${month}-${day}`;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date
    ? new Date(time).toISOString() : null;
}

// General search freshness may mean a crawl/update, not publication. Accept only
// these dated release paths on the exact registered hosts, never a landing page
// or a date inferred from prose, query strings, or the current retrieval time.
export function officialReleaseDate(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    const host = parsed.hostname.replace(/^www\./u, '');
    if (host === 'federalreserve.gov') {
      const match = parsed.pathname.match(/^\/newsevents\/(?:speech|pressreleases)\/[a-z]+(\d{4})(\d{2})(\d{2})[a-z]\.htm$/u);
      return match ? calendarDate(match[1], match[2], match[3]) : null;
    }
    if (host === 'bls.gov') {
      const match = parsed.pathname.match(/^\/news\.release\/archives\/[a-z0-9]+_(\d{2})(\d{2})(\d{4})\.htm$/u);
      return match ? calendarDate(match[3], match[1], match[2]) : null;
    }
  } catch { /* Invalid search URLs are not evidence. */ }
  return null;
}

export function normalizeTavilyEditorialResults(topic, json, request) {
  if (!Array.isArray(json?.results)) throw new Error('search_results_invalid');
  const primary = PRIMARY_SEARCHES[topic];
  return json.results.slice(0, request.max_results).flatMap((item) => {
    let publishedAt = item?.published_date;
    if (primary) {
      const date = officialReleaseDate(item?.url);
      let host;
      try { host = new URL(item?.url).hostname.replace(/^www\./u, ''); } catch { return []; }
      if (host !== primary.domain || !date) return [];
      // Prefer the immutable release vintage over a search-index update date.
      publishedAt = date;
    }
    return [{ provider: 'tavily', topic, title: item?.title, url: item?.url,
      publishedAt, snippet: item?.content, searchScore: item?.score }];
  });
}
