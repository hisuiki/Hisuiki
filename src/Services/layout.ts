import type {
  Anchor,
  Flow,
  Placement,
  Scroll,
  AnchoredLayout,
  AnchorBackground,
  BoardSettings,
  PageSettings,
  ProfileLayout,
  Widget,
  WidgetKind,
  WidgetSize,
  WidgetStyle,
} from "../Types";
import { readStyle } from "./widgetStyle";

/**
 * A page is a set of anchors, each holding widgets.
 *
 * There is no chrome any more. The header is not a header because it is a header — it is a container
 * of widgets sitting at the top anchor, and it stops being a header the moment it is moved. The
 * footer is the same container at the bottom. What makes something "the header" is only where it is
 * anchored, which is why the anchors are the one fixed vocabulary here: everything else about a page
 * is arrangeable, so the positions have to be nameable.
 *
 * Within an anchor the model is a phone home screen's: order, plus a size, plus — for a container —
 * the direction its children run. Deliberately not coordinates. Coordinates would let someone
 * compose something exact on a desktop that a narrow screen must then scale down illegibly or
 * scramble; order and flow reflow on their own.
 */

export const LAYOUT_VERSION = 4;

export const ANCHORS: Anchor[] = ["top", "left", "center", "right", "bottom"];

export const ANCHOR_LABELS: Record<Anchor, { en: string; ja: string }> = {
  top: { en: "Top", ja: "上" },
  left: { en: "Left", ja: "左" },
  center: { en: "Centre", ja: "中央" },
  right: { en: "Right", ja: "右" },
  bottom: { en: "Bottom", ja: "下" },
};

/** Columns on the widest grid layout. Narrower screens collapse this in CSS, not here. */
export const GRID_COLUMNS = 4;

/**
 * The height of one row in a free layout, in pixels.
 *
 * A free board needs a cell with two known dimensions or there is nothing to snap to: columns come
 * from the board's own width, rows have to be stated. Fixed rather than derived so that a widget
 * placed on a wide screen keeps its proportions on a narrow one — the columns reflow, the rows do
 * not stretch to fill.
 */
export const FREE_ROW_HEIGHT = 72;

/**
 * Where a widget sits on a free board.
 *
 * Columns and rows are 1-based, matching CSS grid lines, and spans are in cells. This is the one
 * place the model holds anything like a coordinate, and it is still not a pixel: a free board
 * reflows its columns like any other, so a layout composed on a desktop narrows rather than
 * scrambling or scaling down illegibly.
 */

const int = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === "number" ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

/** Read back through a clamp: these come from a stored document that can be written by hand. */
export function placementOf(item: Widget): Placement {
  const props = item.props ?? {};
  const w = int(props.w, 1, GRID_COLUMNS, SIZE_SPAN[item.size]);
  const col = int(props.col, 1, GRID_COLUMNS - w + 1, 1);
  return { col, row: int(props.row, 1, 500, 1), w, h: int(props.h, 1, 40, 1) };
}

/** A widget moved or resized on a free board, with the placement folded back into its props. */
export const withPlacement = (item: Widget, place: Placement): Widget => ({
  ...item,
  props: { ...item.props, ...place },
});

/** How many columns each size occupies at full width. */
export const SIZE_SPAN: Record<WidgetSize, number> = {
  small: 1,
  medium: 2,
  large: 4,
};

export const SIZES: WidgetSize[] = ["small", "medium", "large"];

export const FLOWS: Flow[] = ["row", "wrap", "column", "grid", "free", "anchors"];

interface WidgetSpec {
  label: { en: string; ja: string };
  /** One line for the gallery, shown only when the live preview has nothing to show. */
  description: { en: string; ja: string };
  /**
   * Whether removing one should ask first. Any widget can be added again from the gallery, so this
   * is not about permanence — it is about how much is thrown away. A text widget holds a few words
   * you can retype; a timeline, or a container with a page's worth of things inside it, is
   * structure, and losing that to a misplaced click is worth one question.
   */
  confirmRemove: boolean;
  defaultSize: WidgetSize;
  /** Sizes that make sense — a timeline at one column is unreadable. */
  sizes: WidgetSize[];
  /** Containers hold other widgets; everything else is a leaf. */
  container?: boolean;
  /**
   * The room this widget's preview needs to say anything. A gallery tile smaller than this shows an
   * icon instead — a cropped corner of a widget teaches less than a symbol for it.
   */
  minPreview?: { w: number; h: number };
}

