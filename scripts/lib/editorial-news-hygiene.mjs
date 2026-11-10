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
  if (/(?:#{1,6}\s*(?:more\s+)?related content\b|(?:^|[|•])\s*(?:more\s+)?related content\s*[:|#•])/iu.test(snippet)) {
    return { eligible: false, reason: 'related_content' };
  }
  if (/\bsubscribe\s+sign in\s+search\b/iu.test(snippet)
    || /\b(?:newsletters|videos?)\b/iu.test(snippet) && /\bsign in\s+search\b/iu.test(snippet)) {
    return { eligible: false, reason: 'navigation_contamination' };
  }
  let videoPage = false;
  try { videoPage = /\/(?:video|videos)\//iu.test(new URL(story?.url).pathname); } catch { /* Missing URL cannot establish a video-page context. */ }
  // Forward-looking prose such as "watch next week's payroll release" is not
  // a player control. Require an explicit heading/delimiter for these labels.
  const videoListingHeading = /(?:#{1,6}\s*(?:watch next|up next|next video)\b(?!['’])|(?:^|[|•]|[.!?]\s+)\s*(?:watch next|up next|next video)\s*[:|#•])/iu;
  // Program introductions identify a discussion, not its findings. Do not stitch
  // subsequent video titles onto the intro or promote a title into measured data.
  if (videoPage && /\bjoins?\b.{0,140}(?:to discuss|Squawk Box|Closing Bell|Power Lunch|Last Call)/iu.test(snippet)
    || videoListingHeading.test(snippet)
    || (snippet.match(/\bVIDEO\s*\d{1,2}:\d{2}\b/giu) || []).length > 1) {
    return { eligible: false, reason: 'video_intro_or_listing' };
  }
  // A newsletter masthead/agenda describes coverage, not findings. This does not
  // exclude substantive newsletter analysis or scripts with a generic title.
  if (/\bwelcome to\b/iu.test(snippet) && /\bnewsletter\b/iu.test(snippet)
    && /\b(?:today|this week)[, :]*(?:we (?:look at|discuss|cover|explore)|in |on )/iu.test(snippet)) {
    return { eligible: false, reason: 'newsletter_agenda' };
  }
  return { eligible: true, reason: null };
}

// Hosting publishers are not independent sources for a distributed press release.
// Match distribution endpoints, not a publisher merely discussing a wire service.
// Official issuers hosting their own releases keep their existing primary status.
export function syndicationOrigin(story) {
  let url;
  try { url = new URL(story?.url); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./u, '');
  if (['businesswire.com', 'prnewswire.com', 'globenewswire.com'].some(domain => host === domain || host.endsWith(`.${domain}`))
    || /\/(?:business-wire|businesswire|pr-newswire|prnewswire|globenewswire)\//iu.test(url.pathname)
    || host === 'markets.ft.com' && /^\/data\/announce\//u.test(url.pathname)) return 'wire_release';
  return null;
}

export function evidenceEligibility(story) {
  const excerpt = excerptEligibility(story);
  if (!excerpt.eligible) return excerpt;
  if (syndicationOrigin(story)) return { eligible: false, reason: 'syndicated_release' };
  return { eligible: true, reason: null };
}

export function sanitizeNewsStory(story) {
  const eligibility = evidenceEligibility(story);
  return eligibility.eligible ? story : {
    ...story, snippet: null, evidenceStatus: 'discovery_only', contentScope: 'title_only'
  };
}

export function independentSupportDomains(rows) {
  const seen = new Set(), domains = new Set();
  for (const row of rows) {
    if (!evidenceEligibility(row).eligible) continue;
    // Repeated substantial text is not a second independent report. Very short
    // fragments cannot prove text identity, but remain subject to existing gates.
    const text = String(row.snippet || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (text.length >= 80 && seen.has(text)) continue;
    seen.add(text);
    domains.add(row.domain);
  }
  return [...domains].sort();
}
