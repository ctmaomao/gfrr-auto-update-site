import {
  matchWebNgramsTerms,
  WEB_NGRAMS_QUERY_SET_VERSION,
  WEB_NGRAMS_TERM_SET
} from './oil-news-query-taxonomy.mjs';
import {
  buildArticleIdentity,
  canonicalizeArticleUrl
} from './oil-news-story-identity.mjs';

export const WEB_NGRAMS_ARTICLE_CANDIDATE_CONTRACT =
  'gdelt-web-ngrams-article-candidates-shadow-v1';

function* textLines(text) {
  const input = String(text || '');
  let start = 0;
  for (let index = 0; index <= input.length; index += 1) {
    if (index !== input.length && input.charCodeAt(index) !== 10) continue;
    const end = index > start && input.charCodeAt(index - 1) === 13 ? index - 1 : index;
    yield input.slice(start, end);
    start = index + 1;
  }
}

function compactText(value, maxLength) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}

function parsePublishedAt(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseTocRows(tocText) {
  const rows = new Map();
  let validRowCount = 0;
  let invalidRowCount = 0;
  let duplicateIdCount = 0;
  for (const line of textLines(tocText)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const docId = Number(row?.ID);
      const title = compactText(row?.title, 500);
      const canonicalUrl = canonicalizeArticleUrl(row?.url);
      const publishedAt = parsePublishedAt(row?.date);
      if (!Number.isInteger(docId) || docId < 0 || !title || !canonicalUrl || !publishedAt) {
        invalidRowCount += 1;
        continue;
      }
      if (rows.has(String(docId))) duplicateIdCount += 1;
      rows.set(String(docId), {
        docId: String(docId),
        title,
        url: canonicalUrl,
        domain: new URL(canonicalUrl).hostname,
        publishedAt,
        language: /^[a-z]{2,3}(?:-[a-z0-9]+)?$/iu.test(String(row?.lang || ''))
          ? String(row.lang).toLocaleLowerCase('en-US')
          : 'und'
      });
      validRowCount += 1;
    } catch {
      invalidRowCount += 1;
    }
  }
  return { rows, validRowCount, invalidRowCount, duplicateIdCount };
}

function parseMatchedDocuments(ngramsText, termSet) {
  const documents = new Map();
  let parsedLineCount = 0;
  let invalidLineCount = 0;
  let matchedLineCount = 0;
  for (const line of textLines(ngramsText)) {
    if (!line.trim()) continue;
    const [rawDocId, quadgram, rawCount] = line.split('\t');
    const count = Number(rawCount);
    if (!rawDocId || !quadgram || !Number.isFinite(count) || count <= 0) {
      invalidLineCount += 1;
      continue;
    }
    parsedLineCount += 1;
    const matches = matchWebNgramsTerms(quadgram, termSet);
    if (matches.length === 0) continue;
    matchedLineCount += 1;
    const docId = String(rawDocId);
    const current = documents.get(docId) || {
      docId,
      matchedTermIds: new Set(),
      buckets: new Set(),
      mentionCount: 0
    };
    current.mentionCount += count;
    for (const { term } of matches) {
      current.matchedTermIds.add(term.id);
      for (const bucket of term.buckets) current.buckets.add(bucket);
    }
    documents.set(docId, current);
  }
  return { documents, parsedLineCount, invalidLineCount, matchedLineCount };
}

function mergeDuplicateCandidate(existing, candidate) {
  return {
    ...existing,
    matchedTermIds: [...new Set([...existing.matchedTermIds, ...candidate.matchedTermIds])].sort(),
    buckets: [...new Set([...existing.buckets, ...candidate.buckets])].sort(),
    mentionCount: existing.mentionCount + candidate.mentionCount
  };
}

