"""Settings from environment (.env). AI keys never leave the server."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./cybertwin.db"
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    seed_on_startup: bool = True
    # Single-process app mode: path to the built frontend (frontend/dist). Empty = API only (dev with the vite proxy,
    # Docker with nginx). When set, the backend also serves the UI with an SPA fallback; /api is unchanged.
    frontend_dist: str = ""

    ai_provider: Literal["none", "ollama", "openai_compatible", "anthropic"] = "none"
    ai_model: str = ""
    ai_base_url: str = ""
    ai_api_key: SecretStr = Field(default=SecretStr(""))
    ai_timeout_seconds: float = 45.0
    ai_max_retries: int = 2

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
