#!/usr/bin/env bash
# Copies the canonical SDD commands and skills (docs/sdd/) to each agent's folders.
#   docs/sdd/commands -> .claude/commands, .agents/workflows
#   docs/sdd/skills   -> .claude/skills,   .agents/skills
# Usage: scripts/sync-agent-commands.sh [--check]
set -euo pipefail
cd "$(dirname "$0")/.."

PAIRS=(
  "docs/sdd/commands:.claude/commands"
  "docs/sdd/commands:.agents/workflows"
  "docs/sdd/skills:.claude/skills"
  "docs/sdd/skills:.agents/skills"
)

if [[ "${1:-}" == "--check" ]]; then
  for p in "${PAIRS[@]}"; do
    src=${p%%:*} dst=${p#*:}
    diff -r "$src" "$dst" >/dev/null 2>&1 || { echo "SDD files out of sync in $dst: run pnpm sdd:sync" >&2; exit 1; }
  done
  exit 0
fi

for p in "${PAIRS[@]}"; do
  src=${p%%:*} dst=${p#*:}
  rm -rf "$dst" && mkdir -p "$dst" && cp -R "$src"/. "$dst"/
done
echo "Synced SDD commands and skills"
