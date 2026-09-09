import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('full checks reach both GDELT guards exactly once; standalone oil checks retain them', () => {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
  const source = readFileSync('scripts/check-suite.mjs', 'utf8');
  const suites = vm.runInNewContext(`${source.slice(source.indexOf('const SUITES'), source.indexOf('const suiteName'))}\nSUITES`);
  function expand(name, stack = []) {
    assert(!stack.includes(name), `cyclic check dependency ${name}`);
    assert.equal(typeof scripts[name], 'string', `missing check ${name}`);
    const next = [...stack, name];
    const result = [name];
    for (const match of scripts[name].matchAll(/npm run ([\w:-]+)/gu)) result.push(...expand(match[1], next));
    for (const match of scripts[name].matchAll(/node scripts\/check-suite\.mjs ([\w-]+)/gu)) {
      assert(suites[match[1]], `missing suite ${match[1]}`);
      for (const child of suites[match[1]]) result.push(...expand(child, next));
    }
    return result;
  }
  for (const entry of ['check:all', 'check:oil-directional']) {
    const names = expand(entry);
    for (const target of ['check:gdelt-web-ngrams-frontend-aggregate-health', 'check:gdelt-web-ngrams-automated-display-cache']) {
      assert.equal(names.filter((name) => name === target).length, 1, `${entry} -> ${target}`);
    }
  }
});
