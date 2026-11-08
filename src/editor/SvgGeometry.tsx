import { commands } from "./commands";
import { CurveHandles } from "./CurveHandles";
import { segmentPath, segmentLength, segmentPoint } from "../document/segments";
import { formatLength, type PatternDocument } from "../document/schema";
import { angle, distance, type Vec2 } from "../geometry/line";
export function SvgGeometry({
  doc,
  selectedIds,
  scale,
  showPoints = false,
  showHandles = false,
}: {
  doc: PatternDocument;
  selectedIds: string[];
  scale: number;
  showPoints?: boolean;
  showHandles?: boolean;
}) {
  const selected =
    selectedIds.length === 1 ? doc.segments[selectedIds[0]] : undefined;
  const selection = new Set(selectedIds);
  const selectedPoints = showPoints
    ? Object.keys(doc.points)
    : selected
      ? [selected.from, selected.to]
      : [];
  const label = (a: Vec2, b: Vec2) =>
    `${formatLength(distance(a, b), doc.unitsDisplay)} · ${angle(a, b).toFixed(1)}°`;
  return (
    <>
      {Object.values(doc.segments).map((edge) => {
        const a = doc.points[edge.from],
          b = doc.points[edge.to];
        const middle = segmentPoint(doc, edge, 0.5);
        return (
          <g
            key={edge.id}
            className={selection.has(edge.id) ? "selected edge" : "edge"}
          >
            <path
              d={segmentPath(doc, edge)}
              fill="none"
              className="edge-stroke"
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-edge={edge.id}
              className="edge-hit"
              d={segmentPath(doc, edge)}
              fill="none"
              stroke="transparent"
              strokeWidth={18 / scale}
            />
            {selected?.id === edge.id && (
              <text
                className="measurement"
                x={middle.x}
                y={middle.y - 10 / scale}
                fontSize={12 / scale}
                onClick={() =>
                  commands.editLength
                    .bind({
                      execute: () =>
                        document.getElementById("line-length")?.focus(),
                    })
                    .run()
                }
              >
                {edge.kind === "cubic"
                  ? `Arc ${formatLength(segmentLength(doc, edge), doc.unitsDisplay)} · Chord ${formatLength(distance(a, b), doc.unitsDisplay)}`
                  : label(a, b)}
              </text>
            )}
          </g>
        );
      })}
      {selectedPoints.map((id) => {
        const p = doc.points[id];
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={4 / scale} className="point" />
            {!showPoints && (
              <circle
                data-point={id}
                cx={p.x}
                cy={p.y}
                r={22 / scale}
                fill="transparent"
                className="point-hit"
              />
            )}
          </g>
        );
      })}
      {!showPoints &&
        selected &&
        (showHandles || selected.kind === "cubic") && (
          <CurveHandles doc={doc} pointIds={selectedPoints} scale={scale} />
        )}
    </>
  );
}
