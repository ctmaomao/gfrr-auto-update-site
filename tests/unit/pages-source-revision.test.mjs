import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import test from 'node:test';

test('queued production Pages jobs build checked latest-main rather than the triggering revision', () => {
  const workflow = readFileSync('.github/workflows/deploy-static-site-to-pages.yml', 'utf8');
  assert.match(workflow, /types:\s+- completed\s+branches:\s+- main/u);
  assert.ok(workflow.includes("github.ref == 'refs/heads/main' && (github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success')"));
  assert.match(workflow, /name: Checkout repository[\s\S]*?with:\s+ref: main\s+fetch-depth: 0/u);
  const recorded = workflow.indexOf('source_sha=$(git rev-parse HEAD)');
  const checked = workflow.indexOf('run: npm run check:all');
  const pinned = workflow.indexOf('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"');
  const built = workflow.indexOf('npm run build:pages-artifact');
  assert.ok(recorded >= 0 && recorded < checked && checked < pinned && pinned < built);
  assert.ok(workflow.includes('SOURCE_SHA: ${{ steps.source_revision.outputs.sha }}'));
  assert.ok(workflow.includes('checked latest-main source: ${source_sha}'));
  assert.doesNotMatch(workflow.slice(recorded), /git (?:pull|checkout|reset|switch)\b/u);
  assert.match(workflow, /group: 'pages'[\s\S]*?cancel-in-progress: false/u);
});

test('ODP completion can publish without AI success while EdgeOne budget and coalescing remain', () => {
  const workflow = readFileSync('.github/workflows/publish-edgeone-release.yml', 'utf8');
  assert.ok(workflow.includes('workflows: [Macro Risk Editorial Refresh, Bubble Watch Weekly Editorial Refresh, Bubble Watch Editorial Follow-up, Refresh Oil Directional Pressure, Refresh Oil News Event Watch, Refresh Oil Thermal Watch, Build Daily Radar Data, Refresh World Order Stress]'));
  assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.match(workflow, /types: \[completed\]\s+branches: \[main\]/u);
  assert.ok(workflow.includes("cron: '55 */3 * * *'"));
  assert.ok(workflow.includes('ref: main'));
  assert.ok(workflow.includes('if git diff --cached --quiet; then'));
  assert.ok(workflow.includes("git rev-list --count --since='32 days ago' HEAD"));
  assert.ok(workflow.includes('if [ "$release_count" -ge 400 ]; then'));
  assert.ok(workflow.includes('cancel-in-progress: false'));
});

test('Pages reuse is bounded to read-only metadata and inspection failure preserves checked publication', () => {
  const workflow = readFileSync('.github/workflows/deploy-static-site-to-pages.yml', 'utf8');
  const review = workflow.slice(workflow.indexOf('  publication_check:'), workflow.indexOf('\n  deploy:'));
  assert.match(workflow, /force_deploy:\s+description:[^\n]+\s+type: boolean\s+default: true/u);
  assert.match(review, /permissions:\s+contents: read\s+actions: read\s+deployments: read/u);
  assert.doesNotMatch(review, /(?:contents|pages|id-token): write/u);
  assert.ok(review.includes("steps.review.outcome != 'success' || steps.review.outputs.should_deploy != 'false'"));
  assert.match(review, /id: review\s+continue-on-error: true/u);
  assert.ok(review.includes("github.event_name == 'workflow_dispatch' && inputs.force_deploy"));
  assert.ok(review.includes('export SOURCE_SHA="$(git rev-parse HEAD)"'));
  assert.ok(review.includes('node scripts/review-pages-deployment.mjs'));
  assert.match(workflow, /deploy:\s+needs: publication_check/u);
  assert.ok(workflow.includes("!cancelled() && (needs.publication_check.result != 'success' || needs.publication_check.outputs.should_deploy != 'false')"));
  assert.equal((workflow.match(/run: npm run check:all/gu) ?? []).length, 1);
});

test('Pages main pushes filter backend-only work without losing public or publication inputs', () => {
  const workflowPath = '.github/workflows/deploy-static-site-to-pages.yml';
  const workflow = readFileSync(workflowPath, 'utf8');
  const push = /^  push:\n    branches:\n      - main\n    paths:\n((?:      - '[^'\n]+'\n)+)/mu.exec(workflow);
  assert.ok(push, 'production push must remain a paths-filtered main trigger');
  const patterns = [...push[1].matchAll(/^      - '([^']+)'$/gmu)].map(([, value]) => value);
  // Evaluate the filters in declaration order: a negative match excludes only that path.
  const triggers = files => files.some(file => patterns.reduce((included, pattern) => {
    const excludes = pattern.startsWith('!');
    return posix.matchesGlob(file, excludes ? pattern.slice(1) : pattern) ? !excludes : included;
  }, false));

  const builder = 'scripts/build-pages-artifact.mjs';
  const admission = 'scripts/review-pages-deployment.mjs';
  const builderImports = [...readFileSync(builder, 'utf8').matchAll(/^import\s+.+?\s+from\s+'(\.[^']+)'/gmu)]
    .map(([, source]) => posix.join(posix.dirname(builder), source));
  assert.deepEqual(builderImports, ['scripts/weekly-issue-identity.mjs']);
  for (const file of [builder, ...builderImports, admission]) assert.ok(patterns.includes(file), file);

  const backend = ['scripts/check-workflows.mjs', 'scripts/run-daily-pipeline.mjs',
    'scripts/market-pricing/qqq-yahoo-history-refresh.mjs', 'tests/unit/pages-source-revision.test.mjs',
    'docs/PROJECT_BACKLOG.md', 'workers/gfrr-realtime-worker/src/index.js', 'package.json', 'package-lock.json'];
  const readme = 'weekly-reports/README.md';
  for (const file of [...backend, readme]) assert.equal(triggers([file]), false, file);
  assert.equal(triggers([...backend, readme]), false);
  for (const file of ['index.html', 'bubble-watch.html', 'oil-market.html', 'weekly-reports.html',
    'reports/2026-11-23.html', 'weekly-reports/index.html', 'weekly-reports/2026-11-23-r2.html',
    'assets/styles.css', 'scripts/app.js', 'scripts/modules/renderWorldOrder.js',
    'scripts/modules/subdirectory/new-renderer.js', 'data/radar-data.json', 'realtime/market.json',
    builder, ...builderImports, admission, workflowPath]) {
    assert.equal(triggers([file]), true, file);
    assert.equal(triggers([...backend, readme, file]), true, `mixed push with ${file}`);
  }
});
