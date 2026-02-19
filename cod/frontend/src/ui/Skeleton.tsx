import { HTMLAttributes } from "react";
import classNames from "classnames";

export default function Skeleton({
  className,
  height = 16,
  width,
  ...rest
}: {
  className?: string;
  height?: number;
  width?: string | number;
} & HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("skeleton", className)} style={{ height, width, ...rest.style }} aria-hidden="true" {...rest} />;
}
