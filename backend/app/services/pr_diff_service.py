from __future__ import annotations

from pathlib import Path

from app.mercurial.command_runner import HgCommandRunner


async def compute_diff(
    command_runner: HgCommandRunner,
    *,
    repository_path: Path,
    source_revision: str,
    target_revision: str,
) -> tuple[list[dict], int, int, int]:
    full_diff_output = await command_runner.run(
        [
            "diff",
            "--rev",
            target_revision,
            "--rev",
            source_revision,
            "--git",
        ],
        repository_path=repository_path,
        stdout_limit=5 * 1024 * 1024,
    )
    diff_text = full_diff_output.stdout.decode("utf-8", errors="replace")
    total_additions = 0
    total_deletions = 0
    total_files = 0
    changed_files: list[dict] = []

    for line in diff_text.splitlines():
        if line.startswith("--- a/") or line.startswith("+++ b/"):
            continue
        if line.startswith("diff --git"):
            total_files += 1
            parts = line.split(" b/")
            path = parts[-1] if len(parts) > 1 else ""
            changed_files.append({"path": path, "additions": 0, "deletions": 0})
        elif line.startswith("+") and not line.startswith("+++"):
            total_additions += 1
            if changed_files:
                changed_files[-1]["additions"] = changed_files[-1].get("additions", 0) + 1
        elif line.startswith("-") and not line.startswith("---"):
            total_deletions += 1
            if changed_files:
                changed_files[-1]["deletions"] = changed_files[-1].get("deletions", 0) + 1

    return changed_files, total_additions, total_deletions, total_files
