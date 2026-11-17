import {
  Bell,
  CircleHelp,
  Bot,
  RotateCcw,
  Bug,
  Crosshair,
  FileText,
  LayoutDashboard,
  Network,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys, useEvents, useRevisions, useTwin } from "../api/hooks";
import { IconButton } from "../components/ui";
import { cx } from "../components/cls";
import { formatDateTime } from "../lib/format";
import { useToasts, useUi } from "../stores/ui";
import { Logo } from "./Logo";
import { useResetDemo } from "../features/demo/useResetDemo";
import { Tour } from "../features/tour/Tour";
import { useTour } from "../stores/tour";
import { LANGUAGES } from "../i18n";
import { isMessage, useMsg } from "../i18n/engine";

const NAV = [
  { to: "/", icon: LayoutDashboard, key: "overview", end: true },
  { to: "/map", icon: Network, key: "map" },
  { to: "/assets", icon: Server, key: "assets" },
  { to: "/simulate", icon: Crosshair, key: "simulate" },
  { to: "/vulnerabilities", icon: Bug, key: "vulnerabilities" },
  { to: "/assistant", icon: Bot, key: "assistant" },
  { to: "/remediation", icon: ShieldCheck, key: "remediation" },
  { to: "/reports", icon: FileText, key: "reports" },
] as const;