export const WIDGETS: Record<WidgetKind, WidgetSpec> = {
  container: {
    label: { en: "Container", ja: "コンテナ" },
    description: {
      en: "Holds other widgets, in a row, a column or a grid.",
      ja: "他のウィジェットを行・列・グリッドで並べます。",
    },
    confirmRemove: true,
    defaultSize: "large",
    sizes: ["small", "medium", "large"],
    container: true,
  },
  content: {
    label: { en: "Page content", ja: "ページの内容" },
    description: {
      en: "Whatever the current page shows — the feed, a profile, settings.",
      ja: "現在のページの内容（フィード、プロフィール、設定など）。",
  },
    minPreview: { w: 240, h: 140 },
    confirmRemove: true,
    defaultSize: "large",
    sizes: ["large"],
  },
  title: {
    label: { en: "Title", ja: "タイトル" },
    description: {
      en: "A word that goes somewhere: one of the app's pages, a path, or a link of your own.",
      ja: "どこかへ移動する見出し。アプリ内のページ、パス、または自分のリンク。",
    },
    confirmRemove: false,
    defaultSize: "small",
    sizes: ["small"],
  },
  account: {
    label: { en: "Account", ja: "アカウント" },
    description: { en: "Your avatar, and the menu behind it.", ja: "アバターとメニュー。" },
    confirmRemove: true,
    defaultSize: "small",
    sizes: ["small"],
  },
  brand: {
    label: { en: "Brand", ja: "ブランド" },
    description: { en: "The NukaWorks mark.", ja: "NukaWorks のロゴ。" },
    minPreview: { w: 170, h: 60 },
    confirmRemove: true,
    defaultSize: "small",
    sizes: ["small", "medium"],
  },
  colophon: {
    label: { en: "Colophon", ja: "奥付" },
    description: {
      en: "Copyright, build number and the About link.",
      ja: "著作権表示、ビルド番号、About へのリンク。",
  },
    minPreview: { w: 230, h: 90 },
    confirmRemove: true,
    defaultSize: "medium",
    sizes: ["small", "medium", "large"],
  },
  identity: {
    label: { en: "Name and avatar", ja: "名前とアバター" },
    description: { en: "Your avatar, name, handle and headline.", ja: "アバター、名前、ハンドル、見出し。" },
    minPreview: { w: 250, h: 130 },
    confirmRemove: true,
    defaultSize: "large",
    sizes: ["medium", "large"],
  },
  links: {
    label: { en: "Links", ja: "リンク集" },
    description: { en: "The links you list on your profile.", ja: "プロフィールに並べるリンク。" },
    confirmRemove: true,
    defaultSize: "medium",
    sizes: ["small", "medium", "large"],
  },
  bio: {
    label: { en: "Bio (README)", ja: "自己紹介 (README)" },
    description: { en: "Your README post, shown as the bio.", ja: "READMEの投稿を自己紹介として表示。" },
    confirmRemove: true,
    defaultSize: "large",
    sizes: ["medium", "large"],
  },
  heatmap: {
    label: { en: "Activity", ja: "アクティビティ" },
    description: { en: "A year of your posting activity.", ja: "1年間の投稿アクティビティ。" },
    minPreview: { w: 320, h: 130 },
    confirmRemove: true,
    // The grid is 53 columns wide; anything narrower than full width just scrolls awkwardly.
    defaultSize: "large",
    sizes: ["large"],
  },
  timeline: {
    label: { en: "Posts and media", ja: "投稿とメディア" },
    description: { en: "Everything you have posted, in tabs.", ja: "投稿とメディアをタブで表示。" },
    minPreview: { w: 260, h: 190 },
    confirmRemove: true,
    defaultSize: "large",
    sizes: ["large"],
  },
  spacer: {
    label: { en: "Spacer", ja: "スペーサー" },
    description: {
      en: "Empty room, to push things apart or hold a gap open.",
      ja: "余白。要素を離したり、間を空けたりします。",
    },
    confirmRemove: false,
    defaultSize: "small",
    sizes: ["small", "medium", "large"],
  },
  webamp: {
    label: { en: "Winamp", ja: "Winamp" },
    description: {
      en: "A working Winamp, by way of Webamp. Drop in a file, or point it at one.",
      ja: "Webamp による Winamp。ファイルをドロップするか、URL を指定します。",
  },
    minPreview: { w: 275, h: 116 },
    confirmRemove: true,
    // The main window is a fixed 275px wide, so anything under two columns crops it.
    defaultSize: "medium",
    sizes: ["medium", "large"],
  },
  text: {
    label: { en: "Text", ja: "テキスト" },
    description: { en: "A heading and some words of your own.", ja: "自分で書く見出しと本文。" },
    confirmRemove: false,
    defaultSize: "medium",
    sizes: ["small", "medium", "large"],
  },
};

