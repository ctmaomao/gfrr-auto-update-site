#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'oil-news-claim-ledger-p52';
const WATCH_PATH = 'data/oil-news-event-watch.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/oil-news-claim-ledger-latest.json';
const DEFAULT_MAX_COMMITS = 30;
const DEFAULT_MAX_SAMPLES = 12;
const DEFAULT_MIN_SAMPLES = 2;
const POLARITIES = [
  'risk_escalation',
  'risk_deescalation',
  'mixed_or_contested',
  'market_reaction_only',
  'unclear_or_high_claim'
];
const EVENT_TYPES = [
  'chokepoint',
  'shipping',
  'sanctions',
  'facility',
  'supply',
  'market_reaction',
  'general_energy'
];
const CLAIM_AXES = [
  'transport_security',
  'supply_flow',
  'sanctions_policy',
  'facility_operations',
  'market_reaction',
  'general_energy_context'
];
const SOURCE_TIERS = [
  'primary_wire_or_official',
  'major_financial_media',
  'industry_trade',
  'aggregator_or_blog',
  'low_confidence'
];
const RISK_ESCALATION_RE = /\b(blockade|closure|closed|shut|shutdown|halt|halts|disrupt|disrupted|disruption|mine|mines|mined|attack|attacks|strike|strikes|blast|explosion|fire|outage|war|sanction|sanctions|embargo|injured|missing|blockaded)\b/iu;
const RISK_DEESCALATION_RE = /\b(reopen|reopened|reopening|resume|resumes|resumed|restart|restarts|restarted|return|returns|returned|lifted|license|waiver|ceasefire|truce|de-escalat|deescalat|recover|recovered|restore|restored)\b/iu;
const MARKET_REACTION_RE = /\b(oil|brent|wti|crude|price|prices|futures|spread|spreads|trader|traders|market|risk premium|pre-war|decline|falls|losses|extends|inflation)\b/iu;
const BOUNDARY =
  'manual oil-news claim ledger review only; not production data; no headline display approval; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const PRIMARY_DOMAINS = new Set([
  'reuters.com',
  'apnews.com',
  'bloomberg.com',
  'eia.gov',
  'treasury.gov',
  'whitehouse.gov',
  'energy.gov',
  'ec.europa.eu',
  'consilium.europa.eu',
  'ofac.treasury.gov'
]);
const MAJOR_FINANCIAL_DOMAINS = new Set([
  'wsj.com',
  'ft.com',
  'cnbc.com',
  'marketwatch.com',
  'businessinsider.com',
  'bbc.com',
  'abcnews.com',
  'nbcnews.com',
  'cfr.org'
]);
const INDUSTRY_TRADE_DOMAINS = new Set([
  'worldoil.com',
  'oilandgas360.com',
  'marinelink.com',
  'maritime-executive.com',
  'oilprice.com',
  'rigzone.com',
  'upstreamonline.com',
  'spglobal.com'
]);
const LOW_CONFIDENCE_DOMAINS = new Set([
  'cryptobriefing.com'
]);

function printUsage() {
  console.log(`Usage:
  npm run review:oil-news-claim-ledger -- [options]

Options:
  --input <path>       Oil news watch artifact. May be repeated.
  --input-dir <path>   Directory of oil news watch JSON artifacts. Files are read alphabetically.
  --max-commits <n>    Recent git commits touching ${WATCH_PATH} to inspect when no --input is given. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>    Maximum unique valid samples to review. Default: ${DEFAULT_MAX_SAMPLES}
  --min-samples <n>    Minimum valid samples before claim-ledger readiness can be reviewed. Default: ${DEFAULT_MIN_SAMPLES}
  --output <path>      Manual claim-ledger artifact path. Default: ${DEFAULT_OUTPUT}
  --allow-empty        Exit 0 if no valid sample exists.
  --strict             Exit non-zero on WARN or FAIL.
  --json               Print full JSON review to stdout.
  --no-output          Do not write the review artifact.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    minSamples: DEFAULT_MIN_SAMPLES,
    output: DEFAULT_OUTPUT,
    allowEmpty: false,
    strict: false,
    printJson: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
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
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === '--input') {
      options.inputs.push(nextValue());
    } else if (arg === '--input-dir') {
      options.inputDirs.push(nextValue());
    } else if (arg === '--max-commits') {
      options.maxCommits = Number(nextValue());
    } else if (arg === '--max-samples') {
      options.maxSamples = Number(nextValue());
    } else if (arg === '--min-samples') {
      options.minSamples = Number(nextValue());
    } else if (arg === '--output') {
      options.output = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxCommits) || options.maxCommits < 1 || options.maxCommits > 500) {
    throw new Error('Invalid --max-commits. Expected integer 1..500.');
  }
  if (!Number.isInteger(options.maxSamples) || options.maxSamples < 1 || options.maxSamples > 100) {
    throw new Error('Invalid --max-samples. Expected integer 1..100.');
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 100) {
    throw new Error('Invalid --min-samples. Expected integer 1..100.');
  }
  if (options.writeOutput && !isSafeOutputPath(options.output)) {
    throw new Error(`Refusing to write claim ledger outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('manual-artifacts/'));
}

function isFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('docs/fixtures/'));
}

function isProductionWatchPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === WATCH_PATH;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath) || isProductionWatchPath(filePath);
}

function isSafeOutputPath(filePath) {
  return isManualArtifactPath(filePath);
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw new Error(`Failed to run git ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${stderr || `exit ${result.status}`}`);
  }
  return String(result.stdout ?? '');
}

function readCommitRows(maxCommits) {
  const output = runGit(['log', `--max-count=${maxCommits}`, '--format=%H%x09%ct%x09%s', '--', WATCH_PATH]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, epochText, ...subjectParts] = line.split('\t');
      const epochSeconds = Number(epochText);
      return {
        hash,
        committedAt: Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000).toISOString() : null,
        subject: subjectParts.join('\t')
      };
    });
}

function readWatchAtCommit(commit) {
  return {
    text: runGit(['show', `${commit.hash}:${WATCH_PATH}`]),
    source: {
      type: 'git_history',
      path: WATCH_PATH,
      commitHash: commit.hash,
      committedAt: commit.committedAt,
      commitSubject: commit.subject
    }
  };
}

function expandInputFiles(options) {
  const files = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json' && !name.endsWith('.archive-meta.json'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  return [...new Set(files)];
}

function readInputFile(filePath) {
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing unsafe input path: ${filePath}`);
  return {
    text: readFileSync(filePath, 'utf8'),
    source: {
      type: 'file',
      path: resolve(filePath),
      safeInputPath: true
    }
  };
}

function rawInputs(options) {
  const fileInputs = expandInputFiles(options);
  if (fileInputs.length > 0) {
    return fileInputs.map(readInputFile);
  }
  return readCommitRows(options.maxCommits).slice(0, options.maxSamples).map(readWatchAtCommit);
}

function productionImpactFalseMap() {
  return {
    writesProductionData: false,
    modifiesFrontend: false,
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

function validateNoForbiddenSerializedText(text, label) {
  for (const needle of [
    'TAVILY_API_KEY',
    'TAVILY_API_KEYS',
    'BRAVE_API_KEY',
    'BRAVE_API_KEYS',
    'Authorization',
    'X-Subscription-Token',
    'Bearer ',
    '"snippet"',
    '"body"',
    '"rawResponse"'
  ]) {
    if (text.includes(needle)) throw new Error(`${label} contains forbidden marker: ${needle}`);
  }
}

function hashTitle(title) {
  return createHash('sha256').update(String(title || '').toLowerCase().trim()).digest('hex').slice(0, 16);
}

function termHits(title, regexMap) {
  const text = String(title || '');
  return regexMap.filter(({ re }) => re.test(text)).map(({ term }) => term);
}

const ESCALATION_TERMS = [
  'blockade', 'closure', 'closed', 'shutdown', 'halt', 'disruption', 'mine',
  'attack', 'strike', 'blast', 'explosion', 'fire', 'outage', 'war',
  'sanction', 'embargo', 'injured', 'missing'
].map((term) => ({ term, re: new RegExp(`\\b${term}\\w*\\b`, 'iu') }));
const DEESCALATION_TERMS = [
  'reopen', 'resume', 'restart', 'return', 'lifted', 'license', 'waiver',
  'ceasefire', 'truce', 'de-escalat', 'recover', 'restore'
].map((term) => ({ term, re: new RegExp(`\\b${term}\\w*\\b`, 'iu') }));
const MARKET_TERMS = [
  'oil', 'brent', 'wti', 'crude', 'price', 'futures', 'spread', 'trader',
  'market', 'risk premium', 'decline', 'falls', 'losses', 'inflation'
].map((term) => ({ term, re: new RegExp(`\\b${term.replace(' ', '\\s+')}\\w*\\b`, 'iu') }));

function sourceTier(domain) {
  const normalized = String(domain || '').toLowerCase();
  if (PRIMARY_DOMAINS.has(normalized)) return 'primary_wire_or_official';
  if (MAJOR_FINANCIAL_DOMAINS.has(normalized)) return 'major_financial_media';
  if (INDUSTRY_TRADE_DOMAINS.has(normalized)) return 'industry_trade';
  if (LOW_CONFIDENCE_DOMAINS.has(normalized)) return 'low_confidence';
  if (!normalized || normalized === 'example.com') return 'low_confidence';
  return 'aggregator_or_blog';
}

function eventType(article) {
  const buckets = Array.isArray(article.buckets) ? article.buckets : [];
  const title = String(article.title || '');
  if (/\b(hormuz|suez|red sea|bab el-mandeb|strait|channel)\b/iu.test(title)) {
    return 'chokepoint';
  }
  if (/\b(tanker|shipping|vessel|fleet|transit|insurance|loadings)\b/iu.test(title)) {
    return 'shipping';
  }
  if (/\b(sanction|embargo|ofac|shadow fleet|license|waiver)\b/iu.test(title)) {
    return 'sanctions';
  }
  if (/\b(refinery|terminal|pipeline|plant|facility|explosion|blast|fire|outage)\b/iu.test(title)) {
    return 'facility';
  }
  if (/\b(supply|export|exports|production|disruption|outage)\b/iu.test(title)) {
    return 'supply';
  }
  if (buckets.includes('chokepoint')) return 'chokepoint';
  if (buckets.includes('tanker_shipping')) return 'shipping';
  if (buckets.includes('sanctions')) return 'sanctions';
  if (buckets.includes('supply_disruption')) return 'supply';
  if (buckets.includes('facility_event')) return 'facility';
  if (buckets.includes('market_reaction') || MARKET_REACTION_RE.test(title)) {
    return 'market_reaction';
  }
  return 'general_energy';
}

function claimAxis(type) {
  if (type === 'chokepoint' || type === 'shipping') return 'transport_security';
  if (type === 'supply') return 'supply_flow';
  if (type === 'sanctions') return 'sanctions_policy';
  if (type === 'facility') return 'facility_operations';
  if (type === 'market_reaction') return 'market_reaction';
  return 'general_energy_context';
}

function claimPolarity(article) {
  const title = String(article.title || '');
  const escalation = RISK_ESCALATION_RE.test(title);
  const deescalation = RISK_DEESCALATION_RE.test(title);
  const market = MARKET_REACTION_RE.test(title) || (Array.isArray(article.buckets) && article.buckets.includes('market_reaction'));
  if (escalation && deescalation) return 'mixed_or_contested';
  if (deescalation) return 'risk_deescalation';
  if (escalation) return 'risk_escalation';
  if (market) return 'market_reaction_only';
  return 'unclear_or_high_claim';
}

function compactClaim(article, sample) {
  const polarity = claimPolarity(article);
  const type = eventType(article);
  const domain = typeof article.domain === 'string' ? article.domain : null;
  return {
    titleHash: hashTitle(article.title),
    sampleGeneratedAt: sample.generatedAt,
    publishedAt: isoOrNull(article.publishedAt),
    domain,
    sourceTier: sourceTier(domain),
    sources: Array.isArray(article.sources) ? article.sources.filter(Boolean).sort() : [],
    queryIds: Array.isArray(article.queryIds) ? article.queryIds.filter(Boolean).sort() : [],
    buckets: Array.isArray(article.buckets) ? article.buckets.filter(Boolean).sort() : [],
    eventType: type,
    claimAxis: claimAxis(type),
    claimPolarity: polarity,
    triggerTerms: {
      escalation: termHits(article.title, ESCALATION_TERMS),
      deescalation: termHits(article.title, DEESCALATION_TERMS),
      market: termHits(article.title, MARKET_TERMS)
    },
    directHeadlineDisplayAllowed: false
  };
}

function extractSample(raw, index) {
  const label = raw.source.type === 'git_history'
    ? `${raw.source.commitHash}:${WATCH_PATH}`
    : raw.source.path;
  validateNoForbiddenSerializedText(raw.text, label);
  const artifact = JSON.parse(raw.text);
  if (artifact.schemaVersion !== 'oil-news-event-watch-1') {
    throw new Error(`${label} has unsupported schemaVersion: ${artifact.schemaVersion ?? '(missing)'}`);
  }
  if (artifact.module !== 'oil-news-event-watch') {
    throw new Error(`${label} has unsupported module: ${artifact.module ?? '(missing)'}`);
  }
  const generatedAt = isoOrNull(artifact.generatedAt);
  if (!generatedAt) throw new Error(`${label} has invalid generatedAt.`);
  if (artifact.promotionEligible !== false) throw new Error(`${label} must keep promotionEligible=false.`);
  if (artifact.productionDisplayApproved !== true) throw new Error(`${label} must keep productionDisplayApproved=true.`);
  const productionImpact = artifact.productionImpact && typeof artifact.productionImpact === 'object'
    ? artifact.productionImpact
    : null;
  if (!productionImpact) throw new Error(`${label} is missing productionImpact map.`);
  const truthyImpact = Object.entries(productionImpact)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (truthyImpact.length > 0) {
    throw new Error(`${label} has productionImpact=true fields: ${truthyImpact.join(', ')}`);
  }

  const topArticles = Array.isArray(artifact.topArticles) ? artifact.topArticles : [];
  const sample = {
    index,
    source: raw.source,
    generatedAt,
    status: artifact.status ?? null,
    signalState: artifact.signalState ?? null,
    aggregate: {
      uniqueArticleCount: finiteNumber(artifact.aggregate?.uniqueArticleCount),
      liveSourceCount: finiteNumber(artifact.aggregate?.liveSourceCount),
      confidence: artifact.aggregate?.confidence ?? null
    },
    titleRisk: {
      highClaimTitleCount: finiteNumber(artifact.titleRisk?.highClaimTitleCount),
      displayHeadlinesApproved: artifact.headlineDisplayReadiness?.displayHeadlinesApproved === true
    },
    topArticleCount: topArticles.length,
    claimCount: 0,
    claims: []
  };
  sample.claims = topArticles.map((article) => compactClaim(article, sample));
  sample.claimCount = sample.claims.length;
  return sample;
}

function countBy(items, key) {
  const counts = Object.create(null);
  for (const item of items) {
    const value = typeof key === 'function' ? key(item) : item[key];
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function fillCounts(keys, counts) {
  return Object.fromEntries(keys.map((key) => [key, counts[key] || 0]));
}

function axisCounts(claims) {
  return Object.fromEntries(CLAIM_AXES.map((axis) => {
    const rows = claims.filter((claim) => claim.claimAxis === axis);
    const eventTypes = [...new Set(rows.map((claim) => claim.eventType).filter(Boolean))].sort();
    return [axis, {
      total: rows.length,
      escalation: rows.filter((claim) => claim.claimPolarity === 'risk_escalation').length,
      deescalation: rows.filter((claim) => claim.claimPolarity === 'risk_deescalation').length,
      mixed: rows.filter((claim) => claim.claimPolarity === 'mixed_or_contested').length,
      marketReactionOnly: rows.filter((claim) => claim.claimPolarity === 'market_reaction_only').length,
      unclearOrHighClaim: rows.filter((claim) => claim.claimPolarity === 'unclear_or_high_claim').length,
      lowConfidenceHighClaimCount: rows.filter((claim) => (
        (claim.sourceTier === 'low_confidence' || claim.sourceTier === 'aggregator_or_blog') &&
        (claim.claimPolarity === 'risk_escalation' || claim.claimPolarity === 'mixed_or_contested')
      )).length,
      eventTypes,
      sourceTierCounts: fillCounts(SOURCE_TIERS, countBy(rows, 'sourceTier'))
    }];
  }));
}

function axisSplitState(counts, contradiction) {
  const transport = counts.transport_security || {};
  const supply = counts.supply_flow || {};
  const transportRiskElevated = finiteNumber(transport.escalation) + finiteNumber(transport.mixed) > 0;
  const supplyFlowDeescalating = finiteNumber(supply.deescalation) > 0
    && finiteNumber(supply.escalation) === 0
    && finiteNumber(supply.mixed) === 0;
  const escalationAxes = CLAIM_AXES.filter((axis) => {
    const row = counts[axis] || {};
    return finiteNumber(row.escalation) + finiteNumber(row.mixed) > 0;
  });
  const deescalationAxes = CLAIM_AXES.filter((axis) => finiteNumber(counts[axis]?.deescalation) > 0);
  const state = transportRiskElevated && supplyFlowDeescalating
    ? 'security_risk_vs_supply_flow_split'
    : (contradiction.state === 'mixed_claims' ? 'mixed_claims_not_axis_resolved' : 'not_needed');

  return {
    state,
    supportsOperatorReview: state === 'security_risk_vs_supply_flow_split',
    escalationAxes,
    deescalationAxes,
    interpretationCode: state === 'security_risk_vs_supply_flow_split'
      ? 'transport_security_risk_elevated_while_supply_flow_deescalates'
      : 'no_axis_split_clearance',
    doesNotConfirm: [
      'hormuz_closure',
      'supply_disruption',
      'route_freight_confirmation',
      'oil_price_direction'
    ]
  };
}

function contradictionState(claims) {
  const byEventType = EVENT_TYPES.map((type) => {
    const rows = claims.filter((claim) => claim.eventType === type);
    const escalation = rows.filter((claim) => claim.claimPolarity === 'risk_escalation').length;
    const deescalation = rows.filter((claim) => claim.claimPolarity === 'risk_deescalation').length;
    const mixed = rows.filter((claim) => claim.claimPolarity === 'mixed_or_contested').length;
    return {
      eventType: type,
      escalation,
      deescalation,
      mixed,
      contradiction: (escalation > 0 && deescalation > 0) || mixed > 0
    };
  }).filter((row) => row.escalation > 0 || row.deescalation > 0 || row.mixed > 0);
  const contradictory = byEventType.filter((row) => row.contradiction);
  if (contradictory.length > 0) {
    return {
      state: 'mixed_claims',
      eventTypes: contradictory.map((row) => row.eventType),
      details: byEventType
    };
  }
  const totalEscalation = byEventType.reduce((sum, row) => sum + row.escalation + row.mixed, 0);
  const totalDeescalation = byEventType.reduce((sum, row) => sum + row.deescalation, 0);
  if (totalEscalation > totalDeescalation && totalEscalation > 0) return { state: 'risk_escalation_dominant', eventTypes: [], details: byEventType };
  if (totalDeescalation > totalEscalation && totalDeescalation > 0) return { state: 'risk_deescalation_dominant', eventTypes: [], details: byEventType };
  return { state: 'no_directional_claim_dominance', eventTypes: [], details: byEventType };
}

function representativeClaims(claims) {
  const tierRank = Object.fromEntries(SOURCE_TIERS.map((tier, index) => [tier, index]));
  return [...claims]
    .sort((a, b) => {
      const tierDelta = (tierRank[a.sourceTier] ?? 9) - (tierRank[b.sourceTier] ?? 9);
      if (tierDelta !== 0) return tierDelta;
      const polarityDelta = POLARITIES.indexOf(a.claimPolarity) - POLARITIES.indexOf(b.claimPolarity);
      if (polarityDelta !== 0) return polarityDelta;
      return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
    })
    .slice(0, 20);
}

function addWarning(review, message) {
  review.warnings.push(message);
}

function buildReview(options, samples, invalid) {
  const validSamples = samples.slice(0, options.maxSamples);
  const allClaims = validSamples.flatMap((sample) => sample.claims);
  const generatedAts = validSamples.map((sample) => sample.generatedAt).sort();
  const polarityCounts = fillCounts(POLARITIES, countBy(allClaims, 'claimPolarity'));
  const eventTypeCounts = fillCounts(EVENT_TYPES, countBy(allClaims, 'eventType'));
  const claimAxisCounts = fillCounts(CLAIM_AXES, countBy(allClaims, 'claimAxis'));
  const axisCountDetails = axisCounts(allClaims);
  const sourceTierCounts = fillCounts(SOURCE_TIERS, countBy(allClaims, 'sourceTier'));
  const contradiction = contradictionState(allClaims);
  const axisSplit = axisSplitState(axisCountDetails, contradiction);
  const lowConfidenceHighClaimCount = allClaims.filter((claim) => (
    (claim.sourceTier === 'low_confidence' || claim.sourceTier === 'aggregator_or_blog') &&
    (claim.claimPolarity === 'risk_escalation' || claim.claimPolarity === 'mixed_or_contested')
  )).length;

  const review = {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    status: 'pass',
    recommendation: 'claim_ledger_ready_for_manual_review_keep_display_only',
    promotionEligible: false,
    productionDisplayApproved: false,
    input: {
      mode: options.inputs.length > 0 || options.inputDirs.length > 0 ? 'explicit_inputs' : 'git_history',
      watchPath: WATCH_PATH,
      maxCommits: options.maxCommits,
      maxSamples: options.maxSamples,
      minSamples: options.minSamples
    },
    summary: {
      sampleCount: validSamples.length,
      invalidSampleCount: invalid.length,
      firstSampleAt: generatedAts[0] ?? null,
      lastSampleAt: generatedAts[generatedAts.length - 1] ?? null,
      claimCount: allClaims.length,
      uniqueTitleHashCount: new Set(allClaims.map((claim) => claim.titleHash)).size,
      lowConfidenceHighClaimCount,
      directHeadlineDisplayAllowed: false
    },
    polarityCounts,
    eventTypeCounts,
    claimAxisCounts,
    axisCounts: axisCountDetails,
    axisSplit,
    sourceTierCounts,
    contradiction,
    displayReadiness: {
      directHeadlineDisplayAllowed: false,
      originalHeadlineOutputAllowed: false,
      claimSummaryDisplayCandidate: validSamples.length >= options.minSamples && allClaims.length > 0,
      requiredNextReview: 'separate reviewed frontend PR may show aggregate claim polarity only; no raw headline display'
    },
    manualReviewPriorities: {
      mixedClaimsRequireHumanReview: contradiction.state === 'mixed_claims',
      escalationClaimsNeedMarketPhysicalCrossCheck: polarityCounts.risk_escalation + polarityCounts.mixed_or_contested,
      deescalationClaimsMayReduceRiskPremium: polarityCounts.risk_deescalation,
      marketReactionOnlyClaimsShouldNotDriveEventConfidence: polarityCounts.market_reaction_only,
      lowConfidenceHighClaimCount
    },
    representativeClaims: representativeClaims(allClaims),
    sampleOutcomes: validSamples.map((sample) => ({
      generatedAt: sample.generatedAt,
      source: sample.source.type === 'git_history'
        ? { type: 'git_history', commitHash: sample.source.commitHash, committedAt: sample.source.committedAt }
        : { type: 'file', path: sample.source.path },
      status: sample.status,
      signalState: sample.signalState,
      uniqueArticleCount: sample.aggregate.uniqueArticleCount,
      liveSourceCount: sample.aggregate.liveSourceCount,
      topArticleCount: sample.topArticleCount,
      claimCount: sample.claimCount,
      highClaimTitleCount: sample.titleRisk.highClaimTitleCount,
      displayHeadlinesApproved: sample.titleRisk.displayHeadlinesApproved,
      polarityCounts: fillCounts(POLARITIES, countBy(sample.claims, 'claimPolarity')),
      eventTypeCounts: fillCounts(EVENT_TYPES, countBy(sample.claims, 'eventType')),
      claimAxisCounts: fillCounts(CLAIM_AXES, countBy(sample.claims, 'claimAxis'))
    })),
    invalid,
    warnings: [],
    blockers: [],
    productionImpact: productionImpactFalseMap(),
    boundary: BOUNDARY
  };

  if (invalid.length > 0) addWarning(review, `${invalid.length} invalid sample(s) were skipped before claim-ledger review.`);
  if (validSamples.length === 0) {
    if (options.allowEmpty) addWarning(review, 'No oil-news event watch samples were found.');
    else review.blockers.push('No oil-news event watch samples were found.');
  }
  if (validSamples.length < options.minSamples) {
    addWarning(review, `Need ${options.minSamples} valid samples before claim-ledger readiness; found ${validSamples.length}.`);
  }
  if (allClaims.length === 0 && validSamples.length > 0) {
    addWarning(review, 'No compact article claims were available in sampled oil-news artifacts.');
  }
  if (contradiction.state === 'mixed_claims') {
    addWarning(review, 'Risk escalation and de-escalation claims coexist in the same event family; keep event interpretation as mixed/manual-review.');
  }
  if (lowConfidenceHighClaimCount > 0) {
    addWarning(review, 'Low-confidence or aggregator/blog domains carry high-claim escalation language; do not raise confidence without primary-source confirmation.');
  }
  if (validSamples.some((sample) => sample.titleRisk.displayHeadlinesApproved)) {
    review.blockers.push('At least one sample has displayHeadlinesApproved=true; headline display must remain disabled.');
  }

  if (review.blockers.length > 0) {
    review.status = 'fail';
    review.recommendation = 'fix_claim_ledger_sample_contract_before_review';
  } else if (review.warnings.length > 0) {
    review.status = 'warn';
    review.recommendation = 'claim_ledger_ready_keep_manual_review';
  }

  return review;
}

function assertNoHeadlineLeak(review) {
  const serialized = JSON.stringify(review);
  for (const needle of [
    '"title"',
    '"url"',
    'Hormuz reopening',
    'Strait of Hormuz closure',
    'Explosion at Qatar',
    'Oil extends',
    'Iraq to export',
    'TAVILY_API_KEY',
    'BRAVE_API_KEY',
    'Authorization',
    'Bearer ',
    '"snippet"',
    '"body"',
    '"rawResponse"',
    '"displayHeadlinesApproved":true',
    '"directHeadlineDisplayAllowed":true'
  ]) {
    if (serialized.includes(needle)) {
      throw new Error(`Claim ledger output contains forbidden marker: ${needle}`);
    }
  }
}

function writeReview(review, options) {
  if (!options.writeOutput) return;
  const absoluteOutput = resolve(options.output);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  review.outputPath = absoluteOutput;
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Oil news claim ledger review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`promotionEligible: ${review.promotionEligible}`);
  console.log(`productionDisplayApproved: ${review.productionDisplayApproved}`);
  console.log(`sampleCount: ${review.summary.sampleCount}`);
  console.log(`claimCount: ${review.summary.claimCount}`);
  console.log(`contradictionState: ${review.contradiction.state}`);
  console.log(`riskEscalation: ${review.polarityCounts.risk_escalation}`);
  console.log(`riskDeescalation: ${review.polarityCounts.risk_deescalation}`);
  console.log(`marketReactionOnly: ${review.polarityCounts.market_reaction_only}`);
  console.log(`directHeadlineDisplayAllowed: ${review.displayReadiness.directHeadlineDisplayAllowed}`);
  if (review.outputPath) console.log(`outputPath: ${review.outputPath}`);
  console.log(`warnings: ${review.warnings.length}`);
  for (const [index, warning] of review.warnings.slice(0, 6).entries()) {
    console.log(`warning[${index}]: ${warning}`);
  }
  if (review.warnings.length > 6) console.log(`warning[more]: ${review.warnings.length - 6} additional warnings omitted`);
  console.log(`blockers: ${review.blockers.length}`);
  for (const [index, blocker] of review.blockers.slice(0, 5).entries()) {
    console.log(`blocker[${index}]: ${blocker}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const raws = rawInputs(options);
  const samples = [];
  const invalid = [];
  const seenGeneratedAt = new Set();

  for (const [index, raw] of raws.entries()) {
    try {
      const sample = extractSample(raw, index);
      if (seenGeneratedAt.has(sample.generatedAt)) continue;
      seenGeneratedAt.add(sample.generatedAt);
      samples.push(sample);
    } catch (error) {
      invalid.push({
        source: raw.source,
        reason: error.message
      });
    }
  }

  const review = buildReview(options, samples, invalid);
  assertNoHeadlineLeak(review);
  writeReview(review, options);

  if (options.printJson) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    printSummary(review);
  }
  if (review.status === 'fail' || (options.strict && review.status !== 'pass')) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
