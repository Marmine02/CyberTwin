from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from app.api.reports import MONTHS
from app.i18n import render
from app.schemas.i18n import Message
from tests.api.conftest import API


def err(r: Any) -> dict[str, Any]:
    body = r.json()
    assert set(body) == {"error"}, body
    assert set(body["error"]) - {"i18n"} == {"code", "message", "details"}
    if "i18n" in body["error"]:  # translatable form must render to exactly the English message
        assert render(Message.model_validate(body["error"]["i18n"]), "en") == body["error"]["message"]
    return body["error"]  # type: ignore[no-any-return]


def run_sim(c: TestClient, scenario: str = "sensitive_data_exposure", **params: str) -> dict[str, Any]:
    r = c.post(f"{API}/simulations", json={"twin_id": "northwind", "scenario": scenario, "params": params})
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


def sse_events(text: str) -> list[dict[str, Any]]:
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


# ---- basics --------------------------------------------------------------------------------------
def test_health_and_seed(client: TestClient) -> None:
    r = client.get(f"{API}/health")
    assert r.status_code == 200 and r.json()["status"] == "ok" and r.json()["twins"] == 1
    t = client.get(f"{API}/twins/northwind").json()
    assert t["twin"]["head_revision"] == 1
    assert len(t["snapshot"]["assets"]) == 9
    assert t["latest_simulation_id"] is None


def test_unknown_route_and_twin_use_envelope(client: TestClient) -> None:
    e = err(client.get(f"{API}/nope"))
    assert e["code"] == "not_found"
    r = client.get(f"{API}/twins/ghost")
    assert r.status_code == 404 and err(r)["message"] == "Twin 'ghost' does not exist"


def test_cors_locked_to_frontend_origin(client: TestClient) -> None:
    ok = client.options(
        f"{API}/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"}
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options(
        f"{API}/health", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"}
    )
    assert "access-control-allow-origin" not in bad.headers


def test_scenarios_and_catalog(client: TestClient) -> None:
    sc = client.get(f"{API}/scenarios").json()
    assert {s["id"] for s in sc} == {
        "credential_compromise",
        "lateral_movement",
        "privilege_escalation",
        "sensitive_data_exposure",
        "outdated_service_exploitation",
    }
    cat = client.get(f"{API}/vulnerabilities/catalog").json()
    assert all(c["cve"] is None or c["cve"].startswith("CVE-2099") for c in cat)


# ---- simulations ----------------------------------------------------------------------------------
def test_simulation_run_get_history(client: TestClient) -> None:
    run = run_sim(client)
    res = run["result"]
    assert 20 <= res["score"] <= 35
    assert res["primary_path"]["assets"] == ["inet-gw", "fw-edge", "web-01", "idp-01", "customer-db"]
    assert res["primary_path"]["steps"][0]["from"] == "ATTACKER@internet"
    got = client.get(f"{API}/simulations/{run['id']}").json()
    assert got["result_hash"] == run["result_hash"]
    run2 = run_sim(client)
    assert run2["result_hash"] == run["result_hash"] and run2["id"] != run["id"]
    hist = client.get(f"{API}/simulations", params={"twin": "northwind"}).json()
    assert [h["id"] for h in hist][:2] == [run2["id"], run["id"]]
    # asset risk now merged into the twin state
    t = client.get(f"{API}/twins/northwind").json()
    assert t["latest_simulation_id"] == run2["id"]
    web = next(a for a in t["snapshot"]["assets"] if a["id"] == "web-01")
    assert web["risk_score"] > 50
    ev = client.get(f"{API}/events", params={"twin": "northwind"}).json()
    assert any(e["kind"] == "simulation_complete" for e in ev)


def test_simulation_errors(client: TestClient) -> None:
    r = client.post(f"{API}/simulations", json={"twin_id": "northwind", "scenario": "bogus"})
    assert r.status_code == 422 and err(r)["code"] == "validation_error"
    assert "scenario" in err(r)["message"]
    r = client.post(
        f"{API}/simulations",
        json={"twin_id": "northwind", "scenario": "lateral_movement", "params": {"foothold": "ghost"}},
    )
    assert r.status_code == 422 and "Foothold asset 'ghost' does not exist" in err(r)["message"]
    r = client.post(
        f"{API}/simulations",
        json={"twin_id": "northwind", "scenario": "sensitive_data_exposure", "revision": 99},
    )
    assert r.status_code == 404 and err(r)["message"] == "Twin 'northwind' has no revision 99"
    r = client.get(f"{API}/simulations/does-not-exist")
    assert r.status_code == 404 and err(r)["code"] == "simulation_not_found"