/**
 * Whether a container scrolls, and along which axis.
 *
 * Off by default, and deliberately opt-in: overflow is what clips, and the page is full of things
 * that reach outside their own widget's box — corner badges, dropdowns, the edit-mode dance. Worth
 * knowing before choosing one axis: CSS does not allow scrolling one axis while the other stays
 * visible, so "inline" also clips vertically and "block" also clips horizontally. Only "none" leaves
 * a container's overflow alone.
 */

export const SCROLLS: Scroll[] = ["none", "inline", "block", "both"];

/** How a container scrolls, defaulting to not at all. */
export const scrollOf = (item: Widget): Scroll => {
  const stored = item.props?.scroll;
  return typeof stored === "string" && (SCROLLS as string[]).includes(stored)
    ? (stored as Scroll)
    : "none";
};

/** Columns a grid container uses, and the cell height a free one snaps to. */
export const columnsOf = (item: Widget): number => {
  const stored = item.props?.columns;
  const n = typeof stored === "number" ? Math.round(stored) : GRID_COLUMNS;
  return Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : GRID_COLUMNS;
};

export const rowHeightOf = (item: Widget): number => {
  const stored = item.props?.rowHeight;
  const n = typeof stored === "number" ? Math.round(stored) : FREE_ROW_HEIGHT;
  return Number.isFinite(n) ? Math.min(240, Math.max(24, n)) : FREE_ROW_HEIGHT;
};

/**
 * Whether the side slots run the full height of an anchors board.
 *
 * "inset" puts top and bottom across the whole width with the rails between them; "full" gives the
 * rails the full height instead, and top and bottom sit in the column between.
 */
export const SIDES = ["inset", "full"] as const;
export type Sides = (typeof SIDES)[number];

export const sidesOf = (item: Widget): Sides =>
  item.props?.sides === "full" ? "full" : "inset";

/** The space between a container's children, in pixels. */
export const gapOf = (item: Widget): number => {
  const stored = item.props?.gap;
  const n = typeof stored === "number" ? Math.round(stored) : 12;
  return Number.isFinite(n) ? Math.min(48, Math.max(0, n)) : 12;
};

/** Which slot a child sits in, for a container laying out in anchors. */
export const slotOf = (item: Widget): Anchor => {
  const stored = item.props?.anchor;
  return isAnchor(stored) ? stored : "center";
};

/** The flow a container lays its children out with, defaulting to a row. */
export const flowOf = (item: Widget): Flow => {
  const stored = item.props?.flow;
  return typeof stored === "string" && (FLOWS as string[]).includes(stored) ? (stored as Flow) : "row";
};

export const isContainer = (item: Widget): boolean => WIDGETS[item.kind].container === true;

/**
 * A fresh id.
 *
 * Every widget gets one, including the structural kinds: a page may hold as many timelines, text
 * panels or containers as its owner wants, so identity cannot come from the kind.
 */
export const newId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const makeWidget = (kind: WidgetKind, extra: Partial<Widget> = {}): Widget => ({
  id: newId(),
  kind,
  size: WIDGETS[kind].defaultSize,
  // A container's flow lives in props, which is where flowOf and readWidget both look for it.
  props: WIDGETS[kind].container ? { flow: "row" } : {},
  ...(WIDGETS[kind].container ? { children: [] } : {}),
  ...extra,
});

const make = makeWidget;

/**
 * The page as it comes: a bar at the top, the profile down the middle, a colophon at the bottom.
 * None of it is privileged — every part is a widget somebody can move, duplicate or delete.
 */
