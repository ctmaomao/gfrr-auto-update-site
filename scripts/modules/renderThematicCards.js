import { classifyByThreshold, normalizeStatus, statusLabel } from './displayStatusThresholds.js?v=28.0M-94';
import { classifyZScoreBucket } from './buildCrossValidationMatrix.js?v=28.0M-94';

const DASH = '—';

const Z_SCORE_BUCKET_LABELS = Object.freeze({
  'extreme-hot': '极度过热',
  hot: '显著偏热',
  neutral: '中性区间',
  cold: '显著偏冷',
  'extreme-cold': '极度偏冷'
});

const THEME_SHELLS = Object.freeze([
  {
    id: 'cat-inflation-energy',
    title: '通胀与能源',
    kicker: 'INFLATION & ENERGY',
    counts: '5 张 · 2 红 · 1 黄 · 2 P1',
    note: '能源链与通胀指标。本类卡片源自 brentPricingLayer / macroDrivers.consumer.ismManufacturingPmi。CPI / WTI 为 P1 占位,M-95 起接入。',
    intro: '能源是当前主线的第一环。Brent 主值与公开代理价格的距离反映现货溢价压力;crack spread 是能源向下游柴油 / 汽油传导的中间证据;ISM PMI 看美国制造业能否消化能源成本。CPI / WTI 后续接入。'
  },
  {
    id: 'cat-global-liquidity',
    title: '全球流动性',
    kicker: 'GLOBAL LIQUIDITY',
    counts: '7 张 · 3 黄 · 2 绿 · 2 P1',
    note: '美元 / 黄金 / 利率曲线 / Fed 流动性 / Fed 政策路径。本类卡片源自 __effectiveDisplayInputs 与 macroDrivers.{fedLiquidity, policyExpectations, curve}。',
    intro: '全球流动性来自四条管线:美元 / 黄金 / 利率 / 美联储资产负债表。任意管线收紧都会向风险资产传导。当前美联储流动性三层(水位 / 回购 / 隔夜)均无 2019-09 形态信号。'
  },
  {
    id: 'cat-credit-corporate',
    title: '信用与企业债',
    kicker: 'CREDIT & CORPORATE',
    counts: '5 张 · 1 红 · 3 绿 · 1 黄',
    note: '高收益与投资级利差、NFCI、私募信贷公开代理、商业地产风险。源自 __effectiveDisplayInputs 与 macroDrivers.{credit, privateCreditProxy, commercialRealEstate}。',
    intro: '信用层回答的不是"压力高不高",而是"压力有没有从价格变成融资约束"。HY OAS 与 IG OAS 是企业借钱难易的市场定价;NFCI 综合 100+ 跨市场信号;私募代理用上市 BDC ETF 篮子近似公开市场看不见的私募信贷;CRE 看商业地产融资压力。'
  },
  {
    id: 'cat-us-economy',
    title: '美国经济温度',
    kicker: 'US ECONOMIC TEMPERATURE',
    counts: '2 聚合 · 2 绿',
    note: '就业 + 消费两条管线 + 四象限判读。源自 macroDrivers.{employment, consumerRetail, consumer}。',
    intro: '四象限 · 就业 × 消费:就业供给端 + 消费需求端,只有同向才是真趋势。当前位 = 就业偏强 / 消费偏弱 → 实际工资被通胀压制。'
  },
  {
    id: 'cat-world-economy',
    title: '世界经济',
    kicker: 'WORLD ECONOMY',
    counts: '1 暂代 · 4 P1',
    note: 'P1 占位区。本类 M-94 阶段除 World Order overlay 暂代外无字段。STOXX/Nikkei/DAX/V2X 等 M-95 起接入。',
    intro: 'M-94 阶段世界经济维度仅有 overlay 可填。后续 milestone 接入欧 / 日 / 德 / 欧 VIX 后退场。'
  },
  {
    id: 'cat-china-macro',
    title: '中国宏观',
    kicker: 'CHINA MACRO · NEW CATEGORY',
    counts: '7 P1 占位 · 后续 milestone 填充',
    note: '类别整体 P1 占位。M-95/M-96 起接入公开数据(Yahoo 股指 + TE 公开 PMI/CPI/10Y + Stooq CFETS)。央行 SLO/MLF/OMO 原始 tape、社融组件分项、70 城房价原始不可达。',
    intro: '类别整体 P1 占位。M-94 阶段无任何数据接入。M-95/M-96 起接入公开数据,央行 SLO/MLF/OMO 原始 tape、社融组件分项、70 城房价原始数据均不可达。'
  },
  {
    id: 'cat-market-sentiment',
    title: '市场情绪',
    kicker: 'MARKET SENTIMENT',
    counts: '3 张 · 1 绿 · 2 黄',
    note: 'VIX / SPX / NDX 60w z-score(广度参照)。市场温度主卡(QQQ z-score)已在上方 #homepage-market-temperature 完整展示,此处不重复。',
    intro: '注:Market Temperature 主卡(QQQ z-score)已在上方 #homepage-market-temperature 完整展示。此处放 VIX / SPX / NDX 60w z-score(广度参照),不与上方重复。'
  },
  {
    id: 'cat-geopolitics',
    title: '地缘与世界秩序',
    kicker: 'GEOPOLITICS & WORLD ORDER',
    counts: '4 张 · 2 红 · 1 黄 · 1 OVERLAY',
    note: '底层地缘评分 + World Order overlay + 经济武器化 + 军备冲突。源自 modules.geopolitical 与 worldOrderStress.dimensions。',
    intro: '底层地缘评分(进 scoring)+ World Order overlay(regime overlay 不进 scoring)+ 经济武器化 + 军备冲突。'
  }
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = finite(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return DASH;
}

function statusFromText(value, fallback = 'pending') {
  const text = String(value || '').toLowerCase();
  if (!text) return fallback;
  if (text.includes('紧') || text.includes('告急') || text.includes('鹰') || text.includes('走弱') || text.includes('压力')) return 'yellow';
  if (text.includes('宽松') || text.includes('平稳') || text.includes('稳定') || text.includes('正常') || text.includes('改善')) return 'green';
  return normalizeStatus(text) === 'pending' ? fallback : normalizeStatus(text);
}

function formatNumber(value, digits = 2) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatThousands(value) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `${formatNumber(numeric / 1000, 0)}k`;
}

function formatMillions(value) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `${formatNumber(numeric / 1000000, 2)}M`;
}

