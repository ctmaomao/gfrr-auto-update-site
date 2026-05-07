import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import https from 'node:https';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const EXPECTED_FRONTEND_VERSION = '28.0J-2';
const EXPECTED_CONTRACTS = {
  dailyBrief: 'v28.0I-1',
  divergenceLayer: 'v28.0I-3A',
  brentPricingLayer: 'v28.0I-5A',
  aiInterpretationLayer: 'v28.0J-0',
  externalAiInterpretationLayer: 'v28.0K-3A'
};

const FRONTEND_ENDPOINTS = [
  'https://ctmaomao.github.io/gfrr-auto-update-site/',
  'https://radar.gfrfinradar.uk/'
];

const DATA_ENDPOINTS = [
  'https://ctmaomao.github.io/gfrr-auto-update-site/data/radar-data.json',
  'https://radar.gfrfinradar.uk/data/radar-data.json'
];

const REQUIRED_LOCAL_FILES = [
  'docs/EXTERNAL_AI_API_DESIGN.md',
  'docs/EXTERNAL_AI_PROMPT_CONTRACT.md',
  'docs/fixtures/external-ai/sample-input-v28.0K-1.json',
  'docs/fixtures/external-ai/sample-output-v28.0K-1.json',
  'docs/fixtures/external-ai/sample-audit-result-v28.0K-1.json',
  'scripts/check-external-ai-output.mjs'
];

const FORBIDDEN_AFFIRMATIVE_COPY = [
  'DeepSeek 已接入',
  'OpenAI 已接入',
  '外部 AI 已启用',
  '外部 AI 已验证市场事实',
  '外部 AI 已确认危机',
  '危机已经爆发',
  '必然崩盘',
  '必然逼空',
  '世界大战',
  '战争概率',
  '已经进入第三次世界大战',
  '13步已走几步',
  'guaranteed',
  'certainty',
  'sure thing',
  'risk-free',
  '真实 Dated Brent 已接入',
  'Platts Dated Brent 已接入',
  '实物油价已经确认'
];

const SAFE_NEGATION_PREFIXES = [
  '不',
  '非',
  '无',
  '未',
  '禁止',
  '避免',
  '不得',
  '不能',
  '不可',
  '不是',
  '不代表',
  '不调用',
  '未启用',
  'not',
  'no'
];

const SAFE_NEGATIVE_PHRASES = [
  '不调用 DeepSeek / OpenAI',
  '不是 active external AI',
  '不得显示为外部 AI 已启用',
  '不代表 DeepSeek 已接入',
  '不代表 OpenAI 已接入',
  '不代表外部 AI 已启用'
];

function addWarning(audit, message) {
  audit.warnings.push(message);
}

function addError(audit, message) {
  audit.errors.push(message);
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

function getText(url) {
  return new Promise((resolve) => {
    const request = https.get(
      url,
      {
        headers: {
          'cache-control': 'no-cache',
          'user-agent': 'gfrr-stable-observation-audit/1.0'
        },
        timeout: 15000
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            statusCode: response.statusCode,
            body
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('request-timeout'));
    });
    request.on('error', (error) => {
      resolve({
        ok: false,
        statusCode: null,
        body: '',
        error: error.message
      });
    });
  });
}

function isAscii(value) {
  return /^[\x00-\x7F]*$/u.test(value);
}

function phraseOccurrenceIsSafe(text, phrase, index) {
  const haystack = isAscii(phrase) ? text.toLowerCase() : text;
  const needle = isAscii(phrase) ? phrase.toLowerCase() : phrase;
  const safePhrases = SAFE_NEGATIVE_PHRASES.map((item) => (isAscii(phrase) ? item.toLowerCase() : item));

  for (const safePhrase of safePhrases) {
    if (!safePhrase.includes(needle)) continue;
    let safeIndex = haystack.indexOf(safePhrase);
    while (safeIndex !== -1) {
      const safeEnd = safeIndex + safePhrase.length;
      if (index >= safeIndex && index + needle.length <= safeEnd) return true;
      safeIndex = haystack.indexOf(safePhrase, safeIndex + 1);
    }
  }

  const prefix = haystack.slice(Math.max(0, index - 14), index).trim();
  return SAFE_NEGATION_PREFIXES.some((marker) => prefix.endsWith(marker.toLowerCase()));
}

