import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageLayout } from "../../../Services/pageLayout";
import WidgetInspector from "../Inspector/WidgetInspector";
import Glyph from "../WidgetIcon/Glyph";

/** The one settings button, for the container the whole page is. */
export default function BoardSettings() {
  const { t } = useTranslation();
  const { root, replaceWidget } = usePageLayout();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        type="button"
        ref={button}
        className="board-settings"
        aria-label={t("board.settings")}
        aria-expanded={open}
        title={t("board.settings")}
        onClick={() => setOpen(!open)}
      >
        <Glyph name="settings" />
      </button>

      {open && (
        <WidgetInspector
          widget={root}
          anchor={button}
          variant="sidebar"
          title={t("inspector.page")}
          onChange={(next) => replaceWidget(root.id, next)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
