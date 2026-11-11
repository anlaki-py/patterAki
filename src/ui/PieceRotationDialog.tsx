import { useEffect, useRef, useState } from "react";
import { Button, Group, NumberInput, Stack, Text } from "@mantine/core";
import { useEditor } from "../editor/store";
import {
  previewPieceRotation,
  pieceTransformsEnabled,
} from "../editor/pieceCommands";
import { DraggableModal } from "./DraggableModal";

/** The caller creates the initial preview before mounting this dialog. */
export function PieceRotationDialog({
  onClose,
  onPreview,
}: {
  onClose: () => void;
  onPreview: (doc: ReturnType<typeof useEditor.getState>["preview"]) => void;
}) {
  const s = useEditor();
  const [degrees, setDegrees] = useState<string | number>(0),
    [error, setError] = useState("");
  const ownedPreview = useRef(s.preview);
  const close = () => {
    s.cancel();
    onClose();
  };
  const preview = (value: string | number) => {
    setDegrees(value);
    try {
      if (value === "") throw new Error("Enter a rotation angle.");
      previewPieceRotation(Number(value));
      ownedPreview.current = useEditor.getState().preview;
      onPreview(ownedPreview.current);
      setError("");
    } catch (e) {
      useEditor.setState({ preview: null });
      ownedPreview.current = null;
      onPreview(null);
      setError((e as Error).message);
    }
  };
  const apply = () => {
    const state = useEditor.getState();
    if (!state.preview || state.preview !== ownedPreview.current || error)
      return;
    try {
      state.commit(state.preview);
      ownedPreview.current = null;
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <DraggableModal title="Rotate selected pieces" onClose={close}>
      <Stack>
        <NumberInput
          label="Clockwise rotation in degrees"
          value={degrees}
          onChange={preview}
          error={error}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
        <Text size="sm">
          Rotate together around the selection center. Pattern dimensions stay
          unchanged.
        </Text>
        <Group>
          <Button disabled={!s.preview || !!error} onClick={apply}>
            Apply rotation
          </Button>
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </DraggableModal>
  );
}

/** Keep preview ownership in the already mounted menu/panel, so React StrictMode's
 * initial dialog mount/cleanup does not cancel a newly opened rotation. */
export function usePieceRotationDialog() {
  const [opened, setOpened] = useState(false);
  const owner = useRef<ReturnType<typeof useEditor.getState>["preview"]>(null);
  useEffect(
    () => () => {
      const s = useEditor.getState();
      if (owner.current && s.preview === owner.current) s.cancel();
    },
    [],
  );
  return {
    open: () => {
      if (!pieceTransformsEnabled()) return;
      previewPieceRotation(0);
      owner.current = useEditor.getState().preview;
      setOpened(true);
    },
    dialog: opened ? (
      <PieceRotationDialog
        onPreview={(doc) => {
          owner.current = doc;
        }}
        onClose={() => {
          owner.current = null;
          setOpened(false);
        }}
      />
    ) : null,
  };
}
