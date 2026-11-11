import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import {
  divisionDistances,
  divideEdge,
  type DivisionMode,
} from "../document/divisions";
import { parseLength } from "../document/lengthInput";
import {
  formatLength,
  unitFactor,
  type PatternDocument,
} from "../document/schema";
import { segmentLength } from "../document/segments";
import type { Anchor } from "../geometry/line";
import { createId } from "../editor/ids";
import { useEditor } from "../editor/store";
import { DraggableModal } from "./DraggableModal";
import { LengthInput } from "./LengthInput";

export type DivisionSession = {
  base: PatternDocument;
  revision: number;
  cancelVersion: number;
  edgeId: string;
  mode: DivisionMode;
};
export function DivisionDialog({
  session,
  onClose,
}: {
  session: DivisionSession;
  onClose: () => void;
}) {
  const { base, edgeId, mode } = session;
  const [origin, setOrigin] = useState<Anchor>("start");
  const [value, setValue] = useState<string | number>(
    mode === "percent" ? 50 : mode === "equal" ? 2 : 10,
  );
  const [commitError, setCommitError] = useState("");
  const revision = useEditor((s) => s.revision);
  const total = segmentLength(base, base.segments[edgeId]);
  const result = useMemo(() => {
    try {
      if (String(value).trim() === "") throw new Error("Enter a value.");
      const number =
        mode === "spacing"
          ? parseLength(value, unitFactor[base.unitsDisplay])
          : Number(value);
      const distances = divisionDistances(total, mode, number, origin);
      return {
        preview: divideEdge(base, edgeId, distances, createId),
        distances,
        error: "",
      };
    } catch (error) {
      return { preview: null, distances: [], error: (error as Error).message };
    }
  }, [base, edgeId, mode, value, origin, total]);
  useEffect(() => {
    useEditor.setState({
      preview: revision === session.revision ? result.preview : null,
      previewIssue: null,
    });
    return () => {
      useEditor.setState({ preview: null, previewIssue: null });
    };
  }, [result.preview, revision, session.revision]);
  const apply = () => {
    const s = useEditor.getState();
    if (
      !result.preview ||
      s.revision !== session.revision ||
      s.cancelVersion !== session.cancelVersion
    )
      return;
    try {
      s.commit(result.preview);
      onClose();
    } catch (error) {
      setCommitError((error as Error).message);
    }
  };
  const title =
    mode === "percent"
      ? "Split at %"
      : mode === "equal"
        ? "Divide into N equal segments"
        : "Divide every N mm";
  return (
    <DraggableModal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Stack gap="sm">
          <Text size="sm">
            A → B · {formatLength(total, base.unitsDisplay)}
            {base.segments[edgeId].kind === "cubic" ? " along the arc" : ""}
          </Text>
          <SegmentedControl
            aria-label="Split origin"
            value={origin}
            onChange={(v) => setOrigin(v as Anchor)}
            data={[
              { value: "start", label: "From A" },
              { value: "center", label: "From center" },
              { value: "end", label: "From B" },
            ]}
          />
          {mode === "spacing" ? (
            <LengthInput
              data-autofocus
              label={`Spacing (${base.unitsDisplay}, or type mm)`}
              value={value}
              onChange={setValue}
            />
          ) : (
            <NumberInput
              data-autofocus
              label={
                mode === "percent" ? "Percent" : "Number of equal segments"
              }
              value={value}
              onChange={setValue}
            />
          )}
          <Text size="xs">
            {mode === "equal"
              ? "Equal arc distances across the whole edge; origin changes do not change these positions."
              : origin === "center"
                ? mode === "percent"
                  ? "0% is the center; negative values go toward A, positive toward B. Use values between −50% and 50%."
                  : "Insert at the center, then repeat this spacing toward both A and B. End remainders may be shorter."
                : `Measure from ${origin === "start" ? "A toward B" : "B toward A"}. Endpoints stay fixed; any end remainder is retained.`}
          </Text>
          <Text size="xs">
            {result.preview
              ? `${result.distances.length} new points · ${result.distances.length + 1} segments. Shape is preserved.`
              : ""}
          </Text>
          {(result.error || commitError || revision !== session.revision) && (
            <Text role="alert" c="red">
              {revision !== session.revision
                ? "The document changed. Reopen this dialog."
                : result.error || commitError}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!result.preview || revision !== session.revision}
            >
              Apply divisions
            </Button>
          </Group>
        </Stack>
      </form>
    </DraggableModal>
  );
}
