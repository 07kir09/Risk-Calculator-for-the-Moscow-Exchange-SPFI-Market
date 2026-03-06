import { PropsWithChildren, ReactNode } from "react";

type ChartCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}>;

export function ChartCard({ title, subtitle, actions, children }: ChartCardProps) {
  return (
    <section className="panel panel-padded-12 stack-10 panel-min-250">
      <div className="flex-row align-center justify-between gap-8">
        <div>
          <h3 className="section-title">{title}</h3>
          {subtitle ? <p className="small-muted flow-top-2">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div className="chart-body-min">{children}</div>
    </section>
  );
}
