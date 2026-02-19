import { ReactNode } from "react";
import classNames from "classnames";

export type StateTone = "info" | "success" | "warning" | "error";

export default function StatePanel({
  title,
  description,
  tone = "info",
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  tone?: StateTone;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={classNames("statePanel", `statePanel--${tone}`, className)} role="status" aria-live="polite">
      <div className="statePanelBody">
        <h2 className="statePanelTitle">{title}</h2>
        {description && <p className="statePanelText">{description}</p>}
      </div>
      {action && <div className="statePanelAction">{action}</div>}
    </section>
  );
}
