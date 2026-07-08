#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const INPUT_SCHEMA = 'route-level-tanker-freight-source-rights-input-v1';
const OUTPUT_SCHEMA = 'route-level-tanker-freight-source-rights-artifact-review-v1';
const TEMPLATE_VERSION = 'route-level-tanker-freight-source-rights-approval-template-v1';
const GATE_VERSION = 'route-level-tanker-freight-source-rights-approval-gate-v1';
const DEFAULT_INPUT = 'manual-artifacts/route-level-tanker-freight/source-rights-input.json';
const DEFAULT_TEMPLATE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-template-v1.json';
const DEFAULT_GATE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-gate-v1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-source-rights-review-latest.json';
const FUTURE_FIELD = 'macroDrivers.energyTransport.routeFreightConfirmation';
const BOUNDARY = 'manual/local route-level tanker freight source-rights artifact review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:route-level-tanker-freight-source-rights-artifact -- [options]

Options:
  --input <path>     Operator source-rights input JSON. Default: ${DEFAULT_INPUT}
  --template <path>  Approval template fixture. Default: ${DEFAULT_TEMPLATE}
  --gate <path>      Current source-rights gate fixture. Default: ${DEFAULT_GATE}
  --output <path>    Ignored review artifact path. Default: ${DEFAULT_OUTPUT}
  --no-output        Do not write the ignored review artifact.
  --json             Print full JSON review to stdout.
  --strict           Exit non-zero unless artifact is reviewable or fixture-reviewable.
  --help             Show this help.`);
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    template: DEFAULT_TEMPLATE,
    gate: DEFAULT_GATE,
    output: DEFAULT_OUTPUT,
    writeOutput: true,
    printJson: false,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--input') options.input = nextValue();
    else if (arg === '--template') options.template = nextValue();
    else if (arg === '--gate') options.gate = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [label, filePath] of [
    ['input', options.input],
    ['template', options.template],
    ['gate', options.gate]
  ]) {
    if (!isSafeInputPath(filePath)) throw new Error(`Refusing to read ${label} outside manual-artifacts/ or docs/fixtures/: ${filePath}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(filePath), 'utf8'));
}

function nowIso() {
  return new Date().toISOString();
}

