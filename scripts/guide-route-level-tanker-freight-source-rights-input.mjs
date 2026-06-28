#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const INPUT_SCHEMA = 'route-level-tanker-freight-source-rights-input-v1';
const TEMPLATE_VERSION = 'route-level-tanker-freight-source-rights-approval-template-v1';
const DEFAULT_INPUT = 'manual-artifacts/route-level-tanker-freight/source-rights-input.json';
const DEFAULT_TEMPLATE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-template-v1.json';
const FUTURE_FIELD = 'macroDrivers.energyTransport.routeFreightConfirmation';
const BOUNDARY = 'read-only route-level tanker freight source-rights input guide; no production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run guide:route-level-tanker-freight-source-rights-input -- [options]

Options:
  --input <path>     Source-rights input draft. Default: ${DEFAULT_INPUT}
  --template <path>  Approval template fixture. Default: ${DEFAULT_TEMPLATE}
  --json             Print full JSON guide to stdout.
  --help             Show this help.`);
}

function safeRelativePath(filePath) {
  const abs = resolve(filePath);
  const rel = relative(process.cwd(), abs);
  if (rel === '' || rel.startsWith('..')) return null;
  return rel.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/') === true;
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
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
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
    if (arg === '--input') options.input = nextValue();
    else if (arg === '--template') options.template = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!isSafeInputPath(options.input)) throw new Error(`Refusing to read input outside manual-artifacts/ or docs/fixtures/: ${options.input}`);
  if (!isFixturePath(options.template)) throw new Error(`Refusing to read template outside docs/fixtures/: ${options.template}`);
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(filePath), 'utf8'));
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

function assertTemplate(template) {
  if (template.contractVersion !== TEMPLATE_VERSION) throw new Error(`Unexpected template contractVersion: ${template.contractVersion}`);
  if (template.status !== 'template_only_no_approval') throw new Error('Approval template must remain template_only_no_approval.');
  if (template.futureProductionField !== FUTURE_FIELD) throw new Error('Approval template futureProductionField drifted.');
}

function approvalClaimsComplete(input, template) {
  const claims = input?.approvalClaims || {};
  const minimum = template.minimumApprovalFieldsBeforeProductionWrite || {};
  return claims.sourceApproved === minimum.sourceApproved
    && claims.liveFetchApproved === minimum.liveFetchApproved
    && claims.productionWriteApproved === minimum.productionWriteApproved
    && claims.routeValueRedistributionApproved === minimum.routeValueRedistributionApproved
    && claims.sourceRightsStatus === minimum.sourceRightsStatus;
}

function operatorReviewComplete(input) {
  const reviewedAt = input?.operatorReview?.reviewedAt;
  const attestation = input?.operatorReview?.attestation;
  return typeof reviewedAt === 'string'
    && Number.isFinite(Date.parse(reviewedAt))
    && typeof attestation === 'string'
    && attestation.trim().length >= 12
    && attestation.trim() !== 'manual_required';
}

function buildGuide({ input, inputExists, template, options }) {
  assertTemplate(template);
  const requiredKeys = Object.keys(template.requiredApprovalEvidence || {});
  const missingKeys = [];
  const presentKeys = [];

  for (const key of requiredKeys) {
    if (inputExists && hasEvidenceValue(input.requiredApprovalEvidence?.[key])) presentKeys.push(key);
    else missingKeys.push(key);
  }

  const schemaOk = inputExists && input.schemaVersion === INPUT_SCHEMA;
  const futureFieldOk = inputExists && input.futureProductionField === FUTURE_FIELD;
  const claimsComplete = inputExists && approvalClaimsComplete(input, template);
  const operatorComplete = inputExists && operatorReviewComplete(input);
  const fixtureOnly = input?.fixtureOnly === true || isFixturePath(options.input);
  const readyForReview = schemaOk && futureFieldOk && missingKeys.length === 0 && claimsComplete && operatorComplete && !fixtureOnly;

  return {
    schemaVersion: 'route-level-tanker-freight-source-rights-input-guide-v1',
    status: inputExists
      ? (readyForReview ? 'ready_for_artifact_review' : 'input_incomplete_keep_gate_blocked')
      : 'input_missing_run_prepare_first',
    generatedAt: new Date().toISOString(),
    input: {
      path: safeRelativePath(options.input),
      exists: inputExists,
      schemaOk,
      futureFieldOk,
      sourceKey: input?.sourceKey || null,
      fixtureOnly
    },
    requiredEvidence: {
      totalCount: requiredKeys.length,
      presentCount: presentKeys.length,
      missingCount: missingKeys.length,
      presentKeys,
      missingKeys
    },
    approvalClaims: {
      complete: claimsComplete,
      sourceApproved: input?.approvalClaims?.sourceApproved === true,
      liveFetchApproved: input?.approvalClaims?.liveFetchApproved === true,
      productionWriteApproved: input?.approvalClaims?.productionWriteApproved === true,
      routeValueRedistributionApproved: input?.approvalClaims?.routeValueRedistributionApproved === true,
      sourceRightsStatus: input?.approvalClaims?.sourceRightsStatus || 'manual_review_required'
    },
    operatorReview: {
      complete: operatorComplete,
      reviewedAt: input?.operatorReview?.reviewedAt || null,
      reviewer: input?.operatorReview?.reviewer || null
    },
    nextCommand: inputExists
      ? 'npm run review:route-level-tanker-freight-source-rights-artifact -- --no-output'
      : 'npm run prepare:route-level-tanker-freight-source-rights-input',
    currentProductionState: {
      routeFreightConfirmation: 'not_connected',
      marketConfirmation: 'not_connected',
      eligibleForMainScore: false
    },
    productionImpact: falseImpactMap(),
    boundaries: {
      readOnly: true,
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

function printSummary(guide) {
  console.log(`Route-level tanker freight source-rights input guide: ${guide.status}`);
  console.log(`input: ${guide.input.path || 'outside-workspace'} exists=${guide.input.exists}`);
  console.log(`requiredEvidence: ${guide.requiredEvidence.presentCount} present / ${guide.requiredEvidence.missingCount} missing`);
  console.log(`missingEvidenceKeys: ${guide.requiredEvidence.missingKeys.length > 0 ? guide.requiredEvidence.missingKeys.join(',') : 'none'}`);
  console.log(`approvalClaimsComplete: ${guide.approvalClaims.complete}`);
  console.log(`operatorReviewComplete: ${guide.operatorReview.complete}`);
  console.log(`routeFreightConfirmation: ${guide.currentProductionState.routeFreightConfirmation}`);
  console.log(`nextCommand: ${guide.nextCommand}`);
  console.log(`boundary: ${guide.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputExists = existsSync(resolve(options.input));
    const input = inputExists ? readJson(options.input) : null;
    const guide = buildGuide({
      input,
      inputExists,
      template: readJson(options.template),
      options
    });
    if (options.printJson) console.log(JSON.stringify(guide, null, 2));
    else printSummary(guide);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