function formatSignedNumber(value, digits = 2) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `${numeric > 0 ? '+' : ''}${formatNumber(numeric, digits)}`;
}

function formatMoney(value, digits = 2) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `$${formatNumber(numeric, digits)}`;
}

function formatPercentFromRatio(value, digits = 1) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `${formatSignedNumber(numeric * 100, digits)}%`;
}

function formatPercentValue(value, digits = 1) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `${formatSignedNumber(numeric, digits)}%`;
}

function formatRate(value, digits = 2) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `${formatNumber(numeric, digits)}%`;
}

function formatBpFromRateDiff(value, digits = 0) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `${formatSignedNumber(numeric * 100, digits)}bp`;
}

function formatUsdFromMillions(value) {
  const numeric = finite(value);
  if (numeric === null) return DASH;
  return `$${formatNumber(numeric / 1000000, 2)}T`;
}

function getDisplayInputs(data) {
  if (isPlainObject(data?.__effectiveDisplayInputs)) return data.__effectiveDisplayInputs;
  if (isPlainObject(data?.displayInputsBaseline)) return data.displayInputsBaseline;
  return {};
}

function getWorldOrderStress(data) {
  if (isPlainObject(data?.worldOrderStress)) return data.worldOrderStress;
  const runtimeWorldOrder = isPlainObject(globalThis.window)
    ? globalThis.window.__GFRR_WORLD_ORDER_STRESS__
    : null;
  return isPlainObject(runtimeWorldOrder) ? runtimeWorldOrder : {};
}

function row(key, value) {
  return { key, value };
}

function renderAggRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return `
        <div class="agg-rows">
          ${rows.map((item) => `<div><span class="k">${escapeHtml(item.key)}</span> · <span class="v">${escapeHtml(item.value)}</span></div>`).join('')}
        </div>`;
}

function renderMeta(items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return '';
  return `<div class="meta mini-delta">${values.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`;
}

function renderCard(config) {
  const tone = normalizeStatus(config.status || (config.pending ? 'pending' : 'green'));
  const classes = `indicator-card${config.pending ? ' pending' : ''}`;
  const badge = firstText(config.badge, statusLabel(tone));
  const unit = config.unit ? `<span class="unit">${escapeHtml(config.unit)}</span>` : '';
  const corner = config.corner
    ? `<span class="corner ${escapeHtml(config.cornerClass || '')}">${escapeHtml(config.corner)}</span>`
    : '';
  const aux = config.aux ? `<div class="aux mini-delta">${escapeHtml(config.aux)}</div>` : '';
  const note = config.note ? `<p class="note">${escapeHtml(config.note)}</p>` : '';

  return `
      <article class="${classes}" data-card-id="${escapeHtml(config.id)}" data-status="${escapeHtml(tone)}">
        ${corner}
        <div class="status-bar ${escapeHtml(tone)}"></div>
        <div class="head split-head">
          <div>
            <div class="name-en mini-delta">${escapeHtml(config.nameEn)}</div>
            <div class="name-zh">${escapeHtml(config.nameZh)}</div>
          </div>
          <span class="badge ${escapeHtml(tone)}">${escapeHtml(badge)}</span>
        </div>
        <div class="number metric-value">${escapeHtml(config.number)}${unit}</div>
        ${aux}
        ${renderAggRows(config.rows)}
        ${note}
        ${renderMeta(config.meta)}
      </article>`;
}

function renderTheme(theme, cards) {
  return `
    <section class="reader-cat-block" id="${escapeHtml(theme.id)}">
      <header class="reader-cat-header">
        <h3>${escapeHtml(theme.title)}</h3>
        <span class="en mini-delta">${escapeHtml(theme.kicker)}</span>
        <span class="counts mini-delta">${escapeHtml(theme.counts)}</span>
        <p class="note">${escapeHtml(theme.note)}</p>
      </header>
      <p class="cat-intro">${escapeHtml(theme.intro)}</p>
      ${cards.map(renderCard).join('')}
    </section>`;
}

function pendingCard(id, nameEn, nameZh, note, meta, corner = 'P1') {
  return {
    id,
    nameEn,
    nameZh,
    status: 'pending',
    badge: `${corner} 待接入`,
    corner,
    cornerClass: corner.toLowerCase(),
    number: DASH,
    pending: true,
    note,
    meta
  };
}

