import { useState } from "react";
import { useTranslation } from "react-i18next";
import { findInTree, isContainer, makeWidget, removeFromTree, WIDGETS } from "../../../Services/LayoutUtils";
import { usePageLayout } from "../../../Services/PageLayoutProvider";
import { DRAG_TYPE, readWidgetDrag, type WidgetDrag } from "../../../Services/WidgetDragUtils";
import type { MenuItem, Widget } from "../../../Types/TypeRegistry";
import {
  canMoveWidgetInTree,
  duplicateWidgetInTree,
  findWidgetTreeLocation,
  insertWidgetInTree,
  moveWidgetInTree,
} from "../../Utils/WidgetTreeUtils";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import ContextMenu from "../ContextMenu/ContextMenu";
import Glyph from "../WidgetIcon/Glyph";
import WidgetIcon from "../WidgetIcon/WidgetIcon";

type DropPosition = "before" | "inside" | "after";

interface LayerDropHint {
  targetId: string;
  position: DropPosition;
}

interface LayerMenu {
  id: string;
  x: number;
  y: number;
}

const elementForWidget = (id: string): HTMLElement | null => {
  for (const element of document.querySelectorAll<HTMLElement>("[data-widget-id]")) {
    if (element.dataset.widgetId === id) return element;
  }
  return null;
};

const dropPosition = (widget: Widget, row: HTMLElement, clientY: number, rootId: string): DropPosition => {
  if (widget.id === rootId) return "inside";
  const rect = row.getBoundingClientRect();
  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  if (isContainer(widget) && ratio >= 0.28 && ratio <= 0.72) return "inside";
  return ratio < 0.5 ? "before" : "after";
};

const resolveDrop = (
  root: Widget,
  target: Widget,
  position: DropPosition,
): { parentId: string; index: number } | null => {
  if (position === "inside") {
    if (!isContainer(target) && target.id !== root.id) return null;
    return { parentId: target.id, index: target.children?.length ?? 0 };
  }

  const location = findWidgetTreeLocation(root, target.id);
  if (!location) return null;
  return {
    parentId: location.parentId,
    index: location.index + (position === "after" ? 1 : 0),
  };
};

interface InspectorLayerRowProps {
  widget: Widget;
  depth: number;
  collapsed: ReadonlySet<string>;
  dropHint: LayerDropHint | null;
  draggingId: string | null;
  onToggle: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, widget: Widget) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, widget: Widget) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, widget: Widget) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, widget: Widget) => void;
  onMoveBy: (id: string, delta: -1 | 1) => void;
}

