import { ReactNode } from "react";
import Card from "./Card";
import HelpTooltip from "../components/HelpTooltip";

export default function KpiCard({
  label,
  value,
  helper,
  tooltip,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tooltip?: string;
}) {
  return (
    <Card className="kpiCard">
      <div className="kpiCardLabel">
        <span>{label}</span>
        {tooltip && <HelpTooltip text={tooltip} />}
      </div>
      <div className="kpiCardValue">{value}</div>
      {helper && <div className="kpiCardHelper">{helper}</div>}
    </Card>
  );
}
