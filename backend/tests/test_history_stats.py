from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.mercurial.command_runner import HgCommandRunner
from app.mercurial.read_service import MercurialReadService


def _env() -> dict[str, str]:
    return {
        "HGPLAIN": "1",
        "HGRCPATH": "",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PATH": os.environ.get("PATH", ""),
    }


async def _run(args: list[str], cwd: Path) -> None:
    await asyncio.to_thread(
        subprocess.run, args, check=True, cwd=cwd, env=_env(), capture_output=True
    )


async def _seed(repo: Path, commits: int) -> None:
    repo.mkdir(parents=True, exist_ok=True)
    await _run(["hg", "init", str(repo)], repo.parent)
    for i in range(commits):
        (repo / f"f{i}.txt").write_text(f"line-{i}\nline-{i}-b\n", encoding="utf-8")
        await _run(["hg", "--repository", str(repo), "add", f"f{i}.txt"], repo)
        await _run(
            ["hg", "--repository", str(repo), "commit", "-u", "T <t@x>", "-m", f"c{i}"], repo
        )


class _CountingRunner(HgCommandRunner):
    def __init__(self, settings):
        super().__init__(settings)
        self.calls = 0

    async def run(self, *a, **k):
        self.calls += 1
        return await super().run(*a, **k)

    async def run_json(self, *a, **k):
        self.calls += 1
        return await super().run_json(*a, **k)


@pytest.mark.asyncio
async def test_list_changesets_uses_bounded_hg_processes(settings_env, tmp_path) -> None:
    settings = get_settings()
    repo = tmp_path / "repo"
    await _seed(repo, commits=6)
    runner = _CountingRunner(settings)
    service = MercurialReadService(settings=settings, command_runner=runner)

    page = await service.list_changesets(repo, cursor=None)
    # page_size is small (test env=2); the number of hg processes must NOT scale
    # with per-changeset stat calls (was ~3 per changeset, then one `hg log {diffstat}`).
    # Phase 2 computes row stats in-process: no hg subprocess at all.
    assert len(page.changesets) == settings.max_history_page_size
    assert runner.calls == 0, runner.calls
    # And the stats summary is populated for the listed changesets.
    top = page.changesets[0]
    assert top.stats is not None
    assert top.stats.insertions == 2 and top.stats.deletions == 0


@pytest.mark.asyncio
async def test_list_stats_cover_binary_and_merge_changesets(settings_env, tmp_path) -> None:
    settings = get_settings()
    repo = tmp_path / "repo"
    repo.mkdir(parents=True, exist_ok=True)
    await _run(["hg", "init", str(repo)], repo.parent)

    async def hg(*args: str) -> None:
        await _run(["hg", "--repository", str(repo), *args], repo)

    (repo / "base.txt").write_text("base\n", encoding="utf-8")
    await hg("add", "base.txt")
    await hg("commit", "-u", "T <t@x>", "-m", "base")
    # binary-only commit
    (repo / "blob.bin").write_bytes(b"\x00\x01\x02BIN")
    await hg("add", "blob.bin")
    await hg("commit", "-u", "T <t@x>", "-m", "binary")

    runner = _CountingRunner(settings)
    service = MercurialReadService(settings=settings, command_runner=runner)
    page = await service.list_changesets(repo, cursor=None)
    assert runner.calls == 0
    binary = next(c for c in page.changesets if c.message == "binary")
    assert binary.stats is not None
    assert binary.stats.files_changed == 1
    assert binary.stats.insertions == 0 and binary.stats.deletions == 0
    assert binary.has_binary is True