def test_lateral_with_foothold(client: TestClient) -> None:
    res = run_sim(client, "lateral_movement", foothold="ws-emp-01")["result"]
    assert res["entry"] == "ws-emp-01#user" and res["params"]["foothold"] == "ws-emp-01"
    assert res["blast_radius"] > 0


# ---- remediation flow ------------------------------------------------------------------------------
def test_demo_flow_recommend_apply_revert(client: TestClient) -> None:
    before = run_sim(client)
    recs = client.get(f"{API}/recommendations", params={"twin": "northwind"}).json()
    assert recs["baseline_score"] == before["score"]
    top3 = [r["action"] for r in recs["recommendations"][:3]]
    deltas = [r["expected_delta_score"] for r in recs["recommendations"]]
    assert deltas == sorted(deltas, reverse=True)

    r = client.post(
        f"{API}/remediations/apply",
        json={"twin_id": "northwind", "scenario": "sensitive_data_exposure", "actions": top3},
    )
    assert r.status_code == 201, r.text
    out = r.json()
    cmp = out["comparison"]
    assert out["revision"]["number"] == 2 and out["revision"]["kind"] == "remediation"
    assert cmp["after_score"] >= 80 and cmp["before_score"] == before["score"]
    assert cmp["blocked_paths"] and cmp["score_delta"] > 50
    assert any(d["asset_id"] == "web-01" and d["delta"] < 0 for d in cmp["per_asset_delta"])

    revs = client.get(f"{API}/twins/northwind/revisions").json()
    assert [x["number"] for x in revs] == [2, 1]
    diff = client.get(f"{API}/twins/northwind/diff", params={"base": 1, "target": 2}).json()["diff"]
    assert "vuln-ssh-exposed" in diff["vulnerabilities"]["removed"]

    hist = client.get(f"{API}/remediations", params={"twin": "northwind"}).json()
    assert hist[0]["id"] == out["remediation_id"]

    rv = client.post(f"{API}/revisions/{out['revision']['id']}/revert")
    assert rv.status_code == 201 and rv.json()["number"] == 3 and rv.json()["kind"] == "revert"
    restored = run_sim(client)
    assert restored["score"] == before["score"]
    assert restored["result"]["revision"] == 3


def test_remediation_errors(client: TestClient) -> None:
    r = client.post(
        f"{API}/remediations/apply",
        json={
            "twin_id": "northwind",
            "scenario": "sensitive_data_exposure",
            "actions": [{"type": "restrict_port", "asset_id": "web-01", "port": 3389}],
        },
    )
    assert r.status_code == 422
    assert err(r)["message"] == "Asset 'web-01' has no port 3389 open; cannot create rule"
    r = client.post(
        f"{API}/remediations/apply",
        json={
            "twin_id": "northwind",
            "scenario": "sensitive_data_exposure",
            "actions": [{"type": "teleport"}],
        },
    )
    assert r.status_code == 422 and err(r)["code"] == "validation_error"
    r = client.post(
        f"{API}/remediations/apply",
        json={"twin_id": "northwind", "scenario": "sensitive_data_exposure", "actions": []},
    )
    assert r.status_code == 422
    first = client.get(f"{API}/twins/northwind/revisions").json()[-1]
    r = client.post(f"{API}/revisions/{first['id']}/revert")
    assert r.status_code == 409 and "first revision" in err(r)["message"]
    assert client.post(f"{API}/revisions/99999/revert").status_code == 404
    # failed applies must not create revisions
    assert client.get(f"{API}/twins/northwind").json()["twin"]["head_revision"] == 1


# ---- CRUD ------------------------------------------------------------------------------------------
NEW_ASSET = {
    "id": "web-02",
    "name": "Staging web",
    "ip": "10.0.1.11",
    "asset_type": "web_server",
    "zone": "dmz",
    "criticality": 2,
    "data_sensitivity": 0,
    "open_ports": [{"port": 443, "service": "https", "version": "nginx-1.25.3"}],
}


