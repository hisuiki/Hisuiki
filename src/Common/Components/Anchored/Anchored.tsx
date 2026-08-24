import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnchoredProps } from "../../../Types/TypeRegistry";

/** Clearance from the viewport edges. */
const MARGIN = 8;

/** Half the arrow's width, so it can be kept off the panel's own corners. */
const ARROW = 9;

interface Placement {
  top: number;
  left: number;
  /** Which side of the anchor the panel ended up on. */
  side: "above" | "below";
  /** Where the arrow sits along the panel's width, in pixels from its left edge. */
  arrow: number;
  maxHeight: number;
}

/**
 * A panel pointing at an element, portalled out of it.
 *
 * Positioned in viewport coordinates so no clipping or stacking context between the anchor and the
 * page can swallow it. It measures itself, flips above the anchor when there is not room below, and
 * shifts sideways to stay on screen — the arrow tracks the anchor rather than the panel, so it keeps
 * pointing at what the panel is about even once the panel has been nudged.
 */
export default function Anchored({ anchor, align = "left", className, gap = 10, children }: AnchoredProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const target = anchor.current;
      const box = panel.current;
      if (!target || !box) return;

      const rect = target.getBoundingClientRect();
      const width = box.offsetWidth;
      const height = box.offsetHeight;
      const view = { w: window.innerWidth, h: window.innerHeight };

      const below = view.h - rect.bottom - gap - MARGIN;
      const above = rect.top - gap - MARGIN;
      // Prefer below, flip when it does not fit and there is genuinely more room the other way.
      const side: Placement["side"] = height <= below || below >= above ? "below" : "above";
      const maxHeight = Math.max(120, side === "below" ? below : above);

      const wanted = align === "right" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(MARGIN, wanted), Math.max(MARGIN, view.w - width - MARGIN));

      const top =
        side === "below" ? rect.bottom + gap : Math.max(MARGIN, rect.top - gap - Math.min(height, maxHeight));

      // Clamped so the arrow never hangs off the panel's own corner.
      const centre = rect.left + rect.width / 2;
      const arrow = Math.min(Math.max(ARROW + 2, centre - left), Math.max(ARROW + 2, width - ARROW - 2));

      setPlace((current) =>
        current &&
        current.top === top &&
        current.left === left &&
        current.side === side &&
        current.arrow === arrow &&
        current.maxHeight === maxHeight
          ? current
          : { top, left, side, arrow, maxHeight },
      );
    };

    measure();

    // Capture, so scrolling inside any container the anchor sits in is heard too.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchor, align, gap, children]);

  // The panel changes height as tabs are switched, which changes whether it still fits.
  useEffect(() => {
    const box = panel.current;
    if (!box || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => window.dispatchEvent(new Event("resize")));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panel}
      className={`anchored ${className ?? ""}`.trim()}
      data-side={place?.side ?? "below"}
      style={{
        position: "fixed",
        top: place ? `${place.top}px` : "-9999px",
        left: place ? `${place.left}px` : "-9999px",
        maxHeight: place ? `${place.maxHeight}px` : undefined,
        // Hidden for the frame before it has been measured, rather than shown in the wrong place.
        visibility: place ? "visible" : "hidden",
        ["--arrow-x" as string]: `${place?.arrow ?? 0}px`,
      }}
    >
      <span className="anchored-arrow" aria-hidden="true" />
      {children}
    </div>,
    document.body,
  );
}
