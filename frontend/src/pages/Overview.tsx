import { AlertOctagon, AlertTriangle, Bot, Info, Play, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { useCurrentSimulation, useRevisions, useTwin, useTwinAt } from "../api/hooks";
import { SCENARIO_IDS, type ScenarioId, type Severity } from "../api/types";
import { AreaChart, RingGauge } from "../components/charts";
import { Button, CountUp, EmptyState, ErrorState, IconButton, Loading, Panel, ProgressBar, SeverityBadge, Skeleton } from "../components/ui";
import { section, useExplain } from "../features/ai/useExplain";
import { Markdown } from "../features/ai/Markdown";
import { ResidualList } from "../features/remediation/ResidualExposure";
import { TwinMap } from "../features/map/TwinMap";
import { ZoneSwitcher } from "../features/map/ZoneSwitcher";
import { RevisionContext } from "../features/sim/parts";
import { useTour } from "../stores/tour";
import { useLaunchSimulation } from "../features/sim/useLaunch";
import { formatDateTime, formatTime } from "../lib/format";
import { BAND_COLOR, countBySeverity, displayScore, hardening, scoreBand, SEVERITY_COLOR, type HardeningCategory } from "../lib/score";
import { useUi } from "../stores/ui";
import { useMsg } from "../i18n/engine";

const SEV_ICON: Record<Severity, typeof AlertOctagon> = {
  critical: AlertOctagon,
  high: ShieldAlert,
  medium: AlertTriangle,
  low: Info,
};

export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const m = useMsg();
  const twin = useTwin();
  const revisions = useRevisions();
  const startTour = useTour((x) => x.start);
  const { sid, sim, sims } = useCurrentSimulation();
  const { launch, pending, variables } = useLaunchSimulation();
  const navigate = useNavigate();
  const select = useUi((s) => s.select);
  const result = sim.data?.result ?? null;
  // draw the model the result was computed on (it can be an older revision than the head)
  const simTwin = useTwinAt(sim.data?.revision);
  const mapSnapshot = result ? simTwin.data?.snapshot : twin.data?.snapshot;
  const explain = useExplain(sid, null, i18n.language);

  if (twin.isError) return <div className="pt-4"><ErrorState error={twin.error} onRetry={() => void twin.refetch()} /></div>;

  const noSim = !sims.isLoading && !sid;
  const runFirst = (
    <Button tone="primary" icon={<Play size={14} />} busy={pending}
      onClick={() => launch("sensitive_data_exposure")} data-testid="run-first">
      {t("overview.runFirst")}
    </Button>
  );
  const sev = countBySeverity(result?.critical_findings ?? []);
  const sameScenario = (sims.data ?? []).filter((s) => s.scenario === (result?.scenario ?? "sensitive_data_exposure")).reverse();
  const latestByScenario = new Map<ScenarioId, (typeof sims.data & object)[number]>();
  for (const s of sims.data ?? []) if (!latestByScenario.has(s.scenario)) latestByScenario.set(s.scenario, s);
  const hard = twin.data ? hardening(twin.data.snapshot.assets, twin.data.snapshot.vulnerabilities) : null;

  return (
    <div className="grid grid-cols-12 gap-4 pt-4 xl:auto-rows-[minmax(0,auto)]">
      {/* Topology */}
      <Panel title={t("overview.topology")} to="/map" className="col-span-12 min-h-[520px] xl:col-span-8 xl:row-span-3"
        bodyClass="flex flex-col gap-2 px-2 pb-2"
        actions={result && (
          <span className="flex items-center gap-2 text-[12px] text-ink-dim">
            {t(`scenario.${result.scenario}`)}
            <RevisionContext rev={result.revision} head={twin.data?.twin.head_revision} revisions={revisions.data} />
          </span>
        )}
        testId="panel-topology" tour="twin">
        <div className="relative min-h-[420px] flex-1">
          {mapSnapshot ? (
            <TwinMap snapshot={mapSnapshot} result={result} path={result?.primary_path} compact halo
              onSelect={(id) => { if (id) { select(id); navigate("/map"); } }} testId="overview-map" />
          ) : <Skeleton className="h-full w-full" />}
        </div>
        <ZoneSwitcher />
      </Panel>

      {noSim ? (
        <Panel title={t("overview.startTitle")} className="col-span-12 xl:col-span-4 xl:row-span-3" testId="panel-start" bodyClass="flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-ink-dim">{t("overview.startBody")}</p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-ink-dim marker:text-ink-faint">
            <li>{t("overview.start1")}</li>
            <li>{t("overview.start2")}</li>
            <li>{t("overview.start3")}</li>
          </ol>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {runFirst}
            <button type="button" className="text-[13px] font-medium text-primary hover:underline" onClick={startTour} data-testid="start-tour">{t("help.tour")}</button>
          </div>
        </Panel>
      ) : (
        <>
      {/* Critical findings */}
      <Panel title={t("overview.findings")} to="/vulnerabilities" className="col-span-12 md:col-span-6 xl:col-span-4" testId="panel-findings">
        {sim.isLoading ? <Loading /> : result && result.critical_findings.length === 0 ? (
          <EmptyState title={t("overview.noFindings")} />
        ) : (
          <ul className="flex max-h-[170px] flex-col gap-1.5 overflow-y-auto pr-1">
            {result?.critical_findings.slice(0, 6).map((f) => {
              const Icon = SEV_ICON[f.severity];
              return (
                <li key={f.id}>
                  <Link to={`/vulnerabilities?v=${f.vuln_id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <Icon size={16} style={{ color: SEVERITY_COLOR[f.severity] }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{m(f.title)}</p>
                    <p className="text-[11px] text-ink-faint">
                      <span className="mono">{f.asset_id ?? f.principal_id}</span> · {t("overview.simAt", { time: formatTime(sim.data!.created_at) })}
                    </p>
                  </div>
                  <SeverityBadge severity={f.severity} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Security posture */}
      <Panel title={t("overview.posture")} to="/reports" className="col-span-12 md:col-span-6 xl:col-span-4" testId="panel-posture">
        {result ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-baseline gap-2 text-[13px] text-ink-dim">
              {t("sim.score")}
              <span style={{ color: BAND_COLOR[scoreBand(result.score)] }}><CountUp value={displayScore(result.score)} className="text-[28px]" /></span>
              <span className="text-ink-faint">/ 100</span>
            </p>
            <div className="h-[92px]" data-testid="posture-chart">
              {sameScenario.length === 1 && (
                <p className="pt-6 text-center text-[12px] text-ink-faint">{t("overview.postureOne")}</p>
              )}
              {sameScenario.length > 1 && (
                <AreaChart label={t("overview.postureChart")}
                  points={sameScenario.map((s) => ({ x: s.id, y: s.score, tip: `r${s.revision} · ${displayScore(s.score)} · ${formatDateTime(s.created_at)}` }))} />
              )}
            </div>
            <p className="text-[11px] text-ink-faint">{t("overview.postureCaption", { scenario: t(`scenario.${result.scenario}`), count: sameScenario.length })}</p>
          </div>
        ) : <Loading />}
      </Panel>

      {/* Blast radius */}
      <Panel title={t("overview.blast")} to="/simulate" className="col-span-12 md:col-span-6 xl:col-span-4" testId="panel-blast">
        {result ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-ink-dim">
              <CountUp value={result.compromised_assets.length} className="text-[28px] text-critical" />
              <span className="display-num text-[20px] text-ink-dim"> / {result.total_assets}</span>{" "}
              {t("overview.blastLabel")}
            </p>
            <ProgressBar value={result.blast_radius} color="var(--color-critical)" label={t("overview.blast")} />
            <p className="text-[12px] text-ink-faint">{t("overview.reachableLabel", { count: result.reachable_assets.length })}</p>
          </div>
        ) : <Loading />}
      </Panel>

        </>
      )}

      {/* Findings by severity */}
      {!noSim && <Panel title={t("overview.bySeverity")} to="/vulnerabilities" className="col-span-12 md:col-span-6 xl:col-span-3" testId="panel-severity">
        {(
          <div className="flex items-end gap-4">
            <dl className="grid flex-1 grid-cols-1 gap-1">
              {(["critical", "high", "medium"] as Severity[]).map((s) => (
                <div key={s} className="flex items-baseline justify-between">
                  <dt className="text-[12.5px] text-ink-dim">{t(`severity.${s}`)}</dt>
                  <dd className="display-num text-[22px]" style={{ color: SEVERITY_COLOR[s] }} data-testid={`sev-${s}`}>{sev[s]}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Panel>}

      {/* Scenario coverage */}
      <Panel title={t("overview.coverage")} to="/simulate" className="col-span-12 md:col-span-6 xl:col-span-3" testId="panel-coverage">
        <ul className="flex flex-col gap-1.5">
          {SCENARIO_IDS.map((id) => {
            const last = latestByScenario.get(id);
            const busy = pending && variables?.scenario === id;
            return (
              <li key={id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px]">{t(`scenario.${id}`)}</span>
                    {last ? (
                      <span className="display-num text-[13px]" style={{ color: BAND_COLOR[scoreBand(last.score)] }}>{displayScore(last.score)}</span>
                    ) : (
                      <span className="shrink-0 text-[11.5px] whitespace-nowrap text-ink-faint">{t("overview.notRun")}</span>
                    )}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${last ? last.score : 0}%`, background: last ? BAND_COLOR[scoreBand(last.score)] : undefined }} />
                  </div>
                </div>
                <IconButton label={t("overview.runScenario", { scenario: t(`scenario.${id}`) })} disabled={pending}
                  onClick={() => launch(id)} data-testid={`run-${id}`}>
                  {busy ? <span className="anim-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent" /> : <Play size={14} className="text-primary" />}
                </IconButton>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* Asset hardening */}
      <Panel title={t("overview.hardening")} to="/assets" className="col-span-12 md:col-span-6 xl:col-span-3" testId="panel-hardening">
        {hard ? (
          <div className="flex justify-between gap-2 pt-1">
            {(["servers", "endpoints", "network"] as HardeningCategory[]).map((c) => {
              const v = hard[c];
              const col = BAND_COLOR[scoreBand(v.score * 100)];
              return (
                <div key={c} className="flex flex-col items-center gap-1" title={t("overview.hardeningTip", { passed: v.passed, total: v.total })}>
                  <RingGauge value={v.score} size={78} color={col} label={`${t(`hardening.${c}`)} ${Math.round(v.score * 100)}%`}>
                    <span className="display-num text-[18px]">{Math.round(v.score * 100)}%</span>
                  </RingGauge>
                  <span className="text-[12px] text-ink-dim">{t(`hardening.${c}`)}</span>
                </div>
              );
            })}
          </div>
        ) : <Loading />}
      </Panel>

      {/* AI brief */}
      {!noSim && <Panel title={t("overview.aiBrief")} to="/assistant" className="col-span-12 md:col-span-6 xl:col-span-3" testId="panel-ai">
        {explain.status === "error" ? (
          <ErrorState error={explain.error} onRetry={explain.retry} compact />
        ) : explain.text ? (
          <div className="flex flex-col gap-2">
            <div className="line-clamp-5 text-[13px]"><Markdown text={section(explain.text, 0)} /></div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ink-faint">{t(explain.mode === "llm" ? "ai.modeLlm" : "ai.modeFallback", { provider: explain.provider, model: explain.model })}</span>
              <Link to="/assistant" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline">
                <Bot size={14} />{t("overview.openAssistant")}
              </Link>
            </div>
          </div>
        ) : <Loading label={t("ai.writing")} />}
      </Panel>}
      {/* Residual exposure */}
      {!noSim && <Panel title={t("residual.title")} to="/remediation" className="col-span-12" testId="panel-residual">
        {result ? (
          <ResidualList items={result.residual_findings ?? []} compact />
        ) : <Loading />}
      </Panel>}
    </div>
  );
}
