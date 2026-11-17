import { Bot, ChevronLeft, ChevronRight, Crosshair, Pause, Play, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys, useRemediations, useRevisions, useSimulation, useSimulations, useTwin, useTwinAt } from "../api/hooks";
import { ASSET_TYPES, SCENARIO_IDS, type AttackPath, type Phase, type ScenarioId } from "../api/types";
import { RingGauge } from "../components/charts";
import { Button, Chip, EmptyState, Panel, Skeleton } from "../components/ui";
import { cx, inputCls } from "../components/cls";
import { useResetDemo } from "../features/demo/useResetDemo";
import { TwinMap } from "../features/map/TwinMap";
import { assetNames, nodeLabel, revisionLabel } from "../features/sim/narrate";
import { CompareStrip, EventLog, NarrationCard, NoPathState, PathSteps, RevisionContext } from "../features/sim/parts";
import { entryAssetOf, pathAssetsRevealed, PHASE_COLOR, primaryStepsRevealed, revealedAssets } from "../features/sim/replay";
import { useLaunchSimulation } from "../features/sim/useLaunch";
import { formatDateTime, formatPercent } from "../lib/format";
import { BAND_COLOR, displayScore, scoreBand, STATE_COLOR } from "../lib/score";
import { tickInterval, useAutoplay, useReplay, type Speed } from "../stores/replay";
import { useMsg } from "../i18n/engine";
import { useUi } from "../stores/ui";

type TT = (k: string, o?: Record<string, unknown>) => string;

