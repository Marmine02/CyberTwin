"""Single-process app mode: FRONTEND_DIST makes the backend serve the built UI (real app, real files, temp DB)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from tests.api.conftest import API


def _dist(root: Path) -> Path:
    dist = root / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>CyberTwin</title><div id=root></div>", encoding="utf-8")
    (dist / "assets" / "index-abc123.js").write_text("console.log('app')", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")
    (root / "secret.txt").write_text("outside dist", encoding="utf-8")
    return dist


def _settings(tmp_path: Path, frontend_dist: str) -> Settings:
    return Settings(
        database_url=f"sqlite+aiosqlite:///{(tmp_path / 't.db').as_posix()}",
        frontend_dist=frontend_dist,
        seed_on_startup=True,
    )


def test_backend_serves_ui_with_spa_fallback_and_keeps_api(tmp_path: Path) -> None:
    dist = _dist(tmp_path)
    with TestClient(create_app(_settings(tmp_path, str(dist)))) as c:
        for path in ("/", "/simulate", "/remediation?scenario=sensitive_data_exposure", "/no/such/page"):
            r = c.get(path)
            assert r.status_code == 200 and "<title>CyberTwin</title>" in r.text, path
            assert r.headers["cache-control"] == "no-cache"
        js = c.get("/assets/index-abc123.js")
        assert js.status_code == 200 and "javascript" in js.headers["content-type"]
        assert c.get("/favicon.svg").headers["content-type"].startswith("image/svg")
        assert c.get("/assets/missing.js").status_code == 404  # the assets mount does not fall back to index.html

        assert c.get(f"{API}/health").json()["status"] == "ok"  # API unchanged
        nf = c.get(f"{API}/no-such-route")
        assert nf.status_code == 404 and nf.json()["error"]["code"] == "not_found"
        assert c.get("/api").status_code == 404

        leak = c.get("/..%2Fsecret.txt")  # path traversal: never a file outside dist
        assert "outside dist" not in leak.text


def test_missing_build_fails_at_startup(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=r"has no index.html"):
        create_app(_settings(tmp_path, str(tmp_path / "nowhere")))


def test_default_is_api_only(tmp_path: Path) -> None:
    with TestClient(create_app(_settings(tmp_path, ""))) as c:
        r = c.get("/")
        assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
