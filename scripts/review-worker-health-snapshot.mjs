import fs from 'node:fs';

function parseArgs(argv) {
  if (argv[0] === '--file') {
    return argv[1] || null;
  }
  return argv[0] || null;
}

function valueOrDash(value) {
  if (value === null || value === undefined || value === '') return '--';
  return String(value);
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSnapshot(filePath) {
  if (!filePath) {
    throw new Error('Usage: node scripts/review-worker-health-snapshot.mjs <health-worker-snapshot.json>');
  }
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

function schemaCompatible(schemaVersion) {
  return typeof schemaVersion === 'string' &&
    (schemaVersion === 'v28.0G-7A' || schemaVersion.startsWith('v28.0G'));
}

function seriousReason(reason) {
  return /hard failure|unhealthy|secondary pollution|secondaryPollution|worker: .*unavailable|worker: .*healthScore|worker: .*criticalMissing|worker: .*sourceMode|worker: .*ageMinutes|secondary: .*HTTP status|secondary: .*JSON unavailable/iu
    .test(String(reason));
}

function secondaryWarning(source) {
  return ['stale-warning', 'stale-critical', 'missing-observedAt', 'unparsable-observedAt']
    .includes(source?.freshnessStatus);
}

function classify(snapshot) {
  const worker = snapshot.worker || {};
  const secondary = snapshot.secondary || {};
  const sources = secondary.sources || {};
  const reasons = Array.isArray(snapshot.reasons) ? snapshot.reasons : [];
  const healthScore = finiteNumber(worker.healthScore);
  const criticalMissing = finiteNumber(worker.criticalMissing);
  const ageMinutes = finiteNumber(worker.ageMinutes);
  const sourceProbeFrequencyMinutes = finiteNumber(worker.sourceProbeFrequencyMinutes);
  const sourceProbeCount = finiteNumber(worker.sourceProbeCount);
  const teFreshness = snapshot.brent?.tradingEconomics?.freshnessStatus || null;

  const failChecks = [
    snapshot.overall === 'unhealthy',
    worker.status !== 200,
    worker.sourceMode !== 'worker-generated-preview',
    worker.unavailable === true,
    healthScore != null && healthScore < 85,
    criticalMissing != null && criticalMissing > 1,
    worker.secondaryPollution !== 'ok',
    sourceProbeFrequencyMinutes != null && sourceProbeFrequencyMinutes !== 60,
    sourceProbeCount != null && sourceProbeCount > 5,
    reasons.some(seriousReason),
  ];
  if (failChecks.some(Boolean)) {
    return {
      result: 'FAIL',
      action: 'Investigate',
      recommendation: 'Snapshot failed. Investigate before deployment or source changes.',
    };
  }

  const secondarySources = ['vix', 'gold', 'dxy', 'us10y', 'spx'].map((name) => sources[name]);
  const warnChecks = [
    snapshot.overall === 'warning',
    reasons.length > 0,
    !['fresh'].includes(teFreshness),
    secondarySources.some(secondaryWarning),
    ageMinutes != null && ageMinutes > 10,
    sourceProbeCount == null,
  ];
  if (warnChecks.some(Boolean)) {
    return {
      result: 'WARN',
      action: 'Monitor',
      recommendation: 'Snapshot usable but needs monitoring.',
    };
  }

  return {
    result: 'PASS',
    action: 'No action needed',
    recommendation: 'Snapshot healthy. No action needed.',
  };
}

function printSecondary(name, source) {
  console.log(
    `${name}: status=${valueOrDash(source?.status)} freshnessStatus=${valueOrDash(source?.freshnessStatus)} observedAgeHours=${valueOrDash(source?.observedAgeHours)} freshnessReason=${valueOrDash(source?.freshnessReason)}`,
  );
}

function printSnapshot(snapshot, decision) {
  const worker = snapshot.worker || {};
  const brent = snapshot.brent || {};
  const tradingEconomics = brent.tradingEconomics || {};
  const sources = snapshot.secondary?.sources || {};
  const reasons = Array.isArray(snapshot.reasons) ? snapshot.reasons : [];

  console.log('Worker Health Snapshot Review');
  console.log(`schemaVersion: ${valueOrDash(snapshot.schemaVersion)}`);
  console.log(`generatedAt: ${valueOrDash(snapshot.generatedAt)}`);
  console.log(`Result: ${decision.result}`);
  console.log(`Action: ${decision.action}`);
  console.log('');

  console.log('Worker');
  console.log(`overall: ${valueOrDash(snapshot.overall)}`);
  console.log(`healthScore: ${valueOrDash(worker.healthScore)}`);
  console.log(`criticalMissing: ${valueOrDash(worker.criticalMissing)}`);
  console.log(`unavailable: ${valueOrDash(worker.unavailable)}`);
  console.log(`values.brent: ${valueOrDash(worker.brent)}`);
  console.log(`gold: ${valueOrDash(worker.gold)}`);
  console.log(`sourceMode: ${valueOrDash(worker.sourceMode)}`);
  console.log(`ageMinutes: ${valueOrDash(worker.ageMinutes)}`);
  console.log('');

  console.log('Brent / TE');
  console.log(`promotionApplied: ${valueOrDash(brent.promotionApplied)}`);
  console.log(`selectedValue: ${valueOrDash(brent.selectedValue)}`);
  console.log(`selectedSource: ${valueOrDash(brent.selectedSource)}`);
  console.log(`reason: ${valueOrDash(brent.reason)}`);
  console.log(`moveStatus: ${valueOrDash(brent.moveStatus)}`);
  console.log(`promotedChangePct: ${valueOrDash(brent.promotedChangePct)}`);
  console.log(`tradingEconomics.status: ${valueOrDash(tradingEconomics.status)}`);
  console.log(`tradingEconomics.value: ${valueOrDash(tradingEconomics.value)}`);
  console.log(`tradingEconomics.observedAt: ${valueOrDash(tradingEconomics.observedAt)}`);
  console.log(`tradingEconomics.ageHours: ${valueOrDash(tradingEconomics.ageHours)}`);
  console.log(`tradingEconomics.freshnessStatus: ${valueOrDash(tradingEconomics.freshnessStatus)}`);
  console.log(`tradingEconomics.freshnessReason: ${valueOrDash(tradingEconomics.freshnessReason)}`);
  console.log('');

  console.log('SourceProbe');
  console.log(`sourceProbeReused: ${valueOrDash(worker.sourceProbeReused)}`);
  console.log(`sourceProbeFrequencyMinutes: ${valueOrDash(worker.sourceProbeFrequencyMinutes)}`);
  console.log(`sourceProbeCount: ${valueOrDash(worker.sourceProbeCount)}`);
  console.log('');

  console.log('Secondary');
  for (const name of ['vix', 'gold', 'dxy', 'us10y', 'spx']) {
    printSecondary(name, sources[name]);
  }
  console.log('');

  console.log('Reasons');
  if (reasons.length === 0) {
    console.log('- none');
  } else {
    for (const reason of reasons) console.log(`- ${reason}`);
  }
  console.log('');

  console.log(`Final recommendation: ${decision.recommendation}`);
}

try {
  const filePath = parseArgs(process.argv.slice(2));
  const snapshot = readSnapshot(filePath);
  if (!schemaCompatible(snapshot.schemaVersion)) {
    throw new Error(`Unsupported or missing schemaVersion: ${valueOrDash(snapshot.schemaVersion)}`);
  }
  const decision = classify(snapshot);
  printSnapshot(snapshot, decision);
  if (decision.result === 'FAIL') process.exitCode = 1;
} catch (err) {
  console.error('Worker Health Snapshot Review');
  console.error('Result: FAIL');
  console.error('Action: Investigate');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('Final recommendation: Snapshot failed. Investigate before deployment or source changes.');
  process.exitCode = 1;
}
