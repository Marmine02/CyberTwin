// Mirrors backend Pydantic schemas (app/schemas/*). Keep in sync with docs/API.md.
import type { Message } from "../i18n/message";
export type { Message } from "../i18n/message";

export type Zone = "internet" | "dmz" | "internal" | "data" | "mgmt";
export const ZONES: Zone[] = ["internet", "dmz", "internal", "data", "mgmt"];

export type AssetType =
  | "internet_gateway"
  | "firewall"
  | "web_server"
  | "app_server"
  | "db_server"
  | "identity_server"
  | "employee_ws"
  | "admin_ws";
export const ASSET_TYPES: AssetType[] = [
  "internet_gateway",
  "firewall",
  "web_server",
  "app_server",
  "db_server",
  "identity_server",
  "employee_ws",
  "admin_ws",
];

export type Strength = "weak" | "medium" | "strong";
export type PermissionLevel = "read" | "write" | "admin";
export type VulnKind =
  | "remote_service"
  | "weak_credential"
  | "local_privesc"
  | "misconfig"
  | "excessive_permission"
  | "outdated_software";
export type RemediationType =
  | "restrict_port"
  | "enforce_mfa"
  | "set_password_policy"
  | "apply_patch"
  | "reduce_permission"
  | "segment_zones";

export interface OpenPort {
  port: number;
  proto: "tcp" | "udp";
  service: string;
  version: string;
  exposed_to_zones: Zone[];
}
export interface Software {
  name: string;
  version: string;
  eol: boolean;
}
export interface SecurityConfig {
  mfa_enabled: boolean;
  password_policy: Strength;
  edr: boolean;
  disk_encryption: boolean;
  local_admin_users: string[];
}
export interface Asset {
  id: string;
  name: string;
  ip: string;
  asset_type: AssetType;
  os: string;
  zone: Zone;
  open_ports: OpenPort[];
  software: Software[];
  vulnerability_ids: string[];
  security_config: SecurityConfig;
  criticality: number;
  data_sensitivity: number;
  risk_score: number | null;
  position: { x: number; y: number };
}
export interface Connection {
  id: string;
  source: string;
  target: string;
  kind: "network" | "trust" | "permission";
  ports: number[];
  description: string;
  principal_id: string | null;
}
export interface Principal {
  id: string;
  name: string;
  kind: "user" | "service";
  privilege: "user" | "admin" | "domain_admin";
  credential_strength: Strength;
  mfa: boolean;
  logged_on_assets: string[];
  permissions: { asset_id: string; level: PermissionLevel }[];
}
export interface FirewallRule {
  id: string;
  firewall_id: string;
  order: number;
  src_zone: Zone | null;
  src_cidr: string | null;
  dst_asset: string | null;
  dst_zone: Zone | null;
  port: number | null;
  action: "allow" | "deny";
  description: string;
}
export interface Vulnerability {
  id: string;
  title: string;
  title_i18n?: Message | null;
  cve: string | null;
  cve_illustrative: boolean;
  cvss: number;
  exploit_maturity: number;
  kind: VulnKind;
  affected_asset: string | null;
  affected_port: number | null;
  affected_principal: string | null;
  grants_privilege: "user" | "admin";
  fixed_version: string | null;
  mitre_techniques: string[];
  fixed_by_remediation_types: RemediationType[];
  description: string;
}
export interface TwinSnapshot {
  organization: string;
  assets: Asset[];
  connections: Connection[];
  principals: Principal[];
  firewall_rules: FirewallRule[];
  vulnerabilities: Vulnerability[];
  segmented_zones: { a: Zone; b: Zone }[];
}
export interface TwinOut {
  id: string;
  name: string;
  head_revision: number;
  created_at: string;
}
export interface RevisionOut {
  id: number;
  twin_id: string;
  number: number;
  parent_number: number | null;
  kind: "seed" | "edit" | "remediation" | "revert";
  note: string;
  author: string;
  created_at: string;
  total_changes: number;
  note_msg?: Message | null;
}
export interface TwinState {
  twin: TwinOut;
  revision: RevisionOut;
  snapshot: TwinSnapshot;
  latest_simulation_id: string | null;
}
export interface MutationOut {
  revision: RevisionOut;
  entity: Record<string, unknown> | null;
}
export interface AssetImpact {
  asset_id: string;
  connections: string[];
  firewall_rules: string[];
  principals: string[];
  vulnerabilities: string[];
}

// ---- simulation ----
export type ScenarioId =
  | "credential_compromise"
  | "lateral_movement"
  | "privilege_escalation"
  | "sensitive_data_exposure"
  | "outdated_service_exploitation";
