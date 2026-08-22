import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

/** A history-API router in place of a routing dependency: a handful of route shapes, no nested layouts. */

interface RouterValue {
  pathname: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  /** Registers a veto on navigation. Returning false holds it back. */
  setGuard: (guard: ((to: string) => boolean) | null) => void;
}

const RouterContext = createContext<RouterValue>({
  pathname: "/",
  navigate: () => {},
  setGuard: () => {},
});

/** Returns the handle of the current profile, parsed from subdomain or /users/:handle */
/**
 * The apex of the current host, or null when there is no subdomain to strip.
 *
 * Splitting on dots and dropping the first label is only meaningful for a real domain name. An IPv4
 * address has four dot-separated parts and none of them is a subdomain, so the same rule turns
 * 10.100.50.7 into 100.50.7 — a different machine entirely. Ports, localhost and bare hosts have the
 * same problem in milder forms, so every one of them is excluded here rather than at each call site.
 */
function apexOf(hostname: string): string | null {
  // An IPv4 literal. IPv6 arrives bracketed and contains colons, so it never reaches the split below.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;
  if (hostname.includes(":")) return null;

  const parts = hostname.split(".");
  // Two labels is the apex itself (hisuiki.com); three or more has something in front of it.
  if (parts.length < 3) return null;

  return parts.slice(1).join(".");
}

/**
 * The apex site, where the feed lives.
 *
 * A profile subdomain serves that person's profile at its root, so "Home" cannot simply be "/" —
 * there it would mean the profile. This returns the address of the main site so Home always means
 * the feed, whichever profile you happen to be reading.
 */
export function apexHref(path = "/"): string {
  if (typeof window === "undefined") return path;

  const { hostname, protocol, port } = window.location;
  const apex = apexOf(hostname);

  // No subdomain to leave — an ordinary in-app path is already correct.
  if (!apex) return path;

  return `${protocol}//${apex}${port ? `:${port}` : ""}${path}`;
}

/**
 * Where one person's profile lives, derived from the current host rather than a constant.
 *
 * On a host with a subdomain this is {handle}.{apex}; anywhere else — localhost, a preview deploy,
 * an IP — it is /users/{handle} on the current origin, because there is no subdomain to use. A
 * hardcoded domain here would send someone from staging to production.
 */
export function profileHref(handle: string): string {
  if (typeof window === "undefined") return `/users/${handle}`;

  const { hostname, protocol, port } = window.location;
  const apex = apexOf(hostname);

  // Nowhere to put a subdomain — an IP, localhost, or an apex with none.
  if (!apex) return `/users/${handle}`;

  return `${protocol}//${handle}.${apex}${port ? `:${port}` : ""}/`;
}

/** Subdomains the site itself uses, which can never be someone's handle. */
const RESERVED_SUBDOMAINS = new Set(["www", "api", "cdn", "admin", "static"]);

export function getSiteHandle(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  
  const match = window.location.pathname.match(/^\/users\/([^/]+)/);
  if (match) return match[1];

  // apexOf rejects IP literals and localhost, so an address like 10.100.50.7 cannot be read as the
  // handle "10" — which is what a bare label count did.
  if (!apexOf(host)) return undefined;

  const subdomain = host.split(".")[0];
  if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) return subdomain;

  return undefined;
}