function buildInflationEnergyCards(context) {
  const brentLayer = isPlainObject(context.data?.brentPricingLayer) ? context.data.brentPricingLayer : {};
  const consumer = isPlainObject(context.macroDrivers.consumer) ? context.macroDrivers.consumer : {};
  const brentValue = firstFinite(context.inputs.brent, brentLayer.selectedBrent?.value);
  const crackSpread = finite(brentLayer.crackSpread);
  const ismPmi = finite(consumer.ismManufacturingPmi);
  const brentStatus = classifyByThreshold(brentValue, 'brent');
  const crackStatus = classifyByThreshold(crackSpread, 'crackSpread');
  const ismStatus = classifyByThreshold(ismPmi, 'ismManufacturingPmi');

  return [
    {
      id: 'c1-brent',
      nameEn: 'Brent',
      nameZh: '布伦特原油',
      status: brentStatus,
      number: formatNumber(brentValue, 2),
      unit: 'USD/bbl',
      aux: `主值 ${firstText(brentLayer.selectedBrent?.source, 'selectedBrent')} · status: ${firstText(brentLayer.mode, brentLayer.selectedBrent?.status)}`,
      rows: [
        row('公开现货代理 EIA', formatMoney(brentLayer.eiaBrentSpotProxy?.price, 2)),
        row('期货 front Yahoo', formatMoney(brentLayer.futuresPriceCurve?.frontPrice, 2)),
        row('期货 ICE', formatMoney(brentLayer.iceFuturesPriceCurve?.frontPrice, 2)),
        row('spotMinusFutures', formatSignedNumber(brentLayer.proxySpread?.spotMinusFutures, 2)),
        row('maxProxyDivergencePct', `${formatNumber(brentLayer.proxySpread?.maxProxyDivergencePct, 1)}%`)
      ],
      note: '三层证据链(主值 / 现货代理 / 期货代理)显示价差压力,能源主线传导正在被实际定价压实。',
      meta: ['阈值 >100 红 / >80 黄', 'brentPricingLayer selectedBrent + public proxy fields']
    },
    {
      id: 'c1-crack-spread',
      nameEn: 'Crack spread',
      nameZh: '炼油利润压力',
      status: crackStatus,
      number: formatNumber(crackSpread, 2),
      unit: 'USD/bbl',
      aux: `ULSD × 42 - Brent · crackSpread4wChange ${formatSignedNumber(brentLayer.crackSpread4wChange, 2)}`,
      note: `炼油利润扩张说明能源向汽油 / 柴油传导。Brent → CPI 的中间证据。regime: ${firstText(brentLayer.crackSpreadRegime)}。`,
      meta: ['阈值 >40 红 / >25 黄', 'brentPricingLayer.{crackSpread, crackSpread4wChange, crackSpreadRegime}']
    },
    {
      id: 'c1-ism-pmi',
      nameEn: 'ISM PMI',
      nameZh: '美国制造业景气',
      status: ismStatus,
      number: formatNumber(ismPmi, 1),
      aux: `3 月动量 ${formatSignedNumber(consumer.ismManufacturingPmi3mChange, 1)} · regime: ${firstText(consumer.ismPmiRegime)}`,
      note: '制造业读数用于观察经济活动能否吸收能源成本;低于扩张线时,通胀压力更容易挤压真实需求。',
      meta: ['阈值 <45 红 / <50 黄', 'macroDrivers.consumer.{ismManufacturingPmi, ismManufacturingPmi3mChange, ismPmiRegime}']
    },
    pendingCard('c1-us-cpi', 'US CPI', '美国通胀直接证据', 'M-95 后接入。FRED CPIAUCSL + CPILFESL。', ['next: P1', 'FRED CPI series']),
    pendingCard('c1-wti', 'WTI', '美国油价基准', '配 Brent 看美欧能源分化。', ['next: P1', 'FRED DCOILWTICO'])
  ];
}

