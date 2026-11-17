import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en, { type Resources } from "./en";
import tr from "./tr";
import az from "./az";

export const LANGUAGES = ["en", "tr", "az"] as const;
export type Lang = (typeof LANGUAGES)[number];

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Resources };
  }
}

const LS = "cybertwin.lang";
function initial(): Lang {
  try {
    const saved = localStorage.getItem(LS);
    if ((LANGUAGES as readonly string[]).includes(saved ?? "")) return saved as Lang;
  } catch {
    /* ignore */
  }
  const nav = navigator.language?.toLowerCase() ?? "";
  return nav.startsWith("tr") ? "tr" : nav.startsWith("az") ? "az" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, tr: { translation: tr }, az: { translation: az } },
  lng: initial(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { bindI18nStore: "added" },
});

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(LS, lng);
  } catch {
    /* ignore */
  }
});
document.documentElement.lang = i18n.language;

export default i18n;
