from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from cybertwin.api.app import create_app
from cybertwin.config import Settings

V = "/api/v1"
SDE = "sensitive_data_exposure"


def make_client(tmp_path: Path, **overrides: Any) -> TestClient:
    settings = Settings(database_url=f"sqlite+aiosqlite:///{(tmp_path / 'api.db').as_posix()}", **overrides)
    return TestClient(create_app(settings))


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    with make_client(tmp_path) as c:
        yield c


def twin_id(client: TestClient) -> int:
    twins = client.get(f"{V}/twins").json()
    return int(twins[0]["id"])


def assert_error(resp: Any, status: int, code: str) -> dict[str, Any]:
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) == {"error"}
    err = body["error"]
    assert err["code"] == code
    assert err["i18n"]["code"] == f"error.{code}"
    assert isinstance(err["message"], str)
    assert err["message"]
    return dict(err)


def test_health_and_seed(client: TestClient) -> None:
    h = client.get(f"{V}/health").json()
    assert h["status"] == "ok"
    assert h["simulation_only"] is True
    assert h["twins"] == 1
    twins = client.get(f"{V}/twins").json()
    assert twins[0]["slug"] == "northwind"
    assert twins[0]["head_revision"] == 1


def test_model_view(client: TestClient) -> None:
    tid = twin_id(client)
    m = client.get(f"{V}/twins/{tid}/model").json()
    assert m["revision"] == 1
    web = next(a for a in m["assets"] if a["id"] == "web-01")
    assert web["vulnerability_ids"] == ["v-nginx-web01", "v-openssh-web01"]
    assert web["risk_score"] > 0
    assert any(c["kind"] == "permission" and c["derived"] for c in m["derived_connections"])
    assert m["positions"]["web-01"] == {"x": 300.0, "y": 95.0}


def test_demo_flow_simulate_apply_revert(client: TestClient) -> None:
    tid = twin_id(client)
    run = client.post(f"{V}/twins/{tid}/simulations", json={"scenario": SDE})
    assert run.status_code == 201
    r = run.json()
    assert 22 <= r["score"] <= 28
    assert r["result"]["paths"][0]["assets"] == [
        "inet",
        "fw-edge",
        "web-01",
        "fw-int",
        "idp-01",
        "customer-db",
    ]
    again = client.post(f"{V}/twins/{tid}/simulations", json={"scenario": SDE}).json()
    assert again["result_hash"] == r["result_hash"]
    assert again["id"] != r["id"]

    recs = client.get(f"{V}/twins/{tid}/recommendations", params={"scenario": SDE}).json()
    top3 = [x["action"] for x in recs["recommendations"][:3]]
    applied = client.post(f"{V}/twins/{tid}/remediations/apply", json={"actions": top3, "scenario": SDE})
    assert applied.status_code == 201, applied.text
    rem = applied.json()
    assert rem["comparison"]["after"]["score"] == 100.0
    assert rem["to_revision"] == 2
    assert "excessive_privilege:svc-web:customer-db" in rem["comparison"]["residual_exposure"]

    no_path = client.post(f"{V}/twins/{tid}/simulations", json={"scenario": SDE, "revision": 2}).json()
    assert no_path["result"]["no_path"]["code"] == "no_path.unreachable"

    cmp = client.post(
        f"{V}/twins/{tid}/compare", json={"scenario": SDE, "revision_a": 1, "revision_b": 2}
    ).json()
    assert cmp["comparison"]["after"]["score"] == 100.0
    assert len(cmp["comparison"]["blocked_paths"]) == len(r["result"]["paths"])

    rv = client.post(f"{V}/remediations/{rem['id']}/revert")
    assert rv.status_code == 201
    assert rv.json()["run"]["score"] == r["score"]
    assert rv.json()["revision"]["number"] == 3
    assert_error(client.post(f"{V}/remediations/{rem['id']}/revert"), 409, "remediation.already_reverted")

    revs = client.get(f"{V}/twins/{tid}/revisions").json()
    assert [x["number"] for x in revs] == [3, 2, 1]
    assert [x["kind"] for x in revs] == ["revert", "remediation", "seed"]
    diff = client.get(f"{V}/twins/{tid}/revisions/2/diff").json()
    assert diff["from"] == 1
    assert diff["diff"]["summary"]["changes"] >= 3

    history = client.get(f"{V}/twins/{tid}/simulations").json()
    assert len(history) >= 5
    assert client.get(f"{V}/simulations/{r['id']}").json()["result"]["result_hash"] == r["result_hash"]
    events = client.get(f"{V}/events").json()
    assert events["unread"] >= 3
    assert events["items"][0]["code"] == "event.remediation_reverted"
    assert client.post(f"{V}/events/read").json()["marked"] >= 3
    assert client.get(f"{V}/events").json()["unread"] == 0