function scanForbiddenCopy(text, source) {
  const hits = [];
  for (const phrase of FORBIDDEN_AFFIRMATIVE_COPY) {
    const haystack = isAscii(phrase) ? text.toLowerCase() : text;
    const needle = isAscii(phrase) ? phrase.toLowerCase() : phrase;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      if (!phraseOccurrenceIsSafe(text, phrase, index)) {
        hits.push({ source, phrase });
      }
      index = haystack.indexOf(needle, index + needle.length);
    }
  }
  return hits;
}

function parseFrontendVersion(html) {
  const scriptMatch = html.match(/scripts\/app\.js\?v=([A-Za-z0-9._-]+)/u);
  if (scriptMatch) return scriptMatch[1];
  const globalMatch = html.match(/__GFRR_FRONTEND_VERSION__\s*=\s*['"]([^'"]+)/u);
  return globalMatch ? globalMatch[1] : null;
}

function assertEqual(audit, condition, message) {
  if (!condition) addError(audit, message);
}

function warnEqual(audit, condition, message) {
  if (!condition) addWarning(audit, message);
}

function validateExternalAiLayer(audit, endpoint, layer) {
  if (!layer) return { exists: false };

  const boundaries = layer.boundaries || {};
  const inputDigest = layer.inputDigest || {};
  const layerAudit = layer.audit || {};

  assertEqual(audit, layer.contractVersion === EXPECTED_CONTRACTS.externalAiInterpretationLayer, `${endpoint}: externalAiInterpretationLayer.contractVersion must be ${EXPECTED_CONTRACTS.externalAiInterpretationLayer}`);
  assertEqual(audit, layer.enabled === false, `${endpoint}: externalAiInterpretationLayer.enabled must remain false`);
  assertEqual(audit, layer.status === 'disabled', `${endpoint}: externalAiInterpretationLayer.status must remain disabled`);
  assertEqual(audit, layer.provider === 'none', `${endpoint}: externalAiInterpretationLayer.provider must remain none`);
  assertEqual(audit, layer.model === null, `${endpoint}: externalAiInterpretationLayer.model must remain null`);
  assertEqual(audit, layer.mode === 'external_ai_disabled_scaffold', `${endpoint}: externalAiInterpretationLayer.mode mismatch`);
  assertEqual(audit, layer.output === null, `${endpoint}: externalAiInterpretationLayer.output must remain null`);
  assertEqual(audit, layer.fallback?.used === true, `${endpoint}: externalAiInterpretationLayer.fallback.used must be true`);
  assertEqual(audit, layer.fallback?.fallbackLayer === 'aiInterpretationLayer', `${endpoint}: externalAiInterpretationLayer fallback must target aiInterpretationLayer`);
  assertEqual(audit, layer.confidence?.level === 'low', `${endpoint}: externalAiInterpretationLayer.confidence.level must be low`);
  assertEqual(audit, layer.confidence?.score === 0, `${endpoint}: externalAiInterpretationLayer.confidence.score must be 0`);

  assertEqual(audit, boundaries.displayOnly === true, `${endpoint}: boundaries.displayOnly must be true`);
  assertEqual(audit, boundaries.diagnosticOnly === true, `${endpoint}: boundaries.diagnosticOnly must be true`);
  assertEqual(audit, boundaries.externalAiGenerated === false, `${endpoint}: boundaries.externalAiGenerated must be false`);
  assertEqual(audit, boundaries.usesExternalAiApi === false, `${endpoint}: boundaries.usesExternalAiApi must be false`);
  assertEqual(audit, boundaries.affectsScoring === false, `${endpoint}: boundaries.affectsScoring must be false`);
  assertEqual(audit, boundaries.affectsDecisionModel === false, `${endpoint}: boundaries.affectsDecisionModel must be false`);
  assertEqual(audit, boundaries.affectsExecutionLock === false, `${endpoint}: boundaries.affectsExecutionLock must be false`);
  assertEqual(audit, boundaries.affectsPositionGuidance === false, `${endpoint}: boundaries.affectsPositionGuidance must be false`);
  assertEqual(audit, boundaries.notInvestmentAdvice === true, `${endpoint}: boundaries.notInvestmentAdvice must be true`);

  assertEqual(audit, inputDigest.siteStructuredDataOnly === true, `${endpoint}: inputDigest.siteStructuredDataOnly must be true`);
  assertEqual(audit, inputDigest.usesPrivateUserData === false, `${endpoint}: inputDigest.usesPrivateUserData must be false`);
  assertEqual(audit, inputDigest.usesSecrets === false, `${endpoint}: inputDigest.usesSecrets must be false`);
  assertEqual(audit, inputDigest.usesExternalMarketData === false, `${endpoint}: inputDigest.usesExternalMarketData must be false`);
  assertEqual(audit, Array.isArray(inputDigest.layersAvailable), `${endpoint}: inputDigest.layersAvailable must be an array`);

  assertEqual(audit, layerAudit.outputValidated === false, `${endpoint}: audit.outputValidated must be false`);
  assertEqual(audit, layerAudit.validator === 'check-external-ai-output', `${endpoint}: audit.validator must be check-external-ai-output`);
  assertEqual(audit, layerAudit.auditStatus === 'not_applicable', `${endpoint}: audit.auditStatus must be not_applicable`);
  assertEqual(audit, layerAudit.boundariesValid === true, `${endpoint}: audit.boundariesValid must be true`);

  return {
    exists: true,
    contractVersion: layer.contractVersion,
    enabled: layer.enabled,
    status: layer.status,
    provider: layer.provider,
    mode: layer.mode,
    outputIsNull: layer.output === null,
    boundaries
  };
}

function validateRuleBasedLayer(audit, endpoint, layer) {
  if (!layer) {
    addError(audit, `${endpoint}: aiInterpretationLayer is missing`);
    return null;
  }

  assertEqual(audit, layer.contractVersion === EXPECTED_CONTRACTS.aiInterpretationLayer, `${endpoint}: aiInterpretationLayer.contractVersion must be ${EXPECTED_CONTRACTS.aiInterpretationLayer}`);
  assertEqual(audit, layer.mode === 'rule_based_structured_interpretation', `${endpoint}: aiInterpretationLayer.mode must remain rule_based_structured_interpretation`);

  const generated = layer.generatedByExternalAi ?? layer.boundaries?.generatedByExternalAi;
  const usesApi = layer.usesExternalAiApi ?? layer.boundaries?.usesExternalAiApi;
  warnEqual(audit, generated === false, `${endpoint}: aiInterpretationLayer generatedByExternalAi path missing or not false`);
  warnEqual(audit, usesApi === false, `${endpoint}: aiInterpretationLayer usesExternalAiApi path missing or not false`);

  assertEqual(audit, layer.boundaries?.affectsScoring === false, `${endpoint}: aiInterpretationLayer must not affect scoring`);
  assertEqual(audit, layer.boundaries?.affectsDecisionModel === false, `${endpoint}: aiInterpretationLayer must not affect decisionModel`);
  assertEqual(audit, layer.boundaries?.affectsExecutionLock === false, `${endpoint}: aiInterpretationLayer must not affect executionLock`);
  assertEqual(audit, layer.boundaries?.affectsPositionGuidance === false, `${endpoint}: aiInterpretationLayer must not affect positionGuidance`);

  return {
    contractVersion: layer.contractVersion,
    mode: layer.mode,
    generatedByExternalAi: generated,
    usesExternalAiApi: usesApi,
    affectsScoring: layer.boundaries?.affectsScoring,
    affectsDecisionModel: layer.boundaries?.affectsDecisionModel,
    affectsExecutionLock: layer.boundaries?.affectsExecutionLock,
    affectsPositionGuidance: layer.boundaries?.affectsPositionGuidance
  };
}

async function checkLocalStructure(audit) {
  const files = [];
  for (const file of REQUIRED_LOCAL_FILES) {
    const exists = await fileExists(file);
    files.push({ file, exists });
    if (!exists) addError(audit, `required local file missing: ${file}`);
  }

  const packageText = await readTextIfExists('package.json');
  if (packageText) {
    const pkg = JSON.parse(packageText);
    assertEqual(audit, pkg.scripts?.['audit:stable-observation'] === 'node scripts/audit-stable-observation.mjs', 'package.json must define audit:stable-observation');
    assertEqual(audit, Boolean(pkg.scripts?.['check:external-ai-output']), 'package.json must define check:external-ai-output');
    assertEqual(audit, pkg.scripts?.['check:all']?.includes('check:external-ai-output'), 'check:all must include check:external-ai-output');
  } else {
    addError(audit, 'package.json is missing or unreadable');
  }

  const promptContract = await readTextIfExists('docs/EXTERNAL_AI_PROMPT_CONTRACT.md');
  if (promptContract) {
    assertEqual(audit, promptContract.includes('offline/manual'), 'prompt contract must describe offline/manual use');
    assertEqual(audit, promptContract.includes('non-production'), 'prompt contract must mark fixtures as non-production');
    assertEqual(audit, promptContract.includes('must not be imported by runtime'), 'prompt contract must forbid runtime fixture imports');
  }

  return files;
}

async function checkFrontend(audit) {
  const results = [];
  for (const url of FRONTEND_ENDPOINTS) {
    const response = await getText(url);
    const version = response.ok ? parseFrontendVersion(response.body) : null;
    const hasAppScript = response.ok && response.body.includes('scripts/app.js?v=');
    results.push({
      url,
      statusCode: response.statusCode,
      ok: response.ok,
      frontendVersion: version,
      hasAppScript,
      error: response.error || null
    });

    if (response.ok) {
      if (!hasAppScript) addWarning(audit, `${url}: HTML did not include scripts/app.js?v=`);
      if (!version) addWarning(audit, `${url}: frontend version was not found`);
      if (version && version !== EXPECTED_FRONTEND_VERSION) {
        addWarning(audit, `${url}: frontend version is ${version}; expected ${EXPECTED_FRONTEND_VERSION} unless a newer frontend release exists`);
      }
      for (const hit of scanForbiddenCopy(response.body, url)) {
        addError(audit, `${hit.source}: forbidden affirmative copy found: ${hit.phrase}`);
      }
    }
  }

  const reachable = results.filter((item) => item.ok).length;
  if (reachable === 0) addError(audit, 'both frontend endpoints are unavailable');
  if (reachable === 1) addWarning(audit, 'only one frontend endpoint is reachable');

  return results;
}

async function checkLiveData(audit) {
  const results = [];
  let scaffoldPresentCount = 0;

  for (const url of DATA_ENDPOINTS) {
    const response = await getText(url);
    const result = {
      url,
      statusCode: response.statusCode,
      ok: response.ok,
      updatedAt: null,
      contracts: {},
      externalAi: null,
      ruleBasedAi: null,
      error: response.error || null
    };

    if (response.ok) {
      try {
        const data = JSON.parse(response.body);
        result.updatedAt = data.updatedAt || null;
        result.contracts = {
          dailyBrief: data.dailyBrief?.contractVersion,
          divergenceLayer: data.divergenceLayer?.contractVersion,
          brentPricingLayer: data.brentPricingLayer?.contractVersion,
          aiInterpretationLayer: data.aiInterpretationLayer?.contractVersion,
          externalAiInterpretationLayer: data.externalAiInterpretationLayer?.contractVersion
        };

        assertEqual(audit, Boolean(data.updatedAt), `${url}: updatedAt is missing`);
        for (const [key, expected] of Object.entries(EXPECTED_CONTRACTS)) {
          if (key === 'externalAiInterpretationLayer') continue;
          assertEqual(audit, result.contracts[key] === expected, `${url}: ${key}.contractVersion must be ${expected}`);
        }

        result.externalAi = validateExternalAiLayer(audit, url, data.externalAiInterpretationLayer);
        if (result.externalAi.exists) scaffoldPresentCount += 1;
        result.ruleBasedAi = validateRuleBasedLayer(audit, url, data.aiInterpretationLayer);

        for (const hit of scanForbiddenCopy(response.body, url)) {
          addError(audit, `${hit.source}: forbidden affirmative copy found: ${hit.phrase}`);
        }
      } catch (error) {
        addError(audit, `${url}: live data JSON parse failed: ${error.message}`);
      }
    }

    results.push(result);
  }

  const reachable = results.filter((item) => item.ok).length;
  if (reachable === 0) addError(audit, 'both live data endpoints are unavailable');
  if (reachable === 1) addWarning(audit, 'only one live data endpoint is reachable');
  if (reachable > 0 && scaffoldPresentCount === 0) {
    addError(audit, 'externalAiInterpretationLayer is missing from all reachable live data endpoints');
  }
  if (reachable > 0 && scaffoldPresentCount > 0 && scaffoldPresentCount < reachable) {
    addWarning(audit, 'externalAiInterpretationLayer is present on one live data endpoint but missing on another; public domain may lag GitHub Pages');
  }

  const updatedAts = results.filter((item) => item.ok).map((item) => item.updatedAt).filter(Boolean);
  if (new Set(updatedAts).size > 1) addWarning(audit, 'live data endpoints have different updatedAt values; public domain may lag GitHub Pages');

  return results;
}

async function runCommand(label, command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 5,
      timeout: 120000,
      windowsHide: true,
      shell: options.shell || false
    });
    return { label, ok: true, stdout, stderr, exitCode: 0 };
  } catch (error) {
    return {
      label,
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code ?? 1,
      error: error.message
    };
  }
}

