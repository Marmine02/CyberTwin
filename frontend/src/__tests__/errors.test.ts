import { beforeAll, describe, expect, it, vi } from "vitest";

// node test environment: i18n/index.ts mirrors the language onto <html lang>; that is its only DOM access.
vi.hoisted(() => {
  (globalThis as { document?: unknown }).document ??= { documentElement: { lang: "" } };
});
import { ApiError } from "../api/client";
import i18n from "../i18n";
import { errorMessage } from "../lib/format";

// Real i18next instance + the real UI resources; the engine bundle is the relevant slice of the backend catalog.
beforeAll(() => {
  i18n.addResourceBundle("en", "engine", {
    "err.rule_port_closed": "Asset '{{asset}}' has no port {{port}} open; cannot create rule",
    "err.not_found": "{{kind}} '{{id}}' does not exist",
    "entity.simulation": "Simulation",
  });
  i18n.addResourceBundle("tr", "engine", {
    "err.rule_port_closed": "'{{asset}}' varlığında {{port}} portu açık değil; kural oluşturulamaz",
    "err.not_found": "{{kind}} '{{id}}' bulunamadı",
    "entity.simulation": "Simülasyon",
  });
});

const serverError = new ApiError("port_not_open", "Asset 'web-01' has no port 3389 open; cannot create rule", 422, {}, {
  ns: "engine",
  message: { code: "err.rule_port_closed", params: { asset: "web-01", port: 3389 } },
});

describe("errorMessage", () => {
  it("renders server errors from {code, params} in the UI language", async () => {
    await i18n.changeLanguage("tr");
    expect(errorMessage(serverError)).toBe("'web-01' varlığında 3389 portu açık değil; kural oluşturulamaz");
    const nested = new ApiError("simulation_not_found", "Simulation 'x' does not exist", 404, {}, {
      ns: "engine",
      message: { code: "err.not_found", params: { kind: { code: "entity.simulation", params: {} }, id: "x" } },
    });
    expect(errorMessage(nested)).toBe("Simülasyon 'x' bulunamadı");
    await i18n.changeLanguage("en");
    expect(errorMessage(serverError)).toBe("Asset 'web-01' has no port 3389 open; cannot create rule");
  });

  it("translates client-side API errors and falls back to the raw message", async () => {
    const net = new ApiError("network", "Cannot reach the CyberTwin API (Failed to fetch)", 0, {}, {
      ns: "ui",
      key: "common.errNetwork",
      params: { detail: "Failed to fetch" },
    });
    await i18n.changeLanguage("tr");
    expect(errorMessage(net)).toBe("CyberTwin API'sine ulaşılamıyor (Failed to fetch)");
    expect(errorMessage(new ApiError("validation_error", "port: Input should be less than 65536", 422))).toBe(
      "port: Input should be less than 65536",
    );
    expect(errorMessage("plain")).toBe("plain");
  });
});

describe("plural forms (i18next _one/_other)", () => {
  it("selects the form from a numeric count", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("remed.apply", { count: 1 })).toBe("Apply 1 fix");
    expect(i18n.t("remed.apply", { count: 3 })).toBe("Apply 3 fixes");
    expect(i18n.t("remed.appliedBody", { before: 40, after: 20, count: 1 })).toBe("Score 40 → 20; 1 path blocked.");
    await i18n.changeLanguage("tr");
    expect(i18n.t("remed.apply", { count: 3 })).toBe("3 düzeltmeyi uygula");
  });
});
