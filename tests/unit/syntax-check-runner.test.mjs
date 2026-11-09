import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkFileSyntax, checkSyntaxFiles, collectScriptFiles, syntaxConcurrency } from '../../scripts/check-syntax.mjs';

const checker = fileURLToPath(new URL('../../scripts/check-syntax.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gfrr-syntax-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, text) => {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    return target;
  };
  mkdirSync(join(root, 'scripts'));
  return { root, put };
}

test('syntax discovery retains recursive JS/MJS scope and directory exclusions', t => {
  const { root, put } = fixture(t);
  const expected = ['scripts/a.js', 'scripts/deep/b.mjs', 'scripts/other/c.js'];
  expected.forEach(file => put(file, 'const valid = 1;'));
  for (const file of ['scripts/.git/ignore.js', 'scripts/deep/node_modules/ignore.mjs',
    'scripts/a.cjs', 'scripts/a.json', 'scripts/a.JS']) put(file, 'not JavaScript!');
  assert.deepEqual(collectScriptFiles(join(root, 'scripts')).sort(),
    expected.map(file => join(root, file).replaceAll('\\', '/')).sort());
});

test('syntax discovery does not follow directory or file symlinks', t => {
  const { root, put } = fixture(t);
  put('outside/bad.js', 'const =');
  symlinkSync(join(root, 'outside'), join(root, 'scripts/linked'), 'junction');
  if (process.platform !== 'win32') symlinkSync(join(root, 'outside/bad.js'), join(root, 'scripts/linked.js'));
  assert.deepEqual(collectScriptFiles(join(root, 'scripts')), []);
});

test('bounded syntax workers keep every result in input order despite completion order', async () => {
  let running = 0, peak = 0;
  const completed = [], files = ['a', 'b', 'c', 'd', 'e', 'f'];
  const results = await checkSyntaxFiles(files, { concurrency: 4, check: async file => {
    running++; peak = Math.max(peak, running);
    await new Promise(done => setTimeout(done, file === 'a' ? 30 : 1));
    completed.push(file); running--;
    return { status: file === 'b' || file === 'e' ? 1 : 0, stdout: file, stderr: '' };
  } });
  assert.equal(peak, 4);
  assert.notDeepEqual(completed, files);
  assert.deepEqual(results.map(result => result.stdout), files);
  assert.deepEqual(results.map(result => result.status), [0, 1, 0, 0, 1, 0]);
  assert.equal(running, 0);
});

test('concurrency is capped at four and a single CPU stays serial', async () => {
  assert.equal(syntaxConcurrency(1), 1);
  assert.equal(syntaxConcurrency(2), 2);
  assert.equal(syntaxConcurrency(9), 4);
  for (const invalid of [0, -1, NaN, Infinity, 1.5]) assert.equal(syntaxConcurrency(invalid), 1);
  for (const [requested, expectedPeak] of [[1, 1], [100, 4]]) {
    let running = 0, peak = 0;
    await checkSyntaxFiles(Array.from({ length: 8 }, (_, index) => String(index)), {
      concurrency: requested, check: async () => {
        running++; peak = Math.max(peak, running);
        await new Promise(done => setImmediate(done)); running--;
        return { status: 0, stdout: '', stderr: '' };
      }
    });
    assert.equal(peak, expectedPeak);
  }
});

test('syntax adapter keeps real Node --check, bounded output and fail-closed child errors', async () => {
  for (const error of [null, { code: 1 }, { signal: 'SIGTERM' }, { code: 'ENOENT' },
    { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }]) {
    const result = await checkFileSyntax('example.mjs', (command, args, options, done) => {
      assert.equal(command, process.execPath);
      assert.deepEqual(args, ['--check', 'example.mjs']);
      assert.deepEqual(options, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      done(error, 'child stdout', 'child stderr');
    });
    assert.equal(result.status, error ? null : 0);
    assert.equal(result.stdout, 'child stdout');
    assert.equal(result.stderr, 'child stderr');
  }
});

test('a thrown spawn error does not prevent later files from being checked', async () => {
  const seen = [];
  const results = await checkSyntaxFiles(['before', 'missing', 'after'], { concurrency: 1, check: async file => {
    seen.push(file);
    if (file === 'missing') throw new Error('spawn unavailable');
    return { status: 0, stdout: '', stderr: '' };
  } });
  assert.deepEqual(seen, ['before', 'missing', 'after']);
  assert.equal(results[1].status, null);
  assert.match(results[1].stderr, /spawn unavailable/u);
});

test('empty syntax collection launches no children and remains a successful check', async t => {
  let calls = 0;
  assert.deepEqual(await checkSyntaxFiles([], { check: () => { calls++; } }), []);
  assert.equal(calls, 0);
  const { root } = fixture(t);
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'Syntax check passed\n');
  assert.equal(result.stderr, '');
});

test('CLI checks all valid and invalid files in the original sorted diagnostic order', t => {
  const { root, put } = fixture(t);
  put('scripts/d-bad.mjs', 'export const broken = ;');
  put('scripts/c-good.mjs', 'export const valid = 1;');
  put('scripts/b-bad.js', 'const broken = ;');
  put('scripts/a-good.js', 'const valid = 1;');
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.deepEqual(result.stdout.trim().split('\n'), ['OK scripts/a-good.js', 'OK scripts/c-good.mjs']);
  assert.deepEqual(result.stderr.split('\n').filter(line => line.startsWith('FAIL ')),
    ['FAIL scripts/b-bad.js', 'FAIL scripts/d-bad.mjs']);
  assert.match(result.stderr, /SyntaxError/u);
  assert.match(result.stderr, /Syntax check failed: 2 file\(s\) failed/u);
  assert.doesNotMatch(result.stdout, /Syntax check passed/u);
});

test('real syntax checks never execute valid JavaScript or change checked bytes', async t => {
  const { root, put } = fixture(t);
  const sentinel = join(root, 'must-not-exist');
  const source = `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(sentinel)}, 'executed');\nthrow new Error('must not run');\n`;
  const file = put('scripts/valid.mjs', source);
  assert.equal((await checkFileSyntax(file)).status, 0);
  assert.equal(existsSync(sentinel), false);
  assert.equal(readFileSync(file, 'utf8'), source);
  assert.equal((await checkFileSyntax(resolve(root, 'missing.js'))).status, null);
});
