import { ReactNode } from "react";
import Card from "./Card";
import classNames from "classnames";

export default function ResultPanel({
  title,
  subtitle,
  summary,
  details,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  summary: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={classNames("resultPanel", className)}>
      <div className="resultPanelHead">
        <div>
          <h2 className="resultPanelTitle">{title}</h2>
          {subtitle && <p className="resultPanelSubtitle">{subtitle}</p>}
        </div>
        {actions && <div className="resultPanelActions">{actions}</div>}
      </div>
      <div className="resultPanelSummary">{summary}</div>
      {details && <div className="resultPanelDetails">{details}</div>}
    </Card>
  );
}