def test_asset_crud_connect_delete(client: TestClient) -> None:
    r = client.post(f"{API}/twins/northwind/assets", json=NEW_ASSET)
    assert r.status_code == 201 and r.json()["revision"]["number"] == 2
    assert client.post(f"{API}/twins/northwind/assets", json=NEW_ASSET).status_code == 409

    r = client.post(
        f"{API}/twins/northwind/connections",
        json={"id": "c-fwedge-web02", "source": "fw-edge", "target": "web-02", "ports": [443]},
    )
    assert r.status_code == 201
    r = client.post(f"{API}/twins/northwind/connections", json={"id": "c-dup", "source": "web-02", "target": "fw-edge"})
    assert r.status_code == 409 and "already exists" in err(r)["message"]

    upd = {**NEW_ASSET, "criticality": 4}
    r = client.put(f"{API}/twins/northwind/assets/web-02", json=upd)
    assert r.status_code == 200
    assert client.get(f"{API}/twins/northwind/assets/web-02").json()["criticality"] == 4

    imp = client.get(f"{API}/twins/northwind/assets/web-02/impact").json()
    assert imp["connections"] == ["c-fwedge-web02"]
    r = client.delete(f"{API}/twins/northwind/assets/web-02")
    assert r.status_code == 200 and "dependent" in r.json()["revision"]["note"]
    conns = client.get(f"{API}/twins/northwind/connections").json()
    assert all(c["id"] != "c-fwedge-web02" for c in conns)
    assert client.get(f"{API}/twins/northwind/assets/web-02").status_code == 404


def test_asset_validation_errors(client: TestClient) -> None:
    bad_ip = {**NEW_ASSET, "ip": "10.0.1.300"}
    r = client.post(f"{API}/twins/northwind/assets", json=bad_ip)
    assert r.status_code == 422 and "not a valid IPv4" in err(r)["message"]
    dup_ports = {
        **NEW_ASSET,
        "open_ports": [{"port": 443, "service": "https"}, {"port": 443, "service": "x"}],
    }
    r = client.post(f"{API}/twins/northwind/assets", json=dup_ports)
    assert r.status_code == 422 and "duplicate open port" in err(r)["message"]
    bad_ver = {**NEW_ASSET, "software": [{"name": "nginx", "version": "1.2 beta!"}]}
    r = client.post(f"{API}/twins/northwind/assets", json=bad_ver)
    assert r.status_code == 422 and "invalid version string" in err(r)["message"]
    r = client.put(f"{API}/twins/northwind/assets/web-01", json={**NEW_ASSET})
    assert r.status_code == 422 and "does not match" in err(r)["message"]
    r = client.post(f"{API}/twins/northwind/assets", json=NEW_ASSET, params={"expected_revision": 7})
    assert r.status_code == 409 and "reload and retry" in err(r)["message"]


def test_firewall_rule_errors_and_crud(client: TestClient) -> None:
    rule = {
        "id": "fe-777",
        "firewall_id": "fw-edge",
        "order": 5,
        "src_cidr": "0.0.0.0/0",
        "dst_asset": "web-01",
        "port": 3389,
        "action": "allow",
    }
    r = client.post(f"{API}/twins/northwind/firewall-rules", json=rule)
    assert r.status_code == 422
    assert err(r)["message"] == "Asset 'web-01' has no port 3389 open; cannot create rule"
    r = client.post(f"{API}/twins/northwind/firewall-rules", json={**rule, "firewall_id": "web-01", "port": 443})
    assert r.status_code == 422 and "not a firewall" in err(r)["message"]
    r = client.post(f"{API}/twins/northwind/firewall-rules", json={**rule, "src_zone": "dmz"})
    assert r.status_code == 422 and "exactly one of src_zone or src_cidr" in err(r)["message"]
    deny = {**rule, "port": 22, "action": "deny"}
    assert client.post(f"{API}/twins/northwind/firewall-rules", json=deny).status_code == 201
    # deny at order 5 precedes the allow at order 20 -> the demo path is blocked
    res = run_sim(client)["result"]
    assert res["primary_path"] is None or res["primary_path"]["steps"][0]["to"] != "web-01#network:22"
    assert client.delete(f"{API}/twins/northwind/firewall-rules/fe-777").status_code == 200
    assert client.delete(f"{API}/twins/northwind/firewall-rules/fe-777").status_code == 404


