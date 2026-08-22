import { useState } from "react";
import type { InspectorProps } from "../../../Types";
import Anchored from "../Anchored/Anchored";

/** The panel shell: a title, a tab strip, and whatever the caller puts in each tab. */
export default function Inspector({
  title,
  subtitle,
  anchor,
  align = "left",
  tabs,
  onClose,
}: InspectorProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const shown = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <Anchored anchor={anchor} align={align} className={`inspector ${shown?.wide ? "is-wide" : ""}`.trim()} gap={8}>
      <div role="dialog" aria-label={title} className="inspector-body">
        <header className="inspector-head">
          <h2 className="inspector-title">
            {title}
            {subtitle && <span className="inspector-subtitle"> · {subtitle}</span>}
          </h2>
          <button type="button" className="inspector-close" onClick={onClose} aria-label="Close">
            ✕
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
    </Anchored>
  );
}