export const SCENARIO_IDS: ScenarioId[] = [
  "sensitive_data_exposure",
  "credential_compromise",
  "lateral_movement",
  "privilege_escalation",
  "outdated_service_exploitation",
];
export interface ScenarioOut {
  id: ScenarioId;
  label: string;
  entry: "internet" | "foothold";
  techniques: string[];
  description: string;
}
export interface PathStep {
  id: string;
  from: string;
  to: string;
  from_asset: string | null;
  to_asset: string | null;
  via: string[];
  technique: string;
  vuln_id: string | null;
  p: number;
  reason: Message;
  mitre: string[];
}
export interface AttackPath {
  id: string;
  goal: string;
  goal_label: Message;
  steps: PathStep[];
  likelihood: number;
  impact: number;
  risk: number;
  assets: string[];
}
export interface Chokepoint {
  vuln_id: string;
  action_id: string;
  delta_score: number;
  score_after: number;
}
export type Severity = "critical" | "high" | "medium" | "low";
export interface Finding {
  id: string;
  vuln_id: string;
  title: Message;
  kind: VulnKind;
  severity: Severity;
  asset_id: string | null;
  principal_id: string | null;
  cvss: number;
  cve: string | null;
  cve_illustrative: boolean;
  path_count: number;
  delta_score: number;
  mitre: string[];
}
export interface ResidualFinding {
  vuln_id: string;
  title: Message;
  kind: VulnKind;
  severity: Severity;
  asset_id: string | null;
  principal_id: string | null;
  cvss: number;
  reason: "unreachable" | "not_in_scenario";
}
export type Phase = "recon" | "exploit" | "credential" | "escalate" | "pivot" | "exfil";
export interface TimelineEvent {
  index: number;
  phase: Phase;
  node: string;
  asset_id: string | null;
  from_asset: string | null;
  technique: string;
  vuln_id: string | null;
  p: number;
  cumulative_likelihood: number;
  on_primary_path: boolean;
  label: Message;
}
export interface AssetRisk {
  asset_id: string;
  risk_score: number;
  state: "compromised" | "reachable" | "unreached";
  best_privilege: string | null;
}
export interface SimulationResult {
  engine_version: string;
  scenario: ScenarioId;
  scenario_label: string;
  twin_id: string;
  revision: number;
  params: Record<string, string>;
  entry: string;
  goals: string[];
  score: number;
  p_breach: number;
  total_assets: number;
  reachable_assets: string[];
  compromised_assets: string[];
  blast_radius: number;
  asset_risks: AssetRisk[];
  paths: AttackPath[];
  primary_path: AttackPath | null;
  chokepoints: Chokepoint[];
  critical_findings: Finding[];
  residual_findings: ResidualFinding[];
  replay_timeline: TimelineEvent[];
  graph_stats: Record<string, number>;
  result_hash: string;
}
export interface SimulationRunOut {
  id: string;
  twin_id: string;
  revision: number;
  scenario: ScenarioId;
  params: Record<string, string>;
  created_at: string;
  result_hash: string;
  score: number;
  result: SimulationResult;
}
export interface SimulationSummary {
  id: string;
  twin_id: string;
  revision: number;
  scenario: ScenarioId;
  created_at: string;
  score: number;
  p_breach: number;
  path_count: number;
  blast_radius: number;
  result_hash: string;
}

// ---- remediation ----
export type RemediationAction =
  | { type: "restrict_port"; asset_id: string; port: number; allow_from_zones: Zone[] }
  | { type: "enforce_mfa"; principal_id: string }
  | { type: "set_password_policy"; principal_id: string; policy: Strength }
  | { type: "apply_patch"; vuln_id: string }
  | { type: "reduce_permission"; principal_id: string; asset_id: string; level: "none" | "read" | "write" }
  | { type: "segment_zones"; zone_a: Zone; zone_b: Zone };

export interface Recommendation {
  id: string;
  action: RemediationAction;
  title: Message;
  rationale: Message;
  fixes_vuln_ids: string[];
  expected_delta_score: number;
  expected_score_after: number;
  severity: Severity;
}
export interface RecommendationList {
  twin_id: string;
  revision: number;
  scenario: ScenarioId;
  baseline_score: number;
  recommendations: Recommendation[];
}
export interface PathRef {
  goal: string;
  signature: string[];
  likelihood_before: number;
  likelihood_after: number | null;
  risk_before: number;
  risk_after: number | null;
}
export interface Comparison {
  twin_id: string;
  scenario: ScenarioId;
  before_revision: number;
  after_revision: number;
  before_simulation_id: string;
  after_simulation_id: string;
  before_score: number;
  after_score: number;
  score_delta: number;
  blocked_paths: PathRef[];
  reduced_paths: PathRef[];
  new_paths: PathRef[];
  per_asset_delta: { asset_id: string; before: number; after: number; delta: number }[];
  applied_actions: RemediationAction[];
  changes: Message[];
}
export interface ApplyOut {
  remediation_id: string;
  revision: RevisionOut;
  comparison: Comparison;
}
export interface RemediationRecord {
  id: string;
  twin_id: string;
  from_revision: number;
  to_revision: number;
  actions: RemediationAction[];
  comparison: Comparison;
  created_at: string;
}
export interface EventOut {
  id: number;
  twin_id: string;
  kind: "simulation_complete" | "remediation_applied" | "revision_reverted" | "demo_reset" | string;
  title: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}
export interface AiStatus {
  configured_provider: string;
  provider: string;
  model: string;
  mode: "llm" | "fallback";
  config_error: string | null;
}
export interface DiffCollection {
  added: string[];
  removed: string[];
  changed: { id: string; fields: string[]; before: Record<string, unknown>; after: Record<string, unknown> }[];
}
export interface SnapshotDiff {
  assets: DiffCollection;
  connections: DiffCollection;
  principals: DiffCollection;
  firewall_rules: DiffCollection;
  vulnerabilities: DiffCollection;
  segmented_zones: { added: string[][]; removed: string[][] };
  total_changes: number;
}
export interface CatalogItem {
  template: string;
  title: string;
  cvss: number;
  exploit_maturity: number;
  kind: VulnKind;
  needs_port: boolean;
  needs_principal?: boolean;
  grants_privilege: "user" | "admin";
  mitre_techniques: string[];
  fixed_by_remediation_types: RemediationType[];
  cve: string | null;
  title_i18n?: Message;
}
