import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FLOWS,
  SCROLLS,
  SIZES,
  WIDGETS,
  flowOf,
  isContainer,
  addWidget,
  columnsOf,
  gapOf,
  rowHeightOf,
  scrollOf,
  slotOf,
} from "../../../Services/layout";
import {
  BORDERS,
  DEFAULT_STYLE,
  FONTS,
  FONT_KEYS,
  MAX_BLUR,
  PALETTE,
  SHADOWS,
  styleOf,
} from "../../../Services/widgetStyle";
import { ROUTE_KEYS, titleAction } from "../../../Services/titleWidget";
import type { Anchor, WidgetInspectorProps, WidgetSize, WidgetStyle } from "../../../Types";
import Inspector from "./Inspector";
import SlotPicker from "./SlotPicker";
import WidgetGallery from "../WidgetGallery/WidgetGallery";
import { Check, Field, Group, Note, Select, Slider, TextField } from "./fields";

export default function WidgetInspector({ widget, anchor, onChange, onClose }: WidgetInspectorProps) {
  const { t } = useTranslation();

  const spec = WIDGETS[widget.kind];
  const style = styleOf(widget);
  const container = isContainer(widget);
  const action = titleAction(widget);
  const [slot, setSlot] = useState<Anchor>("top");

  const setProp = (key: string, value: string | number | boolean) =>
    onChange({ ...widget, props: { ...widget.props, [key]: value } });

  const setStyle = (patch: Partial<typeof style>) =>
    onChange({ ...widget, style: { ...widget.style, ...patch } });

  const general = () => (
    <>
      <Select
        label={t("inspector.size")}
        value={widget.size}
        disabled={spec.sizes.length < 2}
        options={SIZES.filter((size) => spec.sizes.includes(size)).map((size) => ({
          value: size as WidgetSize,
          label: t(`inspector.sizes.${size}`),
        }))}
        onChange={(size) => onChange({ ...widget, size })}
      />

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


    </>
  );

  const flow = flowOf(widget);
  const slotStyle = widget.slots?.[slot] ?? {};

  const setSlotStyle = (patch: Partial<WidgetStyle>) =>
    onChange({ ...widget, slots: { ...widget.slots, [slot]: { ...slotStyle, ...patch } } });

  const layout = () => (
    <>
      <Select
        label={t("board.layout")}
        value={flow}
        options={FLOWS.map((value) => ({ value, label: t(`flows.${value}`) }))}
        onChange={(value) => setProp("flow", value)}
      />
      <Note>{t(`layout.about.${flow}`)}</Note>

      <Select
        label={t("inspector.scroll")}
        value={scrollOf(widget)}
        options={SCROLLS.map((value) => ({ value, label: t(`inspector.scrolls.${value}`) }))}
        onChange={(value) => setProp("scroll", value)}
      />
      {scrollOf(widget) !== "none" && <Note>{t("inspector.scrollNote")}</Note>}

      <Slider
        label={t("layout.gap")}
        value={gapOf(widget)}
        min={0}
        max={48}
        step={1}
        display={`${gapOf(widget)}px`}
        onChange={(gap) => setProp("gap", gap)}
      />

      {(flow === "grid" || flow === "free") && (
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

      {flow === "free" && (
        <>
          <Slider
            label={t("layout.snap")}
            value={rowHeightOf(widget)}
            min={24}
            max={240}
            step={4}
            display={`${rowHeightOf(widget)}px`}
            onChange={(rowHeight) => setProp("rowHeight", rowHeight)}
          />
          <Note>{t("layout.snapNote")}</Note>
        </>
      )}

      {/* One panel for all five slots: pick the slot, then style that one. */}
      {flow === "anchors" && (
        <>
          <Group label={t("layout.slots")}>
            <SlotPicker
              value={slot}
              filled={new Set((widget.children ?? []).map(slotOf))}
              onChange={setSlot}
            />
          </Group>

          <Slider
            label={t("inspector.blur")}
            value={slotStyle.blur ?? 0}
            min={0}
            max={MAX_BLUR}
            step={1}
            display={`${slotStyle.blur ?? 0}px`}
            onChange={(blur) => setSlotStyle({ blur })}
          />
          <Slider
            label={t("inspector.opacity")}
            value={slotStyle.opacity ?? 0}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round((slotStyle.opacity ?? 0) * 100)}%`}
            onChange={(opacity) => setSlotStyle({ opacity })}
          />
          <Select
            label={t("inspector.border")}
            value={slotStyle.border ?? "none"}
            options={BORDERS.map((value) => ({ value, label: t(`inspector.borders.${value}`) }))}
            onChange={(border) => setSlotStyle({ border })}
          />
          <Select
            label={t("inspector.shadow")}
            value={slotStyle.shadow ?? "none"}
            options={SHADOWS.map((value) => ({ value, label: t(`inspector.shadows.${value}`) }))}
            onChange={(shadow) => setSlotStyle({ shadow })}
          />
          <button
            type="button"
            className="widget-btn inspector-reset"
            onClick={() => onChange({ ...widget, slots: { ...widget.slots, [slot]: undefined } })}
          >
            {t("layout.clearSlot")}
          </button>
        </>
      )}
    </>
  );

  // Adds into this container, so the shelf is wherever you are working rather than above the page.
  const widgetsTab = () => (
    <WidgetGallery
      embedded
      onAdd={(kind) => onChange({ ...widget, children: addWidget(widget.children ?? [], kind) })}
      onDragStart={onClose}
    />
  );

  const customize = () => (
    <>
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

  return (
    <Inspector
      title={t(`widgets.${widget.kind}.label`)}
      anchor={anchor}
      onClose={onClose}
      tabs={[
        { id: "general", label: t("inspector.tabs.general"), render: general },
        ...(container
          ? [
              { id: "layout", label: t("inspector.tabs.layout"), render: layout },
              { id: "widgets", label: t("inspector.tabs.widgets"), render: widgetsTab, wide: true },
            ]
          : []),
        { id: "customize", label: t("inspector.tabs.customize"), render: customize },
        { id: "advanced", label: t("inspector.tabs.advanced"), render: advanced },
      ]}
    />
  );
}
