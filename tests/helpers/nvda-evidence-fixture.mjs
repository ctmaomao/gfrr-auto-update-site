import assert from 'node:assert/strict';
import { inspectNvdaNumerator, qualifyNvdaRatio } from '../../scripts/bubble-watch/nvda-ratio-evidence.mjs';
import { qualifiedEdgarLtmRevenue } from '../../scripts/bubble-watch/ltm-revenue.mjs';

// Synthetic records only: not actual NVIDIA investments, revenue or source truth.
export function nvdaEvidenceFixture(recordDate, proofDate = '2026-11-04', amount = 50e9) {
  const config = { params: { nvdaCommitments: {
    contractVersion:'nvda-period-aligned-commitments-v1',issuer:'NVDA',currency:'USD',usd:amount,
    basis:'signed_customer_equity_commitments_in_period',includesGuarantees:false,includesCollateralizedDebt:false,
    asOfDate:recordDate,periodStart:'2025-07-28',periodEnd:'2026-07-26',review:{status:'accepted',reviewedAt:recordDate},
    records:[{id:'synthetic-only',kind:'equity_commitment',bindingStatus:'signed',counterpartyRole:'customer',
      signedDate:'2026-06-01',usd:amount,sourceUrl:'https://investor.nvidia.com/synthetic-fixture'}]
  } }, autoFallback:{nvda_invest_revenue:{asOfDate:recordDate,maxAgeDays:30}} };
  const rows=[['2025-07-28','2025-10-26','2025-11-20'],['2025-10-27','2026-01-25','2026-02-20'],
    ['2026-01-26','2026-04-26','2026-05-20'],['2026-04-27','2026-07-26','2026-08-25']]
    .map(([start,end,filed],i)=>({start,end,filed,val:(50+i*10)*1e9,form:'10-Q'}));
  const revenue={...qualifiedEdgarLtmRevenue(rows,proofDate),source:{provider:'SEC',issuer:'NVDA',currency:'USD',
    url:'https://data.sec.gov/api/xbrl/companyconcept/CIK0001045810/us-gaap/Revenues.json'}};
  const proof=qualifyNvdaRatio(inspectNvdaNumerator(config,proofDate),revenue);
  assert.equal(proof.status,'qualified');
  return {id:'nvda_invest_revenue',status:proof.ratioPct>30?'red':proof.ratioPct>15?'yellow':'green',
    as_of:'2026-07-26',stale:false,value_display:`≈${proof.ratioPct.toFixed(0)}%`,note:'synthetic',
    provenance:{mode:'auto',fetchedAt:`${proofDate}T12:00:00Z`,detail:{...proof,qualificationStatus:'qualified',currentEligible:true}}};
}
