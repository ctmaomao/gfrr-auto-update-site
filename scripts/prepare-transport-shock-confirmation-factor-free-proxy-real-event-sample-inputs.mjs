#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, readJson, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import process from 'node:process';

const MONITOR_VERSION = 'transport-shock-free-proxy-score-readiness-gate-monitor-p32';
const OUTPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-real-event-sample-input-prep-v1';
const SAMPLE_INPUT_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-input-v1';
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-monitor-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-real-event-sample-input-prep-latest.json';
const DEFAULT_TEMPLATE_DIR = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-real-event-sample-input-templates';
const BOUNDARY =
  'manual/local Transport Shock free-proxy real-event sample input prep only; writes ignored manual-artifacts only; draft templates require operator source review; not production data; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const ZERO_CONTROL_FAMILIES = [
  'headline_only_false_positive',
  'single_chokepoint_noise',
  'stale_physical_proxy',
  'market_confirmation_divergence',
  'benign_baseline'
];

function printUsage() {
  console.log(`Usage:
  npm run prepare:transport-shock-confirmation-factor-free-proxy-real-event-sample-inputs -- [options]

Options:
  --input <path>         P-score-32 gate monitor artifact. Default: ${DEFAULT_INPUT}
  --output <path>        Ignored prep artifact. Default: ${DEFAULT_OUTPUT}
  --template-dir <path>  Ignored directory for optional draft input templates. Default: ${DEFAULT_TEMPLATE_DIR}
  --write-templates      Write individual draft sample input templates under --template-dir.
  --dry-run              Do not write artifacts.
  --no-output            Do not write prep artifact.
  --json                 Print full JSON prep to stdout.
  --help                 Show this help.

Boundary:
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production data, frontend, workflow, Worker, ODP finalBias, or main judgment scoring.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    templateDir: DEFAULT_TEMPLATE_DIR,
    writeTemplates: false,
    dryRun: false,
    writeOutput: true,
    printJson: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--write-templates') {
      options.writeTemplates = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
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
    if (arg === '--input') options.input = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--template-dir') options.templateDir = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isSafeInputPath(options.input)) throw new Error(`Refusing input outside allowed paths: ${options.input}`);
  if (options.writeOutput && !isManualArtifactPath(options.output)) throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  if (options.writeTemplates && !isManualArtifactPath(options.templateDir)) throw new Error(`Refusing template dir outside manual-artifacts/transport-shock-confirmation-factor/: ${options.templateDir}`);
  return options;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function remaining(value) {
  return Math.max(0, Number(value || 0));
}

function safeFileName(value) {
  return String(value || 'sample')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 100) || 'sample';
}

function familyDirection(familyKey) {
  return familyKey === 'known_disruption_tightening' ? 'tightening' : 'zero_contribution_control';
}

function contributionForFamily(familyKey) {
  return familyKey === 'known_disruption_tightening' ? 2 : 0;
}

function evidenceHintForFamily(familyKey) {
  if (familyKey === 'known_disruption_tightening') {
    return 'Fill with public source links showing transport disruption plus physical/market confirmation for the same event window.';
  }
  return 'Fill with public source links showing the headline/noise/control event and why contribution should remain zero.';
}

function buildTemplate({ familyKey, ordinal }) {
  const sampleId = `manual-draft-${familyKey}-${String(ordinal).padStart(2, '0')}`;
  return {
    schemaVersion: SAMPLE_INPUT_SCHEMA,
    sampleStatus: 'draft_operator_input_required',
    sampleId,
    familyKey,
    sampleWindow: {
      startDate: 'YYYY-MM-DD',
      endDate: 'YYYY-MM-DD'
    },
    expectedContributionPct: contributionForFamily(familyKey),
    observedCandidateContributionPct: contributionForFamily(familyKey),
    confirmations: {
      transportProxy: 'operator_to_fill',
      marketConfirmation: 'operator_to_fill',
      physicalAnchor: 'operator_to_fill',
      newsClaimLedger: 'operator_to_fill'
    },
    sourceRights: {
      liveFetchApproved: false,
      productionWriteApproved: false,
      scoreApproved: false,
      redistributionApproved: false
    },
    operatorAttestation: {
      realEventCandidate: false,
      sourceRightsReviewed: false,
      rawCitationStorageApproved: false,
      productionUseApproved: false,
      scoreUseApproved: false
    },
    evidence: [
      {
        sourceFamily: 'operator_to_fill',
        sourceStatus: 'manual_required',
        confirmationType: 'operator_to_fill',
        direction: familyDirection(familyKey),
        sourceCitation: 'PASTE_PUBLIC_SOURCE_URL_OR_REFERENCE_HERE',
        rawCitationStored: false,
        note: evidenceHintForFamily(familyKey)
      }
    ],
    operatorNotes: [
      'Replace YYYY-MM-DD, sourceFamily, confirmationType, direction and citation placeholders before intake.',
      'Set operatorAttestation.realEventCandidate/sourceRightsReviewed to true only after manual review.',
      'Keep productionUseApproved=false and scoreUseApproved=false until a separate reviewed score integration PR.'
    ]
  };
}

function buildTemplatePlans(monitor) {
  const gaps = monitor.targetGaps || {};
  const plans = [];
  let ordinal = 1;
  for (let index = 0; index < remaining(gaps.knownDisruptionSamples?.remaining); index += 1) {
    plans.push({ familyKey: 'known_disruption_tightening', ordinal: ordinal++ });
  }
  for (let index = 0; index < remaining(gaps.zeroControlSamples?.remaining); index += 1) {
    plans.push({ familyKey: ZERO_CONTROL_FAMILIES[index % ZERO_CONTROL_FAMILIES.length], ordinal: ordinal++ });
  }
  const existingCount = plans.length;
  for (let index = existingCount; index < remaining(gaps.realEventSamples?.remaining); index += 1) {
    plans.push({ familyKey: 'benign_baseline', ordinal: ordinal++ });
  }
  return plans;
}

function falseImpactMap() {
  return {
    writesProductionData: false,
    modifiesFrontend: false,
    modifiesWorkerRuntime: false,
    modifiesWorkflow: false,
    triggersDaily: false,
    fetchesNetwork: false,
    affectsValues: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsMainJudgment: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function validateMonitor(monitor) {
  const blockers = [];
  if (monitor.monitorVersion !== MONITOR_VERSION) blockers.push('monitor_version_invalid');
  if (!['sample_targets_incomplete_collect_more', 'sample_targets_satisfied_requires_separate_score_review'].includes(monitor.status)) blockers.push('monitor_status_invalid');
  if (monitor.scoreWriteApproved !== false) blockers.push('score_write_approved_claimed');
  if (monitor.productionDataWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (monitor.scoreIntegrationApproved !== false) blockers.push('score_integration_approved_claimed');
  if (monitor.eligibleForMainScore !== false) blockers.push('main_score_eligibility_claimed');
  if (monitor.productionImpact?.affectsScoring !== false) blockers.push('affects_scoring_claimed');
  if (String(JSON.stringify(monitor)).includes('https://')) blockers.push('raw_url_leaked_in_monitor');
  return blockers;
}

function buildPrep(monitor, options) {
  const blockers = validateMonitor(monitor);
  const templatePlans = blockers.length === 0 && monitor.status === 'sample_targets_incomplete_collect_more'
    ? buildTemplatePlans(monitor)
    : [];
  const templates = templatePlans.map((plan) => {
    const template = buildTemplate(plan);
    return {
      familyKey: plan.familyKey,
      sampleId: template.sampleId,
      draftPath: `${safeRelativePath(options.templateDir)}/${safeFileName(template.sampleId)}.json`,
      template
    };
  });
  return {
    schemaVersion: OUTPUT_SCHEMA,
    status: blockers.length > 0
      ? 'sample_input_prep_blocked_keep_no_score_write'
      : templates.length > 0
        ? 'sample_input_prep_ready_operator_required'
        : 'sample_input_prep_not_required_gate_satisfied',
    recommendation: templates.length > 0
      ? 'fill_operator_templates_then_run_real_event_sample_intake'
      : blockers.length > 0
        ? 'fix_gate_monitor_before_preparing_inputs'
        : 'open_separate_score_integration_review_no_auto_wire',
    generatedAt: new Date().toISOString(),
    inputPath: safeRelativePath(options.input),
    templateDir: safeRelativePath(options.templateDir),
    gapSnapshot: monitor.targetGaps || {},
    templateCount: templates.length,
    templateFamilyCounts: templates.reduce((counts, item) => {
      counts[item.familyKey] = (counts[item.familyKey] || 0) + 1;
      return counts;
    }, {}),
    templates,
    blockers,
    draftOnly: true,
    operatorInputRequired: templates.length > 0,
    scoreWriteApproved: false,
    productionDataWriteApproved: false,
    scoreIntegrationApproved: false,
    eligibleForMainScore: false,
    productionImpact: falseImpactMap(),
    boundary: BOUNDARY
  };
}

function writeTemplates(prep) {
  for (const item of prep.templates) writeJson(item.draftPath, item.template);
}

function printSummary(prep) {
  console.log(`Transport Shock free-proxy real-event sample input prep: ${prep.status}`);
  console.log(`recommendation: ${prep.recommendation}`);
  console.log(`templateCount: ${prep.templateCount}`);
  console.log(`families: ${Object.entries(prep.templateFamilyCounts).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`);
  console.log(`operatorInputRequired: ${prep.operatorInputRequired}`);
  console.log(`scoreWriteApproved: ${prep.scoreWriteApproved}`);
  console.log(`boundary: ${prep.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const monitor = readJson(options.input);
    const prep = buildPrep(monitor, options);
    if (!options.dryRun && options.writeOutput) writeJson(options.output, prep);
    if (!options.dryRun && options.writeTemplates) writeTemplates(prep);
    if (options.printJson) console.log(JSON.stringify(prep, null, 2));
    else printSummary(prep);
    if (prep.status === 'sample_input_prep_blocked_keep_no_score_write') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
