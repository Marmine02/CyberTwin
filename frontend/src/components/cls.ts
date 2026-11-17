export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const inputCls =
  "w-full min-h-9 rounded-lg border border-line bg-bg-0/70 px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-faint " +
  "focus:border-primary/70 focus:outline-none aria-[invalid=true]:border-critical";
