import { deepseekKeyFingerprint } from './lib/deepseek-key-fingerprint.mjs';
try {
  if (process.argv.length !== 2) throw new Error('unsupported');
  const scope = process.env.DEEPSEEK_KEY_SCOPE;
  if (!['external-ai-production-refresh', 'external-ai-manual'].includes(scope)) throw new Error('scope');
  console.log(JSON.stringify({ environment: scope, operation: 'offline_deepseek_key_fingerprint',
    ...deepseekKeyFingerprint(process.env.DEEPSEEK_API_KEY), providerCalls: 0, ledgerReads: 0, writes: 0 }));
} catch {
  console.error('deepseek_key_fingerprint_unavailable'); process.exitCode = 1;
}
