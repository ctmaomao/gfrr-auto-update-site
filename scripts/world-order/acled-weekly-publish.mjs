#!/usr/bin/env node
/**
 * Backward-compatible wrapper.
 *
 * The public npm entrypoint `acled:publish` now uses acled-publish.mjs, which
 * publishes both ACLED weekly and monthly derived configs. This wrapper remains
 * only for anyone who still runs the old file path directly.
 */
import './acled-publish.mjs';