function buildGlobalLiquidityCards(context) {
  const curve = isPlainObject(context.macroDrivers.curve) ? context.macroDrivers.curve : {};
  const fedLiquidity = isPlainObject(context.macroDrivers.fedLiquidity) ? context.macroDrivers.fedLiquidity : {};
  const policy = isPlainObject(context.macroDrivers.policyExpectations) ? context.macroDrivers.policyExpectations : {};
  const dxy = finite(context.inputs.dxy);
  const gold = finite(context.inputs.gold);
  const us10y = finite(context.inputs.us10y);
  const futureMinusTargetMid = finite(policy.futureMinusTargetMid);
  const futureMinusTargetBp = futureMinusTargetMid === null ? null : futureMinusTargetMid * 100;

  return [
    {
      id: 'c2-dxy',
      nameEn: 'DXY',
      nameZh: '广义美元指数',
      status: classifyByThreshold(dxy, 'dxy'),
      number: formatNumber(dxy, 2),
      aux: '12 周高位标识为 P2 待接入',
      note: '强美元说明全球融资环境收紧,但需要与信用和波动率一起确认,不能单独写成危机。',
      meta: ['阈值 >115 红 / >105 黄', '__effectiveDisplayInputs.dxy · 12w high P2']
    },
    {
      id: 'c2-gold',
      nameEn: 'Gold',
      nameZh: '黄金',
      status: 'yellow',
      number: formatNumber(gold, 2),
      unit: 'USD/oz',
      aux: '趋势驱动 · 避险与通胀对冲共存',
      note: '黄金与美元同强时,通常说明安全资产需求与金融条件收紧同时存在。',
      meta: ['趋势驱动', '__effectiveDisplayInputs.gold']
    },
    {
      id: 'c2-us10y-curve',
      nameEn: 'US 10Y + 2s10s',
      nameZh: '美元利率曲线',
      status: classifyByThreshold(us10y, 'us10y'),
      number: formatNumber(us10y, 2),
      unit: '%',
      aux: `10Y · 2s10s spread ${formatSignedNumber(curve.t10y2y, 2)}% · regime: ${firstText(curve.regime)}`,
      rows: [
        row('t10y2y', `${formatSignedNumber(curve.t10y2y, 2)}%`),
        row('t10y2yWeekChange', formatBpFromRateDiff(curve.t10y2yWeekChange)),
        row('regime', firstText(curve.regime)),
        row('steepeningAlert', firstText(curve.steepeningAlert))
      ],
      note: '长端利率和曲线形态一起看,用于判断美元融资压力是否正在向实体期限结构传导。',
      meta: ['10Y >5% 红 / >4.25% 黄', '__effectiveDisplayInputs.us10y + macroDrivers.curve.*']
    },
    {
      id: 'c2-usd-liquidity',
      nameEn: 'USD Liquidity Agg',
      nameZh: '美元流动性聚合',
      status: statusFromText(fedLiquidity.regime, 'green'),
      number: formatUsdFromMillions(fedLiquidity.reserveBalances),
      aux: `银行准备金 reserveBalances · pressure ${formatNumber(fedLiquidity.pressure, 0)}`,
      rows: [
        row('水位 WALCL', `${formatUsdFromMillions(fedLiquidity.walcl)} · 4w ${formatPercentValue(fedLiquidity.walcl4wChange, 2)}`),
        row('准备金 reserveBalances', `${formatUsdFromMillions(fedLiquidity.reserveBalances)} · 4w ${formatPercentValue(fedLiquidity.reserveBalances4wChange, 2)}`),
        row('ON RRP', `$${formatNumber(fedLiquidity.onRrp, 2)}B · WoW ${formatPercentValue(fedLiquidity.onRrpWeekChange, 1)}`),
        row('隔夜 SOFR / EFFR', `${formatRate(fedLiquidity.sofr, 2)} / ${formatRate(fedLiquidity.effectiveFedFundsRate, 2)}`),
        row('回购 BGCR / TGCR', `${formatRate(fedLiquidity.bgcr, 2)} / ${formatRate(fedLiquidity.tgcr, 2)}`),
        row('repoSpreadRegime', firstText(fedLiquidity.repoSpreadRegime))
      ],
      note: '三层递进结构(水位 / 回购 / 隔夜)用于识别 2019-09 式回购压力;当前作为展示层证据,不改评分。',
      meta: ['display-only 派生', 'macroDrivers.fedLiquidity 11 字段 + liquidityIndex']
    },
    {
      id: 'c2-fed-path',
      nameEn: 'Fed Path Agg',
      nameZh: 'Fed 政策路径分歧',
      status: classifyByThreshold(futureMinusTargetBp, 'fedPathSpreadBp'),
      number: formatBpFromRateDiff(futureMinusTargetMid),
      aux: `market vs targetMid · policy tone ${firstText(policy.minutesPolicyTone, policy.policyTone)}`,
      rows: [
        row('targetMid / EFFR', `${formatRate(policy.targetMid, 3)} / ${formatRate(policy.effectiveFedFundsRate, 2)}`),
        row('fedFundsFutureFront', `${formatNumber(policy.fedFundsFutureFrontPrice, 3)} → ${formatRate(policy.fedFundsFutureImpliedRate, 3)}`),
        row('ZQ futures curve', `front ${formatRate(policy.fedFundsFuturesCurve?.frontImpliedRate, 3)}`),
        row('SR3 futures curve', `front ${formatRate(policy.sofrFuturesCurve?.frontImpliedRate, 3)}`),
        row('OIS forward 12M', formatRate(policy.oisForwardCurve?.oneYearRate ?? policy.oisForwardRate, 2)),
        row('SEP dot mid', formatRate(policy.dotPlotMedianNextYear ?? policy.dotPlotMedianCurrentYear, 2)),
        row('statement / minutes tone', `${firstText(policy.policyTone)} / ${firstText(policy.minutesPolicyTone)}`)
      ],
      note: '市场隐含路径与 Fed 目标区间的分歧是政策预期压力,只做阅读提示,不进入执行或仓位建议。',
      meta: ['|分歧| >50bp 红 / >25bp 黄', 'macroDrivers.policyExpectations 9 字段']
    },
    pendingCard('c2-cu-au', 'Cu / Au', '铜金比', '铜代表实体经济,黄金代表金融避险。比值升=经济强 / 降=金融避险。', ['next: P1', 'Yahoo HG=F / GC=F']),
    pendingCard('c2-cfets-rmb', 'CFETS RMB', '人民币篮子指数', '人民币对一篮子货币强弱,反映中国央行汇率意图。', ['next: P1', 'Stooq / TE 公开 HTML'])
  ];
}

