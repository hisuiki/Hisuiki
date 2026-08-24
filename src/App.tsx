import { useEffect } from "react";
import AppModal from "./Common/Components/AppModal/AppModal";
import SaveIndicator from "./Common/Components/SaveIndicator/SaveIndicator";
import Wallpaper from "./Common/Components/Wallpaper/Wallpaper";
import BoardSettings from "./Common/Components/BoardSettings/BoardSettings";
import Inspector from "./Common/Components/Inspector/Inspector";
import LeaveGuard from "./Common/Components/LeaveGuard/LeaveGuard";
import { AuthProvider } from "./Services/AuthProvider";
import { PageLayoutProvider, usePageLayout } from "./Services/PageLayoutProvider";
import { columnsOf, findInTree, flowOf, scrollOf } from "./Services/LayoutUtils";
import WidgetBoard from "./Common/Components/WidgetBoard/WidgetBoard";
import PageScope from "./Common/Components/PageScope/PageScope";
import { setLanguage } from "./Services/I18nService";
import { ExternalLinkProvider } from "./Services/ExternalLinkProvider";
import { AppRouter, resolveRoute } from "./Services/AppRouter";
import { injectAssetCssVariables } from "./Services/WallpaperUtils";
import useTransientScrollbars from "./Common/Hooks/UseTransientScrollbars";
import { styleOf, styleVariables } from "./Services/WidgetStyleUtils";

function pageTitle(pathname: string): string {
  const route = resolveRoute(pathname);
  if (!route) return "Not found — Hisuiki";
  if (route.kind === "landing") return "Hisuiki";
  if (route.kind === "photos") {
    return route.photoId ? "Photo — Hisuiki" : "Photos — Hisuiki";
  }
  if (route.kind === "signin") return "Sign in — Hisuiki";
  if (route.kind === "settings") return "Settings — Hisuiki";
  if (route.kind === "boards") return "Your boards — Hisuiki";
  if (route.kind === "board-edit") return "Edit board — Hisuiki";
  if (route.kind === "board") return `${route.slug} — @${route.handle} — Hisuiki`;
  if (route.kind === "admin") return "Admin — Hisuiki";
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
function MainWindow() {
  const {
    root, setRoot, replaceWidget, editing, inspectingId, inspect, inspectorAnchor,
    layoutKey, displayPathname, transition,
  } = usePageLayout();
  const route = resolveRoute(displayPathname);

  useEffect(() => {
    document.title = pageTitle(displayPathname);
  }, [displayPathname]);

  // Language is ambient rather than a prop: a widget is placed by its owner and rendered by whatever
  // surface it lands in, so it cannot rely on a prop threaded down a path nobody controls.
  useEffect(() => {
    setLanguage(route?.japanese ? "ja" : "en");
  }, [route?.japanese]);

  const inspectingWidget = inspectingId ? findInTree(root, inspectingId) : null;
  const rootStyle = styleOf(root);

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

      <div
        key={layoutKey}
        className={`page-root board-surface is-${transition}`}
        data-board-transition={transition}
        data-widget-id={root.id}
        data-border={rootStyle.border === "none" ? undefined : rootStyle.border}
        data-shadow={rootStyle.shadow === "none" ? undefined : rootStyle.shadow}
        data-inspecting={inspectingId === root.id ? "" : undefined}
        style={styleVariables(rootStyle)}
      >
        {rootStyle.scopedCss && <style>{rootStyle.scopedCss}</style>}
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
  useTransientScrollbars();

  // <Wallpaper /> fetches and shows the photo itself; only the asset paths are left here.
  useEffect(() => {
    injectAssetCssVariables();
  }, []);

  return (
    <AppRouter>
      <AuthProvider>
        <PageLayoutProvider>
          <ExternalLinkProvider>
            <PageScope>
              <MainWindow />
            </PageScope>
          </ExternalLinkProvider>
        </PageLayoutProvider>
      </AuthProvider>
    </AppRouter>
  );
}
