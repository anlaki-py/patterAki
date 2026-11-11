import { parseLength } from "../document/lengthInput";
import { LengthInput } from "./LengthInput";
import { useEffect, useMemo, useState } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import {
  applyPointPlacement,
  splitDistances,
  type PointPlacement,
} from "../document/pointPlacement";
import {
  formatLength,
  unitFactor,
  type PatternDocument,
} from "../document/schema";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { commandProps } from "./CommandControls";
import { DraggableModal } from "./DraggableModal";
export type PlacementSession = {
  document: PatternDocument;
  revision: number;
  target: PointPlacement;
};
export function PointPlacementDialog({
  session,
  onClose,
}: {
  session: PlacementSession;
  onClose: () => void;
}) {
  const { document: base, target, revision } = session;
  const total = target.lengthMm,
    units = base.unitsDisplay,
    factor = unitFactor[units];
  const [entry, setEntry] = useState<{
    side: "start" | "end";
    value: string | number;
  }>({ side: "start", value: target.initialFromStart / factor });
  const [commitError, setCommitError] = useState("");
  const currentRevision = useEditor((s) => s.revision);
  const result = useMemo(() => {
    try {
      const distances = splitDistances(
        total,
        parseLength(entry.value, factor),
        entry.side,
      );
      return {
        ...distances,
        preview: applyPointPlacement(base, target, distances.fromStart),
        error: "",
      };
    } catch (e) {
      return {
        fromStart: 0,
        fromEnd: 0,
        preview: null,
        error: (e as Error).message,
      };
    }
  }, [entry, total, factor, base, target]);
  useEffect(() => {
    useEditor.setState({
      preview: currentRevision === revision ? result.preview : null,
    });
    return () => {
      useEditor.setState({ preview: null });
    };
  }, [result.preview, currentRevision, revision]);
  const apply = () => {
    if (!result.preview || useEditor.getState().revision !== revision) return;
    try {
      useEditor.getState().commit(result.preview);
      useEditor.setState({ selected: [target.edgeId] });
      onClose();
    } catch (e) {
      setCommitError((e as Error).message);
    }
  };
  const applyCommand = commands.applyPoint.bind({
    execute: apply,
    enabled: () =>
      !!result.preview && useEditor.getState().revision === revision,
  });
  const cancelCommand = commands.cancelDialog.bind({ execute: onClose });
  return (
    <DraggableModal
      title={target.existing ? "Position point" : "Add point precisely"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyCommand.run();
        }}
      >
        <Stack gap="sm">
          <Text size="sm">
            {target.curve ? "Arc A to B" : "A to B"}:{" "}
            {formatLength(total, units)}. The outer endpoints stay fixed;
            changing one distance updates the other.
          </Text>
          <LengthInput
            data-autofocus
            label={`From A (${units})`}
            value={
              entry.side === "start"
                ? entry.value
                : result.preview
                  ? result.fromStart / factor
                  : ""
            }
            onChange={(value) => {
              setEntry({ side: "start", value });
              setCommitError("");
            }}
          />
          <LengthInput
            label={`From B (${units})`}
            value={
              entry.side === "end"
                ? entry.value
                : result.preview
                  ? result.fromEnd / factor
                  : ""
            }
            onChange={(value) => {
              setEntry({ side: "end", value });
              setCommitError("");
            }}
          />
          {(result.error || commitError || currentRevision !== revision) && (
            <Text role="alert" c="red" size="sm">
              {currentRevision !== revision
                ? "The pattern changed. Close this window and select the edge again."
                : result.error || commitError}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            Drag the title to move this window. Enter applies; Escape cancels.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" {...commandProps(cancelCommand)}>
              {cancelCommand.label}
            </Button>
            <Button type="submit" disabled={!applyCommand.enabled()}>
              {target.existing ? "Apply position" : "Add point"}
            </Button>
          </Group>
        </Stack>
      </form>
    </DraggableModal>
  );
}
