import { useCallback, useEffect, useSyncExternalStore } from "react";
import { streamPost } from "../../api/client";
import { errorMessage } from "../../lib/format";
import { emptyExplain, reduceStream, type ExplainState } from "./stream";

export { reduceStream, section, type ExplainState } from "./stream";

// External store: explanations per (simulation, remediation, lang). Results are immutable per
// simulation, so finished entries are reused across page switches.
const entries = new Map<string, ExplainState>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (key: string, s: ExplainState) => {
  entries.set(key, s);
  emit();
};

function startStream(key: string, simulationId: string, remediationId: string | null, lang: string, force: boolean) {
  const existing = entries.get(key);
  if (!force && existing && existing.status !== "error") return;
  controllers.get(key)?.abort();
  const c = new AbortController();
  controllers.set(key, c);
  let cur: ExplainState = { ...emptyExplain, status: "streaming" };
  set(key, cur);
  streamPost(
    "/ai/explain",
    { simulation_id: simulationId, remediation_id: remediationId, lang },
    (e) => {
      cur = reduceStream(cur, e);
      set(key, cur);
    },
    c.signal,
  )
    .then(() => {
      if (cur.status !== "done") set(key, { ...cur, status: "error", error: "The explanation stream ended early." });
    })
    .catch((err: unknown) => {
      if (c.signal.aborted) return;
      set(key, { ...cur, status: "error", error: errorMessage(err) });
    })
    .finally(() => controllers.delete(key));
}

export function useExplain(simulationId: string | null, remediationId: string | null, lang: string) {
  const key = simulationId ? `${simulationId}|${remediationId ?? "-"}|${lang}` : null;
  const state = useSyncExternalStore(subscribe, () => (key ? entries.get(key) ?? emptyExplain : emptyExplain));
  useEffect(() => {
    if (key && simulationId) startStream(key, simulationId, remediationId, lang, false);
  }, [key, simulationId, remediationId, lang]);
  const retry = useCallback(() => {
    if (key && simulationId) startStream(key, simulationId, remediationId, lang, true);
  }, [key, simulationId, remediationId, lang]);
  return { ...state, retry };
}
