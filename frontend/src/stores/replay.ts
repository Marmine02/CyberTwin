import { create } from "zustand";

export type Speed = 1 | 2 | 4;

export interface ReplayState {
  length: number;
  /** index of the last revealed event; -1 = nothing revealed yet */
  cursor: number;
  playing: boolean;
  speed: Speed;
  /** id of the simulation the timeline belongs to */
  source: string | null;
}

export type ReplayAction =
  /** autoplay: start at the first event and play (used right after a run) */
  | { type: "load"; length: number; source: string; revealAll?: boolean; autoplay?: boolean }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "tick" }
  | { type: "step"; delta: 1 | -1 }
  | { type: "seek"; index: number; pause?: boolean }
  | { type: "speed"; speed: Speed }
  | { type: "reset" };

export const initialReplay: ReplayState = { length: 0, cursor: -1, playing: false, speed: 1, source: null };

const clampCursor = (i: number, length: number) => Math.max(-1, Math.min(length - 1, i));

/** Pure reducer (unit-tested). */
export function replayReducer(s: ReplayState, a: ReplayAction): ReplayState {
  switch (a.type) {
    case "load":
      if (a.autoplay && a.length > 0) {
        return { ...s, length: a.length, source: a.source, cursor: 0, playing: a.length > 1 };
      }
      return {
        ...s,
        length: a.length,
        source: a.source,
        playing: false,
        cursor: a.revealAll ? a.length - 1 : -1,
      };
    case "play":
      if (s.length === 0) return s;
      // restarting from the end replays from the beginning
      return { ...s, playing: true, cursor: s.cursor >= s.length - 1 ? -1 : s.cursor };
    case "pause":
      return { ...s, playing: false };
    case "toggle":
      return replayReducer(s, { type: s.playing ? "pause" : "play" });
    case "tick": {
      if (!s.playing) return s;
      const next = clampCursor(s.cursor + 1, s.length);
      return { ...s, cursor: next, playing: next < s.length - 1 };
    }
    case "step":
      return { ...s, playing: false, cursor: clampCursor(s.cursor + a.delta, s.length) };
    case "seek":
      return { ...s, cursor: clampCursor(a.index, s.length), playing: a.pause ? false : s.playing };
    case "speed":
      return { ...s, speed: a.speed };
    case "reset":
      return { ...s, cursor: -1, playing: false };
  }
}

/** Milliseconds per replay step at a given speed (1.2 s at 1x: long enough to read the narration). */
export const tickInterval = (speed: Speed) => Math.round(1200 / speed);

interface ReplayStore extends ReplayState {
  dispatch: (a: ReplayAction) => void;
}

export const useReplay = create<ReplayStore>((set) => ({
  ...initialReplay,
  dispatch: (a) => set((s) => replayReducer(s, a)),
}));

/** "Play the replay of this run as soon as it is shown" (set by a run started from the UI, consumed once). */
export const useAutoplay = create<{ id: string | null; request: (id: string) => void; clear: () => void }>((set) => ({
  id: null,
  request: (id) => set({ id }),
  clear: () => set({ id: null }),
}));
