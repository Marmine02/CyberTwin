import type { AttackPath, Phase, SimulationResult } from "../../api/types";

/** Assets revealed after events[0..cursor] (plus the entry asset). */
export function revealedAssets(result: SimulationResult, cursor: number, entryAsset: string | null): Set<string> {
  const s = new Set<string>();
  if (entryAsset) s.add(entryAsset);
  for (const e of result.replay_timeline.slice(0, cursor + 1)) {
    if (e.asset_id) s.add(e.asset_id);
    if (e.from_asset) s.add(e.from_asset);
  }
  return s;
}

/** Number of leading path.assets entries revealed once the first k path steps are shown. */
export function pathAssetsRevealed(path: AttackPath, k: number): number {
  if (k >= path.steps.length) return path.assets.length;
  const shown: string[] = path.assets.length ? [path.assets[0]!] : [];
  for (const step of path.steps.slice(0, k)) {
    for (const v of step.via) if (shown[shown.length - 1] !== v) shown.push(v);
    if (step.to_asset && shown[shown.length - 1] !== step.to_asset) shown.push(step.to_asset);
  }
  return shown.length;
}

/** How many primary-path steps are revealed at a timeline cursor. */
export function primaryStepsRevealed(result: SimulationResult, cursor: number): number {
  const p = result.primary_path;
  if (!p) return 0;
  const nodes = new Set(result.replay_timeline.slice(0, cursor + 1).map((e) => e.node));
  let k = 0;
  for (const s of p.steps) {
    if (nodes.has(s.to)) k++;
    else break;
  }
  return k;
}

export function entryAssetOf(result: SimulationResult): string | null {
  if (result.entry === "ATTACKER@internet") return result.primary_path?.assets[0] ?? "inet-gw";
  return result.entry.split("#")[0] ?? null;
}

export const PHASE_COLOR: Record<Phase, string> = {
  recon: "#22d3ee",
  exploit: "#f43f5e",
  credential: "#facc15",
  escalate: "#fb923c",
  pivot: "#c084fc",
  exfil: "#e879f9",
};
