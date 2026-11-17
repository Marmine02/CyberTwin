from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

# Set CT_TEST_DATABASE_URL (e.g. postgresql+asyncpg://...) to run the API tests against that database instead of a
# throw-away SQLite file. The public schema is dropped and re-created before every test (PostgreSQL only).
PG_URL = os.environ.get("CT_TEST_DATABASE_URL")


async def _reset_pg(url: str) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    if PG_URL:
        asyncio.run(_reset_pg(PG_URL))
    return Settings(
        database_url=PG_URL or f"sqlite+aiosqlite:///{(tmp_path / 't.db').as_posix()}",
        cors_origins="http://localhost:5173",
        ai_provider="none",
        seed_on_startup=True,
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as c:
        yield c


API = "/api/v1"
