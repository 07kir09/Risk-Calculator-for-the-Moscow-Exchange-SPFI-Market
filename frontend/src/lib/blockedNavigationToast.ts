import { toast } from "@heroui/react";

export function showBlockedNavigationToast(reason: string) {
  toast.warning("Переход пока недоступен", {
    description: reason,
    actionProps: {
      children: "Понятно",
      onPress: () => toast.clear(),
      className: "bg-accent text-accent-foreground",
    },
  });
}

