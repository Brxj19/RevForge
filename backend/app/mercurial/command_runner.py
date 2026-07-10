from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings

from .errors import HgCommandFailedError, HgCommandOutputLimitError, HgCommandTimeoutError


@dataclass(slots=True)
class HgCommandResult:
    stdout: bytes
    stderr: bytes


class HgCommandRunner:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._executable = self._resolve_executable(settings.hg_executable)

    async def run(
        self,
        args: Sequence[str],
        *,
        repository_path: Path | None = None,
        stdout_limit: int | None = None,
        stderr_limit: int | None = None,
        cwd: Path | None = None,
    ) -> HgCommandResult:
        command: list[str] = [self._executable]
        if repository_path is not None:
            command.extend(["--repository", str(repository_path)])
        command.extend(args)
        working_dir = cwd or (repository_path if repository_path is not None else Path.cwd())

        stdout_cap = stdout_limit or self._settings.hg_max_stdout_bytes
        stderr_cap = stderr_limit or self._settings.hg_max_stderr_bytes

        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(working_dir),
            env=self._build_env(),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        if process.stdout is None:
            raise HgCommandFailedError(code="hg_process_init_failed")
        if process.stderr is None:
            raise HgCommandFailedError(code="hg_process_init_failed")

        stdout_task = asyncio.create_task(self._read_stream(process.stdout, stdout_cap))
        stderr_task = asyncio.create_task(self._read_stream(process.stderr, stderr_cap))
        wait_task = asyncio.create_task(process.wait())

        timeout_deadline = time.monotonic() + self._settings.hg_command_timeout_seconds
        stdout_bytes = b""
        stderr_bytes = b""
        pending = {stdout_task, stderr_task, wait_task}
        while True:
            remaining = timeout_deadline - time.monotonic()
            if remaining <= 0:
                await self._terminate(process)
                await asyncio.gather(*pending, return_exceptions=True)
                raise HgCommandTimeoutError()

            done, pending = await asyncio.wait(
                pending,
                timeout=remaining,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if not done:
                await self._terminate(process)
                await asyncio.gather(*pending, return_exceptions=True)
                raise HgCommandTimeoutError()

            if stdout_task in done and stdout_task.result()[1]:
                stdout_bytes = stdout_task.result()[0]
                if stderr_task.done():
                    stderr_bytes = stderr_task.result()[0]
                await self._terminate(process)
                await asyncio.gather(stderr_task, return_exceptions=True)
                raise HgCommandOutputLimitError(stdout=stdout_bytes, stderr=stderr_bytes)
            if stderr_task in done and stderr_task.result()[1]:
                stderr_bytes = stderr_task.result()[0]
                if stdout_task.done():
                    stdout_bytes = stdout_task.result()[0]
                await self._terminate(process)
                await asyncio.gather(stdout_task, return_exceptions=True)
                raise HgCommandOutputLimitError(stdout=stdout_bytes, stderr=stderr_bytes)
            if wait_task in done:
                break

        stdout, stdout_truncated = await stdout_task
        stderr, stderr_truncated = await stderr_task
        if stdout_truncated or stderr_truncated:
            raise HgCommandOutputLimitError(stdout=stdout, stderr=stderr)
        if process.returncode != 0:
            raise self._classify_failure(stderr=stderr, exit_code=process.returncode)
        return HgCommandResult(stdout=stdout, stderr=stderr)

    async def run_json(
        self,
        args: Sequence[str],
        *,
        repository_path: Path | None = None,
        stdout_limit: int | None = None,
        cwd: Path | None = None,
    ) -> list[dict]:
        result = await self.run(
            args,
            repository_path=repository_path,
            stdout_limit=stdout_limit,
            cwd=cwd,
        )
        try:
            payload = json.loads(result.stdout.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise HgCommandFailedError(code="hg_invalid_json") from exc
        if not isinstance(payload, list):
            raise HgCommandFailedError(code="hg_invalid_json_shape")
        return payload

    def _build_env(self) -> dict[str, str]:
        env = {
            "HGPLAIN": "1",
            "HGRCPATH": "",
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "PATH": os.environ.get("PATH", ""),
        }
        return env

    def _resolve_executable(self, configured: str) -> str:
        if os.sep in configured:
            executable = Path(configured)
            if not executable.exists():
                raise FileNotFoundError(configured)
            return str(executable)
        resolved = shutil.which(configured)
        if resolved is None:
            raise FileNotFoundError(configured)
        return resolved

    async def _read_stream(
        self,
        stream: asyncio.StreamReader,
        limit: int,
    ) -> tuple[bytes, bool]:
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = await stream.read(65536)
            if not chunk:
                return b"".join(chunks), False
            total += len(chunk)
            if total > limit:
                allowed = len(chunk) - (total - limit)
                if allowed > 0:
                    chunks.append(chunk[:allowed])
                return b"".join(chunks), True
            chunks.append(chunk)

    async def _terminate(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        process.kill()
        await process.wait()

    def _classify_failure(self, *, stderr: bytes, exit_code: int | None) -> HgCommandFailedError:
        stderr_text = stderr.decode("utf-8", errors="ignore").lower()
        if "unknown revision" in stderr_text or "unknown identifier" in stderr_text:
            return HgCommandFailedError(code="hg_unknown_revision", exit_code=exit_code)
        if "no such file" in stderr_text or "not tracked" in stderr_text:
            return HgCommandFailedError(code="hg_missing_path", exit_code=exit_code)
        if "no repository found" in stderr_text:
            return HgCommandFailedError(code="hg_missing_repository", exit_code=exit_code)
        return HgCommandFailedError(code="hg_command_failed", exit_code=exit_code)
