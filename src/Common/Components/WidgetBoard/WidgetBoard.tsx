import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  GRID_COLUMNS,
  ROW_HEIGHT,
  WIDGETS,
  duplicateWidget,
  isContainer,
  makeWidget,
  removeWidget,
  columnsOf,
  gapOf,
  parentOf,
  scrollOf,
  cellOf,
  isFree,
  rowsOf,
  spanOf,
  wrapWidgets,
} from "../../../Services/layout";
import type { GridMetrics, MenuItem, ResizePreview, Widget, WidgetBoardProps } from "../../../Types";
import {
  cellFromPoint,
  gridLines,
  gridMetrics,
  trackAt,
  trackSize,
  trackStart,
  tracksForSize,
} from "../../../Services/grid";
import { styleOf, styleVariables } from "../../../Services/widgetStyle";

import { WIDGET_REGISTRY } from "../../../Widgets";
import { usePageLayout } from "../../../Services/pageLayout";
import { DRAG_TYPE, readWidgetDrag } from "../../../Services/widgetDrag";
import { useOverflow } from "../../Hooks/useOverflow";
import { useFlip } from "../../Hooks/useFlip";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import EmptyBoard from "../EmptyBoard/EmptyBoard";
import Glyph from "../WidgetIcon/Glyph";
import ContextMenu from "../ContextMenu/ContextMenu";
import OverflowWarning from "../OverflowWarning/OverflowWarning";
import WidgetInspector from "../Inspector/WidgetInspector";

/**
 * One widget's view, memoised.
 *
 * A board re-renders whenever anything about it changes — a selection, a drag, a corner being
 * pulled — and without this every widget under it re-rendered too, which for a timeline or a
 * heatmap is a real amount of work for a change that did not touch them. Reordering keeps each
 * widget's object identity, so a drag now moves elements without redrawing any of them.
 *
 * A container's children arrive as a freshly built element each render, so containers do re-render;
 * their own children are memoised in turn, which is where the cost actually is.
 */
const WidgetSlot = memo(function WidgetSlot({
  widget,
  editing,
  replace,
  children,
}: {
  widget: Widget;
  editing: boolean;
  /** Board-level and stable; the per-widget handler is built from it here. */
  replace: (id: string, next: Widget) => void;
  children?: ReactNode;
}) {
  const View = WIDGET_REGISTRY[widget.kind];
  const onChange = useCallback((next: Widget) => replace(widget.id, next), [replace, widget.id]);

  return <View widget={widget} editing={editing} onChange={onChange}>{children}</View>;
});

/**
 * The surface widgets sit on.
 *
 * It handles the five things every board shares, whatever anchor it lives at: selection, reordering,
 * duplicate, remove, and a container's layout. A page should not be arrangeable only with a mouse.
 */