export function Shell() {
  const { t } = useTranslation();
  return (
    <div className="relative z-10 flex h-full min-w-[1024px] flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-bg-1 focus:p-2">
        {t("common.skipToContent")}
      </a>
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <nav aria-label={t("nav.label")} className="flex w-[84px] shrink-0 flex-col items-center gap-1 py-3">
          {NAV.map(({ to, icon: Icon, key, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest}
              className={({ isActive }) =>
                cx(
                  "group flex w-[72px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10.5px] leading-tight font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary shadow-[inset_2px_0_0_var(--color-primary)]"
                    : "text-ink-dim hover:bg-white/[0.04] hover:text-ink",
                )
              }
            >
              {() => (
                <>
                  <Icon size={20} strokeWidth={1.7} />
                  <span className="text-center">{t(`nav.${key}`)}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <main id="main" className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-4 pb-4">
          <Outlet />
        </main>
      </div>
      <Toaster />
      <Tour />
    </div>
  );
}

function TopBar() {
  const { t } = useTranslation();
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-4 border-b border-line px-4">
      <Link to="/" className="flex items-center gap-3">
        <Logo size={34} />
        <div className="leading-none">
          <div className="font-display text-[21px] font-bold tracking-[0.06em]">
            CYBER<span className="text-primary">TWIN</span>
          </div>
          <div className="mt-0.5 text-[11px] text-ink-dim">{t("top.subtitle")}</div>
        </div>
      </Link>
      <RevisionSelector />
      <div className="flex-1" />
      <div
        className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[12px] text-ink-dim"
        data-testid="simulation-badge"
        title={t("top.simBadgeHint")}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-secure" />
        {t("top.simBadge")}
      </div>
      <ResetDemo />
      <HelpMenu />
      <Notifications />
      <LangSwitch />
    </header>
  );
}

function RevisionSelector() {
  const { t } = useTranslation();
  const twin = useTwin();
  const revs = useRevisions();
  const { viewRevision, setViewRevision } = useUi();
  const head = twin.data?.twin.head_revision;
  return (
    <div className="ml-4 flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-1.5">
      <span className="text-[12px] text-ink-dim">{twin.data?.twin.name ?? "…"}</span>
      <label className="sr-only" htmlFor="rev-select">
        {t("top.revision")}
      </label>
      <select
        id="rev-select"
        data-testid="revision-select"
        className="mono cursor-pointer rounded-md bg-transparent text-[12px] text-primary focus:outline-none"
        value={viewRevision ?? "head"}
        onChange={(e) => setViewRevision(e.target.value === "head" ? null : Number(e.target.value))}
      >
        <option value="head" className="bg-bg-1">
          r{head ?? "?"} · {t("top.head")}
        </option>
        {(revs.data ?? [])
          .filter((r) => r.number !== head)
          .map((r) => (
            <option key={r.id} value={r.number} className="bg-bg-1">
              r{r.number} · {t(`revKind.${r.kind}`)}
            </option>
          ))}
      </select>
      {viewRevision !== null && (
        <span className="rounded bg-warning/15 px-1.5 text-[11px] text-warning">{t("top.readOnly")}</span>
      )}
    </div>
  );
}

function Notifications() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const events = useEvents();
  const twinId = useUi((s) => s.twinId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const m = useMsg();
  const unread = (events.data ?? []).filter((e) => !e.read).length;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k);
    };
  }, [open]);
  const toggle = async () => {
    setOpen((o) => !o);
    if (!open && unread > 0) {
      await api.markEventsRead(twinId);
      void qc.invalidateQueries({ queryKey: keys.events(twinId) });
    }
  };
  return (
    <div className="relative" ref={ref}>
      <IconButton label={t("top.notifications", { count: unread })} onClick={toggle} aria-expanded={open} data-testid="bell">
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </IconButton>
      {open && (
        <div className="panel absolute top-11 right-0 z-40 w-[340px] p-2" role="dialog" aria-label={t("top.notificationsTitle")}>
          <p className="panel-title px-2 py-1">{t("top.notificationsTitle")}</p>
          {(events.data ?? []).length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-ink-dim">{t("top.noNotifications")}</p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {(events.data ?? []).map((e) => {
                const sim = (e.payload.simulation_id ?? e.payload.after_simulation_id) as string | undefined;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]"
                      onClick={() => {
                        setOpen(false);
                        if (e.kind === "remediation_applied") navigate("/remediation");
                        else if (sim) navigate(`/simulate?run=${sim}`);
                      }}
                    >
                      <div className="text-[13px]">{t(`eventKind.${e.kind as "demo_reset"}`, { defaultValue: e.kind })}</div>
                      <div className="text-[12px] text-ink-dim">{isMessage(e.payload.message) ? m(e.payload.message) : e.title}</div>
                      <div className="text-[11px] text-ink-faint">{formatDateTime(e.created_at)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ResetDemo() {
  const { t } = useTranslation();
  const reset = useResetDemo();
  return (
    <>
      <IconButton label={t("top.resetDemo")} onClick={reset.ask} data-testid="reset-demo">
        <RotateCcw size={16} />
      </IconButton>
      {reset.dialog}
    </>
  );
}

function HelpMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const start = useTour((s) => s.start);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <IconButton label={t("help.menu")} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" data-testid="help">
        <CircleHelp size={17} />
      </IconButton>
      {open && (
        <div className="menu absolute top-11 right-0 z-40 w-[280px]" role="menu" aria-label={t("help.menu")}>
          <button type="button" role="menuitem" className="menu-item" data-testid="help-tour"
            onClick={() => {
              setOpen(false);
              start();
            }}>
            <span className="font-medium text-ink">{t("help.tour")}</span>
            <span className="text-[12px] text-ink-dim">{t("help.tourHint")}</span>
          </button>
          <p className="border-t border-line px-3 py-2 text-[12px] text-ink-faint">{t("top.simBadgeHint")}</p>
        </div>
      )}
    </div>
  );
}

function LangSwitch() {
  const { i18n, t } = useTranslation();
  return (
    <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label={t("top.language")}>
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={i18n.language === l}
          data-testid={`lang-${l}`}
          onClick={() => void i18n.changeLanguage(l)}
          className={cx(
            "min-h-7 rounded-md px-2 text-[12px] font-semibold uppercase",
            i18n.language === l ? "bg-primary/15 text-primary" : "text-ink-dim hover:text-ink",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Toaster() {
  const { toasts, dismiss } = useToasts();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const color = { success: "var(--color-secure)", error: "var(--color-critical)", info: "var(--color-primary)" };
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[360px] flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.div
            key={x.id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="panel pointer-events-auto flex items-start gap-3 p-3"
            role={x.tone === "error" ? "alert" : "status"}
            data-testid="toast"
            style={{ boxShadow: `0 0 22px color-mix(in srgb, ${color[x.tone]} 30%, transparent)` }}
          >
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color[x.tone] }} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{x.title}</p>
              {x.body && <p className="text-[13px] text-ink-dim">{x.body}</p>}
              {x.action && (
                <button
                  type="button"
                  className="mt-1 text-[13px] font-semibold text-primary hover:underline"
                  onClick={() => {
                    dismiss(x.id);
                    navigate(x.action!.to);
                  }}
                >
                  {x.action.label}
                </button>
              )}
            </div>
            <button type="button" aria-label={t("common.close")} onClick={() => dismiss(x.id)} className="text-ink-faint hover:text-ink">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
