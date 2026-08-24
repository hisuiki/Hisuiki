import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ConfirmDialogProps } from "../../../Types/TypeRegistry";

/** Modal, and focused on Cancel: the safe answer should be the one a stray Return key gives. */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;

      // Two buttons, so the trap is just a wrap at each end.
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="app-modal-overlay" onClick={onCancel}>
      <div
        className="app-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="app-modal-title" id="confirm-dialog-title">
          {title}
        </h2>
        <p className="app-modal-message">{message}</p>
        <div className="app-modal-actions">
          <button type="button" className="app-modal-btn" ref={cancelRef} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="app-modal-btn app-modal-btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
