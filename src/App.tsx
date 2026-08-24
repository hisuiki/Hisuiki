import { useEffect } from "react";
import AppModal from "./Common/Components/AppModal/AppModal";
import SaveIndicator from "./Common/Components/SaveIndicator/SaveIndicator";
import Wallpaper from "./Common/Components/Wallpaper/Wallpaper";
import BoardSettings from "./Common/Components/BoardSettings/BoardSettings";
import Inspector from "./Common/Components/Inspector/Inspector";
import LeaveGuard from "./Common/Components/LeaveGuard/LeaveGuard";
import { AuthProvider } from "./Services/auth";
import { PageLayoutProvider, usePageLayout } from "./Services/pageLayout";
import { columnsOf, findInTree, flowOf, scrollOf } from "./Services/layout";
import WidgetBoard from "./Common/Components/WidgetBoard/WidgetBoard";
import PageScope from "./Common/Components/PageScope/PageScope";
import { setLanguage } from "./Services/i18n";
import { ExternalLinkProvider } from "./Services/externalLink";
import { RouterProvider, resolveRoute, useRouter } from "./Services/router";
import { injectAssetCssVariables } from "./Services/wallpaper";
import { apiUrl } from "./Services/config";
import { getSiteHandle } from "./Services/router";

function pageTitle(pathname: string): string {
  const route = resolveRoute(pathname);
  if (!route) return "Not found — Hisuiki";
  if (route.kind === "landing") return "Hisuiki";
  if (route.kind === "photos") {
    return route.photoId ? "Photo — Hisuiki" : "Photos — Hisuiki";
  }
  if (route.kind === "signin") return "Sign in — Hisuiki";
  if (route.kind === "settings") return "Settings — Hisuiki";
  if (route.kind === "customize") return "Customize — Hisuiki";
  if (route.kind === "about") return "About — Hisuiki";
  if (route.kind === "profile") return `@${route.handle} — Hisuiki`;
  if (route.isPostsIndex) return "Posts — Hisuiki";
  if (!route.isHome) return `${route.slug} — Hisuiki`;
  return "Hisuiki";
}

/**
 * The page's furniture, drawn from the layout document rather than from this file.
 *
 * There is no <Header /> and no <Footer /> any more. The top anchor holds a container of navigation
 * widgets and the bottom one holds the brand and colophon, and either can be emptied, refilled or
 * swapped with the other — nothing here knows which is which. The route still decides what goes in
 * the middle, because that is what a route is for.
 */
/**
 * The page: one board, laid out by the root container's own settings.
 *
 * There is no chrome left to special-case. The route's content is a widget like any other, so what
 * used to be five regions with five settings panels is one tree with one.
 */
function Shell() {
  const { pathname } = useRouter();
  const route = resolveRoute(pathname);
  const { root, setRoot, replaceWidget, editing, inspectingId, inspect, inspectorAnchor } = usePageLayout();

  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  // Language is ambient rather than a prop: a widget is placed by its owner and rendered by whatever
  // surface it lands in, so it cannot rely on a prop threaded down a path nobody controls.
  useEffect(() => {
    setLanguage(route?.japanese ? "ja" : "en");
  }, [route?.japanese]);

  // What a profile's own stylesheet is scoped to on the server.
  const isProfileSite = getSiteHandle() !== null;
  const inspectingWidget = inspectingId ? findInTree(root, inspectingId) : null;

  return (
    <>
      <Wallpaper />

      {editing && <BoardSettings />}

      {editing && <SaveIndicator />}

      {editing && inspectingWidget && (
        <Inspector
          widget={inspectingWidget}
          anchor={{ current: inspectorAnchor }}
          onChange={(next) => replaceWidget(inspectingWidget.id, next)}
          onClose={() => inspect(null)}
        />
      )}

      <div className={isProfileSite ? "profile-custom page-root" : "page-root"}>
        <WidgetBoard
          widgets={root.children ?? []}
          flow={flowOf(root)}
          scroll={scrollOf(root)}
          columns={columnsOf(root)}
          containerId={root.id}
          editing={editing}
          onChange={(next) =>
            setRoot((prev) => ({
              ...prev,
              children: typeof next === "function" ? next(prev.children ?? []) : next,
            }))
          }
        />
      </div>

      <LeaveGuard />
      <AppModal />
    </>
  );
}

export default function App() {

  // A profile subdomain's own styling. The API returns `scopedCss` — already filtered and confined
  // to .profile-custom on the server — and never the author's raw source, so nothing here can
  // restyle the app chrome or another person's content. The <style> element is removed on cleanup
  // so navigating between profiles does not stack stylesheets.
  useEffect(() => {
    const handle = getSiteHandle();
    if (!handle) return;

    let style: HTMLStyleElement | null = null;
    let cancelled = false;

    fetch(apiUrl(`/api/profile/${handle}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((profile: { scopedCss?: string; accentColor?: string } | null) => {
        if (!profile || cancelled) return;

        if (profile.scopedCss?.trim()) {
          style = document.createElement("style");
          style.dataset.profileCss = handle;
          style.textContent = profile.scopedCss;
          document.head.appendChild(style);
        }
        if (profile.accentColor) {
          document.documentElement.style.setProperty("--color-accent", profile.accentColor);
        }
      })
      .catch(() => {
        // A profile that will not load is not worth breaking the page over; the default styling
        // stays in place.
      });

    return () => {
      cancelled = true;
      style?.remove();
    };
  }, []);

  // <Wallpaper /> fetches and shows the photo itself; only the asset paths are left here.
  useEffect(() => {
    injectAssetCssVariables();
  }, []);

  return (
    <RouterProvider>
      <AuthProvider>
        <PageLayoutProvider>
          <ExternalLinkProvider>
            <PageScope>
              <Shell />
            </PageScope>
          </ExternalLinkProvider>
        </PageLayoutProvider>
      </AuthProvider>
    </RouterProvider>
  );
}
