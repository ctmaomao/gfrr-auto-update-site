import fs from 'node:fs';

const renderPath = 'scripts/modules/renderMacroOverview.js';
const render = fs.readFileSync(renderPath, 'utf8');

const requiredMarkers = [
  'function observationReaction(',
  'function mainRiskBand(',
  'function scoreRiskBand(',
  'function setObservationReaction(',
  'function reactionText(',
  'function signalFromEquityChange(',
  'function signalFromGoldPrice(',
  'function signalFromFreightRegime(',
  'function signalFromChinaProperty(',
  "'c1-freight-status'",
  "setObservationReaction('c2-gold-status', 'c2-gold-badge'",
  "'c2-gold-aux'",
  "setObservationReaction('c2-cuau-status'",
  'setObservationReaction(`${prefix}-status`, `${prefix}-badge`, radarData, signal)',
  "renderCfetsRmbLeaf('c2-cfets', radarData.macroDrivers?.cfetsRmb, radarData)",
  "renderCfetsRmbLeaf('c6-cfets', radarData.macroDrivers?.cfetsRmb, radarData)",
  "'c5-v2x-status'",
  "'c6-china-10y-status'",
  "'c6-china-infl-status'",
  "'c6-china-pmi-status'",
  "'c6-tsf-status'",
  "'c6-mlf-status'",
  "'c6-omo-status'",
  "'c6-house-status'",
  'signalFromEquityChange(changePct)',
  "key: 'systemic_top', label: '系统性顶部', tone: 'red'",
  "key: 'high_risk', label: '高风险预警', tone: 'orange'",
  "key: 'moderate_watch', label: '中度警戒', tone: 'yellow'",
  "key: 'watch', label: '观察期', tone: 'green'",
  "label: '印证', phrase: `印证${band.label}`",
  "label: '背离', phrase: `背离${band.label}`"
];

const forbiddenMarkers = [
  "setBadge('c2-gold-badge', 'neutral'",
  "setToneClass('c2-gold-status', 'status-bar', 'neutral'",
  "setBadge('c1-freight-badge', 'neutral'",
  "setBadge('c2-cuau-badge', 'neutral'",
  "setBadge('c5-v2x-badge', 'neutral'",
  "setBadge('c6-china-10y-badge', 'neutral'",
  "setBadge('c6-china-infl-badge', 'neutral'",
  "setBadge('c6-china-pmi-badge', 'neutral'",
  "setBadge('c6-tsf-badge', 'neutral'",
  "setBadge('c6-mlf-badge', 'neutral'",
  "setBadge('c6-omo-badge', 'neutral'",
  "setBadge('c6-house-badge', 'neutral'"
];

const missing = requiredMarkers.filter((marker) => !render.includes(marker));
const forbidden = forbiddenMarkers.filter((marker) => render.includes(marker));

if (missing.length || forbidden.length) {
  if (missing.length) {
    console.error('Observation reaction layer missing markers:');
    for (const marker of missing) console.error(`- ${marker}`);
  }
  if (forbidden.length) {
    console.error('Observation reaction layer still has direct neutral OBS badge paths:');
    for (const marker of forbidden) console.error(`- ${marker}`);
  }
  process.exit(1);
}

const {
  __testObservationReaction,
  __testSignalFromGoldPrice
} = await import('./modules/renderMacroOverview.js?check=observation-reaction-layer');

const cases = [
  {
    name: '观察期 + benign = 绿色印证',
    radarData: { score: 20 },
    signal: 'benign',
    expected: { tone: 'green', label: '印证', phrase: '印证观察期' }
  },
  {
    name: '中度警戒 + stress = 黄色印证',
    radarData: { score: 30 },
    signal: 'stress',
    expected: { tone: 'yellow', label: '印证', phrase: '印证中度警戒' }
  },
  {
    name: '高风险预警 + stress = 橙色印证',
    radarData: { score: 44 },
    signal: 'stress',
    expected: { tone: 'orange', label: '印证', phrase: '印证高风险预警' }
  },
  {
    name: '系统性顶部 + stress = 红色印证',
    radarData: { score: 62 },
    signal: 'stress',
    expected: { tone: 'red', label: '印证', phrase: '印证系统性顶部' }
  },
  {
    name: '世界秩序升档 + stress = 橙色印证',
    radarData: { score: 24 },
    worldOrderStressData: { score: 66 },
    signal: 'stress',
    expected: { tone: 'orange', label: '印证', phrase: '印证高风险预警' }
  },
  {
    name: '高风险预警 + benign = 绿色背离',
    radarData: { score: 44 },
    signal: 'benign',
    expected: { tone: 'green', label: '背离', phrase: '背离高风险预警' }
  },
  {
    name: '观察期 + stress = 黄色背离',
    radarData: { score: 20 },
    signal: 'stress',
    expected: { tone: 'yellow', label: '背离', phrase: '背离观察期' }
  },
  {
    name: 'neutral = 背景',
    radarData: { score: 44 },
    signal: 'neutral',
    expected: { tone: 'neutral', label: '背景', phrase: '背景观察' }
  },
  {
    name: 'unavailable = 数据不足',
    radarData: { score: 44 },
    signal: 'unavailable',
    expected: { tone: 'pending', label: '数据不足', phrase: '主判断关系待确认' }
  }
];

const failures = cases
  .map((testCase) => {
    const actual = __testObservationReaction(testCase.radarData, testCase.signal, testCase.worldOrderStressData);
    const mismatches = Object.entries(testCase.expected)
      .filter(([key, value]) => actual?.[key] !== value)
      .map(([key, value]) => `${key}: expected ${value}, got ${actual?.[key]}`);
    return mismatches.length ? `${testCase.name}: ${mismatches.join('; ')}` : null;
  })
  .filter(Boolean);

if (failures.length) {
  console.error('Observation reaction layer behavior mismatch:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const goldSignalCases = [
  { name: 'Gold missing = unavailable', value: null, expected: 'unavailable' },
  { name: 'Gold below high threshold = neutral', value: 1800, expected: 'neutral' },
  { name: 'Gold high threshold = stress', value: 2400, expected: 'stress' },
  { name: 'Gold elevated = stress', value: 4270.1, expected: 'stress' }
];

const goldSignalFailures = goldSignalCases
  .map((testCase) => {
    const actual = __testSignalFromGoldPrice(testCase.value);
    return actual === testCase.expected ? null : `${testCase.name}: expected ${testCase.expected}, got ${actual}`;
  })
  .filter(Boolean);

const goldReaction = __testObservationReaction({ score: 44 }, __testSignalFromGoldPrice(4270.1));
if (goldReaction?.tone !== 'orange' || goldReaction?.label !== '印证' || goldReaction?.phrase !== '印证高风险预警') {
  goldSignalFailures.push(
    `Gold high reaction: expected orange/印证/印证高风险预警, got ${goldReaction?.tone}/${goldReaction?.label}/${goldReaction?.phrase}`,
  );
}

if (goldSignalFailures.length) {
  console.error('Gold observation reaction behavior mismatch:');
  for (const failure of goldSignalFailures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Observation reaction layer: PASS (${cases.length} relation cases, ${goldSignalCases.length + 1} gold cases)`);
