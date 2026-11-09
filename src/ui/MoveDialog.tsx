import { useEffect, useState } from "react";
import { Button, Group, Modal, NumberInput, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
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

  const values = () => {
    if (typeof x !== "number" || typeof y !== "number")
      throw new Error("Enter finite X and Y offsets.");
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error("Enter finite X and Y offsets.");
    return { x: x * factor, y: y * factor };
  };

  const preview = (nextX: string | number, nextY: string | number) => {
    setX(nextX);
    setY(nextY);
    if (
      typeof nextX !== "number" ||
      typeof nextY !== "number" ||
      !Number.isFinite(nextX) ||
      !Number.isFinite(nextY)
    ) {
      useEditor.setState({ preview: null, previewIssue: null });
      return;
    }
    try {
      previewTranslation({ x: nextX * factor, y: nextY * factor });
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
          <NumberInput
            label={`ΔX (${units})`}
            value={x}
            onChange={(value) => preview(value, y)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
          />
          <NumberInput
            label={`ΔY (${units})`}
            value={y}
            onChange={(value) => preview(x, value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
          />
        </Group>
        {units !== "mm" && (
          <Text size="xs" c="dimmed">
            Stored exactly as{" "}
            {typeof x === "number" && typeof y === "number"
              ? `${x * factor} mm / ${y * factor} mm`
              : "finite millimetres"}
            .
          </Text>
        )}
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
          <Button
            onClick={() => {
              try {
                apply();
              } catch (e) {
                notifications.show({
                  color: "red",
                  message: (e as Error).message,
                });
              }
            }}
            disabled={!!error || !!s.previewIssue}
          >
            Apply move
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
