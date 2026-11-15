const BLS_EMPLOYMENT_HEADING = /THE EMPLOYMENT SITUATION\s*[-–—]\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/iu;
const BLS_ADMIN_START = /^(?:Transmission of material in this news release is embargoed until\b|Technical information\s*:|Media contact\s*:)/iu;

export function isBlsEmploymentRelease(story) {
  try {
    const url = new URL(story?.url);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash
      && ['bls.gov', 'www.bls.gov'].includes(url.hostname)
      && /^\/news\.release\/archives\/empsit_\d{8}\.htm$/u.test(url.pathname);
  } catch { return false; }
}

// This is a bounded observation-shape check for one registered statistical
// release, not semantic verification. A short directional result is sufficient;
// administrative numbers, the report title and future expectations are not.
function hasEmploymentObservation(text) {
  // Evaluate separate sentences/clauses: a forecast's past participle is not
  // an observation, while a separate reported result may still be retained.
  return text.split(/(?<=[.!?])\s+(?=[A-Z])|[;\n]/u).some(sentence => {
    if (/\b(?:are|is|were|was)\s+(?:expected|forecast|projected|anticipated)\s+to\b|\b(?:will|would|could|may|might)\s+(?:have\s+)?(?:risen|rise|fall|grow|increase|decrease|decline|add|lose|gain|be)\b/iu.test(sentence)) return false;
    return /\b(?:payrolls?|(?:nonfarm\s+)?employment|unemployment(?:\s+rate)?|unemployed (?:people|persons)|(?:labor|labour) force(?: participation(?: rate)?)?|employment[- ]population ratio|(?:average\s+)?(?:hourly earnings|workweek)|jobs)\b[^!?]{0,100}\b(?:(?:rose|fell|grew|increased|decreased|declined|added|lost|gained)\b|(?:was|were|remained|held)\s+(?:unchanged|essentially unchanged|steady|stable|little changed|(?:at\s+)?[+-]?\d)|edged\s+(?:up|down)|changed\s+little|continued\s+to\s+(?:rise|fall|grow))/iu.test(sentence);
  });
}

function prepareReleaseExcerpt(story) {
  const original = String(story?.snippet || '').trim();
  if (!isBlsEmploymentRelease(story)) return { snippet: original, reason: null };
  const header = BLS_ADMIN_START.test(original);
  const heading = BLS_EMPLOYMENT_HEADING.exec(original);
  let snippet = original;
  // Never guess where an incomplete header ends. Only a complete known heading
  // permits extraction, and the body is an exact substring of the supplied text.
  if (header) {
    if (!heading) return { snippet: null, reason: 'administrative_header_only' };
    snippet = original.slice(heading.index + heading[0].length).trim();
  } else if (heading?.index === 0) {
    snippet = original.slice(heading[0].length).trim();
  }
  if (!hasEmploymentObservation(snippet)) return { snippet: null, reason: 'release_observation_missing' };
  return { snippet, reason: null };
}

export function needsBlsBodySupplement(story) {
  if (!isBlsEmploymentRelease(story)) return false;
  const text = String(story?.snippet || '').trim();
  return (BLS_ADMIN_START.test(text) || BLS_EMPLOYMENT_HEADING.exec(text)?.index === 0)
    && prepareReleaseExcerpt(story).reason !== null;
}

// Bounded reasons only: never retain rejected text in diagnostic fields.
export function excerptEligibility(story) {
  const prepared = prepareReleaseExcerpt(story);
  if (prepared.reason) return { eligible: false, reason: prepared.reason };
  const snippet = prepared.snippet.replace(/\s+/gu, ' ').trim();
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

export function compactNewsStory(story, maxLength) {
  if (!Number.isInteger(maxLength) || maxLength < 1) throw new Error('invalid excerpt limit');
  const prepared = prepareReleaseExcerpt(story);
  const cleaned = { ...story, snippet: prepared.snippet };
  if (prepared.reason || !evidenceEligibility(cleaned).eligible) return rejectedStory(story);
  const text = cleaned.snippet.replace(/\s+/gu, ' ').trim();
  const snippet = text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
  const compact = { ...story, snippet };
  // Eligibility belongs to the text actually supplied to the model, not a longer
  // source fragment that may have lost its only observation during projection.
  return evidenceEligibility(compact).eligible ? compact : rejectedStory(story);
}

function rejectedStory(story) {
  return { ...story, snippet: null, evidenceStatus: 'discovery_only', contentScope: 'title_only' };
}

export function sanitizeNewsStory(story) {
  const prepared = prepareReleaseExcerpt(story);
  const cleaned = { ...story, snippet: prepared.snippet };
  return !prepared.reason && evidenceEligibility(cleaned).eligible ? cleaned : rejectedStory(story);
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
