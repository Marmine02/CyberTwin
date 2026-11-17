import type { CitationViolation, StreamEvent, TechniqueViolation } from "../../api/client";

export interface IntegrityChecks {
  numeric: string[];
  unplaced: string[];
  citations: CitationViolation[];
  placeholders: string[];
  order: string[];
  techniques: TechniqueViolation[];
  duplicates: string[];
}

export const emptyChecks: IntegrityChecks = {
  numeric: [],
  unplaced: [],
  citations: [],
  placeholders: [],
  order: [],
  techniques: [],
  duplicates: [],
};

/** Number of hard violations (unplaced numbers are informational). */
export function violationCount(c: IntegrityChecks): number {
  return c.numeric.length + c.citations.length + c.placeholders.length + c.order.length + c.techniques.length + c.duplicates.length;
}

export interface ExplainState {
  text: string;
  mode: "llm" | "fallback" | null;
  provider: string;
  model: string;
  cached: boolean;
  reason: string | null;
  unverified: string[];
  missingSections: string[];
  checks: IntegrityChecks;
  progressChars: number;
  status: "idle" | "streaming" | "done" | "error";
  error: string | null;
}

export const emptyExplain: ExplainState = {
  text: "",
  mode: null,
  provider: "",
  model: "",
  cached: false,
  reason: null,
  unverified: [],
  missingSections: [],
  checks: emptyChecks,
  progressChars: 0,
  status: "idle",
  error: null,
};

export function reduceStream(s: ExplainState, e: StreamEvent): ExplainState {
  switch (e.type) {
    case "meta":
      return {
        ...s,
        mode: e.mode ?? s.mode,
        provider: e.provider ?? "",
        model: e.model ?? "",
        cached: !!e.cached,
        reason: e.reason ?? s.reason,
      };
    case "progress":
      return { ...s, progressChars: e.chars ?? s.progressChars };
    case "delta":
      return { ...s, text: s.text + (e.text ?? "") };
    case "reset":
      return { ...s, text: "", reason: e.reason ?? null };
    case "done":
      return {
        ...s,
        status: "done",
        mode: e.mode ?? s.mode,
        unverified: e.unverified ?? [],
        missingSections: e.missing_sections ?? [],
        checks: {
          numeric: e.numeric_violations ?? [],
          unplaced: e.unplaced_numbers ?? [],
          citations: e.citation_violations ?? [],
          placeholders: e.unknown_placeholders ?? [],
          order: e.order_violations ?? [],
          techniques: e.technique_violations ?? [],
          duplicates: e.duplicate_fixes ?? [],
        },
      };
  }
}

/** Pull one "## Heading" section by index. */
export function section(md: string, index = 0): string {
  const parts = md.split(/^## .*$/m).map((s) => s.trim());
  return parts[index + 1] ?? "";
}
