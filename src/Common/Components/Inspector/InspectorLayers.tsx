import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageLayout } from "../../../Services/PageLayoutProvider";
import type { Widget } from "../../../Types/TypeRegistry";
import Glyph from "../WidgetIcon/Glyph";
import WidgetIcon from "../WidgetIcon/WidgetIcon";

const elementForWidget = (id: string): HTMLElement | null => {
  for (const element of document.querySelectorAll<HTMLElement>("[data-widget-id]")) {
    if (element.dataset.widgetId === id) return element;
  }
  return null;
};

function InspectorLayerRow({
  widget,
  depth,
  collapsed,
  onToggle,
}: {
  widget: Widget;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { selectedIds, inspectingId, selectWidgets } = usePageLayout();
  const hasChildren = Boolean(widget.children?.length);
  const isCollapsed = collapsed.has(widget.id);
  const isSelected = selectedIds.has(widget.id);

  return (
    <li className="inspector-layer-item">
      <div
        className={`inspector-layer-row ${isSelected ? "is-selected" : ""} ${inspectingId === widget.id ? "is-primary" : ""}`.trim()}
        data-layer-id={widget.id}
        style={{ "--layer-depth": depth } as React.CSSProperties}
      >
        <button
          type="button"
          className="inspector-layer-caret"
          aria-label={hasChildren ? (isCollapsed ? t("inspector.layers.expand") : t("inspector.layers.collapse")) : undefined}
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          disabled={!hasChildren}
          onClick={() => hasChildren && onToggle(widget.id)}
        >
          {hasChildren && <span className={isCollapsed ? "is-collapsed" : ""}><Glyph name="caret" /></span>}
        </button>
        <button
          type="button"
          className="inspector-layer-select"
          aria-pressed={isSelected}
          onClick={(event) => {
            const additive = event.shiftKey || event.metaKey || event.ctrlKey;
            if (!additive) {
              selectWidgets([widget.id], widget.id, elementForWidget(widget.id));
              return;
            }

            const next = new Set(selectedIds);
            if (next.has(widget.id)) next.delete(widget.id);
            else next.add(widget.id);
            const primary = next.has(widget.id) ? widget.id : (next.values().next().value ?? null);
            selectWidgets(next, primary, elementForWidget(widget.id));
          }}
        >
          <WidgetIcon kind={widget.kind} />
          <span>{t(`widgets.${widget.kind}.label`)}</span>
        </button>
      </div>

      {hasChildren && !isCollapsed && (
        <ul className="inspector-layer-list">
          {widget.children!.map((child) => (
            <InspectorLayerRow
              key={child.id}
              widget={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A selectable hierarchy backed by the same selection state as the board canvas. */
export default function InspectorLayers() {
  const { t } = useTranslation();
  const { root } = usePageLayout();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <nav className="inspector-layers" aria-label={t("inspector.tabs.layers")}>
      <ul className="inspector-layer-list is-root">
        <InspectorLayerRow widget={root} depth={0} collapsed={collapsed} onToggle={toggle} />
      </ul>
    </nav>
  );
}
