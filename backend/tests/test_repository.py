from __future__ import annotations

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from cybertwin.db.repository import NotFoundError, Repository
from cybertwin.db.session import make_engine
from cybertwin.domain.model import TwinContent

SM = async_sessionmaker[AsyncSession]


async def test_migrations_create_all_tables(db_url: str) -> None:
    engine = make_engine(db_url)
    async with engine.connect() as conn:
        names = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))
    await engine.dispose()
    assert {
        "twins",
        "twin_revisions",
        "node_positions",
        "simulation_runs",
        "remediations",
        "events",
        "ai_cache",
        "alembic_version",
    } <= names


async def test_twin_revisions_are_append_only(sessionmaker: SM, northwind: TwinContent) -> None:
    async with sessionmaker() as s, s.begin():
        repo = Repository(s)
        twin, rev1 = await repo.create_twin(
            slug="nw",
            name="NW",
            description="",
            content=northwind,
            note_i18n={"code": "revision.seed", "params": {}},
        )
        assert rev1.number == 1
        assert rev1.parent_number is None
        vulns = tuple(v for v in northwind.vulnerabilities if v.id != "v-openssh-web01")
        rev2 = await repo.add_revision(
            twin.id,
            northwind.model_copy(update={"vulnerabilities": vulns}),
            kind="edit",
            note_i18n={"code": "revision.edit", "params": {}},
        )
        twin_id = twin.id
    async with sessionmaker() as s:
        repo = Repository(s)
        assert rev2.number == 2
        assert rev2.parent_number == 1
        assert rev2.diff["vulnerabilities"]["removed"] == ["v-openssh-web01"]
        assert await repo.head_number(twin_id) == 2
        r1 = await repo.get_revision(twin_id, 1)
        assert r1.content.content_hash() == northwind.content_hash() == r1.row.content_hash
        head = await repo.get_revision(twin_id)
        assert head.row.number == 2
        assert len(head.content.vulnerabilities) == len(northwind.vulnerabilities) - 1
        assert [r.number for r in await repo.list_revisions(twin_id)] == [1, 2]
        with pytest.raises(NotFoundError):
            await repo.get_revision(twin_id, 99)


async def test_unique_revision_number_enforced(sessionmaker: SM, northwind: TwinContent) -> None:
    async with sessionmaker() as s, s.begin():
        repo = Repository(s)
        twin, _ = await repo.create_twin(
            slug="nw", name="NW", description="", content=northwind, note_i18n={}
        )
    with pytest.raises(IntegrityError):
        async with sessionmaker() as s, s.begin():
            await Repository(s)._insert_revision(twin.id, 1, None, "edit", northwind, {}, {})


async def test_positions_runs_events_cache(sessionmaker: SM, northwind: TwinContent) -> None:
    async with sessionmaker() as s, s.begin():
        repo = Repository(s)
        twin, _ = await repo.create_twin(
            slug="nw", name="NW", description="", content=northwind, note_i18n={}
        )
        await repo.set_positions(twin.id, {"web-01": (1.0, 2.0)})
        await repo.set_positions(twin.id, {"web-01": (3.0, 4.0), "inet": (0.0, 0.0)})
        run = await repo.add_run(
            twin.id, 1, "sensitive_data_exposure", {}, {"result_hash": "abc", "score": 1}
        )
        await repo.add_event(twin.id, "event.run_completed", {"run_id": run.id})
        await repo.cache_put("k", {"v": 1})
        await repo.cache_put("k", {"v": 2})
        twin_id = twin.id
    async with sessionmaker() as s, s.begin():
        repo = Repository(s)
        assert await repo.get_positions(twin_id) == {"web-01": (3.0, 4.0), "inet": (0.0, 0.0)}
        latest = await repo.latest_run(twin_id, scenario="sensitive_data_exposure", revision=1)
        assert latest is not None
        assert latest.result_hash == "abc"
        assert await repo.latest_run(twin_id, revision=2) is None
        events = await repo.list_events()
        assert [e.code for e in events] == ["event.run_completed"]
        assert not events[0].read
        assert await repo.mark_events_read() == 1
        assert await repo.cache_get("k") == {"v": 2}
        assert await repo.cache_get("missing") is None
        await repo.delete_twin(twin_id)
    async with sessionmaker() as s:
        repo = Repository(s)
        assert await repo.list_twins() == []
        assert await repo.get_positions(twin_id) == {}
        with pytest.raises(NotFoundError):
            await repo.get_twin(twin_id)
