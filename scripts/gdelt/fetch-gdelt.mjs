import { gunzipSync } from 'node:zlib';

const GDELT_DOC_API_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_CLOUD_API_BASE = 'https://gdeltcloud.com/api/v2';
const GDELT_WEB_NGRAMS_BASE = 'https://storage.googleapis.com/data.gdeltproject.org/gdeltv5/weblegacy/ngrams';

const DEFAULT_GDELT_TIMEOUT_MS = 20000;
const DEFAULT_GDELT_MIN_INTERVAL_MS = 8000;
const DEFAULT_GDELT_MAX_RETRIES = 1;
const DEFAULT_GDELT_RETRY_AFTER_CAP_MS = 15000;
const DEFAULT_GDELT_RETRY_MS = 6000;
const DEFAULT_GDELT_MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;
const DEFAULT_GDELT_MAX_DECOMPRESSED_BYTES = 128 * 1024 * 1024;
const DEFAULT_GDELT_MAX_COMPRESSION_RATIO = 100;
const DEFAULT_GDELT_UA = 'gfrr-gdelt-client/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';

let gdeltRequestQueue = Promise.resolve();
let lastGdeltCallStartedAt = 0;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function parseRetryAfterMs(value, capMs = DEFAULT_GDELT_RETRY_AFTER_CAP_MS) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let ms = null;
  if (/^\d+(?:\.\d+)?$/u.test(raw)) {
    ms = Math.round(Number(raw) * 1000);
  } else {
    const dateMs = Date.parse(raw);
    if (!Number.isNaN(dateMs)) ms = dateMs - Date.now();
  }
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(Math.round(ms), capMs);
}

function retryAfterSeconds(retryAfterMs) {
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return null;
  return Math.round((retryAfterMs / 1000) * 10) / 10;
}

function classifyGdeltParseFailure(text) {
  const compactText = String(text || '').replace(/\s+/gu, ' ').trim();
  if (/query was too short or too long/iu.test(compactText)) {
    return {
      errorCode: 'query_rejected_length',
      message: 'query rejected by GDELT because it was too short or too long'
    };
  }
  if (/please limit requests|rate limit|too many requests/iu.test(compactText)) {
    return {
      errorCode: 'rate_limited',
      message: 'rate limited by GDELT'
    };
  }
  if (/^\s*</u.test(String(text || ''))) {
    return {
      errorCode: 'non_json_html_response',
      message: 'returned non-JSON HTML response'
    };
  }
  return {
    errorCode: 'json_parse_failed',
    message: 'JSON parse failed'
  };
}

async function runSerializedGdeltRequest(task, minIntervalMs) {
  const run = gdeltRequestQueue.then(async () => {
    const waitMs = Math.max(0, lastGdeltCallStartedAt + minIntervalMs - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    lastGdeltCallStartedAt = Date.now();
    return task();
  });
  gdeltRequestQueue = run.catch(() => {});
  return run;
}

async function fetchTextOnce(url, {
  headers = {},
  label = 'GDELT',
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS
} = {}) {
  return runSerializedGdeltRequest(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });
      const text = await response.text();
      return { response, text };
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`${label} timeout after ${timeoutMs}ms`);
        timeoutError.code = 'timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }, minIntervalMs);
}

async function fetchBinaryOnce(url, {
  headers = {},
  label = 'GDELT',
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS,
  maxBytes = DEFAULT_GDELT_MAX_COMPRESSED_BYTES
} = {}) {
  return runSerializedGdeltRequest(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        const error = new Error(`${label} compressed response exceeds ${maxBytes} bytes`);
        error.code = 'compressed_size_exceeded';
        controller.abort();
        throw error;
      }

      const reader = response.body?.getReader?.();
      if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) {
          const error = new Error(`${label} compressed response exceeds ${maxBytes} bytes`);
          error.code = 'compressed_size_exceeded';
          throw error;
        }
        return { response, buffer };
      }

      const chunks = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          try {
            await reader.cancel('compressed response size limit exceeded');
          } catch {
            // The explicit size error below is the authoritative failure.
          }
          controller.abort();
          const error = new Error(`${label} compressed response exceeds ${maxBytes} bytes`);
          error.code = 'compressed_size_exceeded';
          throw error;
        }
        chunks.push(Buffer.from(value));
      }
      const buffer = Buffer.concat(chunks, totalBytes);
      return { response, buffer };
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`${label} timeout after ${timeoutMs}ms`);
        timeoutError.code = 'timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }, minIntervalMs);
}

