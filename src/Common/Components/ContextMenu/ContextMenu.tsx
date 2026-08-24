import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ContextMenuProps } from "../../../Types";

/** Kept off the edges: a menu opened near the bottom right should not open off-screen. */
const MARGIN = 8;
const WIDTH = 200;

/**
 * The right-click menu for a widget.
 *
 * Portalled and positioned in viewport coordinates for the same reason every other panel here is:
 * a widget can sit inside a container that clips or establishes a stacking context, and a menu that
 * disappears depending on where its widget was dragged is worse than no menu.
 *
 * A submenu opens on hover and on click both. Hover alone is a mouse assumption, and this is the
 * only route to wrapping a selection — it should not be the one part of arranging a page that needs
 * a pointer.
 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent | PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    // Capture, so a click anywhere closes this before that click does anything else.
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const left = Math.min(x, window.innerWidth - WIDTH - MARGIN);
  const top = Math.min(y, window.innerHeight - items.length * 34 - MARGIN);

  return createPortal(
    <div
      className="context-menu"
      role="menu"
      ref={root}
      style={{ position: "fixed", left: Math.max(MARGIN, left), top: Math.max(MARGIN, top), width: WIDTH }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item) => {
        const branch = Array.isArray(item.items) && item.items.length > 0;

        return (
          <div
            className="context-menu-row"
            key={item.label}
            onMouseEnter={() => setOpen(branch ? item.label : null)}
          >
            <button
              type="button"
              role="menuitem"
              aria-haspopup={branch || undefined}
              aria-expanded={branch ? open === item.label : undefined}
              className={`context-menu-item ${item.danger ? "is-danger" : ""}`.trim()}
              onClick={(e) => {
                e.stopPropagation();
                if (branch) {
                  setOpen(open === item.label ? null : item.label);
                  return;
                }
                item.onSelect?.();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {branch && <span className="context-menu-caret" aria-hidden="true">›</span>}
            </button>

            {branch && open === item.label && (
              <div className="context-menu-sub" role="menu">
                {item.items!.map((child) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={child.label}
                    className="context-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      child.onSelect?.();
                      onClose();
                    }}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
