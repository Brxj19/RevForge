"""Bounded concurrency for Mercurial work (hg subprocesses and in-process repository reads).

One global semaphore caps total hg work per API process; a per-repository semaphore stops a
single hot repository from taking every slot. A slot covers exactly one unit of work (one hg
subprocess or one ``asyncio.to_thread`` call), never a whole request, so units never nest
and cannot deadlock on the per-repository limit.

Semaphores are kept per event loop. The API has one loop, but tests and the TestClient
portal create several, and an ``asyncio.Semaphore`` must not be shared across loops.
"""

from __future__ import annotations

import asyncio
import weakref
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from .errors import HgBusyError


@dataclass(slots=True)
class _RepoSlot:
    semaphore: asyncio.Semaphore
    users: int = 0


@dataclass(slots=True)
class _LoopState:
    global_semaphore: asyncio.Semaphore
    per_repository: dict[str, _RepoSlot] = field(default_factory=dict)


class HgWorkLimiter:
    def __init__(self, *, max_global: int, max_per_repository: int, acquire_timeout: float) -> None:
        self._max_global = max_global
        self._max_per_repository = max_per_repository
        self._acquire_timeout = acquire_timeout
        self._states: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, _LoopState] = (
            weakref.WeakKeyDictionary()
        )

    def _state(self) -> _LoopState:
        loop = asyncio.get_running_loop()
        state = self._states.get(loop)
        if state is None:
            state = _LoopState(global_semaphore=asyncio.Semaphore(self._max_global))
            self._states[loop] = state
        return state

    @asynccontextmanager
    async def slot(self, repository_key: str) -> AsyncIterator[None]:
        state = self._state()
        repo_slot = state.per_repository.get(repository_key)
        if repo_slot is None:
            repo_slot = _RepoSlot(semaphore=asyncio.Semaphore(self._max_per_repository))
            state.per_repository[repository_key] = repo_slot
        repo_slot.users += 1
        try:
            try:
                async with asyncio.timeout(self._acquire_timeout):
                    await repo_slot.semaphore.acquire()
            except TimeoutError as exc:
                raise HgBusyError() from exc
            try:
                try:
                    async with asyncio.timeout(self._acquire_timeout):
                        await state.global_semaphore.acquire()
                except TimeoutError as exc:
                    raise HgBusyError() from exc
                try:
                    yield
                finally:
                    state.global_semaphore.release()
            finally:
                repo_slot.semaphore.release()
        finally:
            repo_slot.users -= 1
            if repo_slot.users == 0:
                state.per_repository.pop(repository_key, None)

    def in_use(self, repository_key: str) -> int:
        """Number of callers holding or waiting for a slot on this repository (tests)."""
        state = self._state()
        repo_slot = state.per_repository.get(repository_key)
        return 0 if repo_slot is None else repo_slot.users