function buildCreditCorporateCards(context) {
  const credit = isPlainObject(context.macroDrivers.credit) ? context.macroDrivers.credit : {};
  const privateCredit = isPlainObject(context.macroDrivers.privateCreditProxy) ? context.macroDrivers.privateCreditProxy : {};
  const cre = isPlainObject(context.macroDrivers.commercialRealEstate) ? context.macroDrivers.commercialRealEstate : {};
  const hyOas = firstFinite(context.inputs.hyOas, credit.hyOas);
  const igOas = finite(credit.igOas);
  const nfci = finite(credit.nfci);
  const creDelinquency = finite(cre.creDelinquencyRate);

  return [
    {
      id: 'c3-hy-oas',
      nameEn: 'HY OAS',
      nameZh: '高收益债利差',
      status: classifyByThreshold(hyOas, 'hyOas'),
      number: formatNumber(hyOas, 2),
      unit: '%',
      aux: 'WoW 变化等待 history 接入',
      note: '企业信用风险仍在可控区间;需要与 VIX、IG OAS 和 NFCI 一起确认融资压力。',
      meta: ['阈值 >5% 红 / >3.5% 黄', '__effectiveDisplayInputs.hyOas']
    },
    {
      id: 'c3-ig-oas',
      nameEn: 'IG OAS',
      nameZh: '投资级利差',
      status: classifyByThreshold(igOas, 'igOas'),
      number: formatNumber(igOas, 2),
      unit: '%',
      aux: `igOas1dChange ${formatSignedNumber(credit.igOas1dChange, 2)}bp · igHyRatio ${formatNumber(credit.igHyRatio, 2)}`,
      note: '投资级融资环境越平稳,越说明当前压力尚未扩散到优质企业债。',
      meta: ['阈值 >1.5% 红 / >1% 黄', 'macroDrivers.credit.{igOas, igOas1dChange, igHyRatio}']
    },
    {
      id: 'c3-nfci',
      nameEn: 'NFCI',
      nameZh: '芝加哥联储 FCI',
      status: classifyByThreshold(nfci, 'nfci'),
      number: formatSignedNumber(nfci, 3),
      aux: `nfci4wChange ${formatSignedNumber(credit.nfci4wChange, 3)} · regime: ${firstText(credit.nfciRegime)}`,
      note: 'NFCI 方向反转:正值=收紧。它汇总信用、流动性和杠杆信号,是信用价格以外的压力证据。',
      meta: ['阈值 >0.5 红 / >0 黄', 'macroDrivers.credit.{nfci, nfci4wChange, nfciRegime}']
    },
    {
      id: 'c3-private-credit-proxy',
      nameEn: 'Private Credit Proxy',
      nameZh: '私募信贷公开代理',
      status: statusFromText(privateCredit.privateCreditProxyRegime, 'yellow'),
      number: formatMoney(privateCredit.intervalFundNavPrice, 2),
      aux: `CCLFX intervalFundNav · 4w ${formatPercentFromRatio(privateCredit.intervalFundNav4wChange, 1)}`,
      rows: [
        row('BIZD ETF', `${formatMoney(privateCredit.bdcEtfPrice, 2)} · 4w ${formatPercentFromRatio(privateCredit.bdcEtf4wChange, 1)}`),
        row('PBDC ETF', `${formatMoney(privateCredit.pbdcEtfPrice, 2)} · 4w ${formatPercentFromRatio(privateCredit.pbdcEtf4wChange, 1)}`),
        row('SRLN ETF', `${formatMoney(privateCredit.seniorLoanEtfPrice, 2)} · 4w ${formatPercentFromRatio(privateCredit.seniorLoanEtf4wChange, 1)}`),
        row('privateCreditProxyRegime', firstText(privateCredit.privateCreditProxyRegime))
      ],
      note: '公开代理覆盖,不是 private marks。当前先做 8 字段直显;M-96+ 接 6-proxy z-score 后再升级。',
      meta: ['display-only · 不进 scoring', 'macroDrivers.privateCreditProxy 8 字段']
    },
    {
      id: 'c3-commercial-re',
      nameEn: 'Commercial RE',
      nameZh: '商业地产风险',
      status: classifyByThreshold(creDelinquency, 'creDelinquencyRate'),
      number: formatNumber(creDelinquency, 2),
      unit: '%',
      aux: `creDelinquencyRate · QoQ ${formatSignedNumber(cre.creDelinquencyRateQoQChange, 2)}pp · ${firstText(cre.creStressRegime)}`,
      rows: [
        row('违约率', `${formatRate(cre.creDelinquencyRate, 2)} · QoQ ${formatSignedNumber(cre.creDelinquencyRateQoQChange, 2)}pp`),
        row('核销率', `${formatRate(cre.creChargeOffRate, 2)} · QoQ ${formatSignedNumber(cre.creChargeOffRateQoQChange, 2)}pp`),
        row('SLOOS 非农非住宅', formatSignedNumber(cre.sloosCreNonfarmNonresidentialTightening, 1)),
        row('SLOOS 建筑', formatSignedNumber(cre.sloosCreConstructionTightening, 1)),
        row('SLOOS 多家庭', formatSignedNumber(cre.sloosCreMultifamilyTightening, 1)),
        row('sloosCreTighteningMax', formatSignedNumber(cre.sloosCreTighteningMax, 1))
      ],
      note: 'CRE 风险用银行账面压力(违约 / 核销 / SLOOS 紧缩)与公开市场代理一起看,不假装有私有贷款 tape。',
      meta: ['违约率 >1.5% 红', 'macroDrivers.commercialRealEstate 8 字段']
    }
  ];
}

