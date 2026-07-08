#!/usr/bin/env node
import { isManualArtifactPath, readJson, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import process from 'node:process';

const PROPOSAL_SCHEMA = 'route-level-tanker-freight-source-rights-gate-update-proposal-v1';
const OUTPUT_SCHEMA = 'route-level-tanker-freight-source-rights-gate-update-proposal-review-v1';
const GATE_VERSION = 'route-level-tanker-freight-source-rights-approval-gate-v1';
const DEFAULT_PROPOSAL = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-source-rights-gate-update-proposal-latest.json';
const DEFAULT_GATE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-gate-v1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-source-rights-gate-update-proposal-review-latest.json';
const BOUNDARY = 'manual/local route-level tanker freight source-rights gate update proposal review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:route-level-tanker-freight-source-rights-gate-update-proposal -- [options]

Options:
  --proposal <path>  Source-rights gate update proposal JSON. Default: ${DEFAULT_PROPOSAL}
  --gate <path>      Current source-rights gate fixture. Default: ${DEFAULT_GATE}
  --output <path>    Ignored proposal review path. Default: ${DEFAULT_OUTPUT}
  --no-output        Do not write the ignored review artifact.
  --json             Print full JSON review to stdout.
  --strict           Exit non-zero unless review is ready or fixture-blocked.
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
    proposal: DEFAULT_PROPOSAL,
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
    if (arg === '--proposal') options.proposal = nextValue();
    else if (arg === '--gate') options.gate = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const [label, filePath] of [
    ['proposal', options.proposal],
    ['gate', options.gate]
  ]) {
    if (!isSafeInputPath(filePath)) throw new Error(`Refusing to read ${label} outside manual-artifacts/ or docs/fixtures/: ${filePath}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function falseImpactMap() {
  return {
    appliesGateUpdate: false,
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

function assertProposal(proposal) {
  if (proposal.schemaVersion !== PROPOSAL_SCHEMA) throw new Error(`Unexpected proposal schemaVersion: ${proposal.schemaVersion}`);
  if (proposal.proposalDecision?.gateUpdateApproved !== false) throw new Error('Proposal must not approve gate update.');
  if (proposal.proposalDecision?.writesGateFixture !== false) throw new Error('Proposal must not write gate fixture.');
  if (proposal.proposalDecision?.productionWriteApproved !== false) throw new Error('Proposal must not approve production write.');
  if (proposal.proposalDecision?.routeFreightConfirmation !== 'not_connected') throw new Error('Proposal routeFreightConfirmation must stay not_connected.');
  if (proposal.proposalDecision?.sourceRightsStatus !== 'manual_review_required') throw new Error('Proposal sourceRightsStatus must stay manual_review_required.');
}

function buildReview({ proposal, gate, options }) {
  assertGate(gate);
  assertProposal(proposal);

  const fixtureOnly = proposal.sourceRightsReview?.fixtureOnly === true || isFixturePath(options.proposal);
  const humanReady = proposal.status === 'ready_for_human_gate_update_review'
    && proposal.proposalDecision?.proposalReadyForHumanGateReview === true
    && proposal.proposedGatePatch?.applyApprovedByThisProposal === false
    && fixtureOnly === false;
  const fixtureBlocked = proposal.status === 'fixture_only_proposal_keep_gate_blocked'
    && fixtureOnly === true;

  let status = 'proposal_review_blocked';
  let recommendation = 'proposal_not_ready_keep_gate_blocked';
  let humanGateUpdateReviewReady = false;
  const blockers = ['source_rights_gate_update_requires_human_pr'];

  if (fixtureBlocked) {
    status = 'fixture_only_review_keep_gate_blocked';
    recommendation = 'fixture_only_validates_proposal_review_shape_keep_gate_blocked';
    blockers.push('fixture_only_not_usable_for_gate_update');
  } else if (humanReady) {
    status = 'ready_for_human_gate_update_pr_review';
    recommendation = 'human_may_prepare_separate_gate_update_pr_no_auto_apply';
    humanGateUpdateReviewReady = true;
  } else {
    blockers.push('proposal_not_ready_for_human_gate_update_review');
  }

  return {
    schemaVersion: OUTPUT_SCHEMA,
    status,
    recommendation,
    generatedAt: new Date().toISOString(),
    proposal: {
      path: safeRelativePath(options.proposal),
      hash: shortHash(proposal),
      status: proposal.status,
      sourceKey: proposal.sourceRightsReview?.sourceKey || null,
      fixtureOnly,
      proposalReadyForHumanGateReview: proposal.proposalDecision?.proposalReadyForHumanGateReview === true
    },
    currentGate: {
      path: safeRelativePath(options.gate),
      hash: shortHash(gate),
      status: gate.status,
      blockReason: gate.gateDecision?.blockReason || 'source_rights_and_redistribution_not_approved',
      approvedSourcesCount: Array.isArray(gate.approvedSources) ? gate.approvedSources.length : null
    },
    reviewDecision: {
      humanGateUpdateReviewReady,
      applyApprovedByThisReview: false,
      writesGateFixture: false,
      productionWriteApproved: false,
      routeFreightConfirmation: 'not_connected',
      sourceRightsStatus: 'manual_review_required',
      blockers,
      nextAllowedStep: humanGateUpdateReviewReady
        ? 'human_authored_source_rights_gate_update_pr'
        : 'collect_real_non_fixture_gate_update_proposal'
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
      noGateFixtureWrite: true,
      noProductionWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      notProductionData: true
    },
    boundary: BOUNDARY
  };
}

function printSummary(review) {
  console.log(`Route-level tanker freight source-rights gate update proposal review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`humanGateUpdateReviewReady: ${review.reviewDecision.humanGateUpdateReviewReady}`);
  console.log(`applyApprovedByThisReview: ${review.reviewDecision.applyApprovedByThisReview}`);
  console.log(`writesGateFixture: ${review.reviewDecision.writesGateFixture}`);
  console.log(`productionWriteApproved: ${review.reviewDecision.productionWriteApproved}`);
  console.log(`routeFreightConfirmation: ${review.reviewDecision.routeFreightConfirmation}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildReview({
      proposal: readJson(options.proposal),
      gate: readJson(options.gate),
      options
    });
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
    if (options.strict && ![
      'ready_for_human_gate_update_pr_review',
      'fixture_only_review_keep_gate_blocked'
    ].includes(review.status)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