def test_principal_and_vuln_crud(client: TestClient) -> None:
    p = {
        "id": "ops-bot",
        "name": "Ops bot",
        "kind": "service",
        "credential_strength": "weak",
        "permissions": [{"asset_id": "app-01", "level": "write"}],
    }
    assert client.post(f"{API}/twins/northwind/principals", json=p).status_code == 201
    r = client.post(
        f"{API}/twins/northwind/principals",
        json={**p, "id": "ghosty", "permissions": [{"asset_id": "nope", "level": "read"}]},
    )
    assert r.status_code == 422 and "unknown asset 'nope'" in err(r)["message"]
    v = {
        "id": "vuln-app-rce",
        "title": "Tomcat RCE",
        "cvss": 9.0,
        "exploit_maturity": 0.8,
        "kind": "remote_service",
        "affected_asset": "app-01",
        "affected_port": 8080,
        "fixed_by_remediation_types": ["apply_patch"],
    }
    assert client.post(f"{API}/twins/northwind/vulnerabilities", json=v).status_code == 201
    app01 = client.get(f"{API}/twins/northwind/assets/app-01").json()
    assert "vuln-app-rce" in app01["vulnerability_ids"]
    r = client.post(f"{API}/twins/northwind/vulnerabilities", json={**v, "id": "vuln-x", "affected_port": 9999})
    assert r.status_code == 422 and "no port 9999 open" in err(r)["message"]
    r = client.post(f"{API}/twins/northwind/vulnerabilities", json={**v, "id": "vuln-y", "mitre_techniques": ["X1"]})
    assert r.status_code == 422 and "ATT&CK" in err(r)["message"]
    assert client.delete(f"{API}/twins/northwind/vulnerabilities/vuln-app-rce").status_code == 200
    assert client.delete(f"{API}/twins/northwind/principals/ops-bot").status_code == 200


def test_layout_not_revisioned(client: TestClient) -> None:
    r = client.put(f"{API}/twins/northwind/layout", json={"positions": {"web-01": {"x": 1.5, "y": 2.5}}})
    assert r.status_code == 204
    t = client.get(f"{API}/twins/northwind").json()
    assert t["twin"]["head_revision"] == 1
    web = next(a for a in t["snapshot"]["assets"] if a["id"] == "web-01")
    assert web["position"] == {"x": 1.5, "y": 2.5}
    r = client.put(f"{API}/twins/northwind/layout", json={"positions": {"ghost": {"x": 1, "y": 2}}})
    assert r.status_code == 404 and "ghost" in err(r)["message"]


def test_twin_create_clone_delete(client: TestClient) -> None:
    r = client.post(f"{API}/twins", json={"id": "lab", "name": "Lab", "clone_from": "northwind"})
    assert r.status_code == 201 and len(r.json()["snapshot"]["assets"]) == 9
    assert client.post(f"{API}/twins", json={"id": "lab", "name": "Lab"}).status_code == 409
    assert client.delete(f"{API}/twins/lab").status_code == 204
    assert client.get(f"{API}/twins/lab").status_code == 404


def test_demo_reset(client: TestClient) -> None:
    client.post(f"{API}/twins/northwind/assets", json=NEW_ASSET)
    run_sim(client)
    r = client.post(f"{API}/demo/reset")
    assert r.status_code == 200 and r.json()["head_revision"] == 1
    assert client.get(f"{API}/simulations", params={"twin": "northwind"}).json() == []


