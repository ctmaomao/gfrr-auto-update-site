#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const INPUT_SCHEMA = 'route-level-tanker-freight-source-rights-input-v1';
const TEMPLATE_VERSION = 'route-level-tanker-freight-source-rights-approval-template-v1';
const DEFAULT_TEMPLATE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-template-v1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/source-rights-input.json';
const FUTURE_FIELD = 'macroDrivers.energyTransport.routeFreightConfirmation';
const BOUNDARY = 'manual/local route-level tanker freight source-rights input prep only; writes ignored manual-artifacts draft; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run prepare:route-level-tanker-freight-source-rights-input -- [options]

Options:
  --template <path>    Approval template fixture. Default: ${DEFAULT_TEMPLATE}
  --output <path>      Ignored local draft path. Default: ${DEFAULT_OUTPUT}
  --source-key <key>   Candidate source key for the draft. Default: manual_required_source_key
  --force              Overwrite the output draft if it already exists.
  --no-output          Do not write the draft; useful for checks.
  --json               Print the draft JSON to stdout.
  --help               Show this help.`);
}

function safeRelativePath(filePath) {
  const abs = resolve(filePath);
  const rel = relative(process.cwd(), abs);
  if (rel === '' || rel.startsWith('..')) return null;
  return rel.replace(/\\/g, '/');
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/') === true;
}

function parseArgs(argv) {
  const options = {
    template: DEFAULT_TEMPLATE,
    output: DEFAULT_OUTPUT,
    sourceKey: 'manual_required_source_key',
    force: false,
    writeOutput: true,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
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
    if (arg === '--template') options.template = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--source-key') options.sourceKey = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!isFixturePath(options.template)) throw new Error(`Refusing to read template outside docs/fixtures/: ${options.template}`);
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write source-rights input outside manual-artifacts/: ${options.output}`);
  }
  if (options.sourceKey.trim().length < 3) throw new Error('source-key must be at least 3 characters.');
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(filePath), 'utf8'));
}

function assertTemplate(template) {
  if (template.contractVersion !== TEMPLATE_VERSION) throw new Error(`Unexpected template contractVersion: ${template.contractVersion}`);
  if (template.status !== 'template_only_no_approval') throw new Error('Approval template must remain template_only_no_approval.');
  if (template.futureProductionField !== FUTURE_FIELD) throw new Error('Approval template futureProductionField drifted.');
  if (template.templateDecision?.approvalGrantedByThisTemplate !== false) throw new Error('Template must not grant approval.');
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

function buildDraft(template, options) {
  assertTemplate(template);
  const requiredApprovalEvidence = {};
  for (const key of Object.keys(template.requiredApprovalEvidence || {})) {
    requiredApprovalEvidence[key] = 'manual_required';
  }
  return {
    schemaVersion: INPUT_SCHEMA,
    kind: 'route_level_tanker_freight_source_rights_input',
    status: 'draft_manual_input_no_approval',
    preparedAt: new Date().toISOString(),
    futureProductionField: FUTURE_FIELD,
    fixtureOnly: false,
    sourceKey: options.sourceKey.trim(),
    requiredApprovalEvidence,
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
    operatorReview: {
      reviewedAt: null,
      reviewer: 'manual_required',
      attestation: 'manual_required'
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

function writeJson(filePath, value, force) {
  const outputPath = resolve(filePath);
  if (existsSync(outputPath) && !force) {
    throw new Error(`Output already exists; use --force to overwrite: ${filePath}`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function printSummary(draft, options) {
  console.log(`Route-level tanker freight source-rights input prep: ${draft.status}`);
  console.log(`output: ${safeRelativePath(options.output)}`);
  console.log(`sourceKey: ${draft.sourceKey}`);
  console.log(`sourceRightsStatus: ${draft.approvalClaims.sourceRightsStatus}`);
  console.log(`productionWriteApproved: ${draft.approvalClaims.productionWriteApproved}`);
  console.log(`routeFreightConfirmation: ${draft.currentProductionState.routeFreightConfirmation}`);
  console.log(`boundary: ${draft.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const draft = buildDraft(readJson(options.template), options);
    if (options.writeOutput) writeJson(options.output, draft, options.force);
    if (options.printJson) console.log(JSON.stringify(draft, null, 2));
    else printSummary(draft, options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
