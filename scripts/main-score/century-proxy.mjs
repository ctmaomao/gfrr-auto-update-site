function latestOnOrBefore(rows, date) {
  let found = null;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.date > date) break;
    found = row;
  }
  return found;
}

function monthOffset(date, offset) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + offset);
  return parsed.toISOString().slice(0, 10);
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / previous * 100;
}

export function causalMidrankPercentile(history, current, minimumHistory) {
  const values = history.filter(Number.isFinite);
  if (!Number.isFinite(current) || values.length < minimumHistory) return null;
  let less = 0;
  let equal = 0;
  for (const value of values) {
    if (value < current) less += 1;
    else if (value === current) equal += 1;
  }
  return (less + equal * 0.5) / values.length * 100;
}

export function buildCenturyProxyRows(seriesRows, config, startDate, endDate) {
  const minimumHistory = Number(config.model.minimumHistoryMonths);
  const creditHistory = [];
  const yoyContractionHistory = [];
  const sixMonthContractionHistory = [];
  const output = [];
  const labelRows = seriesRows.recessionLabel || [];
  for (const labelRow of labelRows) {
    const date = labelRow.date;
    if (date > endDate) break;
    const informationCutoff = monthOffset(date, -Number(config.model.informationLagMonths || 1));
    const baa = latestOnOrBefore(seriesRows.baa, informationCutoff)?.value ?? null;
    const aaa = latestOnOrBefore(seriesRows.aaa, informationCutoff)?.value ?? null;
    const industrialProduction = latestOnOrBefore(seriesRows.industrialProduction, informationCutoff)?.value ?? null;
    const ip12mAgo = latestOnOrBefore(seriesRows.industrialProduction, monthOffset(informationCutoff, -12))?.value ?? null;
    const ip6mAgo = latestOnOrBefore(seriesRows.industrialProduction, monthOffset(informationCutoff, -6))?.value ?? null;
    const creditSpread = Number.isFinite(baa) && Number.isFinite(aaa) ? baa - aaa : null;
    const industrialProductionYoY = pctChange(industrialProduction, ip12mAgo);
    const industrialProduction6m = pctChange(industrialProduction, ip6mAgo);
    const yoyContraction = Number.isFinite(industrialProductionYoY) ? -industrialProductionYoY : null;
    const sixMonthContraction = Number.isFinite(industrialProduction6m) ? -industrialProduction6m : null;
    if (Number.isFinite(creditSpread)) creditHistory.push(creditSpread);
    if (Number.isFinite(yoyContraction)) yoyContractionHistory.push(yoyContraction);
    if (Number.isFinite(sixMonthContraction)) sixMonthContractionHistory.push(sixMonthContraction);

    const creditRisk = causalMidrankPercentile(creditHistory, creditSpread, minimumHistory);
    const yoyRisk = causalMidrankPercentile(yoyContractionHistory, yoyContraction, minimumHistory);
    const sixMonthRisk = causalMidrankPercentile(sixMonthContractionHistory, sixMonthContraction, minimumHistory);
    if (date < startDate || ![creditRisk, yoyRisk, sixMonthRisk].every(Number.isFinite)) continue;
    const components = config.model.components;
    const score = Math.round(
      creditRisk * components.creditSpread.weight
      + yoyRisk * components.industrialProductionYoYContraction.weight
      + sixMonthRisk * components.industrialProduction6mContraction.weight
    );
    output.push({
      date,
      score,
      label: Number(labelRow.value) >= 0.5,
      inputs: {
        baa,
        aaa,
        creditSpread,
        industrialProduction,
        industrialProductionYoY,
        industrialProduction6m
      },
      components: {
        creditRisk: Number(creditRisk.toFixed(4)),
        industrialProductionYoYRisk: Number(yoyRisk.toFixed(4)),
        industrialProduction6mRisk: Number(sixMonthRisk.toFixed(4))
      },
      audit: {
        causal: true,
        futureRowsUsed: 0,
        informationCutoff,
        historyObservations: {
          credit: creditHistory.length,
          industrialProductionYoY: yoyContractionHistory.length,
          industrialProduction6m: sixMonthContractionHistory.length
        }
      }
    });
  }
  return output;
}