export function defaultAnchors(): AnchoredLayout {
  return {
    top: [
      make("container", {
        size: "large",
        props: { flow: "row", anchor: "top" },
        children: [
          make("title", { props: { action: "route", route: "home" } }),
          make("title", { props: { action: "route", route: "explore" } }),
          make("title", { props: { action: "route", route: "media" } }),
          make("account", { props: { push: true } }),
        ],
      }),
    ],
    left: [],
    center: [
      make("container", {
        size: "large",
        props: { flow: "grid", anchor: "center", columns: 4 },
        children: [
          make("content", { size: "large" }),
          make("identity", { size: "large" }),
          make("links", { size: "medium" }),
          make("bio", { size: "large" }),
          make("heatmap", { size: "large" }),
          make("timeline", { size: "large" }),
        ],
      }),
    ],
    right: [],
    bottom: [
      make("container", {
        size: "large",
        props: { flow: "row", anchor: "bottom" },
        children: [make("brand"), make("colophon", { props: { push: true } })],
      }),
    ],
  };
}

/** The page: one container, laid out in anchor slots, holding everything. */
export function defaultRoot(): Widget {
  const anchors = defaultAnchors();
  return make("container", {
    size: "large",
    props: { flow: "anchors" },
    slots: { top: { shadow: "soft" }, bottom: { shadow: "soft" } },
    children: ANCHORS.flatMap((anchor) => anchors[anchor]),
  });
}

const isKind = (value: unknown): value is WidgetKind =>
  typeof value === "string" && value in WIDGETS;

export const isAnchor = (value: unknown): value is Anchor =>
  typeof value === "string" && (ANCHORS as string[]).includes(value);

/** Deep enough for a bar inside a column inside a page; shallow enough that nothing runs away. */
const MAX_DEPTH = 4;

/**
 * Reads one stored widget, and whatever is inside it, into something safe to render.
 *
 * The document is untrusted: it may predate a change to this file, or have been edited by hand.
 * Unknown kinds are dropped, sizes are clamped to what the widget supports, and repeated ids are
 * collapsed — two widgets sharing an id cannot be told apart by a drag or a delete. Nesting is
 * bounded, because a container that contained itself would recurse until the stack gave out.
 */
function readWidget(raw: unknown, seen: Set<string>, depth: number): Widget | null {
  if (!raw || typeof raw !== "object") return null;

  const value = migrateKind(raw as Record<string, unknown>);
  if (typeof value.id !== "string" || !isKind(value.kind)) return null;
  if (seen.has(value.id)) return null;
  seen.add(value.id);

  const spec = WIDGETS[value.kind];
  const result: Widget = {
    id: value.id,
    kind: value.kind,
    size: value.size && spec.sizes.includes(value.size) ? value.size : spec.defaultSize,
    props: value.props,
    style: readStyle(value.style),
  };

  // Anything not read back here is dropped on the next load, so per-slot styling has to be picked
  // up explicitly — and through the same clamp as any other stored style.
  const slots = readSlots(value.slots);
  if (slots) result.slots = slots;

  if (spec.container) {
    const children = Array.isArray(value.children) && depth < MAX_DEPTH ? value.children : [];
    result.children = children
      .map((child) => readWidget(child, seen, depth + 1))
      .filter((child): child is Widget => child !== null);
  }

  return result;
}

/** "nav" and "link" were the same widget under two names; both become a title. */
function migrateKind(raw: Record<string, unknown>): Partial<Widget> {
  const value = raw as Partial<Widget> & { kind?: string };
  if ((value.kind as string) === "nav") {
    return {
      ...value,
      kind: "title",
      props: { ...value.props, action: "route", route: String(value.props?.target ?? "home") },
    };
  }

  if ((value.kind as string) === "link") {
    return { ...value, kind: "title", props: { ...value.props, action: "external" } };
  }

  return value as Partial<Widget>;
}

/** Per-slot styling, keyed by anchor and clamped like any other style. */
function readSlots(raw: unknown): Partial<Record<Anchor, WidgetStyle>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const source = raw as Record<string, unknown>;
  const slots: Partial<Record<Anchor, WidgetStyle>> = {};
  let any = false;

  for (const anchor of ANCHORS) {
    const style = readStyle(source[anchor]);
    if (style) {
      slots[anchor] = style;
      any = true;
    }
  }

  return any ? slots : undefined;
}

const readList = (raw: unknown, seen: Set<string>): Widget[] =>
  (Array.isArray(raw) ? raw : [])
    .map((item) => readWidget(item, seen, 0))
    .filter((item): item is Widget => item !== null);

/**
 * Reads a stored layout into the five anchors.
 *
 * A stored layout is authoritative — whatever it says is the whole page. The default is used only
 * where nothing is stored at all, which means a page nobody has arranged yet. An empty list is a
 * different thing entirely: it is an anchor someone has emptied, and refilling it would be undoing
 * their work rather than helping.
 */
