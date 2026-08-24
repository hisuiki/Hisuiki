import type { ReactNode, RefObject } from "react";
import type { Anchor, Flow, Scroll, Widget, WidgetKind, WidgetStyle } from "./widget";

export interface WidgetBoardProps {
  widgets: Widget[];
  flow?: Flow;
  scroll?: Scroll;
  editing?: boolean;
  /** Which anchor this board belongs to, so a drag can be recognised by another one. */
  anchor?: Anchor;
  /** Set if this board is nested inside a container widget. */
  containerId?: string;
  /** Per-slot styling, when the flow is "anchors". */
  slots?: Partial<Record<Anchor, WidgetStyle>>;
  /** Columns for a grid flow, cell height for a free one. */
  columns?: number;
  rowHeight?: number;
  /** Space between children, in pixels. */
  gap?: number;
  /** Whether the side slots run the full height of an anchors board. */
  sides?: "inset" | "full";
  /** Takes an updater as well as a list, so change handlers can be stable. */
  onChange?: (widgets: Widget[] | ((prev: Widget[]) => Widget[])) => void;
}

export interface AnchorRegionProps {
  anchor: Anchor;
  className?: string;
  /** Centres the board in a reading-width column while the anchor itself spans the page. */
  rail?: boolean;
}

export interface WidgetGalleryProps {
  onAdd: (kind: WidgetKind) => void;
  /** Inside a panel: no collapse bar of its own, since the tab already names it. */
  embedded?: boolean;
}

/** A 1-based grid position, matching CSS grid lines. */
export interface GridCell {
  col: number;
  row: number;
}

/** A board's grid as the browser resolved it: used track sizes, gaps, and the padding-box origin. */
export interface GridMetrics {
  columns: number[];
  rows: number[];
  columnGap: number;
  rowGap: number;
  originX: number;
  originY: number;
}

/** The footprint a resize will land on, in board-relative pixels. */
export interface ResizePreview {
  id: string;
  /** Where the board's lines fall while the corner is held, in board-relative pixels. */
  lines: { x: number[]; y: number[] };
  left: number;
  top: number;
  width: number;
  height: number;
  span: number;
  rows: number;
}

/** Where an incoming widget would land, in board-relative pixels. */
export interface DropHint {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One tab of an Inspector panel. Content is a callback so it is built only when shown. */
export interface InspectorTab {
  id: string;
  label: string;
  render: () => ReactNode;
  /** Widens the panel while this tab is showing, for content that needs the room. */
  wide?: boolean;
}

export interface InspectorProps {
  widget: Widget;
  title?: string;
  subtitle?: string;
  /** Where a popover/floating window can hang from or position against. */
  anchor?: RefObject<HTMLElement | null>;
  /** A popover/floating window or a docked sidebar. */
  variant?: "popover" | "sidebar" | "floating";
  align?: "left" | "right";
  tabs?: InspectorTab[];
  onChange: (next: Widget) => void;
  onClose: () => void;
}

export type WidgetInspectorProps = InspectorProps;

export interface BoardInspectorProps {
  anchor: Anchor;
  trigger: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  items?: MenuItem[];
  danger?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export interface AnchoredProps {
  anchor: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  className?: string;
  gap?: number;
  children?: ReactNode;
}

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}
