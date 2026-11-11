import type { PatternDocument } from "../document/schema";
import { formatLength } from "../document/schema";
import { segmentLength, segmentPoint } from "../document/segments";
import { angle, distance } from "../geometry/line";

/** Only changed dimensions and the primary selection belong in the overlay. */
export function liveDimensions(
  base: PatternDocument,
  current: PatternDocument,
  selected: string[],
) {
  return Object.values(current.segments)
    .flatMap((edge) => {
      const before = base.segments[edge.id];
      if (!before) return [];
      const primary = selected.length === 1 && selected[0] === edge.id;
      if (
        !primary &&
        before === edge &&
        base.points[edge.from] === current.points[edge.from] &&
        base.points[edge.to] === current.points[edge.to]
      )
        return [];
      const length = segmentLength(current, edge);
      const oldLength = segmentLength(base, before);
      const a = current.points[edge.from],
        b = current.points[edge.to];
      const degrees = angle(a, b);
      const oldAngle = angle(base.points[before.from], base.points[before.to]);
      const changed =
        Math.abs(length - oldLength) > 1e-7 ||
        Math.abs(degrees - oldAngle) > 1e-7;
      if (!changed && !primary) return [];
      const units = current.unitsDisplay;
      return [
        {
          id: edge.id,
          primary,
          middle: segmentPoint(current, edge, 0.5),
          text: `${edge.kind === "cubic" ? "Arc " : ""}${changed ? `${formatLength(oldLength, units)} → ` : ""}${formatLength(length, units)}${edge.kind === "cubic" ? ` · Chord ${formatLength(distance(a, b), units)}` : ""} · ${changed ? `${oldAngle.toFixed(1)}° → ` : ""}${degrees.toFixed(1)}°`,
        },
      ];
    })
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .slice(0, 6);
}
