import type { GridCell, GridMetrics } from "../Types/TypeRegistry";
import { ROW_HEIGHT } from "./LayoutUtils";

/**
 * The board's grid as the browser actually resolved it.
 *
 * Arithmetic from the column count and a gap in pixels was always slightly wrong: the gap is
 * authored in em, rows are minmax() so they grow with their contents, and under 900px the media
 * query collapses the board to two columns or one. Reading the used track sizes is the only way a
 * preview can land on the same lines the widgets do.
 */
export function gridMetrics(board: HTMLElement): GridMetrics {
  const style = getComputedStyle(board);

  return {
    columns: tracks(style.gridTemplateColumns),
    rows: tracks(style.gridTemplateRows),
    columnGap: px(style.columnGap),
    rowGap: px(style.rowGap),
    /** Board-relative coordinates are measured from the padding box, and the board can scroll. */
    originX: board.getBoundingClientRect().left + px(style.borderLeftWidth) - board.scrollLeft,
    originY: board.getBoundingClientRect().top + px(style.borderTopWidth) - board.scrollTop,
  };
}

const px = (value: string) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const tracks = (value: string) =>
  value === "none" || value === "" ? [] : value.split(" ").map(px).filter((n) => n > 0);

/** Where a track's leading edge sits, extrapolating past the last one with `fallback`. */
export function trackStart(list: number[], gap: number, index: number, fallback: number): number {
  let offset = 0;
  for (let i = 0; i < index; i += 1) offset += (list[i] ?? fallback) + gap;
  return offset;
}

/** How wide `count` tracks are from `index`, gaps included. */
export function trackSize(
  list: number[],
  gap: number,
  index: number,
  count: number,
  fallback: number,
): number {
  let size = 0;
  for (let i = 0; i < count; i += 1) size += list[index + i] ?? fallback;
  return size + gap * Math.max(0, count - 1);
}

/** Which track an offset falls in. A point in a gap belongs to the track before it. */
export function trackAt(list: number[], gap: number, offset: number, fallback: number): number {
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    start += (list[i] ?? fallback) + gap;
    if (offset < start) return i;
  }

  const step = fallback + gap;
  return step > 0 ? list.length + Math.floor((offset - start) / step) : list.length;
}

/** How many tracks from `index` come closest to covering `size` pixels. */
export function tracksForSize(
  list: number[],
  gap: number,
  index: number,
  size: number,
  fallback: number,
  max: number,
): number {
  let end = 0;
  let best = 1;
  let closest = Infinity;

  for (let count = 1; count <= max; count += 1) {
    end += (list[index + count - 1] ?? fallback) + (count === 1 ? 0 : gap);
    const delta = Math.abs(end - size);
    if (delta < closest) {
      closest = delta;
      best = count;
    } else if (end > size) break;
  }

  return best;
}

/** The 1-based cell a point lands on, clamped so a widget of `span` columns stays on the board. */
export function cellFromPoint(
  metrics: GridMetrics,
  x: number,
  y: number,
  span: number,
): GridCell {
  const total = Math.max(1, metrics.columns.length);
  const col = trackAt(metrics.columns, metrics.columnGap, x - metrics.originX, 0) + 1;
  const row = trackAt(metrics.rows, metrics.rowGap, y - metrics.originY, ROW_HEIGHT) + 1;

  return {
    col: Math.min(Math.max(1, col), Math.max(1, total - span + 1)),
    // One past the last row, so something dragged below everything starts a new one.
    row: Math.min(Math.max(1, row), metrics.rows.length + 1),
  };
}

/**
 * Where the board's own lines fall, in board-relative pixels.
 *
 * Measured tracks rather than `100% / columns`: with a gap the tracks are not evenly spaced, and
 * rows are minmax() so any of them can be taller than the rest. A grid you aim at that does not line
 * up with the one you land on is worse than no grid. Each line sits in the middle of a gap.
 */
export function gridLines(metrics: GridMetrics, extraRows = 8): { x: number[]; y: number[] } {
  const line = (list: number[], gap: number) => {
    const offsets: number[] = [];
    let at = 0;

    for (const size of list.slice(0, -1)) {
      at += size;
      offsets.push(Math.round(at + gap / 2));
      at += gap;
    }

    return offsets;
  };

  // A few rows past the last one: a widget can be pulled taller than the board currently is, and
  // the lines should reach wherever it is being pulled to.
  const rows = [...metrics.rows, ...Array.from({ length: extraRows }, () => ROW_HEIGHT)];

  return { x: line(metrics.columns, metrics.columnGap), y: line(rows, metrics.rowGap) };
}
