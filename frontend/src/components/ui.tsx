import { AlertTriangle, ChevronRight, Loader2, RotateCw, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Severity } from "../api/types";
import { SEVERITY_COLOR, SEVERITY_TEXT } from "../lib/score";
import { errorMessage } from "../lib/format";

import { cx } from "./cls";

// ---------- Panel ----------
export function Panel({
  title,
  to,
  actions,
  children,
  className,
  bodyClass,
  testId,
  tour,
}: {
  title?: string;
  to?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  index?: number;
  testId?: string;
  /** guided-demo anchor (data-tour) */
  tour?: string;
}) {
  return (
    <motion.section
      data-testid={testId}
      data-tour={tour}
      className={cx("panel flex min-h-0 flex-col", className)}
      initial={false}
      aria-label={title}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          {to ? (
            <Link to={to} className="panel-title group inline-flex items-center gap-1 hover:text-primary">
              {title}
              <ChevronRight size={15} className="text-ink-faint transition-colors group-hover:text-primary" />
            </Link>
          ) : (
            <h2 className="panel-title">{title}</h2>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("min-h-0 flex-1 px-4 pb-4", bodyClass)}>{children}</div>
    </motion.section>
  );
}

// ---------- Buttons ----------
type Tone = "primary" | "ghost" | "danger" | "secure";
const TONE: Record<Tone, string> = {
  primary:
    "bg-primary/12 text-primary border-primary/45 hover:bg-primary/20",
  ghost: "bg-white/[0.03] text-ink border-line hover:bg-white/[0.08]",
  danger: "bg-critical/15 text-critical-ink border-critical/50 hover:bg-critical/25",
  secure: "bg-secure/15 text-secure border-secure/50 hover:bg-secure/25",
};

export function Button({
  tone = "ghost",
  icon,
  busy,
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; icon?: ReactNode; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium",
        "transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        TONE[tone],
        className,
      )}
    >
      {busy ? <Loader2 size={15} className="anim-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-ink-dim",
        "hover:bg-white/[0.08] hover:text-ink disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------- Badges ----------
export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useTranslation();
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold"
      style={{ color: SEVERITY_TEXT[severity], background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1px solid ${color}55` }}
    >
      {t(`severity.${severity}`)}
    </span>
  );
}

export function Chip({ children, color = "var(--color-ink-dim)" }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="mono inline-flex items-center rounded px-1.5 py-0.5 text-[11px]"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {children}
    </span>
  );
}

// ---------- Count-up ----------
export function CountUp({ value, decimals = 0, suffix = "", className }: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return (
    <span className={cx("display-num", className)} data-value={value.toFixed(decimals)}>
      {(reduce ? value : shown).toFixed(decimals)}
      {suffix}
    </span>
  );
}

// ---------- Progress ----------
export function ProgressBar({ value, color = "var(--color-primary)", label }: {
  value: number;
  color?: string;
  label: string;
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
    >
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${v * 100}%`, background: color, boxShadow: `0 0 12px ${color}` }}
      />
    </div>
  );
}

// ---------- States ----------
export function Loading({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className={cx("flex items-center gap-2 py-6 text-ink-dim", className)}>
      <Loader2 size={16} className="anim-spin text-primary" />
      <span>{label ?? t("common.loading")}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("anim-pulse-soft rounded-lg bg-white/[0.05]", className)} aria-hidden />;
}

export function EmptyState({ title, body, action, icon }: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="max-w-sm text-[13px] text-ink-dim">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-3 rounded-lg border border-critical/40 bg-critical/10 text-[13px]",
        compact ? "p-2" : "p-3",
      )}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-critical" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{t("common.errorTitle")}</p>
        <p className="break-words text-ink-dim">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} icon={<RotateCw size={14} />}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

// ---------- Modal dialog (native <dialog>: focus trap + Esc) ----------
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useTranslation();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        "panel m-auto max-h-[85vh] w-[calc(100%-32px)] p-0 text-ink backdrop:bg-[#02060e]/75 backdrop:backdrop-blur-sm",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 id={titleId} className="panel-title">
              {title}
            </h2>
            <IconButton label={t("common.close")} onClick={onClose}>
              <X size={16} />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "primary",
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  tone?: Tone;
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button tone={tone} busy={busy} onClick={onConfirm} data-testid="confirm-button">
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <p className="text-ink-dim">{body}</p>}
      {children}
      {error ? (
        <div className="mt-3">
          <ErrorState error={error} compact />
        </div>
      ) : null}
    </Dialog>
  );
}

// ---------- Tabs ----------
export function Tabs<T extends string>({ value, onChange, items, label }: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-1 rounded-xl border border-line bg-white/[0.02] p-1">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          type="button"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            "min-h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
            value === it.id ? "bg-primary/15 text-primary" : "text-ink-dim hover:text-ink",
          )}
        >
          {it.label}
          {it.count !== undefined && <span className={cx("ml-1.5", value === it.id ? "text-ink-dim" : "text-ink-faint")}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Form fields ----------
export function Field({ label, error, hint, children, htmlFor }: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-ink-dim">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-critical-ink" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}