function InspectorLayerRow({
  widget,
  depth,
  collapsed,
  dropHint,
  draggingId,
  onToggle,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMoveBy,
}: InspectorLayerRowProps) {
  const { t } = useTranslation();
  const { root, selectedIds, inspectingId, selectWidgets } = usePageLayout();
  const hasChildren = Boolean(widget.children?.length);
  const isCollapsed = collapsed.has(widget.id);
  const isSelected = selectedIds.has(widget.id);
  const hintPosition = dropHint?.targetId === widget.id ? dropHint.position : null;

  return (
    <li className="inspector-layer-item">
      <div
        className={[
          "inspector-layer-row",
          isSelected ? "is-selected" : "",
          inspectingId === widget.id ? "is-primary" : "",
          draggingId === widget.id ? "is-dragging" : "",
          hintPosition ? `is-drop-${hintPosition}` : "",
        ].filter(Boolean).join(" ")}
        data-layer-id={widget.id}
        style={{ "--layer-depth": depth } as React.CSSProperties}
        draggable={widget.id !== root.id}
        onContextMenu={(event) => onContextMenu(event, widget)}
        onDragStart={(event) => onDragStart(event, widget)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => onDragOver(event, widget)}
        onDrop={(event) => onDrop(event, widget)}
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
          title={widget.id === root.id ? undefined : t("inspector.layers.drag")}
          onKeyDown={(event) => {
            if (!event.altKey || widget.id === root.id) return;
            if (event.key === "ArrowUp") {
              event.preventDefault();
              onMoveBy(widget.id, -1);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onMoveBy(widget.id, 1);
            }
          }}
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
          <span className="inspector-layer-label">{t(`widgets.${widget.kind}.label`)}</span>
          {widget.id !== root.id && <span className="inspector-layer-grip" aria-hidden="true"><Glyph name="grip" /></span>}
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
              dropHint={dropHint}
              draggingId={draggingId}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onMoveBy={onMoveBy}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A selectable and reorderable hierarchy backed by the same tree and drag state as the canvas. */
export default function InspectorLayers() {
  const { t } = useTranslation();
  const {
    root,
    setRoot,
    dragging,
    announceDrag,
    finalizePreview,
    selectedIds,
    selectWidgets,
    inspect,
  } = usePageLayout();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dropHint, setDropHint] = useState<LayerDropHint | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<LayerMenu | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Widget | null>(null);

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const moveBy = (id: string, delta: -1 | 1) => {
    const location = findWidgetTreeLocation(root, id);
    if (!location) return;
    const siblings = findInTree(root, location.parentId)?.children ?? [];
    const nextIndex = location.index + delta;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    const insertionIndex = delta < 0 ? nextIndex : nextIndex + 1;
    setRoot((current) => moveWidgetInTree(current, id, location.parentId, insertionIndex));
  };

  const validDrop = (widget: Widget, position: DropPosition, draggedId: string) => {
    if (widget.id === draggedId) return null;
    const target = resolveDrop(root, widget, position);
    if (!target) return null;
    if (findInTree(root, draggedId) && !canMoveWidgetInTree(root, draggedId, target.parentId)) return null;
    return target;
  };

  const menuItems = (widget: Widget): MenuItem[] => {
    const location = findWidgetTreeLocation(root, widget.id);
    const siblings = location ? (findInTree(root, location.parentId)?.children ?? []) : [];
    const parentLocation = location ? findWidgetTreeLocation(root, location.parentId) : null;

    return [
      {
        label: t("menu.inspect"),
        onSelect: () => inspect(widget.id, elementForWidget(widget.id)),
      },
      ...(location
        ? [
            {
              label: t("menu.duplicate"),
              onSelect: () => setRoot((current) => duplicateWidgetInTree(current, widget.id)),
            },
            ...(location.index > 0
              ? [{ label: t("menu.moveUp"), onSelect: () => moveBy(widget.id, -1) }]
              : []),
            ...(location.index < siblings.length - 1
              ? [{ label: t("menu.moveDown"), onSelect: () => moveBy(widget.id, 1) }]
              : []),
            ...(parentLocation
              ? [{
                  label: t("menu.moveOut"),
                  onSelect: () => setRoot((current) =>
                    moveWidgetInTree(current, widget.id, parentLocation.parentId, parentLocation.index + 1)),
                }]
              : []),
            {
              label: t("board.remove"),
              danger: true,
              onSelect: () => {
                if (WIDGETS[widget.kind].confirmRemove) setPendingRemoval(widget);
                else {
                  setRoot((current) => removeFromTree(current, widget.id));
                  selectWidgets([]);
                }
              },
            },
          ] satisfies MenuItem[]
        : []),
    ];
  };

  const startDrag = (event: React.DragEvent<HTMLDivElement>, widget: Widget) => {
    const location = findWidgetTreeLocation(root, widget.id);
    if (!location) {
      event.preventDefault();
      return;
    }

    const payload: WidgetDrag = {
      id: widget.id,
      kind: widget.kind,
      sourceContainerId: location.parentId,
      source: "board",
    };
    event.stopPropagation();
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(widget.id);
    announceDrag(payload);
    if (!selectedIds.has(widget.id)) selectWidgets([widget.id], widget.id, elementForWidget(widget.id));
  };

  const endDrag = () => {
    setDraggingId(null);
    setDropHint(null);
    announceDrag(null);
  };

  const overLayer = (event: React.DragEvent<HTMLDivElement>, widget: Widget) => {
    const payload = dragging ?? readWidgetDrag(event.dataTransfer);
    if (!payload?.id) return;
    const position = dropPosition(widget, event.currentTarget, event.clientY, root.id);
    if (!validDrop(widget, position, payload.id)) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = payload.source === "gallery" ? "copy" : "move";
    setDropHint((current) =>
      current?.targetId === widget.id && current.position === position
        ? current
        : { targetId: widget.id, position },
    );
  };

  const dropLayer = (event: React.DragEvent<HTMLDivElement>, widget: Widget) => {
    const payload = readWidgetDrag(event.dataTransfer) ?? dragging;
    if (!payload?.id) return;
    const position = dropPosition(widget, event.currentTarget, event.clientY, root.id);
    const target = validDrop(widget, position, payload.id);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    const existing = findInTree(root, payload.id);
    if (existing) {
      const id = payload.id;
      setRoot((current) => moveWidgetInTree(current, id, target.parentId, target.index));
    } else if (payload.kind) {
      const kind = payload.kind;
      setRoot((current) => insertWidgetInTree(
        current,
        target.parentId,
        target.index,
        makeWidget(kind, { id: payload.id }),
      ));
    }

    if (position === "inside") {
      setCollapsed((current) => {
        if (!current.has(widget.id)) return current;
        const next = new Set(current);
        next.delete(widget.id);
        return next;
      });
    }

    setDraggingId(null);
    setDropHint(null);
    selectWidgets([payload.id], payload.id, elementForWidget(payload.id));
    finalizePreview();
    announceDrag(null);
  };

  return (
    <>
      <nav
        className="inspector-layers"
        aria-label={t("inspector.tabs.layers")}
        onDragLeave={(event) => {
          const next = event.relatedTarget as Node | null;
          if (!next || !event.currentTarget.contains(next)) setDropHint(null);
        }}
      >
        <p className="inspector-layer-hint">{t("inspector.layers.hint")}</p>
        <ul className="inspector-layer-list is-root">
          <InspectorLayerRow
            widget={root}
            depth={0}
            collapsed={collapsed}
            dropHint={dropHint}
            draggingId={draggingId}
            onToggle={toggle}
            onContextMenu={(event, widget) => {
              event.preventDefault();
              event.stopPropagation();
              if (!selectedIds.has(widget.id)) {
                selectWidgets([widget.id], widget.id, elementForWidget(widget.id));
              }
              setMenu({ id: widget.id, x: event.clientX, y: event.clientY });
            }}
            onDragStart={startDrag}
            onDragEnd={endDrag}
            onDragOver={overLayer}
            onDrop={dropLayer}
            onMoveBy={moveBy}
          />
        </ul>
      </nav>

      {menu && (() => {
        const widget = findInTree(root, menu.id);
        if (!widget) return null;
        return <ContextMenu x={menu.x} y={menu.y} items={menuItems(widget)} onClose={() => setMenu(null)} />;
      })()}

      {pendingRemoval && (
        <ConfirmDialog
          title={t("board.confirmTitle")}
          message={t("board.confirmMessage")}
          confirmLabel={t("board.confirm")}
          cancelLabel={t("board.cancel")}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            setRoot((current) => removeFromTree(current, pendingRemoval.id));
            selectWidgets([]);
            setPendingRemoval(null);
          }}
        />
      )}
    </>
  );
}
