import { describe, expect, it } from "vitest";
import { initialReplay, replayReducer, tickInterval, type ReplayState } from "../stores/replay";

const loaded = (n = 3, revealAll = false): ReplayState =>
  replayReducer(initialReplay, { type: "load", length: n, source: "s", revealAll });

describe("replay store", () => {
  it("loads hidden or fully revealed", () => {
    expect(loaded().cursor).toBe(-1);
    expect(loaded(3, true).cursor).toBe(2);
    expect(loaded().playing).toBe(false);
  });
  it("plays, ticks and stops at the end", () => {
    let s = replayReducer(loaded(), { type: "play" });
    expect(s.playing).toBe(true);
    s = replayReducer(s, { type: "tick" });
    expect(s.cursor).toBe(0);
    s = replayReducer(replayReducer(s, { type: "tick" }), { type: "tick" });
    expect(s.cursor).toBe(2);
    expect(s.playing).toBe(false);
    expect(replayReducer(s, { type: "tick" }).cursor).toBe(2);
  });
  it("restarts from the beginning when played at the end", () => {
    const s = replayReducer(loaded(3, true), { type: "play" });
    expect(s.cursor).toBe(-1);
    expect(s.playing).toBe(true);
  });
  it("steps and seeks within bounds and pauses on step", () => {
    let s = replayReducer(loaded(), { type: "play" });
    s = replayReducer(s, { type: "step", delta: 1 });
    expect(s).toMatchObject({ cursor: 0, playing: false });
    expect(replayReducer(s, { type: "step", delta: -1 }).cursor).toBe(-1);
    expect(replayReducer(loaded(), { type: "step", delta: -1 }).cursor).toBe(-1);
    expect(replayReducer(loaded(), { type: "seek", index: 99 }).cursor).toBe(2);
    expect(replayReducer(loaded(), { type: "seek", index: -5 }).cursor).toBe(-1);
  });
  it("toggles and changes speed", () => {
    const s = replayReducer(loaded(), { type: "toggle" });
    expect(s.playing).toBe(true);
    expect(replayReducer(s, { type: "toggle" }).playing).toBe(false);
    expect(replayReducer(s, { type: "speed", speed: 4 }).speed).toBe(4);
    expect(tickInterval(1)).toBe(1200);
    expect(tickInterval(4)).toBe(300);
  });
  it("autoplays from the first event after a run", () => {
    const s = replayReducer(initialReplay, { type: "load", length: 3, source: "s", autoplay: true });
    expect(s).toMatchObject({ cursor: 0, playing: true });
    expect(replayReducer(initialReplay, { type: "load", length: 1, source: "s", autoplay: true })).toMatchObject({ cursor: 0, playing: false });
  });
  it("ignores play on an empty timeline", () => {
    expect(replayReducer(initialReplay, { type: "play" }).playing).toBe(false);
  });
});
