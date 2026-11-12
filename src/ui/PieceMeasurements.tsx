import { Stack, Text } from "@mantine/core";
import { formatLength, type PatternDocument } from "../document/schema";
import { pieceBounds } from "../document/pieceTransforms";

/** Use the same candidate document for bounds, orientation and status. */
export function PieceMeasurements({
  document,
  ids,
}: {
  document: PatternDocument;
  ids: string[];
}) {
  const box = pieceBounds(document, ids);
  return (
    <Stack gap={4}>
      {ids.length > 1 && <Text size="sm">{ids.length} pieces selected</Text>}
      <Text size="sm">
        {ids.length > 1 ? "Combined bounds · " : ""}
        Width {formatLength(box.max.x - box.min.x, document.unitsDisplay)} ·
        Height {formatLength(box.max.y - box.min.y, document.unitsDisplay)}
        <br />X {formatLength(box.min.x, document.unitsDisplay)} · Y{" "}
        {formatLength(box.min.y, document.unitsDisplay)}
      </Text>
      {ids.map((id) => {
        const piece = document.pieces[id],
          frame = piece.transform,
          angle = (Math.atan2(frame.b, frame.a) * 180) / Math.PI;
        return (
          <Text size="sm" key={id}>
            {ids.length > 1 ? `${piece.name} · ` : ""}
            Rotation {Number(angle.toFixed(2))}° ·{" "}
            {frame.a * frame.d - frame.b * frame.c < 0
              ? "Mirrored"
              : "Original orientation"}{" "}
            · {piece.locked ? "Locked" : "Unlocked"} ·{" "}
            {piece.visible ? "Visible" : "Hidden"}
          </Text>
        );
      })}
    </Stack>
  );
}
