import { CurveProperties } from "./CurveProperties";
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
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { commandProps, notifyCommand } from "./CommandControls";
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
        label={commands.rename.label}
        value={s.document.name}
        maxLength={120}
        onChange={(e) => {
          const name = e.currentTarget.value;
          commands.rename.bind(name).run();
        }}
      />
      <Select
        label={commands.units.label}
        data={["mm", "cm", "in"]}
        value={s.document.unitsDisplay}
        onChange={(v) => {
          if (v === "mm" || v === "cm" || v === "in")
            commands.units.bind(v).run();
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
          selected. Double-click the mark or use Marks → Edit mark to edit its
          size and direction. Drag it to move.
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
      commands.previewLength
        .bind({ value: v, factor: unitFactor[units], anchor: a })
        .run();
      setError("");
    } catch (e) {
      useEditor.setState({ preview: null });
      setError((e as Error).message);
    }
  };
  const apply = () => {
    if (s.preview && !error) {
      try {
        commands.applyLength.bind().run();
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
          {...commandProps(notifyCommand(commands.curve.bind()))}
        >
          {commands.curve.label}
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
            commands.cancel.bind().run();
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
      <Button
        onClick={apply}
        disabled={!commands.applyLength.bind().enabled() || !!error}
      >
        {commands.applyLength.label}
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
            {...commandProps(
              notifyCommand(
                commands.insertPoint.bind({
                  value: split,
                  factor: unitFactor[units],
                }),
              ),
            )}
          >
            {commands.insertPoint.label}
          </Button>
        </>
      )}
    </Stack>
  );
}
