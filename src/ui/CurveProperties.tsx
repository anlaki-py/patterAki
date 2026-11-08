import { Button, NumberInput, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { useEditor } from "../editor/store";
import { straightenCurve } from "../document/curves";
import { segmentLength } from "../document/segments";
import {
  applyPointPlacement,
  placementOnEdge,
} from "../document/pointPlacement";
import { distance } from "../geometry/line";
import { formatLength, unitFactor } from "../document/schema";
import { createId } from "../editor/ids";
export function CurveProperties() {
  const s = useEditor(),
    doc = s.preview ?? s.document,
    edge = doc.segments[s.selected[0]],
    units = doc.unitsDisplay;
  const length = segmentLength(doc, edge);
  const [split, setSplit] = useState<string | number>("");
  return (
    <Stack gap="sm">
      <Text size="sm">Arc length: {formatLength(length, units)}</Text>
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
      <NumberInput
        label={`Insert point along arc from start (${units})`}
        value={split}
        onChange={setSplit}
      />
      <Button
        variant="default"
        onClick={() => {
          try {
            if (typeof split !== "number")
              throw new Error("Enter an arc distance inside the curve.");
            const target = placementOnEdge(s.document, edge.id, 0.5, {
              pointId: createId(),
              newEdgeId: createId(),
            });
            s.commit(
              applyPointPlacement(
                s.document,
                target,
                split * unitFactor[units],
              ),
            );
          } catch (e) {
            notifications.show({ color: "red", message: (e as Error).message });
          }
        }}
      >
        Insert point
      </Button>
      <Button
        variant="default"
        onClick={() => s.commit(straightenCurve(s.document, edge.id))}
      >
        Convert to straight line
      </Button>
    </Stack>
  );
}
