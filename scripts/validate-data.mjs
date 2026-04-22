import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const dataPath = path.join(root, 'data', 'radar-data.json');
const historyPath = path.join(root, 'data', 'radar-history.json');
const realtimePath = path.join(root, 'realtime', 'market.json');
const historyFullPath = path.join(root, 'data', 'radar-history-full.json');

if (!fs.existsSync(dataPath)) throw new Error('Validation failed: missing data/radar-data.json');
if (!fs.existsSync(historyPath)) throw new Error('Validation failed: missing data/radar-history.json');
if (!fs.existsSync(realtimePath)) throw new Error('Validation failed: missing realtime/market.json');
if (fs.existsSync(historyFullPath)) {
  const histFull = JSON.parse(fs.readFileSync(historyFullPath, 'utf8'));
  if (!Array.isArray(histFull) || histFull.length === 0) throw new Error('Validation failed: radar-history-full.json is empty or malformed.');
  const latest = histFull[histFull.length - 1];
  if (!latest.date || !latest.score || !latest.modules) throw new Error('Validation failed: radar-history-full.json latest entry is missing required fields.');
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
const realtime = JSON.parse(fs.readFileSync(realtimePath, 'utf8'));

if (!data.updatedAt) throw new Error('Validation failed: missing updatedAt.');
if (!Array.isArray(history) || history.length < 30) throw new Error('Validation failed: insufficient history.');
if (!data.timeDimension || !data.warningSystem || !data.assetReturnMap) throw new Error('Validation failed: core modules missing.');
if (!data.tradingSystem || !data.tradingSystem.executionLock || !data.tradingSystem.actionLayer || !data.tradingSystem.positioning) {
  throw new Error('Validation failed: trading engine modules missing.');
}
if (!realtime.values || !realtime.sourceStatus) throw new Error('Validation failed: realtime payload incomplete.');
console.log('Validation passed (v27.0)');
