import { readFileSync } from 'node:fs';
import { createGithubLedger, POLICY, PROJECT_COUNTER_DISCLOSURE, DISPATCH_DEADLINE_MS, readTavilyUsage, summarizeLedger, verifyBudgetStatus } from './lib/tavily-budget.mjs';

import { createMeteredTavilyUsage, createTavilyMeterStore, METER_POLICY } from './lib/tavily-usage-meter.mjs';

const meteredReader = () => createMeteredTavilyUsage({ store: createTavilyMeterStore(), readUsage: readTavilyUsage });
const args = process.argv.slice(2);
try {
  if (args[0] === '--usage-only' && args[1] === '--key-file' && args.length === 3) {
    // Owner-selected local file only; never put credentials in argv or output.
    const key = readFileSync(args[2], 'utf8').trim();
    const usage = await meteredReader()(key);
    const sanitized = {};
    for (const group of ['key', 'account']) {
      sanitized[group] = {};
      for (const field of ['usage', 'limit', 'plan_usage', 'plan_limit', 'paygo_usage', 'paygo_limit', 'search_usage', 'extract_usage', 'crawl_usage', 'map_usage', 'research_usage']) {
        if (Number.isSafeInteger(usage[group]?.[field]) && usage[group][field] >= 0) sanitized[group][field] = usage[group][field];
      }
    }
    console.log(JSON.stringify({ operation: 'metered_usage_probe', meterReservations: 1, ...sanitized }));
  } else if (args.length === 1 && args[0] === '--verify') {
    const keys = (process.env.TAVILY_API_KEYS || process.env.TAVILY_API_KEY || '').split(/[\s,;]+/u).filter(Boolean);
    console.log(JSON.stringify(await verifyBudgetStatus({ keys,
      store: createGithubLedger({ token: process.env.TAVILY_BUDGET_GITHUB_TOKEN }) })));
  } else if (args.length === 1 && args[0] === '--probe') {
    const keys = (process.env.TAVILY_API_KEYS || process.env.TAVILY_API_KEY || '').split(/[\s,;]+/u).filter(Boolean);
    const status = await verifyBudgetStatus({ keys, store: createGithubLedger({ token: process.env.TAVILY_BUDGET_GITHUB_TOKEN }), readUsage: meteredReader() });
    const report = { ...status };
    delete report.writes;
    console.log(JSON.stringify({ ...report, operation: 'metered_usage_probe', meterReservations: new Set(keys).size }));
  } else if (args.length === 1 && args[0] === '--initialize-meter') {
    if (!await createTavilyMeterStore().initialize()) throw new Error('tavily_budget_meter_initialization_conflict');
    console.log(JSON.stringify({ status: 'meter_initialized', searches: 0, policy: METER_POLICY }));
  } else if (args.length === 1 && args[0] === '--plan') {
    console.log(JSON.stringify({ policy: POLICY, ...PROJECT_COUNTER_DISCLOSURE, dispatchDeadlineMs: DISPATCH_DEADLINE_MS, meterPolicy: METER_POLICY, searches: 0, writes: 0, requiresInitialization: true, requiresMeterInitialization: true }));
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
