// Types mirroring the backend JSON (docs/API.md, docs/ENGINE.md §6).
import type { Message } from '../i18n/messages'

export type Zone = 'internet' | 'dmz' | 'internal' | 'data' | 'mgmt'
export type AssetType =
  | 'internet_gateway' | 'firewall' | 'web_server' | 'app_server' | 'db_server' | 'identity_server'
  | 'employee_ws' | 'admin_ws'
export type Strength = 'weak' | 'medium' | 'strong'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type ScenarioId =
  | 'sensitive_data_exposure' | 'credential_compromise' | 'lateral_movement' | 'privilege_escalation'
  | 'outdated_service_exploitation'

export const SCENARIOS: ScenarioId[] = [
  'sensitive_data_exposure', 'credential_compromise', 'lateral_movement', 'privilege_escalation',
  'outdated_service_exploitation',
]
export const ZONES: Zone[] = ['internet', 'dmz', 'internal', 'data', 'mgmt']
export const ASSET_TYPES: AssetType[] = [
  'internet_gateway', 'firewall', 'web_server', 'app_server', 'db_server', 'identity_server', 'employee_ws', 'admin_ws',
]

export interface OpenPort { port: number; proto: 'tcp' | 'udp'; service: string; version: string }
export interface Software { name: string; version: string; eol: boolean }
export interface SecurityConfig { mfa: boolean; password_policy: Strength; edr: boolean; local_admins: string[] }

export interface Asset {
  id: string
  name: string
  ip: string
  type: AssetType
  os: string
  zone: Zone
  open_ports: OpenPort[]
  software: Software[]
  security_config: SecurityConfig
  criticality: number
  data_sensitivity: number
  vulnerability_ids: string[]
  risk_score: number
}

export interface Connection {
  id: string
  source: string
  target: string
  kind: 'network' | 'trust' | 'permission'
  label: string
  derived?: boolean
  principal_id?: string
  level?: string
}

export interface Permission { asset_id: string; level: 'user' | 'admin' }
export interface Principal {
  id: string
  name: string
  kind: 'user' | 'service'
  privilege: 'user' | 'admin' | 'domain_admin'
  credential_strength: Strength
  mfa: boolean
  kerberoastable: boolean
  logged_on_assets: string[]
  permissions: Permission[]
}

export interface FirewallRule {
  id: string
  firewall_id: string
  order: number
  action: 'allow' | 'deny'
  src: string
  dst: string
  port: number | null
  proto: 'tcp' | 'udp' | null
  description: string
}

export interface Vulnerability {
  id: string
  cve: string
  title: string
  cvss: number
  exploit_maturity: 'unproven' | 'poc' | 'functional' | 'high'
  kind: 'remote_exploit' | 'local_privesc'
  asset_id: string
  port: number | null
  grants: 'user' | 'admin'
  attack_ids: string[]
  fixed_by: { action: 'apply_patch'; software: string; version: string }
  illustrative: boolean
}

export interface TwinModel {
  twin_id: number
  revision: number
  content_hash: string
  assets: Asset[]
  connections: Connection[]
  derived_connections: Connection[]
  principals: Principal[]
  firewall_rules: FirewallRule[]
  vulnerabilities: Vulnerability[]
  policy: { segmented_zones: [Zone, Zone][] }
  positions: Record<string, { x: number; y: number }>
}

export interface Twin { id: number; slug: string; name: string; description: string; head_revision: number; created_at: string }

export interface RevisionInfo {
  number: number
  parent: number | null
  kind: 'seed' | 'edit' | 'remediation' | 'revert'
  note: Message
  content_hash: string
  changes: number
  created_at: string
  diff?: Diff
}

export interface FieldChange { field: string; before: unknown; after: unknown }
export interface CollectionDiff { added: string[]; removed: string[]; changed: Record<string, FieldChange[]> }
export type Diff = Partial<Record<'assets' | 'connections' | 'principals' | 'firewall_rules' | 'vulnerabilities', CollectionDiff>> & {
  policy?: { before: unknown; after: unknown }
  summary: { changes: number }
}

