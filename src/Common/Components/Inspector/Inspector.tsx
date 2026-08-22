import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InspectorProps } from "../../../Types";

const WIDTH_KEY = "hisuiki.inspector.width";
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
import Anchored from "../Anchored/Anchored";
import Glyph from "../WidgetIcon/Glyph";

/** The panel shell: a title, a tab strip, and whatever the caller puts in each tab. */
export default function Inspector({
  title,
  subtitle,
  anchor,
  align = "left",
  variant = "popover",
  tabs,
  onClose,
}: InspectorProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const sidebar = useRef<HTMLElement | null>(null);
  const dragging = useRef(false);

  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(stored) && stored > 0
        ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, stored))
        : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const shown = tabs.find((tab) => tab.id === active) ?? tabs[0];

  const body = (
    <div role="dialog" aria-label={title} className="inspector-body">
      <header className="inspector-head">
        <h2 className="inspector-title">
          {title}
          {subtitle && <span className="inspector-subtitle"> · {subtitle}</span>}
        </h2>
        <button type="button" className="inspector-close" onClick={onClose} aria-label="Close">
          <Glyph name="close" />
        </button>
      </header>

      <div className="inspector-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={shown?.id === tab.id}
            className={`inspector-tab ${shown?.id === tab.id ? "is-active" : ""}`.trim()}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="inspector-panel" role="tabpanel">
        {shown?.render()}
      </div>
    </div>
  );

  // A sidebar is not pointing at anything, so it needs no anchor and no arrow.
  if (variant === "sidebar") {
    return createPortal(
      <aside className="inspector is-sidebar" ref={sidebar} style={{ width: `${width}px` }}>
        {/* Dragged straight onto the element's style: a width in state would re-render the panel,
            and everything in it, on every pointer move. State is set once, on release. */}
        <span
          className="inspector-grip"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
          }}
          onPointerMove={(e) => {
            if (!dragging.current || !sidebar.current) return;
            const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
            sidebar.current.style.width = `${next}px`;
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
            const next = sidebar.current?.offsetWidth;
            if (next) {
              setWidth(next);
              try {
                window.localStorage.setItem(WIDTH_KEY, String(next));
              } catch {
                // Not remembered, but still resized for this visit.
              }
            }
          }}
        />
        {body}
      </aside>,
      document.body,
    );
  }

  return (
    <Anchored
      anchor={anchor}
      align={align}
      className={`inspector ${shown?.wide ? "is-wide" : ""}`.trim()}
      gap={8}
    >
      {body}
    </Anchored>
  );
}
