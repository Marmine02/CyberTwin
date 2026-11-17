import type { Asset } from "../../api/types";

export const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const ID_RE = /^[a-z0-9][a-z0-9._-]{0,62}$/;
export const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+:~-]{0,39}$/;
export const CIDR_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\/(3[0-2]|[12]?\d)$/;

export type Errors = Record<string, string>;

/** Client-side mirror of the backend validators; the server re-validates everything. */
export function validateAsset(a: Asset, existingIds: string[], isNew: boolean): Errors {
  const e: Errors = {};
  if (!ID_RE.test(a.id)) e.id = "validation.id";
  else if (isNew && existingIds.includes(a.id)) e.id = "validation.idTaken";
  if (!a.name.trim()) e.name = "validation.required";
  if (!IPV4.test(a.ip)) e.ip = "validation.ip";
  const seen = new Set<string>();
  a.open_ports.forEach((p, i) => {
    if (!Number.isInteger(p.port) || p.port < 1 || p.port > 65535) e[`port.${i}`] = "validation.port";
    const k = `${p.proto}/${p.port}`;
    if (seen.has(k)) e[`port.${i}`] = "validation.portDup";
    seen.add(k);
    if (!p.service.trim()) e[`service.${i}`] = "validation.required";
    if (p.version && !VERSION_RE.test(p.version)) e[`pversion.${i}`] = "validation.version";
  });
  a.software.forEach((s, i) => {
    if (!s.name.trim()) e[`swname.${i}`] = "validation.required";
    if (!VERSION_RE.test(s.version)) e[`swversion.${i}`] = "validation.version";
  });
  return e;
}

export function blankAsset(): Asset {
  return {
    id: "",
    name: "",
    ip: "",
    asset_type: "app_server",
    os: "",
    zone: "internal",
    open_ports: [],
    software: [],
    vulnerability_ids: [],
    security_config: { mfa_enabled: false, password_policy: "medium", edr: false, disk_encryption: false, local_admin_users: [] },
    criticality: 3,
    data_sensitivity: 1,
    risk_score: null,
    position: { x: 600, y: 600 },
  };
}
