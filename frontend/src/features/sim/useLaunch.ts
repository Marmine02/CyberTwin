import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { keys, useRunSimulation } from "../../api/hooks";
import type { ScenarioId, SimulationRunOut, SimulationSummary } from "../../api/types";
import { errorMessage } from "../../lib/format";
import { displayScore } from "../../lib/score";
import { useToasts, useUi } from "../../stores/ui";
import { useTour } from "../../stores/tour";

/** Run a scenario; the toast says what changed since the previous run of the same scenario and links to the result.
 *  `autoplay`: the replay of the new run starts playing as soon as it is shown. */
export function useLaunchSimulation() {
  const { t } = useTranslation();
  const run = useRunSimulation();
  const qc = useQueryClient();
  const twinId = useUi((s) => s.twinId);
  const push = useToasts((s) => s.push);
  // mutateAsync, not per-call mutate callbacks: those are skipped if the user leaves the page mid-run,
  // which would lose the result toast.
  const launch = (
    scenario: ScenarioId,
    params: Record<string, string> = {},
    revision?: number,
    opts: { autoplay?: boolean } = {},
  ): Promise<SimulationRunOut | null> => {
    const previous = (qc.getQueryData<SimulationSummary[]>(keys.simulations(twinId)) ?? []).find((s) => s.scenario === scenario);
    return run.mutateAsync({ scenario, params, revision, autoplay: opts.autoplay }).then(
      (r) => {
        useTour.getState().event("ran");
        const paths = r.result.paths.length;
        push({
          tone: "success",
          title: t("ux.toast.runTitle", { scenario: t(`scenario.${scenario}`), rev: r.revision }),
          body: previous
            ? t("ux.toast.runDelta", {
                before: displayScore(previous.score),
                after: displayScore(r.score),
                pathsBefore: previous.path_count,
                count: paths,
                rev: previous.revision,
              })
            : t("ux.toast.runFirst", {
                score: displayScore(r.score),
                count: paths,
                comp: r.result.compromised_assets.length,
                total: r.result.total_assets,
              }),
          action: { label: t("ux.toast.open"), to: `/simulate?run=${r.id}` },
        });
        return r;
      },
      (e: unknown) => {
        push({ tone: "error", title: t("sim.failed"), body: errorMessage(e) });
        return null;
      },
    );
  };
  return { launch, pending: run.isPending, variables: run.variables, error: run.error };
}