async function probeHeadOnce(url, {
  headers = {},
  label = 'GDELT',
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS
} = {}) {
  return runSerializedGdeltRequest(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });
      return { response };
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`${label} timeout after ${timeoutMs}ms`);
        timeoutError.code = 'timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }, minIntervalMs);
}

function buildDiagnostics({
  provider = 'gdelt',
  endpointType,
  label,
  attempts,
  timeoutMs,
  minIntervalMs,
  maxRetries,
  retryAfterCapMs,
  startedAtMs,
  status = null,
  errorCode = null
}) {
  const retryCount = Math.max(0, attempts.length - 1);
  return {
    provider,
    endpointType,
    label,
    status,
    attempts: attempts.length,
    retryCount,
    rateLimited: attempts.some((attempt) => attempt.status === 429),
    timeout: attempts.some((attempt) => attempt.errorCode === 'timeout'),
    retryAfterSeconds: retryAfterSeconds(
      Math.max(0, ...attempts.map((attempt) => attempt.retryAfterMs || 0))
    ),
    timeoutMs,
    minIntervalMs,
    maxRetries,
    retryAfterCapSeconds: retryAfterSeconds(retryAfterCapMs),
    elapsedMs: Math.max(0, Date.now() - startedAtMs),
    errorCode
  };
}

function createGdeltError(message, diagnostics) {
  const error = new Error(message);
  error.gdeltDiagnostics = sanitizeGdeltDiagnostics(diagnostics);
  error.status = diagnostics.status || null;
  return error;
}

function sanitizeGdeltDiagnostics(diagnostics = {}) {
  return {
    provider: diagnostics.provider === 'gdelt' ? 'gdelt' : 'gdelt',
    endpointType: typeof diagnostics.endpointType === 'string' ? diagnostics.endpointType : 'unknown',
    label: typeof diagnostics.label === 'string' ? diagnostics.label.slice(0, 80) : 'GDELT',
    status: Number.isFinite(diagnostics.status) ? diagnostics.status : null,
    attempts: Number.isFinite(diagnostics.attempts) ? diagnostics.attempts : 0,
    retryCount: Number.isFinite(diagnostics.retryCount) ? diagnostics.retryCount : 0,
    rateLimited: diagnostics.rateLimited === true,
    timeout: diagnostics.timeout === true,
    retryAfterSeconds: Number.isFinite(diagnostics.retryAfterSeconds) ? diagnostics.retryAfterSeconds : null,
    timeoutMs: Number.isFinite(diagnostics.timeoutMs) ? diagnostics.timeoutMs : null,
    minIntervalMs: Number.isFinite(diagnostics.minIntervalMs) ? diagnostics.minIntervalMs : null,
    maxRetries: Number.isFinite(diagnostics.maxRetries) ? diagnostics.maxRetries : null,
    retryAfterCapSeconds: Number.isFinite(diagnostics.retryAfterCapSeconds)
      ? diagnostics.retryAfterCapSeconds
      : null,
    elapsedMs: Number.isFinite(diagnostics.elapsedMs) ? diagnostics.elapsedMs : null,
    errorCode: typeof diagnostics.errorCode === 'string' ? diagnostics.errorCode.slice(0, 80) : null
  };
}

