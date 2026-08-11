import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAcledMonthlyFilename } from './world-order/acled-monthly-filename.mjs';
import {
  ACLED_CONFIG_PATHS,
  validateAcledPublishContext
} from './world-order/acled-publish-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const exact = parseAcledMonthlyFilename(
  'number_of_political_violence_events_by_country-month-year_as-of-31Jul2026.xlsx'
);
assert.deepEqual(exact, {
  slug: 'political_violence_events_by_country-month-year',
  asOfDate: '2026-07-31'
});

for (const filename of [
  'number_of_reported_fatalities_by_country-year_as-of-31Jul2026_0.xlsx',
  'number_of_reported_fatalities_by_country-year_as-of-31Jul2026 (1).xlsx',
  'number_of_reported_fatalities_by_country-year_as-of-31Jul2026-copy.XLSX'
]) {
  assert.equal(parseAcledMonthlyFilename(filename)?.asOfDate, '2026-07-31', filename);
}

for (const filename of [
  'reported_fatalities_by_country-year_as-of-31Jul2026.xlsx',
  'number_of_reported_fatalities_by_country-year.xlsx',
  'number_of_reported_fatalities_by_country-year_as-of-31Foo2026.xlsx',
  'number_of_reported_fatalities_by_country-year_as-of-31Feb2026.xlsx',
  'number_of_reported_fatalities_by_country-year_as-of-31Jul2026/other.xlsx'
]) {
  assert.equal(parseAcledMonthlyFilename(filename), null, filename);
}

const cleanMain = {
  currentBranch: 'main',
  upstreamBranch: 'origin/main',
  behindCount: 0,
  trackedChangePaths: [],
  aheadCommitPaths: [],
  unmergedPaths: []
};
assert.deepEqual(validateAcledPublishContext(cleanMain), []);
assert.deepEqual(validateAcledPublishContext({
  ...cleanMain,
  trackedChangePaths: ACLED_CONFIG_PATHS,
  aheadCommitPaths: ACLED_CONFIG_PATHS
}), []);
assert.match(
  validateAcledPublishContext({ ...cleanMain, currentBranch: 'codex/acled-refresh' }).join('\n'),
  /current branch must be main/u
);
assert.match(
  validateAcledPublishContext({ ...cleanMain, behindCount: 2 }).join('\n'),
  /behind origin\/main by 2/u
);
assert.match(
  validateAcledPublishContext({ ...cleanMain, trackedChangePaths: ['scripts/app.js'] }).join('\n'),
  /unrelated tracked changes/u
);

const publishSource = fs.readFileSync(path.join(root, 'scripts', 'world-order', 'acled-publish.mjs'), 'utf8');
assert.match(publishSource, /ensureMainPublishContext\(\);/u);
assert.match(publishSource, /git push origin main:main/u);
assert.match(publishSource, /gh workflow run "\$\{WORKFLOW_NAME\}" --ref "\$\{ACLED_PUBLISH_BRANCH\}"/u);
assert.doesNotMatch(publishSource, /git pull --rebase/u);

console.log('ACLED operator safety check: PASS (tolerant monthly names + main-only publish guard)');
