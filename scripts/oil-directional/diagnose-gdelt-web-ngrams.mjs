#!/usr/bin/env node
import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { fetchGdeltWebNgramsText, probeGdeltWebNgramsFile, sanitizeGdeltDiagnostics } from '../gdelt/fetch-gdelt.mjs';
import {
  fetchGdeltWebNgramsPair,
  probeGdeltWebNgramsPair
} from '../gdelt/gdelt-web-ngrams-pair.mjs';
import {
  matchWebNgramsTerms,
  WEB_NGRAMS_TERM_SET
} from './oil-news-query-taxonomy.mjs';

const DIAGNOSIS_VERSION = 'gdelt-web-ngrams-diagnosis-p41';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json';
const DEFAULT_SAFE_LAG_MINUTES = 5;
const DEFAULT_CANDIDATE_SPACING_MINUTES = 5;
const DEFAULT_MAX_CANDIDATES = 18;
const DEFAULT_DISCOVERY_HOURS = 12;
const DEFAULT_MAX_PROBES = 96;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MIN_INTERVAL_MS = 1500;
const DEFAULT_PROBE_MIN_INTERVAL_MS = 250;
const UA = 'gfrr-odp-oil-news-web-ngrams-diagnosis/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';
const BOUNDARY =
  'manual ODP oil-news GDELT Web NGrams diagnosis only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const TERM_SET = WEB_NGRAMS_TERM_SET;

function printUsage() {
  console.log(`Usage:
  npm run diagnose:gdelt-web-ngrams -- [options]

Options:
  --allow-network                 Download recent GDELT Web NGrams files. Default is dry-run/no network.
  --dry-run                       Force no-network planning mode.
  --safe-lag-minutes <n>          Start from now minus n minutes. Default: ${DEFAULT_SAFE_LAG_MINUTES}
  --candidate-spacing-minutes <n> Candidate spacing while looking back. Default: ${DEFAULT_CANDIDATE_SPACING_MINUTES}
  --max-candidates <n>            Max recent files to try, 1..60. Default: ${DEFAULT_MAX_CANDIDATES}
  --discovery-hours <n>           Bounded heartbeat discovery window, 1..168h. Default: ${DEFAULT_DISCOVERY_HOURS}
  --max-probes <n>                Max HEAD probes for latest-file discovery, 1..1000. Default: ${DEFAULT_MAX_PROBES}
  --no-probe                      Skip HEAD discovery and directly download timestamp/recent candidates.
  --timestamp <YYYYMMDDHHMMSS>    Try exactly one GDELT Web NGrams timestamp.
  --output <path>                 Ignored manual artifact path. Default: ${DEFAULT_OUTPUT}
  --no-output                     Do not write artifact.
  --strict                        Exit non-zero if no ngrams file can be fetched.
  --json                          Print full JSON artifact.
  --help                          Show this help.`);
}

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    safeLagMinutes: DEFAULT_SAFE_LAG_MINUTES,
    candidateSpacingMinutes: DEFAULT_CANDIDATE_SPACING_MINUTES,
    maxCandidates: DEFAULT_MAX_CANDIDATES,
    discoveryHours: DEFAULT_DISCOVERY_HOURS,
    maxProbes: DEFAULT_MAX_PROBES,
    probeBeforeDownload: true,
    timestamp: null,
    output: DEFAULT_OUTPUT,
    writeOutput: true,
    strict: false,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--allow-network') {
      options.allowNetwork = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.allowNetwork = false;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--no-probe') {
      options.probeBeforeDownload = false;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--safe-lag-minutes') {
      options.safeLagMinutes = Number(nextValue());
    } else if (arg === '--candidate-spacing-minutes') {
      options.candidateSpacingMinutes = Number(nextValue());
    } else if (arg === '--max-candidates') {
      options.maxCandidates = Number(nextValue());
    } else if (arg === '--discovery-hours') {
      options.discoveryHours = Number(nextValue());
    } else if (arg === '--max-probes') {
      options.maxProbes = Number(nextValue());
    } else if (arg === '--timestamp') {
      options.timestamp = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.safeLagMinutes) || options.safeLagMinutes < 2 || options.safeLagMinutes > 180) {
    throw new Error('Invalid --safe-lag-minutes. Expected integer 2..180.');
  }
  if (!Number.isInteger(options.candidateSpacingMinutes) || options.candidateSpacingMinutes < 1 || options.candidateSpacingMinutes > 60) {
    throw new Error('Invalid --candidate-spacing-minutes. Expected integer 1..60.');
  }
  if (!Number.isInteger(options.maxCandidates) || options.maxCandidates < 1 || options.maxCandidates > 60) {
    throw new Error('Invalid --max-candidates. Expected integer 1..60.');
  }
  if (!Number.isInteger(options.discoveryHours) || options.discoveryHours < 1 || options.discoveryHours > 168) {
    throw new Error('Invalid --discovery-hours. Expected integer 1..168.');
  }
  if (!Number.isInteger(options.maxProbes) || options.maxProbes < 1 || options.maxProbes > 1000) {
    throw new Error('Invalid --max-probes. Expected integer 1..1000.');
  }
  if (options.timestamp && !/^\d{14}$/u.test(options.timestamp)) {
    throw new Error('Invalid --timestamp. Expected YYYYMMDDHHMMSS.');
  }
  return options;
}

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

