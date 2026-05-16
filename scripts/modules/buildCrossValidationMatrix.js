const ASSESSMENT_LABELS = {
  strong_confirmation: '强确认',
  partial_confirmation: '部分确认',
  insufficient_data: '数据不足',
  contradiction: '存在矛盾',
};

const BUCKET_LABELS = {
  'extreme-hot': '极度过热',
  hot: '显著偏热',
  neutral: '中性区间',
  cold: '显著偏冷',
  'extreme-cold': '极度偏冷',
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 2, suffix = '') {
  const number = finite(value);
  if (number === null) return '--';
  return `${number.toFixed(digits)}${suffix}`;
}

function formatSigned(value, digits = 2) {
  const number = finite(value);
  if (number === null) return '--';
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
}

function formatCurrency(value) {
  const number = finite(value);
  if (number === null) return '--';
  return `$${number.toFixed(2)}`;
}

function evidence(source, value, detail) {
  return {
    source,
    value: value == null ? null : String(value),
    detail: String(detail || ''),
  };
}

function findDivergenceCheck(data, key) {
  return safeArray(data?.divergenceLayer?.checks).find((item) => item?.key === key) || {};
}

function classifyZScoreBucket(zScore) {
  const value = finite(zScore);
  if (value === null) return 'neutral';
  if (value >= 2) return 'extreme-hot';
  if (value >= 1) return 'hot';
  if (value <= -2) return 'extreme-cold';
  if (value <= -1) return 'cold';
  return 'neutral';
}

function getLatestMetric(metricsData) {
  const records = safeArray(metricsData?.records).filter((record) => isPlainObject(record));
  const latest = records[records.length - 1] || null;
  const zScore = finite(latest?.zScore);
  if (!latest || zScore === null) return null;
  const bucketKey = classifyZScoreBucket(zScore);
  return {
    records,
    latest,
    zScore,
    bucketKey,
    bucketLabel: BUCKET_LABELS[bucketKey] || '中性区间',
  };
}

function assessEvidence(supportingEvidence, contradictingEvidence, missingEvidence) {
  if (contradictingEvidence.length > 0) return 'contradiction';
  if (supportingEvidence.length >= 2) return 'strong_confirmation';
  if (supportingEvidence.length === 1) return 'partial_confirmation';
  if (missingEvidence.length > 0) return 'insufficient_data';
  return 'insufficient_data';
}

function narrative({ id, label, supportingEvidence = [], missingEvidence = [], contradictingEvidence = [], assessment, interpretation }) {
  const finalAssessment = assessment || assessEvidence(supportingEvidence, contradictingEvidence, missingEvidence);
  return {
    id,
    label,
    title: label,
    group: 'cross-validation',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    assessment: finalAssessment,
    status: ASSESSMENT_LABELS[finalAssessment] || '数据不足',
    interpretation,
  };
}

