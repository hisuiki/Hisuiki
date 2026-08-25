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
  flowOf,
  findInTree,
  parentOf,
  scrollOf,
  cellOf,
  isFree,
  rowsOf,
  spanOf,
  wrapWidgets,
} from "../../../Services/LayoutUtils";
import type { DropHint, GridMetrics, MenuItem, ResizePreview, Widget, WidgetBoardProps, WidgetKind } from "../../../Types/TypeRegistry";
import {
  cellFromPoint,
  gridLines,
  gridMetrics,
  trackAt,
  trackSize,
  trackStart,
  tracksForSize,
} from "../../../Services/GridUtils";
import { styleOf, styleVariables } from "../../../Services/WidgetStyleUtils";

import { WIDGET_REGISTRY } from "../../../Widgets/WidgetRegistry";
import { usePageLayout } from "../../../Services/PageLayoutProvider";
import { DRAG_TYPE, readWidgetDrag, type WidgetDrag } from "../../../Services/WidgetDragUtils";
import { useFlip } from "../../Hooks/UseFlip";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import EmptyBoard from "../EmptyBoard/EmptyBoard";
import Glyph from "../WidgetIcon/Glyph";
import ContextMenu from "../ContextMenu/ContextMenu";

/**
 * The board currently showing a drop hint.
 *
 * Moving the pointer into a nested board does not leave the board around it, so the outer one is
 * never told to stop — without a single owner both drew a footprint at once.
 */
let hintOwner: HTMLDivElement | null = null;

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
 * The way out of a container, along all four of its edges.
 *
 * Laid over the container rather than made of padding: opening real space moved every widget on the
 * page the moment a drag began, so what you aimed at was never where you grabbed it.
 */
