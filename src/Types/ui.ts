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
  /** Called when a tile starts being dragged, so a panel can get out of the way. */
  onDragStart?: () => void;
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
  title: string;
  subtitle?: string;
  anchor: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  tabs: InspectorTab[];
  onClose: () => void;
}

export interface WidgetInspectorProps {
  widget: Widget;
  anchor: RefObject<HTMLElement | null>;
  onChange: (next: Widget) => void;
  onClose: () => void;
}

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
