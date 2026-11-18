#!/usr/bin/env bash
set -euo pipefail

# Git reserves exit 2 for a completed probe with no matching ref. Other
# failures cannot establish that the branch is safe to initialize.
if advertised=$(git ls-remote --exit-code --heads origin refs/heads/realtime-data 2>/dev/null); then
  # Git matches ref tails as well as full names; verify the advertised ref.
  if [[ "$advertised"$'\n' != *$'\trefs/heads/realtime-data\n'* ]]; then
    echo 'Unable to verify the exact realtime-data ref; publication stopped.' >&2
    exit 1
  fi
  git fetch origin refs/heads/realtime-data
  git switch --create realtime-data --track origin/realtime-data || git switch realtime-data
else
  status=$?
  if [ "$status" -ne 2 ]; then
    printf 'Unable to verify realtime-data (git ls-remote exited %s); publication stopped.\n' "$status" >&2
    exit "$status"
  fi
  git switch --create realtime-data
fi
