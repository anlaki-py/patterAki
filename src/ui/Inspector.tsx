import { CurveProperties } from "./CurveProperties";
import { convertToCurve } from "../document/curves";
import { createId } from "../editor/ids";
import {
  Button,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { useEditor } from "../editor/store";
import { changeLength, splitLine } from "../document/operations";
import { distance, type Anchor } from "../geometry/line";
import { formatLength, unitFactor } from "../document/schema";
export function Inspector() {
  const s = useEditor();
  const annotation =
    s.selected.length === 1 ? s.document.annotations[s.selected[0]] : undefined;
  const edge =
    s.selected.length === 1 ? s.document.segments[s.selected[0]] : undefined;
  return (
    <Stack p="sm" gap="sm">
      <Text fw={600} size="sm">
        Properties
      </Text>
      <TextInput
        label="Project name"
        value={s.document.name}
        maxLength={120}
        onChange={(e) => {
          const name = e.currentTarget.value;
          if (name.trim()) s.commit({ ...s.document, name });
        }}
      />
      <Select
        label="Display units"
        data={["mm", "cm", "in"]}
        value={s.document.unitsDisplay}
        onChange={(v) => {
          if (v === "mm" || v === "cm" || v === "in")
            s.commit({ ...s.document, unitsDisplay: v });
        }}
      />
      {s.selected.length > 1 ? (
        <Text size="sm">
          {s.selected.length} items selected. Drag a selected item to move them
          together. Right-click a selected item to delete the group, or use
          Delete.
        </Text>
      ) : annotation ? (
        <Text size="sm">
          {annotation.kind === "text" ? annotation.text : annotation.kind}{" "}
          selected. Double-click the mark or use Marks → Edit selected mark to
          edit its size and direction. Drag it to move.
        </Text>
      ) : edge ? (
        edge.kind === "cubic" ? (
          <CurveProperties key={edge.id} />
        ) : (
          <LengthEditor key={`${edge.id}-${s.revision}`} />
        )
      ) : (
        <Text size="sm" c="dimmed">
          Select a line to change its length. Drag a selected endpoint to
          reshape it. Double-click an edge to insert a point.
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Geometry is stored in millimetres. Display units and view zoom do not
        change dimensions.
      </Text>
    </Stack>
  );
}
export function LengthEditor({
  lengthOnly = false,
  onApplied,
}: { lengthOnly?: boolean; onApplied?: () => void } = {}) {
  const s = useEditor(),
    edge = s.document.segments[s.selected[0]],
    units = s.document.unitsDisplay;
  const length = distance(
    s.document.points[edge.from],
    s.document.points[edge.to],
  );
  const [value, setValue] = useState<string | number>(
    length / unitFactor[units],
  );
  const [anchor, setAnchor] = useState<Anchor>("start");
  const [split, setSplit] = useState<string | number>(
    length / unitFactor[units] / 2,
  );
  const [error, setError] = useState("");
  const preview = (v: string | number, a: Anchor) => {
    setValue(v);
    setAnchor(a);
    try {
      if (typeof v !== "number") throw new Error("Enter a positive length.");
      const doc = changeLength(s.document, edge.id, v * unitFactor[units], a);
      useEditor.setState({ preview: doc });
      setError("");
    } catch (e) {
      useEditor.setState({ preview: null });
      setError((e as Error).message);
    }
  };
  const apply = () => {
    if (s.preview && !error) {
      try {
        s.commit(s.preview);
        onApplied?.();
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };
  return (
    <Stack gap="sm">
      <Text size="sm">Line · {formatLength(length, units)}</Text>
      {!lengthOnly && (
        <Button
          variant="default"
          onClick={() => s.commit(convertToCurve(s.document, edge.id))}
        >
          Convert to curve
        </Button>
      )}
      <NumberInput
        id="line-length"
        label={`Length (${units})`}
        value={value}
        error={error}
        onChange={(v) => preview(v, anchor)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") {
            s.cancel();
            setValue(length / unitFactor[units]);
            setError("");
          }
        }}
      />
      <SegmentedControl
        size="xs"
        aria-label="Fixed length anchor"
        value={anchor}
        data={[
          { value: "start", label: "Start" },
          { value: "center", label: "Center" },
          { value: "end", label: "End" },
        ]}
        onChange={(v) => preview(value, v as Anchor)}
      />
      <Text size="xs">
        {anchor === "center"
          ? "Keep the midpoint fixed; move both ends equally."
          : `Keep the ${anchor} endpoint fixed; move the other end.`}
      </Text>
      <Button onClick={apply} disabled={!s.preview || !!error}>
        Apply length
      </Button>
      {!lengthOnly && (
        <>
          <NumberInput
            label={`Insert point from start (${units})`}
            value={split}
            onChange={setSplit}
          />
          <Button
            variant="default"
            onClick={() => {
              try {
                if (typeof split !== "number")
                  throw new Error("Enter a distance inside the line.");
                s.commit(
                  splitLine(
                    s.document,
                    edge.id,
                    (split * unitFactor[units]) / length,
                    createId,
                  ),
                );
              } catch (e) {
                notifications.show({
                  color: "red",
                  message: (e as Error).message,
                });
              }
            }}
          >
            Insert point
          </Button>
        </>
      )}
    </Stack>
  );
}
