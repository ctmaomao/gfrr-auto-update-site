#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const DEFAULT_NEWS_INPUT = 'data/oil-news-event-watch.json';
const DEFAULT_FACILITIES = 'config/oil-thermal-watch-facilities.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/targeted-probe-plan-latest.json';
const DEFAULT_TARGET_FACILITIES_OUTPUT = 'manual-artifacts/oil-thermal/targeted-probe-facilities-latest.json';
const DEFAULT_WINDOWS = [1, 3, 5];
const DEFAULT_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
const MAX_TARGET_FACILITIES = 12;
const BOUNDARY = 'artifact-only targeted facility probe plan; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const GENERIC_ALIAS_WORDS = new Set([
  'area',
  'proxy',
  'refinery',
  'terminal',
  'port',
  'field',
  'oil',
  'energy',
  'industrial',
  'processing',
  'gosp',
  'island'
]);

const FACILITY_ALIASES = new Map([
  ['me_saudi_oil_terminal_ras_tanura', ['ras tanura']],
  ['me_saudi_oil_processing_abqaiq_buqayq', ['abqaiq', 'buqayq']],
  ['me_saudi_gosp_khurais', ['khurais']],
  ['me_saudi_oil_field_shaybah', ['shaybah']],
  ['me_saudi_port_yanbu_industrial_city', ['yanbu', 'yanbu industrial city']],
  ['me_saudi_port_jazan', ['jazan']],
  ['me_iran_oil_terminal_kharg_island', ['kharg', 'kharg island']],
  ['me_iran_refinery_tehran_oil_refinery', ['tehran oil refinery', 'tehran refinery']],
  ['me_iran_refinery_area_abadan', ['abadan']],
  ['me_iran_refinery_area_bandar_abbas', ['bandar abbas']],
  ['me_iran_energy_area_asaluyeh', ['asaluyeh', 'assaluyeh']],
  ['me_israel_refinery_area_haifa_bay', ['haifa bay', 'haifa refinery']],
  ['me_israel_refinery_area_ashdod', ['ashdod']],
  ['me_israel_port_eilat', ['eilat']],
  ['me_uae_ruwais_refinery_area', ['ruwais']],
  ['me_uae_jebel_dhanna_terminal_area', ['jebel dhanna', 'jabal az zannah']],
  ['me_uae_das_island_terminal_area', ['das island', 'das island terminal']],
  ['me_uae_fujairah_energy_port_area', ['fujairah']],
  ['me_qatar_ras_laffan_energy_port_area', ['ras laffan', "ra's laffan"]],
  ['me_qatar_mesaieed_industrial_port_area', ['mesaieed', 'mesaied', 'musayid', 'musay id', 'umm said']],
  ['me_qatar_dukhan_oilfield_area', ['dukhan']],
  ['me_qatar_halul_terminal_area', ['halul', 'halul island']],
  ['me_kuwait_mina_al_ahmadi_terminal_area', ['mina al ahmadi', 'minaa al ahmadi', 'mena al ahmadi']],
  ['me_kuwait_mina_abdullah_terminal_area', ['mina abdullah', 'mina abd allah', 'minaa abdullah']],
  ['me_kuwait_shuaiba_port_refinery_area', ['shuaiba', 'shuaiba port']],
  ['me_kuwait_burgan_oilfield_area', ['burgan']],
  ['me_iraq_khawr_al_amaya_terminal_area', ['khawr al amaya', 'khor al amaya', 'khor-al-amaya']],
  ['me_iraq_zubair_oilfield_area', ['zubair', 'zubayr', 'az zubayr']],
  ['me_iraq_rumaila_oilfield_area', ['rumaila', 'rumaila field']],
  ['me_iraq_kirkuk_oilfield_area', ['kirkuk']]
]);

