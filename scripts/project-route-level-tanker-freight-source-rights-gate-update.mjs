#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_SCHEMA = 'route-level-tanker-freight-source-rights-artifact-review-v1';
const OUTPUT_SCHEMA = 'route-level-tanker-freight-source-rights-gate-update-proposal-v1';
const GATE_VERSION = 'route-level-tanker-freight-source-rights-approval-gate-v1';
const DEFAULT_SOURCE_RIGHTS_REVIEW = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-source-rights-review-latest.json';
const DEFAULT_GATE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-gate-v1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-source-rights-gate-update-proposal-latest.json';
const FUTURE_FIELD = 'macroDrivers.energyTransport.routeFreightConfirmation';
const BOUNDARY = 'dry-run-only route-level tanker freight source-rights gate update proposal; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run project:route-level-tanker-freight-source-rights-gate-update -- [options]

Options:
  --source-rights-review <path>  Source-rights artifact review JSON. Default: ${DEFAULT_SOURCE_RIGHTS_REVIEW}
  --gate <path>                  Current source-rights gate fixture. Default: ${DEFAULT_GATE}
  --output <path>                Ignored proposal artifact path. Default: ${DEFAULT_OUTPUT}
  --no-output                    Do not write the ignored proposal artifact.
  --json                         Print full JSON proposal to stdout.
  --strict                       Exit non-zero unless proposal is ready or fixture-blocked.
  --help                         Show this help.`);
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
    sourceRightsReview: DEFAULT_SOURCE_RIGHTS_REVIEW,
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
    if (arg === '--source-rights-review') options.sourceRightsReview = nextValue();
    else if (arg === '--gate') options.gate = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const [label, filePath] of [
    ['source-rights-review', options.sourceRightsReview],
    ['gate', options.gate]
  ]) {
    if (!isSafeInputPath(filePath)) throw new Error(`Refusing to read ${label} outside manual-artifacts/ or docs/fixtures/: ${filePath}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write proposal outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function readJson(filePath) {
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  return JSON.parse(readFileSync(resolve(filePath), 'utf8'));
}