export function readLayout(layout: ProfileLayout | null | undefined): Widget {
  const root = layout?.root ? readWidget(layout.root, new Set<string>(), 0) : null;
  if (root && isContainer(root)) return root;

  return rootFromAnchors(readAnchors(layout));
}

/** The five-list shape, for documents written before the page became one container. */
function readAnchors(layout: ProfileLayout | null | undefined): AnchoredLayout {
  const stored = layout?.anchors;

  if (stored && typeof stored === "object") {
    const seen = new Set<string>();
    const source = stored as Record<string, unknown>;
    const result = {} as AnchoredLayout;
    for (const anchor of ANCHORS) result[anchor] = readList(source[anchor], seen);
    return result;
  }

  return migrate(layout);
}

/**
 * Folds five boards into one.
 *
 * An anchor holding a single container already is that slot's container, so it is tagged and kept
 * rather than wrapped in a second one. Anything else is wrapped, which is what gives the slot
 * something to style.
 */
function rootFromAnchors(anchors: AnchoredLayout): Widget {
  const children: Widget[] = [];

  for (const anchor of ANCHORS) {
    const widgets = anchors[anchor] ?? [];
    if (widgets.length === 0) continue;

    const only = widgets.length === 1 ? widgets[0] : undefined;
    if (only && isContainer(only)) {
      children.push({ ...only, props: { ...only.props, anchor } });
      continue;
    }

    if (only) {
      children.push({ ...only, props: { ...only.props, anchor } });
      continue;
    }

    children.push(
      make("container", {
        size: "large",
        props: { flow: anchor === "center" ? "grid" : "column", anchor },
        children: widgets,
      }),
    );
  }

  return make("container", {
    size: "large",
    props: { flow: "anchors" },
    slots: { top: { shadow: "soft" }, bottom: { shadow: "soft" } },
    children,
  });
}

/**
 * Brings a layout written before anchors existed forward.
 *
 * The old document had a flat `widgets` list, which was the page's body, and a `header` list of ids
 * naming what the strip showed. Both become anchors holding the same things in the same order, so a
 * profile that was arranged once keeps its arrangement rather than being reset to the default for
 * the crime of predating this file.
 */
function migrate(layout: ProfileLayout | null | undefined): AnchoredLayout {
  const anchors = defaultAnchors();
  if (!layout) return anchors;

  if (Array.isArray(layout.widgets)) {
    anchors.center = readList(layout.widgets, new Set<string>());
  }

  const header = layout.header;
  if (!Array.isArray(header) || header.length === 0) return anchors;

  const links = Array.isArray(layout.headerLinks) ? layout.headerLinks : [];
  const children: Widget[] = [];

  for (const entry of header) {
    const id = typeof entry?.id === "string" ? entry.id : null;
    if (!id) continue;

    if (id === "avatar") {
      children.push(make("account", { props: { push: true } }));
    } else if (id.startsWith("nav:")) {
      children.push(make("title", { props: { action: "route", route: id.slice(4) } }));
    } else if (id.startsWith("link:")) {
      // The old id joined the href and the label with a space. Matching it against the stored links
      // finds the one it named without having to trust the id's own text.
      const match = links.find((link) => `link:${link.href} ${link.label}` === id);
      if (match) {
        children.push(
          make("title", { props: { action: "external", href: match.href, label: match.label } }),
        );
      }
    }
  }

  if (children.length > 0) {
    anchors.top = [make("container", { size: "large", props: { flow: "row" }, children })];
  }

  return anchors;
}

/** The flow each anchor uses when nothing has been chosen: what that position is usually for. */
export const DEFAULT_BOARD_FLOW: Record<Anchor, Flow> = {
  top: "column",
  left: "column",
  center: "grid",
  right: "column",
  bottom: "column",
};

/** The side rails are off until somebody wants them; the other three are the page. */
const DEFAULT_ENABLED: Record<Anchor, boolean> = {
  top: true,
  left: false,
  center: true,
  right: false,
  bottom: true,
};

/** Top and bottom carry a shadow so thin chrome stays readable over any wallpaper. */
const DEFAULT_BACKGROUND: Record<Anchor, AnchorBackground> = {
  top: "shadow",
  left: "none",
  center: "none",
  right: "none",
  bottom: "shadow",
};

export const BACKGROUNDS: AnchorBackground[] = ["none", "shadow", "blur", "solid"];