# ---- AI + reports ----------------------------------------------------------------------------------
def test_ai_explain_fallback_stream(client: TestClient) -> None:
    assert client.get(f"{API}/ai/status").json()["mode"] == "fallback"
    run = run_sim(client)
    r = client.post(f"{API}/ai/explain", json={"simulation_id": run["id"], "lang": "en"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    evs = sse_events(r.text)
    assert evs[0]["type"] == "meta" and evs[0]["mode"] == "fallback"
    text = "".join(e["text"] for e in evs if e["type"] == "delta")
    for h in (
        "Executive summary",
        "Attack narrative",
        "Business impact",
        "Prioritized remediation",
        "Best practices",
    ):
        assert f"## {h}" in text
    assert "P1.S2" in text and "vuln-ssh-rce" in text
    assert evs[-1]["type"] == "done" and evs[-1]["unverified"] == []
    tr = sse_events(client.post(f"{API}/ai/explain", json={"simulation_id": run["id"], "lang": "tr"}).text)
    assert "Yönetici özeti" in "".join(e.get("text", "") for e in tr)
    az = sse_events(client.post(f"{API}/ai/explain", json={"simulation_id": run["id"], "lang": "az"}).text)
    assert "Rəhbərlik üçün xülasə" in "".join(e.get("text", "") for e in az)


def test_ai_explain_with_comparison(client: TestClient) -> None:
    recs = client.get(f"{API}/recommendations", params={"twin": "northwind"}).json()
    out = client.post(
        f"{API}/remediations/apply",
        json={
            "twin_id": "northwind",
            "scenario": "sensitive_data_exposure",
            "actions": [recs["recommendations"][0]["action"]],
        },
    ).json()
    evs = sse_events(
        client.post(
            f"{API}/ai/explain",
            json={
                "simulation_id": out["comparison"]["after_simulation_id"],
                "remediation_id": out["remediation_id"],
            },
        ).text
    )
    text = "".join(e.get("text", "") for e in evs)
    assert "## Before/after comparison" in text
    r = client.post(f"{API}/ai/explain", json={"simulation_id": "nope"})
    assert r.status_code == 404


def test_ai_chat_fallback(client: TestClient) -> None:
    run_sim(client)
    r = client.post(
        f"{API}/ai/chat",
        json={
            "twin_id": "northwind",
            "lang": "en",
            "messages": [{"role": "user", "content": "What should I fix first?"}],
        },
    )
    evs = sse_events(r.text)
    text = "".join(e.get("text", "") for e in evs)
    assert "restrict_port:web-01:22:mgmt" in text
    assert evs[-1]["unverified"] == []
    r = client.post(f"{API}/ai/chat", json={"twin_id": "northwind", "messages": []})
    assert r.status_code == 422


def test_report_json_and_html(client: TestClient) -> None:
    run = run_sim(client)
    rep = client.get(f"{API}/reports/{run['id']}").json()
    assert rep["result"]["score"] == run["score"]
    assert "No real systems" in rep["disclaimer"]
    assert rep["ai_summary"]["mode"] == "fallback"
    h = client.get(f"{API}/reports/{run['id']}", params={"format": "html"})
    assert h.status_code == 200 and h.headers["content-type"].startswith("text/html")
    assert "SIMULATION MODE" in h.text and "Attack paths" in h.text and "<script" not in h.text.lower()
    az = client.get(f"{API}/reports/{run['id']}", params={"format": "html", "lang": "az"}).text
    assert '<html lang="az">' in az and "Hücum yolları" in az and "Təhlükəsizlik balı" in az
    assert " UTC</time>" in az and any(f" {m} " in az for m in MONTHS["az"].split())  # server-side AZ date
    assert "<script" not in az.lower()


def test_domain_errors_carry_a_translatable_message(client: TestClient) -> None:
    r = client.post(
        f"{API}/twins/northwind/firewall-rules",
        json={
            "id": "fe-777",
            "firewall_id": "fw-edge",
            "order": 5,
            "src_cidr": "0.0.0.0/0",
            "dst_asset": "web-01",
            "port": 3389,
            "action": "allow",
        },
    )
    e = err(r)
    assert r.status_code == 422 and e["code"] == "port_not_open"
    assert e["message"] == "Asset 'web-01' has no port 3389 open; cannot create rule"  # unchanged for API clients
    assert e["i18n"] == {"code": "err.rule_port_closed", "params": {"asset": "web-01", "port": 3389}}
    tr = render(Message.model_validate(e["i18n"]), "tr")
    assert tr == "'web-01' varlığında 3389 portu açık değil; kural oluşturulamaz"
    az = render(Message.model_validate(e["i18n"]), "az")
    assert az == "'web-01' aktivində 3389 portu açıq deyil; qayda yaratmaq mümkün deyil"

    nf = err(client.get(f"{API}/simulations/nope"))
    assert nf["i18n"]["code"] == "err.not_found"
    assert render(Message.model_validate(nf["i18n"]), "tr") == "Simülasyon 'nope' bulunamadı"
    assert render(Message.model_validate(nf["i18n"]), "az") == "Simulyasiya 'nope' mövcud deyil"