export function injectHandlePrefix(path: string): string {
  const match = window.location.pathname.match(/^\/users\/([^/]+)/);
  if (match && path.startsWith("/") && !path.startsWith("/users/")) {
    return `/users/${match[1]}${path === "/" ? "" : path}`;
  }
  return path;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // A guard can hold a navigation back — used to ask before leaving a half-finished page.
  const guard = useRef<((to: string) => boolean) | null>(null);
  const setGuard = useCallback((fn: ((to: string) => boolean) | null) => {
    guard.current = fn;
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    to = injectHandlePrefix(to);
    if (guard.current && !guard.current(to)) return;
    if (options?.replace) window.history.replaceState({}, "", to);
    else window.history.pushState({}, "", to);
    setPathname(new URL(to, window.location.href).pathname);
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo<RouterValue>(
    () => ({ pathname, navigate, setGuard }),
    [pathname, navigate, setGuard],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = (): RouterValue => useContext(RouterContext);

/** Same-origin link that navigates client-side instead of reloading the document. */
export function Link({
  href,
  onClick,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useRouter();
  const injectedHref = injectHandlePrefix(href);

  return (
    <a
      href={injectedHref}
      onClick={(e) => {
        onClick?.(e);
        // Anything but a plain left-click means "open elsewhere" — let the browser have it.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target && rest.target !== "_self") return;

        // Another origin — a profile subdomain linking back to the apex, say. pushState throws on a
        // cross-origin URL, so this has to be a real navigation.
        if (new URL(href, window.location.href).origin !== window.location.origin) return;
        e.preventDefault();
        navigate(injectedHref);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** A markdown page rendered by <FileViewer />. */
export interface PageRoute {
  kind: "page";
  /** Blob path this route renders, e.g. "posts/welcome.ja.md". */
  slug: string;
  isHome: boolean;
  japanese: boolean;
  /** True for the two blog index pages, which render <PostsIndex /> rather than an article. */
  isPostsIndex: boolean;
}

/** The photo gallery, or one photo's own page when `photoId` is set. */
export interface PhotosRoute {
  kind: "photos";
  japanese: boolean;
  photoId: string | null;
}

/** Someone's profile, reached by subdomain or by /users/{handle}. */
export interface ProfileRoute {
  kind: "profile";
  handle: string;
  japanese: boolean;
}

/** What Hisuiki is — a page of its own, linked from the footer. */
export interface AboutRoute {
  kind: "about";
  japanese: boolean;
}

/** The visual layout editor for one's own profile. */
export interface CustomizeRoute {
  kind: "customize";
  japanese: boolean;
}

/** Sign in or create an account. */
export interface SignInRoute {
  kind: "signin";
  japanese: boolean;
}

export interface LandingRoute {
  kind: "landing";
  /** home = the ranked feed, explore = the same posts with ranking off. */
  tab: "home" | "explore";
  japanese: boolean;
}

export interface SettingsRoute {
  kind: "settings";
  japanese: boolean;
}

export type Route =
  | PageRoute
  | PhotosRoute
  | SignInRoute
  | LandingRoute
  | SettingsRoute
  | ProfileRoute
  | CustomizeRoute
  | AboutRoute;

/** Ids are minted by the API as 12 hex characters; anything else is not a photo. */
/** Posts and media are addressed by UUID: a slug names a post only within one author's profile. */
/** Handles are lowercase, as validated on the server. */
const HANDLE = /^[a-z0-9-]{3,30}$/;

const POST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route table:
 *   /                  → README.md            /ja                  → README.ja.md
 *   /blog              → posts/index.md        /posts/ja             → posts/index.ja.md
 *   /posts/:slug        → posts/:slug.md        /posts/:slug/ja       → posts/:slug.ja.md
 *   /photos            → the gallery          /photos/ja           → the gallery, in Japanese
 *   /photos/:id        → one photo            /photos/:id/ja       → one photo, in Japanese
 *   /signin            → sign in              /signin/ja           → sign in, in Japanese
 *
 * Returns null for anything else, which renders the not-found page.
 */
export function resolveRoute(pathname: string): Route | null {
  const allSegments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  let segments = allSegments;
  if (segments[0] === "users" && segments.length >= 2) {
    segments = segments.slice(2);
  }

  const japanese = segments[segments.length - 1] === "ja";
  const path = japanese ? segments.slice(0, -1) : segments;
  

  if (path.length === 0) {
    // On a profile subdomain the root is that person's profile; on the apex it is the feed.
    const siteHandle = getSiteHandle();
    if (siteHandle) return { kind: "profile", handle: siteHandle, japanese };
    return { kind: "landing", tab: "home", japanese };
  }

  if (path[0] === "posts") {
    // No index of its own: the feed on the landing page is the list of posts, so /posts is the
    // same surface rather than a second one showing the same rows in a different order.
    if (path.length === 1) {
      return { kind: "landing", tab: "home", japanese };
    }
    // Slugs are single-segment and lowercase-kebab (see the editor's slug validation).
    if (path.length === 2 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path[1]!)) {
      return { kind: "page", slug: path[1]!, isHome: false, japanese, isPostsIndex: false };
    }
  }

  if (path.length === 1 && path[0] === "explore") {
    return { kind: "landing", tab: "explore", japanese };
  }

  if (path.length === 1 && path[0] === "about") {
    return { kind: "about", japanese };
  }

  if (path[0] === "signin" && path.length === 1) {
    return { kind: "signin", japanese };
  }

  if (path[0] === "customize" && path.length === 1) {
    return { kind: "customize", japanese };
  }

  // A profile subdomain serves the profile at its root; /users/{handle} is the same page addressed
  // from the apex, which is what makes profiles linkable before DNS for a handle exists.
  if (path[0] === "users" && path.length === 2 && HANDLE.test(path[1]!)) {
    return { kind: "profile", handle: path[1]!, japanese };
  }

  if (path[0] === "settings" && path.length === 1) {
    return { kind: "settings", japanese };
  }

  // "media" is the name; "photos" stays as an alias so links already shared keep resolving.
  if (path[0] === "media" || path[0] === "photos") {
    if (path.length === 1) {
      return { kind: "photos", japanese, photoId: null };
    }
    if (path.length === 2 && POST_ID.test(path[1]!)) {
      return { kind: "photos", japanese, photoId: path[1]! };
    }
  }

  return null;
}
