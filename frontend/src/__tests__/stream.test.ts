import { describe, expect, it } from "vitest";
import { parseSseChunk } from "../api/client";
import { reduceStream, section, violationCount, type ExplainState } from "../features/ai/stream";

const start: ExplainState = {
  text: "",
  mode: null,
  provider: "",
  model: "",
  cached: false,
  reason: null,
  unverified: [],
  missingSections: [],
  checks: { numeric: [], unplaced: [], citations: [], placeholders: [], order: [], techniques: [], duplicates: [] },
  progressChars: 0,
  status: "streaming",
  error: null,
};

describe("SSE parsing", () => {
  it("splits complete events and keeps the remainder", () => {
    const buf =
      'event: meta\ndata: {"type":"meta","mode":"fallback"}\n\n' +
      'event: delta\ndata: {"type":"delta","text":"Hi"}\n\n' +
      "event: de";
    const { events, rest } = parseSseChunk(buf);
    expect(events.map((e) => e.type)).toEqual(["meta", "delta"]);
    expect(rest).toBe("event: de");
  });
  it("reduces stream events incl. reset to fallback", () => {
    let s = reduceStream(start, { type: "meta", mode: "llm", provider: "ollama", model: "m" });
    s = reduceStream(s, { type: "delta", text: "partial" });
    s = reduceStream(s, { type: "reset", reason: "timeout" });
    expect(s.text).toBe("");
    s = reduceStream(s, { type: "meta", mode: "fallback", provider: "template", reason: "timeout" });
    s = reduceStream(s, { type: "delta", text: "## A\nx" });
    s = reduceStream(s, { type: "progress", chars: 420 });
    expect(s.progressChars).toBe(420);
    s = reduceStream(s, {
      type: "done",
      mode: "fallback",
      unverified: ["web-09"],
      numeric_violations: ["29.79%"],
      citation_violations: [{ step_id: "P2.S1", cited_under: "P1", problem: "wrong_path" }],
    });
    expect(s).toMatchObject({ mode: "fallback", status: "done", unverified: ["web-09"], reason: "timeout" });
    expect(s.checks.numeric).toEqual(["29.79%"]);
    expect(violationCount(s.checks)).toBe(2);
  });
  it("extracts a markdown section", () => {
    expect(section("## Executive summary\nhello\n## Next\nworld", 0)).toBe("hello");
    expect(section("## Executive summary\nhello\n## Next\nworld", 1)).toBe("world");
  });
});