function timestampFromDate(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('');
}

function buildCandidateTimestamps(options, nowMs = Date.now()) {
  if (options.timestamp) return [options.timestamp];
  const candidates = [];
  const baseMs = nowMs - options.safeLagMinutes * 60000;
  for (let index = 0; index < options.maxCandidates; index += 1) {
    const candidateMs = baseMs - index * options.candidateSpacingMinutes * 60000;
    const candidate = new Date(candidateMs);
    candidate.setUTCSeconds(0, 0);
    candidates.push(timestampFromDate(candidate));
  }
  return [...new Set(candidates)];
}

function floorToMinute(date) {
  const floored = new Date(date);
  floored.setUTCSeconds(0, 0);
  return floored;
}

function buildHeartbeatDiscoveryTimestamps(options, nowMs = Date.now()) {
  if (options.timestamp) return [options.timestamp];
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (date) => {
    const timestamp = timestampFromDate(floorToMinute(date));
    if (seen.has(timestamp)) return;
    seen.add(timestamp);
    candidates.push(timestamp);
  };

  for (const timestamp of buildCandidateTimestamps(options, nowMs)) {
    if (candidates.length >= options.maxProbes) break;
    seen.add(timestamp);
    candidates.push(timestamp);
  }

  const baseMs = nowMs - options.safeLagMinutes * 60000;
  const maxSlots = Math.ceil((options.discoveryHours * 60) / 15);
  const heartbeatOffsets = [0, 1, 2, 3, 4, 5];
  for (let slot = 0; slot <= maxSlots && candidates.length < options.maxProbes; slot += 1) {
    const slotStart = new Date(baseMs - slot * 15 * 60000);
    const heartbeatMinute = Math.floor(slotStart.getUTCMinutes() / 15) * 15;
    slotStart.setUTCMinutes(heartbeatMinute, 0, 0);
    for (const offset of heartbeatOffsets) {
      if (candidates.length >= options.maxProbes) break;
      pushCandidate(new Date(slotStart.getTime() + offset * 60000));
    }
  }
  return candidates;
}

function safeRelativePath(path) {
  if (!path) return null;
  return relative(process.cwd(), resolve(path)).replace(/\\/g, '/');
}

