import { ShieldQuestion } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { ResidualFinding } from "../../api/types";
import { Chip, SeverityBadge } from "../../components/ui";
import type { Severity } from "../../api/types";
import { useMsg } from "../../i18n/engine";

/** Findings still present in the model that no reachable attack edge uses (score unaffected, risk not gone). */
export function ResidualList({ items, compact }: { items: ResidualFinding[]; compact?: boolean }) {
  const { t } = useTranslation();
  const m = useMsg();
  if (items.length === 0) {
    return <p className="text-[13px] text-ink-dim" data-testid="residual-empty">{t("residual.none")}</p>;
  }
  return (
    <div className="flex flex-col gap-2" data-testid="residual-list">
      {!compact && <p className="text-[12.5px] text-ink-dim">{t("residual.explain")}</p>}
      <ul className={compact ? "grid grid-cols-1 gap-1.5 md:grid-cols-2" : "flex flex-col gap-1.5"}>
        {items.map((r) => (
          <li key={r.vuln_id} className="flex items-start gap-2.5 rounded-lg border border-line px-2.5 py-2" data-testid={`residual-${r.vuln_id}`}>
            <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-medium" aria-hidden />
            <div className="min-w-0 flex-1">
              <Link to={`/vulnerabilities?v=${r.vuln_id}`} className="block truncate text-[13px] hover:text-primary">{m(r.title)}</Link>
              <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-faint">
                <span className="mono">{[r.asset_id, r.principal_id].filter(Boolean).join(" / ")}</span>
                <Chip>{t(`residual.reason.${r.reason as "unreachable"}`)}</Chip>
              </div>
            </div>
            <SeverityBadge severity={r.severity as Severity} />
          </li>
        ))}
      </ul>
    </div>
  );
}
