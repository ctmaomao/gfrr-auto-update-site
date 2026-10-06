// Exact reviewed publishers; reputation is distinct from independent corroboration.
const PUBLISHERS = Object.freeze({
  'morningstar.com': 'Morningstar', 'ft.com': 'Financial Times',
  'bloomberg.com': 'Bloomberg', 'cnbc.com': 'CNBC',
  'reuters.com': 'Reuters', 'wsj.com': 'The Wall Street Journal',
  'theinformation.com': 'The Information'
});
const OFFICIAL = Object.freeze([
  'sec.gov', 'justice.gov', 'oag.ca.gov', 'federalreserve.gov',
  'nvidia.com', 'microsoft.com', 'aboutamazon.com', 'amazon.com', 'abc.xyz',
  'investor.fb.com', 'meta.com', 'openai.com', 'anthropic.com', 'oracle.com', 'amd.com', 'broadcom.com'
]);
const domainMatches = (domain, suffix) => domain === suffix || domain.endsWith(`.${suffix}`);
export function publisherName(domain = '') {
  return Object.entries(PUBLISHERS).find(([suffix]) => domainMatches(domain, suffix))?.[1] || null;
}
export function isOfficialDomain(domain = '') {
  return OFFICIAL.some((suffix) => domainMatches(domain, suffix));
}
export function contentScope(story) {
  const snippet = String(story?.snippet || '').replace(/\s+/gu, ' ').trim();
  // Paywall/login/marketing text cannot stand in for article content, even at a trusted publisher.
  const boilerplate = /subscribe to (?:read|unlock)|save \d+%|trial .*\d+.*weeks|sign in to (?:read|continue)/iu;
  return snippet.length >= 12 && !boilerplate.test(snippet) ? 'excerpt' : 'title_only';
}
export function isUsableNews(story) {
  return ['official', 'cross_checked', 'attributed_media'].includes(story?.evidenceStatus)
    && story?.contentScope !== 'title_only';
}
export function isLimitedEvidence(input) {
  return (input?.newsContext?.stories || []).filter(isUsableNews).length < 2;
}
export function validMediaStory(story, { metadataOnly = false } = {}) {
  const name = publisherName(story?.domain);
  try {
    const url = new URL(story.url);
    return Boolean(name) && url.hostname.replace(/^www\./u, '') === story.domain
      && !/\/(?:community|forum|comments|sponsored)(?:\/|$)/iu.test(url.pathname)
      && story.contentScope === 'excerpt'
      && (metadataOnly || (String(story.snippet || '').length >= 80 && contentScope(story) === 'excerpt'))
      && story.sourceName === name && Number.isFinite(Date.parse(story.publishedAt));
  } catch { return false; }
}
