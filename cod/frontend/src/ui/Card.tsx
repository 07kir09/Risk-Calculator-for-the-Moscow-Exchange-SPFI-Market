import { HTMLAttributes, ReactNode } from "react";
import classNames from "classnames";

export default function Card({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classNames("card", className)} {...rest}>
      {children}
    </div>
  );
}
