// Keep the existing structural band and move the nominal target inside it.
// This reconciles producer fields; it does not change risk/lock thresholds.
export function buildExposureGuidance(lock, shift) {
  const bands = { red: [20, 40], yellow: [38, 53], green: [55, 70] };
  if (!Object.hasOwn(bands, lock?.level) || !Number.isFinite(shift) || shift > 0 || shift < -100
    || typeof lock.gross !== 'string' || !/^\d+(?:\.\d+)?%$/u.test(lock.gross)) {
    throw new TypeError('Invalid exposure guidance inputs');
  }
  const [lo, hi] = bands[lock.level];
  const lower = Math.max(0, Math.min(90, Math.round(lo + shift / 2)));
  const upper = Math.max(10, Math.min(100, Math.round(hi + shift / 2)));
  const target = Math.max(lower, Math.min(upper, Number.parseFloat(lock.gross)));
  const nextLock = { ...lock };
  if (`${target}%` !== lock.gross) {
    nextLock.gross = `${target}%`;
    nextLock.allow = (lock.allow || []).map(text => text.replaceAll(lock.gross, nextLock.gross));
    nextLock.mandatory = [...(lock.mandatory || [])];
    nextLock.mandatory[0] = `若总仓位高于 ${upper}%，必须先减到 ${target}% 附近。`;
  }
  return { lock: nextLock, lower, upper, totalExposureBand: `${lower}%-${upper}%`, shift };
}
