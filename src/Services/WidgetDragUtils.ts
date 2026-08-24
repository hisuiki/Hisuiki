import type { Anchor, WidgetKind } from "../Types/TypeRegistry";

/** The drag payload that lets a widget cross from one anchor's board to another. */
export const DRAG_TYPE = "application/x-hisuiki-widget";

export interface WidgetDrag {
  /** Set when an existing widget is being moved. */
  id?: string;
  anchor?: Anchor;
  /** Set when a new widget is being dragged out of the gallery. */
  kind?: WidgetKind;
  sourceContainerId?: string;
  source?: "gallery" | "board";
  /** Where inside the widget it was picked up, so any board can drop its corner where it looks. */
  grab?: { x: number; y: number };
}

export function readWidgetDrag(data: DataTransfer): WidgetDrag | null {
  try {
    const raw = data.getData(DRAG_TYPE);
    if (!raw) return null;
    const value = JSON.parse(raw) as WidgetDrag;
    return typeof value?.id === "string" || typeof value?.kind === "string" ? value : null;
  } catch {
    return null;
  }
}
