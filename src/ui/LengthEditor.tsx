import { Button, SegmentedControl, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { LengthInput } from "./LengthInput";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { commandProps, notifyCommand } from "./CommandControls";
import { distance, type Anchor } from "../geometry/line";
import { formatLength, unitFactor } from "../document/schema";
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
  const anchor = s.lengthAnchor;
  const setAnchor = (lengthAnchor: Anchor) =>
    useEditor.setState({ lengthAnchor });
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
      useEditor.setState({ preview: null, previewIssue: null });
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    setValue(length / unitFactor[units]);
    setError("");
  }, [s.cancelVersion, length, units]);
  const apply = () => {
    if (s.preview && !s.previewIssue && !error) {
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
      <Text size="xs">
        A → B. Connected edges follow their shared endpoints.
      </Text>
      {!lengthOnly && (
        <Button
          variant="default"
          {...commandProps(notifyCommand(commands.curve.bind()))}
        >
          {commands.curve.label}
        </Button>
      )}
      <LengthInput
        id="line-length"
        data-autofocus
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
      {s.previewIssue && (
        <Text size="xs" c="red">
          {s.previewIssue}
        </Text>
      )}
      <Button
        onClick={apply}
        disabled={
          !commands.applyLength.bind().enabled() || !!error || !!s.previewIssue
        }
      >
        {commands.applyLength.label}
      </Button>
      {!lengthOnly && (
        <>
          <LengthInput
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