function matchValue(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function parseBooleanText(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

async function checkWorkerHealth(audit) {
  const result = await runCommand('Worker Health', process.execPath, ['scripts/check-worker-health.mjs']);
  const output = `${result.stdout}\n${result.stderr}`;
  const summary = {
    ok: result.ok,
    overall: matchValue(output, /Overall:\s*(.+)/u),
    healthScore: Number(matchValue(output, /healthScore:\s*(\d+)/u)),
    criticalMissing: Number(matchValue(output, /criticalMissing:\s*(\d+)/u)),
    unavailable: parseBooleanText(matchValue(output, /unavailable:\s*(true|false)/u)),
    sourceMode: matchValue(output, /sourceMode:\s*([^\n]+)/u),
    promotionApplied: parseBooleanText(matchValue(output, /promotionApplied:\s*(true|false)/u)),
    secondaryPreviewStatus: matchValue(output, /Secondary preview:[\s\S]*?status:\s*(\d+)/u),
    rawKeyLines: output
      .split(/\r?\n/u)
      .filter((line) => /Overall:|healthScore:|criticalMissing:|unavailable:|sourceMode:|promotionApplied:|Secondary preview:|Conclusion:/u.test(line))
      .slice(0, 20)
  };

  if (!result.ok) addError(audit, `Worker Health command failed with exit code ${result.exitCode}`);
  if (summary.overall && summary.overall !== 'ok') addError(audit, `Worker Health overall is ${summary.overall}`);
  if (Number.isFinite(summary.criticalMissing) && summary.criticalMissing > 0) addError(audit, `Worker Health criticalMissing is ${summary.criticalMissing}`);
  if (summary.unavailable === true) addError(audit, 'Worker Health reports unavailable=true');
  if (!summary.overall) addWarning(audit, 'Worker Health output did not include an Overall line');
  if (!Number.isFinite(summary.healthScore)) addWarning(audit, 'Worker Health output did not include a parseable healthScore');

  return summary;
}

async function checkRealtimeHealth(audit, workerSummary) {
  const result = await runCommand('Realtime Health', process.execPath, ['scripts/check-realtime-health.mjs', '--soft']);
  const output = `${result.stdout}\n${result.stderr}`;
  const summary = {
    ok: result.ok,
    result: matchValue(output, /\[realtime-health\]\s*result:\s*(.+)/u),
    freshness: matchValue(output, /\[realtime-health\]\s*freshness:\s*(.+)/u),
    updatedAt: matchValue(output, /\[realtime-health\]\s*updatedAt:\s*(.+)/u),
    ageMinutes: Number(matchValue(output, /\[realtime-health\]\s*ageMinutes:\s*(\d+)/u)),
    shouldRecover: matchValue(output, /\[realtime-health\]\s*shouldRecover:\s*(.+)/u),
    suggestedAction: matchValue(output, /\[realtime-health\]\s*suggestedAction:\s*(.+)/u),
    rawKeyLines: output
      .split(/\r?\n/u)
      .filter((line) => /\[realtime-health\]\s*(result|freshness|updatedAt|ageMinutes|shouldRecover|suggestedAction):/u.test(line))
      .slice(0, 20)
  };

  if (!result.ok) {
    addWarning(audit, `Realtime Health command failed with exit code ${result.exitCode}; no recovery was attempted`);
  }

  if (summary.freshness && !['fresh', 'aging'].includes(summary.freshness)) {
    if (workerSummary.overall === 'ok') {
      addWarning(audit, `Realtime-data freshness is ${summary.freshness}; Worker Health is ok, so this is non-blocking observation`);
    } else {
      addWarning(audit, `Realtime-data freshness is ${summary.freshness}; review together with Worker Health`);
    }
  }

  if (!summary.freshness) addWarning(audit, 'Realtime Health output did not include freshness');

  return summary;
}

async function checkExternalAiValidator(audit) {
  const npmCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const npmArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm run check:external-ai-output']
    : ['run', 'check:external-ai-output'];
  const result = await runCommand(
    'External AI output validator',
    npmCommand,
    npmArgs
  );
  const output = `${result.stdout}\n${result.stderr}`;
  const summary = {
    ok: result.ok && output.includes('External AI output validation: PASS'),
    exitCode: result.exitCode,
    passLine: matchValue(output, /(External AI output validation:\s*PASS)/u),
    warningsLine: matchValue(output, /(warnings:\s*\d+)/u),
    rawKeyLines: output
      .split(/\r?\n/u)
      .filter((line) => /External AI output validation|contractVersion:|provider:|model:|warnings:/u.test(line))
      .slice(0, 20)
  };

  if (!summary.ok) addError(audit, 'npm run check:external-ai-output did not pass');
  return summary;
}

function determineStatus(audit) {
  if (audit.errors.length > 0) return 'FAIL';
  if (audit.warnings.length > 0) return 'WARN';
  return 'PASS';
}

function gateRecommendation(status) {
  if (status === 'PASS') {
    return 'v28.0K baseline is stable. It is reasonable to consider v28.0K-4 design-only manual API test planning.';
  }
  if (status === 'WARN') {
    return 'v28.0K baseline has non-blocking observation issues. Review warnings before proceeding to v28.0K-4.';
  }
  return 'Do not proceed to v28.0K-4. Fix blocking issues first.';
}

function formatList(items) {
  if (items.length === 0) return ['- none'];
  return items.map((item) => `- ${item}`);
}

function printReport(audit) {
  const lines = [
    `Stable Observation Audit: ${audit.status}`,
    `checkedAt: ${audit.checkedAt}`,
    '',
    'git / local context:',
    `- cwd: ${process.cwd()}`,
    `- githubRef: ${process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'local'}`,
    `- githubSha: ${process.env.GITHUB_SHA || 'local'}`,
    '',
    'frontend status:',
    ...audit.frontend.map((item) => `- ${item.url}: status=${item.statusCode ?? 'error'} version=${item.frontendVersion || '--'} appScript=${item.hasAppScript}`),
    '',
    'live data status:',
    ...audit.liveData.map((item) => `- ${item.url}: status=${item.statusCode ?? 'error'} updatedAt=${item.updatedAt || '--'}`),
    '',
    'external AI disabled scaffold status:',
    ...audit.liveData.map((item) => {
      const layer = item.externalAi || {};
      return `- ${item.url}: exists=${Boolean(layer.exists)} contract=${layer.contractVersion || '--'} enabled=${layer.enabled} status=${layer.status || '--'} provider=${layer.provider || '--'} mode=${layer.mode || '--'} outputIsNull=${layer.outputIsNull}`;
    }),
    '',
    'rule-based AI interpretation status:',
    ...audit.liveData.map((item) => {
      const layer = item.ruleBasedAi || {};
      return `- ${item.url}: contract=${layer.contractVersion || '--'} mode=${layer.mode || '--'} generatedByExternalAi=${layer.generatedByExternalAi} usesExternalAiApi=${layer.usesExternalAiApi}`;
    }),
    '',
    'Worker Health status:',
    `- overall: ${audit.workerHealth.overall || '--'}`,
    `- healthScore: ${Number.isFinite(audit.workerHealth.healthScore) ? audit.workerHealth.healthScore : '--'}`,
    `- criticalMissing: ${Number.isFinite(audit.workerHealth.criticalMissing) ? audit.workerHealth.criticalMissing : '--'}`,
    `- unavailable: ${audit.workerHealth.unavailable}`,
    `- sourceMode: ${audit.workerHealth.sourceMode || '--'}`,
    `- Brent promotionApplied: ${audit.workerHealth.promotionApplied}`,
    `- secondaryPreviewStatus: ${audit.workerHealth.secondaryPreviewStatus || '--'}`,
    '',
    'realtime-data status:',
    `- result: ${audit.realtimeHealth.result || '--'}`,
    `- freshness: ${audit.realtimeHealth.freshness || '--'}`,
    `- updatedAt: ${audit.realtimeHealth.updatedAt || '--'}`,
    `- ageMinutes: ${Number.isFinite(audit.realtimeHealth.ageMinutes) ? audit.realtimeHealth.ageMinutes : '--'}`,
    `- shouldRecover: ${audit.realtimeHealth.shouldRecover || '--'}`,
    `- suggestedAction: ${audit.realtimeHealth.suggestedAction || '--'}`,
    '',
    'external AI output validator status:',
    `- pass: ${audit.externalAiValidator.ok}`,
    `- exitCode: ${audit.externalAiValidator.exitCode}`,
    `- ${audit.externalAiValidator.passLine || 'PASS line missing'}`,
    '',
    'forbidden wording scan:',
    `- errors from live data / HTML scan: ${audit.errors.filter((item) => item.includes('forbidden affirmative copy')).length}`,
    '',
    'warnings:',
    ...formatList(audit.warnings),
    '',
    'errors:',
    ...formatList(audit.errors),
    '',
    `nextGateRecommendation: ${audit.nextGateRecommendation}`
  ];
  console.log(lines.join('\n'));
}

async function writeGitHubSummary(audit) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;

  const updatedAt = audit.liveData.find((item) => item.updatedAt)?.updatedAt || '--';
  const externalAiStatus = audit.liveData
    .map((item) => `${item.url}: ${item.externalAi?.status || '--'} / enabled=${item.externalAi?.enabled}`)
    .join('<br>');
  const summary = [
    `## Stable Observation Audit: ${audit.status}`,
    '',
    `- checkedAt: ${audit.checkedAt}`,
    `- live data updatedAt: ${updatedAt}`,
    `- externalAiInterpretationLayer: ${externalAiStatus || '--'}`,
    `- Worker Health: overall=${audit.workerHealth.overall || '--'}, healthScore=${Number.isFinite(audit.workerHealth.healthScore) ? audit.workerHealth.healthScore : '--'}, criticalMissing=${Number.isFinite(audit.workerHealth.criticalMissing) ? audit.workerHealth.criticalMissing : '--'}, unavailable=${audit.workerHealth.unavailable}`,
    `- realtime Health: result=${audit.realtimeHealth.result || '--'}, freshness=${audit.realtimeHealth.freshness || '--'}, updatedAt=${audit.realtimeHealth.updatedAt || '--'}`,
    '',
    '### Warnings',
    ...formatList(audit.warnings),
    '',
    '### Errors',
    ...formatList(audit.errors),
    '',
    `### nextGateRecommendation`,
    '',
    audit.nextGateRecommendation,
    ''
  ].join('\n');

  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

async function main() {
  const audit = {
    checkedAt: new Date().toISOString(),
    warnings: [],
    errors: [],
    localFiles: [],
    frontend: [],
    liveData: [],
    workerHealth: {},
    realtimeHealth: {},
    externalAiValidator: {},
    status: 'PASS',
    nextGateRecommendation: ''
  };

  audit.localFiles = await checkLocalStructure(audit);
  audit.frontend = await checkFrontend(audit);
  audit.liveData = await checkLiveData(audit);
  audit.workerHealth = await checkWorkerHealth(audit);
  audit.realtimeHealth = await checkRealtimeHealth(audit, audit.workerHealth);
  audit.externalAiValidator = await checkExternalAiValidator(audit);

  audit.status = determineStatus(audit);
  audit.nextGateRecommendation = gateRecommendation(audit.status);

  printReport(audit);
  await writeGitHubSummary(audit);

  if (audit.status === 'FAIL') process.exitCode = 1;
}

await main();
