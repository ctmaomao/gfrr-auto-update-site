export const MINIMUM_NODE_VERSION = '24.20.0';
export const NODE_ENGINE_RANGE = `>=${MINIMUM_NODE_VERSION} <25`;

export function isSupportedNodeRuntime(version) {
  if (typeof version !== 'string' || !/^v?\d+\.\d+\.\d+$/u.test(version)) return false;
  const actual = version.replace(/^v/u, '').split('.').map(Number);
  const minimum = MINIMUM_NODE_VERSION.split('.').map(Number);
  if (actual[0] !== minimum[0]) return false;
  return actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2]);
}
