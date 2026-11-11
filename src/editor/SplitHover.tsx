import type { PatternDocument } from "../document/schema";
import { formatLength } from "../document/schema";
import { placementOnEdge } from "../document/pointPlacement";
import { segmentPoint } from "../document/segments";

export function SplitHover({
  doc,
  edgeId,
  t,
  scale,
  onEdit,
}: {
  doc: PatternDocument;
  edgeId?: string;
  t?: number;
  scale: number;
  onEdit: () => void;
}) {
  const edge = edgeId ? doc.segments[edgeId] : undefined;
  if (!edge || t === undefined) return null;
  const target = placementOnEdge(doc, edge.id, t, {
    pointId: "",
    newEdgeId: "",
  });
  const point = segmentPoint(doc, edge, t);
  return (
    <g>
      <text
        className="measurement dimension-label"
        x={point.x + 18 / scale}
        y={point.y - 28 / scale}
        fontSize={12 / scale}
        role="button"
        tabIndex={0}
        aria-label="Edit split distances"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }
        }}
      >
        {edge.kind === "cubic" ? "Arc · " : ""}From A{" "}
        {formatLength(target.initialFromStart, doc.unitsDisplay)} · To B{" "}
        {formatLength(
          target.lengthMm - target.initialFromStart,
          doc.unitsDisplay,
        )}{" "}
        · {((target.initialFromStart / target.lengthMm) * 100).toFixed(1)}%
      </text>
      {[
        { point: target.start, label: "A" },
        { point: target.end, label: "B" },
      ].map(({ point, label }) => (
        <text
          key={label}
          className="measurement"
          pointerEvents="none"
          x={point.x + 12 / scale}
          y={point.y + 20 / scale}
          fontSize={12 / scale}
        >
          {label}
        </text>
      ))}
    </g>
  );
}
