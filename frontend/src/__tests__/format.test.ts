import { afterAll, describe, expect, it, vi } from "vitest";

// node test environment: i18n/index.ts mirrors the language onto <html lang>, and localStorage may be missing
vi.hoisted(() => {
  (globalThis as { document?: unknown }).document ??= { documentElement: { lang: "" } };
});
import i18n from "../i18n";
import { formatPercent, hasAzIntl, locale } from "../lib/format";

describe("formats per language", () => {
  afterAll(() => void i18n.changeLanguage("en"));
  it("maps every UI language to a BCP 47 locale", async () => {
    for (const [l, loc] of [["en", "en-GB"], ["tr", "tr-TR"], ["az", "az-Latn-AZ"]] as const) {
      await i18n.changeLanguage(l);
      expect(locale()).toBe(loc);
    }
  });
  it("Azerbaijani: decimal comma, percent sign after the number (Node has full ICU, so Intl is used)", async () => {
    expect(hasAzIntl()).toBe(true);
    await i18n.changeLanguage("az");
    expect(formatPercent(0.709, 1)).toBe("70,9%");
    await i18n.changeLanguage("tr");
    expect(formatPercent(0.709, 1)).toBe("%70,9");
  });
});
