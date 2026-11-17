from __future__ import annotations

import os
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai.fallback import render
from app.ai.prompt import SYSTEM_PROMPT, explain_payload
from app.ai.verify import known_tokens, unverified_ids
from app.core.config import Settings
from app.engine.simulate import run_simulation
from app.main import create_app
from app.schemas.simulation import ScenarioId
from app.seed.northwind import northwind_snapshot
from tests.api.conftest import API
from tests.api.test_api import run_sim, sse_events

OLLAMA_URL = os.environ.get("CT_TEST_OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("CT_TEST_OLLAMA_MODEL", "qwen2.5:7b")


def _result() -> object:
    return run_simulation(northwind_snapshot(), "northwind", 1, ScenarioId.sensitive_data_exposure)


def test_post_check_flags_invented_ids() -> None:
    r = _result()
    known = known_tokens(explain_payload(r, None))  # type: ignore[arg-type]
    text = (
        "Step P1.S2 exploits vuln-ssh-rce on web-01 (T1190). The attacker then pivots to web-02 using "
        "vuln-made-up and CVE-2024-1234 at step P9.S9 with technique T9999. Pre-auth issues matter."
    )
    assert unverified_ids(text, known) == ["CVE-2024-1234", "P9.S9", "T9999", "vuln-made-up", "web-02"]


def test_post_check_accepts_fallback_output_in_every_language() -> None:
    r = _result()
    known = known_tokens(explain_payload(r, None))  # type: ignore[arg-type]
    for lang in ("en", "tr", "az"):
        assert unverified_ids(render(r, None, lang), known) == []  # type: ignore[arg-type]


def test_fallback_summary_uses_plural_forms() -> None:
    """1 path vs N paths in EN and TR; no "(s)" left in any language."""
    many = run_simulation(northwind_snapshot(), "northwind", 1, ScenarioId.sensitive_data_exposure)
    n = len(many.paths)
    assert n > 1
    one = many.model_copy(update={"paths": many.paths[:1]})
    summary = {
        (lang, k): render(r, None, lang).split("\n## ")[0]
        for lang in ("en", "tr", "az")
        for k, r in (("1", one), ("n", many))
    }
    assert "The engine found 1 attack path;" in summary[("en", "1")]
    assert f"The engine found {n} attack paths;" in summary[("en", "n")]
    assert "Motor 1 saldırı yolu buldu;" in summary[("tr", "1")]  # Turkish: noun stays singular after a number
    assert f"Motor {n} saldırı yolu buldu;" in summary[("tr", "n")]
    assert "Mühərrik 1 hücum yolu tapdı;" in summary[("az", "1")]  # Azerbaijani: no plural after a number either
    assert f"Mühərrik {n} hücum yolu tapdı;" in summary[("az", "n")]
    assert "Rəhbərlik üçün xülasə" in render(many, None, "az")
    assert "ehtimal 70,9%" in render(many, None, "az")  # decimal comma
    assert not any("(s)" in text for text in summary.values())


def test_system_prompt_states_rules() -> None:
    assert "SIMULATION" in SYSTEM_PROMPT and "Never invent" in SYSTEM_PROMPT and "P1.S3" in SYSTEM_PROMPT


def test_unreachable_provider_retries_then_falls_back(tmp_path: Path) -> None:
    """Real network path: nothing listens on port 9 -> connection refused -> retry -> fallback."""
    s = Settings(
        database_url=f"sqlite+aiosqlite:///{(tmp_path / 'a.db').as_posix()}",
        ai_provider="ollama",
        ai_base_url="http://127.0.0.1:9",
        ai_model="x",
        ai_max_retries=1,
        ai_timeout_seconds=2,
    )
    with TestClient(create_app(s)) as c:
        assert c.get(f"{API}/ai/status").json()["mode"] == "llm"
        run = run_sim(c)
        evs = sse_events(c.post(f"{API}/ai/explain", json={"simulation_id": run["id"]}).text)
        kinds = [e["type"] for e in evs]
        assert kinds[0] == "meta" and evs[0]["mode"] == "llm"
        assert "reset" in kinds
        fb = next(e for e in evs if e["type"] == "meta" and e["mode"] == "fallback")
        assert "ConnectError" in fb["reason"]
        assert evs[-1]["type"] == "done" and evs[-1]["mode"] == "fallback" and evs[-1]["unverified"] == []


def test_misconfigured_provider_reports_error(tmp_path: Path) -> None:
    s = Settings(database_url=f"sqlite+aiosqlite:///{(tmp_path / 'b.db').as_posix()}", ai_provider="anthropic")
    with TestClient(create_app(s)) as c:
        st = c.get(f"{API}/ai/status").json()
        assert st["mode"] == "fallback" and "AI_API_KEY" in st["config_error"]
        # the key value itself must never be echoed
        assert "api_key" not in st


def _ollama_up() -> bool:
    try:
        tags = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=2).json()
        return any(m["name"] == OLLAMA_MODEL for m in tags.get("models", []))
    except (httpx.HTTPError, ValueError):
        return False


@pytest.mark.live
@pytest.mark.skipif(not _ollama_up(), reason=f"Ollama with {OLLAMA_MODEL} not reachable at {OLLAMA_URL}")
def test_live_ollama_explain_and_cache(tmp_path: Path) -> None:
    s = Settings(
        database_url=f"sqlite+aiosqlite:///{(tmp_path / 'c.db').as_posix()}",
        ai_provider="ollama",
        ai_base_url=OLLAMA_URL,
        ai_model=OLLAMA_MODEL,
        ai_timeout_seconds=180,
        ai_max_retries=0,
    )
    with TestClient(create_app(s)) as c:
        run = run_sim(c)
        evs = sse_events(c.post(f"{API}/ai/explain", json={"simulation_id": run["id"]}).text)
        assert evs[0]["mode"] == "llm" and evs[0]["cached"] is False
        done = evs[-1]
        for key in (
            "numeric_violations",
            "citation_violations",
            "unknown_placeholders",
            "order_violations",
            "unplaced_numbers",
            "technique_violations",
            "duplicate_fixes",
            "unverified",
            "missing_sections",
        ):
            assert isinstance(done[key], list), key
        assert done["citation_violations"] == []  # structurally impossible with the keyed schema
        print("live checks:", {k: v for k, v in done.items() if isinstance(v, list) and v})
        assert evs[-1]["type"] == "done" and evs[-1]["mode"] == "llm", evs[-3:]
        text = "".join(e.get("text", "") for e in evs if e["type"] == "delta")
        assert len(text) > 200
        assert "- **P1.S1** _[network reach]_" in text  # steps come from the engine
        assert isinstance(evs[-1]["unverified"], list)
        again = sse_events(c.post(f"{API}/ai/explain", json={"simulation_id": run["id"]}).text)
        assert again[0]["cached"] is True
        assert "".join(e.get("text", "") for e in again if e["type"] == "delta") == text
        chat = sse_events(
            c.post(
                f"{API}/ai/chat",
                json={
                    "twin_id": "northwind",
                    "messages": [{"role": "user", "content": "What is the security score?"}],
                },
            ).text
        )
        assert chat[-1]["mode"] == "llm"
