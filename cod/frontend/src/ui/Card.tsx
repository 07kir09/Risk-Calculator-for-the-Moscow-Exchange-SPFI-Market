import { CSSProperties, ReactNode } from "react";
import classNames from "classnames";
import { Card as HeroCard, CardBody } from "@heroui/react";

export default function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <HeroCard
      className={classNames("card", className)}
      radius="lg"
      shadow="sm"
      style={style}
      classNames={{
        base: "cardBase",
      }}
    >
      <CardBody className="cardBody">{children}</CardBody>
    </HeroCard>
  );
}
