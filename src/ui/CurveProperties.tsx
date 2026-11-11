import { LengthInput } from "./LengthInput";
import { Button, Stack, Text } from "@mantine/core";
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
  const length = segmentLength(doc, edge);
  const [split, setSplit] = useState<string | number>("");
  return (
    <Stack gap="sm">
      <LengthInput
        id="line-length"
        data-autofocus
        label="Arc length (read-only)"
        readOnly
        value={formatLength(length, units)}
      />
      <Text size="xs">
        Arc-length changes are unavailable. Drag the curve handles to reshape
        it.
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
        arm controls one adjacent segment. Arms move independently.
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
