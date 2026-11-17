import { useTranslation } from "react-i18next";
import i18n from "./index";

import { renderMessage, type Message } from "./message";

export { isMessage, renderMessage, type Message, type MsgParam } from "./message";

type Translate = (key: string, options: Record<string, unknown>) => string;

export const engineT: Translate = (key, options) =>
  (i18n.t as unknown as (k: string, o: Record<string, unknown>) => string)(key, {
    ns: "engine",
    keySeparator: false,
    interpolation: { escapeValue: false },
    ...options,
  });

/** Hook: returns a translator for engine messages that re-renders on language change. */
export function useMsg(): (m: Message | null | undefined) => string {
  useTranslation(); // re-renders on language change and when the engine bundle is added (bindI18nStore)
  return (m) => renderMessage(m, engineT);
}

let loading: Promise<void> | null = null;

/** Load the engine catalog once from the API (GET /api/v1/i18n/engine) into the "engine" namespace. */
export function loadEngineCatalog(): Promise<void> {
  loading ??= fetch("/api/v1/i18n/engine")
    .then((r) => {
      if (!r.ok) throw new Error(`engine catalog: HTTP ${r.status}`);
      return r.json() as Promise<Record<string, Record<string, string>>>;
    })
    .then((cat) => {
      for (const [lang, table] of Object.entries(cat)) i18n.addResourceBundle(lang, "engine", table, true, true);
    })
    .catch((e: unknown) => {
      loading = null; // allow a retry on the next call
      console.error(e);
    });
  return loading;
}

/** Whether the engine catalog has a key in the current language (or the fallback). */
export const engineHas = (code: string): boolean =>
  (i18n.exists as unknown as (k: string, o: Record<string, unknown>) => boolean)(code, { ns: "engine", keySeparator: false });
