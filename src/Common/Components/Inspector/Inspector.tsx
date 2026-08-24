import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  SCROLLS,
  FLOWS,
  WIDGETS,
  isContainer,
  addWidget,
  columnsOf,
  gapOf,
  flowOf,
  inheritanceChoiceOf,
  inheritanceInTree,
  parentOf,
  rowsOf,
  scrollOf,
  spanOf,
} from "../../../Services/LayoutUtils";
import {
  BORDERS,
  DEFAULT_STYLE,
  FONTS,
  FONT_KEYS,
  MAX_BLUR,
  PALETTE,
  SHADOWS,
  styleOf,
} from "../../../Services/WidgetStyleUtils";
import { ROUTE_KEYS, titleAction } from "../../../Services/TitleWidgetUtils";
import { usePageLayout } from "../../../Services/PageLayoutProvider";
import type { InspectorProps } from "../../../Types/TypeRegistry";
import WidgetGallery from "../WidgetGallery/WidgetGallery";
import Glyph from "../WidgetIcon/Glyph";
import { Check, Field, Group, Note, Select, Slider, TextField } from "./InspectorFields";

const MODE_KEY = "hisuiki.inspector.mode";
const WIDTH_KEY = "hisuiki.inspector.width";
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 1200;
const PAGE_ROOM = 320;

const widthLimit = () => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - PAGE_ROOM));

/**
 * The unified Inspector panel for configuring a widget or the whole board.
 * Supports docked sidebar mode and detached draggable floating tooltip mode.
 */
