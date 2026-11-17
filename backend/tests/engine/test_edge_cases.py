from __future__ import annotations

import pytest

from app.core.errors import DomainError
from app.engine.simulate import run_simulation
from app.schemas.simulation import ScenarioId
from app.schemas.twin import TwinSnapshot
from tests.builders import mini


@pytest.mark.parametrize("scenario", list(ScenarioId))
def test_empty_twin_does_not_crash(scenario: ScenarioId) -> None:
    snap = TwinSnapshot()
    if scenario in (ScenarioId.lateral_movement, ScenarioId.privilege_escalation):
        with pytest.raises(DomainError):
            run_simulation(snap, "t", 1, scenario)
        return
    r = run_simulation(snap, "t", 1, scenario)
    assert r.paths == []
    assert r.score == 100.0
    assert r.primary_path is None


def test_no_vulnerabilities_means_no_data_path() -> None:
    r = run_simulation(mini(vulns=False), "t", 1, ScenarioId.sensitive_data_exposure)
    assert r.paths == []
    assert r.score == 100.0
    assert "web" in r.reachable_assets  # still network-reachable
    assert r.compromised_assets == []


def test_disconnected_graph() -> None:
    snap = mini()
    snap.connections = []
    r = run_simulation(snap, "t", 1, ScenarioId.sensitive_data_exposure)
    assert r.paths == []
    assert r.reachable_assets == []
    assert r.blast_radius == 0.0


def test_unreachable_goal_gives_empty_paths() -> None:
    snap = mini(rules=[])
    r = run_simulation(snap, "t", 1, ScenarioId.sensitive_data_exposure)
    assert r.paths == [] and r.score == 100.0


def test_cycles_are_handled() -> None:
    extra = {
        "assets": [
            {
                "id": "app",
                "name": "App",
                "ip": "10.9.1.20",
                "asset_type": "app_server",
                "zone": "dmz",
                "criticality": 2,
                "data_sensitivity": 0,
                "open_ports": [{"port": 22, "service": "ssh"}],
            },
        ],
        "connections": [
            {"id": "c3", "source": "web", "target": "app"},
            {"id": "t1", "source": "web", "target": "app", "kind": "trust"},
            {"id": "t2", "source": "app", "target": "web", "kind": "trust"},
        ],
        "principals": [
            {
                "id": "ops",
                "name": "ops",
                "credential_strength": "weak",
                "logged_on_assets": ["app", "web"],
                "permissions": [{"asset_id": "app", "level": "admin"}, {"asset_id": "web", "level": "admin"}],
            },
        ],
    }
    r = run_simulation(mini(extra=extra), "t", 1, ScenarioId.lateral_movement, {"foothold": "web"})
    assert r.paths
    for p in r.paths:
        nodes = [p.steps[0].source] + [s.to for s in p.steps]
        assert len(nodes) == len(set(nodes)), "paths must be simple (no repeated state)"


def test_no_internet_gateway() -> None:
    snap = mini()
    snap.connections = [c for c in snap.connections if "gw" not in (c.source, c.target)]
    snap.assets = [a for a in snap.assets if a.id != "gw"]
    r = run_simulation(snap, "t", 1, ScenarioId.sensitive_data_exposure)
    assert r.paths == []


def test_invalid_foothold_param() -> None:
    with pytest.raises(DomainError, match="does not exist"):
        run_simulation(mini(), "t", 1, ScenarioId.lateral_movement, {"foothold": "nope"})
    with pytest.raises(DomainError, match="does not accept"):
        run_simulation(mini(), "t", 1, ScenarioId.sensitive_data_exposure, {"foothold": "web"})
    with pytest.raises(DomainError, match="foothold_privilege"):
        run_simulation(mini(), "t", 1, ScenarioId.lateral_movement, {"foothold": "web", "foothold_privilege": "root"})
    with pytest.raises(DomainError, match="gateway"):
        run_simulation(mini(), "t", 1, ScenarioId.lateral_movement, {"foothold": "gw"})


def test_outdated_scenario_ignores_non_eol_remote_service() -> None:
    r = run_simulation(mini(), "t", 1, ScenarioId.outdated_service_exploitation)
    assert r.paths == []  # v-ssh is remote_service on non-EOL software
    data = mini().model_dump()
    data["assets"][2]["software"] = [{"name": "OpenSSH", "version": "7.2", "eol": True}]
    snap = TwinSnapshot.model_validate(data)
    r2 = run_simulation(snap, "t", 1, ScenarioId.outdated_service_exploitation)
    assert r2.paths


def test_validation_errors_are_specific() -> None:
    with pytest.raises(ValueError, match="not a valid IPv4"):
        mini(
            extra={
                "assets": [
                    {
                        "id": "x",
                        "name": "x",
                        "ip": "999.1.1.1",
                        "asset_type": "web_server",
                        "zone": "dmz",
                        "criticality": 1,
                        "data_sensitivity": 0,
                    }
                ]
            }
        )
    with pytest.raises(ValueError, match="duplicate open port"):
        mini(
            extra={
                "assets": [
                    {
                        "id": "x",
                        "name": "x",
                        "ip": "10.0.0.9",
                        "asset_type": "web_server",
                        "zone": "dmz",
                        "criticality": 1,
                        "data_sensitivity": 0,
                        "open_ports": [{"port": 80, "service": "http"}, {"port": 80, "service": "http"}],
                    }
                ]
            }
        )
    with pytest.raises(ValueError, match="unknown asset"):
        mini(extra={"connections": [{"id": "cx", "source": "web", "target": "ghost"}]})
    with pytest.raises(ValueError, match="invalid version string"):
        mini(
            extra={
                "assets": [
                    {
                        "id": "x",
                        "name": "x",
                        "ip": "10.0.0.9",
                        "asset_type": "web_server",
                        "zone": "dmz",
                        "criticality": 1,
                        "data_sensitivity": 0,
                        "software": [{"name": "a", "version": "1.0 beta!"}],
                    }
                ]
            }
        )