function buildEnergyShockNarrative(data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const energyCheck = findDivergenceCheck(data, 'energy_pricing_gap_watch');
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const brent = finite(inputs.brent);
  const crackSpread = finite(brentLayer.crackSpread);
  const crackSpreadRegime = typeof brentLayer.crackSpreadRegime === 'string' ? brentLayer.crackSpreadRegime : null;
  const supportingEvidence = [];
  const missingEvidence = [
    evidence('dated_brent', null, 'Platts Dated Brent 尚未接入'),
    evidence('term_structure', null, 'Brent 期限结构、库存和航运压力等待接入'),
  ];
  const contradictingEvidence = [];

  if (brent !== null && brent >= 100) {
    supportingEvidence.push(evidence('brent', formatCurrency(brent), '公开 Brent 价格处于高压区间'));
  }
  if (energyCheck.status === 'stress' || finite(energyCheck.score) >= 60) {
    supportingEvidence.push(evidence('energy_pricing_gap_watch', formatNumber(energyCheck.score, 0), energyCheck.summaryZh || '能源价格验证层提示压力'));
  }
  if (crackSpread === null) {
    missingEvidence.push(evidence('crack_spread', null, '柴油裂解价差（DHOILNYH-Brent）尚未接入'));
  } else if (crackSpread >= 45) {
    supportingEvidence.push(evidence(
      'crack_spread',
      `$${crackSpread.toFixed(1)}/桶`,
      `柴油裂解价差 $${crackSpread.toFixed(1)}/桶（${crackSpreadRegime}），实物供应紧张，确认能源冲击`
    ));
  } else if (crackSpread >= 25) {
    supportingEvidence.push(evidence(
      'crack_spread',
      `$${crackSpread.toFixed(1)}/桶`,
      `柴油裂解价差 $${crackSpread.toFixed(1)}/桶（${crackSpreadRegime}），偏高支持能源压力观察`
    ));
  } else if (crackSpread < 10) {
    contradictingEvidence.push(evidence(
      'crack_spread',
      `$${crackSpread.toFixed(1)}/桶`,
      `柴油裂解价差 $${crackSpread.toFixed(1)}/桶（${crackSpreadRegime}），经济需求疲软，反驳能源冲击叙事`
    ));
  }
  if (brent !== null && brent < 85) {
    contradictingEvidence.push(evidence('brent', formatCurrency(brent), 'Brent 未显示能源冲击压力'));
  }

  return narrative({
    id: 'energy_shock',
    label: '能源冲击',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    interpretation: supportingEvidence.length >= 2
      ? '公开能源价格与能源验证层同时提示压力，但实物端证据仍需补齐。'
      : '能源冲击仍处于观察状态，不能仅凭单一价格确认实物端升级。',
  });
}

function buildStagflationNarrative(data, fedLiquidity = {}) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const consumer = isPlainObject(data?.macroDrivers?.consumer) ? data.macroDrivers.consumer : {};
  const fed = isPlainObject(fedLiquidity) ? fedLiquidity : {};
  const brent = finite(inputs.brent);
  const us10y = finite(inputs.us10y);
  const sentiment = finite(consumer.umichSentiment);
  const ismPmi = finite(consumer.ismManufacturingPmi);
  const inflationModule = finite(data?.modules?.inflation);
  const effectiveFedFundsRate = finite(fed.effectiveFedFundsRate);
  const sofr = finite(fed.sofr);
  const policyPathEvidence = effectiveFedFundsRate === null
    ? null
    : evidence(
      'policy_path',
      formatNumber(effectiveFedFundsRate, 2, '%'),
      `当前联邦基金有效利率已接入${sofr === null ? '' : `；SOFR ${formatNumber(sofr, 2, '%')} 提供近端融资状态`}；forward policy path 仍需 dot plot / Fed funds futures 验证`,
    );
  const supportingEvidence = [];
  const missingEvidence = [
    policyPathEvidence
      ? evidence('policy_forward_path', null, 'Fed dot plot / Fed funds futures / OIS forward rates 未接入')
      : evidence('policy_path', null, '当前政策利率与前瞻政策路径未接入'),
  ];
  const contradictingEvidence = [];

  if (brent !== null && brent >= 100) supportingEvidence.push(evidence('brent', formatCurrency(brent), '能源价格维持高位'));
  if (us10y !== null && us10y >= 4.25) supportingEvidence.push(evidence('us10y', formatNumber(us10y, 2, '%'), '长端利率仍偏紧'));
  if (sentiment !== null && sentiment < 60) supportingEvidence.push(evidence('umich_sentiment', formatNumber(sentiment, 1), '消费者体感偏弱'));
  if (inflationModule !== null && inflationModule >= 60) supportingEvidence.push(evidence('inflation_module', formatNumber(inflationModule, 0), '通胀模块处于偏高区间'));
  if (policyPathEvidence) supportingEvidence.push(policyPathEvidence);
  // M-47: PMI moves from hardcoded missing evidence to dynamic manufacturing-cycle classification.
  if (ismPmi === null) {
    missingEvidence.push(evidence('pmi', null, 'ISM 制造业 PMI 未接入'));
  } else if (ismPmi < 45) {
    supportingEvidence.push(evidence(
      'pmi',
      formatNumber(ismPmi, 1),
      `ISM 制造业 PMI ${formatNumber(ismPmi, 1)}，深度收缩，制造业景气与增长同步走弱`
    ));
  } else if (ismPmi < 50) {
    supportingEvidence.push(evidence(
      'pmi',
      formatNumber(ismPmi, 1),
      `ISM 制造业 PMI ${formatNumber(ismPmi, 1)}，制造业处于收缩区间`
    ));
  } else if (ismPmi > 55) {
    contradictingEvidence.push(evidence(
      'pmi',
      formatNumber(ismPmi, 1),
      `ISM 制造业 PMI ${formatNumber(ismPmi, 1)}，制造业明显扩张，不支持近端滞涨`
    ));
  }
  if (brent !== null && brent < 85 && us10y !== null && us10y < 4) {
    contradictingEvidence.push(evidence('brent_us10y', `${formatCurrency(brent)} / ${formatNumber(us10y, 2, '%')}`, '能源与利率未共同构成滞涨压力'));
  }

  return narrative({
    id: 'stagflation_pressure',
    label: '滞涨压力',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    interpretation: supportingEvidence.length >= 2
      ? '能源、利率、体感或通胀模块共同支持滞涨压力观察。'
      : '滞涨压力证据仍不完整，需要增长与政策路径继续验证。',
  });
}

