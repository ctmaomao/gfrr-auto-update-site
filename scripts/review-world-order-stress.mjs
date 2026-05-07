import fs from 'node:fs';

const forbiddenPhrases = [
  ['WW3 ', '概率'].join(''),
  ['世界大战', '即将爆发'].join(''),
  ['战争', '已确认'].join(''),
  ['已经进入', '第三次世界大战'].join(''),
  ['13 步', '已走几步'].join(''),
  ['世界大战', '第几步'].join('')
];

function readPayload(filePath) {
  if (!filePath) throw new Error('Usage: node scripts/review-world-order-stress.mjs data/world-order-stress.json');
  const text = fs.readFileSync(filePath, 'utf8');
  for (const phrase of forbiddenPhrases) {
    if (text.includes(phrase)) throw new Error(`forbidden phrase present: ${phrase}`);
  }
  return JSON.parse(text);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function requireCoreFields(payload) {
  for (const key of ['score', 'state', 'freshness', 'confidence', 'externalSources', 'dimensions', 'marketConfirmationInput', 'warnings']) {
    if (!(key in payload)) throw new Error(`missing required field: ${key}`);
  }
  if (!Number.isFinite(payload.score) || payload.score < 0 || payload.score > 100) throw new Error('score must be 0-100');
  if (!Number.isFinite(payload.confidence) || payload.confidence < 0 || payload.confidence > 1) throw new Error('confidence must be 0-1');
  if (!isObject(payload.externalSources)) throw new Error('externalSources must be object');
  if (!isObject(payload.dimensions?.marketConfirmation)) throw new Error('dimensions.marketConfirmation missing');
}

function addWarning(warnings, condition, message, action) {
  if (condition) warnings.push({ message, action });
}

function review(payload) {
  requireCoreFields(payload);
  const warnings = [];
  const gdeltStatus = payload.externalSources?.gdelt?.status || 'missing';
  const sipriStatus = payload.externalSources?.sipri?.status || 'missing';
  const acledStatus = payload.externalSources?.acled?.status || 'missing';

  addWarning(warnings, ['stale', 'partial', 'error'].includes(payload.freshness), `freshness is ${payload.freshness}`, 'Monitor external source freshness');
  addWarning(warnings, ['stale', 'error'].includes(gdeltStatus), `GDELT status is ${gdeltStatus}`, 'Run build:world-order manually');
  addWarning(warnings, sipriStatus === 'manual_required', 'SIPRI normalized data is not imported', 'Provide SIPRI normalized data');
  addWarning(warnings, acledStatus === 'not_configured', 'ACLED credentials are not configured', 'Configure ACLED credentials');
  addWarning(warnings, payload.confidence < 0.5, `confidence is ${Math.round(payload.confidence * 100)}%`, 'Monitor external source freshness');

  const result = warnings.length ? 'WARN' : 'PASS';
  return {
    result,
    warnings,
    action: warnings.length ? [...new Set(warnings.map((warning) => warning.action))] : ['No action needed']
  };
}

function main() {
  try {
    const filePath = process.argv[2];
    const payload = readPayload(filePath);
    const decision = review(payload);
    console.log('World Order Stress Review');
    console.log(`Result: ${decision.result}`);
    console.log(`score: ${payload.score}`);
    console.log(`state: ${payload.state}`);
    console.log(`freshness: ${payload.freshness}`);
    console.log(`confidence: ${Math.round(payload.confidence * 100)}%`);
    console.log(`marketConfirmationSource: ${payload.marketConfirmationInput?.source || 'missing'}`);
    console.log(`gdeltStatus: ${payload.externalSources?.gdelt?.status || 'missing'}`);
    console.log(`ofacStatus: ${payload.externalSources?.ofac?.status || 'missing'}`);
    console.log(`sipriStatus: ${payload.externalSources?.sipri?.status || 'missing'}`);
    console.log(`acledStatus: ${payload.externalSources?.acled?.status || 'missing'}`);
    console.log('Findings');
    if (decision.warnings.length === 0) {
      console.log('- none');
    } else {
      for (const warning of decision.warnings) {
        console.log(`- ${warning.message}`);
      }
    }
    console.log('Suggested action');
    for (const action of decision.action) {
      console.log(`- ${action}`);
    }
  } catch (error) {
    console.log('World Order Stress Review');
    console.log('Result: FAIL');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
