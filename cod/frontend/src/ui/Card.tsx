import { CSSProperties, ReactNode } from "react";
import classNames from "classnames";

export default function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={classNames("card", className)} style={style}>{children}</div>;
}
