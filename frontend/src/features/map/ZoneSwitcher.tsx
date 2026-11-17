import { useTranslation } from "react-i18next";
import type { Zone } from "../../api/types";
import { cx } from "../../components/cls";
import { useUi } from "../../stores/ui";

const OPTIONS: (Zone | "all")[] = ["all", "dmz", "internal", "data", "mgmt"];

/** The dots under the map: a real zone filter. */
export function ZoneSwitcher() {
  const { t } = useTranslation();
  const { zone, setZone } = useUi();
  return (
    <div className="flex items-center justify-center gap-1" role="radiogroup" aria-label={t("map.zoneFilter")}>
      {OPTIONS.map((z) => (
        <button
          key={z}
          type="button"
          role="radio"
          aria-checked={zone === z}
          data-testid={`zone-${z}`}
          onClick={() => setZone(z)}
          className={cx(
            "group flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors",
            zone === z ? "text-primary" : "text-ink-faint hover:text-ink",
          )}
        >
          <span
            className={cx(
              "h-2 w-2 rounded-full transition-all",
              zone === z ? "w-5 bg-primary" : "bg-ink-faint/60 group-hover:bg-ink",
            )}
          />
          {t(z === "all" ? "map.allZones" : `zone.${z}`)}
        </button>
      ))}
    </div>
  );
}
