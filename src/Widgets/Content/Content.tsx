import { useTranslation } from "react-i18next";
import { Admin, About, BoardManager, FileViewer, Landing, Photos, Settings, SignIn } from "../../Modules/ModuleRegistry";
import { usePageLayout } from "../../Services/PageLayoutProvider";
import { resolveRoute, type Route } from "../../Services/AppRouter";
import type { SitePageName } from "../../Services/SiteService";
import type { WidgetProps } from "../../Types/TypeRegistry";

function SitePageContent({ page, japanese }: { page: SitePageName; japanese: boolean }) {
  return page === "about"
    ? <About isJapanese={japanese} />
    : <Landing tab={page} />;
}

function RouteContent({ route }: { route: Exclude<Route, { kind: "board-edit" }> }) {
  if (route.kind === "landing") return <Landing tab={route.tab} />;
  if (route.kind === "photos") return <Photos photoId={route.photoId} isJapanese={route.japanese} />;
  if (route.kind === "about") return <About isJapanese={route.japanese} />;
  // A profile or named board is expressed entirely by the widgets around this one.
  if (route.kind === "profile" || route.kind === "board") return null;
  if (route.kind === "settings") return <Settings />;
  if (route.kind === "boards") return <BoardManager />;
  if (route.kind === "admin") return <Admin />;
  if (route.kind === "signin") return <SignIn isJapanese={route.japanese} />;

  return <FileViewer slug={route.slug} isHome={route.isHome} isJapanese={route.japanese} />;
}

/** Whatever the current route shows, as a widget, so the page is one tree rather than chrome plus a hole. */
export default function Content({ preview }: WidgetProps) {
  const { t } = useTranslation();
  const { board, displayPathname } = usePageLayout();
  const route = resolveRoute(displayPathname);

  // A gallery tile is not the place to mount an entire page.
  if (preview) {
    return (
      <div className="content-widget is-preview">
        <p className="content-preview-title">{t("widgets.content.label")}</p>
        <p className="content-preview-hint">{t("widgets.content.description")}</p>
      </div>
    );
  }

  if (route === null) {
    return (
      <div className="file-content">
        <h3>{t("content.notFoundTitle")}</h3>
        <p>{t("content.notFound")}</p>
      </div>
    );
  }

  if (route.kind === "board-edit") {
    const page = board?.systemPage ?? board?.sitePage;

    // Editing uses its own /boards/:id/edit route, but a Page Content widget belongs to the site
    // page that board represents. Paint that real page here so the editor never replaces it with
    // an empty box. The preview is inert: its links and controls demonstrate the result without
    // stealing clicks or navigation from the board editor.
    if (page) {
      return (
        <div className="content-widget-live-preview" data-page={page} inert>
          <SitePageContent page={page} japanese={route.japanese} />
        </div>
      );
    }

    // Ordinary user boards have no route-owned page content. Keep an honest placeholder instead
    // of inventing data or silently collapsing the widget.
    return (
      <div className="content-widget is-preview" data-preview="placeholder">
        <p className="content-preview-title">{t("widgets.content.label")}</p>
        <p className="content-preview-hint">{t("widgets.content.description")}</p>
      </div>
    );
  }

  return <RouteContent route={route} />;
}