export default function Inspector({
  widget,
  title,
  subtitle,
  anchor,
  variant,
  onChange,
  onClose,
}: InspectorProps) {
  const { t } = useTranslation();
  const { root, board } = usePageLayout();

  const isRoot = widget.id === root.id;
  const style = styleOf(widget);
  const container = isContainer(widget) || isRoot;
  const action = titleAction(widget);
  const hasGeneral = widget.kind === "title" || widget.kind === "webamp" || widget.kind === "boards";
  const spec = WIDGETS[widget.kind];
  const parent = isRoot ? null : (parentOf(root, widget.id) ?? root);
  const parentFlow = parent ? flowOf(parent) : "grid";
  const hasSizeControls = !isRoot && parentFlow === "grid" && (
    (spec?.maxSpan ?? 12) > (spec?.minSpan ?? 1) ||
    (spec?.maxRows ?? 20) > (spec?.minRows ?? 1)
  );

  const [mode, setMode] = useState<"sidebar" | "floating">(() => {
    if (variant === "sidebar") return "sidebar";
    if (variant === "floating" || variant === "popover") return "floating";
    try {
      const stored = window.localStorage.getItem(MODE_KEY);
      return stored === "floating" ? "floating" : "sidebar";
    } catch {
      return "sidebar";
    }
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (hasGeneral) return "general";
    if (container || hasSizeControls) return "layout";
    return "customize";
  });

  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(stored) && stored > 0
        ? Math.min(widthLimit(), Math.max(MIN_WIDTH, stored))
        : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (anchor?.current) {
      const r = anchor.current.getBoundingClientRect();
      return {
        x: Math.min(window.innerWidth - DEFAULT_WIDTH - 16, Math.max(16, r.right + 12)),
        y: Math.max(64, Math.min(window.innerHeight - 320, r.top)),
      };
    }
    return {
      x: Math.max(16, window.innerWidth - DEFAULT_WIDTH - 24),
      y: 72,
    };
  });

  const sidebarRef = useRef<HTMLElement | null>(null);
  const resizingSidebar = useRef(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const isDraggingHead = useRef(false);

  // When docked as sidebar, publish width to document root so the page can make room.
  useLayoutEffect(() => {
    if (mode !== "sidebar") {
      document.documentElement.classList.remove("is-resizing-inspector");
      document.documentElement.style.removeProperty("--inspector-width");
      return () => {};
    }
    const docRoot = document.documentElement;
    docRoot.style.setProperty("--inspector-width", `${width}px`);
    return () => {
      docRoot.style.removeProperty("--inspector-width");
      docRoot.classList.remove("is-resizing-inspector");
    };
  }, [mode, width]);

  const toggleMode = () => {
    const nextMode = mode === "sidebar" ? "floating" : "sidebar";
    setMode(nextMode);
    try {
      window.localStorage.setItem(MODE_KEY, nextMode);
    } catch {
      // Ignored if storage is blocked
    }
    if (nextMode === "floating") {
      setPos({
        x: Math.max(16, window.innerWidth - width - 24),
        y: 72,
      });
    }
  };

  const onHeadPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, .inspector-tabs, [role='tab']")) {
      return;
    }
    if (mode !== "floating") return;

    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture may fail on certain touch devices
    }
    isDraggingHead.current = true;
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: pos.x,
      startY: pos.y,
    };
  };

  const onHeadPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDraggingHead.current || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.mouseX;
    const dy = e.clientY - dragStart.current.mouseY;
    const nextX = Math.max(12, Math.min(window.innerWidth - 120, dragStart.current.startX + dx));
    const nextY = Math.max(12, Math.min(window.innerHeight - 60, dragStart.current.startY + dy));
    setPos({ x: nextX, y: nextY });
  };

  const onHeadPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDraggingHead.current) return;
    isDraggingHead.current = false;
    dragStart.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture release
    }
  };

  const setProp = (key: string, value: string | number | boolean) =>
    onChange({ ...widget, props: { ...widget.props, [key]: value } });

  const setInheritance = (value: "inherit" | "site" | "page") => {
    const props = { ...widget.props };
    if (value === "inherit") delete props.inheritance;
    else props.inheritance = value;
    onChange({ ...widget, props });
  };

  const setStyle = (patch: Partial<typeof style>) =>
    onChange({ ...widget, style: { ...widget.style, ...patch } });

  const general = () => (
    <>
      {widget.kind === "title" && (
        <>
          <Select
            label={t("title.action")}
            value={action.kind}
            options={(["route", "path", "external"] as const).map((kind) => ({
              value: kind,
              label: t(`title.actions.${kind}`),
            }))}
            onChange={(kind) => setProp("action", kind)}
          />

          {action.kind === "route" && (
            <Select
              label={t("title.page")}
              value={action.route}
              options={ROUTE_KEYS.map((key) => ({ value: key, label: t(`routes.${key}`) }))}
              onChange={(route) => setProp("route", route)}
            />
          )}

          {action.kind === "path" && (
            <TextField
              label={t("title.path")}
              value={String(widget.props?.path ?? "")}
              placeholder="/posts/…"
              onChange={(value) => setProp("path", value)}
            />
          )}

          {action.kind === "external" && (
            <TextField
              label={t("link.href")}
              value={String(widget.props?.href ?? "")}
              placeholder="https://"
              onChange={(value) => setProp("href", value)}
            />
          )}

          <TextField
            label={t("link.label")}
            value={String(widget.props?.label ?? "")}
            onChange={(value) => setProp("label", value)}
          />
        </>
      )}

      {widget.kind === "webamp" && (
        <>
          <TextField
            label={t("webamp.src")}
            value={String(widget.props?.src ?? "")}
            placeholder="https://"
            onChange={(value) => setProp("src", value)}
          />
          <TextField
            label={t("webamp.title")}
            value={String(widget.props?.title ?? "")}
            onChange={(value) => setProp("title", value)}
          />
          <TextField
            label={t("webamp.artist")}
            value={String(widget.props?.artist ?? "")}
            onChange={(value) => setProp("artist", value)}
          />
          <Check
            label={t("webamp.equalizer")}
            checked={widget.props?.equalizer === true}
            onChange={(on) => setProp("equalizer", on)}
          />
          <Check
            label={t("webamp.playlist")}
            checked={widget.props?.playlist === true}
            onChange={(on) => setProp("playlist", on)}
          />
        </>
      )}

      {widget.kind === "boards" && (
        <>
          <Select
            label={t("boardsWidget.feed")}
            value={String(widget.props?.feed ?? "home")}
            options={(["home", "explore"] as const).map((value) => ({
              value,
              label: t(`boardsWidget.feeds.${value}`),
            }))}
            onChange={(value) => setProp("feed", value)}
          />
          <Select
            label={t("boardsWidget.sort")}
            value={String(widget.props?.sort ?? "trending")}
            options={(["trending", "recent", "random"] as const).map((value) => ({
              value,
              label: t(`boardsWidget.sorts.${value}`),
            }))}
            onChange={(value) => setProp("sort", value)}
          />
          <Slider
            label={t("boardsWidget.limit")}
            value={Number(widget.props?.limit ?? 12)}
            min={1}
            max={50}
            step={1}
            display={String(widget.props?.limit ?? 12)}
            onChange={(value) => setProp("limit", value)}
          />
          <TextField
            label={t("boardsWidget.heading")}
            value={String(widget.props?.heading ?? "")}
            onChange={(value) => setProp("heading", value)}
          />
          <Check
            label={t("boardsWidget.showHeading")}
            checked={widget.props?.showHeading !== false}
            onChange={(value) => setProp("showHeading", value)}
          />
          <Check
            label={t("boardsWidget.showControls")}
            checked={widget.props?.showControls === true}
            onChange={(value) => setProp("showControls", value)}
          />
        </>
      )}
    </>
  );

  const layout = () => (
    <>
      {hasSizeControls && (
        <>
          {(spec?.maxSpan ?? 12) > (spec?.minSpan ?? 1) && (
            <Slider
              label={t("layout.span")}
              value={spanOf(widget, 12)}
              min={spec?.minSpan ?? 1}
              max={spec?.maxSpan ?? 12}
              step={1}
              display={String(spanOf(widget, 12))}
              onChange={(span) => setProp("span", span)}
            />
          )}
          {(spec?.maxRows ?? 20) > (spec?.minRows ?? 1) && (
            <Slider
              label={t("layout.rows")}
              value={rowsOf(widget)}
              min={spec?.minRows ?? 1}
              max={spec?.maxRows ?? 20}
              step={1}
              display={String(rowsOf(widget))}
              onChange={(rows) => setProp("rows", rows)}
            />
          )}
        </>
      )}

      {container && (
        <>
          <Select
            label={t("layout.flow")}
            value={flowOf(widget)}
            options={FLOWS.map((value) => ({ value, label: t(`flows.${value}`) }))}
            onChange={(value) => setProp("flow", value)}
          />

          {flowOf(widget) === "grid" && (
            <Slider
              label={t("layout.columns")}
              value={columnsOf(widget)}
              min={1}
              max={12}
              step={1}
              display={String(columnsOf(widget))}
              onChange={(columns) => setProp("columns", columns)}
            />
          )}

          <Slider
            label={t("layout.gap")}
            value={gapOf(widget)}
            min={0}
            max={48}
            step={1}
            display={`${gapOf(widget)}px`}
            onChange={(gap) => setProp("gap", gap)}
          />

          <Select
            label={t("inspector.scroll")}
            value={scrollOf(widget)}
            options={SCROLLS.map((value) => ({ value, label: t(`inspector.scrolls.${value}`) }))}
            onChange={(value) => setProp("scroll", value)}
          />
          <Note>{t("inspector.scrollBehavior")}</Note>
          {scrollOf(widget) !== "none" && <Note>{t("inspector.scrollNote")}</Note>}
        </>
      )}
    </>
  );

  const widgetsTab = () => (
    <WidgetGallery
      embedded
      onAdd={(kind) => onChange({ ...widget, children: addWidget(widget.children ?? [], kind) })}
    />
  );

  const customize = () => (
    <>
      {board?.systemPage && !isRoot && (
        <>
          <Select
            label={t("inspector.inheritance")}
            value={inheritanceChoiceOf(widget)}
            options={(["inherit", "site", "page"] as const).map((value) => ({
              value,
              label: t(`inspector.inheritances.${value}`),
            }))}
            onChange={setInheritance}
          />
          <Note>
            {t(
              inheritanceChoiceOf(widget) === "inherit"
                ? inheritanceInTree(root, widget.id) === "site"
                  ? "inspector.inheritanceInheritedSite"
                  : "inspector.inheritanceInheritedPage"
                : inheritanceChoiceOf(widget) === "site"
                  ? "inspector.inheritanceSiteNote"
                  : "inspector.inheritancePageNote",
            )}
          </Note>
        </>
      )}

      <Slider
        label={t("inspector.blur")}
        value={style.blur ?? 0}
        min={0}
        max={MAX_BLUR}
        step={1}
        display={`${style.blur}px`}
        onChange={(blur) => setStyle({ blur })}
      />
      <Slider
        label={t("inspector.opacity")}
        value={style.opacity ?? 0}
        min={0}
        max={1}
        step={0.05}
        display={`${Math.round((style.opacity ?? 0) * 100)}%`}
        onChange={(opacity) => setStyle({ opacity })}
      />
      <Select
        label={t("inspector.border")}
        value={style.border ?? "none"}
        options={BORDERS.map((border) => ({ value: border, label: t(`inspector.borders.${border}`) }))}
        onChange={(border) => setStyle({ border })}
      />
      <Select
        label={t("inspector.shadow")}
        value={style.shadow ?? "none"}
        options={SHADOWS.map((shadow) => ({ value: shadow, label: t(`inspector.shadows.${shadow}`) }))}
        onChange={(shadow) => setStyle({ shadow })}
      />

      <Select
        label={t("inspector.font")}
        value={style.font ?? "system"}
        options={FONT_KEYS.map((key) => ({
          value: key,
          label: FONTS[key]!.label,
          style: { fontFamily: FONTS[key]!.stack || undefined },
        }))}
        onChange={(font) => setStyle({ font: font === "system" ? undefined : font })}
      />
      <p
        className="inspector-font-preview"
        style={{ fontFamily: (style.font && FONTS[style.font]?.stack) || undefined }}
      >
        {t("inspector.fontSample")}
      </p>

      <Group label={t("inspector.accent")}>
        <div className="inspector-swatches" role="group" aria-label={t("inspector.accent")}>
          {PALETTE.map((colour) => (
            <button
              type="button"
              key={colour}
              className={`inspector-swatch ${style.accent === colour ? "is-active" : ""}`.trim()}
              style={{ background: colour }}
              aria-label={colour}
              aria-pressed={style.accent === colour}
              title={colour}
              onClick={() => setStyle({ accent: colour })}
            />
          ))}
        </div>
        <span className="inspector-colour">
          <input
            type="color"
            aria-label={t("inspector.custom")}
            value={style.accent ?? "#5468e0"}
            onChange={(e) => setStyle({ accent: e.target.value })}
          />
          <code className="inspector-hex">{style.accent ?? t("inspector.inherited")}</code>
          {style.accent && (
            <button type="button" className="widget-btn" onClick={() => setStyle({ accent: undefined })}>
              {t("inspector.clear")}
            </button>
          )}
        </span>
      </Group>

      <button
        type="button"
        className="widget-btn inspector-reset"
        onClick={() => setStyle({ ...DEFAULT_STYLE, accent: undefined, font: undefined })}
      >
        {t("inspector.reset")}
      </button>
    </>
  );

  const advanced = () => (
    <>
      <Field label={t("inspector.css")}>
        <textarea
          className="inspector-css"
          rows={10}
          spellCheck={false}
          value={style.css ?? ""}
          placeholder=".widget-content { letter-spacing: 0.1em; }"
          onChange={(e) => setStyle({ css: e.target.value })}
        />
      </Field>
      <Note>{t("inspector.cssNote")}</Note>

    </>
  );

  const tabs = [
    ...(hasGeneral ? [{ id: "general", label: t("inspector.tabs.general"), render: general }] : []),
    ...(container || hasSizeControls
      ? [{ id: "layout", label: t("inspector.tabs.layout"), render: layout }]
      : []),
    ...(container
      ? [{ id: "widgets", label: t("inspector.tabs.widgets"), render: widgetsTab, wide: true }]
      : []),
    { id: "customize", label: t("inspector.tabs.customize"), render: customize },
    { id: "advanced", label: t("inspector.tabs.advanced"), render: advanced },
  ];

  const shownTab = tabs.find((tItem) => tItem.id === activeTab) ?? tabs[0];
  const displaySubtitle = subtitle ?? (isRoot ? t("inspector.board") : (title ?? t(`widgets.${widget.kind}.label`)));

  const body = (
    <div role="dialog" aria-label={t("inspector.title")} className="inspector-body">
      <header
        className="inspector-head"
        onPointerDown={onHeadPointerDown}
        onPointerMove={onHeadPointerMove}
        onPointerUp={onHeadPointerUp}
        onPointerCancel={onHeadPointerUp}
      >
        <h2 className="inspector-title">
          {t("inspector.title")}
          {displaySubtitle && <span className="inspector-subtitle"> · {displaySubtitle}</span>}
        </h2>
        <div className="inspector-actions">
          <button
            type="button"
            className="inspector-btn inspector-mode-btn"
            onClick={toggleMode}
            title={mode === "sidebar" ? t("inspector.detach") : t("inspector.dock")}
            aria-label={mode === "sidebar" ? t("inspector.detach") : t("inspector.dock")}
          >
            <Glyph name={mode === "sidebar" ? "detach" : "dock"} />
          </button>
          <button
            type="button"
            className="inspector-btn inspector-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Glyph name="close" />
          </button>
        </div>
      </header>

      <div className="inspector-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={shownTab?.id === tab.id}
            className={`inspector-tab ${shownTab?.id === tab.id ? "is-active" : ""}`.trim()}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="inspector-panel" role="tabpanel">
        {shownTab?.render()}
      </div>
    </div>
  );

  if (mode === "sidebar") {
    return createPortal(
      <aside className="inspector is-sidebar" ref={sidebarRef} style={{ width: `${width}px` }}>
        <span
          className="inspector-grip"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize"
          onPointerDown={(e) => {
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Pointer capture may fail
            }
            resizingSidebar.current = true;
            document.documentElement.classList.add("is-resizing-inspector");
          }}
          onPointerMove={(e) => {
            if (!resizingSidebar.current || !sidebarRef.current) return;
            const next = Math.min(widthLimit(), Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
            sidebarRef.current.style.width = `${next}px`;
            document.documentElement.style.setProperty("--inspector-width", `${next}px`);
          }}
          onPointerUp={(e) => {
            resizingSidebar.current = false;
            document.documentElement.classList.remove("is-resizing-inspector");
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              // Pointer capture release
            }
            const next = sidebarRef.current?.offsetWidth;
            if (next) {
              setWidth(next);
              try {
                window.localStorage.setItem(WIDTH_KEY, String(next));
              } catch {
                // Not remembered, but still resized
              }
            }
          }}
        />
        {body}
      </aside>,
      document.body,
    );
  }

  return createPortal(
    <aside
      className={`inspector is-floating ${shownTab?.wide ? "is-wide" : ""}`.trim()}
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${width}px` }}
    >
      {body}
    </aside>,
    document.body,
  );
}
