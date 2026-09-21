"use client";

import { LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "warning" | "destructive";
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId(), descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null), cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => { pendingRef.current = pending; }, [pending]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) onCancel();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
    };
  }, [onCancel, open]);

  if (!open) return null;
  async function performConfirmation() {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
      onCancel();
    } catch {
      // The action owns safe user feedback; keep the dialog open for retry.
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="confirm-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onCancel();
    }}>
      <div ref={dialogRef} className={`confirm-dialog is-${variant}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <button className="confirm-close" type="button" onClick={onCancel} disabled={pending} aria-label="Close confirmation"><X aria-hidden="true" /></button>
        <span className="confirm-icon"><TriangleAlert aria-hidden="true" /></span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <footer>
          <button ref={cancelRef} className="button button-ghost" type="button" onClick={onCancel} disabled={pending}>{cancelLabel}</button>
          <button className={`button ${variant === "destructive" ? "button-danger" : "button-primary"}`} type="button" onClick={performConfirmation} disabled={pending}>
            {pending && <LoaderCircle className="spinner" aria-hidden="true" />}
            {pending ? `${confirmLabel}…` : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
