import fs from 'node:fs';

const RENDER_PATH = 'scripts/modules/renderMacroOverview.js';
const STYLES_PATH = 'assets/styles.css';
const PROTECTED_PATHS = [
  'data/market-pricing-history.json',
  'data/market-pricing-metrics.json',
  'data/radar-data.json',
  'data/world-order-stress.json',
];

const before = new Map(PROTECTED_PATHS.map((filePath) => [filePath, fs.readFileSync(filePath)]));
const renderSource = fs.readFileSync(RENDER_PATH, 'utf8');
const styles = fs.readFileSync(STYLES_PATH, 'utf8');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) return '';
  let depth = 0;
  let seenBody = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
      seenBody = true;
    } else if (char === '}') {
      depth -= 1;
      if (seenBody && depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

const appendixSource = extractFunction(renderSource, 'appendCrossValidationEducationAppendix');
const crossRenderSource = renderSource.slice(
  Math.max(0, renderSource.indexOf("appendSection(container, '风险交叉验证'") - 400),
  renderSource.indexOf("const keyChangesRoot = $('wow-key-changes-root');"),
);

assert(appendixSource, `${RENDER_PATH} must define appendCrossValidationEducationAppendix`);
assert(appendixSource.includes('📖 信号一致性如何解读'), 'appendix summary label must be present');
assert(crossRenderSource.includes('appendCrossValidationEducationAppendix(cross)'), 'cross-validation renderer must append the education appendix');

for (const heading of ['一致性分数', '信号同向的金融常识', '矛盾信号的金融常识', '数据缺口的影响', '边界声明']) {
  assert(appendixSource.includes(heading), `appendix missing heading: ${heading}`);
}

assert(countMatches(appendixSource, /本说明不针对当前数据。/gu) >= 4, 'appendix must include four current-data boundary reminders');
assert(appendixSource.includes('本网站从设计上就是"证据展示工具"，不是"投资判断工具"。'), 'appendix must include final evidence-tool boundary phrase');
assert(appendixSource.includes('证据展示工具'), 'appendix must include evidence-display tool wording');

for (const forbidden of ['建议', '应该买入', '应该卖出', '看涨', '看跌', '买入', '卖出']) {
  assert(!appendixSource.includes(forbidden), `appendix must not add investment-advice wording: ${forbidden}`);
}

assert(styles.includes('.editorial-cross-validation-education'), `${STYLES_PATH} must style the appendix details element`);
assert(styles.includes('.editorial-cross-validation-education-section'), `${STYLES_PATH} must style appendix sections`);
assert(!styles.includes('@font-face'), `${STYLES_PATH} must not add font-face rules`);
assert(!styles.includes('url(' + ['h', 'ttps://'].join('')), `${STYLES_PATH} must not add external font URLs`);

const networkNeedles = [
  ['fetch', '('].join(''),
  ['h', 'ttp'].join(''),
  ['process', 'env'].join('.'),
];
for (const needle of networkNeedles) {
  assert(!appendixSource.includes(needle), `appendix renderer must not contain ${needle}`);
}

for (const [filePath, original] of before.entries()) {
  const after = fs.readFileSync(filePath);
  assert(Buffer.compare(original, after) === 0, `${filePath} must remain byte-identical during appendix check`);
}

if (errors.length) {
  console.error('Cross-validation education appendix: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Cross-validation education appendix: PASS');
