"""Runtime settings, read from environment variables (prefix ``CYBERTWIN_``) and ``.env``."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CYBERTWIN_", env_file=".env", extra="ignore")

    database_url: str = Field(default=f"sqlite+aiosqlite:///{(BACKEND_DIR / 'cybertwin.db').as_posix()}")
    frontend_dist: Path | None = None
    i18n_dir: Path = REPO_DIR / "shared" / "i18n"
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173"]

    ai_provider: Literal["none", "ollama", "openai_compatible", "anthropic"] = "none"
    ai_base_url: str = ""
    ai_model: str = ""
    ai_api_key: SecretStr = SecretStr("")
    ai_timeout_s: float = 30.0
    ai_retries: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()
