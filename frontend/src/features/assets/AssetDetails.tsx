import { Check, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Asset, TwinSnapshot } from "../../api/types";
import { Chip, SeverityBadge } from "../../components/ui";
import { severityFromCvss } from "../../lib/score";
import { useMsg } from "../../i18n/engine";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-[13px]">
      <dt className="text-ink-dim">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

export function AssetDetails({ asset, snapshot }: { asset: Asset; snapshot: TwinSnapshot }) {
  const { t } = useTranslation();
  const m = useMsg();
  const vulnTitle = (v: TwinSnapshot["vulnerabilities"][number]) => (v.title_i18n ? m(v.title_i18n) : v.title);
  const vulns = snapshot.vulnerabilities.filter((v) => v.affected_asset === asset.id);
  const conns = snapshot.connections.filter((c) => c.source === asset.id || c.target === asset.id);
  const loggedOn = snapshot.principals.filter((p) => p.logged_on_assets.includes(asset.id));
  const perms = snapshot.principals.flatMap((p) =>
    p.permissions.filter((x) => x.asset_id === asset.id).map((x) => ({ p, level: x.level })),
  );
  const sc = asset.security_config;
  const check = (ok: boolean) =>
    ok ? <Check size={15} className="inline text-secure" aria-label={t("common.yes")} /> : <Minus size={15} className="inline text-warning" aria-label={t("common.no")} />;
  return (
    <div className="flex flex-col gap-4" data-testid="asset-details">
      <dl>
        <Row k={t("assets.id")} v={<span className="mono">{asset.id}</span>} />
        <Row k={t("assets.type")} v={t(`assetType.${asset.asset_type}`)} />
        <Row k={t("assets.zone")} v={t(`zone.${asset.zone}`)} />
        <Row k={t("assets.ip")} v={<span className="mono">{asset.ip}</span>} />
        <Row k={t("assets.os")} v={asset.os || "—"} />
        <Row k={t("assets.criticality")} v={`${asset.criticality}/5`} />
        <Row k={t("assets.sensitivity")} v={`${asset.data_sensitivity}/3`} />
        <Row k={t("assets.risk")} v={asset.risk_score === null ? t("assets.riskNotComputed") : <span className="display-num text-[16px]">{Math.round(asset.risk_score)}</span>} />
      </dl>

      <section>
        <h3 className="panel-title mb-1 text-[12px]">{t("assets.ports")}</h3>
        {asset.open_ports.length === 0 ? <p className="text-[13px] text-ink-dim">{t("assets.noPorts")}</p> : (
          <ul className="flex flex-col gap-1">
            {asset.open_ports.map((p) => (
              <li key={`${p.proto}${p.port}`} className="flex items-center justify-between text-[13px]">
                <span className="mono text-primary">{p.proto}/{p.port}</span>
                <span className="text-ink-dim">{p.service} {p.version && <span className="mono text-ink-faint">{p.version}</span>}</span>
                <span className="text-[11px] text-ink-faint">{p.exposed_to_zones.length ? p.exposed_to_zones.join(", ") : t("assets.anyZone")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="panel-title mb-1 text-[12px]">{t("assets.software")}</h3>
        {asset.software.length === 0 ? <p className="text-[13px] text-ink-dim">—</p> : (
          <ul className="flex flex-col gap-1 text-[13px]">
            {asset.software.map((s) => (
              <li key={s.name} className="flex justify-between">
                <span>{s.name} <span className="mono text-ink-faint">{s.version}</span></span>
                {s.eol && <Chip color="var(--color-warning)">{t("assets.eol")}</Chip>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="panel-title mb-1 text-[12px]">{t("assets.security")}</h3>
        <dl>
          <Row k={t("assets.mfa")} v={check(sc.mfa_enabled)} />
          <Row k={t("assets.edr")} v={check(sc.edr)} />
          <Row k={t("assets.diskEnc")} v={check(sc.disk_encryption)} />
          <Row k={t("assets.pwPolicy")} v={t(`strength.${sc.password_policy}`)} />
        </dl>
      </section>

      <section>
        <h3 className="panel-title mb-1 text-[12px]">{t("assets.vulns")}</h3>
        {vulns.length === 0 ? <p className="text-[13px] text-ink-dim">{t("assets.noVulns")}</p> : (
          <ul className="flex flex-col gap-1.5">
            {vulns.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-2 text-[13px]">
                <Link to={`/vulnerabilities?v=${v.id}`} className="hover:text-primary">
                  {vulnTitle(v)}
                  {v.cve && <span className="ml-1 text-[11px] text-ink-faint">{v.cve} ({t("vulns.illustrative")})</span>}
                </Link>
                <SeverityBadge severity={severityFromCvss(v.cvss)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="panel-title mb-1 text-[12px]">{t("assets.connections")}</h3>
        <ul className="flex flex-col gap-1 text-[13px]">
          {conns.map((c) => (
            <li key={c.id} className="flex justify-between gap-2">
              <span className="mono text-ink-dim">{c.source} → {c.target}</span>
              <span className="text-ink-faint">{t(`connKind.${c.kind}`)}{c.ports.length ? ` · ${c.ports.join(",")}` : ""}</span>
            </li>
          ))}
          {conns.length === 0 && <li className="text-ink-dim">—</li>}
        </ul>
      </section>

      <section>
        <h3 className="panel-title mb-1 text-[12px]">{t("assets.identities")}</h3>
        <ul className="flex flex-col gap-1 text-[13px]">
          {loggedOn.map((p) => (
            <li key={`lo-${p.id}`}><span className="mono">{p.id}</span> <span className="text-ink-faint">{t("assets.cachedHere")}</span></li>
          ))}
          {perms.map(({ p, level }) => (
            <li key={`pm-${p.id}`}><span className="mono">{p.id}</span> <span className="text-ink-faint">{t(`level.${level}`)}</span></li>
          ))}
          {loggedOn.length + perms.length === 0 && <li className="text-ink-dim">—</li>}
        </ul>
      </section>

      <Link to={`/assets?edit=${asset.id}`} className="text-[13px] font-semibold text-primary hover:underline">
        {t("map.editAsset")}
      </Link>
    </div>
  );
}