function printUsage() {
  console.log(`Usage: node scripts/oil-directional/run-oil-thermal-targeted-probe.mjs [options]

Options:
  --oil-news <path>      Oil news event watch JSON. Default: ${DEFAULT_NEWS_INPUT}
  --facilities <path>    Oil thermal facilities config. Default: ${DEFAULT_FACILITIES}
  --output <path>        Plan artifact path. Default: ${DEFAULT_OUTPUT}
  --target-facilities <path>
                         Facilities artifact for diagnose:firms-thermal. Default: ${DEFAULT_TARGET_FACILITIES_OUTPUT}
  --sources <csv>        FIRMS source list for planned diagnosis. Default: ${DEFAULT_SOURCES.join(',')}
  --windows <csv>        Diagnosis day windows. Default: ${DEFAULT_WINDOWS.join(',')}
  --max-facilities <n>   Max matched facilities to carry forward. Default: ${MAX_TARGET_FACILITIES}
  --run-diagnosis        Execute diagnose:firms-thermal for each planned window.
  --dry-run              Do not write artifacts and do not run diagnosis.
  --no-output            Do not write artifacts.
  --help                 Show this help.`);
}

function parseCsv(value) {
  return String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    oilNewsInput: DEFAULT_NEWS_INPUT,
    facilitiesPath: DEFAULT_FACILITIES,
    output: DEFAULT_OUTPUT,
    targetFacilitiesOutput: DEFAULT_TARGET_FACILITIES_OUTPUT,
    sources: DEFAULT_SOURCES,
    windows: DEFAULT_WINDOWS,
    maxFacilities: MAX_TARGET_FACILITIES,
    runDiagnosis: false,
    writeOutput: true,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--run-diagnosis') {
      options.runDiagnosis = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      options.writeOutput = false;
      options.runDiagnosis = false;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    const nextValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === '--oil-news') {
      options.oilNewsInput = nextValue();
    } else if (arg === '--facilities') {
      options.facilitiesPath = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--target-facilities') {
      options.targetFacilitiesOutput = nextValue();
    } else if (arg === '--sources') {
      options.sources = parseCsv(nextValue());
    } else if (arg === '--windows') {
      options.windows = parseCsv(nextValue()).map(Number);
    } else if (arg === '--max-facilities') {
      options.maxFacilities = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Array.isArray(options.sources) || options.sources.length === 0) throw new Error('--sources must not be empty');
  if (!Array.isArray(options.windows) || options.windows.length === 0
    || options.windows.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) {
    throw new Error('--windows must be comma-separated integers in 1..5');
  }
  if (!Number.isInteger(options.maxFacilities) || options.maxFacilities < 1 || options.maxFacilities > 50) {
    throw new Error('--max-facilities must be 1..50');
  }
  options.sources = [...new Set(options.sources)];
  options.windows = [...new Set(options.windows)].sort((a, b) => a - b);
  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function writeJson(path, data) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`);
  return absolutePath;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘’'`]/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase()
    .trim();
}

