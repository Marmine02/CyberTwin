import { describe, expect, it } from "vitest";
import { renderMessage, type Message } from "../i18n/message";

const table: Record<string, string> = {
  "edge.brute_force": "'{{principal}}' hesabının {{strength}} parolası {{asset}} üzerinde tahmin edilir{{mfa}}",
  "strength.weak": "zayıf",
  "note.no_mfa": " (MFA yok)",
  "change.port_restricted": "{{asset}} yalnızca {{zones}} bölgesinden",
  "zone.mgmt": "Yönetim",
  "zone.dmz": "DMZ",
};
// minimal i18next-like translate: interpolation + defaultValue
const translate = (key: string, o: Record<string, unknown>) =>
  (table[key] ?? String(o.defaultValue)).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(o[k] ?? ""));

describe("engine message rendering", () => {
  it("renders nested messages and lists", () => {
    const m: Message = {
      code: "edge.brute_force",
      params: { principal: "svc-web", asset: "web-01", strength: { code: "strength.weak", params: {} }, mfa: { code: "note.no_mfa", params: {} } },
    };
    expect(renderMessage(m, translate)).toBe("'svc-web' hesabının zayıf parolası web-01 üzerinde tahmin edilir (MFA yok)");
    const z: Message = {
      code: "change.port_restricted",
      params: { asset: "web-01", zones: [{ code: "zone.mgmt", params: {} }, { code: "zone.dmz", params: {} }] },
    };
    expect(renderMessage(z, translate)).toBe("web-01 yalnızca Yönetim, DMZ bölgesinden");
  });
  it("passes numbers through as numbers (i18next pluralises only a numeric count)", () => {
    let seen: Record<string, unknown> = {};
    renderMessage({ code: "x", params: { count: 3, id: "a" } }, (_k, o) => ((seen = o), ""));
    expect(seen.count).toBe(3);
    expect(seen.id).toBe("a");
  });
  it("falls back to the code and tolerates null", () => {
    expect(renderMessage({ code: "unknown.code", params: {} }, translate)).toBe("unknown.code");
    expect(renderMessage(null, translate)).toBe("");
  });
});
