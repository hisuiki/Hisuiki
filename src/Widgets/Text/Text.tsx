import { useTranslation } from "react-i18next";
import type { WidgetProps } from "../../Types/TypeRegistry";

/** A heading and some words, written in place. */
export default function Text({ widget, editing, onChange }: WidgetProps) {
  const { t } = useTranslation();

  const heading = String(widget.props?.heading ?? "");
  const body = String(widget.props?.body ?? "");

  const set = (key: "heading" | "body", value: string) =>
    onChange({ ...widget, props: { ...widget.props, [key]: value } });

  // While arranging, the widget is its own editor. A visitor sees only the result.
  if (editing) {
    return (
      <div className="widget-text-fields">
        <input
          className="editor-commit-input"
          placeholder={t("text.heading")}
          value={heading}
          onChange={(e) => set("heading", e.target.value)}
        />
        <textarea
          className="editor-description-input"
          rows={3}
          placeholder={t("text.body")}
          value={body}
          onChange={(e) => set("body", e.target.value)}
        />
      </div>
    );
  }

  if (!heading && !body) return null;

  return (
    <>
      {heading && <h2 className="widget-heading">{heading}</h2>}
      {body && <p>{body}</p>}
    </>
  );
}
