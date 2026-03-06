type MetricCardProps = {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
};

export function MetricCard({ label, value, tone = "neutral" }: MetricCardProps) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-strong";
  return (
    <div className="panel panel-padded-10 stack-4">
      <span className="small-muted">{label}</span>
      <strong className={`numeric-value ${toneClass}`} title={value}>{value}</strong>
    </div>
  );
}
