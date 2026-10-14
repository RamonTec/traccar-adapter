#!/usr/bin/env bash
# Copies the canonical SDD commands (docs/sdd/commands) to each agent's folder.
# Usage: scripts/sync-agent-commands.sh [--check]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=docs/sdd/commands
TARGETS=(.claude/commands .agents/workflows)

if [[ "${1:-}" == "--check" ]]; then
  for t in "${TARGETS[@]}"; do
    diff -r "$SRC" "$t" >/dev/null || { echo "SDD commands out of sync in $t: run pnpm sdd:sync" >&2; exit 1; }
  done
  exit 0
fi

for t in "${TARGETS[@]}"; do
  rm -rf "$t" && mkdir -p "$t" && cp "$SRC"/*.md "$t"/
done
echo "Synced SDD commands to: ${TARGETS[*]}"
