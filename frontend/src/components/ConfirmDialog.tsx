import { ReactNode } from "react";
import { Modal } from "@heroui/react";
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
    >
      <Modal.Backdrop className="confirmModalBackdrop" variant="blur">
        <Modal.Container className="confirmModal" placement="center">
          <Modal.Dialog>
            <Modal.Header>{title}</Modal.Header>
            <Modal.Body>{description}</Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={onCancel}>
                {cancelText}
              </Button>
              <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
                {confirmText}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
