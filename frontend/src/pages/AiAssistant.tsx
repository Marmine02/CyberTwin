import { AlertTriangle, Bot, RotateCw, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { streamPost } from "../api/client";
import { useAiStatus, useCurrentSimulation, useRemediations, useRevisions, useSimulations, useTwin } from "../api/hooks";
import { RevisionContext } from "../features/sim/parts";
import { Button, Chip, EmptyState, ErrorState, Loading, Panel } from "../components/ui";
import { cx, inputCls } from "../components/cls";
import { Markdown } from "../features/ai/Markdown";
import { reduceStream, useExplain, type ExplainState } from "../features/ai/useExplain";
import { emptyChecks, violationCount, type IntegrityChecks } from "../features/ai/stream";
import { errorMessage, formatDateTime } from "../lib/format";
import { displayScore } from "../lib/score";
import { useUi } from "../stores/ui";

function ModeBadge({ s }: { s: Pick<ExplainState, "mode" | "provider" | "model" | "cached" | "reason"> }) {
  const { t } = useTranslation();
  if (!s.mode) return null;
  const llm = s.mode === "llm";
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-testid="ai-mode" data-mode={s.mode}>
      <Chip color={llm ? "var(--color-primary)" : "var(--color-violet)"}>
        {llm ? t("ai.modeLlm", { provider: s.provider, model: s.model }) : t("ai.modeFallback")}
      </Chip>
      {s.cached && <Chip>{t("ai.cached")}</Chip>}
      {!llm && s.reason && <span className="text-[11px] text-ink-faint">{t("ai.fallbackReason", { reason: s.reason })}</span>}
    </span>
  );
}

export function AiAssistantPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const current = useCurrentSimulation();
  const sims = useSimulations();
  const remeds = useRemediations();
  const status = useAiStatus();
  const sid = params.get("run") ?? current.sid;
  const remediation = params.get("remediation");
  const explain = useExplain(sid, remediation, i18n.language);
  const twin = useTwin();
  const revisions = useRevisions();
  const shown = sims.data?.find((x) => x.id === sid);

  return (
    <div className="grid grid-cols-12 gap-3 pt-4">
      <Panel title={t("ai.explanation")} className="col-span-12 xl:col-span-7" bodyClass="flex flex-col gap-3" testId="panel-explain"
        actions={<Button icon={<RotateCw size={14} />} disabled={!sid || explain.status === "streaming"} onClick={explain.retry}>{t("ai.regenerate")}</Button>}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-ink-dim">
            {t("ai.simulation")}
            <select className={`${inputCls} w-[340px]!`} value={sid ?? ""} data-testid="ai-sim-select"
              onChange={(e) => setParams({ run: e.target.value })}>
              {(sims.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{t(`scenario.${s.scenario}`)} · r{s.revision} · {displayScore(s.score)} · {formatDateTime(s.created_at)}</option>
              ))}
            </select>
          </label>
          {shown && <RevisionContext rev={shown.revision} head={twin.data?.twin.head_revision} revisions={revisions.data} />}
          {(remeds.data ?? []).length > 0 && (
            <label className="flex items-center gap-2 text-[12.5px] text-ink-dim">
              {t("ai.compareWith")}
              <select className={`${inputCls} w-[220px]!`} value={remediation ?? ""}
                onChange={(e) => {
                  const rec = remeds.data!.find((r) => r.id === e.target.value);
                  setParams(rec ? { run: rec.comparison.after_simulation_id, remediation: rec.id } : { run: sid ?? "" });
                }}>
                <option value="">{t("ai.noComparison")}</option>
                {remeds.data!.map((r) => <option key={r.id} value={r.id}>r{r.from_revision} → r{r.to_revision}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <ModeBadge s={explain} />
          {status.data?.config_error && <span className="text-[11.5px] text-warning">{status.data.config_error}</span>}
        </div>
        {explain.unverified.length > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical/10 p-2.5 text-[12.5px]" data-testid="unverified-banner">
            <AlertTriangle size={15} className="mt-0.5 text-critical" />
            <div>{t("ai.unverifiedBanner")} {explain.unverified.map((u) => <Chip key={u} color="var(--color-critical-ink)">{u}</Chip>)}</div>
          </div>
        )}
        {explain.status === "done" && explain.mode === "llm" && <IntegrityPanel checks={explain.checks} />}
        {explain.missingSections.length > 0 && (
          <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[12.5px] text-warning" data-testid="missing-sections">
            {t("ai.missingSections", { sections: explain.missingSections.join(", ") })}
          </p>
        )}
        <div className="min-h-[300px] rounded-xl border border-line bg-bg-0/40 p-4" aria-live="polite" aria-busy={explain.status === "streaming"} data-testid="explanation">
          {!sid ? <EmptyState icon={<Bot size={28} />} title={t("ai.noSim")} body={t("ai.noSimBody")} /> :
            explain.status === "error" ? <ErrorState error={explain.error} onRetry={explain.retry} /> :
            explain.text ? <Markdown text={explain.text} unverified={[...explain.unverified, ...explain.checks.numeric]} /> :
            <Loading label={explain.progressChars > 0 ? t("ai.writingProgress", { chars: explain.progressChars }) : t("ai.writing")} />}
          {explain.status === "streaming" && explain.text && <span className="anim-pulse-soft ml-1 inline-block h-4 w-2 bg-primary align-middle" aria-hidden />}
        </div>
        <p className="text-[11.5px] text-ink-faint">{t("ai.disclaimer")}</p>
      </Panel>
      <Chat simulationId={sid} />
    </div>
  );
}

function IntegrityPanel({ checks }: { checks: IntegrityChecks }) {
  const { t } = useTranslation();
  const n = violationCount(checks);
  const rows: { key: string; label: string; items: string[] }[] = [
    { key: "numeric", label: t("ai.check.numeric"), items: checks.numeric },
    { key: "citations", label: t("ai.check.citations"), items: checks.citations.map((c) => t("ai.check.citedUnder", { step: c.step_id || "?", path: c.cited_under })) },
    { key: "placeholders", label: t("ai.check.placeholders"), items: checks.placeholders },
    { key: "order", label: t("ai.check.order"), items: checks.order },
    { key: "techniques", label: t("ai.check.techniques"), items: checks.techniques.map((v) => `${v.step_id}: ${v.claimed} ≠ ${v.engine}`) },
    { key: "duplicates", label: t("ai.check.duplicates"), items: checks.duplicates },
    { key: "unplaced", label: t("ai.check.unplaced"), items: checks.unplaced },
  ];
  return (
    <details className={cx("rounded-lg border p-2.5 text-[12.5px]", n ? "border-warning/40 bg-warning/10" : "border-secure/40 bg-secure/10")}
      open={n > 0} data-testid="integrity-checks" data-violations={n}>
      <summary className={cx("cursor-pointer font-medium", n ? "text-warning" : "text-secure")}>
        {n ? t("ai.check.failed", { count: n }) : t("ai.check.passed")}
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-ink-dim">{r.label}:</span>
            {r.items.length === 0 ? <span className="text-secure">0</span> : r.items.map((i) => <Chip key={i} color={r.key === "unplaced" ? "var(--color-ink-dim)" : "var(--color-warning)"}>{i}</Chip>)}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11.5px] text-ink-faint">{t("ai.check.note")}</p>
    </details>
  );
}

