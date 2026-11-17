import type { RemediationType, TwinSnapshot, VulnKind, Vulnerability } from "../../api/types";
import { ID_RE } from "../assets/validate";

export const KINDS: VulnKind[] = ["remote_service", "outdated_software", "local_privesc", "weak_credential", "misconfig", "excessive_permission"];
export const FIXES: RemediationType[] = ["apply_patch", "restrict_port", "enforce_mfa", "set_password_policy", "reduce_permission", "segment_zones"];
const MITRE_RE = /^T\d{4}(\.\d{3})?$/;
const CVE_RE = /^CVE-\d{4}-\d{4,7}$/;

export function blankVuln(): Vulnerability {
  return {
    id: "",
    title: "",
    cve: null,
    cve_illustrative: true,
    cvss: 5,
    exploit_maturity: 0.5,
    kind: "remote_service",
    affected_asset: null,
    affected_port: null,
    affected_principal: null,
    grants_privilege: "user",
    fixed_version: null,
    mitre_techniques: [],
    fixed_by_remediation_types: ["apply_patch"],
    description: "",
  };
}

export type Errors = Partial<Record<"id" | "title" | "cvss" | "maturity" | "cve" | "mitre" | "target" | "port", string>>;

/** Client-side mirror of the backend Vulnerability validators (the server re-validates). */
export function validateVuln(v: Vulnerability, existing: string[], isNew: boolean, snap: TwinSnapshot): Errors {
  const e: Errors = {};
  if (!ID_RE.test(v.id)) e.id = "validation.id";
  else if (isNew && existing.includes(v.id)) e.id = "validation.idTaken";
  if (!v.title.trim()) e.title = "validation.required";
  if (!(v.cvss >= 0 && v.cvss <= 10)) e.cvss = "vulnForm.err.cvss";
  if (!(v.exploit_maturity >= 0 && v.exploit_maturity <= 1)) e.maturity = "vulnForm.err.maturity";
  if (v.cve && !CVE_RE.test(v.cve)) e.cve = "vulnForm.err.cve";
  if (v.mitre_techniques.some((m) => !MITRE_RE.test(m))) e.mitre = "vulnForm.err.mitre";
  if (!v.affected_asset && !v.affected_principal) e.target = "vulnForm.err.target";
  if (v.affected_port !== null) {
    const a = snap.assets.find((x) => x.id === v.affected_asset);
    if (!a) e.port = "vulnForm.err.portNeedsAsset";
    else if (!a.open_ports.some((p) => p.port === v.affected_port)) e.port = "vulnForm.err.portClosed";
  }
  return e;
}
