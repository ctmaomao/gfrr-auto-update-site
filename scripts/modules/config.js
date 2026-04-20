export const dataUrl = './data/radar-data.json';
export const historyUrl = './data/radar-history.json';
export const localRealtimeUrl = './realtime/market.json';
export const remoteRealtimeUrl = 'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';

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
  return Number.isFinite(n) ? n.toFixed(digits) : '--';
}