function hashText(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 16);
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function hasEvidenceValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized !== '' && normalized !== 'manual_required';
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function falseImpactMap() {
  return {
    writesProductionData: false,
    modifiesFrontend: false,
    modifiesWorkerRuntime: false,
    modifiesWorkflow: false,
    affectsValues: false,
    affectsDisplayInputsBaseline: false,
    affectsEffectiveDisplayInputs: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsWorldOrderWeights: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function baseReview(options, template, gate) {
  return {
    schemaVersion: OUTPUT_SCHEMA,
    status: 'incomplete_manual_review_required',
    recommendation: 'operator_source_rights_artifact_needs_cleanup_keep_non_production',
    generatedAt: nowIso(),
    inputPath: safeRelativePath(options.input),
    templatePath: safeRelativePath(options.template),
    gatePath: safeRelativePath(options.gate),
    templateVersion: template.contractVersion,
    currentGateStatus: gate.status,
    futureProductionField: FUTURE_FIELD,
    dryRunOnly: true,
    promotionEligible: false,
    productionWriteApproved: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    eligibleForMainScore: false,
    sourceRightsStatus: 'manual_review_required',
    inputSummary: {
      fixtureOnly: false,
      sourceKey: null,
      sourceOwnerHash: null,
      operatorAttestationHash: null,
      evidenceHash: null
    },
    requiredEvidence: {
      complete: false,
      presentCount: 0,
      missingKeys: [],
      presentKeys: []
    },
    approvalClaims: {
      sourceApproved: false,
      liveFetchApproved: false,
      productionWriteApproved: false,
      routeValueRedistributionApproved: false,
      sourceRightsStatus: 'manual_review_required',
      frontendImplementationApproved: false,
      workflowAutomationApproved: false,
      mainScoreApproved: false,
      odpFinalBiasApproved: false,
      brentPromotionApproved: false,
      worldOrderWeightsApproved: false,
      globalRiskHeatmapApproved: false,
      crossValidationApproved: false
    },
    reviewDecision: {
      evidenceComplete: false,
      approvalClaimsComplete: false,
      claimsReadyForSeparateGateReview: false,
      gateUpdateApproved: false,
      gateUpdateEligibleFromThisArtifact: false,
      productionWriteApproved: false,
      blockReason: gate.gateDecision?.blockReason || 'source_rights_and_redistribution_not_approved',
      blockers: ['source_rights_gate_requires_separate_review'],
      nextAllowedStep: 'separate_source_rights_gate_update_review_required'
    },
    currentProductionState: {
      routeFreightConfirmation: 'not_connected',
      marketConfirmation: 'not_connected',
      eligibleForMainScore: false
    },
    productionImpact: falseImpactMap(),
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      noRawSourceAgreementStored: true,
      noRawProviderResponseStored: true,
      notProductionData: true
    },
    boundary: BOUNDARY
  };
}

function assertTemplate(template) {
  if (template.contractVersion !== TEMPLATE_VERSION) throw new Error(`Unexpected template contractVersion: ${template.contractVersion}`);
  if (template.status !== 'template_only_no_approval') throw new Error('Approval template must remain template_only_no_approval.');
  if (template.futureProductionField !== FUTURE_FIELD) throw new Error('Approval template futureProductionField drifted.');
  if (template.templateDecision?.approvalGrantedByThisTemplate !== false) throw new Error('Approval template must not grant approval.');
  if (template.templateDecision?.productionWriteBlocked !== true) throw new Error('Approval template must keep production blocked.');
}

function assertGate(gate) {
  if (gate.contractVersion !== GATE_VERSION) throw new Error(`Unexpected gate contractVersion: ${gate.contractVersion}`);
  if (gate.status !== 'manual_review_required_no_source_rights_approved') throw new Error('Gate must remain manual_review_required_no_source_rights_approved.');
  if (gate.gateDecision?.productionWriteBlocked !== true) throw new Error('Gate production write must remain blocked.');
  if (gate.currentProductionState?.routeFreightConfirmation !== 'not_connected') throw new Error('Gate routeFreightConfirmation must remain not_connected.');
  if (Array.isArray(gate.approvedSources) && gate.approvedSources.length !== 0) throw new Error('Gate approvedSources must remain empty.');
}

function reviewInput(input, options, template, gate) {
  assertTemplate(template);
  assertGate(gate);
  const review = baseReview(options, template, gate);
  const blockers = [];

  if (input.schemaVersion !== INPUT_SCHEMA) blockers.push('schema_version_invalid');
  if (!isIsoTimestamp(input.preparedAt)) blockers.push('prepared_at_invalid');
  if (input.futureProductionField !== FUTURE_FIELD) blockers.push('future_production_field_mismatch');
  if (typeof input.sourceKey !== 'string' || input.sourceKey.trim().length < 3) blockers.push('source_key_missing');

  review.inputSummary.fixtureOnly = input.fixtureOnly === true;
  review.inputSummary.sourceKey = typeof input.sourceKey === 'string' ? input.sourceKey.trim() : null;
  review.inputSummary.sourceOwnerHash = hashText(input.requiredApprovalEvidence?.sourceOwner || '');
  review.inputSummary.operatorAttestationHash = hashText(input.operatorReview?.attestation || '');
  review.inputSummary.evidenceHash = shortHash(input.requiredApprovalEvidence || {});

  const requiredEvidenceKeys = Object.keys(template.requiredApprovalEvidence || {});
  for (const key of requiredEvidenceKeys) {
    if (hasEvidenceValue(input.requiredApprovalEvidence?.[key])) {
      review.requiredEvidence.presentCount += 1;
      review.requiredEvidence.presentKeys.push(key);
    } else {
      review.requiredEvidence.missingKeys.push(key);
    }
  }
  review.requiredEvidence.complete = review.requiredEvidence.missingKeys.length === 0 && requiredEvidenceKeys.length > 0;
  if (!review.requiredEvidence.complete) blockers.push('required_approval_evidence_incomplete');

  const claims = input.approvalClaims || {};
  for (const key of Object.keys(review.approvalClaims)) {
    if (Object.hasOwn(claims, key)) review.approvalClaims[key] = claims[key];
  }

  const minimum = template.minimumApprovalFieldsBeforeProductionWrite || {};
  const approvalClaimsComplete = claims.sourceApproved === minimum.sourceApproved
    && claims.liveFetchApproved === minimum.liveFetchApproved
    && claims.productionWriteApproved === minimum.productionWriteApproved
    && claims.routeValueRedistributionApproved === minimum.routeValueRedistributionApproved
    && claims.sourceRightsStatus === minimum.sourceRightsStatus;
  review.reviewDecision.evidenceComplete = review.requiredEvidence.complete;
  review.reviewDecision.approvalClaimsComplete = approvalClaimsComplete;
  review.reviewDecision.claimsReadyForSeparateGateReview = review.requiredEvidence.complete && approvalClaimsComplete && blockers.length === 0;
  if (!approvalClaimsComplete) blockers.push('minimum_approval_claims_incomplete');
  if (!isIsoTimestamp(input.operatorReview?.reviewedAt) || typeof input.operatorReview?.attestation !== 'string' || input.operatorReview.attestation.trim().length < 12) {
    blockers.push('operator_attestation_incomplete');
  }
  if (input.fixtureOnly === true) blockers.push('fixture_only_not_usable_for_gate_update');

  review.reviewDecision.blockers = [...new Set(['source_rights_gate_requires_separate_review', ...blockers])];
  review.reviewDecision.gateUpdateApproved = false;
  review.reviewDecision.gateUpdateEligibleFromThisArtifact = false;
  review.reviewDecision.productionWriteApproved = false;

  if (review.reviewDecision.claimsReadyForSeparateGateReview && input.fixtureOnly === true) {
    review.status = 'fixture_only_reviewable_keep_blocked';
    review.recommendation = 'fixture_only_validates_review_shape_keep_gate_blocked';
  } else if (review.reviewDecision.claimsReadyForSeparateGateReview) {
    review.status = 'reviewable_pending_separate_gate_update';
    review.recommendation = 'ready_for_separate_source_rights_gate_review_keep_non_production';
  }
  return review;
}

function missingInputReview(options, template, gate) {
  const review = baseReview(options, template, gate);
  review.status = 'input_missing_dry_run_only';
  review.recommendation = 'create_source_rights_input_under_manual_artifacts_then_rerun';
  review.reviewDecision.blockers = [
    'input_missing',
    'source_rights_gate_requires_separate_review'
  ];
  return review;
}

function printSummary(review) {
  const missingKeys = review.requiredEvidence?.missingKeys || [];
  const presentKeys = review.requiredEvidence?.presentKeys || [];
  console.log(`Route-level tanker freight source-rights artifact review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`evidenceComplete: ${review.reviewDecision.evidenceComplete}`);
  console.log(`requiredEvidence: ${presentKeys.length} present / ${missingKeys.length} missing`);
  console.log(`missingEvidenceKeys: ${missingKeys.length > 0 ? missingKeys.join(',') : 'none'}`);
  console.log(`approvalClaimsComplete: ${review.reviewDecision.approvalClaimsComplete}`);
  console.log(`claimsReadyForSeparateGateReview: ${review.reviewDecision.claimsReadyForSeparateGateReview}`);
  console.log(`gateUpdateApproved: ${review.reviewDecision.gateUpdateApproved}`);
  console.log(`productionWriteApproved: ${review.productionWriteApproved}`);
  console.log(`routeFreightConfirmation: ${review.routeFreightConfirmation}`);
  console.log(`nextAllowedStep: ${review.reviewDecision.nextAllowedStep}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const template = readJson(options.template);
    const gate = readJson(options.gate);
    const review = existsSync(resolve(options.input))
      ? reviewInput(readJson(options.input), options, template, gate)
      : missingInputReview(options, template, gate);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
    if (options.strict && !['reviewable_pending_separate_gate_update', 'fixture_only_reviewable_keep_blocked'].includes(review.status)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
