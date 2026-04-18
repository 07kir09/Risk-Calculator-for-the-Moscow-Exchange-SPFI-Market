import { ChartInsightItem } from "../../lib/chartInsights";

export function ChartInsights({
  items,
  className,
}: {
  items: ChartInsightItem[];
  className?: string;
}) {
  const safeItems = items.filter((item) => item.text.trim().length > 0);
  if (!safeItems.length) return null;

  return (
    <div className={`chartInsightList ${className ?? ""}`}>
      {safeItems.map((item) => (
        <div key={`${item.label}-${item.text}`} className={`chartInsightCard chartInsightCard--${item.tone ?? "default"}`}>
          <div className="chartInsightLabel">{item.label}</div>
          <p className="chartInsightText">{item.text}</p>
        </div>
      ))}
    </div>
  );
}