/** Read back through the same clamp as everything else: this comes from a stored document. */
export function readBoards(raw: unknown): Record<Anchor, BoardSettings> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const boards = {} as Record<Anchor, BoardSettings>;

  for (const anchor of ANCHORS) {
    const stored = source[anchor];
    const value = stored && typeof stored === "object" ? (stored as BoardSettings) : {};
    const intensity = typeof value.intensity === "number" && Number.isFinite(value.intensity)
      ? Math.min(1, Math.max(0, value.intensity))
      : 0.55;

    boards[anchor] = {
      flow: (FLOWS as string[]).includes(String(value.flow))
        ? (value.flow as Flow)
        : DEFAULT_BOARD_FLOW[anchor],
      scroll: (SCROLLS as string[]).includes(String(value.scroll)) ? (value.scroll as Scroll) : "none",
      enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_ENABLED[anchor],
      background: (BACKGROUNDS as string[]).includes(String(value.background))
        ? (value.background as AnchorBackground)
        : DEFAULT_BACKGROUND[anchor],
      intensity,
      color: typeof value.color === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.color)
        ? value.color
        : undefined,
    };
  }

  return boards;
}

/** Extracts a widget by id from a tree of widgets, returning the widget and the modified tree. */
export function extractWidget(
  widgets: Widget[],
  id: string,
): { widget: Widget; remaining: Widget[] } | null {
  for (let i = 0; i < widgets.length; i++) {
    const item = widgets[i]!;
    if (item.id === id) {
      return {
        widget: item,
        remaining: [...widgets.slice(0, i), ...widgets.slice(i + 1)],
      };
    }
    if (item.children && item.children.length > 0) {
      const found = extractWidget(item.children, id);
      if (found) {
        const nextItem = { ...item, children: found.remaining };
        return {
          widget: found.widget,
          remaining: [...widgets.slice(0, i), nextItem, ...widgets.slice(i + 1)],
        };
      }
    }
  }
  return null;
}

/** Whether a container already holds this child, anywhere in the layout. */
export function containsChild(
  layout: AnchoredLayout,
  containerId: string,
  childId: string,
): boolean {
  const search = (widgets: Widget[]): boolean =>
    widgets.some((item) => {
      if (item.id === containerId) return (item.children ?? []).some((c) => c.id === childId);
      return item.children ? search(item.children) : false;
    });

  return ANCHORS.some((anchor) => search(layout[anchor] ?? []));
}

/** Moves a widget from one anchor's list to the end of another's. */
export function moveToAnchor(
  layout: AnchoredLayout,
  id: string,
  from: Anchor,
  to: Anchor,
): AnchoredLayout {
  if (from === to) return layout;

  let extracted = extractWidget(layout[from] ?? [], id);
  let sourceAnchor = from;

  if (!extracted) {
    for (const a of ANCHORS) {
      if (a === to) continue;
      const res = extractWidget(layout[a] ?? [], id);
      if (res) {
        extracted = res;
        sourceAnchor = a;
        break;
      }
    }
  }

  if (!extracted) return layout;

  return {
    ...layout,
    [sourceAnchor]: extracted.remaining,
    [to]: [...(layout[to] ?? []), extracted.widget],
  };
}

/** Inserts a widget into a container's children list. */
export function insertIntoContainer(
  widgets: Widget[],
  targetContainerId: string,
  widgetToInsert: Widget,
): { widgets: Widget[]; inserted: boolean } {
  for (let i = 0; i < widgets.length; i++) {
    const item = widgets[i]!;
    if (item.id === targetContainerId && isContainer(item)) {
      const existing = item.children ?? [];
      const nextChildren = existing.some((w) => w.id === widgetToInsert.id)
        ? existing
        : [...existing, widgetToInsert];
      const nextItem = { ...item, children: nextChildren };
      return {
        widgets: [...widgets.slice(0, i), nextItem, ...widgets.slice(i + 1)],
        inserted: true,
      };
    }
    if (item.children && item.children.length > 0) {
      const sub = insertIntoContainer(item.children, targetContainerId, widgetToInsert);
      if (sub.inserted) {
        const nextItem = { ...item, children: sub.widgets };
        return {
          widgets: [...widgets.slice(0, i), nextItem, ...widgets.slice(i + 1)],
          inserted: true,
        };
      }
    }
  }
  return { widgets, inserted: false };
}

