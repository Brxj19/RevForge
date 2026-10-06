from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.mercurial.command_runner import HgCommandRunner
from app.services.errors import ConflictError, ValidationFailure
from app.services.pr_merge_service import verify_landed_merge


def _env() -> dict[str, str]:
    return {
        "HGPLAIN": "1",
        "HGRCPATH": "",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PATH": os.environ.get("PATH", ""),
    }


async def _run(args: list[str], cwd: Path) -> str:
    result = await asyncio.to_thread(
        subprocess.run, args, check=True, cwd=cwd, env=_env(), capture_output=True, text=True
    )
    return result.stdout


async def _init(repo: Path) -> None:
    repo.mkdir(parents=True, exist_ok=True)
    await _run(["hg", "init", str(repo)], repo.parent)


async def _hg(repo: Path, *args: str) -> str:
    return await _run(["hg", "--repository", str(repo), *args], repo)


async def _commit(repo: Path, name: str) -> str:
    (repo / name).write_text(name, encoding="utf-8")
    await _hg(repo, "add", name)
    await _hg(repo, "commit", "-u", "T <t@x>", "-m", name)
    return (await _hg(repo, "log", "-r", ".", "-T", "{node}")).strip()


@pytest.fixture
def runner(settings_env) -> HgCommandRunner:
    return HgCommandRunner(get_settings())


@pytest.mark.asyncio
async def test_landed_source_returns_full_target_node(runner, tmp_path) -> None:
    repo = tmp_path / "linear"
    await _init(repo)
    await _commit(repo, "base")
    source = await _commit(repo, "feature")
    target = await _commit(repo, "more")  # descends from source
    result = await verify_landed_merge(
        runner, repository_path=repo, source_revision=source, target_revision=target
    )
    assert result == target
    assert len(result) == 40


@pytest.mark.asyncio
async def test_unlanded_source_raises_conflict(runner, tmp_path) -> None:
    repo = tmp_path / "diverged"
    await _init(repo)
    base = await _commit(repo, "base")
    source = await _commit(repo, "feature")
    await _hg(repo, "update", "-r", base)
    await _hg(repo, "branch", "target-branch")
    target = await _commit(repo, "target-work")  # diverged from source
    with pytest.raises(ConflictError):
        await verify_landed_merge(
            runner, repository_path=repo, source_revision=source, target_revision=target
        )


@pytest.mark.asyncio
async def test_invalid_revision_raises_validation(runner, tmp_path) -> None:
    repo = tmp_path / "r"
    await _init(repo)
    await _commit(repo, "base")
    node = await _commit(repo, "second")  # all() now resolves to 2 nodes (ambiguous)
    with pytest.raises(ValidationFailure):
        await verify_landed_merge(
            runner, repository_path=repo, source_revision="all()", target_revision=node
        )


@pytest.mark.asyncio
async def test_source_equal_to_target_is_landed(runner, tmp_path) -> None:
    repo = tmp_path / "same"
    await _init(repo)
    await _commit(repo, "base")
    node = await _commit(repo, "only")
    result = await verify_landed_merge(
        runner, repository_path=repo, source_revision=node, target_revision=node
    )
    assert result == node


@pytest.mark.asyncio
async def test_null_node_source_is_rejected(runner, tmp_path) -> None:
    repo = tmp_path / "nullsrc"
    await _init(repo)
    target = await _commit(repo, "base")
    with pytest.raises(ValidationFailure):
        await verify_landed_merge(
            runner, repository_path=repo, source_revision="null", target_revision=target
        )


@pytest.mark.asyncio
async def test_unknown_revision_is_rejected(runner, tmp_path) -> None:
    repo = tmp_path / "unknown"
    await _init(repo)
    target = await _commit(repo, "base")
    with pytest.raises(ValidationFailure):
        await verify_landed_merge(
            runner, repository_path=repo, source_revision="no-such-rev", target_revision=target
        )
