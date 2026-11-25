#!/usr/bin/env bash
set -euo pipefail
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Keep the freshly generated file before switching away from main.
cp realtime/market.json "$RUNNER_TEMP/market.json"
# Clean the tracked worktree file so branch switching cannot be blocked.
git restore --worktree --staged realtime/market.json

bash scripts/realtime/switch-publish-branch.sh

mkdir -p realtime
# Restore the generated realtime payload onto the publish branch.
cp "$RUNNER_TEMP/market.json" realtime/market.json

git add realtime/market.json
if git diff --cached --quiet; then
  printf '%s\n' "$2"
else
  git commit -m "$1"
  git push --set-upstream origin realtime-data
fi