function renderSegment(segment) {
  if (!isPlainObject(segment)) return DASH;
  return `${firstText(segment.labelZh, segment.key)} ${formatPercentFromRatio(segment.yoy, 1)}`;
}

function buildUsEconomyCards(context) {
  const employment = isPlainObject(context.macroDrivers.employment) ? context.macroDrivers.employment : {};
  const consumerRetail = isPlainObject(context.macroDrivers.consumerRetail) ? context.macroDrivers.consumerRetail : {};
  const consumer = isPlainObject(context.macroDrivers.consumer) ? context.macroDrivers.consumer : {};
  const claims = finite(employment.initialClaims);
  const cartsRealYoYPct = finite(consumerRetail.cartsRealYoY) === null
    ? null
    : consumerRetail.cartsRealYoY * 100;

  return [
    {
      id: 'c4-employment-agg',
      nameEn: 'Employment Agg',
      nameZh: '就业温度聚合',
      status: classifyByThreshold(claims, 'initialClaims'),
      number: formatThousands(claims),
      aux: `initialClaims · 4w average ${formatThousands(employment.initialClaims4wAverage)} · 4w ${formatThousands(employment.initialClaims4wChange)}`,
      rows: [
        row('initialClaims / 4w', `${formatThousands(employment.initialClaims)} / ${formatThousands(employment.initialClaims4wAverage)} · ${formatThousands(employment.initialClaims4wChange)}`),
        row('continuingClaims / 4w', `${formatMillions(employment.continuingClaims)} / ${formatMillions(employment.continuingClaims4wAverage)}`),
        row('JOLTS openings', `${formatMillions(employment.joltsOpenings)} · YoY ${formatPercentFromRatio(employment.joltsOpeningsYoY, 1)}`),
        row('U-6 失业率', `${formatRate(employment.u6Rate, 1)} · 3m ${formatSignedNumber(employment.u6Rate3mChange, 1)}pp`),
        row('AHE YoY', `${formatPercentFromRatio(employment.averageHourlyEarningsYoY, 1)} · AHE ${formatMoney(employment.averageHourlyEarnings, 2)}`),
        row('industry diffusion', `${formatNumber(employment.industryPayrollDiffusionPct, 1)}% · ${formatNumber(employment.industryPayrollPositiveCount, 0)}/${formatNumber(employment.industryPayrollSeriesCount, 0)} 行业扩张`),
        row('diffusion regime', firstText(employment.industryDiffusionRegime))
      ],
      note: '从最快的首次申领到最慢的工资和行业扩散一起读,可区分劳动力市场仍强与边际降温。',
      meta: ['initialClaims >280k 红 / >240k 黄', 'macroDrivers.employment 11 字段']
    },
    {
      id: 'c4-consumer-agg',
      nameEn: 'Consumer Agg',
      nameZh: '消费温度聚合',
      status: classifyByThreshold(cartsRealYoYPct, 'cartsRealYoY'),
      number: formatPercentFromRatio(consumerRetail.cartsRealYoY, 1),
      unit: 'YoY',
      aux: `CARTS real · retailRegime: ${firstText(consumerRetail.retailRegime)}`,
      rows: [
        row('CARTS nominal', `${formatNumber(consumerRetail.cartsNominal, 2)} · 4w ${formatNumber(consumerRetail.cartsNominal4wAverage, 2)} · YoY ${formatPercentFromRatio(consumerRetail.cartsNominalYoY, 1)}`),
        row('CARTS real', `${formatNumber(consumerRetail.cartsReal, 2)} · 4w ${formatNumber(consumerRetail.cartsReal4wAverage, 2)} · YoY ${formatPercentFromRatio(consumerRetail.cartsRealYoY, 1)}`),
        row('segment diffusion', `${formatNumber(consumerRetail.segmentDiffusionPct, 1)}% · ${formatNumber(consumerRetail.segmentPositiveCount, 0)}/${formatNumber(consumerRetail.segmentSeriesCount, 0)} 品类正增长`),
        row('strongest segment', renderSegment(consumerRetail.strongestSegment)),
        row('weakest segment', renderSegment(consumerRetail.weakestSegment)),
        row('UMich Sentiment', `${formatNumber(consumer.umichSentiment, 1)} · 3m ${formatSignedNumber(consumer.threeMonthChange, 1)}`),
        row('BoA ex-gas / Redbook', `${formatPercentFromRatio(consumerRetail.bofaCardSpendingExGasYoY, 1)} / ${formatPercentFromRatio(consumerRetail.redbookRetailSalesYoY, 1)}`)
      ],
      note: '名义零售、真实零售、品类扩散和第三方公开摘要合读,避免把单一消费序列误读成完整需求图景。',
      meta: ['cartsReal YoY <0 红 / <1 黄', 'macroDrivers.consumerRetail + macroDrivers.consumer 15 字段']
    }
  ];
}