function productionImpactFalseMap() {
  return {
    affectsValues: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function classifyLine(line) {
  const [docIdRaw, ngramRaw, countRaw] = line.split('\t');
  const docId = Number(docIdRaw);
  const count = Number(countRaw);
  const ngram = String(ngramRaw || '').trim();
  if (!Number.isFinite(docId) || !ngram || !Number.isFinite(count)) return [];
  const matches = [];
  for (const { term, matchedPattern } of matchWebNgramsTerms(ngram, TERM_SET)) {
    matches.push({
      termId: term.id,
      labelZh: term.labelZh,
      matchedPattern,
      ngram,
      count,
      docId,
      buckets: term.buckets
    });
  }
  return matches;
}

function summarizeMatches(matches) {
  const byTerm = new Map();
  const bucketCounts = {};
  for (const match of matches) {
    const current = byTerm.get(match.termId) || {
      termId: match.termId,
      labelZh: match.labelZh,
      hitCount: 0,
      totalCount: 0,
      uniqueDocCount: 0,
      docIds: new Set(),
      buckets: new Set(),
      examples: []
    };
    current.hitCount += 1;
    current.totalCount += match.count;
    current.docIds.add(match.docId);
    for (const bucket of match.buckets) {
      current.buckets.add(bucket);
      bucketCounts[bucket] = (bucketCounts[bucket] || 0) + match.count;
    }
    if (current.examples.length < 5) {
      current.examples.push({
        ngram: match.ngram,
        count: match.count,
        buckets: match.buckets
      });
    }
    byTerm.set(match.termId, current);
  }
  const terms = [...byTerm.values()].map((term) => ({
    termId: term.termId,
    labelZh: term.labelZh,
    hitCount: term.hitCount,
    totalCount: term.totalCount,
    uniqueDocCount: term.docIds.size,
    buckets: [...term.buckets].sort(),
    examples: term.examples
  })).sort((a, b) => b.totalCount - a.totalCount || a.termId.localeCompare(b.termId));
  return {
    totalHitCount: matches.length,
    totalMentionCount: matches.reduce((sum, match) => sum + match.count, 0),
    uniqueDocCount: new Set(matches.map((match) => match.docId)).size,
    bucketCounts,
    terms
  };
}

function analyzeNgramsText(text) {
  const matches = [];
  let parsedLineCount = 0;
  for (const line of String(text || '').split(/\r?\n/u)) {
    if (!line.trim()) continue;
    parsedLineCount += 1;
    matches.push(...classifyLine(line));
  }
  return {
    parsedLineCount,
    ...summarizeMatches(matches)
  };
}

async function probeFirstAvailableNgrams(candidates, {
  probePair = probeGdeltWebNgramsPair,
  probeFile = probeGdeltWebNgramsFile
} = {}) {
  const attempts = [];
  for (const timestamp of candidates) {
    const result = await probePair({
      timestamp,
      probeFile: async (probeOptions) => {
        const kind = String(probeOptions.kind || '');
        return probeFile({
          ...probeOptions,
          userAgent: UA,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          minIntervalMs: DEFAULT_PROBE_MIN_INTERVAL_MS,
          label: `GDELT Web NGrams ${kind} probe ${timestamp}`
        });
      },
      label: `GDELT Web NGrams pair probe ${timestamp}`
    });
    attempts.push({
      timestamp,
      status: result.ok ? 'ok' : 'missing',
      httpStatus: result.ngrams?.status,
      tocHttpStatus: result.toc?.status,
      contentLength: result.ngrams?.contentLength || null,
      tocContentLength: result.toc?.contentLength || null,
      lastModified: result.ngrams?.lastModified || null,
      tocLastModified: result.toc?.lastModified || null,
      diagnostics: sanitizeGdeltDiagnostics(
        result.ok ? result.ngrams?.diagnostics : (result.toc || result.ngrams)?.diagnostics
      ),
      error: null
    });
    if (result.ok) {
      return {
        found: true,
        timestamp,
        contentLength: result.ngrams?.contentLength || null,
        tocContentLength: result.toc?.contentLength || null,
        lastModified: result.ngrams?.lastModified || null,
        tocLastModified: result.toc?.lastModified || null,
        attempts
      };
    }
  }
  return {
    found: false,
    timestamp: null,
    url: null,
    contentLength: null,
    lastModified: null,
    attempts
  };
}

async function fetchFirstAvailableNgrams(candidates, options, {
  probePair = probeGdeltWebNgramsPair,
  probeFile = probeGdeltWebNgramsFile,
  fetchPair = fetchGdeltWebNgramsPair,
  fetchText = fetchGdeltWebNgramsText
} = {}) {
  const attempts = [];
  let candidateSet = candidates;
  let discovery = null;
  if (options.probeBeforeDownload) {
    discovery = await probeFirstAvailableNgrams(candidates, { probePair, probeFile });
    attempts.push(...discovery.attempts.map((attempt) => ({
      ...attempt,
      method: 'HEAD'
    })));
    candidateSet = discovery.found ? [discovery.timestamp] : [];
  }
  for (const timestamp of candidates) {
    if (!candidateSet.includes(timestamp)) continue;
    try {
      const result = await fetchPair({
        timestamp,
        fetchText: async (fetchOptions) => {
          const kind = String(fetchOptions.kind || '');
          return fetchText({
            ...fetchOptions,
            userAgent: UA,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
            maxRetries: 0,
            label: `GDELT Web NGrams ${kind} ${timestamp}`
          });
        },
        label: `GDELT Web NGrams article-pair ${timestamp}`
      });
      attempts.push({
        method: 'GET',
        timestamp,
        status: 'ok',
        ngramsContentLength: discovery?.contentLength || result.diagnostics?.ngrams?.contentLength || null,
        tocContentLength: discovery?.tocContentLength || result.diagnostics?.toc?.contentLength || null,
        lastModified: discovery?.lastModified || result.diagnostics?.ngrams?.lastModified || null,
        tocLastModified: discovery?.tocLastModified || result.diagnostics?.toc?.lastModified || null,
        diagnostics: sanitizeGdeltDiagnostics(result.diagnostics?.ngrams?.diagnostics),
        tocDiagnostics: sanitizeGdeltDiagnostics(result.diagnostics?.toc?.diagnostics)
      });
      return {
        ...result,
        text: result.ngramsText,
        timestamp,
        attempts,
        discovery
      };
    } catch (error) {
      const failureDiagnostics = error.pairDiagnostics?.failure || error.gdeltDiagnostics || null;
      attempts.push({
        method: 'GET',
        timestamp,
        status: 'error',
        diagnostics: failureDiagnostics ? sanitizeGdeltDiagnostics(failureDiagnostics) : null,
        errorCode: failureDiagnostics?.errorCode || error.code || null,
        error: error.code || 'gdelt_web_ngrams_pair_unavailable'
      });
    }
  }
  return { text: '', timestamp: null, url: null, diagnostics: null, attempts, discovery };
}

function buildDryRunArtifact(options, candidates) {
  return {
    diagnosisVersion: DIAGNOSIS_VERSION,
    generatedAt: new Date().toISOString(),
    status: 'dry_run',
    mode: 'dry_run_no_network',
    sourceKey: 'odp_oil_news_gdelt_web_ngrams_diagnosis',
    source: 'GDELT Web NGrams v5 legacy article-pair files',
    input: {
      allowNetwork: false,
      probeBeforeDownload: options.probeBeforeDownload,
      candidateTimestamps: candidates,
      terms: TERM_SET.map(({ id, labelZh, patterns, buckets }) => ({ id, labelZh, patterns, buckets }))
    },
    productionImpact: productionImpactFalseMap(),
    promotionEligible: false,
    productionDisplayApproved: false,
    boundary: BOUNDARY
  };
}

function sanitizeSelectedFileForArtifact(fetched) {
  if (!fetched.timestamp) return null;
  return {
    timestamp: fetched.timestamp,
    contentLength: fetched.discovery?.contentLength || null,
    tocContentLength: fetched.discovery?.tocContentLength || null,
    lastModified: fetched.discovery?.lastModified || null,
    tocLastModified: fetched.discovery?.tocLastModified || null,
    diagnostics: sanitizeGdeltDiagnostics(fetched.diagnostics?.ngrams?.diagnostics || fetched.diagnostics),
    tocDiagnostics: sanitizeGdeltDiagnostics(fetched.diagnostics?.toc?.diagnostics)
  };
}

async function buildLiveArtifact(options, candidates) {
  const fetched = await fetchFirstAvailableNgrams(candidates, options);
  const summary = fetched.ngramsText
    ? analyzeNgramsText(fetched.ngramsText)
    : fetched.text
      ? analyzeNgramsText(fetched.text)
      : summarizeMatches([]);
  const status = fetched.timestamp
    ? summary.totalHitCount > 0 ? 'ok' : 'ok_no_oil_terms_observed'
    : 'source_unavailable';
  return {
    diagnosisVersion: DIAGNOSIS_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    mode: 'manual_live_diagnosis',
    sourceKey: 'odp_oil_news_gdelt_web_ngrams_diagnosis',
    source: 'GDELT Web NGrams v5 legacy article-pair files',
    input: {
      allowNetwork: true,
      probeBeforeDownload: options.probeBeforeDownload,
      candidateTimestamps: candidates,
      terms: TERM_SET.map(({ id, labelZh, patterns, buckets }) => ({ id, labelZh, patterns, buckets }))
    },
    selectedFile: sanitizeSelectedFileForArtifact(fetched),
    discovery: fetched.discovery
      ? {
          found: fetched.discovery.found,
          selectedTimestamp: fetched.discovery.timestamp,
          candidateCount: candidates.length,
          attemptedCount: fetched.discovery.attempts.length,
          contentLength: fetched.discovery.contentLength,
          tocContentLength: fetched.discovery.tocContentLength,
          lastModified: fetched.discovery.lastModified,
          tocLastModified: fetched.discovery.tocLastModified,
          failureCounts: fetched.discovery.attempts.reduce((counts, attempt) => {
            if (attempt.status === 'ok') return counts;
            const key = attempt.diagnostics?.errorCode || String(attempt.httpStatus || 'unknown');
            counts[key] = (counts[key] || 0) + 1;
            return counts;
          }, {})
        }
      : {
          found: Boolean(fetched.timestamp),
          selectedTimestamp: fetched.timestamp,
          candidateCount: candidates.length,
          attemptedCount: fetched.attempts.length,
          contentLength: null,
          lastModified: null,
          failureCounts: {}
        },
    attempts: fetched.attempts,
    summary,
    productionImpact: productionImpactFalseMap(),
    promotionEligible: false,
    productionDisplayApproved: false,
    limitationsZh: [
      'Web NGrams 是下载型 ngram 频次文件,可降低 DOC API 429 风险,但不是新闻事实确认源。',
      '本诊断只校验 ngrams/toc 成对可用性,不解析 TOC 标题/URL,不保存新闻正文,只统计短语命中与桶计数。',
      '本诊断不写 production data,不改变 Oil News、ODP 或今日总判断。'
    ],
    boundary: BOUNDARY
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidates = options.probeBeforeDownload
    ? buildHeartbeatDiscoveryTimestamps(options)
    : buildCandidateTimestamps(options);
  const artifact = options.allowNetwork
    ? await buildLiveArtifact(options, candidates)
    : buildDryRunArtifact(options, candidates);
  if (options.writeOutput) {
    const outputPath = assertManualArtifactWritePath(options.output, 'manual-artifacts/oil-news/');
    mkdirSync(dirname(outputPath), { recursive: true });
    assertManualArtifactWritePath(outputPath, 'manual-artifacts/oil-news/');
    writeJson(outputPath, artifact);
    artifact.outputPath = outputPath;
  }
  if (options.printJson) {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log(`GDELT Web NGrams diagnosis: ${artifact.status.toUpperCase()}`);
    console.log(`mode: ${artifact.mode}`);
    console.log(`selectedFile: ${artifact.selectedFile?.timestamp || 'none'}`);
    console.log(`attempts: ${artifact.attempts?.length || artifact.input.candidateTimestamps.length}`);
    if (artifact.discovery) {
      console.log(`discovery: found=${artifact.discovery.found} probes=${artifact.discovery.attemptedCount}/${artifact.discovery.candidateCount}`);
    }
    console.log(`hits: ${artifact.summary?.totalHitCount ?? 0}`);
    console.log(`uniqueDocCount: ${artifact.summary?.uniqueDocCount ?? 0}`);
    if (artifact.outputPath) console.log(`outputPath: ${safeRelativePath(artifact.outputPath) || artifact.outputPath}`);
  }
  if (options.strict && artifact.status === 'source_unavailable') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}

export {
  analyzeNgramsText,
  buildCandidateTimestamps,
  buildDryRunArtifact,
  buildHeartbeatDiscoveryTimestamps,
  fetchFirstAvailableNgrams,
  parseArgs,
  probeFirstAvailableNgrams,
  summarizeMatches
};
