import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hoursSinceTimestamp } from '../workers/gfrr-realtime-worker/src/worker-market-preview.js';

const errors = [];

function fail(message) {
  errors.push(message);
}

const radarPath = resolve('data/radar-data.json');
const radarData = JSON.parse(readFileSync(radarPath, 'utf8'));

const fixedNowMs = Date.parse('2026-07-12T12:00:00.000Z');
if (hoursSinceTimestamp('2026-07-12T11:00:00.000Z', fixedNowMs) !== 1) {
  fail('past timestamps must retain their positive age');
}
if (hoursSinceTimestamp('2026-07-12T12:04:00.000Z', fixedNowMs) !== 0) {
  fail('minor clock skew must remain within the five-minute tolerance');
}
if (hoursSinceTimestamp('2026-07-12T12:06:00.000Z', fixedNowMs) !== null) {
  fail('materially future timestamps must be rejected');
}

const promotionAudit = radarData?.brentPricingLayer?.promotionAudit;
if (!promotionAudit || typeof promotionAudit !== 'object') {
  fail('brentPricingLayer.promotionAudit is missing or not an object');
} else {
  const expectedKeys = [
    'promotionApplied',
    'moveStatus',
    'promotionReason',
    'selectedSource',
    'anchorSource',
    'anchorAgeHours'
  ];
  for (const key of expectedKeys) {
    if (!(key in promotionAudit)) {
      fail(`brentPricingLayer.promotionAudit.${key} key is missing`);
    }
  }

  if (promotionAudit.promotionReason === null) {
    console.warn('[M-39 soft warn] promotionReason is null. Expected non-null after M-39 (consensus.reason fallback). Check upstream realtime data.');
  }
  if (promotionAudit.anchorAgeHours === null) {
    console.warn('[M-39 soft warn] anchorAgeHours is null. Expected non-null after M-39 (ageSeconds / observedAt fallback). Check upstream realtime data.');
  }
}

if (errors.length > 0) {
  console.error('Brent promotion audit field check FAILED:');
  for (const error of errors) {
    console.error('  -', error);
  }
  process.exit(1);
}

console.log('Brent promotion audit field check: PASS');