function buildWorldEconomyCards(context) {
  const worldOrder = context.worldOrderStress;
  const score = finite(worldOrder.score);
  const overlayState = normalizeStatus(worldOrder.state || 'orange');

  return [
    {
      id: 'c5-world-order-placeholder',
      nameEn: 'Placeholder',
      nameZh: '本类暂用 World Order overlay',
      status: overlayState === 'pending' ? classifyByThreshold(score, 'worldOrderScore') : overlayState,
      badge: 'OVERLAY',
      corner: '暂代',
      cornerClass: 'overlay',
      number: formatNumber(score, 0),
      aux: `state: ${firstText(worldOrder.state)} · labelZh: ${firstText(worldOrder.labelZh)}`,
      note: 'M-94 阶段世界经济维度仅有 overlay 可填。M-95 接入欧 / 日 / 德 / 欧 VIX 后退场。',
      meta: ['暂时复用', 'worldOrderStress.{score, state, labelZh}']
    },
    pendingCard('c5-stoxx-50', 'STOXX 50', '欧元区大盘', '欧股 vs 美股相对强弱反映全球资金分配。', ['next: P1', 'Yahoo ^STOXX50E']),
    pendingCard('c5-nikkei-225', 'Nikkei 225', '日经 225', '日股是日元 carry 与全球流动性的重要观察点。', ['next: P1', 'Yahoo ^N225']),
    pendingCard('c5-dax', 'DAX', '德国 DAX', '德股代表欧洲制造业核心。', ['next: P1', 'Yahoo ^GDAXI']),
    pendingCard('c5-v2x', 'V2X', '欧元区波动率', '欧 VIX vs 美 VIX 反映地区性恐慌差异。', ['next: P1', 'Yahoo ^V2TX'])
  ];
}

function buildChinaMacroCards() {
  return [
    pendingCard('c6-sse-composite', 'SSE Composite', '上证综指', 'A 股大盘风险情绪基准。', ['next: P1', 'Yahoo 000001.SS']),
    pendingCard('c6-hang-seng', 'Hang Seng', '恒生指数', '中国资本市场对外开放窗口。', ['next: P1', 'Yahoo ^HSI']),
    pendingCard('c6-csi-300', 'CSI 300', '沪深 300', 'A 股蓝筹组合。', ['next: P1', 'Yahoo 000300.SS']),
    pendingCard('c6-china-pmi', 'China PMI', '中国制造业 PMI', '中国经济活动温度。月频。', ['next: P2', 'TE 公开 HTML']),
    pendingCard('c6-china-cpi-ppi', 'China CPI / PPI', '中国通胀', '中国通缩 / 通胀压力 vs 美国分化。', ['next: P2', 'TE + FRED mirror']),
    pendingCard('c6-china-10y', 'China 10Y', '中国 10 年国债', '中国长端利率反映增长预期 vs 美国利差。', ['next: P2', 'TE 公开 HTML']),
    pendingCard('c6-cfets-rmb', 'CFETS RMB', '人民币篮子指数', '(同时在全球流动性类) 汇率政策意图。', ['next: P2', 'Stooq / TE'])
  ];
}

function latestAssetMetric(metricsData, assetKey) {
  const records = Array.isArray(metricsData?.assets?.[assetKey]?.records)
    ? metricsData.assets[assetKey].records.filter((record) => isPlainObject(record))
    : [];
  return records[records.length - 1] || null;
}

function statusFromZBucket(bucket) {
  if (bucket === 'extreme-hot' || bucket === 'hot') return 'yellow';
  if (bucket === 'extreme-cold' || bucket === 'cold') return 'yellow';
  return 'green';
}

function buildMarketSentimentCards(context) {
  const vix = firstFinite(context.inputs.vix, context.data?.values?.vix);
  const spx = firstFinite(context.inputs.spx, context.data?.values?.spx);
  const ndxLatest = latestAssetMetric(context.marketPricingMetricsData, 'ndx');
  const qqqLatest = latestAssetMetric(context.marketPricingMetricsData, 'qqq');
  const ndxZ = finite(ndxLatest?.zScore);
  const qqqZ = finite(qqqLatest?.zScore);
  const bucket = classifyZScoreBucket(ndxZ);
  const bucketLabel = Z_SCORE_BUCKET_LABELS[bucket] || Z_SCORE_BUCKET_LABELS.neutral;
  const qqqText = qqqZ === null ? 'QQQ 同步数据待刷新' : `QQQ ${formatSignedNumber(qqqZ, 2)}σ`;

  return [
    {
      id: 'c7-vix',
      nameEn: 'VIX',
      nameZh: 'S&P 隐含波动率',
      status: classifyByThreshold(vix, 'vix'),
      number: formatNumber(vix, 2),
      aux: '12 周低位参照',
      note: '波动率没有同步扩张,是当前形势不能写成全面危机的关键反证。',
      meta: ['阈值 >30 红 / >20 黄', '__effectiveDisplayInputs.vix']
    },
    {
      id: 'c7-spx',
      nameEn: 'SPX',
      nameZh: '标普 500',
      status: 'yellow',
      badge: 'MIXED',
      number: formatNumber(spx, 0),
      aux: '52 周高位参照 · P2 待接入',
      note: '风险资产仍强,结构压力尚未完全进入价格。',
      meta: ['距高 -15%+ 红', '__effectiveDisplayInputs.spx · 52w high P2']
    },
    {
      id: 'c7-ndx-zscore',
      nameEn: 'NDX 60w z-score',
      nameZh: '纳斯达克 100 温度对照',
      status: statusFromZBucket(bucket),
      badge: `${formatSignedNumber(ndxZ, 2)}σ`,
      number: formatSignedNumber(ndxZ, 2),
      unit: 'σ',
      aux: `NDX vs 60 周均值 · ${bucketLabel}`,
      note: `NDX 60 周 z-score ${formatSignedNumber(ndxZ, 2)}σ,与 ${qqqText} 同步观察,确认美国成长股板块是否同步过热。本数据为统计描述,不构成投资建议。`,
      meta: ['display-only · 不进 scoring', 'data/market-pricing-metrics.json.assets.ndx.records[]']
    }
  ];
}