function EscapeEdges({
  onEdgeOver,
  onEdgeDrop,
}: {
  onEdgeOver: (e: React.DragEvent) => void;
  onEdgeDrop: (e: React.DragEvent) => void;
}) {
  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((edge) => (
        <span
          key={edge}
          className="widget-escape-edge"
          data-edge={edge}
          aria-hidden="true"
          onDragOver={onEdgeOver}
          onDrop={onEdgeDrop}
        />
      ))}
    </>
  );
}

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
  const hintFrame = useRef(0);
  const [pendingRemoval, setPendingRemoval] = useState<Widget | null>(null);
  // The footprint a corner drag is aiming at. The widget itself is left alone until the corner is
  // released: resizing it live reflowed the rows under the gesture, which is what made the preview
  // drift away from the cells it was supposed to be showing.
  const [preview, setPreview] = useState<ResizePreview | null>(null);
  // Where a widget carried in from another board would land. Drawn by writing to its own element,
  // so a drag costs one DOM write per frame rather than a render of the board.
  const hintEl = useRef<HTMLDivElement | null>(null);
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
    selectedIds,
    selectWidgets,
    inspectingId,
    inspect,
    root,
  } = usePageLayout();
  const activeDraggingId =
    dragging ??
    (draggingGlobal?.id && widgets.some((w) => w.id === draggingGlobal.id)
      ? draggingGlobal.id
      : null);

  const arranging = editing && draggingGlobal !== null;
  // A container cannot be dropped inside itself. Without this a board nested in the widget being
  // carried still offered itself, and the move was refused only once it had been attempted.
  const dragged = draggingGlobal?.id ? findInTree(root, draggingGlobal.id) : null;
  const refusesDrop = dragged !== null && findInTree(dragged, containerId ?? root.id) !== null;

  // Reordering already shows where a widget will land; animating every neighbour on top of that,
  // many times a second, is what made the board flicker while something was being moved.
  // FLIP exists to show an editor where widgets move while arranging the board. On a published
  // page, route transitions also change widget geometry; running FLIP there starts a second
  // transform just after the Metro enter animation ends, which looks like the whole app rerenders
  // and snaps sideways once more.
  const flipRef = useFlip(editing && activeDraggingId === null && draggingGlobal === null);

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

  /**
   * Where a widget dropped at (clientX, clientY) would land on this board.
   *
   * The cell under the pointer when it is free, and otherwise the nearest one that is: refusing the
   * drop outright is what made a widget dragged out of a container land at the end of the page
   * instead of where it was let go.
   */
  const dropPlan = useCallback(
    (clientX: number, clientY: number, widgetId: string, widgetKind?: WidgetKind) => {
      const board = boardRef.current;
      if (!board) return null;

      const metrics = gridMetrics(board);
      const total = Math.max(1, metrics.columns.length);
      // The offset travels with the drag: a board the widget was not picked up on has no grab of
      // its own, and its last one belongs to an earlier gesture.
      const grab = draggingGlobal?.grab ?? grabOffset.current ?? { x: 0, y: 0 };
      const item = findInTree(root, widgetId) ?? makeWidget(widgetKind ?? "spacer", { id: widgetId });
      const span = spanOf(item, total);
      const rows = rowsOf(item);
      const wanted = cellFromPoint(metrics, clientX - grab.x, clientY - grab.y, span);

      const fits = (col: number, row: number) =>
        col >= 1 && row >= 1 && col + span - 1 <= total && isFree(widgets, widgetId, { col, row, span, rows }, total);

      let cell: { col: number; row: number } | null = fits(wanted.col, wanted.row) ? wanted : null;
      for (let ring = 1; cell === null && ring <= 8; ring += 1) {
        for (let dr = -ring; cell === null && dr <= ring; dr += 1) {
          for (let dc = -ring; dc <= ring; dc += 1) {
            if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
            if (!fits(wanted.col + dc, wanted.row + dr)) continue;
            cell = { col: wanted.col + dc, row: wanted.row + dr };
            break;
          }
        }
      }

      return cell === null ? null : { cell, span, rows, metrics };
    },
    [root, widgets, draggingGlobal],
  );

  const drawHint = useCallback((rect: DropHint | null) => {
    const node = hintEl.current;
    if (!node) return;

    if (rect === null) {
      node.style.display = "none";
      if (hintOwner === node) hintOwner = null;
      return;
    }

    if (hintOwner && hintOwner !== node) hintOwner.style.display = "none";
    hintOwner = node;
    node.style.display = "block";
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.top}px`;
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
  }, []);

  // Whatever ended the drag — a drop elsewhere, escape, a cancel — the footprint goes with it.
  useEffect(() => {
    if (draggingGlobal === null) drawHint(null);
  }, [draggingGlobal, drawHint]);

  /** Draws the footprint an incoming widget would take, without touching the layout. */
  const hintDrop = useCallback(
    (clientX: number, clientY: number, widgetId: string, widgetKind?: WidgetKind) => {
      // dragover fires far faster than the grid needs re-measuring.
      if (hintFrame.current) return;
      hintFrame.current = window.requestAnimationFrame(() => {
        hintFrame.current = 0;
      });

      const plan = dropPlan(clientX, clientY, widgetId, widgetKind);
      if (!plan) return;

      const { cell, span, rows, metrics } = plan;
      drawHint({
        left: trackStart(metrics.columns, metrics.columnGap, cell.col - 1, 0),
        top: trackStart(metrics.rows, metrics.rowGap, cell.row - 1, ROW_HEIGHT),
        width: trackSize(metrics.columns, metrics.columnGap, cell.col - 1, span, 0),
        height: trackSize(metrics.rows, metrics.rowGap, cell.row - 1, rows, ROW_HEIGHT),
      });
    },
    [dropPlan, drawHint],
  );

  /**
   * Takes a widget dropped on this board, from wherever in the tree it was carried.
   *
   * The board, a widget on it and a container's escape edge all land here, so they cannot disagree
   * about where the thing goes.
   */
  const acceptDrop = useCallback(
    (e: React.DragEvent) => {
      const payload = readWidgetDrag(e.dataTransfer);
      if (!payload) return;

      if (payload.source === "gallery" || (!payload.id && payload.kind)) {
        const kind = payload.kind;
        if (kind && !payload.id) onChange?.((prev) => [...prev, makeWidget(kind)]);
        finalizePreview();
        announceDrag(null);
        return;
      }
      if (!payload.id) return;

      const isLocal = activeDraggingId !== null && widgets.some((w) => w.id === payload.id);
      if (!isLocal) {
        const plan = dropPlan(e.clientX, e.clientY, payload.id, payload.kind);
        moveWidgetToContainer(payload.id, containerId ?? root.id, plan?.cell);
      }

      draggedNode.current = null;
      setDragging(null);
      drawHint(null);
      finalizePreview();
      announceDrag(null);
    },
    [
      onChange,
      activeDraggingId,
      widgets,
      dropPlan,
      moveWidgetToContainer,
      containerId,
      root.id,
      drawHint,
      finalizePreview,
      announceDrag,
    ],
  );

  const onEdgeOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (draggingGlobal?.id) hintDrop(e.clientX, e.clientY, draggingGlobal.id, draggingGlobal.kind);
    },
    [draggingGlobal, hintDrop],
  );

  const onEdgeDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      acceptDrop(e);
    },
    [acceptDrop],
  );

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
    const item = widgets.find((w) => w.id === id);
    const spec = item ? WIDGETS[item.kind] : undefined;
    const minSpan = spec?.minSpan ?? 1;
    const maxSpan = spec?.maxSpan ?? total;
    const minRows = spec?.minRows ?? 1;
    const maxRows = spec?.maxRows ?? 40;

    let span = Math.min(maxSpan, Math.max(minSpan, wanted.span));
    let rows = Math.min(maxRows, Math.max(minRows, wanted.rows));

    while (span > minSpan && !isFree(widgets, id, { col, row, span, rows }, total)) span -= 1;
    while (rows > minRows && !isFree(widgets, id, { col, row, span, rows }, total)) rows -= 1;
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
   * A rubber band over the board's background.
   *
   * Started wherever the press lands on empty space rather than on an interactive part of a widget,
   * so it cannot begin under something you meant to drag. What it selects is decided on release,
   * from the rects as they are then.
   */
  const startLasso = useCallback(
    (event: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
      if (!editing || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".widget") || target?.closest?.(".context-menu") || target?.closest?.(".inspector")) return;

      try {
        if (event.currentTarget && "setPointerCapture" in event.currentTarget) {
          (event.currentTarget as HTMLElement).setPointerCapture((event as React.PointerEvent).pointerId);
        }
      } catch {
        // Capture is an optimisation; window listeners guarantee pointermove and pointerup.
      }

      lasso.current = { x1: event.clientX, y1: event.clientY, x2: event.clientX, y2: event.clientY };
      drawBand();
      if (selectedIds.size > 0) selectWidgets([]);
    },
    [editing, selectedIds, selectWidgets],
  );

  const endLasso = useCallback(() => {
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

    const primary = caught.values().next().value ?? null;
    selectWidgets(caught, primary, boardRef.current);
  }, [widgets, flipRef, selectWidgets]);

  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      if (!lasso.current) return;
      lasso.current = { ...lasso.current, x2: e.clientX, y2: e.clientY };
      drawBand();
    };

    const onWindowPointerUp = () => {
      if (!lasso.current) return;
      endLasso();
    };

    const onWindowPointerCancel = () => {
      if (!lasso.current) return;
      lasso.current = null;
      drawBand();
    };

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerCancel);

    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerCancel);
    };
  }, [endLasso]);

  // When mounted at the root level, listen on the parent wrapper (e.g. .page-root) so lasso and
  // context menu work across the whole page canvas, including wide desktop margins.
  useEffect(() => {
    if (!editing || containerId !== root.id) return;
    const parent = boardRef.current?.parentElement;
    if (!parent) return;

    const onParentPointerDown = (e: PointerEvent) => {
      if (e.target === parent) {
        startLasso(e);
      }
    };

    const onParentContextMenu = (e: MouseEvent) => {
      if (e.target === parent) {
        e.preventDefault();
        if (selectedIds.size > 0) selectWidgets([]);
        setMenu(null);
      }
    };

    // The wrapper's own margins only. Anything inside the board — a nested container above all —
    // belongs to whichever board it is over, and this listener runs before React's, so claiming the
    // whole subtree here sent every drop to the page.
    const onParentDragOver = (e: DragEvent) => {
      if (!editing || draggingGlobal === null || e.target !== parent) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };

    const onParentDrop = (e: DragEvent) => {
      if (!editing || draggingGlobal === null || e.target !== parent) return;
      if (!e.dataTransfer) return;
      e.preventDefault();
      const payload = readWidgetDrag(e.dataTransfer);
      if (payload?.id) {
        moveWidgetToContainer(payload.id, root.id, dropPlan(e.clientX, e.clientY, payload.id, payload.kind)?.cell);
        draggedNode.current = null;
        setDragging(null);
        drawHint(null);
        finalizePreview();
        announceDrag(null);
      }
    };

    parent.addEventListener("pointerdown", onParentPointerDown);
    parent.addEventListener("contextmenu", onParentContextMenu);
    parent.addEventListener("dragover", onParentDragOver);
    parent.addEventListener("drop", onParentDrop);

    return () => {
      parent.removeEventListener("pointerdown", onParentPointerDown);
      parent.removeEventListener("contextmenu", onParentContextMenu);
      parent.removeEventListener("dragover", onParentDragOver);
      parent.removeEventListener("drop", onParentDrop);
    };
  }, [editing, containerId, root.id, startLasso, draggingGlobal, finalizePreview, announceDrag, moveWidgetToContainer, dropPlan, drawHint, selectedIds, selectWidgets]);

  /** What the right-click menu offers for a widget, and for a selection it happens to be part of. */
  const menuItems = (item: Widget): MenuItem[] => {
    // Group operations act on siblings only. The shared selection may span layers, which has no
    // single list that can be wrapped or removed as one operation.
    const selectedHere = new Set(widgets.filter((candidate) => selectedIds.has(candidate.id)).map((candidate) => candidate.id));
    const group = selectedHere.has(item.id) && selectedHere.size > 1 ? selectedHere : new Set([item.id]);
    const spec = WIDGETS[item.kind];

    return [
      {
        label: t("menu.inspect"),
        onSelect: () => inspect(item.id, flipRef.element(item.id)),
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
                const target = grandparent?.id ?? root.id;
                for (const id of group) {
                  moveWidgetToContainer(id, target);
                }
                selectWidgets([]);
              },
            },
          ]
        : []),
      {
        // No submenu: there is one kind of container now.
        label: group.size > 1 ? t("menu.wrapMany", { count: group.size }) : t("menu.wrap"),
        onSelect: () => {
          update(wrapWidgets(widgets, group as Set<string>, "grid"));
          selectWidgets([]);
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
          selectWidgets([]);
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
          arranging ? "is-arranging" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={(node) => {
          boardRef.current = node;
        }}
        data-flow={flow}
        data-scroll={scroll}
        // The cell height a free board snaps to, so the CSS and the arithmetic cannot disagree.
        style={
          {
            "--grid-columns": String(columns ?? GRID_COLUMNS),
            "--row-height": `${ROW_HEIGHT}px`,
            ...(gap === undefined ? {} : { "--board-gap": `${gap}px` }),
          } as React.CSSProperties
        }
        onPointerDown={(e) => {
          if (containerId) e.stopPropagation();
          startLasso(e);
        }}
        onContextMenu={(e) => {
          if (!editing) return;
          e.preventDefault();
          if (containerId) e.stopPropagation();
          if (selectedIds.size > 0) selectWidgets([]);
          setMenu(null);
        }}
        onDragOver={(e) => {
          if (!editing || draggingGlobal === null) return;
          if (refusesDrop) return;

          e.preventDefault();
          if (containerId) e.stopPropagation();
          e.dataTransfer.dropEffect = draggingGlobal.kind && !draggingGlobal.id ? "copy" : "move";

          if (
            draggingGlobal.source === "gallery" &&
            containerId &&
            draggingGlobal.kind &&
            draggingGlobal.id &&
            !widgets.some((w) => w.id === draggingGlobal.id)
          ) {
            insertPreview(draggingGlobal.id, draggingGlobal.kind, containerId);
          } else if (activeDraggingId !== null) {
            placeUnder(e);
          } else if (draggingGlobal.id) {
            hintDrop(e.clientX, e.clientY, draggingGlobal.id, draggingGlobal.kind);
          }
        }}
        onDragLeave={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && e.currentTarget.contains(next)) return;
          drawHint(null);
        }}
        onDrop={(e) => {
          if (!editing || draggingGlobal === null) return;
          if (refusesDrop) return;

          e.preventDefault();
          if (containerId) e.stopPropagation();
          acceptDrop(e);
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

        {editing && <div className="drop-hint" aria-hidden="true" ref={hintEl} style={{ display: "none" }} />}

        {editing && widgets.length === 0 && <EmptyBoard />}

        {widgets.map((widget) => {
          const spec = WIDGETS[widget.kind];
          const container = isContainer(widget);
          const style = styleOf(widget);
          // A container holding what is being carried opens a margin around its board: dropping on
          // that ring lands the widget here, one level out, however deeply it was nested.
          const escaping =
            arranging &&
            container &&
            draggingGlobal?.id != null &&
            draggingGlobal.id !== widget.id &&
            findInTree(widget, draggingGlobal.id) !== null;

          const content = (
            <WidgetSlot widget={widget} editing={editing} replace={replaceById}>
              {container && (
                <WidgetBoard
                  widgets={widget.children ?? []}
                  flow={flowOf(widget)}
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
                selectedIds.has(widget.id) ? "is-selected" : "",
                escaping ? "is-escape" : "",
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
              data-span={spanOf(widget, columns ?? GRID_COLUMNS)}
              data-rows={rowsOf(widget)}
              // Which slot it sits in, so the stylesheet can hold the page to a reading width
              // without the slot's own background stopping at the same edge.
              // What the server scopes this widget's own stylesheet to. Must match widgetScope() in
              // server/services/layoutCss.ts, or a widget's CSS lands on nothing.
              data-widget-id={widget.id}
              data-anchor={typeof widget.props?.anchor === "string" ? widget.props.anchor : undefined}
              // Omitted at "none", so the rules that ask whether a widget has been given a border
              // or a shadow can actually tell.
              data-border={style.border === "none" ? undefined : style.border}
              data-shadow={style.shadow === "none" ? undefined : style.shadow}
              data-inspecting={inspectingId === widget.id ? "" : undefined}
              // Takes the slack at the end of a bar — how the account tile sits at the far right
              // without being pinned there.
              data-push={widget.props?.push ? "" : undefined}
              draggable={editing && preview === null}
              onPointerDown={(e) => {
                if (!editing || e.button !== 0) return;
                const target = e.target as HTMLElement | null;
                if (target?.closest("button, input, textarea, select, a, [role='slider']")) return;
                e.stopPropagation();

                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  const next = new Set(selectedIds);
                  if (next.has(widget.id)) next.delete(widget.id);
                  else next.add(widget.id);
                  const primary = next.has(widget.id) ? widget.id : (next.values().next().value ?? null);
                  selectWidgets(next, primary, flipRef.element(widget.id));
                } else if (selectedIds.size !== 1 || !selectedIds.has(widget.id)) {
                  selectWidgets([widget.id], widget.id, flipRef.element(widget.id));
                }
              }}
              onContextMenu={(e) => {
                if (!editing) return;
                e.preventDefault();
                e.stopPropagation();
                // Right-clicking outside the selection acts on what was clicked, not on what
                // happened to be selected a moment ago.
                if (!selectedIds.has(widget.id)) {
                  selectWidgets([widget.id], widget.id, flipRef.element(widget.id));
                }
                setMenu({ x: e.clientX, y: e.clientY, id: widget.id });
              }}
              onDragStart={(e) => {
                // The widget picked up, not every container it happens to sit in: this handler is on
                // each ancestor section too, and letting the event through started a drag of all of
                // them, the outermost winning the announcement.
                e.stopPropagation();
                draggedNode.current = e.currentTarget;
                const box = e.currentTarget.getBoundingClientRect();
                const grab = { x: e.clientX - box.left, y: e.clientY - box.top };
                grabOffset.current = grab;
                setDragging(widget.id);
                const dragPayload: WidgetDrag = {
                  id: widget.id,
                  kind: widget.kind,
                  sourceContainerId: containerId ?? root.id,
                  source: "board",
                  anchor,
                  grab,
                };
                e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragPayload));
                e.dataTransfer.effectAllowed = "move";
                announceDrag(dragPayload);
              }}
              onDragEnd={(e) => {
                e.stopPropagation();
                draggedNode.current = null;
                grabOffset.current = null;
                setDragging(null);
                drawHint(null);
                announceDrag(null);
              }}
              onDragOver={(e) => {
                if (!editing || draggingGlobal === null) return;
                if (refusesDrop) return;
                if (widget.id === draggingGlobal.id) return;

                if (container) return;

                e.preventDefault();
                if (activeDraggingId !== null) {
                  placeUnder(e);
                } else if (draggingGlobal.id) {
                  hintDrop(e.clientX, e.clientY, draggingGlobal.id, draggingGlobal.kind);
                }
              }}
              onDrop={(e) => {
                if (!editing || draggingGlobal === null || container || refusesDrop) return;
                e.preventDefault();
                e.stopPropagation();
                acceptDrop(e);
              }}
            >
              {/* The way out, along all four edges of a container holding what is being carried.
                  Drawn over the container rather than made of padding: opening real space moved
                  every widget on the page the moment a drag began. */}
              {escaping && <EscapeEdges onEdgeOver={onEdgeOver} onEdgeDrop={onEdgeDrop} />}

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
                      aria-expanded={inspectingId === widget.id}
                      onClick={() => inspect(inspectingId === widget.id ? null : widget.id, flipRef.element(widget.id))}
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
              {editing && flow === "grid" &&
                ((spec.maxSpan ?? (columns ?? GRID_COLUMNS)) > (spec.minSpan ?? 1) ||
                  (spec.maxRows ?? 40) > (spec.minRows ?? 1)) && (
                <span
                  className="widget-resize-handle"
                  role="slider"
                  tabIndex={0}
                  aria-label={t("board.resize")}
                  aria-valuenow={spanOf(widget, columns ?? GRID_COLUMNS)}
                  aria-valuemin={spec.minSpan ?? 1}
                  aria-valuemax={Math.min(columns ?? GRID_COLUMNS, spec.maxSpan ?? (columns ?? GRID_COLUMNS))}
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
                    const minSpan = spec.minSpan ?? 1;
                    const maxSpan = Math.min(total, spec.maxSpan ?? total);
                    const minRows = spec.minRows ?? 1;
                    const maxRows = spec.maxRows ?? 40;
                    const span = Math.min(maxSpan, Math.max(minSpan, spanOf(widget, total) + step));
                    const rows = Math.min(maxRows, Math.max(minRows, rowsOf(widget) + vertical));
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
