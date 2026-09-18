import { readFileSync } from 'node:fs';
import { createGithubLedger, POLICY, readTavilyUsage, summarizeLedger, verifyBudgetStatus } from './lib/tavily-budget.mjs';

const args = process.argv.slice(2);
try {
  if (args[0] === '--usage-only' && args[1] === '--key-file' && args.length === 3) {
    // Owner-selected local file only; never put credentials in argv or output.
    const key = readFileSync(args[2], 'utf8').trim();
    const usage = await readTavilyUsage(key);
    const sanitized = {};
    for (const group of ['key', 'account']) {
      sanitized[group] = {};
      for (const field of ['usage', 'limit', 'plan_usage', 'plan_limit', 'paygo_usage', 'paygo_limit', 'search_usage', 'extract_usage', 'crawl_usage', 'map_usage', 'research_usage']) {
        if (Number.isSafeInteger(usage[group]?.[field]) && usage[group][field] >= 0) sanitized[group][field] = usage[group][field];
      }
    }
    console.log(JSON.stringify({ operation: 'read_only_usage', ...sanitized }));
  } else if (args.length === 1 && args[0] === '--verify') {
    const keys = (process.env.TAVILY_API_KEYS || process.env.TAVILY_API_KEY || '').split(/[\s,;]+/u).filter(Boolean);
    console.log(JSON.stringify(await verifyBudgetStatus({ keys,
      store: createGithubLedger({ token: process.env.TAVILY_BUDGET_GITHUB_TOKEN }) })));
  } else if (args.length === 1 && args[0] === '--plan') {
    console.log(JSON.stringify({ policy: POLICY, searches: 0, writes: 0, requiresInitialization: true }));
  } else if (args.length === 0 || (args.length === 1 && args[0] === '--initialize')) {
    const store = createGithubLedger({ token: process.env.TAVILY_BUDGET_GITHUB_TOKEN });
    if (args[0] === '--initialize') {
      if (!await store.initialize()) throw new Error('tavily_budget_initialization_conflict');
      console.log(JSON.stringify({ status: 'initialized', searches: 0 }));
    } else {
      const { head, ledger } = await store.read();
      console.log(JSON.stringify({ status: 'read_only', head, policy: POLICY, ...summarizeLedger(ledger) }));
    }
  } else throw new Error('tavily_budget_arguments_invalid');
} catch (error) {
  console.error(/^tavily_budget_[a-z_]+$/u.test(error?.message || '') ? error.message : 'tavily_budget_review_failed');
  process.exitCode = 1;
}
