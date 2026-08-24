import { scopeCss } from "./UserContentUtils.js";

/**
 * Confines every widget stylesheet in a layout to the widget it belongs to.
 *
 * The layout is the one part of a profile the client sends as an opaque document: the server does
 * not otherwise care what is in it, and stores it as JSON. That is fine for sizes and orderings, and
 * not fine at all for the Inspector's Advanced tab, which lets somebody write CSS. Without this,
 * that CSS would be saved unexamined and then served to everyone who opens the profile — able to
 * restyle the app's own chrome, cover the page with a fixed-position overlay, or call out to a
 * third-party URL from a visitor's browser.
 *
 * So each widget's `style.css` is run through the same filter the profile's custom stylesheet uses,
 * scoped to that widget's own id, and the result is stored beside it as `style.scopedCss`. The
 * client renders only the scoped form. The author's source is kept unchanged so the editor can show
 * back what they actually wrote rather than a rewritten version of it.
 *
 * A `scopedCss` that arrives from the client is discarded and recomputed, always. It is the field
 * that is trusted at render time, so it is the one field the client must never be able to set.
 */

/** What a widget's rules are confined to. Matches the attribute WidgetBoard puts on the element. */
export const widgetScope = (id: string): string => `[data-widget-id="${cssEscape(id)}"]`;

/** Ids are generated, but this document can be written by hand, so quote what goes in a selector. */
const cssEscape = (value: string): string => value.replace(/["\\\\]/g, "\\\\$&");

/** Deep enough for the layout engine's own limit, and a stop for a hand-written document. */
const MAX_DEPTH = 6;

interface LayoutWidget {
  id?: unknown;
  style?: { css?: unknown; scopedCss?: unknown } & Record<string, unknown>;
  children?: unknown;
  [key: string]: unknown;
}

function scopeWidget(raw: unknown, depth: number): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;

  const widget = { ...(raw as LayoutWidget) };

  if (widget.style && typeof widget.style === "object") {
    const style = { ...widget.style };
    const source = typeof style.css === "string" ? style.css : "";

    // Recomputed from the source every time, never carried over from what arrived.
    delete style.scopedCss;

    if (source.trim() && typeof widget.id === "string") {
      const { css } = scopeCss(source.slice(0, 20_000), widgetScope(widget.id));
      if (css.trim()) style.scopedCss = css;
    }

    widget.style = style;
  }

  if (Array.isArray(widget.children) && depth < MAX_DEPTH) {
    widget.children = widget.children.map((child) => scopeWidget(child, depth + 1));
  }

  return widget;
}

/** The layout as it should be stored: same document, every stylesheet confined. */
export function scopeLayoutCss(layout: unknown): unknown {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) return layout;

  const document = { ...(layout as Record<string, unknown>) };
  // Current documents are one root container. This must be handled before the legacy shapes below:
  // otherwise the editor appears to save confined CSS while its trusted scopedCss is never built.
  if (document.root && typeof document.root === "object" && !Array.isArray(document.root)) {
    document.root = scopeWidget(document.root, 0);
  }
  const anchors = document.anchors;

  if (anchors && typeof anchors === "object" && !Array.isArray(anchors)) {
    const scoped: Record<string, unknown> = {};
    for (const [anchor, widgets] of Object.entries(anchors as Record<string, unknown>)) {
      scoped[anchor] = Array.isArray(widgets) ? widgets.map((w) => scopeWidget(w, 0)) : widgets;
    }
    document.anchors = scoped;
  }

  // The pre-anchor shape, for a client that has not reloaded since the change.
  if (Array.isArray(document.widgets)) {
    document.widgets = document.widgets.map((w) => scopeWidget(w, 0));
  }

  return document;
}
