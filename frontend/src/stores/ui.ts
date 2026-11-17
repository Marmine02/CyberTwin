import { create } from "zustand";
import type { AssetType, ScenarioId, Zone } from "../api/types";

const LS_KEY = "cybertwin.ui.v1";

interface Persisted {
  twinId: string;
  lastSimulation: Record<string, string>; // twinId -> simulation id
  lastScenario: ScenarioId;
}

function load(): Persisted {
  const fallback: Persisted = { twinId: "northwind", lastSimulation: {}, lastScenario: "sensitive_data_exposure" };
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Persisted>) } : fallback;
  } catch {
    return fallback;
  }
}

function save(p: Persisted) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

interface UiState extends Persisted {
  /** null = follow the head revision */
  viewRevision: number | null;
  selectedAssetId: string | null;
  zone: Zone | "all";
  hiddenTypes: AssetType[];
  setTwin: (id: string) => void;
  setViewRevision: (r: number | null) => void;
  select: (id: string | null) => void;
  setZone: (z: Zone | "all") => void;
  toggleType: (t: AssetType) => void;
  clearTypes: () => void;
  setLastSimulation: (twinId: string, simId: string | null) => void;
  setLastScenario: (s: ScenarioId) => void;
}

export const useUi = create<UiState>((set, get) => {
  const persist = () => {
    const { twinId, lastSimulation, lastScenario } = get();
    save({ twinId, lastSimulation, lastScenario });
  };
  return {
    ...load(),
    viewRevision: null,
    selectedAssetId: null,
    zone: "all",
    hiddenTypes: [],
    setTwin: (id) => {
      set({ twinId: id, viewRevision: null, selectedAssetId: null });
      persist();
    },
    setViewRevision: (r) => set({ viewRevision: r }),
    select: (id) => set({ selectedAssetId: id }),
    setZone: (z) => set({ zone: z }),
    toggleType: (t) =>
      set((s) => ({
        hiddenTypes: s.hiddenTypes.includes(t) ? s.hiddenTypes.filter((x) => x !== t) : [...s.hiddenTypes, t],
      })),
    clearTypes: () => set({ hiddenTypes: [] }),
    setLastSimulation: (twinId, simId) => {
      set((s) => {
        const next = { ...s.lastSimulation };
        if (simId) next[twinId] = simId;
        else delete next[twinId];
        return { lastSimulation: next };
      });
      persist();
    },
    setLastScenario: (sc) => {
      set({ lastScenario: sc });
      persist();
    },
  };
});

// ---------- toasts ----------
export interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  body?: string;
  action?: { label: string; to: string };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let seq = 1;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.tone === "error" ? 9000 : 7000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
