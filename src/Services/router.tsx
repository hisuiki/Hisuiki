import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

/** A history-API router in place of a routing dependency: a handful of route shapes, no nested layouts. */

interface RouterValue {
  pathname: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue>({
  pathname: "/",
  navigate: () => {},
});

export function RouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (options?.replace) window.history.replaceState({}, "", to);
    else window.history.pushState({}, "", to);
    setPathname(new URL(to, window.location.href).pathname);
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo<RouterValue>(() => ({ pathname, navigate }), [pathname, navigate]);

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

  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        // Anything but a plain left-click means "open elsewhere" — let the browser have it.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target && rest.target !== "_self") return;
        e.preventDefault();
        navigate(href);
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
  /** Blob path this route renders, e.g. "blog/welcome.ja.md". */
  filePath: string;
  japanese: boolean;
  /** True for the two blog index pages, which render <BlogIndex /> rather than an article. */
  isBlogIndex: boolean;
}

/** The photo gallery, or one photo's own page when `photoId` is set. */
export interface PhotosRoute {
  kind: "photos";
  japanese: boolean;
  photoId: string | null;
}

/** Sign in or create an account. */
export interface SignInRoute {
  kind: "signin";
  japanese: boolean;
}

/** Site-owner control panel. */
export interface AdminRoute {
  kind: "admin";
  japanese: boolean;
}

export type Route = PageRoute | PhotosRoute | SignInRoute | AdminRoute;

/** Ids are minted by the API as 12 hex characters; anything else is not a photo. */
const PHOTO_ID = /^[0-9a-f]{12}$/;

/**
 * Route table:
 *   /                  → README.md            /ja                  → README.ja.md
 *   /blog              → blog/index.md        /blog/ja             → blog/index.ja.md
 *   /blog/:slug        → blog/:slug.md        /blog/:slug/ja       → blog/:slug.ja.md
 *   /photos            → the gallery          /photos/ja           → the gallery, in Japanese
 *   /photos/:id        → one photo            /photos/:id/ja       → one photo, in Japanese
 *   /signin            → sign in              /signin/ja           → sign in, in Japanese
 *   /admin             → control panel         /admin/ja            → control panel, in Japanese
 *
 * Returns null for anything else, which renders the not-found page.
 */
export function resolveRoute(pathname: string): Route | null {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  const japanese = segments[segments.length - 1] === "ja";
  const path = japanese ? segments.slice(0, -1) : segments;
  const suffix = japanese ? ".ja.md" : ".md";

  if (path.length === 0) {
    return { kind: "page", filePath: `README${suffix}`, japanese, isBlogIndex: false };
  }

  if (path[0] === "blog") {
    if (path.length === 1) {
      return { kind: "page", filePath: `blog/index${suffix}`, japanese, isBlogIndex: true };
    }
    // Slugs are single-segment and lowercase-kebab (see the editor's slug validation).
    if (path.length === 2 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path[1]!)) {
      return { kind: "page", filePath: `blog/${path[1]}${suffix}`, japanese, isBlogIndex: false };
    }
  }

  if (path[0] === "signin" && path.length === 1) {
    return { kind: "signin", japanese };
  }

  if (path[0] === "admin" && path.length === 1) {
    return { kind: "admin", japanese };
  }

  if (path[0] === "photos") {
    if (path.length === 1) {
      return { kind: "photos", japanese, photoId: null };
    }
    if (path.length === 2 && PHOTO_ID.test(path[1]!)) {
      return { kind: "photos", japanese, photoId: path[1]! };
    }
  }

  return null;
}
