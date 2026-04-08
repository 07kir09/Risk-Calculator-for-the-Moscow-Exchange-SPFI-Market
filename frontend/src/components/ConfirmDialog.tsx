import { ReactNode } from "react";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import Button from "./Button";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Продолжить",
  cancelText = "Отмена",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      placement="center"
      backdrop="blur"
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            scale: 1,
            transition: { type: "spring", stiffness: 220, damping: 22 },
          },
          exit: {
            y: 12,
            opacity: 0,
            scale: 0.98,
            transition: { duration: 0.18, ease: "easeIn" },
          },
        },
      }}
      classNames={{
        base: "confirmModal",
        backdrop: "confirmModalBackdrop",
      }}
    >
      <ModalContent>
        <ModalHeader>{title}</ModalHeader>
        <ModalBody>{description}</ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? "danger" : "shadow"} onClick={onConfirm}>
            {confirmText}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