export interface Step {
  id: string
  from: string
  to: string
  technique: string
  p: number
  structural: boolean
  attack_ids: string[]
  finding_ids: string[]
  message: Message
  asset_id: string
  port?: number
  vuln_id?: string
  principal_id?: string
  via?: string[]
  src_asset?: string
}

export interface AttackPath {
  id: string
  goal: string
  goal_kind: string
  impact: number
  likelihood: number
  risk: number
  nodes: string[]
  steps: Step[]
  assets: string[]
}

export interface Goal {
  id: string
  kind: 'data' | 'credential' | 'privilege' | 'domain'
  asset_id: string | null
  principal_id: string | null
  impact: number
  likelihood: number
  risk: number
  path_id: string | null
}

export interface ActionSpec { action: string; [key: string]: unknown }

export interface Finding {
  id: string
  kind: string
  severity: Severity
  asset_id: string | null
  principal_id: string | null
  message: Message
  fix: ActionSpec | null
  used: boolean
  paths: string[]
}

export interface Chokepoint {
  id: string
  action: ActionSpec
  delta_score: number
  score_after: number
  finding_ids: string[]
  paths_affected: string[]
}

export interface Recommendation {
  id: string
  rank: number
  action: ActionSpec
  kind: 'blocking' | 'hardening'
  delta_score: number
  standalone_delta: number
  score_after: number
  finding_ids: string[]
}

export interface DiscoveryEvent {
  order: number
  state: string
  asset_id: string | null
  kind: string
  from: string | null
  technique: string | null
  likelihood: number
}

export interface SimResult {
  schema_version: number
  scenario: ScenarioId
  params: Record<string, string>
  content_hash: string
  entry: { asset_id: string; state: string }
  score: number
  p_breach: number
  goals: Goal[]
  paths: AttackPath[]
  primary_path: string | null
  reachable_assets: string[]
  compromised_assets: string[]
  compromised_pct: number
  asset_risk: Record<string, number>
  chokepoints: Chokepoint[]
  recommendations: Recommendation[]
  findings: Finding[]
  residual_exposure: string[]
  timeline: { primary: { t: number; step_id: string; asset_id: string }[]; discovery: DiscoveryEvent[] }
  no_path: Message | null
  stats: { states: number; edges: number; goals: number }
  result_hash: string
}

export interface RunSummary {
  id: number
  twin_id: number
  revision: number
  scenario: ScenarioId
  params: Record<string, string>
  score: number
  p_breach: number
  paths: number
  compromised_pct: number
  result_hash: string
  created_at: string
}

export interface Run extends RunSummary { result: SimResult }

export interface BriefPath { id: string; goal: string; assets: string[]; likelihood: number; risk: number }

export interface Comparison {
  before: { score: number; p_breach: number; paths: number; result_hash: string; run_id?: number }
  after: { score: number; p_breach: number; paths: number; result_hash: string; run_id?: number }
  score_delta: number
  blocked_paths: BriefPath[]
  reduced_paths: (BriefPath & { likelihood_after: number; risk_after: number })[]
  unchanged_paths: string[]
  new_paths: BriefPath[]
  per_asset_delta: { asset_id: string; before: number; after: number; delta: number }[]
  residual_exposure: string[]
}

export interface Remediation {
  id: number
  twin_id: number
  from_revision: number
  to_revision: number
  scenario: ScenarioId
  params: Record<string, string>
  actions: ActionSpec[]
  comparison: Comparison
  reverted_by_revision: number | null
  created_at: string
}

export interface AppEvent { id: number; twin_id: number | null; code: string; params: Record<string, unknown>; read: boolean; created_at: string }

export interface RecommendationsResponse {
  revision: number
  scenario: ScenarioId
  params: Record<string, string>
  score: number
  recommendations: Recommendation[]
  chokepoints: Chokepoint[]
  residual_exposure: string[]
  findings: Finding[]
  result_hash: string
}
