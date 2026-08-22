import { isContainer } from "./layout";
import { titleAction } from "./titleWidget";
import type { Widget, WidgetKind } from "../Types";

export interface Unfinished {
  id: string;
  kind: WidgetKind;
  /** A key under `unfinished.` naming what is missing. */
  reason: string;
}

/**
 * Widgets that will render as nothing until somebody fills them in.
 *
 * Deliberately only the cases where a widget is silently invisible on the finished page — an empty
 * text panel, a link with nowhere to go. A bio nobody has written is not listed: the widget is
 * correct and the profile is simply new.
 */
export function findUnfinished(root: Widget): Unfinished[] {
  const found: Unfinished[] = [];

  const walk = (widget: Widget) => {
    switch (widget.kind) {
      case "title": {
        const action = titleAction(widget);
        if (action.kind === "external" && !action.href) {
          found.push({ id: widget.id, kind: widget.kind, reason: "noHref" });
        } else if (action.kind === "path" && !action.path) {
          found.push({ id: widget.id, kind: widget.kind, reason: "noPath" });
        }
        break;
      }
      case "text": {
        const heading = String(widget.props?.heading ?? "").trim();
        const body = String(widget.props?.body ?? "").trim();
        if (!heading && !body) found.push({ id: widget.id, kind: widget.kind, reason: "empty" });
        break;
      }
      case "webamp": {
        if (!String(widget.props?.src ?? "").trim()) {
          found.push({ id: widget.id, kind: widget.kind, reason: "noTrack" });
        }
        break;
      }
      default:
        break;
    }

    if (isContainer(widget)) {
      const children = widget.children ?? [];
      // The root is the page itself, and an empty page is not a mistake to warn about.
      if (children.length === 0) {
        found.push({ id: widget.id, kind: widget.kind, reason: "emptyContainer" });
      }
      for (const child of children) walk(child);
    }
  };

  for (const child of root.children ?? []) walk(child);
  return found;
}
