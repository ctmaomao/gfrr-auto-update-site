// Manual lint pilot. Deliberately not wired into `check:all` or any workflow: this is a
// read-only reporting entry point for local development use.
//
// The three runtime environments are declared separately, and their file scopes are
// mutually exclusive. That separation is the point: a single merged globals set would
// make `no-undef` unable to tell a genuine undefined reference from a browser identifier
// used in a Node script, which is exactly the blind spot this pilot exists to cover.
//
// Note on flat-config semantics: when several config objects match the same file, their
// `languageOptions.globals` are *merged*, not replaced. Writing a later browser block over
// a `scripts/**` Node block would therefore not remove the Node globals - it would add
// browser ones on top and defeat the separation. The Node scope below consequently
// excludes the browser paths explicitly rather than relying on precedence.
import globals from 'globals';

// Correctness only. No formatting or stylistic rule is enabled, and `--fix` is never used:
// this repository carries checker assertions and documentation line references that a
// formatter or autofix would invalidate.
const correctnessRules = {
  'no-undef': 'error',
  'no-unused-vars': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-else-if': 'error',
  'no-duplicate-case': 'error',
  'no-self-assign': 'error',
  'no-constant-condition': ['error', { checkLoops: 'allExceptWhileTrue' }],
};

const sourceFiles = ['**/*.js', '**/*.mjs'];

export default [
  {
    name: 'gfrr/node',
    files: sourceFiles,
    // Browser and Worker paths are excluded here so this block stays disjoint from the two
    // below. `scripts/**` would otherwise include scripts/app.js and scripts/modules/**.
    ignores: [
      'scripts/app.js',
      'scripts/modules/**',
      'workers/**',
      // Build output and local scratch trees are not source: they are produced by the
      // pipeline or by manual runs, and linting them would report other people's code.
      '_site/**',
      'manual-artifacts/**',
      'node_modules/**',
      'test-results/**',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: correctnessRules,
  },
  {
    name: 'gfrr/browser',
    files: ['scripts/app.js', 'scripts/modules/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: correctnessRules,
  },
  {
    name: 'gfrr/worker',
    files: ['workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // `globals.worker` covers what this Worker actually uses (fetch, Request, Response,
      // Headers, URL, setTimeout, clearTimeout, console, AbortController - verified 9/9).
      // Runtime-only identifiers are NOT added by hand: `env` and `scheduled` are function
      // parameters in this source, and `ExecutionContext` is a type name, not a value the
      // runtime injects. Whitelisting any of them would hide a genuine undefined reference.
      globals: { ...globals.worker },
    },
    rules: correctnessRules,
  },
];
