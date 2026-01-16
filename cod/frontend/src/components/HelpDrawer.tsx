import { ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";

interface Props {
  title: string;
  content: ReactNode;
}

export default function HelpDrawer({ title, content }: Props) {
  const [open, setOpen] = useState(false);
  const portalRoot = useMemo(() => document.getElementById("overlay-root") ?? document.body, []);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Открыть справку
      </Button>
      {open &&
        createPortal(
          <div className="drawer-backdrop" onClick={() => setOpen(false)} role="presentation">
            <div className="drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="drawer-header">
                <div className="drawer-title">{title}</div>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Закрыть
                </Button>
              </div>
              <div className="drawer-content">{content}</div>
            </div>
          </div>,
          portalRoot
        )}
    </>
  );
}
