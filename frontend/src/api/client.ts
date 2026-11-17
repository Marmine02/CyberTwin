import type {
  AiStatus,
  ApplyOut,
  Asset,
  AssetImpact,
  CatalogItem,
  Connection,
  EventOut,
  FirewallRule,
  MutationOut,
  Principal,
  RecommendationList,
  RemediationAction,
  RemediationRecord,
  RevisionOut,
  ScenarioId,
  ScenarioOut,
  SimulationRunOut,
  SimulationSummary,
  SnapshotDiff,
  TwinOut,
  TwinState,
  Vulnerability,
} from "./types";

import { isMessage, type Message } from "../i18n/message";

export const API_BASE = "/api/v1";
const DEFAULT_TIMEOUT_MS = 20_000;

/** Translatable form of an error: an engine-catalog message from the server, or a UI key for client-side errors. */
export type ErrorText = { ns: "engine"; message: Message } | { ns: "ui"; key: UiErrorKey; params: Record<string, string | number> };
export type UiErrorKey = "common.errNetwork" | "common.errTimeout" | "common.errHttp" | "ai.errIdle";

/** Error carrying the backend envelope {error:{code,message,details,i18n?}}. `message` is English. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly text?: ErrorText;
  constructor(code: string, message: string, status: number, details: Record<string, unknown> = {}, text?: ErrorText) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.text = text;
  }
}

const ui = (key: UiErrorKey, params: Record<string, string | number>): ErrorText => ({ ns: "ui", key, params });
type Envelope = { error?: { code: string; message: string; details?: Record<string, unknown>; i18n?: Message } };
const fromEnvelope = (env: NonNullable<Envelope["error"]>, status: number) =>
  new ApiError(env.code, env.message, status, env.details ?? {}, isMessage(env.i18n) ? { ns: "engine", message: env.i18n } : undefined);

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) {
      throw new ApiError("timeout", `${method} ${path} did not answer within ${timeoutMs / 1000}s`, 0, {},
        ui("common.errTimeout", { request: `${method} ${path}`, seconds: timeoutMs / 1000 }));
    }
    const detail = (e as Error).message;
    throw new ApiError("network", `Cannot reach the CyberTwin API (${detail})`, 0, {}, ui("common.errNetwork", { detail }));
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    if (!res.ok)
      throw new ApiError("bad_response", `${method} ${path} returned HTTP ${res.status}`, res.status, {},
        ui("common.errHttp", { request: `${method} ${path}`, status: res.status }));
    return text as T;
  }
  if (!res.ok) {
    const env = (data as Envelope)?.error;
    if (env) throw fromEnvelope(env, res.status);
    throw new ApiError("http_error", `${method} ${path} returned HTTP ${res.status}`, res.status, {},
      ui("common.errHttp", { request: `${method} ${path}`, status: res.status }));
  }
  return data as T;
}

const q = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

type Expected = { expected_revision?: number };
const t = (twin: string) => `/twins/${encodeURIComponent(twin)}`;

export const api = {
  health: () => request<{ status: string; engine_version: string }>("GET", "/health"),
  twins: () => request<TwinOut[]>("GET", "/twins"),
  twin: (id: string, revision?: number) => request<TwinState>("GET", `${t(id)}${q({ revision })}`),
  revisions: (id: string) => request<RevisionOut[]>("GET", `${t(id)}/revisions`),
  diff: (id: string, base: number, target: number) =>
    request<{ base: number; target: number; diff: SnapshotDiff }>("GET", `${t(id)}/diff${q({ base, target })}`),
  saveLayout: (id: string, positions: Record<string, { x: number; y: number }>) =>
    request<void>("PUT", `${t(id)}/layout`, { positions }),

  createAsset: (id: string, a: Asset, o: Expected = {}) =>
    request<MutationOut>("POST", `${t(id)}/assets${q(o)}`, a),
  updateAsset: (id: string, a: Asset, o: Expected = {}) =>
    request<MutationOut>("PUT", `${t(id)}/assets/${encodeURIComponent(a.id)}${q(o)}`, a),
  deleteAsset: (id: string, assetId: string) => request<MutationOut>("DELETE", `${t(id)}/assets/${assetId}`),
  assetImpact: (id: string, assetId: string) => request<AssetImpact>("GET", `${t(id)}/assets/${assetId}/impact`),

  createConnection: (id: string, c: Connection) => request<MutationOut>("POST", `${t(id)}/connections`, c),
  updateConnection: (id: string, c: Connection) =>
    request<MutationOut>("PUT", `${t(id)}/connections/${encodeURIComponent(c.id)}`, c),
  deleteConnection: (id: string, cid: string) => request<MutationOut>("DELETE", `${t(id)}/connections/${cid}`),

  createPrincipal: (id: string, p: Principal) => request<MutationOut>("POST", `${t(id)}/principals`, p),
  updatePrincipal: (id: string, p: Principal) => request<MutationOut>("PUT", `${t(id)}/principals/${p.id}`, p),
  deletePrincipal: (id: string, pid: string) => request<MutationOut>("DELETE", `${t(id)}/principals/${pid}`),

  createRule: (id: string, r: FirewallRule) => request<MutationOut>("POST", `${t(id)}/firewall-rules`, r),
  updateRule: (id: string, r: FirewallRule) => request<MutationOut>("PUT", `${t(id)}/firewall-rules/${r.id}`, r),
  deleteRule: (id: string, rid: string) => request<MutationOut>("DELETE", `${t(id)}/firewall-rules/${rid}`),

  createVuln: (id: string, v: Vulnerability) => request<MutationOut>("POST", `${t(id)}/vulnerabilities`, v),
  updateVuln: (id: string, v: Vulnerability) =>
    request<MutationOut>("PUT", `${t(id)}/vulnerabilities/${encodeURIComponent(v.id)}`, v),
  deleteVuln: (id: string, vid: string) => request<MutationOut>("DELETE", `${t(id)}/vulnerabilities/${vid}`),
  catalog: () => request<CatalogItem[]>("GET", "/vulnerabilities/catalog"),

  scenarios: () => request<ScenarioOut[]>("GET", "/scenarios"),
  simulate: (twin_id: string, scenario: ScenarioId, params: Record<string, string> = {}, revision?: number) =>
    request<SimulationRunOut>("POST", "/simulations", { twin_id, scenario, params, revision }, 60_000),
  simulation: (sid: string) => request<SimulationRunOut>("GET", `/simulations/${sid}`),
  simulations: (twin: string, scenario?: ScenarioId) =>
    request<SimulationSummary[]>("GET", `/simulations${q({ twin, scenario })}`),

  recommendations: (twin: string, scenario: ScenarioId, foothold?: string) =>
    request<RecommendationList>("GET", `/recommendations${q({ twin, scenario, foothold })}`, undefined, 60_000),
  applyRemediation: (
    twin_id: string,
    scenario: ScenarioId,
    actions: RemediationAction[],
    params: Record<string, string> = {},
  ) => request<ApplyOut>("POST", "/remediations/apply", { twin_id, scenario, actions, params }, 60_000),
  remediations: (twin: string) => request<RemediationRecord[]>("GET", `/remediations${q({ twin })}`),
  revert: (revisionId: number) => request<RevisionOut>("POST", `/revisions/${revisionId}/revert`),

  aiStatus: () => request<AiStatus>("GET", "/ai/status"),
  events: (twin?: string) => request<EventOut[]>("GET", `/events${q({ twin })}`),
  markEventsRead: (twin?: string) => request<void>("POST", `/events/read${q({ twin })}`),
  demoReset: () => request<TwinOut>("POST", "/demo/reset"),
};

export const reportUrl = (sid: string, format: "html" | "json", lang: string) =>
  `${API_BASE}/reports/${sid}${q({ format, lang })}`;

// ---------- SSE over POST ----------
export interface CitationViolation {
  step_id: string;
  cited_under: string;
  problem: string;
}
export interface TechniqueViolation {
  step_id: string;
  engine: string;
  claimed: string;
}
export interface StreamEvent {
  type: "meta" | "delta" | "done" | "reset" | "progress";
  chars?: number;
  numeric_violations?: string[];
  unplaced_numbers?: string[];
  citation_violations?: CitationViolation[];
  unknown_placeholders?: string[];
  order_violations?: string[];
  technique_violations?: TechniqueViolation[];
  duplicate_fixes?: string[];
  mode?: "llm" | "fallback";
  provider?: string;
  model?: string;
  cached?: boolean;
  reason?: string;
  text?: string;
  unverified?: string[];
  missing_sections?: string[];
}

/** Parse a text/event-stream body chunk-by-chunk. Exported for unit tests. */
export function parseSseChunk(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data: "));
    if (line) events.push(JSON.parse(line.slice(6)) as StreamEvent);
  }
  return { events, rest };
}

export async function streamPost(
  path: string,
  body: unknown,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal,
  idleTimeoutMs = 90_000,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as Envelope;
      if (data.error) throw fromEnvelope(data.error, res.status);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      msg = `${path} returned HTTP ${res.status}`;
    }
    throw new ApiError("stream_failed", msg, res.status, {}, ui("common.errHttp", { request: `POST ${path}`, status: res.status }));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new ApiError("timeout", `No data from the assistant for ${idleTimeoutMs / 1000}s`, 0, {},
              ui("ai.errIdle", { seconds: idleTimeoutMs / 1000 })),
          ),
        idleTimeoutMs,
      );
    });
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await Promise.race([reader.read(), idle]);
    } finally {
      clearTimeout(timer);
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;
    events.forEach(onEvent);
  }
}
