import { useTranslation } from "react-i18next";
import type { ProfileLayout, Widget } from "../../../Types/TypeRegistry";
import { titleAction } from "../../../Services/TitleWidgetUtils";
import WidgetIcon from "../WidgetIcon/WidgetIcon";

const MAX_CHILDREN = 8;

/** Site chrome is shared around a board; a discovery card previews only the board's creation. */
function isChrome(widget: Widget): boolean {
  const role = widget.props?.role;
  const anchor = widget.props?.anchor;
  return role === "header" || role === "footer" || anchor === "top" || anchor === "bottom";
}

function storedWidgets(layout: ProfileLayout): Widget[] {
  if (Array.isArray(layout.root?.children)) return layout.root.children.filter((widget) => !isChrome(widget));
  if (layout.anchors && typeof layout.anchors === "object") {
    return (["left", "center", "right"] as const)
      .flatMap((anchor) => layout.anchors?.[anchor] ?? [])
      .filter((widget) => !isChrome(widget));
  }
  return Array.isArray(layout.widgets) ? layout.widgets.filter((widget) => !isChrome(widget)) : [];
}

function PreviewNode({ widget, depth }: { widget: Widget; depth: number }) {
  const { t } = useTranslation();
  const children = (widget.children ?? []).filter((child) => !isChrome(child));

  if (widget.kind === "container") {
    const flow = widget.props?.flow === "row" || widget.props?.flow === "column" ? widget.props.flow : "grid";
    return (
      <span className="board-preview-node is-container" data-flow={flow} data-kind={widget.kind}>
        {children.length > 0 ? (
          children.slice(0, MAX_CHILDREN).map((child) => (
            <PreviewNode key={child.id} widget={child} depth={depth + 1} />
          ))
        ) : (
          <span className="board-preview-node-placeholder">
            <WidgetIcon kind="container" />
          </span>
        )}
      </span>
    );
  }

  let content = "";
  if (widget.kind === "title") {
    const action = titleAction(widget);
    const custom = String(widget.props?.label ?? "").trim();
    if (custom) content = custom;
    else if (action.kind === "route") content = t(`routes.${action.route}`);
    else if (action.kind === "path") content = action.path;
    else if (action.href) {
      try {
        content = new URL(action.href).hostname;
      } catch {
        content = action.href;
      }
    }
  } else if (widget.kind === "text") {
    content = String(widget.props?.heading ?? widget.props?.body ?? "").trim();
  } else if (widget.kind === "webamp") {
    content = String(widget.props?.title ?? widget.props?.artist ?? "").trim();
  } else if (widget.kind === "content") {
    content = t("widgets.content.label");
  } else if (widget.kind === "brand") {
    content = t("widgets.brand.label");
  } else if (widget.kind === "colophon") {
    content = t("widgets.colophon.label");
  }

  return (
    <span
      className="board-preview-node is-leaf"
      data-kind={widget.kind}
      data-size={widget.size}
      data-depth={Math.min(depth, 3)}
    >
      {content ? <span className="board-preview-node-text">{content}</span> : <WidgetIcon kind={widget.kind} />}
    </span>
  );
}

/** A non-interactive miniature made only from the board's stored widget tree. */
export default function BoardPreview({ layout }: { layout: ProfileLayout }) {
  const { t } = useTranslation();
  const widgets = storedWidgets(layout);

  if (widgets.length === 0) {
    return (
      <span className="board-discovery-window is-empty" aria-hidden="true">
        <WidgetIcon kind="container" />
        <span>{t("boardsPreview.empty")}</span>
      </span>
    );
  }

  return (
    <span className="board-discovery-window" aria-hidden="true">
      {widgets.slice(0, MAX_CHILDREN).map((widget) => (
        <PreviewNode key={widget.id} widget={widget} depth={0} />
      ))}
    </span>
  );
}
