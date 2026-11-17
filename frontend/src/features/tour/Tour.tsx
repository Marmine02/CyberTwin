import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { Button } from "../../components/ui";
import { STEP_EVENT, TOUR_STEPS, useTour } from "../../stores/tour";
import { useReplay } from "../../stores/replay";
import { useUi } from "../../stores/ui";

interface StepDef {
  /** route the step lives on; the tour navigates there when the step starts */
  route: string;
  /** CSS selector of the element the hint points at */
  anchor: string;
  /** "right": beside the anchor (keeps the map above it free), default below / above */
  place?: "right";
}

const STEPS: StepDef[] = [
  { route: "/", anchor: "[data-tour=twin]" },
  { route: "/simulate", anchor: "[data-tour=run]" },
  { route: "/simulate", anchor: "[data-tour=narration]", place: "right" },
  { route: "/remediation?scenario=sensitive_data_exposure", anchor: "[data-tour=select-top3]" },
  { route: "/remediation?scenario=sensitive_data_exposure", anchor: "[data-testid=panel-comparison]" },
];

type Rect = { top: number; left: number; width: number; height: number };
const HINT_W = 340;

/** Guided demo: short hints anchored to the real UI, one step at a time, never blocking the page. */
export function Tour() {
  const { t } = useTranslation();
  const { step, status, start, next, skip, finish, event } = useTour();
  const navigate = useNavigate();
  const loc = useLocation();
  const setLastScenario = useUi((s) => s.setLastScenario);
  const [rect, setRect] = useState<Rect | null>(null);

  // first launch: start on the overview
  useEffect(() => {
    if (status === null && step === null && loc.pathname === "/") start();
  }, [status, step, loc.pathname, start]);

  // each step lives on a route
  const def = step !== null ? STEPS[step] : undefined;
  useEffect(() => {
    if (!def) return;
    const [path] = def.route.split("?");
    if (loc.pathname !== path) navigate(def.route);
    if (step === 1) setLastScenario("sensitive_data_exposure");
  }, [def, step, loc.pathname, navigate, setLastScenario]);

  // step 3 completes when the replay has played to its end
  const { cursor, length, playing } = useReplay();
  useEffect(() => {
    if (step === 2 && !playing && length > 0 && cursor >= length - 1) {
      const id = setTimeout(() => event("replayed"), 600);
      return () => clearTimeout(id);
    }
  }, [step, playing, cursor, length, event]);

  // follow the anchor (layout shifts, scrolling, resizing)
  useLayoutEffect(() => {
    if (!def) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(def.anchor);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect((o) => (o && o.top === r.top && o.left === r.left && o.width === r.width && o.height === r.height ? o : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    measure();
    const id = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [def]);

  useEffect(() => {
    if (step === null) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && skip();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [step, skip]);

  if (step === null || !def) return null;
  const last = step === TOUR_STEPS - 1;
  const waits = STEP_EVENT[step] !== null;
  // place the hint below the anchor when there is room, else above; keep it on screen
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = vh - 220;
  let left = vw / 2 - HINT_W / 2;
  if (rect && def.place === "right" && rect.left + rect.width + 16 + HINT_W < vw - 12) {
    // bottom-aligned beside the anchor: the replay camera keeps this band free of the step it frames
    left = rect.left + rect.width + 16;
    top = Math.max(12, Math.min(rect.top + rect.height - 190, vh - 200));
  } else if (rect) {
    const below = rect.top + rect.height + 12;
    top = below + 190 < vh ? below : Math.max(12, rect.top - 190 - 12);
    left = Math.min(Math.max(12, rect.left + rect.width / 2 - HINT_W / 2), vw - HINT_W - 12);
  }
  return (
    <>
      {rect && (
        <div aria-hidden className="tour-ring pointer-events-none fixed z-[60] rounded-xl"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />
      )}
      <div role="dialog" aria-modal="false" aria-labelledby="tour-title" className="tour-hint fixed z-[61]" style={{ top, left, width: HINT_W }} data-testid="tour" data-step={step}>
        <div className="flex items-start gap-2">
          <p className="text-[11.5px] font-medium text-primary">{t("tour.progress", { n: step + 1, total: TOUR_STEPS })}</p>
          <button type="button" className="ml-auto rounded p-0.5 text-ink-faint hover:text-ink" aria-label={t("tour.skip")} onClick={skip} data-testid="tour-close">
            <X size={14} />
          </button>
        </div>
        <p id="tour-title" className="mt-1 font-semibold text-ink">{t(`tour.s${step}.title` as "tour.s0.title")}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{t(`tour.s${step}.body` as "tour.s0.body")}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="text-[12.5px] text-ink-faint hover:text-ink" onClick={skip} data-testid="tour-skip">{t("tour.skip")}</button>
          <span className="ml-auto text-[12px] text-ink-faint">{waits ? t(`tour.wait${step}` as "tour.wait1") : null}</span>
          {last ? (
            <Button tone="primary" onClick={finish} data-testid="tour-finish">{t("tour.finish")}</Button>
          ) : (
            <Button tone={waits ? "ghost" : "primary"} onClick={next} data-testid="tour-next">{t("tour.next")}</Button>
          )}
        </div>
      </div>
    </>
  );
}
