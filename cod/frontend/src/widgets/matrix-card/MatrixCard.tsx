import { PropsWithChildren } from "react";

export function MatrixCard({ children }: PropsWithChildren) {
  return (
    <section className="panel panel-padded-12 stack-10">
      {children}
    </section>
  );
}
