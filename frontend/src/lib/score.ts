import type { Asset, AssetType, Severity, SimulationResult, Vulnerability } from "../api/types";

export type Band = "critical" | "warning" | "medium" | "secure";

/** Score bands used everywhere a score is displayed. */
export function scoreBand(score: number): Band {
  if (score < 40) return "critical";
  if (score < 60) return "warning";
  if (score < 80) return "medium";
  return "secure";
}

export const BAND_COLOR: Record<Band, string> = {
  critical: "var(--color-critical)",
  warning: "var(--color-warning)",
  medium: "var(--color-medium)",
  secure: "var(--color-secure)",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--color-critical)",
  high: "var(--color-warning)",
  medium: "var(--color-medium)",
  low: "var(--color-secure)",
};

/** Text colour for severity labels on tinted backgrounds (WCAG AA for small text). */
export const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "var(--color-critical-ink)",
  high: "var(--color-warning)",
  medium: "var(--color-medium)",
  low: "var(--color-secure)",
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export function severityFromCvss(cvss: number): Severity {
  if (cvss >= 9) return "critical";
  if (cvss >= 7) return "high";
  if (cvss >= 4) return "medium";
  return "low";
}

export function maxSeverity(list: Severity[]): Severity | null {
  for (const s of SEVERITY_ORDER) if (list.includes(s)) return s;
  return null;
}

/** Round a 0-100 score for display; never shows "100" unless it truly is 100. */
export function displayScore(score: number): number {
  const r = Math.round(score);
  return r === 100 && score < 100 ? 99 : r;
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function countBySeverity(findings: { severity: Severity }[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) out[f.severity] += 1;
  return out;
}

export type NodeState = "compromised" | "reachable" | "secure" | "warning" | "unreached";

/** Visual state of an asset: from the simulation when given, else from its own findings. */
export function assetState(asset: Asset, result: SimulationResult | null | undefined): NodeState {
  if (result) {
    if (result.compromised_assets.includes(asset.id)) return "compromised";
    if (result.reachable_assets.includes(asset.id)) return "reachable";
    return "secure";
  }
  return asset.vulnerability_ids.length > 0 ? "warning" : "secure";
}

export const STATE_COLOR: Record<NodeState, string> = {
  compromised: "var(--color-critical)",
  reachable: "var(--color-warning)",
  warning: "var(--color-warning)",
  secure: "var(--color-secure)",
  unreached: "var(--color-secure)",
};

export type Role = "server" | "firewall" | "identity" | "gateway";
export function roleOf(t: AssetType): Role {
  if (t === "firewall") return "firewall";
  if (t === "internet_gateway") return "gateway";
  if (t === "identity_server" || t === "employee_ws" || t === "admin_ws") return "identity";
  return "server";
}
export const ROLE_COLOR: Record<Role, string> = {
  server: "var(--color-primary)",
  firewall: "var(--color-magenta)",
  identity: "var(--color-violet)",
  gateway: "#e6fbff",
};

export type HardeningCategory = "servers" | "endpoints" | "network";
export function hardeningCategory(t: AssetType): HardeningCategory {
  if (t === "employee_ws" || t === "admin_ws") return "endpoints";
  if (t === "firewall" || t === "internet_gateway") return "network";
  return "servers";
}

/**
 * Hardening coverage 0..1 per category. Each asset contributes checks:
 * MFA, EDR (non-network), disk encryption (non-network), no EOL software ("patch level"),
 * and no port exposed to the internet zone without an allowlist ("exposure").
 */
export function hardening(
  assets: Asset[],
  vulns: Vulnerability[],
): Record<HardeningCategory, { score: number; passed: number; total: number }> {
  const acc: Record<HardeningCategory, { passed: number; total: number }> = {
    servers: { passed: 0, total: 0 },
    endpoints: { passed: 0, total: 0 },
    network: { passed: 0, total: 0 },
  };
  const exposed = new Set(
    vulns.filter((v) => v.kind === "misconfig" && v.affected_port !== null).map((v) => v.affected_asset),
  );
  for (const a of assets) {
    if (a.asset_type === "internet_gateway") continue;
    const cat = hardeningCategory(a.asset_type);
    const checks = [a.security_config.mfa_enabled, !a.software.some((s) => s.eol), !exposed.has(a.id)];
    if (cat !== "network") checks.push(a.security_config.edr, a.security_config.disk_encryption);
    acc[cat].total += checks.length;
    acc[cat].passed += checks.filter(Boolean).length;
  }
  const out = {} as Record<HardeningCategory, { score: number; passed: number; total: number }>;
  for (const k of Object.keys(acc) as HardeningCategory[]) {
    const { passed, total } = acc[k];
    out[k] = { passed, total, score: total ? passed / total : 0 };
  }
  return out;
}
