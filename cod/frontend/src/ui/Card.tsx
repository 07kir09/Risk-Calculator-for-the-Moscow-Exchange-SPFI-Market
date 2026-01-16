import { ReactNode } from "react";
import classNames from "classnames";

export default function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classNames("card", className)}>{children}</div>;
}
