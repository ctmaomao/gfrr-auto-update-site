import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeAgeMinutes, classifyFreshnessLevel, canUseRealtimePayloadValues } from './modules/freshness.js';
import { formatOnRrpYiUsd } from './modules/format.js';
import { ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS } from './external-ai/production-contract.mjs';
import {
  MODULE_LABELS_CN,
  buildDailyBrief,
  buildUnavailableDailyBrief,
} from './daily/daily-brief.mjs';
import { buildDivergenceLayer } from './daily/divergence-layer.mjs';
import { isUsableFreightCache, parseStockqFreight } from './daily/stockq-freight.mjs';
import { parseBofaCheckpointMetrics, selectLatestBofaCheckpointUrl } from './daily/bofa-checkpoint.mjs';
import { parseMlfOperation, isFreshMlfDates, findMlfCandidate } from './daily/china-mlf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === __filename;
const rulesPath = path.join(root, 'config', 'rules.json');
const RULES = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const R = RULES;
const mainScoreSourcePolicyPath = path.join(root, 'config', 'main-score-source-policy.json');
const MAIN_SCORE_SOURCE_POLICY = JSON.parse(fs.readFileSync(mainScoreSourcePolicyPath, 'utf8'));
const dataDir = path.join(root, 'data');
const dataPath = path.join(dataDir, 'radar-data.json');
const histPath = path.join(dataDir, 'radar-history.json');
const histFullPath = path.join(dataDir, 'radar-history-full.json');
const worldOrderPath = path.join(dataDir, 'world-order-stress.json');
const rtPath = path.join(root, 'realtime', 'market.json');

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const clampRange = (n, min, max) => Math.max(min, Math.min(max, n));
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const isoNow = new Date().toISOString();

function normalizeIsoOrNull(value) {
  if (typeof value !== 'string') return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const SOURCE_MODE_CN = {
  'live': '实时',
  'live-with-fallback': '实时带回退',
  'cache-only': '缓存模式',
  'mock': '模拟'
};

const FRED_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_API_KEY = (process.env.FRED_API_KEY || '').trim();
const EIA_API_KEY = (process.env.EIA_API_KEY || '').trim();
const WIND_API_KEY = (process.env.WIND_API_KEY || '').trim();
const RELEASE_VERSION = 'v28.0.10';
const DATA_CONTRACT_VERSION = 'v27.0';
const TRANSPORT_SHOCK_SCORING_IMPACT_CONTRACT_VERSION = 'transport-shock-scoring-impact-v1';
const TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT = 3;
const TRANSPORT_SHOCK_RUNTIME_SCORING_STALE_AFTER_DAYS = 7;
const EXTERNAL_AI_SCAFFOLD_CONTRACT_VERSION = 'v28.0K-3A';
const EXTERNAL_AI_SCAFFOLD_MODE = 'external_ai_disabled_scaffold';
const EXTERNAL_AI_SCAFFOLD_LAYERS_AVAILABLE = [
  'dailyBrief',
  'divergenceLayer',
  'brentPricingLayer',
  'macroDrivers.consumer',
  'aiInterpretationLayer',
  'decisionModel'
];
const MAIN_SCORE_WIND_FALLBACK_ENV = 'GFRR_MAIN_SCORE_WIND_FALLBACK';
const MAIN_SCORE_WIND_FALLBACK_ENABLED = process.env[MAIN_SCORE_WIND_FALLBACK_ENV] === '1';
const MAIN_SCORE_WIND_TIMEOUT_MS = Number(process.env.GFRR_MAIN_SCORE_WIND_TIMEOUT_MS) > 0
  ? Number(process.env.GFRR_MAIN_SCORE_WIND_TIMEOUT_MS)
  : 12000;
const MACRO_FETCH_TIMEOUT_MS = 10000;
const MACRO_FETCH_RETRIES = 2;
const MACRO_FETCH_RETRY_DELAY_MS = 800;
const MACRO_USER_AGENT = `gfrr-${RELEASE_VERSION}-macro/1.0`;
const ISM_PMI_LANDING_URL = 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/';
const ISM_PMI_USER_AGENT = 'GFRRBot/1.0';
const ISM_PMI_FETCH_TIMEOUT_MS = 8000;
const ISM_PMI_RETRY_DELAY_MS = 1000;
const ISM_REPORT_PATH_PATTERN = /href=["'](?<href>\/supply-management-news-and-reports\/reports\/ism-pmi-reports\/pmi\/(?<month>january|february|march|april|may|june|july|august|september|october|november|december)\/)["']/giu;
const NY_FED_SECURED_RATES_LATEST_URL = 'https://markets.newyorkfed.org/api/rates/secured/all/latest.json';
const NY_FED_SECURED_RATES_TIMEOUT_MS = 8000;
const NY_FED_SECURED_RATES_SOURCE = 'NYFED:secured-rates-latest';
const FED_CALENDAR_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const FED_BASE_URL = 'https://www.federalreserve.gov';
const FED_FETCH_TIMEOUT_MS = 10000;
const ICE_BRENT_FUTURES_DATA_URL = 'https://www.ice.com/products/219/Brent-Crude-Futures/data?marketId=6018430';
const ICE_BRENT_CONTRACT_DATA_API_URL = 'https://www.ice.com/marketdata/api/productguide/charting/contract-data?productId=254&hubId=403';
const ICE_BRENT_FETCH_TIMEOUT_MS = 10000;
const EIA_BRENT_SPOT_HTML_URL = 'https://www.eia.gov/dnav/pet/hist/rbrted.htm';
const EIA_BRENT_SPOT_SOURCE = 'EIA:RBRTE';
const EIA_BRENT_SPOT_FETCH_TIMEOUT_MS = 10000;
const BOFA_CONSUMER_CHECKPOINT_URL = 'https://institute.bankofamerica.com/consumer-checkpoint.html';
const BOFA_CONSUMER_CHECKPOINT_BASE_URL = 'https://institute.bankofamerica.com';
const BOFA_CONSUMER_FETCH_TIMEOUT_MS = 10000;
const REDBOOK_INDEX_URL = 'https://tradingeconomics.com/united-states/redbook-index';
const REDBOOK_FETCH_TIMEOUT_MS = 10000;
const CHECKMYSWAP_USD_OIS_CURVE_URL = 'https://www.checkmyswap.com/api/curves/USD';
const CHECKMYSWAP_RATES_URL = 'https://www.checkmyswap.com/rates';
const CHECKMYSWAP_FETCH_TIMEOUT_MS = 10000;
const ICE_CDX_INDEX_SETTLEMENT_URL = 'https://www.ice.com/api/cds-settlement-prices/icc-indexes';
const ICE_CDX_INDEX_SETTLEMENT_PAGE_URL = 'https://www.ice.com/cds-settlement-prices/icc/index-instruments';
const ICE_CDX_FETCH_TIMEOUT_MS = 10000;
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_FETCH_TIMEOUT_MS = 9000;
const WORLD_ECONOMY_SOURCE = 'Yahoo:^STOXX50E; Yahoo:^N225; Yahoo:^GDAXI; Yahoo:^FTSE; Yahoo:^FCHI; Yahoo:^STOXX; Yahoo:^KS11; Yahoo:^AXJO; Yahoo:^STI; Yahoo:^TWII; Yahoo:^NSEI; Yahoo:^BVSP';
const WORLD_ECONOMY_CHANGE_WINDOW = '5d';
const WORLD_ECONOMY_DISPLAY_NOTE =
  '世界经济维度 display-only 公开指数代理;不进 scoring/decision/execution/position。';
const WORLD_ECONOMY_INDEXES = [
  { key: 'stoxx50', symbol: '^STOXX50E', labelZh: '欧元区大盘', min: 1000, max: 20000 },
  { key: 'nikkei225', symbol: '^N225', labelZh: '日经 225', min: 10000, max: 100000 },
  { key: 'dax', symbol: '^GDAXI', labelZh: '德国 DAX', min: 5000, max: 60000 },
  { key: 'ftse100', symbol: '^FTSE', labelZh: '英国富时 100', min: 4000, max: 20000 },
  { key: 'cac40', symbol: '^FCHI', labelZh: '法国 CAC 40', min: 3000, max: 16000 },
  { key: 'stoxx600', symbol: '^STOXX', labelZh: '泛欧 STOXX 600', min: 250, max: 1500 },
  { key: 'kospi', symbol: '^KS11', labelZh: '韩国 KOSPI', min: 2000, max: 20000 },
  { key: 'asx200', symbol: '^AXJO', labelZh: '澳洲 ASX 200', min: 4000, max: 20000 },
  { key: 'sti', symbol: '^STI', labelZh: '新加坡 STI', min: 2000, max: 10000 },
  { key: 'taiex', symbol: '^TWII', labelZh: '台湾加权 TAIEX', min: 10000, max: 80000 },
  { key: 'nifty50', symbol: '^NSEI', labelZh: '印度 Nifty 50', min: 10000, max: 50000 },
  { key: 'bovespa', symbol: '^BVSP', labelZh: '巴西 Bovespa', min: 50000, max: 300000 }
];
const EURO_VOLATILITY_SOURCE = 'DeutscheBoerse:quote_box:V2TX; STOXX(fallback)';
const EURO_VOLATILITY_PRIMARY_SOURCE = 'DeutscheBoerse:quote_box:V2TX';
const EURO_VOLATILITY_FALLBACK_SOURCE = 'STOXX:index-page:V2TX';
const EURO_VOLATILITY_QUOTE_URL = 'https://api.boerse-frankfurt.de/v1/data/quote_box/single?isin=DE000A0C3QF1&mic=XFRA';
const EURO_VOLATILITY_STOXX_URL = 'https://stoxx.com/index/V2TX/';
const EURO_VOLATILITY_FETCH_TIMEOUT_MS = 10000;
const EURO_VOLATILITY_FRESH_DAYS = 5;
const EURO_VOLATILITY_MIN = 5;
const EURO_VOLATILITY_MAX = 100;
const EURO_VOLATILITY_DISPLAY_NOTE =
  'VSTOXX 欧版 VIX 来自 Deutsche Börse quote_box 主源 / STOXX 官页 fallback;display-only,不进 scoring/decision/execution/position。';
const CHINA_EQUITY_SOURCE = 'Yahoo:000001.SS; Yahoo:^HSI; Yahoo:000300.SS';
const CHINA_EQUITY_CHANGE_WINDOW = '5d';
const CHINA_EQUITY_DISPLAY_NOTE =
  '中国股指 display-only 公开指数代理;不进 scoring/decision/execution/position。';
const CHINA_EQUITY_INDEXES = [
  { key: 'sseComposite', symbol: '000001.SS', labelZh: '上证综指', min: 1000, max: 8000 },
  { key: 'hangSeng', symbol: '^HSI', labelZh: '恒生指数', min: 8000, max: 50000 },
  { key: 'csi300', symbol: '000300.SS', labelZh: '沪深 300', min: 1000, max: 9000 }
];
const INFLATION_ENERGY_SOURCE = 'FRED:CPIAUCSL; FRED:CPILFESL; FRED:DCOILWTICO; Yahoo:CL=F';
const INFLATION_CPI_SOURCE = 'FRED:CPIAUCSL; FRED:CPILFESL';
const INFLATION_WTI_SOURCE = 'FRED:DCOILWTICO';
const INFLATION_WTI_MARKET_PROXY_SOURCE = 'Yahoo:CL=F';
const INFLATION_ENERGY_DISPLAY_NOTE =
  '通胀与能源 display-only 公开数据代理;WTI spot 为 FRED 官方滞后锚,WTI market proxy 为 Yahoo CL=F 快速市场代理;tone 仅展示,不进 scoring/decision/execution/position。';
const CPI_DAYS_BACK = 450;
const CPI_YOY_GAP_DAYS = 45;
const CPI_MOM_GAP_DAYS = 20;
const WTI_DAYS_BACK = 30;
const WTI_CHANGE_WINDOW = '5d';
const WTI_CHANGE_GAP_DAYS = 7;
const WTI_MARKET_PROXY_SYMBOL = 'CL=F';
const WTI_MARKET_PROXY_RANGE = '5d';
const WTI_MARKET_PROXY_INTERVAL = '1d';
const WTI_MARKET_PROXY_MIN = 10;
const WTI_MARKET_PROXY_MAX = 250;
const INFLATION_ENERGY_STATUS_RANK = { live: 0, fallback: 1, missing: 2 };
const GOLD_API_PRICE_BASE = 'https://api.gold-api.com/price';
const COPPER_GOLD_SOURCE = 'gold-api:HG; gold-api:XAU';
// gold-api's real-time endpoint returns spot price only (no change field), so
// ratioChangePct is derived day-over-day from the previous Daily run's stored
// leg price — hence the window is "1d" (vs previous daily run), not 5d intraday.
const COPPER_GOLD_CHANGE_WINDOW = '1d';
// Range used only when a leg falls back to the Yahoo chart (different provider,
// keeps both legs covered if gold-api is down); just enough to land a recent
// close — the Yahoo-fallback changePct is dropped to avoid mixing windows.
const COPPER_GOLD_YAHOO_FALLBACK_RANGE = '5d';
const COPPER_GOLD_DISPLAY_NOTE =
  '铜金比 display-only 公开现货价(gold-api 主 / Yahoo 期货备);regime 观察,不进 scoring/decision/execution/position。';
const COPPER_GOLD_STATUS_RANK = { live: 0, fallback: 1, missing: 2 };
const COPPER_GOLD_LEGS = [
  { key: 'copper', symbol: 'HG', yahooSymbol: 'HG=F', labelZh: '铜现货', min: 0.5, max: 20 },
  { key: 'gold', symbol: 'XAU', yahooSymbol: 'GC=F', labelZh: '金现货', min: 500, max: 10000 }
];
const CHINA_BOND_SOURCE = 'ChinaBond:MOF-yield-curve';
const CHINA_BOND_LEAF_SOURCE = 'ChinaBond:MOF';
const CHINA_BOND_HISTORY_URL = 'https://yield.chinabond.com.cn/cbweb-czb-web/czb/historyQuery';
const CHINA_BOND_REFERER = 'https://yield.chinabond.com.cn/cbweb-czb-web/czb/historyQuery';
const CHINA_BOND_LOOKBACK_DAYS = 10;
const CHINA_BOND_FRESH_DAYS = 7;
const CHINA_BOND_DISPLAY_NOTE =
  '中国 10 年国债收益率来自 ChinaBond 官方 JSON;display-only,不进 scoring/decision/execution/position。';
const CFETS_RMB_SOURCE = 'ChinaMoney:CFETS-RmbIdx';
const CFETS_RMB_HISTORY_URL = 'https://www.chinamoney.com.cn/ags/ms/cm-u-bk-fx/RmbIdxHis';
const CFETS_RMB_REFERER = 'https://www.chinamoney.com.cn/chinese/bkcurvfx/';
const CFETS_RMB_LOOKBACK_DAYS = 21;
const CFETS_RMB_FRESH_DAYS = 14;
const CFETS_RMB_DISPLAY_NOTE =
  'CFETS 人民币篮子指数来自 ChinaMoney 官方 JSON;周频精确篮子,display-only,不进 scoring/decision/execution/position。';
const CHINA_MACRO_HTML_USER_AGENT = 'Mozilla/5.0 GFRRBot/1.0';
const CHINA_MACRO_FRESH_DAYS = 45;
const CHINA_NBS_INDEX_URLS = [
  'https://www.stats.gov.cn/sj/zxfb/',
  'https://www.stats.gov.cn/sj/zxfb/index_1.html'
];
const CHINA_OMO_SOURCE = 'EastMoney:OMO-aggregated-news';
const CHINA_OMO_DISPLAY_NOTE =
  '东方财富聚合转载的央行公开市场操作新闻,非 PBOC 官方原始公告;按新闻毛额操作句提取逆回购/正回购期限、利率、操作量,announcementNo 因聚合新闻缺失为 null;display-only,不进 scoring/decision/execution/position,不代表逐机构/逐笔 raw tape。';
const CHINA_OMO_SEARCH_BASE_URL = 'https://search-api-web.eastmoney.com/search/jsonp';
const CHINA_OMO_SEARCH_KEYWORD = '央行今日开展逆回购操作';
const CHINA_OMO_SEARCH_KEYWORD_FALLBACK = '公开市场 逆回购操作';
const CHINA_OMO_ARTICLE_BASE_URL = 'https://finance.eastmoney.com/a/';
const CHINA_OMO_MAX_ARTICLE_FETCH = 6;
const CHINA_OMO_FRESH_DAYS = 7;
const CHINA_OMO_RATE_MIN = 0.005;
const CHINA_OMO_RATE_MAX = 0.05;
const CHINA_OMO_AMOUNT_MAX_YI = 100000;
const CHINA_TSF_SOURCE = 'EastMoney:TSF-aggregated-report';
const CHINA_TSF_DISPLAY_NOTE =
  '东方财富聚合转载的央行社会融资规模月度报告(公开财经媒体,如中国网财经),非 PBOC 官方原始报告;社融为报告级月度累计数据;display-only,不进 scoring/decision/execution/position,不代表贷款笔级/机构级 raw tape。';
const CHINA_TSF_SEARCH_BASE_URL = 'https://search-api-web.eastmoney.com/search/jsonp';
const CHINA_TSF_SEARCH_KEYWORD = '社会融资规模 增量累计';
const CHINA_TSF_ARTICLE_BASE_URL = 'https://finance.eastmoney.com/a/';
const CHINA_TSF_MAX_ARTICLE_FETCH = 6;
const CHINA_TSF_SEARCH_EXCLUDE_RE = /山西|房企|可转债|同业存单|评论|解读|观察/u;
const CHINA_TSF_BODY_REF_MONTH_RE = /(?<year>\d{4})年(?<month>\d{1,2})月末社会融资规模存量/u;
const CHINA_TSF_FRESH_DAYS = 45;
const CHINA_TSF_REF_FRESH_DAYS = 60;
const CHINA_TSF_STOCK_YOY_MIN = -0.2;
const CHINA_TSF_STOCK_YOY_MAX = 0.5;
const CHINA_TSF_COMPONENT_STATUSES = new Set(['complete', 'partial', 'missing']);
const CHINA_TSF_COMPONENT_DEFINITIONS = [
  {
    key: 'rmbLoans',
    label: '人民币贷款',
    pattern: /对实体经济发放的人民币贷款(?<verb>增加|减少|下降)(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u
  },
  {
    key: 'foreignLoans',
    label: '外币贷款',
    pattern: /对实体经济发放的外币贷款折合人民币(?<verb>增加|减少|下降)(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u
  },
  {
    key: 'entrustedLoans',
    label: '委托贷款',
    pattern: /委托贷款(?<verb>增加|减少|下降)(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u
  },
  {
    key: 'trustLoans',
    label: '信托贷款',
    pattern: /信托贷款(?<verb>增加|减少|下降)(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u
  },
  {
    key: 'undiscountedBills',
    label: '未贴现银行承兑汇票',
    pattern: /未贴现的银行承兑汇票(?<verb>增加|减少|下降)(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u
  },
  {
    key: 'corpBonds',
    label: '企业债券',
    pattern: /企业债券净融资(?<verb>增加|减少|下降)?(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u
  },
  {
    key: 'govBonds',
    label: '政府债券',
    pattern: /政府债券净融资(?<verb>增加|减少|下降)?(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u
  },
  {
    key: 'equity',
    label: '境内股票融资',
    pattern: /非金融企业境内股票融资(?<verb>增加|减少|下降)?(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u
  }
];
const CHINA_TSF_COMPONENT_KEYS = new Set(CHINA_TSF_COMPONENT_DEFINITIONS.map((component) => component.key));
const CHINA_MLF_SOURCE = 'EastMoney:MLF-aggregated-news';
const CHINA_MLF_DISPLAY_NOTE =
  '东方财富聚合转载的央行中期借贷便利 MLF 操作新闻,非 PBOC 官方原始公告;按新闻毛额操作句提取操作量和期限,不取净投放/净回笼/到期金额;mlfRate 未披露时为 null;display-only,不进 scoring/decision/execution/position,不代表逐机构/逐笔 raw tape。';
const CHINA_MLF_SEARCH_BASE_URL = 'https://search-api-web.eastmoney.com/search/jsonp';
const CHINA_MLF_SEARCH_KEYWORD = '央行 MLF 操作 期限';
const CHINA_MLF_SEARCH_KEYWORD_FALLBACK = '央行 开展 MLF操作';
const CHINA_MLF_ARTICLE_BASE_URL = 'https://finance.eastmoney.com/a/';
const CHINA_MLF_MAX_ARTICLE_FETCH = 6;
const CHINA_MLF_AMOUNT_MIN = 1;
const CHINA_MLF_AMOUNT_MAX = 100000;
const CHINA_MLF_RATE_MIN = 0.005;
const CHINA_MLF_RATE_MAX = 0.05;
const CHINA_PROPERTY_PRICE_SOURCE = 'NBS:70city-price-index';
const CHINA_PROPERTY_PRICE_DISPLAY_NOTE =
  'NBS 70 城商品住宅价格指数为城市级价格指数计数摘要;display-only,不进 scoring/decision/execution/position,不代表房源级 raw tape。';
const CHINA_PROPERTY_PRICE_INDEX_URLS = [
  'https://www.stats.gov.cn/sj/zxfbhjd/',
  'https://www.stats.gov.cn/sj/zxfbhjd/index_1.html',
  'https://www.stats.gov.cn/sj/zxfbhjd/index_2.html',
  'https://www.stats.gov.cn/sj/zxfbhjd/index_3.html',
  'https://www.stats.gov.cn/sj/zxfbhjd/index_4.html'
];
const CHINA_PROPERTY_PRICE_FRESH_DAYS = 45;
const CHINA_PROPERTY_PRICE_REF_FRESH_DAYS = 60;
const CHINA_PROPERTY_PRICE_CITY_COUNT = 70;
const CHINA_PROPERTY_PRICE_CITIES = [
  '北京', '天津', '石家庄', '太原', '呼和浩特', '沈阳', '大连', '长春', '哈尔滨', '上海',
  '南京', '杭州', '宁波', '合肥', '福州', '厦门', '南昌', '济南', '青岛', '郑州',
  '武汉', '长沙', '广州', '深圳', '南宁', '海口', '重庆', '成都', '贵阳', '昆明',
  '西安', '兰州', '西宁', '银川', '乌鲁木齐', '唐山', '秦皇岛', '包头', '丹东', '锦州',
  '吉林', '牡丹江', '无锡', '徐州', '扬州', '温州', '金华', '蚌埠', '安庆', '泉州',
  '九江', '赣州', '烟台', '济宁', '洛阳', '平顶山', '宜昌', '襄阳', '岳阳', '常德',
  '韶关', '湛江', '惠州', '桂林', '北海', '三亚', '泸州', '南充', '遵义', '大理'
];
// Official 70-city tier split from NBS interpretation note; runtime does not fetch the interpretation page.
// Source example: https://www.stats.gov.cn/sj/sjjd/202605/t20260518_1963721.html
const CHINA_PROPERTY_PRICE_TIER_DEFINITIONS = [
  {
    key: 'tier1',
    label: '一线',
    cityCount: 4,
    cities: ['北京', '上海', '广州', '深圳']
  },
  {
    key: 'tier2',
    label: '二线',
    cityCount: 31,
    cities: [
      '天津', '石家庄', '太原', '呼和浩特', '沈阳', '大连', '长春', '哈尔滨', '南京', '杭州',
      '宁波', '合肥', '福州', '厦门', '南昌', '济南', '青岛', '郑州', '武汉', '长沙',
      '南宁', '海口', '重庆', '成都', '贵阳', '昆明', '西安', '兰州', '西宁', '银川',
      '乌鲁木齐'
    ]
  },
  {
    key: 'tier3',
    label: '三线',
    cityCount: 35,
    cities: [
      '唐山', '秦皇岛', '包头', '丹东', '锦州', '吉林', '牡丹江', '无锡', '徐州', '扬州',
      '温州', '金华', '蚌埠', '安庆', '泉州', '九江', '赣州', '烟台', '济宁', '洛阳',
      '平顶山', '宜昌', '襄阳', '岳阳', '常德', '韶关', '湛江', '惠州', '桂林', '北海',
      '三亚', '泸州', '南充', '遵义', '大理'
    ]
  }
];
const CHINA_PROPERTY_PRICE_TIER_KEYS = CHINA_PROPERTY_PRICE_TIER_DEFINITIONS.map((tier) => tier.key);

function assertChinaPropertyTierDefinitions() {
  const officialCitySet = new Set(CHINA_PROPERTY_PRICE_CITIES);
  const tierCities = CHINA_PROPERTY_PRICE_TIER_DEFINITIONS.flatMap((tier) => tier.cities);
  const tierCitySet = new Set(tierCities);
  if (
    tierCities.length !== CHINA_PROPERTY_PRICE_CITY_COUNT
    || tierCitySet.size !== CHINA_PROPERTY_PRICE_CITY_COUNT
    || officialCitySet.size !== CHINA_PROPERTY_PRICE_CITY_COUNT
  ) {
    throw new Error('nbs:china-property tier constants must contain exactly 70 unique cities');
  }
  for (const city of CHINA_PROPERTY_PRICE_CITIES) {
    if (!tierCitySet.has(city)) throw new Error(`nbs:china-property tier constants missing ${city}`);
  }
  for (const tier of CHINA_PROPERTY_PRICE_TIER_DEFINITIONS) {
    if (tier.cities.length !== tier.cityCount) {
      throw new Error(`nbs:china-property ${tier.key} expected ${tier.cityCount} cities`);
    }
  }
}

assertChinaPropertyTierDefinitions();
const CHINA_INFLATION_SOURCE = 'NBS:stats-zxfb; TradingEconomics:China-CPI-PPI-public-html';
const CHINA_INFLATION_DISPLAY_NOTE =
  '中国 CPI/PPI 来自国家统计局发布正文;Trading Economics 公开 HTML 仅作 fallback;display-only,不进 scoring/decision/execution/position。';
const CHINA_PMI_SOURCE = 'NBS:stats-zxfb; TradingEconomics:China-NBS-Manufacturing-PMI-public-html';
const CHINA_PMI_DISPLAY_NOTE =
  '中国制造业 PMI 来自国家统计局发布正文;Trading Economics NBS Manufacturing PMI 公开 HTML 仅作 fallback;display-only,不进 scoring/decision/execution/position。';
const TRADING_ECONOMICS_CHINA_CPI_URL = 'https://tradingeconomics.com/china/inflation-cpi';
const TRADING_ECONOMICS_CHINA_PPI_URL = 'https://tradingeconomics.com/china/producer-prices-change';
const TRADING_ECONOMICS_CHINA_NBS_PMI_URL = 'https://tradingeconomics.com/china/business-confidence';
const STOCKQ_INDEX_BASE = 'https://en.stockq.org/index';
const STOCKQ_FETCH_TIMEOUT_MS = 9000;
const EMPLOYMENT_SOURCE =
  'FRED:ICSA; FRED:CCSA; FRED:JTSJOL; FRED:CES0500000003; FRED:U6RATE; FRED:industry-payroll-basket';
const EMPLOYMENT_INDUSTRY_PAYROLL_SERIES = [
  { id: 'MANEMP', label: 'Manufacturing' },
  { id: 'USCONS', label: 'Construction' },
  { id: 'USTRADE', label: 'Retail and wholesale trade' },
  { id: 'USTPU', label: 'Transportation and utilities' },
  { id: 'USPBS', label: 'Professional and business services' },
  { id: 'USEHS', label: 'Education and health services' },
  { id: 'USLAH', label: 'Leisure and hospitality' },
  { id: 'USFIRE', label: 'Financial activities' },
  { id: 'USINFO', label: 'Information' },
  { id: 'USMINE', label: 'Mining and logging' },
  { id: 'USGOVT', label: 'Government' }
];
const CONSUMER_RETAIL_SEGMENT_SERIES = [
  { key: 'motorVehicles', id: 'MRTSSM441USN', labelZh: '汽车及零部件' },
  { key: 'furniture', id: 'MRTSSM442USN', labelZh: '家具家居' },
  { key: 'electronics', id: 'MRTSSM443USN', labelZh: '电子家电' },
  { key: 'buildingMaterials', id: 'MRTSSM444USN', labelZh: '建材园艺' },
  { key: 'foodBeverage', id: 'MRTSSM445USN', labelZh: '食品饮料' },
  { key: 'healthPersonalCare', id: 'MRTSSM446USN', labelZh: '健康护理' },
  { key: 'gasolineStations', id: 'MRTSSM447USN', labelZh: '加油站' },
  { key: 'clothing', id: 'MRTSSM448USN', labelZh: '服装' },
  { key: 'sportingGoods', id: 'MRTSSM451USN', labelZh: '运动文娱' },
  { key: 'generalMerchandise', id: 'MRTSSM452USN', labelZh: '综合商超' },
  { key: 'miscellaneous', id: 'MRTSSM453USN', labelZh: '其他零售' },
  { key: 'nonstore', id: 'MRTSSM454USN', labelZh: '无店铺零售' },
  { key: 'foodServices', id: 'MRTSSM722USN', labelZh: '餐饮服务' }
];
const SHIPPING_FREIGHT_SOURCE = 'StockQ:BDTI; StockQ:BCTI; StockQ:BDI';
const ENERGY_SPARE_CAPACITY_SOURCE = 'EIA:STEO:COPS_OPEC';
const ENERGY_SPARE_CAPACITY_API_URL = 'https://api.eia.gov/v2/steo/data/';
const ENERGY_SPARE_CAPACITY_SOURCE_URL = 'https://www.eia.gov/outlooks/steo/data.php';
const ENERGY_SPARE_CAPACITY_SERIES_ID = 'COPS_OPEC';
const ENERGY_SPARE_CAPACITY_FETCH_TIMEOUT_MS = 10000;
const ENERGY_SPARE_CAPACITY_MAX_PERIOD_AGE_DAYS = 95;
const ENERGY_INVENTORY_BALANCE_SOURCE = 'EIA:STEO:PASC_OECD_T3/T3_STCHANGE_WORLD/PATC_WORLD';
const ENERGY_INVENTORY_BALANCE_API_URL = 'https://api.eia.gov/v2/steo/data/';
const ENERGY_INVENTORY_BALANCE_SOURCE_URL = 'https://www.eia.gov/outlooks/steo/report/global_oil.php';
const ENERGY_INVENTORY_BALANCE_FETCH_TIMEOUT_MS = 10000;
const ENERGY_INVENTORY_BALANCE_MAX_PERIOD_AGE_DAYS = 95;
const ENERGY_INVENTORY_BALANCE_SERIES = Object.freeze({
  oecdCommercialInventory: 'PASC_OECD_T3',
  usCommercialInventory: 'PASC_US',
  otherOecdCommercialInventory: 'PASC_OOECD_T3',
  globalInventoryDraw: 'T3_STCHANGE_WORLD',
  usInventoryDraw: 'T3_STCHANGE_US',
  otherOecdInventoryDraw: 'T3_STCHANGE_OOECD',
  nonOecdInventoryDraw: 'T3_STCHANGE_NOECD',
  worldConsumption: 'PATC_WORLD',
  oecdConsumption: 'PATC_OECD'
});
const ENERGY_INVENTORY_BALANCE_CORE_SERIES = [
  ENERGY_INVENTORY_BALANCE_SERIES.oecdCommercialInventory,
  ENERGY_INVENTORY_BALANCE_SERIES.globalInventoryDraw,
  ENERGY_INVENTORY_BALANCE_SERIES.worldConsumption,
  ENERGY_INVENTORY_BALANCE_SERIES.oecdConsumption
];
const ENERGY_TRANSPORT_SOURCE = 'IMFPortWatch:Daily_Chokepoints_Data';
const ENERGY_TRANSPORT_SOURCE_URL = 'https://portwatch.imf.org/';
const ENERGY_TRANSPORT_QUERY_URL = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query';
const ENERGY_TRANSPORT_FETCH_TIMEOUT_MS = 10000;
const ENERGY_TRANSPORT_WINDOW_DAYS = 120;
const ENERGY_TRANSPORT_QUERY_RECORD_LIMIT = 1000;
const ENERGY_TRANSPORT_STALE_DAYS = 21;
const ENERGY_TRANSPORT_USAGE_TERMS_PINNED = 'imf_data_terms_pinned';
const ENERGY_TRANSPORT_SHOCK_CANDIDATE_CONTRACT_VERSION = 'transport-shock-candidate-v1';
const ENERGY_TRANSPORT_SHOCK_CANDIDATE_WRITER_ANCHOR = 'transport-shock-candidate-writer-anchor-v1';
const ENERGY_TRANSPORT_CORE_KEYS = ['suez', 'babElMandeb', 'malacca', 'hormuz', 'capeGoodHope', 'gibraltar'];
const ENERGY_TRANSPORT_CHOKEPOINTS = [
  { key: 'suez', portid: 'chokepoint1', portname: 'Suez Canal', core: true },
  { key: 'panama', portid: 'chokepoint2', portname: 'Panama Canal', core: false },
  { key: 'bosporus', portid: 'chokepoint3', portname: 'Bosporus Strait', core: false },
  { key: 'babElMandeb', portid: 'chokepoint4', portname: 'Bab el-Mandeb Strait', core: true },
  { key: 'malacca', portid: 'chokepoint5', portname: 'Malacca Strait', core: true },
  { key: 'hormuz', portid: 'chokepoint6', portname: 'Strait of Hormuz', core: true },
  { key: 'capeGoodHope', portid: 'chokepoint7', portname: 'Cape of Good Hope', core: true },
  { key: 'gibraltar', portid: 'chokepoint8', portname: 'Gibraltar Strait', core: true }
];
const ENERGY_TRANSPORT_CHOKEPOINT_BY_PORTID = new Map(
  ENERGY_TRANSPORT_CHOKEPOINTS.map((item) => [item.portid, item])
);
const CONSUMER_RETAIL_SOURCE =
  'FRED:CARTS; FRED:CARTSR; FRED:MonthlyRetailTradeSegments; BofA:ConsumerCheckpoint-public-html; TradingEconomics:Redbook-public-html';
const POLICY_EXPECTATIONS_SOURCE =
  'FRED:DFEDTARL/DFEDTARU/DFF; Yahoo:ZQ=F/ZQ-monthly-futures/SR3-monthly-SOFR-futures; CheckMySwap:USD-OIS-public-curve; FederalReserve:FOMC statement/SEP/minutes';
const PRIVATE_CREDIT_PROXY_SOURCE = 'Yahoo:BIZD; Yahoo:PBDC; Yahoo:SRLN; Yahoo:CCLFX; FRED:BAMLH0A0HYM2; FRED:BAMLC0A0CM; ICE:CDX-index-settlement-public';
const CRE_PUBLIC_MARKET_PROXY_SOURCE =
  'FRED:DRCRELEXFACBS; FRED:CORCREXFACBS; FRED:SUBLPDRCSN; FRED:SUBLPDRCSC; FRED:SUBLPDRCSM; FRED:CREACBW027SBOG; Yahoo:VNQ; Yahoo:REM; Yahoo:CMBS';
const FUTURES_MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];
const FUTURES_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function normalizeWorldOrderStressHistorySnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const score = finiteNumberOrNull(payload.score);
  const confidence = finiteNumberOrNull(payload.confidence);
  const observedAt = textOrNull(payload.updatedAt);
  const state = textOrNull(payload.state);
  const labelZh = textOrNull(payload.labelZh);
  const freshness = textOrNull(payload.freshness);
  if (score === null || score < 0 || score > 100) return null;
  if (confidence === null || confidence < 0 || confidence > 1) return null;
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) return null;
  if (!state || !labelZh || !freshness) return null;
  return {
    score,
    state,
    labelZh,
    observedAt,
    confidence,
    freshness
  };
}

const DAILY_REALTIME_AUDIT_SOURCE = 'origin/realtime-data:realtime/market.json';

function extractDailyRealtimeAuditTimestamp(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : null;
  const candidates = [payload.updatedAt, meta?.updatedAt, payload.generatedAt, payload.timestamp];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function formatDailyAuditScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return String(value);
}

function runDailyRealtimeInputAudit(realtimePayload) {
  const hasRealtime = !!(realtimePayload && typeof realtimePayload === 'object');
  const updatedAtRaw = extractDailyRealtimeAuditTimestamp(realtimePayload);
  const ageMinutes = updatedAtRaw ? computeAgeMinutes(updatedAtRaw) : null;
  const freshness = classifyFreshnessLevel(ageMinutes, hasRealtime);
  const sourceMode = hasRealtime ? (realtimePayload.sourceMode ?? null) : null;
  const healthScore = hasRealtime && Number.isFinite(realtimePayload.healthScore)
    ? realtimePayload.healthScore
    : null;
  const brent = hasRealtime && realtimePayload.values && typeof realtimePayload.values === 'object'
    && Number.isFinite(Number(realtimePayload.values.brent))
    ? Number(realtimePayload.values.brent)
    : null;
  const consensus = hasRealtime && realtimePayload.brentValidation && typeof realtimePayload.brentValidation === 'object'
    ? realtimePayload.brentValidation.consensus
    : null;
  const brentConsensusRecommendedValue = consensus && Object.prototype.hasOwnProperty.call(consensus, 'recommendedValue')
    ? consensus.recommendedValue
    : null;
  const brentCanPromoteToPrimary = consensus && Object.prototype.hasOwnProperty.call(consensus, 'canPromoteToPrimary')
    ? consensus.canPromoteToPrimary
    : null;
  const brentConsensusConfidence = consensus?.confidence ?? null;

  const isWarning = freshness === 'stale' || freshness === 'unavailable';
  const result = isWarning ? 'WARNING' : 'OK';
  let suggestedAction = 'Check realtime-data branch availability, realtime/market.json structure, workflow permissions, or upstream failures.';
  if (freshness === 'fresh') suggestedAction = 'No action needed.';
  else if (freshness === 'aging') suggestedAction = 'Monitor. Daily is using an aging realtime snapshot.';
  else if (freshness === 'stale') {
    suggestedAction = 'Check Build Realtime Market schedule, realtime-data branch updatedAt, and upstream market source freshness.';
  }

  const lines = [
    `[Daily Realtime Audit] source: ${DAILY_REALTIME_AUDIT_SOURCE}`,
    `[Daily Realtime Audit] updatedAt: ${updatedAtRaw ?? 'null'}`,
    `[Daily Realtime Audit] ageMinutes: ${ageMinutes === null ? 'null' : String(ageMinutes)}`,
    `[Daily Realtime Audit] freshness: ${freshness}`,
    `[Daily Realtime Audit] sourceMode: ${formatDailyAuditScalar(sourceMode)}`,
    `[Daily Realtime Audit] healthScore: ${formatDailyAuditScalar(healthScore)}`,
    `[Daily Realtime Audit] brent: ${formatDailyAuditScalar(brent)}`,
    `[Daily Realtime Audit] brentConsensusRecommendedValue: ${formatDailyAuditScalar(brentConsensusRecommendedValue)}`,
    `[Daily Realtime Audit] brentCanPromoteToPrimary: ${formatDailyAuditScalar(brentCanPromoteToPrimary)}`,
    `[Daily Realtime Audit] brentConsensusConfidence: ${formatDailyAuditScalar(brentConsensusConfidence)}`,
    `[Daily Realtime Audit] result: ${result}`,
    `[Daily Realtime Audit] suggestedAction: ${suggestedAction}`
  ];

  const logLine = isWarning ? console.warn : console.log;
  for (const line of lines) logLine(line);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath && typeof summaryPath === 'string') {
    try {
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      };
      const md = [
        '',
        '### Daily Realtime Input Audit',
        '',
        '| Item | Value |',
        '|---|---|',
        `| source | ${esc(DAILY_REALTIME_AUDIT_SOURCE)} |`,
        `| updatedAt | ${esc(updatedAtRaw)} |`,
        `| ageMinutes | ${esc(ageMinutes === null ? 'null' : ageMinutes)} |`,
        `| freshness | ${esc(freshness)} |`,
        `| sourceMode | ${esc(sourceMode)} |`,
        `| healthScore | ${esc(healthScore)} |`,
        `| Brent | ${esc(brent)} |`,
        `| Brent consensus | ${esc(brentConsensusRecommendedValue)} |`,
        `| confidence | ${esc(brentConsensusConfidence)} |`,
        `| canPromoteToPrimary | ${esc(brentCanPromoteToPrimary)} |`,
        `| result | ${esc(result)} |`,
        ''
      ].join('\n');
      fs.appendFileSync(summaryPath, md, 'utf8');
    } catch (err) {
      console.warn('[Daily Realtime Audit] Failed to write GitHub Step Summary:', err instanceof Error ? err.message : err);
    }
  }
}

const prevData = readJson(dataPath, {});
const prevHistory = readJson(histPath, []);
const prevHistoryFull = readJson(histFullPath, []);
const worldOrderStressHistorySnapshot = normalizeWorldOrderStressHistorySnapshot(readJson(worldOrderPath, null));
const realtime = readJson(rtPath, null);
if (IS_MAIN) runDailyRealtimeInputAudit(realtime);

function buildDailyRealtimeInput(realtimePayload) {
  return {
    branch: 'realtime-data',
    commitSha: process.env.GFRR_REALTIME_COMMIT_SHA || null,
    updatedAt: realtimePayload?.updatedAt || realtimePayload?.asOf || null,
    sourceMode: realtimePayload?.sourceMode || null,
    healthScore: Number.isFinite(realtimePayload?.healthScore) ? realtimePayload.healthScore : null,
    capturedAt: isoNow
  };
}

const MAIN_SCORE_WIND_ENDPOINTS = {
  analytics_data: 'https://wind-mcp.wind.com.cn/api/mcp/analytics_data/sse',
  economic_data: 'https://wind-mcp.wind.com.cn/api/mcp/economic_data/sse'
};

const MAIN_SCORE_WIND_INPUTS = {
  brent: {
    serverType: 'analytics_data',
    toolName: 'get_financial_data',
    question: '请返回最新可用的布伦特原油连续合约或现货价格，仅包含日期、数值、单位、来源。',
    valueHints: ['brent', '布伦特', '原油', 'crude', 'price', '价格', '收盘', '最新', '结算'],
    rejectHints: ['日期', '时间', '代码', '涨跌', '涨跌幅', '成交', 'volume', 'open interest']
  },
  dxy: {
    serverType: 'analytics_data',
    toolName: 'get_financial_data',
    question: '请返回最新可用的美元指数 DXY 或广义美元指数数值，仅包含日期、数值、单位、来源。',
    valueHints: ['dxy', '美元指数', 'broad dollar', 'dollar index', '指数', '收盘', '最新'],
    rejectHints: ['日期', '时间', '代码', '涨跌', '涨跌幅', '成交', 'volume']
  },
  vix: {
    serverType: 'analytics_data',
    toolName: 'get_financial_data',
    question: '请返回最新可用的 CBOE VIX 指数数值，仅包含日期、数值、单位、来源。',
    valueHints: ['vix', '波动率', 'volatility', '指数', '收盘', '最新'],
    rejectHints: ['日期', '时间', '代码', '涨跌', '涨跌幅', '成交', 'volume']
  },
  hyOas: {
    serverType: 'analytics_data',
    toolName: 'get_financial_data',
    question: '请返回最新可用的美国高收益债 OAS 利差，单位使用百分比，不要使用基点，仅包含日期、数值、单位、来源。',
    valueHints: ['hy oas', 'high yield', '高收益', 'oas', '利差', 'percent', '百分比'],
    rejectHints: ['日期', '时间', '代码', '涨跌', '涨跌幅', '成交', 'volume', 'bp', 'bps', '基点']
  },
  us10y: {
    serverType: 'analytics_data',
    toolName: 'get_financial_data',
    question: '请返回最新可用的美国10年期国债收益率，单位使用百分比，仅包含日期、数值、单位、来源。',
    valueHints: ['10y', '10年', '十年', 'treasury', '国债', '收益率', 'yield', 'percent', '百分比'],
    rejectHints: ['日期', '时间', '代码', '涨跌', '涨跌幅', '成交', 'volume', 'bp', 'bps', '基点']
  },
  real10y: {
    serverType: 'analytics_data',
    toolName: 'get_financial_data',
    question: '请返回最新可用的美国10年期实际利率或10年期 TIPS 实际收益率，单位使用百分比，仅包含日期、数值、单位、来源。',
    valueHints: ['real', 'tips', '实际利率', '实际收益率', '10y', '10年', '收益率', 'percent', '百分比'],
    rejectHints: ['日期', '时间', '代码', '涨跌', '涨跌幅', '成交', 'volume', 'bp', 'bps', '基点']
  },
  breakeven10y: {
    serverType: 'analytics_data',
    toolName: 'get_financial_data',
    question: '请返回最新可用的美国10年期盈亏平衡通胀率，单位使用百分比，仅包含日期、数值、单位、来源。',
    valueHints: ['breakeven', '盈亏平衡', '通胀', 'inflation', '10y', '10年', 'percent', '百分比'],
    rejectHints: ['日期', '时间', '代码', '涨跌', '涨跌幅', '成交', 'volume', 'bp', 'bps', '基点']
  },
  spx: {
    serverType: 'analytics_data',
    toolName: 'get_financial_data',
    question: '请返回最新可用的标普500指数 S&P 500 收盘或最新数值，仅包含日期、数值、单位、来源。',
    valueHints: ['spx', 's&p 500', 'standard & poor', '标普', 'sp500', '指数', '收盘', '最新'],
    rejectHints: ['日期', '时间', '代码', '涨跌', '涨跌幅', '成交', 'volume']
  }
};

const mainScoreWindInitializedServers = new Set();
let mainScoreWindRequestId = 1;

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeAuditString(value, max = 180) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max) || null;
}

function mainScoreRiskTier(score) {
  if (!Number.isFinite(score)) return 'unknown';
  if (score >= 82) return 'red';
  if (score >= 65) return 'yellow';
  if (score >= 55) return 'watch';
  return 'normal';
}

function mainScoreTierRank(tier) {
  return { unknown: -1, normal: 0, watch: 1, yellow: 2, red: 3 }[tier] ?? -1;
}

function mainScorePolicyRange(key) {
  return MAIN_SCORE_SOURCE_POLICY.windPaidFallback?.plausibilityRanges?.[key] || null;
}

function isPlausibleMainScoreWindValue(key, value) {
  const range = mainScorePolicyRange(key);
  return Number.isFinite(value) &&
    (!range || ((!Number.isFinite(range.min) || value >= range.min) && (!Number.isFinite(range.max) || value <= range.max)));
}

function parseMainScoreNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/u.test(text)) return null;
  const textWithoutDates = text
    .replace(/\b(19|20)\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/gu, ' ')
    .replace(/\b(19|20)\d{6}\b/gu, ' ');
  const normalized = textWithoutDates.replace(/,/g, '').replace(/%$/u, '').trim();
  if (/^-?\d+(?:\.\d+)?$/u.test(normalized)) {
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  const matches = [...textWithoutDates.replace(/,/g, '').matchAll(/-?\d+(?:\.\d+)?/gu)];
  if (matches.length > 1) return null;
  const match = matches[0];
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeWindDate(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const isoMatch = text.match(/\b(19|20)\d{2}-\d{1,2}-\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/u);
  if (isoMatch) {
    const parsed = Date.parse(isoMatch[0]);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  const slashMatch = text.match(/\b((?:19|20)\d{2})[/.年]([01]?\d)[/.月]([0-3]?\d)/u);
  if (slashMatch) {
    const [, year, month, day] = slashMatch;
    const parsed = Date.parse(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return null;
}

function findWindObservedAt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return normalizeWindDate(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const observedAt = findWindObservedAt(item);
      if (observedAt) return observedAt;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    if (/date|time|日期|时间|交易日|报告期|observed|updated|asof|as_of/i.test(key)) {
      const observedAt = normalizeWindDate(item);
      if (observedAt) return observedAt;
    }
  }
  for (const item of Object.values(value)) {
    const observedAt = findWindObservedAt(item);
    if (observedAt) return observedAt;
  }
  return null;
}

function mainScoreLabelScore(key, label, context) {
  const input = MAIN_SCORE_WIND_INPUTS[key];
  const text = `${label || ''} ${context || ''}`.toLowerCase();
  if (!input || !text.trim()) return 0;
  if (input.rejectHints.some((hint) => text.includes(hint.toLowerCase()))) return -1;
  let score = 0;
  for (const hint of input.valueHints) {
    if (text.includes(hint.toLowerCase())) score += 2;
  }
  if (/value|price|close|last|rate|yield|spread|index|数值|价格|收盘|最新|收益率|利差|指数/u.test(text)) score += 1;
  return score;
}

function parseJsonMaybe(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed || !/^[{[]/u.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function windResponseSearchRoots(payload) {
  const roots = [];
  const push = (value) => {
    if (value !== null && value !== undefined) roots.push(value);
    const parsed = parseJsonMaybe(value);
    if (parsed) roots.push(parsed);
  };
  push(payload);
  if (payload?.result !== undefined) push(payload.result);
  const content = payload?.result?.content || payload?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      push(item);
      if (item?.text !== undefined) push(item.text);
      if (item?.data !== undefined) push(item.data);
    }
  }
  return roots;
}

function collectWindMainScoreCandidatesFromTable(candidates, key, value) {
  if (!isPlainObject(value) || !Array.isArray(value.columns)) return;
  const rows = Array.isArray(value.data) ? value.data : Array.isArray(value.rows) ? value.rows : null;
  if (!rows) return;
  const columns = value.columns.map((column) => (
    typeof column === 'string' ? column : (column?.name || column?.title || column?.key || '')
  ));
  for (const row of rows) {
    const rowObject = Array.isArray(row)
      ? Object.fromEntries(columns.map((column, index) => [column || `col${index}`, row[index]]))
      : (isPlainObject(row) ? row : null);
    if (!rowObject) continue;
    const observedAt = findWindObservedAt(rowObject);
    const context = Object.entries(rowObject)
      .filter(([rowKey, rowValue]) => typeof rowValue === 'string' && !/date|time|日期|时间|交易日|报告期/i.test(rowKey))
      .map(([, rowValue]) => rowValue)
      .join(' ');
    for (const [label, raw] of Object.entries(rowObject)) {
      const score = mainScoreLabelScore(key, label, context);
      if (score < 1) continue;
      const n = parseMainScoreNumber(raw);
      if (!isPlausibleMainScoreWindValue(key, n)) continue;
      candidates.push({
        value: n,
        observedAt,
        label: sanitizeAuditString(label),
        context: sanitizeAuditString(context),
        score,
        path: 'table'
      });
    }
  }
}

function collectWindMainScoreCandidates(value, key, candidates = [], pathParts = [], inheritedDate = null, inheritedContext = '') {
  collectWindMainScoreCandidatesFromTable(candidates, key, value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectWindMainScoreCandidates(item, key, candidates, [...pathParts, String(index)], inheritedDate, inheritedContext);
    });
    return candidates;
  }
  if (!isPlainObject(value)) return candidates;

  const objectDate = findWindObservedAt(value) || inheritedDate;
  const localContext = [
    inheritedContext,
    ...Object.entries(value)
      .filter(([itemKey, itemValue]) => typeof itemValue === 'string' && !/date|time|日期|时间|交易日|报告期/i.test(itemKey))
      .map(([, itemValue]) => itemValue)
  ].join(' ');

  for (const [keyName, raw] of Object.entries(value)) {
    const path = [...pathParts, keyName];
    const score = mainScoreLabelScore(key, keyName, localContext);
    const n = parseMainScoreNumber(raw);
    if (score >= 1 && isPlausibleMainScoreWindValue(key, n)) {
      candidates.push({
        value: n,
        observedAt: objectDate,
        label: sanitizeAuditString(keyName),
        context: sanitizeAuditString(localContext),
        score,
        path: sanitizeAuditString(path.join('.'))
      });
    }
    collectWindMainScoreCandidates(raw, key, candidates, path, objectDate, localContext);
  }
  return candidates;
}

function selectWindMainScoreCandidate(key, payload) {
  const candidates = [];
  for (const rootValue of windResponseSearchRoots(payload)) {
    collectWindMainScoreCandidates(rootValue, key, candidates);
  }
  const filtered = candidates
    .filter((candidate) => candidate.observedAt)
    .sort((a, b) => b.score - a.score);
  if (!filtered.length) {
    return {
      ok: false,
      reason: 'no_labeled_plausible_timestamped_value',
      candidateCount: candidates.length
    };
  }
  const selected = filtered[0];
  return {
    ok: true,
    value: selected.value,
    observedAt: selected.observedAt,
    evidence: {
      label: selected.label,
      context: selected.context,
      path: selected.path,
      candidateCount: filtered.length
    }
  };
}

function parseMainScoreWindSse(text) {
  let lastJson = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      lastJson = JSON.parse(payload);
    } catch {
      // Keep fail-closed behavior: malformed SSE events are ignored until no valid event remains.
    }
  }
  if (!lastJson) throw new Error('Wind SSE response had no JSON data event');
  return lastJson;
}

async function mainScoreWindMcpRequest(serverType, payload) {
  const endpoint = MAIN_SCORE_WIND_ENDPOINTS[serverType];
  if (!endpoint) throw new Error(`unsupported Wind MCP server: ${serverType}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAIN_SCORE_WIND_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WIND_API_KEY}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Wind MCP HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream') || text.includes('\ndata:')) return parseMainScoreWindSse(text);
    return JSON.parse(text);
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`Wind MCP timeout ${MAIN_SCORE_WIND_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function mainScoreWindMcpCall(serverType, toolName, args) {
  if (!mainScoreWindInitializedServers.has(serverType)) {
    await mainScoreWindMcpRequest(serverType, {
      jsonrpc: '2.0',
      id: mainScoreWindRequestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'gfrr-main-score-daily', version: '1.0.0' }
      }
    });
    mainScoreWindInitializedServers.add(serverType);
  }
  return await mainScoreWindMcpRequest(serverType, {
    jsonrpc: '2.0',
    id: mainScoreWindRequestId++,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  });
}

async function fetchWindMainScoreInput(key) {
  const input = MAIN_SCORE_WIND_INPUTS[key];
  if (!input) return { ok: false, reason: 'unsupported_input' };
  const payload = await mainScoreWindMcpCall(input.serverType, input.toolName, {
    question: input.question,
    lang: 'CNS'
  });
  const selected = selectWindMainScoreCandidate(key, payload);
  if (!selected.ok) return selected;
  return {
    ok: true,
    value: selected.value,
    observedAt: selected.observedAt,
    fetchedAt: isoNow,
    source: `wind:${input.serverType}.${input.toolName}`,
    evidence: selected.evidence
  };
}

function existingPublicFallbackIsFresh(realtimePayload, key) {
  const detail = realtimePayload?.sourceDetails?.[key];
  if (!isPlainObject(detail) || detail.ok !== true || detail.paidWindFallback === true) return false;
  const observedAt = normalizeWindDate(detail.observedAt || detail.timestamp || detail.asOf || detail.updatedAt) ||
    normalizeWindDate(realtimePayload?.updatedAt || realtimePayload?.asOf);
  const freshness = windFreshnessDecision(key, observedAt);
  return freshness.ok;
}

function mainScoreInputFallbackNeed(realtimePayload, key) {
  const currentValue = Number(realtimePayload?.values?.[key]);
  if (!Number.isFinite(currentValue)) {
    return { needed: true, reason: 'current_value_missing_or_nonfinite', currentValue: null };
  }
  const detail = realtimePayload?.sourceDetails?.[key];
  if (isPlainObject(detail) && detail.ok === false) {
    return { needed: true, reason: 'source_detail_not_ok', currentValue };
  }
  const sourceStatus = String(realtimePayload?.sourceStatus?.[key] || '').toLowerCase();
  if (/(missing|unavailable|error|stale|blocked|degraded)/u.test(sourceStatus)) {
    return { needed: true, reason: 'source_status_missing_or_fallback', currentValue };
  }
  if (/fallback/u.test(sourceStatus)) {
    if (existingPublicFallbackIsFresh(realtimePayload, key)) {
      return { needed: false, reason: 'existing_public_validated_fallback_available', currentValue };
    }
    return { needed: true, reason: 'source_status_missing_or_fallback', currentValue };
  }
  return { needed: false, reason: 'public_primary_available', currentValue };
}

function windFreshnessDecision(key, observedAt) {
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return { ok: false, reason: 'missing_or_invalid_observed_at', ageHours: null };
  const ageHours = (Date.parse(isoNow) - observedMs) / 3600000;
  const maxHours = MAIN_SCORE_SOURCE_POLICY.windPaidFallback?.freshnessHours?.[key];
  if (!Number.isFinite(ageHours) || !Number.isFinite(maxHours)) {
    return { ok: false, reason: 'freshness_policy_missing', ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(2)) : null };
  }
  return {
    ok: ageHours >= 0 && ageHours <= maxHours,
    reason: ageHours >= 0 && ageHours <= maxHours ? 'fresh' : 'stale',
    ageHours: Number(ageHours.toFixed(2)),
    maxHours
  };
}

function mainScoreConflictTolerance(key) {
  const tolerances = MAIN_SCORE_SOURCE_POLICY.windPaidFallback?.conflictTolerances || {};
  return {
    brent: { mode: 'pct', limit: tolerances.brentPct },
    dxy: { mode: 'pct', limit: tolerances.dxyPct },
    vix: { mode: 'pct', limit: tolerances.vixPct },
    hyOas: { mode: 'abs', limit: tolerances.hyOasAbsPctPoint },
    us10y: { mode: 'abs', limit: tolerances.us10yAbsPctPoint },
    real10y: { mode: 'abs', limit: tolerances.real10yAbsPctPoint },
    breakeven10y: { mode: 'abs', limit: tolerances.breakeven10yAbsPctPoint },
    spx: { mode: 'pct', limit: tolerances.spxPct }
  }[key] || null;
}

function mainScoreDivergence(key, candidateValue, referenceValue) {
  if (!Number.isFinite(candidateValue) || !Number.isFinite(referenceValue)) return null;
  const tolerance = mainScoreConflictTolerance(key);
  if (!tolerance || !Number.isFinite(tolerance.limit)) return null;
  if (tolerance.mode === 'pct') {
    const denominator = Math.max(Math.abs(referenceValue), 1e-9);
    return {
      mode: 'pct',
      value: Math.abs((candidateValue - referenceValue) / denominator) * 100,
      limit: tolerance.limit
    };
  }
  return {
    mode: 'abs',
    value: Math.abs(candidateValue - referenceValue),
    limit: tolerance.limit
  };
}

function cloneRealtimeWithWindInput(realtimePayload, key, windResult, need) {
  const next = structuredClone(realtimePayload);
  next.values = { ...(next.values || {}), [key]: windResult.value };
  next.sourceStatus = { ...(next.sourceStatus || {}), [key]: 'wind:paid-fallback' };
  next.sourceDetails = {
    ...(next.sourceDetails || {}),
    [key]: {
      ok: true,
      value: windResult.value,
      source: windResult.source,
      sourceMode: 'wind_paid_fallback',
      observedAt: windResult.observedAt,
      timestamp: windResult.observedAt,
      fetchedAt: windResult.fetchedAt,
      fallbackReason: need.reason,
      paidWindFallback: true,
      participatesInMainScore: true,
      sourceConflictAudit: windResult.sourceConflictAudit,
      evidence: windResult.evidence
    }
  };
  next.sourceMode = next.sourceMode === 'live' ? 'live-with-fallback' : (next.sourceMode || 'live-with-fallback');
  next.degradedMode = true;
  next.fallbackCount = (Number.isFinite(next.fallbackCount) ? next.fallbackCount : 0) + 1;
  const note = `Wind paid fallback applied to main score input ${key}; reason=${need.reason}.`;
  next.notes = Array.isArray(next.notes) ? [...next.notes, note] : [note];
  return next;
}

function mainScoreWindSwitchGuards(baseRisk, candidateRisk) {
  const guards = [];
  const cfg = MAIN_SCORE_SOURCE_POLICY.windPaidFallback?.scoreImpactGuards || {};
  const scoreDelta = Number.isFinite(baseRisk?.score) && Number.isFinite(candidateRisk?.score)
    ? candidateRisk.score - baseRisk.score
    : null;
  if (Number.isFinite(scoreDelta) && Number.isFinite(cfg.maxAutomaticScoreDeltaWithoutReview) &&
      Math.abs(scoreDelta) > cfg.maxAutomaticScoreDeltaWithoutReview) {
    guards.push('score_delta_exceeds_guard');
  }
  const baseTier = mainScoreRiskTier(baseRisk?.score);
  const candidateTier = mainScoreRiskTier(candidateRisk?.score);
  const rankDelta = mainScoreTierRank(candidateTier) - mainScoreTierRank(baseTier);
  if (Number.isFinite(cfg.maxAutomaticTierJumpWithoutReview) &&
      Math.abs(rankDelta) > cfg.maxAutomaticTierJumpWithoutReview) {
    guards.push('tier_jump_exceeds_guard');
  }
  if (cfg.riskTierDowngradeRequiresConfirmationFrom === 'yellow' &&
      mainScoreTierRank(baseTier) >= mainScoreTierRank('yellow') &&
      mainScoreTierRank(candidateTier) < mainScoreTierRank(baseTier)) {
    guards.push('yellow_or_red_tier_downgrade_requires_confirmation');
  }
  if (cfg.tailOverlaySwitchRequiresConfirmation === true &&
      Boolean(baseRisk?.tailRiskOverlay?.applied) !== Boolean(candidateRisk?.tailRiskOverlay?.applied)) {
    guards.push('tail_overlay_switch_requires_confirmation');
  }
  return {
    scoreDelta: Number.isFinite(scoreDelta) ? scoreDelta : null,
    baseTier,
    candidateTier,
    rankDelta: Number.isFinite(rankDelta) ? rankDelta : null,
    guards
  };
}

function buildMainScoreSourcePolicyAudit(realtimePayload) {
  return {
    contractVersion: MAIN_SCORE_SOURCE_POLICY.contractVersion,
    mode: 'wind_paid_invalid_leaf_fallback_v1',
    status: 'not_evaluated',
    evaluatedAt: isoNow,
    enabledEnvVar: MAIN_SCORE_WIND_FALLBACK_ENV,
    enabled: MAIN_SCORE_WIND_FALLBACK_ENABLED,
    windKeyPresent: Boolean(WIND_API_KEY),
    doesNotBypassRealtimeTrustGate: true,
    doesNotOverrideFinitePublicPrimary: true,
    sourcePriority: MAIN_SCORE_SOURCE_POLICY.windPaidFallback?.sourcePriority || [],
    scoreImpactGuards: MAIN_SCORE_SOURCE_POLICY.windPaidFallback?.scoreImpactGuards || {},
    eligibleInputs: MAIN_SCORE_SOURCE_POLICY.windPaidFallback?.eligibleInputs || [],
    candidateInputs: [],
    appliedInputs: [],
    reviewRequiredInputs: [],
    skippedInputs: [],
    sourceConflictAudit: {},
    notes: [
      `realtimeTrustGate=${canUseRealtimePayloadValues(realtimePayload) ? 'pass' : 'fail'}`
    ]
  };
}

async function evaluateWindMainScoreCandidate({ key, need, windResult, baseRealtime, currentRealtime, macroDrivers }) {
  const audit = {
    input: key,
    fallbackReason: need.reason,
    previousRealtimeValue: Number.isFinite(need.currentValue) ? need.currentValue : null,
    windSource: windResult.source || null,
    windObservedAt: windResult.observedAt || null,
    windFetchedAt: windResult.fetchedAt || null,
    windEvidence: windResult.evidence || null,
    decision: 'rejected',
    reasons: []
  };

  if (!windResult.ok) {
    audit.reasons.push(windResult.reason || 'wind_fetch_or_parse_failed');
    audit.windCandidateCount = windResult.candidateCount ?? null;
    return { apply: false, reviewRequired: false, audit };
  }

  if (!isPlausibleMainScoreWindValue(key, windResult.value)) {
    audit.reasons.push('plausibility_range_failed');
    return { apply: false, reviewRequired: false, audit };
  }
  audit.windValue = windResult.value;

  const freshness = windFreshnessDecision(key, windResult.observedAt);
  audit.freshness = freshness;
  if (!freshness.ok) {
    audit.reasons.push(`wind_${freshness.reason}`);
    return { apply: false, reviewRequired: false, audit };
  }

  const previousDailyValue = Number(prevData?.displayInputsBaseline?.[key]);
  if (Number.isFinite(previousDailyValue)) {
    const divergence = mainScoreDivergence(key, windResult.value, previousDailyValue);
    audit.previousDailyBaseline = previousDailyValue;
    audit.previousDailyDivergence = divergence;
    if (divergence && Number.isFinite(divergence.value) && Number.isFinite(divergence.limit) && divergence.value > divergence.limit) {
      audit.decision = 'review_required';
      audit.reasons.push('previous_daily_baseline_conflict_exceeds_tolerance');
      return { apply: false, reviewRequired: true, audit };
    }
  }

  const baseRisk = deriveRisk(baseRealtime, macroDrivers);
  const candidateRealtime = cloneRealtimeWithWindInput(currentRealtime, key, { ...windResult, sourceConflictAudit: audit }, need);
  const candidateRisk = deriveRisk(candidateRealtime, macroDrivers);
  const impact = mainScoreWindSwitchGuards(baseRisk, candidateRisk);
  audit.scoreImpact = impact;
  if (impact.guards.length) {
    audit.decision = 'review_required';
    audit.reasons.push(...impact.guards);
    return { apply: false, reviewRequired: true, audit };
  }

  audit.decision = 'applied';
  audit.reasons.push('wind_paid_fallback_passed_arbitration');
  return { apply: true, reviewRequired: false, audit };
}

async function resolveMainScoreRuntimeSource(realtimePayload, macroDrivers) {
  const audit = buildMainScoreSourcePolicyAudit(realtimePayload);
  if (!canUseRealtimePayloadValues(realtimePayload)) {
    audit.status = 'skipped_realtime_trust_gate';
    audit.notes.push('Wind fallback does not synthesize a full realtime payload.');
    return { realtimePayload, audit };
  }

  const eligibleInputs = audit.eligibleInputs;
  const candidateNeeds = [];
  for (const key of eligibleInputs) {
    const need = mainScoreInputFallbackNeed(realtimePayload, key);
    if (need.needed) {
      candidateNeeds.push({ key, need });
      audit.candidateInputs.push(key);
    } else {
      audit.skippedInputs.push({ key, reason: need.reason });
    }
  }

  if (!candidateNeeds.length) {
    audit.status = 'skipped_no_candidates';
    audit.notes.push('No invalid/missing/fallback core score leaf input required Wind evaluation.');
    return { realtimePayload, audit };
  }
  if (!MAIN_SCORE_WIND_FALLBACK_ENABLED) {
    audit.status = 'skipped_disabled';
    audit.notes.push(`${MAIN_SCORE_WIND_FALLBACK_ENV}=1 is required before paid Wind fallback can run.`);
    return { realtimePayload, audit };
  }
  if (!WIND_API_KEY) {
    audit.status = 'skipped_no_wind_key';
    audit.notes.push('WIND_API_KEY is absent; paid fallback stayed fail-closed.');
    return { realtimePayload, audit };
  }

  let workingRealtime = structuredClone(realtimePayload);
  let hadError = false;
  for (const { key, need } of candidateNeeds) {
    try {
      const windResult = await fetchWindMainScoreInput(key);
      const decision = await evaluateWindMainScoreCandidate({
        key,
        need,
        windResult,
        baseRealtime: realtimePayload,
        currentRealtime: workingRealtime,
        macroDrivers
      });
      audit.sourceConflictAudit[key] = decision.audit;
      if (decision.apply) {
        const sourceConflictAudit = { ...decision.audit, decision: 'applied' };
        workingRealtime = cloneRealtimeWithWindInput(
          workingRealtime,
          key,
          { ...windResult, sourceConflictAudit },
          need
        );
        audit.appliedInputs.push(key);
      } else if (decision.reviewRequired) {
        audit.reviewRequiredInputs.push(key);
      }
    } catch (err) {
      hadError = true;
      audit.sourceConflictAudit[key] = {
        input: key,
        fallbackReason: need.reason,
        decision: 'error',
        reasons: ['wind_fetch_failed'],
        error: sanitizeAuditString(err instanceof Error ? err.message : err)
      };
    }
  }

  if (audit.appliedInputs.length) audit.status = 'applied';
  else if (audit.reviewRequiredInputs.length) audit.status = 'review_required';
  else if (hadError) audit.status = 'error';
  else audit.status = 'evaluated_no_switch';

  if (audit.appliedInputs.length) {
    audit.notes.push('One or more Wind paid fallback inputs entered main score through arbitration.');
  }
  if (audit.reviewRequiredInputs.length) {
    audit.notes.push('One or more Wind candidates were kept out of automatic scoring by source/score-impact guards.');
  }
  return { realtimePayload: workingRealtime, audit };
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeBrentSourceName(source) {
  return String(source || '').trim().toLowerCase();
}

function brentCandidateSource(candidate = {}) {
  return firstString(candidate.source, candidate.sourceId, candidate.id, candidate.key, candidate.name, candidate.label, candidate.symbol);
}

function brentCandidateValue(candidate = {}) {
  return firstFinite(candidate.value, candidate.price, candidate.last, candidate.close, candidate.recommendedValue, candidate.selectedValue);
}

function brentCandidateObservedAt(candidate = {}) {
  return firstString(candidate.observedAt, candidate.asOf, candidate.updatedAt, candidate.date, candidate.timestamp);
}

function findBrentCandidate(candidates, matcher) {
  return (Array.isArray(candidates) ? candidates : []).find((candidate) => matcher(normalizeBrentSourceName(brentCandidateSource(candidate))));
}

function brentConfirmationRole(source) {
  const normalized = normalizeBrentSourceName(source);
  if (/fred|dcoilbrenteu/u.test(normalized)) return 'anchor';
  if (/yahoo|bz=f|bz%3df/u.test(normalized)) return 'futures_proxy';
  if (/tradingeconomics|brent-crude-oil/u.test(normalized)) return 'confirmation';
  return 'diagnostic';
}

function brentConfirmationLabel(source) {
  const normalized = normalizeBrentSourceName(source);
  if (/fred|dcoilbrenteu/u.test(normalized)) return 'FRED DCOILBRENTEU';
  if (/yahoo|bz=f|bz%3df/u.test(normalized)) return 'Yahoo BZ=F';
  if (/tradingeconomics|brent-crude-oil/u.test(normalized)) return 'Trading Economics Brent';
  if (/stooq/u.test(normalized)) return 'Stooq Brent diagnostic';
  if (/google/u.test(normalized)) return 'Google Finance diagnostic';
  return source || 'Brent source';
}

function normalizeBrentStatus(status, value) {
  const normalized = String(status || '').toLowerCase();
  if (['ok', 'fallback', 'missing', 'excluded'].includes(normalized)) return normalized;
  if (Number.isFinite(value)) return 'ok';
  return 'missing';
}

function buildBrentConfirmationSources(realtimePayload, selectedBrent) {
  const validation = realtimePayload?.brentValidation || {};
  const candidates = Array.isArray(validation.candidates) ? validation.candidates : [];
  const sources = candidates.map((candidate) => {
    const source = brentCandidateSource(candidate) || 'unknown';
    const value = brentCandidateValue(candidate);
    const role = brentConfirmationRole(source);
    const status = normalizeBrentStatus(candidate.status, value);
    return {
      source,
      labelZh: brentConfirmationLabel(source),
      value,
      observedAt: brentCandidateObservedAt(candidate),
      status: role === 'diagnostic' && status === 'ok' ? 'excluded' : status,
      role,
      participatesInPromotion: candidate.participatesInPromotion === true || (role !== 'diagnostic' && status === 'ok'),
      noteZh: role === 'diagnostic'
        ? '该来源仅作为诊断观察，不参与 Brent promotion。'
        : '该来源来自现有 Brent validation / confirmation 字段，仅用于公开代理价格层审计。'
    };
  });

  if (!sources.some((item) => /fred|dcoilbrenteu/iu.test(item.source)) && Number.isFinite(selectedBrent.value)) {
    sources.push({
      source: selectedBrent.source || 'fred:DCOILBRENTEU',
      labelZh: 'FRED DCOILBRENTEU',
      value: selectedBrent.value,
      observedAt: selectedBrent.observedAt,
      status: selectedBrent.status === 'missing' ? 'missing' : 'fallback',
      role: 'anchor',
      participatesInPromotion: false,
      noteZh: '未在 candidates 中找到 FRED anchor，按当前 selectedBrent / sourceDetails 作为公开现货代理 fallback 记录。'
    });
  }
  return sources;
}

function computeMaxProxyDivergencePct(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length < 2) return null;
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const baseline = Math.max(1, avg(finiteValues));
  return +(((max - min) / baseline) * 100).toFixed(3);
}

function classifyProxySpreadStatus(spotMinusFutures, divergencePct) {
  if (!Number.isFinite(spotMinusFutures) || !Number.isFinite(divergencePct)) return 'insufficient_data';
  const absSpread = Math.abs(spotMinusFutures);
  if (absSpread >= 5 || divergencePct >= 5) return 'stress';
  if (absSpread >= 2 || divergencePct >= 2) return 'watch';
  return 'normal';
}

function brentSpreadStatusZh(status) {
  return {
    normal: '公开代理价差正常',
    watch: '公开代理价差观察',
    stress: '公开代理价差压力',
    insufficient_data: '数据不足'
  }[status] || '状态待确认';
}

function buildBrentPricingLayer({
  realtimePayload,
  displayInputsBaseline,
  dailyRealtimeInput,
  ulsdData = null,
  futuresCurveData = null,
  futuresPriceCurveData = null,
  iceFuturesPriceCurveData = null,
  eiaBrentSpotProxyData = null
}) {
  const validation = realtimePayload?.brentValidation || {};
  const promotion = validation.promotion || {};
  const consensus = validation.consensus || {};
  const candidates = Array.isArray(validation.candidates) ? validation.candidates : [];
  const sourceDetails = realtimePayload?.sourceDetails?.brent || {};
  const selectedValue = firstFinite(displayInputsBaseline?.brent, realtimePayload?.values?.brent);
  const selectedSource = firstString(sourceDetails.source, realtimePayload?.sourceStatus?.brent, promotion.selectedSource, consensus.recommendedSource);
  const selectedObservedAt = firstString(sourceDetails.observedAt, sourceDetails.updatedAt, realtimePayload?.updatedAt, dailyRealtimeInput?.updatedAt);
  const selectedBrent = {
    value: selectedValue,
    source: selectedSource,
    observedAt: selectedObservedAt,
    status: Number.isFinite(selectedValue) ? (String(selectedSource || '').includes('fallback') ? 'fallback' : 'ok') : 'missing',
    noteZh: '当前主 Brent 显示值来自现有 Daily / realtime 输入；该层只做公开代理审计，不改变 values.brent。'
  };

  const fredCandidate = findBrentCandidate(candidates, (source) => /fred|dcoilbrenteu/u.test(source));
  const yahooCandidate = findBrentCandidate(candidates, (source) => /yahoo|bz=f|bz%3df/u.test(source));
  const teCandidate = findBrentCandidate(candidates, (source) => /tradingeconomics|brent-crude-oil/u.test(source));
  const fredValue = brentCandidateValue(fredCandidate || {});
  const yahooValue = brentCandidateValue(yahooCandidate || {});
  const teValue = brentCandidateValue(teCandidate || {});
  const selectedIsFred = /fred|dcoilbrenteu/u.test(normalizeBrentSourceName(selectedSource));

  const publicSpotProxy = {
    labelZh: 'Brent 公开现货代理',
    source: brentCandidateSource(fredCandidate || {}) || (selectedIsFred ? selectedSource : null),
    value: Number.isFinite(fredValue) ? fredValue : selectedIsFred ? selectedValue : null,
    observedAt: brentCandidateObservedAt(fredCandidate || {}) || (selectedIsFred ? selectedObservedAt : null),
    status: Number.isFinite(fredValue) ? 'ok' : selectedIsFred && Number.isFinite(selectedValue) ? 'fallback' : 'missing',
    limitationZh: '该字段为公开 Brent 现货代理观察，不等同于 Platts Dated Brent 或正式实物现货成交价。'
  };

  const futuresProxyValue = Number.isFinite(yahooValue) ? yahooValue : Number.isFinite(teValue) ? teValue : null;
  const futuresProxy = {
    labelZh: 'Brent 期货代理',
    source: brentCandidateSource(yahooCandidate || {}) || (Number.isFinite(teValue) ? brentCandidateSource(teCandidate || {}) : null),
    value: futuresProxyValue,
    observedAt: brentCandidateObservedAt(yahooCandidate || {}) || (Number.isFinite(teValue) ? brentCandidateObservedAt(teCandidate || {}) : null),
    status: Number.isFinite(yahooValue) ? 'ok' : Number.isFinite(teValue) ? 'fallback' : 'missing',
    limitationZh: '该字段为公开期货/市场报价代理，仅用于验证层观察。'
  };

  const confirmationSources = buildBrentConfirmationSources(realtimePayload, selectedBrent);
  const spotMinusFutures = Number.isFinite(publicSpotProxy.value) && Number.isFinite(futuresProxy.value)
    ? +(publicSpotProxy.value - futuresProxy.value).toFixed(3)
    : null;
  const selectedMinusFutures = Number.isFinite(selectedBrent.value) && Number.isFinite(futuresProxy.value)
    ? +(selectedBrent.value - futuresProxy.value).toFixed(3)
    : null;
  const maxProxyDivergencePct = firstFinite(
    validation.maxConfirmationDivergencePct,
    validation.maxProxyDivergencePct,
    consensus.maxConfirmationDivergencePct,
    computeMaxProxyDivergencePct([publicSpotProxy.value, futuresProxy.value, selectedBrent.value])
  );
  const spreadStatus = classifyProxySpreadStatus(spotMinusFutures, maxProxyDivergencePct);
  const confidenceLevel = spreadStatus === 'insufficient_data' ? 'low' : futuresProxy.status === 'ok' && publicSpotProxy.status === 'ok' ? 'medium' : 'low';
  /* M-39: derive anchorAgeHours only from existing in-memory Brent timing data. */
  const ageSecondsFallback = Number.isFinite(sourceDetails.ageSeconds)
    ? sourceDetails.ageSeconds / 3600
    : null;
  const fredAnchorCandidate = findBrentCandidate(candidates, (source) => /fred|dcoilbrenteu|fred-anchor/u.test(source)) || {};
  const fredAnchorObservedAt = brentCandidateObservedAt(fredAnchorCandidate);
  let ageFromObservedAt = null;
  if (fredAnchorObservedAt) {
    const normalizedAt = /^\d{4}-\d{2}-\d{2}$/.test(fredAnchorObservedAt)
      ? `${fredAnchorObservedAt}T00:00:00Z`
      : fredAnchorObservedAt;
    const parsedMs = Date.parse(normalizedAt);
    const nowMs = Date.parse(isoNow);
    if (Number.isFinite(parsedMs) && Number.isFinite(nowMs)) {
      ageFromObservedAt = (nowMs - parsedMs) / 3600000;
      if (ageFromObservedAt < 0) ageFromObservedAt = null;
    }
  }

  let crackSpread = null;
  let crackSpread4wChange = null;
  const ulsdPrice = Number.isFinite(ulsdData?.ulsdPrice) ? ulsdData.ulsdPrice : null;
  const ulsd4wChange = Number.isFinite(ulsdData?.ulsd4wChange) ? ulsdData.ulsd4wChange : null;

  if (ulsdPrice !== null && Number.isFinite(selectedBrent?.value)) {
    const computed = +(ulsdPrice * 42 - selectedBrent.value).toFixed(2);
    if (computed >= -30 && computed <= 120) {
      crackSpread = computed;
    }
  }

  // Approximation: ULSD 4-week change converted to barrel terms; Brent 4-week change is not available here.
  if (ulsd4wChange !== null && Number.isFinite(ulsd4wChange)) {
    crackSpread4wChange = +(ulsd4wChange * 42).toFixed(2);
  }

  const crackSpreadRegime = classifyCrackSpreadRegime(crackSpread);
  const ulsdSourceStatus = ulsdData?.sourceStatus ?? 'missing';
  const futuresCurve = normalizePreviousBrentFuturesCurve(futuresCurveData);
  const futuresPriceCurve = normalizePreviousBrentFuturesPriceCurve(futuresPriceCurveData);
  const iceFuturesPriceCurve = normalizePreviousIceBrentFuturesPriceCurve(iceFuturesPriceCurveData);
  const eiaBrentSpotProxy = normalizePreviousEiaBrentSpotProxy(eiaBrentSpotProxyData);

  return {
    contractVersion: 'v28.0I-5A',
    generatedAt: isoNow,
    mode: 'public_proxy_observation',
    summaryZh: spreadStatus === 'insufficient_data'
      ? '当前公开数据不足以判断 Brent 现货代理与期货代理之间是否存在明显背离。'
      : spreadStatus === 'normal'
        ? 'Brent 公开代理价格层显示，当前主值与公开期货/确认源之间未形成明显异常背离。'
        : 'Brent 公开代理价格层显示，部分来源之间存在观察性价差，需要继续交叉验证。',
    selectedBrent,
    publicSpotProxy,
    futuresProxy,
    eiaBrentSpotProxy,
    futuresCurve,
    futuresPriceCurve,
    iceFuturesPriceCurve,
    confirmationSources,
    ulsdPrice,
    ulsd4wChange,
    crackSpread,
    crackSpread4wChange,
    crackSpreadRegime,
    ulsdSourceStatus,
    proxySpread: {
      spotMinusFutures,
      selectedMinusFutures,
      maxProxyDivergencePct,
      status: spreadStatus,
      statusZh: brentSpreadStatusZh(spreadStatus),
      interpretationZh: spreadStatus === 'insufficient_data'
        ? '公开现货代理或期货代理数据不足，暂不足以判断。'
        : '该价差只用于公开代理价格层审计，不改变 Brent 主值或 promotion。'
    },
    promotionAudit: {
      promotionApplied: typeof promotion.applied === 'boolean' ? promotion.applied : null,
      moveStatus: firstString(promotion.moveStatus, validation.moveStatus),
      /* M-39: keep Worker promotion.reason priority, then fall back to realtime consensus.reason. */
      promotionReason: firstString(promotion.reason, validation.reason, consensus.reason),
      selectedSource,
      anchorSource: publicSpotProxy.source,
      anchorAgeHours: firstFinite(
        sourceDetails.ageHours,
        sourceDetails.observedAgeHours,
        validation.anchorAgeHours,
        ageSecondsFallback,
        Number.isFinite(ageFromObservedAt) ? Number(ageFromObservedAt.toFixed(2)) : null
      )
    },
    dataGaps: [
      eiaBrentSpotProxy.sourceStatus === 'live'
        ? 'EIA Europe Brent Spot Price FOB public proxy 已接入；Platts Dated Brent / 正式 Dated Brent 仍未接入。'
        : 'Platts Dated Brent / 正式 Dated Brent 未接入。',
      iceFuturesPriceCurve.curveStatus === 'live_delayed_priced'
        ? 'ICE public delayed Brent futures price curve 已接入；official settlement curve / Platts 期限结构仍待接入。'
        : futuresPriceCurve.curveStatus === 'live_proxy_priced'
        ? 'Yahoo Brent 月度期货 priced proxy 已接入；正式 ICE settlement curve / Platts 期限结构仍待接入。'
        : futuresCurve.curveStatus === 'live_structure_only'
          ? 'ICE Brent 合约月份/到期结构已接入；priced proxy / 可验证结算价期限曲线仍待接入。'
          : 'Brent 期限结构仍待接入。',
      '实物库存、区域价差与正式实物成交证据仍待接入。'
    ],
    limitations: [
      '当前仅为公开代理价格观察，不等同于付费 Dated Brent 或实物成交数据。',
      'EIA Europe Brent Spot Price FOB 是公开现货代理，不是 Platts Dated Brent 或正式 Dated Brent。',
      'ICE futuresCurve 当前是 structure-only，不显示或推断缺失的结算价期限曲线。',
      'ICE public delayed last-price curve 不是 official settlement curve。',
      'Yahoo futuresPriceCurve 是公开月度期货报价代理，不是官方 settlement curve。',
      '该层不改变 Brent 主值、评分、仓位或执行灯。'
    ],
    confidence: {
      level: confidenceLevel,
      score: confidenceLevel === 'medium' ? 60 : 35,
      reasonZh: confidenceLevel === 'medium'
        ? '公开现货代理与期货代理均可用，但该层仍只作为审计观察。'
        : '公开代理来源不足或只能 fallback，因此维持低置信。'
    },
    boundaries: {
      displayOnly: true,
      auditOnly: true,
      affectsValuesBrent: false,
      affectsBrentPromotion: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}

function confidenceLevelFromScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'low';
  if (value >= 75) return 'high';
  if (value >= 45) return 'medium';
  return 'low';
}

function aiConfidence(value) {
  return DAILY_AI_CONFIDENCE_LEVELS.has(value) ? value : 'low';
}

const DAILY_AI_CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);

function aiFact(key, labelZh, statementZh, sourceFields, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    sourceFields: Array.isArray(sourceFields) ? sourceFields : [],
    confidence: aiConfidence(confidence)
  };
}

function aiInference(key, labelZh, statementZh, basedOn, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    basedOn: Array.isArray(basedOn) ? basedOn : [],
    confidence: aiConfidence(confidence)
  };
}

function aiJudgment(key, labelZh, statementZh, modelSource, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    modelSource,
    confidence: aiConfidence(confidence)
  };
}

function aiScenario(key, labelZh, statementZh, triggerConditions, invalidationConditions, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    triggerConditions: Array.isArray(triggerConditions) ? triggerConditions : [],
    invalidationConditions: Array.isArray(invalidationConditions) ? invalidationConditions : [],
    confidence: aiConfidence(confidence)
  };
}

function aiEvidenceLink(layer, field, noteZh) {
  return { layer, field, noteZh };
}

function buildAiInterpretationLayer(data) {
  const dailyBrief = data?.dailyBrief && typeof data.dailyBrief === 'object' ? data.dailyBrief : null;
  const divergenceLayer = data?.divergenceLayer && typeof data.divergenceLayer === 'object' ? data.divergenceLayer : null;
  const brentPricingLayer = data?.brentPricingLayer && typeof data.brentPricingLayer === 'object' ? data.brentPricingLayer : null;
  const macroDrivers = data?.macroDrivers && typeof data.macroDrivers === 'object' ? data.macroDrivers : {};
  const consumer = macroDrivers.consumer && typeof macroDrivers.consumer === 'object' ? macroDrivers.consumer : null;
  const decisionModel = data?.decisionModel && typeof data.decisionModel === 'object' ? data.decisionModel : null;
  const confidenceScore = Number.isFinite(data?.confidenceScore) ? clamp(data.confidenceScore) : 0;
  const confidenceLevel = confidenceLevelFromScore(confidenceScore);
  const primaryDivergence = divergenceLayer?.primaryDivergence || null;
  const brentSpread = brentPricingLayer?.proxySpread || null;
  const consumerCheck = Array.isArray(divergenceLayer?.checks)
    ? divergenceLayer.checks.find((check) => check?.key === 'consumer_vs_asset_pricing')
    : null;

  const facts = [
    dailyBrief
      ? aiFact('daily_brief_generated', 'Daily Brief 已生成', '当前 Daily Brief 已生成今日主判断，并以解释层形式展示。', ['dailyBrief.contractVersion', 'dailyBrief.oneLineConclusion'], 'high')
      : null,
    divergenceLayer
      ? aiFact('divergence_layer_audit_only', '背离层为审计层', 'divergenceLayer 当前为审计层和展示层，不参与评分或决策。', ['divergenceLayer.boundaries'], 'high')
      : null,
    brentPricingLayer
      ? aiFact('brent_proxy_observation_mode', 'Brent 公开代理观察', 'Brent 公开代理价格层处于公开代理观察模式，不等同于正式实物成交价。', ['brentPricingLayer.mode', 'brentPricingLayer.limitations'], 'high')
      : null,
    consumer
      ? aiFact('consumer_monthly_source', '消费者信心慢变量', '消费者信心数据来自 FRED:UMCSENT，属于 Daily 月频慢变量。', ['macroDrivers.consumer.source', 'macroDrivers.consumer.notes'], 'high')
      : null,
    aiFact('interpretation_layer_rule_based', '规则化解释层', '本层为规则化结构解释，不调用外部 AI API。', ['aiInterpretationLayer.mode', 'aiInterpretationLayer.boundaries'], 'high')
  ].filter(Boolean);

  const consumerChange = Number(consumer?.threeMonthChange);
  const dataInferences = [
    primaryDivergence
      ? aiInference(
        'primary_divergence_observation',
        '主要背离观察',
        `当前主背离来自 divergenceLayer.primaryDivergence：${primaryDivergence.labelZh || '暂不足以判断'}。该结论仍是观察性解释。`,
        ['divergenceLayer.primaryDivergence'],
        'medium'
      )
      : null,
    brentSpread
      ? aiInference(
        'brent_proxy_spread_observation',
        'Brent 代理价差观察',
        ['watch', 'stress'].includes(brentSpread.status)
          ? '公开 Brent 代理价格之间显示观察性价差，需要结合验证源继续跟踪。'
          : '公开 Brent 代理价格之间暂未显示需要升级处理的价差压力。',
        ['brentPricingLayer.proxySpread'],
        brentSpread.status === 'stress' ? 'medium' : 'low'
      )
      : null,
    Number.isFinite(consumerChange)
      ? aiInference(
        'consumer_margin_observation',
        '消费者体感边际观察',
        consumerChange < 0
          ? 'UMCSENT 三个月变化为负，消费者体感可能边际走弱。'
          : 'UMCSENT 三个月变化未转负，消费者体感暂未显示明确边际走弱。',
        ['macroDrivers.consumer.threeMonthChange'],
        'medium'
      )
      : null,
    consumerCheck
      ? aiInference(
        'consumer_asset_divergence_check',
        '消费者与资产背离检查',
        'consumer_vs_asset_pricing 只说明消费者体感与风险资产定价之间是否存在观察性错配。',
        ['divergenceLayer.checks.consumer_vs_asset_pricing'],
        'medium'
      )
      : null
  ].filter(Boolean);

  const modelJudgments = [
    dailyBrief
      ? aiJudgment('daily_brief_model_context', '主判断上下文', 'Daily Brief 提供今日主判断压缩，但不生成交易建议。', 'dailyBrief', 'medium')
      : null,
    aiJudgment('interpretation_layers_do_not_execute', '解释层不进入执行系统', '当前新增解释层均未进入评分、仓位或执行灯系统。', 'combined', 'high'),
    decisionModel
      ? aiJudgment('decision_context_separated', '决策上下文隔离', 'decisionModel 可作为解释证据来源，但 AI 解释层不能改写策略状态或仓位建议。', 'decisionModel', 'high')
      : null,
    divergenceLayer && brentPricingLayer
      ? aiJudgment('cross_layer_observation_priority', '跨层观察优先级', '若数据健康正常且多个背离层同向提示，可提高人工观察优先级，但不能自动改变仓位。', 'combined', 'medium')
      : null
  ].filter(Boolean);

  const scenarioHypotheses = [
    aiScenario(
      'energy_rates_asset_repricing_watch',
      '能源—利率—资产重新定价观察',
      '如果 Brent 公开代理价差扩大，同时 US10Y 上行、VIX 或 HY OAS 扩张，则能源—利率—资产重新定价链条需要升级观察。',
      ['brentPricingLayer.proxySpread.status 进入 watch 或 stress', 'displayInputsBaseline.us10y 上行', 'displayInputsBaseline.vix 或 displayInputsBaseline.hyOas 扩张'],
      ['Brent 公开代理价差收敛', 'US10Y 回落', 'VIX 与 HY OAS 未扩张'],
      'medium'
    ),
    aiScenario(
      'consumer_asset_divergence_deescalation',
      '消费者体感与风险资产背离降级条件',
      '如果消费者信心修复、长端利率回落、信用利差未扩张，则消费者体感与风险资产背离可降级观察。',
      ['macroDrivers.consumer.threeMonthChange 改善', 'displayInputsBaseline.us10y 回落', 'displayInputsBaseline.hyOas 未扩张'],
      ['UMCSENT 继续走弱', 'HY OAS 或 VIX 扩张', '风险资产定价继续与体感数据背离'],
      'medium'
    ),
    aiScenario(
      'data_health_guardrail',
      '数据健康保护条件',
      '如果数据健康下降或关键字段缺失增加，AI 解释层应降低置信度，并以 Daily Brief、背离层和数据健康状态为主。',
      ['dailyRealtimeInput.healthScore 下降', 'realtime criticalMissing 增加', '数据源进入 fallback 或 cache-only'],
      ['Worker Health 正常', 'realtime-data 处于 fresh 或 aging', '关键缺失项回落'],
      'high'
    )
  ];

  const dataGaps = [
    'Platts Dated Brent / 正式 Dated Brent 未接入。',
    'Brent term structure 尚未接入。',
    'shipping / freight stress 已进入 macroDrivers.shippingFreight 审计观察层。',
    '世界秩序外部源质量需单独查看 World Order 模块。'
  ];

  const invalidationSignals = Array.isArray(dailyBrief?.invalidationSignals) && dailyBrief.invalidationSignals.length
    ? dailyBrief.invalidationSignals.slice(0, 5)
    : [
      'Brent 公开代理价差收敛且验证层不再提示压力。',
      '美国10年期收益率回落。',
      'VIX / HY OAS 未扩张且综合风险分数下降。',
      '消费者信心边际修复。',
      '数据健康恢复且背离层不再获得交叉验证。'
    ];

  const evidenceLinks = [
    dailyBrief ? aiEvidenceLink('dailyBrief', 'oneLineConclusion', '今日主判断来自 Daily Brief。') : null,
    divergenceLayer ? aiEvidenceLink('divergenceLayer', 'primaryDivergence', '主要背离来自 divergenceLayer。') : null,
    brentPricingLayer ? aiEvidenceLink('brentPricingLayer', 'proxySpread', 'Brent 代理价差来自 brentPricingLayer。') : null,
    consumer ? aiEvidenceLink('macroDrivers.consumer', 'threeMonthChange', '消费者体感观察来自 FRED UMCSENT 月频数据。') : null,
    decisionModel ? aiEvidenceLink('decisionModel', 'strategyState', '策略状态仅作为上下文证据，不被 AI 解释层改写。') : null
  ].filter(Boolean);

  const missingCoreLayers = [dailyBrief, divergenceLayer, brentPricingLayer].filter((item) => !item).length;
  const finalConfidenceScore = clamp(confidenceScore - missingCoreLayers * 15);
  const finalConfidenceLevel = missingCoreLayers > 0 ? 'low' : confidenceLevel;

  return {
    contractVersion: 'v28.0J-0',
    generatedAt: isoNow,
    mode: 'rule_based_structured_interpretation',
    summaryZh: missingCoreLayers > 0
      ? '当前数据不足以形成高置信解释，需以 Daily Brief、背离层和数据健康状态为主。本层不调用外部 AI。'
      : '当前 AI 解释层为规则化结构解释，不调用外部 AI。系统将事实、数据推断、模型判断和情景假设分离展示，避免把观察信号误写成确定性结论。',
    facts,
    dataInferences,
    modelJudgments,
    scenarioHypotheses,
    dataGaps,
    invalidationSignals,
    evidenceLinks,
    confidence: {
      level: finalConfidenceLevel,
      score: finalConfidenceScore,
      reasonZh: missingCoreLayers > 0
        ? '部分核心解释层缺失，因此 AI 解释层仅能低置信观察。'
        : '基于 Daily Brief、背离层、Brent 代理审计层、消费者慢变量和数据健康状态生成。'
    },
    boundaries: {
      displayOnly: true,
      interpretationOnly: true,
      generatedByExternalAi: false,
      usesExternalAiApi: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCurrentExternalAiFreshness(freshness, nowMs) {
  if (!isRecord(freshness) || freshness.isStale !== false) return false;
  const maxAgeHours = Number(freshness.maxAgeHours);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) return false;

  const timestamps = [freshness.artifactGeneratedAt, freshness.sourceDataUpdatedAt]
    .filter((value) => typeof value === 'string' && value.trim() !== '');
  if (timestamps.length === 0) return false;

  return timestamps.every((timestamp) => {
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return false;
    const ageHours = (nowMs - parsed) / (60 * 60 * 1000);
    return ageHours >= -(5 / 60) && ageHours <= maxAgeHours;
  });
}

export function isPreservableExternalAiLayer(layer, nowMs = Date.now()) {
  const qualityReview = isRecord(layer?.qualityReview) ? layer.qualityReview : null;
  const boundaries = isRecord(layer?.boundaries) ? layer.boundaries : null;
  return isRecord(layer)
    && ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS.has(layer.schemaVersion)
    && layer.status === 'valid'
    && typeof layer.displayEnabled === 'boolean'
    && isRecord(qualityReview)
    && qualityReview.promotionEligible === false
    && isCurrentExternalAiFreshness(layer.freshness, nowMs)
    && isRecord(boundaries)
    && boundaries.displayOnly === true
    && boundaries.externalAiGenerated === true
    && boundaries.usesExternalAiApi === true
    && boundaries.affectsScoring === false
    && boundaries.affectsDecisionModel === false
    && boundaries.affectsExecutionLock === false
    && boundaries.affectsPositionGuidance === false
    && boundaries.notInvestmentAdvice === true
    && boundaries.productionWriteApproved === false
    && typeof boundaries.frontendDisplayApproved === 'boolean';
}

export function buildDisabledExternalAiFallbackLayer({ generatedAt = isoNow, reason = 'missing_or_invalid_production_layer' } = {}) {
  const reasonZh = reason === 'missing_production_layer'
    ? '未找到可保留的生产外部 AI 层，本轮回退到规则化解释层。'
    : '既有外部 AI 层不符合当前生产契约，本轮回退到规则化解释层。';
  return {
    contractVersion: EXTERNAL_AI_SCAFFOLD_CONTRACT_VERSION,
    generatedAt,
    enabled: false,
    status: 'disabled',
    displayEnabled: false,
    provider: 'none',
    model: null,
    mode: EXTERNAL_AI_SCAFFOLD_MODE,
    summaryZh: '外部 AI 解读层本轮不可用，页面使用规则化解释层作为回退。',
    inputDigest: {
      inputVersion: `${RELEASE_VERSION}-daily-external-ai-fallback`,
      siteStructuredDataOnly: true,
      layersAvailable: EXTERNAL_AI_SCAFFOLD_LAYERS_AVAILABLE,
      usesPrivateUserData: false,
      usesSecrets: false,
      usesExternalMarketData: false,
      noteZh: 'Daily 普通刷新未调用外部 AI API，也未生成新的外部 AI 文本。'
    },
    output: null,
    audit: {
      outputValidated: false,
      validator: 'check-external-ai-output',
      auditStatus: 'not_applicable',
      auditFlags: ['daily_external_ai_preservation_fallback'],
      bannedCopyPassed: null,
      sourceAttributionPresent: null,
      boundariesValid: true
    },
    fallback: {
      used: true,
      fallbackLayer: 'aiInterpretationLayer',
      reasonZh
    },
    confidence: {
      level: 'low',
      score: 0,
      reasonZh: '未展示外部 AI 输出，仅保留规则化解释层。'
    },
    dataGaps: ['externalAiInterpretationLayer production layer missing or incompatible'],
    limitations: ['External AI Production Refresh remains the only approved automatic provider write path.'],
    boundaries: {
      displayOnly: true,
      diagnosticOnly: true,
      externalAiGenerated: false,
      usesExternalAiApi: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      notInvestmentAdvice: true,
      frontendDisplayApproved: false
    }
  };
}

export function preserveExternalAiInterpretationLayer(next, previous = prevData) {
  const layer = previous?.externalAiInterpretationLayer;
  if (isPreservableExternalAiLayer(layer)) {
    next.externalAiInterpretationLayer = structuredClone(layer);
    return { preserved: true, fallbackUsed: false, reason: null };
  }

  const reason = layer === undefined || layer === null
    ? 'missing_production_layer'
    : 'invalid_production_layer';
  next.externalAiInterpretationLayer = buildDisabledExternalAiFallbackLayer({ reason });
  const warning = `external-ai-fallback:${reason}`;
  if (isRecord(next.recovery)) {
    const notes = Array.isArray(next.recovery.notes) ? next.recovery.notes : [];
    next.recovery.notes = [...notes, warning];
  }
  console.warn(`[external-ai-preservation] ${warning}; using aiInterpretationLayer fallback until External AI Production Refresh restores a valid layer.`);
  return { preserved: false, fallbackUsed: true, reason };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringifyFetchError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.replace(/\s+/g, ' ').slice(0, 160);
}

async function fetchWithTimeout(url, timeoutMs = MACRO_FETCH_TIMEOUT_MS, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const userAgent = options.userAgent === undefined ? MACRO_USER_AGENT : options.userAgent;
    const headers = { ...(options.headers || {}) };
    if (userAgent) headers['User-Agent'] = userAgent;
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`timeout ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function retryFetch(url, label, timeoutMs = MACRO_FETCH_TIMEOUT_MS, options = {}) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= MACRO_FETCH_RETRIES) {
    try {
      return await fetchWithTimeout(url, timeoutMs, options);
    } catch (e) {
      lastErr = e;
      if (attempt === MACRO_FETCH_RETRIES) break;
      await sleep(MACRO_FETCH_RETRY_DELAY_MS * (attempt + 1));
      attempt += 1;
    }
  }
  throw new Error(`${label} failed: ${stringifyFetchError(lastErr)}`);
}

function parseFredCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!date || raw === undefined || raw === '.' || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

function parseFredApiObservations(text) {
  const json = JSON.parse(text);
  const observations = json?.observations;
  if (!Array.isArray(observations)) {
    throw new Error('FRED API returned invalid observations payload');
  }
  const out = [];
  for (const item of observations) {
    const date = item?.date;
    const raw = item?.value;
    if (!date || raw === undefined || raw === '.' || String(raw).trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

function cosdIso(daysBack) {
  return new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);
}
function dateOnlyIso(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/u);
  if (!match) return null;
  const ms = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isFinite(ms) ? match[1] : null;
}

function dateOnlyToIso(value) {
  const dateOnly = dateOnlyIso(value);
  return dateOnly ? `${dateOnly}T00:00:00Z` : null;
}
function dateOnlyInTimeZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || null;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function berlinDateOnly(value) {
  return dateOnlyInTimeZone(value, 'Europe/Berlin');
}

function berlinDateAgeDays(value) {
  const dateOnly = dateOnlyIso(value);
  const today = berlinDateOnly(isoNow);
  if (!dateOnly || !today) return null;
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const obsMs = Date.parse(`${dateOnly}T00:00:00Z`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(obsMs)) return null;
  return Math.floor((todayMs - obsMs) / (24 * 3600 * 1000));
}

function isFreshBerlinDateOnly(value, maxAgeDays) {
  const ageDays = berlinDateAgeDays(value);
  return Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= maxAgeDays;
}

function dateOnlyAgeDays(value) {
  const dateOnly = dateOnlyIso(value);
  if (!dateOnly) return null;
  const todayMs = Date.parse(`${isoNow.slice(0, 10)}T00:00:00Z`);
  const obsMs = Date.parse(`${dateOnly}T00:00:00Z`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(obsMs)) return null;
  const ageDays = Math.floor((todayMs - obsMs) / (24 * 3600 * 1000));
  return ageDays >= 0 ? ageDays : null;
}

function isFreshDateOnly(value, maxAgeDays) {
  const ageDays = dateOnlyAgeDays(value);
  return Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= maxAgeDays;
}

function officialJsonFetchOptions(referer) {
  return {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      Referer: referer
    }
  };
}

function buildFredApiUrl(seriesId, observationStart) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: FRED_API_KEY,
    file_type: 'json',
    observation_start: observationStart,
    sort_order: 'asc'
  });
  return `${FRED_API_BASE}?${params.toString()}`;
}

// FRED API serialization gate. The daily pipeline fans ~55 FRED series across
// concurrent macro builders; firing them simultaneously trips FRED's API rate
// limit (observed: 54x HTTP 429 in a single run, all within ~0.7s). Serialize
// FRED API requests one-at-a-time with a jittered gap — mirrors the realtime
// worker's sequential FRED policy — so a burst never forms. This only changes
// FRED API request *timing/concurrency*; parsing, fallback, and values are
// unchanged. A failing task never breaks the chain (spacer runs on both paths).
let fredApiQueue = Promise.resolve();
function runFredApiSerialized(task) {
  const run = fredApiQueue.then(task);
  const spacer = () => sleep(150 + Math.floor(Math.random() * 151));
  fredApiQueue = run.then(spacer, spacer);
  return run;
}

async function fetchFredSeries(seriesId, daysBack = 90) {
  const observationStart = cosdIso(daysBack);

  if (FRED_API_KEY) {
    try {
      // Serialized + retried (retryFetch: 3 attempts, 800/1600ms backoff) so a
      // residual 429/transient error is ridden out instead of dropping straight
      // to the (now-defunct) CSV fallback.
      const apiText = await runFredApiSerialized(
        () => retryFetch(buildFredApiUrl(seriesId, observationStart), `fred-api:${seriesId}`),
      );
      const apiRows = parseFredApiObservations(apiText);
      if (apiRows.length < 2) throw new Error(`fred:${seriesId} API insufficient rows`);
      return apiRows;
    } catch (err) {
      console.warn(`[fred-api-fallback] fred:${seriesId}: ${stringifyFetchError(err)}`);
    }
  }

  const url = `${FRED_BASE}?cosd=${observationStart}&id=${seriesId}`;
  const text = await retryFetch(url, `fred:${seriesId}`);
  const rows = parseFredCsv(text);
  if (rows.length < 2) throw new Error(`fred:${seriesId} insufficient rows`);
  return rows;
}

function parseNyFedRateRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const type = typeof record.type === 'string' ? record.type.trim().toUpperCase() : '';
  const percentRate = Number(record.percentRate);
  const effectiveDate = typeof record.effectiveDate === 'string' ? record.effectiveDate.trim() : '';
  const volumeInBillions = Number(record.volumeInBillions);
  if (!type || !Number.isFinite(percentRate) || percentRate < 0 || percentRate > 20) return null;
  if (!effectiveDate || !Number.isFinite(Date.parse(`${effectiveDate}T00:00:00Z`))) return null;
  return {
    type,
    percentRate: +percentRate.toFixed(4),
    effectiveDate,
    volumeInBillions: Number.isFinite(volumeInBillions) ? volumeInBillions : null
  };
}

async function fetchNyFedSecuredRatesLatest() {
  const text = await retryFetch(
    NY_FED_SECURED_RATES_LATEST_URL,
    'nyfed:secured-rates-latest',
    NY_FED_SECURED_RATES_TIMEOUT_MS,
    {
      userAgent: 'GFRRBot/1.0',
      headers: { Accept: 'application/json' }
    }
  );
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(`nyfed:secured-rates-latest invalid JSON: ${stringifyFetchError(err)}`);
  }
  const records = Array.isArray(payload?.refRates) ? payload.refRates : [];
  const out = {};
  for (const record of records) {
    const parsed = parseNyFedRateRecord(record);
    if (parsed) out[parsed.type] = parsed;
  }
  if (!out.BGCR && !out.TGCR && !out.SOFR) {
    throw new Error('nyfed:secured-rates-latest missing BGCR/TGCR/SOFR records');
  }
  return out;
}

async function fetchJsonText(url, label, timeoutMs = MACRO_FETCH_TIMEOUT_MS, options = {}) {
  const text = await retryFetch(url, label, timeoutMs, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label} invalid JSON: ${stringifyFetchError(err)}`);
  }
}

function parseIceCdxIndexRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const clearingDate = typeof record.clearingDate === 'string' ? record.clearingDate.trim() : '';
  const instrumentName = typeof record.instrumentName === 'string' ? record.instrumentName.trim() : '';
  const eodPrice = Number(record.eodPrice);
  if (!clearingDate || !Number.isFinite(Date.parse(`${clearingDate}T00:00:00Z`))) return null;
  if (!instrumentName || !Number.isFinite(eodPrice) || eodPrice <= 0) return null;
  return {
    clearingDate,
    instrumentName,
    eodPrice: +eodPrice.toFixed(4)
  };
}

function parseCdxNaFiveYearInstrument(instrumentName, family) {
  const match = String(instrumentName || '').match(/^CDX-NA(HY|IG)S(\d+)V(\d+)-5Y$/);
  if (!match || match[1] !== family) return null;
  return {
    family,
    series: Number(match[2]),
    version: Number(match[3])
  };
}

function pickLatestCdxNaFiveYear(records, family) {
  const candidates = records
    .map(parseIceCdxIndexRecord)
    .filter(Boolean)
    .map((record) => ({ record, meta: parseCdxNaFiveYearInstrument(record.instrumentName, family) }))
    .filter((item) => item.meta);
  candidates.sort((a, b) => {
    const dateCompare = Date.parse(`${b.record.clearingDate}T00:00:00Z`) - Date.parse(`${a.record.clearingDate}T00:00:00Z`);
    if (dateCompare !== 0) return dateCompare;
    if (b.meta.series !== a.meta.series) return b.meta.series - a.meta.series;
    return b.meta.version - a.meta.version;
  });
  const picked = candidates[0];
  if (!picked) return null;
  return {
    price: picked.record.eodPrice,
    instrument: picked.record.instrumentName,
    clearingDate: picked.record.clearingDate,
    updatedAt: `${picked.record.clearingDate}T00:00:00.000Z`,
    sourceUrl: ICE_CDX_INDEX_SETTLEMENT_PAGE_URL
  };
}

async function fetchIceCdxIndexSettlements() {
  const rows = await fetchJsonText(
    ICE_CDX_INDEX_SETTLEMENT_URL,
    'ice:cdx-index-settlements',
    ICE_CDX_FETCH_TIMEOUT_MS,
    {
      userAgent: 'Mozilla/5.0 GFRRBot/1.0',
      headers: {
        Referer: ICE_CDX_INDEX_SETTLEMENT_PAGE_URL
      }
    }
  );
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('ice:cdx-index-settlements empty payload');
  const hy = pickLatestCdxNaFiveYear(rows, 'HY');
  const ig = pickLatestCdxNaFiveYear(rows, 'IG');
  if (!hy && !ig) throw new Error('ice:cdx-index-settlements missing CDX NA HY/IG 5Y records');
  return { hy, ig };
}

function parseDateToIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/\//gu, '-');
  const timestamp = Date.parse(`${normalized}T00:00:00Z`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function extractHtmlRows(html) {
  return [...String(html || '').matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/giu)].map((match) => match[0]);
}

function extractHtmlCells(rowHtml) {
  return [...String(rowHtml || '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu)]
    .map((match) => htmlToPlainText(match[1]))
    .filter(Boolean);
}

function parseLooseNumber(value) {
  const cleaned = String(value ?? '').replace(/,/gu, '').replace(/%/gu, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === 'N/D') return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parsePercentRatio(value) {
  const number = parseLooseNumber(value);
  return Number.isFinite(number) ? +(number / 100).toFixed(4) : null;
}

function resolveAbsoluteUrl(href, baseUrl) {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function timestampMsToIso(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function extractJsonValueAfterKey(text, key) {
  const source = String(text || '');
  const keyNeedle = `"${key}":`;
  const keyIndex = source.indexOf(keyNeedle);
  if (keyIndex < 0) return null;
  const start = source.slice(keyIndex + keyNeedle.length).search(/[\[{]/u);
  if (start < 0) return null;
  const valueStart = keyIndex + keyNeedle.length + start;
  const open = source[valueStart];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = valueStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(valueStart, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function classifyFreightIndexRegime(value, dailyChangePct, highThreshold, watchThreshold) {
  if (!Number.isFinite(value) && !Number.isFinite(dailyChangePct)) return '未知';
  if ((Number.isFinite(value) && value >= highThreshold)
      || (Number.isFinite(dailyChangePct) && dailyChangePct >= 3)) {
    return '高压';
  }
  if ((Number.isFinite(value) && value >= watchThreshold)
      || (Number.isFinite(dailyChangePct) && dailyChangePct >= 1)) {
    return '观察';
  }
  if (Number.isFinite(dailyChangePct) && dailyChangePct <= -3) return '快速回落';
  return '正常';
}

function classifyCompositeFreightRegime(...regimes) {
  if (regimes.includes('高压')) return '高压';
  if (regimes.includes('观察')) return '观察';
  if (regimes.includes('快速回落')) return '快速回落';
  if (regimes.some((item) => item && item !== '未知')) return '正常';
  return '未知';
}

async function fetchStockqIndex(symbol, label) {
  const url = `${STOCKQ_INDEX_BASE}/${symbol}.php`;
  const html = await retryFetch(url, `stockq:${symbol}`, STOCKQ_FETCH_TIMEOUT_MS, {
    userAgent: 'Mozilla/5.0 GFRRBot/1.0'
  });
  return {
    symbol,
    label,
    ...parseStockqFreight(html, symbol),
    url
  };
}

function parseIceBrentFuturesContracts(html) {
  const contracts = extractJsonValueAfterKey(html, 'contracts');
  if (!Array.isArray(contracts)) return [];
  return contracts
    .map((contract) => ({
      contract: typeof contract?.description === 'string' ? contract.description.trim() : null,
      lastTrade: timestampMsToIso(contract?.lastTrade),
      finalSettlement: timestampMsToIso(contract?.finalSettlement)
    }))
    .filter((contract) => contract.contract && contract.lastTrade)
    .sort((a, b) => Date.parse(a.lastTrade) - Date.parse(b.lastTrade))
    .slice(0, 12);
}

function parseIceBrentLastTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/\s+GMT$/u, ' UTC');
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function parseIceBrentContractDataRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const contract = typeof record.marketStrip === 'string' ? record.marketStrip.trim() : '';
  const marketId = Number(record.marketId);
  const price = Number(record.lastPrice);
  const volume = Number(record.volume);
  const changePct = Number(record.change);
  const updatedAt = parseIceBrentLastTime(record.lastTime);
  if (!contract || !Number.isFinite(marketId) || !Number.isFinite(price) || price <= 0) return null;
  return {
    marketId: Math.round(marketId),
    contract,
    price: +price.toFixed(2),
    volume: Number.isFinite(volume) ? Math.round(volume) : null,
    updatedAt,
    changePct: Number.isFinite(changePct) ? +(changePct / 100).toFixed(4) : null
  };
}

function buildMissingIceBrentFuturesPriceCurve() {
  return {
    source: 'ICE:Brent-Crude-Futures-public-contract-data',
    sourceUrl: ICE_BRENT_FUTURES_DATA_URL,
    curveStatus: 'missing',
    updatedAt: null,
    frontPrice: null,
    backPrice: null,
    frontMinusBack: null,
    slopeRegime: '未知',
    contracts: [],
    limitationZh: 'ICE public contract-data delayed last price 不可用；不得把缺失数据渲染为官方 settlement curve 或 Platts Dated Brent。'
  };
}

function normalizePreviousIceBrentFuturesPriceCurve(prevCurve) {
  if (!prevCurve || typeof prevCurve !== 'object') return buildMissingIceBrentFuturesPriceCurve();
  const contracts = Array.isArray(prevCurve.contracts)
    ? prevCurve.contracts
        .map((contract) => ({
          marketId: Number.isFinite(contract?.marketId) ? Math.round(contract.marketId) : null,
          contract: typeof contract?.contract === 'string' ? contract.contract : null,
          price: Number.isFinite(contract?.price) ? contract.price : null,
          volume: Number.isFinite(contract?.volume) ? Math.round(contract.volume) : null,
          updatedAt: typeof contract?.updatedAt === 'string' ? contract.updatedAt : null,
          changePct: Number.isFinite(contract?.changePct) ? contract.changePct : null
        }))
        .filter((contract) => contract.contract && contract.marketId !== null)
    : [];
  return {
    source: typeof prevCurve.source === 'string' ? prevCurve.source : 'ICE:Brent-Crude-Futures-public-contract-data',
    sourceUrl: typeof prevCurve.sourceUrl === 'string' ? prevCurve.sourceUrl : ICE_BRENT_FUTURES_DATA_URL,
    curveStatus: ['live_delayed_priced', 'fallback_delayed_priced', 'missing'].includes(prevCurve.curveStatus)
      ? prevCurve.curveStatus
      : (contracts.length ? 'fallback_delayed_priced' : 'missing'),
    updatedAt: typeof prevCurve.updatedAt === 'string' ? prevCurve.updatedAt : null,
    frontPrice: Number.isFinite(prevCurve.frontPrice) ? prevCurve.frontPrice : null,
    backPrice: Number.isFinite(prevCurve.backPrice) ? prevCurve.backPrice : null,
    frontMinusBack: Number.isFinite(prevCurve.frontMinusBack) ? prevCurve.frontMinusBack : null,
    slopeRegime: typeof prevCurve.slopeRegime === 'string' ? prevCurve.slopeRegime : '未知',
    contracts,
    limitationZh: typeof prevCurve.limitationZh === 'string'
      ? prevCurve.limitationZh
      : 'ICE public contract-data lastPrice 是 delayed/last quote，不是官方 settlement curve 或 Platts Dated Brent。'
  };
}

async function resolveIceBrentFuturesPriceCurve(prevBrentPricingLayer) {
  const fallback = normalizePreviousIceBrentFuturesPriceCurve(prevBrentPricingLayer?.iceFuturesPriceCurve);
  try {
    const rows = await fetchJsonText(
      ICE_BRENT_CONTRACT_DATA_API_URL,
      'ice:brent-public-contract-data',
      ICE_BRENT_FETCH_TIMEOUT_MS,
      {
        userAgent: 'Mozilla/5.0 GFRRBot/1.0',
        headers: {
          Referer: ICE_BRENT_FUTURES_DATA_URL
        }
      }
    );
    if (!Array.isArray(rows) || rows.length < 2) throw new Error('ice:brent-public-contract-data insufficient contracts');
    const contracts = rows
      .map(parseIceBrentContractDataRecord)
      .filter(Boolean)
      .slice(0, 12);
    if (contracts.length < 2) throw new Error('ice:brent-public-contract-data missing priced contracts');
    const front = contracts[0];
    const back = contracts[contracts.length - 1];
    const frontMinusBack = Number.isFinite(front.price) && Number.isFinite(back.price)
      ? +(front.price - back.price).toFixed(3)
      : null;
    return {
      source: 'ICE:Brent-Crude-Futures-public-contract-data',
      sourceUrl: ICE_BRENT_FUTURES_DATA_URL,
      curveStatus: 'live_delayed_priced',
      updatedAt: latestIsoDate(...contracts.map((contract) => contract.updatedAt)),
      frontPrice: Number.isFinite(front.price) ? front.price : null,
      backPrice: Number.isFinite(back.price) ? back.price : null,
      frontMinusBack,
      slopeRegime: classifyBrentFuturesSlope(frontMinusBack),
      contracts,
      limitationZh: 'ICE public contract-data lastPrice 是 delayed/last quote；不是 official settlement curve、Platts Dated Brent 或正式实物现货。'
    };
  } catch (_err) {
    return fallback;
  }
}

function buildMissingEiaBrentSpotProxy() {
  return {
    source: EIA_BRENT_SPOT_SOURCE,
    sourceUrl: EIA_BRENT_SPOT_HTML_URL,
    price: null,
    dailyChange: null,
    updatedAt: null,
    sourceStatus: 'missing',
    limitationZh: 'EIA Europe Brent Spot Price FOB 公开现货代理不可用；不得把缺失数据渲染为 0.00，也不得写成 Platts Dated Brent。'
  };
}

function normalizePreviousEiaBrentSpotProxy(prevProxy) {
  if (!prevProxy || typeof prevProxy !== 'object') return buildMissingEiaBrentSpotProxy();
  return {
    source: typeof prevProxy.source === 'string' ? prevProxy.source : EIA_BRENT_SPOT_SOURCE,
    sourceUrl: typeof prevProxy.sourceUrl === 'string' ? prevProxy.sourceUrl : EIA_BRENT_SPOT_HTML_URL,
    price: Number.isFinite(prevProxy.price) ? +prevProxy.price.toFixed(2) : null,
    dailyChange: Number.isFinite(prevProxy.dailyChange) ? +prevProxy.dailyChange.toFixed(2) : null,
    updatedAt: typeof prevProxy.updatedAt === 'string' ? prevProxy.updatedAt : null,
    sourceStatus: ['live', 'fallback', 'missing'].includes(prevProxy.sourceStatus)
      ? prevProxy.sourceStatus
      : (Number.isFinite(prevProxy.price) ? 'fallback' : 'missing'),
    limitationZh: typeof prevProxy.limitationZh === 'string'
      ? prevProxy.limitationZh
      : 'EIA Europe Brent Spot Price FOB 是公开 spot proxy；不是 Platts Dated Brent、正式 Dated Brent 或实物成交证据。'
  };
}

function extractEiaHtmlCells(rowHtml) {
  return [...String(rowHtml || '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/giu)]
    .map((match) => htmlToPlainText(match[1]));
}

function parseEiaBrentWeekStart(label) {
  const match = String(label || '').match(/(?<year>\d{4})\s+(?<month>[A-Za-z]+)-\s*(?<day>\d{1,2})\s+to\s+[A-Za-z]+-\s*\d{1,2}/u);
  if (!match?.groups) return null;
  const year = Number(match.groups.year);
  const monthIndex = monthIndexFromName(match.groups.month);
  const day = Number(match.groups.day);
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return null;
  const timestamp = Date.UTC(year, monthIndex, day);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseEiaBrentSpotHtml(html) {
  return extractHtmlRows(html)
    .flatMap((rowHtml) => {
      const cells = extractEiaHtmlCells(rowHtml);
      if (cells.length < 6) return [];
      const weekStartMs = parseEiaBrentWeekStart(cells[0]);
      if (!Number.isFinite(weekStartMs)) return [];
      return cells.slice(1, 6)
        .map((cell, index) => {
          const value = parseLooseNumber(cell);
          if (!Number.isFinite(value)) return null;
          const date = new Date(weekStartMs + index * 24 * 3600 * 1000);
          return {
            date: date.toISOString().slice(0, 10),
            value
          };
        })
        .filter(Boolean);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function resolveEiaBrentSpotProxy(prevBrentPricingLayer) {
  const fallback = normalizePreviousEiaBrentSpotProxy(prevBrentPricingLayer?.eiaBrentSpotProxy);
  try {
    const html = await retryFetch(EIA_BRENT_SPOT_HTML_URL, 'eia:brent-spot-html', EIA_BRENT_SPOT_FETCH_TIMEOUT_MS, {
      userAgent: 'GFRRBot/1.0'
    });
    const rows = parseEiaBrentSpotHtml(html);
    if (rows.length < 1) throw new Error('eia:brent-spot-html missing latest price rows');
    const latest = rows[rows.length - 1];
    const previous = rows[rows.length - 2] || null;
    return {
      source: EIA_BRENT_SPOT_SOURCE,
      sourceUrl: EIA_BRENT_SPOT_HTML_URL,
      price: +latest.value.toFixed(2),
      dailyChange: previous ? +(latest.value - previous.value).toFixed(2) : null,
      updatedAt: `${latest.date}T00:00:00Z`,
      sourceStatus: 'live',
      limitationZh: 'EIA Europe Brent Spot Price FOB 是公开现货代理；不是 Platts Dated Brent、正式 Dated Brent 或实物成交证据。'
    };
  } catch (_err) {
    return fallback;
  }
}

function normalizePreviousBrentFuturesCurve(prevCurve) {
  if (!prevCurve || typeof prevCurve !== 'object') {
    return {
      source: 'ICE:Brent-Crude-Futures-contract-data',
      sourceUrl: ICE_BRENT_FUTURES_DATA_URL,
      curveStatus: 'missing',
      fetchedAt: null,
      contracts: [],
      limitationZh: 'ICE 合约结构尚未成功读取；不得把缺失期限结构渲染为价格曲线。'
    };
  }
  const contracts = Array.isArray(prevCurve.contracts)
    ? prevCurve.contracts
        .map((contract) => ({
          contract: typeof contract?.contract === 'string' ? contract.contract : null,
          lastTrade: typeof contract?.lastTrade === 'string' ? contract.lastTrade : null,
          finalSettlement: typeof contract?.finalSettlement === 'string' ? contract.finalSettlement : null
        }))
        .filter((contract) => contract.contract && contract.lastTrade)
    : [];
  return {
    source: typeof prevCurve.source === 'string' ? prevCurve.source : 'ICE:Brent-Crude-Futures-contract-data',
    sourceUrl: typeof prevCurve.sourceUrl === 'string' ? prevCurve.sourceUrl : ICE_BRENT_FUTURES_DATA_URL,
    curveStatus: ['live_structure_only', 'fallback_structure_only', 'missing'].includes(prevCurve.curveStatus)
      ? prevCurve.curveStatus
      : (contracts.length ? 'fallback_structure_only' : 'missing'),
    fetchedAt: typeof prevCurve.fetchedAt === 'string' ? prevCurve.fetchedAt : null,
    contracts,
    limitationZh: typeof prevCurve.limitationZh === 'string'
      ? prevCurve.limitationZh
      : 'ICE 页面当前只提供可验证合约月份/到期结构；未把官方结算价期限曲线写入生产数据。'
  };
}

async function resolveBrentFuturesCurve(prevBrentPricingLayer) {
  const fallback = normalizePreviousBrentFuturesCurve(prevBrentPricingLayer?.futuresCurve);
  try {
    const html = await retryFetch(
      ICE_BRENT_FUTURES_DATA_URL,
      'ice:brent-futures-contract-data',
      ICE_BRENT_FETCH_TIMEOUT_MS,
      { userAgent: 'Mozilla/5.0 GFRRBot/1.0' }
    );
    const contracts = parseIceBrentFuturesContracts(html);
    if (!contracts.length) throw new Error('ice:brent-futures-contract-data missing contracts array');
    return {
      source: 'ICE:Brent-Crude-Futures-contract-data',
      sourceUrl: ICE_BRENT_FUTURES_DATA_URL,
      curveStatus: 'live_structure_only',
      fetchedAt: isoNow,
      contracts,
      limitationZh: 'ICE 页面当前只提供可验证合约月份/到期结构；未把官方结算价期限曲线写入生产数据。'
    };
  } catch (_err) {
    return fallback;
  }
}

function buildMissingBrentFuturesPriceCurve() {
  return {
    source: 'Yahoo:BZ-monthly-futures',
    sourceUrl: null,
    curveStatus: 'missing',
    updatedAt: null,
    frontPrice: null,
    backPrice: null,
    frontMinusBack: null,
    slopeRegime: '未知',
    contracts: [],
    limitationZh: 'Yahoo 月度 Brent 期货报价不可用；正式 ICE settlement curve / Platts Dated Brent 仍未接入。'
  };
}

function normalizePreviousBrentFuturesPriceCurve(prevCurve) {
  if (!prevCurve || typeof prevCurve !== 'object') return buildMissingBrentFuturesPriceCurve();
  const contracts = Array.isArray(prevCurve.contracts)
    ? prevCurve.contracts
        .map((contract) => ({
          symbol: typeof contract?.symbol === 'string' ? contract.symbol : null,
          contractMonth: typeof contract?.contractMonth === 'string' ? contract.contractMonth : null,
          price: Number.isFinite(contract?.price) ? contract.price : null,
          updatedAt: typeof contract?.updatedAt === 'string' ? contract.updatedAt : null
        }))
        .filter((contract) => contract.symbol && contract.contractMonth)
    : [];
  return {
    source: typeof prevCurve.source === 'string' ? prevCurve.source : 'Yahoo:BZ-monthly-futures',
    sourceUrl: typeof prevCurve.sourceUrl === 'string' ? prevCurve.sourceUrl : null,
    curveStatus: ['live_proxy_priced', 'fallback_proxy_priced', 'missing'].includes(prevCurve.curveStatus)
      ? prevCurve.curveStatus
      : (contracts.length ? 'fallback_proxy_priced' : 'missing'),
    updatedAt: typeof prevCurve.updatedAt === 'string' ? prevCurve.updatedAt : null,
    frontPrice: Number.isFinite(prevCurve.frontPrice) ? prevCurve.frontPrice : null,
    backPrice: Number.isFinite(prevCurve.backPrice) ? prevCurve.backPrice : null,
    frontMinusBack: Number.isFinite(prevCurve.frontMinusBack) ? prevCurve.frontMinusBack : null,
    slopeRegime: typeof prevCurve.slopeRegime === 'string' ? prevCurve.slopeRegime : '未知',
    contracts,
    limitationZh: typeof prevCurve.limitationZh === 'string'
      ? prevCurve.limitationZh
      : 'Yahoo 月度 Brent 期货报价仅为公开 priced proxy；不是官方 ICE settlement curve 或 Platts Dated Brent。'
  };
}

function padTwoDigitYear(year) {
  return String(year).slice(-2).padStart(2, '0');
}

function buildMonthlyFuturesSymbols({ root, suffix, startOffsetMonths = 1, monthsToScan = 12 }) {
  const base = new Date(isoNow);
  const candidates = [];
  for (let index = 0; index < monthsToScan; index += 1) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + startOffsetMonths + index, 1));
    const monthIndex = d.getUTCMonth();
    const year = d.getUTCFullYear();
    const code = FUTURES_MONTH_CODES[monthIndex];
    const yy = padTwoDigitYear(year);
    candidates.push({
      symbol: `${root}${code}${yy}${suffix}`,
      contractMonth: `${FUTURES_MONTH_LABELS[monthIndex]}${yy}`
    });
  }
  return candidates;
}

async function fetchYahooMonthlyFuturesCurve({ root, suffix, startOffsetMonths = 1, monthsToScan = 12, maxContracts = 8 }) {
  const candidates = buildMonthlyFuturesSymbols({ root, suffix, startOffsetMonths, monthsToScan });
  const results = await Promise.allSettled(candidates.map(async (candidate) => {
    const quote = await fetchYahooChartQuote(candidate.symbol, '5d', '1d');
    return {
      symbol: candidate.symbol,
      contractMonth: candidate.contractMonth,
      price: quote.price,
      updatedAt: quote.updatedAt
    };
  }));
  return results
    .filter((result) => result.status === 'fulfilled' && Number.isFinite(result.value.price))
    .map((result) => result.value)
    .slice(0, maxContracts);
}

function classifyBrentFuturesSlope(frontMinusBack) {
  if (!Number.isFinite(frontMinusBack)) return '未知';
  if (frontMinusBack >= 1) return 'backwardation';
  if (frontMinusBack <= -1) return 'contango';
  return 'flat';
}

async function resolveBrentFuturesPriceCurve(prevBrentPricingLayer) {
  const fallback = normalizePreviousBrentFuturesPriceCurve(prevBrentPricingLayer?.futuresPriceCurve);
  try {
    const contracts = await fetchYahooMonthlyFuturesCurve({
      root: 'BZ',
      suffix: '.NYM',
      startOffsetMonths: 1,
      monthsToScan: 14,
      maxContracts: 8
    });
    if (contracts.length < 2) throw new Error('yahoo:brent-monthly-futures insufficient contracts');
    const front = contracts[0];
    const back = contracts[contracts.length - 1];
    const frontMinusBack = Number.isFinite(front.price) && Number.isFinite(back.price)
      ? +(front.price - back.price).toFixed(3)
      : null;
    return {
      source: 'Yahoo:BZ-monthly-futures',
      sourceUrl: 'https://finance.yahoo.com/quote/BZ=F',
      curveStatus: 'live_proxy_priced',
      updatedAt: latestIsoDate(...contracts.map((contract) => contract.updatedAt)),
      frontPrice: Number.isFinite(front.price) ? front.price : null,
      backPrice: Number.isFinite(back.price) ? back.price : null,
      frontMinusBack,
      slopeRegime: classifyBrentFuturesSlope(frontMinusBack),
      contracts,
      limitationZh: 'Yahoo 月度 Brent 期货报价仅为公开 priced proxy；不是官方 ICE settlement curve、Platts Dated Brent 或正式实物现货。'
    };
  } catch (_err) {
    return fallback;
  }
}

async function fetchYahooChartQuote(symbol, range = '1mo', interval = '1d') {
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const payload = await fetchJsonText(url, `yahoo:${symbol}`, YAHOO_FETCH_TIMEOUT_MS, {
    userAgent: 'Mozilla/5.0 GFRRBot/1.0'
  });
  const result = payload?.chart?.result?.[0];
  if (!result || payload?.chart?.error) throw new Error(`yahoo:${symbol} unavailable`);
  const closes = Array.isArray(result.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const points = closes
    .map((value, index) => ({
      value: Number(value),
      timestamp: Number(timestamps[index])
    }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0 && Number.isFinite(point.timestamp));
  const latest = points[points.length - 1] || null;
  if (!latest) throw new Error(`yahoo:${symbol} missing close values`);
  const first = points[0] || null;
  const changePct = points.length >= 2 && first.value !== 0
    ? +(((latest.value - first.value) / first.value)).toFixed(4)
    : null;
  return {
    symbol,
    price: +latest.value.toFixed(4),
    changePct,
    updatedAt: new Date(latest.timestamp * 1000).toISOString(),
    source: `Yahoo:${symbol}`
  };
}

// gold-api.com real-time spot price (keyless, unlimited free tier). Returns spot
// price + updatedAt only (no change field), so changePct is derived elsewhere
// day-over-day from the previous Daily run. Used by copperGold (display-only).
async function fetchGoldApiPrice(symbol) {
  const payload = await fetchJsonText(
    `${GOLD_API_PRICE_BASE}/${encodeURIComponent(symbol)}`,
    `gold-api:${symbol}`,
    MACRO_FETCH_TIMEOUT_MS,
    { userAgent: 'Mozilla/5.0 GFRRBot/1.0' }
  );
  const price = Number(payload?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`gold-api:${symbol} missing price`);
  const updatedAt = typeof payload?.updatedAt === 'string' && payload.updatedAt.trim()
    ? payload.updatedAt
    : new Date().toISOString();
  return {
    symbol,
    price: +price.toFixed(4),
    changePct: null,
    updatedAt,
    source: `gold-api:${symbol}`
  };
}

function buildMissingWorldEconomyIndex(config) {
  return {
    symbol: config.symbol,
    labelZh: config.labelZh,
    price: null,
    changePct: null,
    changeWindow: WORLD_ECONOMY_CHANGE_WINDOW,
    updatedAt: null,
    source: `Yahoo:${config.symbol}`,
    sourceStatus: 'missing'
  };
}

function normalizePreviousWorldEconomyIndex(previous, config) {
  if (!previous || typeof previous !== 'object' || !Number.isFinite(previous.price)) {
    return null;
  }
  return {
    symbol: config.symbol,
    labelZh: config.labelZh,
    price: +Number(previous.price).toFixed(4),
    changePct: Number.isFinite(previous.changePct) ? +Number(previous.changePct).toFixed(4) : null,
    changeWindow: typeof previous.changeWindow === 'string' && previous.changeWindow.trim()
      ? previous.changeWindow
      : WORLD_ECONOMY_CHANGE_WINDOW,
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: typeof previous.source === 'string' && previous.source.trim()
      ? previous.source
      : `Yahoo:${config.symbol}`,
    sourceStatus: 'fallback'
  };
}

function buildMissingWorldEconomy(prevWorldEconomy = null) {
  const next = {
    updatedAt: typeof prevWorldEconomy?.updatedAt === 'string' ? prevWorldEconomy.updatedAt : null,
    source: WORLD_ECONOMY_SOURCE,
    sourceStatus: {},
    notes: WORLD_ECONOMY_DISPLAY_NOTE
  };

  for (const config of WORLD_ECONOMY_INDEXES) {
    const fallback = normalizePreviousWorldEconomyIndex(prevWorldEconomy?.[config.key], config);
    next[config.key] = fallback || buildMissingWorldEconomyIndex(config);
    next.sourceStatus[config.key] = fallback ? 'fallback' : 'missing';
  }

  next.updatedAt = latestIsoDate(...WORLD_ECONOMY_INDEXES.map((config) => next[config.key]?.updatedAt), next.updatedAt);
  return next;
}

function isPlausibleWorldEconomyQuote(quote, config) {
  return Number.isFinite(quote?.price)
    && quote.price >= config.min
    && quote.price <= config.max;
}

async function resolveWorldEconomy(prevWorldEconomy) {
  const results = await Promise.allSettled(
    WORLD_ECONOMY_INDEXES.map((config) => fetchYahooChartQuote(config.symbol, WORLD_ECONOMY_CHANGE_WINDOW, '1d'))
  );

  const next = {
    updatedAt: null,
    source: WORLD_ECONOMY_SOURCE,
    sourceStatus: {},
    notes: WORLD_ECONOMY_DISPLAY_NOTE
  };

  WORLD_ECONOMY_INDEXES.forEach((config, index) => {
    const result = results[index];
    if (result.status === 'fulfilled' && isPlausibleWorldEconomyQuote(result.value, config)) {
      next[config.key] = {
        symbol: config.symbol,
        labelZh: config.labelZh,
        price: result.value.price,
        changePct: Number.isFinite(result.value.changePct) ? result.value.changePct : null,
        changeWindow: WORLD_ECONOMY_CHANGE_WINDOW,
        updatedAt: result.value.updatedAt,
        source: result.value.source,
        sourceStatus: 'live'
      };
      next.sourceStatus[config.key] = 'live';
      return;
    }

    const fallback = normalizePreviousWorldEconomyIndex(prevWorldEconomy?.[config.key], config);
    next[config.key] = fallback || buildMissingWorldEconomyIndex(config);
    next.sourceStatus[config.key] = fallback ? 'fallback' : 'missing';
  });

  next.updatedAt = latestIsoDate(...WORLD_ECONOMY_INDEXES.map((config) => next[config.key]?.updatedAt));
  return next;
}

function buildMissingChinaEquityIndex(config) {
  return {
    symbol: config.symbol,
    labelZh: config.labelZh,
    price: null,
    changePct: null,
    changeWindow: CHINA_EQUITY_CHANGE_WINDOW,
    updatedAt: null,
    source: `Yahoo:${config.symbol}`,
    sourceStatus: 'missing'
  };
}

function normalizePreviousChinaEquityIndex(previous, config) {
  if (!previous || typeof previous !== 'object' || !Number.isFinite(previous.price)) {
    return null;
  }
  return {
    symbol: config.symbol,
    labelZh: config.labelZh,
    price: +Number(previous.price).toFixed(4),
    changePct: Number.isFinite(previous.changePct) ? +Number(previous.changePct).toFixed(4) : null,
    changeWindow: typeof previous.changeWindow === 'string' && previous.changeWindow.trim()
      ? previous.changeWindow
      : CHINA_EQUITY_CHANGE_WINDOW,
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: typeof previous.source === 'string' && previous.source.trim()
      ? previous.source
      : `Yahoo:${config.symbol}`,
    sourceStatus: 'fallback'
  };
}

function buildMissingChinaEquity(prevChinaEquity = null) {
  const next = {
    updatedAt: typeof prevChinaEquity?.updatedAt === 'string' ? prevChinaEquity.updatedAt : null,
    source: CHINA_EQUITY_SOURCE,
    sourceStatus: {},
    notes: CHINA_EQUITY_DISPLAY_NOTE
  };

  for (const config of CHINA_EQUITY_INDEXES) {
    const fallback = normalizePreviousChinaEquityIndex(prevChinaEquity?.[config.key], config);
    next[config.key] = fallback || buildMissingChinaEquityIndex(config);
    next.sourceStatus[config.key] = fallback ? 'fallback' : 'missing';
  }

  next.updatedAt = latestIsoDate(...CHINA_EQUITY_INDEXES.map((config) => next[config.key]?.updatedAt), next.updatedAt);
  return next;
}

function isPlausibleChinaEquityQuote(quote, config) {
  return Number.isFinite(quote?.price)
    && quote.price >= config.min
    && quote.price <= config.max;
}

async function resolveChinaEquity(prevChinaEquity) {
  const results = await Promise.allSettled(
    CHINA_EQUITY_INDEXES.map((config) => fetchYahooChartQuote(config.symbol, CHINA_EQUITY_CHANGE_WINDOW, '1d'))
  );

  const next = {
    updatedAt: null,
    source: CHINA_EQUITY_SOURCE,
    sourceStatus: {},
    notes: CHINA_EQUITY_DISPLAY_NOTE
  };

  CHINA_EQUITY_INDEXES.forEach((config, index) => {
    const result = results[index];
    if (result.status === 'fulfilled' && isPlausibleChinaEquityQuote(result.value, config)) {
      next[config.key] = {
        symbol: config.symbol,
        labelZh: config.labelZh,
        price: result.value.price,
        changePct: Number.isFinite(result.value.changePct) ? result.value.changePct : null,
        changeWindow: CHINA_EQUITY_CHANGE_WINDOW,
        updatedAt: result.value.updatedAt,
        source: result.value.source,
        sourceStatus: 'live'
      };
      next.sourceStatus[config.key] = 'live';
      return;
    }

    const fallback = normalizePreviousChinaEquityIndex(prevChinaEquity?.[config.key], config);
    next[config.key] = fallback || buildMissingChinaEquityIndex(config);
    next.sourceStatus[config.key] = fallback ? 'fallback' : 'missing';
  });

  next.updatedAt = latestIsoDate(...CHINA_EQUITY_INDEXES.map((config) => next[config.key]?.updatedAt));
  return next;
}

function pickInflationEnergyStatus(...statuses) {
  let worst = 'live';
  for (const status of statuses) {
    const normalized = Object.hasOwn(INFLATION_ENERGY_STATUS_RANK, status) ? status : 'missing';
    if (INFLATION_ENERGY_STATUS_RANK[normalized] > INFLATION_ENERGY_STATUS_RANK[worst]) {
      worst = normalized;
    }
  }
  return worst;
}

function buildMissingInflationCpiSeries() {
  return {
    index: null,
    yoy: null,
    mom: null,
    updatedAt: null,
    status: 'missing'
  };
}

function normalizePreviousInflationCpiSeries(previous, config) {
  if (!previous || typeof previous !== 'object') return null;
  const index = Number.isFinite(previous[config.indexField])
    ? +Number(previous[config.indexField]).toFixed(3)
    : null;
  const yoy = Number.isFinite(previous[config.yoyField])
    ? +Number(previous[config.yoyField]).toFixed(4)
    : null;
  const mom = Number.isFinite(previous[config.momField])
    ? +Number(previous[config.momField]).toFixed(4)
    : null;
  if (!Number.isFinite(index) && !Number.isFinite(yoy) && !Number.isFinite(mom)) return null;
  return {
    index,
    yoy,
    mom,
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    status: 'fallback'
  };
}

function calculateFredRowChangeRatio(latest, candidate) {
  if (!candidate?.ok || !Number.isFinite(latest?.value) || !Number.isFinite(candidate.row?.value) || candidate.row.value === 0) {
    return null;
  }
  return +(((latest.value - candidate.row.value) / candidate.row.value)).toFixed(4);
}

function buildInflationCpiSeries(result, previous, config) {
  if (result.status === 'fulfilled') {
    const rows = result.value;
    const latest = Array.isArray(rows) ? rows[rows.length - 1] : null;
    if (Number.isFinite(latest?.value)) {
      const yoyCandidate = findFredRowAgoWithin(rows, 365, CPI_YOY_GAP_DAYS);
      const momCandidate = findFredRowAgoWithin(rows, 30, CPI_MOM_GAP_DAYS);
      return {
        index: +Number(latest.value).toFixed(3),
        yoy: calculateFredRowChangeRatio(latest, yoyCandidate),
        mom: calculateFredRowChangeRatio(latest, momCandidate),
        updatedAt: latest.date ? `${latest.date}T00:00:00Z` : null,
        status: 'live'
      };
    }
  }

  return normalizePreviousInflationCpiSeries(previous, config) || buildMissingInflationCpiSeries();
}

function buildMissingInflationWti() {
  return {
    price: null,
    changePct: null,
    changeWindow: WTI_CHANGE_WINDOW,
    updatedAt: null,
    source: INFLATION_WTI_SOURCE,
    sourceStatus: 'missing'
  };
}

function normalizePreviousInflationWti(previous) {
  if (!previous || typeof previous !== 'object' || !Number.isFinite(previous.price)) return null;
  return {
    price: +Number(previous.price).toFixed(2),
    changePct: Number.isFinite(previous.changePct) ? +Number(previous.changePct).toFixed(4) : null,
    changeWindow: typeof previous.changeWindow === 'string' && previous.changeWindow.trim()
      ? previous.changeWindow
      : WTI_CHANGE_WINDOW,
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: typeof previous.source === 'string' && previous.source.trim()
      ? previous.source
      : INFLATION_WTI_SOURCE,
    sourceStatus: 'fallback'
  };
}

function buildInflationWti(result, previous) {
  if (result.status === 'fulfilled') {
    const rows = result.value;
    const latest = Array.isArray(rows) ? rows[rows.length - 1] : null;
    if (Number.isFinite(latest?.value)) {
      const ago = findFredRowAgoWithin(rows, 5, WTI_CHANGE_GAP_DAYS);
      return {
        price: +Number(latest.value).toFixed(2),
        changePct: calculateFredRowChangeRatio(latest, ago),
        changeWindow: WTI_CHANGE_WINDOW,
        updatedAt: latest.date ? `${latest.date}T00:00:00Z` : null,
        source: INFLATION_WTI_SOURCE,
        sourceStatus: 'live'
      };
    }
  }

  return normalizePreviousInflationWti(previous) || buildMissingInflationWti();
}

function buildMissingInflationWtiMarketProxy() {
  return {
    price: null,
    changePct: null,
    changeWindow: WTI_CHANGE_WINDOW,
    updatedAt: null,
    source: INFLATION_WTI_MARKET_PROXY_SOURCE,
    sourceStatus: 'missing',
    basis: 'WTI futures market proxy, not official spot',
    limitationZh: 'Yahoo CL=F 为 WTI 期货公开市场代理,不是 FRED 官方 WTI spot。'
  };
}

function normalizePreviousInflationWtiMarketProxy(previous) {
  if (!previous || typeof previous !== 'object' || !Number.isFinite(previous.price)) return null;
  return {
    price: +Number(previous.price).toFixed(2),
    changePct: Number.isFinite(previous.changePct) ? +Number(previous.changePct).toFixed(4) : null,
    changeWindow: typeof previous.changeWindow === 'string' && previous.changeWindow.trim()
      ? previous.changeWindow
      : WTI_CHANGE_WINDOW,
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: INFLATION_WTI_MARKET_PROXY_SOURCE,
    sourceStatus: 'fallback',
    basis: 'WTI futures market proxy, not official spot',
    limitationZh: 'Yahoo CL=F 为 WTI 期货公开市场代理,不是 FRED 官方 WTI spot。'
  };
}

function buildInflationWtiMarketProxy(result, previous) {
  if (result.status === 'fulfilled') {
    const quote = result.value;
    if (
      Number.isFinite(quote?.price)
      && quote.price >= WTI_MARKET_PROXY_MIN
      && quote.price <= WTI_MARKET_PROXY_MAX
    ) {
      return {
        price: +Number(quote.price).toFixed(2),
        changePct: Number.isFinite(quote.changePct) ? +Number(quote.changePct).toFixed(4) : null,
        changeWindow: WTI_CHANGE_WINDOW,
        updatedAt: typeof quote.updatedAt === 'string' ? quote.updatedAt : null,
        source: INFLATION_WTI_MARKET_PROXY_SOURCE,
        sourceStatus: 'live',
        basis: 'WTI futures market proxy, not official spot',
        limitationZh: 'Yahoo CL=F 为 WTI 期货公开市场代理,不是 FRED 官方 WTI spot。'
      };
    }
  }

  return normalizePreviousInflationWtiMarketProxy(previous) || buildMissingInflationWtiMarketProxy();
}

function buildInflationCpi(headline, core) {
  const seriesStatus = {
    headline: headline.status,
    core: core.status
  };
  const sourceStatus = pickInflationEnergyStatus(seriesStatus.headline, seriesStatus.core);
  return {
    headlineIndex: headline.index,
    headlineYoY: headline.yoy,
    headlineMoM: headline.mom,
    coreIndex: core.index,
    coreYoY: core.yoy,
    coreMoM: core.mom,
    yoyWindow: 'YoY',
    updatedAt: latestIsoDate(headline.updatedAt, core.updatedAt),
    source: INFLATION_CPI_SOURCE,
    seriesStatus,
    sourceStatus
  };
}

function buildMissingInflationEnergy(prevInflationEnergy = null) {
  const headline = normalizePreviousInflationCpiSeries(prevInflationEnergy?.cpi, {
    indexField: 'headlineIndex',
    yoyField: 'headlineYoY',
    momField: 'headlineMoM'
  }) || buildMissingInflationCpiSeries();
  const core = normalizePreviousInflationCpiSeries(prevInflationEnergy?.cpi, {
    indexField: 'coreIndex',
    yoyField: 'coreYoY',
    momField: 'coreMoM'
  }) || buildMissingInflationCpiSeries();
  const cpi = buildInflationCpi(headline, core);
  const wti = normalizePreviousInflationWti(prevInflationEnergy?.wti) || buildMissingInflationWti();
  const wtiMarketProxy = normalizePreviousInflationWtiMarketProxy(prevInflationEnergy?.wtiMarketProxy)
    || buildMissingInflationWtiMarketProxy();
  return {
    updatedAt: latestIsoDate(
      cpi.updatedAt,
      wti.updatedAt,
      wtiMarketProxy.updatedAt,
      typeof prevInflationEnergy?.updatedAt === 'string' ? prevInflationEnergy.updatedAt : null
    ),
    source: INFLATION_ENERGY_SOURCE,
    sourceStatus: {
      cpi: cpi.sourceStatus,
      wti: wti.sourceStatus,
      wtiMarketProxy: wtiMarketProxy.sourceStatus
    },
    notes: INFLATION_ENERGY_DISPLAY_NOTE,
    cpi,
    wti,
    wtiMarketProxy
  };
}

async function resolveInflationEnergy(prevInflationEnergy) {
  const [headlineResult, coreResult, wtiResult, wtiMarketProxyResult] = await Promise.allSettled([
    fetchFredSeries('CPIAUCSL', CPI_DAYS_BACK),
    fetchFredSeries('CPILFESL', CPI_DAYS_BACK),
    fetchFredSeries('DCOILWTICO', WTI_DAYS_BACK),
    fetchYahooChartQuote(WTI_MARKET_PROXY_SYMBOL, WTI_MARKET_PROXY_RANGE, WTI_MARKET_PROXY_INTERVAL)
  ]);

  const headline = buildInflationCpiSeries(headlineResult, prevInflationEnergy?.cpi, {
    indexField: 'headlineIndex',
    yoyField: 'headlineYoY',
    momField: 'headlineMoM'
  });
  const core = buildInflationCpiSeries(coreResult, prevInflationEnergy?.cpi, {
    indexField: 'coreIndex',
    yoyField: 'coreYoY',
    momField: 'coreMoM'
  });
  const cpi = buildInflationCpi(headline, core);
  const wti = buildInflationWti(wtiResult, prevInflationEnergy?.wti);
  const wtiMarketProxy = buildInflationWtiMarketProxy(
    wtiMarketProxyResult,
    prevInflationEnergy?.wtiMarketProxy
  );

  return {
    updatedAt: latestIsoDate(cpi.updatedAt, wti.updatedAt, wtiMarketProxy.updatedAt),
    source: INFLATION_ENERGY_SOURCE,
    sourceStatus: {
      cpi: cpi.sourceStatus,
      wti: wti.sourceStatus,
      wtiMarketProxy: wtiMarketProxy.sourceStatus
    },
    notes: INFLATION_ENERGY_DISPLAY_NOTE,
    cpi,
    wti,
    wtiMarketProxy
  };
}

function pickCopperGoldStatus(...statuses) {
  let worst = 'live';
  for (const status of statuses) {
    const normalized = Object.hasOwn(COPPER_GOLD_STATUS_RANK, status) ? status : 'missing';
    if (COPPER_GOLD_STATUS_RANK[normalized] > COPPER_GOLD_STATUS_RANK[worst]) {
      worst = normalized;
    }
  }
  return worst;
}

function isPlausibleCopperGoldQuote(quote, config) {
  return Number.isFinite(quote?.price)
    && quote.price >= config.min
    && quote.price <= config.max;
}

function buildMissingCopperGoldLeg(config) {
  return {
    symbol: config.symbol,
    labelZh: config.labelZh,
    price: null,
    changePct: null,
    changeWindow: COPPER_GOLD_CHANGE_WINDOW,
    updatedAt: null,
    source: `gold-api:${config.symbol}`,
    sourceStatus: 'missing'
  };
}

function normalizePreviousCopperGoldLeg(previous, config) {
  if (!previous || typeof previous !== 'object' || !Number.isFinite(previous.price)) return null;
  return {
    symbol: config.symbol,
    labelZh: config.labelZh,
    price: +Number(previous.price).toFixed(4),
    changePct: Number.isFinite(previous.changePct) ? +Number(previous.changePct).toFixed(4) : null,
    changeWindow: typeof previous.changeWindow === 'string' && previous.changeWindow.trim()
      ? previous.changeWindow
      : COPPER_GOLD_CHANGE_WINDOW,
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: typeof previous.source === 'string' && previous.source.trim()
      ? previous.source
      : `gold-api:${config.symbol}`,
    sourceStatus: 'fallback'
  };
}

function deriveCopperGoldRatio(copper, gold) {
  const copperPrice = Number(copper?.price);
  const goldPrice = Number(gold?.price);
  if (!Number.isFinite(copperPrice) || !Number.isFinite(goldPrice) || goldPrice <= 0) return null;
  return +(copperPrice / goldPrice).toFixed(8);
}

function deriveCopperGoldRatioChangePct(copper, gold, ratio) {
  if (!Number.isFinite(ratio)) return null;
  const copperPrice = Number(copper?.price);
  const goldPrice = Number(gold?.price);
  // Guard null explicitly: Number(null) === 0 (finite), which would wrongly
  // yield ratioChangePct 0 instead of null when a leg has no changePct (e.g. the
  // Yahoo-fallback path, or the one-time gold-api transition run).
  const copperChange = copper?.changePct == null ? null : Number(copper.changePct);
  const goldChange = gold?.changePct == null ? null : Number(gold.changePct);
  if (!Number.isFinite(copperPrice) || !Number.isFinite(goldPrice)) return null;
  if (!Number.isFinite(copperChange) || !Number.isFinite(goldChange)) return null;
  if ((1 + copperChange) === 0 || (1 + goldChange) === 0) return null;
  const copperPrev = copperPrice / (1 + copperChange);
  const goldPrev = goldPrice / (1 + goldChange);
  if (!Number.isFinite(copperPrev) || !Number.isFinite(goldPrev) || goldPrev <= 0) return null;
  const ratioPrev = copperPrev / goldPrev;
  if (!Number.isFinite(ratioPrev) || ratioPrev === 0) return null;
  return +(((ratio - ratioPrev) / ratioPrev)).toFixed(4);
}

function buildMissingCopperGold(prevCopperGold = null) {
  const next = {
    updatedAt: null,
    source: COPPER_GOLD_SOURCE,
    sourceStatus: {},
    notes: COPPER_GOLD_DISPLAY_NOTE
  };
  COPPER_GOLD_LEGS.forEach((config) => {
    const fallback = normalizePreviousCopperGoldLeg(prevCopperGold?.[config.key], config);
    next[config.key] = fallback || buildMissingCopperGoldLeg(config);
    next.sourceStatus[config.key] = fallback ? 'fallback' : 'missing';
  });
  next.ratio = deriveCopperGoldRatio(next.copper, next.gold);
  next.ratioChangePct = deriveCopperGoldRatioChangePct(next.copper, next.gold, next.ratio);
  next.ratioWindow = COPPER_GOLD_CHANGE_WINDOW;
  next.sourceStatus.ratio = next.ratio === null
    ? 'missing'
    : pickCopperGoldStatus(next.sourceStatus.copper, next.sourceStatus.gold);
  next.updatedAt = latestIsoDate(
    next.copper?.updatedAt,
    next.gold?.updatedAt,
    typeof prevCopperGold?.updatedAt === 'string' ? prevCopperGold.updatedAt : null
  );
  return next;
}

// Resolve a single copperGold leg: gold-api spot (primary) with a Yahoo futures
// fallback (different provider, so both legs survive a gold-api outage). Returns
// { quote, sourceStatus, changePct } or null when both providers fail.
async function fetchCopperGoldLeg(config, prevLeg) {
  try {
    const goldApi = await fetchGoldApiPrice(config.symbol);
    if (isPlausibleCopperGoldQuote(goldApi, config)) {
      // gold-api gives spot price only; derive changePct day-over-day from the
      // previous run's gold-api price (null on the one-time Yahoo->gold-api
      // transition, when the prior leg's source was not gold-api).
      const prevPrice = Number(prevLeg?.price);
      const prevFromGoldApi = typeof prevLeg?.source === 'string' && prevLeg.source.startsWith('gold-api');
      const changePct = (prevFromGoldApi && Number.isFinite(prevPrice) && prevPrice > 0)
        ? +(((goldApi.price - prevPrice) / prevPrice)).toFixed(4)
        : null;
      return { quote: goldApi, sourceStatus: 'live', changePct };
    }
  } catch (_err) { /* fall through to Yahoo fallback */ }

  try {
    const yahoo = await fetchYahooChartQuote(config.yahooSymbol, COPPER_GOLD_YAHOO_FALLBACK_RANGE, '1d');
    if (isPlausibleCopperGoldQuote(yahoo, config)) {
      // Different-provider fallback; drop changePct to avoid mixing the gold-api
      // day-over-day window with Yahoo's intraday window.
      return { quote: yahoo, sourceStatus: 'fallback', changePct: null };
    }
  } catch (_err) { /* fall through to previous-run carry-over */ }

  return null;
}

async function resolveCopperGold(prevCopperGold) {
  const results = await Promise.allSettled(
    COPPER_GOLD_LEGS.map((config) => fetchCopperGoldLeg(config, prevCopperGold?.[config.key]))
  );

  const next = {
    updatedAt: null,
    source: COPPER_GOLD_SOURCE,
    sourceStatus: {},
    notes: COPPER_GOLD_DISPLAY_NOTE
  };

  COPPER_GOLD_LEGS.forEach((config, index) => {
    const result = results[index];
    const resolved = result.status === 'fulfilled' ? result.value : null;
    if (resolved) {
      next[config.key] = {
        symbol: config.symbol,
        labelZh: config.labelZh,
        price: resolved.quote.price,
        changePct: resolved.changePct,
        changeWindow: COPPER_GOLD_CHANGE_WINDOW,
        updatedAt: resolved.quote.updatedAt,
        source: resolved.quote.source,
        sourceStatus: resolved.sourceStatus
      };
      next.sourceStatus[config.key] = resolved.sourceStatus;
      return;
    }

    const fallback = normalizePreviousCopperGoldLeg(prevCopperGold?.[config.key], config);
    next[config.key] = fallback || buildMissingCopperGoldLeg(config);
    next.sourceStatus[config.key] = fallback ? 'fallback' : 'missing';
  });

  next.ratio = deriveCopperGoldRatio(next.copper, next.gold);
  next.ratioChangePct = deriveCopperGoldRatioChangePct(next.copper, next.gold, next.ratio);
  next.ratioWindow = COPPER_GOLD_CHANGE_WINDOW;
  next.sourceStatus.ratio = next.ratio === null
    ? 'missing'
    : pickCopperGoldStatus(next.sourceStatus.copper, next.sourceStatus.gold);
  next.updatedAt = latestIsoDate(next.copper?.updatedAt, next.gold?.updatedAt);
  return next;
}
function parseChinaOfficialNumber(value) {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

function buildChinaBondHistoryUrl() {
  const params = new URLSearchParams({
    startDate: cosdIso(CHINA_BOND_LOOKBACK_DAYS),
    endDate: isoNow.slice(0, 10),
    gjqx: '10',
    locale: 'cn_ZH',
    qxmc: '1'
  });
  return `${CHINA_BOND_HISTORY_URL}?${params.toString()}`;
}

function buildCfetsRmbHistoryUrl() {
  const params = new URLSearchParams({
    lang: 'cn',
    startDate: cosdIso(CFETS_RMB_LOOKBACK_DAYS),
    endDate: isoNow.slice(0, 10)
  });
  return `${CFETS_RMB_HISTORY_URL}?${params.toString()}`;
}

function pickLatestChinaBondRow(payload) {
  const rows = Array.isArray(payload?.heList) ? payload.heList : [];
  return rows
    .map((row) => ({
      row,
      workTime: dateOnlyIso(row?.workTime),
      tenYear: parseChinaOfficialNumber(row?.tenYear)
    }))
    .filter((item) => item.workTime && Number.isFinite(item.tenYear))
    .sort((a, b) => Date.parse(`${a.workTime}T00:00:00Z`) - Date.parse(`${b.workTime}T00:00:00Z`))
    .at(-1) || null;
}

function normalizePreviousChinaBondYield(previous) {
  const value = parseChinaOfficialNumber(previous?.value);
  if (!Number.isFinite(value)) return null;
  return {
    value: +value.toFixed(4),
    latestObsDate: typeof previous.latestObsDate === 'string' ? previous.latestObsDate : null,
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: typeof previous.source === 'string' && previous.source.trim() ? previous.source : CHINA_BOND_LEAF_SOURCE,
    sourceStatus: 'fallback'
  };
}

function buildMissingChinaBond(prevChinaBond = null) {
  const fallback = normalizePreviousChinaBondYield(prevChinaBond?.yield10y);
  const status = fallback ? 'fallback' : 'missing';
  return {
    updatedAt: fallback?.updatedAt || null,
    source: CHINA_BOND_SOURCE,
    sourceStatus: { yield10y: status },
    notes: CHINA_BOND_DISPLAY_NOTE,
    yield10y: fallback || {
      value: null,
      latestObsDate: null,
      updatedAt: null,
      source: CHINA_BOND_LEAF_SOURCE,
      sourceStatus: 'missing'
    }
  };
}

async function resolveChinaBond(prevChinaBond) {
  try {
    const payload = await fetchJsonText(
      buildChinaBondHistoryUrl(),
      'chinabond:10y',
      MACRO_FETCH_TIMEOUT_MS,
      officialJsonFetchOptions(CHINA_BOND_REFERER)
    );
    const latest = pickLatestChinaBondRow(payload);
    if (!latest || !isFreshDateOnly(latest.workTime, CHINA_BOND_FRESH_DAYS)) {
      return buildMissingChinaBond(prevChinaBond);
    }
    if (latest.tenYear < 0.5 || latest.tenYear > 8) {
      return buildMissingChinaBond(prevChinaBond);
    }
    const updatedAt = dateOnlyToIso(latest.workTime);
    return {
      updatedAt,
      source: CHINA_BOND_SOURCE,
      sourceStatus: { yield10y: 'live' },
      notes: CHINA_BOND_DISPLAY_NOTE,
      yield10y: {
        value: +latest.tenYear.toFixed(4),
        latestObsDate: updatedAt,
        updatedAt,
        source: CHINA_BOND_LEAF_SOURCE,
        sourceStatus: 'live'
      }
    };
  } catch (err) {
    console.warn(`[china-bond-fallback] ${stringifyFetchError(err)}`);
    return buildMissingChinaBond(prevChinaBond);
  }
}

function pickLatestCfetsRecord(payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return records
    .map((record) => ({
      record,
      showDate: dateOnlyIso(record?.showDate),
      cfets: parseChinaOfficialNumber(record?.cfetsIndexRate),
      bis: parseChinaOfficialNumber(record?.bisIndexRate),
      sdr: parseChinaOfficialNumber(record?.sdrIndexRate)
    }))
    .filter((item) => item.showDate && Number.isFinite(item.cfets))
    .sort((a, b) => Date.parse(`${a.showDate}T00:00:00Z`) - Date.parse(`${b.showDate}T00:00:00Z`))
    .at(-1) || null;
}

function normalizePreviousCfetsRmb(previous) {
  const cfets = parseChinaOfficialNumber(previous?.cfets);
  if (!Number.isFinite(cfets)) return null;
  return {
    cfets: +cfets.toFixed(2),
    bis: Number.isFinite(parseChinaOfficialNumber(previous?.bis)) ? +parseChinaOfficialNumber(previous.bis).toFixed(2) : null,
    sdr: Number.isFinite(parseChinaOfficialNumber(previous?.sdr)) ? +parseChinaOfficialNumber(previous.sdr).toFixed(2) : null,
    latestObsDate: typeof previous.latestObsDate === 'string' ? previous.latestObsDate : null,
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null
  };
}

function buildMissingCfetsRmb(prevCfetsRmb = null) {
  const fallback = normalizePreviousCfetsRmb(prevCfetsRmb);
  const status = fallback ? 'fallback' : 'missing';
  return {
    updatedAt: fallback?.updatedAt || null,
    source: CFETS_RMB_SOURCE,
    sourceStatus: { cfets: status },
    notes: CFETS_RMB_DISPLAY_NOTE,
    cfets: fallback?.cfets ?? null,
    bis: fallback?.bis ?? null,
    sdr: fallback?.sdr ?? null,
    latestObsDate: fallback?.latestObsDate || null
  };
}

async function resolveCfetsRmb(prevCfetsRmb) {
  try {
    const payload = await fetchJsonText(
      buildCfetsRmbHistoryUrl(),
      'chinamoney:cfets-rmb',
      MACRO_FETCH_TIMEOUT_MS,
      officialJsonFetchOptions(CFETS_RMB_REFERER)
    );
    const latest = pickLatestCfetsRecord(payload);
    if (!latest || !isFreshDateOnly(latest.showDate, CFETS_RMB_FRESH_DAYS)) {
      return buildMissingCfetsRmb(prevCfetsRmb);
    }
    if (latest.cfets < 80 || latest.cfets > 120) {
      return buildMissingCfetsRmb(prevCfetsRmb);
    }
    const updatedAt = dateOnlyToIso(latest.showDate);
    return {
      updatedAt,
      source: CFETS_RMB_SOURCE,
      sourceStatus: { cfets: 'live' },
      notes: CFETS_RMB_DISPLAY_NOTE,
      cfets: +latest.cfets.toFixed(2),
      bis: Number.isFinite(latest.bis) ? +latest.bis.toFixed(2) : null,
      sdr: Number.isFinite(latest.sdr) ? +latest.sdr.toFixed(2) : null,
      latestObsDate: updatedAt
    };
  } catch (err) {
    console.warn(`[cfets-rmb-fallback] ${stringifyFetchError(err)}`);
    return buildMissingCfetsRmb(prevCfetsRmb);
  }
}




const CHINA_OMO_OPERATION_RE = /开展了?(?<amount>\d+(?:\.\d+)?)(?<unit>万亿元|亿元|万亿|亿)\s*(?<termDays>\d+)\s*天(?:期)?(?<operationType>逆回购|正回购)操作/u;
const CHINA_OMO_RATE_RE = /(?:操作利率|中标利率)\s*(?:为)?\s*(?<ratePct>\d+(?:\.\d+)?)%/u;
const CHINA_OMO_INTEXT_DATE_RE = /(?:(?<year>\d{4})年)?(?<month>\d{1,2})月(?<day>\d{1,2})日[^。]*开展了?\d/u;
const CHINA_OMO_OPERATION_TYPES = new Set(['逆回购', '正回购', '无操作']);

function normalizeChinaOmoPlainText(value) {
  return String(value || '')
    .replace(/(\d)\s*\.\s*(\d)/gu, '$1.$2')
    .replace(/\s+/gu, ' ')
    .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '')
    .trim();
}

function chinaOmoDateOnlyFromYmd(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isPlausibleChinaOmoOperationRate(value) {
  return Number.isFinite(value) && value >= CHINA_OMO_RATE_MIN && value <= CHINA_OMO_RATE_MAX;
}

function isFreshChinaOmo(opDate, publishedAt) {
  const publishedDate = dateOnlyIso(publishedAt);
  return isFreshDateOnly(publishedDate || opDate, CHINA_OMO_FRESH_DAYS);
}

function parseChinaOmoOpDateFromText(plain, link) {
  const m = String(plain || '').match(CHINA_OMO_INTEXT_DATE_RE);
  const searchDate = dateOnlyIso(link?.publishedAt);
  if (m?.groups) {
    const year = m.groups.year ? Number(m.groups.year) : (searchDate ? Number(searchDate.slice(0, 4)) : null);
    const date = chinaOmoDateOnlyFromYmd(year, Number(m.groups.month), Number(m.groups.day));
    if (date) return date;
  }
  return searchDate || null;
}

function parseChinaOmoText(plainInput, link) {
  const plain = normalizeChinaOmoPlainText(plainInput);
  const opMatch = plain.match(CHINA_OMO_OPERATION_RE);
  if (!opMatch?.groups) throw new Error('eastmoney:omo missing operation sentence');
  const rateMatch = plain.match(CHINA_OMO_RATE_RE);
  if (!rateMatch?.groups) throw new Error('eastmoney:omo missing rate');

  const operationType = opMatch.groups.operationType;
  if (!CHINA_OMO_OPERATION_TYPES.has(operationType) || operationType === '无操作') {
    throw new Error('eastmoney:omo unsupported operation type');
  }
  const termDays = Number(opMatch.groups.termDays);
  if (!Number.isInteger(termDays) || termDays <= 0 || termDays > 365) throw new Error('eastmoney:omo invalid term');

  const unit = opMatch.groups.unit;
  let operationAmount = Number(opMatch.groups.amount);
  if (unit === '万亿元' || unit === '万亿') operationAmount *= 10000;
  if (!Number.isFinite(operationAmount) || operationAmount <= 0 || operationAmount > CHINA_OMO_AMOUNT_MAX_YI) {
    throw new Error('eastmoney:omo invalid operationAmount');
  }

  const operationRate = Number(rateMatch.groups.ratePct) / 100;
  if (!isPlausibleChinaOmoOperationRate(operationRate)) throw new Error('eastmoney:omo operationRate out of plausible range');

  const publishedAt = link?.publishedAt || null;
  const opDate = parseChinaOmoOpDateFromText(plain, link);
  if (!opDate) throw new Error('eastmoney:omo missing opDate');
  if (!isFreshChinaOmo(opDate, publishedAt)) throw new Error('eastmoney:omo stale');

  return {
    updatedAt: publishedAt || dateOnlyToIso(opDate),
    source: CHINA_OMO_SOURCE,
    sourceStatus: 'live',
    notes: CHINA_OMO_DISPLAY_NOTE,
    opDate,
    announcementNo: null,
    operationType,
    termDays,
    operationRate: +operationRate.toFixed(6),
    operationAmount: +operationAmount.toFixed(2)
  };
}

function normalizePreviousChinaOmo(previous) {
  if (!previous || previous.source !== CHINA_OMO_SOURCE || !isFreshChinaOmo(previous.opDate, previous.updatedAt)) return null;
  const operationType = CHINA_OMO_OPERATION_TYPES.has(previous.operationType) ? previous.operationType : null;
  if (!operationType) return null;
  const base = {
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: CHINA_OMO_SOURCE,
    sourceStatus: 'fallback',
    notes: CHINA_OMO_DISPLAY_NOTE,
    opDate: typeof previous.opDate === 'string' ? previous.opDate : null,
    announcementNo: Number.isInteger(previous.announcementNo) ? previous.announcementNo : null,
    operationType
  };
  if (operationType === '无操作') {
    return {
      ...base,
      termDays: null,
      operationRate: null,
      operationAmount: null
    };
  }
  const termDays = Number(previous.termDays);
  const operationRate = Number(previous.operationRate);
  const operationAmount = Number(previous.operationAmount);
  if (!Number.isInteger(termDays) || termDays <= 0) return null;
  if (!isPlausibleChinaOmoOperationRate(operationRate)) return null;
  if (!Number.isFinite(operationAmount) || operationAmount < 0) return null;
  return {
    ...base,
    termDays,
    operationRate,
    operationAmount
  };
}

function buildMissingChinaOmo(prevChinaOmo = null) {
  const fallback = normalizePreviousChinaOmo(prevChinaOmo);
  if (fallback) return fallback;
  return {
    updatedAt: null,
    source: CHINA_OMO_SOURCE,
    sourceStatus: 'missing',
    notes: CHINA_OMO_DISPLAY_NOTE,
    opDate: null,
    announcementNo: null,
    operationType: null,
    termDays: null,
    operationRate: null,
    operationAmount: null
  };
}

async function fetchChinaOmoSearchCandidates(keyword) {
  const param = encodeURIComponent(JSON.stringify({
    uid: '',
    keyword,
    type: ['cmsArticleWebOld'],
    client: 'web',
    clientType: 'web',
    pageIndex: 1,
    pageSize: 20
  }));
  const url = `${CHINA_OMO_SEARCH_BASE_URL}?cb=jQuery&param=${param}`;
  const raw = await retryFetch(url, 'eastmoney:omo-search', MACRO_FETCH_TIMEOUT_MS, {
    userAgent: CHINA_MACRO_HTML_USER_AGENT,
    headers: { Accept: 'text/javascript,application/javascript,*/*' }
  });
  const payload = parseEastMoneyJsonp(raw);
  const rows = Array.isArray(payload?.result?.cmsArticleWebOld) ? payload.result.cmsArticleWebOld : [];
  const candidates = [];
  for (const row of rows) {
    const code = typeof row?.code === 'string' ? row.code.trim() : '';
    if (!/^\d{13,}$/u.test(code)) continue;
    const title = normalizeChinaOmoPlainText(htmlToPlainText(String(row?.title || '')));
    const content = normalizeChinaOmoPlainText(htmlToPlainText(String(row?.content || '')));
    candidates.push({
      code,
      url: `${CHINA_OMO_ARTICLE_BASE_URL}${code}.html`,
      summaryText: `${title} ${content}`,
      publishedAt: eastMoneyDateToIso(row?.date),
      dateRaw: typeof row?.date === 'string' ? row.date.trim() : ''
    });
  }
  return candidates.sort((a, b) => b.dateRaw.localeCompare(a.dateRaw));
}

async function resolveChinaOmo(prevChinaOmo) {
  try {
    let candidates = await fetchChinaOmoSearchCandidates(CHINA_OMO_SEARCH_KEYWORD);
    if (!candidates.length) candidates = await fetchChinaOmoSearchCandidates(CHINA_OMO_SEARCH_KEYWORD_FALLBACK);
    if (!candidates.length) throw new Error('eastmoney:omo no search candidates');
    let lastError = null;
    for (const candidate of candidates.slice(0, CHINA_OMO_MAX_ARTICLE_FETCH)) {
      try {
        return parseChinaOmoText(candidate.summaryText, candidate);
      } catch (errSummary) {
        lastError = errSummary;
      }
      try {
        const articleHtml = await retryFetch(candidate.url, 'eastmoney:omo-article', MACRO_FETCH_TIMEOUT_MS, {
          userAgent: CHINA_MACRO_HTML_USER_AGENT,
          headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
        });
        return parseChinaOmoText(htmlToPlainText(articleHtml), candidate);
      } catch (errArticle) {
        lastError = errArticle;
      }
    }
    throw lastError || new Error('eastmoney:omo no valid operation among candidates');
  } catch (err) {
    console.warn(`[china-omo-missing] ${stringifyFetchError(err)}`);
    return buildMissingChinaOmo(prevChinaOmo);
  }
}
const CHINA_TSF_TITLE_RE = /(?<year>\d{4})年(?:(?<month>\d{1,2})月|(?<quarter>一季度|上半年|前三季度))?金融统计数据报告/u;
const CHINA_TSF_STOCK_YOY_RE = /社会融资规模存量为(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)，同比(?<verb>增长|下降)(?<yoy>\d+(?:\.\d+)?)%/u;
const CHINA_TSF_YTD_INCREMENT_RE = /社会融资规模增量(?:累计)?为(?<value>\d+(?:\.\d+)?)(?<unit>万亿元|亿元)/u;
const CHINA_TSF_INCREMENT_PERIOD_RE = /(?<label>前[一二三四五六七八九十\d]+个月|一季度|上半年|前三季度)社会融资规模增量(?:累计)?为/u;
const CHINA_TSF_CHINESE_MONTH_NUMBERS = new Map([
  ['一', 1],
  ['二', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['七', 7],
  ['八', 8],
  ['九', 9],
  ['十', 10],
  ['十一', 11],
  ['十二', 12]
]);

function normalizeChinaTsfPlainText(text) {
  return String(text || '')
    .replace(/\s+/gu, ' ')
    .replace(/(\d+)\.\s+(\d+)/gu, '$1.$2')
    .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '')
    .trim();
}

function parseChinaTsfTitle(text) {
  const match = normalizeChinaTsfPlainText(text).match(CHINA_TSF_TITLE_RE);
  if (!match?.groups) return null;
  const year = Number(match.groups.year);
  if (!Number.isInteger(year)) return null;
  if (match.groups.month) {
    const month = Number(match.groups.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    return {
      title: match[0],
      refMonth: monthNumberToRefMonth(year, month - 1),
      periodLabel: `前${month}个月`
    };
  }
  const quarterMonth = {
    一季度: 3,
    上半年: 6,
    前三季度: 9
  }[match.groups.quarter || ''];
  if (quarterMonth) {
    return {
      title: match[0],
      refMonth: monthNumberToRefMonth(year, quarterMonth - 1),
      periodLabel: `前${quarterMonth}个月`
    };
  }
  return {
    title: match[0],
    refMonth: monthNumberToRefMonth(year, 11),
    periodLabel: '全年'
  };
}

function parseChinaTsfPublishedAt(plain) {
  const match = normalizeChinaTsfPlainText(plain).match(/文章来源：\s*(?<date>\d{4}-\d{2}-\d{2})\s+(?<time>\d{2}:\d{2}:\d{2})/u);
  if (!match?.groups) return null;
  return `${match.groups.date}T${match.groups.time}+08:00`;
}

function parseChinaTsfChineseMonthCount(text) {
  const raw = String(text || '').trim();
  if (/^\d+$/u.test(raw)) return Number(raw);
  if (CHINA_TSF_CHINESE_MONTH_NUMBERS.has(raw)) return CHINA_TSF_CHINESE_MONTH_NUMBERS.get(raw);
  const match = raw.match(/^(?<tens>[一二])?十(?<ones>[一二])?$/u);
  if (!match?.groups) return null;
  const tens = match.groups.tens ? CHINA_TSF_CHINESE_MONTH_NUMBERS.get(match.groups.tens) : 1;
  const ones = match.groups.ones ? CHINA_TSF_CHINESE_MONTH_NUMBERS.get(match.groups.ones) : 0;
  const value = tens * 10 + ones;
  return value >= 1 && value <= 12 ? value : null;
}

function normalizeChinaTsfPeriodLabel(label, refMonth) {
  const text = String(label || '').trim();
  const monthMatch = text.match(/^前(?<month>[一二三四五六七八九十\d]+)个月$/u);
  if (monthMatch?.groups) {
    const month = parseChinaTsfChineseMonthCount(monthMatch.groups.month);
    if (Number.isInteger(month) && month >= 1 && month <= 12) return `前${month}个月`;
  }
  if (text === '一季度') return '前3个月';
  if (text === '上半年') return '前6个月';
  if (text === '前三季度') return '前9个月';
  const refMatch = String(refMonth || '').match(/^\d{4}-(?<month>\d{2})$/u);
  if (refMatch?.groups) {
    const month = Number(refMatch.groups.month);
    if (month === 12) return '全年';
    if (month >= 1 && month <= 11) return `前${month}个月`;
  }
  return null;
}

function chinaTsfAmountToYi(groups) {
  if (!groups) return null;
  let value = Number(groups.value);
  if (!Number.isFinite(value)) return null;
  if (groups.unit === '万亿元') value *= 10000;
  if (groups.verb === '减少' || groups.verb === '下降') value *= -1;
  return +value.toFixed(2);
}

function isPlausibleChinaTsfStockYoY(value) {
  return Number.isFinite(value) && value >= CHINA_TSF_STOCK_YOY_MIN && value <= CHINA_TSF_STOCK_YOY_MAX;
}

function isFreshChinaTsf(refMonth, publishedAt) {
  const publishedDate = dateOnlyIso(publishedAt);
  if (publishedDate) return isFreshDateOnly(publishedDate, CHINA_TSF_FRESH_DAYS);
  return isFreshDateOnly(endOfRefMonthDateOnly(refMonth), CHINA_TSF_REF_FRESH_DAYS);
}

function parseChinaTsfComponents(plain) {
  const components = [];
  for (const definition of CHINA_TSF_COMPONENT_DEFINITIONS) {
    const match = plain.match(definition.pattern);
    if (!match?.groups) continue;
    const incrementYi = chinaTsfAmountToYi(match.groups);
    if (!Number.isFinite(incrementYi)) continue;
    components.push({
      key: definition.key,
      label: definition.label,
      incrementYi
    });
  }
  const componentsStatus = components.length === CHINA_TSF_COMPONENT_DEFINITIONS.length
    ? 'complete'
    : components.length > 0
      ? 'partial'
      : 'missing';
  return { componentsStatus, components };
}

function parseChinaTsfArticle(articleHtml, link) {
  const plain = normalizeChinaTsfPlainText(htmlToPlainText(articleHtml));
  const bodyRefMonthMatch = plain.match(CHINA_TSF_BODY_REF_MONTH_RE);
  const bodyRefMonth = bodyRefMonthMatch?.groups
    ? monthNumberToRefMonth(Number(bodyRefMonthMatch.groups.year), Number(bodyRefMonthMatch.groups.month) - 1)
    : null;
  const titleInfo = parseChinaTsfTitle(link?.title) || parseChinaTsfTitle(plain);
  const refMonth = bodyRefMonth || titleInfo?.refMonth || null;
  if (!refMonth) throw new Error('eastmoney:tsf missing refMonth');

  const publishedAt = link?.publishedAt || parseChinaTsfPublishedAt(plain) || null;
  if (!isFreshChinaTsf(refMonth, publishedAt)) throw new Error('eastmoney:tsf stale');

  const stockMatch = plain.match(CHINA_TSF_STOCK_YOY_RE);
  if (!stockMatch?.groups) throw new Error('eastmoney:tsf missing stockYoY');
  const stockYoY = (stockMatch.groups.verb === '下降' ? -1 : 1) * (Number(stockMatch.groups.yoy) / 100);
  if (!isPlausibleChinaTsfStockYoY(stockYoY)) throw new Error('eastmoney:tsf stockYoY out of plausible range');

  const ytdMatch = plain.match(CHINA_TSF_YTD_INCREMENT_RE);
  const ytdIncrementYi = ytdMatch?.groups ? chinaTsfAmountToYi(ytdMatch.groups) : null;
  const periodMatch = plain.match(CHINA_TSF_INCREMENT_PERIOD_RE);
  const incrementPeriodLabel = normalizeChinaTsfPeriodLabel(periodMatch?.groups?.label || titleInfo?.periodLabel, refMonth);
  const { componentsStatus, components } = parseChinaTsfComponents(plain);

  return {
    updatedAt: publishedAt || dateOnlyToIso(endOfRefMonthDateOnly(refMonth)),
    source: CHINA_TSF_SOURCE,
    sourceStatus: 'live',
    notes: CHINA_TSF_DISPLAY_NOTE,
    refMonth,
    publishedAt,
    stockYoY: +stockYoY.toFixed(6),
    ytdIncrementYi,
    incrementPeriodLabel,
    componentsStatus,
    components
  };
}

function normalizeChinaTsfComponent(component) {
  if (!component || typeof component !== 'object') return null;
  const definition = CHINA_TSF_COMPONENT_DEFINITIONS.find((item) => item.key === component.key);
  if (!definition) return null;
  const incrementYi = Number(component.incrementYi);
  return {
    key: definition.key,
    label: definition.label,
    incrementYi: Number.isFinite(incrementYi) ? incrementYi : null
  };
}

function normalizePreviousChinaTsf(previous) {
  if (!previous || previous.source !== CHINA_TSF_SOURCE || !isFreshChinaTsf(previous.refMonth, previous.publishedAt || previous.updatedAt)) {
    return null;
  }
  const stockYoY = Number(previous.stockYoY);
  if (!isPlausibleChinaTsfStockYoY(stockYoY)) return null;
  const ytdIncrementYi = Number(previous.ytdIncrementYi);
  const components = Array.isArray(previous.components)
    ? previous.components.map(normalizeChinaTsfComponent).filter(Boolean)
    : [];
  const uniqueComponents = components.filter(
    (component, index, list) => list.findIndex((item) => item.key === component.key) === index
  );
  let componentsStatus = CHINA_TSF_COMPONENT_STATUSES.has(previous.componentsStatus) ? previous.componentsStatus : 'missing';
  if (uniqueComponents.length === CHINA_TSF_COMPONENT_DEFINITIONS.length) componentsStatus = 'complete';
  else if (uniqueComponents.length > 0 && componentsStatus === 'complete') componentsStatus = 'partial';
  else if (uniqueComponents.length === 0) componentsStatus = 'missing';
  return {
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: CHINA_TSF_SOURCE,
    sourceStatus: 'fallback',
    notes: CHINA_TSF_DISPLAY_NOTE,
    refMonth: typeof previous.refMonth === 'string' ? previous.refMonth : null,
    publishedAt: typeof previous.publishedAt === 'string' ? previous.publishedAt : null,
    stockYoY: +stockYoY.toFixed(6),
    ytdIncrementYi: Number.isFinite(ytdIncrementYi) ? ytdIncrementYi : null,
    incrementPeriodLabel: typeof previous.incrementPeriodLabel === 'string' ? previous.incrementPeriodLabel : null,
    componentsStatus,
    components: uniqueComponents
  };
}

function buildMissingChinaTsf(prevChinaTsf = null) {
  const fallback = normalizePreviousChinaTsf(prevChinaTsf);
  if (fallback) return fallback;
  return {
    updatedAt: null,
    source: CHINA_TSF_SOURCE,
    sourceStatus: 'missing',
    notes: CHINA_TSF_DISPLAY_NOTE,
    refMonth: null,
    publishedAt: null,
    stockYoY: null,
    ytdIncrementYi: null,
    incrementPeriodLabel: null,
    componentsStatus: 'missing',
    components: []
  };
}

function eastMoneyDateToIso(date) {
  const match = String(date || '').match(/^(?<d>\d{4}-\d{2}-\d{2})\s+(?<t>\d{2}:\d{2}:\d{2})$/u);
  return match?.groups ? `${match.groups.d}T${match.groups.t}+08:00` : null;
}

function parseEastMoneyJsonp(raw) {
  const stripped = String(raw || '').trim().replace(/^jQuery\(/u, '').replace(/\)\s*;?\s*$/u, '');
  return JSON.parse(stripped);
}

async function fetchChinaTsfSearchCandidates() {
  const param = encodeURIComponent(JSON.stringify({
    uid: '',
    keyword: CHINA_TSF_SEARCH_KEYWORD,
    type: ['cmsArticleWebOld'],
    client: 'web',
    clientType: 'web',
    pageIndex: 1,
    pageSize: 20
  }));
  const url = `${CHINA_TSF_SEARCH_BASE_URL}?cb=jQuery&param=${param}`;
  const raw = await retryFetch(url, 'eastmoney:tsf-search', MACRO_FETCH_TIMEOUT_MS, {
    userAgent: CHINA_MACRO_HTML_USER_AGENT,
    headers: { Accept: 'text/javascript,application/javascript,*/*' }
  });
  const payload = parseEastMoneyJsonp(raw);
  const rows = Array.isArray(payload?.result?.cmsArticleWebOld) ? payload.result.cmsArticleWebOld : [];
  const candidates = [];
  for (const row of rows) {
    const code = typeof row?.code === 'string' ? row.code.trim() : '';
    if (!/^\d{13,}$/u.test(code)) continue;
    const title = normalizeChinaTsfPlainText(htmlToPlainText(String(row?.title || '')));
    const content = normalizeChinaTsfPlainText(htmlToPlainText(String(row?.content || '')));
    const haystack = `${title} ${content}`;
    if (!haystack.includes('社会融资规模') || !haystack.includes('增量累计')) continue;
    if (CHINA_TSF_SEARCH_EXCLUDE_RE.test(haystack)) continue;
    const publishedAt = eastMoneyDateToIso(row?.date);
    candidates.push({
      code,
      url: `${CHINA_TSF_ARTICLE_BASE_URL}${code}.html`,
      title,
      mediaName: typeof row?.mediaName === 'string' ? row.mediaName.trim() : '',
      publishedAt,
      dateRaw: typeof row?.date === 'string' ? row.date.trim() : ''
    });
  }
  return candidates.sort((a, b) => b.dateRaw.localeCompare(a.dateRaw));
}

async function resolveChinaTsf(prevChinaTsf) {
  try {
    const candidates = await fetchChinaTsfSearchCandidates();
    if (!candidates.length) throw new Error('eastmoney:tsf no search candidates');
    let lastError = null;
    for (const candidate of candidates.slice(0, CHINA_TSF_MAX_ARTICLE_FETCH)) {
      try {
        const articleHtml = await retryFetch(candidate.url, 'eastmoney:tsf-article', MACRO_FETCH_TIMEOUT_MS, {
          userAgent: CHINA_MACRO_HTML_USER_AGENT,
          headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
        });
        const parsed = parseChinaTsfArticle(articleHtml, candidate);
        if (parsed.componentsStatus === 'complete') return parsed;
        lastError = new Error('eastmoney:tsf candidate components incomplete');
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('eastmoney:tsf no complete report among candidates');
  } catch (err) {
    console.warn(`[china-tsf-missing] ${stringifyFetchError(err)}`);
    return buildMissingChinaTsf(prevChinaTsf);
  }
}
function normalizeChinaMlfPlainText(value) {
  return String(value || '')
    .replace(/(\d)\s*\.\s*(\d)/gu, '$1.$2')
    .replace(/\s+/gu, ' ')
    .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '')
    .trim();
}

function isPlausibleChinaMlfAmount(value) {
  return Number.isFinite(value) && value >= CHINA_MLF_AMOUNT_MIN && value <= CHINA_MLF_AMOUNT_MAX;
}

function isPlausibleChinaMlfRate(value) {
  return value === null || (Number.isFinite(value) && value >= CHINA_MLF_RATE_MIN && value <= CHINA_MLF_RATE_MAX);
}

function isFreshChinaMlf(opDate, publishedAt) {
  return isFreshMlfDates(opDate, publishedAt);
}

function parseChinaMlfText(plain, link) {
  return {
    ...parseMlfOperation(plain, link),
    source: CHINA_MLF_SOURCE,
    sourceStatus: 'live',
    notes: CHINA_MLF_DISPLAY_NOTE
  };
}

function normalizePreviousChinaMlf(previous) {
  if (!previous || previous.source !== CHINA_MLF_SOURCE || !isFreshChinaMlf(previous.opDate, previous.publishedAt || previous.updatedAt)) {
    return null;
  }
  const operationAmountYi = Number(previous.operationAmountYi);
  const termMonths = Number(previous.termMonths);
  const mlfRate = previous.mlfRate === null || previous.mlfRate === undefined ? null : Number(previous.mlfRate);
  if (!isPlausibleChinaMlfAmount(operationAmountYi)) return null;
  if (!Number.isInteger(termMonths) || termMonths <= 0 || termMonths > 60) return null;
  if (!isPlausibleChinaMlfRate(mlfRate)) return null;
  return {
    updatedAt: typeof previous.updatedAt === 'string' ? previous.updatedAt : null,
    source: CHINA_MLF_SOURCE,
    sourceStatus: 'fallback',
    notes: CHINA_MLF_DISPLAY_NOTE,
    opDate: typeof previous.opDate === 'string' ? previous.opDate : null,
    publishedAt: typeof previous.publishedAt === 'string' ? previous.publishedAt : null,
    operationAmountYi: +operationAmountYi.toFixed(2),
    termMonths,
    mlfRate: mlfRate === null ? null : +mlfRate.toFixed(6)
  };
}

function buildMissingChinaMlf(prevChinaMlf = null) {
  const fallback = normalizePreviousChinaMlf(prevChinaMlf);
  if (fallback) return fallback;
  return {
    updatedAt: null,
    source: CHINA_MLF_SOURCE,
    sourceStatus: 'missing',
    notes: CHINA_MLF_DISPLAY_NOTE,
    opDate: null,
    publishedAt: null,
    operationAmountYi: null,
    termMonths: null,
    mlfRate: null
  };
}

async function fetchChinaMlfSearchCandidates(keyword) {
  const param = encodeURIComponent(JSON.stringify({
    uid: '',
    keyword,
    type: ['cmsArticleWebOld'],
    client: 'web',
    clientType: 'web',
    pageIndex: 1,
    pageSize: 20
  }));
  const url = `${CHINA_MLF_SEARCH_BASE_URL}?cb=jQuery&param=${param}`;
  const raw = await retryFetch(url, 'eastmoney:mlf-search', MACRO_FETCH_TIMEOUT_MS, {
    userAgent: CHINA_MACRO_HTML_USER_AGENT,
    headers: { Accept: 'text/javascript,application/javascript,*/*' }
  });
  const payload = parseEastMoneyJsonp(raw);
  const rows = Array.isArray(payload?.result?.cmsArticleWebOld) ? payload.result.cmsArticleWebOld : [];
  const candidates = [];
  for (const row of rows) {
    const code = typeof row?.code === 'string' ? row.code.trim() : '';
    if (!/^\d{13,}$/u.test(code)) continue;
    const title = normalizeChinaMlfPlainText(htmlToPlainText(String(row?.title || '')));
    const content = normalizeChinaMlfPlainText(htmlToPlainText(String(row?.content || '')));
    candidates.push({
      code,
      url: `${CHINA_MLF_ARTICLE_BASE_URL}${code}.html`,
      title,
      summaryText: `${title} ${content}`,
      publishedAt: eastMoneyDateToIso(row?.date),
      dateRaw: typeof row?.date === 'string' ? row.date.trim() : ''
    });
  }
  return candidates.sort((a, b) => b.dateRaw.localeCompare(a.dateRaw));
}

export async function resolveChinaMlf(prevChinaMlf) {
  try {
    return await findMlfCandidate({
      keywords: [CHINA_MLF_SEARCH_KEYWORD, CHINA_MLF_SEARCH_KEYWORD_FALLBACK],
      search: fetchChinaMlfSearchCandidates,
      parseCandidate: parseChinaMlfText,
      maxArticleFetch: CHINA_MLF_MAX_ARTICLE_FETCH,
      fetchArticle: async (candidate) => {
        const html = await retryFetch(candidate.url, 'eastmoney:mlf-article', MACRO_FETCH_TIMEOUT_MS, {
          userAgent: CHINA_MACRO_HTML_USER_AGENT,
          headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
        });
        return htmlToPlainText(html);
      }
    });
  } catch (err) {
    console.warn(`[china-mlf-missing] ${stringifyFetchError(err)}`);
    return buildMissingChinaMlf(prevChinaMlf);
  }
}
const CHINA_PROPERTY_PRICE_TITLE_RE = /(?<year>\d{4})\s*年\s*(?<month>\d{1,2})\s*月份?\s*70\s*个大中城市商品住宅销售价格变动情况/u;
const CHINA_PROPERTY_PRICE_HREF_RE = /^\.\/\d{6}\/t\d+_\d+\.html$/u;
const CHINA_PROPERTY_PRICE_TABLE_ANCHORS = {
  newStart: /表\s*1\s*：?\s*\d{4}\s*年\s*\d{1,2}\s*月\s*70\s*个大中城市新建商品住宅销售价格指数/u,
  resaleStart: /表\s*2\s*：?\s*\d{4}\s*年\s*\d{1,2}\s*月\s*70\s*个大中城市二手住宅销售价格指数/u,
  classifiedStart: /表\s*3\s*：?\s*\d{4}\s*年\s*\d{1,2}\s*月\s*70\s*个大中城市新建商品住宅销售价格分类指数/u
};

function getChinaPropertyAnchorAttribute(attrs, name) {
  const match = String(attrs || '').match(new RegExp(`${name}=["'](?<value>[^"']+)["']`, 'iu'));
  return match?.groups?.value || '';
}

function parseChinaPropertyRefMonth(text) {
  const match = String(text || '').match(CHINA_PROPERTY_PRICE_TITLE_RE);
  if (!match?.groups) return null;
  return monthNumberToRefMonth(Number(match.groups.year), Number(match.groups.month) - 1);
}

function parseChinaPropertyPublishedAtFromPlain(plain) {
  const match = String(plain || '').match(/(?<year>\d{4})\/(?<month>\d{2})\/(?<day>\d{2})\s+(?<hour>\d{2}):(?<minute>\d{2})\s+来源/u);
  if (!match?.groups) return null;
  return `${match.groups.year}-${match.groups.month}-${match.groups.day}T${match.groups.hour}:${match.groups.minute}:00+08:00`;
}

function pickChinaPropertyPriceLink(indexHtmlList) {
  const rows = [];
  const linkRe = /<a\b(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/a>/giu;
  for (const html of indexHtmlList) {
    for (const match of String(html || '').matchAll(linkRe)) {
      const attrs = match.groups?.attrs || '';
      const href = getChinaPropertyAnchorAttribute(attrs, 'href');
      if (!CHINA_PROPERTY_PRICE_HREF_RE.test(href)) continue;
      const titleAttr = getChinaPropertyAnchorAttribute(attrs, 'title');
      const bodyText = htmlToPlainText(match.groups?.body || '');
      const title = String(titleAttr || bodyText || '').replace(/\s+/gu, ' ').trim();
      const titleForMatch = `${title} ${bodyText}`.replace(/\s+/gu, ' ').trim();
      if (!CHINA_PROPERTY_PRICE_TITLE_RE.test(titleForMatch)) continue;
      const refMonth = parseChinaPropertyRefMonth(titleForMatch);
      const publishedAt = parseChinaNbsPublishedAt(href);
      const url = resolveAbsoluteUrl(href, 'https://www.stats.gov.cn/sj/zxfbhjd/');
      if (!refMonth || !url) continue;
      rows.push({ title, href, url, refMonth, publishedAt });
    }
  }
  return rows
    .filter((row, index, list) => list.findIndex((item) => item.url === row.url) === index)
    .sort((a, b) => {
      const refDiff = String(a.refMonth).localeCompare(String(b.refMonth));
      if (refDiff !== 0) return refDiff;
      return Date.parse(a.publishedAt || '1970-01-01T00:00:00Z') - Date.parse(b.publishedAt || '1970-01-01T00:00:00Z');
    })
    .at(-1) || null;
}

async function fetchChinaPropertyPriceIndexPages() {
  const pages = [];
  for (const url of CHINA_PROPERTY_PRICE_INDEX_URLS) {
    const html = await retryFetch(url, `nbs:china-property-index:${url}`, MACRO_FETCH_TIMEOUT_MS, {
      userAgent: CHINA_MACRO_HTML_USER_AGENT,
      headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
    });
    pages.push(html);
  }
  return pages;
}

function escapeChinaPropertyRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function flexibleChinaPropertyCityPattern(city) {
  return [...String(city || '')].map((char) => escapeChinaPropertyRegex(char)).join('\\s*');
}

function extractChinaPropertyTableSegment(plain, startRe, endRe, label) {
  const source = String(plain || '');
  const start = source.search(startRe);
  if (start < 0) throw new Error(`nbs:china-property missing ${label} table start`);
  const remainder = source.slice(start);
  const end = remainder.search(endRe);
  if (end <= 0) throw new Error(`nbs:china-property missing ${label} table end`);
  return remainder.slice(0, end);
}

function normalizeChinaPropertyCount(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= CHINA_PROPERTY_PRICE_CITY_COUNT ? n : null;
}

function isChinaPropertyCountSetPlausible(up, flat, down) {
  const values = [up, flat, down].map(normalizeChinaPropertyCount);
  return values.every((value) => value !== null)
    && values.reduce((sum, value) => sum + value, 0) === CHINA_PROPERTY_PRICE_CITY_COUNT;
}

function classifyChinaPropertyDirection(mom) {
  if (mom > 100) return 'up';
  if (mom === 100) return 'flat';
  if (mom < 100) return 'down';
  return null;
}

function countChinaPropertyRows(rows) {
  return {
    up: rows.filter((row) => row.dir === 'up').length,
    flat: rows.filter((row) => row.dir === 'flat').length,
    down: rows.filter((row) => row.dir === 'down').length
  };
}

function groupChinaPropertyRowsByTier(rows, tier) {
  const tierCitySet = new Set(tier.cities);
  const grouped = { up: [], flat: [], down: [] };
  for (const row of rows) {
    if (!tierCitySet.has(row.city)) continue;
    if (!Object.prototype.hasOwnProperty.call(grouped, row.dir)) {
      throw new Error(`nbs:china-property invalid direction for ${row.city}`);
    }
    grouped[row.dir].push(row.city);
  }
  const groupedCount = grouped.up.length + grouped.flat.length + grouped.down.length;
  if (groupedCount !== tier.cityCount) {
    throw new Error(`nbs:china-property ${tier.key} expected ${tier.cityCount} cities, got ${groupedCount}`);
  }
  return grouped;
}

function buildChinaPropertyTierBreakdown(newRows, resaleRows) {
  if (!Array.isArray(newRows) || newRows.length !== CHINA_PROPERTY_PRICE_CITY_COUNT) {
    throw new Error('nbs:china-property new-home rows incomplete for tier breakdown');
  }
  if (!Array.isArray(resaleRows) || resaleRows.length !== CHINA_PROPERTY_PRICE_CITY_COUNT) {
    throw new Error('nbs:china-property resale rows incomplete for tier breakdown');
  }
  const tierBreakdown = {};
  let totalCityCount = 0;
  for (const tier of CHINA_PROPERTY_PRICE_TIER_DEFINITIONS) {
    tierBreakdown[tier.key] = {
      label: tier.label,
      cityCount: tier.cityCount,
      new: groupChinaPropertyRowsByTier(newRows, tier),
      resale: groupChinaPropertyRowsByTier(resaleRows, tier)
    };
    totalCityCount += tier.cityCount;
  }
  if (totalCityCount !== CHINA_PROPERTY_PRICE_CITY_COUNT) {
    throw new Error(`nbs:china-property tier city count sum must be ${CHINA_PROPERTY_PRICE_CITY_COUNT}`);
  }
  return tierBreakdown;
}

function parseChinaPropertyPriceCountSet(tableText, label) {
  const rows = CHINA_PROPERTY_PRICE_CITIES.map((city) => {
    const cityPattern = flexibleChinaPropertyCityPattern(city);
    const re = new RegExp(`${cityPattern}\\s+(?<mom>\\d+(?:\\.\\d+)?)\\s+(?<yoy>\\d+(?:\\.\\d+)?)\\s+(?<avg>\\d+(?:\\.\\d+)?)`, 'u');
    const match = String(tableText || '').match(re);
    const mom = Number(match?.groups?.mom);
    return {
      city,
      mom: Number.isFinite(mom) ? mom : null,
      dir: Number.isFinite(mom) ? classifyChinaPropertyDirection(mom) : null
    };
  });
  const missing = rows.filter((row) => !Number.isFinite(row.mom)).map((row) => row.city);
  if (missing.length > 0) throw new Error(`nbs:china-property ${label} missing city rows: ${missing.join(',')}`);
  const invalidDirections = rows.filter((row) => !row.dir).map((row) => row.city);
  if (invalidDirections.length > 0) throw new Error(`nbs:china-property ${label} invalid city directions: ${invalidDirections.join(',')}`);
  const counts = countChinaPropertyRows(rows);
  if (!isChinaPropertyCountSetPlausible(counts.up, counts.flat, counts.down)) {
    throw new Error(`nbs:china-property ${label} invalid count set`);
  }
  return { ...counts, rows };
}

function isFreshChinaPropertyPrice(refMonth, publishedAt) {
  const publishedDate = dateOnlyIso(publishedAt);
  if (publishedDate) return isFreshDateOnly(publishedDate, CHINA_PROPERTY_PRICE_FRESH_DAYS);
  const refMonthEnd = endOfRefMonthDateOnly(refMonth);
  return isFreshDateOnly(refMonthEnd, CHINA_PROPERTY_PRICE_REF_FRESH_DAYS);
}

function parseChinaPropertyPriceArticle(articleHtml, link) {
  const plain = htmlToPlainText(articleHtml);
  const title = link?.title || String(plain || '').match(CHINA_PROPERTY_PRICE_TITLE_RE)?.[0] || '';
  const refMonth = parseChinaPropertyRefMonth(title) || parseChinaPropertyRefMonth(plain);
  const publishedAt = parseChinaPropertyPublishedAtFromPlain(plain) || link?.publishedAt || null;
  if (!refMonth) throw new Error('nbs:china-property missing refMonth');
  const newTableText = extractChinaPropertyTableSegment(
    plain,
    CHINA_PROPERTY_PRICE_TABLE_ANCHORS.newStart,
    CHINA_PROPERTY_PRICE_TABLE_ANCHORS.resaleStart,
    'new-home'
  );
  const resaleTableText = extractChinaPropertyTableSegment(
    plain,
    CHINA_PROPERTY_PRICE_TABLE_ANCHORS.resaleStart,
    CHINA_PROPERTY_PRICE_TABLE_ANCHORS.classifiedStart,
    'resale'
  );
  const newCounts = parseChinaPropertyPriceCountSet(newTableText, 'new-home');
  const resaleCounts = parseChinaPropertyPriceCountSet(resaleTableText, 'resale');
  let tierBreakdown = null;
  try {
    tierBreakdown = buildChinaPropertyTierBreakdown(newCounts.rows, resaleCounts.rows);
  } catch (err) {
    console.warn(`[china-property-tier-breakdown-missing] ${stringifyFetchError(err)}`);
  }
  if (!isFreshChinaPropertyPrice(refMonth, publishedAt)) throw new Error('nbs:china-property stale');
  return {
    updatedAt: publishedAt || dateOnlyToIso(endOfRefMonthDateOnly(refMonth)),
    source: CHINA_PROPERTY_PRICE_SOURCE,
    sourceStatus: 'live',
    notes: CHINA_PROPERTY_PRICE_DISPLAY_NOTE,
    refMonth,
    publishedAt,
    newCitiesUp: newCounts.up,
    newCitiesFlat: newCounts.flat,
    newCitiesDown: newCounts.down,
    resaleCitiesUp: resaleCounts.up,
    resaleCitiesFlat: resaleCounts.flat,
    resaleCitiesDown: resaleCounts.down,
    tierBreakdown
  };
}

function normalizePreviousChinaPropertyPrice(previous) {
  const counts = {
    newCitiesUp: normalizeChinaPropertyCount(previous?.newCitiesUp),
    newCitiesFlat: normalizeChinaPropertyCount(previous?.newCitiesFlat),
    newCitiesDown: normalizeChinaPropertyCount(previous?.newCitiesDown),
    resaleCitiesUp: normalizeChinaPropertyCount(previous?.resaleCitiesUp),
    resaleCitiesFlat: normalizeChinaPropertyCount(previous?.resaleCitiesFlat),
    resaleCitiesDown: normalizeChinaPropertyCount(previous?.resaleCitiesDown)
  };
  if (
    !isChinaPropertyCountSetPlausible(counts.newCitiesUp, counts.newCitiesFlat, counts.newCitiesDown)
    || !isChinaPropertyCountSetPlausible(counts.resaleCitiesUp, counts.resaleCitiesFlat, counts.resaleCitiesDown)
    || !isFreshChinaPropertyPrice(previous?.refMonth, previous?.publishedAt)
  ) {
    return null;
  }
  return {
    updatedAt: typeof previous?.updatedAt === 'string' ? previous.updatedAt : null,
    source: CHINA_PROPERTY_PRICE_SOURCE,
    sourceStatus: 'fallback',
    notes: CHINA_PROPERTY_PRICE_DISPLAY_NOTE,
    refMonth: typeof previous?.refMonth === 'string' ? previous.refMonth : null,
    publishedAt: typeof previous?.publishedAt === 'string' ? previous.publishedAt : null,
    tierBreakdown: null,
    ...counts
  };
}

function buildMissingChinaPropertyPrice(prevChinaPropertyPrice = null) {
  const fallback = normalizePreviousChinaPropertyPrice(prevChinaPropertyPrice);
  if (fallback) return fallback;
  return {
    updatedAt: null,
    source: CHINA_PROPERTY_PRICE_SOURCE,
    sourceStatus: 'missing',
    notes: CHINA_PROPERTY_PRICE_DISPLAY_NOTE,
    refMonth: null,
    publishedAt: null,
    newCitiesUp: null,
    newCitiesFlat: null,
    newCitiesDown: null,
    resaleCitiesUp: null,
    resaleCitiesFlat: null,
    resaleCitiesDown: null,
    tierBreakdown: null
  };
}

async function resolveChinaPropertyPrice(prevChinaPropertyPrice) {
  try {
    const indexHtmlList = await fetchChinaPropertyPriceIndexPages();
    const link = pickChinaPropertyPriceLink(indexHtmlList);
    if (!link) throw new Error('nbs:china-property missing index link');
    const articleHtml = await retryFetch(link.url, 'nbs:china-property-article', MACRO_FETCH_TIMEOUT_MS, {
      userAgent: CHINA_MACRO_HTML_USER_AGENT,
      headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
    });
    return parseChinaPropertyPriceArticle(articleHtml, link);
  } catch (err) {
    console.warn(`[china-property-price-missing] ${stringifyFetchError(err)}`);
    return buildMissingChinaPropertyPrice(prevChinaPropertyPrice);
  }
}
const CHINA_NBS_LINK_RE = /<a\b[^>]*href=['"](?<href>\.\/\d{6}\/t\d+_\d+\.html)['"][^>]*title=['"](?<title>[^'"]*(居民消费价格|工业生产者出厂价格|采购经理指数)[^'"]*)['"][^>]*>/giu;
const CHINA_NBS_REF_MONTH_RE = /(?<year>\d{4})\s*年\s*(?<month>\d{1,2})\s*月(?:份)?/u;
const CHINA_NBS_YOY_RE = /(?:全国)?(?:居民消费价格|工业生产者出厂价格)\s*同比\s*(?:(?<flat>持平)|(?<verb>上涨|增长|下降|降低)\s*(?<value>\d+(?:\.\d+)?)\s*%)/u;
const CHINA_NBS_PMI_RE = /制造业采购经理指数\s*（?\s*PMI\s*）?\s*为\s*(?<value>\d+(?:\.\d+)?)\s*%/u;

const CHINA_NBS_KEYWORDS = {
  cpi: '居民消费价格',
  ppi: '工业生产者出厂价格',
  pmi: '采购经理指数'
};

const CHINA_TE_CONFIG = {
  cpi: {
    url: TRADING_ECONOMICS_CHINA_CPI_URL,
    label: 'tradingeconomics:china-cpi',
    source: 'TradingEconomics:china-inflation-cpi-public-html',
    calendarRe: /Inflation Rate YoY\s+(?<month>[A-Za-z]{3,9})\s+(?<value>[-+]?\d+(?:\.\d+)?)%/iu,
    narrativeRe: /Inflation Rate in China[^.]*?(?:increased|decreased|rose|fell|was|remained unchanged)[^.]*?(?:to|at)\s+(?<value>[-+]?\d+(?:\.\d+)?)\s+percent\s+in\s+(?<month>[A-Za-z]+)(?:[^.]*?\bof\s+(?<year>\d{4}))?/iu,
    valueType: 'ratio'
  },
  ppi: {
    url: TRADING_ECONOMICS_CHINA_PPI_URL,
    label: 'tradingeconomics:china-ppi',
    source: 'TradingEconomics:china-producer-prices-change-public-html',
    calendarRe: /PPI YoY\s+(?<month>[A-Za-z]{3,9})\s+(?<value>[-+]?\d+(?:\.\d+)?)%/iu,
    narrativeRe: /Producer Prices in China[^.]*?(?:increased|decreased|rose|fell|was|remained unchanged)\s+(?:to\s+)?(?<value>[-+]?\d+(?:\.\d+)?)\s+percent\s+in\s+(?<month>[A-Za-z]+)(?:\s+of\s+(?<year>\d{4}))?/iu,
    valueType: 'ratio'
  },
  pmi: {
    url: TRADING_ECONOMICS_CHINA_NBS_PMI_URL,
    label: 'tradingeconomics:china-nbs-pmi',
    source: 'TradingEconomics:china-business-confidence-nbs-pmi-public-html',
    calendarRe: /NBS Manufacturing PMI\s+(?<month>[A-Za-z]{3,9})\s+(?<value>[-+]?\d+(?:\.\d+)?)/iu,
    narrativeRe: /Business Confidence in China[^.]*?(?:increased|decreased|rose|fell|was|remained unchanged)[^.]*?(?:to|at)\s+(?<value>[-+]?\d+(?:\.\d+)?)\s+points\s+in\s+(?<month>[A-Za-z]+)(?:[^.]*?\bof\s+(?<year>\d{4}))?/iu,
    valueType: 'points'
  }
};

function monthNumberToRefMonth(year, monthIndex) {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function parseChinaNbsRefMonth(title) {
  const match = String(title || '').match(CHINA_NBS_REF_MONTH_RE);
  if (!match?.groups) return null;
  return monthNumberToRefMonth(Number(match.groups.year), Number(match.groups.month) - 1);
}

function parseChinaNbsPublishedAt(href) {
  const match = String(href || '').match(/t(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})_/u);
  if (!match?.groups) return null;
  const dateOnly = `${match.groups.year}-${match.groups.month}-${match.groups.day}`;
  return dateOnlyToIso(dateOnly);
}

function endOfRefMonthDateOnly(refMonth) {
  const match = String(refMonth || '').match(/^(?<year>\d{4})-(?<month>\d{2})$/u);
  if (!match?.groups) return null;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month, 0));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function isFreshChinaMacro(refMonth, publishedAt) {
  const publishedDate = dateOnlyIso(publishedAt);
  const freshnessDate = publishedDate || endOfRefMonthDateOnly(refMonth);
  return isFreshDateOnly(freshnessDate, CHINA_MACRO_FRESH_DAYS);
}

function chinaMacroValuePlausible(kind, value) {
  if (!Number.isFinite(value)) return false;
  if (kind === 'cpi') return value >= -0.10 && value <= 0.30;
  if (kind === 'ppi') return value >= -0.30 && value <= 0.40;
  if (kind === 'pmi') return value >= 30 && value <= 70;
  return false;
}

function pickChinaNbsLink(indexHtmlList, kind) {
  const keyword = CHINA_NBS_KEYWORDS[kind];
  const rows = [];
  for (const html of indexHtmlList) {
    for (const match of String(html || '').matchAll(CHINA_NBS_LINK_RE)) {
      const title = match.groups?.title || '';
      const href = match.groups?.href || '';
      if (!title.includes(keyword)) continue;
      const refMonth = parseChinaNbsRefMonth(title);
      const publishedAt = parseChinaNbsPublishedAt(href);
      const url = resolveAbsoluteUrl(href, 'https://www.stats.gov.cn/sj/zxfb/');
      if (!refMonth || !url) continue;
      rows.push({ title, href, url, refMonth, publishedAt });
    }
  }
  return rows
    .filter((row, index, list) => list.findIndex((item) => item.url === row.url) === index)
    .sort((a, b) => {
      const refDiff = String(a.refMonth).localeCompare(String(b.refMonth));
      if (refDiff !== 0) return refDiff;
      return Date.parse(a.publishedAt || '1970-01-01T00:00:00Z') - Date.parse(b.publishedAt || '1970-01-01T00:00:00Z');
    })
    .at(-1) || null;
}

function parseChinaNbsYoyValue(plain, kind) {
  const match = String(plain || '').match(CHINA_NBS_YOY_RE);
  if (!match?.groups) throw new Error(`nbs:china-${kind} missing yoy value`);
  if (match.groups.flat) return 0;
  const raw = Number(match.groups.value);
  if (!Number.isFinite(raw)) throw new Error(`nbs:china-${kind} invalid yoy value`);
  const sign = /下降|降低/u.test(match.groups.verb || '') ? -1 : 1;
  return +((sign * raw) / 100).toFixed(4);
}

function parseChinaNbsPmiValue(plain) {
  const match = String(plain || '').match(CHINA_NBS_PMI_RE);
  const value = Number(match?.groups?.value);
  if (!Number.isFinite(value)) throw new Error('nbs:china-pmi missing pmi value');
  return +value.toFixed(1);
}

async function fetchChinaNbsIndexPages() {
  const pages = [];
  for (const url of CHINA_NBS_INDEX_URLS) {
    const html = await retryFetch(url, `nbs:china-index:${url}`, MACRO_FETCH_TIMEOUT_MS, {
      userAgent: CHINA_MACRO_HTML_USER_AGENT,
      headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
    });
    pages.push(html);
  }
  return pages;
}

async function fetchChinaNbsLeaf(kind, indexHtmlList) {
  const link = pickChinaNbsLink(indexHtmlList, kind);
  if (!link) throw new Error(`nbs:china-${kind} missing index link`);
  const articleHtml = await retryFetch(link.url, `nbs:china-${kind}-article`, MACRO_FETCH_TIMEOUT_MS, {
    userAgent: CHINA_MACRO_HTML_USER_AGENT,
    headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
  });
  const plain = htmlToPlainText(articleHtml);
  const value = kind === 'pmi'
    ? parseChinaNbsPmiValue(plain)
    : parseChinaNbsYoyValue(plain, kind);
  if (!chinaMacroValuePlausible(kind, value)) throw new Error(`nbs:china-${kind} implausible value`);
  if (!isFreshChinaMacro(link.refMonth, link.publishedAt)) throw new Error(`nbs:china-${kind} stale`);
  return {
    value,
    refMonth: link.refMonth,
    publishedAt: link.publishedAt,
    updatedAt: link.publishedAt,
    source: 'NBS:stats-zxfb',
    sourceStatus: 'live'
  };
}

function parseTeLastUpdateIso(html) {
  const match = String(html || '').match(/TELastUpdate\s*=\s*'(?<stamp>\d{8})\d*'/u);
  const stamp = match?.groups?.stamp;
  if (!stamp) return null;
  return dateOnlyToIso(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`);
}

function inferTeRefMonth(monthName, yearRaw, publishedAt) {
  const monthIndex = monthIndexFromName(monthName);
  if (!Number.isInteger(monthIndex)) return null;
  let year = Number(yearRaw);
  const publishedDate = dateOnlyIso(publishedAt);
  if (!Number.isInteger(year)) {
    year = Number(String(publishedDate || '').slice(0, 4));
    const publishedMonthIndex = Number(String(publishedDate || '').slice(5, 7)) - 1;
    if (Number.isInteger(publishedMonthIndex) && monthIndex > publishedMonthIndex) year -= 1;
  }
  return monthNumberToRefMonth(year, monthIndex);
}

function pickTeMetricMatch(plain, config) {
  return String(plain || '').match(config.calendarRe) || String(plain || '').match(config.narrativeRe);
}

async function fetchTradingEconomicsChinaLeaf(kind) {
  const config = CHINA_TE_CONFIG[kind];
  const html = await retryFetch(config.url, config.label, MACRO_FETCH_TIMEOUT_MS, {
    userAgent: CHINA_MACRO_HTML_USER_AGENT,
    headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
  });
  const plain = htmlToPlainText(html);
  const match = pickTeMetricMatch(plain, config);
  const rawValue = Number(match?.groups?.value);
  const publishedAt = parseTeLastUpdateIso(html);
  const refMonth = inferTeRefMonth(match?.groups?.month, match?.groups?.year, publishedAt);
  if (!Number.isFinite(rawValue) || !refMonth) throw new Error(`${config.label} missing latest value`);
  const value = config.valueType === 'ratio' ? +(rawValue / 100).toFixed(4) : +rawValue.toFixed(1);
  if (!chinaMacroValuePlausible(kind, value)) throw new Error(`${config.label} implausible value`);
  if (!isFreshChinaMacro(refMonth, publishedAt)) throw new Error(`${config.label} stale`);
  return {
    value,
    refMonth,
    publishedAt,
    updatedAt: publishedAt,
    source: config.source,
    sourceStatus: 'fallback'
  };
}

function buildMissingChinaInflationLeaf(kind, previousLeaf = null) {
  const previousValue = parseChinaOfficialNumber(previousLeaf?.yoy);
  const hasFallback = Number.isFinite(previousValue);
  return {
    yoy: hasFallback ? +previousValue.toFixed(4) : null,
    refMonth: typeof previousLeaf?.refMonth === 'string' ? previousLeaf.refMonth : null,
    publishedAt: typeof previousLeaf?.publishedAt === 'string' ? previousLeaf.publishedAt : null,
    updatedAt: typeof previousLeaf?.updatedAt === 'string' ? previousLeaf.updatedAt : null,
    source: typeof previousLeaf?.source === 'string' && previousLeaf.source.trim() ? previousLeaf.source : null,
    sourceStatus: hasFallback ? 'fallback' : 'missing'
  };
}

function buildMissingChinaInflation(prevChinaInflation = null) {
  const cpi = buildMissingChinaInflationLeaf('cpi', prevChinaInflation?.cpi);
  const ppi = buildMissingChinaInflationLeaf('ppi', prevChinaInflation?.ppi);
  return {
    updatedAt: latestIsoDate(cpi.updatedAt, ppi.updatedAt),
    source: CHINA_INFLATION_SOURCE,
    sourceStatus: { cpi: cpi.sourceStatus, ppi: ppi.sourceStatus },
    notes: CHINA_INFLATION_DISPLAY_NOTE,
    cpi,
    ppi
  };
}

function buildMissingChinaPmiLeaf(previousLeaf = null) {
  const previousValue = parseChinaOfficialNumber(previousLeaf?.value);
  const hasFallback = Number.isFinite(previousValue);
  return {
    value: hasFallback ? +previousValue.toFixed(1) : null,
    refMonth: typeof previousLeaf?.refMonth === 'string' ? previousLeaf.refMonth : null,
    publishedAt: typeof previousLeaf?.publishedAt === 'string' ? previousLeaf.publishedAt : null,
    updatedAt: typeof previousLeaf?.updatedAt === 'string' ? previousLeaf.updatedAt : null,
    source: typeof previousLeaf?.source === 'string' && previousLeaf.source.trim() ? previousLeaf.source : null,
    sourceStatus: hasFallback ? 'fallback' : 'missing'
  };
}

function buildMissingChinaPmi(prevChinaPmi = null) {
  const pmi = buildMissingChinaPmiLeaf(prevChinaPmi?.pmi);
  return {
    updatedAt: pmi.updatedAt,
    source: CHINA_PMI_SOURCE,
    sourceStatus: { pmi: pmi.sourceStatus },
    notes: CHINA_PMI_DISPLAY_NOTE,
    pmi
  };
}

async function resolveChinaInflationLeaf(kind, previousLeaf, indexHtmlList) {
  try {
    const nbs = await fetchChinaNbsLeaf(kind, indexHtmlList);
    return { ...nbs, yoy: nbs.value, value: undefined };
  } catch (err) {
    console.warn(`[china-inflation-${kind}-nbs-fallback] ${stringifyFetchError(err)}`);
  }
  try {
    const te = await fetchTradingEconomicsChinaLeaf(kind);
    return { ...te, yoy: te.value, value: undefined };
  } catch (err) {
    console.warn(`[china-inflation-${kind}-missing] ${stringifyFetchError(err)}`);
    return buildMissingChinaInflationLeaf(kind, previousLeaf);
  }
}

async function resolveChinaInflation(prevChinaInflation) {
  let indexHtmlList = [];
  try {
    indexHtmlList = await fetchChinaNbsIndexPages();
  } catch (err) {
    console.warn(`[china-inflation-nbs-index-fallback] ${stringifyFetchError(err)}`);
  }
  const fallback = buildMissingChinaInflation(prevChinaInflation);
  const [cpi, ppi] = await Promise.all([
    resolveChinaInflationLeaf('cpi', fallback.cpi, indexHtmlList),
    resolveChinaInflationLeaf('ppi', fallback.ppi, indexHtmlList)
  ]);
  return {
    updatedAt: latestIsoDate(cpi.updatedAt, ppi.updatedAt),
    source: CHINA_INFLATION_SOURCE,
    sourceStatus: { cpi: cpi.sourceStatus, ppi: ppi.sourceStatus },
    notes: CHINA_INFLATION_DISPLAY_NOTE,
    cpi,
    ppi
  };
}

async function resolveChinaPmi(prevChinaPmi) {
  let indexHtmlList = [];
  try {
    indexHtmlList = await fetchChinaNbsIndexPages();
    const nbs = await fetchChinaNbsLeaf('pmi', indexHtmlList);
    return {
      updatedAt: nbs.updatedAt,
      source: CHINA_PMI_SOURCE,
      sourceStatus: { pmi: nbs.sourceStatus },
      notes: CHINA_PMI_DISPLAY_NOTE,
      pmi: {
        value: nbs.value,
        refMonth: nbs.refMonth,
        publishedAt: nbs.publishedAt,
        updatedAt: nbs.updatedAt,
        source: nbs.source,
        sourceStatus: nbs.sourceStatus
      }
    };
  } catch (err) {
    console.warn(`[china-pmi-nbs-fallback] ${stringifyFetchError(err)}`);
  }
  try {
    const te = await fetchTradingEconomicsChinaLeaf('pmi');
    return {
      updatedAt: te.updatedAt,
      source: CHINA_PMI_SOURCE,
      sourceStatus: { pmi: te.sourceStatus },
      notes: CHINA_PMI_DISPLAY_NOTE,
      pmi: {
        value: te.value,
        refMonth: te.refMonth,
        publishedAt: te.publishedAt,
        updatedAt: te.updatedAt,
        source: te.source,
        sourceStatus: te.sourceStatus
      }
    };
  } catch (err) {
    console.warn(`[china-pmi-missing] ${stringifyFetchError(err)}`);
    return buildMissingChinaPmi(prevChinaPmi);
  }
}
function isPlausibleEuroVolatilityValue(value) {
  return Number.isFinite(value) && value >= EURO_VOLATILITY_MIN && value <= EURO_VOLATILITY_MAX;
}

function normalizeEuroVolatilityChangePct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? +(n / 100).toFixed(4) : null;
}

function normalizePreviousEuroVolatility(previous) {
  const value = finiteNumberOrNull(previous?.value);
  const refDate = dateOnlyIso(previous?.refDate);
  if (!isPlausibleEuroVolatilityValue(value) || !refDate || !isFreshBerlinDateOnly(refDate, EURO_VOLATILITY_FRESH_DAYS)) {
    return null;
  }
  return {
    updatedAt: typeof previous?.updatedAt === 'string' ? previous.updatedAt : null,
    source: EURO_VOLATILITY_SOURCE,
    sourceStatus: 'fallback',
    notes: EURO_VOLATILITY_DISPLAY_NOTE,
    value: +value.toFixed(4),
    refDate,
    changePct: Number.isFinite(previous?.changePct) ? +Number(previous.changePct).toFixed(4) : null
  };
}

function buildMissingEuroVolatility(prevEuroVolatility = null) {
  const fallback = normalizePreviousEuroVolatility(prevEuroVolatility);
  if (fallback) return fallback;
  return {
    updatedAt: null,
    source: EURO_VOLATILITY_SOURCE,
    sourceStatus: 'missing',
    notes: EURO_VOLATILITY_DISPLAY_NOTE,
    value: null,
    refDate: null,
    changePct: null
  };
}

function parseBoerseEuroVolatilityQuote(payload) {
  const value = finiteNumberOrNull(payload?.lastPrice);
  const timestampLastPrice = typeof payload?.timestampLastPrice === 'string' ? payload.timestampLastPrice : null;
  const refDate = timestampLastPrice ? berlinDateOnly(timestampLastPrice) : null;
  if (!isPlausibleEuroVolatilityValue(value) || !refDate || !isFreshBerlinDateOnly(refDate, EURO_VOLATILITY_FRESH_DAYS)) {
    throw new Error('boerse V2TX quote missing fresh plausible value/refDate');
  }
  return {
    updatedAt: new Date(timestampLastPrice).toISOString(),
    source: EURO_VOLATILITY_SOURCE,
    sourceStatus: 'live',
    notes: EURO_VOLATILITY_DISPLAY_NOTE,
    value: +value.toFixed(4),
    refDate,
    changePct: normalizeEuroVolatilityChangePct(payload?.changeToPrevDayInPercent)
  };
}

async function fetchBoerseEuroVolatilityQuote() {
  const payload = await fetchJsonText(
    EURO_VOLATILITY_QUOTE_URL,
    'deutsche-boerse:v2tx-quote-box',
    EURO_VOLATILITY_FETCH_TIMEOUT_MS,
    {
      userAgent: 'GFRRBot/1.0',
      headers: {
        Accept: 'application/json,text/plain,*/*'
      }
    }
  );
  return parseBoerseEuroVolatilityQuote(payload);
}

function parseStoxxEuroVolatilityHtml(html) {
  const raw = String(html || '');
  const plain = htmlToPlainText(raw);
  const valueMatch = raw.match(/id=["']overview-last-value["'][^>]*>\s*(?<value>[-+]?\d+(?:\.\d+)?)/u)
    || plain.match(/Last Value\s+(?<value>[-+]?\d+(?:\.\d+)?)/u);
  const changeMatch = raw.match(/class=["']data-daily-change-percent["'][^>]*>\s*(?<value>[-+]?\d+(?:\.\d+)?)/u)
    || plain.match(/Last Value\s+[-+]?\d+(?:\.\d+)?\s+[-+]?\d+(?:\.\d+)?\s+\(\s*(?<value>[-+]?\d+(?:\.\d+)?)\s*%\s*\)/u);
  const graphPairs = [...raw.matchAll(/\[(1[0-9]{12}),([0-9]+(?:\.[0-9]+)?)\]/g)]
    .map((match) => ({
      timestampMs: Number(match[1]),
      value: Number(match[2])
    }))
    .filter((point) => Number.isFinite(point.timestampMs) && isPlausibleEuroVolatilityValue(point.value));
  const latestPoint = graphPairs.at(-1) || null;
  const value = finiteNumberOrNull(valueMatch?.groups?.value);
  const refDate = latestPoint ? berlinDateOnly(latestPoint.timestampMs) : null;
  if (!isPlausibleEuroVolatilityValue(value) || !refDate || !isFreshBerlinDateOnly(refDate, EURO_VOLATILITY_FRESH_DAYS)) {
    throw new Error('stoxx V2TX page missing fresh plausible value/refDate');
  }
  return {
    updatedAt: new Date(latestPoint.timestampMs).toISOString(),
    source: EURO_VOLATILITY_SOURCE,
    sourceStatus: 'fallback',
    notes: EURO_VOLATILITY_DISPLAY_NOTE,
    value: +value.toFixed(4),
    refDate,
    changePct: normalizeEuroVolatilityChangePct(changeMatch?.groups?.value)
  };
}

async function fetchStoxxEuroVolatilityQuote() {
  const html = await retryFetch(
    EURO_VOLATILITY_STOXX_URL,
    'stoxx:v2tx-index-page',
    EURO_VOLATILITY_FETCH_TIMEOUT_MS,
    {
      userAgent: 'GFRRBot/1.0',
      headers: {
        Accept: 'text/html,*/*;q=0.8'
      }
    }
  );
  return parseStoxxEuroVolatilityHtml(html);
}

async function resolveEuroVolatility(prevEuroVolatility) {
  try {
    return await fetchBoerseEuroVolatilityQuote();
  } catch (err) {
    console.warn(`[euro-volatility-boerse-fallback] ${stringifyFetchError(err)}`);
  }
  try {
    return await fetchStoxxEuroVolatilityQuote();
  } catch (err) {
    console.warn(`[euro-volatility-missing] ${stringifyFetchError(err)}`);
    return buildMissingEuroVolatility(prevEuroVolatility);
  }
}
const MONTH_INDEX_BY_NAME = new Map([
  ['january', 0],
  ['february', 1],
  ['march', 2],
  ['april', 3],
  ['may', 4],
  ['june', 5],
  ['july', 6],
  ['august', 7],
  ['september', 8],
  ['october', 9],
  ['november', 10],
  ['december', 11]
]);

function monthIndexFromName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (MONTH_INDEX_BY_NAME.has(normalized)) return MONTH_INDEX_BY_NAME.get(normalized);
  const match = [...MONTH_INDEX_BY_NAME.entries()].find(([name]) => name.startsWith(normalized.slice(0, 3)));
  return match ? match[1] : null;
}

function parseBofaConsumerCheckpointReport(html, reportUrl) {
  const pdfMatch = String(html || '').match(/href=["'](?<href>[^"']*consumer-checkpoint[^"']+\.pdf)["']/iu);
  return parseBofaCheckpointMetrics(htmlToPlainText(html), {
    reportUrl,
    pdfUrl: resolveAbsoluteUrl(pdfMatch?.groups?.href, BOFA_CONSUMER_CHECKPOINT_BASE_URL)
  });
}

export async function fetchBofaConsumerCheckpoint() {
  const landingHtml = await retryFetch(
    BOFA_CONSUMER_CHECKPOINT_URL,
    'bofa:consumer-checkpoint-landing',
    BOFA_CONSUMER_FETCH_TIMEOUT_MS,
    { userAgent: 'Mozilla/5.0 GFRRBot/1.0' }
  );
  const reportUrl = selectLatestBofaCheckpointUrl(landingHtml);
  if (!reportUrl) throw new Error('bofa:consumer-checkpoint missing report link');
  const reportHtml = await retryFetch(
    reportUrl,
    'bofa:consumer-checkpoint-report',
    BOFA_CONSUMER_FETCH_TIMEOUT_MS,
    { userAgent: 'Mozilla/5.0 GFRRBot/1.0' }
  );
  return parseBofaConsumerCheckpointReport(reportHtml, reportUrl);
}

function parseMonthDayYearToIso(month, day, year) {
  const monthIndex = MONTH_INDEX_BY_NAME.get(String(month || '').toLowerCase());
  const dayNumber = Number(day);
  const yearNumber = Number(year);
  if (!Number.isInteger(monthIndex) || !Number.isInteger(dayNumber) || !Number.isInteger(yearNumber)) return null;
  const date = new Date(Date.UTC(yearNumber, monthIndex, dayNumber));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseTradingEconomicsRedbookIndex(html) {
  const plain = htmlToPlainText(html);
  const match = plain.match(
    /Redbook Index in the United States\s+(?<verb>increased|decreased)\s+by\s+(?<value>[-+]?\d+(?:\.\d+)?)\s+percent\s+in the week ending\s+(?<month>[A-Za-z]+)\s+(?<day>\d{1,2})\s+of\s+(?<year>\d{4})/iu
  );
  if (!match?.groups) throw new Error('tradingeconomics:redbook-index missing latest value');
  const rawValue = Number(match.groups.value);
  const valuePct = match.groups.verb.toLowerCase() === 'decreased' && rawValue > 0 ? -rawValue : rawValue;
  const redbookDate = parseMonthDayYearToIso(match.groups.month, match.groups.day, match.groups.year);
  if (!Number.isFinite(valuePct) || !redbookDate) {
    throw new Error('tradingeconomics:redbook-index invalid latest value');
  }
  const averageMatch = plain.match(/Redbook Index in the United States averaged\s+(?<average>[-+]?\d+(?:\.\d+)?)\s+percent/iu);
  const averagePct = Number(averageMatch?.groups?.average);
  return {
    redbookRetailSalesYoY: +(valuePct / 100).toFixed(4),
    redbookHistoricalAverageYoY: Number.isFinite(averagePct) ? +(averagePct / 100).toFixed(4) : null,
    redbookRetailSalesDate: redbookDate,
    redbookReportUrl: REDBOOK_INDEX_URL,
    redbookStatus: 'live',
    redbookSummary: `Trading Economics public HTML reports Redbook same-store sales YoY ${valuePct.toFixed(2)}% for week ending ${redbookDate.slice(0, 10)}; this is not the Redbook raw subscription feed.`
  };
}

async function fetchTradingEconomicsRedbookIndex() {
  const html = await retryFetch(
    REDBOOK_INDEX_URL,
    'tradingeconomics:redbook-index',
    REDBOOK_FETCH_TIMEOUT_MS,
    { userAgent: 'Mozilla/5.0 GFRRBot/1.0' }
  );
  return parseTradingEconomicsRedbookIndex(html);
}

function latestValue(rows) {
  return rows[rows.length - 1]?.value;
}

function findValueAgo(rows, days) {
  if (!rows.length) return null;
  const lastDate = rows[rows.length - 1]?.date;
  if (!lastDate) return null;
  const lastTime = Date.parse(`${lastDate}T00:00:00Z`);
  const targetTime = lastTime - days * 24 * 3600 * 1000;
  let best = null;
  let bestDiff = Infinity;
  for (const r of rows) {
    const t = Date.parse(`${r.date}T00:00:00Z`);
    const diff = Math.abs(t - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r.value;
    }
  }
  return best;
}

function findFredRowAgoWithin(rows, targetDaysAgo, maxGapDays) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { row: null, gapDays: null, ok: false };
  }
  const latest = rows[rows.length - 1];
  const latestMs = Date.parse(`${latest?.date}T00:00:00Z`);
  if (!Number.isFinite(latestMs)) {
    return { row: null, gapDays: null, ok: false };
  }
  const targetMs = latestMs - targetDaysAgo * 24 * 3600 * 1000;
  let best = null;
  let bestGap = Infinity;
  for (const r of rows) {
    const ms = Date.parse(`${r?.date}T00:00:00Z`);
    if (!Number.isFinite(ms) || !Number.isFinite(r?.value)) continue;
    const gap = Math.abs(ms - targetMs) / (24 * 3600 * 1000);
    if (gap < bestGap) {
      bestGap = gap;
      best = r;
    }
  }
  return {
    row: best,
    gapDays: Number.isFinite(bestGap) ? bestGap : null,
    ok: best !== null && bestGap <= maxGapDays
  };
}

function trimDiagnosticString(value, maxLength = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function decodeBasicHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&mdash;/gu, '-')
    .replace(/&ndash;/gu, '-')
    .replace(/&ldquo;|&rdquo;/gu, '"')
    .replace(/&lsquo;|&rsquo;/gu, "'");
}

function htmlToPlainText(html) {
  return decodeBasicHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/giu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function resolveFedUrl(pathOrUrl) {
  if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) return null;
  if (/^https?:\/\//iu.test(pathOrUrl)) return pathOrUrl;
  return `${FED_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function latestDatedFedLink(html, pattern) {
  const todayKey = isoNow.slice(0, 10).replace(/-/gu, '');
  const links = [...String(html || '').matchAll(pattern)]
    .map((match) => ({ href: match.groups?.href || null, date: match.groups?.date || null }))
    .filter((item) => item.href && /^\d{8}$/u.test(item.date) && item.date <= todayKey);
  if (!links.length) return null;
  links.sort((a, b) => a.date.localeCompare(b.date));
  return links[links.length - 1];
}

async function fetchLatestFedCalendarContext() {
  const html = await retryFetch(FED_CALENDAR_URL, 'federalreserve:fomc-calendar', FED_FETCH_TIMEOUT_MS, {
    userAgent: 'GFRRBot/1.0'
  });
  const statement = latestDatedFedLink(
    html,
    /href=["'](?<href>[^"']*newsevents\/pressreleases\/monetary(?<date>\d{8})a\.htm)["']/giu
  );
  const sep = latestDatedFedLink(
    html,
    /href=["'](?<href>[^"']*monetarypolicy\/fomcprojtabl(?<date>\d{8})\.htm)["']/giu
  );
  const minutes = latestDatedFedLink(
    html,
    /href=["'](?<href>[^"']*monetarypolicy\/fomcminutes(?<date>\d{8})\.htm)["']/giu
  );
  return { statement, sep, minutes };
}

function countTermMatches(text, terms) {
  const value = String(text || '').toLowerCase();
  return terms.reduce((count, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').toLowerCase();
    return count + (value.match(new RegExp(`\\b${escaped}\\b`, 'gu')) || []).length;
  }, 0);
}

function parseFedPolicyTone(html, statementUrl, statementDate) {
  const plain = htmlToPlainText(html);
  const targetRangeText = plain.match(/target range for the federal funds rate at [^.]+percent/iu)?.[0] || null;
  const hawkishTermCount = countTermMatches(plain, [
    'inflation',
    'elevated',
    'uncertainty',
    'risks',
    'restrictive',
    'returning',
    'strongly committed'
  ]);
  const dovishTermCount = countTermMatches(plain, [
    'unemployment',
    'employment',
    'job gains',
    'low',
    'easing',
    'weakened',
    'softening'
  ]);
  let policyTone = '平衡';
  if (hawkishTermCount >= dovishTermCount + 4) policyTone = '偏鹰';
  else if (dovishTermCount >= hawkishTermCount + 4) policyTone = '偏鸽';
  return {
    statementDate: parseDateToIso(statementDate?.replace(/^(\d{4})(\d{2})(\d{2})$/u, '$1-$2-$3')) || null,
    statementUrl,
    targetRangeText,
    hawkishTermCount,
    dovishTermCount,
    policyTone
  };
}

function buildFedMinutesSummary(tone, topicCounts) {
  const topics = Object.entries(topicCounts || {})
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => `${key}:${value}`);
  return `FOMC minutes keyword NLP 显示语气${tone}；高频主题 ${topics.join(' / ') || '待确认'}。`;
}

function parseFedMinutesTone(html, minutesUrl, minutesDate) {
  const plain = htmlToPlainText(html);
  const hawkishTermCount = countTermMatches(plain, [
    'inflation',
    'elevated',
    'upside risks',
    'restrictive',
    'tightening',
    'firming',
    'price pressures',
    'above 2 percent',
    'vigilant'
  ]);
  const dovishTermCount = countTermMatches(plain, [
    'unemployment',
    'downside risks',
    'weakened',
    'softening',
    'easing',
    'slowing',
    'lower inflation',
    'below trend',
    'labor market cooled'
  ]);
  const topicCounts = {
    inflation: countTermMatches(plain, ['inflation', 'prices', 'price pressures']),
    laborMarket: countTermMatches(plain, ['employment', 'unemployment', 'labor market', 'job gains']),
    growth: countTermMatches(plain, ['economic activity', 'growth', 'spending', 'output']),
    financialConditions: countTermMatches(plain, ['financial conditions', 'credit', 'funding', 'market conditions']),
    balanceSheet: countTermMatches(plain, ['balance sheet', 'treasury securities', 'agency debt', 'mortgage-backed securities']),
    risks: countTermMatches(plain, ['risks', 'uncertainty', 'downside risks', 'upside risks'])
  };
  let minutesPolicyTone = '平衡';
  if (hawkishTermCount >= dovishTermCount + 8) minutesPolicyTone = '偏鹰';
  else if (dovishTermCount >= hawkishTermCount + 8) minutesPolicyTone = '偏鸽';
  return {
    minutesDate: parseDateToIso(minutesDate?.replace(/^(\d{4})(\d{2})(\d{2})$/u, '$1-$2-$3')) || null,
    minutesUrl,
    minutesHawkishTermCount: hawkishTermCount,
    minutesDovishTermCount: dovishTermCount,
    minutesPolicyTone,
    minutesTopicCounts: topicCounts,
    minutesSummaryZh: buildFedMinutesSummary(minutesPolicyTone, topicCounts)
  };
}

function parseFedSepMedians(html, sepUrl, sepDate) {
  const fedFundsRow = extractHtmlRows(html)
    .map(extractHtmlCells)
    .find((cells) => /Federal funds rate/iu.test(cells[0] || ''));
  if (!fedFundsRow) throw new Error('federalreserve:SEP missing federal funds row');
  const medianCurrentYear = parseLooseNumber(fedFundsRow[1]);
  const medianNextYear = parseLooseNumber(fedFundsRow[2]);
  const medianTwoYearsOut = parseLooseNumber(fedFundsRow[3]);
  const medianLongerRun = parseLooseNumber(fedFundsRow[4]);
  if (![medianCurrentYear, medianNextYear, medianLongerRun].some(Number.isFinite)) {
    throw new Error('federalreserve:SEP federal funds medians unavailable');
  }
  return {
    sepProjectionDate: parseDateToIso(sepDate?.replace(/^(\d{4})(\d{2})(\d{2})$/u, '$1-$2-$3')) || null,
    sepUrl,
    dotPlotMedianCurrentYear: Number.isFinite(medianCurrentYear) ? medianCurrentYear : null,
    dotPlotMedianNextYear: Number.isFinite(medianNextYear) ? medianNextYear : null,
    dotPlotMedianTwoYearsOut: Number.isFinite(medianTwoYearsOut) ? medianTwoYearsOut : null,
    dotPlotMedianLongerRun: Number.isFinite(medianLongerRun) ? medianLongerRun : null
  };
}

function capitalizeMonth(month) {
  return typeof month === 'string' && month
    ? `${month.slice(0, 1).toUpperCase()}${month.slice(1).toLowerCase()}`
    : null;
}

function parseIsmReportLink(html) {
  ISM_REPORT_PATH_PATTERN.lastIndex = 0;
  const match = ISM_REPORT_PATH_PATTERN.exec(html);
  if (!match?.groups?.href || !match?.groups?.month) return null;
  return {
    href: match.groups.href,
    reportMonthLabel: capitalizeMonth(match.groups.month)
  };
}

function parseIsmReportHtml(html, reportUrl, reportMonthLabel) {
  const plain = htmlToPlainText(html);
  if (/grecaptcha|captcha_form|SSO\/Login\.aspx|ecommerce\.ismworld\.org/iu.test(html)) {
    return {
      status: 'parse_error',
      diagnostics: {
        parseStep: 'non-public-content',
        reportUrl,
        snippetSample: trimDiagnosticString(plain)
      }
    };
  }

  const headlineMatch = plain.match(/Manufacturing\s+PMI\s+at\s+(\d+(?:\.\d+)?)%/iu);
  if (!headlineMatch) {
    return {
      status: 'parse_error',
      diagnostics: {
        parseStep: 'report-no-headline-pmi',
        reportUrl,
        snippetSample: trimDiagnosticString(plain)
      }
    };
  }

  const latestPmi = Number(headlineMatch[1]);
  if (!Number.isFinite(latestPmi) || latestPmi < 0 || latestPmi > 100) {
    return {
      status: 'parse_error',
      diagnostics: {
        parseStep: 'report-invalid-headline-pmi',
        reportUrl,
        snippetSample: trimDiagnosticString(headlineMatch[0])
      }
    };
  }

  const last12Segment = plain.match(/THE LAST 12 MONTHS(?<segment>[\s\S]+?)(?:Average for 12 months|Commodities|Buying Policy|WHAT RESPONDENTS ARE SAYING|$)/iu)?.groups?.segment || '';
  const rows = [...last12Segment.matchAll(/([A-Z][a-z]{2}\s+\d{4})\s+(\d+(?:\.\d+)?)/gu)]
    .map((match) => ({ label: match[1], value: Number(match[2]) }))
    .filter((row) => Number.isFinite(row.value) && row.value >= 0 && row.value <= 100)
    .slice(0, 12);

  if (rows.length < 4) {
    return {
      status: 'parse_error',
      diagnostics: {
        parseStep: 'report-last-12-months-table',
        reportUrl,
        snippetSample: trimDiagnosticString(last12Segment || plain)
      }
    };
  }

  const value3MonthsAgo = rows[3]?.value;
  return {
    status: 'live',
    latestPmi,
    pmi3mChange: Number.isFinite(value3MonthsAgo) ? +(latestPmi - value3MonthsAgo).toFixed(1) : null,
    reportUrl,
    reportMonthLabel,
    last12Months: rows
  };
}

async function fetchIsmText(url, { userAgent, timeoutMs, label }) {
  let lastFailure = null;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {};
      if (userAgent) headers['User-Agent'] = userAgent;
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      const text = await res.text();
      const latencyMs = Date.now() - startedAt;
      if (res.ok) {
        return {
          ok: true,
          text,
          httpStatus: res.status,
          finalUrl: res.url,
          latencyMs
        };
      }
      lastFailure = {
        httpStatus: res.status,
        latencyMs,
        errorReason: `${label}: HTTP ${res.status}`
      };
    } catch (err) {
      lastFailure = {
        httpStatus: null,
        latencyMs: Date.now() - startedAt,
        errorReason: `${label}: ${err?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : stringifyFetchError(err)}`
      };
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await sleep(ISM_PMI_RETRY_DELAY_MS);
  }
  return {
    ok: false,
    diagnostics: lastFailure || {
      httpStatus: null,
      latencyMs: null,
      errorReason: `${label}: unknown fetch failure`
    }
  };
}

export async function fetchIsmManufacturingPmiReport(options = {}) {
  const userAgent = Object.hasOwn(options, 'userAgent') ? options.userAgent : ISM_PMI_USER_AGENT;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : ISM_PMI_FETCH_TIMEOUT_MS;
  const parsedAt = new Date().toISOString();

  const landing = await fetchIsmText(ISM_PMI_LANDING_URL, {
    userAgent,
    timeoutMs,
    label: 'ism-pmi-landing'
  });
  if (!landing.ok) {
    return {
      status: 'source_unavailable',
      diagnostics: {
        ...landing.diagnostics,
        parseStep: 'landing-fetch',
        parsedAt,
        reportUrl: ISM_PMI_LANDING_URL
      }
    };
  }
  if (/grecaptcha|captcha_form|SSO\/Login\.aspx|ecommerce\.ismworld\.org/iu.test(landing.text) || /SSO\/Login\.aspx|ecommerce\.ismworld\.org/iu.test(landing.finalUrl || '')) {
    return {
      status: 'parse_error',
      diagnostics: {
        httpStatus: landing.httpStatus,
        latencyMs: landing.latencyMs,
        parseStep: 'landing-non-public-content',
        parsedAt,
        reportUrl: landing.finalUrl || ISM_PMI_LANDING_URL,
        snippetSample: trimDiagnosticString(htmlToPlainText(landing.text))
      }
    };
  }

  const link = parseIsmReportLink(landing.text);
  if (!link) {
    return {
      status: 'parse_error',
      diagnostics: {
        httpStatus: landing.httpStatus,
        latencyMs: landing.latencyMs,
        parseStep: 'landing-no-current-link',
        parsedAt,
        reportUrl: ISM_PMI_LANDING_URL,
        snippetSample: trimDiagnosticString(htmlToPlainText(landing.text))
      }
    };
  }

  const reportUrl = new URL(link.href, ISM_PMI_LANDING_URL).toString();
  const report = await fetchIsmText(reportUrl, {
    userAgent,
    timeoutMs,
    label: 'ism-pmi-report'
  });
  if (!report.ok) {
    return {
      status: 'source_unavailable',
      diagnostics: {
        ...report.diagnostics,
        landingHttpStatus: landing.httpStatus,
        parseStep: 'report-fetch',
        parsedAt,
        reportUrl
      }
    };
  }

  const parsed = parseIsmReportHtml(report.text, report.finalUrl || reportUrl, link.reportMonthLabel);
  if (parsed.status !== 'live') {
    return {
      status: parsed.status,
      diagnostics: {
        httpStatus: report.httpStatus,
        landingHttpStatus: landing.httpStatus,
        latencyMs: landing.latencyMs + report.latencyMs,
        parsedAt,
        ...parsed.diagnostics
      }
    };
  }

  return {
    status: 'live',
    latestPmi: parsed.latestPmi,
    pmi3mChange: parsed.pmi3mChange,
    reportUrl: parsed.reportUrl,
    reportMonthLabel: parsed.reportMonthLabel,
    last12Months: parsed.last12Months,
    diagnostics: {
      httpStatus: report.httpStatus,
      landingHttpStatus: landing.httpStatus,
      latencyMs: landing.latencyMs + report.latencyMs,
      parsedAt,
      reportUrl: parsed.reportUrl,
      reportMonthLabel: parsed.reportMonthLabel
    }
  };
}

function classifyFedAssetTrend(pct4w) {
  if (!Number.isFinite(pct4w)) return '未知';
  const md = R.macroDrivers.fedLiquidity;
  if (pct4w <= md.walcl4wRapidContractionAlert) return '快速缩表';
  if (pct4w <= md.walcl4wContractionAlert) return '收缩中';
  if (pct4w >= md.walcl4wExpansionSignal) return '扩张';
  return '平稳';
}

function classifyOnRrpLevel(onRrp, weekChangePct) {
  if (!Number.isFinite(onRrp)) return '未知';
  const md = R.macroDrivers.fedLiquidity;
  if (onRrp < md.onRrpCriticalThreshold) return '告急';
  if (onRrp < md.onRrpTightThreshold) return '收紧';
  if (Number.isFinite(weekChangePct) && weekChangePct <= md.onRrpWeekRapidDropPct) return '快速消耗';
  return '充裕';
}

function classifyRepoSpreadRegime(bgcrSofrSpread) {
  if (!Number.isFinite(bgcrSofrSpread)) return '未知';
  const absBp = Math.abs(bgcrSofrSpread) * 100;
  if (absBp < 5) return '正常';
  if (absBp < 10) return '轻微偏离';
  if (absBp < 25) return '压力';
  return '危机水平';
}

function classifyCurveRegime(t10y2y) {
  if (!Number.isFinite(t10y2y)) return '未知';
  const md = R.macroDrivers.curve;
  if (t10y2y <= md.severeInversionThreshold) return '深度倒挂';
  if (t10y2y <= md.deepInversionThreshold) return '深度倒挂';
  if (t10y2y <= md.mildInversionThreshold) return '轻度倒挂';
  if (t10y2y <= md.inversionThreshold) return '平坦';
  return '正常';
}

function classifyCreditRegime(igOas) {
  if (!Number.isFinite(igOas)) return '未知';
  const md = R.macroDrivers.credit;
  if (igOas >= md.igOasCriticalThreshold) return '扩张';
  if (igOas >= md.igOasStressThreshold) return '偏紧';
  if (igOas >= md.igOasWatchThreshold) return '正常';
  return '偏宽松';
}

function classifySloosRegime(largeFirmsTightening) {
  if (!Number.isFinite(largeFirmsTightening)) return '未知';
  if (largeFirmsTightening >= 40) return '显著收紧';
  if (largeFirmsTightening >= 15) return '温和收紧';
  if (largeFirmsTightening >= -15) return '中性';
  return '放松';
}

function classifyNfciRegime(nfci) {
  if (!Number.isFinite(nfci)) return '未知';
  if (nfci >= 0.5) return '显著收紧';
  if (nfci >= 0.1) return '温和收紧';
  if (nfci >= -0.1) return '中性';
  if (nfci >= -0.5) return '温和宽松';
  return '显著宽松';
}

function classifyCrackSpreadRegime(crackSpread) {
  if (!Number.isFinite(crackSpread)) return '未知';
  if (crackSpread >= 45) return '供应紧张';
  if (crackSpread >= 25) return '偏高';
  if (crackSpread >= 10) return '正常';
  return '需求疲软';
}

function classifyConsumerRegime(threeMonthChange) {
  if (!Number.isFinite(threeMonthChange)) return '未知';
  if (threeMonthChange <= -8) return '明显走弱';
  if (threeMonthChange <= -4) return '走弱';
  if (threeMonthChange >= 6) return '改善';
  return '稳定';
}

function classifyPmiRegime(pmi) {
  if (!Number.isFinite(pmi)) return '未知';
  if (pmi >= 55) return '扩张';
  if (pmi >= 50) return '中性偏扩张';
  if (pmi >= 45) return '收缩';
  return '深度收缩';
}

function classifyRetailRegime(cartsRealYoY, redbookRetailSalesYoY = null) {
  const primaryYoY = Number.isFinite(cartsRealYoY) ? cartsRealYoY : redbookRetailSalesYoY;
  if (!Number.isFinite(primaryYoY)) return '未知';
  if (primaryYoY <= -0.03) return '明显走弱';
  if (primaryYoY < 0) return '走弱';
  if (primaryYoY >= 0.06) return '强劲';
  if (primaryYoY >= 0.03) return '改善';
  return '稳定';
}

function classifyCreStressRegime(creDelinquencyRate, creChargeOffRate, sloosCreTighteningMax) {
  const hasAny = Number.isFinite(creDelinquencyRate)
    || Number.isFinite(creChargeOffRate)
    || Number.isFinite(sloosCreTighteningMax);
  if (!hasAny) return '未知';
  if ((Number.isFinite(creDelinquencyRate) && creDelinquencyRate >= 4)
      || (Number.isFinite(creChargeOffRate) && creChargeOffRate >= 1)
      || (Number.isFinite(sloosCreTighteningMax) && sloosCreTighteningMax >= 35)) {
    return '恶化';
  }
  if ((Number.isFinite(creDelinquencyRate) && creDelinquencyRate >= 2)
      || (Number.isFinite(creChargeOffRate) && creChargeOffRate >= 0.35)
      || (Number.isFinite(sloosCreTighteningMax) && sloosCreTighteningMax >= 15)) {
    return '紧绷';
  }
  const hasAll = Number.isFinite(creDelinquencyRate)
    && Number.isFinite(creChargeOffRate)
    && Number.isFinite(sloosCreTighteningMax);
  if (hasAll && creDelinquencyRate <= 1 && creChargeOffRate <= 0.1 && sloosCreTighteningMax <= -10) {
    return '改善';
  }
  if (hasAll && creDelinquencyRate <= 1.25 && creChargeOffRate <= 0.2 && sloosCreTighteningMax <= 0) {
    return '宽松';
  }
  return '稳定';
}

function classifyRetailSegmentRegime(segmentDiffusionPct) {
  if (!Number.isFinite(segmentDiffusionPct)) return '未知';
  if (segmentDiffusionPct >= 70) return '广泛改善';
  if (segmentDiffusionPct >= 55) return '温和改善';
  if (segmentDiffusionPct >= 40) return '分化';
  return '广泛走弱';
}

function classifyPolicyExpectationRegime(futureMinusTargetMid, dotPlotMedianCurrentYear, targetMid) {
  const hasFuture = Number.isFinite(futureMinusTargetMid);
  const hasSep = Number.isFinite(dotPlotMedianCurrentYear) && Number.isFinite(targetMid);
  if (!hasFuture && !hasSep) return '未知';
  if ((hasFuture && futureMinusTargetMid <= -0.35) || (hasSep && dotPlotMedianCurrentYear <= targetMid - 0.35)) {
    return '降息预期';
  }
  if ((hasFuture && futureMinusTargetMid >= 0.35) || (hasSep && dotPlotMedianCurrentYear >= targetMid + 0.35)) {
    return '加息/更高更久';
  }
  return '区间震荡';
}

function buildFedFundsFuturesCurve(contracts, targetMid) {
  const normalizedContracts = (Array.isArray(contracts) ? contracts : [])
    .map((contract) => {
      const impliedRate = Number.isFinite(contract.price) ? +(100 - contract.price).toFixed(3) : null;
      return {
        symbol: contract.symbol,
        contractMonth: contract.contractMonth,
        price: contract.price,
        impliedRate,
        impliedMinusTargetMid: Number.isFinite(impliedRate) && Number.isFinite(targetMid)
          ? +(impliedRate - targetMid).toFixed(3)
          : null,
        updatedAt: contract.updatedAt
      };
    })
    .filter((contract) => contract.symbol && contract.contractMonth && Number.isFinite(contract.price));
  if (normalizedContracts.length < 2) return buildMissingFedFundsFuturesCurve();
  const front = normalizedContracts[0];
  const back = normalizedContracts[normalizedContracts.length - 1];
  return {
    source: 'Yahoo:ZQ-monthly-futures',
    curveStatus: 'live_proxy_curve',
    updatedAt: latestIsoDate(...normalizedContracts.map((contract) => contract.updatedAt)),
    frontImpliedRate: Number.isFinite(front.impliedRate) ? front.impliedRate : null,
    backImpliedRate: Number.isFinite(back.impliedRate) ? back.impliedRate : null,
    frontMinusBack: Number.isFinite(front.impliedRate) && Number.isFinite(back.impliedRate)
      ? +(front.impliedRate - back.impliedRate).toFixed(3)
      : null,
    contracts: normalizedContracts,
    limitationZh: 'Yahoo 月度 Fed funds futures 为公开政策路径 proxy；不是 OIS forward rate。'
  };
}

function buildSofrFuturesCurve(contracts, targetMid) {
  const normalizedContracts = (Array.isArray(contracts) ? contracts : [])
    .map((contract) => {
      const impliedRate = Number.isFinite(contract.price) ? +(100 - contract.price).toFixed(3) : null;
      return {
        symbol: contract.symbol,
        contractMonth: contract.contractMonth,
        price: contract.price,
        impliedRate,
        impliedMinusTargetMid: Number.isFinite(impliedRate) && Number.isFinite(targetMid)
          ? +(impliedRate - targetMid).toFixed(3)
          : null,
        updatedAt: contract.updatedAt
      };
    })
    .filter((contract) => contract.symbol && contract.contractMonth && Number.isFinite(contract.price));
  if (normalizedContracts.length < 2) return buildMissingSofrFuturesCurve();
  const front = normalizedContracts[0];
  const back = normalizedContracts[normalizedContracts.length - 1];
  return {
    source: 'Yahoo:SR3-monthly-SOFR-futures',
    curveStatus: 'live_proxy_curve',
    updatedAt: latestIsoDate(...normalizedContracts.map((contract) => contract.updatedAt)),
    frontImpliedRate: Number.isFinite(front.impliedRate) ? front.impliedRate : null,
    backImpliedRate: Number.isFinite(back.impliedRate) ? back.impliedRate : null,
    frontMinusBack: Number.isFinite(front.impliedRate) && Number.isFinite(back.impliedRate)
      ? +(front.impliedRate - back.impliedRate).toFixed(3)
      : null,
    contracts: normalizedContracts,
    limitationZh: 'Yahoo 月度 SR3 Three-Month SOFR futures 为公开担保融资利率曲线 proxy；不是 OIS forward rate。'
  };
}

function classifyPrivateCreditProxyRegime(bdcEtf4wChange, hyOas) {
  if (!Number.isFinite(bdcEtf4wChange) && !Number.isFinite(hyOas)) return '未知';
  if ((Number.isFinite(bdcEtf4wChange) && bdcEtf4wChange <= -0.08)
      || (Number.isFinite(hyOas) && hyOas >= 5.5)) {
    return '压力上升';
  }
  if ((Number.isFinite(bdcEtf4wChange) && bdcEtf4wChange <= -0.03)
      || (Number.isFinite(hyOas) && hyOas >= 4.5)) {
    return '观察';
  }
  return '平稳';
}

function classifyPrivateCreditProxyRegimeExpanded(bdcEtf4wChange, pbdcEtf4wChange, seniorLoanEtf4wChange, intervalFundNav4wChange, hyOas) {
  const publicProxyChanges = [bdcEtf4wChange, pbdcEtf4wChange, seniorLoanEtf4wChange, intervalFundNav4wChange].filter(Number.isFinite);
  const worst = publicProxyChanges.length ? Math.min(...publicProxyChanges) : null;
  return classifyPrivateCreditProxyRegime(worst, hyOas);
}

function classifyCrePublicMarketProxyRegime(reitEtf4wChange, mortgageReitEtf4wChange, cmbsEtf4wChange = null) {
  const values = [reitEtf4wChange, mortgageReitEtf4wChange, cmbsEtf4wChange].filter(Number.isFinite);
  if (!values.length) return '未知';
  const worst = Math.min(...values);
  if (worst <= -0.08) return '市场压力上升';
  if (worst <= -0.03) return '观察';
  return '平稳';
}

function classifyClaimsRegime(initialClaims4wAverage, initialClaims4wChange) {
  if (!Number.isFinite(initialClaims4wAverage) && !Number.isFinite(initialClaims4wChange)) return '未知';
  if ((Number.isFinite(initialClaims4wAverage) && initialClaims4wAverage >= 260_000)
      || (Number.isFinite(initialClaims4wChange) && initialClaims4wChange >= 25_000)) {
    return '明显走弱';
  }
  if ((Number.isFinite(initialClaims4wAverage) && initialClaims4wAverage >= 230_000)
      || (Number.isFinite(initialClaims4wChange) && initialClaims4wChange >= 10_000)) {
    return '走弱';
  }
  if (Number.isFinite(initialClaims4wChange) && initialClaims4wChange <= -10_000
      && (!Number.isFinite(initialClaims4wAverage) || initialClaims4wAverage <= 225_000)) {
    return '改善';
  }
  return '稳定';
}

function classifyJoltsRegime(joltsOpenings, joltsOpeningsYoY) {
  if (!Number.isFinite(joltsOpenings) && !Number.isFinite(joltsOpeningsYoY)) return '未知';
  if ((Number.isFinite(joltsOpenings) && joltsOpenings >= 9_000_000)
      || (Number.isFinite(joltsOpeningsYoY) && joltsOpeningsYoY >= 0.08)) {
    return '紧张';
  }
  if ((Number.isFinite(joltsOpenings) && joltsOpenings < 6_500_000)
      || (Number.isFinite(joltsOpeningsYoY) && joltsOpeningsYoY <= -0.12)) {
    return '走弱';
  }
  if ((Number.isFinite(joltsOpenings) && joltsOpenings < 7_200_000)
      || (Number.isFinite(joltsOpeningsYoY) && joltsOpeningsYoY < -0.04)) {
    return '宽松';
  }
  return '平衡';
}

function classifyIndustryDiffusionRegime(industryPayrollDiffusionPct) {
  if (!Number.isFinite(industryPayrollDiffusionPct)) return '未知';
  if (industryPayrollDiffusionPct >= 70) return '广泛扩张';
  if (industryPayrollDiffusionPct >= 55) return '温和扩张';
  if (industryPayrollDiffusionPct >= 40) return '分化';
  return '收缩扩散';
}

function classifyLaborQualityRegime(averageHourlyEarningsYoY, u6Rate3mChange, industryPayrollDiffusionPct) {
  const hasWage = Number.isFinite(averageHourlyEarningsYoY);
  const hasU6 = Number.isFinite(u6Rate3mChange);
  const hasDiffusion = Number.isFinite(industryPayrollDiffusionPct);
  if (!hasWage && !hasU6 && !hasDiffusion) return '未知';
  if ((hasU6 && u6Rate3mChange >= 0.4) || (hasDiffusion && industryPayrollDiffusionPct < 40)) {
    return '降温';
  }
  if ((hasWage && averageHourlyEarningsYoY >= 0.04) && (!hasU6 || u6Rate3mChange <= 0.2)) {
    return '工资韧性';
  }
  if (hasDiffusion && industryPayrollDiffusionPct >= 55 && (!hasU6 || u6Rate3mChange <= 0.2)) {
    return '扩散改善';
  }
  return '平衡';
}

function computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange) {
  let pressure = 0;
  if (Number.isFinite(walcl4wChange)) {
    if (walcl4wChange <= -2) pressure += 40;
    else if (walcl4wChange <= -1) pressure += 25;
    else if (walcl4wChange <= -0.3) pressure += 10;
  }
  if (Number.isFinite(onRrp)) {
    const md = R.macroDrivers.fedLiquidity;
    if (onRrp < md.onRrpCriticalThreshold) pressure += 45;
    else if (onRrp < md.onRrpTightThreshold) pressure += 25;
  }
  if (Number.isFinite(onRrpWeekChange) && onRrpWeekChange <= -15) {
    pressure += 15;
  }
  return clamp(pressure);
}

async function resolveFedLiquidity(prevFed) {
  const status = {
    walcl: 'missing',
    onRrp: 'missing',
    effectiveFedFundsRate: 'missing',
    sofr: 'missing',
    reserveBalances: 'missing',
    bgcr: 'missing',
    tgcr: 'missing'
  };
  let walcl = null;
  let walcl4wChange = null;
  let onRrp = null;
  let onRrpWeekChange = null;
  let effectiveFedFundsRate = null;
  let sofr = null;
  let reserveBalances = null;
  let reserveBalances4wChange = null;
  let bgcr = null;
  let tgcr = null;
  let bgcrUpdatedAt = null;
  let tgcrUpdatedAt = null;
  let repoRatesSource = null;
  let nyFedSecuredRates = null;

  try {
    const rows = await fetchFredSeries('WALCL', 90);
    walcl = latestValue(rows);
    const ago = findValueAgo(rows, 28);
    if (Number.isFinite(walcl) && Number.isFinite(ago) && ago !== 0) {
      walcl4wChange = +(((walcl - ago) / ago) * 100).toFixed(3);
    }
    status.walcl = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.walcl)) {
      walcl = prevFed.walcl;
      walcl4wChange = Number.isFinite(prevFed.walcl4wChange) ? prevFed.walcl4wChange : null;
      status.walcl = 'fallback';
    } else {
      status.walcl = 'missing';
    }
  }

  try {
    const rows = await fetchFredSeries('RRPONTSYD', 30);
    onRrp = latestValue(rows);
    const ago = findValueAgo(rows, 7);
    if (Number.isFinite(onRrp) && Number.isFinite(ago) && ago !== 0) {
      onRrpWeekChange = +(((onRrp - ago) / ago) * 100).toFixed(3);
    }
    status.onRrp = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.onRrp)) {
      onRrp = prevFed.onRrp;
      onRrpWeekChange = Number.isFinite(prevFed.onRrpWeekChange) ? prevFed.onRrpWeekChange : null;
      status.onRrp = 'fallback';
    } else {
      status.onRrp = 'missing';
    }
  }

  // M-41: DFF gives direct Effective Federal Funds Rate evidence for the policy driver.
  try {
    const rows = await fetchFredSeries('DFF', 30);
    effectiveFedFundsRate = latestValue(rows);
    status.effectiveFedFundsRate = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.effectiveFedFundsRate)) {
      effectiveFedFundsRate = prevFed.effectiveFedFundsRate;
      status.effectiveFedFundsRate = 'fallback';
    } else {
      status.effectiveFedFundsRate = 'missing';
    }
  }

  // M-41: SOFR gives direct overnight secured funding evidence for fragility review.
  try {
    const rows = await fetchFredSeries('SOFR', 30);
    sofr = latestValue(rows);
    status.sofr = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.sofr)) {
      sofr = prevFed.sofr;
      status.sofr = 'fallback';
    } else {
      status.sofr = 'missing';
    }
  }

  // M-42: WRESBAL gives bank reserve-buffer quantity evidence; same weekly H.4.1 cadence as WALCL.
  try {
    const rows = await fetchFredSeries('WRESBAL', 90);
    reserveBalances = latestValue(rows);
    const ago = findValueAgo(rows, 28);
    if (Number.isFinite(reserveBalances) && Number.isFinite(ago) && ago !== 0) {
      reserveBalances4wChange = +(((reserveBalances - ago) / ago) * 100).toFixed(3);
    }
    status.reserveBalances = 'live';
  } catch (_err) {
    if (Number.isFinite(prevFed?.reserveBalances)) {
      reserveBalances = prevFed.reserveBalances;
      reserveBalances4wChange = Number.isFinite(prevFed.reserveBalances4wChange)
        ? prevFed.reserveBalances4wChange
        : null;
      status.reserveBalances = 'fallback';
    } else {
      status.reserveBalances = 'missing';
    }
  }

  // M-73: BGCR/TGCR are published through the NY Fed Markets secured rates API.
  // The old FRED BGCR/TGCR ids are not stable CSV ids, so missing must not render as 0bp.
  try {
    nyFedSecuredRates = await fetchNyFedSecuredRatesLatest();
  } catch (_err) {
    nyFedSecuredRates = null;
  }

  const bgcrRecord = nyFedSecuredRates?.BGCR || null;
  const tgcrRecord = nyFedSecuredRates?.TGCR || null;
  const nyFedSofrRecord = nyFedSecuredRates?.SOFR || null;

  if (bgcrRecord) {
    bgcr = bgcrRecord.percentRate;
    bgcrUpdatedAt = `${bgcrRecord.effectiveDate}T00:00:00Z`;
    repoRatesSource = NY_FED_SECURED_RATES_SOURCE;
    status.bgcr = 'live';
  } else if (Number.isFinite(prevFed?.bgcr)) {
    bgcr = prevFed.bgcr;
    bgcrUpdatedAt = typeof prevFed.bgcrUpdatedAt === 'string' ? prevFed.bgcrUpdatedAt : null;
    repoRatesSource = typeof prevFed.repoRatesSource === 'string' ? prevFed.repoRatesSource : null;
    status.bgcr = 'fallback';
  } else {
    status.bgcr = 'missing';
  }

  if (tgcrRecord) {
    tgcr = tgcrRecord.percentRate;
    tgcrUpdatedAt = `${tgcrRecord.effectiveDate}T00:00:00Z`;
    repoRatesSource = NY_FED_SECURED_RATES_SOURCE;
    status.tgcr = 'live';
  } else if (Number.isFinite(prevFed?.tgcr)) {
    tgcr = prevFed.tgcr;
    tgcrUpdatedAt = typeof prevFed.tgcrUpdatedAt === 'string' ? prevFed.tgcrUpdatedAt : null;
    repoRatesSource = typeof prevFed.repoRatesSource === 'string' ? prevFed.repoRatesSource : repoRatesSource;
    status.tgcr = 'fallback';
  } else {
    status.tgcr = 'missing';
  }

  if (!Number.isFinite(sofr) && nyFedSofrRecord) {
    sofr = nyFedSofrRecord.percentRate;
    status.sofr = 'live';
  }

  const bgcrSofrSpread = Number.isFinite(bgcr) && Number.isFinite(sofr)
    ? +(bgcr - sofr).toFixed(4)
    : null;
  const tgcrSofrSpread = Number.isFinite(tgcr) && Number.isFinite(sofr)
    ? +(tgcr - sofr).toFixed(4)
    : null;

  const regime = classifyFedAssetTrend(walcl4wChange);
  const rrpLevel = classifyOnRrpLevel(onRrp, onRrpWeekChange);
  const pressure = computeFedLiquidityPressure(walcl4wChange, onRrp, onRrpWeekChange);

  return {
    walcl: Number.isFinite(walcl) ? walcl : null,
    walcl4wChange: Number.isFinite(walcl4wChange) ? walcl4wChange : null,
    onRrp: Number.isFinite(onRrp) ? onRrp : null,
    onRrpWeekChange: Number.isFinite(onRrpWeekChange) ? onRrpWeekChange : null,
    effectiveFedFundsRate: Number.isFinite(effectiveFedFundsRate) ? effectiveFedFundsRate : null,
    sofr: Number.isFinite(sofr) ? sofr : null,
    reserveBalances: Number.isFinite(reserveBalances) ? reserveBalances : null,
    reserveBalances4wChange: Number.isFinite(reserveBalances4wChange) ? reserveBalances4wChange : null,
    bgcr: Number.isFinite(bgcr) ? bgcr : null,
    tgcr: Number.isFinite(tgcr) ? tgcr : null,
    bgcrUpdatedAt,
    tgcrUpdatedAt,
    repoRatesSource,
    bgcrSofrSpread,
    tgcrSofrSpread,
    repoSpreadRegime: classifyRepoSpreadRegime(bgcrSofrSpread),
    regime,
    onRrpLevel: rrpLevel,
    pressure,
    sourceStatus: status
  };
}

async function resolvePolicyExpectations(prevPolicy) {
  const fallback = normalizePreviousPolicyExpectations(prevPolicy);
  const status = {
    targetRange: 'missing',
    fedFundsFuture: 'missing',
    fedFundsFuturesCurve: 'missing',
    sofrFuturesCurve: 'missing',
    sepDotPlot: 'missing',
    policyStatement: 'missing',
    fomcMinutes: 'missing',
    oisForward: 'manual_required'
  };
  let targetLower = null;
  let targetUpper = null;
  let targetMid = null;
  let effectiveFedFundsRate = null;
  let targetUpdatedAt = null;
  let fedFundsFutureFrontPrice = null;
  let fedFundsFutureImpliedRate = null;
  let futureMinusTargetMid = null;
  let futureUpdatedAt = null;
  let fedFundsFuturesCurve = buildMissingFedFundsFuturesCurve();
  let sofrFuturesCurve = buildMissingSofrFuturesCurve();
  let oisForwardCurve = buildMissingOisForwardCurve();
  let sepData = null;
  let statementData = null;
  let minutesData = null;

  const [targetLowerResult, targetUpperResult, effrResult, futureResult, futuresCurveResult, sofrFuturesCurveResult, oisForwardCurveResult, calendarResult] = await Promise.allSettled([
    fetchFredSeries('DFEDTARL', 30),
    fetchFredSeries('DFEDTARU', 30),
    fetchFredSeries('DFF', 30),
    fetchYahooChartQuote('ZQ=F', '1mo', '1d'),
    fetchYahooMonthlyFuturesCurve({
      root: 'ZQ',
      suffix: '.CBT',
      startOffsetMonths: 1,
      monthsToScan: 12,
      maxContracts: 8
    }),
    fetchYahooMonthlyFuturesCurve({
      root: 'SR3',
      suffix: '.CME',
      startOffsetMonths: 1,
      monthsToScan: 12,
      maxContracts: 8
    }),
    fetchCheckMySwapUsdOisCurve(),
    fetchLatestFedCalendarContext()
  ]);

  if (targetLowerResult.status === 'fulfilled' && targetUpperResult.status === 'fulfilled') {
    targetLower = latestValue(targetLowerResult.value);
    targetUpper = latestValue(targetUpperResult.value);
    targetMid = Number.isFinite(targetLower) && Number.isFinite(targetUpper)
      ? +(((targetLower + targetUpper) / 2)).toFixed(3)
      : null;
    targetUpdatedAt = latestIsoDate(latestDateIso(targetLowerResult.value), latestDateIso(targetUpperResult.value));
    status.targetRange = Number.isFinite(targetMid) ? 'live' : 'missing';
  } else if (Number.isFinite(fallback.targetMid)) {
    targetLower = fallback.targetLower;
    targetUpper = fallback.targetUpper;
    targetMid = fallback.targetMid;
    targetUpdatedAt = fallback.targetUpdatedAt;
    status.targetRange = 'fallback';
  }

  if (effrResult.status === 'fulfilled') {
    effectiveFedFundsRate = latestValue(effrResult.value);
  } else if (Number.isFinite(fallback.effectiveFedFundsRate)) {
    effectiveFedFundsRate = fallback.effectiveFedFundsRate;
  }

  if (futureResult.status === 'fulfilled') {
    fedFundsFutureFrontPrice = futureResult.value.price;
    fedFundsFutureImpliedRate = +(100 - fedFundsFutureFrontPrice).toFixed(3);
    futureUpdatedAt = futureResult.value.updatedAt;
    status.fedFundsFuture = 'live';
  } else if (Number.isFinite(fallback.fedFundsFutureImpliedRate)) {
    fedFundsFutureFrontPrice = fallback.fedFundsFutureFrontPrice;
    fedFundsFutureImpliedRate = fallback.fedFundsFutureImpliedRate;
    futureUpdatedAt = fallback.futureUpdatedAt;
    status.fedFundsFuture = 'fallback';
  }

  if (Number.isFinite(fedFundsFutureImpliedRate) && Number.isFinite(targetMid)) {
    futureMinusTargetMid = +(fedFundsFutureImpliedRate - targetMid).toFixed(3);
  } else if (Number.isFinite(fallback.futureMinusTargetMid)) {
    futureMinusTargetMid = fallback.futureMinusTargetMid;
  }

  if (futuresCurveResult.status === 'fulfilled') {
    fedFundsFuturesCurve = buildFedFundsFuturesCurve(futuresCurveResult.value, targetMid);
    status.fedFundsFuturesCurve = fedFundsFuturesCurve.contracts.length ? 'live' : 'missing';
  } else if (Array.isArray(fallback.fedFundsFuturesCurve?.contracts) && fallback.fedFundsFuturesCurve.contracts.length) {
    fedFundsFuturesCurve = {
      ...normalizePreviousFedFundsFuturesCurve(fallback.fedFundsFuturesCurve),
      curveStatus: 'fallback_proxy_curve'
    };
    status.fedFundsFuturesCurve = 'fallback';
  }

  if (sofrFuturesCurveResult.status === 'fulfilled') {
    sofrFuturesCurve = buildSofrFuturesCurve(sofrFuturesCurveResult.value, targetMid);
    status.sofrFuturesCurve = sofrFuturesCurve.contracts.length ? 'live' : 'missing';
  } else if (Array.isArray(fallback.sofrFuturesCurve?.contracts) && fallback.sofrFuturesCurve.contracts.length) {
    sofrFuturesCurve = {
      ...normalizePreviousSofrFuturesCurve(fallback.sofrFuturesCurve),
      curveStatus: 'fallback_proxy_curve'
    };
    status.sofrFuturesCurve = 'fallback';
  }

  if (oisForwardCurveResult.status === 'fulfilled') {
    try {
      oisForwardCurve = buildOisForwardCurve(oisForwardCurveResult.value, targetMid);
      status.oisForward = oisForwardCurve.tenors.length ? 'live' : 'missing';
    } catch (_err) {
      oisForwardCurve = buildMissingOisForwardCurve();
    }
  } else if (Array.isArray(fallback.oisForwardCurve?.tenors) && fallback.oisForwardCurve.tenors.length) {
    oisForwardCurve = {
      ...normalizePreviousOisForwardCurve(fallback.oisForwardCurve),
      curveStatus: 'fallback_public_curve'
    };
    status.oisForward = 'fallback';
  }

  if (calendarResult.status === 'fulfilled') {
    const { sep, statement, minutes } = calendarResult.value;
    if (sep?.href) {
      try {
        const sepUrl = resolveFedUrl(sep.href);
        const sepHtml = await retryFetch(sepUrl, 'federalreserve:sep', FED_FETCH_TIMEOUT_MS, {
          userAgent: 'GFRRBot/1.0'
        });
        sepData = parseFedSepMedians(sepHtml, sepUrl, sep.date);
        status.sepDotPlot = 'live';
      } catch (_err) {
        sepData = null;
      }
    }
    if (statement?.href) {
      try {
        const statementUrl = resolveFedUrl(statement.href);
        const statementHtml = await retryFetch(statementUrl, 'federalreserve:fomc-statement', FED_FETCH_TIMEOUT_MS, {
          userAgent: 'GFRRBot/1.0'
        });
        statementData = parseFedPolicyTone(statementHtml, statementUrl, statement.date);
        status.policyStatement = 'live';
      } catch (_err) {
        statementData = null;
      }
    }
    if (minutes?.href) {
      try {
        const minutesUrl = resolveFedUrl(minutes.href);
        const minutesHtml = await retryFetch(minutesUrl, 'federalreserve:fomc-minutes', FED_FETCH_TIMEOUT_MS, {
          userAgent: 'GFRRBot/1.0'
        });
        minutesData = parseFedMinutesTone(minutesHtml, minutesUrl, minutes.date);
        status.fomcMinutes = 'live';
      } catch (_err) {
        minutesData = null;
      }
    }
  }

  if (!sepData && Number.isFinite(fallback.dotPlotMedianCurrentYear)) {
    sepData = {
      sepProjectionDate: fallback.sepProjectionDate,
      sepUrl: fallback.sepUrl,
      dotPlotMedianCurrentYear: fallback.dotPlotMedianCurrentYear,
      dotPlotMedianNextYear: fallback.dotPlotMedianNextYear,
      dotPlotMedianTwoYearsOut: fallback.dotPlotMedianTwoYearsOut,
      dotPlotMedianLongerRun: fallback.dotPlotMedianLongerRun
    };
    status.sepDotPlot = 'fallback';
  }
  if (!statementData && typeof fallback.statementUrl === 'string') {
    statementData = {
      statementDate: fallback.statementDate,
      statementUrl: fallback.statementUrl,
      targetRangeText: fallback.statementTargetRangeText,
      hawkishTermCount: fallback.hawkishTermCount,
      dovishTermCount: fallback.dovishTermCount,
      policyTone: fallback.policyTone
    };
    status.policyStatement = 'fallback';
  }
  if (!minutesData && typeof fallback.minutesUrl === 'string') {
    minutesData = {
      minutesDate: fallback.minutesDate,
      minutesUrl: fallback.minutesUrl,
      minutesHawkishTermCount: fallback.minutesHawkishTermCount,
      minutesDovishTermCount: fallback.minutesDovishTermCount,
      minutesPolicyTone: fallback.minutesPolicyTone,
      minutesTopicCounts: fallback.minutesTopicCounts,
      minutesSummaryZh: fallback.minutesSummaryZh
    };
    status.fomcMinutes = 'fallback';
  }

  const dotPlotMedianCurrentYear = Number.isFinite(sepData?.dotPlotMedianCurrentYear)
    ? sepData.dotPlotMedianCurrentYear
    : null;

  return {
    targetLower: Number.isFinite(targetLower) ? targetLower : null,
    targetUpper: Number.isFinite(targetUpper) ? targetUpper : null,
    targetMid: Number.isFinite(targetMid) ? targetMid : null,
    effectiveFedFundsRate: Number.isFinite(effectiveFedFundsRate) ? effectiveFedFundsRate : null,
    targetUpdatedAt,
    fedFundsFutureFrontPrice: Number.isFinite(fedFundsFutureFrontPrice) ? fedFundsFutureFrontPrice : null,
    fedFundsFutureImpliedRate: Number.isFinite(fedFundsFutureImpliedRate) ? fedFundsFutureImpliedRate : null,
    futureMinusTargetMid: Number.isFinite(futureMinusTargetMid) ? futureMinusTargetMid : null,
    futureUpdatedAt,
    fedFundsFuturesCurve,
    sofrFuturesCurve,
    oisForwardCurve,
    dotPlotMedianCurrentYear,
    dotPlotMedianNextYear: Number.isFinite(sepData?.dotPlotMedianNextYear) ? sepData.dotPlotMedianNextYear : null,
    dotPlotMedianTwoYearsOut: Number.isFinite(sepData?.dotPlotMedianTwoYearsOut) ? sepData.dotPlotMedianTwoYearsOut : null,
    dotPlotMedianLongerRun: Number.isFinite(sepData?.dotPlotMedianLongerRun) ? sepData.dotPlotMedianLongerRun : null,
    sepProjectionDate: sepData?.sepProjectionDate || null,
    sepUrl: sepData?.sepUrl || null,
    statementDate: statementData?.statementDate || null,
    statementUrl: statementData?.statementUrl || null,
    statementTargetRangeText: statementData?.targetRangeText || null,
    hawkishTermCount: Number.isFinite(statementData?.hawkishTermCount) ? statementData.hawkishTermCount : null,
    dovishTermCount: Number.isFinite(statementData?.dovishTermCount) ? statementData.dovishTermCount : null,
    policyTone: typeof statementData?.policyTone === 'string' ? statementData.policyTone : '未知',
    minutesDate: minutesData?.minutesDate || null,
    minutesUrl: minutesData?.minutesUrl || null,
    minutesHawkishTermCount: Number.isFinite(minutesData?.minutesHawkishTermCount) ? minutesData.minutesHawkishTermCount : null,
    minutesDovishTermCount: Number.isFinite(minutesData?.minutesDovishTermCount) ? minutesData.minutesDovishTermCount : null,
    minutesPolicyTone: typeof minutesData?.minutesPolicyTone === 'string' ? minutesData.minutesPolicyTone : '未知',
    minutesTopicCounts: minutesData?.minutesTopicCounts && typeof minutesData.minutesTopicCounts === 'object'
      ? minutesData.minutesTopicCounts
      : null,
    minutesSummaryZh: typeof minutesData?.minutesSummaryZh === 'string' ? minutesData.minutesSummaryZh : null,
    policyExpectationRegime: classifyPolicyExpectationRegime(futureMinusTargetMid, dotPlotMedianCurrentYear, targetMid),
    oisForwardRate: Number.isFinite(oisForwardCurve.oneYearRate) ? oisForwardCurve.oneYearRate : null,
    oisForwardStatus: status.oisForward,
    sourceStatus: status,
    updatedAt: latestIsoDate(targetUpdatedAt, futureUpdatedAt, fedFundsFuturesCurve?.updatedAt, sofrFuturesCurve?.updatedAt, oisForwardCurve?.updatedAt, sepData?.sepProjectionDate, statementData?.statementDate, minutesData?.minutesDate),
    source: POLICY_EXPECTATIONS_SOURCE,
    notes: [
      'Fed target range/DFF 来自 FRED；SEP federal funds median、statement 与 minutes 文本来自 federalreserve.gov。',
      'ZQ=F、ZQ 月度合约、SR3 月度 SOFR futures 与 CheckMySwap USD OIS public curve 为公开政策/融资曲线证据；不是 proprietary dealer forward curve。'
    ]
  };
}

async function resolveCurve(prevCurve) {
  const status = { t10y2y: 'missing' };
  let t10y2y = null;
  let weekChange = null;
  try {
    const rows = await fetchFredSeries('T10Y2Y', 30);
    t10y2y = latestValue(rows);
    const ago = findValueAgo(rows, 7);
    if (Number.isFinite(t10y2y) && Number.isFinite(ago)) {
      weekChange = +(t10y2y - ago).toFixed(3);
    }
    status.t10y2y = 'live';
  } catch (_err) {
    if (Number.isFinite(prevCurve?.t10y2y)) {
      t10y2y = prevCurve.t10y2y;
      weekChange = Number.isFinite(prevCurve.t10y2yWeekChange) ? prevCurve.t10y2yWeekChange : null;
      status.t10y2y = 'fallback';
    }
  }

  const regime = classifyCurveRegime(t10y2y);
  const md = R.macroDrivers.curve;
  const steepeningAlert = Number.isFinite(t10y2y) && Number.isFinite(weekChange)
    && t10y2y < md.inversionThreshold
    && weekChange >= md.steepeningWeekChangeThreshold;

  return {
    t10y2y: Number.isFinite(t10y2y) ? t10y2y : null,
    t10y2yWeekChange: Number.isFinite(weekChange) ? weekChange : null,
    regime,
    steepeningAlert,
    sourceStatus: status
  };
}

const RATE_VOL_YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EMOVE?range=5d&interval=1d';

function classifyMoveRegime(move) {
  const cfg = R.macroDrivers.rateVol;
  if (!Number.isFinite(move)) return '未知';
  if (move >= cfg.crisisThreshold) return '危机';
  if (move >= cfg.stressThreshold) return '应激';
  if (move >= cfg.elevatedThreshold) return '偏高';
  return '平静';
}

// 债券/利率波动率 MOVE 结构源（Yahoo 日频 ^MOVE）。display + 评分例外结构信号。
// 合理性闸门 + freshness + fail-closed-with-visibility：坏值/超龄不让信号触发；取数失败仅在上一轮值仍
// fresh 时 carry last-good（避免真危机因瞬时取数失败漏报），否则 fail-closed（move=null, 不触发）并写明 stale。
// 仅 >=140 应激 / >=160 危机时进结构门控；平静（<140）零影响打分。
async function resolveRateVol(prevRateVol) {
  const cfg = R.macroDrivers.rateVol;
  const status = { move: 'missing' };
  let move = null;
  let moveUpdatedAt = null;
  let moveAgeDays = null;
  let freshnessStatus = 'missing';

  try {
    const payload = await fetchJsonText(RATE_VOL_YAHOO_URL, 'yahoo:^MOVE', YAHOO_FETCH_TIMEOUT_MS, {
      userAgent: 'Mozilla/5.0 GFRRBot/1.0'
    });
    const result = payload?.chart?.result?.[0];
    const meta = result?.meta || {};
    if (meta.instrumentType !== 'INDEX') throw new Error(`instrument_type_invalid:${meta.instrumentType ?? 'missing'}`);
    const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
    const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
    let latest = null;
    let latestTs = null;
    for (let i = closes.length - 1; i >= 0; i -= 1) {
      const c = Number(closes[i]);
      if (Number.isFinite(c) && c > 0) { latest = c; latestTs = Number(timestamps[i]); break; }
    }
    if (latest === null || !Number.isFinite(latestTs)) throw new Error('no_numeric_close');
    if (latest < cfg.plausibleMin || latest > cfg.plausibleMax) throw new Error(`implausible:${latest}`);
    const ageDays = (Date.now() - latestTs * 1000) / 86400000;
    moveUpdatedAt = new Date(latestTs * 1000).toISOString();
    moveAgeDays = +ageDays.toFixed(2);
    if (ageDays > cfg.maxAgeDays) {
      freshnessStatus = 'stale';
      status.move = 'stale';
      move = null;
    } else {
      move = +latest.toFixed(2);
      freshnessStatus = 'fresh';
      status.move = 'live';
    }
  } catch (_err) {
    const prevMove = Number(prevRateVol?.move);
    const prevTs = prevRateVol?.moveUpdatedAt ? Date.parse(prevRateVol.moveUpdatedAt) : NaN;
    const prevAgeDays = Number.isFinite(prevTs) ? (Date.now() - prevTs) / 86400000 : Infinity;
    if (Number.isFinite(prevMove) && prevMove >= cfg.plausibleMin && prevMove <= cfg.plausibleMax && prevAgeDays <= cfg.maxAgeDays) {
      move = +prevMove.toFixed(2);
      moveUpdatedAt = prevRateVol.moveUpdatedAt;
      moveAgeDays = +prevAgeDays.toFixed(2);
      freshnessStatus = 'fallback-fresh';
      status.move = 'fallback';
    } else {
      move = null;
      freshnessStatus = 'stale';
      status.move = 'missing';
    }
  }

  return {
    move: Number.isFinite(move) ? move : null,
    moveUpdatedAt,
    moveAgeDays,
    moveRegime: classifyMoveRegime(move),
    freshnessStatus,
    source: 'Yahoo:^MOVE',
    sourceStatus: status,
    notes: '债券/利率波动率 MOVE 结构信号 evidence（Yahoo ^MOVE 日频）。仅在 >=140 应激/>=160 危机时进结构门控翻黄/红；平静时不影响打分。display + 评分例外结构源，非第七模块，与 World Order overlay 无关。'
  };
}

async function resolveCredit(prevCredit, hyOasLive) {
  const status = { igOas: 'missing', sloos: 'missing', nfci: 'missing' };
  let igOas = null;
  let igOas1dChange = null;
  let sloosTighteningLargeFirms = null;
  let sloosTighteningSmallFirms = null;
  let sloosTighteningLargeQoQ = null;
  let sloosTighteningSmallQoQ = null;
  let nfci = null;
  let nfci4wChange = null;
  try {
    const rows = await fetchFredSeries('BAMLC0A0CM', 30);
    igOas = latestValue(rows);
    if (rows.length >= 2) {
      const prev = rows[rows.length - 2].value;
      if (Number.isFinite(igOas) && Number.isFinite(prev)) {
        igOas1dChange = +(igOas - prev).toFixed(3);
      }
    }
    status.igOas = 'live';
  } catch (_err) {
    if (Number.isFinite(prevCredit?.igOas)) {
      igOas = prevCredit.igOas;
      igOas1dChange = Number.isFinite(prevCredit.igOas1dChange) ? prevCredit.igOas1dChange : null;
      status.igOas = 'fallback';
    }
  }

  // M-46: Series 2 — DRTSCILM (SLOOS Large/Medium C&I tightening, quarterly, net %)
  // Uses 180-day lookback because SLOOS is quarterly (need to capture latest + previous quarter).
  try {
    const rows = await fetchFredSeries('DRTSCILM', 180);
    sloosTighteningLargeFirms = latestValue(rows);
    const ago = findValueAgo(rows, 90);
    if (Number.isFinite(sloosTighteningLargeFirms) && Number.isFinite(ago)) {
      sloosTighteningLargeQoQ = +(sloosTighteningLargeFirms - ago).toFixed(1);
    }
    status.sloos = 'live';
  } catch (_err) {
    if (Number.isFinite(prevCredit?.sloosTighteningLargeFirms)) {
      sloosTighteningLargeFirms = prevCredit.sloosTighteningLargeFirms;
      sloosTighteningLargeQoQ = Number.isFinite(prevCredit.sloosTighteningLargeQoQ)
        ? prevCredit.sloosTighteningLargeQoQ
        : null;
      status.sloos = 'fallback';
    } else {
      status.sloos = 'missing';
    }
  }

  // M-46: Series 3 — DRTSCIS (SLOOS Small Firms C&I tightening, quarterly, net %)
  // Same SLOOS survey, separate series. If first fetch succeeded, this should too.
  try {
    const rows = await fetchFredSeries('DRTSCIS', 180);
    sloosTighteningSmallFirms = latestValue(rows);
    const ago = findValueAgo(rows, 90);
    if (Number.isFinite(sloosTighteningSmallFirms) && Number.isFinite(ago)) {
      sloosTighteningSmallQoQ = +(sloosTighteningSmallFirms - ago).toFixed(1);
    }
  } catch (_err) {
    if (Number.isFinite(prevCredit?.sloosTighteningSmallFirms)) {
      sloosTighteningSmallFirms = prevCredit.sloosTighteningSmallFirms;
      sloosTighteningSmallQoQ = Number.isFinite(prevCredit.sloosTighteningSmallQoQ)
        ? prevCredit.sloosTighteningSmallQoQ
        : null;
    }
  }

  // M-48: NFCI (Chicago Fed National Financial Conditions Index, weekly).
  // 60-day lookback covers ~8 weeks for 4-week change calculation.
  try {
    const rows = await fetchFredSeries('NFCI', 60);
    nfci = latestValue(rows);
    const ago = findValueAgo(rows, 28);
    if (Number.isFinite(nfci) && Number.isFinite(ago)) {
      nfci4wChange = +(nfci - ago).toFixed(3);
    }
    status.nfci = 'live';
  } catch (_err) {
    if (Number.isFinite(prevCredit?.nfci)) {
      nfci = prevCredit.nfci;
      nfci4wChange = Number.isFinite(prevCredit.nfci4wChange) ? prevCredit.nfci4wChange : null;
      status.nfci = 'fallback';
    } else {
      status.nfci = 'missing';
    }
  }

  const regime = classifyCreditRegime(igOas);
  const igHyRatio = Number.isFinite(igOas) && Number.isFinite(hyOasLive) && hyOasLive !== 0
    ? +(igOas / hyOasLive).toFixed(3)
    : null;

  return {
    igOas: Number.isFinite(igOas) ? igOas : null,
    igOas1dChange: Number.isFinite(igOas1dChange) ? igOas1dChange : null,
    igHyRatio,
    regime,
    sloosTighteningLargeFirms: Number.isFinite(sloosTighteningLargeFirms) ? sloosTighteningLargeFirms : null,
    sloosTighteningSmallFirms: Number.isFinite(sloosTighteningSmallFirms) ? sloosTighteningSmallFirms : null,
    sloosTighteningLargeQoQ: Number.isFinite(sloosTighteningLargeQoQ) ? sloosTighteningLargeQoQ : null,
    sloosTighteningSmallQoQ: Number.isFinite(sloosTighteningSmallQoQ) ? sloosTighteningSmallQoQ : null,
    sloosRegime: classifySloosRegime(sloosTighteningLargeFirms),
    nfci: Number.isFinite(nfci) ? nfci : null,
    nfci4wChange: Number.isFinite(nfci4wChange) ? nfci4wChange : null,
    nfciRegime: classifyNfciRegime(nfci),
    sourceStatus: status
  };
}

// M-49: NY Harbor ULSD Spot Price (FRED:DHOILNYH, daily, $/gallon)
// Used to compute diesel crack spread = DHOILNYH x 42 - Brent ($/barrel).
async function resolveUlsd(prevBrentPricingLayer) {
  let ulsdPrice = null;
  let ulsd4wChange = null;
  let status = 'missing';

  try {
    // 60-day lookback covers about 43 trading days for 4-week change calculation.
    const rows = await fetchFredSeries('DHOILNYH', 60);
    ulsdPrice = latestValue(rows);
    const ago = findValueAgo(rows, 28);
    if (Number.isFinite(ulsdPrice) && Number.isFinite(ago)) {
      ulsd4wChange = +(ulsdPrice - ago).toFixed(3);
    }
    status = 'live';
  } catch (_err) {
    if (Number.isFinite(prevBrentPricingLayer?.ulsdPrice)) {
      ulsdPrice = prevBrentPricingLayer.ulsdPrice;
      ulsd4wChange = Number.isFinite(prevBrentPricingLayer?.ulsd4wChange)
        ? prevBrentPricingLayer.ulsd4wChange
        : null;
      status = 'fallback';
    }
  }

  return {
    ulsdPrice: Number.isFinite(ulsdPrice) ? ulsdPrice : null,
    ulsd4wChange: Number.isFinite(ulsd4wChange) ? ulsd4wChange : null,
    sourceStatus: status
  };
}

function buildMissingConsumer() {
  return {
    umichSentiment: null,
    previousValue: null,
    threeMonthChange: null,
    sixMonthChange: null,
    regime: '未知',
    ismManufacturingPmi: null,
    ismManufacturingPmi3mChange: null,
    ismPmiRegime: '未知',
    sourceStatus: {
      umichSentiment: 'missing',
      pmi: 'source_unavailable'
    },
    diagnostics: {
      pmi: {
        errorReason: 'consumer-sentiment-fetch-failed-before-pmi',
        parsedAt: isoNow
      }
    },
    updatedAt: null,
    source: 'FRED:UMCSENT; ISM:ManufacturingPMI',
    notes: ['UMCSENT 为 FRED 月频；ISM Manufacturing PMI 直接解析 ismworld.org 公开报告页，audit-only。']
  };
}

function averageRecentValues(rows, count, offset = 0) {
  if (!Array.isArray(rows) || rows.length < count + offset) return null;
  const slice = rows.slice(rows.length - count - offset, rows.length - offset);
  if (slice.length !== count || slice.some((row) => !Number.isFinite(row.value))) return null;
  return +(slice.reduce((sum, row) => sum + row.value, 0) / count).toFixed(3);
}

function latestDateIso(rows) {
  const latest = Array.isArray(rows) ? rows[rows.length - 1] : null;
  return latest?.date ? `${latest.date}T00:00:00Z` : null;
}

function latestIsoDate(...values) {
  const valid = values
    .filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return valid[0] || null;
}

function findMonthlyValueAgo(rows, monthsBack) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  if (!latest?.date) return null;
  const latestDate = new Date(`${latest.date}T00:00:00Z`);
  const targetYear = latestDate.getUTCFullYear();
  const targetMonth = latestDate.getUTCMonth() - monthsBack;
  const target = new Date(Date.UTC(targetYear, targetMonth, 1));
  const targetKey = target.toISOString().slice(0, 7);
  const matched = rows.find((row) => typeof row.date === 'string' && row.date.slice(0, 7) === targetKey);
  return Number.isFinite(matched?.value) ? matched.value : findValueAgo(rows, 365);
}

function calculateWeeklyYoY(rows) {
  const current = latestValue(rows);
  const yearAgo = findValueAgo(rows, 52 * 7);
  return Number.isFinite(current) && Number.isFinite(yearAgo) && yearAgo > 0
    ? +(((current - yearAgo) / yearAgo)).toFixed(4)
    : null;
}

function calculateMonthlyYoY(rows) {
  const current = latestValue(rows);
  const yearAgo = findMonthlyValueAgo(rows, 12);
  return Number.isFinite(current) && Number.isFinite(yearAgo) && yearAgo !== 0
    ? +(((current - yearAgo) / yearAgo)).toFixed(4)
    : null;
}

function calculateMonthlyDelta(rows, monthsBack) {
  const current = latestValue(rows);
  const ago = findMonthlyValueAgo(rows, monthsBack);
  return Number.isFinite(current) && Number.isFinite(ago)
    ? +(current - ago).toFixed(3)
    : null;
}

function calculateIndustryPayrollDiffusion(seriesResults) {
  const valid = [];
  const positive = [];
  const updatedAtValues = [];
  seriesResults.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const rows = result.value;
    if (!Array.isArray(rows) || rows.length < 2) return;
    const latest = rows[rows.length - 1]?.value;
    const previous = rows[rows.length - 2]?.value;
    if (!Number.isFinite(latest) || !Number.isFinite(previous)) return;
    const series = EMPLOYMENT_INDUSTRY_PAYROLL_SERIES[index];
    valid.push(series.id);
    if (latest > previous) positive.push(series.id);
    const updatedAt = latestDateIso(rows);
    if (updatedAt) updatedAtValues.push(updatedAt);
  });
  const validCount = valid.length;
  const positiveCount = positive.length;
  return {
    industryPayrollDiffusionPct: validCount ? +((positiveCount / validCount) * 100).toFixed(1) : null,
    industryPayrollPositiveCount: validCount ? positiveCount : null,
    industryPayrollSeriesCount: validCount || null,
    industryPayrollUpdatedAt: latestIsoDate(...updatedAtValues),
    positiveSeries: positive
  };
}

function calculateRetailSegmentSnapshot(seriesResults) {
  const segments = [];
  const updatedAtValues = [];
  seriesResults.forEach((result, index) => {
    const series = CONSUMER_RETAIL_SEGMENT_SERIES[index];
    if (!series) return;
    if (result.status !== 'fulfilled') {
      segments.push({
        key: series.key,
        seriesId: series.id,
        labelZh: series.labelZh,
        value: null,
        yoy: null,
        updatedAt: null,
        sourceStatus: 'missing'
      });
      return;
    }
    const rows = result.value;
    const latest = latestValue(rows);
    const yoy = calculateMonthlyYoY(rows);
    const updatedAt = latestDateIso(rows);
    if (updatedAt) updatedAtValues.push(updatedAt);
    segments.push({
      key: series.key,
      seriesId: series.id,
      labelZh: series.labelZh,
      value: Number.isFinite(latest) ? fredMillionsToBillions(latest) : null,
      yoy: Number.isFinite(yoy) ? yoy : null,
      updatedAt,
      sourceStatus: Number.isFinite(latest) ? 'live' : 'missing'
    });
  });
  const validSegments = segments.filter((segment) => Number.isFinite(segment.yoy));
  const positiveSegments = validSegments.filter((segment) => segment.yoy > 0);
  const strongest = validSegments.length
    ? [...validSegments].sort((a, b) => b.yoy - a.yoy)[0]
    : null;
  const weakest = validSegments.length
    ? [...validSegments].sort((a, b) => a.yoy - b.yoy)[0]
    : null;
  const segmentDiffusionPct = validSegments.length
    ? +((positiveSegments.length / validSegments.length) * 100).toFixed(1)
    : null;
  return {
    segments,
    segmentPositiveCount: validSegments.length ? positiveSegments.length : null,
    segmentSeriesCount: validSegments.length || null,
    segmentDiffusionPct,
    strongestSegment: strongest ? { key: strongest.key, labelZh: strongest.labelZh, yoy: strongest.yoy } : null,
    weakestSegment: weakest ? { key: weakest.key, labelZh: weakest.labelZh, yoy: weakest.yoy } : null,
    segmentUpdatedAt: latestIsoDate(...updatedAtValues)
  };
}

function fredMillionsToBillions(value) {
  return Number.isFinite(value) ? +(value / 1000).toFixed(3) : null;
}

function calculateLatestDelta(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const latest = rows[rows.length - 1]?.value;
  const previous = rows[rows.length - 2]?.value;
  return Number.isFinite(latest) && Number.isFinite(previous)
    ? +(latest - previous).toFixed(3)
    : null;
}

function buildMissingEmployment() {
  return {
    initialClaims: null,
    initialClaims4wAverage: null,
    initialClaims4wChange: null,
    continuingClaims: null,
    continuingClaims4wAverage: null,
    joltsOpenings: null,
    joltsOpeningsYoY: null,
    joltsUpdatedAt: null,
    averageHourlyEarnings: null,
    averageHourlyEarningsYoY: null,
    averageHourlyEarningsUpdatedAt: null,
    u6Rate: null,
    u6Rate3mChange: null,
    u6UpdatedAt: null,
    industryPayrollDiffusionPct: null,
    industryPayrollPositiveCount: null,
    industryPayrollSeriesCount: null,
    industryPayrollUpdatedAt: null,
    claimsRegime: '未知',
    joltsRegime: '未知',
    laborQualityRegime: '未知',
    industryDiffusionRegime: '未知',
    sourceStatus: {
      icsa: 'missing',
      ccsa: 'missing',
      jtsjol: 'missing',
      ahe: 'missing',
      u6: 'missing',
      industryPayroll: 'missing'
    },
    updatedAt: null,
    source: EMPLOYMENT_SOURCE,
    notes: ['ICSA/CCSA 为 FRED SA 周频；JOLTS、AHE、U-6 与行业 payroll basket 为月频；audit-only / display-only。']
  };
}

function buildMissingConsumerRetail() {
  return {
    cartsNominal: null,
    cartsNominal4wAverage: null,
    cartsNominalYoY: null,
    cartsReal: null,
    cartsReal4wAverage: null,
    cartsRealYoY: null,
    retailSegments: CONSUMER_RETAIL_SEGMENT_SERIES.map((series) => ({
      key: series.key,
      seriesId: series.id,
      labelZh: series.labelZh,
      value: null,
      yoy: null,
      updatedAt: null,
      sourceStatus: 'missing'
    })),
    segmentPositiveCount: null,
    segmentSeriesCount: null,
    segmentDiffusionPct: null,
    segmentRegime: '未知',
    strongestSegment: null,
    weakestSegment: null,
    segmentUpdatedAt: null,
    bofaCardSpendingYoY: null,
    bofaCardSpendingPriorYoY: null,
    bofaCardSpendingExGasYoY: null,
    bofaReportDate: null,
    bofaReportUrl: null,
    bofaPdfUrl: null,
    bofaStatus: 'missing',
    bofaSummary: null,
    redbookRetailSalesYoY: null,
    redbookHistoricalAverageYoY: null,
    redbookRetailSalesDate: null,
    redbookReportUrl: null,
    redbookStatus: 'missing',
    redbookSummary: null,
    retailRegime: '未知',
    sourceStatus: {
      carts: 'missing',
      cartsr: 'missing',
      retailSegments: 'missing',
      bofaConsumerCheckpoint: 'missing',
      redbookPublicHtml: 'missing'
    },
    updatedAt: null,
    source: CONSUMER_RETAIL_SOURCE,
    notes: ['CARTS / CARTSR 为 Chicago Fed via FRED 周频零售+餐饮 nowcast；MRTS 细分零售为月频公开数据；BoA Consumer Checkpoint 与 Redbook public HTML 为第三方公开消费证据；audit-only / display-only。']
  };
}

function buildMissingCommercialRealEstate() {
  return {
    creDelinquencyRate: null,
    creDelinquencyRateQoQChange: null,
    creChargeOffRate: null,
    creChargeOffRateQoQChange: null,
    sloosCreNonfarmNonresidentialTightening: null,
    sloosCreConstructionTightening: null,
    sloosCreMultifamilyTightening: null,
    sloosCreTighteningMax: null,
    reitEtfPrice: null,
    reitEtf4wChange: null,
    reitEtfUpdatedAt: null,
    mortgageReitEtfPrice: null,
    mortgageReitEtf4wChange: null,
    mortgageReitEtfUpdatedAt: null,
    cmbsEtfPrice: null,
    cmbsEtf4wChange: null,
    cmbsEtfUpdatedAt: null,
    creLoanBalance: null,
    creLoanBalance4wChange: null,
    creLoanBalanceYoY: null,
    creLoanBalanceUpdatedAt: null,
    creLoanBalanceStatus: 'missing',
    crePublicMarketProxyRegime: '未知',
    nonPublicCreStatus: 'manual_required',
    creStressRegime: '未知',
    sourceStatus: {
      delinquency: 'missing',
      chargeOff: 'missing',
      sloosNonfarmNonresidential: 'missing',
      sloosConstruction: 'missing',
      sloosMultifamily: 'missing',
      reitEtf: 'missing',
      mortgageReitEtf: 'missing',
      cmbsEtf: 'missing',
      creLoanBalance: 'missing',
      nonPublicCre: 'manual_required'
    },
    updatedAt: null,
    source: CRE_PUBLIC_MARKET_PROXY_SOURCE,
    notes: [
      'CRE delinquency / charge-off / SLOOS CRE tightening (3 子类) 为 FRED 季频公开数据;observation date 为季度起始日;audit-only / display-only。',
      'FRED CREACBW027SBOG 为周频银行 CRE loan balance aggregate exposure proxy;VNQ / REM / CMBS 为公开市场代理,均不代表非公开 CRE loan tape 或私募信用 marks。'
    ]
  };
}

function buildMissingShippingFreight() {
  return {
    balticDirtyTankerIndex: null,
    balticDirtyTankerDailyChangePct: null,
    balticDirtyTankerUpdatedAt: null,
    balticCleanTankerIndex: null,
    balticCleanTankerDailyChangePct: null,
    balticCleanTankerUpdatedAt: null,
    balticDryIndex: null,
    balticDryDailyChangePct: null,
    balticDryUpdatedAt: null,
    tankerFreightRegime: '未知',
    cleanTankerFreightRegime: '未知',
    dryBulkFreightRegime: '未知',
    freightStressRegime: '未知',
    sourceStatus: {
      dirtyTanker: 'missing',
      cleanTanker: 'missing',
      dryBulk: 'missing'
    },
    updatedAt: null,
    source: SHIPPING_FREIGHT_SOURCE,
    notes: ['BDTI/BCTI/BDI 来自公开 StockQ 页面转引 Baltic index；shipping/freight audit-only / display-only。']
  };
}

function buildMissingEnergySpareCapacity(reason = 'missing') {
  return {
    spareCapacityMbpd: null,
    latestPeriod: null,
    latestIsForecast: null,
    forecast12mMbpd: null,
    forecast12mPeriod: null,
    forecast18mMbpd: null,
    forecast18mPeriod: null,
    bufferRegime: '未知',
    sourceStatus: { spareCapacity: 'missing' },
    fetchReason: reason,
    unit: 'million barrels per day',
    frequency: 'monthly',
    source: ENERGY_SPARE_CAPACITY_SOURCE,
    sourceUrl: ENERGY_SPARE_CAPACITY_SOURCE_URL,
    updatedAt: null,
    fetchedAt: isoNow,
    limitationZh: 'EIA STEO OPEC spare crude capacity 是估算/预测慢变量,不是实时物理闲置桶数、OPEC 官方配额执行或油价预测。',
    notes: [
      'EIA STEO COPS_OPEC 为 OPEC surplus crude oil production capacity monthly estimate/forecast;display-only,不进 scoring/decision/execution/position。',
      '当前月与未来月份为 STEO 估算/预测;低闲置产能只表示供应缓冲较薄,不等于价格预测。'
    ]
  };
}

function normalizePreviousEnergySpareCapacity(prevEnergySpareCapacity, reason = 'fetch_failed') {
  if (!prevEnergySpareCapacity || typeof prevEnergySpareCapacity !== 'object') {
    return buildMissingEnergySpareCapacity(reason);
  }
  const spareCapacityMbpd = finiteNumberOrNull(prevEnergySpareCapacity.spareCapacityMbpd);
  if (spareCapacityMbpd === null) return buildMissingEnergySpareCapacity(reason);
  const latestPeriod = typeof prevEnergySpareCapacity.latestPeriod === 'string' ? prevEnergySpareCapacity.latestPeriod : null;
  const latestAgeDays = periodAgeDays(latestPeriod);
  if (latestAgeDays === null || latestAgeDays > ENERGY_SPARE_CAPACITY_MAX_PERIOD_AGE_DAYS) {
    return {
      ...buildMissingEnergySpareCapacity('previous_period_stale'),
      sourceStatus: { spareCapacity: 'stale' },
      latestPeriod,
      updatedAt: periodToIso(latestPeriod)
    };
  }
  return {
    spareCapacityMbpd,
    latestPeriod,
    latestIsForecast: typeof prevEnergySpareCapacity.latestIsForecast === 'boolean' ? prevEnergySpareCapacity.latestIsForecast : null,
    forecast12mMbpd: finiteNumberOrNull(prevEnergySpareCapacity.forecast12mMbpd),
    forecast12mPeriod: typeof prevEnergySpareCapacity.forecast12mPeriod === 'string' ? prevEnergySpareCapacity.forecast12mPeriod : null,
    forecast18mMbpd: finiteNumberOrNull(prevEnergySpareCapacity.forecast18mMbpd),
    forecast18mPeriod: typeof prevEnergySpareCapacity.forecast18mPeriod === 'string' ? prevEnergySpareCapacity.forecast18mPeriod : null,
    bufferRegime: typeof prevEnergySpareCapacity.bufferRegime === 'string' ? prevEnergySpareCapacity.bufferRegime : classifyEnergySpareCapacityRegime(spareCapacityMbpd),
    sourceStatus: { spareCapacity: 'fallback' },
    fetchReason: reason,
    unit: 'million barrels per day',
    frequency: 'monthly',
    source: ENERGY_SPARE_CAPACITY_SOURCE,
    sourceUrl: ENERGY_SPARE_CAPACITY_SOURCE_URL,
    updatedAt: normalizeIsoOrNull(prevEnergySpareCapacity.updatedAt),
    fetchedAt: isoNow,
    limitationZh: typeof prevEnergySpareCapacity.limitationZh === 'string'
      ? prevEnergySpareCapacity.limitationZh
      : 'EIA STEO OPEC spare crude capacity 是估算/预测慢变量,不是实时物理闲置桶数、OPEC 官方配额执行或油价预测。',
    notes: Array.isArray(prevEnergySpareCapacity.notes) && prevEnergySpareCapacity.notes.length
      ? prevEnergySpareCapacity.notes
      : buildMissingEnergySpareCapacity(reason).notes
  };
}

function classifyEnergySpareCapacityRegime(value) {
  if (!Number.isFinite(value)) return '未知';
  if (value < 1) return '极低缓冲';
  if (value < 2) return '偏低';
  if (value < 3) return '正常';
  return '宽松';
}

function addMonthsToPeriod(period, months) {
  const match = String(period || '').match(/^(?<year>\d{4})-(?<month>\d{2})$/u);
  if (!match?.groups) return null;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const index = year * 12 + (month - 1) + months;
  const outYear = Math.floor(index / 12);
  const outMonth = (index % 12) + 1;
  return `${outYear}-${String(outMonth).padStart(2, '0')}`;
}

function periodToIso(period) {
  return /^\d{4}-\d{2}$/u.test(String(period || '')) ? `${period}-01T00:00:00.000Z` : null;
}

function periodAgeDays(period) {
  const iso = periodToIso(period);
  if (!iso) return null;
  const t = Date.parse(iso);
  const now = Date.parse(isoNow);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round((now - t) / (24 * 3600 * 1000)));
}

function buildEnergySpareCapacityApiUrl() {
  const params = new URLSearchParams();
  params.set('api_key', EIA_API_KEY);
  params.append('frequency', 'monthly');
  params.append('data[0]', 'value');
  params.append('facets[seriesId][]', ENERGY_SPARE_CAPACITY_SERIES_ID);
  params.append('sort[0][column]', 'period');
  params.append('sort[0][direction]', 'asc');
  params.append('offset', '0');
  params.append('length', '5000');
  return `${ENERGY_SPARE_CAPACITY_API_URL}?${params.toString()}`;
}

function parseEnergySpareCapacityRows(payload) {
  const rows = payload?.response?.data;
  if (!Array.isArray(rows)) throw new Error('eia:steo:COPS_OPEC missing response.data');
  return rows
    .map((row) => ({
      period: typeof row?.period === 'string' ? row.period : null,
      value: Number(row?.value),
      seriesId: typeof row?.seriesId === 'string' ? row.seriesId : null,
      unit: typeof row?.unit === 'string' ? row.unit : null
    }))
    .filter((row) => (
      row.seriesId === ENERGY_SPARE_CAPACITY_SERIES_ID &&
      /^\d{4}-\d{2}$/u.test(row.period || '') &&
      Number.isFinite(row.value)
    ))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function pickMonthlyForecast(rows, targetPeriod) {
  if (!targetPeriod) return null;
  return rows.find((row) => row.period === targetPeriod)
    || rows.find((row) => row.period > targetPeriod)
    || null;
}

async function resolveEnergySpareCapacity(prevEnergySpareCapacity) {
  if (!EIA_API_KEY) return normalizePreviousEnergySpareCapacity(prevEnergySpareCapacity, 'missing_api_key');
  try {
    const payload = await fetchJsonText(
      buildEnergySpareCapacityApiUrl(),
      'eia:steo:COPS_OPEC',
      ENERGY_SPARE_CAPACITY_FETCH_TIMEOUT_MS,
      { userAgent: 'GFRRBot/1.0' }
    );
    if (payload?.error) throw new Error(`eia:steo:COPS_OPEC api_error:${payload.error}`);
    const rows = parseEnergySpareCapacityRows(payload);
    if (!rows.length) throw new Error('eia:steo:COPS_OPEC no numeric monthly rows');
    const currentPeriod = isoNow.slice(0, 7);
    const current = rows.filter((row) => row.period <= currentPeriod).at(-1);
    if (!current) throw new Error('eia:steo:COPS_OPEC no current-or-historical period');
    const latestAgeDays = periodAgeDays(current.period);
    if (latestAgeDays === null || latestAgeDays > ENERGY_SPARE_CAPACITY_MAX_PERIOD_AGE_DAYS) {
      return {
        ...buildMissingEnergySpareCapacity('latest_period_stale'),
        sourceStatus: { spareCapacity: 'stale' },
        latestPeriod: current.period,
        updatedAt: periodToIso(current.period)
      };
    }
    const forecast12m = pickMonthlyForecast(rows, addMonthsToPeriod(current.period, 12));
    const forecast18m = pickMonthlyForecast(rows, addMonthsToPeriod(current.period, 18));
    const spareCapacityMbpd = +current.value.toFixed(2);
    return {
      spareCapacityMbpd,
      latestPeriod: current.period,
      latestIsForecast: current.period >= currentPeriod,
      forecast12mMbpd: forecast12m ? +forecast12m.value.toFixed(2) : null,
      forecast12mPeriod: forecast12m?.period || null,
      forecast18mMbpd: forecast18m ? +forecast18m.value.toFixed(2) : null,
      forecast18mPeriod: forecast18m?.period || null,
      bufferRegime: classifyEnergySpareCapacityRegime(spareCapacityMbpd),
      sourceStatus: { spareCapacity: 'live' },
      fetchReason: null,
      unit: 'million barrels per day',
      frequency: 'monthly',
      source: ENERGY_SPARE_CAPACITY_SOURCE,
      sourceUrl: ENERGY_SPARE_CAPACITY_SOURCE_URL,
      updatedAt: periodToIso(current.period),
      fetchedAt: isoNow,
      limitationZh: 'EIA STEO OPEC spare crude capacity 是估算/预测慢变量,不是实时物理闲置桶数、OPEC 官方配额执行或油价预测。',
      notes: [
        'EIA STEO COPS_OPEC 为 OPEC surplus crude oil production capacity monthly estimate/forecast;display-only,不进 scoring/decision/execution/position。',
        '当前月与未来月份为 STEO 估算/预测;低闲置产能只表示供应缓冲较薄,不等于价格预测。'
      ]
    };
  } catch (err) {
    return normalizePreviousEnergySpareCapacity(prevEnergySpareCapacity, stringifyFetchError(err));
  }
}

function roundEnergyInventoryNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return +value.toFixed(digits);
}

function buildMissingEnergyInventoryBalance(reason = 'missing') {
  return {
    oecdCommercialInventoryMbbl: null,
    oecdCommercialInventoryYoYMbbl: null,
    oecdCommercialInventoryVs5yPct: null,
    oecdCommercialInventoryDaysOfSupply: null,
    oecdCommercialInventoryDaysOfSupplyYoY: null,
    usCommercialInventoryMbbl: null,
    otherOecdCommercialInventoryMbbl: null,
    globalInventoryDrawMbpd: null,
    globalInventoryDraw3mAvgMbpd: null,
    usInventoryDrawMbpd: null,
    otherOecdInventoryDrawMbpd: null,
    nonOecdInventoryDrawMbpd: null,
    oecdInventoryDrawMbpd: null,
    worldConsumptionMbpd: null,
    worldConsumptionYoYMbpd: null,
    oecdConsumptionMbpd: null,
    oecdConsumptionYoYMbpd: null,
    forecast6mOecdCommercialInventoryMbbl: null,
    forecast6mPeriod: null,
    forecast12mOecdCommercialInventoryMbbl: null,
    forecast12mPeriod: null,
    inventoryRegime: '未知',
    globalDrawRegime: '未知',
    latestPeriod: null,
    latestIsForecast: null,
    sourceStatus: { inventoryBalance: 'missing' },
    fetchReason: reason,
    units: {
      inventory: 'million barrels, end-of-period',
      flow: 'million barrels per day',
      daysOfSupply: 'days'
    },
    frequency: 'monthly',
    source: ENERGY_INVENTORY_BALANCE_SOURCE,
    sourceUrl: ENERGY_INVENTORY_BALANCE_SOURCE_URL,
    updatedAt: null,
    fetchedAt: isoNow,
    series: { ...ENERGY_INVENTORY_BALANCE_SERIES },
    limitationZh: 'EIA STEO OECD 商业库存与全球净库存变化为月度估算/预测慢变量;不是实时全球库存、不是全球商业库存总量实测,也不是油价预测。',
    notes: [
      'EIA STEO PASC_OECD_T3 为 OECD commercial crude oil and other liquids inventory monthly estimate/forecast。',
      'T3_STCHANGE_WORLD 为 Total World crude oil and other liquids net inventory withdrawals;正值表示抽库,负值表示累库。',
      '本层 display-only,不进 values/scoring/decision/execution/position、Brent promotion、World Order weights、Heatmap 或 cross-validation。'
    ]
  };
}

function normalizePreviousEnergyInventoryBalance(prevEnergyInventoryBalance, reason = 'fetch_failed') {
  if (!prevEnergyInventoryBalance || typeof prevEnergyInventoryBalance !== 'object') {
    return buildMissingEnergyInventoryBalance(reason);
  }
  const oecdCommercialInventoryMbbl = finiteNumberOrNull(prevEnergyInventoryBalance.oecdCommercialInventoryMbbl);
  const globalInventoryDrawMbpd = finiteNumberOrNull(prevEnergyInventoryBalance.globalInventoryDrawMbpd);
  if (oecdCommercialInventoryMbbl === null || globalInventoryDrawMbpd === null) {
    return buildMissingEnergyInventoryBalance(reason);
  }
  const latestPeriod = typeof prevEnergyInventoryBalance.latestPeriod === 'string' ? prevEnergyInventoryBalance.latestPeriod : null;
  const latestAgeDays = periodAgeDays(latestPeriod);
  if (latestAgeDays === null || latestAgeDays > ENERGY_INVENTORY_BALANCE_MAX_PERIOD_AGE_DAYS) {
    return {
      ...buildMissingEnergyInventoryBalance('previous_period_stale'),
      sourceStatus: { inventoryBalance: 'stale' },
      latestPeriod,
      updatedAt: periodToIso(latestPeriod)
    };
  }
  const fallback = buildMissingEnergyInventoryBalance(reason);
  const numericFields = [
    'oecdCommercialInventoryMbbl',
    'oecdCommercialInventoryYoYMbbl',
    'oecdCommercialInventoryVs5yPct',
    'oecdCommercialInventoryDaysOfSupply',
    'oecdCommercialInventoryDaysOfSupplyYoY',
    'usCommercialInventoryMbbl',
    'otherOecdCommercialInventoryMbbl',
    'globalInventoryDrawMbpd',
    'globalInventoryDraw3mAvgMbpd',
    'usInventoryDrawMbpd',
    'otherOecdInventoryDrawMbpd',
    'nonOecdInventoryDrawMbpd',
    'oecdInventoryDrawMbpd',
    'worldConsumptionMbpd',
    'worldConsumptionYoYMbpd',
    'oecdConsumptionMbpd',
    'oecdConsumptionYoYMbpd',
    'forecast6mOecdCommercialInventoryMbbl',
    'forecast12mOecdCommercialInventoryMbbl'
  ];
  return {
    ...fallback,
    ...Object.fromEntries(numericFields.map((key) => [key, finiteNumberOrNull(prevEnergyInventoryBalance[key])])),
    forecast6mPeriod: typeof prevEnergyInventoryBalance.forecast6mPeriod === 'string' ? prevEnergyInventoryBalance.forecast6mPeriod : null,
    forecast12mPeriod: typeof prevEnergyInventoryBalance.forecast12mPeriod === 'string' ? prevEnergyInventoryBalance.forecast12mPeriod : null,
    inventoryRegime: typeof prevEnergyInventoryBalance.inventoryRegime === 'string' ? prevEnergyInventoryBalance.inventoryRegime : fallback.inventoryRegime,
    globalDrawRegime: typeof prevEnergyInventoryBalance.globalDrawRegime === 'string' ? prevEnergyInventoryBalance.globalDrawRegime : fallback.globalDrawRegime,
    latestPeriod,
    latestIsForecast: typeof prevEnergyInventoryBalance.latestIsForecast === 'boolean' ? prevEnergyInventoryBalance.latestIsForecast : null,
    sourceStatus: { inventoryBalance: 'fallback' },
    fetchReason: reason,
    updatedAt: normalizeIsoOrNull(prevEnergyInventoryBalance.updatedAt),
    fetchedAt: isoNow,
    units: prevEnergyInventoryBalance.units && typeof prevEnergyInventoryBalance.units === 'object' ? prevEnergyInventoryBalance.units : fallback.units,
    series: prevEnergyInventoryBalance.series && typeof prevEnergyInventoryBalance.series === 'object' ? prevEnergyInventoryBalance.series : fallback.series,
    limitationZh: typeof prevEnergyInventoryBalance.limitationZh === 'string' ? prevEnergyInventoryBalance.limitationZh : fallback.limitationZh,
    notes: Array.isArray(prevEnergyInventoryBalance.notes) && prevEnergyInventoryBalance.notes.length ? prevEnergyInventoryBalance.notes : fallback.notes
  };
}

function classifyOecdInventoryRegime(vs5yPct) {
  if (!Number.isFinite(vs5yPct)) return '未知';
  if (vs5yPct <= -10) return '极低库存';
  if (vs5yPct <= -5) return '偏低';
  if (vs5yPct >= 5) return '偏高';
  return '正常';
}

function classifyGlobalDrawRegime(drawMbpd) {
  if (!Number.isFinite(drawMbpd)) return '未知';
  if (drawMbpd >= 3) return '急速抽库';
  if (drawMbpd >= 1) return '抽库';
  if (drawMbpd <= -1) return '累库';
  return '小幅变化';
}

function addYearsToPeriod(period, years) {
  return addMonthsToPeriod(period, years * 12);
}

function energyInventoryStartPeriod() {
  const currentPeriod = isoNow.slice(0, 7);
  return addMonthsToPeriod(currentPeriod, -84) || `${Number(currentPeriod.slice(0, 4)) - 7}-01`;
}

function buildEnergyInventoryBalanceApiUrl() {
  const params = new URLSearchParams();
  params.set('api_key', EIA_API_KEY);
  params.append('frequency', 'monthly');
  params.append('data[0]', 'value');
  params.append('start', energyInventoryStartPeriod());
  for (const seriesId of Object.values(ENERGY_INVENTORY_BALANCE_SERIES)) {
    params.append('facets[seriesId][]', seriesId);
  }
  params.append('sort[0][column]', 'period');
  params.append('sort[0][direction]', 'asc');
  params.append('offset', '0');
  params.append('length', '5000');
  return `${ENERGY_INVENTORY_BALANCE_API_URL}?${params.toString()}`;
}

function parseEnergyInventoryBalanceRows(payload) {
  const rows = payload?.response?.data;
  if (!Array.isArray(rows)) throw new Error('eia:steo:energy-inventory-balance missing response.data');
  const allowed = new Set(Object.values(ENERGY_INVENTORY_BALANCE_SERIES));
  return rows
    .map((row) => ({
      period: typeof row?.period === 'string' ? row.period : null,
      value: Number(row?.value),
      seriesId: typeof row?.seriesId === 'string' ? row.seriesId : null,
      seriesDescription: typeof row?.seriesDescription === 'string' ? row.seriesDescription : null,
      unit: typeof row?.unit === 'string' ? row.unit : null
    }))
    .filter((row) => (
      allowed.has(row.seriesId) &&
      /^\d{4}-\d{2}$/u.test(row.period || '') &&
      Number.isFinite(row.value)
    ))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function energyInventoryRow(rows, seriesId, period) {
  return rows.find((row) => row.seriesId === seriesId && row.period === period) || null;
}

function latestEnergyInventoryPeriod(rows) {
  const currentPeriod = isoNow.slice(0, 7);
  const candidates = rows
    .filter((row) => row.seriesId === ENERGY_INVENTORY_BALANCE_SERIES.oecdCommercialInventory && row.period <= currentPeriod)
    .map((row) => row.period)
    .sort();
  return candidates.at(-1) || null;
}

function sameMonthAverage(rows, seriesId, period, years = 5) {
  const values = [];
  for (let i = 1; i <= years; i++) {
    const previous = energyInventoryRow(rows, seriesId, addYearsToPeriod(period, -i));
    if (previous && Number.isFinite(previous.value)) values.push(previous.value);
  }
  if (values.length < 3) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trailingAverageByPeriod(rows, seriesId, period, months = 3) {
  const values = [];
  for (let i = 0; i < months; i++) {
    const previous = energyInventoryRow(rows, seriesId, addMonthsToPeriod(period, -i));
    if (previous && Number.isFinite(previous.value)) values.push(previous.value);
  }
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pickEnergyInventoryForecast(rows, seriesId, targetPeriod) {
  if (!targetPeriod) return null;
  return rows.find((row) => row.seriesId === seriesId && row.period === targetPeriod)
    || rows.find((row) => row.seriesId === seriesId && row.period > targetPeriod)
    || null;
}

async function resolveEnergyInventoryBalance(prevEnergyInventoryBalance) {
  if (!EIA_API_KEY) return normalizePreviousEnergyInventoryBalance(prevEnergyInventoryBalance, 'missing_api_key');
  try {
    const payload = await fetchJsonText(
      buildEnergyInventoryBalanceApiUrl(),
      'eia:steo:energy-inventory-balance',
      ENERGY_INVENTORY_BALANCE_FETCH_TIMEOUT_MS,
      { userAgent: 'GFRRBot/1.0' }
    );
    if (payload?.error) throw new Error(`eia:steo:energy-inventory-balance api_error:${payload.error}`);
    const rows = parseEnergyInventoryBalanceRows(payload);
    if (!rows.length) throw new Error('eia:steo:energy-inventory-balance no numeric monthly rows');
    const latestPeriod = latestEnergyInventoryPeriod(rows);
    if (!latestPeriod) throw new Error('eia:steo:energy-inventory-balance no current-or-historical period');
    for (const seriesId of ENERGY_INVENTORY_BALANCE_CORE_SERIES) {
      if (!energyInventoryRow(rows, seriesId, latestPeriod)) {
        throw new Error(`eia:steo:energy-inventory-balance missing core ${seriesId} for ${latestPeriod}`);
      }
    }
    const latestAgeDays = periodAgeDays(latestPeriod);
    if (latestAgeDays === null || latestAgeDays > ENERGY_INVENTORY_BALANCE_MAX_PERIOD_AGE_DAYS) {
      return {
        ...buildMissingEnergyInventoryBalance('latest_period_stale'),
        sourceStatus: { inventoryBalance: 'stale' },
        latestPeriod,
        updatedAt: periodToIso(latestPeriod)
      };
    }

    const S = ENERGY_INVENTORY_BALANCE_SERIES;
    const current = (seriesId) => energyInventoryRow(rows, seriesId, latestPeriod);
    const priorYear = (seriesId) => energyInventoryRow(rows, seriesId, addYearsToPeriod(latestPeriod, -1));
    const value = (seriesId) => finiteNumberOrNull(current(seriesId)?.value);
    const prevValue = (seriesId) => finiteNumberOrNull(priorYear(seriesId)?.value);
    const oecdCommercialInventoryMbbl = value(S.oecdCommercialInventory);
    const oecdConsumptionMbpd = value(S.oecdConsumption);
    const priorOecdInventory = prevValue(S.oecdCommercialInventory);
    const priorOecdConsumption = prevValue(S.oecdConsumption);
    const priorWorldConsumption = prevValue(S.worldConsumption);
    const oecdDays = (Number.isFinite(oecdCommercialInventoryMbbl) && Number.isFinite(oecdConsumptionMbpd) && oecdConsumptionMbpd > 0)
      ? oecdCommercialInventoryMbbl / oecdConsumptionMbpd
      : null;
    const priorOecdDays = (Number.isFinite(priorOecdInventory) && Number.isFinite(priorOecdConsumption) && priorOecdConsumption > 0)
      ? priorOecdInventory / priorOecdConsumption
      : null;
    const sameMonth5y = sameMonthAverage(rows, S.oecdCommercialInventory, latestPeriod, 5);
    const forecast6m = pickEnergyInventoryForecast(rows, S.oecdCommercialInventory, addMonthsToPeriod(latestPeriod, 6));
    const forecast12m = pickEnergyInventoryForecast(rows, S.oecdCommercialInventory, addMonthsToPeriod(latestPeriod, 12));
    const usInventoryDrawMbpd = value(S.usInventoryDraw);
    const otherOecdInventoryDrawMbpd = value(S.otherOecdInventoryDraw);
    const oecdInventoryDrawMbpd = Number.isFinite(usInventoryDrawMbpd) && Number.isFinite(otherOecdInventoryDrawMbpd)
      ? usInventoryDrawMbpd + otherOecdInventoryDrawMbpd
      : null;
    const globalInventoryDrawMbpd = value(S.globalInventoryDraw);
    const worldConsumptionMbpd = value(S.worldConsumption);
    const oecdCommercialInventoryVs5yPct = Number.isFinite(oecdCommercialInventoryMbbl) && Number.isFinite(sameMonth5y) && sameMonth5y > 0
      ? ((oecdCommercialInventoryMbbl - sameMonth5y) / sameMonth5y) * 100
      : null;

    return {
      oecdCommercialInventoryMbbl: roundEnergyInventoryNumber(oecdCommercialInventoryMbbl, 2),
      oecdCommercialInventoryYoYMbbl: Number.isFinite(oecdCommercialInventoryMbbl) && Number.isFinite(priorOecdInventory)
        ? roundEnergyInventoryNumber(oecdCommercialInventoryMbbl - priorOecdInventory, 2)
        : null,
      oecdCommercialInventoryVs5yPct: roundEnergyInventoryNumber(oecdCommercialInventoryVs5yPct, 2),
      oecdCommercialInventoryDaysOfSupply: roundEnergyInventoryNumber(oecdDays, 1),
      oecdCommercialInventoryDaysOfSupplyYoY: Number.isFinite(oecdDays) && Number.isFinite(priorOecdDays)
        ? roundEnergyInventoryNumber(oecdDays - priorOecdDays, 1)
        : null,
      usCommercialInventoryMbbl: roundEnergyInventoryNumber(value(S.usCommercialInventory), 2),
      otherOecdCommercialInventoryMbbl: roundEnergyInventoryNumber(value(S.otherOecdCommercialInventory), 2),
      globalInventoryDrawMbpd: roundEnergyInventoryNumber(globalInventoryDrawMbpd, 2),
      globalInventoryDraw3mAvgMbpd: roundEnergyInventoryNumber(trailingAverageByPeriod(rows, S.globalInventoryDraw, latestPeriod, 3), 2),
      usInventoryDrawMbpd: roundEnergyInventoryNumber(usInventoryDrawMbpd, 2),
      otherOecdInventoryDrawMbpd: roundEnergyInventoryNumber(otherOecdInventoryDrawMbpd, 2),
      nonOecdInventoryDrawMbpd: roundEnergyInventoryNumber(value(S.nonOecdInventoryDraw), 2),
      oecdInventoryDrawMbpd: roundEnergyInventoryNumber(oecdInventoryDrawMbpd, 2),
      worldConsumptionMbpd: roundEnergyInventoryNumber(worldConsumptionMbpd, 2),
      worldConsumptionYoYMbpd: Number.isFinite(worldConsumptionMbpd) && Number.isFinite(priorWorldConsumption)
        ? roundEnergyInventoryNumber(worldConsumptionMbpd - priorWorldConsumption, 2)
        : null,
      oecdConsumptionMbpd: roundEnergyInventoryNumber(oecdConsumptionMbpd, 2),
      oecdConsumptionYoYMbpd: Number.isFinite(oecdConsumptionMbpd) && Number.isFinite(priorOecdConsumption)
        ? roundEnergyInventoryNumber(oecdConsumptionMbpd - priorOecdConsumption, 2)
        : null,
      forecast6mOecdCommercialInventoryMbbl: forecast6m ? roundEnergyInventoryNumber(forecast6m.value, 2) : null,
      forecast6mPeriod: forecast6m?.period || null,
      forecast12mOecdCommercialInventoryMbbl: forecast12m ? roundEnergyInventoryNumber(forecast12m.value, 2) : null,
      forecast12mPeriod: forecast12m?.period || null,
      inventoryRegime: classifyOecdInventoryRegime(oecdCommercialInventoryVs5yPct),
      globalDrawRegime: classifyGlobalDrawRegime(globalInventoryDrawMbpd),
      latestPeriod,
      latestIsForecast: latestPeriod >= isoNow.slice(0, 7),
      sourceStatus: { inventoryBalance: 'live' },
      fetchReason: null,
      units: {
        inventory: 'million barrels, end-of-period',
        flow: 'million barrels per day',
        daysOfSupply: 'days'
      },
      frequency: 'monthly',
      source: ENERGY_INVENTORY_BALANCE_SOURCE,
      sourceUrl: ENERGY_INVENTORY_BALANCE_SOURCE_URL,
      updatedAt: periodToIso(latestPeriod),
      fetchedAt: isoNow,
      series: { ...ENERGY_INVENTORY_BALANCE_SERIES },
      limitationZh: 'EIA STEO OECD 商业库存与全球净库存变化为月度估算/预测慢变量;不是实时全球库存、不是全球商业库存总量实测,也不是油价预测。',
      notes: buildMissingEnergyInventoryBalance().notes
    };
  } catch (err) {
    return normalizePreviousEnergyInventoryBalance(prevEnergyInventoryBalance, stringifyFetchError(err));
  }
}

function roundEnergyTransportNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function buildEnergyTransportLimitation() {
  return 'PortWatch AIS-derived chokepoint proxy;船舶计数和 capacity 是观测代理,可能受 GPS jamming、AIS spoofing、vessels going dark、routing changes 或 data lag 扭曲;不是官方贸易统计、封锁确认、战争概率或油价预测。';
}

function buildEnergyTransportNotes() {
  return [
    'Sources: UN Global Platform; IMF PortWatch. Daily_Chokepoints_Data 为 AIS-derived chokepoint proxy;IMF Data Terms pinned via exact ArcGIS licenseInfo。',
    '本层只保存 compact 派生摘要(latest + 7d/30d average + deviation),不提交 PortWatch raw AIS-derived history;usageTermsPinned=imf_data_terms_pinned,redistributionCaveat=true(UN Global Platform / AIS 第三方上游 caveat 保留)。',
    'transportShockCandidate 已获 owner_thread_approval 进入 free-proxy low-weight runtime scoring migration:只读 PortWatch 咽喉代理,上限 +3,默认 fail-closed 0;routeFreightConfirmation/marketConfirmation 仍为 not_connected。'
  ];
}

function buildEnergyTransportBoundaryFlags({ affectsRuntimeScoring = false } = {}) {
  return {
    affectsValues: false,
    affectsDisplayInputsBaseline: false,
    affectsEffectiveDisplayInputs: false,
    affectsScoring: affectsRuntimeScoring,
    affectsDecisionModel: affectsRuntimeScoring,
    affectsExecutionLock: affectsRuntimeScoring,
    affectsPositionGuidance: affectsRuntimeScoring,
    affectsBrentPromotion: false,
    affectsWorldOrderWeights: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function buildMissingEnergyTransportShockCandidate(reason = 'missing') {
  return {
    contractVersion: ENERGY_TRANSPORT_SHOCK_CANDIDATE_CONTRACT_VERSION,
    status: 'unavailable',
    score: null,
    confidence: 'none',
    candidateOnly: true,
    auditOnly: true,
    eligibleForMainScore: false,
    confirmationStatus: 'unavailable',
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    evidence: {
      hormuzTankerVs30dPct: null,
      hormuzCapacityTankerVs30dPct: null,
      redSeaToCapeRegime: 'unknown',
      suezBabTankerVs30dPct: null,
      capeTankerVs30dPct: null,
      stressedChokepointCount: null
    },
    drivers: [],
    reasons: [`PortWatch 咽喉代理不可用或过期(${reason});运输冲击候选审计层不输出有效分。`],
    boundaries: buildEnergyTransportBoundaryFlags(),
    limitationZh: '运输冲击候选分仅为 PortWatch AIS 派生咽喉代理的审计读数;不确认封锁、断供、暗航行、战争概率或油价方向;不进 values、scoring、decision、execution、position、Brent promotion、World Order weights、Global Risk Heatmap 或 cross-validation。'
  };
}

function scoreEnergyTransportDrop(value) {
  if (!Number.isFinite(value)) return null;
  if (value <= -0.75) return 90;
  if (value <= -0.5) return 75;
  if (value <= -0.3) return 60;
  if (value <= -0.2) return 45;
  return 15;
}

function buildEnergyTransportShockCandidate(chokepoints, reroutingProxy, sourceStatus = 'live') {
  if (!chokepoints || typeof chokepoints !== 'object') {
    return buildMissingEnergyTransportShockCandidate('missing_chokepoints');
  }
  if (sourceStatus !== 'live' && sourceStatus !== 'fallback') {
    return buildMissingEnergyTransportShockCandidate(`source_status_${sourceStatus || 'missing'}`);
  }

  const hormuz = chokepoints.hormuz || {};
  const hormuzTankerVs30dPct = Number.isFinite(hormuz.latestVs30dPct) ? hormuz.latestVs30dPct : null;
  const hormuzCapacityTankerVs30dPct = Number.isFinite(hormuz.capacityTankerVs30dPct)
    ? hormuz.capacityTankerVs30dPct
    : null;
  const hormuzRisk = Math.max(
    scoreEnergyTransportDrop(hormuzTankerVs30dPct) ?? 0,
    scoreEnergyTransportDrop(hormuzCapacityTankerVs30dPct) ?? 0
  );
  const stressedCoreKeys = ENERGY_TRANSPORT_CORE_KEYS.filter((key) => {
    const node = chokepoints[key] || {};
    return (
      (Number.isFinite(node.capacityTankerVs30dPct) && node.capacityTankerVs30dPct <= -0.3) ||
      (Number.isFinite(node.latestVs30dPct) && node.latestVs30dPct <= -0.3)
    );
  });
  const stressedChokepointCount = stressedCoreKeys.length;
  const aggregateRisk = stressedChokepointCount >= 2 ? Math.min(80, 30 + stressedChokepointCount * 15) : 15;
  const redSeaToCapeRegime = typeof reroutingProxy?.redSeaToCapeRegime === 'string'
    ? reroutingProxy.redSeaToCapeRegime
    : 'unknown';
  const reroutingRisk = redSeaToCapeRegime === 'rerouting_watch' ? 65 : 15;
  const score = clamp(Math.max(hormuzRisk, aggregateRisk, reroutingRisk));
  const status = score >= 75 ? 'elevated_watch' : score >= 50 ? 'watch' : 'normal';
  const drivers = [];
  const reasons = [];

  if (hormuzRisk >= 75) {
    drivers.push('hormuz_proxy_drop');
    reasons.push('霍尔木兹油轮 count/capacity 代理显著低于30日均值;仅作 AIS 派生候选观察。');
  } else if (hormuzRisk >= 45) {
    drivers.push('hormuz_proxy_watch');
    reasons.push('霍尔木兹油轮代理低于30日均值,但尚需路线级油轮运费与市场确认。');
  }
  if (stressedChokepointCount >= 2) {
    drivers.push('multi_chokepoint_proxy_drop');
    reasons.push(`核心咽喉中 ${stressedChokepointCount} 个油轮代理低于30日均值: ${stressedCoreKeys.join(', ')}。`);
  }
  if (redSeaToCapeRegime === 'rerouting_watch') {
    drivers.push('red_sea_to_cape_rerouting_proxy');
    reasons.push('红海/曼德-好望角绕行代理触发观察;仍需路线级运费和市场结构确认。');
  }
  if (!reasons.length) {
    reasons.push('未见核心咽喉油轮代理形成高强度运输冲击候选;保持正常观察。');
  }

  return {
    contractVersion: ENERGY_TRANSPORT_SHOCK_CANDIDATE_CONTRACT_VERSION,
    status,
    score,
    confidence: 'low',
    candidateOnly: true,
    auditOnly: true,
    eligibleForMainScore: sourceStatus === 'live' && status !== 'normal',
    confirmationStatus: status === 'normal'
      ? 'no_transport_shock_candidate'
      : 'awaiting_route_freight_and_market_confirmation',
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    evidence: {
      hormuzTankerVs30dPct,
      hormuzCapacityTankerVs30dPct,
      redSeaToCapeRegime,
      suezBabTankerVs30dPct: Number.isFinite(reroutingProxy?.suezBabTankerVs30dPct)
        ? reroutingProxy.suezBabTankerVs30dPct
        : null,
      capeTankerVs30dPct: Number.isFinite(reroutingProxy?.capeTankerVs30dPct)
        ? reroutingProxy.capeTankerVs30dPct
        : null,
      stressedChokepointCount
    },
    drivers,
    reasons,
    boundaries: buildEnergyTransportBoundaryFlags({ affectsRuntimeScoring: sourceStatus === 'live' && status !== 'normal' }),
    limitationZh: sourceStatus === 'live' && status !== 'normal'
      ? '运输冲击候选分仅为 PortWatch AIS 派生咽喉代理的低权重压力输入;owner-approved runtime scoring migration 允许最高 +3 主分贡献,默认 fail-closed 0;不确认封锁、断供、暗航行、战争概率或油价方向;不改变 values、Brent promotion、World Order weights、Global Risk Heatmap 或 cross-validation。'
      : '运输冲击候选分仅为 PortWatch AIS 派生咽喉代理的审计读数;不确认封锁、断供、暗航行、战争概率或油价方向;不进 values、scoring、decision、execution、position、Brent promotion、World Order weights、Global Risk Heatmap 或 cross-validation。'
  };
}

function buildEmptyEnergyTransportChokepoints(status = 'missing') {
  return Object.fromEntries(ENERGY_TRANSPORT_CHOKEPOINTS.map((definition) => [
    definition.key,
    {
      portid: definition.portid,
      portname: definition.portname,
      latest: {
        date: null,
        nTanker: null,
        nTotal: null,
        capacityTanker: null,
        capacityTotal: null
      },
      avg7d: {
        nTanker: null,
        capacityTanker: null
      },
      avg30d: {
        nTanker: null,
        capacityTanker: null
      },
      latestVs30dPct: null,
      capacityTankerVs30dPct: null,
      sourceStatus: status
    }
  ]));
}

function buildMissingEnergyTransport(reason = 'missing') {
  return {
    source: ENERGY_TRANSPORT_SOURCE,
    sourceUrl: ENERGY_TRANSPORT_SOURCE_URL,
    queryUrl: ENERGY_TRANSPORT_QUERY_URL,
    sourceStatus: { chokepoints: 'missing' },
    usageTermsPinned: ENERGY_TRANSPORT_USAGE_TERMS_PINNED,
    redistributionCaveat: true,
    latestDate: null,
    latestAgeDays: null,
    windowDays: ENERGY_TRANSPORT_WINDOW_DAYS,
    fetchedAt: isoNow,
    lastEditDate: null,
    fetchReason: reason,
    chokepoints: buildEmptyEnergyTransportChokepoints('missing'),
    reroutingProxy: {
      redSeaToCapeRegime: 'unknown',
      suezBabTankerVs30dPct: null,
      capeTankerVs30dPct: null,
      notes: []
    },
    transportShockCandidate: buildMissingEnergyTransportShockCandidate(reason),
    limitationZh: buildEnergyTransportLimitation(),
    notes: buildEnergyTransportNotes()
  };
}

function normalizePreviousEnergyTransport(prevEnergyTransport, reason = 'fetch_failed') {
  if (!prevEnergyTransport || typeof prevEnergyTransport !== 'object') {
    return buildMissingEnergyTransport(reason);
  }
  const latestDate = dateOnlyIso(prevEnergyTransport.latestDate);
  const latestAgeDays = dateOnlyAgeDays(latestDate);
  if (latestAgeDays === null || latestAgeDays > ENERGY_TRANSPORT_STALE_DAYS) {
    return {
      ...buildMissingEnergyTransport('previous_latest_date_stale'),
      sourceStatus: { chokepoints: 'stale' },
      latestDate,
      latestAgeDays
    };
  }
  const previousChokepoints = (
    prevEnergyTransport.chokepoints &&
    typeof prevEnergyTransport.chokepoints === 'object' &&
    !Array.isArray(prevEnergyTransport.chokepoints)
  )
    ? prevEnergyTransport.chokepoints
    : buildEmptyEnergyTransportChokepoints('missing');
  const reroutingProxy = (
    prevEnergyTransport.reroutingProxy &&
    typeof prevEnergyTransport.reroutingProxy === 'object' &&
    !Array.isArray(prevEnergyTransport.reroutingProxy)
  )
    ? prevEnergyTransport.reroutingProxy
    : buildMissingEnergyTransport(reason).reroutingProxy;
  return {
    source: ENERGY_TRANSPORT_SOURCE,
    sourceUrl: ENERGY_TRANSPORT_SOURCE_URL,
    queryUrl: ENERGY_TRANSPORT_QUERY_URL,
    sourceStatus: { chokepoints: 'fallback' },
    usageTermsPinned: ENERGY_TRANSPORT_USAGE_TERMS_PINNED,
    redistributionCaveat: true,
    latestDate,
    latestAgeDays,
    windowDays: ENERGY_TRANSPORT_WINDOW_DAYS,
    fetchedAt: isoNow,
    lastEditDate: normalizeIsoOrNull(prevEnergyTransport.lastEditDate),
    fetchReason: reason,
    chokepoints: previousChokepoints,
    reroutingProxy,
    transportShockCandidate: buildEnergyTransportShockCandidate(previousChokepoints, reroutingProxy, 'fallback'),
    limitationZh: typeof prevEnergyTransport.limitationZh === 'string'
      ? prevEnergyTransport.limitationZh
      : buildEnergyTransportLimitation(),
    notes: Array.isArray(prevEnergyTransport.notes) && prevEnergyTransport.notes.length
      ? prevEnergyTransport.notes
      : buildEnergyTransportNotes()
  };
}

function buildEnergyTransportQueryUrl() {
  const params = new URLSearchParams();
  const quotedIds = ENERGY_TRANSPORT_CHOKEPOINTS.map((item) => `'${item.portid}'`).join(',');
  params.set('f', 'json');
  params.set('where', `portid IN (${quotedIds})`);
  params.set('outFields', 'date,portid,portname,n_tanker,n_total,capacity_tanker,capacity');
  params.set('orderByFields', 'date DESC');
  params.set('returnGeometry', 'false');
  params.set('resultRecordCount', String(ENERGY_TRANSPORT_QUERY_RECORD_LIMIT));
  return `${ENERGY_TRANSPORT_QUERY_URL}?${params.toString()}`;
}

function normalizePortWatchDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return dateOnlyIso(value);
}

function parseEnergyTransportRows(payload) {
  if (payload?.error) throw new Error(`portwatch:chokepoints api_error:${JSON.stringify(payload.error).slice(0, 160)}`);
  const features = payload?.features;
  if (!Array.isArray(features)) throw new Error('portwatch:chokepoints missing features[]');
  return features
    .map((feature) => {
      const row = feature?.attributes || {};
      const portid = typeof row.portid === 'string' ? row.portid : null;
      const definition = portid ? ENERGY_TRANSPORT_CHOKEPOINT_BY_PORTID.get(portid) : null;
      return {
        date: normalizePortWatchDate(row.date),
        portid,
        portname: typeof row.portname === 'string' ? row.portname : definition?.portname || null,
        nTanker: finiteNumberOrNull(row.n_tanker),
        nTotal: finiteNumberOrNull(row.n_total),
        capacityTanker: finiteNumberOrNull(row.capacity_tanker),
        capacityTotal: finiteNumberOrNull(row.capacity),
        definition
      };
    })
    .filter((row) => (
      row.definition &&
      dateOnlyIso(row.date) &&
      Number.isFinite(row.nTanker) &&
      Number.isFinite(row.nTotal) &&
      Number.isFinite(row.capacityTanker) &&
      Number.isFinite(row.capacityTotal) &&
      row.nTanker >= 0 &&
      row.nTotal >= 0 &&
      row.capacityTanker >= 0 &&
      row.capacityTotal >= 0
    ))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function averageEnergyTransportWindow(rows, latestDate, days, field) {
  const latestMs = Date.parse(`${latestDate}T00:00:00Z`);
  if (!Number.isFinite(latestMs)) return null;
  const values = rows
    .filter((row) => {
      const rowMs = Date.parse(`${row.date}T00:00:00Z`);
      if (!Number.isFinite(rowMs)) return false;
      const deltaDays = Math.floor((latestMs - rowMs) / (24 * 3600 * 1000));
      return deltaDays >= 0 && deltaDays < days;
    })
    .map((row) => row[field])
    .filter(Number.isFinite);
  if (!values.length) return null;
  return roundEnergyTransportNumber(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function pctChangeEnergyTransport(latest, base) {
  if (!Number.isFinite(latest) || !Number.isFinite(base) || base <= 0) return null;
  return roundEnergyTransportNumber((latest - base) / base, 4);
}

function buildEnergyTransportChokepoint(definition, rows, latestDate) {
  const latest = rows.find((row) => row.date === latestDate) || rows[0] || null;
  if (!latest) {
    return buildEmptyEnergyTransportChokepoints('missing')[definition.key];
  }
  const avg7Tanker = averageEnergyTransportWindow(rows, latestDate, 7, 'nTanker');
  const avg7Capacity = averageEnergyTransportWindow(rows, latestDate, 7, 'capacityTanker');
  const avg30Tanker = averageEnergyTransportWindow(rows, latestDate, 30, 'nTanker');
  const avg30Capacity = averageEnergyTransportWindow(rows, latestDate, 30, 'capacityTanker');
  const observations30d = rows.filter((row) => {
    const latestMs = Date.parse(`${latestDate}T00:00:00Z`);
    const rowMs = Date.parse(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(latestMs) || !Number.isFinite(rowMs)) return false;
    const deltaDays = Math.floor((latestMs - rowMs) / (24 * 3600 * 1000));
    return deltaDays >= 0 && deltaDays < 30;
  }).length;
  return {
    portid: definition.portid,
    portname: definition.portname,
    latest: {
      date: latest.date,
      nTanker: latest.nTanker,
      nTotal: latest.nTotal,
      capacityTanker: latest.capacityTanker,
      capacityTotal: latest.capacityTotal
    },
    avg7d: {
      nTanker: avg7Tanker,
      capacityTanker: avg7Capacity
    },
    avg30d: {
      nTanker: avg30Tanker,
      capacityTanker: avg30Capacity
    },
    latestVs30dPct: pctChangeEnergyTransport(latest.nTanker, avg30Tanker),
    capacityTankerVs30dPct: pctChangeEnergyTransport(latest.capacityTanker, avg30Capacity),
    sourceStatus: observations30d >= 10 ? 'live' : 'insufficient_window'
  };
}

function classifyRedSeaToCapeRerouting(chokepoints) {
  const suez = chokepoints.suez?.latestVs30dPct;
  const bab = chokepoints.babElMandeb?.latestVs30dPct;
  const cape = chokepoints.capeGoodHope?.latestVs30dPct;
  const redSeaValues = [suez, bab].filter(Number.isFinite);
  if (redSeaValues.length < 2 || !Number.isFinite(cape)) {
    return {
      redSeaToCapeRegime: 'unknown',
      suezBabTankerVs30dPct: null,
      capeTankerVs30dPct: Number.isFinite(cape) ? cape : null,
      notes: ['PortWatch rerouting proxy insufficient: Suez/Bab el-Mandeb/Cape windows not all available.']
    };
  }
  const redSeaAvg = roundEnergyTransportNumber(redSeaValues.reduce((sum, value) => sum + value, 0) / redSeaValues.length, 4);
  const regime = redSeaAvg <= -0.2 && cape >= 0.2 ? 'rerouting_watch' : 'normal';
  return {
    redSeaToCapeRegime: regime,
    suezBabTankerVs30dPct: redSeaAvg,
    capeTankerVs30dPct: cape,
    notes: regime === 'rerouting_watch'
      ? ['Suez/Bab el-Mandeb tanker proxy below 30d average while Cape proxy is above 30d average;AIS-derived rerouting watch only.']
      : ['No material Red Sea to Cape rerouting proxy based on current AIS-derived 30d deviations.']
  };
}

export function buildEnergyTransportLayer(rows) {
  const latestDate = rows[0]?.date || null;
  const latestAgeDays = dateOnlyAgeDays(latestDate);
  if (!latestDate || latestAgeDays === null) throw new Error('portwatch:chokepoints missing latestDate');
  if (latestAgeDays > ENERGY_TRANSPORT_STALE_DAYS) {
    return {
      ...buildMissingEnergyTransport('latest_date_stale'),
      sourceStatus: { chokepoints: 'stale' },
      latestDate,
      latestAgeDays
    };
  }
  const chokepoints = {};
  for (const definition of ENERGY_TRANSPORT_CHOKEPOINTS) {
    const perPortRows = rows
      .filter((row) => row.portid === definition.portid)
      .sort((a, b) => b.date.localeCompare(a.date));
    chokepoints[definition.key] = buildEnergyTransportChokepoint(definition, perPortRows, latestDate);
  }
  const missingCore = ENERGY_TRANSPORT_CORE_KEYS.filter((key) => (
    chokepoints[key]?.latest?.date !== latestDate ||
    !Number.isFinite(chokepoints[key]?.latest?.nTanker) ||
    !Number.isFinite(chokepoints[key]?.latest?.capacityTanker)
  ));
  if (missingCore.length) {
    return {
      ...buildMissingEnergyTransport(`missing_core_chokepoints:${missingCore.join(',')}`),
      sourceStatus: { chokepoints: 'missing' },
      chokepoints
    };
  }
  const reroutingProxy = classifyRedSeaToCapeRerouting(chokepoints);
  return {
    source: ENERGY_TRANSPORT_SOURCE,
    sourceUrl: ENERGY_TRANSPORT_SOURCE_URL,
    queryUrl: ENERGY_TRANSPORT_QUERY_URL,
    sourceStatus: { chokepoints: 'live' },
    usageTermsPinned: ENERGY_TRANSPORT_USAGE_TERMS_PINNED,
    redistributionCaveat: true,
    latestDate,
    latestAgeDays,
    windowDays: ENERGY_TRANSPORT_WINDOW_DAYS,
    fetchedAt: isoNow,
    lastEditDate: null,
    fetchReason: null,
    chokepoints,
    reroutingProxy,
    transportShockCandidate: buildEnergyTransportShockCandidate(chokepoints, reroutingProxy, 'live'),
    limitationZh: buildEnergyTransportLimitation(),
    notes: buildEnergyTransportNotes()
  };
}

async function resolveEnergyTransport(prevEnergyTransport) {
  try {
    const payload = await fetchJsonText(
      buildEnergyTransportQueryUrl(),
      'portwatch:chokepoints',
      ENERGY_TRANSPORT_FETCH_TIMEOUT_MS,
      { userAgent: 'GFRRBot/1.0' }
    );
    const rows = parseEnergyTransportRows(payload);
    if (!rows.length) throw new Error('portwatch:chokepoints no usable rows');
    return buildEnergyTransportLayer(rows);
  } catch (err) {
    return normalizePreviousEnergyTransport(prevEnergyTransport, stringifyFetchError(err));
  }
}

function buildMissingFedFundsFuturesCurve() {
  return {
    source: 'Yahoo:ZQ-monthly-futures',
    curveStatus: 'missing',
    updatedAt: null,
    frontImpliedRate: null,
    backImpliedRate: null,
    frontMinusBack: null,
    contracts: [],
    limitationZh: 'Yahoo 月度 Fed funds futures 报价不可用；OIS forward rate 仍需 manual/licensed input。'
  };
}

function normalizePreviousFedFundsFuturesCurve(prevCurve) {
  if (!prevCurve || typeof prevCurve !== 'object') return buildMissingFedFundsFuturesCurve();
  const contracts = Array.isArray(prevCurve.contracts)
    ? prevCurve.contracts
        .map((contract) => ({
          symbol: typeof contract?.symbol === 'string' ? contract.symbol : null,
          contractMonth: typeof contract?.contractMonth === 'string' ? contract.contractMonth : null,
          price: Number.isFinite(contract?.price) ? contract.price : null,
          impliedRate: Number.isFinite(contract?.impliedRate) ? contract.impliedRate : null,
          impliedMinusTargetMid: Number.isFinite(contract?.impliedMinusTargetMid) ? contract.impliedMinusTargetMid : null,
          updatedAt: typeof contract?.updatedAt === 'string' ? contract.updatedAt : null
        }))
        .filter((contract) => contract.symbol && contract.contractMonth)
    : [];
  return {
    source: typeof prevCurve.source === 'string' ? prevCurve.source : 'Yahoo:ZQ-monthly-futures',
    curveStatus: ['live_proxy_curve', 'fallback_proxy_curve', 'missing'].includes(prevCurve.curveStatus)
      ? prevCurve.curveStatus
      : (contracts.length ? 'fallback_proxy_curve' : 'missing'),
    updatedAt: typeof prevCurve.updatedAt === 'string' ? prevCurve.updatedAt : null,
    frontImpliedRate: Number.isFinite(prevCurve.frontImpliedRate) ? prevCurve.frontImpliedRate : null,
    backImpliedRate: Number.isFinite(prevCurve.backImpliedRate) ? prevCurve.backImpliedRate : null,
    frontMinusBack: Number.isFinite(prevCurve.frontMinusBack) ? prevCurve.frontMinusBack : null,
    contracts,
    limitationZh: typeof prevCurve.limitationZh === 'string'
      ? prevCurve.limitationZh
      : 'Yahoo 月度 Fed funds futures 为公开代理曲线；不是 OIS forward rate。'
  };
}

function buildMissingSofrFuturesCurve() {
  return {
    source: 'Yahoo:SR3-monthly-SOFR-futures',
    curveStatus: 'missing',
    updatedAt: null,
    frontImpliedRate: null,
    backImpliedRate: null,
    frontMinusBack: null,
    contracts: [],
    limitationZh: 'Yahoo 月度 SR3 Three-Month SOFR futures 报价不可用；OIS forward rate 仍需 manual/licensed input。'
  };
}

function normalizePreviousSofrFuturesCurve(prevCurve) {
  if (!prevCurve || typeof prevCurve !== 'object') return buildMissingSofrFuturesCurve();
  const contracts = Array.isArray(prevCurve.contracts)
    ? prevCurve.contracts
        .map((contract) => ({
          symbol: typeof contract?.symbol === 'string' ? contract.symbol : null,
          contractMonth: typeof contract?.contractMonth === 'string' ? contract.contractMonth : null,
          price: Number.isFinite(contract?.price) ? contract.price : null,
          impliedRate: Number.isFinite(contract?.impliedRate) ? contract.impliedRate : null,
          impliedMinusTargetMid: Number.isFinite(contract?.impliedMinusTargetMid) ? contract.impliedMinusTargetMid : null,
          updatedAt: typeof contract?.updatedAt === 'string' ? contract.updatedAt : null
        }))
        .filter((contract) => contract.symbol && contract.contractMonth)
    : [];
  return {
    source: typeof prevCurve.source === 'string' ? prevCurve.source : 'Yahoo:SR3-monthly-SOFR-futures',
    curveStatus: ['live_proxy_curve', 'fallback_proxy_curve', 'missing'].includes(prevCurve.curveStatus)
      ? prevCurve.curveStatus
      : (contracts.length ? 'fallback_proxy_curve' : 'missing'),
    updatedAt: typeof prevCurve.updatedAt === 'string' ? prevCurve.updatedAt : null,
    frontImpliedRate: Number.isFinite(prevCurve.frontImpliedRate) ? prevCurve.frontImpliedRate : null,
    backImpliedRate: Number.isFinite(prevCurve.backImpliedRate) ? prevCurve.backImpliedRate : null,
    frontMinusBack: Number.isFinite(prevCurve.frontMinusBack) ? prevCurve.frontMinusBack : null,
    contracts,
    limitationZh: typeof prevCurve.limitationZh === 'string'
      ? prevCurve.limitationZh
      : 'Yahoo 月度 SR3 Three-Month SOFR futures 为公开代理曲线；不是 OIS forward rate。'
  };
}

function buildMissingOisForwardCurve() {
  return {
    source: 'CheckMySwap:USD-OIS-public-curve',
    sourceUrl: CHECKMYSWAP_RATES_URL,
    curveStatus: 'missing',
    date: null,
    updatedAt: null,
    oneYearRate: null,
    twoYearRate: null,
    fiveYearRate: null,
    tenYearRate: null,
    twoMinusTargetMid: null,
    tenMinusTwo: null,
    tenors: [],
    limitationZh: 'CheckMySwap USD OIS public curve 不可用；OIS forward rate 需要 manual/licensed input。'
  };
}

function normalizePreviousOisForwardCurve(prevCurve) {
  if (!prevCurve || typeof prevCurve !== 'object') return buildMissingOisForwardCurve();
  const tenors = Array.isArray(prevCurve.tenors)
    ? prevCurve.tenors
        .map((item) => ({
          tenor: typeof item?.tenor === 'string' ? item.tenor : null,
          days: Number.isFinite(item?.days) ? item.days : null,
          rate: Number.isFinite(item?.rate) ? item.rate : null,
          rateBps: Number.isFinite(item?.rateBps) ? item.rateBps : null,
          trades: Number.isFinite(item?.trades) ? item.trades : null,
          closeTrades: Number.isFinite(item?.closeTrades) ? item.closeTrades : null,
          method: typeof item?.method === 'string' ? item.method : null,
          source: typeof item?.source === 'string' ? item.source : null,
          date: typeof item?.date === 'string' ? item.date : null
        }))
        .filter((item) => item.tenor)
    : [];
  return {
    source: typeof prevCurve.source === 'string' ? prevCurve.source : 'CheckMySwap:USD-OIS-public-curve',
    sourceUrl: typeof prevCurve.sourceUrl === 'string' ? prevCurve.sourceUrl : CHECKMYSWAP_RATES_URL,
    curveStatus: ['live_public_curve', 'fallback_public_curve', 'missing'].includes(prevCurve.curveStatus)
      ? prevCurve.curveStatus
      : (tenors.length ? 'fallback_public_curve' : 'missing'),
    date: typeof prevCurve.date === 'string' ? prevCurve.date : null,
    updatedAt: typeof prevCurve.updatedAt === 'string' ? prevCurve.updatedAt : null,
    oneYearRate: Number.isFinite(prevCurve.oneYearRate) ? prevCurve.oneYearRate : null,
    twoYearRate: Number.isFinite(prevCurve.twoYearRate) ? prevCurve.twoYearRate : null,
    fiveYearRate: Number.isFinite(prevCurve.fiveYearRate) ? prevCurve.fiveYearRate : null,
    tenYearRate: Number.isFinite(prevCurve.tenYearRate) ? prevCurve.tenYearRate : null,
    twoMinusTargetMid: Number.isFinite(prevCurve.twoMinusTargetMid) ? prevCurve.twoMinusTargetMid : null,
    tenMinusTwo: Number.isFinite(prevCurve.tenMinusTwo) ? prevCurve.tenMinusTwo : null,
    tenors,
    limitationZh: typeof prevCurve.limitationZh === 'string'
      ? prevCurve.limitationZh
      : 'CheckMySwap USD OIS curve 为免费公开曲线,来自 DTCC/CFTC public swap data；不是 dealer screen 或专有 forward curve。'
  };
}

function getOisTenorRate(curve, tenor) {
  const found = Array.isArray(curve?.tenors)
    ? curve.tenors.find((item) => item?.tenor === tenor)
    : null;
  return Number.isFinite(found?.rate) ? found.rate : null;
}

function buildOisForwardCurve(payload, targetMid) {
  const rows = Array.isArray(payload?.curve) ? payload.curve : [];
  const tenors = rows
    .map((item) => ({
      tenor: typeof item?.tenor === 'string' ? item.tenor.trim() : null,
      days: Number.isFinite(Number(item?.days)) ? Number(item.days) : null,
      rate: Number.isFinite(Number(item?.rate)) ? +Number(item.rate).toFixed(3) : null,
      rateBps: Number.isFinite(Number(item?.rateBps)) ? +Number(item.rateBps).toFixed(3) : null,
      trades: Number.isFinite(Number(item?.trades)) ? Number(item.trades) : null,
      closeTrades: Number.isFinite(Number(item?.closeTrades)) ? Number(item.closeTrades) : null,
      method: typeof item?.method === 'string' ? item.method.trim() : null,
      source: typeof item?.source === 'string' ? item.source.trim() : null,
      date: typeof item?.date === 'string' ? item.date.trim() : null
    }))
    .filter((item) => item.tenor && Number.isFinite(item.rate));
  if (!tenors.length) throw new Error('checkmyswap:usd-ois missing tenor rates');
  const date = typeof payload?.date === 'string' ? payload.date : (tenors.find((item) => item.date)?.date || null);
  const updatedAt = typeof payload?.fetchedAt === 'string' && Number.isFinite(Date.parse(payload.fetchedAt))
    ? new Date(Date.parse(payload.fetchedAt)).toISOString()
    : (date ? `${date}T00:00:00Z` : isoNow);
  const oneYearRate = getOisTenorRate({ tenors }, '1Y');
  const twoYearRate = getOisTenorRate({ tenors }, '2Y');
  const fiveYearRate = getOisTenorRate({ tenors }, '5Y');
  const tenYearRate = getOisTenorRate({ tenors }, '10Y');
  return {
    source: 'CheckMySwap:USD-OIS-public-curve',
    sourceUrl: CHECKMYSWAP_RATES_URL,
    curveStatus: 'live_public_curve',
    date,
    updatedAt,
    oneYearRate,
    twoYearRate,
    fiveYearRate,
    tenYearRate,
    twoMinusTargetMid: Number.isFinite(twoYearRate) && Number.isFinite(targetMid)
      ? +(twoYearRate - targetMid).toFixed(3)
      : null,
    tenMinusTwo: Number.isFinite(tenYearRate) && Number.isFinite(twoYearRate)
      ? +(tenYearRate - twoYearRate).toFixed(3)
      : null,
    tenors: tenors.slice(0, 12),
    limitationZh: 'CheckMySwap USD OIS curve 为免费公开曲线,来自 DTCC/CFTC public swap data；不是 dealer screen、licensed OIS forward curve 或交易建议。'
  };
}

async function fetchCheckMySwapUsdOisCurve() {
  return fetchJsonText(CHECKMYSWAP_USD_OIS_CURVE_URL, 'checkmyswap:usd-ois-curve', CHECKMYSWAP_FETCH_TIMEOUT_MS, {
    userAgent: 'GFRRBot/1.0'
  });
}

function buildMissingPolicyExpectations() {
  return {
    targetLower: null,
    targetUpper: null,
    targetMid: null,
    effectiveFedFundsRate: null,
    targetUpdatedAt: null,
    fedFundsFutureFrontPrice: null,
    fedFundsFutureImpliedRate: null,
    futureMinusTargetMid: null,
    futureUpdatedAt: null,
    fedFundsFuturesCurve: buildMissingFedFundsFuturesCurve(),
    sofrFuturesCurve: buildMissingSofrFuturesCurve(),
    oisForwardCurve: buildMissingOisForwardCurve(),
    dotPlotMedianCurrentYear: null,
    dotPlotMedianNextYear: null,
    dotPlotMedianTwoYearsOut: null,
    dotPlotMedianLongerRun: null,
    sepProjectionDate: null,
    sepUrl: null,
    statementDate: null,
    statementUrl: null,
    statementTargetRangeText: null,
    hawkishTermCount: null,
    dovishTermCount: null,
    policyTone: '未知',
    minutesDate: null,
    minutesUrl: null,
    minutesHawkishTermCount: null,
    minutesDovishTermCount: null,
    minutesPolicyTone: '未知',
    minutesTopicCounts: null,
    minutesSummaryZh: null,
    policyExpectationRegime: '未知',
    oisForwardRate: null,
    oisForwardStatus: 'manual_required',
    sourceStatus: {
      targetRange: 'missing',
      fedFundsFuture: 'missing',
      fedFundsFuturesCurve: 'missing',
      sofrFuturesCurve: 'missing',
      sepDotPlot: 'missing',
      policyStatement: 'missing',
      fomcMinutes: 'missing',
      oisForward: 'manual_required'
    },
    updatedAt: null,
    source: POLICY_EXPECTATIONS_SOURCE,
    notes: ['FOMC statement/SEP/minutes 来自 federalreserve.gov；ZQ=F、ZQ 月度合约、SR3 月度 SOFR futures 与 CheckMySwap USD OIS public curve 为公开政策/融资曲线证据。']
  };
}

function buildMissingPrivateCreditProxy() {
  return {
    bdcEtfPrice: null,
    bdcEtf4wChange: null,
    bdcEtfUpdatedAt: null,
    pbdcEtfPrice: null,
    pbdcEtf4wChange: null,
    pbdcEtfUpdatedAt: null,
    seniorLoanEtfPrice: null,
    seniorLoanEtf4wChange: null,
    seniorLoanEtfUpdatedAt: null,
    intervalFundNavPrice: null,
    intervalFundNav4wChange: null,
    intervalFundNavUpdatedAt: null,
    intervalFundNavSymbol: 'CCLFX',
    intervalFundNavStatus: 'missing',
    hyOas: null,
    igOas: null,
    igOasUpdatedAt: null,
    igMinusHyOas: null,
    cdxHyPrice: null,
    cdxHyInstrument: null,
    cdxHyUpdatedAt: null,
    cdxIgPrice: null,
    cdxIgInstrument: null,
    cdxIgUpdatedAt: null,
    cdxHyStatus: 'manual_required',
    cdxIgStatus: 'manual_required',
    privateCreditMarksStatus: 'manual_required',
    privateCreditProxyRegime: '未知',
    sourceStatus: {
      bdcEtf: 'missing',
      pbdcEtf: 'missing',
      seniorLoanEtf: 'missing',
      intervalFundNav: 'missing',
      hyOas: 'missing',
      igOas: 'missing',
      cdxHy: 'manual_required',
      cdxIg: 'manual_required',
      privateCreditMarks: 'manual_required'
    },
    updatedAt: null,
    source: PRIVATE_CREDIT_PROXY_SOURCE,
    notes: ['BIZD/PBDC 为公开上市 BDC ETF 代理；SRLN 为 senior loan ETF 代理；CCLFX 为公开 interval-fund NAV proxy；HY/IG OAS 为 FRED cash-bond spread proxy；ICE CDX 为公开 EOD settlement price；私募信用 marks 仍保留 manual/licensed 插槽。']
  };
}

function normalizePreviousEmployment(prevEmployment) {
  if (!prevEmployment || typeof prevEmployment !== 'object') return buildMissingEmployment();
  const initialClaims = Number.isFinite(prevEmployment.initialClaims) ? prevEmployment.initialClaims : null;
  const initialClaims4wAverage = Number.isFinite(prevEmployment.initialClaims4wAverage) ? prevEmployment.initialClaims4wAverage : null;
  const initialClaims4wChange = Number.isFinite(prevEmployment.initialClaims4wChange) ? prevEmployment.initialClaims4wChange : null;
  const continuingClaims = Number.isFinite(prevEmployment.continuingClaims) ? prevEmployment.continuingClaims : null;
  const continuingClaims4wAverage = Number.isFinite(prevEmployment.continuingClaims4wAverage) ? prevEmployment.continuingClaims4wAverage : null;
  const joltsOpenings = Number.isFinite(prevEmployment.joltsOpenings) ? prevEmployment.joltsOpenings : null;
  const joltsOpeningsYoY = Number.isFinite(prevEmployment.joltsOpeningsYoY) ? prevEmployment.joltsOpeningsYoY : null;
  const averageHourlyEarnings = Number.isFinite(prevEmployment.averageHourlyEarnings) ? prevEmployment.averageHourlyEarnings : null;
  const averageHourlyEarningsYoY = Number.isFinite(prevEmployment.averageHourlyEarningsYoY) ? prevEmployment.averageHourlyEarningsYoY : null;
  const u6Rate = Number.isFinite(prevEmployment.u6Rate) ? prevEmployment.u6Rate : null;
  const u6Rate3mChange = Number.isFinite(prevEmployment.u6Rate3mChange) ? prevEmployment.u6Rate3mChange : null;
  const industryPayrollDiffusionPct = Number.isFinite(prevEmployment.industryPayrollDiffusionPct)
    ? prevEmployment.industryPayrollDiffusionPct
    : null;
  const industryPayrollPositiveCount = Number.isFinite(prevEmployment.industryPayrollPositiveCount)
    ? prevEmployment.industryPayrollPositiveCount
    : null;
  const industryPayrollSeriesCount = Number.isFinite(prevEmployment.industryPayrollSeriesCount)
    ? prevEmployment.industryPayrollSeriesCount
    : null;
  return {
    initialClaims,
    initialClaims4wAverage,
    initialClaims4wChange,
    continuingClaims,
    continuingClaims4wAverage,
    joltsOpenings,
    joltsOpeningsYoY,
    joltsUpdatedAt: typeof prevEmployment.joltsUpdatedAt === 'string' ? prevEmployment.joltsUpdatedAt : null,
    averageHourlyEarnings,
    averageHourlyEarningsYoY,
    averageHourlyEarningsUpdatedAt: typeof prevEmployment.averageHourlyEarningsUpdatedAt === 'string'
      ? prevEmployment.averageHourlyEarningsUpdatedAt
      : null,
    u6Rate,
    u6Rate3mChange,
    u6UpdatedAt: typeof prevEmployment.u6UpdatedAt === 'string' ? prevEmployment.u6UpdatedAt : null,
    industryPayrollDiffusionPct,
    industryPayrollPositiveCount,
    industryPayrollSeriesCount,
    industryPayrollUpdatedAt: typeof prevEmployment.industryPayrollUpdatedAt === 'string'
      ? prevEmployment.industryPayrollUpdatedAt
      : null,
    claimsRegime: typeof prevEmployment.claimsRegime === 'string' && prevEmployment.claimsRegime.trim()
      ? prevEmployment.claimsRegime
      : classifyClaimsRegime(initialClaims4wAverage, initialClaims4wChange),
    joltsRegime: typeof prevEmployment.joltsRegime === 'string' && prevEmployment.joltsRegime.trim()
      ? prevEmployment.joltsRegime
      : classifyJoltsRegime(joltsOpenings, joltsOpeningsYoY),
    laborQualityRegime: typeof prevEmployment.laborQualityRegime === 'string' && prevEmployment.laborQualityRegime.trim()
      ? prevEmployment.laborQualityRegime
      : classifyLaborQualityRegime(averageHourlyEarningsYoY, u6Rate3mChange, industryPayrollDiffusionPct),
    industryDiffusionRegime: typeof prevEmployment.industryDiffusionRegime === 'string' && prevEmployment.industryDiffusionRegime.trim()
      ? prevEmployment.industryDiffusionRegime
      : classifyIndustryDiffusionRegime(industryPayrollDiffusionPct),
    sourceStatus: {
      icsa: initialClaims !== null ? 'fallback' : 'missing',
      ccsa: continuingClaims !== null ? 'fallback' : 'missing',
      jtsjol: joltsOpenings !== null ? 'fallback' : 'missing',
      ahe: averageHourlyEarnings !== null ? 'fallback' : 'missing',
      u6: u6Rate !== null ? 'fallback' : 'missing',
      industryPayroll: industryPayrollDiffusionPct !== null ? 'fallback' : 'missing'
    },
    updatedAt: typeof prevEmployment.updatedAt === 'string' ? prevEmployment.updatedAt : null,
    source: EMPLOYMENT_SOURCE,
    notes: ['ICSA/CCSA 为 FRED SA 周频；JOLTS、AHE、U-6 与行业 payroll basket 为月频；audit-only / display-only。']
  };
}

function normalizePreviousConsumerRetail(prevConsumerRetail) {
  if (!prevConsumerRetail || typeof prevConsumerRetail !== 'object') return buildMissingConsumerRetail();
  const cartsNominal = Number.isFinite(prevConsumerRetail.cartsNominal) ? prevConsumerRetail.cartsNominal : null;
  const cartsNominal4wAverage = Number.isFinite(prevConsumerRetail.cartsNominal4wAverage) ? prevConsumerRetail.cartsNominal4wAverage : null;
  const cartsNominalYoY = Number.isFinite(prevConsumerRetail.cartsNominalYoY) ? prevConsumerRetail.cartsNominalYoY : null;
  const cartsReal = Number.isFinite(prevConsumerRetail.cartsReal) ? prevConsumerRetail.cartsReal : null;
  const cartsReal4wAverage = Number.isFinite(prevConsumerRetail.cartsReal4wAverage) ? prevConsumerRetail.cartsReal4wAverage : null;
  const cartsRealYoY = Number.isFinite(prevConsumerRetail.cartsRealYoY) ? prevConsumerRetail.cartsRealYoY : null;
  const retailSegments = Array.isArray(prevConsumerRetail.retailSegments)
    ? prevConsumerRetail.retailSegments
    : buildMissingConsumerRetail().retailSegments;
  const segmentDiffusionPct = Number.isFinite(prevConsumerRetail.segmentDiffusionPct)
    ? prevConsumerRetail.segmentDiffusionPct
    : null;
  const bofaCardSpendingYoY = Number.isFinite(prevConsumerRetail.bofaCardSpendingYoY)
    ? prevConsumerRetail.bofaCardSpendingYoY
    : null;
  const bofaCardSpendingExGasYoY = Number.isFinite(prevConsumerRetail.bofaCardSpendingExGasYoY)
    ? prevConsumerRetail.bofaCardSpendingExGasYoY
    : null;
  const redbookRetailSalesYoY = Number.isFinite(prevConsumerRetail.redbookRetailSalesYoY)
    ? prevConsumerRetail.redbookRetailSalesYoY
    : null;
  return {
    cartsNominal,
    cartsNominal4wAverage,
    cartsNominalYoY,
    cartsReal,
    cartsReal4wAverage,
    cartsRealYoY,
    retailSegments,
    segmentPositiveCount: Number.isFinite(prevConsumerRetail.segmentPositiveCount)
      ? prevConsumerRetail.segmentPositiveCount
      : null,
    segmentSeriesCount: Number.isFinite(prevConsumerRetail.segmentSeriesCount)
      ? prevConsumerRetail.segmentSeriesCount
      : null,
    segmentDiffusionPct,
    segmentRegime: typeof prevConsumerRetail.segmentRegime === 'string' && prevConsumerRetail.segmentRegime.trim()
      ? prevConsumerRetail.segmentRegime
      : classifyRetailSegmentRegime(segmentDiffusionPct),
    strongestSegment: prevConsumerRetail.strongestSegment && typeof prevConsumerRetail.strongestSegment === 'object'
      ? prevConsumerRetail.strongestSegment
      : null,
    weakestSegment: prevConsumerRetail.weakestSegment && typeof prevConsumerRetail.weakestSegment === 'object'
      ? prevConsumerRetail.weakestSegment
      : null,
    segmentUpdatedAt: typeof prevConsumerRetail.segmentUpdatedAt === 'string' ? prevConsumerRetail.segmentUpdatedAt : null,
    bofaCardSpendingYoY,
    bofaCardSpendingPriorYoY: Number.isFinite(prevConsumerRetail.bofaCardSpendingPriorYoY)
      ? prevConsumerRetail.bofaCardSpendingPriorYoY
      : null,
    bofaCardSpendingExGasYoY,
    bofaReportDate: typeof prevConsumerRetail.bofaReportDate === 'string' ? prevConsumerRetail.bofaReportDate : null,
    bofaReportUrl: typeof prevConsumerRetail.bofaReportUrl === 'string' ? prevConsumerRetail.bofaReportUrl : null,
    bofaPdfUrl: typeof prevConsumerRetail.bofaPdfUrl === 'string' ? prevConsumerRetail.bofaPdfUrl : null,
    bofaStatus: bofaCardSpendingYoY !== null || bofaCardSpendingExGasYoY !== null ? 'fallback' : 'missing',
    bofaSummary: typeof prevConsumerRetail.bofaSummary === 'string' ? prevConsumerRetail.bofaSummary : null,
    redbookRetailSalesYoY,
    redbookHistoricalAverageYoY: Number.isFinite(prevConsumerRetail.redbookHistoricalAverageYoY)
      ? prevConsumerRetail.redbookHistoricalAverageYoY
      : null,
    redbookRetailSalesDate: typeof prevConsumerRetail.redbookRetailSalesDate === 'string' ? prevConsumerRetail.redbookRetailSalesDate : null,
    redbookReportUrl: typeof prevConsumerRetail.redbookReportUrl === 'string' ? prevConsumerRetail.redbookReportUrl : null,
    redbookStatus: redbookRetailSalesYoY !== null ? 'fallback' : 'missing',
    redbookSummary: typeof prevConsumerRetail.redbookSummary === 'string' ? prevConsumerRetail.redbookSummary : null,
    retailRegime: typeof prevConsumerRetail.retailRegime === 'string' && prevConsumerRetail.retailRegime.trim()
      ? prevConsumerRetail.retailRegime
      : classifyRetailRegime(cartsRealYoY, redbookRetailSalesYoY),
    sourceStatus: {
      carts: cartsNominal !== null ? 'fallback' : 'missing',
      cartsr: cartsReal !== null ? 'fallback' : 'missing',
      retailSegments: segmentDiffusionPct !== null ? 'fallback' : 'missing',
      bofaConsumerCheckpoint: bofaCardSpendingYoY !== null || bofaCardSpendingExGasYoY !== null ? 'fallback' : 'missing',
      redbookPublicHtml: redbookRetailSalesYoY !== null ? 'fallback' : 'missing'
    },
    updatedAt: typeof prevConsumerRetail.updatedAt === 'string' ? prevConsumerRetail.updatedAt : null,
    source: CONSUMER_RETAIL_SOURCE,
    notes: ['CARTS / CARTSR 为 Chicago Fed via FRED 周频零售+餐饮 nowcast；MRTS 细分零售为月频公开数据；BoA Consumer Checkpoint 与 Redbook public HTML 为第三方公开消费证据；audit-only / display-only。']
  };
}

function normalizePreviousCommercialRealEstate(prevCre) {
  if (!prevCre || typeof prevCre !== 'object') return buildMissingCommercialRealEstate();
  const creDelinquencyRate = Number.isFinite(prevCre.creDelinquencyRate) ? prevCre.creDelinquencyRate : null;
  const creDelinquencyRateQoQChange = Number.isFinite(prevCre.creDelinquencyRateQoQChange) ? prevCre.creDelinquencyRateQoQChange : null;
  const creChargeOffRate = Number.isFinite(prevCre.creChargeOffRate) ? prevCre.creChargeOffRate : null;
  const creChargeOffRateQoQChange = Number.isFinite(prevCre.creChargeOffRateQoQChange) ? prevCre.creChargeOffRateQoQChange : null;
  const sloosCreNonfarmNonresidentialTightening = Number.isFinite(prevCre.sloosCreNonfarmNonresidentialTightening)
    ? prevCre.sloosCreNonfarmNonresidentialTightening
    : null;
  const sloosCreConstructionTightening = Number.isFinite(prevCre.sloosCreConstructionTightening)
    ? prevCre.sloosCreConstructionTightening
    : null;
  const sloosCreMultifamilyTightening = Number.isFinite(prevCre.sloosCreMultifamilyTightening)
    ? prevCre.sloosCreMultifamilyTightening
    : null;
  const sloosValues = [
    sloosCreNonfarmNonresidentialTightening,
    sloosCreConstructionTightening,
    sloosCreMultifamilyTightening
  ].filter(Number.isFinite);
  const sloosCreTighteningMax = Number.isFinite(prevCre.sloosCreTighteningMax)
    ? prevCre.sloosCreTighteningMax
    : (sloosValues.length ? Math.max(...sloosValues) : null);
  const reitEtfPrice = Number.isFinite(prevCre.reitEtfPrice) ? prevCre.reitEtfPrice : null;
  const reitEtf4wChange = Number.isFinite(prevCre.reitEtf4wChange) ? prevCre.reitEtf4wChange : null;
  const mortgageReitEtfPrice = Number.isFinite(prevCre.mortgageReitEtfPrice) ? prevCre.mortgageReitEtfPrice : null;
  const mortgageReitEtf4wChange = Number.isFinite(prevCre.mortgageReitEtf4wChange) ? prevCre.mortgageReitEtf4wChange : null;
  const cmbsEtfPrice = Number.isFinite(prevCre.cmbsEtfPrice) ? prevCre.cmbsEtfPrice : null;
  const cmbsEtf4wChange = Number.isFinite(prevCre.cmbsEtf4wChange) ? prevCre.cmbsEtf4wChange : null;
  const creLoanBalance = Number.isFinite(prevCre.creLoanBalance) ? prevCre.creLoanBalance : null;
  const creLoanBalance4wChange = Number.isFinite(prevCre.creLoanBalance4wChange) ? prevCre.creLoanBalance4wChange : null;
  const creLoanBalanceYoY = Number.isFinite(prevCre.creLoanBalanceYoY) ? prevCre.creLoanBalanceYoY : null;
  return {
    creDelinquencyRate,
    creDelinquencyRateQoQChange,
    creChargeOffRate,
    creChargeOffRateQoQChange,
    sloosCreNonfarmNonresidentialTightening,
    sloosCreConstructionTightening,
    sloosCreMultifamilyTightening,
    sloosCreTighteningMax,
    reitEtfPrice,
    reitEtf4wChange,
    reitEtfUpdatedAt: typeof prevCre.reitEtfUpdatedAt === 'string' ? prevCre.reitEtfUpdatedAt : null,
    mortgageReitEtfPrice,
    mortgageReitEtf4wChange,
    mortgageReitEtfUpdatedAt: typeof prevCre.mortgageReitEtfUpdatedAt === 'string'
      ? prevCre.mortgageReitEtfUpdatedAt
      : null,
    cmbsEtfPrice,
    cmbsEtf4wChange,
    cmbsEtfUpdatedAt: typeof prevCre.cmbsEtfUpdatedAt === 'string' ? prevCre.cmbsEtfUpdatedAt : null,
    creLoanBalance,
    creLoanBalance4wChange,
    creLoanBalanceYoY,
    creLoanBalanceUpdatedAt: typeof prevCre.creLoanBalanceUpdatedAt === 'string' ? prevCre.creLoanBalanceUpdatedAt : null,
    creLoanBalanceStatus: typeof prevCre.creLoanBalanceStatus === 'string'
      ? prevCre.creLoanBalanceStatus
      : (creLoanBalance !== null ? 'fallback' : 'missing'),
    crePublicMarketProxyRegime: typeof prevCre.crePublicMarketProxyRegime === 'string' && prevCre.crePublicMarketProxyRegime.trim()
      ? prevCre.crePublicMarketProxyRegime
      : classifyCrePublicMarketProxyRegime(reitEtf4wChange, mortgageReitEtf4wChange, cmbsEtf4wChange),
    nonPublicCreStatus: typeof prevCre.nonPublicCreStatus === 'string' ? prevCre.nonPublicCreStatus : 'manual_required',
    creStressRegime: typeof prevCre.creStressRegime === 'string' && prevCre.creStressRegime.trim()
      ? prevCre.creStressRegime
      : classifyCreStressRegime(creDelinquencyRate, creChargeOffRate, sloosCreTighteningMax),
    sourceStatus: {
      delinquency: creDelinquencyRate !== null ? 'fallback' : 'missing',
      chargeOff: creChargeOffRate !== null ? 'fallback' : 'missing',
      sloosNonfarmNonresidential: sloosCreNonfarmNonresidentialTightening !== null ? 'fallback' : 'missing',
      sloosConstruction: sloosCreConstructionTightening !== null ? 'fallback' : 'missing',
      sloosMultifamily: sloosCreMultifamilyTightening !== null ? 'fallback' : 'missing',
      reitEtf: reitEtfPrice !== null ? 'fallback' : 'missing',
      mortgageReitEtf: mortgageReitEtfPrice !== null ? 'fallback' : 'missing',
      cmbsEtf: cmbsEtfPrice !== null ? 'fallback' : 'missing',
      creLoanBalance: creLoanBalance !== null ? 'fallback' : 'missing',
      nonPublicCre: 'manual_required'
    },
    updatedAt: typeof prevCre.updatedAt === 'string' ? prevCre.updatedAt : null,
    source: CRE_PUBLIC_MARKET_PROXY_SOURCE,
    notes: [
      'CRE delinquency / charge-off / SLOOS CRE tightening (3 子类) 为 FRED 季频公开数据;observation date 为季度起始日;audit-only / display-only。',
      'FRED CREACBW027SBOG 为周频银行 CRE loan balance aggregate exposure proxy;VNQ / REM / CMBS 为公开市场代理,均不代表非公开 CRE loan tape 或私募信用 marks。'
    ]
  };
}

export function normalizePreviousShippingFreight(prevShippingFreight) {
  if (!prevShippingFreight || typeof prevShippingFreight !== 'object') return buildMissingShippingFreight();
  const dirty = isUsableFreightCache(prevShippingFreight.balticDirtyTankerIndex, prevShippingFreight.balticDirtyTankerUpdatedAt, prevShippingFreight.balticDirtyTankerDailyChangePct) ? prevShippingFreight.balticDirtyTankerIndex : null;
  const clean = isUsableFreightCache(prevShippingFreight.balticCleanTankerIndex, prevShippingFreight.balticCleanTankerUpdatedAt, prevShippingFreight.balticCleanTankerDailyChangePct) ? prevShippingFreight.balticCleanTankerIndex : null;
  const dry = isUsableFreightCache(prevShippingFreight.balticDryIndex, prevShippingFreight.balticDryUpdatedAt, prevShippingFreight.balticDryDailyChangePct) ? prevShippingFreight.balticDryIndex : null;
  const dirtyChange = dirty !== null && Number.isFinite(prevShippingFreight.balticDirtyTankerDailyChangePct)
    ? prevShippingFreight.balticDirtyTankerDailyChangePct
    : null;
  const cleanChange = clean !== null && Number.isFinite(prevShippingFreight.balticCleanTankerDailyChangePct)
    ? prevShippingFreight.balticCleanTankerDailyChangePct
    : null;
  const dryChange = dry !== null && Number.isFinite(prevShippingFreight.balticDryDailyChangePct)
    ? prevShippingFreight.balticDryDailyChangePct
    : null;
  const tankerFreightRegime = classifyFreightIndexRegime(dirty, dirtyChange, 1800, 1200);
  const cleanTankerFreightRegime = classifyFreightIndexRegime(clean, cleanChange, 1200, 850);
  const dryBulkFreightRegime = classifyFreightIndexRegime(dry, dryChange, 3000, 1800);
  return {
    balticDirtyTankerIndex: dirty,
    balticDirtyTankerDailyChangePct: dirtyChange,
    balticDirtyTankerUpdatedAt: dirty !== null ? prevShippingFreight.balticDirtyTankerUpdatedAt : null,
    balticCleanTankerIndex: clean,
    balticCleanTankerDailyChangePct: cleanChange,
    balticCleanTankerUpdatedAt: clean !== null ? prevShippingFreight.balticCleanTankerUpdatedAt : null,
    balticDryIndex: dry,
    balticDryDailyChangePct: dryChange,
    balticDryUpdatedAt: dry !== null ? prevShippingFreight.balticDryUpdatedAt : null,
    tankerFreightRegime,
    cleanTankerFreightRegime,
    dryBulkFreightRegime,
    freightStressRegime: classifyCompositeFreightRegime(tankerFreightRegime, cleanTankerFreightRegime, dryBulkFreightRegime),
    sourceStatus: {
      dirtyTanker: dirty !== null ? 'fallback' : 'missing',
      cleanTanker: clean !== null ? 'fallback' : 'missing',
      dryBulk: dry !== null ? 'fallback' : 'missing'
    },
    updatedAt: typeof prevShippingFreight.updatedAt === 'string' ? prevShippingFreight.updatedAt : null,
    source: SHIPPING_FREIGHT_SOURCE,
    notes: ['BDTI/BCTI/BDI 来自公开 StockQ 页面转引 Baltic index；shipping/freight audit-only / display-only。']
  };
}

function normalizePreviousPolicyExpectations(prevPolicy) {
  if (!prevPolicy || typeof prevPolicy !== 'object') return buildMissingPolicyExpectations();
  const targetLower = Number.isFinite(prevPolicy.targetLower) ? prevPolicy.targetLower : null;
  const targetUpper = Number.isFinite(prevPolicy.targetUpper) ? prevPolicy.targetUpper : null;
  const targetMid = Number.isFinite(prevPolicy.targetMid)
    ? prevPolicy.targetMid
    : (Number.isFinite(targetLower) && Number.isFinite(targetUpper) ? +(((targetLower + targetUpper) / 2)).toFixed(3) : null);
  const futureMinusTargetMid = Number.isFinite(prevPolicy.futureMinusTargetMid) ? prevPolicy.futureMinusTargetMid : null;
  const dotPlotMedianCurrentYear = Number.isFinite(prevPolicy.dotPlotMedianCurrentYear) ? prevPolicy.dotPlotMedianCurrentYear : null;
  const minutesHawkishTermCount = Number.isFinite(prevPolicy.minutesHawkishTermCount) ? prevPolicy.minutesHawkishTermCount : null;
  const minutesDovishTermCount = Number.isFinite(prevPolicy.minutesDovishTermCount) ? prevPolicy.minutesDovishTermCount : null;
  const minutesTopicCounts = prevPolicy.minutesTopicCounts && typeof prevPolicy.minutesTopicCounts === 'object'
    ? prevPolicy.minutesTopicCounts
    : null;
  return {
    ...buildMissingPolicyExpectations(),
    ...prevPolicy,
    targetLower,
    targetUpper,
    targetMid,
    effectiveFedFundsRate: Number.isFinite(prevPolicy.effectiveFedFundsRate) ? prevPolicy.effectiveFedFundsRate : null,
    fedFundsFutureFrontPrice: Number.isFinite(prevPolicy.fedFundsFutureFrontPrice) ? prevPolicy.fedFundsFutureFrontPrice : null,
    fedFundsFutureImpliedRate: Number.isFinite(prevPolicy.fedFundsFutureImpliedRate) ? prevPolicy.fedFundsFutureImpliedRate : null,
    futureMinusTargetMid,
    fedFundsFuturesCurve: normalizePreviousFedFundsFuturesCurve(prevPolicy.fedFundsFuturesCurve),
    sofrFuturesCurve: normalizePreviousSofrFuturesCurve(prevPolicy.sofrFuturesCurve),
    oisForwardCurve: normalizePreviousOisForwardCurve(prevPolicy.oisForwardCurve),
    dotPlotMedianCurrentYear,
    minutesDate: typeof prevPolicy.minutesDate === 'string' ? prevPolicy.minutesDate : null,
    minutesUrl: typeof prevPolicy.minutesUrl === 'string' ? prevPolicy.minutesUrl : null,
    minutesHawkishTermCount,
    minutesDovishTermCount,
    minutesPolicyTone: typeof prevPolicy.minutesPolicyTone === 'string' && prevPolicy.minutesPolicyTone.trim()
      ? prevPolicy.minutesPolicyTone
      : '未知',
    minutesTopicCounts,
    minutesSummaryZh: typeof prevPolicy.minutesSummaryZh === 'string' ? prevPolicy.minutesSummaryZh : null,
    policyExpectationRegime: typeof prevPolicy.policyExpectationRegime === 'string' && prevPolicy.policyExpectationRegime.trim()
      ? prevPolicy.policyExpectationRegime
      : classifyPolicyExpectationRegime(futureMinusTargetMid, dotPlotMedianCurrentYear, targetMid),
    updatedAt: typeof prevPolicy.updatedAt === 'string' ? prevPolicy.updatedAt : null,
    sourceStatus: {
      targetRange: targetMid !== null ? 'fallback' : 'missing',
      fedFundsFuture: Number.isFinite(prevPolicy.fedFundsFutureImpliedRate) ? 'fallback' : 'missing',
      fedFundsFuturesCurve: Array.isArray(prevPolicy.fedFundsFuturesCurve?.contracts) && prevPolicy.fedFundsFuturesCurve.contracts.length
        ? 'fallback'
        : 'missing',
      sofrFuturesCurve: Array.isArray(prevPolicy.sofrFuturesCurve?.contracts) && prevPolicy.sofrFuturesCurve.contracts.length
        ? 'fallback'
        : 'missing',
      sepDotPlot: dotPlotMedianCurrentYear !== null ? 'fallback' : 'missing',
      policyStatement: typeof prevPolicy.statementUrl === 'string' ? 'fallback' : 'missing',
      fomcMinutes: typeof prevPolicy.minutesUrl === 'string' ? 'fallback' : 'missing',
      oisForward: Array.isArray(prevPolicy.oisForwardCurve?.tenors) && prevPolicy.oisForwardCurve.tenors.length
        ? 'fallback'
        : 'manual_required'
    }
  };
}

function normalizePreviousPrivateCreditProxy(prevPrivateCredit) {
  if (!prevPrivateCredit || typeof prevPrivateCredit !== 'object') return buildMissingPrivateCreditProxy();
  const bdcEtfPrice = Number.isFinite(prevPrivateCredit.bdcEtfPrice) ? prevPrivateCredit.bdcEtfPrice : null;
  const bdcEtf4wChange = Number.isFinite(prevPrivateCredit.bdcEtf4wChange) ? prevPrivateCredit.bdcEtf4wChange : null;
  const pbdcEtfPrice = Number.isFinite(prevPrivateCredit.pbdcEtfPrice) ? prevPrivateCredit.pbdcEtfPrice : null;
  const pbdcEtf4wChange = Number.isFinite(prevPrivateCredit.pbdcEtf4wChange) ? prevPrivateCredit.pbdcEtf4wChange : null;
  const seniorLoanEtfPrice = Number.isFinite(prevPrivateCredit.seniorLoanEtfPrice) ? prevPrivateCredit.seniorLoanEtfPrice : null;
  const seniorLoanEtf4wChange = Number.isFinite(prevPrivateCredit.seniorLoanEtf4wChange) ? prevPrivateCredit.seniorLoanEtf4wChange : null;
  const intervalFundNavPrice = Number.isFinite(prevPrivateCredit.intervalFundNavPrice) ? prevPrivateCredit.intervalFundNavPrice : null;
  const intervalFundNav4wChange = Number.isFinite(prevPrivateCredit.intervalFundNav4wChange) ? prevPrivateCredit.intervalFundNav4wChange : null;
  const hyOas = Number.isFinite(prevPrivateCredit.hyOas) ? prevPrivateCredit.hyOas : null;
  const igOas = Number.isFinite(prevPrivateCredit.igOas) ? prevPrivateCredit.igOas : null;
  const igMinusHyOas = Number.isFinite(prevPrivateCredit.igMinusHyOas) ? prevPrivateCredit.igMinusHyOas : null;
  const cdxHyPrice = Number.isFinite(prevPrivateCredit.cdxHyPrice) ? prevPrivateCredit.cdxHyPrice : null;
  const cdxIgPrice = Number.isFinite(prevPrivateCredit.cdxIgPrice) ? prevPrivateCredit.cdxIgPrice : null;
  return {
    ...buildMissingPrivateCreditProxy(),
    ...prevPrivateCredit,
    bdcEtfPrice,
    bdcEtf4wChange,
    bdcEtfUpdatedAt: typeof prevPrivateCredit.bdcEtfUpdatedAt === 'string' ? prevPrivateCredit.bdcEtfUpdatedAt : null,
    pbdcEtfPrice,
    pbdcEtf4wChange,
    pbdcEtfUpdatedAt: typeof prevPrivateCredit.pbdcEtfUpdatedAt === 'string' ? prevPrivateCredit.pbdcEtfUpdatedAt : null,
    seniorLoanEtfPrice,
    seniorLoanEtf4wChange,
    seniorLoanEtfUpdatedAt: typeof prevPrivateCredit.seniorLoanEtfUpdatedAt === 'string' ? prevPrivateCredit.seniorLoanEtfUpdatedAt : null,
    intervalFundNavPrice,
    intervalFundNav4wChange,
    intervalFundNavUpdatedAt: typeof prevPrivateCredit.intervalFundNavUpdatedAt === 'string' ? prevPrivateCredit.intervalFundNavUpdatedAt : null,
    intervalFundNavSymbol: typeof prevPrivateCredit.intervalFundNavSymbol === 'string' ? prevPrivateCredit.intervalFundNavSymbol : 'CCLFX',
    intervalFundNavStatus: intervalFundNavPrice !== null ? 'fallback' : 'missing',
    hyOas,
    igOas,
    igOasUpdatedAt: typeof prevPrivateCredit.igOasUpdatedAt === 'string' ? prevPrivateCredit.igOasUpdatedAt : null,
    igMinusHyOas,
    cdxHyPrice,
    cdxHyInstrument: typeof prevPrivateCredit.cdxHyInstrument === 'string' ? prevPrivateCredit.cdxHyInstrument : null,
    cdxHyUpdatedAt: typeof prevPrivateCredit.cdxHyUpdatedAt === 'string' ? prevPrivateCredit.cdxHyUpdatedAt : null,
    cdxIgPrice,
    cdxIgInstrument: typeof prevPrivateCredit.cdxIgInstrument === 'string' ? prevPrivateCredit.cdxIgInstrument : null,
    cdxIgUpdatedAt: typeof prevPrivateCredit.cdxIgUpdatedAt === 'string' ? prevPrivateCredit.cdxIgUpdatedAt : null,
    privateCreditProxyRegime: typeof prevPrivateCredit.privateCreditProxyRegime === 'string' && prevPrivateCredit.privateCreditProxyRegime.trim()
      ? prevPrivateCredit.privateCreditProxyRegime
      : classifyPrivateCreditProxyRegimeExpanded(bdcEtf4wChange, pbdcEtf4wChange, seniorLoanEtf4wChange, intervalFundNav4wChange, hyOas),
    sourceStatus: {
      bdcEtf: bdcEtfPrice !== null ? 'fallback' : 'missing',
      pbdcEtf: pbdcEtfPrice !== null ? 'fallback' : 'missing',
      seniorLoanEtf: seniorLoanEtfPrice !== null ? 'fallback' : 'missing',
      intervalFundNav: intervalFundNavPrice !== null ? 'fallback' : 'missing',
      hyOas: hyOas !== null ? 'fallback' : 'missing',
      igOas: igOas !== null ? 'fallback' : 'missing',
      cdxHy: cdxHyPrice !== null ? 'fallback' : 'manual_required',
      cdxIg: cdxIgPrice !== null ? 'fallback' : 'manual_required',
      privateCreditMarks: 'manual_required'
    },
    updatedAt: typeof prevPrivateCredit.updatedAt === 'string' ? prevPrivateCredit.updatedAt : null
  };
}

function normalizePreviousConsumer(prevConsumer) {
  if (!prevConsumer || typeof prevConsumer !== 'object') return buildMissingConsumer();
  const threeMonthChange = Number.isFinite(prevConsumer.threeMonthChange) ? prevConsumer.threeMonthChange : null;
  const hasPreviousPmi = Number.isFinite(prevConsumer.ismManufacturingPmi);
  return {
    umichSentiment: Number.isFinite(prevConsumer.umichSentiment) ? prevConsumer.umichSentiment : null,
    previousValue: Number.isFinite(prevConsumer.previousValue) ? prevConsumer.previousValue : null,
    threeMonthChange,
    sixMonthChange: Number.isFinite(prevConsumer.sixMonthChange) ? prevConsumer.sixMonthChange : null,
    regime: typeof prevConsumer.regime === 'string' && prevConsumer.regime.trim() ? prevConsumer.regime : classifyConsumerRegime(threeMonthChange),
    ismManufacturingPmi: hasPreviousPmi ? prevConsumer.ismManufacturingPmi : null,
    ismManufacturingPmi3mChange: hasPreviousPmi && Number.isFinite(prevConsumer.ismManufacturingPmi3mChange) ? prevConsumer.ismManufacturingPmi3mChange : null,
    ismPmiRegime: typeof prevConsumer.ismPmiRegime === 'string' && prevConsumer.ismPmiRegime.trim() ? prevConsumer.ismPmiRegime : '未知',
    sourceStatus: {
      umichSentiment: 'fallback',
      pmi: hasPreviousPmi ? 'fallback' : 'source_unavailable'
    },
    diagnostics: {
      ...(prevConsumer.diagnostics && typeof prevConsumer.diagnostics === 'object' ? prevConsumer.diagnostics : {}),
      pmi: prevConsumer.diagnostics?.pmi && typeof prevConsumer.diagnostics.pmi === 'object'
        ? prevConsumer.diagnostics.pmi
        : {
            errorReason: hasPreviousPmi ? 'previous-pmi-value-carried-forward' : 'consumer-sentiment-fallback-without-previous-pmi',
            parsedAt: isoNow
          }
    },
    updatedAt: typeof prevConsumer.updatedAt === 'string' ? prevConsumer.updatedAt : null,
    source: 'FRED:UMCSENT; ISM:ManufacturingPMI',
    notes: ['UMCSENT 为 FRED 月频；ISM Manufacturing PMI 直接解析 ismworld.org 公开报告页，audit-only。']
  };
}

export async function resolveShippingFreight(prevShippingFreight) {
  const results = await Promise.allSettled([
    fetchStockqIndex('BDTI', 'Baltic Dirty Tanker Index'),
    fetchStockqIndex('BCTI', 'Baltic Clean Tanker Index'),
    fetchStockqIndex('BDI', 'Baltic Dry Index')
  ]);
  return combineShippingFreightResults(prevShippingFreight, results);
}

export function combineShippingFreightResults(prevShippingFreight, results) {
  const fallback = normalizePreviousShippingFreight(prevShippingFreight);
  const status = {
    dirtyTanker: 'missing',
    cleanTanker: 'missing',
    dryBulk: 'missing'
  };
  const [dirtyResult, cleanResult, dryResult] = results;

  const dirty = dirtyResult.status === 'fulfilled' ? dirtyResult.value : null;
  const clean = cleanResult.status === 'fulfilled' ? cleanResult.value : null;
  const dry = dryResult.status === 'fulfilled' ? dryResult.value : null;

  if (dirty) status.dirtyTanker = 'live';
  else if (Number.isFinite(fallback.balticDirtyTankerIndex)) status.dirtyTanker = 'fallback';
  if (clean) status.cleanTanker = 'live';
  else if (Number.isFinite(fallback.balticCleanTankerIndex)) status.cleanTanker = 'fallback';
  if (dry) status.dryBulk = 'live';
  else if (Number.isFinite(fallback.balticDryIndex)) status.dryBulk = 'fallback';

  const balticDirtyTankerIndex = Number.isFinite(dirty?.value) ? dirty.value : fallback.balticDirtyTankerIndex;
  const balticDirtyTankerDailyChangePct = dirty ? dirty.dailyChangePct : fallback.balticDirtyTankerDailyChangePct;
  const balticCleanTankerIndex = Number.isFinite(clean?.value) ? clean.value : fallback.balticCleanTankerIndex;
  const balticCleanTankerDailyChangePct = clean ? clean.dailyChangePct : fallback.balticCleanTankerDailyChangePct;
  const balticDryIndex = Number.isFinite(dry?.value) ? dry.value : fallback.balticDryIndex;
  const balticDryDailyChangePct = dry ? dry.dailyChangePct : fallback.balticDryDailyChangePct;
  const tankerFreightRegime = classifyFreightIndexRegime(balticDirtyTankerIndex, balticDirtyTankerDailyChangePct, 1800, 1200);
  const cleanTankerFreightRegime = classifyFreightIndexRegime(balticCleanTankerIndex, balticCleanTankerDailyChangePct, 1200, 850);
  const dryBulkFreightRegime = classifyFreightIndexRegime(balticDryIndex, balticDryDailyChangePct, 3000, 1800);

  return {
    balticDirtyTankerIndex: Number.isFinite(balticDirtyTankerIndex) ? balticDirtyTankerIndex : null,
    balticDirtyTankerDailyChangePct: Number.isFinite(balticDirtyTankerDailyChangePct) ? balticDirtyTankerDailyChangePct : null,
    balticDirtyTankerUpdatedAt: dirty?.updatedAt || fallback.balticDirtyTankerUpdatedAt,
    balticCleanTankerIndex: Number.isFinite(balticCleanTankerIndex) ? balticCleanTankerIndex : null,
    balticCleanTankerDailyChangePct: Number.isFinite(balticCleanTankerDailyChangePct) ? balticCleanTankerDailyChangePct : null,
    balticCleanTankerUpdatedAt: clean?.updatedAt || fallback.balticCleanTankerUpdatedAt,
    balticDryIndex: Number.isFinite(balticDryIndex) ? balticDryIndex : null,
    balticDryDailyChangePct: Number.isFinite(balticDryDailyChangePct) ? balticDryDailyChangePct : null,
    balticDryUpdatedAt: dry?.updatedAt || fallback.balticDryUpdatedAt,
    tankerFreightRegime,
    cleanTankerFreightRegime,
    dryBulkFreightRegime,
    freightStressRegime: classifyCompositeFreightRegime(tankerFreightRegime, cleanTankerFreightRegime, dryBulkFreightRegime),
    sourceStatus: status,
    updatedAt: latestIsoDate(dirty?.updatedAt, clean?.updatedAt, dry?.updatedAt, fallback.updatedAt),
    source: SHIPPING_FREIGHT_SOURCE,
    notes: ['BDTI/BCTI/BDI 来自公开 StockQ 页面转引 Baltic index；shipping/freight audit-only / display-only。']
  };
}

async function resolvePrivateCreditProxy(prevPrivateCredit, hyOasLive) {
  const fallback = normalizePreviousPrivateCreditProxy(prevPrivateCredit);
  const status = {
    bdcEtf: 'missing',
    pbdcEtf: 'missing',
    seniorLoanEtf: 'missing',
    intervalFundNav: 'missing',
    hyOas: 'missing',
    igOas: 'missing',
    cdxHy: 'missing',
    cdxIg: 'missing',
    privateCreditMarks: 'manual_required'
  };
  let bdcEtfPrice = null;
  let bdcEtf4wChange = null;
  let bdcEtfUpdatedAt = null;
  let pbdcEtfPrice = null;
  let pbdcEtf4wChange = null;
  let pbdcEtfUpdatedAt = null;
  let seniorLoanEtfPrice = null;
  let seniorLoanEtf4wChange = null;
  let seniorLoanEtfUpdatedAt = null;
  let intervalFundNavPrice = null;
  let intervalFundNav4wChange = null;
  let intervalFundNavUpdatedAt = null;
  let intervalFundNavSymbol = 'CCLFX';
  let intervalFundNavStatus = 'missing';
  let hyOas = Number.isFinite(hyOasLive) ? hyOasLive : null;
  let igOas = null;
  let igOasUpdatedAt = null;
  let cdxHyPrice = null;
  let cdxHyInstrument = null;
  let cdxHyUpdatedAt = null;
  let cdxIgPrice = null;
  let cdxIgInstrument = null;
  let cdxIgUpdatedAt = null;

  const [bdcEtfResult, pbdcEtfResult, seniorLoanEtfResult, intervalFundNavResult, cdxResult] = await Promise.allSettled([
    fetchYahooChartQuote('BIZD', '1mo', '1d'),
    fetchYahooChartQuote('PBDC', '1mo', '1d'),
    fetchYahooChartQuote('SRLN', '1mo', '1d'),
    fetchYahooChartQuote('CCLFX', '1mo', '1d'),
    fetchIceCdxIndexSettlements()
  ]);

  if (bdcEtfResult.status === 'fulfilled') {
    bdcEtfPrice = bdcEtfResult.value.price;
    bdcEtf4wChange = bdcEtfResult.value.changePct;
    bdcEtfUpdatedAt = bdcEtfResult.value.updatedAt;
    status.bdcEtf = 'live';
  } else if (Number.isFinite(fallback.bdcEtfPrice)) {
    bdcEtfPrice = fallback.bdcEtfPrice;
    bdcEtf4wChange = fallback.bdcEtf4wChange;
    bdcEtfUpdatedAt = fallback.bdcEtfUpdatedAt;
    status.bdcEtf = 'fallback';
  }

  if (pbdcEtfResult.status === 'fulfilled') {
    pbdcEtfPrice = pbdcEtfResult.value.price;
    pbdcEtf4wChange = pbdcEtfResult.value.changePct;
    pbdcEtfUpdatedAt = pbdcEtfResult.value.updatedAt;
    status.pbdcEtf = 'live';
  } else if (Number.isFinite(fallback.pbdcEtfPrice)) {
    pbdcEtfPrice = fallback.pbdcEtfPrice;
    pbdcEtf4wChange = fallback.pbdcEtf4wChange;
    pbdcEtfUpdatedAt = fallback.pbdcEtfUpdatedAt;
    status.pbdcEtf = 'fallback';
  }

  if (seniorLoanEtfResult.status === 'fulfilled') {
    seniorLoanEtfPrice = seniorLoanEtfResult.value.price;
    seniorLoanEtf4wChange = seniorLoanEtfResult.value.changePct;
    seniorLoanEtfUpdatedAt = seniorLoanEtfResult.value.updatedAt;
    status.seniorLoanEtf = 'live';
  } else if (Number.isFinite(fallback.seniorLoanEtfPrice)) {
    seniorLoanEtfPrice = fallback.seniorLoanEtfPrice;
    seniorLoanEtf4wChange = fallback.seniorLoanEtf4wChange;
    seniorLoanEtfUpdatedAt = fallback.seniorLoanEtfUpdatedAt;
    status.seniorLoanEtf = 'fallback';
  }

  if (intervalFundNavResult.status === 'fulfilled') {
    intervalFundNavPrice = intervalFundNavResult.value.price;
    intervalFundNav4wChange = intervalFundNavResult.value.changePct;
    intervalFundNavUpdatedAt = intervalFundNavResult.value.updatedAt;
    intervalFundNavSymbol = intervalFundNavResult.value.symbol || 'CCLFX';
    intervalFundNavStatus = 'live';
    status.intervalFundNav = 'live';
  } else if (Number.isFinite(fallback.intervalFundNavPrice)) {
    intervalFundNavPrice = fallback.intervalFundNavPrice;
    intervalFundNav4wChange = fallback.intervalFundNav4wChange;
    intervalFundNavUpdatedAt = fallback.intervalFundNavUpdatedAt;
    intervalFundNavSymbol = fallback.intervalFundNavSymbol || 'CCLFX';
    intervalFundNavStatus = 'fallback';
    status.intervalFundNav = 'fallback';
  }

  if (cdxResult.status === 'fulfilled') {
    if (Number.isFinite(cdxResult.value.hy?.price)) {
      cdxHyPrice = cdxResult.value.hy.price;
      cdxHyInstrument = cdxResult.value.hy.instrument;
      cdxHyUpdatedAt = cdxResult.value.hy.updatedAt;
      status.cdxHy = 'live';
    }
    if (Number.isFinite(cdxResult.value.ig?.price)) {
      cdxIgPrice = cdxResult.value.ig.price;
      cdxIgInstrument = cdxResult.value.ig.instrument;
      cdxIgUpdatedAt = cdxResult.value.ig.updatedAt;
      status.cdxIg = 'live';
    }
  }
  if (status.cdxHy !== 'live') {
    if (Number.isFinite(fallback.cdxHyPrice)) {
      cdxHyPrice = fallback.cdxHyPrice;
      cdxHyInstrument = fallback.cdxHyInstrument;
      cdxHyUpdatedAt = fallback.cdxHyUpdatedAt;
      status.cdxHy = 'fallback';
    } else {
      status.cdxHy = 'manual_required';
    }
  }
  if (status.cdxIg !== 'live') {
    if (Number.isFinite(fallback.cdxIgPrice)) {
      cdxIgPrice = fallback.cdxIgPrice;
      cdxIgInstrument = fallback.cdxIgInstrument;
      cdxIgUpdatedAt = fallback.cdxIgUpdatedAt;
      status.cdxIg = 'fallback';
    } else {
      status.cdxIg = 'manual_required';
    }
  }

  if (Number.isFinite(hyOas)) {
    status.hyOas = 'live';
  } else {
    try {
      const rows = await fetchFredSeries('BAMLH0A0HYM2', 30);
      hyOas = latestValue(rows);
      status.hyOas = Number.isFinite(hyOas) ? 'live' : 'missing';
    } catch (_err) {
      if (Number.isFinite(fallback.hyOas)) {
        hyOas = fallback.hyOas;
        status.hyOas = 'fallback';
      }
    }
  }

  try {
    const rows = await fetchFredSeries('BAMLC0A0CM', 30);
    igOas = latestValue(rows);
    igOasUpdatedAt = latestDateIso(rows);
    status.igOas = Number.isFinite(igOas) ? 'live' : 'missing';
  } catch (_err) {
    if (Number.isFinite(fallback.igOas)) {
      igOas = fallback.igOas;
      igOasUpdatedAt = fallback.igOasUpdatedAt;
      status.igOas = 'fallback';
    }
  }

  const igMinusHyOas = Number.isFinite(igOas) && Number.isFinite(hyOas)
    ? +(igOas - hyOas).toFixed(3)
    : null;

  return {
    bdcEtfPrice: Number.isFinite(bdcEtfPrice) ? bdcEtfPrice : null,
    bdcEtf4wChange: Number.isFinite(bdcEtf4wChange) ? bdcEtf4wChange : null,
    bdcEtfUpdatedAt,
    pbdcEtfPrice: Number.isFinite(pbdcEtfPrice) ? pbdcEtfPrice : null,
    pbdcEtf4wChange: Number.isFinite(pbdcEtf4wChange) ? pbdcEtf4wChange : null,
    pbdcEtfUpdatedAt,
    seniorLoanEtfPrice: Number.isFinite(seniorLoanEtfPrice) ? seniorLoanEtfPrice : null,
    seniorLoanEtf4wChange: Number.isFinite(seniorLoanEtf4wChange) ? seniorLoanEtf4wChange : null,
    seniorLoanEtfUpdatedAt,
    intervalFundNavPrice: Number.isFinite(intervalFundNavPrice) ? intervalFundNavPrice : null,
    intervalFundNav4wChange: Number.isFinite(intervalFundNav4wChange) ? intervalFundNav4wChange : null,
    intervalFundNavUpdatedAt,
    intervalFundNavSymbol,
    intervalFundNavStatus,
    hyOas: Number.isFinite(hyOas) ? hyOas : null,
    igOas: Number.isFinite(igOas) ? igOas : null,
    igOasUpdatedAt,
    igMinusHyOas,
    cdxHyPrice: Number.isFinite(cdxHyPrice) ? cdxHyPrice : null,
    cdxHyInstrument,
    cdxHyUpdatedAt,
    cdxIgPrice: Number.isFinite(cdxIgPrice) ? cdxIgPrice : null,
    cdxIgInstrument,
    cdxIgUpdatedAt,
    cdxHyStatus: status.cdxHy,
    cdxIgStatus: status.cdxIg,
    privateCreditMarksStatus: 'manual_required',
    privateCreditProxyRegime: classifyPrivateCreditProxyRegimeExpanded(bdcEtf4wChange, pbdcEtf4wChange, seniorLoanEtf4wChange, intervalFundNav4wChange, hyOas),
    sourceStatus: status,
    updatedAt: latestIsoDate(bdcEtfUpdatedAt, pbdcEtfUpdatedAt, seniorLoanEtfUpdatedAt, intervalFundNavUpdatedAt, igOasUpdatedAt, cdxHyUpdatedAt, cdxIgUpdatedAt, fallback.updatedAt),
    source: PRIVATE_CREDIT_PROXY_SOURCE,
    notes: ['BIZD/PBDC 为公开上市 BDC ETF 代理；SRLN 为 senior loan ETF 代理；CCLFX 为公开 interval-fund NAV proxy；HY/IG OAS 为 FRED cash-bond spread proxy；ICE CDX 为公开 EOD settlement price；私募信用 marks 仍保留 manual/licensed 插槽。']
  };
}

async function resolveConsumerSentiment(prevConsumer) {
  try {
    const rows = await fetchFredSeries('UMCSENT', 420);
    const latest = rows[rows.length - 1] || null;
    const previous = rows.length >= 2 ? rows[rows.length - 2].value : null;
    const current = latest?.value;
    const threeMonthAgo = findValueAgo(rows, 90);
    const sixMonthAgo = findValueAgo(rows, 180);
    const threeMonthChange = Number.isFinite(current) && Number.isFinite(threeMonthAgo)
      ? +(current - threeMonthAgo).toFixed(3)
      : null;
    const sixMonthChange = Number.isFinite(current) && Number.isFinite(sixMonthAgo)
      ? +(current - sixMonthAgo).toFixed(3)
      : null;
    let ismManufacturingPmi = null;
    let ismManufacturingPmi3mChange = null;
    let pmiStatus = 'source_unavailable';
    const pmiResult = await fetchIsmManufacturingPmiReport();

    // M-67: true ISM Manufacturing PMI, parsed from the public ISM report page.
    if (pmiResult.status === 'live') {
      ismManufacturingPmi = Number.isFinite(pmiResult.latestPmi) ? pmiResult.latestPmi : null;
      ismManufacturingPmi3mChange = Number.isFinite(pmiResult.pmi3mChange)
        ? pmiResult.pmi3mChange
        : null;
      pmiStatus = 'live';
    } else {
      if (Number.isFinite(prevConsumer?.ismManufacturingPmi)) {
        ismManufacturingPmi = prevConsumer.ismManufacturingPmi;
        ismManufacturingPmi3mChange = Number.isFinite(prevConsumer.ismManufacturingPmi3mChange)
          ? prevConsumer.ismManufacturingPmi3mChange
          : null;
        pmiStatus = 'fallback';
      } else {
        pmiStatus = pmiResult.status;
      }
    }

    return {
      umichSentiment: Number.isFinite(current) ? current : null,
      previousValue: Number.isFinite(previous) ? previous : null,
      threeMonthChange,
      sixMonthChange,
      regime: classifyConsumerRegime(threeMonthChange),
      ismManufacturingPmi,
      ismManufacturingPmi3mChange,
      ismPmiRegime: classifyPmiRegime(ismManufacturingPmi),
      sourceStatus: {
        umichSentiment: 'live',
        pmi: pmiStatus
      },
      diagnostics: {
        ...(prevConsumer?.diagnostics && typeof prevConsumer.diagnostics === 'object' ? prevConsumer.diagnostics : {}),
        pmi: pmiResult.diagnostics || {
          parsedAt: isoNow,
          errorReason: 'ism-pmi-diagnostics-unavailable'
        }
      },
      updatedAt: latest?.date ? `${latest.date}T00:00:00Z` : null,
      source: 'FRED:UMCSENT; ISM:ManufacturingPMI',
      notes: ['UMCSENT 为 FRED 月频；ISM Manufacturing PMI 直接解析 ismworld.org 公开报告页，audit-only。']
    };
  } catch (_err) {
    const fallback = normalizePreviousConsumer(prevConsumer);
    return Number.isFinite(fallback.umichSentiment) ? fallback : buildMissingConsumer();
  }
}

async function resolveEmploymentBreadth(prevEmployment) {
  const fallback = normalizePreviousEmployment(prevEmployment);
  const status = {
    icsa: 'missing',
    ccsa: 'missing',
    jtsjol: 'missing',
    ahe: 'missing',
    u6: 'missing',
    industryPayroll: 'missing'
  };
  let initialClaims = null;
  let initialClaims4wAverage = null;
  let initialClaims4wChange = null;
  let initialClaimsUpdatedAt = null;
  let continuingClaims = null;
  let continuingClaims4wAverage = null;
  let continuingClaimsUpdatedAt = null;
  let joltsOpenings = null;
  let joltsOpeningsYoY = null;
  let joltsUpdatedAt = null;
  let averageHourlyEarnings = null;
  let averageHourlyEarningsYoY = null;
  let averageHourlyEarningsUpdatedAt = null;
  let u6Rate = null;
  let u6Rate3mChange = null;
  let u6UpdatedAt = null;
  let industryPayrollDiffusionPct = null;
  let industryPayrollPositiveCount = null;
  let industryPayrollSeriesCount = null;
  let industryPayrollUpdatedAt = null;

  const [icsaResult, ccsaResult, joltsResult, aheResult, u6Result, ...industryResults] = await Promise.allSettled([
    fetchFredSeries('ICSA', 420),
    fetchFredSeries('CCSA', 420),
    fetchFredSeries('JTSJOL', 1500),
    fetchFredSeries('CES0500000003', 1500),
    fetchFredSeries('U6RATE', 1500),
    ...EMPLOYMENT_INDUSTRY_PAYROLL_SERIES.map((series) => fetchFredSeries(series.id, 420))
  ]);

  if (icsaResult.status === 'fulfilled') {
    const rows = icsaResult.value;
    initialClaims = latestValue(rows);
    initialClaims4wAverage = averageRecentValues(rows, 4);
    const prior4wAverage = averageRecentValues(rows, 4, 4);
    initialClaims4wChange = Number.isFinite(initialClaims4wAverage) && Number.isFinite(prior4wAverage)
      ? +(initialClaims4wAverage - prior4wAverage).toFixed(0)
      : null;
    initialClaimsUpdatedAt = latestDateIso(rows);
    status.icsa = 'live';
  } else if (Number.isFinite(fallback.initialClaims)) {
    initialClaims = fallback.initialClaims;
    initialClaims4wAverage = fallback.initialClaims4wAverage;
    initialClaims4wChange = fallback.initialClaims4wChange;
    initialClaimsUpdatedAt = fallback.updatedAt;
    status.icsa = 'fallback';
  }

  if (ccsaResult.status === 'fulfilled') {
    const rows = ccsaResult.value;
    continuingClaims = latestValue(rows);
    continuingClaims4wAverage = averageRecentValues(rows, 4);
    continuingClaimsUpdatedAt = latestDateIso(rows);
    status.ccsa = 'live';
  } else if (Number.isFinite(fallback.continuingClaims)) {
    continuingClaims = fallback.continuingClaims;
    continuingClaims4wAverage = fallback.continuingClaims4wAverage;
    continuingClaimsUpdatedAt = fallback.updatedAt;
    status.ccsa = 'fallback';
  }

  if (joltsResult.status === 'fulfilled') {
    const rows = joltsResult.value;
    const latestJolts = latestValue(rows);
    const yearAgo = findMonthlyValueAgo(rows, 12);
    joltsOpenings = Number.isFinite(latestJolts) ? +(latestJolts * 1000).toFixed(0) : null;
    joltsOpeningsYoY = Number.isFinite(latestJolts) && Number.isFinite(yearAgo) && yearAgo !== 0
      ? +(((latestJolts - yearAgo) / yearAgo)).toFixed(4)
      : null;
    joltsUpdatedAt = latestDateIso(rows);
    status.jtsjol = 'live';
  } else if (Number.isFinite(fallback.joltsOpenings)) {
    joltsOpenings = fallback.joltsOpenings;
    joltsOpeningsYoY = fallback.joltsOpeningsYoY;
    joltsUpdatedAt = fallback.joltsUpdatedAt;
    status.jtsjol = 'fallback';
  }

  if (aheResult.status === 'fulfilled') {
    const rows = aheResult.value;
    averageHourlyEarnings = latestValue(rows);
    averageHourlyEarningsYoY = calculateMonthlyYoY(rows);
    averageHourlyEarningsUpdatedAt = latestDateIso(rows);
    status.ahe = 'live';
  } else if (Number.isFinite(fallback.averageHourlyEarnings)) {
    averageHourlyEarnings = fallback.averageHourlyEarnings;
    averageHourlyEarningsYoY = fallback.averageHourlyEarningsYoY;
    averageHourlyEarningsUpdatedAt = fallback.averageHourlyEarningsUpdatedAt;
    status.ahe = 'fallback';
  }

  if (u6Result.status === 'fulfilled') {
    const rows = u6Result.value;
    u6Rate = latestValue(rows);
    u6Rate3mChange = calculateMonthlyDelta(rows, 3);
    u6UpdatedAt = latestDateIso(rows);
    status.u6 = 'live';
  } else if (Number.isFinite(fallback.u6Rate)) {
    u6Rate = fallback.u6Rate;
    u6Rate3mChange = fallback.u6Rate3mChange;
    u6UpdatedAt = fallback.u6UpdatedAt;
    status.u6 = 'fallback';
  }

  const industryDiffusion = calculateIndustryPayrollDiffusion(industryResults);
  if (Number.isFinite(industryDiffusion.industryPayrollDiffusionPct)) {
    industryPayrollDiffusionPct = industryDiffusion.industryPayrollDiffusionPct;
    industryPayrollPositiveCount = industryDiffusion.industryPayrollPositiveCount;
    industryPayrollSeriesCount = industryDiffusion.industryPayrollSeriesCount;
    industryPayrollUpdatedAt = industryDiffusion.industryPayrollUpdatedAt;
    status.industryPayroll = 'live';
  } else if (Number.isFinite(fallback.industryPayrollDiffusionPct)) {
    industryPayrollDiffusionPct = fallback.industryPayrollDiffusionPct;
    industryPayrollPositiveCount = fallback.industryPayrollPositiveCount;
    industryPayrollSeriesCount = fallback.industryPayrollSeriesCount;
    industryPayrollUpdatedAt = fallback.industryPayrollUpdatedAt;
    status.industryPayroll = 'fallback';
  }

  return {
    initialClaims: Number.isFinite(initialClaims) ? initialClaims : null,
    initialClaims4wAverage: Number.isFinite(initialClaims4wAverage) ? +initialClaims4wAverage.toFixed(0) : null,
    initialClaims4wChange: Number.isFinite(initialClaims4wChange) ? initialClaims4wChange : null,
    continuingClaims: Number.isFinite(continuingClaims) ? continuingClaims : null,
    continuingClaims4wAverage: Number.isFinite(continuingClaims4wAverage) ? +continuingClaims4wAverage.toFixed(0) : null,
    joltsOpenings: Number.isFinite(joltsOpenings) ? joltsOpenings : null,
    joltsOpeningsYoY: Number.isFinite(joltsOpeningsYoY) ? joltsOpeningsYoY : null,
    joltsUpdatedAt,
    averageHourlyEarnings: Number.isFinite(averageHourlyEarnings) ? +averageHourlyEarnings.toFixed(2) : null,
    averageHourlyEarningsYoY: Number.isFinite(averageHourlyEarningsYoY) ? averageHourlyEarningsYoY : null,
    averageHourlyEarningsUpdatedAt,
    u6Rate: Number.isFinite(u6Rate) ? +u6Rate.toFixed(1) : null,
    u6Rate3mChange: Number.isFinite(u6Rate3mChange) ? u6Rate3mChange : null,
    u6UpdatedAt,
    industryPayrollDiffusionPct: Number.isFinite(industryPayrollDiffusionPct) ? industryPayrollDiffusionPct : null,
    industryPayrollPositiveCount: Number.isFinite(industryPayrollPositiveCount) ? industryPayrollPositiveCount : null,
    industryPayrollSeriesCount: Number.isFinite(industryPayrollSeriesCount) ? industryPayrollSeriesCount : null,
    industryPayrollUpdatedAt,
    claimsRegime: classifyClaimsRegime(initialClaims4wAverage, initialClaims4wChange),
    joltsRegime: classifyJoltsRegime(joltsOpenings, joltsOpeningsYoY),
    laborQualityRegime: classifyLaborQualityRegime(averageHourlyEarningsYoY, u6Rate3mChange, industryPayrollDiffusionPct),
    industryDiffusionRegime: classifyIndustryDiffusionRegime(industryPayrollDiffusionPct),
    sourceStatus: status,
    updatedAt: latestIsoDate(
      initialClaimsUpdatedAt,
      continuingClaimsUpdatedAt,
      joltsUpdatedAt,
      averageHourlyEarningsUpdatedAt,
      u6UpdatedAt,
      industryPayrollUpdatedAt
    ),
    source: EMPLOYMENT_SOURCE,
    notes: ['ICSA/CCSA 为 FRED SA 周频；JOLTS、AHE、U-6 与行业 payroll basket 为月频；audit-only / display-only。']
  };
}

async function resolveConsumerRetail(prevConsumerRetail) {
  const fallback = normalizePreviousConsumerRetail(prevConsumerRetail);
  const status = {
    carts: 'missing',
    cartsr: 'missing',
    retailSegments: 'missing',
    bofaConsumerCheckpoint: 'missing',
    redbookPublicHtml: 'missing'
  };
  let cartsNominal = null;
  let cartsNominal4wAverage = null;
  let cartsNominalYoY = null;
  let cartsNominalUpdatedAt = null;
  let cartsReal = null;
  let cartsReal4wAverage = null;
  let cartsRealYoY = null;
  let cartsRealUpdatedAt = null;
  let bofaData = null;
  let redbookData = null;

  const [cartsResult, cartsrResult, bofaResult, redbookResult, ...segmentResults] = await Promise.allSettled([
    fetchFredSeries('CARTS', 1500),
    fetchFredSeries('CARTSR', 1500),
    fetchBofaConsumerCheckpoint(),
    fetchTradingEconomicsRedbookIndex(),
    ...CONSUMER_RETAIL_SEGMENT_SERIES.map((series) => fetchFredSeries(series.id, 1500))
  ]);

  if (cartsResult.status === 'fulfilled') {
    const rows = cartsResult.value;
    cartsNominal = fredMillionsToBillions(latestValue(rows));
    cartsNominal4wAverage = fredMillionsToBillions(averageRecentValues(rows, 4));
    cartsNominalYoY = calculateWeeklyYoY(rows);
    cartsNominalUpdatedAt = latestDateIso(rows);
    status.carts = 'live';
  } else if (Number.isFinite(fallback.cartsNominal)) {
    cartsNominal = fallback.cartsNominal;
    cartsNominal4wAverage = fallback.cartsNominal4wAverage;
    cartsNominalYoY = fallback.cartsNominalYoY;
    cartsNominalUpdatedAt = fallback.updatedAt;
    status.carts = 'fallback';
  }

  if (cartsrResult.status === 'fulfilled') {
    const rows = cartsrResult.value;
    cartsReal = fredMillionsToBillions(latestValue(rows));
    cartsReal4wAverage = fredMillionsToBillions(averageRecentValues(rows, 4));
    cartsRealYoY = calculateWeeklyYoY(rows);
    cartsRealUpdatedAt = latestDateIso(rows);
    status.cartsr = 'live';
  } else if (Number.isFinite(fallback.cartsReal)) {
    cartsReal = fallback.cartsReal;
    cartsReal4wAverage = fallback.cartsReal4wAverage;
    cartsRealYoY = fallback.cartsRealYoY;
    cartsRealUpdatedAt = fallback.updatedAt;
    status.cartsr = 'fallback';
  }

  const segmentSnapshot = calculateRetailSegmentSnapshot(segmentResults);
  let retailSegments = segmentSnapshot.segments;
  let segmentPositiveCount = segmentSnapshot.segmentPositiveCount;
  let segmentSeriesCount = segmentSnapshot.segmentSeriesCount;
  let segmentDiffusionPct = segmentSnapshot.segmentDiffusionPct;
  let strongestSegment = segmentSnapshot.strongestSegment;
  let weakestSegment = segmentSnapshot.weakestSegment;
  let segmentUpdatedAt = segmentSnapshot.segmentUpdatedAt;
  if (Number.isFinite(segmentDiffusionPct)) {
    status.retailSegments = 'live';
  } else if (Number.isFinite(fallback.segmentDiffusionPct)) {
    retailSegments = fallback.retailSegments;
    segmentPositiveCount = fallback.segmentPositiveCount;
    segmentSeriesCount = fallback.segmentSeriesCount;
    segmentDiffusionPct = fallback.segmentDiffusionPct;
    strongestSegment = fallback.strongestSegment;
    weakestSegment = fallback.weakestSegment;
    segmentUpdatedAt = fallback.segmentUpdatedAt;
    status.retailSegments = 'fallback';
  }

  if (bofaResult.status === 'fulfilled') {
    bofaData = bofaResult.value;
    status.bofaConsumerCheckpoint = 'live';
  } else if (Number.isFinite(fallback.bofaCardSpendingYoY) || Number.isFinite(fallback.bofaCardSpendingExGasYoY)) {
    bofaData = {
      bofaCardSpendingYoY: fallback.bofaCardSpendingYoY,
      bofaCardSpendingPriorYoY: fallback.bofaCardSpendingPriorYoY,
      bofaCardSpendingExGasYoY: fallback.bofaCardSpendingExGasYoY,
      bofaReportDate: fallback.bofaReportDate,
      bofaReportUrl: fallback.bofaReportUrl,
      bofaPdfUrl: fallback.bofaPdfUrl,
      bofaStatus: 'fallback',
      bofaSummary: fallback.bofaSummary
    };
    status.bofaConsumerCheckpoint = 'fallback';
  }

  if (redbookResult.status === 'fulfilled') {
    redbookData = redbookResult.value;
    status.redbookPublicHtml = 'live';
  } else if (Number.isFinite(fallback.redbookRetailSalesYoY)) {
    redbookData = {
      redbookRetailSalesYoY: fallback.redbookRetailSalesYoY,
      redbookHistoricalAverageYoY: fallback.redbookHistoricalAverageYoY,
      redbookRetailSalesDate: fallback.redbookRetailSalesDate,
      redbookReportUrl: fallback.redbookReportUrl,
      redbookStatus: 'fallback',
      redbookSummary: fallback.redbookSummary
    };
    status.redbookPublicHtml = 'fallback';
  }

  return {
    cartsNominal: Number.isFinite(cartsNominal) ? cartsNominal : null,
    cartsNominal4wAverage: Number.isFinite(cartsNominal4wAverage) ? cartsNominal4wAverage : null,
    cartsNominalYoY: Number.isFinite(cartsNominalYoY) ? cartsNominalYoY : null,
    cartsReal: Number.isFinite(cartsReal) ? cartsReal : null,
    cartsReal4wAverage: Number.isFinite(cartsReal4wAverage) ? cartsReal4wAverage : null,
    cartsRealYoY: Number.isFinite(cartsRealYoY) ? cartsRealYoY : null,
    retailSegments,
    segmentPositiveCount: Number.isFinite(segmentPositiveCount) ? segmentPositiveCount : null,
    segmentSeriesCount: Number.isFinite(segmentSeriesCount) ? segmentSeriesCount : null,
    segmentDiffusionPct: Number.isFinite(segmentDiffusionPct) ? segmentDiffusionPct : null,
    segmentRegime: classifyRetailSegmentRegime(segmentDiffusionPct),
    strongestSegment,
    weakestSegment,
    segmentUpdatedAt,
    bofaCardSpendingYoY: Number.isFinite(bofaData?.bofaCardSpendingYoY) ? bofaData.bofaCardSpendingYoY : null,
    bofaCardSpendingPriorYoY: Number.isFinite(bofaData?.bofaCardSpendingPriorYoY) ? bofaData.bofaCardSpendingPriorYoY : null,
    bofaCardSpendingExGasYoY: Number.isFinite(bofaData?.bofaCardSpendingExGasYoY) ? bofaData.bofaCardSpendingExGasYoY : null,
    bofaReportDate: typeof bofaData?.bofaReportDate === 'string' ? bofaData.bofaReportDate : null,
    bofaReportUrl: typeof bofaData?.bofaReportUrl === 'string' ? bofaData.bofaReportUrl : null,
    bofaPdfUrl: typeof bofaData?.bofaPdfUrl === 'string' ? bofaData.bofaPdfUrl : null,
    bofaStatus: typeof bofaData?.bofaStatus === 'string' ? bofaData.bofaStatus : status.bofaConsumerCheckpoint,
    bofaSummary: typeof bofaData?.bofaSummary === 'string' ? bofaData.bofaSummary : null,
    redbookRetailSalesYoY: Number.isFinite(redbookData?.redbookRetailSalesYoY) ? redbookData.redbookRetailSalesYoY : null,
    redbookHistoricalAverageYoY: Number.isFinite(redbookData?.redbookHistoricalAverageYoY) ? redbookData.redbookHistoricalAverageYoY : null,
    redbookRetailSalesDate: typeof redbookData?.redbookRetailSalesDate === 'string' ? redbookData.redbookRetailSalesDate : null,
    redbookReportUrl: typeof redbookData?.redbookReportUrl === 'string' ? redbookData.redbookReportUrl : null,
    redbookStatus: typeof redbookData?.redbookStatus === 'string' ? redbookData.redbookStatus : status.redbookPublicHtml,
    redbookSummary: typeof redbookData?.redbookSummary === 'string' ? redbookData.redbookSummary : null,
    retailRegime: classifyRetailRegime(cartsRealYoY, redbookData?.redbookRetailSalesYoY),
    sourceStatus: status,
    updatedAt: latestIsoDate(cartsNominalUpdatedAt, cartsRealUpdatedAt, segmentUpdatedAt, bofaData?.bofaReportDate, redbookData?.redbookRetailSalesDate),
    source: CONSUMER_RETAIL_SOURCE,
    notes: ['CARTS / CARTSR 为 Chicago Fed via FRED 周频零售+餐饮 nowcast；MRTS 细分零售为月频公开数据；BoA Consumer Checkpoint 与 Redbook public HTML 为第三方公开消费证据；audit-only / display-only。']
  };
}

async function resolveCommercialRealEstate(prevCre) {
  const fallback = normalizePreviousCommercialRealEstate(prevCre);
  const status = {
    delinquency: 'missing',
    chargeOff: 'missing',
    sloosNonfarmNonresidential: 'missing',
    sloosConstruction: 'missing',
    sloosMultifamily: 'missing',
    reitEtf: 'missing',
    mortgageReitEtf: 'missing',
    cmbsEtf: 'missing',
    creLoanBalance: 'missing',
    nonPublicCre: 'manual_required'
  };
  let creDelinquencyRate = null;
  let creDelinquencyRateQoQChange = null;
  let creDelinquencyUpdatedAt = null;
  let creChargeOffRate = null;
  let creChargeOffRateQoQChange = null;
  let creChargeOffUpdatedAt = null;
  let sloosCreNonfarmNonresidentialTightening = null;
  let sloosCreNonfarmNonresidentialUpdatedAt = null;
  let sloosCreConstructionTightening = null;
  let sloosCreConstructionUpdatedAt = null;
  let sloosCreMultifamilyTightening = null;
  let sloosCreMultifamilyUpdatedAt = null;
  let reitEtfPrice = null;
  let reitEtf4wChange = null;
  let reitEtfUpdatedAt = null;
  let mortgageReitEtfPrice = null;
  let mortgageReitEtf4wChange = null;
  let mortgageReitEtfUpdatedAt = null;
  let cmbsEtfPrice = null;
  let cmbsEtf4wChange = null;
  let cmbsEtfUpdatedAt = null;
  let creLoanBalance = null;
  let creLoanBalance4wChange = null;
  let creLoanBalanceYoY = null;
  let creLoanBalanceUpdatedAt = null;
  let creLoanBalanceStatus = 'missing';

  const [
    delinquencyResult,
    chargeOffResult,
    sloosNonfarmNonresidentialResult,
    sloosConstructionResult,
    sloosMultifamilyResult,
    creLoanBalanceResult,
    reitEtfResult,
    mortgageReitEtfResult,
    cmbsEtfResult
  ] = await Promise.allSettled([
    fetchFredSeries('DRCRELEXFACBS', 13000),
    fetchFredSeries('CORCREXFACBS', 13000),
    fetchFredSeries('SUBLPDRCSN', 13000),
    fetchFredSeries('SUBLPDRCSC', 13000),
    fetchFredSeries('SUBLPDRCSM', 13000),
    fetchFredSeries('CREACBW027SBOG', 760),
    fetchYahooChartQuote('VNQ', '1mo', '1d'),
    fetchYahooChartQuote('REM', '1mo', '1d'),
    fetchYahooChartQuote('CMBS', '1mo', '1d')
  ]);

  if (delinquencyResult.status === 'fulfilled') {
    const rows = delinquencyResult.value;
    creDelinquencyRate = latestValue(rows);
    creDelinquencyRateQoQChange = calculateLatestDelta(rows);
    creDelinquencyUpdatedAt = latestDateIso(rows);
    status.delinquency = 'live';
  } else if (Number.isFinite(fallback.creDelinquencyRate)) {
    creDelinquencyRate = fallback.creDelinquencyRate;
    creDelinquencyRateQoQChange = fallback.creDelinquencyRateQoQChange;
    creDelinquencyUpdatedAt = fallback.updatedAt;
    status.delinquency = 'fallback';
  }

  if (chargeOffResult.status === 'fulfilled') {
    const rows = chargeOffResult.value;
    creChargeOffRate = latestValue(rows);
    creChargeOffRateQoQChange = calculateLatestDelta(rows);
    creChargeOffUpdatedAt = latestDateIso(rows);
    status.chargeOff = 'live';
  } else if (Number.isFinite(fallback.creChargeOffRate)) {
    creChargeOffRate = fallback.creChargeOffRate;
    creChargeOffRateQoQChange = fallback.creChargeOffRateQoQChange;
    creChargeOffUpdatedAt = fallback.updatedAt;
    status.chargeOff = 'fallback';
  }

  if (sloosNonfarmNonresidentialResult.status === 'fulfilled') {
    const rows = sloosNonfarmNonresidentialResult.value;
    sloosCreNonfarmNonresidentialTightening = latestValue(rows);
    sloosCreNonfarmNonresidentialUpdatedAt = latestDateIso(rows);
    status.sloosNonfarmNonresidential = 'live';
  } else if (Number.isFinite(fallback.sloosCreNonfarmNonresidentialTightening)) {
    sloosCreNonfarmNonresidentialTightening = fallback.sloosCreNonfarmNonresidentialTightening;
    sloosCreNonfarmNonresidentialUpdatedAt = fallback.updatedAt;
    status.sloosNonfarmNonresidential = 'fallback';
  }

  if (sloosConstructionResult.status === 'fulfilled') {
    const rows = sloosConstructionResult.value;
    sloosCreConstructionTightening = latestValue(rows);
    sloosCreConstructionUpdatedAt = latestDateIso(rows);
    status.sloosConstruction = 'live';
  } else if (Number.isFinite(fallback.sloosCreConstructionTightening)) {
    sloosCreConstructionTightening = fallback.sloosCreConstructionTightening;
    sloosCreConstructionUpdatedAt = fallback.updatedAt;
    status.sloosConstruction = 'fallback';
  }

  if (sloosMultifamilyResult.status === 'fulfilled') {
    const rows = sloosMultifamilyResult.value;
    sloosCreMultifamilyTightening = latestValue(rows);
    sloosCreMultifamilyUpdatedAt = latestDateIso(rows);
    status.sloosMultifamily = 'live';
  } else if (Number.isFinite(fallback.sloosCreMultifamilyTightening)) {
    sloosCreMultifamilyTightening = fallback.sloosCreMultifamilyTightening;
    sloosCreMultifamilyUpdatedAt = fallback.updatedAt;
    status.sloosMultifamily = 'fallback';
  }

  if (creLoanBalanceResult.status === 'fulfilled') {
    const rows = creLoanBalanceResult.value;
    creLoanBalance = latestValue(rows);
    const fourWeeksAgo = findValueAgo(rows, 28);
    const yearAgo = findValueAgo(rows, 52 * 7);
    creLoanBalance4wChange = Number.isFinite(creLoanBalance) && Number.isFinite(fourWeeksAgo) && fourWeeksAgo !== 0
      ? +(((creLoanBalance - fourWeeksAgo) / fourWeeksAgo)).toFixed(4)
      : null;
    creLoanBalanceYoY = Number.isFinite(creLoanBalance) && Number.isFinite(yearAgo) && yearAgo !== 0
      ? +(((creLoanBalance - yearAgo) / yearAgo)).toFixed(4)
      : null;
    creLoanBalanceUpdatedAt = latestDateIso(rows);
    creLoanBalanceStatus = 'live';
    status.creLoanBalance = 'live';
  } else if (Number.isFinite(fallback.creLoanBalance)) {
    creLoanBalance = fallback.creLoanBalance;
    creLoanBalance4wChange = fallback.creLoanBalance4wChange;
    creLoanBalanceYoY = fallback.creLoanBalanceYoY;
    creLoanBalanceUpdatedAt = fallback.creLoanBalanceUpdatedAt;
    creLoanBalanceStatus = 'fallback';
    status.creLoanBalance = 'fallback';
  }

  if (reitEtfResult.status === 'fulfilled') {
    reitEtfPrice = reitEtfResult.value.price;
    reitEtf4wChange = reitEtfResult.value.changePct;
    reitEtfUpdatedAt = reitEtfResult.value.updatedAt;
    status.reitEtf = 'live';
  } else if (Number.isFinite(fallback.reitEtfPrice)) {
    reitEtfPrice = fallback.reitEtfPrice;
    reitEtf4wChange = fallback.reitEtf4wChange;
    reitEtfUpdatedAt = fallback.reitEtfUpdatedAt;
    status.reitEtf = 'fallback';
  }

  if (mortgageReitEtfResult.status === 'fulfilled') {
    mortgageReitEtfPrice = mortgageReitEtfResult.value.price;
    mortgageReitEtf4wChange = mortgageReitEtfResult.value.changePct;
    mortgageReitEtfUpdatedAt = mortgageReitEtfResult.value.updatedAt;
    status.mortgageReitEtf = 'live';
  } else if (Number.isFinite(fallback.mortgageReitEtfPrice)) {
    mortgageReitEtfPrice = fallback.mortgageReitEtfPrice;
    mortgageReitEtf4wChange = fallback.mortgageReitEtf4wChange;
    mortgageReitEtfUpdatedAt = fallback.mortgageReitEtfUpdatedAt;
    status.mortgageReitEtf = 'fallback';
  }

  if (cmbsEtfResult.status === 'fulfilled') {
    cmbsEtfPrice = cmbsEtfResult.value.price;
    cmbsEtf4wChange = cmbsEtfResult.value.changePct;
    cmbsEtfUpdatedAt = cmbsEtfResult.value.updatedAt;
    status.cmbsEtf = 'live';
  } else if (Number.isFinite(fallback.cmbsEtfPrice)) {
    cmbsEtfPrice = fallback.cmbsEtfPrice;
    cmbsEtf4wChange = fallback.cmbsEtf4wChange;
    cmbsEtfUpdatedAt = fallback.cmbsEtfUpdatedAt;
    status.cmbsEtf = 'fallback';
  }

  const sloosValues = [
    sloosCreNonfarmNonresidentialTightening,
    sloosCreConstructionTightening,
    sloosCreMultifamilyTightening
  ].filter(Number.isFinite);
  const sloosCreTighteningMax = sloosValues.length ? +Math.max(...sloosValues).toFixed(3) : null;

  return {
    creDelinquencyRate: Number.isFinite(creDelinquencyRate) ? +creDelinquencyRate.toFixed(3) : null,
    creDelinquencyRateQoQChange: Number.isFinite(creDelinquencyRateQoQChange) ? creDelinquencyRateQoQChange : null,
    creChargeOffRate: Number.isFinite(creChargeOffRate) ? +creChargeOffRate.toFixed(3) : null,
    creChargeOffRateQoQChange: Number.isFinite(creChargeOffRateQoQChange) ? creChargeOffRateQoQChange : null,
    sloosCreNonfarmNonresidentialTightening: Number.isFinite(sloosCreNonfarmNonresidentialTightening) ? +sloosCreNonfarmNonresidentialTightening.toFixed(3) : null,
    sloosCreConstructionTightening: Number.isFinite(sloosCreConstructionTightening) ? +sloosCreConstructionTightening.toFixed(3) : null,
    sloosCreMultifamilyTightening: Number.isFinite(sloosCreMultifamilyTightening) ? +sloosCreMultifamilyTightening.toFixed(3) : null,
    sloosCreTighteningMax,
    reitEtfPrice: Number.isFinite(reitEtfPrice) ? reitEtfPrice : null,
    reitEtf4wChange: Number.isFinite(reitEtf4wChange) ? reitEtf4wChange : null,
    reitEtfUpdatedAt,
    mortgageReitEtfPrice: Number.isFinite(mortgageReitEtfPrice) ? mortgageReitEtfPrice : null,
    mortgageReitEtf4wChange: Number.isFinite(mortgageReitEtf4wChange) ? mortgageReitEtf4wChange : null,
    mortgageReitEtfUpdatedAt,
    cmbsEtfPrice: Number.isFinite(cmbsEtfPrice) ? cmbsEtfPrice : null,
    cmbsEtf4wChange: Number.isFinite(cmbsEtf4wChange) ? cmbsEtf4wChange : null,
    cmbsEtfUpdatedAt,
    creLoanBalance: Number.isFinite(creLoanBalance) ? +creLoanBalance.toFixed(4) : null,
    creLoanBalance4wChange: Number.isFinite(creLoanBalance4wChange) ? creLoanBalance4wChange : null,
    creLoanBalanceYoY: Number.isFinite(creLoanBalanceYoY) ? creLoanBalanceYoY : null,
    creLoanBalanceUpdatedAt,
    creLoanBalanceStatus,
    crePublicMarketProxyRegime: classifyCrePublicMarketProxyRegime(reitEtf4wChange, mortgageReitEtf4wChange, cmbsEtf4wChange),
    nonPublicCreStatus: 'manual_required',
    creStressRegime: classifyCreStressRegime(creDelinquencyRate, creChargeOffRate, sloosCreTighteningMax),
    sourceStatus: status,
    updatedAt: latestIsoDate(
      creDelinquencyUpdatedAt,
      creChargeOffUpdatedAt,
      sloosCreNonfarmNonresidentialUpdatedAt,
      sloosCreConstructionUpdatedAt,
      sloosCreMultifamilyUpdatedAt,
      creLoanBalanceUpdatedAt,
      reitEtfUpdatedAt,
      mortgageReitEtfUpdatedAt,
      cmbsEtfUpdatedAt
    ),
    source: CRE_PUBLIC_MARKET_PROXY_SOURCE,
    notes: [
      'CRE delinquency / charge-off / SLOOS CRE tightening (3 子类) 为 FRED 季频公开数据;observation date 为季度起始日;audit-only / display-only。',
      'FRED CREACBW027SBOG 为周频银行 CRE loan balance aggregate exposure proxy;VNQ / REM / CMBS 为公开市场代理,均不代表非公开 CRE loan tape 或私募信用 marks。'
    ]
  };
}

async function fetchMacroDrivers(prev, hyOasLive) {
  const prevMd = prev?.macroDrivers || {};
  const results = await Promise.allSettled([
    resolveFedLiquidity(prevMd.fedLiquidity),
    resolvePolicyExpectations(prevMd.policyExpectations),
    resolveCurve(prevMd.curve),
    resolveCredit(prevMd.credit, hyOasLive),
    resolveConsumerSentiment(prevMd.consumer),
    resolveShippingFreight(prevMd.shippingFreight),
    resolveEmploymentBreadth(prevMd.employment),
    resolveConsumerRetail(prevMd.consumerRetail),
    resolveCommercialRealEstate(prevMd.commercialRealEstate),
    resolvePrivateCreditProxy(prevMd.privateCreditProxy, hyOasLive),
    resolveWorldEconomy(prevMd.worldEconomy),
    resolveChinaEquity(prevMd.chinaEquity),
    resolveInflationEnergy(prevMd.inflationEnergy),
    resolveCopperGold(prevMd.copperGold),
    resolveChinaBond(prevMd.chinaBond),
    resolveCfetsRmb(prevMd.cfetsRmb),
    resolveChinaInflation(prevMd.chinaInflation),
    resolveChinaPmi(prevMd.chinaPmi),
    resolveEuroVolatility(prevMd.euroVolatility),
    resolveChinaPropertyPrice(prevMd.chinaPropertyPrice),
    resolveChinaOmo(prevMd.chinaOmo),
    resolveChinaTsf(prevMd.chinaTsf),
    resolveChinaMlf(prevMd.chinaMlf),
    resolveRateVol(prevMd.rateVol),
    resolveEnergySpareCapacity(prevMd.energySpareCapacity),
    resolveEnergyInventoryBalance(prevMd.energyInventoryBalance),
    resolveEnergyTransport(prevMd.energyTransport)
  ]);

  const fedLiquidity = results[0].status === 'fulfilled' ? results[0].value : {
    walcl: null, walcl4wChange: null, onRrp: null, onRrpWeekChange: null,
    effectiveFedFundsRate: null, sofr: null, reserveBalances: null, reserveBalances4wChange: null,
    bgcr: null, tgcr: null, bgcrUpdatedAt: null, tgcrUpdatedAt: null, repoRatesSource: null,
    bgcrSofrSpread: null, tgcrSofrSpread: null, repoSpreadRegime: '未知',
    regime: '未知', onRrpLevel: '未知', pressure: 0,
    sourceStatus: {
      walcl: 'missing',
      onRrp: 'missing',
      effectiveFedFundsRate: 'missing',
      sofr: 'missing',
      reserveBalances: 'missing',
      bgcr: 'missing',
      tgcr: 'missing'
    }
  };
  const policyExpectations = results[1].status === 'fulfilled' ? results[1].value : buildMissingPolicyExpectations();
  const curve = results[2].status === 'fulfilled' ? results[2].value : {
    t10y2y: null, t10y2yWeekChange: null, regime: '未知', steepeningAlert: false,
    sourceStatus: { t10y2y: 'missing' }
  };
  const credit = results[3].status === 'fulfilled' ? results[3].value : {
    igOas: null, igOas1dChange: null, igHyRatio: null, regime: '未知',
    sloosTighteningLargeFirms: null,
    sloosTighteningSmallFirms: null,
    sloosTighteningLargeQoQ: null,
    sloosTighteningSmallQoQ: null,
    sloosRegime: '未知',
    nfci: null,
    nfci4wChange: null,
    nfciRegime: '未知',
    sourceStatus: { igOas: 'missing', sloos: 'missing', nfci: 'missing' }
  };
  const consumer = results[4].status === 'fulfilled' ? results[4].value : buildMissingConsumer();
  const shippingFreight = results[5].status === 'fulfilled' ? results[5].value : buildMissingShippingFreight();
  const employment = results[6].status === 'fulfilled' ? results[6].value : buildMissingEmployment();
  const consumerRetail = results[7].status === 'fulfilled' ? results[7].value : buildMissingConsumerRetail();
  const commercialRealEstate = results[8].status === 'fulfilled' ? results[8].value : buildMissingCommercialRealEstate();
  const privateCreditProxy = results[9].status === 'fulfilled' ? results[9].value : buildMissingPrivateCreditProxy();
  const worldEconomy = results[10].status === 'fulfilled' ? results[10].value : buildMissingWorldEconomy(prevMd.worldEconomy);
  const chinaEquity = results[11].status === 'fulfilled' ? results[11].value : buildMissingChinaEquity(prevMd.chinaEquity);
  const inflationEnergy = results[12].status === 'fulfilled' ? results[12].value : buildMissingInflationEnergy(prevMd.inflationEnergy);
  const copperGold = results[13].status === 'fulfilled' ? results[13].value : buildMissingCopperGold(prevMd.copperGold);
  const chinaBond = results[14].status === 'fulfilled' ? results[14].value : buildMissingChinaBond(prevMd.chinaBond);
  const cfetsRmb = results[15].status === 'fulfilled' ? results[15].value : buildMissingCfetsRmb(prevMd.cfetsRmb);
  const chinaInflation = results[16].status === 'fulfilled' ? results[16].value : buildMissingChinaInflation(prevMd.chinaInflation);
  const chinaPmi = results[17].status === 'fulfilled' ? results[17].value : buildMissingChinaPmi(prevMd.chinaPmi);
  const euroVolatility = results[18].status === 'fulfilled' ? results[18].value : buildMissingEuroVolatility(prevMd.euroVolatility);
  const chinaPropertyPrice = results[19].status === 'fulfilled' ? results[19].value : buildMissingChinaPropertyPrice(prevMd.chinaPropertyPrice);
  const chinaOmo = results[20].status === 'fulfilled' ? results[20].value : buildMissingChinaOmo(prevMd.chinaOmo);
  const chinaTsf = results[21].status === 'fulfilled' ? results[21].value : buildMissingChinaTsf(prevMd.chinaTsf);
  const chinaMlf = results[22].status === 'fulfilled' ? results[22].value : buildMissingChinaMlf(prevMd.chinaMlf);
  const rateVol = results[23].status === 'fulfilled' ? results[23].value : {
    move: null, moveUpdatedAt: null, moveAgeDays: null, moveRegime: '未知',
    freshnessStatus: 'missing', source: 'Yahoo:^MOVE', sourceStatus: { move: 'missing' },
    notes: '债券/利率波动率 MOVE 结构信号 evidence（Yahoo ^MOVE 日频）。'
  };
  const energySpareCapacity = results[24].status === 'fulfilled' ? results[24].value : buildMissingEnergySpareCapacity('resolver_rejected');
  const energyInventoryBalance = results[25].status === 'fulfilled' ? results[25].value : buildMissingEnergyInventoryBalance('resolver_rejected');
  const energyTransport = results[26].status === 'fulfilled' ? results[26].value : buildMissingEnergyTransport('resolver_rejected');

  return {
    fedLiquidity,
    policyExpectations,
    curve,
    credit,
    consumer,
    shippingFreight,
    employment,
    consumerRetail,
    commercialRealEstate,
    privateCreditProxy,
    worldEconomy,
    chinaEquity,
    inflationEnergy,
    copperGold,
    chinaBond,
    cfetsRmb,
    chinaInflation,
    chinaPmi,
    euroVolatility,
    chinaPropertyPrice,
    chinaOmo,
    chinaTsf,
    chinaMlf,
    rateVol,
    energySpareCapacity,
    energyInventoryBalance,
    energyTransport
  };
}

async function fetchDisplayOnlyMacroDrivers(prevMd) {
  const results = await Promise.allSettled([
    resolveWorldEconomy(prevMd?.worldEconomy),
    resolveChinaEquity(prevMd?.chinaEquity),
    resolveInflationEnergy(prevMd?.inflationEnergy),
    resolveCopperGold(prevMd?.copperGold),
    resolveChinaBond(prevMd?.chinaBond),
    resolveCfetsRmb(prevMd?.cfetsRmb),
    resolveChinaInflation(prevMd?.chinaInflation),
    resolveChinaPmi(prevMd?.chinaPmi),
    resolveEuroVolatility(prevMd?.euroVolatility),
    resolveChinaPropertyPrice(prevMd?.chinaPropertyPrice),
    resolveChinaOmo(prevMd?.chinaOmo),
    resolveChinaTsf(prevMd?.chinaTsf),
    resolveChinaMlf(prevMd?.chinaMlf),
    resolveEnergySpareCapacity(prevMd?.energySpareCapacity),
    resolveEnergyInventoryBalance(prevMd?.energyInventoryBalance),
    resolveEnergyTransport(prevMd?.energyTransport)
  ]);
  return {
    worldEconomy: results[0].status === 'fulfilled' ? results[0].value : buildMissingWorldEconomy(prevMd?.worldEconomy),
    chinaEquity: results[1].status === 'fulfilled' ? results[1].value : buildMissingChinaEquity(prevMd?.chinaEquity),
    inflationEnergy: results[2].status === 'fulfilled' ? results[2].value : buildMissingInflationEnergy(prevMd?.inflationEnergy),
    copperGold: results[3].status === 'fulfilled' ? results[3].value : buildMissingCopperGold(prevMd?.copperGold),
    chinaBond: results[4].status === 'fulfilled' ? results[4].value : buildMissingChinaBond(prevMd?.chinaBond),
    cfetsRmb: results[5].status === 'fulfilled' ? results[5].value : buildMissingCfetsRmb(prevMd?.cfetsRmb),
    chinaInflation: results[6].status === 'fulfilled' ? results[6].value : buildMissingChinaInflation(prevMd?.chinaInflation),
    chinaPmi: results[7].status === 'fulfilled' ? results[7].value : buildMissingChinaPmi(prevMd?.chinaPmi),
    euroVolatility: results[8].status === 'fulfilled' ? results[8].value : buildMissingEuroVolatility(prevMd?.euroVolatility),
    chinaPropertyPrice: results[9].status === 'fulfilled' ? results[9].value : buildMissingChinaPropertyPrice(prevMd?.chinaPropertyPrice),
    chinaOmo: results[10].status === 'fulfilled' ? results[10].value : buildMissingChinaOmo(prevMd?.chinaOmo),
    chinaTsf: results[11].status === 'fulfilled' ? results[11].value : buildMissingChinaTsf(prevMd?.chinaTsf),
    chinaMlf: results[12].status === 'fulfilled' ? results[12].value : buildMissingChinaMlf(prevMd?.chinaMlf),
    energySpareCapacity: results[13].status === 'fulfilled' ? results[13].value : buildMissingEnergySpareCapacity('resolver_rejected'),
    energyInventoryBalance: results[14].status === 'fulfilled' ? results[14].value : buildMissingEnergyInventoryBalance('resolver_rejected'),
    energyTransport: results[15].status === 'fulfilled' ? results[15].value : buildMissingEnergyTransport('resolver_rejected')
  };
}

// 判断结构信号数据源是否"全不可用"
function isAllStructuralSourcesMissing(macroDrivers) {
  const fed = macroDrivers?.fedLiquidity?.sourceStatus || {};
  const curve = macroDrivers?.curve?.sourceStatus || {};
  const credit = macroDrivers?.credit?.sourceStatus || {};
  const rateVol = macroDrivers?.rateVol?.sourceStatus || {};
  return fed.walcl === 'missing'
    && fed.onRrp === 'missing'
    && curve.t10y2y === 'missing'
    && credit.igOas === 'missing'
    && rateVol.move !== 'live' && rateVol.move !== 'fallback';
}

function activeStructuralSignals(macroDrivers) {
  const active = [];
  const fed = macroDrivers?.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = macroDrivers?.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = macroDrivers?.credit || {};
  const creditStatus = credit.sourceStatus || {};
  const rateVol = macroDrivers?.rateVol || {};
  const rateVolStatus = rateVol.sourceStatus || {};
  const cfg = R.macroDrivers;

  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing'
      && curve.t10y2y <= cfg.curve.deepInversionThreshold) {
    active.push({
      key: 'curveDeepInversion',
      label: '曲线深度倒挂',
      detail: `10年-2年利差 ${curve.t10y2y.toFixed(2)}`,
      reliability: curveStatus.t10y2y
    });
  }
  if (Number.isFinite(curve.t10y2y) && curve.steepeningAlert && curveStatus.t10y2y !== 'missing') {
    active.push({
      key: 'curveRapidSteepening',
      label: '曲线快速陡峭化',
      detail: `周变化 ${curve.t10y2yWeekChange?.toFixed?.(2) ?? '--'}`,
      reliability: curveStatus.t10y2y
    });
  }
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing'
      && fed.onRrp < cfg.fedLiquidity.onRrpCriticalThreshold) {
    active.push({
      key: 'onRrpCritical',
      label: '逆回购准备金告急',
      detail: `ON RRP ${formatOnRrpYiUsd(fed.onRrp)}`,
      reliability: fedStatus.onRrp
    });
  }
  if (Number.isFinite(fed.walcl4wChange) && fedStatus.walcl !== 'missing'
      && fed.walcl4wChange <= cfg.fedLiquidity.walcl4wRapidContractionAlert) {
    active.push({
      key: 'fedRapidContraction',
      label: '美联储快速缩表',
      detail: `4周变化 ${fed.walcl4wChange.toFixed(2)}%`,
      reliability: fedStatus.walcl
    });
  }
  if (Number.isFinite(credit.igOas) && creditStatus.igOas !== 'missing'
      && credit.igOas >= cfg.credit.igOasStressThreshold) {
    active.push({
      key: 'igOasStress',
      label: '投资级信用利差扩张',
      detail: `IG OAS ${credit.igOas.toFixed(2)}%`,
      reliability: creditStatus.igOas
    });
  }
  if (Number.isFinite(rateVol.move) && (rateVolStatus.move === 'live' || rateVolStatus.move === 'fallback')
      && rateVol.move >= cfg.rateVol.stressThreshold) {
    active.push({
      key: 'moveVolStress',
      label: '债券波动率告急（MOVE）',
      detail: `MOVE ${rateVol.move.toFixed(1)}（${rateVol.move >= cfg.rateVol.crisisThreshold ? '危机' : '应激'}）`,
      reliability: rateVolStatus.move
    });
  }
  return active;
}

function structuralScoreBump(activeSignals) {
  const gating = R.structuralGating || {};
  let bump = 0;
  for (const sig of activeSignals) {
    const add = gating[sig.key];
    if (Number.isFinite(add)) bump += add;
  }
  return bump;
}

function structuralBandShift(activeSignals) {
  const shifts = R.positionGuidanceShifts || {};
  let total = 0;
  for (const sig of activeSignals) {
    const v = shifts[sig.key];
    if (Number.isFinite(v)) total += v;
  }
  // 多结构信号叠加时设总下限，避免过度保守（Codex 复核建议）
  const floor = Number.isFinite(R.positionGuidanceShiftFloor) ? R.positionGuidanceShiftFloor : -15;
  return Math.max(floor, total);
}

function roundMetric(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeCalibrationPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map((point) => ({
      value: Number(point?.value),
      risk: Number(point?.risk),
      label: typeof point?.label === 'string' ? point.label : null
    }))
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.risk))
    .sort((a, b) => a.value - b.value);
}

function interpolateRiskFromCalibration(value, calibration, fallbackBase, fallbackScale) {
  const fallbackRisk = clamp((value - fallbackBase) * fallbackScale);
  const points = normalizeCalibrationPoints(calibration?.points);
  if (!Number.isFinite(value) || points.length < 2) {
    return {
      value: roundMetric(value),
      risk: fallbackRisk,
      method: 'legacy_linear_fallback',
      source: calibration?.source || null,
      fallbackUsed: true
    };
  }

  let risk = null;
  let lowerPoint = points[0];
  let upperPoint = points[points.length - 1];
  if (value <= points[0].value) {
    risk = points[0].risk;
    upperPoint = points[1];
  } else if (value >= points[points.length - 1].value) {
    risk = points[points.length - 1].risk;
    lowerPoint = points[points.length - 2];
  } else {
    for (let index = 0; index < points.length - 1; index += 1) {
      const left = points[index];
      const right = points[index + 1];
      if (value >= left.value && value <= right.value) {
        const span = right.value - left.value;
        const pct = span > 0 ? (value - left.value) / span : 0;
        risk = left.risk + (right.risk - left.risk) * pct;
        lowerPoint = left;
        upperPoint = right;
        break;
      }
    }
  }

  return {
    value: roundMetric(value),
    risk: clamp(risk ?? fallbackRisk),
    method: calibration?.method || 'piecewise_historical_percentile',
    source: calibration?.source || null,
    sampleStart: calibration?.sampleStart || null,
    sampleEnd: calibration?.sampleEnd || null,
    lowerPoint,
    upperPoint,
    fallbackUsed: false
  };
}

function buildTailRiskOverlay(inputs) {
  const reasons = [];
  let floor = null;

  const considerFloor = (candidateFloor, key, labelZh, evidence) => {
    if (!Number.isFinite(candidateFloor)) return;
    reasons.push({
      key,
      labelZh,
      floor: clamp(candidateFloor),
      evidence: evidence.filter(Boolean)
    });
    floor = Math.max(floor ?? 0, candidateFloor);
  };

  if (inputs.vixRisk >= 95 && inputs.hyRisk >= 55) {
    considerFloor(82, 'systemic_liquidity_credit_shock', '波动率与信用同步冲击', [
      `VIX risk ${inputs.vixRisk}`,
      `HY risk ${inputs.hyRisk}`
    ]);
  } else if (inputs.vixRisk >= 85 && (inputs.hyRisk >= 45 || inputs.baseLiquidity >= 65 || inputs.bankingRisk >= 65)) {
    considerFloor(72, 'systemic_liquidity_credit_watch', '波动率冲击向信用/流动性传导', [
      `VIX risk ${inputs.vixRisk}`,
      `HY risk ${inputs.hyRisk}`,
      `liquidity ${inputs.baseLiquidity}`,
      `banking ${inputs.bankingRisk}`
    ]);
  }

  if (inputs.oilRisk >= 85 && inputs.inflationRisk >= 60 && (inputs.vixRisk >= 45 || inputs.rateRisk >= 40 || inputs.dollarRisk >= 65)) {
    considerFloor(68, 'energy_inflation_tail', '能源与通胀尾部冲击', [
      `oil risk ${inputs.oilRisk}`,
      `inflation risk ${inputs.inflationRisk}`,
      `VIX/rates/dollar ${Math.max(inputs.vixRisk, inputs.rateRisk, inputs.dollarRisk)}`
    ]);
  }

  if ((inputs.curveInversionRisk ?? 0) >= 60 && inputs.vixRisk >= 70 && (inputs.bankingRisk >= 35 || (inputs.nimPressureRisk ?? 0) >= 70)) {
    considerFloor(66, 'banking_curve_stress', '曲线倒挂与银行压力共振', [
      `curve inversion risk ${inputs.curveInversionRisk}`,
      `VIX risk ${inputs.vixRisk}`,
      `banking risk ${inputs.bankingRisk}`
    ]);
  }

  const baseScore = clamp(inputs.baseScore);
  const overlayFloor = Number.isFinite(floor) ? clamp(floor) : null;
  const adjustedScore = overlayFloor === null ? baseScore : clamp(Math.max(baseScore, overlayFloor));
  return {
    method: 'conditional_tail_floor_v1',
    applied: adjustedScore > baseScore,
    baseScore,
    floor: overlayFloor,
    adjustedScore,
    scoreAdd: adjustedScore - baseScore,
    reasons
  };
}

export function buildTransportShockScoringImpact(energyTransport, scoreBeforeTransport) {
  const candidate = energyTransport?.transportShockCandidate;
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints || 'missing';
  const latestAgeDays = Number.isFinite(energyTransport?.latestAgeDays) ? energyTransport.latestAgeDays : null;
  const candidateScore = Number.isFinite(candidate?.score) ? candidate.score : null;
  const pressureStatus = candidate?.status === 'watch' || candidate?.status === 'elevated_watch';
  const guards = {
    candidatePresent: Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate)),
    sourceLive: sourceStatus === 'live',
    latestFresh: Number.isFinite(latestAgeDays)
      && latestAgeDays >= 0
      && latestAgeDays <= TRANSPORT_SHOCK_RUNTIME_SCORING_STALE_AFTER_DAYS,
    eligibleForMainScore: candidate?.eligibleForMainScore === true,
    candidateScorePositive: Number.isFinite(candidateScore) && candidateScore > 0,
    pressureStatus,
    hardCapPct: TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT,
    routeFreightConfirmationConnected: false,
    marketConfirmationConnected: false
  };
  const base = Number.isFinite(scoreBeforeTransport) ? clamp(scoreBeforeTransport) : null;
  const zero = (reason) => ({
    contractVersion: TRANSPORT_SHOCK_SCORING_IMPACT_CONTRACT_VERSION,
    sourcePath: 'macroDrivers.energyTransport.transportShockCandidate',
    runtimeScoringAuthorized: true,
    applied: false,
    contributionPct: 0,
    maxContributionPct: TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT,
    direction: 'transport_shock_pressure_only',
    reason,
    scoreBeforeTransport: base,
    scoreAfterTransport: base,
    sourceStatus,
    latestAgeDays,
    candidateStatus: typeof candidate?.status === 'string' ? candidate.status : null,
    candidateScore,
    guards
  });

  if (!guards.candidatePresent) return zero('candidate_missing_zero_contribution');
  if (!guards.sourceLive) return zero('candidate_not_live_zero_contribution');
  if (!guards.latestFresh) return zero('candidate_stale_zero_contribution');
  if (!guards.eligibleForMainScore) return zero('candidate_not_eligible_zero_contribution');
  if (!guards.pressureStatus) return zero('candidate_not_pressure_status_zero_contribution');
  if (!guards.candidateScorePositive) return zero('candidate_score_not_positive_zero_contribution');
  if (!Number.isFinite(base)) return zero('base_score_missing_zero_contribution');

  const rawContribution = candidateScore >= 75 ? 3 : candidateScore >= 60 ? 2 : candidateScore >= 50 ? 1 : 0;
  const requestedContributionPct = clampRange(rawContribution, 0, TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT);
  if (requestedContributionPct <= 0) return zero('candidate_score_below_contribution_threshold_zero_contribution');
  const scoreAfterTransport = clamp(base + requestedContributionPct);
  const contributionPct = scoreAfterTransport - base;
  if (contributionPct <= 0) return zero('score_ceiling_zero_contribution');

  return {
    contractVersion: TRANSPORT_SHOCK_SCORING_IMPACT_CONTRACT_VERSION,
    sourcePath: 'macroDrivers.energyTransport.transportShockCandidate',
    runtimeScoringAuthorized: true,
    applied: true,
    contributionPct,
    maxContributionPct: TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT,
    direction: 'transport_shock_pressure_only',
    reason: 'owner_approved_free_proxy_transport_pressure_low_weight_applied',
    scoreBeforeTransport: base,
    scoreAfterTransport,
    sourceStatus,
    latestAgeDays,
    candidateStatus: candidate.status,
    candidateScore,
    guards
  };
}

function deriveRisk(rt, macroDrivers) {
  const v = rt.values || {};
  const brent = v.brent ?? R.defaults.brent;
  const dxy = v.dxy ?? R.defaults.dxy;
  const vix = v.vix ?? R.defaults.vix;
  const hy = v.hyOas ?? R.defaults.hyOas;
  const us10y = v.us10y ?? R.defaults.us10y;
  const real10y = v.real10y ?? R.defaults.real10y;
  const breakeven = v.breakeven10y ?? 2.3;
  const spx = v.spx ?? 5100;
  const gold = v.gold ?? 2350;

  const rb = R.riskBaselines;
  const oilRisk = clamp((brent - rb.brentBase) * rb.brentScale);
  const dxyRiskCalibration = interpolateRiskFromCalibration(
    dxy,
    R.riskCalibrations?.dxyBroadDollar,
    rb.dxyBase,
    rb.dxyScale
  );
  const dollarRisk = dxyRiskCalibration.risk;
  const hyRisk = clamp((hy - rb.hyBase) * rb.hyScale);
  const vixRisk = clamp((vix - rb.vixBase) * rb.vixScale);
  const rateRisk = clamp((us10y - rb.us10yBase) * rb.us10yScale);
  const realRisk = clamp((real10y - rb.real10yBase) * rb.real10yScale);
  const inflationRisk = clamp((breakeven - rb.breakevenBase) * rb.breakevenScale + oilRisk * rb.oilInflationWeight);
  const spxRisk = clamp((5300 - spx) / 6);

  const baseLiquidity = clamp((dollarRisk * 0.35) + (hyRisk * 0.35) + (vixRisk * 0.18) + (rateRisk * 0.12));
  const baseDebt = clamp((realRisk * 0.45) + (rateRisk * 0.3) + (hyRisk * 0.25));
  const baseBanking = clamp((hyRisk * 0.55) + (vixRisk * 0.2) + (dollarRisk * 0.25));

  const fed = macroDrivers?.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = macroDrivers?.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = macroDrivers?.credit || {};
  const creditStatus = credit.sourceStatus || {};

  let fedAssetRisk = null;
  if (Number.isFinite(fed.walcl4wChange) && fedStatus.walcl !== 'missing') {
    fedAssetRisk = clamp((-fed.walcl4wChange) * 18);
  }
  let onRrpRisk = null;
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing') {
    const cfg = R.macroDrivers.fedLiquidity;
    if (fed.onRrp < cfg.onRrpCriticalThreshold) onRrpRisk = 85;
    else if (fed.onRrp < cfg.onRrpTightThreshold) onRrpRisk = 55;
    else if (Number.isFinite(fed.onRrpWeekChange) && fed.onRrpWeekChange <= cfg.onRrpWeekRapidDropPct) onRrpRisk = 45;
    else onRrpRisk = 15;
  }

  let curveInversionRisk = null;
  let curveSteepeningRisk = null;
  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing') {
    if (curve.t10y2y < 0) curveInversionRisk = clamp(Math.abs(curve.t10y2y) * 80);
    else curveInversionRisk = 10;
    curveSteepeningRisk = curve.steepeningAlert ? 80 : clamp(Number.isFinite(curve.t10y2yWeekChange) ? curve.t10y2yWeekChange * 30 : 0);
  }

  let igOasRisk = null;
  let nimPressureRisk = null;
  let reservePressure = null;
  if (Number.isFinite(credit.igOas) && creditStatus.igOas !== 'missing') {
    const cfg = R.macroDrivers.credit;
    if (credit.igOas >= cfg.igOasCriticalThreshold) igOasRisk = 90;
    else if (credit.igOas >= cfg.igOasStressThreshold) igOasRisk = 70;
    else if (credit.igOas >= cfg.igOasWatchThreshold) igOasRisk = 45;
    else igOasRisk = 20;
  }
  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing') {
    nimPressureRisk = curve.t10y2y < -0.5 ? 75 : curve.t10y2y < 0 ? 50 : 20;
  }
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing') {
    const cfg = R.macroDrivers.fedLiquidity;
    reservePressure = fed.onRrp < cfg.onRrpCriticalThreshold ? 85
      : fed.onRrp < cfg.onRrpTightThreshold ? 50
      : 15;
  }

  const sw = R.moduleSubWeights;
  const weightedAvg = (entries) => {
    let wSum = 0;
    let vSum = 0;
    for (const [val, w] of entries) {
      if (Number.isFinite(val) && Number.isFinite(w)) {
        vSum += val * w;
        wSum += w;
      }
    }
    return wSum > 0 ? vSum / wSum : null;
  };

  const newLiquidity = clamp(
    weightedAvg([
      [baseLiquidity, sw.liquidity.baseWeight],
      [fedAssetRisk, sw.liquidity.fedAssetWeight],
      [onRrpRisk, sw.liquidity.onRrpWeight]
    ]) ?? baseLiquidity
  );
  const newDebt = clamp(
    weightedAvg([
      [baseDebt, sw.debt.baseWeight],
      [curveInversionRisk, sw.debt.curveInversionWeight],
      [curveSteepeningRisk, sw.debt.curveSteepeningWeight]
    ]) ?? baseDebt
  );
  const newBanking = clamp(
    weightedAvg([
      [baseBanking, sw.banking.baseWeight],
      [igOasRisk, sw.banking.igOasWeight],
      [nimPressureRisk, sw.banking.nimPressureWeight],
      [reservePressure, sw.banking.reservePressureWeight]
    ]) ?? baseBanking
  );

  const modules = {
    geopolitical: clamp((oilRisk * 0.72) + (vixRisk * 0.28)),
    energy: clamp((oilRisk * 0.82) + Math.max(0, rt.changes?.brent1d || 0) * 2),
    inflation: clamp((inflationRisk * 0.72) + (realRisk * 0.08)),
    liquidity: newLiquidity,
    debt: newDebt,
    banking: newBanking
  };
  const mw = R.moduleWeights;
  const baseScore = clamp(
    modules.geopolitical * mw.geopolitical +
    modules.energy * mw.energy +
    modules.inflation * mw.inflation +
    modules.liquidity * mw.liquidity +
    modules.debt * mw.debt +
    modules.banking * mw.banking
  );
  const tailRiskOverlay = buildTailRiskOverlay({
    baseScore,
    modules,
    oilRisk,
    inflationRisk,
    vixRisk,
    hyRisk,
    rateRisk,
    dollarRisk,
    baseLiquidity,
    bankingRisk: newBanking,
    curveInversionRisk,
    nimPressureRisk
  });
  const transportShockScoringImpact = buildTransportShockScoringImpact(
    macroDrivers?.energyTransport,
    tailRiskOverlay.adjustedScore
  );
  const score = transportShockScoringImpact.applied
    ? transportShockScoringImpact.scoreAfterTransport
    : tailRiskOverlay.adjustedScore;
  return {
    modules, score,
    oilRisk, dollarRisk, hyRisk, vixRisk, rateRisk, realRisk, inflationRisk, spxRisk,
    brent, dxy, vix, hy, us10y, real10y, breakeven, spx, gold,
    fedAssetRisk, onRrpRisk, curveInversionRisk, curveSteepeningRisk,
    igOasRisk, nimPressureRisk, reservePressure,
    riskCalibration: {
      dxyBroadDollar: dxyRiskCalibration
    },
    tailRiskOverlay,
    transportShockScoringImpact
  };
}

function regimeProb(score, risk) {
  const raw = {
    disinflationaryGrowth: Math.max(1, 120 - risk.inflationRisk - risk.hyRisk),
    liquidityBull: Math.max(1, 115 - risk.dollarRisk - risk.vixRisk),
    stagflationShock: Math.max(1, risk.oilRisk + risk.inflationRisk),
    crisisLiquiditySqueeze: Math.max(1, risk.hyRisk + risk.dollarRisk + risk.vixRisk),
    monetaryDebasement: Math.max(1, risk.inflationRisk + (100 - risk.realRisk)),
    deflationaryBust: Math.max(1, risk.hyRisk + risk.vixRisk + risk.spxRisk)
  };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, clamp(v / sum * 100)]));
  probs.stagflationShock = clamp(100 - (probs.disinflationaryGrowth + probs.liquidityBull + probs.crisisLiquiditySqueeze + probs.monetaryDebasement + probs.deflationaryBust));
  return probs;
}

function regimeLabel(probs) {
  const labels = {
    disinflationaryGrowth: '通胀回落增长',
    liquidityBull: '流动性多头',
    stagflationShock: '滞胀冲击',
    crisisLiquiditySqueeze: '流动性偏紧',
    monetaryDebasement: '货币贬值',
    deflationaryBust: '通缩衰退'
  };
  return labels[Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0]];
}

// v27 结构性门控分层判定（严格分层：红灯需要更苛刻条件）
function evaluateStructuralGating(macroDrivers) {
  const cfg = R.macroDrivers;
  const fed = macroDrivers?.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = macroDrivers?.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = macroDrivers?.credit || {};
  const creditStatus = credit.sourceStatus || {};
  const rateVol = macroDrivers?.rateVol || {};
  const rateVolStatus = rateVol.sourceStatus || {};

  const t10y2y = (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing') ? curve.t10y2y : null;
  const onRrp = (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing') ? fed.onRrp : null;
  const walcl4w = (Number.isFinite(fed.walcl4wChange) && fedStatus.walcl !== 'missing') ? fed.walcl4wChange : null;
  const igOas = (Number.isFinite(credit.igOas) && creditStatus.igOas !== 'missing') ? credit.igOas : null;
  const move = (Number.isFinite(rateVol.move) && (rateVolStatus.move === 'live' || rateVolStatus.move === 'fallback')) ? rateVol.move : null;

  // === 红灯：严格阈值，需要严重双压或单项极端值 ===
  // 红灯触发条件1：曲线严重倒挂（< -0.8）且 IG 告警级以上（>= critical 2.0%）
  const redCurveCreditDouble = (t10y2y !== null && t10y2y <= cfg.curve.severeInversionThreshold)
    && (igOas !== null && igOas >= cfg.credit.igOasCriticalThreshold);
  // 红灯触发条件2：ON RRP 低于 onRrpCriticalThreshold / 2（单项极端，约 500 亿美元）
  const onRrpCatastrophic = onRrp !== null && onRrp < (cfg.fedLiquidity.onRrpCriticalThreshold / 2);
  // 红灯触发条件3：MOVE 债券波动率危机（>= 160）单项 —— 利率市场失灵可独立翻红
  const moveCrisis = move !== null && move >= cfg.rateVol.crisisThreshold;
  const structuralRed = redCurveCreditDouble || onRrpCatastrophic || moveCrisis;

  // === 黄灯：较宽阈值 ===
  // 黄灯触发条件1：曲线深度倒挂（<= -0.5）且美联储快速缩表（4周 <= -1%）
  const yellowCurveFedDouble = (t10y2y !== null && t10y2y <= cfg.curve.deepInversionThreshold)
    && (walcl4w !== null && walcl4w <= cfg.fedLiquidity.walcl4wContractionAlert);
  // 黄灯触发条件2：IG OAS 进入应力区（>= 1.5%）
  const yellowIgWatch = igOas !== null && igOas >= cfg.credit.igOasWatchThreshold;
  // 黄灯触发条件3：ON RRP 告急（< 1000 亿美元）单项
  const yellowOnRrpCritical = onRrp !== null && onRrp < cfg.fedLiquidity.onRrpCriticalThreshold;
  // 黄灯触发条件4：曲线深度倒挂单项（<= -0.5）
  const yellowCurveDeep = t10y2y !== null && t10y2y <= cfg.curve.deepInversionThreshold;
  // 黄灯触发条件5：MOVE 债券波动率应激（>= 140）单项
  const yellowMoveStress = move !== null && move >= cfg.rateVol.stressThreshold;
  const structuralYellow = yellowCurveFedDouble || yellowIgWatch || yellowOnRrpCritical || yellowCurveDeep || yellowMoveStress;

  // 记录触发原因（用于文案）
  const redReasons = [];
  if (redCurveCreditDouble) redReasons.push('曲线严重倒挂且投资级信用告警');
  if (onRrpCatastrophic) redReasons.push('逆回购准备金临界告急');
  if (moveCrisis) redReasons.push('债券波动率危机（MOVE 利率市场失灵）');
  const yellowReasons = [];
  if (yellowCurveFedDouble) yellowReasons.push('曲线深度倒挂叠加美联储缩表');
  if (yellowIgWatch) yellowReasons.push('投资级信用利差进入应力区');
  if (yellowOnRrpCritical) yellowReasons.push('逆回购余额告急');
  if (yellowCurveDeep) yellowReasons.push('曲线深度倒挂');
  if (yellowMoveStress) yellowReasons.push('债券波动率进入应激区（MOVE）');

  return {
    structuralRed,
    structuralYellow,
    redReasons,
    yellowReasons
  };
}

function lockEngine(score, risk, rt, gatingResult) {
  const el = R.executionLock;
  const criticalDown = (rt.criticalMissing ?? 0) >= el.red.criticalMissingThreshold || (rt.cacheOnly ?? false);

  const baseRed = criticalDown
    || score >= el.red.scoreThreshold
    || risk.brent >= el.red.brentThreshold
    || risk.hy >= el.red.hyThreshold
    || risk.vix >= el.red.vixThreshold;

  const baseYellow = score >= el.yellow.scoreThreshold
    || risk.brent >= el.yellow.brentThreshold
    || risk.hy >= el.yellow.hyThreshold
    || risk.vix >= el.yellow.vixThreshold;

  const structurallyTriggered = (!baseRed && gatingResult.structuralRed) || (!baseYellow && gatingResult.structuralYellow && !baseRed && !gatingResult.structuralRed);

  if (baseRed || gatingResult.structuralRed) {
    const structDesc = gatingResult.structuralRed && !baseRed
      ? `结构性双压触发红灯（${gatingResult.redReasons.join('、')}）。`
      : '';
    return {
      level: 'red',
      levelLabel: '红灯 / 禁止新增',
      title: '今天禁止主动加仓，只允许减仓与恢复防御层',
      description: `${structDesc}系统检测到高压风险组合，执行引擎已锁定为红灯。任何新增风险仓位均被禁止，只允许减仓、防守和补充现金。`.trim(),
      gross: '38%', cash: '35%', riskBudget: '30%',
      allow: ['允许减仓风险资产。', '允许补充美元/短票与现金。', '允许把黄金对冲恢复到上限。'],
      block: ['禁止新增股票与高波动仓位。', '禁止盘中追涨。', '禁止主观覆盖系统阈值。'],
      mandatory: ['若总仓位高于 42%，必须先减到 38% 附近。', '若高波动资产 > 2%，立即降回 2% 以下。', '若现金缓冲 < 30%，立即补回。'],
      actionText: '执行引擎锁定：禁止新增，只允许减仓与防守恢复。',
      structurallyTriggered: gatingResult.structuralRed && !baseRed
    };
  }
  if (baseYellow || gatingResult.structuralYellow) {
    const structDesc = gatingResult.structuralYellow && !baseYellow
      ? `结构性压力触发黄灯（${gatingResult.yellowReasons.join('、')}）。`
      : '';
    return {
      level: 'yellow',
      levelLabel: '黄灯 / 仅允许微调',
      title: '今天不能主动加风险，只允许对齐目标仓位与防守再平衡',
      description: `${structDesc}风险尚未解除，执行引擎只允许微调。允许围绕目标仓位做再平衡，但禁止新增进攻性仓位。`.trim(),
      gross: '48%', cash: '27%', riskBudget: '40%',
      allow: ['允许把总仓位向 48% 靠拢。', '允许维持能源、美元/短票、黄金对冲层。', '允许保留防御型股票观察仓。'],
      block: ['禁止新增高波动与久期进攻仓位。', '禁止因为单日反弹而加仓。', '禁止无视执行状态灯。'],
      mandatory: ['若总仓位高于 53%，先减仓。', '若高波动资产 > 3%，降回上限以内。', '若现金缓冲 < 25%，恢复到安全区间。'],
      actionText: '执行引擎锁定：只允许微调，不允许扩大风险暴露。',
      structurallyTriggered: gatingResult.structuralYellow && !baseYellow
    };
  }
  return {
    level: 'green',
    levelLabel: '绿灯 / 允许分批进攻',
    title: '今天允许小幅加仓，但必须按纪律分批执行',
    description: '风险组合回到可控区，执行引擎允许提高风险暴露，但必须分批、限额，并保留最低现金缓冲。',
    gross: '58%', cash: '20%', riskBudget: '50%',
    allow: ['允许分三笔内提高总仓位。', '允许增加质量权益和部分成长观察仓。', '允许降低部分美元/短票。'],
    block: ['禁止一次性打满仓位。', '禁止在单日大涨后追高。', '禁止取消防守底仓。'],
    mandatory: ['任何新增仓位都必须分批完成。', '若状态灯重新转黄，次日停止加仓。', '若周回撤超过 -3%，切回黄灯纪律。'],
    actionText: '执行引擎开放：允许分批进攻，但不得破坏现金缓冲与止损纪律。',
    structurallyTriggered: false
  };
}

function targetAllocations(lock) {
  if (lock.level === 'red') {
    return [
      { asset: '美元 / 短票', target: '核心1', weight: '24%', reason: '融资与信用压力阶段的首要防御层。' },
      { asset: '现金', target: '缓冲层', weight: '35%', reason: '执行引擎红灯，现金缓冲必须充足。' },
      { asset: '黄金', target: '对冲', weight: '12%', reason: '用于对冲尾部风险和政策不确定性。' },
      { asset: '原油 / 能源', target: '防守受益', weight: '12%', reason: '油价偏高时继续保留。' },
      { asset: '股票（防御）', target: '观察仓', weight: '5%', reason: '仅保留最低防御仓。' }
    ];
  }
  if (lock.level === 'yellow') {
    return [
      { asset: '原油 / 能源', target: '核心1', weight: '20%', reason: '主链条仍偏向能源与通胀输入。' },
      { asset: '美元 / 短票', target: '核心2', weight: '18%', reason: '流动性偏紧阶段的稳定防御层。' },
      { asset: '黄金', target: '对冲', weight: '10%', reason: '对冲政策与通胀不确定性。' },
      { asset: '股票（防御板块）', target: '观察仓', weight: '8%', reason: '只保留低波动、现金流型权益。' },
      { asset: '高波动资产', target: '限制仓', weight: '0%-3%', reason: '不允许成为进攻主仓。' }
    ];
  }
  return [
    { asset: '股票（质量+防御）', target: '核心1', weight: '24%', reason: '风险回到可控区后恢复权益暴露。' },
    { asset: '原油 / 能源', target: '核心2', weight: '16%', reason: '保留主链条防守属性。' },
    { asset: '黄金', target: '对冲', weight: '8%', reason: '保留尾部对冲。' },
    { asset: '美元 / 短票', target: '缓冲层', weight: '12%', reason: '保留机动空间。' }
  ];
}

function getTransmissionNodeKey(node) {
  return node?.id || node?.key || node?.label || null;
}

function buildTransmissionSnapshot(chain) {
  const nodes = Array.isArray(chain?.nodes) ? chain.nodes : [];
  return {
    nodes: nodes.map((node) => ({
      key: getTransmissionNodeKey(node),
      label: node?.label || getTransmissionNodeKey(node),
      score: Number.isFinite(node?.score) ? node.score : null
    })).filter((node) => node.key)
  };
}

function getTransmissionSnapshotNodes(entry) {
  if (Array.isArray(entry?.transmissionSnapshot?.nodes)) return entry.transmissionSnapshot.nodes;
  if (Array.isArray(entry?.transmissionChain?.nodes)) return entry.transmissionChain.nodes;
  return null;
}

function findLatestTransmissionSnapshotNodes(historyEntries) {
  if (!Array.isArray(historyEntries)) return null;
  for (let i = historyEntries.length - 1; i >= 0; i -= 1) {
    const nodes = getTransmissionSnapshotNodes(historyEntries[i]);
    if (nodes) return nodes;
  }
  return null;
}

function resolvePreviousTransmissionSource(previousData, previousHistoryFull, previousHistory) {
  if (Array.isArray(previousData?.transmissionChain?.nodes)) {
    return { source: 'previous-radar-data', nodes: previousData.transmissionChain.nodes };
  }
  const fullNodes = findLatestTransmissionSnapshotNodes(previousHistoryFull);
  if (fullNodes) return { source: 'radar-history-full', nodes: fullNodes };
  const historyNodes = findLatestTransmissionSnapshotNodes(previousHistory);
  if (historyNodes) return { source: 'radar-history', nodes: historyNodes };
  return { source: 'none', nodes: [] };
}

function indexTransmissionScores(nodes) {
  const scores = new Map();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const key = getTransmissionNodeKey(node);
    const score = Number(node?.score);
    if (key && Number.isFinite(score)) scores.set(key, score);
  }
  return scores;
}

function applyTransmissionDeltas(chain, previousSource) {
  const currentChain = chain && typeof chain === 'object' ? chain : {};
  const nodes = Array.isArray(currentChain.nodes) ? currentChain.nodes : [];
  const previousScores = indexTransmissionScores(previousSource.nodes);
  let matchedNodes = 0;
  const nextNodes = nodes.map((node) => {
    const key = getTransmissionNodeKey(node);
    const currentScore = Number(node?.score);
    const previousScore = key ? previousScores.get(key) : undefined;
    const hasDelta = Number.isFinite(currentScore) && Number.isFinite(previousScore);
    if (hasDelta) matchedNodes += 1;
    return {
      ...node,
      delta: hasDelta ? Math.round(currentScore - previousScore) : null
    };
  });
  return {
    chain: { ...currentChain, nodes: nextNodes },
    meta: {
      source: previousSource.source,
      matchedNodes,
      totalNodes: nodes.length
    }
  };
}

function mergeWorldOrderStress(entry, worldOrderStress, previousEntry = null) {
  if (worldOrderStress) return { ...entry, worldOrderStress };
  if (previousEntry?.worldOrderStress) return { ...entry, worldOrderStress: previousEntry.worldOrderStress };
  return entry;
}

function appendHistory(prev, score, transmissionSnapshot = null, worldOrderStress = null) {
  const today = isoNow.slice(0, 10);
  const history = Array.isArray(prev) ? [...prev] : [];
  if (history.length && history[history.length - 1].date === today) {
    const previousEntry = history[history.length - 1];
    const nextEntry = {
      ...previousEntry,
      date: today,
      score
    };
    if (transmissionSnapshot) nextEntry.transmissionSnapshot = transmissionSnapshot;
    history[history.length - 1] = mergeWorldOrderStress(nextEntry, worldOrderStress, previousEntry);
  } else {
    const entry = mergeWorldOrderStress({
      date: today,
      score,
      ...(transmissionSnapshot ? { transmissionSnapshot } : {})
    }, worldOrderStress);
    history.push(entry);
  }
  return history.slice(-90);
}

function appendHistoryFull(prevFull, risk, lock, macro, macroDrivers, transmissionSnapshot = null, worldOrderStress = null) {
  const today = isoNow.slice(0, 10);
  const full = Array.isArray(prevFull) ? [...prevFull] : [];
  const previousEntry = full.length && full[full.length - 1].date === today ? full[full.length - 1] : null;
  const privateCreditProxy = macroDrivers?.privateCreditProxy || {};
  const credit = macroDrivers?.credit || {};
  const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);
  const privateCreditHyOas = Number.isFinite(privateCreditProxy.hyOas) ? privateCreditProxy.hyOas : credit.hyOas;
  const privateCreditIgOas = Number.isFinite(privateCreditProxy.igOas) ? privateCreditProxy.igOas : credit.igOas;
  const entry = mergeWorldOrderStress({
    date: today,
    score: risk.score,
    lock: lock.level,
    modules: { ...risk.modules },
    macro,
    brent: risk.brent,
    vix: risk.vix,
    dxy: risk.dxy,
    hyOas: risk.hy,
    spx: finiteOrNull(realtime?.values?.spx),
    us10y: risk.us10y,
    real10y: risk.real10y,
    t10y2y: macroDrivers?.curve?.t10y2y ?? null,
    igOas: macroDrivers?.credit?.igOas ?? null,
    walcl: macroDrivers?.fedLiquidity?.walcl ?? null,
    onRrp: macroDrivers?.fedLiquidity?.onRrp ?? null,
    move: macroDrivers?.rateVol?.move ?? null,
    moveAgeDays: macroDrivers?.rateVol?.moveAgeDays ?? null,
    moveSourceStatus: macroDrivers?.rateVol?.sourceStatus?.move ?? null,
    privateCredit6: {
      bdcEtfPrice: finiteOrNull(privateCreditProxy.bdcEtfPrice),
      pbdcEtfPrice: finiteOrNull(privateCreditProxy.pbdcEtfPrice),
      seniorLoanEtfPrice: finiteOrNull(privateCreditProxy.seniorLoanEtfPrice),
      intervalFundNavPrice: finiteOrNull(privateCreditProxy.intervalFundNavPrice),
      hyOas: finiteOrNull(privateCreditHyOas),
      igOas: finiteOrNull(privateCreditIgOas)
    },
    ...(transmissionSnapshot ? { transmissionSnapshot } : {})
  }, worldOrderStress, previousEntry);
  if (previousEntry) {
    full[full.length - 1] = entry;
  } else {
    full.push(entry);
  }
  return full;
}

function roundHistoryWindowNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function historyWindowRows(historyFull, valueSelector) {
  return (Array.isArray(historyFull) ? historyFull : [])
    .map((entry) => {
      const value = valueSelector(entry);
      return {
        date: typeof entry?.date === 'string' ? entry.date : null,
        value: Number.isFinite(value) ? value : null
      };
    })
    .filter((row) => row.date && Number.isFinite(row.value));
}

function historyWindowStatus(observations, targetObservations) {
  if (!Number.isFinite(observations) || observations <= 0) return 'missing';
  return observations >= targetObservations ? 'ready' : 'partial';
}

function historyWindowMeta(rows, targetObservations, windowLabel) {
  const observations = rows.length;
  return {
    windowStatus: historyWindowStatus(observations, targetObservations),
    observations,
    targetObservations,
    windowLabel,
    firstDate: rows[0]?.date ?? null,
    lastDate: rows[rows.length - 1]?.date ?? null
  };
}

function findHistoryRowAtLeastDaysAgo(rows, days) {
  const latest = rows[rows.length - 1];
  if (!latest?.date) return null;
  const targetTime = Date.parse(`${latest.date}T00:00:00Z`) - days * 24 * 3600 * 1000;
  let best = null;
  for (const row of rows) {
    const time = Date.parse(`${row.date}T00:00:00Z`);
    if (Number.isFinite(time) && time <= targetTime) {
      if (!best || time > Date.parse(`${best.date}T00:00:00Z`)) best = row;
    }
  }
  return best;
}

function buildHyOasWoW(historyFull) {
  const targetObservations = 7;
  const rows = historyWindowRows(historyFull, (entry) => entry?.hyOas);
  const latest = rows[rows.length - 1] || null;
  const prior = findHistoryRowAtLeastDaysAgo(rows, 7);
  const hasChange = latest && prior && prior.value !== 0;
  const observations = Math.min(rows.length, targetObservations);
  return {
    changeBp: hasChange ? roundHistoryWindowNumber((latest.value - prior.value) * 100, 1) : null,
    changePct: hasChange ? roundHistoryWindowNumber((latest.value - prior.value) / prior.value, 4) : null,
    windowStatus: hasChange ? 'ready' : historyWindowStatus(observations, targetObservations),
    priorDate: prior?.date ?? null,
    lastDate: latest?.date ?? null,
    observations,
    targetObservations,
    windowLabel: '周度变化'
  };
}

function buildHighWindow(historyFull, key, targetObservations, windowLabel) {
  const rows = historyWindowRows(historyFull, (entry) => entry?.[key]).slice(-targetObservations);
  const meta = historyWindowMeta(rows, targetObservations, windowLabel);
  const values = rows.map((row) => row.value).filter(Number.isFinite);
  return {
    value: values.length ? roundHistoryWindowNumber(Math.max(...values), key === 'spx' ? 2 : 4) : null,
    ...meta
  };
}

function componentZScore(rows, targetObservations) {
  const windowRows = rows.slice(-targetObservations);
  if (windowRows.length < targetObservations) {
    return { z: null, observations: windowRows.length };
  }
  const values = windowRows.map((row) => row.value);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredDeviationSum = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0);
  const stdDev = Math.sqrt(squaredDeviationSum / (values.length - 1));
  if (!Number.isFinite(stdDev)) return { z: null, observations: windowRows.length };
  if (stdDev === 0) return { z: 0, observations: windowRows.length };
  return {
    z: roundHistoryWindowNumber((values[values.length - 1] - mean) / stdDev, 4),
    observations: windowRows.length
  };
}

function buildPrivateCreditStressZScore(historyFull) {
  const targetObservations = 84;
  const componentDefs = [
    { key: 'bdcEtfPrice', direction: '-z' },
    { key: 'pbdcEtfPrice', direction: '-z' },
    { key: 'seniorLoanEtfPrice', direction: '-z' },
    { key: 'intervalFundNavPrice', direction: '-z' },
    { key: 'hyOas', direction: '+z' },
    { key: 'igOas', direction: '+z' }
  ];
  const components = componentDefs.map((definition) => {
    const rows = historyWindowRows(historyFull, (entry) => entry?.privateCredit6?.[definition.key]);
    const { z, observations } = componentZScore(rows, targetObservations);
    const stressZ = Number.isFinite(z)
      ? roundHistoryWindowNumber(definition.direction === '-z' ? -z : z, 4)
      : null;
    return {
      key: definition.key,
      z,
      stressZ,
      direction: definition.direction,
      observations
    };
  });
  const observations = components.length
    ? Math.min(...components.map((component) => component.observations))
    : 0;
  const stressValues = components.map((component) => component.stressZ).filter(Number.isFinite);
  const headline = stressValues.length === componentDefs.length
    ? roundHistoryWindowNumber(avg(stressValues), 4)
    : null;
  return {
    headline,
    components,
    windowStatus: headline !== null
      ? 'ready'
      : historyWindowStatus(observations, targetObservations),
    observations,
    targetObservations,
    windowLabel: '12周'
  };
}

function buildHistoryWindowFields(historyFull) {
  return {
    hyOasWoW: buildHyOasWoW(historyFull),
    dxy12wHigh: buildHighWindow(historyFull, 'dxy', 84, '12周'),
    privateCreditStressZScore: buildPrivateCreditStressZScore(historyFull),
    spx52wHigh: buildHighWindow(historyFull, 'spx', 364, '52周')
  };
}

function buildVersionSemantics() {
  return {
    releaseVersion: RELEASE_VERSION,
    dataContractVersion: DATA_CONTRACT_VERSION,
    decisionModelContractVersion: DATA_CONTRACT_VERSION,
    note: 'releaseVersion drives user-visible release display; version remains the legacy data contract marker.'
  };
}

async function buildFallback() {
  const next = structuredClone(prevData);
  next.version = DATA_CONTRACT_VERSION;
  next.releaseVersion = RELEASE_VERSION;
  next.versionSemantics = buildVersionSemantics();
  next.updatedAt = isoNow;
  next.decisionLine = '实时快变量暂不可用，系统沿用上次有效慢变量结构，但保留今日更新时间戳。';
  next.summary = `${RELEASE_VERSION} 日构建已退回到上次有效慢变量结构。`;
  const prevInputs = (prevData && typeof prevData.displayInputsBaseline === 'object' && prevData.displayInputsBaseline)
    ? prevData.displayInputsBaseline
    : null;
  const normFinite = (value) => (Number.isFinite(value) ? value : null);
  next.displayInputsBaseline = {
    brent: normFinite(prevInputs?.brent),
    dxy: normFinite(prevInputs?.dxy),
    vix: normFinite(prevInputs?.vix),
    hyOas: normFinite(prevInputs?.hyOas),
    us10y: normFinite(prevInputs?.us10y),
    real10y: normFinite(prevInputs?.real10y),
    breakeven10y: normFinite(prevInputs?.breakeven10y),
    gold: normFinite(prevInputs?.gold),
    spx: normFinite(prevInputs?.spx),
    asOf: normalizeIsoOrNull(prevInputs?.asOf) ?? normalizeIsoOrNull(prevData?.updatedAt) ?? null
  };
  next.recovery = {
    degradedMode: true,
    safeOutput: true,
    lastRun: isoNow,
    notes: ['日构建未拿到可用实时快照，已回退到上次有效结果。']
  };
  next.dailyRealtimeInput = buildDailyRealtimeInput(realtime);
  next.dailyBrief = prevData.dailyBrief && typeof prevData.dailyBrief === 'object'
    ? { ...prevData.dailyBrief, generatedAt: isoNow }
    : buildUnavailableDailyBrief(isoNow);
  next.aiInterpretationLayer = prevData.aiInterpretationLayer && typeof prevData.aiInterpretationLayer === 'object'
    ? { ...prevData.aiInterpretationLayer, generatedAt: isoNow }
    : buildAiInterpretationLayer(next);
  preserveExternalAiInterpretationLayer(next);

  const displayMacro = await fetchDisplayOnlyMacroDrivers(prevData?.macroDrivers || {});
  next.macroDrivers = { ...(next.macroDrivers || {}), ...displayMacro };
  return { data: next, history: prevHistory, historyFull: prevHistoryFull };
}

async function build() {
  if (!canUseRealtimePayloadValues(realtime)) return await buildFallback();

  const hyOasLive = Number(realtime.values?.hyOas);
  const macroDrivers = await fetchMacroDrivers(prevData, Number.isFinite(hyOasLive) ? hyOasLive : null);
  const allMacroMissing = isAllStructuralSourcesMissing(macroDrivers);
  const activeSignals = activeStructuralSignals(macroDrivers);
  const gatingResult = evaluateStructuralGating(macroDrivers);
  const mainScoreSourceResolution = await resolveMainScoreRuntimeSource(realtime, macroDrivers);
  const scoringRealtime = mainScoreSourceResolution.realtimePayload;
  const sourceModeLabel = SOURCE_MODE_CN[scoringRealtime.sourceMode] || scoringRealtime.sourceMode || '--';
  const hyOasScoreInput = Number(scoringRealtime.values?.hyOas);

  const risk = deriveRisk(scoringRealtime, macroDrivers);
  const previousTransmissionSource = resolvePreviousTransmissionSource(prevData, prevHistoryFull, prevHistory);
  const transmissionDeltaResult = applyTransmissionDeltas(prevData.transmissionChain || {}, previousTransmissionSource);
  const transmissionSnapshot = buildTransmissionSnapshot(transmissionDeltaResult.chain);
  const history = appendHistory(prevHistory, risk.score, transmissionSnapshot, worldOrderStressHistorySnapshot);
  const scoreChange1d = history.length >= 2 ? risk.score - history[history.length - 2].score : 0;
  const scoreChange7d = history.length >= 8 ? risk.score - history[history.length - 8].score : 0;
  const scoreChange30d = history.length >= 30 ? risk.score - history[Math.max(0, history.length - 30)].score : scoreChange7d;
  const avg30d = clamp(avg(history.slice(-30).map(x => x.score)));
  const peak30d = Math.max(...history.slice(-30).map(x => x.score));
  const trough30d = Math.min(...history.slice(-30).map(x => x.score));
  const probs = regimeProb(risk.score, risk);
  const macro = regimeLabel(probs);
  const phase = risk.modules.liquidity >= 70 ? '流动性偏紧' : risk.modules.energy >= 75 ? '通胀冲击' : '风险缓和';
  const lock = lockEngine(risk.score, risk, scoringRealtime, gatingResult);
  const allocs = targetAllocations(lock);

  const topRisks = [
    `布伦特 ${risk.brent.toFixed(1)} 美元，能源链条仍在传导。`,
    `广义美元指数 ${risk.dxy.toFixed(2)}，融资环境尚未明显放松。`,
    `高收益利差 ${risk.hy.toFixed(2)}%，信用风险${risk.hy >= 4 ? '偏紧' : '可控但需观察'}。`,
    `10年期美债 ${risk.us10y.toFixed(2)}%，实际利率 ${risk.real10y.toFixed(2)}%。`
  ];

  const sortedModules = Object.entries(risk.modules).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const signalDesc = allMacroMissing
    ? '结构信号数据源当前全部不可用，结构门控已降级。'
    : (activeSignals.length
      ? `结构信号激活：${activeSignals.map(s => `${s.label}（${s.detail}）`).join('；')}。`
      : '无结构信号激活。');

  const reliabilityNote = activeSignals.some(s => s.reliability === 'fallback')
    ? '（部分结构信号基于回退数据）'
    : '';

  const stateReasonCN = `${lock.levelLabel}，风险分数 ${risk.score}。${signalDesc}${reliabilityNote} 主导模块：${sortedModules.map(([k]) => MODULE_LABELS_CN[k]).join('、')}。`;

  const structuralShift = structuralBandShift(activeSignals);
  const guidanceSuffix = activeSignals.length
    ? ` 结构性约束：${activeSignals.map(s => s.label).join('、')}，仓位需额外保守。`
    : '';

  const cashGuidanceText = `目标现金缓冲：${lock.cash}。${guidanceSuffix}`.trim();
  const newExposurePolicyText = (lock.level === 'green'
    ? '允许分批提高风险暴露，单日净加仓不超过总资产 5%。'
    : lock.level === 'yellow'
      ? '仅允许微调，禁止新增进攻性仓位。'
      : '禁止新增，只允许减仓与防守。') + guidanceSuffix;

  const baseBandByLock = lock.level === 'red' ? { lo: 20, hi: 40 } : lock.level === 'yellow' ? { lo: 38, hi: 53 } : { lo: 55, hi: 70 };
  const shiftedLo = clampRange(Math.round(baseBandByLock.lo + structuralShift / 2), 0, 90);
  const shiftedHi = clampRange(Math.round(baseBandByLock.hi + structuralShift / 2), 10, 100);
  const totalExposureBandCN = `${shiftedLo}%-${shiftedHi}%`;

  // recovery.notes 构建 —— 若结构信号数据源全不可用则追加中文降级说明
  const recoveryNotes = scoringRealtime.notes && scoringRealtime.notes.length
    ? [...scoringRealtime.notes]
    : [`${RELEASE_VERSION} 慢变量已由最新实时快照与结构性数据重算。`];
  if (allMacroMissing) {
    recoveryNotes.push('结构信号数据源当前全部不可用，兼容结构门控已降级。');
  }

  const toFiniteOrNull = (value) => (Number.isFinite(value) ? value : null);
  const displayInputsBaseline = {
    brent: toFiniteOrNull(risk.brent),
    dxy: toFiniteOrNull(risk.dxy),
    vix: toFiniteOrNull(risk.vix),
    hyOas: toFiniteOrNull(risk.hy),
    us10y: toFiniteOrNull(risk.us10y),
    real10y: toFiniteOrNull(risk.real10y),
    breakeven10y: toFiniteOrNull(risk.breakeven),
    gold: toFiniteOrNull(risk.gold),
    spx: toFiniteOrNull(risk.spx),
    asOf: isoNow
  };
  const confidenceScore = clamp(100 - (scoringRealtime.criticalMissing ?? 0) * R.confidenceScoring.criticalMissingPenalty - (scoringRealtime.fallbackCount ?? 0) * R.confidenceScoring.fallbackPenalty);
  const dailyBrief = buildDailyBrief({
    risk,
    realtimePayload: scoringRealtime,
    macroState: macro,
    phase,
    displayInputsBaseline,
    topRisks,
    activeSignals,
    allMacroMissing,
    confidenceScore,
    generatedAt: isoNow
  });
  const divergenceLayer = buildDivergenceLayer({
    risk,
    realtimePayload: scoringRealtime,
    displayInputsBaseline,
    macroDrivers,
    confidenceScore,
    generatedAt: isoNow
  });
  const [ulsdData, brentFuturesCurve, brentFuturesPriceCurve, iceBrentFuturesPriceCurve, eiaBrentSpotProxy] = await Promise.all([
    resolveUlsd(prevData?.brentPricingLayer),
    resolveBrentFuturesCurve(prevData?.brentPricingLayer),
    resolveBrentFuturesPriceCurve(prevData?.brentPricingLayer),
    resolveIceBrentFuturesPriceCurve(prevData?.brentPricingLayer),
    resolveEiaBrentSpotProxy(prevData?.brentPricingLayer)
  ]);
  const brentPricingLayer = buildBrentPricingLayer({
    realtimePayload: scoringRealtime,
    displayInputsBaseline,
    dailyRealtimeInput: buildDailyRealtimeInput(scoringRealtime),
    ulsdData,
    futuresCurveData: brentFuturesCurve,
    futuresPriceCurveData: brentFuturesPriceCurve,
    iceFuturesPriceCurveData: iceBrentFuturesPriceCurve,
    eiaBrentSpotProxyData: eiaBrentSpotProxy
  });

  const data = {
    version: DATA_CONTRACT_VERSION,
    releaseVersion: RELEASE_VERSION,
    versionSemantics: buildVersionSemantics(),
    updatedAt: isoNow,
    dailyRealtimeInput: buildDailyRealtimeInput(scoringRealtime),
    mainScoreSourcePolicy: mainScoreSourceResolution.audit,
    dailyBrief,
    divergenceLayer,
    brentPricingLayer,
    score: risk.score,
    scoreChange1d,
    scoreChange7d,
    scoreChange30d,
    trendLabel: scoreChange7d > R.trendThresholds.risingThreshold ? '风险上升' : scoreChange7d < R.trendThresholds.fallingThreshold ? '风险回落' : '高位震荡偏紧',
    currentMacroRegime: macro,
    currentCrisisPhase: phase,
    nextCrisisPhase: phase === '流动性偏紧' ? '政策应对' : '风险缓和',
    transitionRisk: clamp(avg([risk.modules.liquidity, risk.hyRisk, risk.vixRisk])),
    confidenceScore,
    confidenceLevel: (scoringRealtime.cacheOnly ? '低' : scoringRealtime.degradedMode ? '中' : '高'),
    displayInputsBaseline,
    topRisks,
    decisionLine: `当前已进入 ${RELEASE_VERSION} 交易引擎模式：实时快变量${sourceModeLabel}，执行状态灯为${lock.levelLabel}。${activeSignals.length ? '已激活结构信号：' + activeSignals.map(s => s.label).join('、') + '。' : allMacroMissing ? '结构信号数据源暂不可用。' : ''}先看状态灯，再决定能不能动。`,
    summary: `${RELEASE_VERSION} 正根据混合实时架构输出交易引擎结论。最新快变量：布伦特 ${risk.brent.toFixed(1)}、广义美元指数 ${risk.dxy.toFixed(2)}、波动率 ${risk.vix.toFixed(2)}、高收益利差 ${risk.hy.toFixed(2)}%。`,
    modules: risk.modules,
    riskCalibration: risk.riskCalibration,
    tailRiskOverlay: risk.tailRiskOverlay,
    transportShockScoringImpact: risk.transportShockScoringImpact,
    moduleTrends: {
      geopolitical: clamp((scoringRealtime.changes?.brent1d ?? 0) * 2, -9, 9),
      energy: clamp((scoringRealtime.changes?.brent1d ?? 0) * 3, -9, 9),
      inflation: clamp((scoringRealtime.changes?.breakeven10y1d ?? 0) * 20, -9, 9),
      liquidity: clamp(((scoringRealtime.changes?.dxy1d ?? 0) * 8) + ((scoringRealtime.changes?.hyOas1d ?? 0) * 10), -9, 9),
      debt: clamp(((scoringRealtime.changes?.us10y1d ?? 0) + (scoringRealtime.changes?.real10y1d ?? 0)) * 20, -9, 9),
      banking: clamp((scoringRealtime.changes?.hyOas1d ?? 0) * 12, -9, 9)
    },
    regimeProbabilities: probs,
    phaseSignals: [
      `实时输入：布伦特 ${risk.brent.toFixed(1)} / 波动率 ${risk.vix.toFixed(2)} / 高收益利差 ${risk.hy.toFixed(2)}%。`,
      `利率输入：10年期 ${risk.us10y.toFixed(2)} / 实际利率 ${risk.real10y.toFixed(2)} / 盈亏平衡通胀 ${risk.breakeven.toFixed(2)}%。`,
      `快变量状态：${sourceModeLabel}，健康度 ${scoringRealtime.healthScore}。`
    ],
    macroDrivers: {
      fedLiquidity: macroDrivers.fedLiquidity,
      policyExpectations: macroDrivers.policyExpectations,
      curve: macroDrivers.curve,
      credit: {
        ...macroDrivers.credit,
        hyOas: Number.isFinite(hyOasScoreInput) ? hyOasScoreInput : null
      },
      consumer: macroDrivers.consumer,
      shippingFreight: macroDrivers.shippingFreight,
      employment: macroDrivers.employment,
      consumerRetail: macroDrivers.consumerRetail,
      commercialRealEstate: macroDrivers.commercialRealEstate,
      privateCreditProxy: macroDrivers.privateCreditProxy,
      worldEconomy: macroDrivers.worldEconomy,
      chinaEquity: macroDrivers.chinaEquity,
      inflationEnergy: macroDrivers.inflationEnergy,
      copperGold: macroDrivers.copperGold,
      chinaBond: macroDrivers.chinaBond,
      cfetsRmb: macroDrivers.cfetsRmb,
      chinaInflation: macroDrivers.chinaInflation,
      chinaPmi: macroDrivers.chinaPmi,
      euroVolatility: macroDrivers.euroVolatility,
      chinaPropertyPrice: macroDrivers.chinaPropertyPrice,
      chinaOmo: macroDrivers.chinaOmo,
      chinaTsf: macroDrivers.chinaTsf,
      chinaMlf: macroDrivers.chinaMlf,
      rateVol: macroDrivers.rateVol,
      energySpareCapacity: macroDrivers.energySpareCapacity,
      energyInventoryBalance: macroDrivers.energyInventoryBalance,
      energyTransport: macroDrivers.energyTransport,
      activeSignals: activeSignals.map(s => ({ key: s.key, label: s.label, detail: s.detail, reliability: s.reliability })),
      gatingEvaluation: {
        structuralRed: gatingResult.structuralRed,
        structuralYellow: gatingResult.structuralYellow,
        redReasons: gatingResult.redReasons,
        yellowReasons: gatingResult.yellowReasons
      },
      allSourcesMissing: allMacroMissing
    },
    liquidityIndex: {
      score: risk.modules.liquidity,
      regime: risk.modules.liquidity >= 70 ? '限制性偏紧' : risk.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复',
      change1d: clamp(((scoringRealtime.changes?.dxy1d ?? 0) * 10) + ((scoringRealtime.changes?.hyOas1d ?? 0) * 8), -9, 9),
      directionLabel: scoringRealtime.cacheOnly ? '快变量缓存模式' : scoringRealtime.degradedMode ? '快变量带回退' : '快变量实时覆盖',
      notes: [
        `广义美元指数 ${risk.dxy.toFixed(2)} / 高收益利差 ${risk.hy.toFixed(2)} / 波动率 ${risk.vix.toFixed(2)} 为三大流动性输入。`,
        ...(scoringRealtime.notes || [])
      ],
      pillars: [
        { label: '美元融资', value: risk.dollarRisk, delta: clamp((scoringRealtime.changes?.dxy1d ?? 0) * 8, -9, 9) },
        { label: '跨资产波动', value: risk.vixRisk, delta: clamp((scoringRealtime.changes?.vix1d ?? 0) * 4, -9, 9) },
        { label: '信用 / 利差', value: risk.hyRisk, delta: clamp((scoringRealtime.changes?.hyOas1d ?? 0) * 10, -9, 9) },
        { label: '利率敏感压力', value: clamp(avg([risk.rateRisk, risk.realRisk])), delta: clamp(((scoringRealtime.changes?.us10y1d ?? 0) + (scoringRealtime.changes?.real10y1d ?? 0)) * 18, -9, 9) }
      ],
      structuralSignals: {
        fedAssetTrend: macroDrivers.fedLiquidity.regime,
        onRrpLevel: macroDrivers.fedLiquidity.onRrpLevel,
        structuralPressure: macroDrivers.fedLiquidity.pressure
      }
    },
    timeDimension: {
      trend30d: '滚动风险曲线（混合实时驱动）',
      scoreChange30d,
      avg30d,
      peak30d,
      trough30d,
      drawFromPeak: risk.score - peak30d,
      transmissionSpeed: clamp(avg([risk.modules.energy, risk.modules.inflation, risk.modules.liquidity])),
      transmissionAcceleration: scoreChange7d > R.trendThresholds.acceleratingThreshold ? '加快' : scoreChange7d < R.trendThresholds.deceleratingThreshold ? '放缓' : '平稳',
      dominantPath: risk.modules.energy >= risk.modules.liquidity ? '油价 → 通胀 → 利率 → 股票' : '美元 → 信用 → 流动性 → 股票',
      pathChanges: [
        { label: '油价→通胀', value: clamp(avg([risk.oilRisk, risk.inflationRisk])), delta: clamp((scoringRealtime.changes?.brent1d ?? 0) * 3, -9, 9) },
        { label: '通胀→利率', value: clamp(avg([risk.inflationRisk, risk.rateRisk])), delta: clamp((scoringRealtime.changes?.breakeven10y1d ?? 0) * 18, -9, 9) },
        { label: '利率→股票', value: clamp(avg([risk.rateRisk, risk.spxRisk])), delta: clamp(((scoringRealtime.changes?.us10y1d ?? 0) * 16) - ((scoringRealtime.changes?.spx1d ?? 0) / 20), -9, 9) },
        { label: '美元→信用', value: clamp(avg([risk.dollarRisk, risk.hyRisk])), delta: clamp(((scoringRealtime.changes?.dxy1d ?? 0) * 8) + ((scoringRealtime.changes?.hyOas1d ?? 0) * 8), -9, 9) },
        { label: '流动性→估值', value: clamp(avg([risk.modules.liquidity, risk.vixRisk])), delta: clamp(((scoringRealtime.changes?.vix1d ?? 0) * 3) + ((scoringRealtime.changes?.hyOas1d ?? 0) * 8), -9, 9) }
      ],
      notes: [
        `当前综合风险分数 ${risk.score}。`,
        `执行引擎状态：${lock.levelLabel}。`,
        `慢变量由实时快照与结构性数据共同驱动。`
      ]
    },
    heatmap: [
      { key: 'us', label: '美国', shortLabel: '美国', risk: clamp(avg([risk.modules.inflation, risk.modules.debt, risk.modules.liquidity])), note: `融资偏紧 + 实际利率 ${risk.real10y.toFixed(2)}%` },
      { key: 'europe', label: '欧洲', shortLabel: '欧洲', risk: clamp(avg([risk.modules.energy, risk.modules.banking])), note: '能源敏感 + 增长拖累' },
      { key: 'middleeast', label: '中东', shortLabel: '中东', risk: risk.modules.geopolitical, note: '原油与地缘仍是主风险源' },
      { key: 'china', label: '中国', shortLabel: '中国', risk: clamp(avg([risk.modules.debt * 0.4, risk.modules.liquidity * 0.6])), note: '外需与美元约束' },
      { key: 'japan', label: '日韩', shortLabel: '日韩', risk: clamp(avg([risk.modules.energy * 0.45, risk.modules.liquidity * 0.55])), note: '输入型压力+美元波动' },
      { key: 'emAsia', label: '新兴亚洲', shortLabel: '新兴亚洲', risk: clamp(avg([risk.modules.liquidity * 0.65, risk.modules.energy * 0.35])), note: '美元敏感度较高' },
      { key: 'latam', label: '拉美', shortLabel: '拉美', risk: clamp(avg([risk.modules.energy * 0.35, risk.modules.liquidity * 0.65])), note: '商品支撑但外部融资受限' }
    ],
    transmissionChain: transmissionDeltaResult.chain,
    transmissionDeltaMeta: transmissionDeltaResult.meta,
    assetMatrix: [
      { asset: '黄金', score: clamp(50 + (100 - risk.realRisk) * 0.35 + risk.inflationRisk * 0.25), bias: (risk.realRisk < 60 ? '中性偏多' : '谨慎偏多'), reason: `金价 ${risk.gold.toFixed(1)}，通胀对冲仍在，但真实利率继续约束。` },
      { asset: '原油', score: clamp(45 + risk.oilRisk * 0.55), bias: risk.brent >= 90 ? '强配' : '中性偏多', reason: `布伦特 ${risk.brent.toFixed(1)} 美元，仍是主导链条。` },
      { asset: '美元', score: clamp(40 + risk.dollarRisk * 0.55), bias: risk.dollarRisk >= 60 ? '强配' : '中性偏多', reason: `广义美元指数 ${risk.dxy.toFixed(2)}，融资偏紧阶段继续占优。` },
      { asset: '美债久期', score: clamp(60 - risk.realRisk * 0.45), bias: risk.realRisk >= 60 ? '低配' : '谨慎偏多', reason: `10年期 ${risk.us10y.toFixed(2)} / 实际利率 ${risk.real10y.toFixed(2)}%。` },
      { asset: '科技股', score: clamp(55 - avg([risk.rateRisk, risk.modules.liquidity]) * 0.5), bias: risk.score >= 70 ? '回避' : '低配', reason: '高估值资产仍受利率与流动性制约。' },
      { asset: '能源股', score: clamp(50 + risk.modules.energy * 0.45), bias: risk.modules.energy >= 70 ? '强配' : '中性偏多', reason: '能源现金流继续受益于高油价环境。' },
      { asset: '比特币', score: clamp(48 - risk.modules.liquidity * 0.35 - risk.vixRisk * 0.2), bias: risk.modules.liquidity >= 65 ? '回避' : '低配', reason: '高波动资产对流动性最敏感。' }
    ],
    assetReturnMap: prevData.assetReturnMap || { horizon: '未来1个月', rows: [] },
    scenarioTree: [
      {
        name: '基准情景',
        probability: clamp(avg([probs.stagflationShock, probs.crisisLiquiditySqueeze])),
        description: '快变量显示风险仍高位但未失控，市场以防守与分化为主。',
        triggers: `布伦特 ${risk.brent.toFixed(1)} / 广义美元指数 ${risk.dxy.toFixed(2)} / 高收益利差 ${risk.hy.toFixed(2)}`,
        assets: '能源领先 / 美元与黄金保留 / 成长受限'
      },
      {
        name: '风险情景',
        probability: clamp(avg([risk.hyRisk, risk.vixRisk])),
        description: '信用与波动率继续上行，执行引擎会切到红灯。',
        triggers: '布伦特 > 110 或高收益利差 > 4.5% 或波动率 > 28',
        assets: '只允许减仓 / 现金与美元提高 / 高波动回避'
      },
      {
        name: '极端情景',
        probability: clamp(avg([risk.modules.liquidity, risk.vixRisk])),
        description: '多源关键快变量连续失效时，系统进入缓存模式并强制防守。',
        triggers: '关键缺失 ≥ 4 或缓存模式启动',
        assets: '停止加仓 / 保留现金 / 仅做风险控制'
      },
      {
        name: '反转情景',
        probability: clamp(avg([probs.disinflationaryGrowth, probs.liquidityBull])),
        description: '美元走弱、波动率和利差收敛后，系统重新开放进攻窗口。',
        triggers: '波动率 < 18 / 高收益利差 < 3.7 / 布伦特 < 95',
        assets: '逐步恢复权益与质量成长配置'
      }
    ],
    warningSystem: {
      status: `${lock.levelLabel} / 数据模式${sourceModeLabel}`,
      criticalCount: scoringRealtime.criticalMissing || 0,
      warningCount: scoringRealtime.fallbackCount || 0,
      watchCount: Object.values(scoringRealtime.sourceStatus || {}).filter(v => String(v).startsWith('fred') || String(v).startsWith('stooq')).length,
      alerts: [
        {
          level: lock.level === 'red' ? '红色' : lock.level === 'yellow' ? '橙色' : '黄色',
          title: '执行状态灯',
          driver: '交易引擎',
          triggeredAgo: isoNow,
          condition: lock.description,
          action: lock.actionText
        },
        ...activeSignals.map((s) => ({
          level: ['curveDeepInversion', 'onRrpCritical', 'igOasStress', 'moveVolStress'].includes(s.key) ? '橙色' : '黄色',
          title: s.label,
          driver: '结构信号',
          triggeredAgo: isoNow,
          condition: s.detail,
          action: '该结构信号已纳入决策层门控。'
        })),
        ...(scoringRealtime.notes || []).map((n) => ({
          level: '黄色',
          title: '数据源提示',
          driver: '快变量源',
          triggeredAgo: isoNow,
          condition: n,
          action: '继续使用回退值，不中断系统'
        }))
      ],
      rules: [
        '关键快变量失败 2 项以上 → 标记部分降级。',
        '关键快变量失败 4 项以上 → 进入缓存模式。',
        '缓存模式自动把执行状态灯至少提升到黄灯。',
        '结构性红灯门控：曲线严重倒挂（< -0.8）且投资级信用告警（>= 2.0%）；或逆回购余额临界告急。',
        '结构性黄灯门控：曲线深度倒挂叠加美联储缩表；或投资级信用利差进入应力区；或逆回购告急。'
      ]
    },
    triggerPanel: {
      critical: [`布伦特 ${risk.brent.toFixed(1)}`, `广义美元指数 ${risk.dxy.toFixed(2)}`, `高收益利差 ${risk.hy.toFixed(2)}%`],
      drivers: [`波动率 ${risk.vix.toFixed(2)}`, `10年期美债 ${risk.us10y.toFixed(2)}%`, `实际利率 ${risk.real10y.toFixed(2)}%`],
      watchlist: ['下一次通胀数据', '油价是否高于 100', '信用利差是否重新走阔']
    },
    confidenceNotes: [
      `数据模式：${sourceModeLabel}。`,
      `健康分数：${scoringRealtime.healthScore}。`,
      `关键缺失项：${scoringRealtime.criticalMissing || 0}。`,
      `结构信号：${activeSignals.length ? activeSignals.map(s => s.label).join('、') : (allMacroMissing ? '数据源全不可用' : '无激活')}。`
    ],
    recovery: {
      degradedMode: scoringRealtime.degradedMode || allMacroMissing,
      safeOutput: true,
      lastRun: isoNow,
      notes: recoveryNotes
    },
    tradingSystem: {
      signalEngine: {
        strength: risk.score,
        direction: lock.level === 'red' ? '只允许减仓/防守' : lock.level === 'yellow' ? '防御偏多能源 / 美元，限制久期与高波动' : '允许质量权益分批进攻',
        consistency: scoringRealtime.cacheOnly ? '低一致性（缓存）' : scoringRealtime.degradedMode ? '中一致性（回退）' : '高一致性',
        macroSignal: macro,
        liquiditySignal: `${risk.modules.liquidity >= 70 ? '限制性偏紧' : risk.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复'}（实时）`,
        chainSignal: risk.modules.energy >= risk.modules.liquidity ? '油价→通胀→利率→股票' : '美元→信用→流动性→股票',
        notes: [
          `执行引擎状态：${lock.levelLabel}。`,
          `关键快变量：布伦特 ${risk.brent.toFixed(1)} / 广义美元指数 ${risk.dxy.toFixed(2)} / 波动率 ${risk.vix.toFixed(2)} / 高收益利差 ${risk.hy.toFixed(2)}。`,
          `健康度 ${scoringRealtime.healthScore}，关键缺失 ${scoringRealtime.criticalMissing || 0}。`,
          activeSignals.length ? `结构信号：${activeSignals.map(s => s.label).join('、')}。` : (allMacroMissing ? '结构信号数据源全不可用，门控已降级。' : '结构信号：无激活。')
        ]
      },
      positioning: {
        regime: lock.level === 'red' ? '强防守执行框架' : lock.level === 'yellow' ? '防守型执行框架' : '可控进攻框架',
        riskBudget: lock.riskBudget,
        targetGrossExposure: lock.gross,
        cashBufferTarget: lock.cash,
        coreAllocations: allocs,
        executionRestrictions: lock.level === 'green'
          ? ['任何新增仓位必须分批执行。', '单日净加仓不超过总资产的 5%。', '若状态灯转黄，次日停止加仓。']
          : ['总仓位偏离目标值超过 ±5% 前，不得做方向性大调整。', '高波动资产合计不得超过 3%。', '任何新增进攻仓位都必须由减仓腾出空间。']
      },
      discipline: prevData.tradingSystem?.discipline || {
        tag: '系统优先于主观判断',
        entryConditions: ['宏观、流动性、传导链至少两项同向支持。'],
        prohibitedBehaviors: ['禁止在状态灯为红灯或黄灯时主观追高。'],
        mandatoryRules: ['先看状态灯，再执行动作。']
      },
      riskControl: {
        status: lock.level === 'red' ? '硬阈值全面生效' : lock.level === 'yellow' ? '硬阈值生效中' : '风险可控但仍受约束',
        maxDrawdown: lock.level === 'red' ? '-6%' : '-8%',
        singleAssetMax: lock.level === 'red' ? '20%' : '22%',
        systemState: lock.title,
        hardThresholds: [
          '流动性 ≥ 75：总仓位降至 42%。',
          '布伦特 ≥ 110：能源上调，股票下调。',
          '高收益利差 ≥ 4.5%：暂停新增风险仓位。',
          '波动率指数 ≥ 28：切入红灯。',
          '结构性红灯：曲线 < -0.8 且投资级信用利差 ≥ 2.0%；或逆回购余额临界告急。',
          '结构性黄灯：曲线 ≤ -0.5 叠加美联储缩表；或投资级信用利差 ≥ 1.5%；或逆回购余额 < 1000 亿美元。'
        ],
        resetThresholds: [
          '波动率指数 < 18 且高收益利差 < 3.7：才允许回到绿灯。',
          '布伦特 < 95 且美元走弱：才允许提高成长仓。',
          '关键缺失 < 2：解除数据回退约束。',
          '曲线回到 0 以上且投资级信用利差 < 1.2%：解除结构性约束。'
        ]
      },
      actionLayer: {
        tag: '今日执行清单（交易引擎版）',
        priorityLine: `先看执行状态灯 ${lock.levelLabel} → 再执行强制动作 → 再对齐目标仓位；不满足条件时禁止交易。`,
        todayAction: lock.actionText,
        checklist: lock.mandatory,
        blocked: lock.block,
        checkpoints: [
          `布伦特 当前 ${risk.brent.toFixed(1)}`,
          `广义美元指数 当前 ${risk.dxy.toFixed(2)}`,
          `波动率指数 当前 ${risk.vix.toFixed(2)}`,
          `高收益利差 当前 ${risk.hy.toFixed(2)}%`,
          ...(Number.isFinite(macroDrivers.curve.t10y2y) ? [`曲线 10年-2年 当前 ${macroDrivers.curve.t10y2y.toFixed(2)}`] : []),
          ...(Number.isFinite(macroDrivers.credit.igOas) ? [`投资级信用利差 当前 ${macroDrivers.credit.igOas.toFixed(2)}%`] : []),
          ...(Number.isFinite(macroDrivers.fedLiquidity.onRrp) ? [`逆回购余额 当前 ${formatOnRrpYiUsd(macroDrivers.fedLiquidity.onRrp)}`] : [])
        ]
      },
      executionLock: {
        tag: scoringRealtime.cacheOnly ? '缓存模式 · 主观不得覆盖' : scoringRealtime.degradedMode ? '带回退实时模式 · 主观不得覆盖' : '实时模式 · 主观不得覆盖',
        level: lock.level,
        levelLabel: lock.levelLabel,
        title: lock.title,
        description: lock.description,
        allow: lock.allow,
        block: lock.block,
        mandatory: lock.mandatory,
        structurallyTriggered: !!lock.structurallyTriggered
      }
    }
  };

  data.decisionModel = {
    contractVersion: DATA_CONTRACT_VERSION,
    strategyState: lock.level === 'red' ? 'Defensive' : lock.level === 'yellow' ? 'Caution' : 'Balanced',
    stateLabel: lock.levelLabel,
    stateScore: risk.score,
    stateReason: stateReasonCN,
    structuralSignals: activeSignals.map(s => ({ key: s.key, label: s.label, detail: s.detail, reliability: s.reliability })),
    structuralScoreBump: structuralScoreBump(activeSignals),
    allStructuralSourcesMissing: allMacroMissing,
    dominantDrivers: sortedModules.map(([key, score]) => ({
      key,
      score,
      label: MODULE_LABELS_CN[key] || key,
      trend: 0
    })),
    positionGuidance: {
      totalExposureBand: totalExposureBandCN,
      riskAssetBias: lock.level === 'red' ? '低配风险资产' : lock.level === 'yellow' ? '选择性低配' : '中性至选择性配置',
      cashGuidance: cashGuidanceText,
      newExposurePolicy: newExposurePolicyText,
      targetGrossExposure: lock.gross,
      cashBufferTarget: lock.cash,
      riskBudget: lock.riskBudget,
      structuralBandShift: structuralShift
    },
    actionQueue: {
      priorityActions: [
        ...lock.mandatory,
        ...activeSignals.map(s => `关注结构信号：${s.label}（${s.detail}）。`)
      ],
      blockedActions: lock.block,
      watchItems: [
        '下一次通胀数据',
        '油价是否高于 100',
        '信用利差是否重新走阔',
        ...(Number.isFinite(macroDrivers.curve.t10y2y) ? ['10年-2年利差走向'] : []),
        ...(Number.isFinite(macroDrivers.credit.igOas) ? ['投资级信用利差变化'] : []),
        ...(Number.isFinite(macroDrivers.fedLiquidity.onRrp) ? ['逆回购余额变化'] : [])
      ]
    },
    triggerMonitor: {
      upgradeTriggers: [
        `布伦特 ${risk.brent.toFixed(1)}`,
        `广义美元指数 ${risk.dxy.toFixed(2)}`,
        `高收益利差 ${risk.hy.toFixed(2)}%`,
        ...(Number.isFinite(macroDrivers.curve.t10y2y) ? [`10年-2年利差 ${macroDrivers.curve.t10y2y.toFixed(2)}`] : []),
        ...(Number.isFinite(macroDrivers.credit.igOas) ? [`投资级信用利差 ${macroDrivers.credit.igOas.toFixed(2)}%`] : [])
      ],
      activeEscalationSignals: activeSignals.length
        ? activeSignals.map(s => `${s.label}（${s.detail}）`)
        : [`波动率 ${risk.vix.toFixed(2)}`, `10年期美债 ${risk.us10y.toFixed(2)}%`, `实际利率 ${risk.real10y.toFixed(2)}%`]
    },
    invalidationRules: {
      resetConditions: [
        '波动率指数 < 18 且高收益利差 < 3.7：才允许回到绿灯。',
        '布伦特 < 95 且美元走弱：才允许提高成长仓。',
        '关键缺失 < 2：解除数据回退约束。',
        '曲线回到 0 以上且投资级信用利差 < 1.2%：解除结构性约束。'
      ]
    }
  };

  data.aiInterpretationLayer = buildAiInterpretationLayer(data);
  preserveExternalAiInterpretationLayer(data);

  const historyFull = appendHistoryFull(prevHistoryFull, risk, lock, macro, macroDrivers, transmissionSnapshot, worldOrderStressHistorySnapshot);
  data.historyWindowFields = buildHistoryWindowFields(historyFull);

  return { data, history, historyFull };
}

export function replaceJsonBatchSafely(entries, replaceFile = fs.renameSync) {
  const suffix = `${process.pid}.${Date.now()}`;
  const staged = entries.map(([filePath, value]) => ({
    filePath,
    tmpPath: path.join(path.dirname(filePath), `.${path.basename(filePath)}.${suffix}.tmp`),
    backupPath: path.join(path.dirname(filePath), `.${path.basename(filePath)}.${suffix}.backup`),
    hadOriginal: fs.existsSync(filePath),
    text: `${JSON.stringify(value, null, 2)}\n`
  }));
  const replaced = [];

  try {
    for (const entry of staged) fs.writeFileSync(entry.tmpPath, entry.text, 'utf8');
    for (const entry of staged) {
      if (entry.hadOriginal) fs.copyFileSync(entry.filePath, entry.backupPath);
    }
    for (const entry of staged) {
      replaceFile(entry.tmpPath, entry.filePath);
      replaced.push(entry);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of replaced.reverse()) {
      try {
        if (entry.hadOriginal) fs.copyFileSync(entry.backupPath, entry.filePath);
        else fs.rmSync(entry.filePath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], 'Daily JSON batch replacement and rollback failed');
    }
    throw error;
  } finally {
    for (const entry of staged) {
      if (fs.existsSync(entry.tmpPath)) fs.rmSync(entry.tmpPath, { force: true });
      if (fs.existsSync(entry.backupPath)) fs.rmSync(entry.backupPath, { force: true });
    }
  }
}

async function main() {
  const built = await build();
  fs.mkdirSync(dataDir, { recursive: true });
  replaceJsonBatchSafely([
    [histPath, built.history],
    [histFullPath, built.historyFull],
    [dataPath, built.data]
  ]);
  console.log(`${RELEASE_VERSION} 雷达数据构建成功。`);
}

if (IS_MAIN) {
  await main();
}
