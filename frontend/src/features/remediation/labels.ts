import type { RemediationAction } from "../../api/types";

type T = (k: string, o?: Record<string, unknown>) => string;

/** Localised, human label for a typed remediation action. */
export function actionLabel(t: T, a: RemediationAction): string {
  switch (a.type) {
    case "restrict_port":
      return t("remAction.restrict_port", {
        asset: a.asset_id,
        port: a.port,
        zones: a.allow_from_zones.map((z) => t(`zone.${z}`)).join(", "),
      });
    case "enforce_mfa":
      return t("remAction.enforce_mfa", { principal: a.principal_id });
    case "set_password_policy":
      return t("remAction.set_password_policy", { principal: a.principal_id, policy: t(`strength.${a.policy}`).toLocaleLowerCase() });
    case "apply_patch":
      return t("remAction.apply_patch", { vuln: a.vuln_id });
    case "reduce_permission":
      return t("remAction.reduce_permission", {
        principal: a.principal_id,
        asset: a.asset_id,
        level: a.level === "none" ? t("common.none") : t(`level.${a.level}`),
      });
    case "segment_zones":
      return t("remAction.segment_zones", { a: t(`zone.${a.zone_a}`), b: t(`zone.${a.zone_b}`) });
  }
}
