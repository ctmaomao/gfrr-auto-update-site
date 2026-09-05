import { formatFiniteNumber } from './format.js?v=bofa-report-review-1';

export const dataUrl = './data/radar-data.json';
export const historyUrl = './data/radar-history.json';
export const localRealtimeUrl = './realtime/market.json';
export const worldOrderStressUrl = './data/world-order-stress.json';
export const REMOTE_REALTIME_URL = 'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';
export const WORKER_GENERATED_REALTIME_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.worker-preview.json';
export const realtimeSourcePolicy = {
  // FROZEN: M-94 V0 Path C keeps frontend runtime on static radar-data.json.
  // Do not reconnect worker-first realtime overlay without a reviewed product decision.
  workerFirstEnabled: true,
  workerEndpoint: WORKER_GENERATED_REALTIME_URL,
  workerTimeoutMs: 4500,
  workerMaxAgeMinutes: 10,
  workerMinHealthScore: 85,
  workerMaxCriticalMissing: 1,
  workerRequiredFields: ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y']
};

export const $ = (id) => document.getElementById(id);
export const fmtSigned = (n) => `${n > 0 ? '+' : ''}${n}`;
export const riskColor = (score) => {
  if (score >= 85) return '#ff5e72';
  if (score >= 70) return '#ff9a5d';
  if (score >= 50) return '#ffd46a';
  return '#2fd38a';
};
export const trendClass = (delta) => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
export const fmtDeltaSafe = (n) => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n}` : '--';
export const deltaArrow = (n) => !Number.isFinite(n) || n === 0 ? '→' : n > 0 ? '↑' : '↓';
export const fmtSignedArrow = (n) => `${deltaArrow(n)} ${Number.isFinite(n) ? Math.abs(n) : '--'}`;

export function fmtNumSafe(n, digits = 1) {
  return formatFiniteNumber(n, digits);
}
