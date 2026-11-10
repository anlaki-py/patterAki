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
  interactivePoints,
  showHandles = false,
}: {
  doc: PatternDocument;
  selectedIds: string[];
  scale: number;
  // Retained for compatibility with existing viewport call sites.
  showPoints?: boolean;
  interactivePoints?: boolean;
  showHandles?: boolean;
}) {
  const selected =
    selectedIds.length === 1 ? doc.segments[selectedIds[0]] : undefined;
  const selection = new Set(selectedIds);
  const visiblePointIds = Object.keys(doc.points);
  const selectedPointIds = selected ? [selected.from, selected.to] : [];
  const selectedPointSet = new Set(selectedPointIds);
  // Older viewport code passes showPoints only for Add point mode; new code
  // explicitly sets interactivePoints for Select and Curve.
  // Group selection moves by its edges; do not expose individual point hit targets.
  // The visual markers still render for every point in every tool.
  const pointHandlesEnabled =
    selectedIds.length <= 1 && (interactivePoints ?? !showPoints);
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
      {visiblePointIds.map((id) => {
        const p = doc.points[id];
        return (
          <g key={id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={3.5 / scale}
              className={
                selectedPointSet.has(id) ? "point point-active" : "point"
              }
              pointerEvents="none"
            />
            {pointHandlesEnabled && (
              <circle
                data-point={id}
                cx={p.x}
                cy={p.y}
                r={12 / scale}
                fill="transparent"
                className="point-hit"
              />
            )}
          </g>
        );
      })}
      {selected && (showHandles || selected.kind === "cubic") && (
        <CurveHandles doc={doc} pointIds={selectedPointIds} scale={scale} />
      )}
    </>
  );
}
