import { ApiError } from "../api/client";
import i18n from "../i18n";
import { engineT, renderMessage } from "../i18n/engine";

const LOCALE: Record<string, string> = { en: "en-GB", tr: "tr-TR", az: "az-Latn-AZ" };
/** BCP 47 locale for Intl (dates, numbers, percentages) in the current UI language. */
export const locale = () => LOCALE[i18n.language] ?? "en-GB";

/** Whether this runtime's Intl really has Azerbaijani data. Chromium (Chrome, Playwright) ships ICU without it:
 *  "az-Latn-AZ" resolves but formats with root data ("2026 M11 16", "70.9%"). Pure, exported for tests. */
export function hasAzIntl(): boolean {
  try {
    const month = new Intl.DateTimeFormat("az-Latn-AZ", { month: "long" }).format(new Date(2026, 10, 15));
    return month === "noyabr" && new Intl.NumberFormat("az-Latn-AZ").format(1.5) === "1,5";
  } catch {
    return false;
  }
}
const AZ_INTL = hasAzIntl();
// CLDR az fallback: abbreviated months, decimal comma, "." grouping (same separators as de-DE), "70,9%"
const AZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];
const azFallback = () => i18n.language === "az" && !AZ_INTL;
const pad = (n: number) => String(n).padStart(2, "0");

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (azFallback()) return `${d.getDate()} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (azFallback()) return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
}

export function formatNumber(n: number, digits = 0): string {
  return new Intl.NumberFormat(azFallback() ? "de-DE" : locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function formatPercent(x: number, digits = 0): string {
  if (azFallback()) return `${formatNumber(x * 100, digits)}%`;
  return new Intl.NumberFormat(locale(), {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(x);
}

/** Text for an error in the current UI language: server errors via the engine catalog ({code, params}), client-side
 *  API errors via UI keys; anything else (and API errors without a translatable form) as its own message. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.text) {
    return e.text.ns === "engine"
      ? renderMessage(e.text.message, engineT)
      : (i18n.t as unknown as (k: string, o: Record<string, unknown>) => string)(e.text.key, e.text.params);
  }
  return e instanceof Error ? e.message : String(e);
}
