import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];

function fail(message) {
  errors.push(message);
}

const radarPath = resolve('data/radar-data.json');
const radarData = JSON.parse(readFileSync(radarPath, 'utf8'));

const provenance = radarData?.externalAiInterpretationLayer?.provenance;
const requiredFields = [
  'runId',
  'artifactName',
  'artifactId',
  'artifactDigest',
  'sourceCommit',
  'sourceDataUpdatedAt',
];

if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
  fail('externalAiInterpretationLayer.provenance is missing or not an object');
} else {
  for (const field of requiredFields) {
    if (!(field in provenance)) {
      fail(`externalAiInterpretationLayer.provenance.${field} key is missing`);
    }
  }

  for (const field of requiredFields) {
    if (provenance[field] === null) {
      console.warn(
        `[M-43 soft warn] externalAiInterpretationLayer.provenance.${field} is null. Expected non-null after next external-ai-production-refresh workflow run.`,
      );
    }
  }

  if (provenance.artifactDigest !== null) {
    if (typeof provenance.artifactDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(provenance.artifactDigest)) {
      fail(`externalAiInterpretationLayer.provenance.artifactDigest must be 64-char hex SHA256 string, got: ${typeof provenance.artifactDigest}`);
    }
  }

  if (provenance.sourceCommit !== null) {
    if (typeof provenance.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(provenance.sourceCommit)) {
      fail(`externalAiInterpretationLayer.provenance.sourceCommit must be 40-char hex SHA1 string, got: ${typeof provenance.sourceCommit}`);
    }
  }

  if (provenance.runId !== null) {
    if (typeof provenance.runId !== 'string' || !/^\d+$/u.test(provenance.runId)) {
      fail(`externalAiInterpretationLayer.provenance.runId must be numeric string, got: ${typeof provenance.runId}`);
    }
  }

  if (provenance.sourceDataUpdatedAt !== null) {
    if (typeof provenance.sourceDataUpdatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(provenance.sourceDataUpdatedAt)) {
      fail(`externalAiInterpretationLayer.provenance.sourceDataUpdatedAt must be ISO timestamp string, got: ${typeof provenance.sourceDataUpdatedAt}`);
    }
  }
}

if (errors.length > 0) {
  console.error('External AI provenance completeness check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log('External AI provenance completeness check: PASS');
