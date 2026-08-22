import { useTranslation } from "react-i18next";
import type { WidgetKind } from "../../../Types";

/** Simple marks, drawn rather than typed, so no font has to have the glyph. */
const PATHS: Partial<Record<WidgetKind, string>> = {
  webamp: "M8 30h6l6-6v16l-6-6H8zM28 20a12 12 0 0 1 0 16M34 15a19 19 0 0 1 0 26",
  timeline: "M8 12h32M8 22h32M8 32h20M8 42h26",
  heatmap: "M8 16h6v6H8zM18 16h6v6h-6zM28 16h6v6h-6zM38 16h6v6h-6zM8 28h6v6H8zM18 28h6v6h-6zM28 28h6v6h-6z",
  identity: "M24 22a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM10 42c0-8 6-13 14-13s14 5 14 13",
  content: "M8 10h32v28H8zM8 20h32M16 28h16",
  colophon: "M8 18h32M8 26h24M8 34h28",
  brand: "M24 8a16 16 0 1 0 0 32 16 16 0 0 0 0-32zM24 18a6 6 0 1 0 0 12 6 6 0 0 0 0-12z",
  container: "M6 10h36v28H6zM18 10v28M30 10v28",
  account: "M24 24a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8 42c0-9 7-14 16-14s16 5 16 14",
  links: "M20 28a8 8 0 0 1 0-11l5-5a8 8 0 0 1 11 11l-3 3M28 20a8 8 0 0 1 0 11l-5 5a8 8 0 0 1-11-11l3-3",
  bio: "M10 8h20l8 8v24H10zM30 8v8h8M16 24h16M16 32h12",
  text: "M10 12h28M18 12v26M10 12v-2M38 12v-2",
  title: "M10 14h28M10 24h20M10 34h24",
  spacer: "M10 24h28M14 18l-4 6 4 6M34 18l4 6-4 6",
};

/** Shown where a live preview would be cropped past the point of telling you anything. */
export default function WidgetIcon({ kind }: { kind: WidgetKind }) {
  const { t } = useTranslation();

  return (
    <span className="widget-icon" role="img" aria-label={t(`widgets.${kind}.label`)}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path
          d={PATHS[kind] ?? "M8 10h32v28H8z"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
      </svg>
    </span>
  );
}