export function buildWebNgramsArticleCandidates({
  timestamp,
  ngramsText,
  tocText,
  termSet = WEB_NGRAMS_TERM_SET,
  maxCandidates = 500
} = {}) {
  if (!/^\d{14}$/u.test(String(timestamp || ''))) {
    throw new Error('Web NGrams article candidate timestamp must be YYYYMMDDHHMMSS');
  }
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 2000) {
    throw new Error('Web NGrams maxCandidates must be an integer from 1 to 2000');
  }

  const matched = parseMatchedDocuments(ngramsText, termSet);
  const toc = parseTocRows(tocText);
  const byCanonicalUrl = new Map();
  let missingTocCount = 0;
  let duplicateUrlCount = 0;
  for (const document of matched.documents.values()) {
    const metadata = toc.rows.get(document.docId);
    if (!metadata) {
      missingTocCount += 1;
      continue;
    }
    const identity = buildArticleIdentity({
      url: metadata.url,
      title: metadata.title
    });
    const candidate = {
      source: 'gdelt_web_ngrams',
      sourceName: metadata.domain,
      queryId: 'gdelt_web_ngrams_article_discovery',
      queryLabel: 'GDELT Web NGrams article discovery',
      title: metadata.title,
      url: metadata.url,
      domain: metadata.domain,
      publishedAt: metadata.publishedAt,
      language: metadata.language,
      matchedTermIds: [...document.matchedTermIds].sort(),
      buckets: [...document.buckets].sort(),
      mentionCount: document.mentionCount,
      canonicalUrlHash: identity.canonicalUrlHash,
      storyClusterHash: identity.storyClusterHash || identity.canonicalUrlHash
    };
    if (byCanonicalUrl.has(candidate.canonicalUrlHash)) {
      duplicateUrlCount += 1;
      byCanonicalUrl.set(
        candidate.canonicalUrlHash,
        mergeDuplicateCandidate(byCanonicalUrl.get(candidate.canonicalUrlHash), candidate)
      );
    } else {
      byCanonicalUrl.set(candidate.canonicalUrlHash, candidate);
    }
  }

  const articles = [...byCanonicalUrl.values()]
    .sort((left, right) => (
      Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
      || right.mentionCount - left.mentionCount
      || left.domain.localeCompare(right.domain)
    ))
    .slice(0, maxCandidates);
  const joinedDocCount = matched.documents.size - missingTocCount;
  return {
    contractVersion: WEB_NGRAMS_ARTICLE_CANDIDATE_CONTRACT,
    querySetVersion: WEB_NGRAMS_QUERY_SET_VERSION,
    timestamp: String(timestamp),
    status: articles.length > 0 ? 'shadow_candidates_ready' : 'no_candidates',
    articles,
    aggregate: {
      parsedNgramsLineCount: matched.parsedLineCount,
      invalidNgramsLineCount: matched.invalidLineCount,
      matchedNgramsLineCount: matched.matchedLineCount,
      matchedDocCount: matched.documents.size,
      validTocRowCount: toc.validRowCount,
      invalidTocRowCount: toc.invalidRowCount,
      duplicateTocIdCount: toc.duplicateIdCount,
      joinedDocCount,
      missingTocCount,
      joinRate: matched.documents.size > 0
        ? Math.round((joinedDocCount / matched.documents.size) * 10000) / 10000
        : null,
      duplicateUrlCount,
      candidateCount: articles.length
    }
  };
}

export function sanitizeWebNgramsArticleCandidates(candidateSet) {
  return {
    contractVersion: candidateSet.contractVersion,
    querySetVersion: candidateSet.querySetVersion,
    timestamp: candidateSet.timestamp,
    status: candidateSet.status,
    aggregate: candidateSet.aggregate,
    articles: candidateSet.articles.map((article) => ({
      domain: article.domain,
      publishedAt: article.publishedAt,
      language: article.language,
      matchedTermIds: article.matchedTermIds,
      buckets: article.buckets,
      mentionCount: article.mentionCount,
      canonicalUrlHash: article.canonicalUrlHash,
      storyClusterHash: article.storyClusterHash
    })),
    rawContentStored: false,
    currentSignalEnhancement: false,
    eligibleForScoring: false
  };
}
