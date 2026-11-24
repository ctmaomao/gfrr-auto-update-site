import { checkNeocloudSourceContent, evidenceGapError } from './source-health-policy.mjs';

// These five sources are probes, not a four-issuer credit-event register.
// One is an index, the others are ordinary financing announcements. Neither a
// new article date nor a covenant mentioning default establishes a rating action.
const pages = [
    { source: 'PRNewswire:CoreWeave', url: 'https://www.prnewswire.com/news/coreweave/' },
    { source: 'Lambda official blog', url: 'https://lambda.com/blog/lambda-closes-1-billion-senior-secured-credit-facility' },
    { source: 'Crusoe official newsroom', url: 'https://www.crusoe.ai/resources/newsroom/crusoe-secures-usd750-million-credit-facility-from-brookfield-to-accelerate' },
    { source: 'Nebius newsroom financing update', url: 'https://nebius.com/newsroom/nebius-provides-financing-update' },
    { source: 'Nebius newsroom offering close', url: 'https://nebius.com/newsroom/nebius-group-announces-closings-of-its-public-offering-of-class-a-ordinary-shares-and-concurrent-private-offering-of-convertible-senior-notes-with-aggregate-gross-proceeds-to-date-of-approximately-4-2-billion' }
  ];

export async function probeNeocloudSources({ loadText, today }) {
  const checks = [];
  for (const { source, url } of pages) {
    try {
      const text = await loadText(url);
      checks.push(checkNeocloudSourceContent(source, text));
    } catch {
      checks.push({ source, status: 'fetch_failed' });
    }
  }
  // Preserve the existing audited gap/transport contract. Never pass site
  // reachability or word matches to the score as a positive or a zero count.
  const gap = new Error('neocloud_current_coverage_unconfirmed: missing recent dated coverage for CoreWeave/Lambda/Crusoe/Nebius');
  throw evidenceGapError(gap, 'neocloud_credit', checks, today);
}
