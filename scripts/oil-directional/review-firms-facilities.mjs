#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath } from '../lib/check-script-helpers.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'firms-facilities-review-p18';
const DEFAULT_FACILITIES = 'manual-artifacts/oil-thermal/facilities.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/firms-facilities-review-latest.json';
const DEFAULT_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
const VALID_SOURCES = new Set([...DEFAULT_SOURCES, 'MODIS_NRT']);
const MAX_FACILITIES_PER_RUN = 50;
const MAX_REQUESTS_PER_RUN = 150;
const MAX_FACILITY_BBOX_SPAN_DEGREES = 1.5;
const BOUNDARY =
  'manual facility-list review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:firms-facilities -- [options]

Options:
  --facilities <path>      Facility JSON list. Default: ${DEFAULT_FACILITIES}
  --output <path>          Review artifact path. Default: ${DEFAULT_OUTPUT}
  --sources <a,b,c>        FIRMS sources used to estimate request budget. Default: ${DEFAULT_SOURCES.join(',')}
  --min-facilities <n>     Warning threshold for facility coverage. Default: 1
  --require-regions <a,b>  Optional warning threshold by region labels.
  --strict                 Exit non-zero on WARN or FAIL.
  --no-output              Do not write the review artifact.
  --help                   Show this help.`);
}

function parseArgs(argv) {
  const options = {
    facilities: DEFAULT_FACILITIES,
    output: DEFAULT_OUTPUT,
    sources: [...DEFAULT_SOURCES],
    minFacilities: 1,
    requiredRegions: [],
    strict: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === '--facilities') {
      options.facilities = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--sources') {
      options.sources = nextValue().split(',').map((item) => item.trim()).filter(Boolean);
    } else if (arg === '--min-facilities') {
      options.minFacilities = Number(nextValue());
    } else if (arg === '--require-regions') {
      options.requiredRegions = nextValue().split(',').map((item) => item.trim()).filter(Boolean);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.minFacilities) || options.minFacilities < 1 || options.minFacilities > MAX_FACILITIES_PER_RUN) {
    throw new Error(`Invalid --min-facilities. Expected 1..${MAX_FACILITIES_PER_RUN}.`);
  }
  if (options.sources.length === 0) {
    throw new Error('At least one FIRMS source is required.');
  }
  const invalidSources = options.sources.filter((source) => !VALID_SOURCES.has(source));
  if (invalidSources.length > 0) {
    throw new Error(`Unsupported FIRMS source(s): ${invalidSources.join(', ')}`);
  }

  options.sources = [...new Set(options.sources)];
  options.requiredRegions = [...new Set(options.requiredRegions)];
  return options;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSafeOutputPath(filePath) {
  return isManualArtifactPath(filePath);
}

function readFacilityFile(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  const facilities = Array.isArray(parsed) ? parsed : parsed.facilities;
  if (!Array.isArray(facilities)) {
    throw new Error('Facility file must be a JSON array or an object with facilities array.');
  }
  return {
    schemaVersion: isPlainObject(parsed) && typeof parsed.schemaVersion === 'string' ? parsed.schemaVersion : null,
    notes: isPlainObject(parsed) && typeof parsed.notes === 'string' ? parsed.notes : null,
    facilities
  };
}

function parseBbox(rawBbox) {
  const values = Array.isArray(rawBbox)
    ? rawBbox.map((item) => Number(item))
    : String(rawBbox ?? '').split(',').map((item) => Number(item.trim()));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return {
      ok: false,
      reason: 'bbox must be west,south,east,north numeric coordinates'
    };
  }
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    return {
      ok: false,
      values,
      reason: 'bbox bounds are invalid'
    };
  }
  const width = east - west;
  const height = north - south;
  return {
    ok: true,
    values,
    bbox: { west, south, east, north },
    width,
    height,
    smallEnough: width <= MAX_FACILITY_BBOX_SPAN_DEGREES && height <= MAX_FACILITY_BBOX_SPAN_DEGREES
  };
}

function isExampleFacility(facility) {
  const text = `${facility?.id ?? ''} ${facility?.label ?? ''} ${facility?.sourceNote ?? ''}`.toLowerCase();
  return text.includes('example') || text.includes('replace with an operator-reviewed public coordinate source');
}

function normalizeFacility(rawFacility, index) {
  const id = String(rawFacility?.id ?? '').trim();
  const label = String(rawFacility?.label ?? rawFacility?.name ?? '').trim();
  const region = String(rawFacility?.region ?? '').trim();
  const assetType = String(rawFacility?.assetType ?? '').trim();
  const sourceNote = String(rawFacility?.sourceNote ?? '').trim();
  const bbox = parseBbox(rawFacility?.bbox);

  return {
    index,
    id,
    label,
    region,
    assetType,
    sourceNote,
    bbox,
    isExample: isExampleFacility(rawFacility)
  };
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = getKey(item);
    if (!key) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function createBaseReview(options, facilityFile) {
  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    input: {
      path: resolve(options.facilities),
      schemaVersion: facilityFile.schemaVersion,
      manualArtifactPath: isManualArtifactPath(options.facilities)
    },
    status: 'pass',
    recommendation: 'ready_for_manual_diagnosis',
    promotionEligible: false,
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    },
    requestBudget: {
      sources: options.sources,
      sourceCount: options.sources.length,
      maxRequestsPerRun: MAX_REQUESTS_PER_RUN
    },
    coverage: {},
    blockers: [],
    warnings: [],
    boundary: BOUNDARY
  };
}

function addBlocker(review, message) {
  review.blockers.push(message);
}

function addWarning(review, message) {
  review.warnings.push(message);
}

function validateFacilityRows(review, facilities) {
  const seenIds = new Set();
  const duplicateIds = new Set();
  const invalidIdRows = [];
  const missingLabelRows = [];
  const missingMetadataRows = [];
  const invalidBboxRows = [];
  const oversizedBboxRows = [];

  facilities.forEach((facility) => {
    if (!facility.id || !/^[A-Za-z0-9_.:-]+$/.test(facility.id)) {
      invalidIdRows.push(facility.index);
    } else if (seenIds.has(facility.id)) {
      duplicateIds.add(facility.id);
    } else {
      seenIds.add(facility.id);
    }

    if (!facility.label) {
      missingLabelRows.push(facility.id || `index:${facility.index}`);
    }
    if (!facility.region || !facility.assetType || !facility.sourceNote) {
      missingMetadataRows.push(facility.id || `index:${facility.index}`);
    }
    if (!facility.bbox.ok) {
      invalidBboxRows.push(facility.id || `index:${facility.index}`);
    } else if (!facility.bbox.smallEnough) {
      oversizedBboxRows.push(facility.id || `index:${facility.index}`);
    }
  });

  if (invalidIdRows.length > 0) {
    addBlocker(review, `Facility rows with invalid id: ${invalidIdRows.join(', ')}`);
  }
  if (duplicateIds.size > 0) {
    addBlocker(review, `Duplicate facility ids: ${[...duplicateIds].join(', ')}`);
  }
  if (missingLabelRows.length > 0) {
    addBlocker(review, `Facility rows missing label: ${missingLabelRows.join(', ')}`);
  }
  if (invalidBboxRows.length > 0) {
    addBlocker(review, `Facility rows with invalid bbox: ${invalidBboxRows.join(', ')}`);
  }
  if (oversizedBboxRows.length > 0) {
    addBlocker(
      review,
      `Facility rows with bbox span above ${MAX_FACILITY_BBOX_SPAN_DEGREES} degrees: ${oversizedBboxRows.join(', ')}`
    );
  }
  if (missingMetadataRows.length > 0) {
    addWarning(review, `Facility rows missing region, assetType or sourceNote: ${missingMetadataRows.join(', ')}`);
  }
}

function reviewFacilityCoverage(options, facilityFile) {
  const facilities = facilityFile.facilities.map((facility, index) => normalizeFacility(facility, index));
  const review = createBaseReview(options, facilityFile);
  const facilityCount = facilities.length;
  const requestCount = facilityCount * options.sources.length;
  const exampleFacilities = facilities.filter((facility) => facility.isExample);
  const regions = countBy(facilities, (facility) => facility.region || '(missing_region)');
  const assetTypes = countBy(facilities, (facility) => facility.assetType || '(missing_assetType)');
  const missingRequiredRegions = options.requiredRegions.filter((region) => !regions[region]);

  review.requestBudget.facilityCount = facilityCount;
  review.requestBudget.estimatedRequestsPerRun = requestCount;
  review.requestBudget.withinBudget = requestCount <= MAX_REQUESTS_PER_RUN;
  review.coverage = {
    facilityCount,
    minFacilities: options.minFacilities,
    regionCount: Object.keys(regions).filter((region) => region !== '(missing_region)').length,
    assetTypeCount: Object.keys(assetTypes).filter((assetType) => assetType !== '(missing_assetType)').length,
    regions,
    assetTypes,
    exampleFacilityCount: exampleFacilities.length,
    exampleFacilityIds: exampleFacilities.map((facility) => facility.id || `index:${facility.index}`),
    requiredRegions: options.requiredRegions,
    missingRequiredRegions
  };

  if (facilityCount === 0) {
    addBlocker(review, 'Facility list is empty.');
  }
  if (facilityCount > MAX_FACILITIES_PER_RUN) {
    addBlocker(review, `Facility list has ${facilityCount} rows; max manual run size is ${MAX_FACILITIES_PER_RUN}.`);
  }
  if (requestCount > MAX_REQUESTS_PER_RUN) {
    addBlocker(review, `Estimated FIRMS request count ${requestCount} exceeds manual budget ${MAX_REQUESTS_PER_RUN}.`);
  }
  if (facilityCount < options.minFacilities) {
    addWarning(review, `Facility count ${facilityCount} is below requested minimum ${options.minFacilities}.`);
  }
  if (!review.input.manualArtifactPath && !safeRelativePath(options.facilities)?.startsWith('docs/fixtures/')) {
    addWarning(review, 'Facility input is not under manual-artifacts/; real facility coordinates should stay ignored.');
  }
  if (exampleFacilities.length > 0) {
    addWarning(review, `Example facility rows remain: ${review.coverage.exampleFacilityIds.join(', ')}`);
  }
  if (missingRequiredRegions.length > 0) {
    addWarning(review, `Required regions not covered: ${missingRequiredRegions.join(', ')}`);
  }

  validateFacilityRows(review, facilities);
  return finalizeReview(review);
}

function finalizeReview(review) {
  if (review.blockers.length > 0) {
    review.status = 'fail';
    review.recommendation = 'reject_facility_list';
  } else if (review.warnings.length > 0) {
    review.status = 'warn';
    if (review.coverage.exampleFacilityCount === review.coverage.facilityCount && review.coverage.facilityCount > 0) {
      review.recommendation = 'replace_example_facilities_before_live_batch';
    } else {
      review.recommendation = 'manual_cleanup_recommended';
    }
  }

  review.promotionEligible = false;
  return review;
}

function writeReview(outputPath, review) {
  if (!isSafeOutputPath(outputPath)) {
    throw new Error(`Unsafe output path rejected: ${outputPath}`);
  }
  const absoluteOutputPath = resolve(outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, `${JSON.stringify(review, null, 2)}\n`);
  return absoluteOutputPath;
}

function printReview(review, outputPath) {
  console.log(`FIRMS facility-list review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log('promotionEligible: false');
  console.log(`facilityCount: ${review.coverage.facilityCount ?? 'unknown'}`);
  console.log(`regionCount: ${review.coverage.regionCount ?? 'unknown'}`);
  console.log(`assetTypeCount: ${review.coverage.assetTypeCount ?? 'unknown'}`);
  console.log(`estimatedRequestsPerRun: ${review.requestBudget.estimatedRequestsPerRun ?? 'unknown'}`);
  console.log(`exampleFacilityCount: ${review.coverage.exampleFacilityCount ?? 'unknown'}`);
  console.log(`warnings: ${review.warnings.length}`);
  review.warnings.slice(0, 5).forEach((warning, index) => {
    console.log(`warning[${index}]: ${warning}`);
  });
  console.log(`blockers: ${review.blockers.length}`);
  review.blockers.slice(0, 5).forEach((blocker, index) => {
    console.log(`blocker[${index}]: ${blocker}`);
  });
  if (outputPath) {
    console.log(`output: ${outputPath}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const facilityFile = readFacilityFile(options.facilities);
  const review = reviewFacilityCoverage(options, facilityFile);
  const outputPath = options.writeOutput ? writeReview(options.output, review) : null;
  printReview(review, outputPath);

  if (review.status === 'fail' || (options.strict && review.status !== 'pass')) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error('FIRMS facility-list review: FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
