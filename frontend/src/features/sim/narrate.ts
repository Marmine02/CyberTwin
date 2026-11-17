import type { Asset, AttackPath, RevisionOut, SimulationResult, TimelineEvent } from "../../api/types";
import type { Message, MsgParam } from "../../i18n/message";

/** ATT&CK ids per engine technique; mirrors backend app/engine/constants.py TECHNIQUE_MITRE (used for timeline
 *  events that are not a step of any reported path, which carry no ids of their own). */
const TECHNIQUE_MITRE: Record<string, string[]> = {
  reach: ["T1046"],
  remote_exploit: ["T1190"],
  brute_force: ["T1110"],
  kerberoast: ["T1558.003"],
  credential_theft: ["T1003"],
  credential_use: ["T1078"],
  local_privesc: ["T1068"],
  trust_abuse: ["T1550"],
  permission_abuse: ["T1078"],
  data_access: ["T1005"],
  domain_takeover: ["T1484"],
};

export type Names = Map<string, string>;
export const assetNames = (assets: Asset[] | undefined): Names => new Map((assets ?? []).map((a) => [a.id, a.name]));

function nameParam(v: string, names: Names): string {
  // "via" is a comma-joined list of asset ids
  return v
    .split(", ")
    .map((x) => names.get(x) ?? x)
    .join(", ");
}

/** Pure (unit-tested): the readable counterpart of an engine message. Each message code is swapped for
 *  `story.<code>` when the catalog has it, recursively, and asset ids in string params become asset names. */
export function toStory(m: Message, names: Names, has: (code: string) => boolean): Message {
  const conv = (v: MsgParam): MsgParam => {
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? nameParam(x, names) : toStory(x, names, has)));
    if (typeof v === "string") return nameParam(v, names);
    if (typeof v === "number") return v;
    return toStory(v, names, has);
  };
  const params: Record<string, MsgParam> = {};
  for (const [k, v] of Object.entries(m.params ?? {})) params[k] = conv(v);
  return { code: has(`story.${m.code}`) ? `story.${m.code}` : m.code, params };
}

/** ATT&CK ids of a timeline event: from the matching path step when there is one, else by technique. */
export function eventMitre(result: SimulationResult, e: TimelineEvent): string[] {
  for (const p of result.paths) {
    const s = p.steps.find((x) => x.to === e.node && x.technique === e.technique);
    if (s) return s.mitre;
  }
  return TECHNIQUE_MITRE[e.technique] ?? [];
}

/** Port of a timeline event's target, when the event is a network reach ("web-01#network:22"). */
export function eventPort(e: TimelineEvent): number | null {
  const m = /#network:(\d+)$/.exec(e.node);
  return m ? Number(m[1]) : null;
}

export type NodeKind = "internet" | "network" | "user" | "admin" | "cred" | "data" | "domain" | "other";

/** Pure: split an engine graph node id into a kind and the asset / principal it refers to. */
export function parseNode(node: string): { kind: NodeKind; ref: string; port?: number } {
  if (node === "ATTACKER@internet") return { kind: "internet", ref: "" };
  if (node === "DOMAIN_ADMIN") return { kind: "domain", ref: "" };
  if (node.startsWith("CRED:")) return { kind: "cred", ref: node.slice(5) };
  if (node.startsWith("DATA:")) return { kind: "data", ref: node.slice(5) };
  const net = /^(.*)#network:(\d+)$/.exec(node);
  if (net) return { kind: "network", ref: net[1]!, port: Number(net[2]) };
  const st = /^(.*)#(user|admin)$/.exec(node);
  if (st) return { kind: st[2] as "user" | "admin", ref: st[1]! };
  return { kind: "other", ref: node };
}

type T = (key: string, o?: Record<string, unknown>) => string;

/** Readable label of a graph node ("Public Web Server · port 22", "credentials of svc-web"). */
export function nodeLabel(node: string, names: Names, t: T): string {
  const n = parseNode(node);
  const name = names.get(n.ref) ?? n.ref;
  switch (n.kind) {
    case "internet":
      return t("ux.node.internet");
    case "domain":
      return t("ux.node.domain");
    case "network":
      return t("ux.node.network", { asset: name, port: n.port });
    case "user":
    case "admin":
      return t(`ux.node.${n.kind}`, { asset: name });
    case "cred":
      return t("ux.node.cred", { principal: name });
    case "data":
      return t("ux.node.data", { asset: name });
    default:
      return name;
  }
}

/** A path as a short chain of readable hops; consecutive hops on the same asset collapse into one. */
export function pathChain(nodes: string[], names: Names, t: T): string[] {
  const out: string[] = [];
  let lastAsset: string | null = null;
  for (const node of nodes) {
    const n = parseNode(node);
    const assetLike = n.kind === "network" || n.kind === "user" || n.kind === "admin";
    if (assetLike && n.ref === lastAsset) {
      // keep the most privileged state of the asset (admin beats user beats network)
      if (n.kind !== "network") out[out.length - 1] = nodeLabel(node, names, t);
      continue;
    }
    out.push(nodeLabel(node, names, t));
    lastAsset = assetLike ? n.ref : null;
  }
  return out;
}

/** Node ids of a path in order (entry + every step target). */
export function pathNodes(p: AttackPath): string[] {
  return p.steps.length ? [p.steps[0]!.from, ...p.steps.map((s) => s.to)] : [];
}

/** Index of the timeline event that reveals a path step (by its target node), or -1. */
export function eventIndexOfNode(result: SimulationResult, node: string): number {
  return result.replay_timeline.findIndex((e) => e.node === node);
}

/** "r2 · after fixes" for a revision number. */
export function revisionLabel(t: T, revisions: RevisionOut[] | undefined, n: number): string {
  const kind = revisions?.find((r) => r.number === n)?.kind;
  return kind ? `r${n} · ${t(`ux.revKind.${kind}`)}` : `r${n}`;
}

