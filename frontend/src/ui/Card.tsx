import { CSSProperties, ReactNode } from "react";
import classNames from "classnames";
import { Card as HeroCard } from "@heroui/react";

export default function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <HeroCard
      className={classNames("card", "cardBase", className)}
      radius="lg"
      shadow="sm"
      style={style}
    >
      <HeroCard.Content className="cardBody">{children}</HeroCard.Content>
    </HeroCard>
  );
}