function hashObject(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function falseImpactMap() {
  return {
    writesGateFixture: false,
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

function assertGate(gate) {
  if (gate.contractVersion !== GATE_VERSION) throw new Error(`Unexpected gate contractVersion: ${gate.contractVersion}`);
  if (gate.status !== 'manual_review_required_no_source_rights_approved') throw new Error('Current gate must remain manual_review_required_no_source_rights_approved.');
  if (gate.gateDecision?.productionWriteBlocked !== true) throw new Error('Current gate production write must stay blocked.');
  if (gate.currentProductionState?.routeFreightConfirmation !== 'not_connected') throw new Error('Current gate routeFreightConfirmation must stay not_connected.');
  if (!Array.isArray(gate.approvedSources) || gate.approvedSources.length !== 0) throw new Error('Current gate approvedSources must stay empty.');
}

function assertReview(review) {
  if (review.schemaVersion !== REVIEW_SCHEMA) throw new Error(`Unexpected source-rights review schemaVersion: ${review.schemaVersion}`);
  if (review.productionWriteApproved !== false) throw new Error('Source-rights review must not approve production write.');
  if (review.reviewDecision?.gateUpdateApproved !== false) throw new Error('Source-rights review must not approve gate update.');
  if (review.routeFreightConfirmation !== 'not_connected') throw new Error('Source-rights review routeFreightConfirmation must stay not_connected.');
  if (review.sourceRightsStatus !== 'manual_review_required') throw new Error('Source-rights review sourceRightsStatus must stay manual_review_required.');
}

function buildProposal({ review, gate, options }) {
  assertGate(gate);
  assertReview(review);

  const fixtureOnly = review.inputSummary?.fixtureOnly === true || isFixturePath(options.sourceRightsReview);
  const reviewReady = review.status === 'reviewable_pending_separate_gate_update'
    && review.reviewDecision?.claimsReadyForSeparateGateReview === true
    && review.reviewDecision?.evidenceComplete === true
    && review.reviewDecision?.approvalClaimsComplete === true;

  const fixtureReviewable = review.status === 'fixture_only_reviewable_keep_blocked'
    && review.reviewDecision?.claimsReadyForSeparateGateReview === true;

  let status = 'proposal_blocked_not_reviewable';
  let recommendation = 'collect_real_source_rights_review_keep_gate_blocked';
  let proposalReadyForHumanGateReview = false;
  const blockers = ['source_rights_gate_requires_separate_review'];

  if (fixtureOnly && fixtureReviewable) {
    status = 'fixture_only_proposal_keep_gate_blocked';
    recommendation = 'fixture_only_validates_proposal_shape_keep_gate_blocked';
    blockers.push('fixture_only_not_usable_for_gate_update');
  } else if (reviewReady && !fixtureOnly) {
    status = 'ready_for_human_gate_update_review';
    recommendation = 'human_may_review_gate_update_in_separate_pr_keep_non_production';
    proposalReadyForHumanGateReview = true;
  } else {
    blockers.push('source_rights_review_not_ready');
  }

  const sourceKey = typeof review.inputSummary?.sourceKey === 'string'
    ? review.inputSummary.sourceKey
    : null;

  return {
    schemaVersion: OUTPUT_SCHEMA,
    status,
    recommendation,
    generatedAt: new Date().toISOString(),
    sourceRightsReview: {
      path: safeRelativePath(options.sourceRightsReview),
      hash: hashObject(review),
      status: review.status,
      fixtureOnly,
      sourceKey,
      claimsReadyForSeparateGateReview: review.reviewDecision?.claimsReadyForSeparateGateReview === true
    },
    currentGate: {
      path: safeRelativePath(options.gate),
      hash: hashObject(gate),
      status: gate.status,
      blockReason: gate.gateDecision?.blockReason || 'source_rights_and_redistribution_not_approved',
      approvedSourcesCount: Array.isArray(gate.approvedSources) ? gate.approvedSources.length : null
    },
    proposalDecision: {
      proposalReadyForHumanGateReview,
      gateUpdateApproved: false,
      writesGateFixture: false,
      productionWriteApproved: false,
      routeFreightConfirmation: 'not_connected',
      sourceRightsStatus: 'manual_review_required',
      blockReason: status === 'ready_for_human_gate_update_review'
        ? 'requires_separate_reviewed_gate_update_pr'
        : blockers[blockers.length - 1],
      blockers,
      nextAllowedStep: status === 'ready_for_human_gate_update_review'
        ? 'separate_human_reviewed_source_rights_gate_update_pr'
        : 'collect_real_non_fixture_source_rights_review_artifact'
    },
    proposedGatePatch: proposalReadyForHumanGateReview ? {
      contractVersion: GATE_VERSION,
      sourceKey,
      sourceApproved: true,
      liveFetchApproved: true,
      productionWriteApproved: true,
      routeValueRedistributionApproved: true,
      sourceRightsStatus: 'approved',
      humanReviewRequiredBeforeApply: true,
      applyApprovedByThisProposal: false
    } : null,
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
      noGateFixtureWrite: true,
      noProductionWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      noRawSourceAgreementStored: true,
      notProductionData: true
    },
    boundary: BOUNDARY
  };
}

function writeJson(filePath, value) {
  const outputPath = resolve(filePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function printSummary(proposal) {
  console.log(`Route-level tanker freight source-rights gate update proposal: ${proposal.status}`);
  console.log(`recommendation: ${proposal.recommendation}`);
  console.log(`proposalReadyForHumanGateReview: ${proposal.proposalDecision.proposalReadyForHumanGateReview}`);
  console.log(`gateUpdateApproved: ${proposal.proposalDecision.gateUpdateApproved}`);
  console.log(`writesGateFixture: ${proposal.proposalDecision.writesGateFixture}`);
  console.log(`productionWriteApproved: ${proposal.proposalDecision.productionWriteApproved}`);
  console.log(`routeFreightConfirmation: ${proposal.proposalDecision.routeFreightConfirmation}`);
  console.log(`boundary: ${proposal.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const proposal = buildProposal({
      review: readJson(options.sourceRightsReview),
      gate: readJson(options.gate),
      options
    });
    if (options.writeOutput) writeJson(options.output, proposal);
    if (options.printJson) console.log(JSON.stringify(proposal, null, 2));
    else printSummary(proposal);
    if (options.strict && ![
      'ready_for_human_gate_update_review',
      'fixture_only_proposal_keep_gate_blocked'
    ].includes(proposal.status)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
