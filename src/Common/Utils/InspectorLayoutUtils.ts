import type { InspectorGridItem, InspectorLayoutAction } from "../Types/InspectorTypes";

const rightOf = (item: InspectorGridItem) => item.col + item.span;
const bottomOf = (item: InspectorGridItem) => item.row + item.rows;

const overlap = (a: InspectorGridItem, b: InspectorGridItem) =>
  a.col < rightOf(b) && b.col < rightOf(a) && a.row < bottomOf(b) && b.row < bottomOf(a);

/**
 * Calculates Figma-style alignment and distribution against the selection's own bounding box.
 *
 * Grid coordinates are integral, so centres and equal gaps settle on the nearest track. Validation
 * stays separate: the caller can decline an arrangement that would stack widgets in a board whose
 * layout model does not permit overlap.
 */
export function arrangeInspectorGridItems(
  items: readonly InspectorGridItem[],
  action: InspectorLayoutAction,
): Map<string, InspectorGridItem> {
  const arranged = new Map(items.map((item) => [item.id, { ...item }]));
  if (items.length < 2) return arranged;

  const left = Math.min(...items.map((item) => item.col));
  const top = Math.min(...items.map((item) => item.row));
  const right = Math.max(...items.map(rightOf));
  const bottom = Math.max(...items.map(bottomOf));

  if (action.kind === "align") {
    for (const item of items) {
      const next = arranged.get(item.id)!;
      if (action.alignment === "left") next.col = left;
      if (action.alignment === "horizontalCenter") {
        next.col = Math.max(1, Math.round(left + (right - left - item.span) / 2));
      }
      if (action.alignment === "right") next.col = right - item.span;
      if (action.alignment === "top") next.row = top;
      if (action.alignment === "verticalCenter") {
        next.row = Math.max(1, Math.round(top + (bottom - top - item.rows) / 2));
      }
      if (action.alignment === "bottom") next.row = bottom - item.rows;
    }
    return arranged;
  }

  if (items.length < 3) return arranged;
  const horizontal = action.axis === "horizontal";
  const ordered = [...items].sort((a, b) =>
    horizontal ? a.col - b.col || a.row - b.row : a.row - b.row || a.col - b.col,
  );
  const start = horizontal ? left : top;
  const end = horizontal ? right : bottom;
  const occupied = ordered.reduce((sum, item) => sum + (horizontal ? item.span : item.rows), 0);
  const gap = (end - start - occupied) / (ordered.length - 1);
  let cursor = start;

  for (const item of ordered) {
    const next = arranged.get(item.id)!;
    if (horizontal) next.col = Math.max(1, Math.round(cursor));
    else next.row = Math.max(1, Math.round(cursor));
    cursor += (horizontal ? item.span : item.rows) + gap;
  }

  return arranged;
}

/** Whether a simultaneous arrangement stays inside the board and clear of every other widget. */
export function inspectorGridItemsFit(
  items: readonly InspectorGridItem[],
  obstacles: readonly InspectorGridItem[],
  columns: number,
): boolean {
  if (items.some((item) => item.col < 1 || item.row < 1 || rightOf(item) > columns + 1)) return false;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (obstacles.some((obstacle) => overlap(item, obstacle))) return false;
    for (let other = index + 1; other < items.length; other += 1) {
      if (overlap(item, items[other]!)) return false;
    }
  }

  return true;
}
