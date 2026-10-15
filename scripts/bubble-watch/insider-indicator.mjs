// Publish only the independently reviewed insider returned-sample evidence.
import { validateInsiderPublication } from './qualified-insider-publication.mjs';
function amount(value) {
  const number=Number(value);
  if (number === 0) return '0美元';
  if (number < 0.01) return '不足0.01美元';
  if (number >= 1e8) return `约${(number/1e8).toFixed(2)}亿美元`;
  if (number >= 1e4) return `约${(number/1e4).toFixed(1)}万美元`;
  return `约${number.toFixed(2)}美元`;
}
export function buildQualifiedInsiderIndicator(base,report,today) {
  const missing=report.status === 'unknown';
  const card={...base,status:report.status,as_of:missing ? null : report.latestTransactionDate,stale:false,
    provenance:{mode:'auto',checkedAt:report.checkedAt,detail:report},
    ...(missing ? {evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'insider_window_coverage_unconfirmed',checkedDate:today}} : {})};
  const errors=validateInsiderPublication(card,today);
  if (errors.length) throw new Error(`Insider evidence cannot publish: ${errors.join('; ')}`);
  const dates=report.companies.map(company=>company.responseBuiltAt.slice(0,10)).sort();
  const responseDates=dates.length ? dates[0] === dates.at(-1) ? dates[0] : `${dates[0]}至${dates.at(-1)}` : '暂缺';
  const hasSamples=report.validResponseSymbols.length > 0;
  const windows=hasSamples ? [30,90].map(n=>{
    const w=report.totals[n];
    return `${n}日返回样本卖出${amount(w.sellUsd)}、买入${amount(w.buyUsd)}，${w.ratio === null ? '买入未达100万美元，不报倍数' : `卖买比约${w.ratio.toFixed(1)}倍`}`;
  }).join('；') : '本轮未取得合格公司样本，30/90日金额与倍数待确认';
  const planDisclosure=hasSamples ? `计划属性未披露${report.totals[90].scheduleUnknownCount}笔` : '计划属性待确认';
  const capped=report.companies.some(company=>company.localRecordLimitReached);
  return {...card,
    name_zh:'内部人交易30/90日样本',
    source_name:'SEC Form 4公开披露 · XOOMAR返回样本',
    value_display:missing ? '待确认' : '高卖压·覆盖受限',
    threshold_text:'有效返回≥8家；任一窗口卖买≥5倍=黄（买入不足100万美元时，卖出≥500万美元）；其余待确认',
    note:`固定12家公司，取得${report.validResponseSymbols.length}家合格返回，其中${report.inWindowTradeSymbols.length}家有窗口内P/S交易、${report.returnedEmptySymbols.length}家返回空样本。窗口截至${today}，${windows}。${report.latestTransactionDate ? `最近已返回P/S交易日${report.latestTransactionDate}` : '合格P/S交易日暂缺'}；接口响应生成于${responseDates}，不代表底层数据更新。窗口完整性未核实，最多保守黄灯，其余待确认；${capped ? '部分样本达到返回上限，可能截断。' : ''}金额按原始小数判定，展示约数不作为阈值，未使用买入分母下限。${planDisclosure}；未把未知当非计划或折减卖出。${report.missingSymbols.length ? `${report.missingSymbols.length}家公司样本暂不可用。` : ''}统计可能遗漏尚未申报、未入库或后续更正，不等同全市场净卖出，也不与2000年峰值倍数直接比较。`
  };
}
