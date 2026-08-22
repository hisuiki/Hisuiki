import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { WIDGETS, galleryKinds, newId } from "../../../Services/layout";
import WidgetIcon from "../WidgetIcon/WidgetIcon";
import { fetchFeed } from "../../../Services/api";
import { fetchProfile, fetchMyProfile } from "../../../Services/profile";
import { usePageLayout } from "../../../Services/pageLayout";
import { DRAG_TYPE } from "../../../Services/widgetDrag";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import type { ProfileScope, Widget, WidgetGalleryProps, WidgetKind } from "../../../Types";
import { ProfileScopeProvider, WIDGET_REGISTRY } from "../../../Widgets";
import { galleryScope } from "../../../Widgets/demo";

const STORAGE_KEY = "hisuiki.gallery.open";

type Props = Record<string, string | number | boolean>;

/** Stand-in settings where a widget would otherwise be blank until configured. */
function sample(kind: WidgetKind, t: (key: string) => string): Widget {
  const props: Partial<Record<WidgetKind, Props>> = {
    title: { action: "route", route: "home" },
    text: { heading: t("text.sampleHeading"), body: t("text.sampleBody") },
    webamp: { title: t("gallery.sample.track") },
  };

  return {
    id: `gallery-${newId()}`,
    kind,
    size: WIDGETS[kind].defaultSize,
    props: props[kind] ?? {},
    children: WIDGETS[kind].container ? [] : undefined,
  };
}

/**
 * The shelf a page is built from. Each tile is the real widget, filled with this profile's own
 * content where it has any, and dragged onto whichever anchor it should live at.
 */
