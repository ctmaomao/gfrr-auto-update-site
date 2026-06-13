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
  if (value === null || value === void 0) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
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

function formatSignedPercent(value, digits = 2) {
  const number = finite(value);
  if (number === null) return '--';
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`;
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
      `当前联邦基金有效利率已接入${sofr === null ? '' : `；担保隔夜融资利率(SOFR) ${formatNumber(sofr, 2, '%')} 提供近端融资状态`}；前瞻政策路径仍需点阵图(dot plot)/联邦基金期货(Fed funds futures)验证`,
    );
  const supportingEvidence = [];
  const missingEvidence = [
    policyPathEvidence
      ? evidence('policy_forward_path', null, '美联储点阵图(Fed dot plot)/联邦基金期货(Fed funds futures)/隔夜指数掉期远期利率(OIS forward rates)未接入')
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
  const credit = isPlainObject(data?.macroDrivers?.credit) ? data.macroDrivers.credit : {};
  const curve = isPlainObject(data?.macroDrivers?.curve) ? data.macroDrivers.curve : {};
  const fedLiquidity = isPlainObject(data?.macroDrivers?.fedLiquidity) ? data.macroDrivers.fedLiquidity : {};

  const vix = finite(inputs.vix);
  const hyOas = finite(inputs.hyOas);
  const dxy = finite(inputs.dxy);
  const nfci = finite(credit.nfci);
  const igHyRatio = finite(credit.igHyRatio);
  const t10y2y = finite(curve.t10y2y);
  const bgcrSofrSpread = finite(fedLiquidity.bgcrSofrSpread);
  const bgcrSofrBp = bgcrSofrSpread !== null ? bgcrSofrSpread * 100 : null;

  const supportingEvidence = [];
  const missingEvidence = [];
  const contradictingEvidence = [];

  if (pricingCheck.status === 'stress' || finite(pricingCheck.score) >= 50) {
    supportingEvidence.push(evidence('risk_complacency_watch', formatNumber(pricingCheck.score, 0), pricingCheck.summaryZh || '风险资产定价错配检查提示压力'));
  }

  if (!metric) {
    missingEvidence.push(evidence('qqq_zscore', null, 'QQQ 市场温度不可用'));
  } else if (metric.zScore >= 1.5) {
    supportingEvidence.push(evidence('qqq_zscore', formatSigned(metric.zScore), `${metric.bucketLabel}，风险资产价格相对 60 周趋势偏热`));
  }

  if (nfci !== null && hyOas !== null) {
    if (nfci >= 0.5 && hyOas < 3.0) {
      supportingEvidence.push(evidence(
        'nfci_hy_mismatch',
        `金融条件指数(NFCI) ${formatNumber(nfci, 2)} / 高收益债利差(HY OAS) ${formatNumber(hyOas, 2, '%')}`,
        `金融状况显著收紧(金融条件指数(NFCI) ${formatNumber(nfci, 2)})但高收益债利差(HY OAS)仍极度平静(${formatNumber(hyOas, 2, '%')})，信用市场未确认流动性收紧`
      ));
    } else if (nfci >= 0.1 && hyOas < 3.5) {
      supportingEvidence.push(evidence(
        'nfci_hy_mismatch',
        `金融条件指数(NFCI) ${formatNumber(nfci, 2)} / 高收益债利差(HY OAS) ${formatNumber(hyOas, 2, '%')}`,
        `金融状况温和收紧(金融条件指数(NFCI) ${formatNumber(nfci, 2)})但高收益债利差(HY OAS)仍偏窄(${formatNumber(hyOas, 2, '%')})，错配迹象出现`
      ));
    } else if (nfci <= -0.5 && hyOas > 5.0) {
      contradictingEvidence.push(evidence(
        'nfci_hy_mismatch',
        `金融条件指数(NFCI) ${formatNumber(nfci, 2)} / 高收益债利差(HY OAS) ${formatNumber(hyOas, 2, '%')}`,
        `金融状况显著宽松(金融条件指数(NFCI) ${formatNumber(nfci, 2)})且高收益债利差(HY OAS)已警觉(${formatNumber(hyOas, 2, '%')})，反向一致而非错配`
      ));
    }
  }

  if (t10y2y !== null && metric) {
    if (t10y2y <= -0.5 && metric.zScore >= 1.5) {
      supportingEvidence.push(evidence(
        'curve_qqq_mismatch',
        `T10Y2Y ${formatSignedPercent(t10y2y)} / QQQ z ${formatSigned(metric.zScore)}`,
        `曲线深度倒挂 (${formatSignedPercent(t10y2y)}) 但风险资产显著偏热 (${metric.bucketLabel})，晚周期估值错配信号显著`
      ));
    } else if (t10y2y <= -0.2 && metric.zScore >= 1.0) {
      supportingEvidence.push(evidence(
        'curve_qqq_mismatch',
        `T10Y2Y ${formatSignedPercent(t10y2y)} / QQQ z ${formatSigned(metric.zScore)}`,
        `曲线轻度倒挂 (${formatSignedPercent(t10y2y)}) 同时风险资产偏热 (${metric.bucketLabel})，估值与基本面错配`
      ));
    } else if (t10y2y > 0.5 && metric.zScore <= -1.0) {
      contradictingEvidence.push(evidence(
        'curve_qqq_mismatch',
        `T10Y2Y ${formatSignedPercent(t10y2y)} / QQQ z ${formatSigned(metric.zScore)}`,
        `曲线明显陡峭 (${formatSignedPercent(t10y2y)}) 且风险资产偏冷 (${metric.bucketLabel})，方向一致非错配`
      ));
    }
  }

  if (dxy !== null && metric) {
    if (dxy > 108 && metric.zScore >= 1.5) {
      supportingEvidence.push(evidence(
        'dxy_qqq_mismatch',
        `DXY ${formatNumber(dxy, 2)} / QQQ z ${formatSigned(metric.zScore)}`,
        `美元极端强势 (DXY ${formatNumber(dxy, 2)}) 但风险资产显著偏热 (${metric.bucketLabel})，美元紧缩与风险偏好显著错配`
      ));
    } else if (dxy > 105 && metric.zScore >= 1.0) {
      supportingEvidence.push(evidence(
        'dxy_qqq_mismatch',
        `DXY ${formatNumber(dxy, 2)} / QQQ z ${formatSigned(metric.zScore)}`,
        `美元强势 (DXY ${formatNumber(dxy, 2)}) 同时风险资产偏热 (${metric.bucketLabel})，美元与风险偏好错配迹象`
      ));
    } else if (dxy < 95 && metric.zScore <= -1.0) {
      contradictingEvidence.push(evidence(
        'dxy_qqq_mismatch',
        `DXY ${formatNumber(dxy, 2)} / QQQ z ${formatSigned(metric.zScore)}`,
        `美元弱势 (DXY ${formatNumber(dxy, 2)}) 且风险资产偏冷 (${metric.bucketLabel})，方向一致非错配`
      ));
    }
  }

  if (igHyRatio !== null && vix !== null) {
    if (igHyRatio < 0.20 && vix < 16) {
      supportingEvidence.push(evidence(
        'ighy_vix_mismatch',
        `IG/HY ${formatNumber(igHyRatio, 2)} / VIX ${formatNumber(vix, 2)}`,
        `信用市场广度极度恶化 (IG/HY ${formatNumber(igHyRatio, 2)}) 但波动率市场极度平静 (VIX ${formatNumber(vix, 2)})，信用与波动显著错配`
      ));
    } else if (igHyRatio < 0.30 && vix < 20) {
      supportingEvidence.push(evidence(
        'ighy_vix_mismatch',
        `IG/HY ${formatNumber(igHyRatio, 2)} / VIX ${formatNumber(vix, 2)}`,
        `信用市场广度恶化 (IG/HY ${formatNumber(igHyRatio, 2)}) 但波动率市场平静 (VIX ${formatNumber(vix, 2)})，信用与波动错配迹象`
      ));
    } else if (igHyRatio > 0.40 && vix > 25) {
      contradictingEvidence.push(evidence(
        'ighy_vix_mismatch',
        `IG/HY ${formatNumber(igHyRatio, 2)} / VIX ${formatNumber(vix, 2)}`,
        `信用市场广度健康 (IG/HY ${formatNumber(igHyRatio, 2)}) 且波动率市场已警觉 (VIX ${formatNumber(vix, 2)})，方向一致非错配`
      ));
    }
  }

  if (bgcrSofrBp !== null && vix !== null) {
    const absBp = Math.abs(bgcrSofrBp);
    const bpDisplay = `${bgcrSofrBp >= 0 ? '+' : ''}${bgcrSofrBp.toFixed(1)}bp`;
    if (absBp >= 15 && vix < 16) {
      supportingEvidence.push(evidence(
        'repo_vix_mismatch',
        `BGCR-SOFR ${bpDisplay} / VIX ${formatNumber(vix, 2)}`,
        `回购市场显著压力 (BGCR-SOFR ${bpDisplay}) 但波动率市场极度平静 (VIX ${formatNumber(vix, 2)})，融资紧张与波动率显著错配`
      ));
    } else if (absBp >= 5 && vix < 20) {
      supportingEvidence.push(evidence(
        'repo_vix_mismatch',
        `BGCR-SOFR ${bpDisplay} / VIX ${formatNumber(vix, 2)}`,
        `回购市场出现压力 (BGCR-SOFR ${bpDisplay}) 但波动率市场平静 (VIX ${formatNumber(vix, 2)})，融资与波动错配迹象`
      ));
    } else if (absBp < 3 && vix > 25) {
      contradictingEvidence.push(evidence(
        'repo_vix_mismatch',
        `BGCR-SOFR ${bpDisplay} / VIX ${formatNumber(vix, 2)}`,
        `回购市场正常 (BGCR-SOFR ${bpDisplay}) 且波动率市场已警觉 (VIX ${formatNumber(vix, 2)})，方向一致非错配`
      ));
    }
  }

  const supportingCount = supportingEvidence.length;
  const contradictingCount = contradictingEvidence.length;
  const missingCount = missingEvidence.length;

  let interpretation;
  if (supportingCount >= 4) {
    interpretation = '多维错配同步出现（信用、利率、汇率、回购任意三项以上），估值层风险显著，建议持续观察是否扩散至信用利差或波动率市场。';
  } else if (supportingCount >= 2) {
    interpretation = `已出现 ${supportingCount} 个错配信号，估值层与基本面或资金面出现背离，单一指标不足以确认风险扩散。`;
  } else if (supportingCount === 1) {
    interpretation = '出现单一错配迹象，需观察是否与其他维度形成共振；当前尚不足以判断估值层压力扩大。';
  } else if (contradictingCount > 0 && supportingCount === 0) {
    interpretation = '风险资产温度与信用 / 利率 / 汇率方向一致，未形成错配；反向证据反而提示当前定价与基本面同步。';
  } else if (missingCount > 0 && supportingCount === 0 && contradictingCount === 0) {
    interpretation = '错配证据不足，部分关键数据（市场温度 / NFCI / 回购利差）尚未刷新或接入。';
  } else {
    interpretation = '风险资产错配证据不足，仅能保留为观察项。';
  }

  return narrative({
    id: 'risk_asset_mismatch',
    label: '风险资产错配',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    interpretation,
  });
}

function buildOverheatNarrative(metric, data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const consumer = isPlainObject(data?.macroDrivers?.consumer) ? data.macroDrivers.consumer : {};
  const credit = isPlainObject(data?.macroDrivers?.credit) ? data.macroDrivers.credit : {};
  const fedLiquidity = isPlainObject(data?.macroDrivers?.fedLiquidity) ? data.macroDrivers.fedLiquidity : {};

  const hyOas = finite(inputs.hyOas);
  const pmi = finite(consumer.ismManufacturingPmi);
  const umichChange = finite(consumer.threeMonthChange);
  const sloos = finite(credit.sloosTighteningLargeFirms);
  const nfci = finite(credit.nfci);
  const bgcrSofrSpread = finite(fedLiquidity.bgcrSofrSpread);
  const bgcrSofrBp = bgcrSofrSpread !== null ? bgcrSofrSpread * 100 : null;

  const supportingEvidence = [];
  const missingEvidence = [];
  const contradictingEvidence = [];

  // EXISTING evidence (preserved from pre-M-53): QQQ self-state signals
  if (metric) {
    supportingEvidence.push(evidence('qqq_zscore', formatSigned(metric.zScore), metric.bucketLabel));
    supportingEvidence.push(evidence('qqq_close_vs_mean',
      `${formatCurrency(metric.latest.close)} / ${formatCurrency(metric.latest.ma60)}`,
      'QQQ 最新收盘价高于 60 周均值'));
    supportingEvidence.push(evidence('qqq_stddev', formatCurrency(metric.latest.stdDev60),
      '60 周离散度已由 M-26 指标文件提供'));
  } else {
    missingEvidence.push(evidence('qqq_zscore', null,
      '60 周均值、标准差、偏离度(z-score)与更长历史等待接入'));
  }

  // M-53 NEW: hyOas_qqq_complacency contradicting (replaces old credit-confirmation missing)
  // Semantics: QQQ extreme hot but HY OAS still calm = overheat not yet confirmed by credit market spread
  if (hyOas !== null && hyOas < 3.5 && metric?.zScore >= 2) {
    contradictingEvidence.push(evidence('hyOas_qqq_complacency',
      `${formatNumber(hyOas, 2, '%')} / ${formatSigned(metric.zScore)}`,
      `信用利差仍平静 (HY ${formatNumber(hyOas, 2, '%')})，过热扩散尚未被信用市场同步确认`));
  }

  // M-53 NEW: PMI overheat (4-tier)
  // Strong supporting: PMI > 60 (deep expansion)
  // Supporting: PMI > 55 (expansion)
  // No-op: 50-55 (neutral)
  // Contradicting: PMI < 50 (contraction)
  // Strong contradicting: PMI < 45 (deep contraction)
  if (pmi !== null) {
    if (pmi > 60) {
      supportingEvidence.push(evidence('pmi_overheat', formatNumber(pmi, 1),
        `ISM 制造业 PMI ${formatNumber(pmi, 1)}，深度扩张过热`));
    } else if (pmi > 55) {
      supportingEvidence.push(evidence('pmi_overheat', formatNumber(pmi, 1),
        `ISM 制造业 PMI ${formatNumber(pmi, 1)}，扩张支撑过热观察`));
    } else if (pmi < 45) {
      contradictingEvidence.push(evidence('pmi_overheat', formatNumber(pmi, 1),
        `ISM 制造业 PMI ${formatNumber(pmi, 1)}，深度收缩，反驳过热`));
    } else if (pmi < 50) {
      contradictingEvidence.push(evidence('pmi_overheat', formatNumber(pmi, 1),
        `ISM 制造业 PMI ${formatNumber(pmi, 1)}，收缩区间，反驳过热`));
    }
    // 50-55: no-op (neutral)
  }

  // M-53 NEW: SLOOS easing (4-tier)
  // Strong supporting: SLOOS < -15 (significant easing)
  // Supporting: SLOOS < 0 (mild easing)
  // No-op: 0-20
  // Contradicting: SLOOS > 20 (significant tightening)
  if (sloos !== null) {
    if (sloos < -15) {
      supportingEvidence.push(evidence('sloos_easing', formatSigned(sloos, 1) + '%',
        `银行显著放松信贷标准 (SLOOS ${formatSigned(sloos, 1)}%)，信贷宽松催生过热`));
    } else if (sloos < 0) {
      supportingEvidence.push(evidence('sloos_easing', formatSigned(sloos, 1) + '%',
        `银行温和放松信贷标准 (SLOOS ${formatSigned(sloos, 1)}%)，支撑过热观察`));
    } else if (sloos > 20) {
      contradictingEvidence.push(evidence('sloos_easing', formatSigned(sloos, 1) + '%',
        `银行显著收紧信贷标准 (SLOOS ${formatSigned(sloos, 1)}%)，反驳过热扩张`));
    }
    // 0-20: no-op
  }

  // M-53 NEW: hyOas complacency (4-tier, INDEPENDENT of hyOas_qqq_complacency)
  // Strong supporting: hyOas < 3.0 (extreme risk appetite)
  // Supporting: hyOas < 3.5 (high risk appetite)
  // No-op: 3.5-5.0
  // Contradicting: hyOas > 5.0 (credit warning)
  if (hyOas !== null) {
    if (hyOas < 3.0) {
      supportingEvidence.push(evidence('hyoas_complacency', formatNumber(hyOas, 2, '%'),
        `HY 信用利差极窄 (${formatNumber(hyOas, 2, '%')})，极度风险偏好`));
    } else if (hyOas < 3.5) {
      supportingEvidence.push(evidence('hyoas_complacency', formatNumber(hyOas, 2, '%'),
        `HY 信用利差偏窄 (${formatNumber(hyOas, 2, '%')})，风险偏好高`));
    } else if (hyOas > 5.0) {
      contradictingEvidence.push(evidence('hyoas_complacency', formatNumber(hyOas, 2, '%'),
        `HY 信用利差走宽 (${formatNumber(hyOas, 2, '%')})，信用市场警觉，反驳过热`));
    }
    // 3.5-5.0: no-op
  }

  // M-53 NEW: NFCI easing (4-tier)
  // Strong supporting: NFCI <= -0.5 (significant easing)
  // Supporting: NFCI <= -0.1 (mild easing)
  // No-op: -0.1 to 0.5
  // Contradicting: NFCI >= 0.5 (significant tightening)
  if (nfci !== null) {
    if (nfci <= -0.5) {
      supportingEvidence.push(evidence('nfci_easing', formatSigned(nfci, 2),
        `NFCI 显著宽松 (${formatSigned(nfci, 2)})，金融状况为过热提供土壤`));
    } else if (nfci <= -0.1) {
      supportingEvidence.push(evidence('nfci_easing', formatSigned(nfci, 2),
        `NFCI 温和宽松 (${formatSigned(nfci, 2)})，支撑过热观察`));
    } else if (nfci >= 0.5) {
      contradictingEvidence.push(evidence('nfci_easing', formatSigned(nfci, 2),
        `NFCI 显著收紧 (${formatSigned(nfci, 2)})，金融状况已警觉，反驳过热`));
    }
    // -0.1 to 0.5: no-op
  }

  // M-53 NEW: UMCSENT improving (3-tier)
  // Supporting: 3m change > +6 (significant improvement)
  // No-op: -8 to +6
  // Contradicting: 3m change < -8 (significant weakening)
  if (umichChange !== null) {
    if (umichChange > 6) {
      supportingEvidence.push(evidence('umich_improving', formatSigned(umichChange, 1),
        `密歇根消费者信心 3 月变化 ${formatSigned(umichChange, 1)}，消费者明显改善`));
    } else if (umichChange < -8) {
      contradictingEvidence.push(evidence('umich_improving', formatSigned(umichChange, 1),
        `密歇根消费者信心 3 月变化 ${formatSigned(umichChange, 1)}，消费者明显走弱，反驳过热`));
    }
    // -8 to +6: no-op
  }

  // M-53 NEW: BGCR-SOFR repo zero stress (3-tier)
  // Supporting: |bp| < 3 (zero stress, abundant liquidity)
  // No-op: 3-10 bp
  // Contradicting: |bp| >= 10 (repo stress)
  if (bgcrSofrBp !== null) {
    const absBp = Math.abs(bgcrSofrBp);
    const bpDisplay = `${bgcrSofrBp >= 0 ? '+' : ''}${bgcrSofrBp.toFixed(1)}bp`;
    if (absBp < 3) {
      supportingEvidence.push(evidence('repo_zero_stress', bpDisplay,
        `回购市场零压力 (BGCR-SOFR ${bpDisplay})，流动性充裕，过热土壤`));
    } else if (absBp >= 10) {
      contradictingEvidence.push(evidence('repo_zero_stress', bpDisplay,
        `回购市场压力 (BGCR-SOFR ${bpDisplay})，融资紧张，反驳过热`));
    }
    // 3-10 bp: no-op
  }

  // M-53: Multi-level interpretation based on actual evidence counts
  const supportingCount = supportingEvidence.length;
  const contradictingCount = contradictingEvidence.length;
  const missingCount = missingEvidence.length;

  let interpretation;
  if (supportingCount >= 5) {
    interpretation = '多维度过热同步出现（QQQ 温度、信贷、信用、金融状况、消费者、回购任意四项以上），估值层处于扩张顶部，建议持续观察是否扩散至通胀和就业。';
  } else if (supportingCount >= 3) {
    interpretation = `已出现 ${supportingCount} 个过热信号，估值层与基本面共振，过热扩散正在展开。`;
  } else if (supportingCount === 1 || supportingCount === 2) {
    interpretation = '出现过热迹象，需观察是否扩散到更多维度；当前尚不足以判断扩张顶部。';
  } else if (contradictingCount >= 3) {
    interpretation = '多维度经济疲软同步出现（信贷收紧 / 信用警觉 / 增长收缩任意三项以上），反向证据显著，未过热而是收缩。';
  } else if (contradictingCount > 0 && supportingCount === 0) {
    interpretation = '过热未确认；反向证据显示基本面与估值层方向不一致。';
  } else if (missingCount > 0 && supportingCount === 0 && contradictingCount === 0) {
    interpretation = '过热证据不足，部分关键数据（PMI / SLOOS / NFCI / 回购利差）尚未刷新或接入。';
  } else {
    interpretation = '过热证据不足，仅能保留为观察项。';
  }

  // M-53: assessment redesign
  // Priority 1: metric?.zScore >= 2 forces 'strong_confirmation' (preserve pre-M-53 behavior)
  // Priority 2: omitted assessment lets assessEvidence fallback evaluate supporting/contradicting balance
  const explicitAssessment = metric?.zScore >= 2 ? 'strong_confirmation' : void 0;

  return narrative({
    id: 'overheat_confirmation',
    label: '过热确认',
    supportingEvidence,
    missingEvidence,
    contradictingEvidence,
    assessment: explicitAssessment,
    interpretation,
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

  if (hyOas !== null && hyOas > 5) supportingEvidence.push(evidence('hy_oas', formatNumber(hyOas, 2, '%'), '高收益债利差(HY OAS)高于 5.0%'));
  if (igOas !== null && igOas > 1.5) supportingEvidence.push(evidence('ig_oas', formatNumber(igOas, 2, '%'), '投资级利差(IG OAS)高于 1.5%'));
  if (igHyRatio !== null && igHyRatio < 0.25) supportingEvidence.push(evidence('ig_hy_ratio', formatNumber(igHyRatio, 2), '投资级债/高收益债(IG/HY)比例低于 0.25，信用广度恶化'));
  if (ratesCheck.status === 'stress') supportingEvidence.push(evidence('rates_vs_risk_assets', formatNumber(ratesCheck.score, 0), ratesCheck.summaryZh || '利率与风险资产检查提示压力'));
  // M-48: NFCI moves from hardcoded missing evidence to dynamic bank-stress classification.
  if (nfci === null) {
    missingEvidence.push(evidence('bank_stress_index', null, '银行压力指数（NFCI）尚未接入'));
  } else if (nfci >= 0.5) {
    supportingEvidence.push(evidence(
      'nfci',
      `${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}`,
      `金融条件指数(NFCI) ${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}，金融状况显著收紧（${nfciRegime}），银行与同业压力同步信用利差预警`
    ));
  } else if (nfci >= 0.1) {
    supportingEvidence.push(evidence(
      'nfci',
      `${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}`,
      `金融条件指数(NFCI) ${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}，金融状况温和收紧（${nfciRegime}），支持信用压力观察`
    ));
  } else if (nfci <= -0.5) {
    contradictingEvidence.push(evidence(
      'nfci',
      `${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}`,
      `金融条件指数(NFCI) ${formatNumber(nfci, 2)}，金融状况显著宽松（${nfciRegime}），强烈反驳信用利差预警`
    ));
  } else if (nfci < -0.1) {
    contradictingEvidence.push(evidence(
      'nfci',
      `${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)}`,
      `金融条件指数(NFCI) ${formatNumber(nfci, 2)}，金融状况温和宽松（${nfciRegime}），反驳信用压力扩散`
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
  const bgcrSofrSpread = finite(fed.bgcrSofrSpread);
  const repoSpreadRegime = typeof fed.repoSpreadRegime === 'string' ? fed.repoSpreadRegime : null;
  const sloosTighteningLargeFirms = finite(credit.sloosTighteningLargeFirms);
  const sloosTighteningSmallFirms = finite(credit.sloosTighteningSmallFirms);
  const supportingEvidence = [];
  const missingEvidence = [];
  const contradictingEvidence = [];

  // onRrp is stored in USD billions in the current data product; below 200B is treated as scarce reserve buffer.
  if (onRrp !== null && onRrp < 200) supportingEvidence.push(evidence('on_rrp', `${formatNumber(onRrp, 3)}B`, 'ON RRP 低于 200B，准备金缓冲偏薄'));
  if (dxy !== null && dxy > 105) supportingEvidence.push(evidence('dxy', formatNumber(dxy, 2), '广义美元高于 105'));
  if (t10y2y !== null && t10y2y > 0.5) supportingEvidence.push(evidence('t10y2y', formatNumber(t10y2y, 2), '曲线陡峭度高于 +0.5'));
  if (walcl4wChange !== null && walcl4wChange < -50) supportingEvidence.push(evidence('walcl4wChange', formatNumber(walcl4wChange, 1), '美联储(Fed)资产负债表 4 周收缩超过 50B'));
  if (onRrp !== null && onRrp > 1000) contradictingEvidence.push(evidence('on_rrp', `${formatNumber(onRrp, 1)}B`, 'ON RRP 高于 1T，流动性缓冲仍充裕'));
  if (walcl4wChange !== null && walcl4wChange > 50) contradictingEvidence.push(evidence('walcl4wChange', formatNumber(walcl4wChange, 1), '美联储(Fed)资产负债表 4 周扩张超过 50B'));

  // M-50: repo_stress moves from hardcoded missing evidence to BGCR-SOFR spread classification.
  if (bgcrSofrSpread === null) {
    missingEvidence.push(evidence('repo_stress', null, 'BGCR/TGCR 回购利差指标未接入'));
  } else {
    const bp = bgcrSofrSpread * 100;
    const absBp = Math.abs(bp);
    const bpDisplay = `${bp >= 0 ? '+' : ''}${bp.toFixed(1)}bp`;
    const regimeText = repoSpreadRegime ? `（${repoSpreadRegime}）` : '';

    if (absBp >= 25) {
      supportingEvidence.push(evidence(
        'repo_stress',
        bpDisplay,
        `BGCR-SOFR 利差 ${bpDisplay}${regimeText}，达到危机水平，回购市场压力显著确认流动性收紧`
      ));
    } else if (absBp >= 10) {
      supportingEvidence.push(evidence(
        'repo_stress',
        bpDisplay,
        `BGCR-SOFR 利差 ${bpDisplay}${regimeText}，回购市场出现压力分层，支持流动性收紧观察`
      ));
    } else if (absBp >= 5) {
      supportingEvidence.push(evidence(
        'repo_stress',
        bpDisplay,
        `BGCR-SOFR 利差 ${bpDisplay}${regimeText}，轻微偏离正常，回购市场有轻微摩擦`
      ));
    } else {
      contradictingEvidence.push(evidence(
        'repo_stress',
        bpDisplay,
        `BGCR-SOFR 利差 ${bpDisplay}${regimeText}，回购市场正常运行，不支持流动性收紧叙事`
      ));
    }
  }

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
  const state = typeof world.state === 'string' ? world.state : null;
  const labelZh = typeof world.labelZh === 'string' ? world.labelZh : null;
  const dimensions = isPlainObject(world.dimensions) ? world.dimensions : {};
  const dominantDriver = safeArray(world.dominantDrivers).find((item) => isPlainObject(item)) || null;
  const economicWeaponization = isPlainObject(dimensions.economicWeaponization) ? dimensions.economicWeaponization : {};
  const capitalControlRisk = isPlainObject(dimensions.capitalControlRisk) ? dimensions.capitalControlRisk : {};
  const blocFormation = isPlainObject(dimensions.blocFormation) ? dimensions.blocFormation : {};
  const multiTheaterConflict = isPlainObject(dimensions.multiTheaterConflict) ? dimensions.multiTheaterConflict : {};
  const marketConfirmation = isPlainObject(dimensions.marketConfirmation) ? dimensions.marketConfirmation : {};
  const confirmationSource = world.marketConfirmationInput?.source;
  const externalSources = isPlainObject(world.externalSources) ? world.externalSources : {};
  const gdeltStatus = typeof externalSources.gdelt?.status === 'string' ? externalSources.gdelt.status : null;
  const gdeltToneProxy = finite(externalSources.gdelt?.summary?.toneProxy);
  const gdeltTotalEvents = finite(externalSources.gdelt?.summary?.totalEvents);
  const gdeltCountryCount = finite(externalSources.gdelt?.summary?.countryCount);
  const gdeltFatalities = finite(externalSources.gdelt?.summary?.fatalities);
  const gdeltKeyRegions = safeArray(externalSources.gdelt?.summary?.keyConflictRegions);
  const sipriStatus = typeof externalSources.sipri?.status === 'string' ? externalSources.sipri.status : null;
  const sipriGlobalTrend = externalSources.sipri?.summary?.globalMilitarySpendTrend;
  const sipriMajorPowerTrend = externalSources.sipri?.summary?.majorPowerMilitarySpendTrend;
  const sipriGdpShareTrend = externalSources.sipri?.summary?.militarySpendShareOfGDPTrend;
  const sipri5yrGrowth = finite(externalSources.sipri?.summary?.globalFiveYearGrowthPct);
  const sipriGdpShare = finite(externalSources.sipri?.summary?.militarySpendShareOfGdpPct);
  const sipriRisingPowers = finite(externalSources.sipri?.summary?.risingMajorPowers);
  const sipriMajorPowersTracked = finite(externalSources.sipri?.summary?.majorPowersTracked);
  const sipriUpdatedYear = finite(externalSources.sipri?.summary?.updatedYear);
  const ofacRecentActionsCount = finite(externalSources.ofac?.summary?.recentActionsCount);
  const decisionModifier = isPlainObject(world.decisionModifier) ? world.decisionModifier : {};
  const riskBias = typeof decisionModifier.riskBias === 'string' ? decisionModifier.riskBias : null;
  const supportingEvidence = [];
  const missingEvidence = [];
  const contradictingEvidence = [];

  if (score !== null && score >= 50) supportingEvidence.push(evidence('world_order_score', formatNumber(score, 0), '世界秩序压力接近或进入高压区间'));
  if (state && state !== 'normal_globalization') {
    supportingEvidence.push(evidence('world_order_state', labelZh || state, `结构性状态为 ${labelZh || state}，提示全球化摩擦已经进入可观察区间`));
  }
  if (dominantDriver) {
    const driverScore = finite(dominantDriver.score);
    const driverLabel = dominantDriver.labelZh || dominantDriver.key || '主导驱动';
    if (driverScore !== null && driverScore >= 50) {
      supportingEvidence.push(evidence('dominant_driver', `${driverLabel} ${formatNumber(driverScore, 0)}`, '世界秩序压力主导驱动已经高于 50 分'));
    }
  }
  for (const [source, dimension] of [
    ['economic_weaponization', economicWeaponization],
    ['capital_control_risk', capitalControlRisk],
    ['bloc_formation', blocFormation],
    ['multi_theater_conflict', multiTheaterConflict],
  ]) {
    const dimensionScore = finite(dimension.score);
    if (dimensionScore !== null && dimensionScore >= 50) {
      supportingEvidence.push(evidence(source, `${dimension.labelZh || source} ${formatNumber(dimensionScore, 0)}`, `${dimension.labelZh || source} 维度高于 50 分，强化结构性世界秩序压力`));
    }
  }
  if (marketConfirmation.state === 'confirmed' || marketConfirmation.state === 'partial_confirmed') {
    const marketScore = finite(marketConfirmation.score);
    supportingEvidence.push(evidence(
      'world_order_market_confirmation',
      marketScore === null ? marketConfirmation.state : `${marketConfirmation.state} ${formatNumber(marketScore, 0)}`,
      `${marketConfirmation.labelZh || '市场确认'}维度为 ${marketConfirmation.state}，说明快变量对结构性压力有部分确认`
    ));
  }
  if (world.freshness === 'fresh') supportingEvidence.push(evidence('world_order_freshness', world.freshness, '外部来源新鲜'));
  if (confidence !== null && confidence >= 0.5) supportingEvidence.push(evidence('world_order_confidence', `${Math.round(confidence * 100)}%`, '置信度达到 50% 以上'));
  if (confirmationSource && confirmationSource !== 'no-confirmation') supportingEvidence.push(evidence('market_confirmation_source', confirmationSource, '存在市场确认输入'));
  // M-51 fix-up: Only use toneProxy as supporting evidence when GDELT status is 'ok'.
  // When status === 'stale', the existing 'gdelt' missingEvidence applies instead.
  // This prevents the contradictory state where a stale source provides both
  // 'missing' AND 'supporting' evidence simultaneously.
  if (gdeltStatus === 'ok' && gdeltToneProxy !== null && gdeltToneProxy <= -0.3) {
    supportingEvidence.push(evidence(
      'gdelt_tone_proxy',
      formatSigned(gdeltToneProxy, 2),
      `GDELT 媒体情绪 ${formatSigned(gdeltToneProxy, 2)}，负面情绪强烈`
    ));
  }
  if (gdeltStatus === 'ok' && gdeltTotalEvents !== null && gdeltTotalEvents >= 200) {
    supportingEvidence.push(evidence(
      'gdelt_event_density',
      formatNumber(gdeltTotalEvents, 0),
      `GDELT Cloud 近 7 天 ${gdeltTotalEvents} 起冲突事件，密度可观察`
    ));
  }
  if (gdeltStatus === 'ok' && gdeltCountryCount !== null && gdeltCountryCount >= 30) {
    supportingEvidence.push(evidence(
      'gdelt_multi_country',
      formatNumber(gdeltCountryCount, 0),
      `GDELT Cloud 显示冲突事件跨 ${gdeltCountryCount} 个国家/地区分布`
    ));
  }
  if (gdeltStatus === 'ok' && gdeltFatalities !== null && gdeltFatalities >= 100) {
    supportingEvidence.push(evidence(
      'gdelt_fatalities',
      formatNumber(gdeltFatalities, 0),
      `GDELT Cloud 近 7 天累计 ${gdeltFatalities} 起死亡事件，结构性压力显著`
    ));
  }
  if (gdeltStatus === 'ok' && gdeltKeyRegions.length >= 3) {
    supportingEvidence.push(evidence(
      'gdelt_key_regions',
      gdeltKeyRegions.slice(0, 5).join('、'),
      `GDELT Cloud 显示关键冲突区域 ${gdeltKeyRegions.slice(0, 5).join('、')} 同时活跃`
    ));
  }
  // M-61: SIPRI supporting branches (GDELT-style) + extended missing categories
  if (sipriStatus === 'ok' && sipriGlobalTrend === 'rising' && sipri5yrGrowth !== null) {
    supportingEvidence.push(evidence(
      'sipri_global_arms_race',
      `${formatNumber(sipri5yrGrowth, 1)}%`,
      `SIPRI ${sipriUpdatedYear ?? ''} 显示全球军费 5 年累计增长 ${formatNumber(sipri5yrGrowth, 1)}%，达「rising」阈值，反映全球军备扩张周期`,
    ));
  }
  if (sipriStatus === 'ok' && sipriMajorPowerTrend === 'rising' && sipriRisingPowers !== null && sipriMajorPowersTracked !== null) {
    supportingEvidence.push(evidence(
      'sipri_major_powers_rising',
      `${sipriRisingPowers}/${sipriMajorPowersTracked}`,
      `SIPRI 主要大国军费多数上升 (${sipriRisingPowers}/${sipriMajorPowersTracked})，多极军备升级趋势`,
    ));
  }
  if (
    sipriStatus === 'ok' &&
    (sipriGdpShareTrend === 'rising' || (sipriGlobalTrend === 'rising' && sipriGdpShare !== null && sipriGdpShare >= 2.5))
  ) {
    supportingEvidence.push(evidence(
      'sipri_gdp_share_rising',
      sipriGdpShare === null ? 'rising' : `${formatNumber(sipriGdpShare, 1)}%`,
      sipriGdpShare === null
        ? 'SIPRI 全球军费占 GDP 比重上升，财政战备倾斜结构性强化'
        : `SIPRI 全球军费占 GDP 比重升至 ${formatNumber(sipriGdpShare, 1)}%（2016 年为 2.2%），财政战备倾斜结构性强化`,
    ));
  }
  if (ofacRecentActionsCount !== null && ofacRecentActionsCount > 0) {
    supportingEvidence.push(evidence('ofac_recent_actions', formatNumber(ofacRecentActionsCount, 0), 'OFAC 近期行动为非零，经济金融武器化维度存在现实活动'));
  }
  if (riskBias === 'upward') {
    supportingEvidence.push(evidence('decision_modifier_risk_bias', riskBias, 'World Order modifier 对结构性风险给出 upward bias'));
  } else if (riskBias) {
    missingEvidence.push(evidence('decision_modifier_risk_bias', riskBias, 'World Order modifier 当前未提高 riskBias，保持结构性解释层边界'));
  }
  if (externalSources.gdelt?.status === 'stale') missingEvidence.push(evidence('gdelt', 'stale', 'GDELT 当前为 stale'));
  // M-63a fix-up: handle all ACLED status values (was only not_configured)
  if (externalSources.acled?.status === 'ok') {
    const acledSummary = externalSources.acled?.summary || {};
    const delta = Number.isFinite(acledSummary.eventsDelta4Vs12)
      ? `${Math.round(acledSummary.eventsDelta4Vs12 * 100)}%`
      : '不可比';
    supportingEvidence.push(evidence('acled', `latestWeek=${acledSummary.latestWeek || '?'} delta=${delta}`, `ACLED 真实周度数据已导入，覆盖 ${acledSummary.regionsTracked || '?'} 个区域，4 周 vs 12 周冲突变化 ${delta}`));
  } else if (externalSources.acled?.status === 'manual_required') {
    missingEvidence.push(evidence('acled', 'manual_required', 'ACLED xlsx 尚未由 operator 手动导入'));
  } else if (externalSources.acled?.status === 'not_configured') {
    missingEvidence.push(evidence('acled', 'not_configured', 'ACLED 尚未配置'));
  }
  if (sipriStatus === 'manual_required') missingEvidence.push(evidence('sipri', 'manual_required', 'SIPRI 慢变量仍需手动导入'));
  else if (sipriStatus === 'error') missingEvidence.push(evidence('sipri', 'error', 'SIPRI normalized 数据校验失败，请检查配置文件'));
  else if (sipriStatus === 'disabled') missingEvidence.push(evidence('sipri', 'disabled', 'SIPRI 模块已禁用'));
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
      ? '世界秩序压力已能从状态、主导驱动、维度分项与外部源活动中形成结构性背景，但来源新鲜度和置信度仍限制结论强度。'
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
    gaps.length ? `${gaps.length} 条逻辑链可接入更深佐证源` : '佐证源已较完整',
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

const MACRO_COHERENCE_WORLD_KEYS = [
  'stoxx50', 'nikkei225', 'dax', 'ftse100', 'cac40', 'stoxx600',
  'kospi', 'asx200', 'sti', 'taiex', 'nifty50', 'bovespa',
];

function coherenceSignal(id, perspectiveZh, verdict, timeRole, reason, dataUsed, caveat) {
  return {
    id,
    perspectiveZh,
    verdict,
    timeRole,
    reason: String(reason || ''),
    dataUsed: safeArray(dataUsed),
    caveat: String(caveat || ''),
  };
}

// 批 E · 跨市场印证层(Design B'):display-only 纯定性,不改 consistencyScore,不落盘,不进 scoring/decision。
export function buildMacroCoherence(data = {}, matrix = {}, marketPricingMetricsData = null) {
  const md = isPlainObject(data?.macroDrivers) ? data.macroDrivers : {};
  const baseline = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const matrixNarratives = safeArray(matrix?.narratives);
  const metric = getLatestMetric(marketPricingMetricsData);
  const usZ = metric ? metric.zScore : null;
  const vix = finite(baseline.vix);
  const signals = [];

  // E1 · V2X vs VIX 地区波动率背离(同步)
  {
    const euro = isPlainObject(md.euroVolatility) ? md.euroVolatility : {};
    const v2x = euro.sourceStatus === 'live' ? finite(euro.value) : null;
    const caveat = '欧元区波动率(V2X)与波动率指数(VIX)高度相关,只取背离;波动率指数(VIX)已计入主评分,不重复计数恐慌。';
    if (v2x === null || vix === null) {
      signals.push(coherenceSignal('v2x_vix_divergence', '欧美波动率(V2X/VIX)', '背景', '同步',
        '欧元区波动率(V2X)或波动率指数(VIX)未刷新,暂不判定地区波动率背离。', ['euroVolatility.value', 'vix'], caveat));
    } else {
      const spread = v2x - vix;
      let verdict, reason;
      if (spread >= 2.5) {
        verdict = '背离';
        reason = `欧元区波动率(V2X) ${formatNumber(v2x, 1)} 高于美国波动率指数(VIX) ${formatNumber(vix, 1)}(+${formatNumber(spread, 1)}),恐慌偏欧洲地区性,美国市价读数或低估广度。`;
      } else if (spread <= -2.5) {
        verdict = '背离';
        reason = `美国波动率指数(VIX) ${formatNumber(vix, 1)} 高于欧元区波动率(V2X) ${formatNumber(v2x, 1)}(${formatNumber(spread, 1)}),恐慌偏美国单市场性。`;
      } else {
        verdict = '印证';
        reason = `欧美波动率同步(差 ${formatNumber(spread, 1)}),恐慌为系统性而非地区性,与核心一致。`;
      }
      signals.push(coherenceSignal('v2x_vix_divergence', '欧美波动率(V2X/VIX)', verdict, '同步', reason,
        ['euroVolatility.value', 'vix'], caveat));
    }
  }

  // E2 · 全球股指广度同步 vs 局部(同步)
  {
    const we = isPlainObject(md.worldEconomy) ? md.worldEconomy : {};
    let up = 0, down = 0;
    for (const k of MACRO_COHERENCE_WORLD_KEYS) {
      const cp = finite(we?.[k]?.changePct);
      if (cp === null) continue;
      if (cp > 0) up += 1; else if (cp < 0) down += 1;
    }
    const n = up + down;
    const caveat = '本币计价/时区错位/无成分股广度(breadth),与标普500(SPX)高贝塔(beta)重叠;只作同步/确认,不作领先。';
    const usTempZh = usZ === null ? null : (usZ > 0.5 ? '偏热' : (usZ < -0.5 ? '偏冷' : '中性'));
    const usStr = usTempZh ? `美股${usTempZh}(z ${formatSigned(usZ)})` : '美股温度暂缺';
    if (n < 6) {
      signals.push(coherenceSignal('global_breadth', '全球股指广度', '背景', '同步',
        `全球指数有效样本不足(${n}/12),暂不判定广度。`,
        ['worldEconomy.changePct', 'qqq.zScore'], caveat));
    } else {
      const breadthStr = `全球 ${up} 涨 / ${down} 跌`;
      const tilt = (up - down >= 3) ? 'up' : ((down - up >= 3) ? 'down' : 'balanced');
      const usRiskOff = usZ !== null && usZ <= 0;
      const usRiskOn = usZ !== null && usZ > 0;
      let verdict, reason;
      if (tilt === 'down' && usRiskOff) {
        verdict = '印证';
        reason = `${breadthStr},多数走弱、且${usStr},全球系统性走弱与核心同向(非美国孤立)。`;
      } else if (tilt === 'down' && usRiskOn) {
        verdict = '背离';
        reason = `${breadthStr},多数走弱但${usStr},美股相对全球偏强、广度背离(美国局部强势)。`;
      } else if (tilt === 'up' && usRiskOn) {
        verdict = '印证';
        reason = `${breadthStr},多数走强、且${usStr},全球风险偏好同步。`;
      } else if (tilt === 'up' && usRiskOff) {
        verdict = '背离';
        reason = `${breadthStr},多数走强但${usStr},美股相对全球偏弱、广度背离。`;
      } else if (usTempZh) {
        verdict = '背景';
        reason = `${breadthStr},广度均衡;${usStr},但全球未单边同向,系统性压力暂未扩散。`;
      } else {
        verdict = '背景';
        const tiltZh = tilt === 'down' ? '多数走弱' : (tilt === 'up' ? '多数走强' : '广度均衡');
        reason = `${breadthStr}(${tiltZh});美股温度暂缺,暂作系统性背景观察。`;
      }
      signals.push(coherenceSignal('global_breadth', '全球股指广度', verdict, '同步', reason,
        ['worldEconomy.changePct', 'qqq.zScore'], caveat));
    }
  }

  // E3 · 实体-市场错配 Main St vs Wall St(滞后)
  {
    const emp = isPlainObject(md.employment) ? md.employment : {};
    const cr = isPlainObject(md.consumerRetail) ? md.consumerRetail : {};
    const claims4w = finite(emp.initialClaims4wChange);
    const realRetail = finite(cr.cartsRealYoY);
    const caveat = '周/月频滞后,只论持续性不论今日紧迫度;只用初请失业金(ICSA)+零售销售(CARTS)+红皮书零售(Redbook),职位空缺(JOLTS)/平均时薪(AHE)/U-6 失业率(U-6)季频不纳入。';
    const dataUsed = ['employment.initialClaims4wChange', 'consumerRetail.cartsRealYoY', 'consumerRetail.redbookRetailSalesYoY'];
    if (claims4w === null && realRetail === null) {
      signals.push(coherenceSignal('main_vs_wall', '实体-市场错配', '背景', '滞后',
        '就业/零售实体数据未刷新,暂不判定。', dataUsed, caveat));
    } else {
      const marketLoose = (usZ !== null && usZ > 0) || (vix !== null && vix < 18);
      const entityWeak = (claims4w !== null && claims4w > 5000) || (realRetail !== null && realRetail < 0);
      const entityStrong = (claims4w !== null && claims4w < 0) && (realRetail !== null && realRetail > 0);
      let verdict, reason;
      if (entityWeak && marketLoose) {
        verdict = '背离';
        const bits = [];
        if (claims4w !== null && claims4w > 5000) bits.push(`初请 4 周 +${formatNumber(claims4w, 0)}`);
        if (realRetail !== null && realRetail < 0) bits.push(`实际零售 ${formatSignedPercent(realRetail * 100, 1)}`);
        reason = `市价偏松/偏热,但${bits.join('、')} → 持续性存疑,基本面未确认。`;
      } else if (entityStrong && marketLoose) {
        verdict = '印证';
        reason = `实体(初请下行 + 实际零售 ${formatSignedPercent(realRetail * 100, 1)})与市价同向,基本面支持。`;
      } else {
        verdict = '背景';
        reason = `实体与市价未形成明确错配(初请 4 周 ${claims4w === null ? '—' : formatSigned(claims4w, 0)} / 实际零售 ${realRetail === null ? '—' : formatSignedPercent(realRetail * 100, 1)})。`;
      }
      signals.push(coherenceSignal('main_vs_wall', '实体-市场错配', verdict, '滞后', reason, dataUsed, caveat));
    }
  }

  // E4 · 公开信用代理 vs HY/IG 背离(领先/同步)
  {
    const pc = isPlainObject(md.privateCreditProxy) ? md.privateCreditProxy : {};
    const credit = isPlainObject(md.credit) ? md.credit : {};
    const bdc = finite(pc.bdcEtf4wChange);
    const pbdc = finite(pc.pbdcEtf4wChange);
    const hyOas = finite(baseline.hyOas ?? credit.hyOas);
    const proxyVals = [bdc, pbdc].filter((x) => x !== null);
    const caveat = '高收益债(HY)/投资级债(IG)已计入主评分,只取公开信用市场与代理资产的背离;商业发展公司(BDC)/优先贷款ETF(SRLN)/区间基金净值(CCLFX)/信用违约互换指数(CDX)是公开基金/净值/指数代理,无折价字段、非私募内部估值,不得写"隐藏私募裂缝已确认"。';
    const dataUsed = ['privateCreditProxy.bdcEtf4wChange', 'privateCreditProxy.pbdcEtf4wChange', 'hyOas', 'credit.igOas'];
    if (proxyVals.length === 0 || hyOas === null) {
      signals.push(coherenceSignal('public_credit_proxy', '公开信用代理', '背景', '领先/同步',
        '公开信用代理或 HY 利差未刷新,暂不判定。', dataUsed, caveat));
    } else {
      const proxyAvg = proxyVals.reduce((a, b) => a + b, 0) / proxyVals.length;
      const proxyWeak = proxyAvg <= -0.03;
      const proxyStable = proxyAvg >= 0;
      const creditCalm = hyOas < 3.5;
      let verdict, reason;
      if (proxyWeak && creditCalm) {
        verdict = '背离';
        reason = `公开商业发展公司(BDC)/优先贷款ETF(SRLN)4 周走弱(均 ${formatSignedPercent(proxyAvg * 100, 1)})但高收益债利差(HY OAS)仍平静(${formatNumber(hyOas, 2)}%),公开信用代理出现压力、利差尚未确认。`;
      } else if (proxyWeak && hyOas > 5) {
        verdict = '印证';
        reason = `公开信用代理(${formatSignedPercent(proxyAvg * 100, 1)})与高收益债利差(HY OAS)(${formatNumber(hyOas, 2)}%)同向走弱,信用压力一致。`;
      } else if (proxyStable && creditCalm) {
        verdict = '印证';
        reason = `公开信用代理平稳(${formatSignedPercent(proxyAvg * 100, 1)})且高收益债利差(HY OAS)平静(${formatNumber(hyOas, 2)}%),信用面无背离。`;
      } else {
        verdict = '背景';
        reason = `公开信用代理 ${formatSignedPercent(proxyAvg * 100, 1)} / 高收益债利差(HY OAS) ${formatNumber(hyOas, 2)}%,无明确背离/确认。`;
      }
      signals.push(coherenceSignal('public_credit_proxy', '公开信用代理', verdict, '领先/同步', reason, dataUsed, caveat));
    }
  }

  // E5 · 中国/EM 弱慢背景(verdict 恒为 '背景',慢背景)
  {
    const prop = isPlainObject(md.chinaPropertyPrice) ? md.chinaPropertyPrice : {};
    const ppi = finite(md.chinaInflation?.ppi?.yoy);
    const pmi = finite(md.chinaPmi?.pmi?.value);
    const newUp = finite(prop.newCitiesUp);
    const newDown = finite(prop.newCitiesDown);
    const bits = [];
    if (pmi !== null) bits.push(`采购经理指数(PMI) ${formatNumber(pmi, 1)}${pmi < 50 ? '(收缩)' : pmi > 50 ? '(扩张)' : '(临界)'}`);
    if (ppi !== null) bits.push(`工业品出厂价格(PPI) ${formatSignedPercent(ppi * 100, 1)}`);
    if (newUp !== null && newDown !== null) bits.push(`70 城新房 ${newUp} 涨/${newDown} 跌`);
    let reason;
    if (bits.length) {
      const weakDemand = (pmi !== null && pmi < 50.5) || (newUp !== null && newDown !== null && newDown > newUp) || (ppi !== null && ppi < 0.005);
      const stance = weakDemand
        ? '中国内需/地产偏弱 → 对全球商品需求与再通胀是下行背景,与今日能源 → 通胀主线方向相反(倾向缓冲而非放大通胀)'
        : '中国内需边际企稳 → 对全球商品需求与再通胀是中性偏支撑背景';
      reason = `${bits.join(' / ')};${stance};仅作慢背景、不作领先。`;
    } else {
      reason = '中国宏观数据未刷新,作弱慢背景观察。';
    }
    signals.push(coherenceSignal('china_em_background', '中国/新兴市场(EM)弱慢背景', '背景', '慢背景', reason,
      ['chinaPropertyPrice.newCitiesUp/Down', 'chinaInflation.ppi.yoy', 'chinaPmi.pmi.value', 'cfetsRmb.cfets'],
      '东方财富(EastMoney)转载非官方原始;不用央行毛额做流动性脉冲;人民币篮子指数(CFETS)受管理篮子≠资本外流;月频慢变量只作背景。'));
  }

  // E6/E7 · 引用既有矩阵 narrative(不重建逻辑)
  const refRow = (narrId, id, perspectiveZh, timeRole, coveredZh) => {
    const nar = matrixNarratives.find((x) => x?.id === narrId);
    const a = nar?.assessment;
    // reason 必须随 verdict 走:被引用 narrative 因 metric 缺失/反向证据而非确认态时,
    // 不能再写死「已确认」(否则出现 verdict=背离/背景 但文案说已确认的自相矛盾)。
    let verdict, reason;
    if (a === 'strong_confirmation' || a === 'partial_confirmation') {
      verdict = '印证';
      reason = `已在交叉验证矩阵确认(${coveredZh}),此处不重复计数。`;
    } else if (a === 'contradiction') {
      verdict = '背离';
      reason = `交叉验证矩阵中为反向证据(${coveredZh}),此处不重复计数。`;
    } else {
      verdict = '背景';
      reason = `交叉验证矩阵中证据不足或未激活(${coveredZh}),此处不重复计数。`;
    }
    signals.push(coherenceSignal(id, perspectiveZh, verdict, timeRole, reason,
      [`matrix.${narrId}`], '与上方一致性矩阵同源,避免重复计数。'));
  };
  refRow('overheat_confirmation', 'overheat_ref', '估值过热(已覆盖)', '同步', '过热确认');
  refRow('energy_shock', 'energy_ref', '能源供给冲击(已覆盖)', '同步/滞后', '能源冲击');

  // summaryLine:prose,先点背离,无 N/M 数字、无 bar
  const diverge = signals.filter((s) => s.verdict === '背离').map((s) => s.perspectiveZh);
  const summaryLine = diverge.length
    ? `值得盯的背离:${diverge.join('、')}。其余跨市场证据多数与核心结论同向。`
    : '跨市场证据多数与核心结论同向,暂无显著背离;中国/EM 作弱慢背景。';

  return { signals, summaryLine };
}

export { ASSESSMENT_LABELS };
export { classifyZScoreBucket };
