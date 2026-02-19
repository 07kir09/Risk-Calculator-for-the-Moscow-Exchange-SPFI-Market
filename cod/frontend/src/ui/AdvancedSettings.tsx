import { ReactNode, useMemo, useState } from "react";

export default function AdvancedSettings({
  title = "Advanced settings",
  defaultOpen = false,
  children,
  helper,
}: {
  title?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  helper?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useMemo(() => `advanced-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <section className="advancedPanel">
      <button
        type="button"
        className="advancedToggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="advancedToggleIcon" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {helper && <p className="advancedHelper">{helper}</p>}
      {open && (
        <div id={panelId} className="advancedBody">
          {children}
        </div>
      )}
    </section>
  );
}