/** Moves a widget from wherever it is in the layout tree into a target container. */
export function moveToContainer(
  layout: AnchoredLayout,
  widgetId: string,
  targetContainerId: string,
): AnchoredLayout {
  if (widgetId === targetContainerId) return layout;

  let extractedWidget: Widget | null = null;
  const layoutWithoutWidget = {} as AnchoredLayout;

  for (const a of ANCHORS) {
    const res = extractWidget(layout[a] ?? [], widgetId);
    if (res) {
      extractedWidget = res.widget;
      layoutWithoutWidget[a] = res.remaining;
    } else {
      layoutWithoutWidget[a] = layout[a] ?? [];
    }
  }

  if (!extractedWidget) return layout;

  const result = {} as AnchoredLayout;
  for (const a of ANCHORS) {
    const res = insertIntoContainer(layoutWithoutWidget[a] ?? [], targetContainerId, extractedWidget);
    result[a] = res.widgets;
  }
  return result;
}

/* --- The same tree operations, against the single root. --- */

const asRoot = (root: Widget, children: Widget[]): Widget => ({ ...root, children });

export const removeFromTree = (root: Widget, id: string): Widget => {
  const found = extractWidget(root.children ?? [], id);
  return found ? asRoot(root, found.remaining) : root;
};

export function moveIntoContainer(root: Widget, id: string, containerId: string): Widget {
  if (id === containerId || id === root.id) return root;

  const found = extractWidget(root.children ?? [], id);
  if (!found) return root;

  // The root is a container too, so dropping onto it appends rather than nesting.
  if (containerId === root.id) return asRoot(root, [...found.remaining, found.widget]);

  const inserted = insertIntoContainer(found.remaining, containerId, found.widget);
  return inserted.inserted ? asRoot(root, inserted.widgets) : root;
}

export function insertInTree(root: Widget, containerId: string, widget: Widget): Widget {
  if (containerId === root.id) {
    const children = root.children ?? [];
    return children.some((w) => w.id === widget.id) ? root : asRoot(root, [...children, widget]);
  }

  const inserted = insertIntoContainer(root.children ?? [], containerId, widget);
  return inserted.inserted ? asRoot(root, inserted.widgets) : root;
}

/** Whether the tree already holds this widget inside that container. */
export function treeHasChild(root: Widget, containerId: string, childId: string): boolean {
  if (containerId === root.id) return (root.children ?? []).some((w) => w.id === childId);

  const search = (widgets: Widget[]): boolean =>
    widgets.some((item) =>
      item.id === containerId
        ? (item.children ?? []).some((c) => c.id === childId)
        : item.children
          ? search(item.children)
          : false,
    );

  return search(root.children ?? []);
}

/** Replaces one widget anywhere in the tree, the root included. */
export function updateInTree(root: Widget, id: string, change: (item: Widget) => Widget): Widget {
  if (root.id === id) return change(root);
  return asRoot(root, updateWidget(root.children ?? [], id, change));
}

/** Where the wallpaper comes from, defaulting to the picture of the day. */
export function readPage(raw: unknown): PageSettings {
  const source = raw && typeof raw === "object" ? (raw as PageSettings) : {};
  const wallpaper = source.wallpaper;

  if (!wallpaper || typeof wallpaper !== "object") return { wallpaper: { source: "bing" } };

  const kind = wallpaper.source;
  if (kind !== "url" && kind !== "media") return { wallpaper: { source: "bing" } };

  // Only http(s), and only a URL that parses: this ends up as an image source on the page.
  const url = typeof wallpaper.url === "string" ? wallpaper.url.trim() : "";
  if (!url) return { wallpaper: { source: "bing" } };

  try {
    const parsed = new URL(url, "https://example.invalid");
    const relative = url.startsWith("/");
    if (!relative && parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { wallpaper: { source: "bing" } };
    }
  } catch {
    return { wallpaper: { source: "bing" } };
  }

  return { wallpaper: { source: kind, url } };
}

export const writeLayout = (root: Widget, page?: PageSettings): ProfileLayout => ({
  version: LAYOUT_VERSION,
  root,
  page,
});