def test_asset_crud_creates_revisions(client: TestClient) -> None:
    tid = twin_id(client)
    asset = {
        "id": "hr-01",
        "name": "HR Server",
        "ip": "10.0.2.30",
        "type": "app_server",
        "zone": "internal",
        "criticality": 3,
        "data_sensitivity": 2,
        "open_ports": [{"port": 445, "service": "smb"}],
    }
    created = client.post(f"{V}/twins/{tid}/assets", json=asset)
    assert created.status_code == 201, created.text
    assert created.json()["revision"]["number"] == 2
    assert client.get(f"{V}/twins/{tid}/assets/hr-01").json()["name"] == "HR Server"
    conn = client.post(
        f"{V}/twins/{tid}/connections",
        json={"id": "n-fw-int--hr-01", "source": "fw-int", "target": "hr-01", "kind": "network"},
    )
    assert conn.status_code == 201
    upd = client.put(f"{V}/twins/{tid}/assets/hr-01", json={**asset, "criticality": 5})
    assert upd.status_code == 200
    assert upd.json()["revision"]["diff"]["assets"]["changed"]["hr-01"][0]["field"] == "criticality"
    deps = client.get(f"{V}/twins/{tid}/assets/hr-01/dependents").json()
    assert deps["connections"] == ["n-fw-int--hr-01"]
    deleted = client.delete(f"{V}/twins/{tid}/assets/hr-01").json()
    assert deleted["affected"]["connections"] == ["n-fw-int--hr-01"]
    assert deleted["revision"]["number"] == 5
    assert_error(client.get(f"{V}/twins/{tid}/assets/hr-01"), 404, "not_found")
    # Positions never create revisions.
    assert client.put(
        f"{V}/twins/{tid}/positions", json={"positions": {"web-01": {"x": 1, "y": 2}}}
    ).json() == {"saved": 1}
    assert client.get(f"{V}/twins/{tid}").json()["head_revision"] == 5
    # Deleting hr-01 (and its cascaded link) made the model identical to r1 again.
    assert_error(client.post(f"{V}/twins/{tid}/revisions/1/restore"), 409, "revision.no_change")
    restored = client.post(f"{V}/twins/{tid}/revisions/2/restore")
    assert restored.status_code == 201
    assert restored.json()["kind"] == "revert"
    assert restored.json()["diff"]["assets"]["added"] == ["hr-01"]


@pytest.mark.parametrize(
    ("path", "body"),
    [
        (
            "principals",
            {"id": "u1", "name": "U", "kind": "user", "privilege": "user", "credential_strength": "weak"},
        ),
        ("firewall-rules", {"id": "edge-30", "firewall_id": "fw-edge", "order": 30, "action": "deny"}),
        (
            "vulnerabilities",
            {
                "id": "v-x",
                "cve": "CVE-2021-4034",
                "title": "pkexec",
                "cvss": 7.8,
                "exploit_maturity": "high",
                "kind": "local_privesc",
                "asset_id": "web-01",
                "grants": "admin",
            },
        ),
    ],
)
def test_other_collections_crud(client: TestClient, path: str, body: dict[str, Any]) -> None:
    tid = twin_id(client)
    assert client.post(f"{V}/twins/{tid}/{path}", json=body).status_code == 201
    assert any(x["id"] == body["id"] for x in client.get(f"{V}/twins/{tid}/{path}").json())
    assert client.delete(f"{V}/twins/{tid}/{path}/{body['id']}").status_code == 200


