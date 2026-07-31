import {
  fetchGdeltWebNgramsText,
  probeGdeltWebNgramsFile,
  sanitizeGdeltDiagnostics
} from './fetch-gdelt.mjs';

export const GDELT_WEB_NGRAMS_PAIR_CONTRACT = 'gdelt-web-ngrams-article-pair-v1';

function assertTimestamp(timestamp) {
  const value = String(timestamp || '');
  if (!/^\d{14}$/u.test(value)) {
    throw new Error('GDELT Web NGrams pair timestamp must be YYYYMMDDHHMMSS');
  }
  return value;
}

function compactProbePart(result = {}) {
  return {
    ok: result.ok === true,
    status: Number.isInteger(result.status) ? result.status : null,
    contentLength: Number.isFinite(result.contentLength) ? result.contentLength : null,
    lastModified: typeof result.lastModified === 'string' ? result.lastModified : null,
    diagnostics: sanitizeGdeltDiagnostics(result.diagnostics || {})
  };
}

function compactFetchPart(result = {}) {
  return {
    diagnostics: sanitizeGdeltDiagnostics(result.diagnostics || {})
  };
}

function errorDiagnostics(error) {
  return sanitizeGdeltDiagnostics(error?.gdeltDiagnostics || {});
}

export async function probeGdeltWebNgramsPair({
  timestamp,
  probeFile = probeGdeltWebNgramsFile,
  ...requestOptions
} = {}) {
  const pairTimestamp = assertTimestamp(timestamp);
  const ngrams = await probeFile({
    ...requestOptions,
    timestamp: pairTimestamp,
    kind: 'ngrams',
    label: 'GDELT Web NGrams article-pair ngrams probe'
  });
  const compactNgrams = compactProbePart(ngrams);
  if (!compactNgrams.ok) {
    return {
      contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
      ok: false,
      status: 'ngrams_unavailable',
      timestamp: pairTimestamp,
      ngrams: compactNgrams,
      toc: null
    };
  }

  const toc = await probeFile({
    ...requestOptions,
    timestamp: pairTimestamp,
    kind: 'toc',
    label: 'GDELT Web NGrams article-pair toc probe'
  });
  const compactToc = compactProbePart(toc);
  return {
    contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
    ok: compactToc.ok,
    status: compactToc.ok ? 'pair_available' : 'toc_unavailable',
    timestamp: pairTimestamp,
    ngrams: compactNgrams,
    toc: compactToc
  };
}

export async function findFirstAvailableGdeltWebNgramsPair({
  timestamps,
  probePair = probeGdeltWebNgramsPair,
  ...requestOptions
} = {}) {
  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    throw new Error('GDELT Web NGrams pair discovery requires candidate timestamps');
  }

  const attempts = [];
  for (const rawTimestamp of timestamps) {
    const timestamp = assertTimestamp(rawTimestamp);
    try {
      const result = await probePair({ ...requestOptions, timestamp });
      attempts.push(result);
      if (result.ok === true) {
        return {
          contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
          ok: true,
          status: 'pair_available',
          selectedTimestamp: timestamp,
          selectedPair: result,
          attempts
        };
      }
    } catch (error) {
      attempts.push({
        contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
        ok: false,
        status: 'probe_error',
        timestamp,
        diagnostics: errorDiagnostics(error)
      });
    }
  }

  return {
    contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
    ok: false,
    status: 'source_unavailable',
    selectedTimestamp: null,
    selectedPair: null,
    attempts
  };
}

export async function fetchGdeltWebNgramsPair({
  timestamp,
  fetchText = fetchGdeltWebNgramsText,
  ...requestOptions
} = {}) {
  const pairTimestamp = assertTimestamp(timestamp);
  let ngrams = null;
  try {
    ngrams = await fetchText({
      ...requestOptions,
      timestamp: pairTimestamp,
      kind: 'ngrams',
      label: 'GDELT Web NGrams article-pair ngrams fetch'
    });
    const toc = await fetchText({
      ...requestOptions,
      timestamp: pairTimestamp,
      kind: 'toc',
      label: 'GDELT Web NGrams article-pair toc fetch'
    });
    return {
      contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
      status: 'live',
      timestamp: pairTimestamp,
      ngramsText: ngrams.text,
      tocText: toc.text,
      diagnostics: {
        contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
        status: 'live',
        timestamp: pairTimestamp,
        ngrams: compactFetchPart(ngrams),
        toc: compactFetchPart(toc)
      }
    };
  } catch (error) {
    const pairError = new Error(`GDELT Web NGrams article pair unavailable for ${pairTimestamp}`);
    pairError.code = 'gdelt_web_ngrams_pair_unavailable';
    pairError.pairDiagnostics = {
      contractVersion: GDELT_WEB_NGRAMS_PAIR_CONTRACT,
      status: 'source_unavailable',
      timestamp: pairTimestamp,
      ngrams: ngrams ? compactFetchPart(ngrams) : null,
      toc: null,
      failure: errorDiagnostics(error)
    };
    throw pairError;
  }
}
