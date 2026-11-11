import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { LengthInput } from "./LengthInput";
import { parseLength } from "../document/lengthInput";
import { unitFactor } from "../document/schema";
import { useEditor } from "../editor/store";
import { commitTranslation, previewTranslation } from "../editor/movement";

export function MoveDialog() {
  const s = useEditor();
  const [x, setX] = useState<string | number>(0);
  const [y, setY] = useState<string | number>(0);
  const [error, setError] = useState("");
  const factor = unitFactor[s.document.unitsDisplay];
  const units = s.document.unitsDisplay;
  const close = () => useEditor.setState({ moveDialogOpen: false });

  useEffect(() => {
    if (!s.moveDialogOpen) return;
    useEditor.setState({ preview: null, previewIssue: null });
    setX(0);
    setY(0);
    setError("");
  }, [s.moveDialogOpen]);

  const values = () => ({
    x: parseLength(x, factor),
    y: parseLength(y, factor),
  });

  const preview = (nextX: string | number, nextY: string | number) => {
    setX(nextX);
    setY(nextY);
    try {
      previewTranslation({
        x: parseLength(nextX, factor),
        y: parseLength(nextY, factor),
      });
      setError("");
    } catch (e) {
      useEditor.setState({ preview: null, previewIssue: null });
      setError((e as Error).message);
    }
  };

  const apply = () => {
    try {
      commitTranslation(values());
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const cancel = () => {
    close();
    useEditor.getState().cancel();
  };

  return (
    <Modal
      opened={s.moveDialogOpen}
      onClose={cancel}
      title="Move selection"
      centered
    >
      <Stack gap="sm">
        <Text size="sm">
          {s.activePoint
            ? "Move the active point exactly."
            : `Translate ${s.selected.length} selected item${
                s.selected.length === 1 ? "" : "s"
              } exactly.`}
        </Text>
        <Group grow align="flex-start">
          <LengthInput
            label={`ΔX (${units})`}
            value={x}
            onChange={(value) => preview(value, y)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
          />
          <LengthInput
            label={`ΔY (${units})`}
            value={y}
            onChange={(value) => preview(x, value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
          />
        </Group>
        <Text size="xs" c="dimmed">
          Bare values use {units}. Explicit mm, cm and in suffixes override
          display units.
        </Text>
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
        {s.previewIssue && (
          <Text size="xs" c="red">
            {s.previewIssue}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!!error || !!s.previewIssue}>
            Apply move
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
