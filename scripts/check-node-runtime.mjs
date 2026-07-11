import fs from 'node:fs';

const failures = [];
const warnings = [];
const workflowDir = '.github/workflows';

function fail(message) {
  failures.push(message);
  console.error(`Node runtime baseline check failed: ${message}`);
}

function warn(message) {
  warnings.push(message);
}

// M-NODE-1: merged from former check:workflows-node24-only — every actions/*
// reference is validated against this Node 24 expected-version map.
const expectedNode24Actions = new Map([
  ['actions/checkout', 'df4cb1c069e1874edd31b4311f1884172cec0e10'],
  ['actions/setup-node', '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e'],
  ['actions/upload-artifact', '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'],
  ['actions/github-script', 'ed597411d8f924073f98dfc5c65a23a2325f34cd'],
  ['actions/upload-pages-artifact', 'fc324d3547104276b827a68afc52ff2a11cc49c9'],
  ['actions/deploy-pages', 'cd2ce8fcbc39b97be8ca5fce6e763baed58fa128'],
]);

function actionStatus(actionRef) {
  const match = actionRef.match(/^(actions\/[^@]+)@([^@\s#]+)/u);
  if (!match) return 'non-actions or pinned external action';
  const [, actionName, version] = match;
  const expected = expectedNode24Actions.get(actionName);
  if (!expected) return 'review unknown';
  return version === expected ? 'already Node 24' : `expected ${expected}`;
}

function readFile(file) {
  if (!fs.existsSync(file)) {
    fail(`${file} is missing`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function checkVersionFile(file) {
  const text = readFile(file).trim();
  if (text !== '24') fail(`${file} must equal 24`);
}

function hasNode24Env(text) {
  return /^env:\s*\r?\n(?:[ \t]+[^\r\n]*\r?\n)*[ \t]+FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true\s*$/mu.test(text);
}

function getStepBlock(text, index) {
  const rest = text.slice(index);
  const nextStep = rest.slice(1).search(/\n\s+-\s+name:/u);
  return nextStep === -1 ? rest : rest.slice(0, nextStep + 1);
}

function checkWorkflow(file) {
  const text = readFile(file);
  if (!text) return;

  const forbiddenPatterns = [
    [/node-version:\s*['"]?20(?:\.x)?['"]?/u, 'must not use node-version 20'],
    [/node20/u, 'must not use node20'],
    [/Node(?:\.js)? 20/u, 'must not mention Node 20 setup'],
    [/ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/u, 'must not use ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION'],
    [/FORCE_JAVASCRIPT_ACTIONS_TO_NODE20/u, 'must not use FORCE_JAVASCRIPT_ACTIONS_TO_NODE20'],
    [/actions\/checkout@v4/u, 'must not use actions/checkout@v4'],
    [/actions\/checkout@v5/u, 'must not use actions/checkout@v5'],
    [/actions\/setup-node@v4/u, 'must not use actions/setup-node@v4'],
    [/actions\/setup-node@v5/u, 'must not use actions/setup-node@v5'],
    [/actions\/upload-artifact@v4/u, 'must not use actions/upload-artifact@v4'],
    [/actions\/download-artifact@v4/u, 'must not use actions/download-artifact@v4'],
  ];

  for (const [pattern, message] of forbiddenPatterns) {
    if (pattern.test(text)) fail(`${file} ${message}`);
  }

  if (!hasNode24Env(text)) {
    fail(`${file} must set top-level FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`);
  }

  for (const match of text.matchAll(/actions\/checkout@[^\s'"]+/gu)) {
    if (match[0] !== 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10') {
      fail(`${file} uses ${match[0]}; expected actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10`);
    }
  }

  for (const match of text.matchAll(/actions\/setup-node@[^\s'"]+/gu)) {
    if (match[0] !== 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e') {
      fail(`${file} uses ${match[0]}; expected actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`);
    }
    const stepBlock = getStepBlock(text, match.index);
    if (!/node-version:\s*['"]?24['"]?/u.test(stepBlock)) {
      fail(`${file} setup-node step must set node-version: 24`);
    }
  }

  for (const match of text.matchAll(/actions\/upload-artifact@[^\s'"]+/gu)) {
    if (match[0] !== 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a') {
      fail(`${file} uses ${match[0]}; expected actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`);
    }
  }

  // M-NODE-1: validate every actions/* reference against the expected-version map
  // (adds github-script@v8 / upload-pages-artifact@v5 / deploy-pages@v5 enforcement
  // and warns on unknown actions/* runtimes). Merged from check:workflows-node24-only.
  for (const match of text.matchAll(/uses:\s*([^\s#]+)/gu)) {
    const actionRef = match[1].replace(/['"]/gu, '');
    const status = actionStatus(actionRef);
    if (status.startsWith('expected ')) {
      fail(`${file} uses ${actionRef}; ${status}`);
    } else if (status === 'review unknown') {
      warn(`${file} uses ${actionRef}; verify the action runtime before relying on Node 24`);
    }
  }
}

const packageJson = JSON.parse(readFile('package.json'));
const engine = packageJson.engines?.node;
if (engine !== '>=24 <25' && engine !== '24.x') {
  fail('package.json engines.node must be >=24 <25 or 24.x');
}

if (fs.existsSync('package-lock.json')) {
  const packageLock = JSON.parse(readFile('package-lock.json'));
  const lockEngine = packageLock.packages?.['']?.engines?.node;
  if (lockEngine !== engine) {
    fail('package-lock.json root engines.node must match package.json engines.node');
  }
}

checkVersionFile('.nvmrc');
checkVersionFile('.node-version');

if (!fs.existsSync(workflowDir)) {
  fail(`${workflowDir} is missing`);
} else {
  for (const file of fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/u.test(name))) {
    checkWorkflow(`${workflowDir}/${file}`);
  }
}

if (warnings.length > 0) {
  console.warn('Node runtime baseline check warnings:');
  for (const message of warnings) console.warn(`  - ${message}`);
}

if (failures.length > 0) {
  process.exit(1);
}

console.log('Node runtime baseline check passed');