function buildRiskAssetMismatchNarrative(data, metric) {
  const pricingCheck = findDivergenceCheck(data, 'risk_complacency_watch');
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const vix = finite(inputs.vix);
  const hyOas = finite(inputs.hyOas);
  const supportingEvidence = [];
  const missingEvidence = [];
  const contradictingEvidence = [];

  if (pricingCheck.status === 'stress' || finite(pricingCheck.score) >= 50) {
    supportingEvidence.push(evidence('risk_complacency_watch', formatNumber(pricingCheck.score, 0), pricingCheck.summaryZh || '风险资产定价错配检查提示压力'));
  }
  if (metric && metric.zScore >= 1.5) {
    supportingEvidence.push(evidence('qqq_zscore', formatSigned(metric.zScore), `${metric.bucketLabel}，风险资产价格相对 60 周趋势偏热`));
  } else {
    missingEvidence.push(evidence('qqq_zscore', null, 'QQQ 市场温度不可用'));
  }
  if (vix !== null && vix < 16 && hyOas !== null && hyOas < 3.5 && !metric) {
    contradictingEvidence.push(evidence('vix_hy_oas', `${formatNumber(vix, 2)} / ${formatNumber(hyOas, 2, '%')}`, '波动率与信用利差均偏平静'));
  }

  return narrative({
    id: 'risk_asset_mismatch',
    label: '风险资产错配',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    interpretation: metric
      ? '风险资产温度和错配检查已经可以共同观察估值层压力。'
      : '缺少市场温度时，风险资产错配只能保留为观察项。',
  });
}

function buildOverheatNarrative(metric, data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const supportingEvidence = [];
  const missingEvidence = [];
  const contradictingEvidence = [];
  const hyOas = finite(inputs.hyOas);

  if (metric) {
    supportingEvidence.push(evidence('qqq_zscore', formatSigned(metric.zScore), metric.bucketLabel));
    supportingEvidence.push(evidence('qqq_close_vs_mean', `${formatCurrency(metric.latest.close)} / ${formatCurrency(metric.latest.ma60)}`, 'QQQ 最新收盘价高于 60 周均值'));
    supportingEvidence.push(evidence('qqq_stddev', formatCurrency(metric.latest.stdDev60), '60 周离散度已由 M-26 指标文件提供'));
  } else {
    missingEvidence.push(evidence('qqq_zscore', null, '60 周均值、标准差、z-score 与更长历史等待接入'));
  }
  if (hyOas !== null && hyOas < 3.5 && metric?.zScore >= 2) {
    missingEvidence.push(evidence('credit_confirmation', formatNumber(hyOas, 2, '%'), '信用利差仍平静，过热暂未被信用压力同步确认'));
  }

  return narrative({
    id: 'overheat_confirmation',
    label: '过热确认',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    assessment: metric?.zScore >= 2 ? 'strong_confirmation' : null,
    interpretation: metric?.zScore >= 2
      ? '估值温度已确认过热，信用市场尚未同步反映压力。'
      : '没有可用 z-score 前不判断风险资产过热。',
  });
}

