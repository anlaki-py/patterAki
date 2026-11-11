import { useState } from "react";
import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { commands } from "../editor/commands";
import { useEditor } from "../editor/store";
import { DraggableModal } from "./DraggableModal";

export type PieceNameTarget =
  { kind: "create"; edgeId: string } | { kind: "rename"; pieceId: string };
export function PieceNameDialog({
  target,
  onClose,
}: {
  target: PieceNameTarget;
  onClose: () => void;
}) {
  const s = useEditor();
  const [name, setName] = useState(
    target.kind === "rename"
      ? (s.document.pieces[target.pieceId]?.name ?? "")
      : `Piece ${Object.keys(s.document.pieces).length + 1}`,
  );
  const [error, setError] = useState("");
  const [revision] = useState(s.revision);
  const apply = () => {
    const value = name.trim();
    if (!value || value.length > 120) {
      setError("Enter a name between 1 and 120 characters.");
      return;
    }
    if (useEditor.getState().revision !== revision) {
      setError(
        "The document changed. Close this window and select the path or piece again.",
      );
      return;
    }
    try {
      const command =
        target.kind === "create"
          ? commands.createPiece.bind({ edgeId: target.edgeId, name: value })
          : commands.updatePiece.bind({
              id: target.pieceId,
              patch: { name: value },
            });
      if (!command.enabled())
        throw new Error(
          "This path or piece is no longer available for this action.",
        );
      command.run();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <DraggableModal
      title={
        target.kind === "create"
          ? "Create piece from closed path"
          : "Rename piece"
      }
      onClose={onClose}
    >
      <Stack>
        {target.kind === "create" && (
          <Text size="sm">
            Use this closed path as the piece's stitching outline. Other
            drafting paths and standalone marks stay separate.
          </Text>
        )}
        <TextInput
          label="Piece name"
          value={name}
          maxLength={120}
          autoFocus
          error={error}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
        <Group>
          <Button onClick={apply}>
            {target.kind === "create" ? "Create piece" : "Rename piece"}
          </Button>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </DraggableModal>
  );
}