export function AttackSimulationPage() {
  const { t } = useTranslation();
  const tt = t as unknown as TT;
  const m = useMsg();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const twin = useTwin();
  const head = twin.data?.twin.head_revision;
  const revisions = useRevisions();
  const remeds = useRemediations();
  const sims = useSimulations();
  const { lastScenario, setLastScenario, hiddenTypes, toggleType, clearTypes, twinId, lastSimulation, setLastSimulation } = useUi();
  const [foothold, setFoothold] = useState<string>("");
  const [runRevision, setRunRevision] = useState<"head" | number>("head");
  const { launch, pending } = useLaunchSimulation();
  const reset = useResetDemo();

  // ---- which run is shown: ?run=…; else the last run if it found paths, else the newest run that did
  const runParam = params.get("run");
  const vsParam = params.get("vs");
  const last = lastSimulation[twinId] ?? sims.data?.[0]?.id ?? null;
  const lastSummary = sims.data?.find((s) => s.id === last);
  const meaningful = sims.data?.find((s) => s.path_count > 0);
  const defaulted = !runParam && lastSummary && lastSummary.path_count === 0 && meaningful ? meaningful : null;
  const sid = runParam ?? defaulted?.id ?? last;
  const sim = useSimulation(sid);
  const vsSim = useSimulation(vsParam);
  const result = sim.data?.result ?? null;
  useEffect(() => {
    if (runParam) setLastSimulation(twinId, runParam);
  }, [runParam, twinId, setLastSimulation]);
  // the scenario selector follows the run on screen until the user picks another scenario for it
  const [picked, setPicked] = useState<{ sim: string | null; sc: ScenarioId } | null>(null);
  const scenario: ScenarioId =
    picked && picked.sim === (sim.data?.id ?? null) ? picked.sc : (sim.data?.scenario ?? lastScenario);
  const setScenario = (sc: ScenarioId) => {
    setPicked({ sim: sim.data?.id ?? null, sc });
    setLastScenario(sc);
  };

  const simTwin = useTwinAt(sim.data?.revision);
  const names = useMemo(() => assetNames(simTwin.data?.snapshot.assets), [simTwin.data]);

  // ---- replay: a run started here auto-plays; an opened run shows its end state
  const { cursor, playing, speed, length, source, dispatch } = useReplay();
  const autoplay = useAutoplay();
  useEffect(() => {
    if (result && sim.data && source !== sim.data.id) {
      const play = autoplay.id === sim.data.id;
      dispatch({ type: "load", length: result.replay_timeline.length, source: sim.data.id, revealAll: !play, autoplay: play });
      if (play) autoplay.clear();
    }
  }, [result, sim.data, source, dispatch, autoplay]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => dispatch({ type: "tick" }), tickInterval(speed));
    return () => clearInterval(id);
  }, [playing, speed, dispatch]);

  const [pathSel, setPathSel] = useState<{ sim: string; path: string } | null>(null);
  const pathId = pathSel && pathSel.sim === sim.data?.id ? pathSel.path : null;
  const selectedPath: AttackPath | null = result ? (result.paths.find((p) => p.id === pathId) ?? result.primary_path) : null;
  const entry = result ? entryAssetOf(result) : null;
  const revealed = useMemo(() => (result && cursor < length - 1 ? revealedAssets(result, cursor, entry) : null), [result, cursor, length, entry]);
  const pathReveal = useMemo(() => {
    if (!result || !selectedPath) return undefined;
    if (cursor >= length - 1 || selectedPath !== result.primary_path) return Infinity;
    return pathAssetsRevealed(selectedPath, primaryStepsRevealed(result, cursor));
  }, [result, selectedPath, cursor, length]);
  // the camera follows the step while playing or stepping; at the end the whole map is framed again
  const ev = result && cursor >= 0 ? result.replay_timeline[cursor] : undefined;
  const following = !!ev && (playing || cursor < length - 1);
  const active = useMemo(() => (following && ev ? { from: ev.from_asset, to: ev.asset_id } : null), [following, ev]);
  const compromisedNow = result ? result.compromised_assets.filter((a) => !revealed || revealed.has(a)).length : 0;
  const reachableNow = result ? result.reachable_assets.filter((a) => !result.compromised_assets.includes(a) && (!revealed || revealed.has(a))).length : 0;

  const needsFoothold = scenario === "lateral_movement" || scenario === "privilege_escalation";
  const candidates = (twin.data?.snapshot.assets ?? []).filter((a) => a.asset_type !== "internet_gateway");
  const open = (id: string, vs?: string | null) => setParams(vs ? { run: id, vs } : { run: id });
  const runAndShow = async (rev?: number, sc: ScenarioId = scenario, prm: Record<string, string> = needsFoothold && foothold ? { foothold } : {}) => {
    const r = await launch(sc, prm, rev, { autoplay: true });
    if (r) open(r.id);
    return r;
  };
  const run = () => void runAndShow(runRevision === "head" ? undefined : runRevision);

  // no-path state: which remediation produced this revision (if any)
  const record = useMemo(() => {
    if (!result) return null;
    return (remeds.data ?? []).find((r) => r.to_revision === result.revision) ?? null;
  }, [remeds.data, result]);
  const runBefore = (rev: number) => sim.data && void runAndShow(rev, sim.data.scenario, sim.data.params);
  const compareBefore = async (rev: number) => {
    if (!sim.data) return;
    const all = sims.data ?? (await qc.fetchQuery({ queryKey: keys.simulations(twinId), queryFn: () => api.simulations(twinId) }));
    const existing = (all ?? []).find((s) => s.revision === rev && s.scenario === sim.data!.scenario);
    const other = existing ? existing.id : (await launch(sim.data.scenario, sim.data.params, rev))?.id;
    if (other) setParams({ run: sim.data.id, vs: other });
  };
  const pair = sim.data && vsSim.data ? [vsSim.data, sim.data].sort((x, y) => x.revision - y.revision) : null;
  const stale = sim.data && head !== undefined && sim.data.revision !== head;

  const findingTitle = (vulnId: string) => {
    const f = result?.critical_findings.find((x) => x.vuln_id === vulnId);
    return f ? m(f.title) : vulnId;
  };
  const top = result?.chokepoints.find((c) => c.delta_score > 0);

  return (
    <div className="flex flex-col gap-3 pt-4">
      {/* scenario + run controls */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2" data-tour="scenario">
        <div className="min-w-0 flex-1">
          <div className="segmented" role="radiogroup" aria-label={t("sim.chooseScenario")}>
            {SCENARIO_IDS.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={scenario === id} onClick={() => setScenario(id)} data-testid={`scenario-${id}`}>
                {t(`scenario.${id}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-dim" data-testid="scenario-desc">{t(`scenarioDesc.${scenario}`)}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {needsFoothold && (
            <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
              {t("sim.foothold")}
              <select id="foothold" className={cx(inputCls, "w-[200px]!")} value={foothold} onChange={(e) => setFoothold(e.target.value)} data-testid="foothold" title={t("sim.footholdHint")}>
                <option value="">{t("sim.footholdDefault")}</option>
                {candidates.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            {t("sim.runOn")}
            <select id="run-revision" className={cx(inputCls, "w-[250px]!")} value={runRevision} data-testid="run-revision" title={t("sim.runOnHint")}
              onChange={(e) => setRunRevision(e.target.value === "head" ? "head" : Number(e.target.value))}>
              <option value="head">{head !== undefined ? `${revisionLabel(tt, revisions.data, head)} (${t("ux.isLatest")})` : "…"}</option>
              {(revisions.data ?? []).filter((r) => r.number !== head).map((r) => (
                <option key={r.id} value={r.number}>{revisionLabel(tt, revisions.data, r.number)}</option>
              ))}
            </select>
          </label>
          <Button tone="primary" icon={<Play size={14} />} busy={pending} onClick={run} data-testid="run-simulation" data-tour="run" className="min-w-[150px]">
            {pending ? t("ux.running") : t("sim.run")}
          </Button>
        </div>
      </div>

      <div className="sim-grid">
        {/* left: result summary, selected path, biggest fix */}
        <Panel title={t("ux.summary.title")} className="sim-left" testId="panel-compromised" bodyClass="flex flex-col gap-4">
          {result ? (
            <>
              <div className="flex items-center gap-4">
                <RingGauge value={result.total_assets ? compromisedNow / result.total_assets : 0} size={88} stroke={8} color="var(--color-critical)" label={t("sim.compromised")}>
                  <span className="display-num text-[20px]">{compromisedNow}/{result.total_assets}</span>
                </RingGauge>
                <div>
                  <div className="text-[12px] text-ink-dim">{t("sim.score")}</div>
                  <div className="display-num text-[40px] leading-none" data-testid="sim-score" style={{ color: BAND_COLOR[scoreBand(result.score)] }}>{displayScore(result.score)}</div>
                  <div className="mt-1 text-[12px] text-ink-dim">{t("ux.summary.pBreach", { p: formatPercent(result.p_breach) })}</div>
                </div>
              </div>
              <ul className="flex flex-col gap-1 text-[12.5px]">
                {([["compromised", compromisedNow], ["reachable", reachableNow], ["unreached", result.total_assets - compromisedNow - reachableNow]] as const).map(([s, n]) => (
                  <li key={s} className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR[s] }} />{t(`state.${s}`)}</span>
                    <span className="display-num">{n}</span>
                  </li>
                ))}
              </ul>
              {selectedPath && (
                <section aria-labelledby="sel-path-h">
                  <h3 id="sel-path-h" className="section-label">{t("ux.summary.path", { id: selectedPath.id })}</h3>
                  <p className="mb-2 text-[12.5px] text-ink-dim">
                    {m(selectedPath.goal_label)} · {t("ux.summary.likelihood", { p: formatPercent(selectedPath.likelihood, 1) })}
                  </p>
                  <PathSteps result={result} path={selectedPath} names={names} />
                </section>
              )}
              {top && (
                <section aria-labelledby="top-fix-h" className="rounded-lg bg-secure/[0.06] p-3" data-testid="top-fix">
                  <h3 id="top-fix-h" className="section-label text-secure!">{t("ux.summary.topFix")}</h3>
                  <p className="text-[12.5px] text-ink-dim">
                    {t("ux.summary.topFixBody", { title: findingTitle(top.vuln_id), delta: `+${top.delta_score.toFixed(1)}`, after: displayScore(top.score_after) })}
                  </p>
                  <Button className="mt-2" icon={<Wrench size={14} />} onClick={() => navigate(`/remediation?scenario=${result.scenario}&fix=${top.vuln_id}`)} data-testid="top-fix-open">
                    {t("ux.summary.topFixOpen")}
                  </Button>
                </section>
              )}
            </>
          ) : sim.isLoading ? <Skeleton className="h-40" /> : <EmptyState title={t("sim.noResult")} body={t("sim.emptyBody")} />}
        </Panel>

        {/* centre: the map is the hero; narration floats over it */}
        <section className="sim-map panel-hero relative flex min-h-[540px] flex-col" aria-label={t("sim.map")} data-testid="panel-map" data-tour="map">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2">
            <h2 className="page-title">{t("sim.map")}</h2>
            {sim.data && (
              <span className="text-[12px] text-ink-dim" data-testid="sim-revision" data-revision={sim.data.revision}>
                {t(`scenario.${sim.data.scenario}`)}
              </span>
            )}
            {sim.data && (
              <RevisionContext className="ml-auto" rev={sim.data.revision} head={head} revisions={revisions.data}
                onRunHead={stale ? () => void runAndShow(undefined, sim.data!.scenario, sim.data!.params) : undefined} />
            )}
          </header>
          {defaulted && (
            <p className="mx-4 mb-2 rounded-md bg-white/[0.04] px-3 py-1.5 text-[12px] text-ink-dim" data-testid="defaulted-note">
              {t("ux.defaultedNote", { rev: defaulted.revision, newRev: lastSummary?.revision })}{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => last && open(last)}>{t("ux.showNewest")}</button>
            </p>
          )}
          {pair && (
            <div className="mx-4 mb-2">
              <CompareStrip a={pair[0]!} b={pair[1]!} current={sim.data!.id} onShow={(id) => open(id, id === sim.data!.id ? vsParam : sim.data!.id)}
                onClose={() => sim.data && open(sim.data.id)} />
            </div>
          )}
          <div className="relative min-h-[420px] flex-1">
            {simTwin.data && sim.data ? (
              <TwinMap snapshot={simTwin.data.snapshot} result={result} path={selectedPath} revealed={revealed} pathReveal={pathReveal} halo
                minimap={false} testId="sim-map" active={active} />
            ) : twin.data && !sid ? (
              <EmptyState icon={<Crosshair size={28} />} title={t("sim.emptyTitle")} body={t("sim.emptyBody")} />
            ) : <Skeleton className="absolute inset-3" />}
            {result && (
              <div className="pointer-events-none absolute inset-x-3 top-2 flex justify-center">
                <div className="pointer-events-auto w-full max-w-[560px]">
                  {result.paths.length === 0 && (
                    <NoPathState result={result} record={record} busy={pending} onRunBefore={runBefore} onCompare={(r) => void compareBefore(r)} onReset={reset.ask} />
                  )}
                </div>
              </div>
            )}
            {result && result.paths.length > 0 && (
              <div className="absolute bottom-3 left-3 z-10 w-[min(420px,calc(100%-24px))]" data-tour="narration">
                <NarrationCard result={result} names={names} />
              </div>
            )}
          </div>
          {result && result.replay_timeline.length > 0 && <ReplayBar />}
        </section>

        {/* right: event log + asset filter */}
        <div className="sim-right flex min-w-0 flex-col gap-3">
          <Panel title={t("sim.eventLog")} testId="panel-eventlog" className="flex-1">
            {result && result.replay_timeline.length > 0 ? <EventLog result={result} names={names} /> : <p className="text-[12.5px] text-ink-faint">{t("ux.log.empty")}</p>}
          </Panel>
          <Panel title={t("ux.filter.title")}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("sim.filter")}>
              {ASSET_TYPES.map((ty) => (
                <button key={ty} type="button" aria-pressed={!hiddenTypes.includes(ty)} onClick={() => toggleType(ty)} data-testid={`filter-${ty}`} className="chip-toggle">
                  {t(`assetType.${ty}`)}
                </button>
              ))}
            </div>
            {hiddenTypes.length > 0 && (
              <button type="button" className="mt-2 text-[12px] font-medium text-primary hover:underline" onClick={clearTypes}>{t("sim.showAll")}</button>
            )}
          </Panel>
          <div className="flex flex-col gap-2">
            <Button icon={<Bot size={14} />} disabled={!sid} onClick={() => navigate(`/assistant?run=${sid}`)}>{t("sim.analyze")}</Button>
            <Button icon={<ShieldCheck size={14} />} disabled={!result} onClick={() => navigate(`/remediation?scenario=${result?.scenario ?? scenario}`)} data-tour="open-remediation">
              {t("sim.openRemediation")}
            </Button>
            {sim.data && <p className="text-[11.5px] text-ink-faint">{t("sim.ranAt", { time: formatDateTime(sim.data.created_at) })}</p>}
          </div>
        </div>
      </div>

      {/* path list */}
      {result && result.paths.length > 0 && (
        <Panel title={t("sim.paths", { n: result.paths.length })} testId="panel-paths">
          <div className="flex flex-col gap-2">
            {result.paths.map((p) => (
              <details key={p.id} open={p.id === (selectedPath?.id ?? "")} className="rounded-lg border border-line" data-testid={`path-${p.id}`}>
                <summary className="flex cursor-pointer items-center gap-3 px-3 py-2" onClick={() => sim.data && setPathSel({ sim: sim.data.id, path: p.id })}>
                  <span className="display-num text-[15px] text-primary">{p.id}</span>
                  <span className="flex-1 text-[13px]">{m(p.goal_label)}</span>
                  <span className="text-[12px] text-ink-dim">{t("sim.likelihood")} <b className="text-ink">{formatPercent(p.likelihood, 1)}</b></span>
                  <span className="text-[12px] text-ink-dim">{t("sim.risk")} <b className="text-ink">{p.risk.toFixed(3)}</b></span>
                </summary>
                <table className="w-full text-[12.5px]">
                  <thead className="text-left text-ink-faint"><tr>
                    <th className="px-3 py-1 font-medium">{t("sim.step")}</th><th className="px-2 py-1 font-medium">{t("sim.fromTo")}</th>
                    <th className="px-2 py-1 font-medium">{t("sim.technique")}</th><th className="px-2 py-1 font-medium">p</th>
                    <th className="px-2 py-1 font-medium">{t("sim.reason")}</th><th className="px-2 py-1 font-medium">ATT&CK</th></tr></thead>
                  <tbody>
                    {p.steps.map((s) => (
                      <tr key={s.id} className="border-t border-line/50 align-top">
                        <td className="mono px-3 py-1.5 text-primary">{s.id}</td>
                        <td className="px-2 py-1.5 text-[12px]">{nodeLabel(s.from, names, tt)}<br /><span className="text-ink-faint">→</span> {nodeLabel(s.to, names, tt)}</td>
                        <td className="px-2 py-1.5">{t(`technique.${s.technique as "reach"}`)}{s.vuln_id && <div className="mono text-[11px] text-warning">{s.vuln_id}</div>}</td>
                        <td className="display-num px-2 py-1.5 text-[14px]">{s.p.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-ink-dim">{m(s.reason)}</td>
                        <td className="px-2 py-1.5"><div className="flex flex-wrap gap-1">{s.mitre.map((x) => <Chip key={x} color="var(--color-violet)">{x}</Chip>)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        </Panel>
      )}
      {reset.dialog}
    </div>
  );
}

function ReplayBar() {
  const { t } = useTranslation();
  const m = useMsg();
  const [params] = useSearchParams();
  const { cursor, playing, speed, length, source, dispatch } = useReplay();
  const sim = useSimulation(params.get("run") ?? source);
  const events = sim.data?.result.replay_timeline ?? [];
  return (
    <div className="border-t border-line px-4 pt-2.5 pb-3" data-testid="panel-replay">
      <div className="flex items-center gap-2">
        <Button icon={<ChevronLeft size={15} />} onClick={() => dispatch({ type: "step", delta: -1 })} aria-label={t("sim.stepBack")} disabled={cursor < 0} />
        <Button tone="primary" icon={playing ? <Pause size={15} /> : <Play size={15} />} onClick={() => dispatch({ type: "toggle" })} data-testid="replay-toggle" className="min-w-[96px]">
          {playing ? t("sim.pause") : cursor >= length - 1 ? t("ux.replayAgain") : t("sim.play")}
        </Button>
        <Button icon={<ChevronRight size={15} />} onClick={() => dispatch({ type: "step", delta: 1 })} aria-label={t("sim.stepForward")} disabled={cursor >= length - 1} />
        <div className="ml-1 flex rounded-lg border border-line p-0.5" role="group" aria-label={t("sim.speed")}>
          {([1, 2, 4] as Speed[]).map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => dispatch({ type: "speed", speed: s })}
              className={cx("min-h-7 rounded-md px-2 text-[12px] font-semibold", speed === s ? "bg-primary/15 text-primary" : "text-ink-dim")}>{s}x</button>
          ))}
        </div>
        <div className="relative mx-2 h-8 min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-2.5">
            {events.map((e) => (
              <span key={e.index} className="absolute top-0 h-2.5 w-[2px] rounded" title={m(e.label)}
                style={{ left: `${length > 1 ? (e.index / (length - 1)) * 100 : 0}%`, background: PHASE_COLOR[e.phase], opacity: e.index <= cursor ? 1 : 0.3 }} />
            ))}
          </div>
          <input type="range" min={-1} max={length - 1} value={cursor} aria-label={t("sim.scrubber")} data-testid="scrubber"
            onChange={(e) => dispatch({ type: "seek", index: Number(e.target.value), pause: true })}
            className="absolute inset-x-0 top-3 w-full accent-[#22d3ee]" />
        </div>
        <span className="mono text-[12px] text-ink-dim" data-testid="replay-pos">{cursor + 1}/{length}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] text-ink-dim">
        {(Object.keys(PHASE_COLOR) as Phase[]).map((p) => (
          <span key={p} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[p] }} />{t(`phase.${p}`)}</span>
        ))}
      </div>
    </div>
  );
}