interface Msg { role: "user" | "assistant"; content: string; meta?: Pick<ExplainState, "mode" | "provider" | "model" | "cached" | "reason">; unverified?: string[] }

function Chat({ simulationId }: { simulationId: string | null }) {
  const { t, i18n } = useTranslation();
  const twinId = useUi((s) => s.twinId);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError(null);
    const c = new AbortController();
    ctrl.current = c;
    let st: ExplainState = { text: "", mode: null, provider: "", model: "", cached: false, reason: null, unverified: [], missingSections: [], checks: emptyChecks, progressChars: 0, status: "streaming", error: null };
    try {
      await streamPost("/ai/chat", {
        twin_id: twinId, simulation_id: simulationId, lang: i18n.language,
        messages: history.slice(-10).map((m) => ({ role: m.role, content: m.content || "…" })),
      }, (e) => {
        st = reduceStream(st, e);
        setMsgs([...history, { role: "assistant", content: st.text, meta: st, unverified: st.unverified }]);
      }, c.signal);
    } catch (e) {
      if (!c.signal.aborted) {
        setError(errorMessage(e));
        setMsgs(history);
      }
    } finally {
      setBusy(false);
    }
  };

  const suggestions = [t("ai.q1"), t("ai.q2"), t("ai.q3")];
  return (
    <Panel title={t("ai.chat")} className="col-span-12 xl:col-span-5" bodyClass="flex min-h-[520px] flex-col gap-2" testId="panel-chat">
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-bg-0/40 p-3" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-ink-dim">{t("ai.chatIntro")}</p>
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => void send(s)} className="rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:border-primary/50 hover:text-primary">{s}</button>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {msgs.map((m, i) => (
              <li key={i} className={cx("flex gap-2", m.role === "user" && "flex-row-reverse")}>
                <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-violet/20 text-violet" : "bg-primary/15 text-primary")}>
                  {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                </span>
                <div className={cx("max-w-[85%] rounded-xl px-3 py-2", m.role === "user" ? "bg-violet/10" : "bg-white/[0.04]")}>
                  {m.role === "assistant" ? (m.content ? <Markdown text={m.content} unverified={m.unverified} /> : <Loading label={t("ai.thinking")} className="py-0" />) : <p className="text-[13.5px]">{m.content}</p>}
                  {m.meta && m.content && <div className="mt-1"><ModeBadge s={m.meta} /></div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <ErrorState error={error} compact onRetry={() => { const last = [...msgs].reverse().find((m) => m.role === "user"); if (last) { setMsgs(msgs.slice(0, msgs.lastIndexOf(last))); void send(last.content); } }} />}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <label htmlFor="chat-input" className="sr-only">{t("ai.ask")}</label>
        <input id="chat-input" className={inputCls} placeholder={t("ai.ask")} value={input} maxLength={2000} onChange={(e) => setInput(e.target.value)} data-testid="chat-input" />
        <Button tone="primary" type="submit" icon={<Send size={14} />} busy={busy} disabled={!input.trim()} data-testid="chat-send">{t("ai.send")}</Button>
      </form>
    </Panel>
  );
}
