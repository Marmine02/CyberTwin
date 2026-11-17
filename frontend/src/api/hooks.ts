import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from './client'
import type {
  AppEvent, RecommendationsResponse, Remediation, RevisionInfo, Run, RunSummary, ScenarioId, Twin, TwinModel,
} from './types'
import { useApp } from '../store/app'

export const qk = {
  twins: ['twins'] as const,
  revisions: (t: number) => ['revisions', t] as const,
  model: (t: number, r: number | null) => ['model', t, r] as const,
  runs: (t: number) => ['runs', t] as const,
  latest: (t: number, s: string | null, r: number | null) => ['latest', t, s, r] as const,
  run: (id: number) => ['run', id] as const,
  recs: (t: number, s: string, r: number | null, f: string | null) => ['recs', t, s, r, f] as const,
  remediations: (t: number) => ['remediations', t] as const,
  events: ['events'] as const,
}

export function useTwins() {
  const setTwin = useApp((s) => s.setTwin)
  const twinId = useApp((s) => s.twinId)
  const q = useQuery({ queryKey: qk.twins, queryFn: ({ signal }) => api.get<Twin[]>('/twins', signal) })
  useEffect(() => {
    const first = q.data?.[0]
    if (first && (twinId === null || !q.data?.some((t) => t.id === twinId))) setTwin(first.id)
  }, [q.data, twinId, setTwin])
  return q
}

export function useCurrentTwin(): Twin | undefined {
  const twinId = useApp((s) => s.twinId)
  const { data } = useTwins()
  return data?.find((t) => t.id === twinId)
}

/** Revision being viewed: the explicit pick, else the twin's latest. */
export function useViewedRevision(): number | null {
  const rev = useApp((s) => s.revision)
  const twin = useCurrentTwin()
  return rev ?? twin?.head_revision ?? null
}

export function useRevisions() {
  const twinId = useApp((s) => s.twinId)
  return useQuery({
    queryKey: qk.revisions(twinId ?? 0),
    queryFn: ({ signal }) => api.get<RevisionInfo[]>(`/twins/${twinId}/revisions`, signal),
    enabled: twinId !== null,
  })
}

export function useModel(revisionOverride?: number | null) {
  const twinId = useApp((s) => s.twinId)
  const viewed = useViewedRevision()
  const rev = revisionOverride === undefined ? viewed : revisionOverride
  return useQuery({
    queryKey: qk.model(twinId ?? 0, rev),
    queryFn: ({ signal }) => api.get<TwinModel>(`/twins/${twinId}/model${rev ? `?revision=${rev}` : ''}`, signal),
    enabled: twinId !== null && rev !== null,
  })
}

export function useLatestRun(scenario: ScenarioId | null, revision?: number | null) {
  const twinId = useApp((s) => s.twinId)
  const viewed = useViewedRevision()
  const rev = revision === undefined ? viewed : revision
  const params = new URLSearchParams()
  if (scenario) params.set('scenario', scenario)
  if (rev) params.set('revision', String(rev))
  return useQuery({
    queryKey: qk.latest(twinId ?? 0, scenario, rev),
    queryFn: ({ signal }) => api.get<Run | null>(`/twins/${twinId}/simulations/latest?${params.toString()}`, signal),
    enabled: twinId !== null && rev !== null,
  })
}

export function useRuns() {
  const twinId = useApp((s) => s.twinId)
  return useQuery({
    queryKey: qk.runs(twinId ?? 0),
    queryFn: ({ signal }) => api.get<RunSummary[]>(`/twins/${twinId}/simulations?limit=200`, signal),
    enabled: twinId !== null,
  })
}

export function useRun(id: number | null) {
  return useQuery({
    queryKey: qk.run(id ?? 0),
    queryFn: ({ signal }) => api.get<Run>(`/simulations/${id}`, signal),
    enabled: id !== null,
  })
}

export function useRecommendations(scenario: ScenarioId, revision: number | null, foothold: string | null) {
  const twinId = useApp((s) => s.twinId)
  const p = new URLSearchParams({ scenario })
  if (revision) p.set('revision', String(revision))
  if (foothold) p.set('foothold', foothold)
  return useQuery({
    queryKey: qk.recs(twinId ?? 0, scenario, revision, foothold),
    queryFn: ({ signal }) => api.get<RecommendationsResponse>(`/twins/${twinId}/recommendations?${p.toString()}`, signal),
    enabled: twinId !== null && revision !== null,
  })
}

export function useRemediations() {
  const twinId = useApp((s) => s.twinId)
  return useQuery({
    queryKey: qk.remediations(twinId ?? 0),
    queryFn: ({ signal }) => api.get<Remediation[]>(`/twins/${twinId}/remediations`, signal),
    enabled: twinId !== null,
  })
}

export function useEvents() {
  return useQuery({
    queryKey: qk.events,
    queryFn: ({ signal }) => api.get<{ unread: number; items: AppEvent[] }>('/events?limit=40', signal),
  })
}

/** Invalidate everything that depends on the model or runs (after edits, runs, fixes, resets). */
export function useInvalidateAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export function useRunSimulation() {
  const twinId = useApp((s) => s.twinId)
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (v: { scenario: ScenarioId; revision?: number | null; foothold?: string | null }) =>
      api.post<Run>(`/twins/${twinId}/simulations`, {
        scenario: v.scenario,
        revision: v.revision ?? undefined,
        params: v.foothold ? { foothold: v.foothold } : {},
      }),
    onSuccess: () => void invalidate(),
  })
}
