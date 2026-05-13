import { ComponentProps, ReactNode } from "react";
import classNames from "classnames";
import { Button as HeroButton } from "@heroui/react";

interface Props extends Omit<ComponentProps<typeof HeroButton>, "variant" | "color"> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "shadow" | "flat";
  loading?: boolean;
  iconLeft?: ReactNode;
  disabled?: boolean;
}

export default function Button({ variant = "primary", loading, iconLeft, children, className, ...rest }: Props) {
  const visualMap = {
    primary: { variant: "solid" as const, color: "primary" as const },
    secondary: { variant: "bordered" as const, color: "default" as const },
    ghost: { variant: "light" as const, color: "default" as const },
    danger: { variant: "flat" as const, color: "danger" as const },
    shadow: { variant: "shadow" as const, color: "primary" as const },
    flat: { variant: "flat" as const, color: "default" as const },
  }[variant];

  return (
    <HeroButton
      radius="md"
      size="md"
      color={visualMap.color}
      variant={visualMap.variant}
      className={classNames("appButton", "appButtonBase", `appButton--${variant}`, className)}
      isLoading={loading}
      startContent={iconLeft}
      isDisabled={loading || rest.isDisabled || rest.disabled}
      {...rest}
    >
      {children}
    </HeroButton>
  );
}
