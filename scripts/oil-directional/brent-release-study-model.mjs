// Synthetic-only numerical verification of the frozen protocol, not predictive evidence.
import { getFrozenBrentProtocol, BRENT_PROTOCOL_SHA256 } from './brent-release-study-cases.mjs';
const P = getFrozenBrentProtocol();
const sigmoid = z => z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
const softplus = z => Math.max(0, z) + Math.log1p(Math.exp(-Math.abs(z)));
function denseArray(a) {
  if (!Array.isArray(a)) return false;
  for (let i = 0; i < a.length; i++) if (!Object.hasOwn(a, i)) return false;
  return true;
}
const finiteArray = a => denseArray(a) && a.every(v => typeof v === 'number' && Number.isFinite(v));
const unavailable = reason => ({ status: 'unavailable', reason, syntheticFixtureOnly: true,
  eligibleForPublicProbability: false, eligibleForMainScore: false, noCurrentPredictionFromThisStudy: true });
function checkMatrix(x, y) {
  if (!denseArray(x) || !x.length || x.length > P.data.maxRows || !denseArray(y) || x.length !== y.length
      || !Array.isArray(x[0]) || !x[0].length || x[0].length > 4
      || !x.every(r => finiteArray(r) && r.length === x[0].length)
      || !y.every(v => v === 0 || v === 1)) throw new Error('Invalid synthetic logistic inputs');
}
// Generic arithmetic only, exported for independent finite-difference tests.
export function logisticObjectiveAndGradientForFixtures(weights, x, y, lambda) {
  checkMatrix(x, y);
  if (!finiteArray(weights) || weights.length !== x[0].length + 1 || !Number.isFinite(lambda) || lambda < 0) throw new Error('Invalid synthetic objective');
  const gradient = Array(weights.length).fill(0); let objective = 0;
  for (let i = 0; i < x.length; i++) {
    const z = weights[0] + x[i].reduce((sum, v, j) => sum + v * weights[j + 1], 0);
    objective += softplus(y[i] ? -z : z) / x.length;
    const error = (sigmoid(z) - y[i]) / x.length;
    gradient[0] += error;
    for (let j = 0; j < x[i].length; j++) gradient[j + 1] += error * x[i][j];
  }
  for (let j = 1; j < weights.length; j++) { objective += lambda * weights[j] ** 2 / 2; gradient[j] += lambda * weights[j]; }
  return { objective, gradient };
}
function optimize(x, y, lambda, initial) {
  checkMatrix(x, y);
  const maximumAugmentedRowSquaredNorm = Math.max(...x.map(row => 1 + row.reduce((s, v) => s + v * v, 0)));
  const learningRate = Math.min(P.model.optimizer.learningRate, 1 / (0.25 * maximumAugmentedRowSquaredNorm + lambda));
  if (!Number.isFinite(maximumAugmentedRowSquaredNorm) || !(learningRate > 0)) return unavailable('nonfinite_optimizer_scale');
  let weights = [...initial];
  for (let iteration = 0; iteration <= P.model.optimizer.maxIterations; iteration++) {
    const { objective, gradient } = logisticObjectiveAndGradientForFixtures(weights, x, y, lambda);
    const gradientNorm = Math.sqrt(gradient.reduce((sum, g) => sum + g * g, 0));
    if (!Number.isFinite(objective) || !Number.isFinite(gradientNorm)) return unavailable('nonfinite_fit');
    if (gradientNorm <= P.model.optimizer.gradientNormTolerance) return { status: 'fitted', weights, objective,
      gradientNorm, iterations: iteration, learningRate, maximumAugmentedRowSquaredNorm };
    if (iteration === P.model.optimizer.maxIterations) return unavailable('nonconvergence');
    weights = weights.map((w, j) => w - learningRate * gradient[j]);
    if (!finiteArray(weights)) return unavailable('nonfinite_fit');
  }
}
function moments(x) {
  const mean = x[0].map((origin, j) => origin + x.reduce((sum, r) => sum + (r[j] - origin) / x.length, 0));
  const std = mean.map((m, j) => Math.sqrt(x.reduce((sum, r) => sum + (r[j] - m) ** 2 / x.length, 0)));
  return { mean, std };
}
function scaleRow(row, scaler) {
  return row.map((v, j) => scaler.std[j] === 0 ? 0 : Math.max(-P.model.zClip, Math.min(P.model.zClip, (v - scaler.mean[j]) / scaler.std[j])));
}
function validateCaseRows(rows, phase) {
  if (!denseArray(rows) || rows.length > P.data.maxRows) throw new Error('Invalid synthetic case rows');
  const range = P.splits[phase], seen = new Set();
  for (const row of rows) {
    if (!row || !finiteArray(row.features) || row.features.length !== 4 || ![0, 1].includes(row.target)
        || typeof row.issueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(row.issueAt)) throw new Error('Invalid synthetic case');
    const ms = Date.parse(row.issueAt);
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== row.issueAt || row.issueAt.slice(0, 10) < range[0]
        || row.issueAt.slice(0, 10) > range[1] || seen.has(row.issueAt)) throw new Error('Invalid synthetic phase or duplicate issue');
    seen.add(row.issueAt);
  }
  const ones = rows.filter(r => r.target === 1).length, zeros = rows.length - ones;
  return { count: rows.length, ones, zeros, eligible: rows.length >= P.splits.minimumPrimarySamples[phase]
    && Math.min(ones, zeros) >= P.splits.minimumEachClass[phase] };
}
export function calibrateSyntheticBrentLogits({ logits, targets, syntheticFixtureOnly }) {
  if (syntheticFixtureOnly !== true) throw new Error('Synthetic fixtures only; real fitting disabled');
  if (!finiteArray(logits)) return unavailable('nonfinite_calibration_logits');
  const x = logits.map(v => [v]); checkMatrix(x, targets);
  const ones = targets.filter(y => y === 1).length;
  if (logits.length < P.splits.minimumPrimarySamples.calibration || Math.min(ones, logits.length - ones) < P.splits.minimumEachClass.calibration) return unavailable('minimum_calibration_samples_or_classes');
  const mean = logits.reduce((sum, v) => sum + v / logits.length, 0);
  const variance = logits.reduce((sum, v) => sum + (v - mean) ** 2 / logits.length, 0);
  if (!Number.isFinite(variance)) return unavailable('nonfinite_calibration_variance');
  if (variance < 1e-8) return unavailable('constant_or_nearly_constant_logits');
  const fit = optimize(x, targets, P.model.calibrationRidgeLambda, [0, 1]);
  if (fit.status !== 'fitted') return fit;
  if (!(fit.weights[1] > 0)) return unavailable('nonpositive_calibration_slope');
  return { ...fit, syntheticFixtureOnly: true, eligibleForPublicProbability: false, eligibleForMainScore: false,
    noCurrentPredictionFromThisStudy: true, intercept: fit.weights[0], slope: fit.weights[1], rawLogitVariance: variance };
}
export function fitSyntheticBrentModel({ train, calibration, syntheticFixtureOnly }) {
  if (syntheticFixtureOnly !== true) throw new Error('Synthetic fixtures only; real fitting disabled');
  const trainCounts = validateCaseRows(train, 'train'), calibrationCounts = validateCaseRows(calibration, 'calibration');
  if (!trainCounts.eligible || !calibrationCounts.eligible) return { ...unavailable('minimum_samples_or_classes'), trainCounts, calibrationCounts };
  const trainX = train.map(r => r.features), trainY = train.map(r => r.target), scaler = moments(trainX);
  if (!finiteArray(scaler.mean) || !finiteArray(scaler.std)) return unavailable('nonfinite_training_scaler');
  const scaled = trainX.map(r => scaleRow(r, scaler));
  if (!scaled.every(finiteArray)) return unavailable('nonfinite_scaled_features');
  const classifier = optimize(scaled, trainY, P.model.ridgeLambda, [0, 0, 0, 0, 0]);
  if (classifier.status !== 'fitted') return classifier;
  const rawLogits = calibration.map(r => classifier.weights[0] + scaleRow(r.features, scaler).reduce((s, v, j) => s + v * classifier.weights[j + 1], 0));
  const calibrator = calibrateSyntheticBrentLogits({ logits: rawLogits, targets: calibration.map(r => r.target), syntheticFixtureOnly: true });
  if (calibrator.status !== 'fitted') return { ...calibrator, trainCounts, calibrationCounts };
  return { status: 'fitted_synthetic_only', mode: 'research_only', syntheticFixtureOnly: true, protocolSha256: BRENT_PROTOCOL_SHA256,
    scaler, classifier, calibrator, trainCounts, calibrationCounts, caseConstructionVerified: false,
    eligibleForPublicProbability: false, eligibleForMainScore: false, noCurrentPredictionFromThisStudy: true };
}
export function predictSyntheticBrentModel(model, features) {
  if (model?.status !== 'fitted_synthetic_only' || model.syntheticFixtureOnly !== true || model.protocolSha256 !== BRENT_PROTOCOL_SHA256
      || !finiteArray(features) || features.length !== 4) throw new Error('Available synthetic model and finite features required');
  const standardized = scaleRow(features, model.scaler);
  const rawLogit = model.classifier.weights[0] + standardized.reduce((s, v, j) => s + v * model.classifier.weights[j + 1], 0);
  const calibratedLogit = model.calibrator.intercept + model.calibrator.slope * rawLogit;
  if (!Number.isFinite(rawLogit) || !Number.isFinite(calibratedLogit)) throw new Error('Nonfinite synthetic prediction');
  return { standardized, rawLogit, uncalibratedProbability: sigmoid(rawLogit), calibratedProbability: sigmoid(calibratedLogit),
    syntheticFixtureOnly: true, eligibleForPublicProbability: false, eligibleForMainScore: false, noCurrentPredictionFromThisStudy: true };
}
