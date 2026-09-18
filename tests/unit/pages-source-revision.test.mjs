import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.ok(workflow.includes('workflows: [Macro Risk Editorial Refresh, Bubble Watch Weekly Editorial Refresh, Bubble Watch Editorial Follow-up, Refresh Oil Directional Pressure]'));
  assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.match(workflow, /types: \[completed\]\s+branches: \[main\]/u);
  assert.ok(workflow.includes("cron: '55 */3 * * *'"));
  assert.ok(workflow.includes('ref: main'));
  assert.ok(workflow.includes('if git diff --cached --quiet; then'));
  assert.ok(workflow.includes("git rev-list --count --since='32 days ago' HEAD"));
  assert.ok(workflow.includes('if [ "$release_count" -ge 400 ]; then'));
  assert.ok(workflow.includes('cancel-in-progress: false'));
});