async function fetchGdeltJson(url, {
  endpointType = 'unknown',
  label = 'GDELT',
  headers = {},
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS,
  maxRetries = DEFAULT_GDELT_MAX_RETRIES,
  retryAfterCapMs = DEFAULT_GDELT_RETRY_AFTER_CAP_MS
} = {}) {
  const startedAtMs = Date.now();
  const attempts = [];
  const boundedRetries = Math.max(0, Math.min(3, Number.isFinite(maxRetries) ? Math.trunc(maxRetries) : 0));

  for (let attemptIndex = 0; attemptIndex <= boundedRetries; attemptIndex += 1) {
    let retryAfterMs = null;
    const attemptStartedAtMs = Date.now();
    try {
      const { response, text } = await fetchTextOnce(url, { headers, label, timeoutMs, minIntervalMs });
      retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'), retryAfterCapMs);
      attempts.push({
        attempt: attemptIndex + 1,
        status: response.status,
        retryAfterMs,
        elapsedMs: Math.max(0, Date.now() - attemptStartedAtMs)
      });

      if (response.ok) {
        try {
          return {
            json: JSON.parse(text),
            diagnostics: sanitizeGdeltDiagnostics(buildDiagnostics({
              endpointType,
              label,
              attempts,
              timeoutMs,
              minIntervalMs,
              maxRetries: boundedRetries,
              retryAfterCapMs,
              startedAtMs,
              status: response.status
            }))
          };
        } catch (parseError) {
          const parseFailure = classifyGdeltParseFailure(text);
          throw createGdeltError(`${label} ${parseFailure.message}`, buildDiagnostics({
            endpointType,
            label,
            attempts,
            timeoutMs,
            minIntervalMs,
            maxRetries: boundedRetries,
            retryAfterCapMs,
            startedAtMs,
            status: response.status,
            errorCode: parseFailure.errorCode
          }));
        }
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attemptIndex < boundedRetries) {
        await sleep(retryAfterMs || DEFAULT_GDELT_RETRY_MS);
        continue;
      }

      throw createGdeltError(`${label} HTTP ${response.status} after ${attempts.length} attempt(s)`, buildDiagnostics({
        endpointType,
        label,
        attempts,
        timeoutMs,
        minIntervalMs,
        maxRetries: boundedRetries,
        retryAfterCapMs,
        startedAtMs,
        status: response.status,
        errorCode: response.status === 429 ? 'rate_limited' : 'http_error'
      }));
    } catch (error) {
      if (error?.gdeltDiagnostics) throw error;
      attempts.push({
        attempt: attemptIndex + 1,
        status: null,
        errorCode: error?.code === 'timeout' ? 'timeout' : 'network_error',
        elapsedMs: Math.max(0, Date.now() - attemptStartedAtMs)
      });
      if (attemptIndex < boundedRetries) {
        await sleep(DEFAULT_GDELT_RETRY_MS);
        continue;
      }
      throw createGdeltError(`${label} ${error?.message || 'request failed'} after ${attempts.length} attempt(s)`, buildDiagnostics({
        endpointType,
        label,
        attempts,
        timeoutMs,
        minIntervalMs,
        maxRetries: boundedRetries,
        retryAfterCapMs,
        startedAtMs,
        errorCode: error?.code === 'timeout' ? 'timeout' : 'network_error'
      }));
    }
  }

  throw createGdeltError(`${label} exhausted retry loop`, buildDiagnostics({
    endpointType,
    label,
    attempts,
    timeoutMs,
    minIntervalMs,
    maxRetries: boundedRetries,
    retryAfterCapMs,
    startedAtMs,
    errorCode: 'retry_loop_exhausted'
  }));
}

async function fetchGdeltDocJson({
  queryParams,
  userAgent = DEFAULT_GDELT_UA,
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS,
  maxRetries = DEFAULT_GDELT_MAX_RETRIES,
  retryAfterCapMs = DEFAULT_GDELT_RETRY_AFTER_CAP_MS,
  label = 'GDELT DOC'
} = {}) {
  const params = queryParams instanceof URLSearchParams
    ? queryParams
    : new URLSearchParams(queryParams || {});
  return fetchGdeltJson(`${GDELT_DOC_API_BASE}?${params.toString()}`, {
    endpointType: 'doc',
    label,
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json'
    },
    timeoutMs,
    minIntervalMs,
    maxRetries,
    retryAfterCapMs
  });
}

async function fetchGdeltCloudJson({
  path = '/events/summary',
  queryParams,
  apiKey,
  userAgent = DEFAULT_GDELT_UA,
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS,
  maxRetries = DEFAULT_GDELT_MAX_RETRIES,
  retryAfterCapMs = DEFAULT_GDELT_RETRY_AFTER_CAP_MS,
  label = 'GDELT Cloud'
} = {}) {
  const trimmedPath = typeof path === 'string' && path.startsWith('/') ? path : `/${String(path || '')}`;
  const params = queryParams instanceof URLSearchParams
    ? queryParams
    : new URLSearchParams(queryParams || {});
  return fetchGdeltJson(`${GDELT_CLOUD_API_BASE}${trimmedPath}?${params.toString()}`, {
    endpointType: 'cloud',
    label,
    headers: {
      Authorization: `Bearer ${apiKey || ''}`,
      'User-Agent': userAgent,
      Accept: 'application/json'
    },
    timeoutMs,
    minIntervalMs,
    maxRetries,
    retryAfterCapMs
  });
}

