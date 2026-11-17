import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../../api/client";
import { ConfirmDialog } from "../../components/ui";
import { useToasts, useUi } from "../../stores/ui";

/** "Reset demo" with a confirmation dialog; used by the top bar and by the no-path state on the simulation page. */
export function useResetDemo() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setTwin, setLastSimulation } = useUi();
  const push = useToasts((s) => s.push);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const twin = await api.demoReset();
      setLastSimulation(twin.id, null);
      setTwin(twin.id);
      await qc.invalidateQueries();
      push({
        tone: "success",
        title: t("top.resetDone"),
        body: t("top.resetDoneBody"),
        action: { label: t("top.resetNext"), to: "/simulate" },
      });
      setOpen(false);
      if (location.pathname.startsWith("/simulate")) navigate("/simulate");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const dialog = (
    <ConfirmDialog open={open} title={t("top.resetTitle")} body={t("top.resetBody")} confirmLabel={t("top.resetConfirm")}
      tone="danger" busy={busy} error={error} onConfirm={confirm} onClose={() => setOpen(false)} />
  );
  return { ask: () => setOpen(true), dialog };
}
