export type GlyphName = "close" | "duplicate" | "settings" | "grip" | "search" | "caret";

const PATHS: Record<GlyphName, string> = {
  close: "M5 5l10 10M15 5L5 15",
  duplicate: "M4 4h9v9H4zM7 16h9V7",
  settings: "M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM10 2v2.4M10 15.6V18M2 10h2.4M15.6 10H18M4.3 4.3l1.7 1.7M14 14l1.7 1.7M15.7 4.3L14 6M6 14l-1.7 1.7",
  grip: "M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01",
  search: "M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3zM13.5 13.5L17 17",
  caret: "M5 7l5 5 5-5",
};

/** A small drawn mark. Buttons carrying a unicode glyph render tofu wherever the font lacks it. */
export default function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg className="glyph" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={name === "grip" ? 2.4 : 1.7}
        strokeLinecap="round"
      />
    </svg>
  );
}