function buildGeopoliticsCards(context) {
  const modules = isPlainObject(context.data?.modules) ? context.data.modules : {};
  const moduleTrends = isPlainObject(context.data?.moduleTrends) ? context.data.moduleTrends : {};
  const worldOrder = context.worldOrderStress;
  const dimensions = isPlainObject(worldOrder.dimensions) ? worldOrder.dimensions : {};
  const economicWeaponization = isPlainObject(dimensions.economicWeaponization) ? dimensions.economicWeaponization : {};
  const peaceDividendRetreat = isPlainObject(dimensions.peaceDividendRetreat) ? dimensions.peaceDividendRetreat : {};
  const geopoliticalScore = finite(modules.geopolitical);
  const worldOrderScore = finite(worldOrder.score);
  const worldOrderStatus = normalizeStatus(worldOrder.state || 'orange');

  return [
    {
      id: 'c8-geopolitical-module',
      nameEn: 'Geopolitical Module',
      nameZh: '底层地缘风险评分',
      status: classifyByThreshold(geopoliticalScore, 'geopoliticalScore'),
      number: formatNumber(geopoliticalScore, 0),
      aux: `6 底层模块之一 · moduleTrends ${formatSignedNumber(moduleTrends.geopolitical, 0)}`,
      note: `底层地缘评分 ${formatNumber(geopoliticalScore, 0)},直接进入主评分链。和 World Order overlay 不是同一回事。`,
      meta: ['阈值 >70 红 / >55 黄', 'data.modules.geopolitical (扁平) + data.moduleTrends.geopolitical']
    },
    {
      id: 'c8-world-order-overlay',
      nameEn: 'World Order Overlay',
      nameZh: '结构性世界秩序压力',
      status: worldOrderStatus === 'pending' ? classifyByThreshold(worldOrderScore, 'worldOrderScore') : worldOrderStatus,
      badge: 'OVERLAY',
      corner: 'OVERLAY',
      cornerClass: 'overlay',
      number: formatNumber(worldOrderScore, 0),
      aux: `state: ${firstText(worldOrder.state)} · labelZh: ${firstText(worldOrder.labelZh)}`,
      note: 'regime overlay,不进 scoring。提供阅读强度修正。',
      meta: ['不进主评分', 'worldOrderStress.{score, state, labelZh}']
    },
    {
      id: 'c8-economic-weaponization',
      nameEn: 'Economic Weaponization',
      nameZh: '经济武器化',
      status: classifyByThreshold(economicWeaponization.score, 'dimensionScore'),
      number: formatNumber(economicWeaponization.score, 0),
      aux: `${firstText(economicWeaponization.labelZh)} · trend: ${firstText(economicWeaponization.trend)}`,
      note: `制裁与经济武器化处于高压力区间。trend: ${firstText(economicWeaponization.trend)}。`,
      meta: ['OFAC + GDELT', 'worldOrderStress.dimensions.economicWeaponization.{score, labelZh, trend}']
    },
    {
      id: 'c8-arms-conflict',
      nameEn: 'Arms & Conflict',
      nameZh: '军备与冲突',
      status: classifyByThreshold(peaceDividendRetreat.score, 'dimensionScore'),
      corner: 'MANUAL · ANNUAL',
      cornerClass: 'manual',
      number: formatNumber(peaceDividendRetreat.score, 0),
      aux: `${firstText(peaceDividendRetreat.labelZh)} · trend: ${firstText(peaceDividendRetreat.trend)}`,
      note: '手动 + 年度数据。不当成实时高频信号读。',
      meta: ['ACLED weekly + SIPRI annual', 'worldOrderStress.dimensions.peaceDividendRetreat.{score, labelZh, trend}']
    }
  ];
}

function buildThemeCards(context) {
  return [
    buildInflationEnergyCards(context),
    buildGlobalLiquidityCards(context),
    buildCreditCorporateCards(context),
    buildUsEconomyCards(context),
    buildWorldEconomyCards(context),
    buildChinaMacroCards(),
    buildMarketSentimentCards(context),
    buildGeopoliticsCards(context)
  ];
}

export function renderThematicCards(data, root, marketPricingMetricsData = null) {
  if (!root) return;

  const macroDrivers = isPlainObject(data?.macroDrivers) ? data.macroDrivers : {};
  const context = {
    data: isPlainObject(data) ? data : {},
    inputs: getDisplayInputs(data),
    macroDrivers,
    marketPricingMetricsData: isPlainObject(marketPricingMetricsData) ? marketPricingMetricsData : {},
    worldOrderStress: getWorldOrderStress(data)
  };

  const cardsByTheme = buildThemeCards(context);
  root.innerHTML = THEME_SHELLS
    .map((theme, index) => renderTheme(theme, cardsByTheme[index] || []))
    .join('');
}

export const __thematicCardsTestHooks = Object.freeze({
  THEME_SHELLS,
  buildThemeCards
});
