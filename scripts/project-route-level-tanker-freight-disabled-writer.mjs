#!/usr/bin/env node
import { isManualArtifactPath, readJson, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import process from 'node:process';

const SCAFFOLD_VERSION = 'route-level-tanker-freight-disabled-writer-scaffold-v1';
const WRITER_CONTRACT_VERSION = 'route-level-tanker-freight-production-writer-contract-design-v1';
const SOURCE_RIGHTS_GATE_VERSION = 'route-level-tanker-freight-source-rights-approval-gate-v1';
const FUTURE_FIELD_VERSION = 'route-level-tanker-freight-confirmation-v1';
const DEFAULT_WRITER_CONTRACT = 'docs/fixtures/route-level-tanker-freight-production-writer-contract-design-v1.json';
const DEFAULT_SOURCE_RIGHTS_GATE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-gate-v1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-disabled-writer-projection-latest.json';
const BOUNDARY = 'disabled route-level tanker freight production writer scaffold; manual artifact only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run project:route-level-tanker-freight-disabled-writer -- [options]

Options:
  --writer-contract <path>      Writer contract fixture. Default: ${DEFAULT_WRITER_CONTRACT}
  --source-rights-gate <path>   Source-rights gate fixture. Default: ${DEFAULT_SOURCE_RIGHTS_GATE}
  --output <path>               Ignored manual artifact path. Default: ${DEFAULT_OUTPUT}
  --no-output                   Do not write the ignored artifact.
  --json                        Print full JSON projection to stdout.
  --strict                      Exit non-zero unless disabled projection is valid.
  --help                        Show this help.`);
}

function parseArgs(argv) {
  const options = {
    writerContract: DEFAULT_WRITER_CONTRACT,
    sourceRightsGate: DEFAULT_SOURCE_RIGHTS_GATE,
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
    if (arg === '--writer-contract') options.writerContract = nextValue();
    else if (arg === '--source-rights-gate') options.sourceRightsGate = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [label, value] of [
    ['writer-contract', options.writerContract],
    ['source-rights-gate', options.sourceRightsGate]
  ]) {
    if (!isSafeInputPath(value)) throw new Error(`Refusing to read ${label} outside manual-artifacts/ or docs/fixtures/: ${value}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write disabled writer projection outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
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

function assertAllFalse(record, label) {
  for (const [key, value] of Object.entries(record || {})) {
    if (value !== false) throw new Error(`${label}.${key} must be false.`);
  }
}

function assertWriterContract(contract) {
  if (contract.contractVersion !== WRITER_CONTRACT_VERSION) throw new Error(`Unexpected writer contractVersion: ${contract.contractVersion}`);
  if (contract.status !== 'contract_design_only_no_writer') throw new Error('Writer contract must stay contract_design_only_no_writer.');
  if (contract.futureProductionField !== 'macroDrivers.energyTransport.routeFreightConfirmation') throw new Error('Unexpected future production field.');
  if (contract.currentProductionState?.routeFreightConfirmation !== 'not_connected') throw new Error('routeFreightConfirmation must stay not_connected.');
  if (contract.currentProductionState?.sourceRightsStatus !== 'manual_review_required') throw new Error('sourceRightsStatus must stay manual_review_required.');
  if (contract.currentProductionState?.productionWriteApproved !== false) throw new Error('productionWriteApproved must stay false.');
  if (contract.futureFieldShape?.contractVersion !== FUTURE_FIELD_VERSION) throw new Error('Unexpected future field contract version.');
  if (contract.futureFieldShape?.defaultStatus !== 'not_connected') throw new Error('Future field default status must stay not_connected.');
  if (contract.futureFieldShape?.sourceRightsStatus !== 'manual_review_required') throw new Error('Future field source rights must require manual review.');
  if (contract.futureFieldShape?.eligibleForMainScore !== false) throw new Error('Future field must not be main-score eligible.');
  if (contract.futureFieldShape?.allowedStatuses?.includes('confirmed')) throw new Error('confirmed status is not allowed in disabled writer scaffold.');
  assertAllFalse(contract.approvalState, 'writerContract.approvalState');
}

function assertSourceRightsGate(gate) {
  if (gate.contractVersion !== SOURCE_RIGHTS_GATE_VERSION) throw new Error(`Unexpected source-rights gate contractVersion: ${gate.contractVersion}`);
  if (gate.status !== 'manual_review_required_no_source_rights_approved') throw new Error('Source-rights gate must remain manual_review_required_no_source_rights_approved.');
  if (gate.currentProductionState?.sourceRightsStatus !== 'manual_review_required') throw new Error('Gate sourceRightsStatus must stay manual_review_required.');
  if (gate.gateDecision?.productionWriteBlocked !== true) throw new Error('Gate must block production write.');
  if (gate.gateDecision?.blockReason !== 'source_rights_and_redistribution_not_approved') throw new Error('Unexpected source-rights block reason.');
  if (!Array.isArray(gate.approvedSources) || gate.approvedSources.length !== 0) throw new Error('approvedSources must stay empty.');
  for (const source of gate.candidateSourceFamilies || []) {
    if (source.sourceApproved !== false) throw new Error(`${source.sourceKey} sourceApproved must be false.`);
    if (source.liveFetchApproved !== false) throw new Error(`${source.sourceKey} liveFetchApproved must be false.`);
    if (source.productionWriteApproved !== false) throw new Error(`${source.sourceKey} productionWriteApproved must be false.`);
  }
  assertAllFalse(gate.approvalState, 'sourceRightsGate.approvalState');
}

function buildDisabledProjection({ writerContract, sourceRightsGate, options }) {
  assertWriterContract(writerContract);
  assertSourceRightsGate(sourceRightsGate);
  const fieldShape = writerContract.futureFieldShape;
  return {
    schemaVersion: SCAFFOLD_VERSION,
    status: 'disabled_no_production_write',
    generatedAt: new Date().toISOString(),
    sourceMode: 'disabled_contract_projection',
    writeMode: 'manual_artifact_only',
    futureProductionField: writerContract.futureProductionField,
    productionWriteAttempted: false,
    productionWriteApproved: false,
    sourceRightsStatus: 'manual_review_required',
    blockers: [
      'source_rights_and_redistribution_not_approved',
      'no_approved_route_level_source',
      'disabled_scaffold_no_production_write'
    ],
    inputs: {
      writerContract: {
        sourcePath: safeRelativePath(options.writerContract),
        artifactHash: shortHash(writerContract),
        contractVersion: writerContract.contractVersion,
        status: writerContract.status
      },
      sourceRightsGate: {
        sourcePath: safeRelativePath(options.sourceRightsGate),
        artifactHash: shortHash(sourceRightsGate),
        contractVersion: sourceRightsGate.contractVersion,
        status: sourceRightsGate.status,
        blockReason: sourceRightsGate.gateDecision?.blockReason || null
      }
    },
    candidateField: {
      contractVersion: FUTURE_FIELD_VERSION,
      status: 'not_connected',
      sourceMode: 'production_source_unavailable',
      displayOnly: true,
      auditOnly: true,
      eligibleForMainScore: false,
      sourceRightsStatus: 'manual_review_required',
      sampleReadiness: fieldShape.sampleReadiness || 'manual_review_required',
      routeBuckets: [],
      routeCoverage: {
        observedBucketCount: 0,
        requiredBucketCount: 0,
        repeatedObservationCount: 0
      },
      latestReviewedAt: null,
      staleAfterHours: fieldShape.staleAfterHours,
      limitationZh: fieldShape.limitationZh
    },
    currentProductionState: {
      routeFreightConfirmation: 'not_connected',
      marketConfirmation: 'not_connected',
      eligibleForMainScore: false
    },
    approvals: {
      sourceApproved: false,
      liveFetchApproved: false,
      apiKeyReadApproved: false,
      productionDataWriteApproved: false,
      productionWriteApproved: false,
      routeValueRedistributionApproved: false,
      frontendImplementationApproved: false,
      workflowAutomationApproved: false,
      mainScoreApproved: false,
      odpFinalBiasApproved: false,
      brentPromotionApproved: false,
      worldOrderWeightsApproved: false,
      globalRiskHeatmapApproved: false,
      crossValidationApproved: false
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
      noRawProviderResponseStored: true,
      notProductionData: true
    },
    boundary: BOUNDARY
  };
}

function printSummary(projection) {
  console.log(`Route-level tanker freight disabled writer scaffold: ${projection.status}`);
  console.log(`futureProductionField: ${projection.futureProductionField}`);
  console.log(`candidateField.status: ${projection.candidateField.status}`);
  console.log(`sourceRightsStatus: ${projection.sourceRightsStatus}`);
  console.log(`productionWriteAttempted: ${projection.productionWriteAttempted}`);
  console.log(`productionWriteApproved: ${projection.productionWriteApproved}`);
  console.log(`boundary: ${projection.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const writerContract = readJson(options.writerContract);
    const sourceRightsGate = readJson(options.sourceRightsGate);
    const projection = buildDisabledProjection({ writerContract, sourceRightsGate, options });
    if (options.writeOutput) writeJson(options.output, projection);
    if (options.printJson) console.log(JSON.stringify(projection, null, 2));
    else printSummary(projection);
    if (options.strict && projection.status !== 'disabled_no_production_write') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
