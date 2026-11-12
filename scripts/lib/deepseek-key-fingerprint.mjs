import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
// Diagnostic only: no network, ledger, budget admission or secret fragments.
// Export masks preserve exactly the first eight and last four characters.
export function deepseekKeyFingerprint(key) {
  if (typeof key !== 'string' || !/^sk-[A-Za-z0-9_-]{13,253}$/u.test(key)) throw new Error('deepseek_key_fingerprint_unavailable');
  return { variable: 'DEEPSEEK_API_KEY', keySha256: hash(key),
    maskedProjectionSha256: hash(`${key.slice(0, 8)}:${key.slice(-4)}`),
    projection: 'first8-colon-last4-v1' };
}
