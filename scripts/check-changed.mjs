import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { chooseChecks, linkIssues } from './lib/doc-change-policy.mjs';

const git = (...args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const split = (text) => text.split('\0').filter(Boolean);
const args = process.argv.slice(2);
if (args.some(arg => !['--plan', '--links-only'].includes(arg))) throw new Error('Only --plan or --links-only supported; scope is the whole working tree versus HEAD');
const tracked = split(git('ls-files', '-z'));
const extra = split(git('ls-files', '--others', '--exclude-standard', '-z'));
const changed = [...new Set([...split(git('diff', '--name-only', '--no-renames', '-z', 'HEAD')), ...extra])];
const changes = changed.map(file => ({ file, deleted: !fs.existsSync(file), delta: extra.includes(file) ? fs.readFileSync(file, 'utf8') : git('diff', '--no-ext-diff', '--unified=0', 'HEAD', '--', file).split('\n').filter(line => /^[+-](?![+-])/.test(line)).join('\n') }));
const consumers = tracked.filter(file => /\.(?:m?js|json|ya?ml)$/.test(file) && fs.existsSync(file)).map(file => fs.readFileSync(file, 'utf8')).join('\n');
const plan = chooseChecks(changes, consumers);
console.log(JSON.stringify({ ...plan, files: changed.length }));
if (args.includes('--plan')) process.exit(0);
function run(command, argv) {
  const result = spawnSync(command, argv, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run('git', ['diff', '--check', 'HEAD']);
const currentSet = new Set([...tracked, ...extra].filter(file => fs.existsSync(file)));
const after = new Map([...currentSet].filter(file => /\.md$/i.test(file)).map(file => [file, fs.readFileSync(file, 'utf8')]));
const issues = linkIssues(after, file => currentSet.has(file) || (fs.existsSync(file) && fs.statSync(file).isFile()));
console.log(`Markdown coverage: ${after.size} files; link/anchor issues ${issues.size}`);
if (issues.size) { console.error([...issues].join('\n')); process.exit(1); }
if (args.includes('--links-only') || plan.mode === 'none') process.exit(0);
// npm_execpath avoids shell quoting and Windows npm.cmd execution differences.
if (!process.env.npm_execpath) throw new Error('Run through npm run check:changed');
run(process.execPath, [process.env.npm_execpath, 'run', plan.mode === 'full' ? 'check:all' : 'check:docs']);
