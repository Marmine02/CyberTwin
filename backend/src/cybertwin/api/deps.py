from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request

from cybertwin.db.repository import Repository


async def get_repo(request: Request) -> AsyncIterator[Repository]:
    """One transaction per request: committed on success, rolled back on any error."""
    sessionmaker = request.app.state.sessionmaker
    async with sessionmaker() as session, session.begin():
        yield Repository(session)


Repo = Annotated[Repository, Depends(get_repo)]
