import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { findUnfinished, type Unfinished } from "../../../Services/incomplete";
import { usePageLayout } from "../../../Services/pageLayout";
import { useRouter } from "../../../Services/router";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";

/** Asks before leaving a page with widgets on it that will render as nothing. */
export default function LeaveGuard() {
  const { t } = useTranslation();
  const { root, editing } = usePageLayout();
  const { navigate, setGuard } = useRouter();

  const [pending, setPending] = useState<{ to: string; found: Unfinished[] } | null>(null);
  // Set while the confirmed navigation runs, so the guard lets that one through.
  const allow = useRef(false);

  useEffect(() => {
    if (!editing) {
      setGuard(null);
      return;
    }

    setGuard((to) => {
      if (allow.current) return true;

      const found = findUnfinished(root);
      if (found.length === 0) return true;

      setPending({ to, found });
      return false;
    });

    return () => setGuard(null);
  }, [editing, root, setGuard]);

  if (!pending) return null;

  const list = pending.found
    .slice(0, 6)
    .map((item) => `${t(`widgets.${item.kind}.label`)} — ${t(`unfinished.${item.reason}`)}`)
    .join("\n");
  const more = pending.found.length > 6 ? `\n${t("unfinished.more", { count: pending.found.length - 6 })}` : "";

  return (
    <ConfirmDialog
      title={t("unfinished.title", { count: pending.found.length })}
      message={`${t("unfinished.message")}\n\n${list}${more}`}
      confirmLabel={t("unfinished.leave")}
      cancelLabel={t("unfinished.stay")}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const to = pending.to;
        setPending(null);
        allow.current = true;
        navigate(to);
        allow.current = false;
      }}
    />
  );
}
