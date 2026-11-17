"""Routers assembled from the AI, reports and i18n modules."""

from __future__ import annotations

from fastapi import APIRouter


def routers() -> list[APIRouter]:
    from cybertwin.api.routes import ai

    return [ai.router]