async function fetchGdeltGzipText(url, {
  endpointType = 'web_ngrams',
  label = 'GDELT Web NGrams',
  headers = {},
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS,
  maxRetries = 0,
  retryAfterCapMs = DEFAULT_GDELT_RETRY_AFTER_CAP_MS,
  maxCompressedBytes = DEFAULT_GDELT_MAX_COMPRESSED_BYTES,
  maxDecompressedBytes = DEFAULT_GDELT_MAX_DECOMPRESSED_BYTES,
  maxCompressionRatio = DEFAULT_GDELT_MAX_COMPRESSION_RATIO
} = {}) {
  const startedAtMs = Date.now();
  const attempts = [];
  const boundedRetries = Math.max(0, Math.min(3, Number.isFinite(maxRetries) ? Math.trunc(maxRetries) : 0));

  for (let attemptIndex = 0; attemptIndex <= boundedRetries; attemptIndex += 1) {
    let retryAfterMs = null;
    const attemptStartedAtMs = Date.now();
    try {
      const { response, buffer } = await fetchBinaryOnce(url, {
        headers,
        label,
        timeoutMs,
        minIntervalMs,
        maxBytes: maxCompressedBytes
      });
      retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'), retryAfterCapMs);
      attempts.push({
        attempt: attemptIndex + 1,
        status: response.status,
        retryAfterMs,
        elapsedMs: Math.max(0, Date.now() - attemptStartedAtMs)
      });

      if (response.ok) {
        try {
          const ratioBound = Math.max(1, Math.floor(buffer.length * maxCompressionRatio));
          const maxOutputLength = Math.min(maxDecompressedBytes, ratioBound);
          return {
            text: gunzipSync(buffer, { maxOutputLength }).toString('utf8'),
            diagnostics: sanitizeGdeltDiagnostics(buildDiagnostics({
              endpointType,
              label,
              attempts,
              timeoutMs,
              minIntervalMs,
              maxRetries: boundedRetries,
              retryAfterCapMs,
              startedAtMs,
              status: response.status
            }))
          };
        } catch (error) {
          const sizeLimitExceeded = error?.code === 'ERR_BUFFER_TOO_LARGE';
          throw createGdeltError(
            sizeLimitExceeded ? `${label} decompressed response exceeds safety limit` : `${label} gzip decode failed`,
            buildDiagnostics({
              endpointType,
              label,
              attempts,
              timeoutMs,
              minIntervalMs,
              maxRetries: boundedRetries,
              retryAfterCapMs,
              startedAtMs,
              status: response.status,
              errorCode: sizeLimitExceeded ? 'decompressed_size_exceeded' : 'gzip_decode_failed'
            }));
        }
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attemptIndex < boundedRetries) {
        await sleep(retryAfterMs || DEFAULT_GDELT_RETRY_MS);
        continue;
      }

      throw createGdeltError(`${label} HTTP ${response.status} after ${attempts.length} attempt(s)`, buildDiagnostics({
        endpointType,
        label,
        attempts,
        timeoutMs,
        minIntervalMs,
        maxRetries: boundedRetries,
        retryAfterCapMs,
        startedAtMs,
        status: response.status,
        errorCode: response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limited' : 'http_error'
      }));
    } catch (error) {
      if (error?.gdeltDiagnostics) throw error;
      attempts.push({
        attempt: attemptIndex + 1,
        status: null,
        errorCode: error?.code === 'timeout'
          ? 'timeout'
          : error?.code === 'compressed_size_exceeded'
            ? 'compressed_size_exceeded'
            : 'network_error',
        elapsedMs: Math.max(0, Date.now() - attemptStartedAtMs)
      });
      if (attemptIndex < boundedRetries) {
        await sleep(DEFAULT_GDELT_RETRY_MS);
        continue;
      }
      throw createGdeltError(`${label} ${error?.message || 'request failed'} after ${attempts.length} attempt(s)`, buildDiagnostics({
        endpointType,
        label,
        attempts,
        timeoutMs,
        minIntervalMs,
        maxRetries: boundedRetries,
        retryAfterCapMs,
        startedAtMs,
        errorCode: error?.code === 'timeout'
          ? 'timeout'
          : error?.code === 'compressed_size_exceeded'
            ? 'compressed_size_exceeded'
            : 'network_error'
      }));
    }
  }

  throw createGdeltError(`${label} exhausted retry loop`, buildDiagnostics({
    endpointType,
    label,
    attempts,
    timeoutMs,
    minIntervalMs,
    maxRetries: boundedRetries,
    retryAfterCapMs,
    startedAtMs,
    errorCode: 'retry_loop_exhausted'
  }));
}