function buildCreditSpreadNarrative(data, metric) {
  const credit = isPlainObject(data?.macroDrivers?.credit) ? data.macroDrivers.credit : {};
  const ratesCheck = findDivergenceCheck(data, 'rates_vs_risk_assets');
  const hyOas = finite(credit.hyOas ?? data?.displayInputsBaseline?.hyOas);
  const igOas = finite(credit.igOas);
  const igHyRatio = finite(credit.igHyRatio);
  const nfci = finite(credit.nfci);
  const nfciRegime = typeof credit.nfciRegime === 'string' ? credit.nfciRegime : null;
  const supportingEvidence = [];
  const missingEvidence = [
    evidence('cdx', null, 'CDX / CDS 数据尚未接入'),
  ];
  const contradictingEvidence = [];

  if (hyOas !== null && hyOas > 5) supportingEvidence.push(evidence('hy_oas', formatNumber(hyOas, 2, '%'), 'HY OAS 高于 5.0%'));
  if (igOas !== null && igOas > 1.5) supportingEvidence.push(evidence('ig_oas', formatNumber(igOas, 2, '%'), 'IG OAS 高于 1.5%'));
  if (igHyRatio !== null && igHyRatio < 0.25) supportingEvidence.push(evidence('ig_hy_ratio', formatNumber(igHyRatio, 2), 'IG/HY 比例低于 0.25，信用广度恶化'));
  if (ratesCheck.status === 'stress') supportingEvidence.push(evidence('rates_vs_risk_assets', formatNumber(ratesCheck.score, 0), ratesCheck.summaryZh || '利率与风险资产检查提示压力'));
  // M-48: NFCI moves from hardcoded missing evidence to dynamic bank-stress classification.
  if (nfci === null) {
    missingEvidence.push(evidence('bank_stress_index', null, '银行压力指数（NFCI）尚未接入'));
  } else if (nfci >= 0.5) {
    supportingEvidence.push(evidence(
      'nfci',
      `${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}`,
      `NFCI ${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}，金融状况显著收紧（${nfciRegime}），银行与同业压力同步信用利差预警`
    ));
  } else if (nfci >= 0.1) {
    supportingEvidence.push(evidence(
      'nfci',
      `${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}`,
      `NFCI ${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}，金融状况温和收紧（${nfciRegime}），支持信用压力观察`
    ));
  } else if (nfci <= -0.5) {
    contradictingEvidence.push(evidence(
      'nfci',
      `${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}`,
      `NFCI ${formatNumber(nfci, 2)}，金融状况显著宽松（${nfciRegime}），强烈反驳信用利差预警`
    ));
  } else if (nfci < -0.1) {
    contradictingEvidence.push(evidence(
      'nfci',
      `${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}`,
      `NFCI ${formatNumber(nfci, 2)}，金融状况温和宽松（${nfciRegime}），反驳信用压力扩散`
    ));
  }
  if (hyOas !== null && hyOas < 3.5 && metric?.zScore >= 1.5) {
    contradictingEvidence.push(evidence('hy_oas_vs_hot_assets', `${formatNumber(hyOas, 2, '%')} / ${formatSigned(metric.zScore)}`, '风险资产偏热但信用利差仍平静'));
  }

  return narrative({
    id: 'credit_spread_warning',
    label: '信用利差预警',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    interpretation: contradictingEvidence.length
      ? '信用市场尚未反映风险资产过热，形成晚周期错配提示。'
      : supportingEvidence.length
        ? '信用利差开始提供压力确认。'
        : '信用扩散证据不足，仍需 CDX、银行压力与更细信用分层补充。',
  });
}

