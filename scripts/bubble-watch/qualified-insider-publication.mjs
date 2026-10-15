import { INSIDER_BASKET, qualifyInsiderCoverage } from './qualified-insider.mjs';
const same = (left,right) => JSON.stringify(left) === JSON.stringify(right);
const REPORT_FIELDS = ['status','reasonCode','qualificationFailure','policy','windowStartDate','windowEndDate','basket','checkedAt',
  'latestTransactionDate','coverageStatus','validResponseSymbols','inWindowTradeSymbols','returnedEmptySymbols','missingSymbols',
  'companies','totals','denominatorFloorApplied','moneyArithmetic','coverageBasis','responseClockMeaning','schedulePolicy',
  'rejectedSamples','sourceFailures','sourceAttribution','sourceAttributionUrl','collectionPolicy'];
const COMPANY_FIELDS = ['symbol','sourceUrl','responseBuiltAt','returnedRecordCount','oldestReturnedDate','newestReturnedDate',
  'latestIncludedTransactionDate','localRecordLimitReached','windows'];
const WINDOW_FIELDS = ['buyUsd','sellUsd','transactionCount','scheduledCount','scheduleUnknownCount'];
const REJECTION_REASONS = ['response_ticker_mismatch','response_clock_or_query_invalid','response_schema_or_local_cap',
  'transaction_schema_invalid','transaction_date_or_order_invalid','transaction_code_invalid',
  'transaction_amount_missing_or_approximate','duplicate_transaction'];
const only = (value,keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key=>keys.includes(key));

export function validateInsiderPublication(indicator,today) {
  const errors=[], report=indicator?.provenance?.detail;
  const fail=message=>errors.push(`insider qualified source: ${message}`);
  if (!only(report,REPORT_FIELDS) || !Array.isArray(report.companies)) {
    fail('missing aggregate proof or unexpected raw fields'); return errors;
  }
  if (report.checkedAt !== indicator.provenance.checkedAt) fail('checking clock differs');
  const replay=qualifyInsiderCoverage(report.companies,today,report.checkedAt);
  if (replay.policy !== 'insider_fixed_12_30_90_v1') { fail('aggregate proof is invalid'); return errors; }
  for (const [key,value] of Object.entries(replay)) if (!same(report[key],value)) fail(`aggregate replay mismatch: ${key}`);
  for (const company of report.companies) {
    if (!only(company,COMPANY_FIELDS)) fail('unexpected company/raw fields');
    if (!only(company.windows,['30','90'])) fail('unexpected windows');
    for (const n of [30,90]) if (!only(company.windows?.[n],WINDOW_FIELDS)) fail('unexpected transaction/raw fields');
  }
  if (indicator.status !== replay.status) fail('light differs from returned sample evidence');
  if (indicator.as_of !== (replay.status === 'unknown' ? null : replay.latestTransactionDate)) fail('original transaction date differs');
  if (report.sourceAttribution !== 'Data: XOOMAR; Insider trade data: SEC.' || report.sourceAttributionUrl !== 'https://xoomar.com') fail('source attribution missing');
  const rejected=report.rejectedSamples, failures=report.sourceFailures, policy=report.collectionPolicy;
  if (!Array.isArray(rejected) || !Array.isArray(failures)
    || !only(policy,['actualRequests','maximumRequests','minimumStartSpacingMs','requestTimeoutMs','responseMaxBytes','applicationRetries'])) {
    fail('collection audit missing'); return errors;
  }
  if (rejected.some(row=>!only(row,['symbol','reason']) || !REJECTION_REASONS.includes(row.reason))) fail('unsanitized sample rejection');
  if (failures.some(row=>!only(row,['symbol','reason']) || !/^(?:http_[1-5]\d{2}|timeout|response_unusable)$/u.test(row.reason))) fail('unsanitized source failure');
  const attempted=[...report.companies.map(row=>row.symbol),...rejected.map(row=>row?.symbol),...failures.map(row=>row?.symbol)];
  if (attempted.length < 1 || attempted.length > 12 || new Set(attempted).size !== attempted.length
    || INSIDER_BASKET.slice(0,attempted.length).some(symbol=>!attempted.includes(symbol))) fail('invalid attempted fixed basket');
  const expected={actualRequests:attempted.length,maximumRequests:12,minimumStartSpacingMs:6500,requestTimeoutMs:12000,responseMaxBytes:1048576,applicationRetries:0};
  for (const [key,value] of Object.entries(expected)) if (policy[key] !== value) fail(`collection policy differs: ${key}`);
  return errors;
}
