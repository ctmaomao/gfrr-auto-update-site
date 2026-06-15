// check:oil-directional-global-overlay — P7 semantic replay for P6B global overlay.
//
// This check keeps the global/monthly overlay in its intended lane:
// display-only confirmation/capping/event-watch, never a replacement for the
// locked ODP physical classifier or the PR3 price-divergence reconciliation.

import {
  loadDefaultHistory,
  runGlobalOverlayFixtureChecks,
  runGlobalOverlayReplay,
  validateGlobalOverlayReplay,
} from './oil-directional/replay-global-overlay.mjs';

const history = loadDefaultHistory();
const fixtures = runGlobalOverlayFixtureChecks();
const replay = runGlobalOverlayReplay(history);
const errors = validateGlobalOverlayReplay({ fixtures, replay });

if (errors.length > 0) {
  console.error('Oil Directional global overlay replay check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log(
  'Oil Directional global overlay replay check: PASS ' +
  `(fixtures=${fixtures.length}, replayRows=${replay.totalRows}, ` +
  `effects=${JSON.stringify(replay.byEffect)})`
);
