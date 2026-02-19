import { ReactNode } from "react";
import Button from "../components/Button";
import StatePanel from "./StatePanel";

export default function ErrorState({
  title,
  description,
  onRetry,
  action,
}: {
  title: string;
  description?: ReactNode;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  return (
    <StatePanel
      tone="error"
      title={title}
      description={description}
      action={
        action ??
        (onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        ) : undefined)
      }
    />
  );
}
