import type { DiscoveryEvent, SimResult, Step } from '../api/types'

export interface Frame {
  index: number
  mode: 'primary' | 'discovery'
  assetId: string | null
  /** where the attacker operates from when this step happens */
  attackerAt: string
  /** assets the attacker controls after this frame */
  compromised: string[]
  /** highlighted asset sequence so far (primary mode) */
  path: string[]
  /** camera targets */
  focus: string[]
  step?: Step
  event?: DiscoveryEvent
}

const STEP_MS = 1200
export const stepMs = (speed: number) => STEP_MS / speed

function seqFor(entry: string, steps: Step[]): string[] {
  const seq = [entry]
  for (const s of steps) {
    const next = s.technique === 'network_reach' ? [...(s.via ?? []), s.asset_id] : [s.asset_id]
    for (const a of next) if (a && seq[seq.length - 1] !== a) seq.push(a)
  }
  return seq
}

export function primaryFrames(result: SimResult): Frame[] {
  const p = result.paths.find((x) => x.id === result.primary_path)
  if (!p) return []
  const entry = result.entry.asset_id
  const owned = new Set<string>()
  let foothold = entry
  return p.steps.map((s, i) => {
    const attackerAt = foothold
    if (s.to.startsWith('PRIV:')) foothold = s.asset_id
    if (s.to.startsWith('PRIV:') || s.to.startsWith('DATA:')) owned.add(s.asset_id)
    const path = seqFor(entry, p.steps.slice(0, i + 1))
    return {
      index: i, mode: 'primary', assetId: s.asset_id, attackerAt, compromised: [...owned].sort(), path,
      focus: [...new Set([attackerAt, s.asset_id, ...(s.via ?? [])])], step: s,
    }
  })
}

export function discoveryFrames(result: SimResult): Frame[] {
  const owned = new Set<string>()
  const events = result.timeline.discovery.filter((e) => e.from !== null)
  return events.map((e, i) => {
    if (e.kind === 'priv' && e.asset_id) owned.add(e.asset_id)
    return {
      index: i, mode: 'discovery', assetId: e.asset_id, attackerAt: result.entry.asset_id, compromised: [...owned].sort(), path: [],
      focus: e.asset_id ? [e.asset_id] : [result.entry.asset_id], event: e,
    }
  })
}
