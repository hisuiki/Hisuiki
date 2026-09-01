import { useEffect } from "react";
import AppModal from "./Common/Components/AppModal/AppModal";
import Wallpaper from "./Common/Components/Wallpaper/Wallpaper";
import { Admin, FileViewer, Footer, Header, Photos, SignIn } from "./Modules";
import { AuthProvider } from "./Services/auth";
import { ExternalLinkProvider } from "./Services/externalLink";
import { RouterProvider, resolveRoute, useRouter } from "./Services/router";
import { injectAssetCssVariables } from "./Services/wallpaper";

function pageTitle(pathname: string): string {
  const route = resolveRoute(pathname);
  if (!route) return "Not found — Hisuiki";
  if (route.kind === "photos") {
    return route.photoId ? "Photo — Hisuiki" : "Photos — Hisuiki";
  }
  if (route.kind === "signin") return "Sign in — Hisuiki";
  if (route.kind === "admin") return "Control panel — Hisuiki";
  if (route.isBlogIndex) return "Blog — Hisuiki";
  if (route.filePath.startsWith("blog/")) {
    const slug = route.filePath.slice("blog/".length).replace(/(\.ja)?\.md$/, "");
    return `${slug} — Hisuiki`;
  }
  return "Emi — Hisuiki";
}

function NotFound() {
  return (
    <main className="main-content">
      <div className="main-content-container">
        <div className="file-content">
          <h3>Not Found</h3>
          <p>Sorry, the content you are looking for does not exist.</p>
        </div>
      </div>
    </main>
  );
}

function Shell() {
  const { pathname } = useRouter();
  const route = resolveRoute(pathname);

  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  return (
    <>
      <Wallpaper />
      <Header isJapanese={route?.japanese ?? false} />
      {route === null ? (
        <NotFound />
      ) : route.kind === "photos" ? (
        <Photos photoId={route.photoId} isJapanese={route.japanese} />
      ) : route.kind === "signin" ? (
        <main className="main-content">
          <div className="main-content-container">
            <div className="file-content" data-phase="ready">
              <SignIn isJapanese={route.japanese} />
            </div>
          </div>
        </main>
      ) : route.kind === "admin" ? (
        <main className="main-content">
          <div className="main-content-container">
            <div className="file-content" data-phase="ready">
              <Admin isJapanese={route.japanese} />
            </div>
          </div>
        </main>
      ) : (
        <FileViewer filePath={route.filePath} isJapanese={route.japanese} />
      )}
      <Footer />
      <AppModal />
    </>
  );
}

export default function App() {
  // <Wallpaper /> fetches and shows the photo itself; only the asset paths are left here.
  useEffect(() => {
    injectAssetCssVariables();
  }, []);

  return (
    <RouterProvider>
      <AuthProvider>
        <ExternalLinkProvider>
          <Shell />
        </ExternalLinkProvider>
      </AuthProvider>
    </RouterProvider>
  );
}
