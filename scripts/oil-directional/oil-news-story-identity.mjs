import { createHash } from 'node:crypto';

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalizeArticleUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.username = '';
    url.password = '';
    url.hash = '';
    url.hostname = url.hostname.toLocaleLowerCase('en-US').replace(/^www\./u, '');
    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLocaleLowerCase('en-US');
      if (normalizedKey.startsWith('utm_') || TRACKING_PARAMS.has(normalizedKey)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, '');
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeStoryTitle(title) {
  return String(title || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLocaleLowerCase('en-US')
    .trim()
    .slice(0, 500);
}

export function buildArticleIdentity({ url, title } = {}) {
  const canonicalUrl = canonicalizeArticleUrl(url);
  const normalizedTitle = normalizeStoryTitle(title);
  return {
    canonicalUrl,
    canonicalUrlHash: canonicalUrl ? sha256(canonicalUrl) : null,
    storyClusterHash: normalizedTitle ? sha256(normalizedTitle) : null
  };
}