export default function WidgetBoard({
  widgets,
  flow = "grid",
  scroll = "none",
  columns,
  gap,
  editing = false,
  anchor,
  containerId,
  onChange,
}: WidgetBoardProps) {
  const { t } = useTranslation();
  // The widget being carried, by id rather than index: the order changes underneath a drag, so an
  // index would stop referring to the thing in your hand after the first swap.
  const [dragging, setDragging] = useState<string | null>(null);
  const draggedNode = useRef<HTMLElement | null>(null);
  const reorderFrame = useRef(0);
  const [pendingRemoval, setPendingRemoval] = useState<Widget | null>(null);
  // Which widget's Inspector is open, and the element it hangs from. One at a time: two panels for
  // two widgets would leave no way to tell which one you were changing.
  const [inspecting, setInspecting] = useState<string | null>(null);
  const inspectorAnchor = useRef<HTMLElement | null>(null);

  /** Opening the Inspector also fixes what it hangs from, which is a thing to do from an event. */
  const inspect = (id: string | null) => {
    inspectorAnchor.current = id ? flipRef.element(id) : null;
    setInspecting(id);
  };
  // The footprint a corner drag is aiming at. The widget itself is left alone until the corner is
  // released: resizing it live reflowed the rows under the gesture, which is what made the preview
  // drift away from the cells it was supposed to be showing.
  const [preview, setPreview] = useState<ResizePreview | null>(null);
  // Measured once, when the gesture starts, so the whole drag reads the same grid.
  const resizeGeom = useRef<{ metrics: GridMetrics; col: number; row: number; total: number } | null>(null);
  // Where inside the widget it was picked up, so a drop puts its corner where the widget was held
  // rather than under the pointer.
  const grabOffset = useRef<{ x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const {
    announceDrag,
    dragging: draggingGlobal,
    finalizePreview,
    moveWidgetToContainer,
    insertPreview,
    root,
  } = usePageLayout();
  const activeDraggingId =
    dragging ??
    (draggingGlobal?.id && widgets.some((w) => w.id === draggingGlobal.id)
      ? draggingGlobal.id
      : null);

  // Reordering already shows where a widget will land; animating every neighbour on top of that,
  // many times a second, is what made the board flicker while something was being moved.
  const flipRef = useFlip(activeDraggingId === null && draggingGlobal === null);

  /** Stable, so the release listener below does not resubscribe on every list change. */
  const applySize = useCallback(
    (id: string, span: number, rows: number) =>
      onChange?.((prev) =>
        prev.map((item) => (item.id === id ? { ...item, props: { ...item.props, span, rows } } : item)),
      ),
    [onChange],
  );

  // The safety net for a resize: capture can be lost when the handle is reconciled mid-drag, and
  // without this the release never arrives and the widget stays locked out of dragging.
  useEffect(() => {
    if (preview === null) return;

    const commit = () => {
      applySize(preview.id, preview.span, preview.rows);
      setPreview(null);
    };
    const abandon = () => setPreview(null);

    window.addEventListener("pointerup", commit);
    window.addEventListener("pointercancel", abandon);
    window.addEventListener("blur", abandon);

    return () => {
      window.removeEventListener("pointerup", commit);
      window.removeEventListener("pointercancel", abandon);
      window.removeEventListener("blur", abandon);
    };
  }, [preview, applySize]);

  /**
   * The widgets picked out, at this level only.
   *
   * Selection does not cross boards: what it is for is acting on a group of siblings at once —
   * wrapping them into a container above all — and a set spanning two levels has no single list to
   * take them out of.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  /**
   * The band's corners, in a ref rather than in state.
   *
   * A pointermove fires dozens of times a second, and putting the rectangle in state meant a render
   * of the whole board — every timeline, every heatmap, the player — for each one. The band is drawn
   * by writing to its own element's style directly, so dragging it costs one DOM write per move and
   * no React work at all. The selection it produces is state, once, on release.
   */
  const lasso = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const band = useRef<HTMLDivElement | null>(null);

  /** Clamped to the board: a lasso belongs to the board it started on, not to the whole viewport. */
  const clampToBoard = (x: number, y: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x, y };
    return {
      x: Math.min(Math.max(x, rect.left), rect.right),
      y: Math.min(Math.max(y, rect.top), rect.bottom),
    };
  };

  const drawBand = () => {
    const box = lasso.current;
    const node = band.current;
    if (!node) return;

    if (!box) {
      node.style.display = "none";
      return;
    }

    // Corners are kept in viewport coordinates because that is what the pointer reports; the band
    // is positioned against the board, so they are converted here.
    const rect = boardRef.current?.getBoundingClientRect();
    const originX = rect?.left ?? 0;
    const originY = rect?.top ?? 0;

    node.style.display = "block";
    node.style.left = `${Math.min(box.x1, box.x2) - originX}px`;
    node.style.top = `${Math.min(box.y1, box.y2) - originY}px`;
    node.style.width = `${Math.abs(box.x2 - box.x1)}px`;
    node.style.height = `${Math.abs(box.y2 - box.y1)}px`;
  };
  // Only worth flagging where nothing can be done about it by scrolling.
  const overflow = useOverflow(editing && scroll === "none");

  const update = (next: Widget[] | ((prev: Widget[]) => Widget[])) => onChange?.(next);
  const replace = (id: string, next: Widget) =>
    update(widgets.map((item) => (item.id === id ? next : item)));

  /**
   * A change handler per widget, created once and kept.
   *
   * The obvious `onChange={(next) => replace(widget.id, next)}` is a new function on every render,
   * which defeats memoising the widget entirely — the prop differs each time even when nothing
   * else does. These close over a ref instead, so their identity is stable while what they act on
   * stays current.
   */
  /**
   * The stable version of "replace this widget".
   *
   * Written as an updater so it closes over nothing that changes — which is the whole point. The
   * obvious `onChange={(next) => replace(widget.id, next)}` is a new function on every render, and a
   * prop that differs every time defeats memoising the widget entirely.
   */
  const replaceById = useCallback(
    (id: string, next: Widget) =>
      onChange?.((prev) => prev.map((item) => (item.id === id ? next : item))),
    [onChange],
  );

  /**
   * The same, for a container's contents.
   *
   * A nested board hands up either a list or an updater, and the updater has to be applied against
   * that container's children as they are at the moment of the write rather than as they were when
   * this closure was made — which is the point of threading updaters all the way down.
   */
  const replaceChildren = useCallback(
    (id: string, children: Widget[] | ((prev: Widget[]) => Widget[])) =>
      onChange?.((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                children:
                  typeof children === "function" ? children(item.children ?? []) : children,
              }
            : item,
        ),
      ),
    [onChange],
  );

  /** Moves the widget being dragged to whichever cell it is being held over. */
  const placeUnder = (event: { clientX: number; clientY: number }) => {
    if (reorderFrame.current || activeDraggingId === null) return;
    reorderFrame.current = window.requestAnimationFrame(() => {
      reorderFrame.current = 0;
    });

    const board = boardRef.current;
    const item = widgets.find((w) => w.id === activeDraggingId);
    if (!board || !item) return;

    const metrics = gridMetrics(board);
    const total = Math.max(1, metrics.columns.length);
    const grab = grabOffset.current ?? { x: 0, y: 0 };
    // The widget's own corner, not the pointer: dropping should leave it where it looks like it is.
    const cell = cellFromPoint(
      metrics,
      event.clientX - grab.x,
      event.clientY - grab.y,
      spanOf(item, total),
    );

    const span = spanOf(item, total);
    const current = cellOf(item, total, span);
    if (current && current.col === cell.col && current.row === cell.row) return;
    // Widgets do not stack: over an occupied cell the widget simply stays where it was.
    if (!isFree(widgets, item.id, { ...cell, span, rows: rowsOf(item) }, total)) return;

    replace(item.id, { ...item, props: { ...item.props, col: cell.col, row: cell.row } });
  };

  /** The footprint of `span` × `rows` cells, from where the gesture started. */
  const previewOf = (id: string, span: number, rows: number): ResizePreview | null => {
    const geom = resizeGeom.current;
    if (!geom) return null;

    const { metrics, col, row } = geom;
    return {
      id,
      span,
      rows,
      lines: gridLines(metrics),
      left: trackStart(metrics.columns, metrics.columnGap, col, 0),
      top: trackStart(metrics.rows, metrics.rowGap, row, ROW_HEIGHT),
      width: trackSize(metrics.columns, metrics.columnGap, col, span, 0),
      height: trackSize(metrics.rows, metrics.rowGap, row, rows, ROW_HEIGHT),
    };
  };

  /** The largest part of a wanted size that lands on empty cells. */
  const clampToFree = (
    id: string,
    col: number,
    row: number,
    wanted: { span: number; rows: number },
    total: number,
  ) => {
    let { span, rows } = wanted;
    while (span > 1 && !isFree(widgets, id, { col, row, span, rows }, total)) span -= 1;
    while (rows > 1 && !isFree(widgets, id, { col, row, span, rows }, total)) rows -= 1;
    return { span, rows };
  };

  /**
   * Pulling the bottom-right corner.
   *
   * Only the preview follows the pointer; the widget takes the size on release. Cells are measured
   * from the grid the browser resolved rather than from a column count and a gap in pixels — the gap
   * is authored in em and rows grow with their contents, so the arithmetic version was always a few
   * pixels out and further out the taller the board got.
   */
  const resizeTo = (event: { clientX: number; clientY: number }) => {
    const geom = resizeGeom.current;
    const current = preview;
    if (!geom || !current) return;

    const { metrics, col, row, total } = geom;
    const width = event.clientX - (metrics.originX + trackStart(metrics.columns, metrics.columnGap, col, 0));
    const height = event.clientY - (metrics.originY + trackStart(metrics.rows, metrics.rowGap, row, ROW_HEIGHT));

    const wanted = {
      span: tracksForSize(metrics.columns, metrics.columnGap, col, width, 0, Math.max(1, total - col)),
      rows: tracksForSize(metrics.rows, metrics.rowGap, row, height, ROW_HEIGHT, 40),
    };
    // Growing stops at whatever is already there rather than covering it.
    const fits = clampToFree(current.id, col + 1, row + 1, wanted, total);

    if (fits.span === current.span && fits.rows === current.rows) return;
    setPreview(previewOf(current.id, fits.span, fits.rows));
  };

  /**
   * A rubber band over the board's own background.
   *
   * Started only where the press lands on the board itself rather than on a widget, so it cannot
   * begin under something you meant to drag. What it selects is decided on release, from the rects
   * as they are then: selecting continuously while the band is drawn would flicker the outlines of
   * everything the pointer skimmed past.
   */
  const startLasso = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || event.button !== 0) return;
    if (event.target !== event.currentTarget) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const start = clampToBoard(event.clientX, event.clientY);
    lasso.current = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
    drawBand();
    // Only if something was selected: an unconditional set would re-render the board on every click
    // on the background.
    setSelected((current) => (current.size === 0 ? current : new Set()));
  };

  const endLasso = () => {
    const drawn = lasso.current;
    lasso.current = null;
    drawBand();
    if (!drawn) return;

    const box = {
      left: Math.min(drawn.x1, drawn.x2),
      right: Math.max(drawn.x1, drawn.x2),
      top: Math.min(drawn.y1, drawn.y2),
      bottom: Math.max(drawn.y1, drawn.y2),
    };

    // A click rather than a drag: nothing was being selected, so this only clears.
    if (box.right - box.left < 4 && box.bottom - box.top < 4) return;

    const caught = new Set<string>();
    for (const item of widgets) {
      const rect = flipRef.rect(item.id);
      if (!rect) continue;
      // Touched, not enclosed: having to draw a band right around a full-width widget to catch it
      // would make the gesture useless on the very boards it is most wanted on.
      const misses =
        rect.right < box.left || rect.left > box.right || rect.bottom < box.top || rect.top > box.bottom;
      if (!misses) caught.add(item.id);
    }

    setSelected(caught);
  };

  /** What the right-click menu offers for a widget, and for a selection it happens to be part of. */
  const menuItems = (item: Widget): MenuItem[] => {
    const group = selected.has(item.id) && selected.size > 1 ? selected : new Set([item.id]);
    const spec = WIDGETS[item.kind];

    return [
      {
        label: t("menu.inspect"),
        onSelect: () => inspect(item.id),
      },
      {
        label: t("menu.duplicate"),
        onSelect: () => update(duplicateWidget(widgets, item.id)),
      },
      // The way back out. Dragging one out works only where the page itself shows through, and
      // inside a full container there is nowhere to aim at.
      ...(containerId && containerId !== root.id
        ? [
            {
              label: t("menu.moveOut"),
              onSelect: () => {
                const grandparent = parentOf(root, containerId);
                moveWidgetToContainer(item.id, grandparent?.id ?? root.id);
                setSelected(new Set());
              },
            },
          ]
        : []),
      {
        // No submenu: there is one kind of container now.
        label: group.size > 1 ? t("menu.wrapMany", { count: group.size }) : t("menu.wrap"),
        onSelect: () => {
          update(wrapWidgets(widgets, group as Set<string>, "grid"));
          setSelected(new Set());
        },
      },
      {
        label: t("board.remove"),
        danger: true,
        onSelect: () => {
          if (group.size === 1 && spec.confirmRemove) {
            setPendingRemoval(item);
            return;
          }
          update(widgets.filter((w) => !group.has(w.id)));
          setSelected(new Set());
        },
      },
    ];
  };

  return (
    <>
      <div
        className={[
          "widget-board",
          editing ? "is-editing" : "",
          preview !== null ? "is-snapping" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={(node) => {
          boardRef.current = node;
          overflow.ref(node);
        }}
        data-flow={flow}
        data-scroll={scroll}
        data-overflow={overflow.overflowing === "none" ? undefined : overflow.overflowing}
        // The cell height a free board snaps to, so the CSS and the arithmetic cannot disagree.
        style={
          {
            "--grid-columns": String(columns ?? GRID_COLUMNS),
            "--row-height": `${ROW_HEIGHT}px`,
            ...(gap === undefined ? {} : { "--board-gap": `${gap}px` }),
          } as React.CSSProperties
        }
        onPointerDown={startLasso}
        onPointerMove={(e) => {
          if (!lasso.current) return;
          const point = clampToBoard(e.clientX, e.clientY);
          lasso.current = { ...lasso.current, x2: point.x, y2: point.y };
          drawBand();
        }}
        onPointerUp={endLasso}
        onPointerCancel={() => {
          lasso.current = null;
          drawBand();
        }}
        onDragOver={(e) => {
          if (!editing || draggingGlobal === null) return;
          if (containerId && draggingGlobal.id === containerId) return;

          e.preventDefault();
          if (containerId) e.stopPropagation();
          e.dataTransfer.dropEffect = draggingGlobal.kind ? "copy" : "move";

          if (containerId && draggingGlobal.kind && draggingGlobal.id) {
            insertPreview(draggingGlobal.id, draggingGlobal.kind, containerId);
          } else if (activeDraggingId !== null) {
            placeUnder(e);
          }
        }}
        onDrop={(e) => {
          if (!editing || draggingGlobal === null) return;
          if (containerId && draggingGlobal.id === containerId) return;

          e.preventDefault();
          if (containerId) e.stopPropagation();

          const payload = readWidgetDrag(e.dataTransfer);
          if (!payload) return;

          if (payload.kind && payload.id) {
            finalizePreview();
            return;
          }

          if (payload.kind) {
            const created = makeWidget(payload.kind);
            update((prev) => [...prev, created]);
            finalizePreview();
            return;
          }

          if (payload.id && containerId) {
            moveWidgetToContainer(payload.id, containerId);
          } else if (activeDraggingId !== null) {
            draggedNode.current = null;
            setDragging(null);
            finalizePreview();
            announceDrag(null);
          }
        }}
      >

        {/* Inside the board, because it is positioned against it. Always present while arranging so
            the first sight of it does not wait for a render. */}
        {editing && (
          <div className="widget-lasso" aria-hidden="true" ref={band} style={{ display: "none" }} />
        )}

        {/* The footprint a resize will land on, drawn over the board in pixels rather than as a grid
            item — a grid item jumps between cells, and the point of this is to show the result
            settling into place. */}
        {preview !== null && (
          <div className="board-grid" aria-hidden="true">
            {preview.lines.x.map((left) => (
              <span key={`x${left}`} className="board-grid-line" style={{ left }} />
            ))}
            {preview.lines.y.map((top) => (
              <span key={`y${top}`} className="board-grid-line is-row" style={{ top }} />
            ))}
          </div>
        )}

        {preview !== null && (
          <div
            className="resize-preview"
            aria-hidden="true"
            style={{ left: preview.left, top: preview.top, width: preview.width, height: preview.height }}
          >
            <span className="resize-preview-size">
              {preview.span} × {preview.rows}
            </span>
          </div>
        )}

        {editing && widgets.length === 0 && <EmptyBoard />}

        {widgets.map((widget) => {
          const spec = WIDGETS[widget.kind];
          const container = isContainer(widget);
          const style = styleOf(widget);

          const content = (
            <WidgetSlot widget={widget} editing={editing} replace={replaceById}>
              {container && (
                <WidgetBoard
                  widgets={widget.children ?? []}
                  scroll={scrollOf(widget)}
                  columns={columnsOf(widget)}
                  gap={gapOf(widget)}
                  editing={editing}
                  anchor={anchor}
                  containerId={widget.id}
                  onChange={(children) => replaceChildren(widget.id, children)}
                />
              )}
            </WidgetSlot>
          );

          return (
            <section
              key={widget.id}
              ref={flipRef.node(widget.id)}
              className={[
                "widget",
                activeDraggingId === widget.id ? "is-dragging" : "",
                selected.has(widget.id) ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                // A free board places by cell; an ordinary grid by span. A row or a column is laid
                // out by what is in it, and a grid-column on a flex item is simply ignored.
                ...(() => {
                  const total = columns ?? GRID_COLUMNS;
                  const span = spanOf(widget, total);
                  const rows = rowsOf(widget);
                  const cell = cellOf(widget, total, span);
                  return {
                    gridColumn: cell ? `${cell.col} / span ${span}` : `span ${span}`,
                    gridRow: cell ? `${cell.row} / span ${rows}` : `span ${rows}`,
                  };
                })(),
                ...styleVariables(style),
              }}
              data-widget={widget.kind}
              // Which slot it sits in, so the stylesheet can hold the page to a reading width
              // without the slot's own background stopping at the same edge.
              // What the server scopes this widget's own stylesheet to. Must match widgetScope() in
              // server/services/layoutCss.ts, or a widget's CSS lands on nothing.
              data-widget-id={widget.id}
              // Omitted at "none", so the rules that ask whether a widget has been given a border
              // or a shadow can actually tell.
              data-border={style.border === "none" ? undefined : style.border}
              data-shadow={style.shadow === "none" ? undefined : style.shadow}
              data-inspecting={inspecting === widget.id ? "" : undefined}
              // Takes the slack at the end of a bar — how the account tile sits at the far right
              // without being pinned there.
              data-push={widget.props?.push ? "" : undefined}
              draggable={editing && preview === null}
              onContextMenu={(e) => {
                if (!editing) return;
                e.preventDefault();
                e.stopPropagation();
                // Right-clicking outside the selection acts on what was clicked, not on what
                // happened to be selected a moment ago.
                if (!selected.has(widget.id)) setSelected(new Set([widget.id]));
                setMenu({ x: e.clientX, y: e.clientY, id: widget.id });
              }}
              onDragStart={(e) => {
                draggedNode.current = e.currentTarget;
                const box = e.currentTarget.getBoundingClientRect();
                grabOffset.current = { x: e.clientX - box.left, y: e.clientY - box.top };
                setDragging(widget.id);
                // So another anchor can identify what landed on it, and so every anchor knows a
                // drag is in flight and can offer itself as a target.
                e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: widget.id, anchor }));
                e.dataTransfer.effectAllowed = "move";
                announceDrag({ id: widget.id, anchor });
              }}
              onDragEnd={() => {
                draggedNode.current = null;
                grabOffset.current = null;
                setDragging(null);
                announceDrag(null);
              }}
              onDragOver={(e) => {
                if (!editing || draggingGlobal === null) return;
                if (containerId && draggingGlobal.id === containerId) return;

                if (activeDraggingId !== null) {
                  // The board places it by cell; a widget under the pointer is just something to
                  // drop over, not something to swap with.
                  e.preventDefault();
                  placeUnder(e);
                } else if (containerId && draggingGlobal.kind && draggingGlobal.id) {
                  e.preventDefault();
                  e.stopPropagation();
                  insertPreview(draggingGlobal.id, draggingGlobal.kind, containerId);
                }
              }}
              onDrop={(e) => {
                if (!editing || draggingGlobal === null) return;
                if (containerId && draggingGlobal.id === containerId) return;

                if (activeDraggingId !== null) {
                  e.preventDefault();
                  e.stopPropagation();
                  draggedNode.current = null;
                  setDragging(null);
                  finalizePreview();
                  announceDrag(null);
                  return;
                }

                const payload = readWidgetDrag(e.dataTransfer);
                if (!payload) return;

                if (payload.kind && payload.id) {
                  e.preventDefault();
                  e.stopPropagation();
                  finalizePreview();
                  return;
                }

                if (payload.kind) {
                  e.preventDefault();
                  e.stopPropagation();
                  const created = makeWidget(payload.kind);
                  update((prev) => [...prev, created]);
                  finalizePreview();
                  return;
                }

                if (payload.id && containerId) {
                  e.preventDefault();
                  e.stopPropagation();
                  moveWidgetToContainer(payload.id, containerId);
                }
              }}
            >
              {/* The corner badge an iPhone puts on a jiggling icon: it acts on this one widget, so
                  it sits on the widget rather than in a toolbar. */}
              {editing && (
                <button
                  type="button"
                  className="widget-remove-badge"
                  aria-label={t("board.remove")}
                  title={t("board.remove")}
                  onClick={() =>
                    spec.confirmRemove
                      ? setPendingRemoval(widget)
                      : update(removeWidget(widgets, widget.id))
                  }
                >
                  <Glyph name="close" />
                </button>
              )}

              {editing && (
                <div className="widget-chrome">
                  <span className="widget-label">{t(`widgets.${widget.kind}.label`)}</span>

                  <div className="widget-controls">
                    {/* A container's one real setting: which way its children run. */}
                    <button
                      type="button"
                      className="widget-btn"
                      title={t("board.duplicate")}
                      onClick={() => update(duplicateWidget(widgets, widget.id))}
                    >
                      <Glyph name="duplicate" />
                    </button>
                    <button
                      type="button"
                      className="widget-btn"
                      title={t("inspector.open")}
                      aria-expanded={inspecting === widget.id}
                      onClick={() => inspect(inspecting === widget.id ? null : widget.id)}
                    >
                      <Glyph name="settings" />
                    </button>
                    <span className="widget-grip" aria-hidden="true"><Glyph name="grip" /></span>
                  </div>
                </div>
              )}

              {/* The corner you pull to resize. Pointer events rather than the drag machinery: a
                  drag would move the widget, and this has to change its size while it stays put.
                  Only where a size means something — a row or a column is measured by its contents. */}
              {editing && (
                <span
                  className="widget-resize-handle"
                  role="slider"
                  tabIndex={0}
                  aria-label={t("board.resize")}
                  aria-valuenow={spanOf(widget, columns ?? GRID_COLUMNS)}
                  aria-valuemin={1}
                  aria-valuemax={columns ?? GRID_COLUMNS}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // Capture is an optimisation here; the window listeners are what guarantee
                      // the release.
                    }

                    const board = boardRef.current;
                    const box = flipRef.rect(widget.id);
                    if (!board || !box) return;

                    const metrics = gridMetrics(board);
                    const total = Math.max(1, metrics.columns.length);
                    resizeGeom.current = {
                      metrics,
                      total,
                      // Where the widget actually sits, which is not always where its stored cell
                      // says: an unplaced widget is wherever the grid put it.
                      col: trackAt(metrics.columns, metrics.columnGap, box.left - metrics.originX, 0),
                      row: trackAt(metrics.rows, metrics.rowGap, box.top - metrics.originY, ROW_HEIGHT),
                    };
                    setPreview(previewOf(widget.id, spanOf(widget, total), rowsOf(widget)));
                  }}
                  onPointerMove={(e) => {
                    if (preview?.id !== widget.id) return;
                    resizeTo(e);
                  }}
                  onPointerUp={(e) => {
                    try {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    } catch {
                      // Already released, or never captured.
                    }
                    // The window listener commits the size; this only ends the gesture.
                  }}
                  onPointerCancel={() => setPreview(null)}
                  // The same thing from the keyboard, since a corner is pointer-only by nature.
                  onKeyDown={(e) => {
                    const vertical = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
                    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                    if (vertical === 0 && step === 0) return;
                    e.preventDefault();

                    const total = columns ?? GRID_COLUMNS;
                    const span = Math.min(total, Math.max(1, spanOf(widget, total) + step));
                    const rows = Math.min(40, Math.max(1, rowsOf(widget) + vertical));
                    const cell = cellOf(widget, total, span);

                    // A placed widget grows only into empty cells; an unplaced one is the grid's to
                    // arrange, and the grid never stacks what it places itself.
                    if (cell && !isFree(widgets, widget.id, { ...cell, span, rows }, total)) return;
                    replace(widget.id, { ...widget, props: { ...widget.props, span, rows } });
                  }}
                />
              )}

              {/* Only ever the server's scoped version: the raw source could restyle the whole app,
                  or somebody else's profile on a shared page. */}
              {style.scopedCss && <style>{style.scopedCss}</style>}

              <div className="widget-content">{content}</div>
            </section>
          );
        })}
      </div>

      {overflow.overflowing !== "none" && (
        <OverflowWarning axis={overflow.overflowing} scrollable={scroll !== "none"} />
      )}

      {menu !== null && (() => {
        const target = widgets.find((item) => item.id === menu.id);
        if (!target) return null;

        return (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems(target)}
            onClose={() => setMenu(null)}
          />
        );
      })()}

      {editing && inspecting !== null && (() => {
        const target = widgets.find((item) => item.id === inspecting);
        if (!target) return null;

        return (
          <WidgetInspector
            widget={target}
            anchor={inspectorAnchor}
            onChange={(next: Widget) => replace(target.id, next)}
            onClose={() => inspect(null)}
          />
        );
      })()}

      {pendingRemoval !== null && (
        <ConfirmDialog
          title={t("board.confirmTitle")}
          message={t("board.confirmMessage")}
          confirmLabel={t("board.confirm")}
          cancelLabel={t("board.cancel")}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            update(removeWidget(widgets, pendingRemoval.id));
            setPendingRemoval(null);
          }}
        />
      )}
    </>
  );
}
