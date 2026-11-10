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
// Bounded reasons only: never retain rejected text in diagnostic fields.
export function excerptEligibility(story) {
  const snippet = String(story?.snippet || '').replace(/\s+/gu, ' ').trim();
  if (snippet.length < 12) return { eligible: false, reason: 'missing_excerpt' };
  if (/subscribe to (?:read|unlock)|save \d+%|trial .*\d+.*weeks|sign in to (?:read|continue)/iu.test(snippet)) {
    return { eligible: false, reason: 'subscription_boilerplate' };
  }
  // These are page furniture, not evidence for the discovered article's title.
  // Drop the entire excerpt rather than guessing which adjacent story it belongs to.
  const navigationHeading = /(?:^|[|#•]|[.!?]\s+)(?:most (?:read|popular)|related (?:stories|articles)|recommended (?:stories|articles)|you may also like|skip to (?:main )?content)\s*(?::|[|#•]|$)/iu;
  const repeatedMenus = (snippet.match(/Show more(?:\s+[A-Z]|$)/gu) || []).length >= 2;
  if (/\bmost read\b/iu.test(snippet) || navigationHeading.test(snippet) || repeatedMenus) {
    return { eligible: false, reason: 'navigation_contamination' };
  }
  // A newsletter masthead/agenda describes coverage, not findings. This does not
  // exclude substantive newsletter analysis or scripts with a generic title.
  if (/\bwelcome to\b/iu.test(snippet) && /\bnewsletter\b/iu.test(snippet)
    && /\b(?:today|this week)[, :]*(?:we (?:look at|discuss|cover|explore)|in |on )/iu.test(snippet)) {
    return { eligible: false, reason: 'newsletter_agenda' };
  }
  return { eligible: true, reason: null };
}
export function contentScope(story) {
  return excerptEligibility(story).eligible ? 'excerpt' : 'title_only';
}
export function isUsableNews(story) {
  return ['official', 'cross_checked', 'attributed_media'].includes(story?.evidenceStatus)
    && story?.contentScope !== 'title_only' && excerptEligibility(story).eligible;
}
export function isLimitedEvidence(input) {
  return input?.newsContext?.coverageMode === 'limited_single_search'
    || (input?.newsContext?.stories || []).filter(isUsableNews).length < 2;
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
