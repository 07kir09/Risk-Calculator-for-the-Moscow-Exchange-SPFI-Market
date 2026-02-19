import { ReactNode } from "react";
import classNames from "classnames";

export default function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  className,
}: {
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={classNames("pageHeader", className)}>
      <div className="pageHeaderText">
        {kicker && <div className="pageKicker">{kicker}</div>}
        <h1 className="pageTitle">{title}</h1>
        {subtitle && <p className="pageHint">{subtitle}</p>}
      </div>
      {actions && <div className="pageActions">{actions}</div>}
    </header>
  );
}
