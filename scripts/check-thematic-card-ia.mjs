import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const design = fs.readFileSync('DESIGN.md', 'utf8');

const expectedTitles = [
  '通胀与能源',
  '全球流动性',
  '信用与企业债',
  '美国经济温度',
  '市场情绪',
  '地缘与世界秩序',
  '世界经济',
  '中国宏观'
];

const expectedCardCount = 51;
const sectionStart = html.indexOf('<section class="editorial-section" id="macro-thematic-cards"');
const sectionEnd = html.indexOf('<section class="editorial-section" id="global-risk-heatmap"', sectionStart);

function fail(message, details = []) {
  console.error(`Thematic card IA contract FAIL: ${message}`);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}

if (sectionStart < 0) {
  fail('missing #macro-thematic-cards section');
}

if (sectionEnd < 0) {
  fail('missing #global-risk-heatmap section after #macro-thematic-cards');
}

const thematicSection = html.slice(sectionStart, sectionEnd);
const blockCount = (thematicSection.match(/class="reader-cat-block"/g) || []).length;
const titles = [...thematicSection.matchAll(/<div class="reader-cat-header"><h3>([^<]+)<\/h3>/g)].map(
  (match) => match[1],
);
const cardCount = (thematicSection.match(/<article class="indicator-card/g) || []).length;

if (blockCount !== expectedTitles.length) {
  fail(`expected ${expectedTitles.length} reader category blocks, got ${blockCount}`);
}

if (titles.length !== expectedTitles.length || titles.some((title, index) => title !== expectedTitles[index])) {
  fail('reader category visual order drifted', [
    `expected: ${expectedTitles.join(' / ')}`,
    `actual:   ${titles.join(' / ')}`
  ]);
}

if (cardCount !== expectedCardCount) {
  fail(`expected ${expectedCardCount} thematic indicator cards, got ${cardCount}`);
}

const requiredDesignMarkers = [
  'C1-C8 主题卡阵,51 张 indicator-card；C5/C6 观察层视觉置底',
  '视觉标题顺序为 C1 通胀与能源 / C2 全球流动性 / C3 信用与企业债 / C4 美国经济温度 / C7 市场情绪 / C8 地缘与世界秩序 / C5 世界经济 / C6 中国宏观',
  'C5 世界经济与 C6 中国宏观保留历史编号、DOM id prefix 与 renderer 绑定,但视觉上必须置于 C7/C8 之后,作为区域 / 外部扩散观察层收尾',
  '总计 51 个 `article.indicator-card`'
];
const missingDesignMarkers = requiredDesignMarkers.filter((marker) => !design.includes(marker));

if (missingDesignMarkers.length) {
  fail('DESIGN.md does not encode the current thematic IA contract', missingDesignMarkers);
}

console.log(
  `Thematic card IA contract: PASS (${blockCount} blocks, ${cardCount} cards, order ${titles.join(' / ')})`,
);
