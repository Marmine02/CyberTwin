import { describe, expect, it } from "vitest";
import type { Asset, AttackPath, Connection } from "../api/types";
import { buildFlow } from "../features/map/build";

const mk = (id: string, zone: Asset["zone"], type: Asset["asset_type"] = "web_server"): Asset => ({
  id,
  name: id,
  ip: "10.0.0.1",
  asset_type: type,
  os: "",
  zone,
  open_ports: [],
  software: [],
  vulnerability_ids: [],
  security_config: { mfa_enabled: false, password_policy: "medium", edr: false, disk_encryption: false, local_admin_users: [] },
  criticality: 3,
  data_sensitivity: 1,
  risk_score: null,
  position: { x: 0, y: 0 },
});
const conn = (id: string, s: string, t: string, kind: Connection["kind"] = "network"): Connection => ({
  id,
  source: s,
  target: t,
  kind,
  ports: [],
  description: "",
  principal_id: null,
});

const assets = [
  mk("gw", "internet", "internet_gateway"),
  mk("fw", "dmz", "firewall"),
  mk("web", "dmz"),
  mk("idp", "internal", "identity_server"),
  mk("db", "data", "db_server"),
];
const conns = [conn("c1", "gw", "fw"), conn("c2", "fw", "web"), conn("t1", "web", "idp", "trust")];
const path: AttackPath = {
  id: "P1",
  goal: "DATA:db",
  goal_label: { code: "goal.data", params: { asset: "db" } },
  steps: [],
  likelihood: 0.7,
  impact: 1,
  risk: 0.7,
  assets: ["gw", "fw", "web", "idp", "db"],
};

describe("map builder", () => {
  it("marks attack edges in attack order and adds logical hops", () => {
    const { edges } = buildFlow({ assets, connections: conns, vulns: [], path, zone: "all", hiddenTypes: [] });
    const attack = edges.filter((e) => e.data?.attack).map((e) => e.id).sort();
    expect(attack).toEqual(["atk:idp>db", "c1", "c2", "t1"]);
    expect(edges.find((e) => e.id === "c2")?.data?.reverse).toBe(false);
  });
  it("detects reversed link direction", () => {
    const { edges } = buildFlow({ assets, connections: [conn("c2", "web", "fw")], vulns: [], path, zone: "all", hiddenTypes: [] });
    expect(edges.find((e) => e.id === "c2")?.data).toMatchObject({ attack: true, reverse: true });
  });
  it("filters by zone and type", () => {
    const z = buildFlow({ assets, connections: conns, vulns: [], zone: "dmz", hiddenTypes: [] });
    expect(z.nodes.map((n) => n.id).sort()).toEqual(["fw", "web"]);
    const t = buildFlow({ assets, connections: conns, vulns: [], zone: "all", hiddenTypes: ["firewall"] });
    expect(t.nodes.some((n) => n.id === "fw")).toBe(false);
    expect(t.edges.some((e) => e.id === "c1")).toBe(false);
  });
  it("truncates the path during replay", () => {
    const { edges } = buildFlow({ assets, connections: conns, vulns: [], path, pathReveal: 3, zone: "all", hiddenTypes: [] });
    expect(edges.filter((e) => e.data?.attack).map((e) => e.id).sort()).toEqual(["c1", "c2"]);
  });
});
