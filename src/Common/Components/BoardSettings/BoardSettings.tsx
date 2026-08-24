import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePageLayout } from "../../../Services/PageLayoutProvider";
import Glyph from "../WidgetIcon/Glyph";

/** The one settings button, for the container the whole page/board is. */
export default function BoardSettings() {
  const { t } = useTranslation();
  const { root, inspectingId, inspect } = usePageLayout();
  const button = useRef<HTMLButtonElement>(null);
  const isOpen = inspectingId === root.id;

  return (
    <button
      type="button"
      ref={button}
      className={`board-settings ${isOpen ? "is-active" : ""}`.trim()}
      aria-label={t("board.settings")}
      aria-expanded={isOpen}
      title={t("board.settings")}
      onClick={() => inspect(isOpen ? null : root.id, button.current)}
    >
      <Glyph name="settings" />
    </button>
  );
}

