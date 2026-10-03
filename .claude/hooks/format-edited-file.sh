#!/usr/bin/env bash
# PostToolUse hook: format the single file Claude just edited.
# Never blocks Claude: always exits 0, writes notes to stderr only.
set -u

input="$(cat)"
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if command -v jq >/dev/null 2>&1; then
  file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)"
else
  file_path="$(printf '%s' "$input" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin).get("tool_input",{})
    print(d.get("file_path") or d.get("path") or "")
except Exception:
    print("")' 2>/dev/null)"
fi

[ -n "${file_path:-}" ] || exit 0
[ -f "$file_path" ] || exit 0

case "$file_path" in
  "$project_dir"/backend/*.py)
    ruff="$project_dir/backend/.venv/bin/ruff"
    if [ -x "$ruff" ]; then
      (cd "$project_dir/backend" && "$ruff" format --quiet "$file_path" && "$ruff" check --fix --quiet --select I "$file_path") >/dev/null 2>&1 \
        || echo "format hook: ruff could not format $file_path" >&2
    fi
    ;;
  "$project_dir"/frontend/*.ts|"$project_dir"/frontend/*.tsx|"$project_dir"/frontend/*.css|"$project_dir"/frontend/*.json)
    prettier="$project_dir/frontend/node_modules/.bin/prettier"
    if [ -x "$prettier" ]; then
      (cd "$project_dir/frontend" && "$prettier" --write --log-level warn "$file_path") >/dev/null 2>&1 \
        || echo "format hook: prettier could not format $file_path" >&2
    fi
    ;;
esac
exit 0
