// Largest-remainder allocation preserves a total of exactly 100 after integer
// rounding. These are relative model weights, not calibrated probabilities.
export function allocateRegimePercentages(raw) {
  const entries = Object.entries(raw);
  if (!entries.length || entries.some(([, value]) => !Number.isFinite(value) || value < 0)) throw new TypeError('Invalid regime weights');
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) throw new TypeError('Invalid regime total');
  const shares = entries.map(([key, value], index) => {
    const exact = value / total * 100;
    return { key, index, whole: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = 100 - shares.reduce((sum, share) => sum + share.whole, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining <= 0) break;
    share.whole++; remaining--;
  }
  return Object.fromEntries(shares.map(share => [share.key, share.whole]));
}
