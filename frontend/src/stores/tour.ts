import { create } from "zustand";

/** Guided demo state. Done / skipped is remembered in this browser profile (the app has no user accounts). */
const LS = "cybertwin.tour";
export type TourStatus = "done" | "skipped" | null;
export type TourEvent = "ran" | "replayed" | "applied";
export const TOUR_STEPS = 5;

function loadStatus(): TourStatus {
  try {
    const v = localStorage.getItem(LS);
    return v === "done" || v === "skipped" ? v : null;
  } catch {
    return null;
  }
}
function saveStatus(v: TourStatus) {
  try {
    if (v) localStorage.setItem(LS, v);
    else localStorage.removeItem(LS);
  } catch {
    /* storage unavailable: the tour may show again next launch */
  }
}

/** Which event completes a step (null: the step has a Next button only). */
export const STEP_EVENT: (TourEvent | null)[] = [null, "ran", "replayed", "applied", null];

export interface TourState {
  /** index of the visible step, null = not running */
  step: number | null;
  status: TourStatus;
  start: () => void;
  next: () => void;
  skip: () => void;
  finish: () => void;
  /** report an app event; advances the tour when it completes the current step */
  event: (e: TourEvent) => void;
}

export const useTour = create<TourState>((set, get) => ({
  step: null,
  status: loadStatus(),
  start: () => set({ step: 0 }),
  next: () => {
    const s = get().step;
    if (s === null) return;
    if (s + 1 >= TOUR_STEPS) get().finish();
    else set({ step: s + 1 });
  },
  skip: () => {
    saveStatus("skipped");
    set({ step: null, status: "skipped" });
  },
  finish: () => {
    saveStatus("done");
    set({ step: null, status: "done" });
  },
  event: (e) => {
    const s = get().step;
    if (s !== null && STEP_EVENT[s] === e) get().next();
  },
}));
