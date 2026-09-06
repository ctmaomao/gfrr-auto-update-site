import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseChecks, linkIssues, anchors } from '../../scripts/lib/doc-change-policy.mjs';

test('ordinary prose is light; empty tree is no-op', () => {
  assert.equal(chooseChecks([{ file: 'docs/guides/intro.md', delta: '+Hello reader' }]).mode, 'light');
  assert.equal(chooseChecks([]).mode, 'none');
});
test('governance, consumers, examples, deletion and mixed changes use full checks', () => {
  for (const file of ['CLAUDE.md', 'DESIGN.md', 'docs/ADR/001.md', 'docs/DATA_CONTRACT.md', 'scripts/a.mjs']) assert.equal(chooseChecks([{ file, delta: 'text' }]).mode, 'full');
  for (const delta of ['+npm run check:all', '+`example`', '+必须确认', '-approval required', '+~~~']) assert.equal(chooseChecks([{ file: 'README.md', delta }]).mode, 'full');
  assert.equal(chooseChecks([{ file: 'docs/intro.md', delta: 'text' }], 'readFile("intro.md")').mode, 'full');
  assert.equal(chooseChecks([{ file: 'docs/a.md', deleted: true }]).mode, 'full');
  assert.equal(chooseChecks([{ file: 'docs/a.md', delta: 'Hello' }, { file: 'data/a.json' }]).mode, 'full');
});
test('root, recursive ADR, references, images and percent-encoded anchors are checked', () => {
  const docs = new Map([['CLAUDE.md', '[go](docs/ADR/a.md#中文标题)\n[ref][guide]\n[guide]: docs/ADR/a.md#hello-world\n![image](missing.png)'], ['docs/ADR/a.md', '# 中文标题\n## Hello World\n']]);
  assert.deepEqual([...linkIssues(docs, file => docs.has(file))], ['CLAUDE.md: missing target missing.png']);
  docs.set('CLAUDE.md', '[go](docs/ADR/a.md#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98)');
  assert.equal(linkIssues(docs, file => docs.has(file)).size, 0);
});
test('renaming a target anchor breaks unchanged inbound links', () => {
  const docs = new Map([['README.md', '[go](docs/a.md#old)'], ['docs/a.md', '# New']]);
  assert.equal(linkIssues(docs, file => docs.has(file)).size, 1);
});
test('explicit ids, repeated headings, fenced examples and unresolved references', () => {
  assert.deepEqual([...anchors('# A\n# A\n<a id="manual"></a>')].sort(), ['a', 'a-1', 'manual']);
  assert.ok(anchors('## Run `npm test`').has('run-npm-test'));
  const docs = new Map([['a.md', '```md\n[x](missing.md)\n```\n[x][unknown]']]);
  assert.deepEqual([...linkIssues(docs, file => docs.has(file))], ['a.md: unresolved-reference:unknown']);
});
