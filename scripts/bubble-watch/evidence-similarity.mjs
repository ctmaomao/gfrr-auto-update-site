import { METHOD_ORDER } from './evidence-score-contract.mjs';
const STATUS_RANK = { green: 0, yellow: 1, red: 2 };
// Fixed hypothetical structure comparisons, not a predictive backtest.
const HISTORICAL_PERIODS = [
  { period: '1999-06', label_zh: '互联网泡沫顶前 9 个月', label_en: '9 months before dot-com top' },
  { period: '2000-02', label_zh: '互联网泡沫顶前 1 个月', label_en: '1 month before dot-com top' },
  { period: '2007-10', label_zh: '金融危机股市顶', label_en: 'GFC equity top' },
  { period: '2021-11', label_zh: '成长股/SPAC 顶', label_en: 'Growth/SPAC top' }
];

// ponytail: Similarity uses only Core-23 rows with a reviewed historical analogue.
// spy_vs_rsp_6m remains core-scored but stays outside similarity until reviewed;
// Shadow-4 rows are naturally absent from the current-status map passed here.
const HISTORICAL_CALIBRATION_ROWS = {
  cape: ['red', 'red', 'yellow', 'red'],
  top5_weight: ['yellow', 'red', 'green', 'yellow'],
  nvda_fpe: ['red', 'red', 'green', 'red'],
  private_secondary_marks: ['green', 'green', 'yellow', 'green'],
  hyperscaler_capex_yoy: ['yellow', 'yellow', 'green', 'yellow'],
  mag4_fcf_yoy: ['yellow', 'red', 'green', 'green'],
  vc_ai_share: ['red', 'red', 'green', 'red'],
  nvda_invest_revenue: ['yellow', 'red', 'green', 'green'],
  breadth_50d: ['yellow', 'red', 'red', 'red'],
  insider_sell_buy: ['yellow', 'red', 'yellow', 'red'],
  ai_ipo_pipeline: ['red', 'red', 'yellow', 'red'],
  hy_oas: ['yellow', 'yellow', 'yellow', 'green'],
  dc_abs_spread: ['yellow', 'yellow', 'red', 'green'],
  neocloud_credit: ['green', 'yellow', 'red', 'green'],
  debt_capex_ratio: ['yellow', 'red', null, 'green'],
  token_volume_mom: ['green', 'green', null, 'green'],
  gpu_rental_price: ['green', 'yellow', null, 'green'],
  arr_2nd_deriv: ['green', 'yellow', null, 'green'],
  enterprise_deploy: ['green', 'yellow', null, 'green'],
  cloud_rpo_growth: ['green', 'green', null, 'green'],
  frontier_progress: ['green', 'green', null, 'green'],
  accounting_events: ['green', 'yellow', 'yellow', 'yellow'],
  fed_policy: ['red', 'red', 'green', 'red'],
  capex_reaction: ['green', 'yellow', null, 'green'],
  ceo_hedging: ['green', 'yellow', 'yellow', 'yellow']
};


export function computeEvidenceSimilarity(indicators, revision = 0) {
  const current = new Map(indicators.filter(item => item.score_role === 'core').map((item) => [item.id, item.status]));
  return HISTORICAL_PERIODS.map((period, periodIndex) => {
    let matched = 0;
    let denominator = 0;
    for (const [id, row] of Object.entries(HISTORICAL_CALIBRATION_ROWS)) {
      // Refitted indicators lack comparable historical inputs: ABS needs matched bond spreads,
      // insiders need fixed 30/90d coverage, capex needs guidance events, Fed needs a 3/6m market curve.
      // Unlock each only after a reviewed historical calibration for that definition.
      if (revision && METHOD_ORDER.slice(0, revision).includes(id)) continue;
      // No comparable historical series exists for these explicit evidence migrations.
      // Unlock only with separately reviewed same-definition historical data.
      if (revision >= 5 && id === 'nvda_invest_revenue') continue;
      if (revision >= 6 && ['arr_2nd_deriv', 'enterprise_deploy'].includes(id)) continue;
      const historical = row[periodIndex];
      const status = current.get(id);
      if (!historical || !Object.hasOwn(STATUS_RANK, status)) continue;
      denominator += 1;
      const distance = Math.abs(STATUS_RANK[status] - STATUS_RANK[historical]);
      matched += distance === 0 ? 1 : distance === 1 ? 0.5 : 0;
    }
    return {
      ...period,
      match_pct: Math.round((matched / denominator) * 100),
      denominator,
      basis: 'core_calibrated_indicators_only'
    };
  }).sort((a, b) => b.match_pct - a.match_pct);
}
