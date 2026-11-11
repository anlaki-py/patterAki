import type { PatternDocument } from "../document/schema";
import { formatLength } from "../document/schema";
import { useEditor } from "./store";
import { liveDimensions } from "./dimensions";

export function DimensionOverlay({
  base,
  doc,
  selected,
  scale,
  movingPoint,
  endpointDoc = doc,
  onEdit,
}: {
  base: PatternDocument;
  doc: PatternDocument;
  selected: string[];
  scale: number;
  endpointDoc?: PatternDocument;
  movingPoint?: string;
  onEdit: (id: string) => void;
}) {
  const from = movingPoint ? base.points[movingPoint] : undefined;
  const to = movingPoint ? doc.points[movingPoint] : undefined;
  const anchor = useEditor((s) => s.lengthAnchor);
  const edge =
    selected.length === 1 ? endpointDoc.segments[selected[0]] : undefined;
  return (
    <g>
      {edge &&
        [edge.from, edge.to].map((id, index) => (
          <text
            key={id}
            className="measurement"
            fontSize={12 / scale}
            x={endpointDoc.points[id].x + 14 / scale}
            y={endpointDoc.points[id].y + 16 / scale}
            pointerEvents="none"
          >
            {index === 0 ? "A" : "B"}
            {edge.kind === "line"
              ? endpointDoc !== doc
                ? " · fixed"
                : (index === 0 && anchor === "start") ||
                    (index === 1 && anchor === "end")
                  ? " · fixed"
                  : " · moves"
              : ""}
          </text>
        ))}
      {liveDimensions(base, doc, selected).map((item, index) => (
        <text
          key={item.id}
          className={`measurement dimension-label${item.primary ? "" : " adjacent-dimension"}`}
          x={item.middle.x}
          y={item.middle.y - (22 + index * 16) / scale}
          fontSize={12 / scale}
          role="button"
          tabIndex={0}
          aria-label={`Edit ${item.text}`}
          data-dimension={item.id}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onEdit(item.id);
            }
          }}
        >
          {item.text}
        </text>
      ))}
      {from && to && (
        <text
          className="measurement"
          pointerEvents="none"
          x={to.x + 18 / scale}
          y={to.y + 24 / scale}
          fontSize={12 / scale}
        >
          ΔX {formatLength(to.x - from.x, doc.unitsDisplay)} · ΔY{" "}
          {formatLength(to.y - from.y, doc.unitsDisplay)}
        </text>
      )}
    </g>
  );
}
