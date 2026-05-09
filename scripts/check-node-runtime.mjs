import fs from 'node:fs';

const failures = [];
const workflowDir = '.github/workflows';

function fail(message) {
  failures.push(message);
  console.error(`Node runtime baseline check failed: ${message}`);
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
    if (match[0] !== 'actions/checkout@v6') {
      fail(`${file} uses ${match[0]}; expected actions/checkout@v6`);
    }
  }

  for (const match of text.matchAll(/actions\/setup-node@[^\s'"]+/gu)) {
    if (match[0] !== 'actions/setup-node@v6') {
      fail(`${file} uses ${match[0]}; expected actions/setup-node@v6`);
    }
    const stepBlock = getStepBlock(text, match.index);
    if (!/node-version:\s*['"]?24['"]?/u.test(stepBlock)) {
      fail(`${file} setup-node step must set node-version: 24`);
    }
  }

  for (const match of text.matchAll(/actions\/upload-artifact@[^\s'"]+/gu)) {
    if (match[0] !== 'actions/upload-artifact@v7') {
      fail(`${file} uses ${match[0]}; expected actions/upload-artifact@v7`);
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

if (failures.length > 0) {
  process.exit(1);
}

console.log('Node runtime baseline check passed');
