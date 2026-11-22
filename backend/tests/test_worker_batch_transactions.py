from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.core.config import Settings
from app.worker import RevForgeWorker


def test_batch_commits_each_event_before_claiming_the_next() -> None:
    async def exercise() -> None:
        commits: list[int] = []
        sessions: list[object] = []
        first, second = SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())

        class Session:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            def begin_nested(self):
                return self

            async def commit(self):
                commits.append(1)

        def session_factory():
            session = Session()
            sessions.append(session)
            return session

        worker = RevForgeWorker(
            settings=Settings(),
            session_factory=session_factory,
            batch_size=3,  # type: ignore[arg-type]
        )

        async def claim(session, *, batch_size):
            assert batch_size == 1
            assert len(commits) == len(sessions) - 1
            return [[first], [second], []][len(sessions) - 1]

        worker._event_service.claim_events = AsyncMock(side_effect=claim)
        worker._event_service.mark_event_failed = AsyncMock()
        worker._event_service.mark_event_completed = AsyncMock()
        worker._process_entry = AsyncMock(side_effect=[RuntimeError("failure"), True])
        await worker._process_batch()
        assert len(commits) == 2
        assert len(sessions) == 3
        assert worker._event_service.mark_event_failed.await_args.kwargs["entry_id"] == first.id
        assert worker._event_service.mark_event_completed.await_args.kwargs["entry_id"] == second.id

    asyncio.run(exercise())