function hashText(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function sourceDomain(article) {
  if (typeof article.domain === 'string' && article.domain) return article.domain;
  if (typeof article.sourceDomain === 'string' && article.sourceDomain) return article.sourceDomain;
  if (typeof article.url === 'string' && article.url) {
    try {
      return new URL(article.url).hostname.replace(/^www\./u, '');
    } catch {
      return 'unparsed_url_domain';
    }
  }
  return 'unknown_domain';
}

function collectArticles(value, articles = []) {
  if (!value || typeof value !== 'object') return articles;
  if (Array.isArray(value)) {
    for (const item of value) collectArticles(item, articles);
    return articles;
  }
  const title = typeof value.title === 'string' ? value.title : '';
  const summary = typeof value.summary === 'string' ? value.summary : '';
  const description = typeof value.description === 'string' ? value.description : '';
  if (title || summary || description) {
    const scanText = [title, summary, description].filter(Boolean).join(' ');
    articles.push({
      scanText,
      domain: sourceDomain(value),
      source: Array.isArray(value.sources) ? value.sources.join(',') : String(value.source || ''),
      hash: hashText(`${title}|${summary}|${description}|${value.url || ''}`)
    });
  }
  for (const child of Object.values(value)) collectArticles(child, articles);
  return articles;
}

function sourceNoteFullName(facility) {
  const match = String(facility.sourceNote || '').match(/full_name=([^;]+)/u);
  return match ? match[1] : '';
}

function buildFacilityAliases(facility) {
  const aliases = new Set();
  for (const alias of (FACILITY_ALIASES.get(facility.id) || [])) aliases.add(alias);
  aliases.add(facility.label);
  aliases.add(sourceNoteFullName(facility));

  const compactLabel = String(facility.label || '')
    .replace(/\b(refinery|terminal|oilfield|oil field|port|energy|industrial|processing|gosp|area|proxy)\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (compactLabel) aliases.add(compactLabel);

  const idParts = String(facility.id || '').split('_').filter((part) => part && !GENERIC_ALIAS_WORDS.has(part));
  if (idParts.length >= 2) aliases.add(idParts.slice(-2).join(' '));

  return [...aliases]
    .map(normalizeText)
    .filter((alias) => alias.length >= 4 && !GENERIC_ALIAS_WORDS.has(alias))
    .sort((a, b) => b.length - a.length);
}

function textContainsAlias(scanText, alias) {
  const haystack = ` ${normalizeText(scanText)} `;
  const needle = ` ${alias} `;
  return haystack.includes(needle);
}

function matchFacilities({ facilities, articles, maxFacilities }) {
  const matches = [];
  for (const facility of facilities) {
    const aliases = buildFacilityAliases(facility);
    const matchedArticles = [];
    const matchedAliases = new Set();
    for (const article of articles) {
      const alias = aliases.find((candidate) => textContainsAlias(article.scanText, candidate));
      if (!alias) continue;
      matchedAliases.add(alias);
      matchedArticles.push({
        evidenceHash: article.hash,
        domain: article.domain,
        source: article.source || null
      });
    }
    if (matchedArticles.length === 0) continue;
    const domains = [...new Set(matchedArticles.map((item) => item.domain))].sort();
    matches.push({
      id: facility.id,
      label: facility.label,
      region: facility.region,
      assetType: facility.assetType,
      bbox: facility.bbox,
      sourceNote: facility.sourceNote,
      matchedAliasCount: matchedAliases.size,
      matchedAliases: [...matchedAliases].sort(),
      matchedArticleCount: matchedArticles.length,
      sourceDomainCount: domains.length,
      sourceDomains: domains.slice(0, 10),
      evidenceHashes: [...new Set(matchedArticles.map((item) => item.evidenceHash))].slice(0, 20)
    });
  }
  matches.sort((a, b) => (
    b.sourceDomainCount - a.sourceDomainCount
    || b.matchedArticleCount - a.matchedArticleCount
    || a.id.localeCompare(b.id)
  ));
  return matches.slice(0, maxFacilities);
}

function buildTargetFacilities(matches) {
  return matches.map((facility) => ({
    id: facility.id,
    label: facility.label,
    region: facility.region,
    assetType: facility.assetType,
    bbox: facility.bbox,
    sourceNote: facility.sourceNote
  }));
}

function runDiagnosis({ options, windows, targetFacilitiesOutput }) {
  const runs = [];
  for (const dayRange of windows) {
    const output = `manual-artifacts/oil-thermal/targeted-probe-${dayRange}d-latest.json`;
    const args = [
      'scripts/oil-directional/diagnose-firms-thermal.mjs',
      '--facilities',
      targetFacilitiesOutput,
      '--sources',
      options.sources.join(','),
      '--day-range',
      String(dayRange),
      '--output',
      output,
      '--quiet'
    ];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    runs.push({
      dayRange,
      status: result.status === 0 ? 'ok' : 'failed',
      exitCode: result.status,
      output,
      stderrSnippet: result.stderr ? result.stderr.slice(0, 400) : null
    });
  }
  return runs;
}

function buildPlan({ options, generatedAt, news, facilities }) {
  const articles = collectArticles(news);
  const matches = matchFacilities({
    facilities,
    articles,
    maxFacilities: options.maxFacilities
  });
  const targetFacilities = buildTargetFacilities(matches);
  const status = matches.length > 0 ? 'targets_ready' : 'no_facility_mentions';
  return {
    schemaVersion: 'oil-thermal-targeted-probe-plan-1',
    module: 'oil-thermal-targeted-probe',
    generatedAt,
    status,
    oilNewsInput: options.oilNewsInput,
    facilitiesInput: options.facilitiesPath,
    articleScan: {
      articleObjectCount: articles.length,
      rawTitleOutputSuppressed: true,
      evidenceMode: 'domain_and_hash_only'
    },
    matchedFacilityCount: matches.length,
    matchedFacilities: matches,
    diagnosisPlan: {
      runDiagnosis: options.runDiagnosis,
      windowsDays: options.windows,
      sources: options.sources,
      targetFacilitiesOutput: options.targetFacilitiesOutput,
      plannedCommands: options.windows.map((dayRange) => (
        `npm run diagnose:firms-thermal -- --facilities ${options.targetFacilitiesOutput} --sources ${options.sources.join(',')} --day-range ${dayRange}`
      ))
    },
    targetFacilities,
    productionImpact: {
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    },
    boundary: BOUNDARY
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const news = readJson(options.oilNewsInput);
  const facilitiesConfig = readJson(options.facilitiesPath);
  const facilities = Array.isArray(facilitiesConfig) ? facilitiesConfig : facilitiesConfig.facilities;
  if (!Array.isArray(facilities) || facilities.length === 0) {
    throw new Error('Facilities input must contain a non-empty array');
  }
  const plan = buildPlan({ options, generatedAt, news, facilities });

  let planOutputPath = null;
  let targetFacilitiesOutputPath = null;
  if (options.writeOutput && !options.dryRun) {
    planOutputPath = writeJson(options.output, plan);
    if (plan.targetFacilities.length > 0) {
      targetFacilitiesOutputPath = writeJson(options.targetFacilitiesOutput, {
        schemaVersion: 'oil-thermal-targeted-probe-facilities-1',
        generatedAt,
        sourcePlan: options.output,
        facilities: plan.targetFacilities,
        boundary: BOUNDARY
      });
    }
  }

  let diagnosisRuns = [];
  if (options.runDiagnosis && !options.dryRun) {
    if (plan.targetFacilities.length === 0) {
      throw new Error('No targeted facilities matched; refusing to run empty diagnosis');
    }
    if (!existsSync(resolve(options.targetFacilitiesOutput))) {
      throw new Error('Target facilities artifact missing before diagnosis run');
    }
    diagnosisRuns = runDiagnosis({
      options,
      windows: options.windows,
      targetFacilitiesOutput: options.targetFacilitiesOutput
    });
  }

  const response = {
    status: plan.status,
    matchedFacilityCount: plan.matchedFacilityCount,
    matchedFacilities: plan.matchedFacilities.map((facility) => ({
      id: facility.id,
      label: facility.label,
      matchedArticleCount: facility.matchedArticleCount,
      sourceDomainCount: facility.sourceDomainCount,
      sourceDomains: facility.sourceDomains,
      evidenceHashes: facility.evidenceHashes
    })),
    diagnosisPlan: plan.diagnosisPlan,
    diagnosisRuns,
    outputPath: planOutputPath,
    targetFacilitiesOutputPath,
    boundary: BOUNDARY
  };
  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(`Oil thermal targeted probe failed: ${error.message}`);
  process.exit(1);
});
