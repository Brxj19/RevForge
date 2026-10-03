#!/usr/bin/env bash
# Mirror .agents/skills/<skill>/ (shared with Codex/Command Code) into .claude/skills/<skill>/.
# .agents/skills is the single source of truth: edit there, then run this script.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/.agents/skills"
dst="$root/.claude/skills"

if [ ! -d "$src" ]; then
  echo "sync-agent-skills: $src not found; nothing to sync." >&2
  exit 0
fi

mkdir -p "$dst"
count=0
for skill_dir in "$src"/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  name="$(basename "$skill_dir")"
  rm -rf "${dst:?}/$name"
  cp -R "$skill_dir" "$dst/$name"
  count=$((count + 1))
done
echo "sync-agent-skills: synced $count skill(s) into .claude/skills/"
