import type { ReactNode } from "react";
import type { ProfileData } from "./ProfileTypes";
import type { HeaderLink, PostSummary } from "./ContentTypes";

export type WidgetKind =
  | "container"
  | "content"
  | "boards"
  | "title"
  | "account"
  | "brand"
  | "colophon"
  | "identity"
  | "links"
  | "bio"
  | "heatmap"
  | "timeline"
  | "text"
  | "spacer"
  | "webamp";

export type WidgetSize = "small" | "medium" | "large";

/** The five page positions. The only fixed vocabulary in an otherwise arrangeable page. */
export type Anchor = "top" | "left" | "center" | "right" | "bottom";

/**
 * How a board arranges what is in it.
 *
 * Most boards are grids. A row is retained for compact Metro chrome and can opt into inline
 * scrolling when its contents are deliberately wider than the viewport.
 */
export type Flow = "row" | "column" | "grid";

/** Whether a widget follows the shared website chrome or belongs only to one system page. */
export type PageInheritance = "site" | "page";

/** Whether a board scrolls, and along which axis. */
export type Scroll = "none" | "inline" | "block" | "both";

export type Border = "none" | "hairline" | "solid" | "accent";
export type Shadow = "none" | "soft" | "hard";

export interface WidgetStyle {
  blur?: number;
  opacity?: number;
  border?: Border;
  shadow?: Shadow;
  accent?: string;
  /** A key into widgetStyle's FONTS table, never a font-family string. */
  font?: string;
  /** What the author wrote. Never rendered as-is. */
  css?: string;
  /** The server's confined version of `css`. The only form the page injects. */
  scopedCss?: string;
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  size: WidgetSize;
  props?: Record<string, string | number | boolean>;
  style?: WidgetStyle;
  children?: Widget[];
}

export type AnchoredLayout = Record<Anchor, Widget[]>;

/** The cells a widget covers: a 1-based grid line, and how many tracks it takes from there. */
export interface GridArea {
  col: number;
  row: number;
  span: number;
  rows: number;
}

/** How an anchor paints itself behind whatever is in it. */
export type AnchorBackground = "none" | "shadow" | "blur" | "solid";

export interface BoardSettings {
  flow?: string;
  scroll?: string;
  /** Whether the anchor takes widgets at all. Off hides it and refuses drops. */
  enabled?: boolean;
  background?: AnchorBackground;
  /** 0 to 1. A shadow's darkness, a blur's radius, a solid's opacity. */
  intensity?: number;
  /** Hex. Tints the shadow or the solid; ignored by blur. */
  color?: string;
}

export interface WallpaperSetting {
  source: "bing" | "url" | "media";
  url?: string;
}

export interface PageSettings {
  wallpaper?: WallpaperSetting;
}

export interface ProfileLayout {
  /** The whole page: one container holding everything, with a layout of its own. */
  root?: Widget;
  /** Written before the page became one container. Read once, then migrated. */
  anchors?: Partial<AnchoredLayout>;
  boards?: Record<string, BoardSettings>;
  page?: PageSettings;
  version?: number;

  /** Pre-anchor shapes, read once during migration. */
  widgets?: Widget[];
  header?: { id: string }[];
  headerLinks?: HeaderLink[];
}

export interface WidgetProps {
  widget: Widget;
  editing: boolean;
  /** True in a gallery tile, where a few kinds render differently on purpose. */
  preview?: boolean;
  onChange: (next: Widget) => void;
  /** A container's contents, already rendered as a board. */
  children?: ReactNode;
}

export type WidgetComponent = (props: WidgetProps) => ReactNode;
export type WidgetRegistry = Record<WidgetKind, WidgetComponent>;

/** The profile a widget is rendered for, when there is one. */
export interface ProfileScope {
  profile: ProfileData;
  posts: PostSummary[];
  readme: PostSummary | null;
  timeline: PostSummary[];
  handle: string;
  /** What the activity grid plots, when that is not simply when each post was written. */
  activityDates?: string[];
}
