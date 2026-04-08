import { ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  text: string | ReactNode;
}

export default function HelpTooltip({ text }: Props) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxWidth: number } | null>(null);

  const portalRoot = useMemo(() => document.getElementById("overlay-root") ?? document.body, []);

  const updatePos = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxWidth = 320;
    const pad = 10;
    const vw = window.innerWidth;
    let left = r.left;
    if (left + maxWidth > vw - pad) left = Math.max(pad, vw - maxWidth - pad);
    left = Math.max(pad, left);
    setPos({ top: r.bottom + 10, left, maxWidth });
  };

  useEffect(() => {
    if (!open) return;
    updatePos();

    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current && ref.current.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="helpIcon"
        aria-label="Пояснение"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="srOnly">Пояснение</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="helpIconSvg">
          <path
            fill="currentColor"
            d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm0 15a1.25 1.25 0 1 1 0 2.5A1.25 1.25 0 0 1 12 17Zm1.6-5.9c-.7.4-1 .8-1 1.4v.3a1 1 0 1 1-2 0v-.5c0-1.3.7-2.3 2-3 1-.6 1.4-1 1.4-1.7a1.9 1.9 0 0 0-2.1-1.7c-1.1 0-1.9.5-2.3 1.5a1 1 0 0 1-1.9-.6c.7-1.9 2.3-2.9 4.2-2.9c2.4 0 4.1 1.5 4.1 3.7c0 1.9-1.2 2.8-2.4 3.5Z"
          />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="tooltip"
            style={{ top: pos.top, left: pos.left, maxWidth: pos.maxWidth }}
          >
            {text}
          </div>,
          portalRoot
        )}
    </>
  );
}
