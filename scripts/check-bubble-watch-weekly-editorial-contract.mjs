import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertValid,
  validateWeeklyEditorialInput,
  validateWeeklyEditorialOutput,
  validateWeeklyEditorialReview
} from './bubble-watch/weekly-editorial-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(ROOT, 'docs', 'fixtures', 'bubble-watch-weekly-editorial');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function expectFailure(result, expectedFragment, label) {
  if (result.ok) throw new Error(`${label} unexpectedly passed`);
  if (!result.errors.some((error) => error.includes(expectedFragment))) {
    throw new Error(`${label} missed expected error ${expectedFragment}: ${result.errors.join('; ')}`);
  }
}

const input = readJson('sample-input-v1.json');
const output = readJson('sample-output-v1.json');
const review = readJson('sample-review-v1.json');

assertValid(validateWeeklyEditorialInput(input), 'weekly editorial input fixture');
const outputResult = assertValid(validateWeeklyEditorialOutput(output, input), 'weekly editorial output fixture');
assertValid(validateWeeklyEditorialReview(review), 'weekly editorial review fixture');

const unknownRef = clone(output);
unknownRef.weeklyTimeline[0].sourceRefIds = ['news:unknown'];
expectFailure(validateWeeklyEditorialOutput(unknownRef, input), 'unknown source', 'unknown source negative test');

const discoveryOnlyInput = clone(input);
discoveryOnlyInput.newsContext.stories[0].evidenceStatus = 'discovery_only';
const discoveryOnlyOutput = clone(output);
discoveryOnlyOutput.weeklyTimeline[0].sourceRefIds = ['news:financing-sample'];
expectFailure(validateWeeklyEditorialOutput(discoveryOnlyOutput, discoveryOnlyInput), 'relies only on discovery_only news', 'discovery-only negative test');

const scoreMutation = clone(output);
scoreMutation.boundaries.affectsCore23 = true;
expectFailure(validateWeeklyEditorialOutput(scoreMutation, input), 'affectsCore23 must be false', 'score boundary negative test');

const unsafe = clone(output);
unsafe.watchNextWeek[0].conditionZh = '建议买入并加仓以等待反弹。';
expectFailure(validateWeeklyEditorialOutput(unsafe, input), 'unsafe wording', 'unsafe wording negative test');

const promotedReview = clone(review);
promotedReview.promotionEligible = true;
expectFailure(validateWeeklyEditorialReview(promotedReview), 'promotionEligible must remain false', 'promotion negative test');

const unknownIndicator = clone(output);
unknownIndicator.watchNextWeek[0].sourceIndicatorIds = ['unknown_indicator'];
expectFailure(validateWeeklyEditorialOutput(unknownIndicator, input), 'unknown indicator', 'unknown indicator negative test');

console.log(`Bubble Watch weekly editorial contract PASS (visible fixture chars=${outputResult.visibleTextLength}, negative tests=6)`);
