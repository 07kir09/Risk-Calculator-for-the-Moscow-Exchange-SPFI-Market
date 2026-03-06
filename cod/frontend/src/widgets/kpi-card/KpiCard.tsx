import { ReactNode } from "react";

type KpiCardProps = {
  title: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "positive" | "negative";
  rightSlot?: ReactNode;
};

export function KpiCard({ title, value, helper, tone = "neutral", rightSlot }: KpiCardProps) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-strong";

  return (
    <div className="panel panel-padded-12 stack-8">
      <div className="flex-row align-center justify-between gap-8">
        <p className="small-muted flow-0">{title}</p>
        {rightSlot}
      </div>
      <div className={`kpi-value numeric-value ${toneClass}`} title={value}>{value}</div>
      {helper ? <div className="small-muted">{helper}</div> : null}
    </div>
  );
}
