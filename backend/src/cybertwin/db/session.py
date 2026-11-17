"""Async engine/session factory and programmatic Alembic migrations."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):  # type: ignore[no-untyped-def]
    # Enforce foreign keys on SQLite (other backends ignore this listener's effect).
    module = type(dbapi_conn).__module__
    if "sqlite" in module:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, future=True)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


def alembic_config(url: str) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def run_migrations(url: str) -> None:
    """Upgrade the database at ``url`` to head (sync; call from a thread when inside a loop)."""
    command.upgrade(alembic_config(url), "head")
