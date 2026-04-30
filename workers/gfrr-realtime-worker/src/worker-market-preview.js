const FRED_SERIES = {
  brent: 'DCOILBRENTEU',
  dxy: 'DTWEXBGS',
  hyOas: 'BAMLH0A0HYM2',
  vix: 'VIXCLS',
  spx: 'SP500',
  us10y: 'DGS10',
  us2y: 'DGS2',
  real10y: 'DFII10',
  breakeven10y: 'T10YIE',
};

const CRITICAL_FIELDS = ['brent', 'dxy', 'hyOas', 'vix', 'us10y', 'real10y'];
const GOLD_URL = 'https://api.gold-api.com/price/XAU';
const YAHOO_BRENT_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d';
const STOOQ_BRENT_URL = 'https://stooq.com/q/d/l/?s=brn.f&i=d';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundValue(value, digits = 4) {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseNumeric(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === '' || text === '.') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  out.push(current);
  return out;
}

function latestTwoCsvValues(text, valueColumnIndex = 1) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => splitCsvLine(line));
  const values = [];

  for (const row of rows) {
    const value = parseNumeric(row[valueColumnIndex]);
    if (value != null) {
      values.push({ timestamp: row[0] || null, value });
    }
  }

  return {
    latest: values.at(-1) ?? null,
    previous: values.at(-2) ?? null,
  };
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchFredSeries(name, seriesId, cosd) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?cosd=${cosd}&id=${seriesId}`;

  try {
    const text = await fetchText(url);
    const { latest, previous } = latestTwoCsvValues(text);
    if (!latest) {
      return {
        name,
        value: null,
        change: null,
        detail: { ok: false, value: null, source: `FRED:${seriesId}`, timestamp: null, error: 'no numeric value' },
      };
    }

    return {
      name,
      value: roundValue(latest.value),
      change: previous ? roundValue(latest.value - previous.value) : null,
      detail: {
        ok: true,
        value: roundValue(latest.value),
        source: `FRED:${seriesId}`,
        timestamp: latest.timestamp,
        error: null,
      },
    };
  } catch (err) {
    return {
      name,
      value: null,
      change: null,
      detail: {
        ok: false,
        value: null,
        source: `FRED:${seriesId}`,
        timestamp: null,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function fetchGold() {
  try {
    const response = await fetch(GOLD_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const value = parseNumeric(payload?.price);

    return {
      value: value == null ? null : roundValue(value),
      change: null,
      detail: {
        ok: value != null,
        value: value == null ? null : roundValue(value),
        source: GOLD_URL,
        timestamp: payload?.updatedAt ?? payload?.timestamp ?? null,
        error: value == null ? 'missing price' : null,
      },
    };
  } catch (err) {
    return {
      value: null,
      change: null,
      detail: {
        ok: false,
        value: null,
        source: GOLD_URL,
        timestamp: null,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function fetchYahooBrentCandidate() {
  try {
    const response = await fetch(YAHOO_BRENT_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result?.timestamp ?? [];

    for (let i = closes.length - 1; i >= 0; i -= 1) {
      const value = parseNumeric(closes[i]);
      if (value != null) {
        return {
          source: 'yahoo:BZ=F',
          value: roundValue(value),
          timestamp: timestamps[i] ? new Date(timestamps[i] * 1000).toISOString() : null,
          ok: true,
          error: null,
        };
      }
    }

    throw new Error('no numeric close');
  } catch (err) {
    return {
      source: 'yahoo:BZ=F',
      value: null,
      timestamp: null,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchStooqBrentCandidate() {
  try {
    const text = await fetchText(STOOQ_BRENT_URL);
    const { latest } = latestTwoCsvValues(text, 4);
    if (!latest) throw new Error('no numeric close');

    return {
      source: 'stooq:brn.f',
      value: roundValue(latest.value),
      timestamp: latest.timestamp,
      ok: true,
      error: null,
    };
  } catch (err) {
    return {
      source: 'stooq:brn.f',
      value: null,
      timestamp: null,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function buildBrentValidation(anchorValue) {
  const [yahoo, stooq] = await Promise.all([
    fetchYahooBrentCandidate(),
    fetchStooqBrentCandidate(),
  ]);
  const candidates = [
    {
      source: 'FRED:DCOILBRENTEU',
      value: anchorValue,
      role: 'anchor',
      ok: isFiniteNumber(anchorValue),
      error: isFiniteNumber(anchorValue) ? null : 'missing FRED anchor',
    },
    { ...yahoo, role: 'validation' },
    { ...stooq, role: 'validation' },
  ];
  const validationValues = candidates
    .filter((candidate) => candidate.role === 'validation' && isFiniteNumber(candidate.value))
    .map((candidate) => candidate.value);
  const recommendedValue =
    validationValues.length > 0
      ? roundValue(validationValues.reduce((sum, value) => sum + value, 0) / validationValues.length)
      : null;
  const recommendedSource =
    validationValues.length > 1 ? 'validation-average' : candidates.find((c) => c.role === 'validation' && c.ok)?.source ?? null;

  return {
    candidates,
    consensus: {
      recommendedValue,
      recommendedSource,
      confidence: validationValues.length >= 2 ? 'medium' : validationValues.length === 1 ? 'low' : 'none',
      reason:
        'Worker preview validation only; FRED DCOILBRENTEU remains the Brent anchor for values.brent.',
      canPromoteToPrimary: false,
    },
  };
}

function buildSourceStatus(sourceDetails) {
  return Object.fromEntries(
    Object.entries(sourceDetails).map(([name, detail]) => [name, detail.ok ? 'ok' : 'missing']),
  );
}

function countMissing(values, fields) {
  return fields.filter((field) => !isFiniteNumber(values[field])).length;
}

export async function buildWorkerGeneratedMarketPreview() {
  const nowIso = new Date().toISOString();
  const cosd = formatDate(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000));
  const fredResults = await Promise.all(
    Object.entries(FRED_SERIES).map(([name, seriesId]) => fetchFredSeries(name, seriesId, cosd)),
  );
  const gold = await fetchGold();

  const values = Object.fromEntries(fredResults.map((result) => [result.name, result.value]));
  values.gold = gold.value;

  const changes = Object.fromEntries(
    fredResults.map((result) => [`${result.name}1d`, result.change]),
  );
  changes.gold1d = gold.change;

  const sourceDetails = Object.fromEntries(
    fredResults.map((result) => [result.name, result.detail]),
  );
  sourceDetails.gold = gold.detail;

  const brentValidation = await buildBrentValidation(values.brent);
  const criticalMissing = countMissing(values, CRITICAL_FIELDS);
  const nonCriticalFields = Object.keys(values).filter((field) => !CRITICAL_FIELDS.includes(field));
  const nonCriticalMissing = countMissing(values, nonCriticalFields);
  const healthScore = Math.max(0, Math.min(100, 100 - criticalMissing * 15 - nonCriticalMissing * 5));
  const unavailable = criticalMissing >= 4;

  return {
    updatedAt: nowIso,
    asOf: nowIso,
    ageMinutes: 0,
    freshnessLevel: 'fresh',
    unavailable,
    sourceMode: unavailable ? 'worker-generated-unavailable' : 'worker-generated-preview',
    degradedMode: criticalMissing > 0 || nonCriticalMissing > 0,
    cacheOnly: false,
    healthScore,
    criticalMissing,
    fallbackCount: 0,
    secondarySourceCount: brentValidation.candidates.filter((candidate) => candidate.role === 'validation' && candidate.ok).length + (gold.detail.ok ? 1 : 0),
    values,
    changes,
    sourceStatus: buildSourceStatus(sourceDetails),
    sourceDetails,
    brentValidation,
    workerGeneratedPreview: {
      enabled: true,
      version: 'v28.0B-2A',
      source: 'cloudflare-worker',
      generatedAt: nowIso,
      writePolicy: 'single-kv-write-alternating',
      productionEnabled: false,
      note: 'Worker-generated preview only; not used by frontend',
    },
  };
}
