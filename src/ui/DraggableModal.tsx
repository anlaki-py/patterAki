import type { ReactNode } from "react";
import { Button, Modal } from "@mantine/core";
import { GripHorizontal } from "lucide-react";
import { useDialogDrag } from "./useDialogDrag";

export function DraggableModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { offset, handleProps } = useDialogDrag();
  return (
    <Modal
      opened
      onClose={onClose}
      size="sm"
      closeOnClickOutside={false}
      transitionProps={{ duration: 0, transition: "fade" }}
      overlayProps={{ backgroundOpacity: 0.08 }}
      styles={{
        content: { transform: `translate(${offset.x}px, ${offset.y}px)` },
      }}
      title={
        <Button
          variant="subtle"
          color="gray"
          leftSection={<GripHorizontal size={16} />}
          className="dialog-drag-handle"
          aria-label={`Move ${title.toLowerCase()} window. Drag or use arrow keys.`}
          {...handleProps}
        >
          {title}
        </Button>
      }
    >
      {children}
    </Modal>
  );
}
