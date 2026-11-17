import { ArrowRight, GitCompareArrows, History, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AttackPath, RemediationRecord, RevisionOut, SimulationResult, SimulationRunOut } from "../../api/types";
import { Button, Chip } from "../../components/ui";
import { cx } from "../../components/cls";
import { engineHas, useMsg } from "../../i18n/engine";
import { formatPercent } from "../../lib/format";
import { BAND_COLOR, displayScore, scoreBand } from "../../lib/score";
import { useReplay } from "../../stores/replay";
import { eventMitre, eventPort, nodeLabel, revisionLabel, toStory, type Names } from "./narrate";
import { PHASE_COLOR } from "./replay";

type TT = (k: string, o?: Record<string, unknown>) => string;
const useTT = () => useTranslation().t as unknown as TT;

/** Revision context shown wherever a result is shown: which revision the numbers belong to, and the latest one. */
export function RevisionContext({ rev, head, revisions, onRunHead, className }: {
  rev: number;
  head: number | undefined;
  revisions: RevisionOut[] | undefined;
  onRunHead?: () => void;
  className?: string;
}) {
  const t = useTT();
  const latest = head === undefined || rev === head;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]", className)} data-testid="revision-context" data-revision={rev}>
      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{revisionLabel(t, revisions, rev)}</span>
      {latest ? (
        <span className="text-ink-faint">{t("ux.isLatest")}</span>
      ) : (
        <>
          <span className="text-warning">{t("ux.latestIs", { head: revisionLabel(t, revisions, head!) })}</span>
          {onRunHead && (
            <button type="button" className="font-medium text-primary hover:underline" onClick={onRunHead} data-testid="run-head">
              {t("ux.runOnHead", { head })}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** The run found no path to any goal: say why, and what to do instead. */
export function NoPathState({ result, record, onRunBefore, onCompare, onReset, busy }: {
  result: SimulationResult;
  record: RemediationRecord | null;
  onRunBefore: (rev: number) => void;
  onCompare: (rev: number) => void;
  onReset: () => void;
  busy: boolean;
}) {
  const t = useTT();
  const before = record?.from_revision ?? (result.revision > 1 ? 1 : null);
  return (
    <div className="rounded-xl border border-secure/35 bg-bg-0/90 p-4 shadow-[0_8px_30px_rgb(0_0_0/0.45)]" data-testid="no-path-state" role="status">
      <div className="flex items-start gap-3">
        <ShieldCheck size={22} className="mt-0.5 shrink-0 text-secure" />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{t("ux.noPath.title")}</p>
          <p className="mt-0.5 text-[13px] text-ink-dim">
            {record ? t("ux.noPath.fixed", { rev: record.to_revision }) : t("ux.noPath.generic", { rev: result.revision })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {before !== null && before !== result.revision && (
          <>
            <Button tone="primary" icon={<History size={14} />} busy={busy} onClick={() => onRunBefore(before)} data-testid="run-before">
              {t(record ? "ux.noPath.runBefore" : "ux.noPath.runOn", { rev: before })}
            </Button>
            <Button icon={<GitCompareArrows size={14} />} disabled={busy} onClick={() => onCompare(before)} data-testid="compare-before">
              {t("ux.noPath.compare", { a: before, b: result.revision })}
            </Button>
          </>
        )}
        <Button icon={<RotateCcw size={14} />} onClick={onReset} data-testid="no-path-reset">{t("ux.noPath.reset")}</Button>
      </div>
    </div>
  );
}

/** Two runs of the same scenario on two revisions, side by side. */
export function CompareStrip({ a, b, onShow, onClose, current }: {
  a: SimulationRunOut;
  b: SimulationRunOut;
  current: string;
  onShow: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTT();
  const col = (r: SimulationRunOut) => (
    <button type="button" onClick={() => onShow(r.id)} aria-pressed={current === r.id}
      className={cx("flex flex-1 items-center gap-4 rounded-lg px-3 py-2 text-left transition-colors",
        current === r.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-white/[0.04]")}
      data-testid={`compare-${r.revision}`}>
      <span className="mono text-[12px] text-ink-dim">r{r.revision}</span>
      <span className="display-num text-[26px] leading-none" style={{ color: BAND_COLOR[scoreBand(r.score)] }}>{displayScore(r.score)}</span>
      <span className="text-[12px] text-ink-dim">
        {t("ux.compare.paths", { count: r.result.paths.length })}
        <br />
        {t("ux.compare.compromised", { n: r.result.compromised_assets.length, total: r.result.total_assets })}
      </span>
    </button>
  );
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-bg-1/80 p-1.5" data-testid="compare-strip">
      {col(a)}
      <ArrowRight size={18} className="shrink-0 text-ink-faint" />
      {col(b)}
      <button type="button" aria-label={t("ux.compare.close")} onClick={onClose} className="rounded-md p-1.5 text-ink-faint hover:text-ink">
        <X size={15} />
      </button>
    </div>
  );
}

/** Plain-language explanation of the replay step under the cursor. */
export function NarrationCard({ result, names }: { result: SimulationResult; names: Names }) {
  const t = useTT();
  const m = useMsg();
  const { cursor, length, playing, dispatch } = useReplay();
  const e = cursor >= 0 ? result.replay_timeline[cursor] : undefined;
  if (!e) {
    return (
      <div className="narration" data-testid="narration" data-step="-1">
        <p className="font-semibold text-ink">{t("ux.narr.idle")}</p>
        <p className="mt-1 text-[13px] text-ink-dim">{t("ux.narr.idleBody")}</p>
        <Button tone="primary" className="mt-3" icon={<Play size={14} />} onClick={() => dispatch({ type: "play" })} data-testid="narration-play">
          {t("sim.play")}
        </Button>
      </div>
    );
  }
  if (!playing && cursor === length - 1 && length > 1) {
    // at rest on the end state: one line, so the whole map stays visible
    return (
      <div className="narration flex items-center gap-3 py-2!" data-testid="narration" data-step={cursor} data-compact="true">
        <p className="min-w-0 flex-1 text-[13px] text-ink-dim">{t("ux.narr.finished", { count: length })}</p>
        <Button tone="primary" icon={<Play size={14} />} onClick={() => dispatch({ type: "play" })} data-testid="narration-replay">{t("ux.replayAgain")}</Button>
      </div>
    );
  }
  const port = eventPort(e);
  const mitre = eventMitre(result, e);
  const to = e.asset_id ? (names.get(e.asset_id) ?? e.asset_id) : nodeLabel(e.node, names, t);
  const from = e.from_asset ? (names.get(e.from_asset) ?? e.from_asset) : t("ux.node.internet");
  const story = m(toStory(e.label, names, engineHas));
  return (
    <div className="narration" data-testid="narration" data-step={cursor} aria-live={playing ? "off" : "polite"}>
      <div className="flex items-center gap-2 text-[11.5px] text-ink-dim">
        <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[e.phase] }} />
        <span className="font-medium" style={{ color: PHASE_COLOR[e.phase] }}>{t(`phase.${e.phase}`)}</span>
        <span>·</span>
        <span>{t("ux.narr.step", { n: cursor + 1, total: length })}</span>
        <span className={cx("ml-auto rounded px-1.5 py-0.5", e.on_primary_path ? "bg-critical/15 text-critical-ink" : "bg-white/[0.05] text-ink-faint")}>
          {t(e.on_primary_path ? "ux.narr.onPath" : "ux.narr.sidePath")}
        </span>
      </div>
      <p className="mt-1.5 text-[15px] font-semibold text-ink" data-testid="narration-headline">
        {t(`ux.narr.headline.${e.technique}`, { to, defaultValue: to })}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-dim" data-testid="narration-story">{story}</p>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-ink-faint">{t("ux.narr.who")}</dt>
        <dd className="text-ink">{e.from_asset && e.from_asset === e.asset_id ? to : <>{from} <span className="text-ink-faint">→</span> {to}</>}</dd>
        <dt className="text-ink-faint">{t("ux.narr.how")}</dt>
        <dd className="text-ink">
          {t(`technique.${e.technique as "reach"}`)}
          {port !== null && <> · {t("ux.narr.port", { port })}</>}
          {e.vuln_id && <> · <span className="mono text-warning">{e.vuln_id}</span></>}
        </dd>
        <dt className="text-ink-faint">{t("ux.narr.odds")}</dt>
        <dd className="text-ink">
          {t("ux.narr.p", { p: formatPercent(e.p) })} · {t("ux.narr.cumulative", { p: formatPercent(e.cumulative_likelihood, 1) })}
        </dd>
        {mitre.length > 0 && (
          <>
            <dt className="text-ink-faint">ATT&amp;CK</dt>
            <dd className="flex flex-wrap gap-1">{mitre.map((x) => <Chip key={x} color="var(--color-violet)">{x}</Chip>)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** First sentence of a narration (cut at a sentence end, never inside a word); the full text is on hover / click. */
function firstSentence(text: string): string {
  const m = /^(.+?[.!?])\s/.exec(text);
  return m ? m[1]! : text;
}

/** Event log: one readable sentence per event; the current one is shown in full, a click jumps the replay there. */
export function EventLog({ result, names }: { result: SimulationResult; names: Names }) {
  const m = useMsg();
  const { cursor, dispatch } = useReplay();
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // scroll only the log container (scrollIntoView would also scroll the page)
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    if (list && item) {
      const top = item.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = top - list.clientHeight / 3;
      }
    }
  }, [cursor]);
  return (
    <ol ref={listRef} className="flex max-h-[420px] flex-col gap-0.5 overflow-y-auto pr-1" data-testid="event-log">
      {result.replay_timeline.map((e) => {
        const text = m(toStory(e.label, names, engineHas));
        const current = e.index === cursor;
        return (
          <li key={e.index} data-index={e.index}>
            <button type="button" onClick={() => dispatch({ type: "seek", index: e.index, pause: true })} title={text}
              aria-current={current ? "step" : undefined}
              className={cx("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] leading-snug transition-colors",
                current ? "bg-primary/10 text-ink" : e.index < cursor ? "text-ink-dim hover:bg-white/[0.03]" : "text-ink-faint hover:bg-white/[0.03]")}
              data-testid={`event-${e.index}`}>
              <span className="mono w-5 shrink-0 pt-px text-right text-[11px]">{e.index + 1}</span>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[e.phase] }} />
              <span className="min-w-0 flex-1" data-testid="event-text">{current ? text : firstSentence(text)}</span>
              <span className="mono shrink-0 pt-px text-[11px]">{formatPercent(e.cumulative_likelihood)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Steps of the selected path as a compact list; a click jumps the replay to the step. */
export function PathSteps({ result, path, names }: { result: SimulationResult; path: AttackPath; names: Names }) {
  const t = useTT();
  const { cursor, dispatch } = useReplay();
  const currentNode = cursor >= 0 ? result.replay_timeline[cursor]?.node : undefined;
  return (
    <ol className="flex flex-col" data-testid="path-steps">
      {path.steps.map((s, i) => {
        const idx = result.replay_timeline.findIndex((e) => e.node === s.to);
        const here = currentNode === s.to;
        return (
          <li key={s.id} className="relative flex gap-2.5 pb-2 last:pb-0">
            {i < path.steps.length - 1 && <span aria-hidden className="absolute top-4 bottom-0 left-[5px] w-px bg-line" />}
            <span className={cx("relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2", here ? "border-critical bg-critical" : "border-critical/60 bg-bg-1")} />
            <button type="button" disabled={idx < 0} onClick={() => dispatch({ type: "seek", index: idx, pause: true })}
              className={cx("min-w-0 flex-1 rounded text-left text-[12.5px] leading-snug hover:text-primary", here ? "text-ink" : "text-ink-dim")}>
              <span className="block font-medium text-ink">{nodeLabel(s.to, names, t)}</span>
              <span className="text-[11.5px]">{t(`technique.${s.technique as "reach"}`)} · p {s.p.toFixed(2)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
