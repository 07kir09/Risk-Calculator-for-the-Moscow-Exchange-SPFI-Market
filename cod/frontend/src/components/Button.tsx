import { ButtonHTMLAttributes, ReactNode } from "react";
import classNames from "classnames";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  iconLeft?: ReactNode;
}

export default function Button({ variant = "primary", loading, iconLeft, children, className, ...rest }: Props) {
  return (
    <button
      className={classNames("btn", `btn-${variant}`, className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {iconLeft && <span className="btn-icon">{iconLeft}</span>}
      <span>{loading ? "Считаем..." : children}</span>
    </button>
  );
}
