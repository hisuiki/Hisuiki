import { useTranslation } from "react-i18next";
import type { WidgetProps } from "../../Types/TypeRegistry";

/**
 * Nothing, taking up room.
 *
 * A gap is a real design decision — pushing the account tile to the far end of a bar, holding a
 * column open, separating two groups that would otherwise read as one — and doing it with an empty
 * text widget leaves something on the page that says it is text.
 *
 * It is the one widget that cannot show itself: invisible is the whole point, and an invisible
 * gallery tile is an empty box. So in a tile, and while the page is being arranged, it draws its
 * own mark; on the finished page it draws nothing at all.
 */
export default function Spacer({ editing, preview }: WidgetProps) {
  const { t } = useTranslation();

  if (preview) {
    return (
      <div className="spacer-widget is-preview" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="spacer-mark" role="img" aria-label={t("widgets.spacer.label")}>
          {/* Two edges and the space between them, which is what the widget is. */}
          <path d="M6 8v32M42 8v32" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
          <path d="M14 24h20M14 24l6-5M14 24l6 5M34 24l-6-5M34 24l-6 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="square" />
        </svg>
      </div>
    );
  }

  // While arranging, an outline so it can be found and picked up. Otherwise genuinely nothing.
  return <div className={`spacer-widget ${editing ? "is-editing" : ""}`.trim()} aria-hidden="true" />;
}
