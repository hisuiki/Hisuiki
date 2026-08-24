import type { Widget } from "../Types/TypeRegistry";

/** The app's own pages, for the Title widget's list selector. */
export const ROUTES: Record<string, { path: string; active: (path: string) => boolean }> = {
  home: { path: "/", active: (p) => p === "/" || p === "/ja" },
  explore: { path: "/explore", active: (p) => p.startsWith("/explore") },
  // "photos" stays matched: it remains a route alias, so a shared link still highlights Media.
  media: { path: "/media", active: (p) => /^\/(media|photos)/.test(p) },
  about: { path: "/about", active: (p) => p.startsWith("/about") },
  settings: { path: "/settings", active: (p) => p.startsWith("/settings") },
  boards: { path: "/boards", active: (p) => p.startsWith("/boards") },
  admin: { path: "/admin", active: (p) => p.startsWith("/admin") },
};

export const ROUTE_KEYS = Object.keys(ROUTES);

export type TitleAction =
  | { kind: "route"; route: string }
  | { kind: "path"; path: string }
  | { kind: "external"; href: string };

/** Read back through a clamp: this comes from a stored document and ends up in an href. */
export function titleAction(widget: Widget): TitleAction {
  const action = String(widget.props?.action ?? "route");

  if (action === "external") {
    const raw = String(widget.props?.href ?? "").trim();
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return { kind: "external", href: url.toString() };
      }
    } catch {
      // Not a URL.
    }
    return { kind: "external", href: "" };
  }

  if (action === "path") {
    const path = String(widget.props?.path ?? "").trim();
    // In-app only: a path is not a place to smuggle a scheme.
    return { kind: "path", path: path.startsWith("/") && !path.startsWith("//") ? path : "" };
  }

  const route = String(widget.props?.route ?? widget.props?.target ?? "home");
  return { kind: "route", route: route in ROUTES ? route : "home" };
}
