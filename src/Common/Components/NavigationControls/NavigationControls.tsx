import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  apexHref,
  boardHref,
  resolveRoute,
  useRouter,
} from "../../../Services/AppRouter";
import { useAuth } from "../../../Services/AuthProvider";
import { usePageLayout } from "../../../Services/PageLayoutProvider";
import Glyph from "../WidgetIcon/Glyph";

/** Contextual app commands, kept outside the user's editable page composition. */
export default function NavigationControls() {
  const { t } = useTranslation();
  const auth = useAuth();
  const {
    back,
    forward,
    canGoBack,
    canGoForward,
    navigate,
  } = useRouter();
  const {
    board,
    displayPathname,
    editing,
    inspect,
    inspectingId,
    root,
  } = usePageLayout();
  const inspectorButton = useRef<HTMLButtonElement>(null);
  const [openInspectorAfterNavigation, setOpenInspectorAfterNavigation] = useState(false);
  const route = resolveRoute(displayPathname);
  const inspectorOpen = editing && inspectingId !== null;
  const inspectorRequested = new URLSearchParams(window.location.search).get("inspector") === "1";
  const canInspect = editing || (
    auth.isSignedIn &&
    board !== null &&
    auth.user?.id === board.owner.id
  );
  const isHome = route?.kind === "landing" && route.tab === "home";

  useEffect(() => {
    if (!editing || (!openInspectorAfterNavigation && !inspectorRequested)) return;
    inspect(root.id, inspectorButton.current);
    setOpenInspectorAfterNavigation(false);
    if (inspectorRequested) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.hash}`);
    }
  }, [editing, inspect, inspectorRequested, openInspectorAfterNavigation, root.id]);

  const exitCustomization = () => {
    inspect(null);
    const handle = board?.owner.profile?.handle;
    navigate(handle && board ? boardHref(handle, board.slug) : "/boards");
  };

  const quitPage = () => {
    const href = apexHref("/");
    const destination = new URL(href, window.location.href);
    if (destination.origin === window.location.origin) navigate(destination.toString());
    else window.location.assign(destination);
  };

  const openInspector = () => {
    if (editing) {
      inspect(inspectorOpen ? null : root.id, inspectorButton.current);
      return;
    }
    if (!board) return;
    setOpenInspectorAfterNavigation(true);
    const href = apexHref(`/boards/${encodeURIComponent(board.id)}/edit?inspector=1`);
    const destination = new URL(href, window.location.href);
    if (destination.origin === window.location.origin) navigate(destination.toString());
    else window.location.assign(destination);
  };

  return (
    <nav className="metro-navigation-controls" aria-label={t("navigationControls.label")}>
      <div className="metro-navigation-group is-previous">
        <button
          type="button"
          className="metro-navigation-button"
          style={{ "--navigation-order": 0 } as React.CSSProperties}
          aria-label={t("navigationControls.back")}
          title={t("navigationControls.back")}
          disabled={!canGoBack}
          onClick={back}
        >
          <Glyph name="back" />
          <span>{t("navigationControls.back")}</span>
        </button>
      </div>

      <div className="metro-navigation-group is-actions">
        <button
          type="button"
          className="metro-navigation-button"
          style={{ "--navigation-order": 0 } as React.CSSProperties}
          aria-label={t("navigationControls.forward")}
          title={t("navigationControls.forward")}
          disabled={!canGoForward}
          onClick={forward}
        >
          <Glyph name="forward" />
          <span>{t("navigationControls.forward")}</span>
        </button>

        {!editing && (
          <button
            type="button"
            className="metro-navigation-button"
            style={{ "--navigation-order": 1 } as React.CSSProperties}
            aria-label={t("navigationControls.quit")}
            title={t("navigationControls.quit")}
            disabled={isHome}
            onClick={quitPage}
          >
            <Glyph name="close" />
            <span>{t("navigationControls.quit")}</span>
          </button>
        )}

        {editing && (
          <button
            type="button"
            className="metro-navigation-button is-primary"
            style={{ "--navigation-order": 1 } as React.CSSProperties}
            aria-label={t("navigationControls.exitCustomization")}
            title={t("navigationControls.exitCustomization")}
            onClick={exitCustomization}
          >
            <Glyph name="done" />
            <span>{t("navigationControls.exitCustomization")}</span>
          </button>
        )}

        {canInspect && (
          <button
            type="button"
            ref={inspectorButton}
            className={`metro-navigation-button ${inspectorOpen ? "is-active" : ""}`.trim()}
            style={{ "--navigation-order": 2 } as React.CSSProperties}
            aria-label={t("navigationControls.inspector")}
            aria-expanded={inspectorOpen}
            title={t("navigationControls.inspector")}
            onClick={openInspector}
          >
            <Glyph name="inspect" />
            <span>{t("navigationControls.inspector")}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
