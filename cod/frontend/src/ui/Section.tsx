import { ReactNode } from "react";
import classNames from "classnames";

export default function Section({
  title,
  helper,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  helper?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={classNames("sectionBlock", className)}>
      <div className="sectionHead">
        <div>
          <h2 className="sectionTitle">{title}</h2>
          {helper && <p className="sectionHelper">{helper}</p>}
        </div>
        {actions && <div className="sectionActions">{actions}</div>}
      </div>
      <div className="sectionBody">{children}</div>
    </section>
  );
}
