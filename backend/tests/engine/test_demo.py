from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from app.engine.simulate import run_simulation
from app.schemas.simulation import ScenarioId
from app.seed.northwind import northwind_snapshot

BACKEND = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def demo_data() -> object:
    return run_simulation(northwind_snapshot(), "northwind", 1, ScenarioId.sensitive_data_exposure)


def test_demo_primary_path_and_step_order(demo_data: object) -> None:
    r = demo_data
    assert r.primary_path is not None  # type: ignore[attr-defined]
    p = r.primary_path  # type: ignore[attr-defined]
    assert [s.technique for s in p.steps] == [
        "reach",
        "remote_exploit",
        "trust_abuse",
        "kerberoast",
        "data_access",
    ]
    assert [s.to for s in p.steps] == [
        "web-01#network:22",
        "web-01#admin",
        "idp-01#user",
        "CRED:svc-web",
        "DATA:customer-db",
    ]
    assert p.assets == ["inet-gw", "fw-edge", "web-01", "idp-01", "customer-db"]
    assert [s.vuln_id for s in p.steps] == [
        "vuln-ssh-exposed",
        "vuln-ssh-rce",
        None,
        "vuln-svcweb-weakpw",
        "vuln-svcweb-dbadmin",
    ]
    assert p.steps[0].via == ["fw-edge"]
    assert p.likelihood == pytest.approx(0.99 * 0.931 * 0.9 * 0.9 * 0.95, abs=1e-6)


def test_demo_score_in_expected_band(demo_data: object) -> None:
    assert 20 <= demo_data.score <= 35  # type: ignore[attr-defined]
    assert demo_data.score == 24.54  # type: ignore[attr-defined]


def test_demo_chokepoints_rank_ssh_first(demo_data: object) -> None:
    top = demo_data.chokepoints[:2]  # type: ignore[attr-defined]
    assert {c.vuln_id for c in top} == {"vuln-ssh-exposed", "vuln-ssh-rce"}
    assert all(c.delta_score > 70 for c in top)


@pytest.mark.parametrize("scenario", list(ScenarioId))
def test_every_scenario_non_empty_on_demo(scenario: ScenarioId) -> None:
    r = run_simulation(northwind_snapshot(), "northwind", 1, scenario)
    assert r.paths, f"{scenario} found no paths"
    assert r.primary_path is not None
    assert r.replay_timeline
    assert r.critical_findings
    assert 0 <= r.score < 100
    for p in r.paths:
        assert len(p.steps) <= 12
        assert all(0.01 <= s.p <= 0.99 for s in p.steps)


def test_lateral_reports_blast_radius() -> None:
    r = run_simulation(northwind_snapshot(), "northwind", 1, ScenarioId.lateral_movement, {"foothold": "ws-emp-01"})
    assert r.entry == "ws-emp-01#user"
    assert "app-01" in r.compromised_assets
    assert r.blast_radius == pytest.approx(len(r.compromised_assets) / r.total_assets, abs=1e-6)


def test_paths_sorted_by_risk(demo_data: object) -> None:
    risks = [p.risk for p in demo_data.paths]  # type: ignore[attr-defined]
    assert risks == sorted(risks, reverse=True)


def test_determinism_five_runs() -> None:
    snap = northwind_snapshot()
    hashes = set()
    blobs = set()
    for _ in range(5):
        r = run_simulation(snap, "northwind", 1, ScenarioId.sensitive_data_exposure)
        hashes.add(r.result_hash)
        blobs.add(r.model_dump_json(by_alias=True))
    assert len(hashes) == 1
    assert len(blobs) == 1


def test_determinism_across_process_restarts() -> None:
    code = (
        "from app.engine.simulate import run_simulation;"
        "from app.schemas.simulation import ScenarioId;"
        "from app.seed.northwind import northwind_snapshot;"
        "print(' '.join(run_simulation(northwind_snapshot(),'northwind',1,s).result_hash for s in ScenarioId))"
    )
    outs = set()
    for seed in ("0", "1", "12345"):
        env = {"PYTHONHASHSEED": seed, "SYSTEMROOT": "C:\\Windows", "PATH": ""}
        res = subprocess.run(
            [sys.executable, "-c", code], cwd=BACKEND, capture_output=True, text=True, env=env, check=True
        )
        outs.add(res.stdout.strip())
    local = " ".join(run_simulation(northwind_snapshot(), "northwind", 1, s).result_hash for s in ScenarioId)
    assert outs == {local}


def test_result_hash_changes_with_revision() -> None:
    a = run_simulation(northwind_snapshot(), "northwind", 1, ScenarioId.sensitive_data_exposure)
    b = run_simulation(northwind_snapshot(), "northwind", 2, ScenarioId.sensitive_data_exposure)
    assert a.result_hash != b.result_hash
    assert a.score == b.score