/** Moves a widget to another position within one list, returning a new array. */
export function moveWidget(widgets: Widget[], from: number, to: number): Widget[] {
  if (from === to || from < 0 || to < 0 || from >= widgets.length || to >= widgets.length) {
    return widgets;
  }

  const next = [...widgets];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

/** Takes a widget off the list. It can always be added again from the gallery. */
export const removeWidget = (widgets: Widget[], id: string): Widget[] =>
  widgets.filter((item) => item.id !== id);

/** A copy sharing nothing with the original: typing into one must never change the other. */
function copyWidget(source: Widget): Widget {
  return {
    id: newId(),
    kind: source.kind,
    size: source.size,
    props: source.props ? { ...source.props } : undefined,
    style: source.style ? { ...source.style } : undefined,
    slots: source.slots ? { ...source.slots } : undefined,
    children: source.children?.map(copyWidget),
  };
}

/** Copies a widget, its size, its settings and everything inside it, beside the original. */
export function duplicateWidget(widgets: Widget[], id: string): Widget[] {
  const index = widgets.findIndex((item) => item.id === id);
  if (index === -1) return widgets;

  const next = [...widgets];
  next.splice(index + 1, 0, copyWidget(widgets[index]!));
  return next;
}

/** Puts a widget at the end of a list, where it can be seen and then moved. */
export function addWidget(widgets: Widget[], kind: WidgetKind): Widget[] {
  const created = make(kind, { props: {} });
  if (WIDGETS[kind].container) {
    created.props = { flow: "row" };
    created.children = [];
  }
  return [...widgets, created];
}

/**
 * Puts a group of widgets inside a new container, where the first of them was.
 *
 * The container takes the position of the earliest widget in the selection, and they go into it in
 * the order they had on the board rather than the order they happened to be selected in — a
 * selection is a set, and reading an order into it would rearrange the page as a side effect of
 * picking things.
 */
export function wrapWidgets(widgets: Widget[], ids: Set<string>, flow: Flow): Widget[] {
  const chosen = widgets.filter((item) => ids.has(item.id));
  if (chosen.length === 0) return widgets;

  const at = widgets.findIndex((item) => ids.has(item.id));
  const rest = widgets.filter((item) => !ids.has(item.id));

  const container = make("container", {
    size: "large",
    props: { flow },
    // A free layout inside a container it was just wrapped into would place everything at cell 1,1
    // on top of each other, so the placement each widget had on the board outside is dropped.
    children: flow === "free" ? chosen.map(atOrigin) : chosen,
  });

  return [...rest.slice(0, at), container, ...rest.slice(at)];
}

/** Strips a free-board placement, for a widget moving into a container that has its own. */
function atOrigin(item: Widget): Widget {
  if (!item.props) return item;
  const { col: _col, row: _row, ...props } = item.props;
  return { ...item, props };
}

/** Replaces one widget wherever it is, however deeply nested. */
export function updateWidget(
  widgets: Widget[],
  id: string,
  change: (item: Widget) => Widget,
): Widget[] {
  return widgets.map((item) => {
    if (item.id === id) return change(item);
    if (!item.children) return item;
    return { ...item, children: updateWidget(item.children, id, change) };
  });
}

/** The next size in the widget's own list, wrapping — what tapping a resize control does. */
export function cycleSize(item: Widget): WidgetSize {
  const sizes = WIDGETS[item.kind].sizes;
  const index = sizes.indexOf(item.size);
  return sizes[(index + 1) % sizes.length] ?? item.size;
}

/**
 * The size closest to a given number of grid columns, among those this widget allows.
 *
 * Dragging a corner produces a column count; the model only knows three sizes. Rather than refusing
 * the widths in between, the nearest allowed size wins — so a widget that only comes in full width
 * snaps back to it instead of sticking at whatever the pointer last measured.
 *
 * An exact tie goes to the smaller, which is why the comparison is strict. Three columns is equally
 * far from two and from four, and growing only once the pointer is properly past the midpoint is the
 * same rule dragging uses to decide when two widgets swap.
 */
export function sizeForSpan(kind: WidgetKind, span: number): WidgetSize {
  const allowed = WIDGETS[kind].sizes;
  let best = allowed[0] ?? WIDGETS[kind].defaultSize;

  for (const size of allowed) {
    if (Math.abs(SIZE_SPAN[size] - span) < Math.abs(SIZE_SPAN[best] - span)) best = size;
  }

  return best;
}

/** The next flow in the list, wrapping — what tapping a container's layout control does. */
export function cycleFlow(item: Widget): Flow {
  const index = FLOWS.indexOf(flowOf(item));
  return FLOWS[(index + 1) % FLOWS.length] ?? "row";
}

/** What the gallery offers: everything there is. */
export const galleryKinds = (): WidgetKind[] => Object.keys(WIDGETS) as WidgetKind[];
