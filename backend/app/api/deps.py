from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.service import AiService
from app.core.config import Settings
from app.db.session import Database
from app.models.tables import TwinRevision
from app.repositories.repos import AiCacheRepository, iso
from app.schemas.api import RevisionOut
from app.schemas.i18n import Message
from app.services.core import Services


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    db: Database = request.app.state.db
    async with db.sessionmaker() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


async def get_services(session: SessionDep) -> Services:
    return Services(session)


async def get_ai(request: Request, session: SessionDep) -> AiService:
    return AiService(request.app.state.settings, AiCacheRepository(session))


ServicesDep = Annotated[Services, Depends(get_services)]
AiDep = Annotated[AiService, Depends(get_ai)]


def revision_out(rev: TwinRevision) -> RevisionOut:
    return RevisionOut(
        id=rev.id,
        twin_id=rev.twin_id,
        number=rev.number,
        parent_number=rev.parent_number,
        kind=rev.kind,
        note=rev.note,
        author=rev.author,
        created_at=iso(rev.created_at),
        total_changes=int((rev.diff or {}).get("total_changes", 0)),
        note_msg=Message.model_validate(rev.diff["note_msg"]) if (rev.diff or {}).get("note_msg") else None,
    )
