import { PropsWithChildren } from "react";

type TableCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export function TableCard({ title, subtitle, children }: TableCardProps) {
  return (
    <section className="panel panel-padded-12 stack-8">
      <div>
        <h3 className="section-title">{title}</h3>
        {subtitle ? <p className="small-muted flow-top-2">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
