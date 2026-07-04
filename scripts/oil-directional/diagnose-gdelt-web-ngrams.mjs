#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fetchGdeltWebNgramsText, sanitizeGdeltDiagnostics } from '../gdelt/fetch-gdelt.mjs';

const DIAGNOSIS_VERSION = 'gdelt-web-ngrams-diagnosis-p41';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json';
const DEFAULT_SAFE_LAG_MINUTES = 5;
const DEFAULT_CANDIDATE_SPACING_MINUTES = 5;
const DEFAULT_MAX_CANDIDATES = 18;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MIN_INTERVAL_MS = 1500;
const UA = 'gfrr-odp-oil-news-web-ngrams-diagnosis/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';
const BOUNDARY =
  'manual ODP oil-news GDELT Web NGrams diagnosis only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const TERM_SET = [
  { id: 'hormuz', labelZh: '霍尔木兹', patterns: ['hormuz', 'strait of hormuz'], buckets: ['chokepoint', 'middle_east_risk'] },
  { id: 'red_sea', labelZh: '红海', patterns: ['red sea', 'bab el-mandeb', 'bab el mandeb'], buckets: ['chokepoint', 'tanker_shipping'] },
  { id: 'tanker', labelZh: '油轮/航运', patterns: ['tanker', 'vlcc', 'shipping insurance'], buckets: ['tanker_shipping'] },
  { id: 'crude_oil', labelZh: '原油', patterns: ['crude oil', 'oil prices', 'brent crude', 'wti crude'], buckets: ['market_reaction'] },
  { id: 'sanctions', labelZh: '制裁', patterns: ['oil sanctions', 'shadow fleet', 'price cap'], buckets: ['sanctions', 'tanker_shipping'] },
  { id: 'supply_disruption', labelZh: '供应中断', patterns: ['oil outage', 'pipeline outage', 'export halt', 'supply disruption'], buckets: ['supply_disruption'] },
  { id: 'facility_event', labelZh: '设施事件', patterns: ['refinery fire', 'refinery outage', 'terminal shutdown'], buckets: ['facility_event', 'supply_disruption'] }
];

function printUsage() {
  console.log(`Usage:
  npm run diagnose:gdelt-web-ngrams -- [options]

Options:
  --allow-network                 Download recent GDELT Web NGrams files. Default is dry-run/no network.
  --dry-run                       Force no-network planning mode.
  --safe-lag-minutes <n>          Start from now minus n minutes. Default: ${DEFAULT_SAFE_LAG_MINUTES}
  --candidate-spacing-minutes <n> Candidate spacing while looking back. Default: ${DEFAULT_CANDIDATE_SPACING_MINUTES}
  --max-candidates <n>            Max recent files to try, 1..60. Default: ${DEFAULT_MAX_CANDIDATES}
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
  const lower = ngram.toLowerCase();
  const matches = [];
  for (const term of TERM_SET) {
    const matchedPattern = term.patterns.find((pattern) => lower.includes(pattern));
    if (!matchedPattern) continue;
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

async function fetchFirstAvailableNgrams(candidates) {
  const attempts = [];
  for (const timestamp of candidates) {
    try {
      const result = await fetchGdeltWebNgramsText({
        timestamp,
        kind: 'ngrams',
        userAgent: UA,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
        maxRetries: 0,
        label: `GDELT Web NGrams ${timestamp}`
      });
      attempts.push({
        timestamp,
        status: 'ok',
        diagnostics: sanitizeGdeltDiagnostics(result.diagnostics)
      });
      return { ...result, timestamp, attempts };
    } catch (error) {
      attempts.push({
        timestamp,
        status: 'error',
        diagnostics: error.gdeltDiagnostics ? sanitizeGdeltDiagnostics(error.gdeltDiagnostics) : null,
        errorCode: error.gdeltDiagnostics?.errorCode || null,
        error: String(error.message || error).slice(0, 180)
      });
    }
  }
  return { text: '', timestamp: null, url: null, diagnostics: null, attempts };
}

function buildDryRunArtifact(options, candidates) {
  return {
    diagnosisVersion: DIAGNOSIS_VERSION,
    generatedAt: new Date().toISOString(),
    status: 'dry_run',
    mode: 'dry_run_no_network',
    sourceKey: 'odp_oil_news_gdelt_web_ngrams_diagnosis',
    source: 'GDELT Web NGrams v5 legacy ngrams files',
    input: {
      allowNetwork: false,
      candidateTimestamps: candidates,
      terms: TERM_SET.map(({ id, labelZh, patterns, buckets }) => ({ id, labelZh, patterns, buckets }))
    },
    productionImpact: productionImpactFalseMap(),
    promotionEligible: false,
    productionDisplayApproved: false,
    boundary: BOUNDARY
  };
}

async function buildLiveArtifact(options, candidates) {
  const fetched = await fetchFirstAvailableNgrams(candidates);
  const summary = fetched.text ? analyzeNgramsText(fetched.text) : summarizeMatches([]);
  const status = fetched.timestamp
    ? summary.totalHitCount > 0 ? 'ok' : 'ok_no_oil_terms_observed'
    : 'source_unavailable';
  return {
    diagnosisVersion: DIAGNOSIS_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    mode: 'manual_live_diagnosis',
    sourceKey: 'odp_oil_news_gdelt_web_ngrams_diagnosis',
    source: 'GDELT Web NGrams v5 legacy ngrams files',
    input: {
      allowNetwork: true,
      candidateTimestamps: candidates,
      terms: TERM_SET.map(({ id, labelZh, patterns, buckets }) => ({ id, labelZh, patterns, buckets }))
    },
    selectedFile: fetched.timestamp
      ? {
          timestamp: fetched.timestamp,
          url: fetched.url,
          diagnostics: sanitizeGdeltDiagnostics(fetched.diagnostics)
        }
      : null,
    attempts: fetched.attempts,
    summary,
    productionImpact: productionImpactFalseMap(),
    promotionEligible: false,
    productionDisplayApproved: false,
    limitationsZh: [
      'Web NGrams 是下载型 ngram 频次文件,可降低 DOC API 429 风险,但不是新闻事实确认源。',
      '本诊断不读取 TOC 标题/URL,不保存新闻正文,只统计短语命中与桶计数。',
      '本诊断不写 production data,不改变 Oil News、ODP 或今日总判断。'
    ],
    boundary: BOUNDARY
  };
}

function writeJson(path, payload) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
  return absolutePath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidates = buildCandidateTimestamps(options);
  const artifact = options.allowNetwork
    ? await buildLiveArtifact(options, candidates)
    : buildDryRunArtifact(options, candidates);
  if (options.writeOutput) {
    const outputPath = writeJson(options.output, artifact);
    artifact.outputPath = outputPath;
  }
  if (options.printJson) {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log(`GDELT Web NGrams diagnosis: ${artifact.status.toUpperCase()}`);
    console.log(`mode: ${artifact.mode}`);
    console.log(`selectedFile: ${artifact.selectedFile?.timestamp || 'none'}`);
    console.log(`attempts: ${artifact.attempts?.length || artifact.input.candidateTimestamps.length}`);
    console.log(`hits: ${artifact.summary?.totalHitCount ?? 0}`);
    console.log(`uniqueDocCount: ${artifact.summary?.uniqueDocCount ?? 0}`);
    if (artifact.outputPath) console.log(`outputPath: ${safeRelativePath(artifact.outputPath) || artifact.outputPath}`);
  }
  if (options.strict && artifact.status === 'source_unavailable') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
