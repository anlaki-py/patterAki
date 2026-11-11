import { LengthInput } from "./LengthInput";
import { Button, Stack, Text, Select } from "@mantine/core";
import { useState } from "react";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { commandProps, notifyCommand } from "./CommandControls";
import { segmentLength } from "../document/segments";
import { distance } from "../geometry/line";
import { formatLength, unitFactor } from "../document/schema";
export function CurveProperties() {
  const s = useEditor(),
    doc = s.preview ?? s.document,
    edge = doc.segments[s.selected[0]],
    units = doc.unitsDisplay;
  const activePoint = s.activePoint === edge.to ? edge.to : edge.from;
  const length = segmentLength(doc, edge);
  const [split, setSplit] = useState<string | number>("");
  return (
    <Stack gap="sm">
      <Select
        label="Active point"
        value={activePoint}
        data={[
          { value: edge.from, label: "Start point" },
          { value: edge.to, label: "End point" },
        ]}
        onChange={(value) => useEditor.setState({ activePoint: value })}
      />
      <Select
        label="Point mode"
        value={doc.points[activePoint]?.mode ?? "corner"}
        data={[
          { value: "corner", label: "Corner" },
          { value: "smooth", label: "Smooth" },
          { value: "symmetric", label: "Symmetric" },
        ]}
        onChange={(value) => {
          if (
            value === "corner" ||
            value === "smooth" ||
            value === "symmetric"
          ) {
            useEditor.setState({ activePoint: activePoint });
            notifyCommand(commands.pointMode.bind(value)).run();
          }
        }}
      />
      <Button
        variant="default"
        onClick={() => {
          useEditor.setState({ activePoint: activePoint });
          notifyCommand(commands.pointMode.bind("smooth")).run();
        }}
      >
        Smooth point
      </Button>
      <LengthInput
        id="line-length"
        data-autofocus
        label="Arc length (read-only)"
        readOnly
        value={formatLength(length, units)}
      />
      <Text size="xs">
        Arc-length changes are unavailable. Drag the curve handles to reshape
        it. Seam offset feasibility will be checked when offsets are
        implemented.
      </Text>
      <Text size="sm">
        Chord:{" "}
        {formatLength(
          distance(doc.points[edge.from], doc.points[edge.to]),
          units,
        )}
      </Text>
      <Text size="xs" c="dimmed">
        Drag the two control arms to shape this curve. At a shared point, each
        arm controls one adjacent segment. Corner arms move independently.
        Smooth links directions; Symmetric also links lengths. Hold Alt to
        decouple temporarily.
      </Text>
      <LengthInput
        label={`Insert point along arc from start (${units})`}
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
      <Button
        variant="default"
        {...commandProps(notifyCommand(commands.reset.bind()))}
      >
        {commands.reset.label}
      </Button>
    </Stack>
  );
}