function buildLiquidityTighteningNarrative(data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const fed = isPlainObject(data?.macroDrivers?.fedLiquidity) ? data.macroDrivers.fedLiquidity : {};
  const curve = isPlainObject(data?.macroDrivers?.curve) ? data.macroDrivers.curve : {};
  const credit = isPlainObject(data?.macroDrivers?.credit) ? data.macroDrivers.credit : {};
  const onRrp = finite(fed.onRrp);
  const dxy = finite(inputs.dxy);
  const t10y2y = finite(curve.t10y2y);
  const walcl4wChange = finite(fed.walcl4wChange);
  const sloosTighteningLargeFirms = finite(credit.sloosTighteningLargeFirms);
  const sloosTighteningSmallFirms = finite(credit.sloosTighteningSmallFirms);
  const supportingEvidence = [];
  const missingEvidence = [
    evidence('repo_stress', null, 'repo 市场压力指标未接入'),
  ];
  const contradictingEvidence = [];

  // onRrp is stored in USD billions in the current data product; below 200B is treated as scarce reserve buffer.
  if (onRrp !== null && onRrp < 200) supportingEvidence.push(evidence('on_rrp', `${formatNumber(onRrp, 3)}B`, 'ON RRP 低于 200B，准备金缓冲偏薄'));
  if (dxy !== null && dxy > 105) supportingEvidence.push(evidence('dxy', formatNumber(dxy, 2), '广义美元高于 105'));
  if (t10y2y !== null && t10y2y > 0.5) supportingEvidence.push(evidence('t10y2y', formatNumber(t10y2y, 2), '曲线陡峭度高于 +0.5'));
  if (walcl4wChange !== null && walcl4wChange < -50) supportingEvidence.push(evidence('walcl4wChange', formatNumber(walcl4wChange, 1), 'Fed 资产负债表 4 周收缩超过 50B'));
  if (onRrp !== null && onRrp > 1000) contradictingEvidence.push(evidence('on_rrp', `${formatNumber(onRrp, 1)}B`, 'ON RRP 高于 1T，流动性缓冲仍充裕'));
  if (walcl4wChange !== null && walcl4wChange > 50) contradictingEvidence.push(evidence('walcl4wChange', formatNumber(walcl4wChange, 1), 'Fed 资产负债表 4 周扩张超过 50B'));

  // M-46: SLOOS moves from hardcoded missing evidence to dynamic bank-loan-standard confirmation.
  if (sloosTighteningLargeFirms === null) {
    missingEvidence.push(evidence('sloos', null, 'SLOOS / 银行贷款标准未接入'));
  } else if (sloosTighteningLargeFirms >= 20) {
    supportingEvidence.push(evidence(
      'sloos',
      `${formatNumber(sloosTighteningLargeFirms, 1)}%`,
      `SLOOS 大型企业贷款标准净收紧 ${formatNumber(sloosTighteningLargeFirms, 1)}%，银行贷款条件显著收紧确认流动性收紧`
    ));
  } else if (sloosTighteningLargeFirms >= 0) {
    supportingEvidence.push(evidence(
      'sloos',
      `${formatNumber(sloosTighteningLargeFirms, 1)}%`,
      `SLOOS 大型企业贷款标准净收紧 ${formatNumber(sloosTighteningLargeFirms, 1)}%，温和收紧支持流动性偏紧观察`
    ));
  } else {
    contradictingEvidence.push(evidence(
      'sloos',
      `${formatNumber(sloosTighteningLargeFirms, 1)}%`,
      `SLOOS 大型企业贷款标准净放松 ${formatNumber(Math.abs(sloosTighteningLargeFirms), 1)}%，反驳流动性收紧叙事`
    ));
  }

  return narrative({
    id: 'liquidity_tightening',
    label: '流动性收紧确认',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    interpretation: supportingEvidence.length >= 2
      ? '美元强势和准备金缓冲偏薄共同确认流动性约束。'
      : '流动性证据仍需资金面和银行贷款条件补充。',
  });
}

