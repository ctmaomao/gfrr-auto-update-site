// Synthetic-only pipeline and mathematical diagnostics. Never evidence of price skill.
import { buildBrentReleaseStudyCases, getFrozenBrentProtocol, BRENT_PROTOCOL_SHA256 } from './brent-release-study-cases.mjs';
import { fitSyntheticBrentModel, predictSyntheticBrentModel } from './brent-release-study-model.mjs';
const P = getFrozenBrentProtocol();
const B = P.evaluation.bootstrap;
const refuse = () => { throw new Error('Synthetic fixtures only; real research execution disabled'); };
function dense(a) { if (!Array.isArray(a)) return false; for (let i = 0; i < a.length; i++) if (!Object.hasOwn(a, i)) return false; return true; }
function finite(a) { return dense(a) && a.every(v => typeof v === 'number' && Number.isFinite(v)); }
function checkPair(y, p) {
  if (!dense(y) || !y.length || y.length > P.data.maxRows || !y.every(v => v === 0 || v === 1)
      || !finite(p) || p.length !== y.length || !p.every(v => v >= 0 && v <= 1)) throw new Error('Invalid complete synthetic probability pairs');
}
export function linearQuantileForFixtures(values, probability) {
  if (!finite(values) || !values.length || !Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('Invalid synthetic quantile');
  const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * probability;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
export function summarizeSyntheticProbabilities({ targets, probabilities, syntheticFixtureOnly }) {
  if (syntheticFixtureOnly !== true) refuse(); checkPair(targets, probabilities);
  const n = targets.length, bins = Array.from({ length: 5 }, (_, index) => ({ index, count: 0, predictionSum: 0, upCount: 0 }));
  let brier = 0, logloss = 0;
  for (let i = 0; i < n; i++) {
    const p = probabilities[i], y = targets[i], clipped = Math.max(P.evaluation.loglossClip, Math.min(1 - P.evaluation.loglossClip, p));
    brier += (p - y) ** 2 / n;
    logloss -= (y ? Math.log(clipped) : Math.log1p(-clipped)) / n;
    const bin = bins[Math.min(4, Math.floor(p * 5))]; bin.count++; bin.predictionSum += p; bin.upCount += y;
  }
  const reliability = bins.map(bin => ({ bin: bin.index, lower: bin.index / 5, upper: (bin.index + 1) / 5,
    upperInclusive: bin.index === 4, count: bin.count,
    meanProbability: bin.count ? bin.predictionSum / bin.count : null, observedUpFrequency: bin.count ? bin.upCount / bin.count : null }));
  const ece = reliability.reduce((sum, b) => sum + (b.count ? b.count / n * Math.abs(b.meanProbability - b.observedUpFrequency) : 0), 0);
  const upCount = targets.reduce((sum, y) => sum + y, 0);
  return { n, upCount, nonUpCount: n - upCount, brier, logloss, reliability, ece, syntheticFixtureOnly: true };
}
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0; let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function bootstrapSyntheticPairedBrier({ targets, candidate, symmetric, pretestFrequency, syntheticFixtureOnly }) {
  if (syntheticFixtureOnly !== true) refuse();
  for (const p of [candidate, symmetric, pretestFrequency]) checkPair(targets, p);
  const n = targets.length;
  const differences = [symmetric, pretestFrequency].map(baseline => candidate.map((p, i) => (p - targets[i]) ** 2 - (baseline[i] - targets[i]) ** 2));
  return [B.blockLength, ...B.sensitivityBlockLengths].map(blockLength => {
    const common = { blockLength, primary: blockLength === B.blockLength, replicates: B.replicates, seed: B.seed,
      rng: 'mulberry32_uint32', noncircular: true, sampleSize: n, finalBlockTruncated: true };
    if (n < blockLength) return { ...common, status: 'unavailable', reason: 'insufficient_block_length' };
    const rng = random(B.seed), means = [[], []];
    for (let repetition = 0; repetition < B.replicates; repetition++) {
      const sums = [0, 0]; let filled = 0;
      while (filled < n) {
        const start = Math.floor(rng() * (n - blockLength + 1));
        for (let offset = 0; offset < blockLength && filled < n; offset++, filled++) {
          for (let j = 0; j < differences.length; j++) sums[j] += differences[j][start + offset];
        }
      }
      means[0].push(sums[0] / n); means[1].push(sums[1] / n);
    }
    return { ...common, status: 'available', deltaConvention: 'candidate_minus_baseline',
      intervals: Object.fromEntries(['symmetric', 'pretestFrequency'].map((name, j) => [name, {
        lower: linearQuantileForFixtures(means[j], 0.025), upper: linearQuantileForFixtures(means[j], 0.975) }])) };
  });
}
function counts(rows, phase) {
  const ones = rows.reduce((sum, r) => sum + r.target, 0), n = rows.length;
  const minimum = P.splits.minimumPrimarySamples[phase], each = P.splits.minimumEachClass[phase];
  return { n, up: ones, nonUp: n - ones, minimumSamples: minimum, minimumEachClass: each,
    sufficient: n >= minimum && Math.min(ones, n - ones) >= each };
}
function evaluatePartition(rows, phase, model, empirical) {
  const sampleCounts = counts(rows, phase);
  if (!sampleCounts.sufficient) return { status: 'unavailable', reason: 'minimum_samples_or_classes', sampleCounts, gatePassed: null };
  const targets = rows.map(r => r.target), predictions = rows.map(r => predictSyntheticBrentModel(model, r.features));
  const probabilities = {
    candidate: predictions.map(p => p.calibratedProbability), symmetric: rows.map(() => 0.5),
    pretestFrequency: rows.map(() => empirical), uncalibrated: predictions.map(p => p.uncalibratedProbability)
  };
  const metrics = Object.fromEntries(Object.entries(probabilities).map(([name, p]) => [name,
    summarizeSyntheticProbabilities({ targets, probabilities: p, syntheticFixtureOnly: true })]));
  const bootstrap = bootstrapSyntheticPairedBrier({ targets, candidate: probabilities.candidate,
    symmetric: probabilities.symmetric, pretestFrequency: probabilities.pretestFrequency, syntheticFixtureOnly: true });
  const primary = bootstrap.find(b => b.primary), gate = P.evaluation.primaryResearchIncrementGate;
  const checks = {
    minimumBrierImprovement: ['symmetric', 'pretestFrequency'].every(k => metrics[k].brier - metrics.candidate.brier >= gate.minimumBrierImprovementAgainstBothSimpleBaselines),
    pairedUpperDeltaNegative: primary.status === 'available' && ['symmetric', 'pretestFrequency'].every(k => primary.intervals[k].upper < gate.upperPaired95DeltaBrierLessThan),
    loglossNoWorse: ['symmetric', 'pretestFrequency'].every(k => metrics.candidate.logloss <= metrics[k].logloss),
    eceWithinLimit: metrics.candidate.ece <= gate.maxECE
  };
  return { status: 'evaluated_synthetic_only', sampleCounts, metrics, bootstrap, gateChecks: checks,
    gatePassed: Object.values(checks).every(Boolean), allPredictionsPaired: true, droppedForForecastOrOutcome: 0,
    lowerSamplePrecision: phase === 'secondaryFinalChronologicalHoldout' };
}
export function runSyntheticBrentProtocol({ records, retrievalCutoff, syntheticFixtureOnly }) {
  if (syntheticFixtureOnly !== true) refuse();
  // Whole-dataset validation happens before any feature fitting. No row repair/drop.
  const report = buildBrentReleaseStudyCases({ records, retrievalCutoff });
  const results = {};
  for (const horizon of [P.issuance.horizons.primary, ...P.issuance.horizons.secondary]) {
    const phaseNames = ['train', 'calibration', 'test', 'secondaryFinalChronologicalHoldout'];
    const partitions = Object.fromEntries(phaseNames.map(phase => [phase, []]));
    const rejectedByReason = {}, issuedCounts = Object.fromEntries(phaseNames.map(phase => [phase, 0]));
    for (const issue of report.issues) {
      if (!Object.hasOwn(partitions, issue.phase)) continue;
      issuedCounts[issue.phase]++;
      const label = issue.labels[String(horizon)];
      if (label.eligible) partitions[issue.phase].push({ issueAt: issue.issueAt, features: issue.features.values, target: label.target });
      else for (const reason of label.reasons) rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1;
    }
    const sampleCounts = Object.fromEntries(phaseNames.map(phase => [phase, counts(partitions[phase], phase)]));
    const coverage = { issuanceCandidatesByPhase: issuedCounts, eligibleByPhase: Object.fromEntries(phaseNames.map(k => [k, partitions[k].length])),
      rejectedReasonOccurrences: rejectedByReason, reasonsMayOverlap: true };
    if (!sampleCounts.train.sufficient || !sampleCounts.calibration.sufficient) {
      results[horizon] = { status: 'unavailable', reason: 'minimum_training_or_calibration_samples_or_classes', sampleCounts, coverage,
        test: { status: 'unavailable', gatePassed: null }, holdout2026: { status: 'unavailable', gatePassed: null } }; continue;
    }
    const model = fitSyntheticBrentModel({ train: partitions.train, calibration: partitions.calibration, syntheticFixtureOnly: true });
    if (model.status !== 'fitted_synthetic_only') {
      results[horizon] = { status: 'unavailable', reason: model.reason, sampleCounts, coverage,
        test: { status: 'unavailable', gatePassed: null }, holdout2026: { status: 'unavailable', gatePassed: null } }; continue;
    }
    const pretest = [...partitions.train, ...partitions.calibration];
    const empirical = pretest.reduce((sum, r) => sum + r.target, 0) / pretest.length;
    results[horizon] = { status: 'synthetic_model_fitted', horizonRole: horizon === 5 ? 'primary' : 'secondary_cannot_rescue_primary',
      sampleCounts, coverage, empiricalPretestUpFrequency: empirical, empiricalBaselinePopulation: 'train_plus_calibration_only',
      secondaryMinimumRule: 'same_conservative_sample_and_class_counts_as_primary',
      model, test: evaluatePartition(partitions.test, 'test', model, empirical),
      holdout2026: evaluatePartition(partitions.secondaryFinalChronologicalHoldout, 'secondaryFinalChronologicalHoldout', model, empirical) };
  }
  const primary = results[String(P.issuance.horizons.primary)];
  return { schemaVersion: 'brent-synthetic-protocol-verification-v1', mode: 'research_only', syntheticFixtureOnly: true,
    protocolSha256: BRENT_PROTOCOL_SHA256, retrievalCutoff, horizons: results,
    syntheticPrimaryAndHoldoutGatesPass: primary.test.gatePassed === true && primary.holdout2026.gatePassed === true,
    eligibleForPublicProbability: false, eligibleForMainScore: false, noCurrentPredictionFromThisStudy: true,
    historicalAsOfVerified: false, inputAuthenticityVerified: false, prospectiveEvidence: false,
    engineeringVerificationIsNotPredictiveEvidence: true };
}
