import { useTranslation } from "react-i18next";
import { useSaveStatus } from "../../../Services/PageLayoutProvider";

/**
 * The autosave line.
 *
 * Its own component purely so that it, and nothing else, subscribes to the save status. Read from
 * the shell instead, every board on the page would re-render twice a second after each edit — once
 * for "saving" and once for "saved" — which is a whole page redrawn to change two words.
 */
export default function SaveIndicator() {
  const { t } = useTranslation();
  const { saveState, saveError } = useSaveStatus();

  if (saveError !== null) return <p className="editor-status is-error">{saveError}</p>;
  if (saveState === "idle") return null;

  return (
    <p className="editor-status" role="status">
      {saveState === "saving" ? t("save.saving") : t("save.saved")}
    </p>
  );
}