def test_error_envelopes(client: TestClient) -> None:
    tid = twin_id(client)
    bad_ip = {
        "id": "x",
        "name": "X",
        "ip": "999.1.1.1",
        "type": "app_server",
        "zone": "internal",
        "criticality": 1,
        "data_sensitivity": 0,
    }
    err = assert_error(client.post(f"{V}/twins/{tid}/assets", json=bad_ip), 422, "validation.request")
    assert err["i18n"]["params"]["field"] == "ip"
    assert "invalid_ipv4" in err["message"]
    dup = {**bad_ip, "id": "web-01", "ip": "10.9.9.9"}
    assert_error(client.post(f"{V}/twins/{tid}/assets", json=dup), 409, "conflict.duplicate_id")
    ghost = {"id": "c-x", "source": "web-01", "target": "ghost", "kind": "network"}
    err = assert_error(client.post(f"{V}/twins/{tid}/connections", json=ghost), 422, "validation.integrity")
    assert "unknown_asset:connection:c-x:ghost" in str(err["details"])
    assert_error(client.get(f"{V}/twins/999"), 404, "not_found")
    assert_error(client.get(f"{V}/nope"), 404, "not_found")
    assert_error(
        client.post(f"{V}/twins/{tid}/simulations", json={"scenario": "x"}), 422, "validation.request"
    )
    assert_error(
        client.post(
            f"{V}/twins/{tid}/simulations",
            json={"scenario": "lateral_movement", "params": {"foothold": "fw-edge"}},
        ),
        422,
        "scenario.invalid_foothold",
    )
    assert_error(
        client.post(
            f"{V}/twins/{tid}/remediations/apply",
            json={"scenario": SDE, "actions": [{"action": "enforce_mfa", "principal_id": "nobody"}]},
        ),
        422,
        "remediation.unknown_principal",
    )
    assert_error(
        client.post(f"{V}/twins/{tid}/compare", json={"scenario": SDE, "revision_a": 1, "revision_b": 1}),
        422,
        "compare.same_revision",
    )
    assert_error(client.post(f"{V}/twins/{tid}/revisions/1/restore"), 409, "revision.no_change")


def test_demo_reset_restores_seed(client: TestClient) -> None:
    tid = twin_id(client)
    client.delete(f"{V}/twins/{tid}/assets/ws-01")
    reset = client.post(f"{V}/demo/reset")
    assert reset.status_code == 201
    new_id = reset.json()["id"]
    m = client.get(f"{V}/twins/{new_id}/model").json()
    assert m["revision"] == 1
    assert any(a["id"] == "ws-01" for a in m["assets"])
    assert [e["code"] for e in client.get(f"{V}/events").json()["items"]] == ["event.demo_reset"]


def test_catalog_scenarios(client: TestClient) -> None:
    cat = client.get(f"{V}/vulns/catalog").json()
    assert cat
    assert all(x["illustrative"] for x in cat)
    sc = client.get(f"{V}/scenarios").json()
    assert next(s["id"] for s in sc) == SDE
    assert "apply_patch" in client.get(f"{V}/remediations/actions").json()


def test_cors_locked(client: TestClient) -> None:
    ok = client.options(
        f"{V}/health", headers={"Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "GET"}
    )
    assert ok.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"
    bad = client.get(f"{V}/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


def test_serves_frontend_dist_with_spa_fallback(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>CyberTwin</title>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    with make_client(tmp_path, frontend_dist=dist) as c:
        assert "CyberTwin" in c.get("/").text
        assert "CyberTwin" in c.get("/attack").text  # SPA route
        assert c.get("/assets/app.js").text == "console.log(1)"
        assert c.get("/favicon.svg").text == "<svg/>"
        assert c.get(f"{V}/health").json()["status"] == "ok"
        assert_error(c.get(f"{V}/missing"), 404, "not_found")
        assert "CyberTwin" in c.get("/../../etc/passwd").text