function buildWorldOrderNarrative(data, worldOrderStressData) {
  const world = isPlainObject(worldOrderStressData) ? worldOrderStressData : {};
  const score = finite(world.score);
  const confidence = finite(world.confidence);
  const mainScore = finite(data?.score);
  const confirmationSource = world.marketConfirmationInput?.source;
  const externalSources = isPlainObject(world.externalSources) ? world.externalSources : {};
  const supportingEvidence = [];
  const missingEvidence = [];
  const contradictingEvidence = [];

  if (score !== null && score >= 50) supportingEvidence.push(evidence('world_order_score', formatNumber(score, 0), '世界秩序压力接近或进入高压区间'));
  if (world.freshness === 'fresh') supportingEvidence.push(evidence('world_order_freshness', world.freshness, '外部来源新鲜'));
  if (confidence !== null && confidence >= 0.5) supportingEvidence.push(evidence('world_order_confidence', `${Math.round(confidence * 100)}%`, '置信度达到 50% 以上'));
  if (confirmationSource && confirmationSource !== 'no-confirmation') supportingEvidence.push(evidence('market_confirmation_source', confirmationSource, '存在市场确认输入'));
  if (externalSources.gdelt?.status === 'stale') missingEvidence.push(evidence('gdelt', 'stale', 'GDELT 当前为 stale'));
  if (externalSources.acled?.status === 'not_configured') missingEvidence.push(evidence('acled', 'not_configured', 'ACLED 尚未配置'));
  if (externalSources.sipri?.status === 'manual_required') missingEvidence.push(evidence('sipri', 'manual_required', 'SIPRI 慢变量仍需手动导入'));
  if (score !== null && score >= 60 && mainScore !== null && mainScore < 40) {
    contradictingEvidence.push(evidence('world_order_vs_main_score', `${formatNumber(score, 0)} / ${formatNumber(mainScore, 0)}`, '地缘压力未传导到主风险分数'));
  }

  return narrative({
    id: 'world_order_pressure_crossing',
    label: '世界秩序压力交叉',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    interpretation: supportingEvidence.length
      ? '世界秩序压力提供结构性背景，但来源新鲜度和置信度仍限制结论强度。'
      : '世界秩序压力缺少足够新鲜和高置信确认。',
  });
}

function consistencyState(score) {
  if (score >= 70) return '高度一致';
  if (score >= 40) return '中等一致';
  if (score >= 20) return '证据混杂';
  return '证据严重不足或矛盾';
}

function buildOneLineSummary(narratives) {
  const confirmed = narratives
    .filter((item) => ['strong_confirmation', 'partial_confirmation'].includes(item.assessment))
    .map((item) => item.label);
  const contradictions = narratives
    .filter((item) => item.assessment === 'contradiction')
    .map((item) => item.label);
  const gaps = narratives
    .filter((item) => item.assessment === 'insufficient_data' || item.missingEvidence.length > 0)
    .map((item) => item.label);
  return [
    `主要风险确认: ${confirmed.length ? confirmed.join(' + ') : '暂无'}`,
    `主要矛盾: ${contradictions.length ? contradictions.join(' + ') : '暂无'}`,
    `数据缺口: ${gaps.length} 个 narrative`,
  ].join('; ');
}

export function buildCrossValidationMatrix(data = {}, worldOrderStressData = {}, marketPricingMetricsData = null, fedLiquidity = null) {
  const metric = getLatestMetric(marketPricingMetricsData);
  const matrixFedLiquidity = isPlainObject(fedLiquidity)
    ? fedLiquidity
    : isPlainObject(data?.macroDrivers?.fedLiquidity) ? data.macroDrivers.fedLiquidity : {};
  const narratives = [
    buildEnergyShockNarrative(data),
    buildStagflationNarrative(data, matrixFedLiquidity),
    buildRiskAssetMismatchNarrative(data, metric),
    buildOverheatNarrative(metric, data),
    buildCreditSpreadNarrative(data, metric),
    buildLiquidityTighteningNarrative(data),
    buildWorldOrderNarrative(data, worldOrderStressData),
  ];
  const strongConfirmations = narratives.filter((item) => item.assessment === 'strong_confirmation').length;
  const partialConfirmations = narratives.filter((item) => item.assessment === 'partial_confirmation').length;
  const consistencyScore = Math.round(100 * (strongConfirmations + 0.5 * partialConfirmations) / narratives.length);
  return {
    narratives,
    consistencyScore,
    consistencyState: consistencyState(consistencyScore),
    oneLineSummary: buildOneLineSummary(narratives),
  };
}

export { ASSESSMENT_LABELS };
