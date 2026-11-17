from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from cybertwin.db.session import make_engine, make_sessionmaker, run_migrations
from cybertwin.domain.model import TwinContent
from cybertwin.seed.northwind import northwind_content


@pytest.fixture
def northwind() -> TwinContent:
    return northwind_content()


@pytest.fixture
async def db_url(tmp_path: Path) -> str:
    """A real SQLite file, upgraded with the real Alembic migrations."""
    url = f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}"
    await asyncio.to_thread(run_migrations, url)
    return url


@pytest.fixture
async def sessionmaker(db_url: str) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = make_engine(db_url)
    yield make_sessionmaker(engine)
    await engine.dispose()
