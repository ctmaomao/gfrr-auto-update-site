import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'radar-data.json'), 'utf8'));
const history = JSON.parse(fs.readFileSync(path.join(root, 'data', 'radar-history.json'), 'utf8'));

if (!data.score || !Array.isArray(history) || history.length < 30) {
  throw new Error('Validation failed: missing score or insufficient 30-day history.');
}
if (!data.timeDimension || !data.warningSystem || !data.assetReturnMap) {
  throw new Error('Validation failed: missing core modules.');
}
if (!data.tradingSystem || !data.tradingSystem.executionLock || !data.tradingSystem.actionLayer) {
  throw new Error('Validation failed: missing trading execution modules.');
}
if (!data.updatedAt || !String(data.version).startsWith('v23')) {
  throw new Error('Validation failed: missing v23 markers.');
}
console.log('Validation passed.');

import fs2 from 'fs';
const realtimePath = path.join(root, 'realtime', 'market.json');
if (!fs2.existsSync(realtimePath)) { throw new Error('Validation failed: missing realtime/market.json'); }
