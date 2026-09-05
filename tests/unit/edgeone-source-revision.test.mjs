import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/publish-edgeone-release.yml', import.meta.url), 'utf8');
const steps = workflow.split(/^      - name: /mu).slice(1);
const step = name => {
  const matches = steps.filter(value => value.startsWith(`${name}\n`) || value.startsWith(`${name}\r\n`));
  assert.equal(matches.length, 1, `exactly one ${name} step`);
  return matches[0];
};

test('EdgeOne queued publication checks out main rather than its old trigger revision', () => {
  const checkout = step('Checkout source repository');
  assert.match(checkout, /with:\s+ref: main\s+fetch-depth: 0/u);
  assert.doesNotMatch(checkout, /github\.sha|github\.event|GITHUB_SHA/u);
});

test('source provenance is captured before validation and remains fixed through build', () => {
  const ordered = ['Checkout source repository', 'Record checked source revision', 'Setup Node.js',
    'Install dependencies', 'Run full check suite', 'Build allowlisted static artifact',
    'Publish changed artifact with quota guard'].map(name => workflow.indexOf(`- name: ${name}`));
  assert.ok(ordered.every((value, index) => value >= 0 && (index === 0 || value > ordered[index - 1])));
  const record = step('Record checked source revision');
  assert.ok(record.includes('source_sha=$(git rev-parse HEAD)'));
  assert.ok(record.includes('echo "sha=$source_sha" >> "$GITHUB_OUTPUT"'));
  assert.ok(record.includes('^[0-9a-f]{40}$'));
  const validated = workflow.slice(workflow.indexOf('- name: Run full check suite'),
    workflow.indexOf('- name: Publish changed artifact with quota guard'));
  assert.doesNotMatch(validated, /git\s+(?:fetch|pull|checkout|switch|reset)|actions\/checkout/u);
});

test('release attribution uses the actual checked SHA and verifies it before changing directories', () => {
  const publish = step('Publish changed artifact with quota guard');
  assert.ok(publish.includes('SOURCE_SHA: ${{ steps.source_revision.outputs.sha }}'));
  const verify = publish.indexOf('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"');
  assert.ok(verify >= 0 && verify < publish.indexOf('release_dir='));
  assert.ok(publish.includes('chore: publish source ${SOURCE_SHA::12}'));
  assert.doesNotMatch(publish, /GITHUB_SHA/u);
});

test('publication retains low-frequency, no-change and quota protections', () => {
  const publish = step('Publish changed artifact with quota guard');
  assert.ok(workflow.includes("cron: '55 */3 * * *'"));
  assert.ok(workflow.includes('contents: read'));
  assert.ok(workflow.includes('cancel-in-progress: false'));
  assert.ok(publish.includes('git diff --cached --quiet'));
  assert.ok(publish.includes('"$release_count" -ge 400'));
  assert.ok(publish.indexOf('"$release_count" -ge 400') < publish.indexOf('git push origin main'));
  assert.doesNotMatch(workflow, /contents: write|EDGEONE_API_TOKEN/u);
});