export default function WidgetGallery({ onAdd, embedded, onDragStart }: WidgetGalleryProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<WidgetKind | null>(null);
  const [tile, setTile] = useState<{ w: number; h: number } | null>(null);
  const tileObserver = useRef<ResizeObserver | null>(null);

  const measureTile = useCallback((node: HTMLLIElement | null) => {
    if (!node || typeof ResizeObserver === "undefined") return;

    const read = () => setTile({ w: node.clientWidth, h: node.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    tileObserver.current?.disconnect();
    tileObserver.current = observer;
  }, []);
  const { announceDrag, cancelPreview } = usePageLayout();
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const [arrowX, setArrowX] = useState<number>(36);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return !embedded && window.localStorage.getItem(STORAGE_KEY) === "false";
    } catch {
      return false;
    }
  });

  // Embedded in a panel it is always open: the tab that reveals it is the toggle.
  const open = embedded || !collapsed;

  useLayoutEffect(() => {
    if (!open || !toggleBtnRef.current) return;
    const updateArrow = () => {
      const btn = toggleBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const parent = btn.parentElement?.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      const x = rect.left - (parentRect?.left ?? rect.left) + rect.width / 2;
      setArrowX(Math.max(16, Math.round(x)));
    };
    updateArrow();
    window.addEventListener("resize", updateArrow);
    return () => window.removeEventListener("resize", updateArrow);
  }, [open]);

  const [real, setReal] = useState<ProfileScope | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;
    void fetchMyProfile()
      .then(async (mine) => {
        if (!mine.handle) return null;
        const [profile, posts] = await Promise.all([
          fetchProfile(mine.handle),
          fetchFeed({ author: mine.handle, sort: "recent" }),
        ]);
        const readme = posts.find((post) => post.slug === "README" || post.title === "README") ?? null;
        return {
          profile,
          posts,
          readme,
          timeline: posts.filter((post) => post.id !== readme?.id),
          handle: mine.handle,
        } satisfies ProfileScope;
      })
      .then((scope) => {
        if (active && scope) setReal(scope);
      })
      .catch(() => {
        // Not signed in, or no profile yet. The sample content stands.
      });

    return () => {
      active = false;
    };
  }, [open]);

  const scope = useMemo(() => galleryScope(real), [real]);

  const toggle = () => {
    const next = !open;
    setCollapsed(!next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Collapses for this visit; just not remembered.
    }
  };

  const needle = query.trim().toLowerCase();
  const kinds = galleryKinds().filter((kind) => {
    if (!needle) return true;
    const label = t(`widgets.${kind}.label`).toLowerCase();
    const description = t(`widgets.${kind}.description`).toLowerCase();
    return label.includes(needle) || description.includes(needle) || kind.includes(needle);
  });

  return (
    <section className="widget-gallery" aria-label={t("gallery.title")}>
      {!embedded && (
        <div className="widget-gallery-bar">
          <button
            type="button"
            ref={toggleBtnRef}
            className="widget-gallery-toggle"
            aria-expanded={open}
            onClick={toggle}
          >
            <span className="widget-gallery-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
            {t("gallery.title")}
          </button>
        </div>
      )}

      {open && (
        <div
          className={embedded ? "widget-gallery-body" : "widget-gallery-tooltip"}
          style={embedded ? undefined : ({ ["--gallery-arrow-x" as string]: `${arrowX}px` } as React.CSSProperties)}
        >
          {/* The popover's own frame and arrow are the standalone shelf's. Inside a panel they are a
              second box drawn around the first. */}
          {!embedded && <span className="gallery-tooltip-arrow" aria-hidden="true" />}

          <div className="widget-gallery-search-bar">
            <input
              type="search"
              className="widget-gallery-search"
              value={query}
              placeholder={t("gallery.search")}
              aria-label={t("gallery.search")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <ProfileScopeProvider value={scope}>
            {kinds.length === 0 ? (
              <p className="inspector-note">{t("gallery.noMatch")}</p>
            ) : (
              <ul className="widget-gallery-grid">
                {kinds.map((kind, i) => {
                  const View = WIDGET_REGISTRY[kind];
                  const label = t(`widgets.${kind}.label`);

                  // A tile too small to show the widget shows a mark for it instead: a cropped
                  // corner of something teaches less than a symbol for the whole.
                  const need = WIDGETS[kind].minPreview;
                  const cramped = Boolean(need && tile && (tile.w < need.w || tile.h < need.h));

                  return (
                    <li
                      className="widget-card"
                      key={kind}
                      data-widget={kind}
                      ref={i === 0 ? measureTile : undefined}
                      // The tile is the drag source. A button covering it was not one: browsers do
                      // not start a drag from a form control, so dragstart never fired and nothing
                      // downstream of it — the preview, closing the panel — ever happened.
                      draggable
                      onDragStart={(e) => {
                        const id = `w-${newId()}`;
                        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id, kind }));
                        e.dataTransfer.effectAllowed = "copy";
                        announceDrag({ id, kind });
                        onDragStart?.();
                      }}
                      onDragEnd={() => cancelPreview()}
                    >
                      {/* inert: a preview holds real links and real buttons. */}
                      <div className="widget-card-preview" inert aria-hidden="true">
                        {cramped ? (
                          <WidgetIcon kind={kind} />
                        ) : (
                          <View widget={sample(kind, t)} editing={false} preview onChange={() => {}} />
                        )}
                      </div>

                      {/* A footer rather than an overlay, so the shelf stays usable without a
                          pointer while leaving the tile itself draggable. */}
                      <button
                        type="button"
                        className="widget-card-button"
                        aria-label={`${t("gallery.add")}: ${label}`}
                        title={t("gallery.dragHint")}
                        onClick={() => setConfirming(kind)}
                      >
                        <span className="widget-card-name">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ProfileScopeProvider>
        </div>
      )}

      {confirming !== null && (
        <ConfirmDialog
          title={t("gallery.confirmTitle")}
          message={t("gallery.confirmMessage", { widget: t(`widgets.${confirming}.label`) })}
          confirmLabel={t("gallery.confirmAdd")}
          cancelLabel={t("board.cancel")}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            onAdd(confirming);
            setConfirming(null);
          }}
        />
      )}
    </section>
  );
}
