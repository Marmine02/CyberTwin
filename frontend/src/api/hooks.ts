import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { RemediationAction, ScenarioId } from "./types";
import { useUi } from "../stores/ui";
import { useAutoplay } from "../stores/replay";

export const keys = {
  twin: (id: string, rev: number | null) => ["twin", id, rev] as const,
  twins: ["twins"] as const,
  revisions: (id: string) => ["revisions", id] as const,
  simulation: (sid: string) => ["simulation", sid] as const,
  simulations: (id: string) => ["simulations", id] as const,
  scenarios: ["scenarios"] as const,
  recs: (id: string, rev: number, sc: ScenarioId, foothold?: string) => ["recs", id, rev, sc, foothold ?? ""] as const,
  remediations: (id: string) => ["remediations", id] as const,
  events: (id: string) => ["events", id] as const,
  ai: ["ai-status"] as const,
  catalog: ["catalog"] as const,
};

/** Current twin state at the viewed revision (head by default). */
export function useTwin() {
  const { twinId, viewRevision } = useUi();
  return useQuery({
    queryKey: keys.twin(twinId, viewRevision),
    queryFn: () => api.twin(twinId, viewRevision ?? undefined),
  });
}

/** Twin state at a specific revision (e.g. the revision a simulation ran on). */
export function useTwinAt(revision: number | null | undefined) {
  const twinId = useUi((s) => s.twinId);
  return useQuery({
    queryKey: keys.twin(twinId, revision ?? null),
    queryFn: () => api.twin(twinId, revision ?? undefined),
    enabled: revision !== undefined && revision !== null,
    staleTime: Infinity, // revisions are immutable
  });
}

export const useTwins = () => useQuery({ queryKey: keys.twins, queryFn: api.twins });

export function useRevisions() {
  const twinId = useUi((s) => s.twinId);
  return useQuery({ queryKey: keys.revisions(twinId), queryFn: () => api.revisions(twinId) });
}

export function useSimulation(sid: string | null | undefined) {
  return useQuery({
    queryKey: keys.simulation(sid ?? "-"),
    queryFn: () => api.simulation(sid as string),
    enabled: !!sid,
    staleTime: Infinity, // runs are immutable
  });
}

export function useSimulations() {
  const twinId = useUi((s) => s.twinId);
  return useQuery({ queryKey: keys.simulations(twinId), queryFn: () => api.simulations(twinId) });
}

/** The simulation the user is "looking at": last one they ran, else the latest stored run. */
export function useCurrentSimulation() {
  const { twinId, lastSimulation } = useUi();
  const sims = useSimulations();
  const sid = lastSimulation[twinId] ?? sims.data?.[0]?.id ?? null;
  const sim = useSimulation(sid);
  return { sid, sim, sims };
}

export const useScenarios = () => useQuery({ queryKey: keys.scenarios, queryFn: api.scenarios, staleTime: Infinity });
export const useCatalog = () => useQuery({ queryKey: keys.catalog, queryFn: api.catalog, staleTime: Infinity });
export const useAiStatus = () => useQuery({ queryKey: keys.ai, queryFn: api.aiStatus, staleTime: 60_000 });

export function useEvents() {
  const twinId = useUi((s) => s.twinId);
  return useQuery({ queryKey: keys.events(twinId), queryFn: () => api.events(twinId), refetchInterval: 15_000 });
}

export function useRemediations() {
  const twinId = useUi((s) => s.twinId);
  return useQuery({ queryKey: keys.remediations(twinId), queryFn: () => api.remediations(twinId) });
}

export function useRecommendations(revision: number | undefined, scenario: ScenarioId, foothold?: string) {
  const twinId = useUi((s) => s.twinId);
  return useQuery({
    queryKey: keys.recs(twinId, revision ?? 0, scenario, foothold),
    queryFn: () => api.recommendations(twinId, scenario, foothold),
    enabled: revision !== undefined,
    staleTime: Infinity,
  });
}

/** Invalidate everything that depends on the twin's head revision. */
export function useInvalidateTwin() {
  const qc = useQueryClient();
  const twinId = useUi((s) => s.twinId);
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["twin", twinId] }),
      qc.invalidateQueries({ queryKey: keys.revisions(twinId) }),
      qc.invalidateQueries({ queryKey: keys.events(twinId) }),
      qc.invalidateQueries({ queryKey: keys.simulations(twinId) }),
      qc.invalidateQueries({ queryKey: keys.remediations(twinId) }),
    ]);
}

export function useRunSimulation() {
  const qc = useQueryClient();
  const { twinId, setLastSimulation, setLastScenario } = useUi();
  return useMutation({
    mutationFn: (v: { scenario: ScenarioId; params?: Record<string, string>; revision?: number; autoplay?: boolean }) =>
      api.simulate(twinId, v.scenario, v.params ?? {}, v.revision),
    onSuccess: (run, v) => {
      // before the run becomes "current": the page that shows it must see the autoplay request on first load
      if (v.autoplay) useAutoplay.getState().request(run.id);
      qc.setQueryData(keys.simulation(run.id), run);
      setLastSimulation(twinId, run.id);
      setLastScenario(run.scenario);
      void qc.invalidateQueries({ queryKey: keys.simulations(twinId) });
      void qc.invalidateQueries({ queryKey: keys.events(twinId) });
      void qc.invalidateQueries({ queryKey: ["twin", twinId] });
    },
  });
}

export function useApplyRemediation() {
  const invalidate = useInvalidateTwin();
  const { twinId, setLastSimulation } = useUi();
  return useMutation({
    mutationFn: (v: { scenario: ScenarioId; actions: RemediationAction[]; params?: Record<string, string> }) =>
      api.applyRemediation(twinId, v.scenario, v.actions, v.params ?? {}),
    onSuccess: async (out) => {
      setLastSimulation(twinId, out.comparison.after_simulation_id);
      await invalidate();
    },
  });
}