async function fetchGdeltWebNgramsText({
  timestamp,
  kind = 'ngrams',
  userAgent = DEFAULT_GDELT_UA,
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS,
  maxRetries = 0,
  retryAfterCapMs = DEFAULT_GDELT_RETRY_AFTER_CAP_MS,
  maxCompressedBytes = DEFAULT_GDELT_MAX_COMPRESSED_BYTES,
  maxDecompressedBytes = DEFAULT_GDELT_MAX_DECOMPRESSED_BYTES,
  maxCompressionRatio = DEFAULT_GDELT_MAX_COMPRESSION_RATIO,
  label = 'GDELT Web NGrams'
} = {}) {
  if (!/^\d{14}$/u.test(String(timestamp || ''))) {
    throw new Error('GDELT Web NGrams timestamp must be YYYYMMDDHHMMSS');
  }
  const suffix = kind === 'toc' ? 'toc.json.gz' : 'ngrams.txt.gz';
  const url = `${GDELT_WEB_NGRAMS_BASE}/${timestamp}.${suffix}`;
  const result = await fetchGdeltGzipText(url, {
    endpointType: `web_${kind === 'toc' ? 'ngrams_toc' : 'ngrams'}`,
    label,
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/gzip, text/plain, */*'
    },
    timeoutMs,
    minIntervalMs,
    maxRetries,
    retryAfterCapMs,
    maxCompressedBytes,
    maxDecompressedBytes,
    maxCompressionRatio
  });
  return { ...result, url };
}

async function probeGdeltWebNgramsFile({
  timestamp,
  kind = 'ngrams',
  userAgent = DEFAULT_GDELT_UA,
  timeoutMs = DEFAULT_GDELT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_GDELT_MIN_INTERVAL_MS,
  retryAfterCapMs = DEFAULT_GDELT_RETRY_AFTER_CAP_MS,
  label = 'GDELT Web NGrams probe'
} = {}) {
  if (!/^\d{14}$/u.test(String(timestamp || ''))) {
    throw new Error('GDELT Web NGrams timestamp must be YYYYMMDDHHMMSS');
  }
  const suffix = kind === 'toc' ? 'toc.json.gz' : 'ngrams.txt.gz';
  const url = `${GDELT_WEB_NGRAMS_BASE}/${timestamp}.${suffix}`;
  const startedAtMs = Date.now();
  const attempts = [];
  const attemptStartedAtMs = Date.now();
  try {
    const { response } = await probeHeadOnce(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/gzip, text/plain, */*'
      },
      label,
      timeoutMs,
      minIntervalMs
    });
    const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'), retryAfterCapMs);
    attempts.push({
      attempt: 1,
      status: response.status,
      retryAfterMs,
      elapsedMs: Math.max(0, Date.now() - attemptStartedAtMs)
    });
    const diagnostics = sanitizeGdeltDiagnostics(buildDiagnostics({
      endpointType: `web_${kind === 'toc' ? 'ngrams_toc_probe' : 'ngrams_probe'}`,
      label,
      attempts,
      timeoutMs,
      minIntervalMs,
      maxRetries: 0,
      retryAfterCapMs,
      startedAtMs,
      status: response.status,
      errorCode: response.ok ? null : response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limited' : 'http_error'
    }));
    return {
      ok: response.ok,
      status: response.status,
      timestamp,
      url,
      contentLength: Number(response.headers.get('content-length')) || null,
      lastModified: response.headers.get('last-modified') || null,
      diagnostics
    };
  } catch (error) {
    attempts.push({
      attempt: 1,
      status: null,
      errorCode: error?.code === 'timeout' ? 'timeout' : 'network_error',
      elapsedMs: Math.max(0, Date.now() - attemptStartedAtMs)
    });
    return {
      ok: false,
      status: null,
      timestamp,
      url,
      contentLength: null,
      lastModified: null,
      diagnostics: sanitizeGdeltDiagnostics(buildDiagnostics({
        endpointType: `web_${kind === 'toc' ? 'ngrams_toc_probe' : 'ngrams_probe'}`,
        label,
        attempts,
        timeoutMs,
        minIntervalMs,
        maxRetries: 0,
        retryAfterCapMs,
        startedAtMs,
        errorCode: error?.code === 'timeout' ? 'timeout' : 'network_error'
      })),
      error: String(error?.message || error).slice(0, 180)
    };
  }
}

export {
  DEFAULT_GDELT_MAX_COMPRESSED_BYTES,
  DEFAULT_GDELT_MAX_COMPRESSION_RATIO,
  DEFAULT_GDELT_MAX_DECOMPRESSED_BYTES,
  DEFAULT_GDELT_MAX_RETRIES,
  DEFAULT_GDELT_MIN_INTERVAL_MS,
  DEFAULT_GDELT_RETRY_AFTER_CAP_MS,
  DEFAULT_GDELT_TIMEOUT_MS,
  fetchGdeltCloudJson,
  fetchGdeltDocJson,
  fetchGdeltWebNgramsText,
  probeGdeltWebNgramsFile,
  sanitizeGdeltDiagnostics
};
