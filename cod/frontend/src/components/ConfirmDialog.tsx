import { ReactNode, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import Button from "./Button";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Продолжить",
  cancelText = "Отмена",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const portalRoot = useMemo(() => document.getElementById("overlay-root") ?? document.body, []);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-ghost" type="button" onClick={onCancel} aria-label="Закрыть">
            Закрыть
          </button>
        </div>
        <div className="modal-body">{description}</div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    portalRoot
  );
}
