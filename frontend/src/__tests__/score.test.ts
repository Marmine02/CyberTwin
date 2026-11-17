import { describe, expect, it } from "vitest";
import type { Asset, SimulationResult } from "../api/types";
import {
  assetState,
  countBySeverity,
  displayScore,
  hardening,
  maxSeverity,
  scoreBand,
  severityFromCvss,
} from "../lib/score";

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: "a",
  name: "A",
  ip: "10.0.0.1",
  asset_type: "web_server",
  os: "",
  zone: "dmz",
  open_ports: [],
  software: [],
  vulnerability_ids: [],
  security_config: { mfa_enabled: false, password_policy: "medium", edr: false, disk_encryption: false, local_admin_users: [] },
  criticality: 3,
  data_sensitivity: 1,
  risk_score: null,
  position: { x: 0, y: 0 },
  ...over,
});

describe("score display", () => {
  it("bands scores", () => {
    expect(scoreBand(24.54)).toBe("critical");
    expect(scoreBand(40)).toBe("warning");
    expect(scoreBand(79.99)).toBe("medium");
    expect(scoreBand(80)).toBe("secure");
  });
  it("never rounds a non-perfect score up to 100", () => {
    expect(displayScore(99.6)).toBe(99);
    expect(displayScore(100)).toBe(100);
    expect(displayScore(24.54)).toBe(25);
  });
  it("maps CVSS to severity", () => {
    expect(severityFromCvss(9.8)).toBe("critical");
    expect(severityFromCvss(7)).toBe("high");
    expect(severityFromCvss(5.3)).toBe("medium");
    expect(severityFromCvss(2)).toBe("low");
  });
  it("counts and picks max severity", () => {
    expect(countBySeverity([{ severity: "high" }, { severity: "high" }, { severity: "critical" }])).toEqual({
      critical: 1,
      high: 2,
      medium: 0,
      low: 0,
    });
    expect(maxSeverity(["medium", "high"])).toBe("high");
    expect(maxSeverity([])).toBeNull();
  });
  it("derives node state from simulation or findings", () => {
    const a = asset({ vulnerability_ids: ["v1"] });
    expect(assetState(a, null)).toBe("warning");
    const r = { compromised_assets: ["a"], reachable_assets: ["a"] } as unknown as SimulationResult;
    expect(assetState(a, r)).toBe("compromised");
    expect(assetState(asset({ id: "b" }), r)).toBe("secure");
  });
  it("computes hardening coverage per category", () => {
    const h = hardening(
      [
        asset({ security_config: { mfa_enabled: true, password_policy: "strong", edr: true, disk_encryption: true, local_admin_users: [] } }),
        asset({ id: "fw", asset_type: "firewall" }),
      ],
      [],
    );
    expect(h.servers).toEqual({ passed: 5, total: 5, score: 1 });
    expect(h.network.total).toBe(3);
    expect(h.network.passed).toBe(2);
    expect(h.endpoints.total).toBe(0);
  });
});
